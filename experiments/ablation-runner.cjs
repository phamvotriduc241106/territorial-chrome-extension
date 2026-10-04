/**
 * Rigorous Statistical Ablation Runner for Territorial.io V2.1
 * Systematically isolates and ablates each advanced mathematical discipline:
 *   1. Full V2.1 (All active)
 *   2. Ablation A: No PMP Optimal Control (Fixed spend ratio)
 *   3. Ablation B: No Spectral Graph Cut (Fiedler Vector disabled)
 *   4. Ablation C: No Eikonal Geodesic Wavefront (Detour blindness)
 *   5. Ablation D: No Hegemonic Coalition Balancing (Pure Nash non-cooperative)
 *   6. Ablation E: No SDE Breach Probability (Stochastic Lanchester veto disabled)
 *   7. Ablation F: No MCTS Endgame Kernel (Tree search disabled)
 *   8. Control: V1 Baseline
 *
 * Runs across randomized procedural Voronoi maps (50 matches per configuration).
 * Computes Welch's t-test and p-values to verify statistical significance (p < 0.01).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { BattleRoyaleSimulation } = require('./battle-royale-runner.cjs');
const { generateProceduralVoronoiMap } = require('./advanced-maps.js');

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
const baseV2 = loadEngine(path.join(__dirname, './engine-core-v2-advanced.js'));

// Construct Ablation Variants via isolated engine sandboxes and CONFIG flags
function createAblatedEngine(type) {
  const eng = loadEngine(path.join(__dirname, './engine-core-v2-advanced.js'));

  if (type === 'NoPMP') {
    eng.CONFIG.enablePMP = false;
  } else if (type === 'NoSpectral') {
    eng.CONFIG.enableSpectral = false;
  } else if (type === 'NoEikonal') {
    eng.CONFIG.enableEikonal = false;
  } else if (type === 'NoCoalition') {
    eng.CONFIG.enableCoalition = false;
  } else if (type === 'NoSDE') {
    eng.CONFIG.enableSDE = false;
  } else if (type === 'NoMCTS') {
    eng.CONFIG.enableMCTS = false;
  } else if (type === 'NoCurvature') {
    eng.CONFIG.enableCurvatureFlow = false;
  } else if (type === 'NoBayesian') {
    eng.CONFIG.enableBayesianArchetype = false;
  } else if (type === 'NoNaval') {
    eng.CONFIG.enableNavalBellman = false;
  }

  return eng;
}

// Statistical functions: Mean, Variance, Welch's t-test, and p-value approximation
function computeStats(arr) {
  const n = arr.length;
  if (n === 0) return { mean: 0, stdDev: 0, variance: 0 };
  const mean = arr.reduce((s, v) => s + v, 0) / n;
  const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, n - 1);
  return {
    mean: parseFloat(mean.toFixed(2)),
    variance: parseFloat(variance.toFixed(2)),
    stdDev: parseFloat(Math.sqrt(variance).toFixed(2))
  };
}

function welchTTest(stats1, n1, stats2, n2) {
  const v1 = stats1.variance / n1;
  const v2 = stats2.variance / n2;
  const se = Math.sqrt(v1 + v2);
  if (se === 0) return { t: 0, df: 1, pValue: 1.0 };
  const t = (stats1.mean - stats2.mean) / se;
  const df = Math.floor(((v1 + v2) ** 2) / ((v1 ** 2) / (n1 - 1) + (v2 ** 2) / (n2 - 1)));

  // Approximate p-value from t and df via standard normal / student approximation
  const absT = Math.abs(t);
  const z = absT;
  // Standard normal tail approximation
  const b1 = 0.319381530, b2 = -0.356563782, b3 = 1.781477937, b4 = -1.821255978, b5 = 1.330274429;
  const k = 1.0 / (1.0 + 0.2316419 * z);
  const poly = ((((b5 * k + b4) * k + b3) * k + b2) * k + b1) * k;
  const normPdf = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
  const tail = normPdf * poly;
  const pValue = Math.max(1e-6, Math.min(1.0, 2 * tail));

  return {
    t: parseFloat(t.toFixed(3)),
    df,
    pValue: parseFloat(pValue.toFixed(6))
  };
}

async function runAblationSuite(matchesPerVariant = 25) {
  console.log('================================================================================');
  console.log(` RIGOROUS MATHEMATICAL ABLATION TESTING (${matchesPerVariant} Matches per Configuration)`);
  console.log(' Testing statistical significance of each module against null hypothesis');
  console.log('================================================================================\n');

  const variants = [
    { name: 'Full-V2.1', engine: baseV2, desc: 'All 10 Modules + SDE + MCTS' },
    { name: 'Ablation-NoPMP', engine: createAblatedEngine('NoPMP'), desc: 'PMP Optimal Control Disabled' },
    { name: 'Ablation-NoSpectral', engine: createAblatedEngine('NoSpectral'), desc: 'Spectral Graph Cut Disabled' },
    { name: 'Ablation-NoEikonal', engine: createAblatedEngine('NoEikonal'), desc: 'Eikonal Wavefront Disabled' },
    { name: 'Ablation-NoCoalition', engine: createAblatedEngine('NoCoalition'), desc: 'Hegemon Balancing Disabled' },
    { name: 'Ablation-NoSDE', engine: createAblatedEngine('NoSDE'), desc: 'SDE Breach Veto Disabled' },
    { name: 'Ablation-NoMCTS', engine: createAblatedEngine('NoMCTS'), desc: 'MCTS Endgame Tree Disabled' },
    { name: 'Ablation-NoCurvature', engine: createAblatedEngine('NoCurvature'), desc: 'Curvature Flow & Encirclement Disabled' },
    { name: 'Ablation-NoBayesian', engine: createAblatedEngine('NoBayesian'), desc: 'Bayesian Archetype Profiler Disabled' },
    { name: 'Control-V1', engine: v1, desc: 'Original Baseline Heuristic' }
  ];

  const results = {};

  for (const v of variants) {
    console.log(`Evaluating Variant: [${v.name.padEnd(20)}] (${v.desc})...`);
    const territories = [];
    const balances = [];
    const ranks = [];
    let wins = 0;

    for (let m = 0; m < matchesPerVariant; m++) {
      const seed = 5000 + m * 41;
      const map = generateProceduralVoronoiMap(120, 60, seed, 5);
      const sim = new BattleRoyaleSimulation({ map, maxTicks: 220 });

      // Player 1 is the tested candidate
      const arch = v.name === 'Control-V1' ? 'V1-Baseline' : 'Candidate';
      sim.addPlayer(1, v.name, arch, v.engine, map.spawns[0].x, map.spawns[0].y);

      // Other 19 players are diverse adversarial opponents
      const archPool = [
        'Aggressive-Swarm',
        'Turtle-Fortress',
        'Opportunist-Vulture',
        'Kingmaker-Kamikaze',
        'Cartel-Sybil',
        'Interest-Arbitrageur',
        'V1-Baseline'
      ];
      for (let i = 1; i < Math.min(20, map.spawns.length); i++) {
        const arch = archPool[i % archPool.length];
        const eng = arch === 'V1-Baseline' ? v1 : baseV2;
        sim.addPlayer(i + 1, `Opponent-${i + 1}`, arch, eng, map.spawns[i].x, map.spawns[i].y);
      }

      const matchRes = sim.run();
      const cand = matchRes.rankings.find(p => p.id === 1);
      const candRank = matchRes.rankings.findIndex(p => p.id === 1) + 1;

      territories.push(cand ? cand.territory : 0);
      balances.push(cand ? cand.balance : 0);
      ranks.push(candRank);
      if (candRank === 1) wins++;
    }

    const terrStats = computeStats(territories);
    const balStats = computeStats(balances);
    const rankStats = computeStats(ranks);

    results[v.name] = {
      desc: v.desc,
      wins,
      winRate: ((wins / matchesPerVariant) * 100).toFixed(1),
      terrStats,
      balStats,
      rankStats,
      territories
    };

    console.log(`  -> Wins: ${wins}/${matchesPerVariant} (${results[v.name].winRate}%) | Avg Terr: ${terrStats.mean} (±${terrStats.stdDev}) | Avg Rank: ${rankStats.mean}`);
  }

  // Statistical Welch's t-test comparison against Full-V2.1
  console.log('\n--------------------------------------------------------------------------------');
  console.log(' STATISTICAL SIGNIFICANCE ANALYSIS (vs. Full-V2.1 Baseline)');
  console.log(' Confidence Interval: 99% (p < 0.01 indicates genuine statistical benefit)');
  console.log('--------------------------------------------------------------------------------');
  console.log('Configuration        | Win%  | Avg Terr | Delta Terr | t-stat | p-value  | Significant?');
  console.log('--------------------------------------------------------------------------------');

  const fullStats = results['Full-V2.1'].terrStats;

  for (const [name, data] of Object.entries(results)) {
    const isBaseline = name === 'Full-V2.1';
    let tRes = { t: 0, df: 1, pValue: 1.0 };
    let deltaStr = '0.0%';
    let sigStr = 'BASELINE';

    if (!isBaseline) {
      tRes = welchTTest(fullStats, matchesPerVariant, data.terrStats, matchesPerVariant);
      const delta = ((data.terrStats.mean - fullStats.mean) / Math.max(1, fullStats.mean)) * 100;
      deltaStr = `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`;
      sigStr = (tRes.pValue < 0.01 && delta < 0) ? 'YES (p < 0.01)' : ((tRes.pValue < 0.05 && delta < 0) ? 'MARGINAL' : 'NO');
    }

    console.log(
      `${name.padEnd(20)} | ` +
      `${data.winRate.padStart(5)}% | ` +
      `${String(data.terrStats.mean).padStart(8)} | ` +
      `${deltaStr.padStart(10)} | ` +
      `${String(tRes.t).padStart(6)} | ` +
      `${tRes.pValue.toFixed(4).padStart(8)} | ` +
      `${sigStr}`
    );
  }

  console.log('--------------------------------------------------------------------------------\n');
}

if (require.main === module) {
  runAblationSuite(30);
}

module.exports = { runAblationSuite, createAblatedEngine };
