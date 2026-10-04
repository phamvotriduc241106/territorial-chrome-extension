/** Paired policy ablation in the approximate simulator, not the official game. */
'use strict';
const path = require('node:path');
const { loadEngine, VeryHardBot, RigorousMatchSimulation } = require('./rigorous-simulator.cjs');
const file = path.join(__dirname, '../content/engine-core-v2-advanced.js');
const count = Number(process.argv[2] || 400);
const seedStart = Number(process.argv[3] || 1700000);
if (!Number.isInteger(count) || count < 1 || count > 5000 || !Number.isSafeInteger(seedStart))
  throw Error('Usage: node hard-mode-policy-benchmark.cjs [matches 1..5000] [seedStart]');
const baseline = loadEngine(file), candidate = loadEngine(file);
baseline.CONFIG.enableHardModePolicy = false;
const totals = { baseline: { wins: 0, rank: 0, survivors: 0 }, candidate: { wins: 0, rank: 0, survivors: 0 } };
let gained = 0, lost = 0;
const categories = {};
for (let m = 0; m < count; m++) {
  const seed = seedStart + m * 7919;
  const mapType = ['voronoi', 'europe', 'world', 'archipelago'][m % 4];
  const players = [2, 3, 4, 6, 10][m % 5];
  const [width, height] = [[80, 40], [100, 50], [120, 60]][m % 3];
  const won = {};
  for (const [name, engine] of [['baseline', baseline], ['candidate', candidate]]) {
    const sim = new RigorousMatchSimulation({ mapType, width, height, seed,
      maxTicks: 250, defenderAdvantage: 1.30, fogOfWar: false });
    sim.addPlayer(1, name, engine, { isV2: true });
    for (let p = 2; p <= players; p++) sim.addPlayer(p, 'VH-' + p,
      new VeryHardBot(p, 'VH-' + p, seed + p * 31));
    const result = sim.run();
    won[name] = result.winner.id === 1;
    totals[name].wins += Number(won[name]);
    totals[name].rank += result.rankings.findIndex(p => p.id === 1) + 1;
    totals[name].survivors += Number(sim.players.find(p => p.id === 1).alive);
  }
  gained += Number(won.candidate && !won.baseline);
  lost += Number(won.baseline && !won.candidate);
  const key = players + 'p';
  const group = categories[key] || (categories[key] = { matches: 0, baseline: 0, candidate: 0 });
  group.matches++; group.baseline += Number(won.baseline); group.candidate += Number(won.candidate);
}
function wilson(wins) {
  const p = wins / count, z2 = 1.96 ** 2, denom = 1 + z2 / count;
  const center = p + z2 / (2 * count);
  const margin = 1.96 * Math.sqrt(p * (1 - p) / count + z2 / (4 * count ** 2));
  return [100 * (center - margin) / denom, 100 * (center + margin) / denom].map(x => +x.toFixed(2));
}
const summary = {};
for (const [name, t] of Object.entries(totals)) summary[name] = { wins: t.wins,
  winRatePct: 100 * t.wins / count, wilson95Pct: wilson(t.wins),
  avgRank: +(t.rank / count).toFixed(3), survivalPct: 100 * t.survivors / count };
console.log(JSON.stringify({ evidence: 'Approximate simulator; real Hard-mode win rate unmeasured',
  matchesPerPolicy: count, seedStart, summary, pairedGains: gained, pairedLosses: lost, categories }, null, 2));
