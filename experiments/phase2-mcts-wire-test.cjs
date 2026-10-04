/**
 * PHASE 2: WIRE REAL MCTS AS PRIMARY DECISION DRIVER & DEPTH-BUDGET OPTIMIZATION
 * ==============================================================================
 * Tests genuine multi-step MCTS wired as the main policy engine across:
 *   - Depth 1 / 35 rollouts
 *   - Depth 2 / 70 rollouts
 *   - Depth 3 / 105 rollouts
 *   - Depth 4 / 140 rollouts
 *   - Depth 6 / 210 rollouts
 *
 * Evaluated on 60 seeds from the VALIDATION set.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');
const { VeryHardBot, RigorousMatchSimulation, loadEngine } = require('./rigorous-simulator.cjs');
const { runMultiStepMCTS } = require('./predictive-mpc-engine.js');

const v2_5 = loadEngine(path.join(__dirname, '../content/engine-core.js'));
const valSeeds = JSON.parse(fs.readFileSync(path.join(__dirname, 'seeds-validation.json'), 'utf8')).slice(0, 60);

const configs = [
  { depth: 1, rollouts: 35 },
  { depth: 2, rollouts: 70 },
  { depth: 3, rollouts: 105 },
  { depth: 4, rollouts: 140 },
  { depth: 6, rollouts: 210 }
];

console.log('================================================================================');
console.log(' PHASE 2: MULTI-STEP MCTS DEPTH & SCALED ROLLOUT BUDGET OPTIMIZATION');
console.log(` Testing ${configs.length} configurations on 60 VALIDATION matches each`);
console.log('================================================================================\n');

const results = [];

for (const cfg of configs) {
  let wins = 0;
  const ranks = [];
  const shares = [];
  const latencies = [];
  let totalNodes = 0;
  let totalDecisions = 0;

  for (let i = 0; i < valSeeds.length; i++) {
    const seed = valSeeds[i];
    const mapType = ['voronoi', 'europe', 'world', 'archipelago'][i % 4];
    const sim = new RigorousMatchSimulation({
      mapType,
      width: 80,
      height: 40,
      seed,
      maxTicks: 250,
      defenderAdvantage: 1.30
    });

    // Create candidate engine with MCTS as PRIMARY decision driver
    const mctsEngine = Object.create(v2_5);
    mctsEngine.decide = function(S) {
      const t0 = performance.now();
      // Primary MCTS decision
      const mcts = runMultiStepMCTS(S, cfg.rollouts, cfg.depth);
      const dt = (performance.now() - t0) * 1000;
      latencies.push(dt);
      totalNodes += (mcts.treeSize || 1);
      totalDecisions++;

      const isFight = mcts.bestAction === 'fight';
      const isExpand = mcts.bestAction === 'expand';

      return {
        action: mcts.bestAction,
        wantEnemy: isFight,
        preferNeutral: isExpand,
        focusEnemyId: mcts.targetId,
        crushable: false,
        reason: `mcts-primary-d${cfg.depth}`,
        winProb: mcts.winProb,
        scores: { expand: isExpand ? 100 : 0, fight: isFight ? 100 : 0, hold: 0 }
      };
    };

    sim.addPlayer(1, `MCTS-D${cfg.depth}`, mctsEngine, { isV2: true });
    for (let p = 2; p <= 4; p++) {
      sim.addPlayer(p, `VH-${p}`, new VeryHardBot(p, `VH-${p}`, seed + p * 23));
    }

    const res = sim.run();
    const myRank = res.rankings.findIndex(p => p.id === 1) + 1;
    const myP = sim.players.find(p => p.id === 1);
    const totT = res.rankings.reduce((s, p) => s + p.territory, 0);

    if (res.winner.id === 1) wins++;
    ranks.push(myRank);
    shares.push(totT > 0 ? (myP.territory / totT) : 0);
  }

  latencies.sort((a, b) => a - b);
  const medLat = latencies[Math.floor(latencies.length * 0.5)].toFixed(2);
  const p95Lat = latencies[Math.floor(latencies.length * 0.95)].toFixed(2);
  const winRate = ((wins / valSeeds.length) * 100).toFixed(1);
  const avgRank = (ranks.reduce((s, r) => s + r, 0) / valSeeds.length).toFixed(2);
  const medShare = ((shares.sort((a,b)=>a-b)[Math.floor(shares.length*0.5)]) * 100).toFixed(1);
  const avgNodes = (totalNodes / Math.max(1, totalDecisions)).toFixed(1);

  results.push({
    depth: cfg.depth,
    rollouts: cfg.rollouts,
    winRate: parseFloat(winRate),
    avgRank: parseFloat(avgRank),
    medShare: parseFloat(medShare),
    medLat: parseFloat(medLat),
    p95Lat: parseFloat(p95Lat),
    avgNodes: parseFloat(avgNodes)
  });

  console.log(`D${cfg.depth} / ${cfg.rollouts} rollouts: Win Rate = ${winRate.padStart(5)}% | Avg Rank = ${avgRank} | Med Share = ${medShare}% | Med Latency = ${medLat.padStart(6)} µs | p95 = ${p95Lat.padStart(6)} µs`);
}

console.log('\n================================================================================');
console.log(' SELECTION ANALYSIS');
console.log('================================================================================');
console.table(results);

// Select best trade-off configuration satisfying latency budget (<50µs med, <100µs p95)
const budgetSatisfying = results.filter(r => r.medLat < 50 && r.p95Lat < 100);
const bestCfg = budgetSatisfying.sort((a, b) => b.winRate - a.winRate)[0] || results[0];
console.log(`\nOptimal Configuration Selected: Depth ${bestCfg.depth} with ${bestCfg.rollouts} rollouts (Win Rate: ${bestCfg.winRate}%, Med Latency: ${bestCfg.medLat} µs)`);

fs.writeFileSync(path.join(__dirname, 'phase2-mcts-results.json'), JSON.stringify({ results, bestCfg }, null, 2));
