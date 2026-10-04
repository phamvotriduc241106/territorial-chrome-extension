/**
 * End-to-End Engine Pipeline Benchmark Harness
 * ============================================
 * Measures the complete decision, planning, and ranking pipeline
 * across representative realistic game states:
 *   1. Opening Phase (Land rush, neutral expansion, Voronoi claims)
 *   2. Mid-Game Multi-Front (Enemies, chokepoints, Poisson + Spectral field)
 *   3. Late-Game Combat & Endgame (MCTS tactical evaluation, 3 rivals)
 *   4. Maritime / Archipelago (Naval Bellman bridgehead optimization)
 *
 * Reports:
 *   - Median Latency (µs)
 *   - Mean Latency (µs)
 *   - p95 Latency (µs)
 *   - p99 Latency (µs)
 *   - Min / Max Latency (µs)
 *   - Throughput (ticks / sec)
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
    Float32Array, Float64Array, Object, String, NaN, Infinity, performance,
    process
  };
  sandbox.globalThis = sandbox.window;
  sandbox.global = sandbox.window;
  vm.createContext(sandbox);
  const code = fs.readFileSync(filePath, 'utf8');
  vm.runInContext(code, sandbox);
  return sandbox.window.TIOEngineCore;
}

function loadEngineNative(filePath) {
  global.window = global.window || {};
  global.window.globalThis = global.window;
  delete global.__TIO_ENGINE_CORE_V2_LOADED__;
  if (global.window) delete global.window.__TIO_ENGINE_CORE_V2_LOADED__;
  const abs = path.resolve(filePath);
  delete require.cache[abs];
  const mod = require(abs);
  return global.window.TIOEngineCore || mod;
}

// ── Realistic Benchmark Scenarios ──
function makeOpeningScenario() {
  const candidates = [];
  for (let i = 0; i < 24; i++) {
    candidates.push({
      id: i,
      x: 400 + (i % 6) * 30,
      y: 400 + Math.floor(i / 6) * 30,
      type: 'NEUTRAL',
      enemyId: null,
      ownedNeighbors: 1 + (i % 3),
      distToCenter: 20 + i * 5
    });
  }
  const stateCtx = {
    balance: 500,
    balanceKnown: true,
    territory: 15,
    softCap: 1500,
    freeLandRatio: 0.18,
    hasAdjFree: true,
    adjEnemies: [],
    primaryDanger: 0.1,
    areaTrend: 2,
    shrinkFrames: 0,
    fronts: 2,
    attackSequence: 1,
    gameTimeSec: 2.0
  };
  return { name: 'Opening Land Rush', candidates, stateCtx };
}

function makeMidgameScenario() {
  const candidates = [];
  for (let i = 0; i < 32; i++) {
    const isEnemy = i % 3 === 0;
    candidates.push({
      id: i,
      x: 300 + (i % 8) * 40,
      y: 300 + Math.floor(i / 8) * 40,
      type: isEnemy ? 'ENEMY' : 'NEUTRAL',
      enemyId: isEnemy ? (1 + (i % 4)) : null,
      ownedNeighbors: 1 + (i % 4),
      distToCenter: 30 + i * 4,
      chokepointScore: (i % 5 === 0) ? 80 : 10
    });
  }
  const stateCtx = {
    balance: 4200,
    balanceKnown: true,
    territory: 80,
    softCap: 8000,
    freeLandRatio: 0.05,
    hasAdjFree: true,
    adjEnemies: [
      { id: 1, bal: 3500, terr: 70, x: 250, y: 300 },
      { id: 2, bal: 6000, terr: 110, x: 600, y: 350 },
      { id: 3, bal: 1200, terr: 40, x: 350, y: 550 },
      { id: 4, bal: 4000, terr: 85, x: 500, y: 500 }
    ],
    primaryDanger: 0.45,
    areaTrend: 0,
    shrinkFrames: 0,
    fronts: 4,
    activeFronts: 1,
    attackSequence: 8,
    gameTimeSec: 28.0
  };
  return { name: 'Mid-Game Multi-Front', candidates, stateCtx };
}

function makeEndgameScenario() {
  const candidates = [];
  for (let i = 0; i < 20; i++) {
    candidates.push({
      id: i,
      x: 500 + (i % 5) * 40,
      y: 500 + Math.floor(i / 5) * 40,
      type: 'ENEMY',
      enemyId: 1 + (i % 3),
      ownedNeighbors: 2,
      distToCenter: 40 + i * 2
    });
  }
  const stateCtx = {
    balance: 18000,
    balanceKnown: true,
    territory: 240,
    softCap: 24000,
    freeLandRatio: 0.005,
    hasAdjFree: false,
    adjEnemies: [
      { id: 1, bal: 15000, terr: 210, x: 400, y: 450 },
      { id: 2, bal: 19500, terr: 260, x: 650, y: 500 },
      { id: 3, bal: 8000, terr: 120, x: 500, y: 700 }
    ],
    primaryDanger: 0.65,
    areaTrend: -1,
    shrinkFrames: 0,
    fronts: 4,
    activeFronts: 2,
    attackSequence: 24,
    gameTimeSec: 85.0
  };
  return { name: 'Late-Game Combat (MCTS)', candidates, stateCtx };
}

function makeNavalScenario() {
  const candidates = [];
  for (let i = 0; i < 16; i++) {
    candidates.push({
      id: i,
      x: 200 + (i % 4) * 60,
      y: 200 + Math.floor(i / 4) * 60,
      type: (i % 2 === 0) ? 'NEUTRAL' : 'ENEMY',
      enemyId: (i % 2 === 0) ? null : 2,
      waterDist: 4 + (i % 6) * 3,
      targetCapacity: 50 + i * 10,
      targetBal: (i % 2 === 0) ? 0 : 400,
      ownedNeighbors: 1
    });
  }
  const stateCtx = {
    balance: 5500,
    balanceKnown: true,
    territory: 65,
    softCap: 6500,
    freeLandRatio: 0.04,
    hasAdjFree: true,
    adjEnemies: [
      { id: 2, bal: 4800, terr: 75, x: 450, y: 250 }
    ],
    primaryDanger: 0.3,
    areaTrend: 1,
    shrinkFrames: 0,
    fronts: 2,
    activeFronts: 0,
    attackSequence: 6,
    gameTimeSec: 18.0
  };
  return { name: 'Maritime / Naval Bridgehead', candidates, stateCtx };
}

// Execute complete end-to-end tick: decide -> planSpend -> rankTargets
function runCompleteTick(engine, scenario) {
  const decision = engine.decide(scenario.stateCtx);
  const plan = engine.planSpend(Object.assign({}, scenario.stateCtx, {
    wantEnemy: decision.action === 'fight',
    crushable: decision.crushable
  }));
  let ranked = null;
  if (typeof engine.rankTargets === 'function') {
    ranked = engine.rankTargets(scenario.candidates, scenario.stateCtx, decision, 4);
  }
  return { decision, plan, ranked };
}

function benchmarkPipeline(engine, warmupRuns = 150, measureRuns = 1500) {
  const scenarios = [
    makeOpeningScenario(),
    makeMidgameScenario(),
    makeEndgameScenario(),
    makeNavalScenario()
  ];

  // Warmup (allow V8 JIT to compile and optimize)
  for (let w = 0; w < warmupRuns; w++) {
    for (let s = 0; s < scenarios.length; s++) {
      runCompleteTick(engine, scenarios[s]);
    }
  }

  // Measurement
  const times = new Float64Array(measureRuns);
  for (let m = 0; m < measureRuns; m++) {
    const scen = scenarios[m % scenarios.length];
    const t0 = process.hrtime.bigint();
    runCompleteTick(engine, scen);
    const t1 = process.hrtime.bigint();
    times[m] = Number(t1 - t0) / 1000; // microseconds
  }

  const sorted = Array.from(times).sort((a, b) => a - b);
  const median = sorted[Math.floor(measureRuns * 0.50)];
  const p95 = sorted[Math.floor(measureRuns * 0.95)];
  const p99 = sorted[Math.floor(measureRuns * 0.99)];
  const min = sorted[0];
  const max = sorted[measureRuns - 1];
  const mean = times.reduce((a, b) => a + b, 0) / measureRuns;
  const throughput = Math.round(1000000 / mean);

  return {
    medianUs: parseFloat(median.toFixed(2)),
    meanUs: parseFloat(mean.toFixed(2)),
    p95Us: parseFloat(p95.toFixed(2)),
    p99Us: parseFloat(p99.toFixed(2)),
    minUs: parseFloat(min.toFixed(2)),
    maxUs: parseFloat(max.toFixed(2)),
    throughputTicksPerSec: throughput
  };
}

module.exports = {
  loadEngine,
  loadEngineNative,
  benchmarkPipeline,
  runCompleteTick,
  makeOpeningScenario,
  makeMidgameScenario,
  makeEndgameScenario,
  makeNavalScenario
};

if (require.main === module) {
  const args = process.argv.slice(2);
  const useVm = args.includes('--vm');
  const pathArg = args.find(a => !a.startsWith('--'));
  const enginePath = pathArg || path.join(__dirname, 'legacy', 'engine-core.js');
  console.log(`Benchmarking: ${enginePath} (${useVm ? 'V8 vm.createContext' : 'Native Chrome/Node Runtime'})`);
  const engine = useVm ? loadEngine(enginePath) : loadEngineNative(enginePath);
  const stats = benchmarkPipeline(engine);
  console.log('\n--- Pipeline Benchmark Results ---');
  console.log(`Median Latency:  ${stats.medianUs} µs`);
  console.log(`Mean Latency:    ${stats.meanUs} µs`);
  console.log(`p95 Latency:     ${stats.p95Us} µs`);
  console.log(`p99 Latency:     ${stats.p99Us} µs`);
  console.log(`Min..Max:        ${stats.minUs} µs .. ${stats.maxUs} µs`);
  console.log(`Throughput:      ${stats.throughputTicksPerSec} ticks/sec`);
}
