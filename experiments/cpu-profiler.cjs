/**
 * Sub-Microsecond CPU Profiler & Algorithmic Hotspot Analyzer
 * 
 * Measures nanosecond execution latency and GC allocation overhead across:
 *   1. computeAdaptiveCommit (PMP Singular Arc)
 *   2. computeBreachProbability (SDE Abramowitz-Stegun erf)
 *   3. computeSpectralFiedler (Shifted Inverse Power Iteration with 1-Deflation)
 *   4. computePoissonPotentialField (SOR Iteration on Coarse Grid)
 *   5. computeEikonalGeodesicField (Fast Marching Priority Queue)
 *   6. BayesianArchetypeClassifier.recordAction (Dirichlet Mixture Update)
 *   7. BayesianTroopObserver.updateObservation (Kalman Gain Step)
 *   8. SpatialHashGrid (Cell insertion & radius queries)
 *   9. scoreCandidate (Mean Curvature Flow + Tactical Weights)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { SpatialHashGrid } = require('./spatial-index.js');

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

const v2 = loadEngine(path.join(__dirname, 'engine-core-v2-advanced.js'));

function profileSubsystem(name, iterations, fn) {
  // Warmup V8 JIT
  for (let i = 0; i < Math.min(500, iterations); i++) fn();

  const startMem = process.memoryUsage().heapUsed;
  const start = process.hrtime.bigint();

  for (let i = 0; i < iterations; i++) {
    fn();
  }

  const end = process.hrtime.bigint();
  const endMem = process.memoryUsage().heapUsed;

  const totalNanos = Number(end - start);
  const nanosPerOp = totalNanos / iterations;
  const microsPerOp = nanosPerOp / 1000;
  const opsPerSec = Math.round(1e9 / nanosPerOp);
  const heapDeltaKB = ((endMem - startMem) / 1024).toFixed(2);

  return {
    name,
    iterations,
    microsPerOp: parseFloat(microsPerOp.toFixed(3)),
    opsPerSec,
    heapDeltaKB
  };
}

function runProfiler() {
  console.log('================================================================================');
  console.log(' SUB-MICROSECOND CPU PROFILER & ALGORITHMIC HOTSPOT ANALYZER');
  console.log(' Precision profiling across all 10 mathematical modules');
  console.log('================================================================================\n');

  const candidatesSample = [
    { x: 100, y: 100, type: 'NEUTRAL', ownedNeighbors: 3 },
    { x: 120, y: 110, type: 'ENEMY', enemyBal: 200, ownedNeighbors: 1, enemyId: 2 },
    { x: 150, y: 130, type: 'NEUTRAL', ownedNeighbors: 2 },
    { x: 200, y: 180, type: 'ENEMY', enemyBal: 500, ownedNeighbors: 2, enemyId: 3 },
    { x: 250, y: 220, type: 'NEUTRAL', ownedNeighbors: 4 }
  ];

  const stateSample = {
    balance: 1500,
    territory: 120,
    softCap: 12000,
    density: 0.125,
    freeLandRatio: 0.25,
    activeFronts: 3,
    adjEnemies: [{ id: 2, bal: 400, terr: 60 }, { id: 3, bal: 900, terr: 110 }]
  };

  const spatialGrid = new SpatialHashGrid(200, 100, 16);

  const results = [
    profileSubsystem('PMP Adaptive Commit', 50000, () => {
      v2.computeAdaptiveCommit(stateSample);
    }),
    profileSubsystem('SDE Breach Probability (erf)', 50000, () => {
      v2.computeBreachProbability(375, 400);
    }),
    profileSubsystem('Spectral Fiedler Bisection', 20000, () => {
      v2.computeSpectralFiedler(candidatesSample);
    }),
    profileSubsystem('Poisson Harmonic PDE Field', 5000, () => {
      v2.computePoissonPotentialField([{ x: 100, y: 100 }], [{ x: 500, y: 500 }], [], 8);
    }),
    profileSubsystem('Eikonal Geodesic Wavefront', 5000, () => {
      v2.computeEikonalGeodesicField(16, 16, [{ x: 0, y: 0 }], [{ x: 8, y: 8 }]);
    }),
    profileSubsystem('Bayesian Archetype Update', 50000, () => {
      v2.BayesianArchetypeClassifier.recordAction(2, 250, 1000, 50, false);
    }),
    profileSubsystem('Bayesian EKF Observer Step', 50000, () => {
      v2.BayesianTroopObserver.updateObservation(2, 450, 50);
    }),
    profileSubsystem('Spatial Hash Insert & Query', 50000, () => {
      spatialGrid.insert(1, 50, 50);
      spatialGrid.queryRadius(50, 50, 20);
    }),
    profileSubsystem('scoreCandidate + Curvature', 50000, () => {
      v2.scoreCandidate(candidatesSample[1], stateSample, { action: 'fight', enemyBal: 400 });
    }),
    profileSubsystem('MCTS Tactical Endgame Step', 2000, () => {
      v2.computeMCTSEndgameAction(stateSample, 20, 0.2);
    }),
    profileSubsystem('Naval Bellman Bridgehead', 20000, () => {
      v2.computeNavalBridgeheadPolicy([
        { id: 1, waterDist: 4, type: 'NEUTRAL', targetCapacity: 60 },
        { id: 2, waterDist: 8, type: 'ENEMY', enemyBal: 200, targetCapacity: 40 }
      ], stateSample);
    })
  ];

  console.log('Subsystem / Mathematical Kernel  | Latency (µs) | Throughput (ops/s) | Heap Delta | Real-Time Budget');
  console.log('------------------------------------------------------------------------------------------------------');

  results.sort((a, b) => a.microsPerOp - b.microsPerOp);

  for (const r of results) {
    const budgetPct = ((r.microsPerOp / 1000) * 100).toFixed(2);
    console.log(
      `${r.name.padEnd(32)} | ` +
      `${(r.microsPerOp + ' µs').padStart(12)} | ` +
      `${String(r.opsPerSec.toLocaleString()).padStart(18)} | ` +
      `${(r.heapDeltaKB + ' KB').padStart(10)} | ` +
      `${budgetPct.padStart(6)}% of 1ms`
    );
  }

  console.log('------------------------------------------------------------------------------------------------------\n');
  const totalMicroSec = results.reduce((s, r) => s + r.microsPerOp, 0);
  console.log(`Cumulative Frame Pipeline Latency: ${totalMicroSec.toFixed(3)} µs (${((totalMicroSec / 1000) * 100).toFixed(2)}% of 1.0 ms budget)`);
  console.log(`Idle Headroom Remaining: ${(100 - (totalMicroSec / 1000) * 100).toFixed(2)}%\n`);
}

if (require.main === module) {
  runProfiler();
}

module.exports = { runProfiler };
