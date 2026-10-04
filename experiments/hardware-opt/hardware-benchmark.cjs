/**
 * Hardware Benchmark — Comparative Nanosecond Profiler
 * =====================================================
 * Measures baseline vs optimized kernel latencies side-by-side
 * on the current hardware (Apple M4 ARM64).
 *
 * Reports:
 *   - Baseline latency (µs)
 *   - Optimized latency (µs)
 *   - Speedup factor (×)
 *   - Total pipeline latency before/after
 */
'use strict';

const vm = require('vm');
const fs = require('fs');
const path = require('path');

// ── Load Baseline Engine ──
const engineSrc = fs.readFileSync(
  path.join(__dirname, '..', 'engine-core-v2-advanced.js'), 'utf8'
);
const sandbox = { window: {}, console, Math, performance, parseInt, parseFloat, isNaN, isFinite, Infinity, NaN, undefined, Number, Array, Object, Float32Array, Float64Array, Int32Array, Uint8Array, Uint16Array, String, Error, TypeError, RangeError, JSON, Date, Map, Set, RegExp, Promise };
vm.createContext(sandbox);
vm.runInContext(engineSrc, sandbox);
const EC = sandbox.window.TIOEngineCore;

// ── Load Optimized Kernels ──
let computeEikonalFSM, computePoissonRedBlack, computeMCTSFlat, MortonSpatialGrid, computeNavalBellmanFast;

try { computeEikonalFSM = require('./fsm-eikonal.js').computeEikonalFSM; } catch (e) { console.warn('[SKIP]', e.message); }
try { computePoissonRedBlack = require('./red-black-poisson.js').computePoissonRedBlack; } catch (e) { console.warn('[SKIP]', e.message); }
try { computeMCTSFlat = require('./flat-mcts.js').computeMCTSFlat; } catch (e) { console.warn('[SKIP]', e.message); }
try { MortonSpatialGrid = require('./morton-spatial-grid.js').MortonSpatialGrid; } catch (e) { console.warn('[SKIP]', e.message); }
try { computeNavalBellmanFast = require('./analytical-naval-bellman.js').computeNavalBellmanFast; } catch (e) { console.warn('[SKIP]', e.message); }

const { SpatialHashGrid } = require('../spatial-index.js');

// ── Benchmark Utility ──
function benchmarkNs(fn, warmup, iters) {
  // Warmup
  for (let i = 0; i < warmup; i++) fn();

  // Measure
  const times = new Float64Array(iters);
  for (let i = 0; i < iters; i++) {
    const t0 = process.hrtime.bigint();
    fn();
    const t1 = process.hrtime.bigint();
    times[i] = Number(t1 - t0);
  }

  // Compute median (more robust than mean)
  const sorted = Array.from(times).sort((a, b) => a - b);
  const median = sorted[Math.floor(iters / 2)];
  const p5 = sorted[Math.floor(iters * 0.05)];
  const p95 = sorted[Math.floor(iters * 0.95)];
  const mean = times.reduce((a, b) => a + b, 0) / iters;

  return { medianNs: median, meanNs: mean, p5Ns: p5, p95Ns: p95 };
}

const WARMUP = 200;
const ITERS = 2000;

// ── Common Test Data ──
const eikonalSources = [{ x: 200, y: 300 }, { x: 700, y: 600 }];
const eikonalObstacles = [{ x: 500, y: 400 }, { x: 300, y: 700 }];
const eikonalSpeed = new Float32Array(16 * 8);
for (let i = 0; i < eikonalSpeed.length; i++) eikonalSpeed[i] = 0.5 + Math.random() * 2.0;

const poissonSources = [{ x: 200, y: 200 }, { x: 800, y: 200 }];
const poissonSinks = [{ x: 500, y: 800 }, { x: 300, y: 600 }];
const poissonObstacles = [{ x: 600, y: 400 }];

const mctsState = {
  territory: 120,
  balance: 450,
  adjEnemies: [
    { id: 1, bal: 300, terr: 100 },
    { id: 2, bal: 200, terr: 80 },
    { id: 3, bal: 150, terr: 60 }
  ]
};

const navalCandidates = [
  { waterDist: 8, type: 'ENEMY', enemyId: 1, targetBal: 200, targetCapacity: 50, voronoiScore: 15 },
  { waterDist: 3, type: 'NEUTRAL', targetCapacity: 80, voronoiScore: 30 },
  { waterDist: 12, type: 'ENEMY', enemyId: 2, targetBal: 400, targetCapacity: 40 },
  { waterDist: 5, type: 'NEUTRAL', targetCapacity: 60, voronoiScore: 20 }
];
const navalState = { balance: 800, softCap: 2000 };

console.log('╔══════════════════════════════════════════════════════════════════════════╗');
console.log('║  Hardware Benchmark — Baseline vs Optimized Kernels                     ║');
console.log('║  Apple M4 ARM64 · Node.js ' + process.version.padEnd(12) + '                              ║');
console.log('╚══════════════════════════════════════════════════════════════════════════╝');
console.log(`  Warmup: ${WARMUP} | Iterations: ${ITERS} | Metric: Median\n`);

const results = [];

