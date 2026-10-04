/**
 * Direct Micro-benchmark for Decision Latency
 * Measures the exact call latency of decide() and planSpend()
 */
'use strict';

const path = require('path');
const { performance } = require('perf_hooks');
const { loadEngine } = require('../experiments/rigorous-simulator.cjs');

const shipped = loadEngine(path.join(__dirname, '../content/engine-core-v2-advanced.js'));
const unshipped = loadEngine(path.join(__dirname, '../experiments/legacy/engine-core.js'));

const testSituation = {
  balance: 1500,
  balanceKnown: true,
  territory: 120,
  softCap: 12000,
  freeLandRatio: 0.05,
  hasAdjFree: true,
  adjEnemies: [
    { id: 2, bal: 400, terr: 80, crushable: false },
    { id: 3, bal: 2500, terr: 200, crushable: false }
  ],
  perimeterNeutral: 1,
  perimeterEnemy: 2,
  totalEnemyTerr: 280,
  globalRank: 2,
  leaderTerritory: 200,
  areaTrend: 0,
  shrinkFrames: 0,
  tick: 45,
  strategy: 'aggressive'
};

function benchmarkLatency(engine, name, iterations = 100000) {
  // Warmup
  for (let i = 0; i < 5000; i++) {
    engine.decide(testSituation);
    engine.planSpend(testSituation);
  }

  const timesDecide = [];
  const timesPlan = [];

  const t0 = performance.now();
  for (let i = 0; i < iterations; i++) {
    engine.decide(testSituation);
  }
  const t1 = performance.now();
  for (let i = 0; i < iterations; i++) {
    engine.planSpend(testSituation);
  }
  const t2 = performance.now();

  const decideUs = ((t1 - t0) * 1000) / iterations;
  const planUs = ((t2 - t1) * 1000) / iterations;
  const totalUs = decideUs + planUs;

  console.log(`Latency for ${name} (${iterations} iterations):`);
  console.log(`  decide():    ${decideUs.toFixed(3)} µs`);
  console.log(`  planSpend(): ${planUs.toFixed(3)} µs`);
  console.log(`  Total:       ${totalUs.toFixed(3)} µs`);

  return { decideUs, planUs, totalUs };
}

console.log('=== BENCHMARKING DECISION LATENCY ===');
benchmarkLatency(shipped, 'SHIPPED: engine-core-v2-advanced.js');
benchmarkLatency(unshipped, 'UNSHIPPED: experiments/legacy/engine-core.js');
