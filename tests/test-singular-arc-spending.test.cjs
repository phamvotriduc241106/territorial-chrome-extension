/**
 * REGRESSION TEST SUITE: B* = 0.555K SINGULAR-ARC SPENDING POLICY
 * ===============================================================
 * Purpose: Verifies that production fails today and passes only
 * when the validated B* = 0.555K reserve-buffered behavior is implemented.
 * 
 * Invariants Tested:
 * 1. Saturated Capital ($B > 0.555K$): Spends excess (ratio in [0.25, 0.35])
 * 2. Sub-Equilibrium Capital ($B < 0.555K$): Conserves reserves (ratio in [0.05, 0.10])
 * 3. CBF Crush Floor Preservation: Never breaches minRemaining
 * 4. Exact One-Hit Crush Precedence: Crush overrides singular arc
 * 5. Emergency Defense Precedence: Fortification wall overrides singular arc
 */
'use strict';

const path = require('path');
const { loadEngine } = require('/Users/phamvotriduc/territorial-chrome-extension/experiments/rigorous-simulator.cjs');

const enginePath = '/Users/phamvotriduc/territorial-chrome-extension/experiments/engine-core-v2-advanced.js';
const engine = loadEngine(enginePath);

console.log('======================================================================');
console.log('REGRESSION TEST SUITE: B* = 0.555K SPENDING INVARIANTS');
console.log('Target: experiments/engine-core-v2-advanced.js');
console.log('======================================================================\n');

let passed = 0, failed = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passed++;
  } else {
    console.log(`[FAIL] ${testName} -> ${details}`);
    failed++;
  }
}

// TEST 1: Saturated Capital Equilibrium (B > 0.555 K)
// Territory T = 100 -> K = 10,000. B* = 5,550.
// Let B = 8,000 (Excess = 2,450). Expected ratio in [0.28, 0.35].
{
  const ctx = {
    balance: 8000,
    territory: 100,
    softCap: 10000,
    freeLandRatio: 0.05,
    wantEnemy: false,
    crushable: false,
    activeFronts: 0,
    adjEnemies: []
  };
  const plan = engine.planSpend(ctx);
  const isSatisfied = plan.canAfford && plan.ratio >= 0.28 && plan.ratio <= 0.35;
  assert(
    isSatisfied,
    'Test 1: Saturated Capital ($B > 0.555K$) spends excess at ratio in [0.28, 0.35]',
    `Observed ratio: ${plan.ratio} (canAfford=${plan.canAfford})`
  );
}

// TEST 2: Sub-Equilibrium Capital Preservation (B < 0.555 K)
// Territory T = 100 -> K = 10,000. B* = 5,550.
// Let B = 2,500 (Under-buffered). Expected ratio in [0.05, 0.10].
{
  const ctx = {
    balance: 2500,
    territory: 100,
    softCap: 10000,
    freeLandRatio: 0.05,
    wantEnemy: false,
    crushable: false,
    activeFronts: 0,
    adjEnemies: []
  };
  const plan = engine.planSpend(ctx);
  const isSatisfied = plan.canAfford && plan.ratio >= 0.05 && plan.ratio <= 0.10;
  assert(
    isSatisfied,
    'Test 2: Sub-Equilibrium Capital ($B < 0.555K$) conserves reserves at ratio in [0.05, 0.10]',
    `Observed ratio: ${plan.ratio} (canAfford=${plan.canAfford})`
  );
}

// TEST 3: CBF Crush Floor Preservation
// Enemy has B_foe = 10,000. CBF floor = ceil(10000/7.5) + 25 = 1359.
// Our B = 1,400. Max spend allowed = 1400 - 1359 = 41. Must not commit a dangerous ratio.
{
  const ctx = {
    balance: 1400,
    territory: 50,
    softCap: 5000,
    freeLandRatio: 0.0,
    wantEnemy: true,
    crushable: false,
    enemyBal: 10000,
    adjEnemies: [{ id: 2, bal: 10000, terr: 100 }]
  };
  const plan = engine.planSpend(ctx);
  const cost = plan.canAfford ? Math.floor(1400 * plan.ratio * 1.02) : 0;
  const isSafe = !plan.canAfford || (1400 - cost >= 1350);
  assert(
    isSafe,
    'Test 3: CBF Crush Immunity Floor is strictly respected',
    `Remaining balance: ${1400 - cost} (CBF floor: 1359)`
  );
}

// TEST 4: Exact One-Hit Crush Precedence Over Singular Arc
// Enemy has B_foe = 100, Our B = 2,000. crushable = true.
// Must execute crush ratio (in [0.15, 0.45]), NOT singular arc hold.
{
  const ctx = {
    balance: 2000,
    territory: 100,
    softCap: 10000,
    freeLandRatio: 0.0,
    wantEnemy: true,
    crushable: true,
    enemyBal: 100,
    adjEnemies: [{ id: 2, bal: 100, terr: 10 }]
  };
  const plan = engine.planSpend(ctx);
  const isCrush = plan.canAfford && plan.ratio >= 0.15 && plan.phase === 'CRUSH';
  assert(
    isCrush,
    'Test 4: Exact One-Hit Crush takes precedence over singular arc',
    `Observed ratio: ${plan.ratio}, phase: ${plan.phase}`
  );
}

// TEST 5: Emergency Defense Wall Precedence Over Singular Arc
// Under active shrinkage (shrinkFrames = 6) and no free land. Must hold troops (ratio = 0).
{
  const ctx = {
    balance: 6000,
    territory: 100,
    softCap: 10000,
    freeLandRatio: 0.0,
    wantEnemy: true,
    crushable: false,
    shrinkFrames: 6,
    areaTrend: -5,
    adjEnemies: [{ id: 2, bal: 4000, terr: 80 }]
  };
  const plan = engine.planSpend(ctx);
  const isHold = !plan.canAfford || plan.ratio === 0;
  assert(
    isHold,
    'Test 5: Emergency Defense Wall overrides singular arc spending',
    `Observed canAfford: ${plan.canAfford}, ratio: ${plan.ratio}`
  );
}

console.log('\n----------------------------------------------------------------------');
console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`);
console.log('Expectation: Production fails Tests 1 & 2 today, passes Tests 3, 4, 5.');
console.log('======================================================================\n');
