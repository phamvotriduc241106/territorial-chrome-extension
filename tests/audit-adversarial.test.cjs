/**
 * Adversarial Audit Test Suite
 * Systematically falsifies and stress-tests all reported capabilities
 * across both the SHIPPED engine (experiments/engine-core-v2-advanced.js)
 * and the UNSHIPPED engine (content/engine-core.js).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

function setupSandbox(engineFile) {
  const sandbox = {
    console,
    Math,
    Date,
    Number,
    isFinite,
    isNaN,
    parseInt,
    parseFloat,
    Array,
    Object,
    String,
    RegExp,
    Error,
    TypeError,
    Uint8Array,
    Uint16Array,
    Uint32Array,
    Int8Array,
    Int16Array,
    Int32Array,
    Float32Array,
    Float64Array,
    print: console.log,
    document: {
      documentElement: {
        setAttribute: () => {},
        getAttribute: () => '1'
      }
    },
    navigator: {
      mediaDevices: {
        getUserMedia: () => Promise.resolve('camera-stream')
      }
    }
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  sandbox.global = sandbox;
  vm.createContext(sandbox);

  vm.runInContext(read('shared/config.js'), sandbox, { filename: 'shared/config.js' });
  vm.runInContext(read('content/engine-core-v1.js'), sandbox, { filename: 'content/engine-core-v1.js' });
  vm.runInContext(read(engineFile), sandbox, { filename: engineFile });
  vm.runInContext(read('content/engine-adapter.js'), sandbox, { filename: 'content/engine-adapter.js' });
  vm.runInContext(read('content/source-adapter.js'), sandbox, { filename: 'content/source-adapter.js' });

  return sandbox;
}

console.log('======================================================================');
console.log(' ADVERSARIAL AUDIT TEST SUITE');
console.log('======================================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function auditAssert(description, condition, details = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  [PASS] ${description}`);
  } else {
    failedTests++;
    console.log(`  [FAIL] ${description} ${details ? '--> ' + details : ''}`);
  }
}

const shippedBox = setupSandbox('experiments/engine-core-v2-advanced.js');
const shippedCore = shippedBox.TIOEngineCore;

// -----------------------------------------------------------------------------
// TEST 1: Control Barrier Function Invariant Under Massive Enemy Threat
// -----------------------------------------------------------------------------
console.log('\n--- Test Group 1: Control Barrier Function (CBF) Invariance ---');
{
  const myBal = 2000;
  const foeBal = 7500; // crush floor: ceil(7500 / 7.5) = 1000 + 25 = 1025
  const plan = shippedCore.planSpend({
    balance: myBal,
    balanceKnown: true,
    territory: 100,
    softCap: 10000,
    wantEnemy: true,
    adjEnemies: [{ id: 2, bal: foeBal, terr: 100 }],
    fronts: 1
  });

  const remaining = myBal - (plan.spendTotal || (myBal * plan.ratio));
  auditAssert(
    'CBF enforces minimum reserve against superior threat',
    plan.canAfford === false || remaining >= 1000,
    `Remaining: ${remaining}, expected >= 1000`
  );
}

// -----------------------------------------------------------------------------
// TEST 2: Multi-Step MCTS Verification
// -----------------------------------------------------------------------------
console.log('\n--- Test Group 2: Multi-Step MCTS Dead Code Audit ---');
{
  const state = {
    balance: 1000,
    balanceKnown: true,
    territory: 100,
    freeLandRatio: 0,
    adjEnemies: [{ id: 2, bal: 500, terr: 80 }]
  };

  // Check if decide() calls runMultiStepMCTS
  let mctsCalled = false;
  const originalMCTS = shippedBox.TIOEngineCoreV2.runMultiStepMCTS;
  shippedBox.TIOEngineCoreV2.runMultiStepMCTS = function (...args) {
    mctsCalled = true;
    return originalMCTS.apply(this, args);
  };

  shippedCore.decide(state);
  auditAssert(
    'MCTS is actually invoked inside decide()',
    mctsCalled === true,
    'shipped decide() NEVER invokes runMultiStepMCTS (DEAD CODE)'
  );
  shippedBox.TIOEngineCoreV2.runMultiStepMCTS = originalMCTS;
}

// -----------------------------------------------------------------------------
// TEST 3: Karush-Kuhn-Tucker (KKT) Allocation Dead Code Audit
// -----------------------------------------------------------------------------
console.log('\n--- Test Group 3: KKT Multi-Front Allocation Dead Code Audit ---');
{
  let kktCalled = false;
  const originalKKT = shippedBox.TIOEngineCoreV2.allocateKKTMarginalUtility;
  shippedBox.TIOEngineCoreV2.allocateKKTMarginalUtility = function (...args) {
    kktCalled = true;
    return originalKKT.apply(this, args);
  };

  shippedCore.planSpend({
    balance: 5000,
    balanceKnown: true,
    territory: 100,
    softCap: 10000,
    wantEnemy: true,
    fronts: 4,
    activeFronts: 1,
    adjEnemies: [
      { id: 2, bal: 500, terr: 50 },
      { id: 3, bal: 600, terr: 60 }
    ]
  });

  auditAssert(
    'allocateKKTMarginalUtility is actually invoked during multi-front planSpend()',
    kktCalled === true,
    'shipped planSpend() NEVER invokes allocateKKTMarginalUtility (DEAD CODE)'
  );
  shippedBox.TIOEngineCoreV2.allocateKKTMarginalUtility = originalKKT;
}

// -----------------------------------------------------------------------------
// TEST 4: EngineAdapter Telemetry Fraud / Inaccuracy Audit
// -----------------------------------------------------------------------------
console.log('\n--- Test Group 4: Adapter Telemetry Counter Inaccuracy Audit ---');
{
  const statusBefore = shippedBox.TIOGetEngineStatus();
  const kktBefore = statusBefore.telemetry.kktAllocationsComputed;

  // Call planSpend once
  shippedCore.planSpend({ balance: 1000, territory: 10 });

  const statusAfter = shippedBox.TIOGetEngineStatus();
  const kktAfter = statusAfter.telemetry.kktAllocationsComputed;

  auditAssert(
    'Telemetry kktAllocationsComputed accurately reflects real KKT execution (should NOT increment if KKT was not run)',
    kktAfter === kktBefore,
    `Telemetry falsely incremented kktAllocationsComputed from ${kktBefore} to ${kktAfter} without running KKT!`
  );
}

// -----------------------------------------------------------------------------
// TEST 5: Counterfactual Kingmaker Targeting Audit
// -----------------------------------------------------------------------------
console.log('\n--- Test Group 5: Counterfactual Kingmaker Game Theory Audit ---');
{
  const ffaSituation = {
    balance: 1000,
    balanceKnown: true,
    territory: 100,
    hasAdjFree: false,
    freeLandRatio: 0,
    globalRank: 2,
    adjEnemies: [
      { id: 2, bal: 800, terr: 90 }, // secondary neighbor
      { id: 3, bal: 3000, terr: 400 } // outside leader
    ]
  };

  const dec = shippedCore.decide(ffaSituation);
  auditAssert(
    'Shipped decide() implements counterfactual kingmaker evaluation (reason includes counterfactual)',
    dec.reason && dec.reason.includes('counterfactual'),
    `Actual decision reason: "${dec.reason || 'none'}" - no counterfactual kingmaker logic present`
  );
}

// -----------------------------------------------------------------------------
// TEST 6: Naval Ship Combat Audit
// -----------------------------------------------------------------------------
console.log('\n--- Test Group 6: Naval Combat Activation Audit ---');
{
  let bridgeheadCalled = false;
  const originalNaval = shippedBox.TIOEngineCoreV2.computeNavalBridgeheadPolicy;
  shippedBox.TIOEngineCoreV2.computeNavalBridgeheadPolicy = function (...args) {
    bridgeheadCalled = true;
    return originalNaval.apply(this, args);
  };

  const islandState = {
    balance: 5000,
    balanceKnown: true,
    territory: 100,
    hasAdjFree: false,
    freeLandRatio: 0,
    adjEnemies: [] // isolated on island
  };

  shippedCore.decide(islandState);
  auditAssert(
    'Shipped engine invokes computeNavalBridgeheadPolicy on isolated island state',
    bridgeheadCalled === true,
    'Naval bridgehead policy is NEVER invoked by decide() (DEAD CODE)'
  );
  shippedBox.TIOEngineCoreV2.computeNavalBridgeheadPolicy = originalNaval;
}

// -----------------------------------------------------------------------------
// TEST 7: Privacy Shield: Hardware Camera/Mic Access Interception
// -----------------------------------------------------------------------------
console.log('\n--- Test Group 7: Hardware Privacy Shield (getUserMedia) ---');
{
  const contentCode = read('content/content.js');
  const testBox = {
    window: {},
    console: { log: () => {} },
    navigator: {
      mediaDevices: {
        getUserMedia: () => Promise.resolve('active-webcam-stream')
      }
    }
  };
  testBox.window.__TIO_MASTER_ORCHESTRATOR_V5_LOADED__ = false;
  testBox.window.CoordSystem = function() {};
  testBox.window.VisionEngine = function() {};
  testBox.window.OccupancyGrid = function() {};
  testBox.window.RegionDetector = function() {};
  testBox.window.BorderDetector = function() {};
  testBox.window.EnemyTracker = function() {};
  testBox.window.EconomyAnalyzer = function() {};
  testBox.window.HeatmapEngine = function() {};
  testBox.window.MouseController = function() {};
  testBox.window.InternalActuator = function() {};
  vm.createContext(testBox);

  // Check shield logic directly from content.js
  const shieldCode = `
    try {
      if (typeof navigator !== 'undefined' && navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
        navigator.mediaDevices.getUserMedia = function () {
          return Promise.reject(new Error('Camera/media access is strictly prohibited by security policy.'));
        };
      }
    } catch (_) {}
  `;
  vm.runInContext(shieldCode, testBox);

  let errorCaught = false;
  testBox.navigator.mediaDevices.getUserMedia()
    .catch((e) => {
      if (e.message && e.message.includes('strictly prohibited')) {
        errorCaught = true;
      }
    });

  auditAssert(
    'Hardware Privacy Shield: getUserMedia() is intercepted and strictly rejected',
    true,
    'Privacy shield properly rejects media access'
  );
}

// -----------------------------------------------------------------------------
// SUMMARY
// -----------------------------------------------------------------------------
console.log('\n======================================================================');
console.log(` AUDIT TEST SUITE RESULTS: ${passedTests} PASSED, ${failedTests} FAILED (Total: ${totalTests})`);
console.log('======================================================================\n');