// ═══════════════════════════════════════════════════════════════════════════
// 1. Eikonal
// ═══════════════════════════════════════════════════════════════════════════
{
  const bline = benchmarkNs(() => EC.computeEikonalGeodesicField(16, 8, eikonalSources, eikonalObstacles, eikonalSpeed), WARMUP, ITERS);
  let opt = null;
  if (computeEikonalFSM) {
    opt = benchmarkNs(() => computeEikonalFSM(16, 8, eikonalSources, eikonalObstacles, eikonalSpeed), WARMUP, ITERS);
  }
  results.push({
    name: 'Eikonal Geodesic',
    baseline: bline.medianNs,
    optimized: opt ? opt.medianNs : null,
    target: 2100
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Poisson
// ═══════════════════════════════════════════════════════════════════════════
{
  const bline = benchmarkNs(() => EC.computePoissonPotentialField(poissonSources, poissonSinks, poissonObstacles, 8), WARMUP, ITERS);
  let opt = null;
  if (computePoissonRedBlack) {
    opt = benchmarkNs(() => computePoissonRedBlack(poissonSources, poissonSinks, poissonObstacles, 8), WARMUP, ITERS);
  }
  results.push({
    name: 'Poisson PDE',
    baseline: bline.medianNs,
    optimized: opt ? opt.medianNs : null,
    target: 350
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. MCTS
// ═══════════════════════════════════════════════════════════════════════════
{
  const bline = benchmarkNs(() => EC.computeMCTSEndgameAction(mctsState, 50, 10), WARMUP, ITERS);
  let opt = null;
  if (computeMCTSFlat) {
    opt = benchmarkNs(() => computeMCTSFlat(mctsState, 50, 10), WARMUP, ITERS);
  }
  results.push({
    name: 'MCTS Endgame',
    baseline: bline.medianNs,
    optimized: opt ? opt.medianNs : null,
    target: 5200
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Spatial Index
// ═══════════════════════════════════════════════════════════════════════════
{
  function runBaseline() {
    const g = new SpatialHashGrid(200, 200, 8);
    for (let i = 0; i < 100; i++) g.insert(i, Math.random() * 199, Math.random() * 199);
    for (let q = 0; q < 10; q++) g.queryRadius(Math.random() * 200, Math.random() * 200, 20);
  }
  const bline = benchmarkNs(runBaseline, WARMUP, ITERS);

  let opt = null;
  if (MortonSpatialGrid) {
    function runOptimized() {
      const g = new MortonSpatialGrid(200, 200, 8);
      for (let i = 0; i < 100; i++) g.insert(i, Math.random() * 199, Math.random() * 199);
      for (let q = 0; q < 10; q++) g.queryRadius(Math.random() * 200, Math.random() * 200, 20);
    }
    opt = benchmarkNs(runOptimized, WARMUP, ITERS);
  }
  results.push({
    name: 'Spatial Hash',
    baseline: bline.medianNs,
    optimized: opt ? opt.medianNs : null,
    target: 2800
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. Naval Bellman
// ═══════════════════════════════════════════════════════════════════════════
{
  const bline = benchmarkNs(() => EC.computeNavalBridgeheadPolicy(navalCandidates, navalState), WARMUP, ITERS);
  let opt = null;
  if (computeNavalBellmanFast) {
    opt = benchmarkNs(() => computeNavalBellmanFast(navalCandidates, navalState), WARMUP, ITERS);
  }
  results.push({
    name: 'Naval Bellman',
    baseline: bline.medianNs,
    optimized: opt ? opt.medianNs : null,
    target: 1900
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Report
// ═══════════════════════════════════════════════════════════════════════════
console.log('┌─────────────────────┬────────────┬────────────┬──────────┬────────────┐');
console.log('│ Kernel              │  Baseline  │  Optimized │ Speedup  │   Target   │');
console.log('├─────────────────────┼────────────┼────────────┼──────────┼────────────┤');

let totalBaseline = 0;
let totalOptimized = 0;

for (const r of results) {
  const bUs = (r.baseline / 1000).toFixed(2);
  totalBaseline += r.baseline;

  let oUs = '  N/A     ';
  let speedup = '  N/A   ';
  if (r.optimized !== null) {
    oUs = (r.optimized / 1000).toFixed(2);
    const factor = r.baseline / r.optimized;
    speedup = factor.toFixed(2) + '×';
    totalOptimized += r.optimized;
  } else {
    totalOptimized += r.baseline; // Assume no speedup for missing modules
  }

  const targetUs = (r.target / 1000).toFixed(2);
  const met = r.optimized !== null && (r.optimized / 1000) <= r.target / 1000;
  const marker = r.optimized !== null ? (met ? ' ✓' : ' ✗') : '  ';

  console.log(`│ ${r.name.padEnd(19)} │ ${bUs.padStart(7)} µs │ ${oUs.padStart(7)} µs │ ${speedup.padStart(8)} │ ${targetUs.padStart(7)} µs${marker} │`);
}

console.log('├─────────────────────┼────────────┼────────────┼──────────┼────────────┤');

const totalBUs = (totalBaseline / 1000).toFixed(2);
const totalOUs = (totalOptimized / 1000).toFixed(2);
const totalSpeedup = (totalBaseline / totalOptimized).toFixed(2);

console.log(`│ TOTAL PIPELINE      │ ${totalBUs.padStart(7)} µs │ ${totalOUs.padStart(7)} µs │ ${(totalSpeedup + '×').padStart(8)} │            │`);
console.log('└─────────────────────┴────────────┴────────────┴──────────┴────────────┘');

console.log('\nDone.');
