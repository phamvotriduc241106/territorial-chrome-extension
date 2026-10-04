/**
 * Elo Rating Tournament & Multi-Generation Policy Evaluator
 * 
 * Conducts round-robin multi-agent matches to establish formal Elo ratings (K=32)
 * across 6 distinct evolutionary milestones of the Territorial.io Engine:
 *   1. V1-Classic (Original single-decision empirical heuristic)
 *   2. V2.0-PMP-Only (Pontryagin Minimum Principle singular arc)
 *   3. V2.1-Spectral-Poisson (PMP + Spectral Laplacian + Poisson Streams + KKT)
 *   4. V2.1-Evolved (Evolutionary-optimized parameters: alpha=0.137, beta=19.95)
 *   5. V2.2-Bayesian-Curvature (All above + Real-Time Bayesian Classifier + Curvature Flow)
 *   6. V2.2-Citadel-Hardened (All above + Anti-Kamikaze Citadel Defense)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { BattleRoyaleSimulation } = require('./battle-royale-runner.cjs');
const { generateProceduralVoronoiMap, generateMegaWorldMap } = require('./advanced-maps.js');

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

function createVariantEngine(variantName) {
  const eng = loadEngine(path.join(__dirname, '../content/engine-core-v2-advanced.js'));

  if (variantName === 'V2.0-PMP-Only') {
    eng.CONFIG.enableSpectral = false;
    eng.CONFIG.enablePoisson = false;
    eng.CONFIG.enableEikonal = false;
    eng.CONFIG.enableCoalition = false;
    eng.CONFIG.enableSDE = false;
    eng.CONFIG.enableMCTS = false;
    eng.CONFIG.enableBayesianArchetype = false;
    eng.CONFIG.enableCurvatureFlow = false;
  } else if (variantName === 'V2.1-Spectral-Poisson') {
    eng.CONFIG.enableSDE = false;
    eng.CONFIG.enableMCTS = false;
    eng.CONFIG.enableBayesianArchetype = false;
    eng.CONFIG.enableCurvatureFlow = false;
  } else if (variantName === 'V2.1-Evolved') {
    eng.CONFIG.enableBayesianArchetype = false;
    eng.CONFIG.enableCurvatureFlow = false;
    // Apply evolved parameters
    eng.CONFIG.alphaPMP = 0.1371;
    eng.CONFIG.betaCheeger = 19.95;
    eng.CONFIG.gammaLanchester = 0.8069;
    eng.CONFIG.sigmaSDE = 0.5765;
    eng.CONFIG.cMCTS = 2.1096;
    eng.CONFIG.dHold = 0.9121;
  } else if (variantName === 'V2.2-Bayesian-Curvature') {
    eng.CONFIG.enableBayesianArchetype = true;
    eng.CONFIG.enableCurvatureFlow = true;
  } else if (variantName === 'V2.2-Citadel-Hardened') {
    eng.CONFIG.enableBayesianArchetype = true;
    eng.CONFIG.enableCurvatureFlow = true;
    eng.CONFIG.enableSDE = true;
    eng.CONFIG.enableMCTS = true;
    eng.CONFIG.enableCoalition = true;
    eng.CONFIG.enableNavalBellman = false;
  } else if (variantName === 'V2.2-Naval-Bellman') {
    eng.CONFIG.enableBayesianArchetype = true;
    eng.CONFIG.enableCurvatureFlow = true;
    eng.CONFIG.enableSDE = true;
    eng.CONFIG.enableMCTS = true;
    eng.CONFIG.enableCoalition = true;
    eng.CONFIG.enableNavalBellman = true;
  }
  return eng;
}

const COMPETITORS = [
  { name: 'V1-Classic',              engine: v1, desc: 'Original Heuristic' },
  { name: 'V2.0-PMP-Only',           engine: createVariantEngine('V2.0-PMP-Only'), desc: 'Singular Arc Only' },
  { name: 'V2.1-Spectral-Poisson',   engine: createVariantEngine('V2.1-Spectral-Poisson'), desc: 'Spectral+PDE+KKT' },
  { name: 'V2.1-Evolved',            engine: createVariantEngine('V2.1-Evolved'), desc: 'Genetic Algorithm Vector' },
  { name: 'V2.2-Bayesian-Curvature', engine: createVariantEngine('V2.2-Bayesian-Curvature'), desc: 'Bayes Filter + Curvature' },
  { name: 'V2.2-Citadel-Hardened',   engine: createVariantEngine('V2.2-Citadel-Hardened'), desc: 'Full Suite + Citadel' },
  { name: 'V2.2-Naval-Bellman',      engine: createVariantEngine('V2.2-Naval-Bellman'), desc: 'Full Suite + Bellman Naval' }
];

function runEloTournament(rounds = 30) {
  console.log('================================================================================');
  console.log(` ELO RATING TOURNAMENT: 6 GENERATIONS OF THE ENGINE (${rounds} Rounds)`);
  console.log(' Measuring comparative skill progression from V1 Baseline to V2.2 Citadel');
  console.log('================================================================================\n');

  // Initialize Elo ratings at 1200
  const elo = {};
  const matchRecords = {};
  const headToHead = {};

  for (const c of COMPETITORS) {
    elo[c.name] = 1200;
    matchRecords[c.name] = { wins: 0, top3: 0, totalTerr: 0, matches: 0 };
    headToHead[c.name] = {};
    for (const c2 of COMPETITORS) {
      headToHead[c.name][c2.name] = { wins: 0, losses: 0, draws: 0 };
    }
  }

  const K = 32;

  for (let r = 1; r <= rounds; r++) {
    const seed = 12000 + r * 137;
    const map = (r % 2 === 0)
      ? generateMegaWorldMap(160, 80)
      : generateProceduralVoronoiMap(140, 70, seed, 6);

    const sim = new BattleRoyaleSimulation({ map, maxTicks: 220 });

    // 2 instances of each of the 6 competitors + 8 neutral adversary bots = 20 players total
    const lobbyEntries = [];
    for (const c of COMPETITORS) {
      lobbyEntries.push({ name: c.name, engine: c.engine });
      lobbyEntries.push({ name: c.name, engine: c.engine });
    }

    // Adversaries
    const advPool = ['Aggressive-Swarm', 'Turtle-Fortress', 'Kingmaker-Kamikaze', 'Interest-Arbitrageur'];
    for (let i = 0; i < 8; i++) {
      lobbyEntries.push({ name: advPool[i % advPool.length], isAdversary: true });
    }

    // Shuffle lobby spawns
    for (let i = lobbyEntries.length - 1; i > 0; i--) {
      const j = Math.floor(((seed * 1664525 + 1013904223) >>> 0) / 4294967296 * (i + 1));
      const t = lobbyEntries[i];
      lobbyEntries[i] = lobbyEntries[j];
      lobbyEntries[j] = t;
    }

    const spawnCount = Math.min(lobbyEntries.length, map.spawns.length);
    for (let i = 0; i < spawnCount; i++) {
      const ent = lobbyEntries[i];
      const sp = map.spawns[i];
      if (ent.isAdversary) {
        sim.addPlayer(i + 1, `${ent.name}-${i + 1}`, ent.name, v1, sp.x, sp.y);
      } else {
        const arch = (ent.name === 'V1-Classic') ? 'V1-Baseline' : 'V2.1-Advanced';
        sim.addPlayer(i + 1, `${ent.name}-${i + 1}`, arch, ent.engine, sp.x, sp.y);
      }
    }

    const res = sim.run();

    // Group rankings by competitor generation
    const genPlacements = {};
    for (const c of COMPETITORS) genPlacements[c.name] = [];

    for (let rank = 0; rank < res.rankings.length; rank++) {
      const p = res.rankings[rank];
      for (const c of COMPETITORS) {
        if (p.name.startsWith(c.name)) {
          genPlacements[c.name].push({ rank: rank + 1, territory: p.territory });
          matchRecords[c.name].matches++;
          matchRecords[c.name].totalTerr += p.territory;
          if (rank === 0) matchRecords[c.name].wins++;
          if (rank < 3) matchRecords[c.name].top3++;
        }
      }
    }

    // Pairwise Elo updates across competitors in this match
    for (let i = 0; i < COMPETITORS.length; i++) {
      for (let j = i + 1; j < COMPETITORS.length; j++) {
        const nameA = COMPETITORS[i].name;
        const nameB = COMPETITORS[j].name;
        const plA = genPlacements[nameA];
        const plB = genPlacements[nameB];
        if (plA.length === 0 || plB.length === 0) continue;

        const bestRankA = Math.min(...plA.map(p => p.rank));
        const bestRankB = Math.min(...plB.map(p => p.rank));

        let scoreA = 0.5;
        if (bestRankA < bestRankB) {
          scoreA = 1.0;
          headToHead[nameA][nameB].wins++;
          headToHead[nameB][nameA].losses++;
        } else if (bestRankA > bestRankB) {
          scoreA = 0.0;
          headToHead[nameA][nameB].losses++;
          headToHead[nameB][nameA].wins++;
        } else {
          headToHead[nameA][nameB].draws++;
          headToHead[nameB][nameA].draws++;
        }

        const scoreB = 1.0 - scoreA;
        const rA = elo[nameA];
        const rB = elo[nameB];
        const expectedA = 1.0 / (1.0 + Math.pow(10, (rB - rA) / 400));
        const expectedB = 1.0 - expectedA;

        elo[nameA] += Math.round(K * (scoreA - expectedA));
        elo[nameB] += Math.round(K * (scoreB - expectedB));
      }
    }

    if (r % 5 === 0 || r === rounds) {
      console.log(`Round ${String(r).padStart(2)}/${rounds} Completed. Leader: ${res.winner.name} (${res.winner.territory}px)`);
    }
  }

  console.log('\n================================================================================');
  console.log(' FINAL ELO RATINGS & SKILL PROGRESSION MATRIX');
  console.log('================================================================================');
  console.log('Rank | Engine Generation           | Final Elo | Elo Delta | Wins | Top 3% | Avg Terr');
  console.log('--------------------------------------------------------------------------------');

  const sortedCompetitors = [...COMPETITORS].sort((a, b) => elo[b.name] - elo[a.name]);
  sortedCompetitors.forEach((c, idx) => {
    const finalR = elo[c.name];
    const delta = finalR - 1200;
    const sign = delta >= 0 ? '+' : '';
    const st = matchRecords[c.name];
    const spawns = st.matches || 1;
    const top3Pct = ((st.top3 / spawns) * 100).toFixed(1);
    const avgT = Math.round(st.totalTerr / spawns);
    console.log(
      ` #${idx + 1} | ` +
      `${c.name.padEnd(27)} | ` +
      `${String(finalR).padStart(9)} | ` +
      `${(sign + delta).padStart(9)} | ` +
      `${String(st.wins).padStart(4)} | ` +
      `${(top3Pct + '%').padStart(6)} | ` +
      `${String(avgT).padStart(8)}`
    );
  });

  console.log('--------------------------------------------------------------------------------\n');

  // Pairwise Head-to-Head Win Rate Matrix
  console.log('Pairwise Head-to-Head Record Matrix (Row vs Column):');
  const headers = sortedCompetitors.map(c => c.name.split('-')[1] || c.name);
  console.log(''.padEnd(20) + ' | ' + headers.map(h => h.padEnd(10)).join(' | '));
  console.log('-'.repeat(20) + '-+-' + headers.map(() => '-'.repeat(10)).join('-+-'));

  for (const c1 of sortedCompetitors) {
    const row = [c1.name.padEnd(20)];
    for (const c2 of sortedCompetitors) {
      if (c1.name === c2.name) {
        row.push('    --    ');
      } else {
        const rec = headToHead[c1.name][c2.name];
        row.push(`${rec.wins}-${rec.losses}-${rec.draws}`.padEnd(10));
      }
    }
    console.log(row.join(' | '));
  }
  console.log('================================================================================\n');
}

if (require.main === module) {
  runEloTournament(25);
}

module.exports = { runEloTournament };
