/**
 * PHASE 5 — MPC & MCTS ABLATION STUDY
 * ===================================
 * Isolates the causal contribution of each planner:
 * 1. V2.5 FULL (Both MPC + MCTS enabled)
 * 2. V2.5 - MPC (MPC trajectory rollout disabled)
 * 3. V2.5 - MCTS (MCTS endgame solver disabled)
 * 4. V2.5 - MPC - MCTS (Both disabled: heuristic baseline)
 * 5. MPC Only (Trajectory rollout overrides all heuristic action choices)
 * 6. MCTS Only (MCTS tree search overrides all heuristic action choices)
 *
 * Runs 30 identical seeds per variant against Very Hard bots.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { VeryHardBot, RigorousMatchSimulation, loadEngine } = require('./rigorous-simulator.cjs');
const { evaluateMPCAction, runMultiStepMCTS } = require('./predictive-mpc-engine.js');

const v2_5 = loadEngine(path.join(__dirname, '../content/engine-core.js'));

function createVariantEngine(variantName) {
  const engine = Object.create(v2_5);

  if (variantName === 'V2.5 FULL') {
    // Shipped engine
    return v2_5;
  }

  if (variantName === 'V2.5 - MPC') {
    engine.decide = function(S) {
      // Temporarily disable MPC block by running decide without MPC evaluation
      const d = v2_5.decide(S);
      if (d.reason && d.reason.startsWith('mpc-')) {
        d.action = (S.hasAdjFree && (S.freeLandRatio > 0.05)) ? 'expand' : 'fight';
        d.reason = 'ablated-heuristic';
      }
      return d;
    };
    return engine;
  }

  if (variantName === 'V2.5 - MCTS') {
    engine.decide = function(S) {
      const d = v2_5.decide(S);
      if (d.reason === 'mcts-equilibrium-hold') {
        d.action = 'fight';
        d.reason = 'ablated-no-mcts-hold';
      }
      return d;
    };
    return engine;
  }

  if (variantName === 'V2.5 - MPC - MCTS') {
    engine.decide = function(S) {
      const d = v2_5.decide(S);
      if (d.reason && (d.reason.startsWith('mpc-') || d.reason.startsWith('mcts-'))) {
        d.action = (S.hasAdjFree && (S.freeLandRatio > 0.05)) ? 'expand' : 'fight';
        d.reason = 'ablated-baseline';
      }
      return d;
    };
    return engine;
  }

  if (variantName === 'MPC Only') {
    engine.decide = function(S) {
      const candidates = [
        { type: 'hold', ratio: 0, targetId: null }
      ];
      if (S.hasAdjFree || (S.freeLandRatio && S.freeLandRatio > 0.01)) {
        candidates.push({ type: 'expand', ratio: 0.15, targetId: null });
        candidates.push({ type: 'expand', ratio: 0.30, targetId: null });
      }
      if (S.adjEnemies && S.adjEnemies.length > 0) {
        for (const e of S.adjEnemies.slice(0, 3)) {
          candidates.push({ type: 'fight', ratio: 0.20, targetId: e.id });
          if ((S.balance || 0) > (e.bal || 0) * 1.5) {
            candidates.push({ type: 'fight', ratio: 0.40, targetId: e.id });
          }
        }
      }
      const evalRes = evaluateMPCAction(S, candidates, 8);
      const best = evalRes.bestAction || { type: 'hold', ratio: 0 };
      return {
        action: best.type,
        wantEnemy: best.type === 'fight',
        preferNeutral: best.type === 'expand',
        focusEnemyId: best.targetId,
        crushable: false,
        reason: 'pure-mpc'
      };
    };
    return engine;
  }

  if (variantName === 'MCTS Only') {
    engine.decide = function(S) {
      const mctsRes = runMultiStepMCTS(S, 40, 2);
      return {
        action: mctsRes.bestAction,
        wantEnemy: mctsRes.bestAction === 'fight',
        preferNeutral: mctsRes.bestAction === 'expand',
        focusEnemyId: mctsRes.targetId,
        crushable: false,
        reason: 'pure-mcts'
      };
    };
    return engine;
  }

  return v2_5;
}

function runAblationStudy(matchesPerVariant = 30) {
  console.log('================================================================================');
  console.log(' PHASE 5: MPC & MCTS ABLATION STUDY (30 MATCHES PER VARIANT)');
  console.log('================================================================================\n');

  const variants = [
    'V2.5 FULL',
    'V2.5 - MPC',
    'V2.5 - MCTS',
    'V2.5 - MPC - MCTS',
    'MPC Only',
    'MCTS Only'
  ];

  const results = {};

  for (const vName of variants) {
    const engine = createVariantEngine(vName);
    let wins = 0;
    const ranks = [];
    let totalTerrShare = 0;

    for (let m = 0; m < matchesPerVariant; m++) {
      const seed = 600000 + m * 71;
      const sim = new RigorousMatchSimulation({
        mapType: 'voronoi',
        width: 80,
        height: 40,
        seed,
        maxTicks: 250,
        defenderAdvantage: 1.30
      });

      sim.addPlayer(1, vName, engine, { isV2: true });
      for (let p = 2; p <= 4; p++) {
        sim.addPlayer(p, `VH-${p}`, new VeryHardBot(p, `VH-${p}`, seed + p * 13));
      }

      const res = sim.run();
      const myRank = res.rankings.findIndex(p => p.id === 1) + 1;
      const myPlayer = sim.players.find(p => p.id === 1);
      const totalMapTerr = res.rankings.reduce((sum, p) => sum + p.territory, 0);
      const terrShare = totalMapTerr > 0 ? (myPlayer.territory / totalMapTerr) : 0;

      if (res.winner.id === 1) wins++;
      ranks.push(myRank);
      totalTerrShare += terrShare;
    }

    const winRate = (wins / matchesPerVariant) * 100;
    const avgRank = (ranks.reduce((s, r) => s + r, 0) / matchesPerVariant).toFixed(2);
    const avgShare = ((totalTerrShare / matchesPerVariant) * 100).toFixed(1);

    results[vName] = {
      variant: vName,
      wins,
      matches: matchesPerVariant,
      winRate: parseFloat(winRate.toFixed(1)),
      avgRank,
      avgShare: avgShare + '%'
    };

    console.log(`${vName.padEnd(20)} | Wins: ${String(wins).padStart(2)}/${matchesPerVariant} (${winRate.toFixed(1).padStart(5)}%) | Avg Rank: ${avgRank} | Avg Share: ${avgShare}%`);
  }

  console.log('\n--------------------------------------------------------------------------------');
  console.log('CAUSAL CONTRIBUTION ANALYSIS:');
  const baseWin = results['V2.5 FULL'].winRate;
  console.log(`- V2.5 FULL Win Rate:       ${baseWin}%`);
  console.log(`- Removing MPC impact:       ${(results['V2.5 - MPC'].winRate - baseWin).toFixed(1)}% (Causal impact of MPC trajectory planning)`);
  console.log(`- Removing MCTS impact:      ${(results['V2.5 - MCTS'].winRate - baseWin).toFixed(1)}% (Causal impact of MCTS endgame hold veto)`);
  console.log(`- Removing Both (Baseline):  ${(results['V2.5 - MPC - MCTS'].winRate - baseWin).toFixed(1)}% (Net planning contribution)`);
  console.log(`- MPC Only (No Heuristics):  ${results['MPC Only'].winRate}% (Can trajectory rollout alone steer the engine?)`);
  console.log(`- MCTS Only (No Heuristics): ${results['MCTS Only'].winRate}% (Can tree search alone steer the engine?)`);
  console.log('================================================================================\n');

  return results;
}

const ablationResults = runAblationStudy(30);

fs.writeFileSync('experiments/phase5-results.json', JSON.stringify(ablationResults, null, 2));
