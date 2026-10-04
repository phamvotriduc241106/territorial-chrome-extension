/**
 * PHASE 3 — SIMULATOR BIAS AUDIT & INFORMATION LEAKAGE CHECK
 * ==========================================================
 * Systematically audits and measures simulator biases:
 * 1. Combat Multiplier Bias: Real game (1.30x-1.40x) vs Simulator Chokepoint Cheat (1.05x)
 * 2. Hidden State Leakage: True enemy balance known vs Fog-of-War (Belief Observer)
 * 3. Spawn Bias: Center spawn {500,500} vs Uniform Randomized Asymmetric Spawns
 * 4. Opponent Authenticity: True Dump dU Bot vs Mirrored Clone Bot
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { VeryHardBot, RigorousMatchSimulation, loadEngine } = require('./rigorous-simulator.cjs');

const v2_5 = loadEngine(path.join(__dirname, '../experiments/legacy/engine-core.js'));
const devEngine = loadEngine(path.join(__dirname, '../content/engine-core-v2-advanced.js'));

function auditSimulatorBiases() {
  console.log('================================================================================');
  console.log(' PHASE 3: SIMULATOR BIAS & INFORMATION LEAKAGE AUDIT');
  console.log('================================================================================\n');

  const tests = [
    {
      name: 'Original Dev Tournament (Center spawn + Cloned Bots + Mock Chokepoint)',
      spawnCenter: true,
      opponentType: 'clone',
      defAdvantage: 1.05,
      fogOfWar: false
    },
    {
      name: 'Bias 1 Removed: Authentic Dump dU Bots (instead of Cloned Bots)',
      spawnCenter: true,
      opponentType: 'dump_du',
      defAdvantage: 1.05,
      fogOfWar: false
    },
    {
      name: 'Bias 2 Removed: Strict 1.30x Defense (NO 1.05x Chokepoint Bonus)',
      spawnCenter: true,
      opponentType: 'dump_du',
      defAdvantage: 1.30,
      fogOfWar: false
    },
    {
      name: 'Bias 3 Removed: Randomized Spawns (NO Static Center Spawn)',
      spawnCenter: false,
      opponentType: 'dump_du',
      defAdvantage: 1.30,
      fogOfWar: false
    },
    {
      name: 'Bias 4 Removed: Fog-of-War Active (Hidden Enemy Balance)',
      spawnCenter: false,
      opponentType: 'dump_du',
      defAdvantage: 1.30,
      fogOfWar: true
    }
  ];

  const results = [];

  for (const t of tests) {
    let wins = 0;
    const matches = 30;

    for (let m = 0; m < matches; m++) {
      const seed = 400000 + m * 53;
      const sim = new RigorousMatchSimulation({
        mapType: 'voronoi',
        width: 100,
        height: 50,
        seed,
        maxTicks: 250,
        defenderAdvantage: t.defAdvantage,
        fogOfWar: t.fogOfWar
      });

      const p1Options = { isV2: true };
      if (t.spawnCenter) {
        p1Options.x = 50;
        p1Options.y = 25;
      }
      sim.addPlayer(1, 'V2.5-Candidate', v2_5, p1Options);

      for (let p = 2; p <= 4; p++) {
        const pOptions = {};
        if (t.spawnCenter) {
          if (p === 2) { pOptions.x = 20; pOptions.y = 12; }
          if (p === 3) { pOptions.x = 80; pOptions.y = 12; }
          if (p === 4) { pOptions.x = 50; pOptions.y = 40; }
        }
        const oppEngine = (t.opponentType === 'clone') ? devEngine : new VeryHardBot(p, 'VH-Bot-' + p, seed + p * 19);
        sim.addPlayer(p, 'Opponent-' + p, oppEngine, pOptions);
      }

      const res = sim.run();
      if (res.winner.id === 1) wins++;
    }

    const winRate = ((wins / matches) * 100).toFixed(1);
    results.push({
      configuration: t.name,
      wins,
      matches,
      winRate: winRate + '%'
    });
    console.log(`${t.name}:`);
    console.log(`  -> Win Rate: ${wins}/${matches} (${winRate}%)\n`);
  }

  return results;
}

const auditResults = auditSimulatorBiases();

fs.writeFileSync('experiments/phase3-results.json', JSON.stringify({
  auditResults
}, null, 2));
