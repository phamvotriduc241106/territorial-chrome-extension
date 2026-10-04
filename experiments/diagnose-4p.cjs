'use strict';
const path = require('path');
const fs = require('fs');
const { VeryHardBot, RigorousMatchSimulation } = require('./rigorous-simulator.cjs');
const candidateEngine = require('./engine-core-v2-6-candidate.js');
const baselineEngine = require('../experiments/legacy/engine-core.js');

const seedsValidation = JSON.parse(fs.readFileSync(path.join(__dirname, 'seeds-validation.json'), 'utf8'));

// Test matches for 4-player
const nPlayers = 4;
for (let m = 0; m < 3; m++) {
  const seed = seedsValidation[m * 10 + nPlayers];
  console.log(`\n======================================================`);
  console.log(`--- 4-PLAYER MATCH ${m} (Seed: ${seed}) ---`);
  console.log(`======================================================`);

  const candSim = new RigorousMatchSimulation({
    mapType: 'voronoi',
    width: 80,
    height: 40,
    seed,
    maxTicks: 250,
    defenderAdvantage: 1.30,
    logTrajectory: true
  });

  candSim.addPlayer(1, 'Candidate', candidateEngine, { isV2: true });
  for (let p = 2; p <= nPlayers; p++) {
    candSim.addPlayer(p, `VH-${p}`, new VeryHardBot(p, `VH-${p}`, seed + p * 31));
  }

  const candRes = candSim.run();
  console.log(`Winner: Player ${candRes.winner.id} (${candRes.winner.name})`);
  console.log(`Rankings:`);
  for (const r of candRes.rankings) {
    console.log(`  Rank ${r.rank}: Player ${r.id} (${r.name}) - Terr: ${r.territory}, Bal: ${r.balance}`);
  }

  const cand = candSim.players.find(p => p.id === 1);
  console.log(`\nCandidate Log (first 25 decisions):`);
  for (const log of cand.decisionsLog.slice(0, 25)) {
    console.log(`  Tick ${String(log.tick).padStart(3)} | Act: ${log.action.padEnd(6)} | Ratio: ${(log.ratio*100).toFixed(0)}% | Sent: ${String(log.sent).padStart(4)} | Target: ${log.targetId} | Terr: ${String(log.myTerr).padStart(4)} | Bal: ${String(log.myBal).padStart(5)} | Reason: ${log.reason}`);
  }

  console.log(`\nCandidate Log (last 10 decisions):`);
  for (const log of cand.decisionsLog.slice(-10)) {
    console.log(`  Tick ${String(log.tick).padStart(3)} | Act: ${log.action.padEnd(6)} | Ratio: ${(log.ratio*100).toFixed(0)}% | Sent: ${String(log.sent).padStart(4)} | Target: ${log.targetId} | Terr: ${String(log.myTerr).padStart(4)} | Bal: ${String(log.myBal).padStart(5)} | Reason: ${log.reason}`);
  }
}
