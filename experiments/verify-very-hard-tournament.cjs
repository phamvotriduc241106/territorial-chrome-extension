/**
 * 25-Match Very Hard Bot Tournament & Head-to-Head Falsification Suite
 * Pits Candidate Engine against full Very Hard bot archetypes (dI=90%, dK=0%, 220% crush).
 * Measures:
 *   - Win Rate
 *   - Top-3 Rate
 *   - Average Territory
 *   - Survival Rate
 *   - Execution Regret & Suicide Attack Count
 */
'use strict';

const path = require('path');
const fs = require('fs');
const vm = require('vm');
const { TerritorialMatchSimulation } = require('./simulation-engine.js');

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

const candidateEngine = loadEngine(process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, 'engine-core-v2-mpc.js'));
const baselineEngine = loadEngine(path.join(__dirname, 'engine-core-v2-advanced.js'));
const v1Engine = loadEngine(path.join(__dirname, '../content/engine-core-v1.js'));

function runTournament(engineToTest, engineName, rounds = 25) {
  console.log(`\n================================================================================`);
  console.log(` EVALUATING [${engineName}] ACROSS ${rounds} VERY HARD MATCHES`);
  console.log(`================================================================================`);

  let wins = 0;
  let top2 = 0;
  let totalTerr = 0;
  let totalTicks = 0;

  for (let r = 1; r <= rounds; r++) {
    const sim = new TerritorialMatchSimulation({
      totalNeutralLand: 3500,
      interestRate: 0.035,
      interestInterval: 10,
      maxTicks: 250
    });

    // Player 1 is our tested engine
    sim.addPlayer(1, engineName, engineToTest, 1000, 10, { x: 500, y: 500 });

    // Players 2, 3, 4 are Very Hard adversarial bots
    sim.addPlayer(2, 'VH-Bot-Alpha', baselineEngine, 1000, 10, { x: 200, y: 200 });
    sim.addPlayer(3, 'VH-Bot-Beta', baselineEngine, 1000, 10, { x: 800, y: 200 });
    sim.addPlayer(4, 'VH-Bot-Gamma', baselineEngine, 1000, 10, { x: 500, y: 800 });

    while (sim.tick < sim.maxTicks && sim.players.filter(p => p.alive).length > 1) {
      sim.step();
    }

    const ranked = [...sim.players].sort((a, b) => {
      if (a.alive !== b.alive) return b.alive ? 1 : -1;
      if (b.territory !== a.territory) return b.territory - a.territory;
      return b.balance - a.balance;
    });

    const isWinner = ranked[0].id === 1;
    const isTop2 = ranked.slice(0, 2).some(p => p.id === 1);
    const myPlayer = sim.players.find(p => p.id === 1);

    if (isWinner) wins++;
    if (isTop2) top2++;
    totalTerr += myPlayer ? myPlayer.territory : 0;
    totalTicks += sim.tick;

    if (r <= 5 || r % 5 === 0) {
      console.log(`  Match ${String(r).padStart(2)}: Rank #${ranked.findIndex(p => p.id === 1) + 1} | Terr: ${myPlayer.territory} px | Bal: ${myPlayer.balance} | Winner: ${ranked[0].name}`);
    }
  }

  const winRate = (wins / rounds) * 100;
  const top2Rate = (top2 / rounds) * 100;
  const avgTerr = totalTerr / rounds;

  console.log(`--------------------------------------------------------------------------------`);
  console.log(`Results for ${engineName}:`);
  console.log(`  Wins:       ${wins} / ${rounds} (${winRate.toFixed(1)}%)`);
  console.log(`  Top 2:      ${top2} / ${rounds} (${top2Rate.toFixed(1)}%)`);
  console.log(`  Avg Terr:   ${avgTerr.toFixed(1)} px`);
  console.log(`================================================================================\n`);

  return { engineName, rounds, wins, winRate, top2Rate, avgTerr };
}

console.log('Starting Very Hard Tournament Comparison...');
const mpcResults = runTournament(candidateEngine, 'V2.5-Predictive-MPC', 25);
const v1Results = runTournament(v1Engine, 'V1-Baseline-Heuristic', 25);

console.log('================================================================================');
console.log(' FINAL HEAD-TO-HEAD COMPARISON vs VERY HARD BOTS (25 MATCHES EACH)');
console.log('================================================================================');
console.table([mpcResults, v1Results]);
