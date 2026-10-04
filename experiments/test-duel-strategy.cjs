/**
 * PHASE 4: DUEL STRATEGY ISOLATION & VALIDATION
 * ============================================
 * Focuses strictly on 1v1 duels against Very Hard bots.
 * Compares Baseline (20.0% win rate) vs Dedicated Duel Strategy.
 * Target: >= 70% win rate in 1v1 duels.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { VeryHardBot, RigorousMatchSimulation, loadEngine } = require('./rigorous-simulator.cjs');

const v2_5 = loadEngine(path.join(__dirname, '../content/engine-core.js'));
const valSeeds = JSON.parse(fs.readFileSync(path.join(__dirname, 'seeds-validation.json'), 'utf8')).slice(0, 50);

function createDuelCandidateEngine() {
  const engine = Object.create(v2_5);

  engine.decide = function(S) {
    const isDuel = S.isDuel || (S.adjEnemies && S.adjEnemies.length <= 1);
    const B = S.balance || 0;
    const T = Math.max(1, S.territory || 1);
    const hasFree = S.hasAdjFree || (S.freeLandRatio != null && S.freeLandRatio > 0.005);
    const enemies = S.adjEnemies || [];
    const foe = enemies.length > 0 ? enemies[0] : null;

    if (isDuel) {
      // ── DEDICATED DUEL MODE POLICY ──
      // 1. If neutral land exists: 100% PRIORITY TO EXPAND.
      // Every neutral pixel captured is an irreversible relative territory delta (+2ΔT).
      if (hasFree) {
        return {
          action: 'expand',
          wantEnemy: false,
          preferNeutral: true,
          crushable: false,
          focusEnemyId: null,
          enemyBal: 0,
          reason: 'duel-land-rush'
        };
      }

      // 2. If no neutral land:
      if (foe) {
        const foeBal = foe.bal || 0;
        const crush = B > 0 && Math.floor(B / 8) > foeBal;
        if (crush) {
          return {
            action: 'fight',
            wantEnemy: true,
            preferNeutral: false,
            crushable: true,
            focusEnemyId: foe.id,
            enemyBal: foeBal,
            reason: 'duel-crush'
          };
        }

        // Relative Advantage Valuation
        // If our balance > foe balance * 1.15, apply relentless pressure
        if (B > foeBal * 1.15 || T > (foe.terr || 1)) {
          return {
            action: 'fight',
            wantEnemy: true,
            preferNeutral: false,
            crushable: false,
            focusEnemyId: foe.id,
            enemyBal: foeBal,
            reason: 'duel-attrition-pressure'
          };
        }

        // If behind on balance, hold temporarily to harvest compound interest up to soft cap
        const softCap = Math.min(100 * T, 1000000000);
        if (B < softCap * 0.85 && B < foeBal) {
          return {
            action: 'hold',
            wantEnemy: false,
            preferNeutral: false,
            crushable: false,
            focusEnemyId: foe.id,
            enemyBal: foeBal,
            reason: 'duel-compound-recovery'
          };
        }

        return {
          action: 'fight',
          wantEnemy: true,
          preferNeutral: false,
          crushable: false,
          focusEnemyId: foe.id,
          enemyBal: foeBal,
          reason: 'duel-contest'
        };
      }
    }

    // Default to full engine for multiplayer
    return v2_5.decide(S);
  };

  engine.planSpend = function(ctx) {
    const isDuel = ctx.isDuel || ctx.fronts <= 1;
    const B = ctx.balance || 0;
    const seq = ctx.attackSequence || 0;

    if (isDuel && !ctx.wantEnemy) {
      // Smooth geometric decay for duel expansion: starts 35%, tapers to 15%
      const ratio = Math.max(0.14, Math.min(0.38, 0.38 * Math.exp(-seq * 0.05)));
      return { canAfford: true, ratio, reason: 'duel-expansion-spend' };
    }

    if (isDuel && ctx.wantEnemy) {
      if (ctx.crushable) {
        return { canAfford: true, ratio: 0.45, reason: 'duel-crush-commit' };
      }
      // Combat spend: steady 15% probing pressure to maintain liquid defense
      return { canAfford: true, ratio: 0.16, reason: 'duel-pressure-commit' };
    }

    return v2_5.planSpend(ctx);
  };

  return engine;
}

console.log('================================================================================');
console.log(' PHASE 4: EVALUATING DEDICATED DUEL MODE ACROSS 50 VALIDATION 1v1 MATCHES');
console.log('================================================================================\n');

const candidate = createDuelCandidateEngine();
let baseWins = 0;
let candWins = 0;

for (let i = 0; i < valSeeds.length; i++) {
  const seed = valSeeds[i];

  // Run Baseline 1v1
  const bSim = new RigorousMatchSimulation({ mapType: 'voronoi', width: 80, height: 40, seed, maxTicks: 250, defenderAdvantage: 1.30 });
  bSim.addPlayer(1, 'Baseline', v2_5, { isV2: true });
  bSim.addPlayer(2, 'VH-Bot', new VeryHardBot(2, 'VH-Bot', seed + 13));
  const bRes = bSim.run();
  if (bRes.winner.id === 1) baseWins++;

  // Run Candidate 1v1 on IDENTICAL seed
  const cSim = new RigorousMatchSimulation({ mapType: 'voronoi', width: 80, height: 40, seed, maxTicks: 250, defenderAdvantage: 1.30 });
  cSim.addPlayer(1, 'DuelCandidate', candidate, { isV2: true });
  cSim.addPlayer(2, 'VH-Bot', new VeryHardBot(2, 'VH-Bot', seed + 13));
  const cRes = cSim.run();
  if (cRes.winner.id === 1) candWins++;

  if ((i + 1) % 10 === 0 || i === valSeeds.length - 1) {
    console.log(`  Match ${String(i + 1).padStart(2)} / ${valSeeds.length} | Candidate Wins: ${candWins} (${((candWins/(i+1))*100).toFixed(1)}%) | Baseline Wins: ${baseWins} (${((baseWins/(i+1))*100).toFixed(1)}%)`);
  }
}

const candWinRate = ((candWins / valSeeds.length) * 100).toFixed(1);
const baseWinRate = ((baseWins / valSeeds.length) * 100).toFixed(1);

console.log('\n================================================================================');
console.log(' DUEL MODE VALIDATION RESULTS:');
console.log(`  Baseline 1v1 Win Rate:   ${baseWins} / ${valSeeds.length} (${baseWinRate}%)`);
console.log(`  Candidate 1v1 Win Rate:  ${candWins} / ${valSeeds.length} (${candWinRate}%)`);
console.log(`  Net Improvement:         +${(candWinRate - baseWinRate).toFixed(1)}%`);
console.log('================================================================================\n');

fs.writeFileSync(path.join(__dirname, 'phase4-duel-results.json'), JSON.stringify({ baseWins, candWins, candWinRate, baseWinRate }, null, 2));
