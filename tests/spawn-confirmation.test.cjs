'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { environment } = require('../tools/cpu-benchmark.cjs');

function fixture(native, enabled = true) {
  const box = environment();
  box.performance = { now: () => 200 };
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../shared/config.js'), 'utf8'), box);
  for (const name of ['CoordSystem', 'VisionEngine', 'OccupancyGrid', 'RegionDetector',
    'BorderDetector', 'EnemyTracker', 'EconomyAnalyzer', 'HeatmapEngine', 'HUDEngine', 'MouseController'])
    box[name] = function () {};
  const source = fs.readFileSync(path.join(__dirname, '../content/content.js'), 'utf8')
    .replace('window.TerritorialEngineV5 = new TerritorialMasterOrchestrator();', '')
    .replace('window.TerritorialEngineV5.init();', '');
  vm.runInContext(source, box);
  const agent = new box.TerritorialMasterOrchestrator();
  agent.lastTickTime = 0;
  agent.pendingSpawn = { x: 550, y: 160, t: 0 };
  agent.settings.allowVisionFallback = enabled;
  agent.hud.updateDashboard = () => {};
  agent.internal = { lastState: native, lastStateAt: 200, isReady: () => !!native?.ready };
  let reads = 0, calibrations = 0, arms = 0;
  const vision = { typeMatrix: [1], width: 10, height: 10,
    histogram: { mineCount: 20, waterCount: 20, neutralCount: 60 } };
  agent.vision.processFrame = () => { reads++; return vision; };
  agent.vision.sampleAndCalibratePlayerColor = () => { calibrations++; };
  agent.armConfirmedMatch = () => { arms++; return true; };
  return { agent, vision, stats: () => ({ reads, calibrations, arms }) };
}

for (const native of [
  { ready: true, player: 0, alive: true, territory: 0 },
  { ready: true, player: 0, alive: false, territory: 20 },
  { ready: true, player: -1, alive: true, territory: 20 },
  { ready: true, player: 0, alive: true },
]) test('mapped native non-spawn cannot be overruled by terrain pixels: ' + JSON.stringify(native), () => {
  const f = fixture(native);
  f.agent.runPendingSpawnCheck(200);
  assert.deepEqual(f.stats(), { reads: 0, calibrations: 0, arms: 0 });
  assert.equal(f.agent.tryConfirmSpawnFromVision(f.vision), false);
  assert.deepEqual(f.stats(), { reads: 0, calibrations: 0, arms: 0 });
});

test('positive native territory confirms without any canvas readback', () => {
  const f = fixture({ ready: true, player: 0, alive: true, territory: 12 });
  f.agent.runPendingSpawnCheck(200);
  assert.deepEqual(f.stats(), { reads: 0, calibrations: 0, arms: 1 });
});

test('cached positive territory from before the spawn click cannot confirm it', () => {
  for (const lastStateAt of [undefined, NaN, Infinity, -1, 99]) {
    const f = fixture({ ready: true, player: 0, alive: true, territory: 12 });
    f.agent.pendingSpawn.t = 100;
    f.agent.internal.lastStateAt = lastStateAt;
    f.agent.runPendingSpawnCheck(200);
    assert.deepEqual(f.stats(), { reads: 0, calibrations: 0, arms: 0 });
  }
  const f = fixture({ ready: true, player: 0, alive: true, territory: 12 });
  f.agent.pendingSpawn.t = 100;
  f.agent.internal.lastStateAt = 100;
  f.agent.runPendingSpawnCheck(200);
  assert.equal(f.stats().arms, 1);
});

test('disabled fallback also prohibits spawn-time canvas reads', () => {
  const f = fixture(null, false);
  f.agent.runPendingSpawnCheck(200);
  assert.deepEqual(f.stats(), { reads: 0, calibrations: 0, arms: 0 });
  assert.equal(f.agent.tryConfirmSpawnFromVision(f.vision), false);
});

test('unmapped native source retains explicitly enabled vision fallback', () => {
  for (const native of [null, { ready: false }]) {
    const f = fixture(native);
    f.agent.executePipeline = () => {};
    f.agent.runPendingSpawnCheck(200);
    assert.equal(f.stats().arms, 1);
    assert.ok(f.stats().reads > 0);
    assert.equal(f.stats().calibrations, 1);
  }
});

test('a new confirmed match does not inherit the previous not-alive timer', () => {
  const f = fixture({ ready: true, player: 0, alive: true, territory: 12 });
  delete f.agent.armConfirmedMatch;
  f.agent.internalNotAliveSince = 50;
  assert.equal(f.agent.armConfirmedMatch('test native territory'), true);
  assert.equal(f.agent.internalNotAliveSince, 0);
  assert.equal(f.agent.matchArmed, true);
});

test('unreachable endgame neutral land reports a blocker without altering policy or spending', () => {
  const state = { ready: true, player: 0, alive: true, territory: 111443,
    alivePlayers: 1, freeLandCells: 1483, activeFronts: 0, shipsEnabled: false, physicalNeighbors: [] };
  const f = fixture(state);
  Object.assign(f.agent, { matchArmed: true, isPlayerSpawnCalibrated: true,
    isActive: true, engineStarted: true, _decision: { action: 'hold', reason: 'idle-hold' },
    lastCommitMeta: { canAfford: false } });
  f.agent.pendingSpawn = null;
  f.agent.internal.armed = true;
  const decision = f.agent._decision, spend = f.agent.lastCommitMeta;
  assert.equal(f.agent.getStatus().blockReason, 'no-land-route');
  assert.equal(f.agent._decision, decision);
  assert.equal(f.agent.lastCommitMeta, spend);
  for (const patch of [{ alivePlayers: 2 }, { freeLandCells: 0 }, { freeLandCells: null },
    { activeFronts: 1 }, { shipsEnabled: true }, { physicalNeighbors: [512] }, { physicalNeighbors: null }]) {
    f.agent.internal.lastState = { ...state, ...patch };
    assert.equal(f.agent.getStatus().blockReason, null);
  }
});
