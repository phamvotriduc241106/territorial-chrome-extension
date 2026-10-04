'use strict';
const path = require('path');
const fs = require('fs');
const { VeryHardBot, RigorousMatchSimulation } = require('./rigorous-simulator.cjs');
const candidateEngine = require('./engine-core-v2-6-candidate.js');
const baselineEngine = require('../experiments/legacy/engine-core.js');

const seedsValidation = JSON.parse(fs.readFileSync(path.join(__dirname, 'seeds-validation.json'), 'utf8'));

const playerCounts = [2, 3, 4, 6, 10];
const matchesPerCount = 10;
const mapTypes = ['voronoi', 'europe', 'world', 'archipelago'];

console.log('=== LOBBY BREAKDOWN: CANDIDATE VS BASELINE ===');

for (const nPlayers of playerCounts) {
  let candWins = 0;
  let baseWins = 0;
  let totalCandRank = 0;
  let totalBaseRank = 0;

  for (let m = 0; m < matchesPerCount; m++) {
    const seed = seedsValidation[m * 10 + nPlayers];
    const mapType = mapTypes[m % mapTypes.length];
    const width = 80;
    const height = 40;

    // Run Baseline
    const baseSim = new RigorousMatchSimulation({ mapType, width, height, seed, maxTicks: 250, defenderAdvantage: 1.30 });
    baseSim.addPlayer(1, 'Baseline', baselineEngine, { isV2: true });
    for (let p = 2; p <= nPlayers; p++) {
      baseSim.addPlayer(p, `VH-${p}`, new VeryHardBot(p, `VH-${p}`, seed + p * 31));
    }
    const baseRes = baseSim.run();
    if (baseRes.winner.id === 1) baseWins++;
    const bRank = baseRes.rankings.findIndex(p => p.id === 1) + 1;
    totalBaseRank += bRank;

    // Run Candidate
    const candSim = new RigorousMatchSimulation({ mapType, width, height, seed, maxTicks: 250, defenderAdvantage: 1.30 });
    candSim.addPlayer(1, 'Candidate', candidateEngine, { isV2: true });
    for (let p = 2; p <= nPlayers; p++) {
      candSim.addPlayer(p, `VH-${p}`, new VeryHardBot(p, `VH-${p}`, seed + p * 31));
    }
    const candRes = candSim.run();
    if (candRes.winner.id === 1) candWins++;
    const cRank = candRes.rankings.findIndex(p => p.id === 1) + 1;
    totalCandRank += cRank;
  }

  console.log(`Lobby ${String(nPlayers).padStart(2)}p: Cand Wins: ${candWins}/${matchesPerCount} (${((candWins/matchesPerCount)*100).toFixed(0)}%, avg rank ${(totalCandRank/matchesPerCount).toFixed(2)}) | Base Wins: ${baseWins}/${matchesPerCount} (${((baseWins/matchesPerCount)*100).toFixed(0)}%, avg rank ${(totalBaseRank/matchesPerCount).toFixed(2)})`);
}
