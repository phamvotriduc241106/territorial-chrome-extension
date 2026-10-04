/**
 * PHASE 5: COUNTERFACTUAL KINGMAKER MODEL IMPLEMENTATION & VALIDATION
 * ===================================================================
 * Replaces static +3500/-3500 constants with explicit counterfactual delta:
 *   DeltaWin(j) = V(s' | attack j) - V(s' | hold)
 * Models outside leader compound growth and spectator free-riding.
 * Tested across 60 multi-agent VALIDATION matches (4-player and 10-player).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { VeryHardBot, RigorousMatchSimulation, loadEngine } = require('./rigorous-simulator.cjs');

const v2_5 = loadEngine(path.join(__dirname, '../content/engine-core.js'));
const valSeeds = JSON.parse(fs.readFileSync(path.join(__dirname, 'seeds-validation.json'), 'utf8')).slice(0, 60);

// Calibrated Value Function from Phase 6
function evaluateStateValue(myTerr, myBal, enemies) {
  let totT = myTerr;
  let totB = myBal;
  let maxFoeB = 0;

  for (let i = 0; i < enemies.length; i++) {
    totT += (enemies[i].terr || 1);
    totB += (enemies[i].bal || 0);
    if ((enemies[i].bal || 0) > maxFoeB) maxFoeB = enemies[i].bal || 0;
  }

  const terrShare = myTerr / Math.max(1, totT);
  const balShare = myBal / Math.max(1, totB);
  const crushRisk = myBal > 0 ? Math.max(0, Math.min(1.0, (maxFoeB / 8.0 - myBal) / myBal)) : 1.0;

  // Normalized value in [0, 1]
  return 0.65 * terrShare + 0.15 * balShare - 0.20 * crushRisk;
}

/**
 * Counterfactual Kingmaker Target Evaluator
 */
function evaluateCounterfactualTarget(S, targetEnemy, attackRatio = 0.20) {
  const B = S.balance || 0;
  const T = S.territory || 1;
  const enemies = S.adjEnemies || [];
  if (!targetEnemy || enemies.length === 0) return { deltaValue: 0, kingmakerRisk: false };

  // 1. Current baseline value if holding for 1 cycle
  const currentVal = evaluateStateValue(T, B, enemies);

  // 2. Project our post-combat state
  const sent = Math.floor(B * attackRatio);
  const tax = Math.floor(12 * sent / 1024);
  const myPostBal = Math.max(0, B - sent - tax);

  const targetBal = targetEnemy.bal || 0;
  const targetTerr = targetEnemy.terr || 1;
  const isCrush = B > 0 && Math.floor(B / 8) > targetBal;

  let myPostTerr = T;
  let targetPostTerr = targetTerr;
  let targetPostBal = targetBal;

  if (isCrush) {
    const dmg = Math.min(targetBal, Math.floor(sent * 0.9));
    targetPostBal -= dmg;
    const gained = Math.min(targetTerr, Math.max(1, Math.floor(sent / 2.5)));
    myPostTerr += gained;
    targetPostTerr -= gained;
  } else {
    // 1.30x attrition
    const dmg = Math.min(targetBal, Math.floor(sent / 1.30));
    targetPostBal -= dmg;
    if (sent > targetBal * 1.30) {
      const excess = sent - targetBal * 1.30;
      const gained = Math.min(targetTerr, Math.max(1, Math.floor(excess / 3.0)));
      myPostTerr += gained;
      targetPostTerr -= gained;
    }
  }

  // 3. Project outside spectators (they compound liquid interest uncontested)
  const projectedEnemies = [];
  let outsideLeaderCompoundedTerr = 0;
  let outsideLeaderCompoundedBal = 0;

  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (e.id === targetEnemy.id) {
      projectedEnemies.push({ id: e.id, bal: targetPostBal, terr: targetPostTerr });
    } else {
      // Outside spectator compounds at 3.5%
      const compBal = Math.min(100 * (e.terr || 1), Math.floor((e.bal || 0) * 1.035) + 3);
      projectedEnemies.push({ id: e.id, bal: compBal, terr: e.terr });
      if (compBal > outsideLeaderCompoundedBal) {
        outsideLeaderCompoundedBal = compBal;
        outsideLeaderCompoundedTerr = e.terr || 1;
      }
    }
  }

  // 4. Value of post-war state
  const postWarVal = evaluateStateValue(myPostTerr, myPostBal, projectedEnemies);
  const deltaValue = postWarVal - currentVal;

  // 5. Kingmaker Condition: if attacking a secondary player lowers our value and lets the outside leader pull ahead
  const isTargetLeader = targetTerr >= Math.max(...enemies.map(e => e.terr || 0));
  const kingmakerRisk = !isTargetLeader && !isCrush && deltaValue < -0.015;

  return { deltaValue, kingmakerRisk };
}

