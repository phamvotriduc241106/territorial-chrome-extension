'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cp = require('node:child_process');
const os = require('node:os');
const { performance } = require('node:perf_hooks');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const BASELINE = '188b1bf';
function historical(file) { return cp.execFileSync('git', ['show', BASELINE + ':' + file], { cwd: root, encoding: 'utf8' }); }
function environment() {
  let seed = 12345;
  const math = Object.create(Math);
  math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const box = { performance, Math: math, console: { log() {}, warn() {}, error() {} }, innerWidth: 1280, innerHeight: 800 };
  box.window = box; vm.createContext(box); return box;
}
function kernel(old = false) {
  const box = environment();
  vm.runInContext(read('shared/config.js'), box);
  vm.runInContext(read('shared/performance.js'), box);
  box.TIOProfiler.enabled = !old;
  vm.runInContext(old ? historical('content/engine-core-v2-advanced.js') : read('content/engine-core-v2-advanced.js'), box);
  vm.runInContext(old ? historical('content/engine-adapter.js') : read('content/engine-adapter.js'), box);
  return box;
}
function states() {
  return Array.from({ length: 80 }, (_, i) => ({ balance: 1200 + i * 227, balanceKnown: true,
    territory: 100 + i * 3, softCap: (100 + i * 3) * 100,
    adjEnemies: Array.from({ length: 2 + i % 15 }, (_, j) => ({ id: j + 2, bal: 500 + j * 171,
      terr: 50 + j * 31, incoming: j % 3 * 25, available: true })),
    hasAdjFree: i % 2 === 0, freeLandRatio: i % 2 === 0 ? 0.08 : 0,
    playersRemaining: 32, globalRank: 2, activeFronts: i % 4,
    attackSequence: i % 8, gameTimeSec: 30 + i, tick: 100 + i,
    areaTrend: i % 7 === 0 ? -3 : 1, shrinkFrames: i % 7 === 0 ? 2 : 0
  }));
}
function sample(fn, calls = 1200) {
  for (let i = 0; i < 200; i++) fn(i);
  const timings = [];
  for (let i = 0; i < calls; i++) { const start = performance.now(); fn(i); timings.push(performance.now() - start); }
  timings.sort((a, b) => a - b);
  return { calls, meanMs: timings.reduce((sum, x) => sum + x, 0) / calls,
    p50Ms: timings[Math.ceil(calls * 0.50) - 1], p95Ms: timings[Math.ceil(calls * 0.95) - 1], p99Ms: timings[Math.ceil(calls * 0.99) - 1] };
}
function benchmark() {
  const old = kernel(true), next = kernel(false), fixtures = states();
  // Strategy changes are intentional in 10.3.0; report differences rather than
  // asserting CPU-only equivalence against the prior release.
  old.performance = next.performance = { now: () => 0 };
  let changedDecisionFixtures = 0, changedSpendFixtures = 0;
  for (const state of fixtures) {
    changedDecisionFixtures += Number(JSON.stringify(next.TIOEngineCore.decide(state)) !== JSON.stringify(old.TIOEngineCore.decide(state)));
    changedSpendFixtures += Number(JSON.stringify(next.TIOEngineCore.planSpend(state)) !== JSON.stringify(old.TIOEngineCore.planSpend(state)));
  }
  old.performance = next.performance = performance;
  next.TIOProfiler.reset();
  const engine = {};
  for (const [name, box] of [['baseline', old], ['updated', next]])
    engine[name] = sample(i => { const state = fixtures[i % fixtures.length]; box.TIOEngineCore.decide(state); box.TIOEngineCore.planSpend(state); });
  const leading = { balance: 9000, balanceKnown: true, territory: 100, softCap: 10000,
    hasAdjFree: false, freeLandRatio: 0, playersRemaining: 3, globalRank: 1, leaderId: 1,
    leaderTerritory: 100, totalEnemyTerr: 175, primaryDanger: 0.47, relativePower: 1.125,
    adjEnemies: [{ id: 2, bal: 8000, terr: 90 }, { id: 3, bal: 7500, terr: 85 }] };
  const leadingEngine = {};
  for (const [name, box] of [['baseline', old], ['updated', next]])
    leadingEngine[name] = sample(() => { box.TIOEngineCore.decide(leading); box.TIOEngineCore.planSpend(leading); }, 300);
  const grid = {}, width = 320, height = 180;
  const input = { width, height, typeMatrix: new Uint8Array(width * height), confidenceMatrix: new Float32Array(width * height).fill(0.75) };
  for (let i = 0; i < input.typeMatrix.length; i++) input.typeMatrix[i] = i % 5;
  for (const [name, isOld] of [['baseline', true], ['updated', false]]) {
    const box = environment();
    vm.runInContext(isOld ? historical('content/grid.js') : read('content/grid.js'), box);
    const instance = new box.OccupancyGrid(width, height);
    const initialCellObjects = instance.cells.filter(Boolean).length;
    grid[name] = { ...sample(() => instance.updateFromVision(input), 400), initialCellObjects };
  }
  const box = environment(); vm.runInContext(read('content/optimization.js'), box);
  const gate = new box.InternalPlanningGate(100), settings = {}, state = {};
  for (let frame = 0; frame < 600; frame++) gate.shouldRun(state, frame * 1000 / 60, 0, settings, 0);
  return { evidence: 'Node microbenchmarks on fixed fixtures, not browser/game win rate or total CPU/power', baselineCommit: BASELINE,
    host: { cpu: os.cpus()[0].model, logicalCpus: os.cpus().length, architecture: process.arch, node: process.version },
    policyFixturesCompared: fixtures.length, changedDecisionFixtures, changedSpendFixtures,
    comparisonKind: 'Different planning models: latency comparison, not behavior-preserving CPU optimization',
    engineFixtureKind: '80 follower states; speculative search cannot veto these decisions', engine,
    leadingFixtureKind: 'Three-player leading state; endgame search is active', leadingEngine, grid,
    unchangedSnapshotGate: { frames: 600, evaluations: gate.evaluations, skipped: gate.skipped },
    cpuProfile: next.TIOGetPerformance() };
}
if (require.main === module) console.log(JSON.stringify(benchmark(), null, 2));
module.exports = { environment, kernel, states, benchmark };
