/**
 * Independent Benchmark Reproducer for Audit
 * Tests the SHIPPED engine (content/engine-core-v2-advanced.js)
 * and the unshipped candidate (experiments/legacy/engine-core.js) on seeds-final-test.json
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');
const { VeryHardBot, RigorousMatchSimulation, loadEngine } = require('../experiments/rigorous-simulator.cjs');

const shippedEngine = loadEngine(path.join(__dirname, '../content/engine-core-v2-advanced.js'));
const unshippedEngine = loadEngine(path.join(__dirname, '../experiments/legacy/engine-core.js'));

const testSeeds = JSON.parse(fs.readFileSync(path.join(__dirname, '../experiments/seeds-final-test.json'), 'utf8'));

function runHoldoutAudit(engine, engineName, matchCount = 50) {
  console.log(`\n================================================================================`);
  console.log(` AUDIT BENCHMARK: [${engineName}] across ${matchCount} matches from seeds-final-test.json`);
  console.log(`================================================================================`);

  const mapTypes = ['voronoi', 'europe', 'world', 'archipelago'];
  const playerCounts = [2, 3, 4, 6, 10];
  const size = { w: 80, h: 40 };

  let wins = 0;
  let landWins = 0;
  let landMatches = 0;
  const latencies = [];
  const mapStats = {};

  for (let m = 0; m < matchCount; m++) {
    const seed = testSeeds[m];
    const mapType = mapTypes[m % mapTypes.length];
    const nPlayers = playerCounts[m % playerCounts.length];
    const isLand = mapType === 'europe' || mapType === 'voronoi';

    if (!mapStats[mapType]) mapStats[mapType] = { wins: 0, total: 0 };
    mapStats[mapType].total++;
    if (isLand) landMatches++;

    const sim = new RigorousMatchSimulation({
      mapType,
      width: size.w,
      height: size.h,
      seed,
      maxTicks: 250,
      defenderAdvantage: 1.30,
      fogOfWar: false
    });

    sim.addPlayer(1, engineName, engine, { isV2: true });
    for (let p = 2; p <= nPlayers; p++) {
      sim.addPlayer(p, `VH-${p}`, new VeryHardBot(p, `VH-${p}`, seed + p * 31));
    }

    const t0 = performance.now();
    const res = sim.run();
    const t1 = performance.now();

    const cand = sim.players.find(p => p.id === 1);
    if (cand && cand.decisionsLog && cand.decisionsLog.length > 0) {
      // Estimate decision latency per tick
      const decTimeUs = ((t1 - t0) * 1000) / cand.decisionsLog.length;
      latencies.push(decTimeUs);
    }

    if (res.winner.id === 1) {
      wins++;
      mapStats[mapType].wins++;
      if (isLand) landWins++;
    }
  }

  latencies.sort((a, b) => a - b);
  const medianLat = latencies.length ? latencies[Math.floor(latencies.length * 0.5)].toFixed(2) : 'N/A';
  const p95Lat = latencies.length ? latencies[Math.floor(latencies.length * 0.95)].toFixed(2) : 'N/A';

  const overallWR = ((wins / matchCount) * 100).toFixed(1);
  const landWR = landMatches ? ((landWins / landMatches) * 100).toFixed(1) : 'N/A';

  console.log(`Results for ${engineName}:`);
  console.log(`  Overall Wins:     ${wins} / ${matchCount} (${overallWR}%)`);
  console.log(`  Connected Land:   ${landWins} / ${landMatches} (${landWR}%)`);
  console.log(`  Decision Latency: Median ${medianLat} µs/tick, p95 ${p95Lat} µs/tick (simulation step latency)`);
  console.log(`  Map Breakdown:`);
  for (const [map, st] of Object.entries(mapStats)) {
    console.log(`    - ${map.padEnd(12)}: ${st.wins} / ${st.total} (${((st.wins/st.total)*100).toFixed(1)}%)`);
  }

  return { engineName, matchCount, wins, overallWR, landWins, landMatches, landWR, mapStats };
}

// 1. Benchmark the Shipped Engine (content/engine-core-v2-advanced.js)
const shippedRes = runHoldoutAudit(shippedEngine, 'SHIPPED: engine-core-v2-advanced.js', 60);

// 2. Benchmark the Unshipped Engine (experiments/legacy/engine-core.js)
const unshippedRes = runHoldoutAudit(unshippedEngine, 'UNSHIPPED: experiments/legacy/engine-core.js', 60);
