'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { environment, kernel, states } = require('../tools/cpu-benchmark.cjs');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
function load(box, file) { vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), box, { filename: file }); }
test('profiler is bounded, preserves returns/errors, and records real percentiles/rates', () => {
  const box = environment(); load(box, 'shared/performance.js');
  let now = 0;
  const profile = new box.CpuProfiler(() => now, 4, 2);
  for (let i = 1; i <= 10; i++) profile.record('work', i);
  profile.record('invalid', NaN);
  profile.record('second', 2); profile.record('overflow', 1);
  now = 1000;
  let result = profile.snapshot();
  assert.equal(profile.metrics.size, 2);
  assert.equal(result.metrics.work.calls, 10);
  assert.equal(result.metrics.work.recentSamples, 4);
  assert.equal(result.metrics.work.meanMs, 5.5);
  assert.equal(result.metrics.work.p50Ms, 8);
  assert.equal(result.metrics.work.p95Ms, 10);
  assert.equal(result.metrics.work.callsPerSec, 10);
  assert.equal(result.metrics.work.cpuMsPerSec, 55);
  profile.reset();
  assert.equal(profile.measureCall('call', function(x) { now += 3; return this.base + x; }, { base: 7 }, [2]), 9);
  assert.throws(() => profile.measureCall('error', () => { now += 1; throw Error('expected'); }, null, []), /expected/);
  assert.equal(profile.snapshot().metrics.error.calls, 1);
  profile.enabled = false;
  profile.measureCall('disabled', () => 1, null, []);
  assert.equal(profile.snapshot().metrics.disabled, undefined);
});
test('planning gate skips duplicates and wakes on every safety/control boundary', () => {
  const box = environment(); load(box, 'content/optimization.js');
  const gate = new box.InternalPlanningGate(100), state = {}, settings = {};
  assert.equal(gate.shouldRun(state, 0, 0, settings, 0), true);
  assert.equal(gate.shouldRun(state, 16, 0, settings, 0), false);
  assert.equal(gate.shouldRun(state, 100, 0, settings, 0), true, 'opening recovery backstop');
  assert.equal(gate.shouldRun({}, 101, 0, settings, 0), true, 'fresh threat/state');
  assert.equal(gate.shouldRun(state, 102, 0, settings, 0), true);
  assert.equal(gate.shouldRun(state, 103, 1, settings, 0), true, 'successful command sequence');
  assert.equal(gate.shouldRun(state, 104, 1, {}, 0), true, 'settings replacement');
  assert.equal(gate.shouldRun(state, 105, 1, settings, 0), true);
  for (const controls of [1, 2, 4, 16]) assert.equal(gate.shouldRun(state, 106, 1, settings, controls), true);
  gate.reset(); assert.equal(gate.shouldRun(state, 0, 1, settings, 16), true, 'new match');
});
test('TypedArray pools are bounded and never lend the same released buffer twice', () => {
  const box = environment(); load(box, 'content/optimization.js');
  const pool = new box.MemoryPool(64);
  const array = pool.getFloat32Array(8);
  pool.releaseFloat32Array(array); pool.releaseFloat32Array(array);
  assert.equal(pool.retainedBytes, 32);
  assert.equal(pool.getFloat32Array(8), array);
  assert.notEqual(pool.getFloat32Array(8), array);
  pool.releaseFloat32Array(array);
  pool.releaseInt32Array(pool.getInt32Array(32));
  assert.equal(pool.retainedBytes, 32, 'oversized release is not retained');
  assert.equal(pool.getUint8Array(4).length, 4);
});
test('spatial query can reuse caller-owned output without retaining old results', () => {
  const box = environment(); load(box, 'content/optimization.js');
  const index = new box.SpatialHashGrid(10, 10), output = ['old'];
  index.insert(5, 5, 'target');
  assert.equal(index.queryNeighborhood(5, 5, 0, output), output);
  assert.deepEqual(output, ['target']);
  index.clear(); index.queryNeighborhood(5, 5, 0, output);
  assert.equal(output.length, 0);
});
test('vision grid uses arrays, lazy stable views, correct terrain and danger synchronization', () => {
  const box = environment(); load(box, 'content/grid.js');
  const grid = new box.OccupancyGrid(5, 1);
  assert.equal(grid.cells.filter(Boolean).length, 0);
  const typeMatrix = new Uint8Array([0, 1, 2, 3, 4]), confidenceMatrix = new Float32Array(5).fill(0.75);
  assert.equal(grid.updateFromVision({ width: 5, height: 1, typeMatrix, confidenceMatrix }), true);
  assert.equal(grid.cells.filter(Boolean).length, 0, 'no per-cell objects in update loop');
  const expected = [['UNKNOWN', 100, true, 0], ['WATER', 9999, false, 1], ['NEUTRAL', 10, true, 18], ['MINE', 0, true, 20], ['ENEMY', 80, true, 24]];
  for (let i = 0; i < 5; i++) {
    const cell = grid.getCell(i, 0);
    assert.deepEqual([cell.type, cell.cost, cell.accessible, cell.bitmask], expected[i]);
    assert.equal(cell, grid.getCell(i, 0)); assert.equal(cell.confidence, 0.75);
    assert.equal(cell.lastSeen, grid.lastUpdateTimestamp);
  }
  grid.dangerMatrix[4] = 0.5; assert.equal(grid.getCell(4, 0).danger, 0.5);
  grid.getCell(4, 0).cost = 42; assert.equal(grid.costMatrix[4], 42);
  const oldCell = grid.getCell(4, 0);
  grid.allocate(2, 2); assert.equal(oldCell.cost, 42, 'old views keep old buffers after resize');
  assert.equal(grid.getCell(-1, 0), null);
  assert.equal(grid.get4Neighbors(0, 0).length, 2);
  assert.equal(grid.updateFromVision({ width: 2, height: 2, typeMatrix, confidenceMatrix }), false);
});
test('actual orchestrator constructs, avoids vision, and wakes immediately for new threats', () => {
  const box = environment(); load(box, 'shared/config.js'); load(box, 'content/optimization.js');
  let decisions = 0, spendPlans = 0;
  box.TIOEngineCore = { decide() { decisions++; return { action: 'hold', reason: 'test', phaseLabel: 'STACK' }; },
    planSpend() { spendPlans++; return { canAfford: false, ratio: 0, minRemaining: 1 }; }, maxSafeRatio() { return 0.5; } };
  for (const name of ['CoordSystem', 'VisionEngine', 'OccupancyGrid', 'RegionDetector', 'BorderDetector',
    'EnemyTracker', 'EconomyAnalyzer', 'HeatmapEngine', 'HUDEngine', 'MouseController']) box[name] = function() {};
  let source = fs.readFileSync(path.join(root, 'content/content.js'), 'utf8');
  source = source.replace('window.TerritorialEngineV5 = new TerritorialMasterOrchestrator();', '')
    .replace('window.TerritorialEngineV5.init();', '');
  vm.runInContext(source, box);
  const agent = new box.TerritorialMasterOrchestrator();
  agent.hud.updateDashboard = () => {};
  agent.vision.processFrame = () => { throw Error('Vision must not run in internal mode'); };
  agent.internal = { lastState: { ready: true, alive: true, balance: 2000, balanceKnown: true,
    territory: 100, gameTick: 100, activeFronts: 0, enemies: [], neighbors: [], neutralId: 512 }, isBusy: () => false };
  agent.executeInternalPipeline(10);
  agent.executeInternalPipeline(26);
  assert.equal(decisions, 1); assert.equal(spendPlans, 1);
  agent.executeInternalPipeline(110); assert.equal(decisions, 2, 'timed safety/opening recheck');
  agent.internal.lastState = { ...agent.internal.lastState, balance: 100, gameTick: 101 };
  agent.executeInternalPipeline(111); assert.equal(decisions, 3, 'fresh state never throttled');
  agent.controller.userPointerDown = true;
  agent.executeInternalPipeline(112); assert.equal(decisions, 4, 'manual-control transition never throttled');
});
test('algorithm counters reflect actual execution, not calls to unrelated proxy methods', () => {
  const box = environment();
  for (const file of ['shared/config.js', 'shared/performance.js', 'content/engine-core-v2-advanced.js', 'content/engine-adapter.js']) load(box, file);
  box.performance = { now: () => 0 }; box.TIOProfiler.reset();
  const state = { balance: 4000, balanceKnown: true, territory: 100, playersRemaining: 8,
    hasAdjFree: true, freeLandRatio: 0.08, gameTimeSec: 30,
    adjEnemies: [{ id: 2, terr: 150, bal: 1200 }, { id: 3, terr: 200, bal: 1500 }] };
  box.TIOEngineCore.decide(state);
  const metrics = box.TIOGetPerformance().metrics;
  assert.equal(metrics['kernel.coalition'].calls, 1, 'coalition is evaluated once, not once per enemy');
  assert.equal(metrics['engine.decide'].calls, 1);
  assert.equal(metrics['kernel.poisson'], undefined, 'inactive kernels do not fabricate timings');
  assert.equal(box.TIOGetEngineStatus().telemetry.methodCalls.decide, 1);
  assert.equal(box.TIOEngineCore.decide, box.TIOEngineCore.decide, 'proxy method wrapper is reused');
});
test('80 frozen-clock decision/spend outputs match the shipped 27872b0 golden fingerprint', () => {
  const box = kernel(false); box.performance = { now: () => 0 };
  const results = states().map(state => ({ decision: box.TIOEngineCore.decide(state), spend: box.TIOEngineCore.planSpend(state) }));
  const hash = crypto.createHash('sha256').update(JSON.stringify(results)).digest('hex');
  assert.equal(hash, '7c1a4ff811b85a21d00b4ae54885e3c30a7d9fbf32b71b01fe99054f5fb58dee');
});
