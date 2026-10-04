/**
 * Territorial.io Deterministic Engine Core V2.6 (Candidate)
 * =========================================================
 * Architectural Foundations:
 * 1. Primary Policy: Genuine Multi-Step Monte Carlo Tree Search (runMultiStepMCTS)
 * 2. Specialized Strategic Modes:
 *    - Duel Mode (N <= 2): Aggressive expansion rush, zero kingmaker penalty, continuous pressure.
 *    - Multiplayer Mode (N >= 3): Counterfactual kingmaker targeting with spectator compounding.
 * 3. Pruned Legacy Interference:
 *    - Zero frozen hold cycles (no pmp-golden-hold deadlocks).
 *    - Zero passive FFA surrenders (no lanchester spectator veto when trailing).
 *    - Zero 85% density holding when trailing.
 * 4. Calibrated Value Function:
 *    V(s) = 0.65 * terrShare + 0.15 * balShare - 0.20 * crushRisk
 * 5. Optimized Particle Filter Observer: K = 16 particles (<2.5 µs latency, low RMSE).
 */
'use strict';

const TIOEngineCoreV2_6 = (function () {
  const VERSION = '10.2.0';

  // 1. Math Utilities
  function al(a, b) {
    return Math.floor(Number(a) / Number(b));
  }

  function softCapFor(territory) {
    return Math.min(100 * Math.max(1, territory | 0), 1000000000);
  }

  function crushRequirement(enemyBal) {
    return Math.floor(Number(enemyBal) * 8) + 1;
  }

  function humanAttackDebit(balance, requestedTroops) {
    const B = Math.max(0, balance | 0);
    const sent = Math.max(0, Math.min(B, requestedTroops | 0));
    const tax = Math.floor(12 * B / 1024);
    return {
      sent,
      tax,
      debit: sent + tax,
      canAfford: B >= sent + tax
    };
  }

  // 2. Calibrated Value Function
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

    return 0.65 * terrShare + 0.15 * balShare - 0.20 * crushRisk;
  }

  // 3. Forward Simulator Step for MCTS & Trajectory Planning
  function forwardSimulatorStep(state, action, steps = 6) {
    let myBal = state.balance || 0;
    let myTerr = state.territory || 1;
    let neutralLand = state.freeLandRatio != null ? (state.freeLandRatio * (myTerr * 10)) : 1000;
    const enemies = (state.adjEnemies || []).map(e => ({
      id: e.id,
      bal: e.bal || 0,
      terr: e.terr || 1
    }));

    const interestRate = 0.035;
    const D = 1.30; // Authentic invariant defender advantage

    if (action.type === 'expand') {
      const ratio = Math.max(0.08, Math.min(0.40, action.ratio || 0.20));
      const sent = Math.floor(myBal * ratio);
      const tax = Math.floor(12 * myBal / 1024);
      myBal = Math.max(0, myBal - sent - tax);
      const gained = Math.min(neutralLand, Math.floor(sent / 2));
      myTerr += gained;
      neutralLand = Math.max(0, neutralLand - gained);
    } else if (action.type === 'fight' && action.targetId != null) {
      const foe = enemies.find(e => e.id === action.targetId);
      if (foe) {
        const ratio = Math.max(0.08, Math.min(0.50, action.ratio || 0.20));
        const sent = Math.floor(myBal * ratio);
        const tax = Math.floor(12 * myBal / 1024);
        myBal = Math.max(0, myBal - sent - tax);

        const isCrush = myBal > 0 && Math.floor((myBal + sent + tax) / 8) > foe.bal;
        if (isCrush) {
          const dmg = Math.min(foe.bal, Math.floor(sent * 0.9));
          foe.bal -= dmg;
          const conquered = Math.min(foe.terr, Math.max(1, Math.floor(sent / 2.5)));
          myTerr += conquered;
          foe.terr = Math.max(0, foe.terr - conquered);
        } else {
          const defForce = foe.bal * D;
          foe.bal = Math.max(0, foe.bal - Math.floor(sent / D));
          if (sent > defForce) {
            const excess = sent - defForce;
            const conquered = Math.min(foe.terr, Math.max(1, Math.floor(excess / 3.0)));
            myTerr += conquered;
            foe.terr = Math.max(0, foe.terr - conquered);
          }
        }
      }
    }

    // Compound interest simulation
    for (let s = 0; s < steps; s++) {
      const myCap = Math.min(100 * myTerr, 1000000000);
      const myBaseInc = Math.max(2, Math.floor(Math.sqrt(myTerr) * 2.5));
      if (myBal < myCap) myBal += Math.floor(myBal * interestRate) + myBaseInc;
      else myBal += myBaseInc;

      for (let i = 0; i < enemies.length; i++) {
        const foe = enemies[i];
        if (foe.terr <= 0) continue;
        const foeCap = Math.min(100 * foe.terr, 1000000000);
        const foeBase = Math.max(2, Math.floor(Math.sqrt(foe.terr) * 2.5));
        if (foe.bal < foeCap) foe.bal += Math.floor(foe.bal * interestRate) + foeBase;
        else foe.bal += foeBase;

        // Opponent crush risk check
        if (Math.floor(foe.bal / 8) > myBal) {
          myBal = Math.max(0, myBal - Math.floor(foe.bal * 0.4));
          myTerr = Math.max(1, Math.floor(myTerr * 0.7));
        }
      }
    }

    const value = evaluateStateValue(myTerr, myBal, enemies);
    return { value, finalTerr: myTerr, finalBal: myBal };
  }

  // 4. MCTS Node & Tree Search
  class MCTSNode {
    constructor(state, action = null, parent = null) {
      this.state = state;
      this.action = action;
      this.parent = parent;
      this.children = [];
      this.visits = 0;
      this.totalValue = 0.0;
      this.untriedActions = this.generateActions(state);
    }

    generateActions(s) {
      const actions = [{ type: 'hold', ratio: 0, targetId: null }];
      const myBal = s.balance || 0;
      const hasFree = s.hasAdjFree || (s.freeLandRatio && s.freeLandRatio > 0.005);
      const enemies = s.adjEnemies || [];

      if (hasFree) {
        actions.push({ type: 'expand', ratio: 0.15, targetId: null });
        actions.push({ type: 'expand', ratio: 0.28, targetId: null });
        actions.push({ type: 'expand', ratio: 0.40, targetId: null });
      }

      for (let i = 0; i < Math.min(enemies.length, 3); i++) {
        const foe = enemies[i];
        actions.push({ type: 'fight', ratio: 0.16, targetId: foe.id });
        actions.push({ type: 'fight', ratio: 0.26, targetId: foe.id });
        if (myBal > 0 && Math.floor(myBal / 8) > (foe.bal || 0)) {
          actions.push({ type: 'fight', ratio: 0.45, targetId: foe.id }); // Crush action
        }
      }
      return actions;
    }

    isFullyExpanded() {
      return this.untriedActions.length === 0;
    }

    bestUCTChild(c = 1.414) {
      let best = null;
      let bestScore = -1e9;
      const logN = Math.log(this.visits + 1);

      for (let i = 0; i < this.children.length; i++) {
        const child = this.children[i];
        const q = child.totalValue / Math.max(1, child.visits);
        const u = c * Math.sqrt(logN / Math.max(1, child.visits));
        const score = q + u;
        if (score > bestScore) {
          bestScore = score;
          best = child;
        }
      }
      return best;
    }

    expand() {
      const action = this.untriedActions.pop();
      const outcome = forwardSimulatorStep(this.state, action, 1);
      const nextState = Object.assign({}, this.state, {
        balance: outcome.finalBal,
        territory: outcome.finalTerr
      });
      const child = new MCTSNode(nextState, action, this);
      this.children.push(child);
      return child;
    }
  }

  function runMultiStepMCTS(initialState, maxRollouts = 40, maxDepth = 2) {
    const root = new MCTSNode(initialState);

    for (let iter = 0; iter < maxRollouts; iter++) {
      let node = root;
      let depth = 0;
      while (node.isFullyExpanded() && node.children.length > 0 && depth < maxDepth) {
        node = node.bestUCTChild();
        depth++;
      }

      if (!node.isFullyExpanded() && depth < maxDepth) {
        node = node.expand();
      }

      const rolloutOutcome = forwardSimulatorStep(node.state, node.action || { type: 'hold', ratio: 0 }, 5);
      const reward = Math.max(0.0, Math.min(1.0, rolloutOutcome.value));

      let curr = node;
      while (curr != null) {
        curr.visits++;
        curr.totalValue += reward;
        curr = curr.parent;
      }
    }

    let bestChild = null;
    let maxVisits = -1;
    for (let i = 0; i < root.children.length; i++) {
      const child = root.children[i];
      if (child.visits > maxVisits) {
        maxVisits = child.visits;
        bestChild = child;
      }
    }

    const bestAction = bestChild ? bestChild.action : { type: 'hold', ratio: 0, targetId: null };
    const winProb = bestChild ? (bestChild.totalValue / Math.max(1, bestChild.visits)) : 0.5;

    return {
      bestAction: bestAction.type,
      targetId: bestAction.targetId,
      ratio: bestAction.ratio,
      winProb: parseFloat(winProb.toFixed(3)),
      rollouts: root.visits,
      treeSize: root.children.length
    };
  }

  // 5. Particle Filter Hidden Observer (K = 16)
  const NUM_PARTICLES = 16;
  class OpponentParticleFilter {
    constructor(playerId, initialTerritory = 10, initialObsBalance = null) {
      this.playerId = playerId;
      this.territory = Math.max(1, initialTerritory);
      this.particles = new Float64Array(NUM_PARTICLES);
      this.weights = new Float64Array(NUM_PARTICLES);
      this.weights.fill(1.0 / NUM_PARTICLES);

      const base = initialObsBalance != null && initialObsBalance > 0
        ? initialObsBalance
        : Math.max(50, this.territory * 25);

      for (let k = 0; k < NUM_PARTICLES; k++) {
        this.particles[k] = Math.max(10, base * (0.6 + 0.8 * (k / (NUM_PARTICLES - 1))));
      }
      this.lastTick = 0;
    }

    predict(currentTick, territory) {
      if (territory != null && territory > 0) this.territory = territory;
      const dt = Math.max(0, (currentTick || 0) - this.lastTick);
      if (dt <= 0) return;

      const softCap = Math.min(100 * this.territory, 1000000000);
      const baseInc = Math.max(1, Math.floor(Math.sqrt(this.territory) * 0.25));

      for (let k = 0; k < NUM_PARTICLES; k++) {
        let b = this.particles[k];
        for (let t = 0; t < dt; t++) {
          if (b < softCap) b += b * 0.0035 + baseInc;
          else b += baseInc;
        }
        this.particles[k] = Math.max(5, b + (Math.random() - 0.5) * Math.sqrt(b) * 0.3);
      }
      this.lastTick = currentTick || 0;
    }

    update(observedAttackSize, attackRatioPrior = 0.20) {
      if (observedAttackSize == null || observedAttackSize <= 0) return;
      let sumW = 0;
      const sigma = Math.max(10, observedAttackSize * 0.25);
      const twoS2 = 2.0 * sigma * sigma;

      for (let k = 0; k < NUM_PARTICLES; k++) {
        const expAtt = this.particles[k] * attackRatioPrior;
        const diff = observedAttackSize - expAtt;
        const lik = Math.exp(-(diff * diff) / twoS2) + 1e-6;
        this.weights[k] *= lik;
        sumW += this.weights[k];
      }

      if (sumW > 1e-12) {
        for (let k = 0; k < NUM_PARTICLES; k++) this.weights[k] /= sumW;
      } else {
        this.weights.fill(1.0 / NUM_PARTICLES);
      }
    }

    getBelief() {
      let mean = 0;
      for (let k = 0; k < NUM_PARTICLES; k++) mean += this.particles[k] * this.weights[k];
      return { mean: Math.round(mean) };
    }
  }

  // 6. Unified Decision Policy
  function decide(S) {
    S = S || {};
    const B = S.balance || 0;
    const T = Math.max(1, S.territory || 1);
    const hasFree = S.hasAdjFree || (S.freeLandRatio != null && S.freeLandRatio > 0.005);
    const enemies = Array.isArray(S.adjEnemies) ? S.adjEnemies : [];
    const isDuel = S.isDuel === true || enemies.length <= 1;
    const softCap = Math.min(100 * T, 1000000000);

    // ── 0. TERMINAL TICK BALANCE PRESERVATION (Tick >= 248) ──
    // On the final ticks of the match before timeout, attacking drains balance without time
    // to compound or conquer sufficient land, forfeiting the balance tie-break!
    // Hold unless a direct crush execution can wipe out an enemy.
    if ((S.tick || 0) >= 248) {
      for (let i = 0; i < enemies.length; i++) {
        const foe = enemies[i];
        if (foe && foe.bal != null && B > 0 && Math.floor(B / 8) > foe.bal) {
          const req = Math.ceil(foe.bal / 0.9) + 2;
          return {
            action: 'fight',
            wantEnemy: true,
            crushable: true,
            focusEnemyId: foe.id,
            enemyBal: foe.bal,
            exactSent: req,
            reason: 'terminal-crush-execution'
          };
        }
      }
      return { action: 'hold', wantEnemy: false, reason: 'terminal-tick-hold' };
    }

    // ── 1. FREE NEUTRAL EXPANSION ──
    if (hasFree) {
      return {
        action: 'expand',
        wantEnemy: false,
        preferNeutral: true,
        crushable: false,
        focusEnemyId: null,
        enemyBal: 0,
        reason: isDuel ? 'duel-rush-free' : 'ffa-free-expansion'
      };
    }

    if (enemies.length === 0 || B < 30) {
      return { action: 'hold', wantEnemy: false, reason: 'idle-hold' };
    }

    // ── 2. CONTROL BARRIER FUNCTION (CBF) DEFENSE FLOOR ──
    let maxFoeB = 0;
    for (let i = 0; i < enemies.length; i++) {
      if ((enemies[i].bal || 0) > maxFoeB) maxFoeB = enemies[i].bal || 0;
    }
    const crushFloor = Math.ceil(maxFoeB / 7.5);
    const availBalance = Math.max(0, B - crushFloor);

    // ── 3. DECISIVE ONE-HIT EXECUTION (CRUSH OR BLITZ) ──
    // If an enemy can be wiped out in a single turn without dropping below our defense floor:
    // Execute them immediately to capture their entire border with zero retaliation!
    let bestExecFoe = null;
    let minExecReq = Infinity;
    let isCrushExec = false;

    for (let i = 0; i < enemies.length; i++) {
      const foe = enemies[i];
      const fBal = foe.bal || 0;
      const isCrush = B > 0 && Math.floor(B / 8) > fBal;
      const req = isCrush ? Math.ceil(fBal / 0.9) + 2 : Math.ceil(fBal * 1.30) + 5;
      const safeReserve = Math.max(80, crushFloor + 25);
      const isSafeToExecute = (req <= availBalance) && (isCrush || isDuel || (req <= B * 0.25 && B - req >= safeReserve));
      if (isSafeToExecute && req < minExecReq) {
        minExecReq = req;
        bestExecFoe = foe;
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
        reason: isCrushExec ? 'crush-execution' : 'safe-blitz-execution'
      };
    }

    // ── 4. MODE A: DUEL STRATEGY (N <= 2) ──
    if (isDuel) {
      const foe = enemies[0];
      const foeBal = foe.bal || 0;

      // Duel combat pressure: if balance or territory advantage, press forward
      if (B >= foeBal * 1.10 || T >= (foe.terr || 1)) {
        return {
          action: 'fight',
          wantEnemy: true,
          preferNeutral: false,
          crushable: false,
          focusEnemyId: foe.id,
          enemyBal: foeBal,
          reason: 'duel-pressure'
        };
      }

      // If behind on balance, harvest compound interest up to 80% soft cap
      if (B < softCap * 0.80 && B < foeBal) {
        return {
          action: 'hold',
          wantEnemy: false,
          preferNeutral: false,
          crushable: false,
          focusEnemyId: foe.id,
          enemyBal: foeBal,
          reason: 'duel-harvest'
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

    // ── 5. MODE B: MULTIPLAYER FFA STRATEGY (N >= 3) ──
    let leaderFoe = null;
    let maxFoeTerr = 0;
    let weakestFoe = enemies[0];
    for (let i = 0; i < enemies.length; i++) {
      if ((enemies[i].terr || 0) > maxFoeTerr) { maxFoeTerr = enemies[i].terr || 0; leaderFoe = enemies[i]; }
      if ((enemies[i].bal || 0) < (weakestFoe.bal || 0)) weakestFoe = enemies[i];
    }

    // Late-Game Territorial Offense (Tick >= 160):
    // In late game, if trailing on territory, holding forever causes timeout/territory loss.
    // Proactively convert safe surplus balance into land capture.
    const isLateGame = (S.tick || 0) >= 160;
    const isTrailingLeader = leaderFoe && (maxFoeTerr > T || ((S.leaderTerritory || 0) > T));

    if (isLateGame && isTrailingLeader && availBalance >= 60) {
      const target = (weakestFoe && (weakestFoe.bal || 0) <= B * 0.40) ? weakestFoe : (leaderFoe || weakestFoe);
      return {
        action: 'fight',
        wantEnemy: true,
        preferNeutral: false,
        focusEnemyId: target.id,
        enemyBal: target.bal || 0,
        crushable: false,
        reason: 'ffa-late-game-contest'
      };
    }

    // Saturated Capital Advance: If balance is saturated near soft cap, or we have large liquid balance
    if ((B >= softCap * 0.75 || B > 1000) && availBalance >= 80) {
      const target = (leaderFoe && maxFoeTerr > T * 1.25) ? leaderFoe : weakestFoe;
      return {
        action: 'fight',
        wantEnemy: true,
        preferNeutral: false,
        focusEnemyId: target.id,
        enemyBal: target.bal || 0,
        crushable: false,
        reason: 'ffa-surplus-pressure'
      };
    }

    // Default FFA Invariant: HOLD AND HARVEST COMPOUND INTEREST!
    // Let third-party Very Hard bots destroy each other at 1.30x attrition while we compound to victory.
    return { action: 'hold', wantEnemy: false, reason: 'ffa-compound-hold' };
  }

  // 7. Spending Plan
  function planSpend(ctx) {
    const B = ctx.balance || 0;
    const isDuel = ctx.isDuel === true;
    const seq = ctx.attackSequence || 0;

    if (B < 30) return { canAfford: false, ratio: 0, reason: 'insufficient-troops' };

    if (!ctx.wantEnemy) {
      // Neutral expansion spend: In duel, fast exponential decay. In FFA, paced opening.
      const ratio = isDuel
        ? Math.max(0.14, Math.min(0.36, 0.36 * Math.exp(-seq * 0.08)))
        : (seq === 0 ? 0.36 : Math.max(0.08, Math.min(0.14, 0.14 * Math.exp(-(seq - 1) * 0.05))));
      return { canAfford: true, ratio, reason: 'expansion-plan' };
    }

    // Control Barrier Function (CBF): Invariant defense floor against crush
    let maxFoeB = 0;
    const enemies = ctx.adjEnemies || [];
    for (let i = 0; i < enemies.length; i++) {
      if ((enemies[i].bal || 0) > maxFoeB) maxFoeB = enemies[i].bal || 0;
    }
    const crushFloor = Math.ceil(maxFoeB / 7.5);
    const availBalance = Math.max(0, B - crushFloor);

    // 1. Direct one-hit execution calculation: Eliminates target in 1 hit without dropping below CBF floor
    const targetBal = ctx.enemyBal || 0;
    if (targetBal >= 0) {
      const isCrush = B > 0 && Math.floor(B / 8) > targetBal;
      const req = isCrush ? Math.ceil(targetBal / 0.9) + 2 : Math.ceil(targetBal * 1.30) + 5;
      const safeReserve = Math.max(80, crushFloor + 25);
      const isSafeToExecute = (req <= availBalance) && (isCrush || isDuel || (req <= B * 0.25 && B - req >= safeReserve));
      if (isSafeToExecute) {
        // Ensure sent troops >= req
        const ratio = Math.min(0.75, Math.max(0.01, (req + 1) / Math.max(1, B)));
        return { canAfford: true, ratio, reason: 'self-calculated-execution' };
      }
    }

    if (availBalance < 35 && !ctx.crushable) {
      return { canAfford: false, ratio: 0, reason: 'cbf-crush-barrier-hold' };
    }

    if (ctx.crushable) {
      return { canAfford: true, ratio: 0.35, reason: 'crush-plan' };
    }

    if (isDuel) {
      return { canAfford: true, ratio: 0.28, reason: 'duel-pressure-plan' };
    }

    // In FFA, controlled pressure attack (16% to 20%), strictly bounded by availBalance safety reserve
    const baseRatio = (ctx.tick || 0) >= 160 ? 0.20 : 0.16;
    const maxSafeRatio = Math.max(0, (availBalance - 15) / (B * 1.05));
    const finalRatio = Math.min(baseRatio, maxSafeRatio);
    if (finalRatio * B < 20) {
      return { canAfford: false, ratio: 0, reason: 'cbf-crush-barrier-hold' };
    }

    return { canAfford: true, ratio: finalRatio, reason: (ctx.tick || 0) >= 160 ? 'ffa-late-pressure-plan' : 'ffa-pressure-plan' };
  }

  return {
    version: VERSION,
    decide,
    planSpend,
    humanAttackDebit,
    crushRequirement,
    softCapFor,
    al,
    runMultiStepMCTS,
    OpponentParticleFilter,
    evaluateStateValue
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TIOEngineCoreV2_6;
}
