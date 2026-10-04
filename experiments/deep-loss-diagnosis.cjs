'use strict';
const path = require('path');
const fs = require('fs');
const { VeryHardBot, RigorousMatchSimulation } = require('./rigorous-simulator.cjs');

const seeds = JSON.parse(fs.readFileSync(path.join(__dirname, 'seeds-validation.json'), 'utf8'));

// Test candidate engine
function runDiagnostic(engine, name) {
  const mapTypes = ['voronoi', 'europe', 'world'];
  const playerCounts = [2, 3, 4, 6, 10];
  const totalMatches = 50;

  const losses = [];
  let wins = 0;

  for (let i = 0; i < totalMatches; i++) {
    const seed = seeds[i];
    const nPlayers = playerCounts[i % playerCounts.length];
    const mapType = mapTypes[i % mapTypes.length];
    const width = 80;
    const height = 40;

    const sim = new RigorousMatchSimulation({
      mapType,
      width,
      height,
      seed,
      maxTicks: 250,
      defenderAdvantage: 1.30,
      logTrajectory: true
    });

    sim.addPlayer(1, name, engine, { isV2: true });
    for (let p = 2; p <= nPlayers; p++) {
      sim.addPlayer(p, `VH-${p}`, new VeryHardBot(p, `VH-${p}`, seed + p * 31));
    }

    const res = sim.run();
    const cand = sim.players.find(p => p.id === 1);
    const candRank = res.rankings.findIndex(p => p.id === 1) + 1;

    if (res.winner.id === 1) {
      wins++;
    } else {
      losses.push({
        matchIdx: i,
        seed,
        nPlayers,
        mapType,
        candRank,
        winnerId: res.winner.id,
        winnerName: res.winner.name,
        winnerTerr: res.winner.territory,
        winnerBal: res.winner.balance,
        candAlive: cand.alive,
        candTerr: cand.territory,
        candBal: cand.balance,
        deathTick: cand.alive ? null : sim.tick,
        totalTicks: sim.tick,
        decisionsCount: cand.decisionsLog.length,
        lastDecisions: cand.decisionsLog.slice(-5)
      });
    }
  }

  console.log(`=== LOSS DIAGNOSIS FOR ${name} ===`);
  console.log(`Wins: ${wins}/${totalMatches} (${((wins/totalMatches)*100).toFixed(1)}%) | Losses: ${losses.length}`);

  // Categorize losses
  const categories = {
    EARLY_RUSHED_AND_KILLED: 0,   // died before tick 50
    MID_COMBAT_COLLAPSE: 0,       // died between tick 50 and 200
    LATE_SURVIVED_LAND_DEFICIT: 0, // alive at end, but winner had more land
    LATE_SURVIVED_LOW_BALANCE: 0,  // alive at end, low balance
    NEIGHBOR_DOGPILE: 0            // killed with multiple enemies
  };

  for (const l of losses) {
    if (!l.candAlive) {
      if (l.deathTick < 50) categories.EARLY_RUSHED_AND_KILLED++;
      else categories.MID_COMBAT_COLLAPSE++;
    } else {
      if (l.candBal > 500) categories.LATE_SURVIVED_LAND_DEFICIT++;
      else categories.LATE_SURVIVED_LOW_BALANCE++;
    }
  }

  console.log('\nLoss Categories:');
  for (const [k, v] of Object.entries(categories)) {
    console.log(`  ${k.padEnd(28)}: ${String(v).padStart(2)} (${((v/losses.length)*100).toFixed(1)}%)`);
  }

  console.log('\nSample Lost Matches (first 8):');
  for (const l of losses.slice(0, 8)) {
    console.log(`Match ${l.matchIdx} | Seed ${l.seed} | ${l.nPlayers}p ${l.mapType} | Rank ${l.candRank} | Alive: ${l.candAlive ? 'YES' : 'NO (tick ' + l.deathTick + ')'} | Cand T:${l.candTerr} B:${l.candBal} vs Winner T:${l.winnerTerr} B:${l.winnerBal}`);
  }
}

