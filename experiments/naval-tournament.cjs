/**
 * Archipelago & Straits Naval Bellman Tournament Harness
 * Specifically benchmarks Module 13 (Bellman Dynamic Bridgehead Policy)
 * across multi-island maritime geography requiring naval troop embarkation.
 *
 * Contenders:
 *   1. V2.2-Naval-Bellman: Dynamic Programming Bellman value iteration, optimal commit u*(s), transit discounting.
 *   2. V2.1-Voronoi-Landing: Voronoi spatial isolation ranking, fixed 22% commit.
 *   3. V1-Baseline: Blind 22% commit, no spatial or transit optimization.
 *   4. Bot-Turtle-Swarm: Baseline bot behavior.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { generateArchipelagoMap } = require('./advanced-maps.js');
const { SpatialMapMatch } = require('./match-visualizer.cjs');

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

const v1 = loadEngine(path.join(__dirname, '../content/engine-core-v1.js'));
const v2_bellman = loadEngine(path.join(__dirname, './engine-core-v2-advanced.js'));
v2_bellman.CONFIG.enableNavalBellman = true;

const v2_voronoi = loadEngine(path.join(__dirname, './engine-core-v2-advanced.js'));
v2_voronoi.CONFIG.enableNavalBellman = false; // Ablates Bellman, falls back to Voronoi

function runNavalMatch(round, maxTicks = 320) {
  const map = generateArchipelagoMap(80, 40);
  const match = new SpatialMapMatch({ customMap: map, maxTicks });

  // Rotate spawn positions each round to eliminate geographic spawn bias
  const contenders = [
    { name: 'V2.2-Naval-Bellman', engine: v2_bellman, color: '\x1b[32m' },
    { name: 'V2.1-Voronoi-Landing', engine: v2_voronoi, color: '\x1b[36m' },
    { name: 'V1-Baseline-Naive', engine: v1, color: '\x1b[31m' },
    { name: 'Bot-Turtle-Swarm', engine: v1, color: '\x1b[33m' }
  ];

  for (let i = 0; i < 4; i++) {
    const cIdx = (i + round) % 4;
    const c = contenders[cIdx];
    const sp = map.spawns[i];
    match.addPlayer(i + 1, c.name, c.engine, sp.x, sp.y, c.color);
  }

  const res = match.run(true);
  return res;
}

async function runNavalTournament(numRounds = 20) {
  console.log('================================================================================');
  console.log(` ARCHIPELAGO & STRAITS NAVAL BELLMAN TOURNAMENT (${numRounds} Rounds)`);
  console.log(' Evaluating Module 13 Bellman Dynamic Bridgehead Policy vs Baselines');
  console.log('================================================================================\n');

  const stats = {
    'V2.2-Naval-Bellman': { wins: 0, totalTerr: 0, totalBal: 0, navalOps: 0, top2: 0 },
    'V2.1-Voronoi-Landing': { wins: 0, totalTerr: 0, totalBal: 0, navalOps: 0, top2: 0 },
    'V1-Baseline-Naive': { wins: 0, totalTerr: 0, totalBal: 0, navalOps: 0, top2: 0 },
    'Bot-Turtle-Swarm': { wins: 0, totalTerr: 0, totalBal: 0, navalOps: 0, top2: 0 }
  };

  for (let r = 0; r < numRounds; r++) {
    const res = runNavalMatch(r, 320);
    const winner = res.winner;
    if (stats[winner.name]) {
      stats[winner.name].wins++;
    }

    for (let rank = 0; rank < res.rankings.length; rank++) {
      const p = res.rankings[rank];
      if (stats[p.name]) {
        stats[p.name].totalTerr += p.territory;
        stats[p.name].totalBal += p.balance;
        stats[p.name].navalOps += (p.navalLandings || 0);
        if (rank < 2) stats[p.name].top2++;
      }
    }
  }

  console.log('Engine Variant          | Wins | Win Rate | Top-2 Finishes | Avg Territory | Total Landings');
  console.log('-----------------------------------------------------------------------------------------');
  const sortedNames = Object.keys(stats).sort((a, b) => stats[b].wins - stats[a].wins || stats[b].totalTerr - stats[a].totalTerr);

  for (const name of sortedNames) {
    const s = stats[name];
    const winRate = ((s.wins / numRounds) * 100).toFixed(1) + '%';
    const top2Rate = ((s.top2 / numRounds) * 100).toFixed(1) + '%';
    const avgTerr = (s.totalTerr / numRounds).toFixed(1) + ' px';

    console.log(
      `${name.padEnd(23)} | ` +
      `${String(s.wins).padStart(4)} | ` +
      `${winRate.padStart(8)} | ` +
      `${top2Rate.padStart(14)} | ` +
      `${avgTerr.padStart(13)} | ` +
      `${String(s.navalOps).padStart(14)}`
    );
  }
  console.log('-----------------------------------------------------------------------------------------\n');
}

if (require.main === module) {
  runNavalTournament(20);
}

module.exports = { runNavalTournament };
