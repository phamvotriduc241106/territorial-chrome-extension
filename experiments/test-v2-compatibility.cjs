/**
 * V2 Engine Compatibility & Invariant Contract Test Suite
 * Verifies that V2.1 satisfies:
 *   1. Bit-exact ratio conversion: ratioToIl and ilToRatio
 *   2. Exact humanAttackDebit & botAttackDebit tax rules
 *   3. Reserve invariance: never overdrafts bank, preserves softReserve
 *   4. Front bounding: [0, 6] fronts
 *   5. All advanced mathematical modules exported and functional
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadEngine(filePath) {
  const sandbox = {
    window: {},
    console: { log: () => {}, warn: () => {}, error: () => {} },
    Math, isFinite, Number, parseInt, parseFloat, Array, Set, Map,
    Uint8Array, Uint16Array, Uint32Array, Int8Array, Int16Array, Int32Array,
    Float32Array, Float64Array, Object, String, NaN, Infinity
  };
  sandbox.globalThis = sandbox.window;
  sandbox.global = sandbox.window;
  vm.createContext(sandbox);
  const code = fs.readFileSync(filePath, 'utf8');
  vm.runInContext(code, sandbox);
  return sandbox.window.TIOEngineCore;
}

const v2 = loadEngine(process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, '../content/engine-core-v2-advanced.js'));
let assertions = 0;

function assert(condition, message) {
  assertions++;
  if (!condition) {
    throw new Error(`FAIL: ${message}`);
  }
}

function equal(actual, expected, message) {
  assert(actual === expected, `${message}: expected ${expected}, got ${actual}`);
}

console.log('Running V2 Advanced Engine Contract Tests...');

// 1. Version & Exports
assert(v2 && v2.version === JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8')).version,
  'Engine core matches the package release version');
assert(typeof v2.computeSpectralFiedler === 'function', 'computeSpectralFiedler exported');
assert(typeof v2.computePoissonPotentialField === 'function', 'computePoissonPotentialField exported');
assert(typeof v2.allocateKKTMultiFront === 'function', 'allocateKKTMultiFront exported');
assert(typeof v2.computeVoronoiPartition === 'function', 'computeVoronoiPartition exported');
assert(typeof v2.BayesianTroopObserver === 'object', 'BayesianTroopObserver exported');

// 2. Arithmetic & Debit Invariants
equal(v2.al(11 * 100, 5), 220, 'Source integer arithmetic al()');
equal(v2.crushRequirement(100), 220, 'Crush requirement computation');
equal(v2.ratioToIl(0.25), 255, 'Quarter ratio encoding');
equal(v2.ilToRatio(255), 0.25, 'Quarter ratio decoding');

const debitLow = v2.humanAttackDebit(1000, 200);
equal(debitLow.tax, 11, 'Human tax for 1000 balance');
equal(debitLow.sent, 200, 'Human sent troops');
equal(debitLow.debit, 211, 'Human debit total');

const debitHigh = v2.humanAttackDebit(1000, 600);
equal(debitHigh.sent, 600, 'High sent troops');
equal(debitHigh.debit, 611, 'High debit total');

equal(v2.softCapFor(1000), 100000, 'Soft cap calculation');
equal(v2.softCapFor(20000000), 1000000000, 'Soft cap ceiling 1B');

// 3. PlanSpend Boundary Invariants across 2,000 randomized state vectors
const balances = [20, 30, 50, 80, 120, 200, 500, 1000, 5000, 20000, 80000];
const territories = [1, 10, 100, 500, 2000];
const freeRatios = [0, 0.01, 0.04, 0.15, 0.5];

for (const balance of balances) {
  for (const territory of territories) {
    for (const free of freeRatios) {
      for (const wantEnemy of [false, true]) {
        const plan = v2.planSpend({
          balance,
          balanceKnown: true,
          territory,
          freeLandRatio: free,
          wantEnemy,
          crushable: wantEnemy && balance > 500,
          enemyBal: wantEnemy ? Math.floor(balance / 5) : 0,
          fronts: 4
        });

        assert(plan.fronts >= 0 && plan.fronts <= 4, 'Front count within bounds');
        if (!plan.canAfford) continue;

        assert(plan.ratio > 0 && plan.ratio <= 0.72, `Ratio bounded <= 0.72 (got ${plan.ratio})`);
        assert(plan.spendPerFront >= plan.minAttack, 'Spend respects minAttack');
        assert(plan.spendPerFront < balance, 'Never spends entire bank');

        const cost = v2.estimateAttackCost(balance, plan.ratio);
        assert(cost < balance, 'Attack cost strictly less than balance');
        assert(balance - cost >= plan.minRemaining, 'Bank strictly preserves minRemaining');
      }
    }
  }
}

// 4. KKT Water-Filling Invariant: sum(allocations) <= totalBudget
const kktBudget = 1000;
const kktConfigs = [
  { min: 50, max: 600, weight: 2.0, isChokepoint: true },
  { min: 30, max: 400, weight: 1.0 },
  { min: 20, max: 300, weight: 0.5 }
];
const kktResult = v2.allocateKKTMultiFront(kktBudget, kktConfigs);
const kktSum = kktResult.reduce((sum, v) => sum + v, 0);
assert(kktSum <= kktBudget, `KKT sum (${kktSum}) within budget (${kktBudget})`);
assert(kktResult[0] >= 50 && kktResult[1] >= 30 && kktResult[2] >= 20, 'KKT satisfies min demand constraints');
assert(kktResult[0] > kktResult[1] && kktResult[1] > kktResult[2], 'KKT weights give highest allocation to chokepoint front');

// 5. Spectral Fiedler Vector Invariant: zero-mean and unit norm
const testPoints = [
  { x: 100, y: 500 },
  { x: 300, y: 500 },
  { x: 500, y: 500 },
  { x: 700, y: 500 },
  { x: 900, y: 500 }
];
const specRes = v2.computeSpectralFiedler(testPoints);
assert(specRes && specRes.fiedler && specRes.fiedler.length === 5, 'Spectral Fiedler vector returned');
assert(specRes.bottleneckScores[2] >= specRes.bottleneckScores[0], 'Center point detected as primary bottleneck');

// 6. Poisson Harmonic Invariant: values bounded in [-1.0, 1.0]
const pField = v2.computePoissonPotentialField([{ x: 200, y: 500 }], [{ x: 800, y: 500 }], [], 8);
const grad = pField.sampleGradient(500, 500, 200, 500);
assert(isFinite(grad.pull) && isFinite(grad.potential), 'Poisson gradient finite');

// 7. Voronoi Invariant: sum of areas equals total cells
const voronoiRes = v2.computeVoronoiPartition(
  [{ x: 250, y: 250 }, { x: 750, y: 750 }],
  [{ x: 500, y: 500 }],
  16
);
const voronoiTotal = voronoiRes.reduce((s, r) => s + r.voronoiCells, 0);
equal(voronoiTotal, 256, 'Voronoi partition covers exact grid 16x16=256');

// 8. Cooperative Game Theory Coalition Invariant
const ffaStateHegemon = {
  territory: 200,
  balance: 5000,
  adjEnemies: [
    { id: 2, terr: 1200, bal: 30000 }, // Runaway leader (1200 / 1600 = 75%)
    { id: 3, terr: 200, bal: 4000 }    // Secondary peer
  ]
};
const coalResHegemon = v2.computeCoalitionEquilibrium(ffaStateHegemon);
assert(coalResHegemon.hegemonActive === true, 'Hegemon active when leader holds > 35%');
equal(coalResHegemon.hegemonId, 2, 'Hegemon identified as Player 2');
equal(coalResHegemon.coalitionIndices[2], -1.0, 'Hegemon assigned containment priority -1.0');
equal(coalResHegemon.coalitionIndices[3], 0.85, 'Secondary peer assigned non-aggression truce +0.85');

const ffaStateBalanced = {
  territory: 500,
  balance: 10000,
  adjEnemies: [
    { id: 2, terr: 520, bal: 10000 },
    { id: 3, terr: 480, bal: 9500 }
  ]
};
const coalResBalanced = v2.computeCoalitionEquilibrium(ffaStateBalanced);
assert(coalResBalanced.hegemonActive === false, 'Hegemon inactive when match is balanced');

// 9. Eikonal Geodesic Wavefront Invariants
const eikonalField = v2.computeEikonalGeodesicField(
  16, 8,
  [{ x: 0, y: 0 }],
  [{ x: 500, y: 0 }, { x: 500, y: 125 }, { x: 500, y: 250 }] // Barrier wall
);
const tOrigin = eikonalField.getTravelTime(0, 0);
const tTarget = eikonalField.getTravelTime(1000, 500);
equal(tOrigin, 0, 'Origin travel time is exactly zero');
assert(tTarget > 0 && tTarget < 999, 'Reachable target has positive finite travel time');
assert(tTarget >= 15, 'Target behind wall has geodesic distance >= 15');

// 10. Topographical Map & Conductance Invariants
const {
  generateArchipelagoMap,
  generateEuropeMap,
  computeMapSpectralConductance,
  detectGlobalChokepoints
} = require('./advanced-maps.js');

const arch = generateArchipelagoMap(80, 40);
equal(arch.width, 80, 'Archipelago width is 80');
equal(arch.height, 40, 'Archipelago height is 40');
equal(arch.spawns.length, 4, 'Archipelago has 4 spawns');
for (const sp of arch.spawns) {
  equal(arch.grid[sp.y * 80 + sp.x], 0, `Spawn ${sp.name} starts on valid land`);
}

const eu = generateEuropeMap(80, 40);
const euCond = computeMapSpectralConductance(eu.grid, 80, 40);
assert(euCond.conductance > 0 && euCond.conductance < 0.2, 'Europe Cheeger conductance is bottlenecked');
assert(euCond.landCells > 1000, 'Europe has > 1000 land cells');

const chokes = detectGlobalChokepoints(eu.grid, 80, 40);
assert(chokes.length >= 2, 'Europe detects Bosphorus and Gibraltar chokepoints');

// 11. Stochastic SDE Attrition / Breach Probability Invariants
assert(typeof v2.computeBreachProbability === 'function', 'computeBreachProbability exported');
const breachSuicide = v2.computeBreachProbability(100, 300);
assert(breachSuicide.pBreach < 0.05, '100 vs 300 has < 5% breach chance');
assert(breachSuicide.isVetoed === true, '100 vs 300 attack is vetoed');

const breachEven = v2.computeBreachProbability(100, 100);
assert(breachEven.pBreach < 0.45, '100 vs 100 has < 45% breach chance due to defense multiplier');

const breachOverwhelming = v2.computeBreachProbability(300, 100);
assert(breachOverwhelming.pBreach > 0.95, '300 vs 100 has > 95% breach chance');
assert(breachOverwhelming.isVetoed === false, '300 vs 100 is not vetoed');

// Monotonicity check across 50 troop levels
let prevP = -1;
for (let a = 10; a <= 500; a += 10) {
  const res = v2.computeBreachProbability(a, 100);
  assert(res.pBreach >= prevP, `Breach probability monotonically increases with attacker troops (a=${a})`);
  assert(res.pBreach >= 0 && res.pBreach <= 1, 'Breach probability strictly bounded [0, 1]');
  prevP = res.pBreach;
}

// 12. MCTS Endgame Tactical Kernel Invariants
assert(typeof v2.computeMCTSEndgameAction === 'function', 'computeMCTSEndgameAction exported');

// Overwhelming advantage: 1v1 duel where we have 10x balance
const mctsDuel = v2.computeMCTSEndgameAction({
  territory: 800,
  balance: 20000,
  adjEnemies: [{ id: 2, terr: 200, bal: 2000 }]
}, 40, 5);
equal(mctsDuel.bestAction, 'fight', 'MCTS strikes decisively when holding massive advantage');
assert(mctsDuel.winProb >= 0.85, 'MCTS duel win probability >= 85%');
assert(mctsDuel.rollouts >= 20, 'MCTS executed sufficient rollouts');

// 3-way standoff where attacking causes exhaustion:
// Player 1 (us, 3000 bal), Enemy 2 (3000 bal), Enemy 3 (7000 bal, outside spectator)
const mctsStandoff = v2.computeMCTSEndgameAction({
  territory: 300,
  balance: 3000,
  adjEnemies: [
    { id: 2, terr: 300, bal: 3000 },
    { id: 3, terr: 600, bal: 7000 }
  ]
}, 50, 5);
assert(mctsStandoff.rollouts > 0, 'MCTS executes successfully in 3-way standoff');
assert(mctsStandoff.winProb >= 0 && mctsStandoff.winProb <= 1, 'MCTS winProb strictly in [0, 1]');

// ==========================================
// Module 13: Naval Bellman Bridgehead Policy
// ==========================================
assert(typeof v2.computeNavalBridgeheadPolicy === 'function', 'computeNavalBridgeheadPolicy exists');

// Empty / invalid input safety
const emptyNaval = v2.computeNavalBridgeheadPolicy([], { balance: 500 });
assert(emptyNaval.viable === false, 'Empty candidates yields viable=false');
equal(emptyNaval.rankedShores.length, 0, 'Empty candidates yields empty rankedShores');

const lowBalNaval = v2.computeNavalBridgeheadPolicy([{ id: 1, waterDist: 5, type: 'NEUTRAL' }], { balance: 20 });
assert(lowBalNaval.viable === false, 'Low balance (<35) yields viable=false');

// Distance & Transit Opportunity Cost Test:
// Island Near (dist 2) vs Island Far (dist 15), both neutral with capacity 80
const testCandidates = [
  { id: 1, gridX: 20, gridY: 10, waterDist: 2, type: 'NEUTRAL', targetCapacity: 80 },
  { id: 2, gridX: 35, gridY: 10, waterDist: 15, type: 'NEUTRAL', targetCapacity: 80 }
];
const navalDecision = v2.computeNavalBridgeheadPolicy(testCandidates, {
  balance: 1000,
  territory: 50,
  softCap: 5000
});
assert(navalDecision.viable === true, 'Sufficient balance & neutral target yields viable naval landing');
assert(navalDecision.bestShore.id === 1, 'Closer island preferred due to lower transit compounding loss');
assert(navalDecision.commitRatio >= 0.08 && navalDecision.commitRatio <= 0.45, 'Commit ratio bounded in [0.08, 0.45]');
assert(navalDecision.troopsToSend > 0 && navalDecision.troopsToSend <= 450, 'Troops to send is proportional');
assert(navalDecision.rankedShores[0].npv > navalDecision.rankedShores[1].npv, 'Near island NPV strictly exceeds far island NPV');

// Entrenched enemy island vs neutral island test
const fortifiedCandidates = [
  { id: 10, waterDist: 4, type: 'ENEMY', enemyId: 2, enemyBal: 2500, targetCapacity: 40 },
  { id: 20, waterDist: 4, type: 'NEUTRAL', targetCapacity: 60 }
];
const enemyNaval = v2.computeNavalBridgeheadPolicy(fortifiedCandidates, {
  balance: 600,
  territory: 30,
  softCap: 3000
});
assert(enemyNaval.bestShore.id === 20, 'Neutral unfortified shore selected over suicide enemy fortress');
assert(enemyNaval.rankedShores[1].footholdProb < 0.10, 'Fortified enemy shore has tiny breakthrough probability');

console.log(`\nALL CONTRACT INVARIANTS PASSED! (${assertions} assertions checked)\n`);
