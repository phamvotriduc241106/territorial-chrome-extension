/** Release-to-release paired diagnostic. NOT an official-game win-rate test. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const vm = require('node:vm');
const { environment } = require('../tools/cpu-benchmark.cjs');
const { VeryHardBot, RigorousMatchSimulation } = require('./rigorous-simulator.cjs');
const root = path.resolve(__dirname, '..'), file = 'content/engine-core-v2-advanced.js';
const baselineCommit = '188b1bf';
const baselineSource = cp.execFileSync('git', ['show', baselineCommit + ':' + file], { cwd: root, encoding: 'utf8' });
const candidateSource = fs.readFileSync(path.join(root, file), 'utf8');
const count = Number(process.argv[2] || 200), seedStart = Number(process.argv[3] || 3100000);
if (!Number.isInteger(count) || count < 1 || count > 5000 || !Number.isSafeInteger(seedStart))
  throw Error('Usage: node planning-model-benchmark.cjs [matches 1..5000] [seedStart]');
const stats = { baseline: { wins: 0, rank: 0, survivors: 0 }, candidate: { wins: 0, rank: 0, survivors: 0 } };
let gains = 0, losses = 0;
for (let m = 0; m < count; m++) {
  const seed = seedStart + m * 7919, players = [2, 3, 4, 6, 10][m % 5];
  const mapType = ['voronoi', 'europe', 'world', 'archipelago'][m % 4];
  const [width, height] = [[80, 40], [100, 50], [120, 60]][m % 3];
  const wins = {};
  for (const [name, source] of [['baseline', baselineSource], ['candidate', candidateSource]]) {
    const box = environment(); box.performance = { now: () => 0 }; // Equal fixed work; no scheduler bias.
    vm.runInContext(source, box); const core = box.TIOEngineCore;
    const sim = new RigorousMatchSimulation({ mapType, width, height, seed, maxTicks: 250,
      defenderAdvantage: 1.30, fogOfWar: false });
    const engine = { ...core, decide(state) {
      const alive = sim.players.filter(p => p.alive && p.territory > 0);
      const rivals = alive.filter(p => p.id !== 1);
      const leader = alive.reduce((best, p) => !best || p.territory > best.territory ? p : best, null);
      return core.decide({ ...state, tick: sim.tick, freeLandCells: sim.neutralLand,
        playersRemaining: alive.length, totalEnemyTerr: rivals.reduce((sum, p) => sum + p.territory, 0),
        totalEnemyBalance: rivals.reduce((sum, p) => sum + p.balance, 0),
        leaderId: leader && leader.id, leaderTerritory: leader && leader.territory });
    } };
    sim.addPlayer(1, name, engine, { isV2: true });
    for (let p = 2; p <= players; p++) sim.addPlayer(p, 'VH-' + p, new VeryHardBot(p, 'VH-' + p, seed + p * 31));
    const result = sim.run(); wins[name] = result.winner.id === 1;
    stats[name].wins += Number(wins[name]); stats[name].rank += result.rankings.findIndex(p => p.id === 1) + 1;
    stats[name].survivors += Number(sim.players.find(p => p.id === 1).alive);
  }
  gains += Number(wins.candidate && !wins.baseline); losses += Number(wins.baseline && !wins.candidate);
}
const summary = {};
for (const [name, s] of Object.entries(stats)) summary[name] = { wins: s.wins, matches: count,
  winRatePct: 100 * s.wins / count, averageRank: s.rank / count, survivalPct: 100 * s.survivors / count };
console.log(JSON.stringify({ evidence: 'Approximate simulator, NOT official gameplay. Planning now models native economics, which differ from this simulator.',
  baselineCommit, candidateSha256: require('node:crypto').createHash('sha256').update(candidateSource).digest('hex'),
  seedStart, pairedGains: gains, pairedLosses: losses, summary }, null, 2));
