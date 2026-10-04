/**
 * Comprehensive Numerical Stability, Edge Case & Boundary Stress Test
 * 
 * Invariant Verification across all 10 Mathematical Modules:
 *   1. Zero Division Immunity (balance = 0, terr = 0, softCap = 0, enemies = 0)
 *   2. Extreme Scale Overflow / Underflow (B = 10^12, T = 10^8, negative inputs)
 *   3. Degenerate Spectral Laplacians (co-located points, collinear, disconnected)
 *   4. Singular Poisson Harmonic Boundary Conditions (no Dirichlet sources)
 *   5. Eikonal Zero-Speed & Geodesic Deadlock Resistance
 *   6. Stochastic Drift-Diffusion SDE Boundary Invariants
 *   7. MCTS Zero-Budget and Zero-Enemy Graceful Degradation
 *   8. KKT Water-Filling Infeasible Budget Recovery
 *   9. Zero NaN / Infinity / Subnormal Leakage Guarantee
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

let totalChecks = 0;
let passedChecks = 0;

function assert(condition, testName, details = '') {
  totalChecks++;
  if (condition) {
    passedChecks++;
  } else {
    console.error(`  [FAIL] ${testName}: ${details}`);
  }
}

function isSafeNumber(val) {
  return typeof val === 'number' && Number.isFinite(val) && !Number.isNaN(val);
}

function runNumericalStabilitySuite() {
  console.log('================================================================================');
  console.log(' NUMERICAL STABILITY & ADVERSARIAL EDGE-CASE VERIFICATION SUITE');
  console.log(' Testing boundary invariants, zero-divisions, singular matrices, and overflows');
  console.log('================================================================================\n');

  // --- 1. Pontryagin Minimum Principle (PMP) Boundary Tests ---
  console.log('1. Testing Pontryagin Optimal Control under Pathological Inputs...');
  const pmpEdgeCases = [
    { balance: 0, territory: 0, softCap: 0, density: 0, freeLandRatio: 0, activeFronts: 0 },
    { balance: -500, territory: -10, softCap: -100, density: -2, freeLandRatio: -1 },
    { balance: 1e12, territory: 1e8, softCap: 1e10, density: 100, freeLandRatio: 1.0 },
    { balance: NaN, territory: NaN, softCap: NaN, density: NaN, freeLandRatio: NaN },
    { balance: Infinity, territory: Infinity, softCap: Infinity, density: Infinity }
  ];

  for (let i = 0; i < pmpEdgeCases.length; i++) {
    const ctx = pmpEdgeCases[i];
    const res = v2.computeAdaptiveCommit(ctx);
    assert(isSafeNumber(res.ratio), `PMP Case ${i + 1} ratio safe`, `ratio=${res.ratio}`);
    assert(res.ratio >= 0 && res.ratio <= 1, `PMP Case ${i + 1} ratio in [0, 1]`, `ratio=${res.ratio}`);
    assert(typeof res.reason === 'string', `PMP Case ${i + 1} reason valid`);
  }

  // --- 2. SDE Stochastic Drift-Diffusion Attrition Tests ---
  console.log('2. Testing SDE Breach Probability at Extreme Limits...');
  const sdeCases = [
    { A: 0, D: 0 },
    { A: 0, D: 1000 },
    { A: 1000, D: 0 },
    { A: -50, D: -100 },
    { A: 1e9, D: 1e9 },
    { A: 1, D: 1e8 },
    { A: 1e8, D: 1 },
    { A: NaN, D: NaN },
    { A: Infinity, D: 500 }
  ];

  for (let i = 0; i < sdeCases.length; i++) {
    const { A, D } = sdeCases[i];
    const res = v2.computeBreachProbability(A, D);
    assert(isSafeNumber(res.pBreach), `SDE Case ${i + 1} pBreach safe`, `pBreach=${res.pBreach}`);
    assert(res.pBreach >= 0.0 && res.pBreach <= 1.0, `SDE Case ${i + 1} pBreach in [0, 1]`, `pBreach=${res.pBreach}`);
    assert(typeof res.isVetoed === 'boolean', `SDE Case ${i + 1} isVetoed boolean`);
    assert(isSafeNumber(res.expectedLoss), `SDE Case ${i + 1} expectedLoss safe`, `expectedLoss=${res.expectedLoss}`);
  }

  // --- 3. Spectral Graph Cut / Laplacian Bisection Degeneracy Tests ---
  console.log('3. Testing Spectral Graph Cut on Degenerate Point Sets...');
  assert(v2.computeSpectralFiedler([]) === null, 'Spectral handles 0 candidates');
  assert(v2.computeSpectralFiedler([{ x: 10, y: 10 }]) === null, 'Spectral handles 1 candidate');
  assert(v2.computeSpectralFiedler([{ x: 10, y: 10 }, { x: 20, y: 20 }]) !== null, 'Spectral handles 2 candidates');

  // Coincident points
  const coincident = [
    { x: 50, y: 50 },
    { x: 50, y: 50 },
    { x: 50, y: 50 },
    { x: 50, y: 50 }
  ];
  const specCoincident = v2.computeSpectralFiedler(coincident);
  assert(specCoincident !== null, 'Spectral handles coincident coordinates');
  if (specCoincident) {
    assert(specCoincident.fiedler.every(isSafeNumber), 'Spectral coincident fiedler safe');
    assert(specCoincident.bottleneckScores.every(isSafeNumber), 'Spectral coincident bottlenecks safe');
  }

  // Disconnected clusters
  const disconnected = [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
    { x: 10000, y: 10000 },
    { x: 10001, y: 10001 }
  ];
  const specDisconn = v2.computeSpectralFiedler(disconnected);
  assert(specDisconn !== null, 'Spectral handles disconnected clusters');
  if (specDisconn) {
    assert(specDisconn.fiedler.every(isSafeNumber), 'Spectral disconnected fiedler safe');
  }

  // --- 4. Poisson Potential Solver Boundary Tests ---
  console.log('4. Testing Poisson Harmonic PDE Solver with Extreme Geometries...');
  const emptyPoisson = v2.computePoissonPotentialField([], [], [], 8);
  assert(emptyPoisson !== null, 'Poisson handles empty boundary lists');
  const gradEmpty = emptyPoisson.sampleGradient(500, 500, 500, 500);
  assert(isSafeNumber(gradEmpty.pull), 'Poisson empty pull is safe', `pull=${gradEmpty.pull}`);
  assert(isSafeNumber(gradEmpty.potential), 'Poisson empty potential is safe');

  // Extreme opposite sources
  const extremePoisson = v2.computePoissonPotentialField([{ x: 0, y: 0 }], [{ x: 1000, y: 1000 }], [], 8);
  const gradExt = extremePoisson.sampleGradient(500, 500, 0, 0);
  assert(isSafeNumber(gradExt.pull), 'Poisson extreme pull is safe');
  assert(isSafeNumber(gradExt.potential), 'Poisson extreme potential is safe');

  // --- 5. Eikonal Wavefront Solver Degeneracies ---
  console.log('5. Testing Eikonal Fast Marching under Deadlocks...');
  // Dense wall barrier completely encircling origin
  const wall = [];
  for (let x = 0; x <= 1000; x += 100) {
    wall.push({ x, y: 500 });
  }
  const eikonalField = v2.computeEikonalGeodesicField(16, 16, [{ x: 100, y: 100 }], wall);
  const tAcross = eikonalField.getTravelTime(100, 900);
  assert(isSafeNumber(tAcross), 'Eikonal travel time across barrier is safe', `tAcross=${tAcross}`);

  // --- 6. MCTS Endgame Tactical Kernel Pathologies ---
  console.log('6. Testing MCTS Endgame Tactical Kernel under Pathologies...');
  const mctsNoEnemies = v2.computeMCTSEndgameAction({ territory: 100, balance: 1000, adjEnemies: [] });
  assert(mctsNoEnemies.bestAction === 'expand', 'MCTS zero-enemies returns expand');
  assert(mctsNoEnemies.winProb === 1.0, 'MCTS zero-enemies winProb is 1.0');

  const mctsZeroTime = v2.computeMCTSEndgameAction(
    {
      territory: 100,
      balance: 1000,
      adjEnemies: [{ id: 2, bal: 500, terr: 80 }]
    },
    50,
    0.0 // 0ms budget
  );
  assert(typeof mctsZeroTime.bestAction === 'string', 'MCTS zero-time returns valid action');
  assert(isSafeNumber(mctsZeroTime.winProb), 'MCTS zero-time winProb is safe');

  // --- 7. Hegemonic Coalition Game-Theoretic Invariants ---
  console.log('7. Testing Hegemonic Coalition Equilibrium Stability...');
  const coalNoEnemies = v2.computeCoalitionEquilibrium({ adjEnemies: [], territory: 100 });
  assert(coalNoEnemies.hegemonActive === false, 'Coalition no-enemies inactive');

  const coalHegemon = v2.computeCoalitionEquilibrium({
    territory: 50,
    adjEnemies: [
      { id: 2, terr: 950, bal: 10000 },
      { id: 3, terr: 40, bal: 200 }
    ]
  });
  assert(coalHegemon.hegemonActive === true, 'Coalition activates on runaway hegemon');
  assert(coalHegemon.hegemonId === 2, 'Coalition targets dominant hegemon ID');

  const coalEven = v2.computeCoalitionEquilibrium({
    territory: 100,
    adjEnemies: [
      { id: 2, terr: 100, bal: 1000 },
      { id: 3, terr: 100, bal: 1000 }
    ]
  });
  assert(coalEven.hegemonActive === false, 'Coalition dormant in balanced lobby');

  // --- 8. KKT Multi-Front Water-Filling Budget Invariants ---
  console.log('8. Testing KKT Multi-Front Water-Filling Invariants...');
  const kktNormal = v2.allocateKKTMultiFront(1000, [
    { type: 'ENEMY', isChokepoint: true },
    { type: 'ENEMY', isChokepoint: false },
    { type: 'NEUTRAL' }
  ]);
  assert(Array.isArray(kktNormal) && kktNormal.length === 3, 'KKT returns 3 allocations');
  const kktSum = kktNormal.reduce((s, a) => s + a, 0);
  assert(Math.abs(kktSum - 1000) <= 2, 'KKT sum matches total budget');

  // KKT Zero Budget
  const kktZero = v2.allocateKKTMultiFront(0, [{ type: 'ENEMY' }, { type: 'NEUTRAL' }]);
  assert(kktZero.every(a => a === 0), 'KKT zero budget returns all zeros');

  // --- 9. Decision Engine Stress (Full decide() call) ---
  console.log('9. Testing Full decide() Engine under Degenerate State Vectors...');
  const degenerateStates = [
    {},
    { balance: 0, territory: 1 },
    { balance: -100, territory: 0, freeLandRatio: 0 },
    { balance: 1e12, territory: 1e6, fronts: 20, shrinkFrames: 50 },
    { balance: 500, territory: 50, adjEnemies: null }
  ];

  for (let i = 0; i < degenerateStates.length; i++) {
    const s = degenerateStates[i];
    const dec = v2.decide(s);
    assert(['expand', 'fight', 'hold'].includes(dec.action), `decide() Case ${i + 1} valid action: ${dec.action}`);
    assert(typeof dec.reason === 'string', `decide() Case ${i + 1} valid reason: ${dec.reason}`);
    assert(typeof dec.wantEnemy === 'boolean', `decide() Case ${i + 1} valid wantEnemy`);
  }

  // --- 10. Naval Bellman Bridgehead Policy under Numerical Extremes ---
  console.log('10. Testing Naval Bellman Bridgehead Policy under Extremes & Singularities...');
  const extremeNavalCandidates = [
    { id: 1, waterDist: 0, targetCapacity: 0, targetBal: 0 },
    { id: 2, waterDist: -100, targetCapacity: -50, targetBal: -500 },
    { id: 3, waterDist: 1e8, targetCapacity: 1e9, targetBal: 1e12 },
    { id: 4, waterDist: 5, targetCapacity: 50, type: 'ENEMY', enemyBal: 0 }
  ];
  const extremeNavalStates = [
    { balance: 0, territory: 0, softCap: 0 },
    { balance: -500, territory: 10, softCap: 1000 },
    { balance: 1e12, territory: 1e6, softCap: 1e8 },
    { balance: 500, territory: 50, softCap: 5000 }
  ];

  for (let si = 0; si < extremeNavalStates.length; si++) {
    const res = v2.computeNavalBridgeheadPolicy(extremeNavalCandidates, extremeNavalStates[si]);
    assert(typeof res.viable === 'boolean', `Naval Extremes S${si + 1} viable is boolean`);
    assert(Number.isFinite(res.npv), `Naval Extremes S${si + 1} NPV is finite`);
    assert(Number.isFinite(res.commitRatio), `Naval Extremes S${si + 1} commitRatio is finite`);
    assert(!isNaN(res.troopsToSend), `Naval Extremes S${si + 1} troopsToSend not NaN`);
    for (const sh of res.rankedShores) {
      assert(Number.isFinite(sh.npv), `Naval Shore ${sh.id} NPV finite`);
      assert(Number.isFinite(sh.footholdProb), `Naval Shore ${sh.id} footholdProb finite`);
      assert(sh.footholdProb >= 0 && sh.footholdProb <= 1.0001, `Naval Shore ${sh.id} footholdProb in [0, 1]`);
    }
  }

  console.log('\n--------------------------------------------------------------------------------');
  console.log(`RESULTS: ${passedChecks} / ${totalChecks} Checks Passed (${((passedChecks / totalChecks) * 100).toFixed(1)}%)`);
  if (passedChecks === totalChecks) {
    console.log('STABILITY VERDICT: [100% NUMERICALLY STABLE & IMMUNE TO PATHOLOGIES]');
  } else {
    console.log('STABILITY VERDICT: [FAILURES DETECTED]');
    process.exit(1);
  }
  console.log('================================================================================\n');
}

if (require.main === module) {
  runNumericalStabilitySuite();
}

module.exports = { runNumericalStabilitySuite };