function createCounterfactualCandidateEngine() {
  const engine = Object.create(v2_5);

  engine.decide = function(S) {
    const enemies = S.adjEnemies || [];
    const isDuel = enemies.length <= 1 || S.isDuel;

    if (isDuel) {
      // Use Phase 4 Duel Logic
      const B = S.balance || 0;
      const hasFree = S.hasAdjFree || (S.freeLandRatio != null && S.freeLandRatio > 0.005);
      if (hasFree) return { action: 'expand', wantEnemy: false, preferNeutral: true, focusEnemyId: null, enemyBal: 0, reason: 'duel-expand' };
      if (enemies.length > 0) {
        const foe = enemies[0];
        return { action: 'fight', wantEnemy: true, preferNeutral: false, focusEnemyId: foe.id, enemyBal: foe.bal || 0, crushable: B > 0 && Math.floor(B / 8) > (foe.bal || 0), reason: 'duel-fight' };
      }
    }

    // Multiplayer Mode (N >= 3): Counterfactual Kingmaker Targeting
    const d = v2_5.decide(S);

    if (d.action === 'fight' && enemies.length > 1) {
      let bestTarget = null;
      let bestDelta = -Infinity;

      for (let i = 0; i < enemies.length; i++) {
        const foe = enemies[i];
        const cf = evaluateCounterfactualTarget(S, foe, 0.20);

        if (!cf.kingmakerRisk && cf.deltaValue > bestDelta) {
          bestDelta = cf.deltaValue;
          bestTarget = foe;
        }
      }

      if (bestTarget) {
        d.focusEnemyId = bestTarget.id;
        d.enemyBal = bestTarget.bal || 0;
        d.reason = 'counterfactual-optimal-target';
      } else if (bestDelta < -0.03 && (S.hasAdjFree || S.freeLandRatio > 0.02)) {
        // Kingmaker Veto: All attacks bleed us while outside leader wins; divert to neutral expansion!
        d.action = 'expand';
        d.reason = 'counterfactual-kingmaker-expand-veto';
      }
    }

    return d;
  };

  return engine;
}

console.log('================================================================================');
console.log(' PHASE 5: EVALUATING COUNTERFACTUAL KINGMAKER TARGETING ON VALIDATION SET');
console.log('================================================================================\n');

const candidate = createCounterfactualCandidateEngine();
let baseWins = 0;
let candWins = 0;

for (let i = 0; i < valSeeds.length; i++) {
  const seed = valSeeds[i];
  const mapType = ['voronoi', 'europe', 'world', 'archipelago'][i % 4];
  const numPlayers = (i % 2 === 0) ? 4 : 10;

  // Run Baseline
  const bSim = new RigorousMatchSimulation({ mapType, width: 80, height: 40, seed, maxTicks: 250, defenderAdvantage: 1.30 });
  bSim.addPlayer(1, 'Baseline', v2_5, { isV2: true });
  for (let p = 2; p <= numPlayers; p++) bSim.addPlayer(p, `VH-${p}`, new VeryHardBot(p, `VH-${p}`, seed + p * 13));
  const bRes = bSim.run();
  if (bRes.winner.id === 1) baseWins++;

  // Run Candidate on IDENTICAL seed
  const cSim = new RigorousMatchSimulation({ mapType, width: 80, height: 40, seed, maxTicks: 250, defenderAdvantage: 1.30 });
  cSim.addPlayer(1, 'Candidate-CF', candidate, { isV2: true });
  for (let p = 2; p <= numPlayers; p++) cSim.addPlayer(p, `VH-${p}`, new VeryHardBot(p, `VH-${p}`, seed + p * 13));
  const cRes = cSim.run();
  if (cRes.winner.id === 1) candWins++;

  if ((i + 1) % 15 === 0 || i === valSeeds.length - 1) {
    console.log(`  Match ${String(i + 1).padStart(2)} / ${valSeeds.length} | Candidate Wins: ${candWins} (${((candWins/(i+1))*100).toFixed(1)}%) | Baseline Wins: ${baseWins} (${((baseWins/(i+1))*100).toFixed(1)}%)`);
  }
}

const candWinRate = ((candWins / valSeeds.length) * 100).toFixed(1);
const baseWinRate = ((baseWins / valSeeds.length) * 100).toFixed(1);

console.log('\n================================================================================');
console.log(' COUNTERFACTUAL TARGETING VALIDATION RESULTS:');
console.log(`  Baseline Win Rate:   ${baseWins} / ${valSeeds.length} (${baseWinRate}%)`);
console.log(`  Candidate Win Rate:  ${candWins} / ${valSeeds.length} (${candWinRate}%)`);
console.log(`  Net Improvement:     +${(candWinRate - baseWinRate).toFixed(1)}%`);
console.log('================================================================================\n');

fs.writeFileSync(path.join(__dirname, 'phase5-cf-results.json'), JSON.stringify({ baseWins, candWins, candWinRate, baseWinRate }, null, 2));
