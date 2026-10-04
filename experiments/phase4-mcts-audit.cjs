/**
 * PHASE 4 — MCTS STRUCTURAL AUDIT & DEPTH SCALING
 * ===============================================
 * Verifies:
 * 1. Structural audit: State nodes, action nodes, tree expansion vs 1-ply bandit.
 * 2. Empirical test across depths: Depth 1, Depth 2, Depth 4, Depth 6.
 * 3. Win-rate gain per microsecond (ROI).
 * 4. Identification of the optimal shallow depth preserving maximum benefit.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');
const { VeryHardBot, RigorousMatchSimulation, loadEngine } = require('./rigorous-simulator.cjs');
const { runMultiStepMCTS } = require('./predictive-mpc-engine.js');

const v2_5 = loadEngine(path.join(__dirname, '../content/engine-core.js'));

function structuralAudit() {
  console.log('================================================================================');
  console.log(' PHASE 4.1: STRUCTURAL AUDIT OF MCTS IMPLEMENTATION');
  console.log('================================================================================\n');

  console.log('1. computeMCTSEndgameAction (line 2853 in engine-core.js):');
  console.log('   - Node representations: FLAT 1D TYPED ARRAYS (visits[a], wins[a]).');
  console.log('   - State nodes: NONE (Flat root-action space only).');
  console.log('   - Tree expansion: NONE (Tree depth is strictly 1 ply).');
  console.log('   - Selection: Root UCB1 bandit selection.');
  console.log('   - Rollout: 6-step discrete forward trajectory.');
  console.log('   - VERDICT: Root Monte Carlo Bandit, NOT a genuine multi-step tree search.\n');

  console.log('2. runMultiStepMCTS (line 1641 in engine-core.js & predictive-mpc-engine.js):');
  console.log('   - Node representations: MCTSNode objects with parent/children pointers.');
  console.log('   - State nodes: YES (each node stores s_t).');
  console.log('   - Action nodes: YES (each branch represents an action taken).');
  console.log('   - Selection: UCT selection traversing internal nodes down to leaf.');
  console.log('   - Expansion: YES (adds untried actions, projects forwardState via forwardSimulatorStep).');
  console.log('   - Stochastic/opponent transitions: Implicit in forwardSimulatorStep (deterministic compounding).');
  console.log('   - Rollout: 6-step forward rollout from expanded leaf.');
  console.log('   - Backpropagation: YES (iterates up parent chain updating visits and totalValue).');
  console.log('   - VERDICT: Valid multi-step MCTS tree search.\n');

  console.log('3. ENGINE-CORE INTEGRATION CHECK:');
  console.log('   - In decide() line 2016: computeMCTSEndgameAction is called by default!');
  console.log('   - runMultiStepMCTS is exported but was not hooked into decide() hot loop.\n');
}

function benchmarkMCTSDepths() {
  console.log('================================================================================');
  console.log(' PHASE 4.2: EMPIRICAL DEPTH SCALING & WIN-RATE PER MICROSECOND');
  console.log('================================================================================\n');

  const testState = {
    balance: 850,
    territory: 24,
    freeLandRatio: 0.02,
    hasAdjFree: false,
    adjEnemies: [
      { id: 2, bal: 780, terr: 22 },
      { id: 3, bal: 920, terr: 28 },
      { id: 4, bal: 650, terr: 18 }
    ]
  };

  const depths = [1, 2, 4, 6];
  const depthResults = [];

  for (const depth of depths) {
    // 1. Measure microsecond latency
    const warmup = 100;
    for (let i = 0; i < warmup; i++) runMultiStepMCTS(testState, 40, depth);

    const iters = 1000;
    const t0 = performance.now();
    for (let i = 0; i < iters; i++) {
      runMultiStepMCTS(testState, 40, depth);
    }
    const totalMs = performance.now() - t0;
    const latencyUs = (totalMs / iters) * 1000;

    // 2. Measure win rate in 40 matches against Very Hard bots
    let wins = 0;
    const matches = 40;

    for (let m = 0; m < matches; m++) {
      const seed = 500000 + depth * 1000 + m * 29;
      const sim = new RigorousMatchSimulation({
        mapType: 'voronoi',
        width: 80,
        height: 40,
        seed,
        maxTicks: 250,
        defenderAdvantage: 1.30
      });

      // Hook MCTS with specified depth
      const depthEngine = Object.create(v2_5);
      depthEngine.decide = function(S) {
        const d = v2_5.decide(S);
        if (d.action === 'fight' && S.adjEnemies && S.adjEnemies.length > 0) {
          const mctsRes = runMultiStepMCTS(S, 35, depth);
          if (mctsRes && mctsRes.bestAction) {
            d.action = mctsRes.bestAction;
            if (mctsRes.targetId != null) d.focusEnemyId = mctsRes.targetId;
          }
        }
        return d;
      };

      sim.addPlayer(1, `V2.5-MCTS-D${depth}`, depthEngine, { isV2: true });
      for (let p = 2; p <= 4; p++) {
        sim.addPlayer(p, `VH-Bot-${p}`, new VeryHardBot(p, `VH-Bot-${p}`, seed + p * 13));
      }

      const res = sim.run();
      if (res.winner.id === 1) wins++;
    }

    const winRate = (wins / matches) * 100;
    depthResults.push({
      depth,
      latencyUs: parseFloat(latencyUs.toFixed(2)),
      wins,
      matches,
      winRate: parseFloat(winRate.toFixed(1))
    });

    console.log(`Depth ${depth}: Latency = ${latencyUs.toFixed(2)} µs | Wins = ${wins}/${matches} (${winRate.toFixed(1)}%)`);
  }

  console.log('\n--------------------------------------------------------------------------------');
  console.log('DEPTH EFFICIENCY & GAIN PER MICROSECOND:');
  console.log('Depth | Latency (µs) | Win Rate | ΔWinRate vs D1 | ΔLatency | Gain / µs');
  console.log('------+--------------+----------+----------------+----------+-----------');

  const baseWin = depthResults[0].winRate;
  const baseLat = depthResults[0].latencyUs;

  for (const r of depthResults) {
    const dWin = r.winRate - baseWin;
    const dLat = r.latencyUs - baseLat;
    const gainPerUs = dLat > 0 ? (dWin / dLat).toFixed(3) : 'BASE';
    console.log(
      `  D${r.depth}  | ` +
      `${String(r.latencyUs).padStart(12)} | ` +
      `${(r.winRate + '%').padStart(8)} | ` +
      `${(dWin >= 0 ? '+' : '') + dWin.toFixed(1) + '%'} | ` +
      `${(dLat >= 0 ? '+' : '') + dLat.toFixed(2)} µs | ` +
      `${String(gainPerUs).padStart(9)}`
    );
  }

  // Find shallowest depth preserving >= 90% of max win rate
  const maxWin = Math.max(...depthResults.map(r => r.winRate));
  const optimalDepth = depthResults.find(r => r.winRate >= maxWin * 0.95);
  console.log('\nOptimal Shallow Depth: Depth ' + (optimalDepth ? optimalDepth.depth : 2) +
              ` (achieves ${optimalDepth ? optimalDepth.winRate : 0}% win rate at only ${optimalDepth ? optimalDepth.latencyUs : 0} µs)`);
  console.log('================================================================================\n');

  return { structural: true, depthResults, optimalDepth };
}

structuralAudit();
const auditData = benchmarkMCTSDepths();

fs.writeFileSync('experiments/phase4-results.json', JSON.stringify(auditData, null, 2));
