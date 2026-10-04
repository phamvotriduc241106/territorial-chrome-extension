'use strict';

/**
 * Evolutionary Hyperparameter Optimizer & Parameter Sensitivity Analysis
 * 
 * Tunes the 6 core mathematical disciplines in Territorial.io V2.1:
 *   1. alphaPMP: Pontryagin optimal control decay rate [0.08, 0.35]
 *   2. betaCheeger: Spectral graph cut isthmus priority [10.0, 45.0]
 *   3. gammaLanchester: Spectator compounding discount threshold [0.35, 0.95]
 *   4. sigmaSDE: Stochastic drift-diffusion breach confidence floor [0.45, 0.70]
 *   5. cMCTS: Monte Carlo tree search UCT exploration constant [0.8, 2.2]
 *   6. dHold: Capital accumulation density ceiling [0.65, 0.95]
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

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

const v2Path = path.join(__dirname, 'engine-core-v2-advanced.js');
const EngineV2 = loadEngine(v2Path);

const { BattleRoyaleSimulation } = require('./battle-royale-runner.cjs');
const { generateMegaWorldMap, generateProceduralVoronoiMap } = require('./advanced-maps.js');

// Parameter Specifications
const PARAM_DEFS = {
  alphaPMP:        { min: 0.08, max: 0.35, default: 0.18, step: 0.03 },
  betaCheeger:     { min: 10.0, max: 45.0, default: 25.0, step: 3.0 },
  gammaLanchester: { min: 0.35, max: 0.95, default: 0.65, step: 0.05 },
  sigmaSDE:        { min: 0.45, max: 0.70, default: 0.55, step: 0.03 },
  cMCTS:           { min: 0.80, max: 2.20, default: 1.414, step: 0.15 },
  dHold:           { min: 0.65, max: 0.95, default: 0.85, step: 0.04 }
};

function createRandomChromosome() {
  const chromo = {};
  for (const [key, def] of Object.entries(PARAM_DEFS)) {
    chromo[key] = def.min + Math.random() * (def.max - def.min);
  }
  return chromo;
}

function clampChromosome(chromo) {
  const clamped = {};
  for (const [key, def] of Object.entries(PARAM_DEFS)) {
    clamped[key] = Math.max(def.min, Math.min(def.max, chromo[key]));
  }
  return clamped;
}

/**
 * Fast Battle Simulator for Genetic Evaluation
 * Simulates 50-player procedural battle royale matches using BattleRoyaleSimulation
 */
function evaluateFitness(chromo, numMatches = 2) {
  // Apply chromosome to EngineV2.CONFIG
  for (const [key, val] of Object.entries(chromo)) {
    EngineV2.CONFIG[key] = val;
  }

  let totalShare = 0;
  let wins = 0;
  let top5Count = 0;

  for (let m = 0; m < numMatches; m++) {
    const seed = 6000 + m * 257;
    const map = (m % 2 === 0)
      ? generateProceduralVoronoiMap(140, 70, seed, 6)
      : generateMegaWorldMap(160, 80);

    const sim = new BattleRoyaleSimulation({ map, maxTicks: 200 });

    const archetypes = [
      'V2.1-Advanced',
      'Aggressive-Swarm',
      'Turtle-Fortress',
      'Opportunist-Vulture',
      'V1-Baseline'
    ];

    const spawns = map.spawns || [];
    const count = Math.min(30, spawns.length);
    for (let i = 0; i < count; i++) {
      const sp = spawns[i];
      const arch = archetypes[i % archetypes.length];
      sim.addPlayer(i + 1, `${arch}-${i + 1}`, arch, EngineV2, sp.x, sp.y);
    }

    const res = sim.run();

    // Measure V2.1 performance
    const v2Players = res.rankings.filter(p => p.archetype === 'V2.1-Advanced');
    if (v2Players.length > 0) {
      const totalLand = res.rankings.reduce((s, p) => s + p.territory, 0) || 1;
      const avgV2Terr = v2Players.reduce((s, p) => s + p.territory, 0) / v2Players.length;
      totalShare += (avgV2Terr / totalLand);

      const topRank = res.rankings[0];
      if (topRank && topRank.archetype === 'V2.1-Advanced') wins++;
      if (res.rankings.slice(0, 5).some(p => p.archetype === 'V2.1-Advanced')) top5Count++;
    }
  }

  const avgShare = totalShare / numMatches;
  const winRate = wins / numMatches;
  const top5Rate = top5Count / numMatches;
  const fitness = (avgShare * 100) + (winRate * 60) + (top5Rate * 20);

  return { fitness, avgShare, winRate, top5Rate };
}

/**
 * Genetic Algorithm Execution
 */
