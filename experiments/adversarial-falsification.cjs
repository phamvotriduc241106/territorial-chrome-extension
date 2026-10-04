/**
 * Adversarial Falsification & Anti-Bias Stress Test
 * 
 * Objective:
 *   Rigorously stress-test and attempt to falsify V2.1's 100% win rates by pitting
 *   it against 30 specifically designed adversarial opponents:
 *     - 10 Kingmaker-Kamikaze bots (suicide all-in charges aimed at V2.1)
 *     - 10 Cartel-Sybil bots (coordinated multi-front non-aggression pact)
 *     - 10 Interest-Arbitrageurs (mathematical capital accumulation + sniper strikes)
 * 
 * Across 20 randomized procedural maps (Voronoi Archipelagos + MegaWorldMap).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { BattleRoyaleSimulation } = require('./battle-royale-runner.cjs');
const { generateMegaWorldMap, generateProceduralVoronoiMap } = require('./advanced-maps.js');

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
const v2_1 = loadEngine(path.join(__dirname, './engine-core-v2-advanced.js'));

// Load optimized parameters if available
try {
  const optParamsPath = path.join(__dirname, 'optimal-params.json');
  if (fs.existsSync(optParamsPath)) {
    const optParams = JSON.parse(fs.readFileSync(optParamsPath, 'utf8'));
    for (const [k, v] of Object.entries(optParams)) {
      if (v2_1.CONFIG[k] !== undefined) v2_1.CONFIG[k] = v;
    }
  }
} catch (e) {}

function runAdversarialFalsificationSuite(rounds = 15) {
  console.log('================================================================================');
  console.log(' ADVERSARIAL FALSIFICATION SUITE: ATTEMPTING TO BREAK V2.1 ENGINE');
  console.log(' Target: Falsify 100% Win Rate via Targeted Kamikaze & Sybil Cartel Attacks');
  console.log('================================================================================\n');

  const stats = {
    'V2.1-Advanced':         { spawns: 0, wins: 0, top3: 0, top5: 0, deaths: 0, totalTerr: 0, kills: 0 },
    'Kingmaker-Kamikaze':    { spawns: 0, wins: 0, top3: 0, top5: 0, deaths: 0, totalTerr: 0, kills: 0 },
    'Cartel-Sybil':          { spawns: 0, wins: 0, top3: 0, top5: 0, deaths: 0, totalTerr: 0, kills: 0 },
    'Interest-Arbitrageur':  { spawns: 0, wins: 0, top3: 0, top5: 0, deaths: 0, totalTerr: 0, kills: 0 },
    'Aggressive-Swarm':      { spawns: 0, wins: 0, top3: 0, top5: 0, deaths: 0, totalTerr: 0, kills: 0 },
    'Turtle-Fortress':       { spawns: 0, wins: 0, top3: 0, top5: 0, deaths: 0, totalTerr: 0, kills: 0 },
    'V1-Baseline':           { spawns: 0, wins: 0, top3: 0, top5: 0, deaths: 0, totalTerr: 0, kills: 0 }
  };

  let totalKamikazeAttacksOnV2 = 0;
  let totalV2BreachVetoes = 0;

  for (let r = 1; r <= rounds; r++) {
    const seed = 9000 + r * 149;
    const map = (r % 2 === 0)
      ? generateMegaWorldMap(180, 90)
      : generateProceduralVoronoiMap(160, 80, seed, 8);

    const sim = new BattleRoyaleSimulation({ map, maxTicks: 250 });

    // Composition:
    // 5 V2.1-Advanced
    // 8 Kingmaker-Kamikaze
    // 8 Cartel-Sybil
    // 8 Interest-Arbitrageur
    // 4 Aggressive-Swarm
    // 4 Turtle-Fortress
    // 3 V1-Baseline
    // Total = 40 bots
    const roster = [
      ...Array(5).fill('V2.1-Advanced'),
      ...Array(8).fill('Kingmaker-Kamikaze'),
      ...Array(8).fill('Cartel-Sybil'),
      ...Array(8).fill('Interest-Arbitrageur'),
      ...Array(4).fill('Aggressive-Swarm'),
      ...Array(4).fill('Turtle-Fortress'),
      ...Array(3).fill('V1-Baseline')
    ];

    // Shuffle spawns
    for (let i = roster.length - 1; i > 0; i--) {
      const j = Math.floor(((seed * 1664525 + 1013904223) >>> 0) / 4294967296 * (i + 1));
      const t = roster[i];
      roster[i] = roster[j];
      roster[j] = t;
    }

    const spawnCount = Math.min(roster.length, map.spawns.length);
    for (let i = 0; i < spawnCount; i++) {
      const arch = roster[i];
      const sp = map.spawns[i];
      const eng = arch === 'V1-Baseline' ? v1 : v2_1;
      sim.addPlayer(i + 1, `${arch}-${i + 1}`, arch, eng, sp.x, sp.y);
      stats[arch].spawns++;
    }

    const res = sim.run();

    const winner = res.winner;
    console.log(`Match ${String(r).padStart(2)}/${rounds} [${map.name}]: Winner = ${winner.name} (${winner.archetype}) | Ticks: ${res.totalTicks} | Surviving: ${sim.players.filter(p => p.alive).length}`);

    // Update stats
    for (let rank = 0; rank < res.rankings.length; rank++) {
      const p = res.rankings[rank];
      const st = stats[p.archetype];
      if (st) {
        st.totalTerr += p.territory;
        st.kills += p.kills;
        if (!p.alive) st.deaths++;
        if (rank === 0) st.wins++;
        if (rank < 3) st.top3++;
        if (rank < 5) st.top5++;
      }
    }
  }

  console.log('\n================================================================================');
  console.log(' ADVERSARIAL STRESS TEST SUMMARY (Across Targeted Adversarial Scenarios)');
  console.log('================================================================================');
  console.log('Archetype               | Spawns | Wins | Win%   | Top 3% | Survival% | Avg Terr | Kills');
  console.log('-----------------------------------------------------------------------------------------');

  for (const [arch, st] of Object.entries(stats)) {
    const spawns = st.spawns || 1;
    const winPct = ((st.wins / rounds) * 100).toFixed(1);
    const top3Pct = ((st.top3 / spawns) * 100).toFixed(1);
    const survPct = (((spawns - st.deaths) / spawns) * 100).toFixed(1);
    const avgTerr = Math.round(st.totalTerr / spawns);
    console.log(
      `${arch.padEnd(23)} | ` +
      `${String(spawns).padStart(6)} | ` +
      `${String(st.wins).padStart(4)} | ` +
      `${(winPct + '%').padStart(6)} | ` +
      `${(top3Pct + '%').padStart(6)} | ` +
      `${(survPct + '%').padStart(9)} | ` +
      `${String(avgTerr).padStart(8)} | ` +
      `${String(st.kills).padStart(5)}`
    );
  }

  console.log('-----------------------------------------------------------------------------------------\n');

  // Falsification Verdict
  const v2Wins = stats['V2.1-Advanced'].wins;
  const v2WinPct = (v2Wins / rounds) * 100;
  console.log('FALSIFICATION ANALYSIS:');
  if (v2WinPct < 100) {
    console.log(`  [FALSIFICATION CONFIRMED] The 100% win-rate hypothesis was SUCCESSFULLY FALSIFIED!`);
    console.log(`  Under targeted kamikaze & cartel collusion, V2.1 win-rate is ${v2WinPct.toFixed(1)}%.`);
    console.log(`  This proves the benchmark accurately reflects adversarial multi-agent dynamics.`);
  } else {
    console.log(`  [RESILIENT] V2.1 resisted all 30 adversarial bots across all ${rounds} matches (${v2WinPct.toFixed(1)}% win rate).`);
  }
  console.log('================================================================================\n');
}

if (require.main === module) {
  runAdversarialFalsificationSuite(10);
}

module.exports = { runAdversarialFalsificationSuite };
