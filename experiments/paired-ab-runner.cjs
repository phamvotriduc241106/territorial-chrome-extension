/**
 * Rigorous Paired A/B Testing Harness
 * ===================================
 * Evaluates Candidate vs Baseline on IDENTICAL seeds.
 * Computes:
 *   - Win-rate delta (Candidate - Baseline)
 *   - McNemar's paired test statistic & p-value
 *   - Wilson 95% Confidence Interval for both
 *   - Average Rank Delta
 *   - Territory Share Delta
 *   - Median & p95 Decision Latency
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');
const { VeryHardBot, RigorousMatchSimulation } = require('./rigorous-simulator.cjs');

function computeWilsonCI(wins, total, z = 1.96) {
  if (total === 0) return { lower: 0, upper: 0 };
  const p = wins / total;
  const denominator = 1 + (z * z) / total;
  const center = p + (z * z) / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total));
  return {
    lower: Math.max(0, (center - margin) / denominator),
    upper: Math.min(1, (center + margin) / denominator)
  };
}

function computeMcNemar(b, c) {
  // b: baseline won, candidate lost
  // c: baseline lost, candidate won
  const n = b + c;
  if (n === 0) return { chi2: 0, pValue: 1.0 };
  const diff = Math.abs(b - c);
  const chi2 = Math.pow(Math.max(0, diff - 1), 2) / n;
  // Approximation for p-value with 1 degree of freedom: 1 - erf(sqrt(chi2 / 2))
  const pValue = Math.exp(-0.5 * chi2) * Math.sqrt(2 / Math.PI) / Math.max(1e-4, Math.sqrt(chi2));
  return { chi2: parseFloat(chi2.toFixed(3)), pValue: Math.min(1.0, parseFloat(pValue.toFixed(4))) };
}

function runPairedABTest(candidateEngine, baselineEngine, candidateName = 'Candidate', baselineName = 'Baseline', options = {}) {
  const seedSplit = options.split || 'validation';
  const seedsFile = path.join(__dirname, `seeds-${seedSplit}.json`);
  const allSeeds = JSON.parse(fs.readFileSync(seedsFile, 'utf8'));
  const maxMatches = options.maxMatches ? Math.min(options.maxMatches, allSeeds.length) : allSeeds.length;
  const seeds = allSeeds.slice(0, maxMatches);

  const mapTypes = ['voronoi', 'europe', 'world', 'archipelago'];
  const mapSizes = [
    { w: 80, h: 40 },
    { w: 100, h: 50 },
    { w: 120, h: 60 }
  ];
  const playerCounts = options.playerCounts || [2, 3, 4, 6, 10];

  console.log('================================================================================');
  console.log(` PAIRED A/B BENCHMARK: [${candidateName}] vs [${baselineName}]`);
  console.log(` Dataset Split: ${seedSplit.toUpperCase()} (${seeds.length} identical seeds)`);
  console.log('================================================================================\n');

  let candWins = 0;
  let baseWins = 0;
  let b = 0; // Baseline won, Candidate lost
  let c = 0; // Candidate won, Baseline lost

  const candRanks = [];
  const baseRanks = [];
  const candShares = [];
  const baseShares = [];
  const candLatencies = [];

  const startTime = Date.now();

  for (let i = 0; i < seeds.length; i++) {
    const seed = seeds[i];
    const mapType = mapTypes[i % mapTypes.length];
    const size = mapSizes[i % mapSizes.length];
    const numPlayers = playerCounts[i % playerCounts.length];

    // 1. Run Baseline Match
    const baseSim = new RigorousMatchSimulation({
      mapType,
      width: size.w,
      height: size.h,
      seed,
      maxTicks: 250,
      defenderAdvantage: 1.30,
      fogOfWar: false
    });
    baseSim.addPlayer(1, baselineName, baselineEngine, { isV2: true });
    for (let p = 2; p <= numPlayers; p++) {
      baseSim.addPlayer(p, `VH-${p}`, new VeryHardBot(p, `VH-${p}`, seed + p * 31));
    }
    const baseRes = baseSim.run();
    const baseRank = baseRes.rankings.findIndex(p => p.id === 1) + 1;
    const basePlayer = baseSim.players.find(p => p.id === 1);
    const baseTotTerr = baseRes.rankings.reduce((s, p) => s + p.territory, 0);
    const baseShare = baseTotTerr > 0 ? (basePlayer.territory / baseTotTerr) : 0;
    const baseIsWin = baseRes.winner.id === 1;

    // 2. Run Candidate Match (IDENTICAL seed, map, and opponents)
    const candSim = new RigorousMatchSimulation({
      mapType,
      width: size.w,
      height: size.h,
      seed,
      maxTicks: 250,
      defenderAdvantage: 1.30,
      fogOfWar: false
    });

    // Instrument latency
    const instrumentedCand = Object.create(candidateEngine);
    instrumentedCand.decide = function(S) {
      const t0 = performance.now();
      const res = candidateEngine.decide(S);
      const dt = (performance.now() - t0) * 1000; // µs
      candLatencies.push(dt);
      return res;
    };

    candSim.addPlayer(1, candidateName, instrumentedCand, { isV2: true });
    for (let p = 2; p <= numPlayers; p++) {
      candSim.addPlayer(p, `VH-${p}`, new VeryHardBot(p, `VH-${p}`, seed + p * 31));
    }
    const candRes = candSim.run();
    const candRank = candRes.rankings.findIndex(p => p.id === 1) + 1;
    const candPlayer = candSim.players.find(p => p.id === 1);
    const candTotTerr = candRes.rankings.reduce((s, p) => s + p.territory, 0);
    const candShare = candTotTerr > 0 ? (candPlayer.territory / candTotTerr) : 0;
    const candIsWin = candRes.winner.id === 1;

    if (candIsWin) candWins++;
    if (baseIsWin) baseWins++;

    if (baseIsWin && !candIsWin) b++;
    if (candIsWin && !baseIsWin) c++;

    candRanks.push(candRank);
    baseRanks.push(baseRank);
    candShares.push(candShare);
    baseShares.push(baseShare);

    if ((i + 1) % 50 === 0 || i === seeds.length - 1) {
      console.log(`  [${String(i + 1).padStart(3)} / ${seeds.length}] Candidate: ${candWins} wins (${((candWins/(i+1))*100).toFixed(1)}%) | Baseline: ${baseWins} wins (${((baseWins/(i+1))*100).toFixed(1)}%)`);
    }
  }

  const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(2);
  const N = seeds.length;
  const candWinRate = (candWins / N) * 100;
  const baseWinRate = (baseWins / N) * 100;
  const deltaWinRate = candWinRate - baseWinRate;

  const candCI = computeWilsonCI(candWins, N);
  const baseCI = computeWilsonCI(baseWins, N);
  const mcNemar = computeMcNemar(b, c);

  const avgCandRank = (candRanks.reduce((s, r) => s + r, 0) / N).toFixed(2);
  const avgBaseRank = (baseRanks.reduce((s, r) => s + r, 0) / N).toFixed(2);

  const avgCandShare = ((candShares.reduce((s, sh) => s + sh, 0) / N) * 100).toFixed(1);
  const avgBaseShare = ((baseShares.reduce((s, sh) => s + sh, 0) / N) * 100).toFixed(1);

  // Latency calculation
  candLatencies.sort((x, y) => x - y);
  const medLat = candLatencies.length > 0 ? candLatencies[Math.floor(candLatencies.length * 0.5)].toFixed(2) : '0';
  const p95Lat = candLatencies.length > 0 ? candLatencies[Math.floor(candLatencies.length * 0.95)].toFixed(2) : '0';

  console.log('\n================================================================================');
  console.log(' PAIRED A/B STATISTICAL SUMMARY');
  console.log('================================================================================');
  console.log(`Total Paired Matches:     ${N} in ${elapsedSec}s`);
  console.log(`Candidate Win Rate:       ${candWins} / ${N} (${candWinRate.toFixed(2)}%) [95% CI: ${(candCI.lower * 100).toFixed(1)}% - ${(candCI.upper * 100).toFixed(1)}%]`);
  console.log(`Baseline Win Rate:        ${baseWins} / ${N} (${baseWinRate.toFixed(2)}%) [95% CI: ${(baseCI.lower * 100).toFixed(1)}% - ${(baseCI.upper * 100).toFixed(1)}%]`);
  console.log(`Win-Rate Delta:           ${deltaWinRate >= 0 ? '+' : ''}${deltaWinRate.toFixed(2)}%`);
  console.log(`McNemar Paired Test:      b=${b} (Base won/Cand lost), c=${c} (Cand won/Base lost) | Chi2: ${mcNemar.chi2}, p-val: ${mcNemar.pValue}`);
  console.log(`Average Rank:             Candidate: ${avgCandRank} | Baseline: ${avgBaseRank} (Delta: ${(avgCandRank - avgBaseRank).toFixed(2)})`);
  console.log(`Average Territory Share:  Candidate: ${avgCandShare}% | Baseline: ${avgBaseShare}%`);
  console.log(`Candidate Decision Time:  Median: ${medLat} µs | p95: ${p95Lat} µs`);
  console.log('================================================================================\n');

  return {
    N,
    candWinRate,
    baseWinRate,
    deltaWinRate,
    candCI,
    baseCI,
    mcNemar,
    avgCandRank,
    avgBaseRank,
    avgCandShare,
    avgBaseShare,
    medLat: parseFloat(medLat),
    p95Lat: parseFloat(p95Lat),
    accepted: deltaWinRate > 0 && mcNemar.pValue <= 0.05
  };
}

module.exports = { runPairedABTest, computeWilsonCI, computeMcNemar };