async function runOptimizer() {
  console.log('================================================================');
  console.log('  TERRITORIAL.IO V2.1 EVOLUTIONARY HYPERPARAMETER OPTIMIZER');
  console.log('  Autonomous Exploration across 6 Mathematical Disciplines');
  console.log('================================================================\n');

  const POP_SIZE = 12;
  const GENERATIONS = 4;
  const MATCHES_PER_EVAL = 4;

  let population = [];

  // Seed population with default parameters as individual 0
  const defaultChromo = {};
  for (const [k, d] of Object.entries(PARAM_DEFS)) defaultChromo[k] = d.default;
  population.push(defaultChromo);

  for (let i = 1; i < POP_SIZE; i++) {
    population.push(createRandomChromosome());
  }

  let bestOverall = null;
  let bestFitness = -Infinity;

  for (let gen = 0; gen < GENERATIONS; gen++) {
    console.log(`--- Generation ${gen + 1} / ${GENERATIONS} (Pop Size: ${POP_SIZE}) ---`);

    // Evaluate fitness
    const scoredPop = population.map((ind, idx) => {
      const res = evaluateFitness(ind, MATCHES_PER_EVAL);
      if (res.fitness > bestFitness) {
        bestFitness = res.fitness;
        bestOverall = { ...ind, fitness: res.fitness, avgShare: res.avgShare, winRate: res.winRate };
      }
      return { chromo: ind, ...res };
    });

    scoredPop.sort((a, b) => b.fitness - a.fitness);

    const top = scoredPop[0];
    console.log(`  Gen ${gen + 1} Best Fitness: ${top.fitness.toFixed(2)} | Avg Share: ${(top.avgShare * 100).toFixed(1)}% | Win Rate: ${(top.winRate * 100).toFixed(0)}%`);
    console.log(`    alphaPMP: ${top.chromo.alphaPMP.toFixed(3)} | betaCheeger: ${top.chromo.betaCheeger.toFixed(1)} | dHold: ${top.chromo.dHold.toFixed(2)}`);

    if (gen === GENERATIONS - 1) break;

    // Next generation breeding
    const nextGen = [scoredPop[0].chromo, scoredPop[1].chromo]; // Elitism

    while (nextGen.length < POP_SIZE) {
      // Tournament selection
      const t1 = scoredPop[Math.floor(Math.random() * (POP_SIZE / 2))].chromo;
      const t2 = scoredPop[Math.floor(Math.random() * (POP_SIZE / 2))].chromo;

      // Uniform Crossover
      const child = {};
      for (const k of Object.keys(PARAM_DEFS)) {
        child[k] = Math.random() < 0.5 ? t1[k] : t2[k];
        // Gaussian mutation with 30% chance
        if (Math.random() < 0.30) {
          const step = PARAM_DEFS[k].step;
          child[k] += (Math.random() - 0.5) * 2.0 * step;
        }
      }
      nextGen.push(clampChromosome(child));
    }

    population = nextGen;
  }

  console.log('\n================================================================');
  console.log('  OPTIMIZATION COMPLETE: BEST DISCOVERED PARAMETER SET');
  console.log('================================================================');
  console.log(`Peak Fitness:   ${bestOverall.fitness.toFixed(2)}`);
  console.log(`Territory Share: ${(bestOverall.avgShare * 100).toFixed(1)}%`);
  console.log(`Win Rate:        ${(bestOverall.winRate * 100).toFixed(0)}%\n`);

  console.log('Optimized Hyperparameter Vector:');
  for (const [k, def] of Object.entries(PARAM_DEFS)) {
    const val = bestOverall[k];
    const diff = val - def.default;
    const sign = diff >= 0 ? '+' : '';
    console.log(`  ${k.padEnd(16)} = ${val.toFixed(4)} (Default: ${def.default.toFixed(4)}, Delta: ${sign}${diff.toFixed(4)})`);
  }

  // Parameter Sensitivity Analysis
  console.log('\n================================================================');
  console.log('  PARAMETER SENSITIVITY GRADIENT ANALYSIS (dFitness / dTheta)');
  console.log('================================================================');
  const sensitivities = {};
  const base = { ...bestOverall };

  for (const [k, def] of Object.entries(PARAM_DEFS)) {
    const delta = def.step;
    const chromoPlus = { ...base, [k]: Math.min(def.max, base[k] + delta) };
    const chromoMinus = { ...base, [k]: Math.max(def.min, base[k] - delta) };

    const fPlus = evaluateFitness(chromoPlus, 6).fitness;
    const fMinus = evaluateFitness(chromoMinus, 6).fitness;
    const gradient = (fPlus - fMinus) / (2 * delta);
    sensitivities[k] = { gradient, absLeverage: Math.abs(gradient) };
  }

  const sortedSens = Object.entries(sensitivities).sort((a, b) => b[1].absLeverage - a[1].absLeverage);
  console.log('Sensitivity Ranking by Leverage Magnitude:');
  sortedSens.forEach(([param, s], i) => {
    console.log(`  #${i + 1} ${param.padEnd(16)}: Leverage = ${s.absLeverage.toFixed(2).padStart(6)} | Gradient = ${s.gradient > 0 ? '+' : ''}${s.gradient.toFixed(2)}`);
  });
  console.log('================================================================\n');

  // Save optimal parameters to experiments/optimal-params.json
  const outPath = path.join(__dirname, 'optimal-params.json');
  fs.writeFileSync(outPath, JSON.stringify(bestOverall, null, 2));
  console.log(`Saved optimal parameters to ${outPath}\n`);
}

runOptimizer().catch(err => {
  console.error('Optimizer error:', err);
  process.exit(1);
});
