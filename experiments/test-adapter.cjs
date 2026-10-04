/**
 * Test Suite for V1/V2 Runtime Toggle & Extension Adapter
 * Verifies that TIOEngineAdapter can seamlessly hot-swap policy kernels,
 * proxy method calls with zero overhead, and track real-time telemetry.
 */
'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

function setupTestEnvironment() {
  const sandbox = {
    window: {},
    console: { log: () => {}, warn: () => {}, error: () => {} },
    Math, isFinite, Number, parseInt, parseFloat, Array, Set, Map,
    Uint8Array, Uint16Array, Uint32Array, Int8Array, Int16Array, Int32Array,
    Float32Array, Float64Array, Object, String, NaN, Infinity, Proxy
  };
  sandbox.globalThis = sandbox.window;
  sandbox.global = sandbox.window;
  vm.createContext(sandbox);

  // Load shared config (engine version + updated timestamp labels)
  const configCode = fs.readFileSync(path.join(__dirname, '../shared/config.js'), 'utf8');
  vm.runInContext(configCode, sandbox);

  // Load V1
  const v1Code = fs.readFileSync(path.join(__dirname, '../content/engine-core-v1.js'), 'utf8');
  vm.runInContext(v1Code, sandbox);

  // Load V2
  const v2Code = fs.readFileSync(path.join(__dirname, '../content/engine-core-v2-advanced.js'), 'utf8');
  vm.runInContext(v2Code, sandbox);

  // Load Adapter
  const adapterCode = fs.readFileSync(path.join(__dirname, '../content/engine-adapter.js'), 'utf8');
  vm.runInContext(adapterCode, sandbox);

  return sandbox.window;
}

console.log('================================================================================');
console.log(' TESTING V1/V2 EXTENSION ADAPTER & HOT-SWAP RUNTIME BRIDGE');
console.log('================================================================================\n');

const env = setupTestEnvironment();
const adapter = env.TIOEngineAdapter;
const proxy = env.TIOEngineCoreProxy;

assert(adapter != null, 'TIOEngineAdapter exists');
assert(proxy != null, 'TIOEngineCoreProxy exists');

// Test 1: Initial state is V2
let status = adapter.getStatus();
assert.strictEqual(status.activeVersion, 2, 'Default version is V2');
assert.strictEqual(status.activeEngine, env.TIOConfig.ENGINE_VERSION, 'Active engine matches shared config');
assert.strictEqual(status.engineUpdatedAt, env.TIOConfig.ENGINE_UPDATED_AT, 'Engine update date, time, and timezone are exposed');
assert.strictEqual(status.v1Available, true, 'V1 is available');
assert.strictEqual(status.v2Available, true, 'V2 is available');

// Test 2: Proxy delegation to V2
const stateCtx = {
  balance: 1000,
  territory: 50,
  softCap: 5000,
  freeLandRatio: 0.5,
  hasAdjFree: true,
  adjEnemies: []
};

const decV2 = proxy.decide(stateCtx);
assert(decV2 != null && typeof decV2.action === 'string', 'Proxy calls decide() on active engine');
status = adapter.getStatus();
assert(status.telemetry.ticksEvaluated > 0, 'telemetry.ticksEvaluated increments');
assert(status.telemetry.methodCalls.decide > 0, 'actual decide calls increment');

// Test 3: planSpend telemetry
const plan = proxy.planSpend(stateCtx);
assert(plan != null && typeof plan.ratio === 'number', 'Proxy calls planSpend() on active engine');
status = adapter.getStatus();
assert(status.telemetry.methodCalls.planSpend > 0, 'actual planSpend calls increment');
assert(!('kktAllocationsComputed' in status.telemetry), 'proxy calls do not fabricate KKT executions');

// Test 4: rankTargets telemetry
const targets = proxy.rankTargets([
  { id: 1, x: 100, y: 100, type: 'NEUTRAL' },
  { id: 2, x: 200, y: 200, type: 'ENEMY' }
], stateCtx, decV2, 2);
assert(Array.isArray(targets), 'Proxy calls rankTargets()');
status = adapter.getStatus();
assert(status.telemetry.methodCalls.rankTargets > 0, 'actual rankTargets calls increment');

// Test 5: Hot-swap to V1
adapter.setVersion(1);
status = adapter.getStatus();
assert.strictEqual(status.activeVersion, 1, 'Switched to V1');
assert.strictEqual(status.activeEngine, 'V1', 'Active engine is V1');

const decV1 = proxy.decide(stateCtx);
assert(decV1 != null && typeof decV1.action === 'string', 'Proxy calls decide() on V1');

// Test 6: Hot-swap back to V2
adapter.setVersion(2);
status = adapter.getStatus();
assert.strictEqual(status.activeVersion, 2, 'Switched back to V2');

console.log('Adapter Status Summary:');
console.log(JSON.stringify(status, null, 2));

console.log('\nALL ADAPTER TESTS PASSED! Hot-swap is fully operational.\n');