const v26Synthesis = {
  decide: function(S) {
    const B = S.balance || 0;
    const T = Math.max(1, S.territory || 1);
    const hasFree = S.hasAdjFree || (S.freeLandRatio != null && S.freeLandRatio > 0.005);
    const enemies = S.adjEnemies || [];
    const isDuel = S.isDuel === true || (enemies.length <= 1 && S.globalRank <= 2);
    const softCap = Math.min(100 * T, 1000000000);

    if (hasFree) return { action: 'expand', wantEnemy: false, preferNeutral: true, crushable: false };
    if (enemies.length === 0 || B < 30) return { action: 'hold', wantEnemy: false };

    let maxFoeBal = 0;
    for (const e of enemies) {
      if ((e.bal || 0) > maxFoeBal) maxFoeBal = e.bal || 0;
    }
    const crushFloor = Math.ceil(maxFoeBal / 7.5);
    const availBal = Math.max(0, B - crushFloor);

    // One-hit execution
    let bestExecFoe = null;
    let minExecReq = Infinity;
    let isCrushExec = false;

    for (const e of enemies) {
      const fBal = e.bal || 0;
      const isCrush = Math.floor(B / 8) > fBal;
      const req = isCrush ? Math.ceil(fBal / 0.9) + 2 : Math.ceil(fBal * 1.30) + 5;
      if (req <= availBal && req < minExecReq) {
        minExecReq = req;
        bestExecFoe = e;
        isCrushExec = isCrush;
      }
    }

    if (bestExecFoe) {
      return {
        action: 'fight',
        wantEnemy: true,
        crushable: isCrushExec,
        focusEnemyId: bestExecFoe.id,
        enemyBal: bestExecFoe.bal || 0,
        exactSent: minExecReq,
        reason: 'one-hit-execution'
      };
    }

    if (isDuel) {
      const foe = enemies[0];
      const fBal = foe.bal || 0;
      if (B >= fBal * 1.10 || T >= foe.terr) {
        return { action: 'fight', wantEnemy: true, crushable: false, focusEnemyId: foe.id, enemyBal: fBal, reason: 'duel-pressure' };
      }
      if (B < softCap * 0.80 && B < fBal) return { action: 'hold', wantEnemy: false, reason: 'duel-harvest' };
      return { action: 'fight', wantEnemy: true, crushable: false, focusEnemyId: foe.id, enemyBal: fBal, reason: 'duel-contest' };
    }

    if (B >= softCap * 0.80 && availBal >= 80) {
      let leaderFoe = null;
      let maxFoeTerr = 0;
      let weakestFoe = enemies[0];
      for (const e of enemies) {
        if ((e.terr || 0) > maxFoeTerr) { maxFoeTerr = e.terr || 0; leaderFoe = e; }
        if ((e.bal || 0) < (weakestFoe.bal || 0)) weakestFoe = e;
      }
      const target = (leaderFoe && maxFoeTerr > T * 1.25) ? leaderFoe : weakestFoe;
      return { action: 'fight', wantEnemy: true, crushable: false, focusEnemyId: target.id, enemyBal: target.bal || 0, reason: 'ffa-surplus-pressure' };
    }

    return { action: 'hold', wantEnemy: false, reason: 'ffa-compound-hold' };
  },

  planSpend: function(ctx) {
    const B = ctx.balance || 0;
    const isDuel = ctx.isDuel === true;
    const seq = ctx.attackSequence || 0;

    if (B < 30) return { canAfford: false, ratio: 0 };

    if (!ctx.wantEnemy) {
      if (isDuel) {
        const ratio = Math.max(0.14, Math.min(0.38, 0.38 * Math.exp(-seq * 0.05)));
        return { canAfford: true, ratio, reason: 'duel-expand' };
      } else {
        if (seq === 0) return { canAfford: true, ratio: 0.36, reason: 'ffa-open-0' };
        if (seq % 2 === 1) return { canAfford: false, ratio: 0, reason: 'ffa-open-compound-rest' };
        const ratio = Math.max(0.12, Math.min(0.24, 0.22 * Math.exp(-seq * 0.04)));
        return { canAfford: true, ratio, reason: 'ffa-open-paced' };
      }
    }

    if (ctx.exactSent != null && ctx.exactSent > 0) {
      const ratio = Math.min(0.70, ctx.exactSent / Math.max(1, B));
      return { canAfford: true, ratio, reason: 'one-hit-execution' };
    }

    if (ctx.crushable) return { canAfford: true, ratio: 0.45, reason: 'crush-spend' };
    if (isDuel) return { canAfford: true, ratio: 0.28, reason: 'duel-spend' };
    return { canAfford: true, ratio: 0.16, reason: 'ffa-surplus-spend' };
  },

  humanAttackDebit: function(bal, req) {
    const B = Math.max(0, bal | 0);
    const sent = Math.max(0, Math.min(B, req | 0));
    const tax = Math.floor(12 * B / 1024);
    return { sent, tax, debit: sent + tax, canAfford: B >= sent + tax };
  }
};

runDiagnostic(v26Synthesis, 'V2.6 Synthesis');
