/**
 * Hard Mode Invariant & Crush Immunity Verification Suite
 * Tests:
 *   1. CBF Crush Barrier Floor: mathematical safety boundary B >= ceil(B_threat / 7.6) + sigma
 *   2. Timed opening FSM: Cycle 0 (36%) -> short recovery -> Cycle 2 (20%) -> normal policy
 *   3. Defensive Fortification Wall: 0% spend when shrinking to exploit 1.25x defender multiplier
 *   4. Fortification Counter-Crush: Instant 220% strike when attacking enemy burns below 8x threshold
 *   5. Lanchester FFA Non-Aggression: 0% spend against uncrushable enemies when under 85% soft cap
 *   6. Zero-Spend Invariant: planSpend never inflates 0% hold into an attack
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

const engine = loadEngine(process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, 'engine-core-v2-advanced.js'));
let assertions = 0;

function assert(condition, message) {
  assertions++;
  if (!condition) {
    throw new Error(`FAIL: ${message}`);
  }
}

console.log('Running Hard Mode Crush Immunity & FSM Test Suite...\n');

// -------------------------------------------------------------
// Test 1: CBF Crush Barrier Floor Calculations
// -------------------------------------------------------------
console.log('1. Testing CBF Crush Barrier Floor...');
{
  const enemies = [
    { id: 1, bal: 4000 },
    { id: 2, bal: 8000 }, // Max threat = 8000
    { id: 3, bal: 1500 }
  ];

  // Threat = 8000 -> floor = ceil(8000 / 7.6) + max(60, floor(0.05 * B))
  // For B = 1000: floor = ceil(1052.63) + 60 = 1053 + 60 = 1113.
  const cbf1 = engine.computeCrushBarrierFloor(1000, enemies);
  assert(cbf1.maxThreat === 8000, 'Max threat extracted correctly');
  assert(cbf1.floor === 1113, `Floor calculated correctly (got ${cbf1.floor})`);
  assert(cbf1.isBreached === true, 'B = 1000 is correctly marked breached under 8000 threat');
  assert(cbf1.maxSafeRatio === 0, 'No safe spend allowed when breached');

  // For B = 3000: floor = 1053 + max(60, 150) = 1053 + 150 = 1203.
  const cbf2 = engine.computeCrushBarrierFloor(3000, enemies);
  assert(cbf2.floor === 1203, `Floor for B=3000 correct (got ${cbf2.floor})`);
  assert(cbf2.isBreached === false, 'B = 3000 is safe from crush');
  assert(cbf2.isThreatened === false, 'B = 3000 is not threatened');
  assert(cbf2.maxSafeSpend > 0, 'Safe spend available when well above floor');
  assert(cbf2.maxSafeRatio > 0.40, `Safe ratio allowed (got ${cbf2.maxSafeRatio})`);

  // Empty enemies: zero threat
  const cbfEmpty = engine.computeCrushBarrierFloor(2000, []);
  assert(cbfEmpty.maxThreat === 0, 'Zero threat for empty enemies');
  assert(cbfEmpty.floor === 0, 'Zero floor for empty enemies');
  assert(cbfEmpty.isBreached === false, 'Not breached with zero enemies');

  // Edge cases: NaN and negative
  const cbfEdge = engine.computeCrushBarrierFloor(NaN, [{ bal: NaN }]);
  assert(cbfEdge.floor === 0 && !cbfEdge.isBreached, 'Handles NaN safely');

  const cbfIncoming = engine.computeCrushBarrierFloor(1000, [
    { bal: 100, incoming: 7900, effectiveBal: 8000 }
  ]);
  assert(cbfIncoming.maxThreat === 8000 && cbfIncoming.isBreached,
    'Incoming attack troops remain inside the crush-safety barrier');
}

// -------------------------------------------------------------
// Test 2: Golden Opening Deterministic FSM
// -------------------------------------------------------------
console.log('2. Testing Golden Opening Deterministic FSM...');
{
  // Cycle 0: Opener strike
  const c0 = engine.computeAdaptiveCommit({
    balance: 500, territory: 1, softCap: 1000, freeLandRatio: 0.15,
    wantEnemy: false, attackSequence: 0, gameTimeSec: 0.5
  });
  assert(c0.ratio >= 0.35 && c0.ratio <= 0.38, `Cycle 0 punches ~36% (got ${c0.ratio})`);
  assert(c0.reason === 'pmp-golden-open-c0', `Cycle 0 reason correct: ${c0.reason}`);

  // Cycle 1: STRICT ZERO-SPEND HOLD
  const c1 = engine.computeAdaptiveCommit({
    balance: 380, territory: 12, softCap: 1200, freeLandRatio: 0.14,
    wantEnemy: false, attackSequence: 1, gameTimeSec: 1.8
  });
  assert(c1.ratio === 0, `Cycle 1 strictly holds 0% (got ${c1.ratio})`);
  assert(c1.reason === 'pmp-golden-hold-c1', `Cycle 1 reason correct: ${c1.reason}`);

  // Cycle 2: Secondary expansion after bank compounded
  const c2 = engine.computeAdaptiveCommit({
    balance: 440, territory: 12, softCap: 1200, freeLandRatio: 0.12,
    wantEnemy: false, attackSequence: 2, gameTimeSec: 3.4
  });
  assert(c2.ratio >= 0.18 && c2.ratio <= 0.22, `Cycle 2 expands ~20% (got ${c2.ratio})`);
  assert(c2.reason === 'pmp-golden-open-c2', `Cycle 2 reason correct: ${c2.reason}`);

  // Cycle 3: the timed recovery has expired; do not deadlock if the command
  // counter stopped advancing after a rejected or unconfirmed action.
  const c3 = engine.computeAdaptiveCommit({
    balance: 410, territory: 22, softCap: 2200, freeLandRatio: 0.10,
    wantEnemy: false, attackSequence: 3, gameTimeSec: 5.1
  });
  assert(c3.ratio > 0, `Cycle 3 resumes normal policy (got ${c3.ratio})`);
  assert(c3.reason !== 'pmp-golden-hold-c3', `Cycle 3 no longer deadlocks: ${c3.reason}`);
}

// -------------------------------------------------------------
// Test 3: Defensive Fortification Wall & Counter-Crush
// -------------------------------------------------------------
console.log('3. Testing Defensive Fortification Wall & Counter-Crush...');
{
  // Shrinking under attack: not crushable -> 0% HOLD to exploit 1.25x defense
  const fortWall = engine.computeAdaptiveCommit({
    balance: 2000, territory: 50, softCap: 5000, freeLandRatio: 0.01,
    wantEnemy: true, enemyBal: 3000, shrinkFrames: 2, areaTrend: -5,
    attackSequence: 6, gameTimeSec: 25
  });
  assert(fortWall.ratio === 0, `Fortification wall holds 0% (got ${fortWall.ratio})`);
  assert(fortWall.reason === 'pmp-fortification-defense-wall', `Fortification wall reason: ${fortWall.reason}`);

  // Shrinking under attack: enemy depleted into crush range (B > 8 * enemyBal)
  // enemyBal = 200, B = 2000 -> 2000 > 8 * 200 -> Crushable!
  const counterCrush = engine.computeAdaptiveCommit({
    balance: 2000, territory: 50, softCap: 5000, freeLandRatio: 0.01,
    wantEnemy: true, crushable: true, enemyBal: 200, shrinkFrames: 2, areaTrend: -5,
    attackSequence: 7, gameTimeSec: 27
  });
  assert(counterCrush.ratio > 0.20 && counterCrush.ratio <= 0.65, `Counter-crush strikes (got ${counterCrush.ratio})`);
  assert(counterCrush.reason === 'pmp-fortification-counter-crush', `Counter-crush reason: ${counterCrush.reason}`);
}

// -------------------------------------------------------------
// Test 4: Lanchester FFA Non-Aggression Invariant
// -------------------------------------------------------------
console.log('4. Testing Lanchester FFA Non-Aggression Invariant...');
{
  // Borders sealed (free <= 0.02), under 85% density, not crushable:
  // Initiating war is strictly dominated by holding in FFA!
  const ffaHold = engine.computeAdaptiveCommit({
    balance: 3000, territory: 100, softCap: 10000, freeLandRatio: 0.01,
    wantEnemy: true, crushable: false, density: 0.30, attackSequence: 8, gameTimeSec: 35
  });
  assert(ffaHold.ratio === 0, `FFA non-aggression holds 0% (got ${ffaHold.ratio})`);
  assert(ffaHold.reason === 'pmp-ffa-nash-hold', `FFA hold reason: ${ffaHold.reason}`);

  // Borders sealed, overcap density (density >= 0.85):
  // Excess liquid balance must be vented to expand capacity!
  const ffaVent = engine.computeAdaptiveCommit({
    balance: 9000, territory: 100, softCap: 10000, freeLandRatio: 0.01,
    wantEnemy: true, crushable: false, density: 0.90, attackSequence: 12, gameTimeSec: 50
  });
  assert(ffaVent.ratio > 0.08 && ffaVent.ratio <= 0.72, `Overcap vents excess (got ${ffaVent.ratio})`);
  assert(ffaVent.reason === 'pmp-overcap-drain', `Overcap drain reason: ${ffaVent.reason}`);
}

// -------------------------------------------------------------
// Test 5: Zero-Spend Invariant & planSpend Guarantee
// -------------------------------------------------------------
console.log('5. Testing Zero-Spend Invariant in planSpend...');
{
  // When adaptive ratio is 0 (due to CBF lock, Golden hold, or Fortification wall):
  // planSpend must strictly return canAfford = false and fronts = 0!
  const planHold = engine.planSpend({
    balance: 380, balanceKnown: true, territory: 12, softCap: 1200,
    freeLandRatio: 0.14, wantEnemy: false, attackSequence: 1, gameTimeSec: 1.8
  });
  assert(planHold.canAfford === false, `planHold canAfford must be false (got ${planHold.canAfford})`);
  assert(planHold.fronts === 0, `planHold fronts must be 0 (got ${planHold.fronts})`);
  assert(planHold.spendPerFront === 0, `planHold spendPerFront must be 0`);
  assert(planHold.reason === 'pmp-golden-hold-c1', `planHold preserves hold reason: ${planHold.reason}`);

  const resumedOpening = engine.planSpend({
    balance: 380, balanceKnown: true, territory: 12, softCap: 1200,
    freeLandRatio: 0.14, wantEnemy: false, attackSequence: 1, gameTimeSec: 3.0
  });
  assert(resumedOpening.canAfford === true && resumedOpening.ratio > 0,
    'opening hold expires by time even when successful-command count stays at one');

  const incomingWall = engine.planSpend({
    balance: 2000, balanceKnown: true, territory: 50, softCap: 5000,
    freeLandRatio: 0.01, wantEnemy: true, enemyBal: 3000,
    incoming: 900, attackSequence: 6, gameTimeSec: 25,
    adjEnemies: [{ id: 2, bal: 3000, incoming: 900, effectiveBal: 3900 }]
  });
  assert(incomingWall.canAfford === false && incomingWall.reason === 'pmp-fortification-defense-wall',
    'incoming attack telemetry reaches planSpend and activates the defensive wall');

  // When CBF floor is breached by a massive enemy neighbor:
  const planCbfLock = engine.planSpend({
    balance: 1000, balanceKnown: true, territory: 50, softCap: 5000,
    freeLandRatio: 0.05, wantEnemy: false, attackSequence: 5, gameTimeSec: 15,
    adjEnemies: [{ id: 99, bal: 9000 }] // Threat 9000 -> Floor ~1250 > 1000 -> Breached!
  });
  assert(planCbfLock.canAfford === false, `CBF breach forces canAfford = false`);
  assert(planCbfLock.fronts === 0, `CBF breach forces fronts = 0`);
  assert(planCbfLock.reason.includes('cbf') || planCbfLock.reason.includes('lock') || planCbfLock.reason.includes('floor'),
    `Reason reflects CBF lock (got ${planCbfLock.reason})`);
}

console.log(`\nALL HARD MODE INVARIANTS PASSED! (${assertions} assertions checked)`);
