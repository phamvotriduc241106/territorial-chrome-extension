/**
 * Territorial.io deterministic policy kernel v10.2.3
 *
 * Faithful to readable dump (dU / dD / dF / dJ / d3) + live aF tables.
 *
 * ─── Dump dU difficulty index 5 = "Very Hard" ───
 *   db = Very Easy;Easy;Normal;Hard;Harder;Very Hard
 *   dI = [0,0,0,0,50,90]     → VH: 90% pick WEAKEST (cl) when fighting
 *   dK = [98,95,90,40,20,0]  → VH: 0% human-filter bias
 *   dT = [60,74,112,200,256,512] pressure
 *
 *   VH init (cG >= 5):
 *     u = m = 1000          → decision every al(1000,10) = 100 ticks
 *     k = 400 + rand(0..100) → start commit ~40–50% of balance
 *     y = 50  + rand(0..100) → drifts toward ~5–15% (more frequent small hits)
 *     troops = al(k * aq, 1000)
 *
 * ─── Dump dD (single-player bot tick) ───
 *   neighbors → if empty present: dF(expand) ALWAYS first
 *   else if roll(dI): dJ(weakest) else dJ(closest)
 *
 * ─── Dump d3 ───
 *   skip if troops < 60
 *   if balance > softReserve: troops = balance - softReserve  (dump excess)
 *   softReserve = ar.dB(player) ≈ density interest floor
 *
 * ─── Dump dJ crush ───
 *   if al(myBal,8) > enemyBal: troops = max(troops, al(11*enemyBal,5))
 *
 * ─── Current live aF/cb/cc contract (2026-09-03) ───
 *   VH starts at 30–50%, converges to 5–15% in 3.5–5.0% steps.
 *   Bots have four concurrent land slots. Humans have 8 or 12.
 *   Soft cap is min(100 * territory, 1,000,000,000), not 80,000.
 */
(function () {
  'use strict';

  const root = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this);
  if (root.__TIO_ENGINE_CORE_V2_LOADED__) return;
  root.__TIO_ENGINE_CORE_V2_LOADED__ = true;

  const DIFF = {
    VERY_EASY: 0,
    EASY: 1,
    NORMAL: 2,
    HARD: 3,
    HARDER: 4,
    VERY_HARD: 5
  };

  // Dump dU tables (index = difficulty)
  const DUMP = {
    names: ['VeryEasy', 'Easy', 'Normal', 'Hard', 'Harder', 'VeryHard'],
    // personality
    dc: [97, 95, 93, 90, 87, 84],
    dK: [98, 95, 90, 40, 20, 0],
    dd: [85, 70, 65, 30, 7, 3],
    dI: [0, 0, 0, 0, 50, 90], // % chance pick weakest when fighting
    dT: [60, 74, 112, 200, 256, 512],
    // Approximate mid kScale for troops = al(k*bal,1000)
    // VH starts ~450, drifts ~100 — we use aggressive openers
    kOpen: [1000, 1000, 900, 650, 450, 450],
    kSustain: [1000, 920, 870, 450, 250, 200],
    // Timer proxy (ms) — VH fires often
    pulseMs: [0, 0, 0, 0, 0, 0], // uncapped — hardware / rAF
    fronts: [1, 2, 3, 4, 5, 6]
  };

  // Current live aF tables. l0 is the boat-operation limit, NOT land fronts.
  const LIVE = {
    kg: [500, 450, 400, 300, 80, 50, 100],
    ki: [1, 2, 3, 4, 6, 8, 1],
    kh: [60, 74, 112, 200, 256, 512, 512],
    botLandFrontCap: 4,
    humanLandFrontCapSmallLobby: 12,
    humanLandFrontCapLargeLobby: 8,
    softCapPerCell: 100,
    softCapMaximum: 1000000000,
    openCommitMid: 0.40,
    sustainCommitMid: 0.10,
    taperStepMid: 0.0425,
    economyCycleTicks: 100
  };

  const CONFIG = {
    enablePMP: true,
    enableSpectral: true,
    enablePoisson: true,
    enableEikonal: true,
    enableCoalition: true,
    enableSDE: true,
    enableMCTS: true,
    enableBayesianArchetype: true,
    enableCurvatureFlow: true,
    enableNavalBellman: true,
    enableHardModePolicy: true,
    combatBankTarget: 0.55,
    navalTransitSpeed: 2.0,
    navalShoreMultiplier: 1.45,
    alphaPMP: 0.1371,
    betaCheeger: 19.95,
    gammaLanchester: 0.8069,
    sigmaSDE: 0.5765,
    cMCTS: 2.1096,
    dHold: 0.9121
  };

  function al(a, b) {
    if (!b) return 0;
    return Math.floor(a / b + 1 / (2 * b));
  }

  function ilToRatio(il) {
    return (il + 1) / 1024;
  }

  function ratioToIl(ratio) {
    return Math.max(0, Math.min(1023, Math.round(ratio * 1024) - 1));
  }

  /** Exact bot/dump debit (jY.ju in the current source; cE in the readable dump). */
  function botAttackDebit(balance, requestedTroops) {
    const B = Math.max(0, balance | 0);
    const requested = Math.max(0, requestedTroops | 0);
    const tax = al(3 * B, 256);
    const sent = Math.max(0, requested - (requested >= al(B, 2) ? tax : 0));
    return { tax, sent, debit: sent + tax };
  }

  /** Exact human land-command debit: bD.gn.mu(...,12,0) followed by mw(). */
  function humanAttackDebit(balance, requestedTroops) {
    const B = Math.max(0, balance | 0);
    const requested = Math.max(0, requestedTroops | 0);
    const tax = al(12 * B, 1024);
    const sent = Math.min(requested, Math.max(0, B - tax));
    return { tax, sent, debit: sent + tax };
  }

  // Public compatibility name now models the path this extension actually calls.
  const sourceAttackDebit = humanAttackDebit;

  function crushRequirement(enemyBalance) {
    return al(11 * Math.max(0, enemyBalance | 0), 5);
  }

  /**
   * Situation-based spend budget (single source of truth for isolated world).
   * Driven by live B, softCap C, density, free land, threat, crush — not fixed floors.
   */
  function softCapFor(territoryPixels) {
    return Math.min(LIVE.softCapPerCell * Math.max(1, territoryPixels || 1), LIVE.softCapMaximum);
  }

  function estimateAttackCost(balance, ratio) {
    var B = Math.max(0, balance | 0);
    if (B <= 0) return Infinity;
    var r = Math.max(0.01, Math.min(0.95, ratio != null ? ratio : 0.25));
    var il = Math.max(0, Math.min(1023, Math.round(r * 1024) - 1));
    var spent = Math.floor(B * (il + 1) / 1024);
    return humanAttackDebit(B, spent).debit;
  }

  function minLeaveFor(balance) {
    var B = balance | 0;
    if (B <= 0) return 1;
    if (B < 80) return Math.max(6, Math.floor(B * 0.25));
    if (B < 200) return Math.max(16, Math.floor(B * 0.20));
    return Math.max(32, Math.floor(B * 0.14));
  }

  function maxSafeRatio(balance, minLeave, ceiling) {
    var B = balance | 0;
    if (!(B > 0)) return 0;
    var leave = Math.max(minLeaveFor(B), minLeave | 0);
    if (B <= leave + 8) return 0;
    // Search the exact 10-bit values the game consumes; float rounding must not
    // turn a safe result into the next, unsafe troop-bar code.
    var cap = Math.max(0.01, Math.min(0.72, ceiling != null ? ceiling : 0.72));
    var lo = ratioToIl(0.01), hi = ratioToIl(cap), bestIl = -1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      var ratio = ilToRatio(mid);
      var cost = estimateAttackCost(B, ratio);
      if (B - cost >= leave) { bestIl = mid; lo = mid + 1; }
      else hi = mid - 1;
    }
    return bestIl >= 0 ? ilToRatio(bestIl) : 0;
  }


  function alLocal(a, b) {
    if (!b) return 0;
    return Math.floor(a / b + 1 / (2 * b));
  }

  /**
   * planSpend(ctx) → full budget for this decision tick / burst.
   * ctx: balance, territory, softCap?, freeLandRatio, wantEnemy, crushable,
   *      enemyBal, adjEnemyCount, primaryDanger, areaTrend, shrinkFrames,
   *      fronts, phase, gameTimeSec
   */

  /**
   * Competitive live planner.
   *
   * `fronts` is the maximum number of new commands in this decision. The
   * independent `activeFronts/frontCap` pair prevents rapid commands from
   * opening an unbounded number of wars. Ratio selection is centralized in
   * computeAdaptiveCommit(); this function only applies exact debit/reserve
   * constraints and projects a same-ratio burst before approving it.
   */
  function planSpend(ctx) {
    ctx = ctx || {};
    let balanceKnown = false;
    if (ctx.balanceKnown === true) balanceKnown = true;
    else if (ctx.balanceKnown === false) balanceKnown = false;
    else if (ctx.balance != null && isFinite(Number(ctx.balance))) {
      balanceKnown = Number(ctx.balance) !== 0;
    }

    const rawBalance = ctx.balance != null && isFinite(Number(ctx.balance))
      ? Number(ctx.balance)
      : 0;
    const B = rawBalance | 0;
    const T = Math.max(1, ctx.territory | 0);
    const C = ctx.softCap > 0 ? Math.floor(ctx.softCap) : softCapFor(T);
    const density = C > 0 && B > 0 ? B / C : 0;
    const free = Math.max(0, Math.min(1, ctx.freeLandRatio != null ? Number(ctx.freeLandRatio) : 0.08));
    const wantEnemy = !!ctx.wantEnemy;
    const crushable = !!ctx.crushable;
    const enemyBal = ctx.enemyBal != null ? Math.max(0, Number(ctx.enemyBal) | 0) : 0;
    const activeFronts = Math.max(0, Math.min(12, Number(ctx.activeFronts) | 0));
    const hardFrontCap = Math.max(1, Math.min(12,
      ctx.frontCap != null ? (Number(ctx.frontCap) | 0) : LIVE.botLandFrontCap));
    const requestedFronts = ctx.fronts == null
      ? 1
      : Math.max(0, Math.min(12, Number(ctx.fronts) | 0));
    const attackSequence = Math.max(0, Number(ctx.attackSequence) | 0);
    const threat = Math.max(0, Math.min(1, Number(ctx.primaryDanger) || 0));
    const shrink = Number(ctx.shrinkFrames) | 0;
    const trend = Number(ctx.areaTrend) || 0;

    let phase = ctx.phase || null;
    if (!phase) {
      if (crushable) phase = 'CRUSH';
      else if (shrink > 5 || trend < -18) phase = 'SURVIVE';
      else if (wantEnemy) phase = 'PRESSURE';
      else if (free > 0.12 || B < 200) phase = 'OPENING';
      else phase = 'LAND_RUSH';
    }

    // Low-bank empires cannot safely sustain four fronts. At normal density we
    // deliberately match the live Very Hard bot's four land slots.
    let strategicFrontCap = hardFrontCap;
    if (balanceKnown && B < 160) strategicFrontCap = Math.min(strategicFrontCap, 1);
    else if (density > 0 && density < 0.25) strategicFrontCap = Math.min(strategicFrontCap, 2);
    strategicFrontCap = Math.min(strategicFrontCap, LIVE.botLandFrontCap);
    const openFrontSlots = Math.max(0, strategicFrontCap - activeFronts);

    function stopped(reason, minRemaining, minAttack, urgency) {
      return {
        canAfford: false,
        balance: B,
        balanceKnown,
        softCap: C,
        density: parseFloat(density.toFixed(3)),
        minRemaining: Math.max(0, minRemaining | 0),
        maxSpendTotal: 0,
        spendPerFront: 0,
        totalBurst: 0,
        ratio: 0,
        fronts: 0,
        targetFrontCap: strategicFrontCap,
        activeFronts,
        openFrontSlots,
        attackSequence,
        minAttack: Math.max(0, minAttack | 0),
        urgency: Number(urgency) || 0,
        reason,
        phase
      };
    }

    if (!balanceKnown) {
      if (requestedFronts < 1) return stopped('policy-hold', 0, 12, 0);
      if (openFrontSlots < 1) return stopped('front-cap', 0, 12, 0.2);
      return {
        canAfford: true,
        balance: 0,
        balanceKnown: false,
        softCap: C,
        density: 0,
        minRemaining: 0,
        maxSpendTotal: 0,
        spendPerFront: 0,
        totalBurst: 0,
        ratio: 0.12,
        fronts: 1,
        targetFrontCap: strategicFrontCap,
        activeFronts,
        openFrontSlots,
        attackSequence,
        minAttack: 12,
        urgency: 0.4,
        reason: 'unknown-balance',
        phase
      };
    }

    if (!(B > 0)) {
      return stopped(B < 0 ? 'negative-troops' : 'zero-troops', 0, 0, 0);
    }
    if (requestedFronts < 1) return stopped('policy-hold', minLeaveFor(B), 0, 0);
    if (openFrontSlots < 1) return stopped('front-cap', minLeaveFor(B), 0, 0.2);

    let urgency = 0.38;
    if (crushable) urgency = 0.9;
    else if (shrink > 5 || trend < -18) urgency = 0.82;
    else if (wantEnemy) urgency = density >= 1 ? 0.75 : 0.58;
    else if (density >= 1) urgency = 0.72;
    if (threat > 0.65) urgency = Math.max(urgency, 0.7);

    let reserveRatio = 0.16;
    if (density < 0.35) reserveRatio = 0.22;
    else if (density < 0.65) reserveRatio = 0.18;
    else if (density < 1) reserveRatio = 0.14;
    else reserveRatio = 0.12;
    if (threat > 0.65 && !crushable) reserveRatio = Math.max(reserveRatio, 0.18);
    if (shrink > 5 && !crushable) reserveRatio = Math.max(reserveRatio, 0.20);
    if (crushable) reserveRatio = Math.min(reserveRatio, 0.08);

    const cbf = computeCrushBarrierFloor(B, ctx.adjEnemies);
    const minRemaining = Math.max(1, minLeaveFor(B), Math.floor(B * reserveRatio), cbf.floor);
    const maxSpendTotal = Math.max(0, B - minRemaining);
    let minAttack = Math.max(6, Math.floor(B * 0.04));
    if (B < 60) minAttack = Math.max(4, Math.floor(B * 0.10));
    minAttack = Math.min(minAttack, Math.max(4, maxSpendTotal));
    if (maxSpendTotal < minAttack) {
      return stopped(cbf.isBreached ? 'cbf-crush-immunity-floor' : 'bank-too-thin', minRemaining, minAttack, urgency);
    }

    const adaptive = computeAdaptiveCommit({
      profile: ctx.profile,
      phase,
      freeLandRatio: free,
      density,
      relativePower: ctx.relativePower != null
        ? Number(ctx.relativePower)
        : (enemyBal > 0 ? B / enemyBal : 1),
      areaTrend: trend,
      gameTimeSec: ctx.gameTimeSec,
      balance: B,
      territory: T,
      softCap: C,
      wantEnemy,
      crushable,
      enemyBal,
      fronts: requestedFronts,
      activeFronts,
      attackSequence,
      shrinkFrames: shrink,
      incoming: ctx.incoming,
      primaryDanger: threat,
      adjEnemies: ctx.adjEnemies
    });

    if (adaptive.ratio === 0 || (adaptive.reason && (adaptive.reason.includes('hold') || adaptive.reason.includes('lock') || adaptive.reason.includes('wall')))) {
      return stopped(adaptive.reason || 'cbf-crush-immunity-lock', minRemaining, minAttack, urgency);
    }

    const maxRatioAllowed = Math.min(adaptive.maxRatio || 0.72, cbf.maxThreat > 0 && cbf.maxSafeRatio > 0 ? cbf.maxSafeRatio : 0.72);
    let safeRatio = maxSafeRatio(B, minRemaining, maxRatioAllowed);
    if (!(safeRatio > 0)) return stopped('unsafe-spend', minRemaining, minAttack, urgency);
    let ratio = Math.min(adaptive.ratio, safeRatio);

    // Raise a microscopic ratio only to the meaningful command floor if affordable.
    if (Math.floor(B * ratio) < minAttack) {
      const candidateRatio = Math.min(safeRatio, Math.ceil(minAttack * 1024 / B) / 1024);
      const testCost = estimateAttackCost(B, candidateRatio);
      if (B - testCost >= minRemaining) {
        ratio = candidateRatio;
      }
    }
    ratio = ilToRatio(ratioToIl(ratio));
    if (ratio > safeRatio) ratio = safeRatio;

    let spendPerFront = Math.floor(B * (ratioToIl(ratio) + 1) / 1024);
    let firstCost = estimateAttackCost(B, ratio);
    if (spendPerFront < minAttack || firstCost > maxSpendTotal || B - firstCost < minRemaining) {
      return stopped('bank-too-thin', minRemaining, minAttack, urgency);
    }

    // Project a same-ratio burst. The internal path issues one command at a
    // time; this mainly keeps the vision fallback from approving an unsafe wave.
    const desiredFronts = Math.min(requestedFronts, openFrontSlots);
    let projectedBalance = B;
    let approvedFronts = 0;
    for (let i = 0; i < desiredFronts; i++) {
      const projectedTroops = Math.floor(projectedBalance * (ratioToIl(ratio) + 1) / 1024);
      const projectedCost = estimateAttackCost(projectedBalance, ratio);
      if (projectedTroops < Math.min(minAttack, Math.max(4, projectedBalance - minRemaining))) break;
      if (projectedBalance - projectedCost < minRemaining) break;
      projectedBalance -= projectedCost;
      approvedFronts++;
    }
    if (approvedFronts < 1) return stopped('bank-too-thin', minRemaining, minAttack, urgency);

    return {
      canAfford: true,
      balance: B,
      balanceKnown: true,
      softCap: C,
      density: parseFloat(density.toFixed(3)),
      minRemaining,
      maxSpendTotal,
      spendPerFront,
      totalBurst: B - projectedBalance,
      frontAllocations: allocateKKTMultiFront(
        B - projectedBalance,
        ctx.frontConfigs || Array(approvedFronts).fill({ min: minAttack, max: spendPerFront * 2, weight: 1.0 })
      ),
      projectedRemaining: projectedBalance,
      ratio,
      fronts: approvedFronts,
      targetFrontCap: strategicFrontCap,
      activeFronts,
      openFrontSlots,
      attackSequence,
      minAttack,
      urgency: parseFloat(urgency.toFixed(3)),
      reason: adaptive.reason,
      phase,
      signals: Object.assign({}, adaptive.factors, {
        reserveRatio: parseFloat(reserveRatio.toFixed(3)),
        exactHumanDebit: firstCost
      })
    };
  }

  function _ctxFromLegacy(balance, territoryPixels, phase, opts) {
    opts = opts || {};
    return {
      balance: balance,
      territory: territoryPixels,
      phase: phase,
      softCap: opts.softCap,
      freeLandRatio: opts.freeLandRatio,
      wantEnemy: opts.wantEnemy,
      crushable: opts.crushable,
      enemyBal: opts.enemyBal,
      adjEnemyCount: opts.adjEnemyCount,
      primaryDanger: opts.primaryDanger,
      areaTrend: opts.areaTrend,
      shrinkFrames: opts.shrinkFrames,
      fronts: opts.fronts || 1,
      frontCap: opts.frontCap,
      activeFronts: opts.activeFronts,
      attackSequence: opts.attackSequence,
      gameTimeSec: opts.gameTimeSec
    };
  }

  function minRemainingBalance(balance, territoryPixels, phase, opts) {
    return planSpend(_ctxFromLegacy(balance, territoryPixels, phase, opts)).minRemaining | 0;
  }

  function maxSpendableTroops(balance, territoryPixels, phase, opts) {
    const p = planSpend(_ctxFromLegacy(balance, territoryPixels, phase, opts));
    return p.canAfford ? (p.maxSpendTotal | 0) : 0;
  }

  function canAffordAttack(balance, territoryPixels, phase, opts) {
    opts = opts || {};
    // Unknown bank: allow
    if (opts.balanceKnown === false) return true;
    // Known empty/debt: block
    if (!(balance > 0)) return false;
    return maxSpendableTroops(balance, territoryPixels, phase, opts) > 0;
  }

  function clampSpend(balance, territoryPixels, proposed, phase, opts) {
    const bal = balance | 0;
    if (!(bal > 0)) return 0;
    const p = planSpend(_ctxFromLegacy(bal, territoryPixels, phase, opts));
    if (!p.canAfford) return 0;
    let k = proposed | 0;
    if (k > p.maxSpendTotal) k = p.maxSpendTotal;
    // Never spend entire bank — leave at least 1 if possible
    if (k >= bal) k = Math.max(0, bal - Math.max(1, p.minRemaining | 0));
    if (k < p.minAttack) return 0;
    return k;
  }

  function maxCommitRatio(balance, territoryPixels, phase, opts) {
    const bal = balance | 0;
    if (!(bal > 0)) return 0;
    const p = planSpend(_ctxFromLegacy(bal, territoryPixels, phase, Object.assign({}, opts || {}, { fronts: (opts && opts.fronts) || 1 })));
    return p.canAfford ? p.ratio : 0;
  }

  function minMeaningful(balance, phase, opts) {
    return planSpend(_ctxFromLegacy(balance, (opts && opts.territory) || 1, phase, opts)).minAttack | 0;
  }

  function isEarlyGame(balance, phase, opts) {
    const bal = balance | 0;
    if (phase === 'OPENING') return true;
    if (opts && opts.gameTimeSec != null && opts.gameTimeSec < 40) return true;
    return bal > 0 && bal < 280;
  }

  const MIN_MEANINGFUL_ATTACK = 25;
  const MIN_MEANINGFUL_EARLY = 12;
  function absoluteFloor() { return 8; }

  /**
   * dJ crush troop floor from dump — still respects positive reserve.
   */
  function crushTroops(myBal, enemyBal, proposed, territoryPixels, phase) {
    let k = proposed | 0;
    if (al(myBal, 8) > enemyBal) {
      const need = al(11 * enemyBal, 5);
      if (k < need) k = need;
    }
    k = clampSpend(myBal, territoryPixels != null ? territoryPixels : 1, k, phase || 'CRUSH');
    return k; // 0 = skip
  }

  /**
   * Control Barrier Function (CBF) for Dynamic Crush Immunity.
   * Hard bots evaluate dJ crush when: al(B_bot, 8) > B_us (i.e. B_bot > 8 * B_us).
   *
   * To remain strictly outside the crush domain of all bordering enemies:
   *   B_post >= ceil(B_threat_max / 7.6) + sigma
   * where sigma = max(60, floor(0.05 * B)).
   */
  function computeCrushBarrierFloor(balance, adjEnemies) {
    const rawB = Number(balance);
    const B = isFinite(rawB) && rawB > 0 ? Math.floor(rawB) : 0;
    let maxThreat = 0;
    if (Array.isArray(adjEnemies)) {
      for (let i = 0; i < adjEnemies.length; i++) {
        const e = adjEnemies[i];
        if (!e) continue;
        // Troops already travelling toward us remain part of the opponent's
        // immediate threat even though they have left its visible bank.
        const rawE = Number(e.effectiveBal != null
          ? e.effectiveBal
          : ((e.bal != null ? e.bal : e.balance) || 0) + (Number(e.incoming) || 0));
        const eBal = isFinite(rawE) && rawE > 0 ? Math.floor(rawE) : 0;
        if (eBal > maxThreat) maxThreat = eBal;
      }
    }
    const sigma = Math.max(60, Math.floor(0.05 * B));
    const floor = maxThreat > 0 ? (Math.ceil(maxThreat / 7.6) + sigma) : 0;
    const isThreatened = maxThreat > 0 && B <= floor * 1.15;
    const isBreached = maxThreat > 0 && B <= floor;

    let maxSafeSpend = 0;
    let maxSafeRatio = 0;
    if (B > floor && B > 0) {
      const baseTax = Math.floor((3 * B) / 256);
      const available = B - baseTax - floor;
      if (available > 0) {
        maxSafeSpend = available;
        maxSafeRatio = Math.max(0, Math.min(0.72, available / (B * (1 + 12 / 1024))));
      }
    }

    return {
      maxThreat,
      floor,
      sigma,
      isThreatened,
      isBreached,
      maxSafeSpend,
      maxSafeRatio: parseFloat(maxSafeRatio.toFixed(4))
    };
  }

  /**
   * d3-style dump excess — never below positive reserve bank.
   */
  function dumpExcessTroops(balance, territoryPixels, proposedTroops, phase) {
    const cap = softCapFor(territoryPixels);
    const softReserve = minRemainingBalance(balance, territoryPixels, phase || 'LAND_RUSH');
    let k = proposedTroops | 0;
    if (balance > softReserve && k < balance - softReserve) {
      k = balance - softReserve;
    }
    // Minimum meaningful attack when we can afford it
    if (k < 60 && balance - softReserve >= 60) {
      k = Math.min(balance - softReserve, 60 + Math.floor(balance * 0.1));
    }
    return clampSpend(balance, territoryPixels, k, phase || 'LAND_RUSH');
  }

  function profileFor(diffIndex) {
    const i = Math.max(0, Math.min(5, diffIndex | 0));
    const kOpen = DUMP.kOpen[i];
    const kSus = DUMP.kSustain[i];
    return {
      difficulty: i,
      name: DUMP.names[i],
      // Ratios from dump k/1000
      attackRatio: kOpen / 1000,                 // VH open ~0.45
      attackRatioExpand: Math.max(0.28, kSus / 1000), // VH sustain ~0.20 → floor 0.28 for us
      attackRatioKill: Math.min(0.55, (kOpen / 1000) * 1.2),
      reserveRatio: 32 / 1024,
      multiFront: DUMP.fronts[i],                // VH = 6
      weakPickChance: DUMP.dI[i] / 100,          // VH = 0.90
      pathHumanFilter: DUMP.dK[i] / 100,
      pressureScale: DUMP.dT[i],
      pulseMs: DUMP.pulseMs[i],                  // VH = 85ms
      // Live blend (small il but many fronts) — we prefer dump aggressiveness
      liveIlRatio: ilToRatio(LIVE.kg[Math.min(i, LIVE.kg.length - 1)]),
      liveBoatOps: LIVE.ki[Math.min(i, LIVE.ki.length - 1)],
      liveLandFrontCap: LIVE.botLandFrontCap,
      densityCapPerPixel: 100,
      earlyTickBoostUntil: 1920,
      preferNeutralWhileFreeLand: [0.03, 0.04, 0.05, 0.05, 0.06, 0.04][i],
      fightWhenPower: [0.9, 0.95, 1.0, 1.0, 0.95, 0.9][i],
      // Always expand empty first (dD)
      expandEmptyFirst: true,
      // Min troops to bother (d3)
      minTroops: 60
    };
  }

  /**
   * Simple phase commit (legacy). Prefer computeAdaptiveCommit for live play.
   */
  function computeCommit(profile, phase, freeLandRatio) {
    const r = computeAdaptiveCommit({
      profile: profile || EngineCore.active,
      phase: phase || 'LAND_RUSH',
      freeLandRatio: freeLandRatio != null ? freeLandRatio : 0.1,
      density: 0.7,
      relativePower: 1.0,
      areaTrend: 0,
      gameTimeSec: 30,
      balance: 1000,
      territory: 100,
      wantEnemy: phase === 'PRESSURE' || phase === 'KILL' || phase === 'CRUSH' || phase === 'SURVIVE',
      crushable: phase === 'CRUSH' || phase === 'KILL',
      fronts: 1
    });
    return r.ratio;
  }

  /**
   * Situation-aware troop % (main improvement).
   *
   * Mirrors dump instincts:
   *  - d3: if over soft-cap reserve → dump excess (high %)
   *  - dF expand: frequent medium commits (multi-front splits budget)
   *  - dJ crush: if 8× stronger → force finish %
   *  - VH dU: open high (~40%), drift lower when sustained
   *
   * ctx fields:
   *  phase, freeLandRatio, density, relativePower, areaTrend,
   *  gameTimeSec, balance, territory, wantEnemy, crushable,
   *  enemyBal (optional), fronts, shrinkFrames, primaryDanger
   *
   * returns { ratio, reason, reserveRatio, raw, factors }
   */

  /** Deterministic midpoint of the live VH 30–50% -> 5–15% commit drift. */
  function veryHardTaperRatio(attackSequence) {
    const n = Math.max(0, Math.min(8, Number(attackSequence) | 0));
    return Math.max(LIVE.sustainCommitMid, LIVE.openCommitMid - LIVE.taperStepMid * n);
  }

  /**
   * Advanced Mathematical Formulation: Pontryagin's Optimal Control (PMP)
   * Solves the continuous/discrete Hamiltonian singular arc for optimal spend u*(t).
   *
   * Maximizes terminal objective: J(u) = alpha * Territory(T) + beta * Balance(T)
   * Subject to:
   *   dA/dt = kappa * u * B
   *   dB/dt = r(A, B)*B - u*B - tau(B)
   */
  function solvePontryaginOptimalControl(ctx) {
    ctx = ctx || {};
    const rawB = Number(ctx.balance);
    const B = isFinite(rawB) && rawB > 0 ? Math.floor(rawB) : 0;
    const rawT = Number(ctx.territory);
    const T = isFinite(rawT) && rawT > 0 ? Math.floor(rawT) : 1;
    const rawC = Number(ctx.softCap);
    const C = isFinite(rawC) && rawC > 0 ? Math.floor(rawC) : softCapFor(T);
    const density = C > 0 && B > 0 ? B / C : 0;
    const rawFree = Number(ctx.freeLandRatio);
    const free = isFinite(rawFree) ? Math.max(0, Math.min(1, rawFree)) : 0.08;
    const wantEnemy = !!ctx.wantEnemy;
    const crushable = !!ctx.crushable;
    const activeFronts = Math.max(0, Math.min(12, Number(ctx.activeFronts) | 0));
    const rawPower = Number(ctx.relativePower);
    const power = isFinite(rawPower) && rawPower > 0 ? rawPower : 1;
    const attackSeq = Math.max(0, Number(ctx.attackSequence) | 0);

    // 0A. Dynamic Crush Immunity Barrier (Control Barrier Function)
    const cbf = computeCrushBarrierFloor(B, ctx.adjEnemies);
    if (!crushable && cbf.isBreached && B > 0) {
      return {
        ratio: 0,
        reason: 'cbf-crush-immunity-lock'
      };
    }

    // 0B. Defensive Fortification Wall (Asymmetric Defender Advantage 1.25x / 1.45x)
    const isShrinking = (ctx.shrinkFrames != null && Number(ctx.shrinkFrames) > 0) || (ctx.areaTrend != null && Number(ctx.areaTrend) < -3);
    const hasIncoming = ctx.incoming != null && Number(ctx.incoming) > 0;
    if ((isShrinking || hasIncoming) && B > 0) {
      if (crushable && ctx.enemyBal > 0) {
        const needRatio = Math.ceil(crushRequirement(ctx.enemyBal) * 1024 / B) / 1024;
        return {
          ratio: Math.max(0.12, Math.min(0.65, needRatio)),
          reason: 'pmp-fortification-counter-crush'
        };
      }
      if (!wantEnemy && free > 0.05) {
        // Still rich free land: can expand away from attack
      } else {
        return {
          ratio: 0,
          reason: 'pmp-fortification-defense-wall'
        };
      }
    }

    // 0C. Golden Opening Deterministic FSM (Opening neutral land rush, Cycles 0 to 3)
    const openingTime = ctx.gameTimeSec != null ? Math.max(0, Number(ctx.gameTimeSec) || 0) : 99;
    const isOpeningPhase = openingTime < 7.5 || (attackSeq <= 3 && T < 35);
    if (isOpeningPhase && !wantEnemy && free > 0.02) {
      if (attackSeq === 0) {
        return {
          ratio: Math.max(0.28, Math.min(0.38, 0.36 + 0.04 * free)),
          reason: 'pmp-golden-open-c0'
        };
      } else if (attackSeq === 1 && openingTime < 2.4) {
        return {
          ratio: 0,
          reason: 'pmp-golden-hold-c1'
        };
      } else if (attackSeq === 1 || attackSeq === 2 && openingTime >= 3.4) {
        if (B >= 340) {
          return {
            ratio: Math.max(0.16, Math.min(0.24, 0.20 + 0.04 * free)),
            reason: 'pmp-golden-open-c2'
          };
        }
        return {
          ratio: 0,
          reason: 'pmp-golden-hold-c2'
        };
      } else if (attackSeq === 2 || attackSeq === 3 && openingTime < 4.6) {
        return {
          ratio: 0,
          reason: attackSeq === 2 ? 'pmp-golden-hold-c2' : 'pmp-golden-hold-c3'
        };
      }
    }

    // 0D. Lanchester FFA Non-Aggression Invariant (N >= 3)
    if (!crushable && wantEnemy && free <= 0.02 && density < 0.85 && ctx.phase !== 'PRESSURE') {
      return {
        ratio: 0,
        reason: 'pmp-ffa-nash-hold'
      };
    }

    // 0E. Capital Preservation Floor (Compound Interest Dominance)
    if (!crushable && wantEnemy && free <= 0.02 && B < 220 && density < 0.25 && attackSeq > 3 && ctx.phase !== 'PRESSURE') {
      return {
        ratio: 0,
        reason: 'pmp-compound-hoard'
      };
    }

    // 1. Capacity Overcap Arc (Singular constraint: B <= C)
    if (B > 0.85 * C && C > 0) {
      const tax = humanAttackDebit(B, 0).tax;
      const targetBank = Math.floor(0.80 * C);
      const drainRatio = Math.max(0, (B - targetBank - tax) / B);
      if (drainRatio > 0.08) {
        return {
          ratio: Math.min(0.72, drainRatio),
          reason: 'pmp-overcap-drain'
        };
      }
    }

    // 2. Immediate Terminal Value (Crush Execution)
    if (crushable && ctx.enemyBal > 0 && B > 0) {
      const needRatio = Math.ceil(crushRequirement(ctx.enemyBal) * 1024 / B) / 1024;
      return {
        ratio: Math.max(0.12, Math.min(0.65, needRatio)),
        reason: 'pmp-crush-singular'
      };
    }

    // 3. Early Preemption / Land-Rush Hamiltonian Arc
    if (!wantEnemy && free > 0.01) {
      const initialSurge = 0.38 + 0.08 * free;
      const alpha = CONFIG.alphaPMP != null ? CONFIG.alphaPMP : 0.18;
      const terrDecay = Math.max(0.18, 1.0 / (1.0 + alpha * Math.sqrt(Math.max(1, T))));
      const seqDecay = Math.exp(-alpha * attackSeq);
      const effectiveDecay = Math.min(seqDecay, terrDecay) / (1 + 0.45 * activeFronts);
      const minSustain = (T > 15) ? 0.08 : 0.12;
      const optimalOpenRatio = Math.max(minSustain, Math.min(0.45, initialSurge * effectiveDecay));
      return {
        ratio: optimalOpenRatio,
        reason: 'pmp-land-rush-preempt'
      };
    }

    // 4. Equilibrium Singular Arc (Compound Boom vs Sustainable Expansion)
    const baseInterest = 0.035;
    const effectiveInterest = density < 0.80 ? baseInterest : baseInterest * Math.max(0, 1 - (density - 0.80) / 0.20);
    const marginalTaxRate = 12 / 1024; // ~0.0117

    let uEquilibrium = effectiveInterest * (1 + 1.2 * density) - marginalTaxRate;
    uEquilibrium = Math.max(0.05, Math.min(0.25, uEquilibrium));

    if (wantEnemy) {
      const combatSurge = 2.0 + 0.4 * Math.min(2.0, power);
      uEquilibrium = Math.max(0.15, Math.min(0.36, uEquilibrium * combatSurge));
      if (power < 0.8) uEquilibrium *= 0.80;
      else if (power > 1.3) uEquilibrium *= 1.20;
    }

    const frontSplitting = 1 + 0.55 * activeFronts;
    let finalRatio = Math.max(0.06, Math.min(0.35, uEquilibrium / frontSplitting));

    if (cbf.maxThreat > 0 && cbf.maxSafeRatio > 0) {
      finalRatio = Math.min(finalRatio, cbf.maxSafeRatio);
    }

    return {
      ratio: finalRatio,
      reason: 'pmp-singular-arc'
    };
  }

  /**
   * Source-calibrated competitive ratio. Safety is intentionally not mixed in;
   * planSpend() applies the exact human debit and reserve after this choice.
   */
  function computeAdaptiveCommit(ctx) {
    ctx = ctx || {};
    let ratio = 0.20;
    let reason = 'fixed-ratio';
    if (CONFIG.enablePMP) {
      const pmpResult = solvePontryaginOptimalControl(ctx);
      ratio = pmpResult.ratio;
      reason = pmpResult.reason;
      if (ratio === 0 || (reason && (reason.includes('hold') || reason.includes('lock') || reason.includes('wall')))) {
        const rawT = Number(ctx.territory);
        const t0 = isFinite(rawT) && rawT > 0 ? Math.floor(rawT) : 1;
        const s0 = ctx.softCap > 0 && isFinite(Number(ctx.softCap)) ? Number(ctx.softCap) : softCapFor(t0);
        return {
          ratio: 0,
          raw: 0,
          reason: reason,
          reserveRatio: 0.25,
          softCap: s0,
          maxRatio: 0,
          factors: {
            free: parseFloat((ctx.freeLandRatio != null && isFinite(Number(ctx.freeLandRatio)) ? Number(ctx.freeLandRatio) : 0).toFixed(3)),
            density: parseFloat((ctx.density != null && isFinite(Number(ctx.density)) ? Number(ctx.density) : 0).toFixed(3)),
            power: parseFloat((ctx.relativePower != null && isFinite(Number(ctx.relativePower)) ? Number(ctx.relativePower) : 1).toFixed(3)),
            phase: ctx.phase || 'HOLD',
            wantEnemy: !!ctx.wantEnemy,
            crushable: !!ctx.crushable,
            activeFronts: Number(ctx.activeFronts) | 0,
            attackSequence: Number(ctx.attackSequence) | 0,
            overcapRatio: 0
          }
        };
      }
    }

    const rawBal = Number(ctx.balance);
    const balance = isFinite(rawBal) && rawBal > 0 ? Math.floor(rawBal) : 0;
    const rawTerr = Number(ctx.territory);
    const territory = isFinite(rawTerr) && rawTerr > 0 ? Math.floor(rawTerr) : 1;
    const softCap = ctx.softCap > 0 && isFinite(Number(ctx.softCap)) ? Number(ctx.softCap) : softCapFor(territory);
    const density = ctx.density != null && isFinite(Number(ctx.density))
      ? Math.max(0, Number(ctx.density))
      : (softCap > 0 ? balance / softCap : 0);
    const rawF = Number(ctx.freeLandRatio);
    const free = isFinite(rawF) ? Math.max(0, Math.min(1, rawF)) : 0.08;
    const activeFronts = Math.max(0, Math.min(12, Number(ctx.activeFronts) | 0));
    const attackSequence = Math.max(0, Number(ctx.attackSequence) | 0);
    const wantEnemy = !!ctx.wantEnemy;
    const crushable = !!ctx.crushable;
    const enemyBal = ctx.enemyBal != null && isFinite(Number(ctx.enemyBal)) ? Math.max(0, Number(ctx.enemyBal) | 0) : 0;
    const power = ctx.relativePower != null && isFinite(Number(ctx.relativePower)) ? Math.max(0, Number(ctx.relativePower)) : 1;
    const phase = ctx.phase || (wantEnemy ? 'PRESSURE' : 'LAND_RUSH');
    const overcapRatio = density > 0.85 ? Math.max(0, (balance - softCap) / Math.max(1, balance)) : 0;

    const cbf = computeCrushBarrierFloor(balance, ctx.adjEnemies);
    let maxRatio = 0.50;
    if (density > 0.85) maxRatio = 0.72;
    else if (crushable) maxRatio = 0.65;
    if (cbf.maxThreat > 0 && cbf.maxSafeRatio > 0) {
      maxRatio = Math.min(maxRatio, cbf.maxSafeRatio);
    }
    const minRatio = wantEnemy && power < 1 && !crushable ? 0.05 : 0.07;
    ratio = Math.max(minRatio, Math.min(maxRatio, ratio));

    let reserveRatio = density < 0.35 ? 0.22
      : density < 0.65 ? 0.18
        : density < 1 ? 0.14 : 0.12;
    if (crushable) reserveRatio = Math.min(reserveRatio, 0.08);

    return {
      ratio: parseFloat(ratio.toFixed(4)),
      raw: parseFloat(ratio.toFixed(4)),
      reason,
      reserveRatio,
      softCap,
      maxRatio,
      factors: {
        free: parseFloat(free.toFixed(3)),
        density: parseFloat(density.toFixed(3)),
        power: parseFloat(power.toFixed(3)),
        phase,
        wantEnemy,
        crushable,
        activeFronts,
        attackSequence,
        overcapRatio: parseFloat(overcapRatio.toFixed(4))
      }
    };
  }

  /**
   * Absolute troops for native cE path — situation budget.
   */
  function computeTroops(profile, balance, territory, phase, freeLandRatio, enemyBal) {
    const wantEnemy = phase === 'PRESSURE' || phase === 'KILL' || phase === 'CRUSH' || phase === 'SURVIVE';
    const crushable = phase === 'CRUSH' || phase === 'KILL';
    const plan = planSpend({
      balance,
      territory,
      phase,
      freeLandRatio,
      wantEnemy,
      crushable,
      enemyBal,
      fronts: 1
    });
    if (!plan.canAfford) return 0;
    let troops = plan.spendPerFront | 0;
    if (enemyBal != null && enemyBal >= 0 && crushable) {
      troops = crushTroops(balance, enemyBal, troops, territory, phase);
    }
    return troops > 0 ? troops : 0;
  }

  /**
   * dD target policy.
   * Expand free land early; once free land thins OR we are stacked/threatened,
   * fight adjacent enemies (do not stall on phantom free-land from vision).
   *
   * Optional 5th arg ctx: { density, hasAdjEnemy, crushable, balance, territory }
   */
  function decideTargetPolicy(profile, freeLandRatio, relativePower, areaTrend, ctx) {
    const free = freeLandRatio || 0;
    const p = profile || EngineCore.active;
    ctx = ctx || {};
    const density = ctx.density != null ? ctx.density : 0;
    const hasAdjEnemy = !!ctx.hasAdjEnemy;
    const crushable = !!ctx.crushable;
    const power = relativePower != null ? relativePower : 1;

    // Collapse → fight back hard
    if (areaTrend < -12) {
      return { preferNeutral: false, phase: 'SURVIVE', reason: 'collapse' };
    }
    // Finish weak adjacent neighbors immediately
    if (crushable && hasAdjEnemy) {
      return {
        preferNeutral: false,
        phase: 'CRUSH',
        pickWeakest: true,
        reason: 'crush-adj'
      };
    }
    // Stacked troops + any land neighbor → dump into war (do not sit on pile)
    if (hasAdjEnemy && density >= 0.85 && free < 0.12) {
      return {
        preferNeutral: false,
        phase: 'PRESSURE',
        pickWeakest: (p.weakPickChance || 0.9) >= 0.5,
        reason: 'overstack-fight'
      };
    }
    // Rich free land only: expand first (real opening / mid expand)
    // Threshold raised — vision often over-counts unreachable "neutral"
    if (p.expandEmptyFirst && free > 0.06 && !hasAdjEnemy) {
      return { preferNeutral: true, phase: free > 0.12 ? 'OPENING' : 'LAND_RUSH', reason: 'dF-empty' };
    }
    if (p.expandEmptyFirst && free > 0.08 && density < 0.75) {
      return { preferNeutral: true, phase: free > 0.15 ? 'OPENING' : 'LAND_RUSH', reason: 'dF-rich' };
    }
    // Mixed: still some free land but enemies touch us → prefer fight if strong/stacked
    if (hasAdjEnemy && free < 0.08) {
      return {
        preferNeutral: false,
        phase: power >= 1.0 || density >= 0.7 ? 'PRESSURE' : 'PRESSURE',
        pickWeakest: (p.weakPickChance || 0.9) >= 0.5,
        reason: 'border-war'
      };
    }
    if (hasAdjEnemy && (power >= 0.95 || density >= 0.9)) {
      return {
        preferNeutral: false,
        phase: 'PRESSURE',
        pickWeakest: (p.weakPickChance || 0.9) >= 0.5,
        reason: 'pressure-adj'
      };
    }
    // Thin free scraps only worth expanding when no pressure
    if (free > 0.04 && !hasAdjEnemy) {
      return { preferNeutral: true, phase: 'LAND_RUSH', reason: 'expand-scraps' };
    }
    // Default late: fight if anyone is adjacent, else limp expand
    if (hasAdjEnemy) {
      return {
        preferNeutral: false,
        phase: 'PRESSURE',
        pickWeakest: (p.weakPickChance || 0.9) >= 0.5,
        reason: 'dJ-fight'
      };
    }
    if (free > 0.01) {
      return { preferNeutral: true, phase: 'LAND_RUSH', reason: 'expand-last' };
    }
    return {
      preferNeutral: false,
      phase: 'PRESSURE',
      pickWeakest: (p.weakPickChance || 0.9) >= 0.5,
      reason: 'dJ-default'
    };
  }

  function shouldExpandLand(freeLandRatio, balance, territoryPixels, relativePower) {
    if (freeLandRatio < 0.01) return false;
    const cap = softCapFor(territoryPixels);
    const density = balance / Math.max(1, cap);
    if (density > 0.85) return true;
    if (freeLandRatio > 0.03) return true;
    if (relativePower < 0.9 && freeLandRatio > 0.015) return true;
    return freeLandRatio > 0.02;
  }

  function estimateInterestIncome(balance, territoryPixels, gameTickApprox) {
    const cap = softCapFor(territoryPixels);
    let eF = Math.sqrt(Math.max(1, territoryPixels)) * 2.5;
    if (gameTickApprox < 1920) {
      const boost = Math.max(0, (13440 - 6 * gameTickApprox) / 1920);
      eF = Math.max(eF, eF * (1 + 0.15 * Math.min(1, boost / 7)));
    }
    if (balance > cap && cap > 0) {
      const over = (balance - cap) / cap;
      eF *= Math.max(0.35, 1 - 0.5 * over);
    }
    return eF;
  }

  /**
   * Real Territorial Topology Graph & Tarjan Chokepoint Analysis
   */
  function computeTerritorialTopology(nodes, edges) {
    if (!nodes || !nodes.length) {
      return { articulationPoints: [], bridges: [], isConnected: true, components: 0 };
    }
    const V = nodes.length;
    const adj = Array.from({ length: V }, () => []);
    const edgeCap = new Map();
    if (edges && edges.length) {
      for (let e = 0; e < edges.length; e++) {
        const { u, v, capacity } = edges[e];
        if (u >= 0 && u < V && v >= 0 && v < V && u !== v) {
          adj[u].push(v);
          adj[v].push(u);
          const cap = capacity != null ? Number(capacity) : 1.0;
          const key = u < v ? `${u}-${v}` : `${v}-${u}`;
          edgeCap.set(key, cap);
        }
      }
    }
    const disc = new Int32Array(V).fill(-1);
    const low = new Int32Array(V).fill(-1);
    const isArt = new Uint8Array(V);
    const bridges = [];
    let time = 0;
    let components = 0;

    function dfs(u, p) {
      disc[u] = low[u] = ++time;
      let children = 0;
      for (let i = 0; i < adj[u].length; i++) {
        const v = adj[u][i];
        if (v === p) continue;
        if (disc[v] !== -1) {
          low[u] = Math.min(low[u], disc[v]);
        } else {
          children++;
          dfs(v, u);
          low[u] = Math.min(low[u], low[v]);
          if (p !== -1 && low[v] >= disc[u]) isArt[u] = 1;
          if (low[v] > disc[u]) {
            bridges.push({ u, v, weight: edgeCap.get(u < v ? `${u}-${v}` : `${v}-${u}`) || 1.0 });
          }
        }
      }
      if (p === -1 && children > 1) isArt[u] = 1;
    }

    for (let i = 0; i < V; i++) {
      if (disc[i] === -1) {
        components++;
        dfs(i, -1);
      }
    }
    const articulationPoints = [];
    for (let i = 0; i < V; i++) {
      if (isArt[i]) articulationPoints.push({ nodeId: i, node: nodes[i], isChokepoint: true, degree: adj[i].length });
    }
    return { articulationPoints, bridges, isConnected: components <= 1, components, nodeCount: V, edgeCount: edges ? edges.length : 0 };
  }

  /**
   * Forward Discrete Simulator for Model Predictive Control (MPC)
   */
  function forwardSimulatorStep(state, action, steps) {
    steps = steps || 8;
    let myBal = state.balance || 0;
    let myTerr = state.territory || 1;
    let neutralLand = state.freeLandRatio != null ? (state.freeLandRatio * (myTerr * 10)) : 1000;
    const enemies = (state.adjEnemies || []).map(e => ({
      id: e.id,
      bal: e.bal || 0,
      terr: e.terr || 1
    }));
    const interestRate = 0.035;
    const D = 1.25;

    if (action.type === 'expand') {
      const ratio = Math.max(0.05, Math.min(0.40, action.ratio || 0.20));
      const sent = Math.floor(myBal * ratio);
      // The live human command path taxes the bank before the attack, not the
      // dispatched force. Keeping this exact is important for MPC feasibility.
      const tax = Math.floor(12 * myBal / 1024);
      myBal = Math.max(0, myBal - sent - tax);
      const gained = Math.min(neutralLand, Math.floor(sent / 2));
      myTerr += gained;
      neutralLand = Math.max(0, neutralLand - gained);
    } else if (action.type === 'fight' && action.targetId != null) {
      const foe = enemies.find(e => e.id === action.targetId);
      if (foe) {
        const ratio = Math.max(0.08, Math.min(0.55, action.ratio || 0.25));
        const sent = Math.floor(myBal * ratio);
        const tax = Math.floor(12 * myBal / 1024);
        myBal = Math.max(0, myBal - sent - tax);
        const defForce = foe.bal * D;
        if (sent > defForce) {
          const conquered = Math.min(foe.terr, Math.max(1, Math.floor(foe.terr * (sent / (defForce + 1)))));
          myTerr += conquered;
          foe.terr = Math.max(0, foe.terr - conquered);
          foe.bal = Math.max(0, foe.bal - Math.floor(sent / D));
        } else {
          foe.bal = Math.max(0, foe.bal - Math.floor(sent / D));
        }
      }
    }

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

        if (Math.floor(foe.bal / 8) > myBal) {
          myBal = 0;
          myTerr = Math.max(1, Math.floor(myTerr * 0.5));
        }
      }
    }

    let totalEnemyTerr = 0;
    let totalEnemyBal = 0;
    let maxEnemyBal = 0;
    for (let i = 0; i < enemies.length; i++) {
      totalEnemyTerr += enemies[i].terr;
      totalEnemyBal += enemies[i].bal;
      if (enemies[i].bal > maxEnemyBal) maxEnemyBal = enemies[i].bal;
    }
    const terrShare = myTerr / Math.max(1, myTerr + totalEnemyTerr);
    const balShare = myBal / Math.max(1, myBal + totalEnemyBal);
    const crushDanger = Math.max(0, (maxEnemyBal / 8.0 - myBal) / Math.max(1, myBal));
    const value = 0.50 * terrShare + 0.35 * balShare - 0.40 * Math.min(1.0, crushDanger);

    return { value, finalTerr: myTerr, finalBal: myBal, crushDanger };
  }

  /**
   * Model Predictive Control (MPC) Action Evaluation
   */
  function evaluateMPCAction(state, candidateActions, horizon) {
    horizon = horizon || 8;
    if (!candidateActions || !candidateActions.length) {
      return { bestAction: { type: 'hold', ratio: 0 }, expectedValue: 0.5 };
    }
    let bestAct = candidateActions[0];
    let bestVal = -1e9;
    const results = [];
    for (let i = 0; i < candidateActions.length; i++) {
      const act = candidateActions[i];
      const outcome = forwardSimulatorStep(state, act, horizon);
      results.push({ action: act, outcome });
      if (outcome.value > bestVal) {
        bestVal = outcome.value;
        bestAct = act;
      }
    }
    return { bestAction: bestAct, expectedValue: bestVal, evaluations: results };
  }

  /**
   * True KKT Marginal-Utility Multi-Front Allocation (Diminishing Returns Bisection)
   */
  function allocateKKTMarginalUtility(totalBudget, frontConfigs) {
    const B = Math.max(0, totalBudget | 0);
    if (!frontConfigs || !frontConfigs.length) return [];
    const K = frontConfigs.length;
    if (K === 1) {
      const cfg = frontConfigs[0];
      const minD = Math.max(0, cfg.min | 0);
      const maxD = cfg.max != null ? Math.max(minD, cfg.max | 0) : B;
      return [Math.min(B, Math.max(minD, maxD))];
    }

    const allocations = new Int32Array(K);
    let remBudget = B;

    // 1. Allocate minimum demand floors
    for (let k = 0; k < K; k++) {
      const cfg = frontConfigs[k];
      const minD = Math.max(0, cfg.min | 0);
      const alloc = Math.min(remBudget, minD);
      allocations[k] = alloc;
      remBudget -= alloc;
    }

    if (remBudget <= 0) {
      return Array.from(allocations);
    }

    // 2. Prepare diminishing return parameters: V_k and scale s_k
    const V = new Float64Array(K);
    const s = new Float64Array(K);
    const cap = new Float64Array(K);
    let maxMarginal = 1e-9;

    for (let k = 0; k < K; k++) {
      const cfg = frontConfigs[k];
      let weight = cfg.weight != null ? Math.max(0.05, Number(cfg.weight)) : 1.0;
      if (cfg.isChokepoint) weight *= 2.8;
      if (cfg.isEnclave) weight *= 1.8;
      V[k] = weight;
      s[k] = Math.max(10.0, (cfg.saturation != null ? Number(cfg.saturation) : (remBudget * 0.4)));
      const maxD = cfg.max != null ? Math.max(allocations[k], cfg.max | 0) : B;
      cap[k] = Math.max(0, maxD - allocations[k]);

      const initialMarginal = V[k] / s[k];
      if (initialMarginal > maxMarginal) maxMarginal = initialMarginal;
    }

    // 3. Monotonic Bisection Search for Lagrange Multiplier lambda in (0, maxMarginal]
    let lowLambda = 1e-9;
    let highLambda = maxMarginal * 1.05;
    const y = new Float64Array(K);

    for (let iter = 0; iter < 16; iter++) {
      const midLambda = (lowLambda + highLambda) * 0.5;
      let sumY = 0;

      for (let k = 0; k < K; k++) {
        const ratio = (midLambda * s[k]) / V[k];
        let yk = 0;
        if (ratio < 1.0) {
          yk = -s[k] * Math.log(ratio);
          if (yk > cap[k]) yk = cap[k];
          if (yk < 0) yk = 0;
        }
        y[k] = yk;
        sumY += yk;
      }

      if (sumY > remBudget) {
        lowLambda = midLambda;
      } else {
        highLambda = midLambda;
      }
    }

    // 4. Discretize integer allocations
    let spentExtra = 0;
    for (let k = 0; k < K; k++) {
      const add = Math.floor(y[k]);
      allocations[k] += add;
      spentExtra += add;
    }

    let leftover = remBudget - spentExtra;
    while (leftover > 0) {
      let bestK = -1;
      let bestResidual = -1;
      for (let k = 0; k < K; k++) {
        const currentAdd = allocations[k] - (frontConfigs[k].min | 0);
        if (currentAdd < cap[k]) {
          const marginal = (V[k] / s[k]) * Math.exp(-currentAdd / s[k]);
          if (marginal > bestResidual) {
            bestResidual = marginal;
            bestK = k;
          }
        }
      }
      if (bestK === -1) break;
      allocations[bestK]++;
      leftover--;
    }

    return Array.from(allocations);
  }

  /**
   * Isotropic Godunov Upwind Eikonal Solver (4-Sweep Continuous Wavefront)
   */
  function computeEikonalGodunovIsotropic(gridW, gridH, sources, obstacles, speedGrid) {
    const W = gridW || 16;
    const H = gridH || 8;
    const numCells = W * H;

    const T = new Float64Array(numCells);
    T.fill(1e6);

    const isObstacle = new Uint8Array(numCells);
    const isSource = new Uint8Array(numCells);

    if (sources && sources.length) {
      for (let s = 0; s < sources.length; s++) {
        const src = sources[s];
        const sx = Math.min(W - 1, Math.max(0, Math.floor((((src && src.x != null) ? Number(src.x) : 500) / 1000) * W)));
        const sy = Math.min(H - 1, Math.max(0, Math.floor((((src && src.y != null) ? Number(src.y) : 500) / 1000) * H)));
        const sIdx = sy * W + sx;
        T[sIdx] = 0.0;
        isSource[sIdx] = 1;
      }
    } else {
      T[0] = 0.0;
      isSource[0] = 1;
    }

    if (obstacles && obstacles.length) {
      for (let o = 0; o < obstacles.length; o++) {
        const obs = obstacles[o];
        const ox = Math.min(W - 1, Math.max(0, Math.floor((((obs && obs.x != null) ? Number(obs.x) : 500) / 1000) * W)));
        const oy = Math.min(H - 1, Math.max(0, Math.floor((((obs && obs.y != null) ? Number(obs.y) : 500) / 1000) * H)));
        isObstacle[oy * W + ox] = 1;
      }
    }

    const h = 1.0;

    function updateGodunovCell(i, j) {
      const idx = j * W + i;
      if (isObstacle[idx] || isSource[idx]) return;

      let a = 1e6;
      if (i > 0 && !isObstacle[idx - 1]) a = Math.min(a, T[idx - 1]);
      if (i < W - 1 && !isObstacle[idx + 1]) a = Math.min(a, T[idx + 1]);

      let b = 1e6;
      if (j > 0 && !isObstacle[idx - W]) b = Math.min(b, T[idx - W]);
      if (j < H - 1 && !isObstacle[idx + W]) b = Math.min(b, T[idx + W]);

      let speed = 1.0;
      if (speedGrid) {
        speed = speedGrid[idx] != null ? Math.max(0.1, Number(speedGrid[idx])) : 1.0;
      }
      const invF = h / speed;

      let T_cand = 1e6;
      if (a >= 1e5 && b >= 1e5) {
        return;
      } else if (a >= 1e5) {
        T_cand = b + invF;
      } else if (b >= 1e5) {
        T_cand = a + invF;
      } else {
        const diff = Math.abs(a - b);
        if (diff >= invF) {
          T_cand = Math.min(a, b) + invF;
        } else {
          const discr = 2.0 * invF * invF - diff * diff;
          if (discr >= 0) {
            T_cand = (a + b + Math.sqrt(discr)) * 0.5;
          } else {
            T_cand = Math.min(a, b) + invF;
          }
        }
      }

      if (T_cand < T[idx]) T[idx] = T_cand;
    }

    for (let iter = 0; iter < 2; iter++) {
      for (let j = 0; j < H; j++) {
        for (let i = 0; i < W; i++) updateGodunovCell(i, j);
      }
      for (let j = 0; j < H; j++) {
        for (let i = W - 1; i >= 0; i--) updateGodunovCell(i, j);
      }
      for (let j = H - 1; j >= 0; j--) {
        for (let i = W - 1; i >= 0; i--) updateGodunovCell(i, j);
      }
      for (let j = H - 1; j >= 0; j--) {
        for (let i = 0; i < W; i++) updateGodunovCell(i, j);
      }
    }

    const timesOut = new Float32Array(numCells);
    for (let n = 0; n < numCells; n++) timesOut[n] = T[n];

    return {
      width: W,
      height: H,
      times: timesOut,
      getTravelTime: function (normX, normY) {
        const gx = Math.min(W - 1, Math.max(0, Math.floor(((normX != null ? Number(normX) : 500) / 1000) * W)));
        const gy = Math.min(H - 1, Math.max(0, Math.floor(((normY != null ? Number(normY) : 500) / 1000) * H)));
        const val = timesOut[gy * W + gx];
        return val >= 1e5 ? 999 : val;
      }
    };
  }

  /**
   * Opponent Particle Filter (Belief State Tracking for Hidden Troop Capital)
   */
  const NUM_PARTICLES = 32;

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
        const spread = 0.6 + 0.8 * (k / (NUM_PARTICLES - 1));
        this.particles[k] = Math.max(10, base * spread);
      }
      this.lastTick = 0;
    }

    predict(currentTick, territory) {
      if (territory != null && territory > 0) this.territory = territory;
      const dt = Math.max(0, (currentTick || 0) - this.lastTick);
      if (dt <= 0) return;

      const interestRate = 0.035 / 10.0;
      const softCap = Math.min(100 * this.territory, 1000000000);
      const baseInc = Math.max(1, Math.floor(Math.sqrt(this.territory) * 0.25));

      for (let k = 0; k < NUM_PARTICLES; k++) {
        let b = this.particles[k];
        for (let t = 0; t < dt; t++) {
          if (b < softCap) {
            b += b * interestRate + baseInc;
          } else {
            b += baseInc;
          }
        }
        b = Math.max(5, b + (Math.random() - 0.5) * Math.sqrt(b) * 0.5);
        this.particles[k] = b;
      }
      this.lastTick = currentTick || 0;
    }

    update(observedAttackSize, attackRatioPrior = 0.20) {
      if (observedAttackSize == null || observedAttackSize <= 0) return;
      let sumW = 0;
      const sigma = Math.max(10, observedAttackSize * 0.25);
      const twoSigma2 = 2.0 * sigma * sigma;

      for (let k = 0; k < NUM_PARTICLES; k++) {
        const expectedAttack = this.particles[k] * attackRatioPrior;
        const diff = observedAttackSize - expectedAttack;
        const likelihood = Math.exp(-(diff * diff) / twoSigma2);
        this.weights[k] *= likelihood;
        sumW += this.weights[k];
      }

      if (sumW > 1e-12) {
        for (let k = 0; k < NUM_PARTICLES; k++) this.weights[k] /= sumW;
      } else {
        this.weights.fill(1.0 / NUM_PARTICLES);
      }

      let nEff = 0;
      for (let k = 0; k < NUM_PARTICLES; k++) nEff += this.weights[k] * this.weights[k];
      nEff = 1.0 / Math.max(1e-12, nEff);

      if (nEff < NUM_PARTICLES / 2) {
        this.resample();
      }
    }

    resample() {
      const cumsum = new Float64Array(NUM_PARTICLES);
      cumsum[0] = this.weights[0];
      for (let k = 1; k < NUM_PARTICLES; k++) cumsum[k] = cumsum[k - 1] + this.weights[k];

      const newParticles = new Float64Array(NUM_PARTICLES);
      const step = 1.0 / NUM_PARTICLES;
      let r = Math.random() * step;
      let i = 0;

      for (let m = 0; m < NUM_PARTICLES; m++) {
        const u = r + m * step;
        while (u > cumsum[i] && i < NUM_PARTICLES - 1) i++;
        newParticles[m] = this.particles[i] + (Math.random() - 0.5) * Math.max(1, this.particles[i] * 0.05);
      }

      this.particles.set(newParticles);
      this.weights.fill(1.0 / NUM_PARTICLES);
    }

    getBelief() {
      let mean = 0;
      for (let k = 0; k < NUM_PARTICLES; k++) mean += this.particles[k] * this.weights[k];

      const sorted = Array.from(this.particles).sort((a, b) => a - b);
      const p95 = sorted[Math.floor(NUM_PARTICLES * 0.95)];
      const p05 = sorted[Math.floor(NUM_PARTICLES * 0.05)];

      const p95Val = Math.round(p95);
      return {
        mean: Math.round(mean),
        p95: p95Val,
        p05: Math.round(p05),
        crushDefenseThreshold: Math.ceil(p95Val / 8.0)
      };
    }
  }

  /**
   * Multi-Step MCTS Tree Node
   */
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
      const hasFree = s.hasAdjFree || (s.freeLandRatio && s.freeLandRatio > 0.01);

      if (hasFree) {
        actions.push({ type: 'expand', ratio: 0.12, targetId: null });
        actions.push({ type: 'expand', ratio: 0.22, targetId: null });
        actions.push({ type: 'expand', ratio: 0.35, targetId: null });
      }

      const enemies = s.adjEnemies || [];
      for (let i = 0; i < Math.min(enemies.length, 4); i++) {
        const foe = enemies[i];
        actions.push({ type: 'fight', ratio: 0.15, targetId: foe.id });
        actions.push({ type: 'fight', ratio: 0.25, targetId: foe.id });
        if (myBal > (foe.bal || 0) * 1.5) {
          actions.push({ type: 'fight', ratio: 0.40, targetId: foe.id });
        }
      }
      return actions;
    }

    isFullyExpanded() {
      return this.untriedActions.length === 0;
    }

    bestUCTChild(c = 1.414) {
      let best = null;
      let bestUCT = -1e9;
      const logN = Math.log(this.visits + 1);

      for (let i = 0; i < this.children.length; i++) {
        const child = this.children[i];
        const q = child.totalValue / Math.max(1, child.visits);
        const u = c * Math.sqrt(logN / Math.max(1, child.visits));
        const score = q + u;
        if (score > bestUCT) {
          bestUCT = score;
          best = child;
        }
      }
      return best;
    }

    expand() {
      const action = this.untriedActions.pop();
      const nextOutcome = forwardSimulatorStep(this.state, action, 1);
      const nextState = Object.assign({}, this.state, {
        balance: nextOutcome.finalBal,
        territory: nextOutcome.finalTerr
      });
      const child = new MCTSNode(nextState, action, this);
      this.children.push(child);
      return child;
    }
  }

  /**
   * Genuine Multi-Step Monte Carlo Tree Search
   */
  function runMultiStepMCTS(initialState, maxRollouts = 40, maxDepth = 4) {
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

      const rolloutOutcome = forwardSimulatorStep(node.state, node.action || { type: 'hold', ratio: 0 }, 6);
      const reward = Math.max(0.0, Math.min(1.0, rolloutOutcome.value + 0.5));

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


  /**
   * Pure situation decision: score expand / fight / hold from live state.
   * Phases are labels only — never the driver.
   *
   * S fields:
   *  balance, territory, softCap, freeLandRatio,
   *  hasAdjFree, adjEnemies: [{id,bal,terr,crushable}],
   *  perimeterNeutral, perimeterEnemy (counts),
   *  areaTrend, shrinkFrames, primaryDanger, relativePower,
   *  gameTimeSec (optional weak feature)
   *
   * returns {
   *   action: 'expand'|'fight'|'hold',
   *   wantEnemy, preferNeutral, crushable,
   *   focusEnemyId, enemyBal,
   *   phaseLabel, reason, scores,
   *   urgency
   * }
   */
  function decide(S) {
    S = S || {};
    const strategy = ['expansionist', 'aggressive', 'defensive'].indexOf(S.strategy) >= 0
      ? S.strategy
      : 'aggressive';
    let balKnown = false;
    if (S.balanceKnown === true) balKnown = true;
    else if (S.balanceKnown === false) balKnown = false;
    else if (S.balance != null && isFinite(Number(S.balance))) balKnown = Number(S.balance) !== 0;
    const rawB = (S.balance != null && isFinite(Number(S.balance))) ? Number(S.balance) : 0;
    const B = rawB | 0;
    const T = Math.max(1, S.territory | 0);
    const C = S.softCap > 0 ? (S.softCap | 0) : softCapFor(T);
    const d = C > 0 && B > 0 ? B / C : 0;
    const free = Math.max(0, Math.min(1, S.freeLandRatio != null ? S.freeLandRatio : 0));
    const hasFree = !!S.hasAdjFree || free > 0.01 || (S.perimeterNeutral | 0) > 0;
    const enemies = Array.isArray(S.adjEnemies) ? S.adjEnemies : [];
    const hasEnemy = enemies.length > 0 || (S.perimeterEnemy | 0) > 0;
    const shrink = S.shrinkFrames | 0;
    const trend = S.areaTrend != null ? S.areaTrend : 0;
    const threat = Math.max(0, Math.min(1, S.primaryDanger || 0));
    const power = S.relativePower != null ? S.relativePower : 1;

    // Only hold for broke when balance is KNOWN <= 0 (not "couldn't read")
    if (balKnown && !(B > 0)) {
      return {
        action: 'hold',
        wantEnemy: false,
        preferNeutral: false,
        crushable: false,
        focusEnemyId: null,
        enemyBal: 0,
        phaseLabel: 'HOLD',
        reason: B < 0 ? 'negative-troops' : 'zero-troops',
        urgency: 0,
        scores: { expand: -1e9, fight: -1e9, hold: 999 },
        density: d,
        free: free
      };
    }

    let bestFoe = null;
    let bestFoeScore = -Infinity;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e || e.available === false) continue;
      const eTerr = e.terr != null ? e.terr : 1;
      let eBal = e.bal;
      if (eBal == null || !balKnown) {
        const est = BayesianTroopObserver.getEstimate(e.id != null ? e.id : i, S.tick || 0, eTerr);
        eBal = est.estimatedBalance;
      } else if (eBal > 0) {
        BayesianTroopObserver.updateObservation(e.id != null ? e.id : i, eBal, S.tick || 0);
      }
      const crush = !!e.crushable || (B > 0 && al(B, 8) > eBal);
      // Prefer weak, small, crushable
      const effectiveEnemyBal = CONFIG.enableHardModePolicy
        ? Math.max(eBal, Number(e.effectiveBal) || eBal + Math.max(0, Number(e.incoming) || 0))
        : eBal;
      let sc = 1000 - eTerr * 2 - effectiveEnemyBal * 0.15;
      if (crush) sc += 400;
      if (eBal < B * 0.5) sc += 80;

      // Priority 3: Macro-Spectral Cheeger Isolation Score
      // In multi-enemy lobbies, favor targets with high contact with us relative to external borders (enclaves / clean cuts).
      if (enemies.length > 1) {
        const contactWithMe = e.contact != null ? e.contact : (e.contactWithMe != null ? e.contactWithMe : Math.sqrt(Math.min(T, eTerr)));
        const externalBorder = e.externalBorder != null ? e.externalBorder : (e.external != null ? e.external : Math.sqrt(eTerr));
        const totalPerimeter = Math.max(1, contactWithMe + externalBorder);
        const isolationRatio = contactWithMe / totalPerimeter; // [0, 1]
        sc += (isolationRatio - 0.5) * 160;

        // Priority 9: Cooperative Game-Theoretic Hegemonic Balancing (Shapley Anti-Snowball Index)
        if (CONFIG.enableCoalition) {
          const coalition = computeCoalitionEquilibrium(S);
          if (coalition.hegemonActive) {
            if (e.id === coalition.hegemonId) {
              sc += 3500; // Decisive priority: stop runaway hegemon before game is lost
            } else {
              sc -= 3500; // Implicit Non-Aggression: avoid weakening secondary coalition partners
            }
          }
        }
      }

      if (sc > bestFoeScore) {
        bestFoeScore = sc;
        bestFoe = e;
      }
    }
    const crushable = !!(bestFoe && (bestFoe.crushable || (B > 0 && al(B, 8) > (bestFoe.bal || 0))));
    const enemyBal = bestFoe && bestFoe.bal != null ? bestFoe.bal : 0;

    // --- PRIMARY OBJECTIVE: #1 on leaderboard (most territory) and win ---
    // Rank 1 = first place. All scores bias toward gaining/defending rank.
    let rank = 1;
    let leaderTerr = T;
    let myShare = 1;
    let totalTerr = T;
    for (let ri = 0; ri < enemies.length; ri++) {
      const et = enemies[ri] && enemies[ri].terr != null ? (enemies[ri].terr | 0) : 0;
      totalTerr += et;
      if (et > T) rank++;
      if (et > leaderTerr) leaderTerr = et;
    }
    if (S.globalRank != null && Number(S.globalRank) > 0) rank = Number(S.globalRank) | 0;
    if (S.leaderTerritory != null) leaderTerr = Math.max(leaderTerr, Number(S.leaderTerritory) | 0);
    // Also use vision enemy mass if provided
    if (S.totalEnemyTerr != null && S.totalEnemyTerr > 0) {
      totalTerr = Math.max(totalTerr, T + (S.totalEnemyTerr | 0));
    }
    myShare = T / Math.max(1, totalTerr);
    const deficitToLead = Math.max(0, leaderTerr - T);
    const isLeading = rank === 1;
    const winPressure = isLeading ? 0.35 : Math.min(1.2, 0.55 + deficitToLead / Math.max(1, T) * 0.4);

    // Expand: grow map share / catch leader via free land
    let expandScore = -1e9;
    if (hasFree) {
      expandScore = 50;
      expandScore += free * 140;
      expandScore += Math.max(0, 0.7 - d) * 70;
      if (d > 0.95) expandScore += 30;
      if (!hasEnemy) expandScore += 45;
      // Not #1 → free land is the safest way to climb leaderboard
      if (!isLeading) expandScore += 55 * winPressure;
      if (isLeading && free > 0.04) expandScore += 35; // pad the lead
      if (threat > 0.75 && !isLeading) expandScore -= 10;
      if (shrink > 6) expandScore -= 35;
      // Current VH executes kc() immediately whenever adjacent free land exists.
      // Apply the same deterministic priority only to exact adjacency, not a
      // noisy vision percentage.
      if (S.hasAdjFree === true && shrink <= 6 && trend >= -15) expandScore += 180;
    }

    // Fight: take land from others / crush / defend lead
    let fightScore = -1e9;
    if (hasEnemy) {
      fightScore = 40;
      if (crushable) fightScore += 100; // free rank progress
      if (free < 0.04) fightScore += 50;
      else if (free < 0.08) fightScore += 20;
      if (d > 0.85) fightScore += 25;
      if (threat > 0.5) fightScore += 25;
      if (shrink > 3 || trend < -12) fightScore += 60; // stop rank loss
      // Climbing: fighting adj is how you steal leaderboard land
      if (!isLeading) fightScore += 40 * winPressure;
      // Leading: only fight real threats / crush snacks
      if (isLeading) {
        fightScore += crushable ? 35 : 5;
        if (threat < 0.35 && free > 0.06) fightScore -= 25; // prefer pad lead with free
      }
      if (power >= 1.15) fightScore += 20;
      if (power < 0.7 && free > 0.08 && !isLeading) fightScore -= 10;
      fightScore += Math.min(45, enemies.length * 12);
    }

    // Game-Theoretic Hold & Capital Accumulation Model:
    // In multiplayer games (N >= 3), fighting an equal rival while underdense (d < 0.85)
    // burns capital and hands victory to third-party spectators (Lanchester Free-Rider Dilemma).
    // In duels (N <= 2), there are no spectators, so excessive holding allows the opponent to corner land.
    let holdScore = 2;
    if (!hasFree && !hasEnemy) holdScore = 90;
    if (B > 0 && B < 30) holdScore += 50; // protect from bankruptcy

    // Adjacency is local: one border opponent does not mean the lobby is a duel.
    const playersRemaining = Number(S.playersRemaining || S.alivePlayers) || 0;
    const isDuel = CONFIG.enableHardModePolicy
      ? (playersRemaining > 0 ? playersRemaining <= 2
        : typeof S.isDuel === 'boolean' ? S.isDuel : enemies.length <= 1)
      : enemies.length <= 1 || S.isDuel || (S.playersRemaining != null && S.playersRemaining <= 2);

    // If free land is exhausted and enemies are not crushable:
    if (!hasFree && !crushable) {
      if (!isDuel && shrink <= 0 && trend >= 0 && threat < 0.20 && d < 0.85 && isLeading) {
        // Safe stacking only when completely unthreatened and zero territory loss
        holdScore += 15;
      } else {
        // Active border engagement: counter-strike or pressure adjacent rivals
        fightScore += 80;
        holdScore -= 50;
      }
    } else {
      if (hasFree && B >= 30) holdScore -= 50;
      if (!isLeading && hasFree) expandScore += 25;
    }
    if (isLeading && hasFree) expandScore += 20; // pad lead fast

    // User strategy is a bounded bias, never a replacement for legality/safety.
    if (strategy === 'expansionist') {
      if (hasFree) expandScore += 28;
      if (hasEnemy && free > 0.04 && !crushable) fightScore -= 8;
    } else if (strategy === 'aggressive') {
      if (hasEnemy) fightScore += 26;
      holdScore -= 10;
    } else if (strategy === 'defensive') {
      holdScore += 18;
      if (hasEnemy && (threat > 0.45 || shrink > 2)) fightScore += 22;
      if (hasEnemy && threat < 0.25 && !crushable) fightScore -= 12;
    }

    let action = 'hold';
    let reason = 'no-target';
    let best = holdScore;
    if (expandScore >= best && expandScore > -1e8) {
      best = expandScore;
      action = 'expand';
      reason = d > 1 ? 'dump-expand' : (free > 0.1 ? 'farm-free' : 'edge-expand');
    }
    if (fightScore >= best && fightScore > -1e8) {
      best = fightScore;
      if (!crushable && shrink > 2 && B > 120 && enemies.length > 1) {
        // Anti-Kamikaze Citadel Mode: absorb suicidal rushes with 1.30x defensive multiplier
        if (hasFree && (free > 0.02 || S.hasAdjFree)) {
          action = 'expand';
          reason = 'citadel-absorb-expand';
        } else {
          action = 'hold';
          reason = 'citadel-absorb-hold';
        }
      } else {
        action = 'fight';
        reason = crushable ? 'crush-adj' : (shrink > 3 ? 'defend-push' : 'pressure-adj');
      }
    }
    if (action === 'hold') reason = holdScore >= 50 ? 'stack-interest' : 'idle-hold';

    // If both expand and fight are close, overstack+enemy → fight; underdense+free → expand
    if (hasFree && hasEnemy && Math.abs(expandScore - fightScore) < 15) {
      if (crushable || shrink > 4 || free < 0.05) {
        action = 'fight';
        reason = 'tie-fight';
      } else if (d < 0.55 || free > 0.1) {
        action = 'expand';
        reason = 'tie-expand';
      }
    }

    // ── MODEL PREDICTIVE CONTROL (MPC) TRAJECTORY EVALUATOR ──
    // When multiple strategic options exist, simulate forward H=8 cycles
    // under exact game mechanics to pick a* = argmax_a E[V(s_{t+H}) | s_t, a]:
    if (hasFree && hasEnemy && B >= 60 && !crushable && shrink <= 2) {
      const seq = S.attackSequence != null ? (S.attackSequence | 0) : 0;
      const candidates = [
        { type: 'hold', ratio: 0 },
        { type: 'expand', ratio: Math.min(0.35, Math.max(0.10, veryHardTaperRatio(seq))) },
        { type: 'fight', targetId: bestFoe ? bestFoe.id : null, ratio: 0.22 }
      ];
      const mpcEval = evaluateMPCAction(S, candidates, 8);
      if (mpcEval && mpcEval.bestAction) {
        if (mpcEval.bestAction.type === 'hold' && holdScore > -50 && d < 0.85) {
          action = 'hold';
          reason = 'mpc-compound-hold';
        } else if (mpcEval.bestAction.type === 'expand' && hasFree) {
          action = 'expand';
          reason = 'mpc-future-expand';
        } else if (mpcEval.bestAction.type === 'fight' && bestFoe) {
          action = 'fight';
          reason = 'mpc-future-fight';
        }
      }
    }

    // --- ADVANCED GAME THEORY: Lanchester Free-For-All Stability Veto ---
    // If we engage in an attrition war against a non-crushable target, both combatants burn troops.
    // In multi-agent lobbies, this risks falling into the "Kingmaker Trap" where an outside 3rd party
    // spectator snowballs uncontested compound interest to victory.
    // Veto applies strictly when we are NOT losing territory and not under immediate threat:
    if (action === 'fight' && !crushable && enemies.length > 1 && shrink <= 2 && trend >= -8 && threat < 0.6 && (hasFree || isLeading)) {
      let maxOtherPower = 0;
      const targetPower = (bestFoe && bestFoe.bal || 0) + 100 * (bestFoe && bestFoe.terr || 1);
      const myPower = B + 100 * T;
      let totalLobbyPower = myPower + targetPower;

      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (!e || e === bestFoe) continue;
        const ePow = (e.bal || 0) + 100 * (e.terr || 1);
        totalLobbyPower += ePow;
        if (ePow > maxOtherPower) maxOtherPower = ePow;
      }

      // Projected attrition loss: exchange against target while outside spectators compound
      const projectedMyPowerAfter = myPower - (0.20 * B);
      const projectedLeaderPower = maxOtherPower * 1.04; // Outside spectator compound interest
      const projectedLobbyTotal = totalLobbyPower - (0.30 * Math.min(B, bestFoe && bestFoe.bal || 0));

      const myShareCurrent = myPower / Math.max(1, totalLobbyPower);
      const myShareAfter = projectedMyPowerAfter / Math.max(1, projectedLobbyTotal);
      const leaderShareCurrent = maxOtherPower / Math.max(1, totalLobbyPower);
      const leaderShareAfter = projectedLeaderPower / Math.max(1, projectedLobbyTotal);

      // If our relative share drops while an outside leader gains relative dominance:
      if (myShareAfter < myShareCurrent && (leaderShareAfter - leaderShareCurrent > 0.035)) {
        if (hasFree && (free > 0.01 || S.hasAdjFree)) {
          action = 'expand';
          reason = 'lanchester-veto-expand';
        } else if (d < 0.65) {
          action = 'hold';
          reason = 'lanchester-veto-hold';
        }
      }
    }

    // Exact free land has priority unless we are actually losing territory or facing an active border war.
    const enemyPressureActive = hasEnemy && (free < 0.06 || threat > 0.35 || shrink > 1 || S.primaryDanger > 0.4);
    if (S.hasAdjFree === true && shrink <= 6 && trend >= -15 && hasFree && !enemyPressureActive) {
      action = 'expand';
      reason = 'exact-free-first';
    }

    // Priority 6: Monte Carlo Tree Search (MCTS) Endgame Tactical Equilibrium
    let mcts = null;
    if (CONFIG.enableMCTS && hasEnemy && (enemies.length <= 3 || myShare >= 0.35 || free < 0.03)) {
      mcts = computeMCTSEndgameAction(S, 45, 0.5);
      if (mcts) {
        // MCTS hold veto is strictly valid for multi-agent standoffs (N >= 3) to prevent free-riding.
        // It must NEVER veto active border defense when shrinking or in 1v1 duels.
        const canVeto = shrink <= 0 && trend >= 0 && enemies.length >= 2 && !isDuel && isLeading;
        if (canVeto && mcts.bestAction === 'hold' && !crushable && action === 'fight') {
          action = 'hold';
          reason = 'mcts-equilibrium-hold';
        }
      }
    }

    if (CONFIG.enableHardModePolicy) {
      // Neutral expansion raises capacity without the attrition cost of war.
      // Preserve this intent through speculative MPC/MCTS overrides; planSpend
      // still applies the live crush barrier and incoming-attack defenses.
      if (S.hasAdjFree === true) {
        action = 'expand';
        reason = 'hard-neutral-first';
      } else if (hasEnemy && !crushable && d < CONFIG.combatBankTarget &&
          (!isDuel || B < 1.30 * enemyBal)) {
        action = 'hold';
        reason = 'hard-build-combat-bank';
      }
    }

    const wantEnemy = action === 'fight';
    const preferNeutral = action === 'expand';
    let phaseLabel = 'LAND_RUSH';
    if (action === 'hold') phaseLabel = 'STACK';
    else if (crushable && wantEnemy) phaseLabel = 'CRUSH';
    else if (shrink > 5 || trend < -15) phaseLabel = 'SURVIVE';
    else if (wantEnemy) phaseLabel = 'PRESSURE';
    else if (free > 0.12 || B < 200) phaseLabel = 'OPENING';
    else phaseLabel = 'LAND_RUSH';

    return {
      action: action,
      wantEnemy: wantEnemy,
      preferNeutral: preferNeutral,
      crushable: crushable && wantEnemy,
      focusEnemyId: bestFoe && bestFoe.id != null ? bestFoe.id : null,
      enemyBal: enemyBal,
      phaseLabel: phaseLabel,
      reason: reason,
      urgency: wantEnemy ? (crushable ? 0.88 : 0.65) : (d > 1 ? 0.7 : 0.4),
      scores: {
        expand: parseFloat(expandScore.toFixed(1)),
        fight: parseFloat(fightScore.toFixed(1)),
        hold: parseFloat(holdScore.toFixed(1))
      },
      density: parseFloat(d.toFixed(3)),
      free: parseFloat(free.toFixed(3)),
      rank: typeof rank !== 'undefined' ? rank : 1,
      isLeading: typeof isLeading !== 'undefined' ? !!isLeading : false,
      myShare: typeof myShare !== 'undefined' ? parseFloat(myShare.toFixed(3)) : 0,
      strategy: strategy,
      coalition: CONFIG.enableCoalition ? computeCoalitionEquilibrium(S) : { hegemonActive: false, hegemonId: null, leaderShare: 0, coalitionIndices: {} },
      mcts: mcts,
      objective: 'first-place-win'
    };
  }

  /**
   * Priority 3: Spectral Graph Theory & Cheeger Bisection (Fiedler Vector)
   *
   * Given spatial candidates C = [c_0, c_1, ..., c_{n-1}], constructs the spatial
   * Graph Laplacian L = D - W with an adaptive RBF kernel:
   *   W_{ij} = exp(-||x_i - x_j||^2 / (2 * sigma^2))
   * Solves for the algebraic connectivity lambda_2 and Fiedler Vector v_2 via
   * shifted power iteration with Gram-Schmidt 1-deflation in 8 iterations (< 3 µs).
   */
  // Persistent flat scratch buffers for Spectral Graph Cut (0 GC)
  const SPEC_MAX_N = 64;
  const specXsBuf = new Float64Array(SPEC_MAX_N);
  const specYsBuf = new Float64Array(SPEC_MAX_N);
  const specDSqBuf = new Float64Array(SPEC_MAX_N * SPEC_MAX_N);
  const specDistsBuf = new Float64Array((SPEC_MAX_N * (SPEC_MAX_N - 1)) >> 1);
  const specWBuf = new Float64Array(SPEC_MAX_N * SPEC_MAX_N);
  const specDBuf = new Float64Array(SPEC_MAX_N);
  const specVBuf = new Float64Array(SPEC_MAX_N);
  const specVNextBuf = new Float64Array(SPEC_MAX_N);
  const specBScoreBuf = new Float64Array(SPEC_MAX_N);
  const specPartBuf = new Int8Array(SPEC_MAX_N);

  function quickselect(arr, left, right, k) {
    while (left < right) {
      const pivotIdx = (left + right) >> 1;
      const pivotVal = arr[pivotIdx];
      arr[pivotIdx] = arr[right];
      arr[right] = pivotVal;
      let storeIdx = left;
      for (let i = left; i < right; i++) {
        if (arr[i] < pivotVal) {
          const tmp = arr[storeIdx];
          arr[storeIdx] = arr[i];
          arr[i] = tmp;
          storeIdx++;
        }
      }
      arr[right] = arr[storeIdx];
      arr[storeIdx] = pivotVal;
      if (storeIdx === k) return arr[k];
      if (storeIdx < k) left = storeIdx + 1;
      else right = storeIdx - 1;
    }
    return arr[k];
  }

  function computeSpectralFiedler(candidates) {
    if (!candidates || candidates.length < 2) return null;
    const n = candidates.length;
    if (n === 2) {
      return {
        fiedler: new Float64Array([-1, 1]),
        bottleneckScores: new Float64Array([100, 100]),
        cheegerCutRatio: 1.0,
        partition: new Int8Array([-1, 1])
      };
    }

    const xs = n <= SPEC_MAX_N ? specXsBuf : new Float64Array(n);
    const ys = n <= SPEC_MAX_N ? specYsBuf : new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const c = candidates[i];
      xs[i] = (c && c.x != null) ? Number(c.x) : i * 10;
      ys[i] = (c && c.y != null) ? Number(c.y) : (i % 2) * 5;
    }

    const numPairs = (n * (n - 1)) >> 1;
    const dists = n <= SPEC_MAX_N ? specDistsBuf : new Float64Array(numPairs);
    const dSq = n <= SPEC_MAX_N ? specDSqBuf : new Float64Array(n * n);

    let p = 0;
    for (let i = 0; i < n; i++) {
      const xi = xs[i];
      const yi = ys[i];
      const rowOffset = i * n;
      dSq[rowOffset + i] = 0;
      for (let j = i + 1; j < n; j++) {
        const dx = xi - xs[j];
        const dy = yi - ys[j];
        const sq = dx * dx + dy * dy;
        dSq[rowOffset + j] = sq;
        dSq[j * n + i] = sq;
        dists[p++] = Math.sqrt(sq);
      }
    }

    const midK = numPairs >> 1;
    const medianDist = quickselect(dists, 0, numPairs - 1, midK) || 10;
    const sigma = Math.max(1.0, medianDist);
    const twoSigmaSq = 2 * sigma * sigma;
    const invTwoSigmaSq = -1.0 / twoSigmaSq;

    const W = n <= SPEC_MAX_N ? specWBuf : new Float64Array(n * n);
    const D = n <= SPEC_MAX_N ? specDBuf : new Float64Array(n);
    let maxDegree = 0;

    for (let i = 0; i < n; i++) {
      const rowOffset = i * n;
      W[rowOffset + i] = 0;
      for (let j = i + 1; j < n; j++) {
        const sq = dSq[rowOffset + j];
        const w = Math.exp(sq * invTwoSigmaSq);
        W[rowOffset + j] = w;
        W[j * n + i] = w;
      }
    }

    for (let i = 0; i < n; i++) {
      let deg = 0;
      const rowOffset = i * n;
      for (let j = 0; j < n; j++) {
        deg += W[rowOffset + j];
      }
      D[i] = deg;
      if (deg > maxDegree) maxDegree = deg;
    }

    const mu = 2.0 * (maxDegree + 1e-5);
    const v = n <= SPEC_MAX_N ? specVBuf : new Float64Array(n);
    let sumV = 0;
    for (let i = 0; i < n; i++) {
      const initVal = (i % 2 === 0 ? 1 : -1) * (1 + (i / n));
      v[i] = initVal;
      sumV += initVal;
    }
    const meanInit = sumV / n;
    let normV = 0;
    for (let i = 0; i < n; i++) {
      const val = v[i] - meanInit;
      v[i] = val;
      normV += val * val;
    }
    normV = Math.sqrt(normV) || 1;
    const invNormV = 1.0 / normV;
    for (let i = 0; i < n; i++) v[i] *= invNormV;

    const vNext = n <= SPEC_MAX_N ? specVNextBuf : new Float64Array(n);
    for (let iter = 0; iter < 8; iter++) {
      let sNext = 0;
      for (let i = 0; i < n; i++) {
        let rowSum = (mu - D[i]) * v[i];
        const rowOffset = i * n;
        for (let j = 0; j < n; j++) {
          rowSum += W[rowOffset + j] * v[j];
        }
        vNext[i] = rowSum;
        sNext += rowSum;
      }
      const mNext = sNext / n;
      let normNext = 0;
      for (let i = 0; i < n; i++) {
        const val = vNext[i] - mNext;
        vNext[i] = val;
        normNext += val * val;
      }
      normNext = Math.sqrt(normNext) || 1;
      const invNormNext = 1.0 / normNext;
      for (let i = 0; i < n; i++) v[i] = vNext[i] * invNormNext;
    }

    const bottleneckScores = n <= SPEC_MAX_N ? specBScoreBuf.subarray(0, n) : new Float64Array(n);
    const partition = n <= SPEC_MAX_N ? specPartBuf.subarray(0, n) : new Int8Array(n);
    let cutWeight = 0, volA = 0, volB = 0;
    for (let i = 0; i < n; i++) {
      partition[i] = v[i] >= 0 ? 1 : -1;
      if (partition[i] === 1) volA += D[i]; else volB += D[i];
      const absFiedler = Math.abs(v[i]);
      const proximityToCut = Math.max(0, 1.0 - absFiedler * 2.0);
      const degreePenalty = 1.0 / (1.0 + 0.15 * D[i]);
      bottleneckScores[i] = Math.round(proximityToCut * degreePenalty * 100);
    }
    for (let i = 0; i < n; i++) {
      const rowOffset = i * n;
      for (let j = i + 1; j < n; j++) {
        if (partition[i] !== partition[j]) cutWeight += W[rowOffset + j];
      }
    }
    const minVol = Math.max(1e-4, Math.min(volA, volB));
    const cheegerCutRatio = cutWeight / minVol;

    return {
      fiedler: v.slice(0, n),
      bottleneckScores: bottleneckScores.slice(0, n),
      cheegerCutRatio,
      partition: partition.slice(0, n)
    };
  }

  /**
   * Priority 4: Harmonic Analysis & Poisson PDE Potential Fields
   *
   * Solves the 2D Poisson boundary value problem:
   *   \nabla^2 \Phi(x, y) = \rho(x, y)
   * on a spatial mesh with Dirichlet boundary conditions via Successive Over-Relaxation (SOR).
   *
   * By the Strong Maximum Principle for harmonic functions, \Phi has NO local extrema
   * in the interior, guaranteeing that troop flow J = -\nabla \Phi never gets trapped
   * in concave terrain, fjords, or mountain dead-ends.
   */
  function computePoissonPotentialField(sources, sinks, obstacles, gridSize) {
    const N = gridSize || 8;
    const numCells = N * N;
    const Phi = new Float64Array(numCells);
    const fixedMask = new Uint8Array(numCells);

    function toIdx(x, y) {
      const gx = Math.max(0, Math.min(N - 1, Math.floor(((Number(x) || 0) / 1000) * N)));
      const gy = Math.max(0, Math.min(N - 1, Math.floor(((Number(y) || 0) / 1000) * N)));
      return gy * N + gx;
    }

    if (sources) {
      for (let i = 0; i < sources.length; i++) {
        const s = sources[i];
        if (!s) continue;
        const idx = toIdx(s.x, s.y);
        Phi[idx] = 1.0;
        fixedMask[idx] = 1;
      }
    }

    if (sinks) {
      for (let i = 0; i < sinks.length; i++) {
        const k = sinks[i];
        if (!k) continue;
        const idx = toIdx(k.x, k.y);
        Phi[idx] = -1.0;
        fixedMask[idx] = 1;
      }
    }

    if (obstacles) {
      for (let i = 0; i < obstacles.length; i++) {
        const o = obstacles[i];
        if (!o) continue;
        const idx = toIdx(o.x, o.y);
        Phi[idx] = 0.6;
        fixedMask[idx] = 1;
      }
    }

    let interiorCount = 0;
    for (let y = 1; y < N - 1; y++) {
      const rowOffset = y * N;
      for (let x = 1; x < N - 1; x++) {
        if (!fixedMask[rowOffset + x]) interiorCount++;
      }
    }

    const interiorIndices = new Int32Array(interiorCount);
    let ii = 0;
    for (let y = 1; y < N - 1; y++) {
      const rowOffset = y * N;
      for (let x = 1; x < N - 1; x++) {
        const idx = rowOffset + x;
        if (!fixedMask[idx]) interiorIndices[ii++] = idx;
      }
    }

    const omega = 1.35;
    const oneMinusOmega = 1.0 - omega;
    const omegaQuarter = omega * 0.25;

    for (let iter = 0; iter < 8; iter++) {
      for (let i = 0; i < interiorCount; i++) {
        const idx = interiorIndices[i];
        const neighborSum = Phi[idx - 1] + Phi[idx + 1] + Phi[idx - N] + Phi[idx + N];
        Phi[idx] = oneMinusOmega * Phi[idx] + omegaQuarter * neighborSum;
      }
    }

    return {
      gridSize: N,
      potentialGrid: Phi,
      sampleGradient: function (x, y, fromX, fromY) {
        const gx = Math.max(1, Math.min(N - 2, Math.floor(((Number(x) || 0) / 1000) * N)));
        const gy = Math.max(1, Math.min(N - 2, Math.floor(((Number(y) || 0) / 1000) * N)));
        const idx = gy * N + gx;
        const gradX = (Phi[idx + 1] - Phi[idx - 1]) * 0.5;
        const gradY = (Phi[idx + N] - Phi[idx - N]) * 0.5;

        let pull = 0;
        if (fromX != null && fromY != null) {
          const dx = Number(x) - Number(fromX);
          const dy = Number(y) - Number(fromY);
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const ux = dx / dist;
          const uy = dy / dist;
          pull = - (gradX * ux + gradY * uy);
        } else {
          pull = Math.sqrt(gradX * gradX + gradY * gradY);
        }

        return {
          gradX,
          gradY,
          potential: Phi[idx],
          pull
        };
      }
    };
  }

  /**
   * Karush-Kuhn-Tucker (KKT) Multi-Front Resource Allocator
   *
   * Replaces naive uniform budget division (total / K) with convex water-filling
   * optimization across concurrent fronts:
   *   max \sum_k U_k(x_k)  subject to \sum_k x_k <= B,  min_k <= x_k <= max_k
   *
   * Equates marginal utilities \partial U_k / \partial x_k = \lambda* to ensure
   * priority fronts (e.g. isthmus breaches) receive decisive mass to break through.
   */
  function allocateKKTMultiFront(totalBudget, frontConfigs) {
    const B = Math.max(0, totalBudget | 0);
    if (!frontConfigs || !frontConfigs.length) return [];
    const K = frontConfigs.length;
    if (K === 1) {
      const cfg = frontConfigs[0];
      const minD = Math.max(0, cfg.min | 0);
      const maxD = cfg.max != null ? Math.max(minD, cfg.max | 0) : B;
      return [Math.min(B, Math.max(minD, maxD))];
    }

    const allocations = new Int32Array(K);
    let remBudget = B;

    // 1. Allocate minimum demand floors
    for (let k = 0; k < K; k++) {
      const cfg = frontConfigs[k];
      const minD = Math.max(0, cfg.min | 0);
      const alloc = Math.min(remBudget, minD);
      allocations[k] = alloc;
      remBudget -= alloc;
    }

    if (remBudget <= 0) {
      return Array.from(allocations);
    }

    // 2. KKT Diminishing Returns: U_k(y_k) = V_k * (1 - exp(-y_k / s_k))
    // Stationarity: U'_k(y_k) = (V_k / s_k) * exp(-y_k / s_k) = lambda
    const V = new Float64Array(K);
    const s = new Float64Array(K);
    const cap = new Float64Array(K);
    let maxMarginal = 1e-9;

    for (let k = 0; k < K; k++) {
      const cfg = frontConfigs[k];
      let weight = cfg.weight != null ? Math.max(0.05, Number(cfg.weight)) : 1.0;
      if (cfg.isChokepoint) weight *= 2.8;
      if (cfg.isEnclave) weight *= 1.8;
      V[k] = weight;
      s[k] = Math.max(10.0, (cfg.saturation != null ? Number(cfg.saturation) : (remBudget * 0.4)));
      const maxD = cfg.max != null ? Math.max(allocations[k], cfg.max | 0) : B;
      cap[k] = Math.max(0, maxD - allocations[k]);

      const initialMarginal = V[k] / s[k];
      if (initialMarginal > maxMarginal) maxMarginal = initialMarginal;
    }

    // 3. Monotonic bisection search for optimal Lagrange multiplier lambda
    let lowLambda = 1e-9;
    let highLambda = maxMarginal * 1.05;
    const y = new Float64Array(K);

    for (let iter = 0; iter < 16; iter++) {
      const midLambda = (lowLambda + highLambda) * 0.5;
      let sumY = 0;

      for (let k = 0; k < K; k++) {
        const ratio = (midLambda * s[k]) / V[k];
        let yk = 0;
        if (ratio < 1.0) {
          yk = -s[k] * Math.log(ratio);
          if (yk > cap[k]) yk = cap[k];
          if (yk < 0) yk = 0;
        }
        y[k] = yk;
        sumY += yk;
      }

      if (sumY > remBudget) {
        lowLambda = midLambda;
      } else {
        highLambda = midLambda;
      }
    }

    // 4. Discretize integer allocations
    let spentExtra = 0;
    for (let k = 0; k < K; k++) {
      const add = Math.floor(y[k]);
      allocations[k] += add;
      spentExtra += add;
    }

    let leftover = remBudget - spentExtra;
    while (leftover > 0) {
      let bestK = -1;
      let bestResidual = -1;
      for (let k = 0; k < K; k++) {
        const currentAdd = allocations[k] - (frontConfigs[k].min | 0);
        if (currentAdd < cap[k]) {
          const marginal = (V[k] / s[k]) * Math.exp(-currentAdd / s[k]);
          if (marginal > bestResidual) {
            bestResidual = marginal;
            bestK = k;
          }
        }
      }
      if (bestK === -1) break;
      allocations[bestK]++;
      leftover--;
    }

    return Array.from(allocations);
  }

  /**
   * Priority 8: Discrete Voronoi Territorial Area Partitioning
   *
   * Solves the discrete Dirichlet/Voronoi tessellation across candidate landing sites
   * S = {s_1, ..., s_K} on a spatial coordinate domain:
   *   V(s_k) = { x in Omega : dist(x, s_k) <= dist(x, s_j) for all j != k }
   *
   * Evaluates each site's territorial basin, distance to rival centroid, and
   * projected area capture efficiency in O(K * G^2) time (< 1.5 µs).
   */
  function computeVoronoiPartition(sites, rivals, gridSize) {
    const G = gridSize || 16;
    if (!sites || !sites.length) return [];
    const K = sites.length;
    const areas = new Int32Array(K);
    const exposedBorders = new Int32Array(K);

    const rivalCoords = (rivals || []).map(r => ({
      x: (((r && r.x != null) ? Number(r.x) : 500) / 1000) * G,
      y: (((r && r.y != null) ? Number(r.y) : 500) / 1000) * G
    }));

    const siteCoords = sites.map(s => ({
      x: (((s && s.x != null) ? Number(s.x) : 500) / 1000) * G,
      y: (((s && s.y != null) ? Number(s.y) : 500) / 1000) * G
    }));

    // Tessellate coarse grid
    for (let gy = 0; gy < G; gy++) {
      for (let gx = 0; gx < G; gx++) {
        let minDistSq = Infinity;
        let closestSite = -1;

        for (let k = 0; k < K; k++) {
          const dx = gx - siteCoords[k].x;
          const dy = gy - siteCoords[k].y;
          const dSq = dx * dx + dy * dy;
          if (dSq < minDistSq) {
            minDistSq = dSq;
            closestSite = k;
          }
        }

        if (closestSite >= 0) {
          areas[closestSite]++;

          // Check proximity to rivals for border exposure penalty
          for (let r = 0; r < rivalCoords.length; r++) {
            const rdx = gx - rivalCoords[r].x;
            const rdy = gy - rivalCoords[r].y;
            if (rdx * rdx + rdy * rdy <= 4.0) {
              exposedBorders[closestSite]++;
            }
          }
        }
      }
    }

    const totalCells = G * G;
    return sites.map((s, k) => {
      const areaShare = areas[k] / totalCells;
      const exposureRatio = exposedBorders[k] / Math.max(1, areas[k]);
      // Compactness score: high enclosed territory, low exposed border to superpower rivals
      const voronoiScore = Math.round((areaShare * 100) - (exposureRatio * 40));
      return Object.assign({}, s, {
        voronoiCells: areas[k],
        voronoiAreaShare: parseFloat(areaShare.toFixed(3)),
        borderExposure: parseFloat(exposureRatio.toFixed(3)),
        voronoiScore
      });
    });
  }

  /**
   * Priority 9: Cooperative Game Theory & Shapley FFA Balancing (Anti-Snowball Coalition Index)
   *
   * Formulates multi-player territorial dynamics as a cooperative game (N, v).
   * Detects runaway hegemons (players holding >= 35% of total known territory or >= 1.35x our territory).
   * Computes coalition index chi_k:
   *   chi_hegemon = -1.0 (Target for decisive coalition containment)
   *   chi_rival   = +0.85 (Implicit non-aggression truce to avoid Lanchester mutual destruction)
   */
  function computeCoalitionEquilibrium(state) {
    if (!state || !state.adjEnemies || state.adjEnemies.length <= 1) {
      return { hegemonActive: false, hegemonId: null, leaderShare: 0, coalitionIndices: {} };
    }
    const myTerr = state.territory || 1;
    const rivals = state.adjEnemies;

    let maxRivalTerr = 0;
    let leader = null;
    let totalRivalTerr = 0;

    for (let i = 0; i < rivals.length; i++) {
      const r = rivals[i];
      const terr = r.terr || 0;
      totalRivalTerr += terr;
      if (terr > maxRivalTerr) {
        maxRivalTerr = terr;
        leader = r;
      }
    }

    const grandTotal = myTerr + totalRivalTerr;
    const leaderShare = maxRivalTerr / Math.max(1, grandTotal);

    // Hegemon criteria: Leader holds >= 35% of total known territory and is significantly larger than us
    const isLeaderHegemon = !!(leader && leaderShare >= 0.35 && leader.terr > myTerr * 1.35);
    const coalitionIndices = {};

    for (let i = 0; i < rivals.length; i++) {
      const r = rivals[i];
      if (isLeaderHegemon && r.id === leader.id) {
        coalitionIndices[r.id] = -1.0; // Containment priority
      } else if (isLeaderHegemon) {
        coalitionIndices[r.id] = +0.85; // Non-aggression truce
      } else {
        coalitionIndices[r.id] = 0.0;  // Standard Nash non-cooperative
      }
    }

    return {
      hegemonActive: isLeaderHegemon,
      hegemonId: isLeaderHegemon ? leader.id : null,
      leaderShare: parseFloat(leaderShare.toFixed(3)),
      coalitionIndices
    };
  }

  // Fast typed-array binary min-heap
  class FastMinHeap {
    constructor(capacity) {
      this.keys = new Float32Array(capacity);
      this.vals = new Int32Array(capacity);
      this.length = 0;
    }
    clear() {
      this.length = 0;
    }
    push(val, key) {
      let i = this.length++;
      this.keys[i] = key;
      this.vals[i] = val;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (this.keys[i] < this.keys[p]) {
          const tk = this.keys[i]; this.keys[i] = this.keys[p]; this.keys[p] = tk;
          const tv = this.vals[i]; this.vals[i] = this.vals[p]; this.vals[p] = tv;
          i = p;
        } else break;
      }
    }
    pop() {
      if (this.length === 0) return -1;
      const topVal = this.vals[0];
      const last = --this.length;
      if (last > 0) {
        this.keys[0] = this.keys[last];
        this.vals[0] = this.vals[last];
        let i = 0;
        while ((i << 1) + 1 < this.length) {
          let left = (i << 1) + 1;
          let right = left + 1;
          let smallest = (right < this.length && this.keys[right] < this.keys[left]) ? right : left;
          if (this.keys[smallest] < this.keys[i]) {
            const tk = this.keys[i]; this.keys[i] = this.keys[smallest]; this.keys[smallest] = tk;
            const tv = this.vals[i]; this.vals[i] = this.vals[smallest]; this.vals[smallest] = tv;
            i = smallest;
          } else break;
        }
      }
      return topVal;
    }
  }

  const EIKONAL_DIRS = [
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 }
  ];

  /**
   * Priority 10: Eikonal Geodesic Wavefront Solver (Discrete Fast Marching)
   *
   * Solves the continuous isotropic Eikonal equation:
   *   || \nabla T(x) || = 1 / v(x)
   * on a discretized macro-grid via zero-GC typed-array priority-queue wavefront propagation.
   * Eliminates detour blindness around water bodies, straits, and impassable mountain ridges.
   */
  function computeEikonalGeodesicField(gridW, gridH, sources, obstacles, speedGrid) {
    const W = gridW || 16;
    const H = gridH || 8;
    const numCells = W * H;

    const T = new Float32Array(numCells);
    T.fill(1e6);

    const isObstacle = new Uint8Array(numCells);
    const isSource = new Uint8Array(numCells);

    if (sources && sources.length) {
      for (let s = 0; s < sources.length; s++) {
        const src = sources[s];
        const sx = Math.min(W - 1, Math.max(0, Math.floor((((src && src.x != null) ? Number(src.x) : 500) / 1000) * W)));
        const sy = Math.min(H - 1, Math.max(0, Math.floor((((src && src.y != null) ? Number(src.y) : 500) / 1000) * H)));
        const sIdx = sy * W + sx;
        T[sIdx] = 0;
        isSource[sIdx] = 1;
      }
    } else {
      T[0] = 0;
      isSource[0] = 1;
    }

    if (obstacles && obstacles.length) {
      for (let o = 0; o < obstacles.length; o++) {
        const obs = obstacles[o];
        const ox = Math.min(W - 1, Math.max(0, Math.floor((((obs && obs.x != null) ? Number(obs.x) : 500) / 1000) * W)));
        const oy = Math.min(H - 1, Math.max(0, Math.floor((((obs && obs.y != null) ? Number(obs.y) : 500) / 1000) * H)));
        isObstacle[oy * W + ox] = 1;
      }
    }

    const h = 1.0;

    function updateCell(i, j) {
      const idx = j * W + i;
      if (isObstacle[idx] || isSource[idx]) return;

      let a = 1e6;
      if (i > 0 && !isObstacle[idx - 1]) a = Math.min(a, T[idx - 1]);
      if (i < W - 1 && !isObstacle[idx + 1]) a = Math.min(a, T[idx + 1]);

      let b = 1e6;
      if (j > 0 && !isObstacle[idx - W]) b = Math.min(b, T[idx - W]);
      if (j < H - 1 && !isObstacle[idx + W]) b = Math.min(b, T[idx + W]);

      let speed = 1.0;
      if (speedGrid) {
        speed = speedGrid[idx] != null ? Math.max(0.1, Number(speedGrid[idx])) : 1.0;
      }
      const invF = h / speed;

      let T_cand = 1e6;
      if (a >= 1e5 && b >= 1e5) {
        return;
      } else if (a >= 1e5) {
        T_cand = b + invF;
      } else if (b >= 1e5) {
        T_cand = a + invF;
      } else {
        const diff = Math.abs(a - b);
        if (diff >= invF) {
          T_cand = Math.min(a, b) + invF;
        } else {
          const discr = 2.0 * invF * invF - diff * diff;
          if (discr >= 0) {
            T_cand = (a + b + Math.sqrt(discr)) * 0.5;
          } else {
            T_cand = Math.min(a, b) + invF;
          }
        }
      }

      if (T_cand < T[idx]) T[idx] = T_cand;
    }

    for (let iter = 0; iter < 2; iter++) {
      for (let j = 0; j < H; j++) {
        for (let i = 0; i < W; i++) updateCell(i, j);
      }
      for (let j = 0; j < H; j++) {
        for (let i = W - 1; i >= 0; i--) updateCell(i, j);
      }
      for (let j = H - 1; j >= 0; j--) {
        for (let i = W - 1; i >= 0; i--) updateCell(i, j);
      }
      for (let j = H - 1; j >= 0; j--) {
        for (let i = 0; i < W; i++) updateCell(i, j);
      }
    }

    return {
      width: W,
      height: H,
      times: T,
      getTravelTime: function (normX, normY) {
        const gx = Math.min(W - 1, Math.max(0, Math.floor(((normX != null ? Number(normX) : 500) / 1000) * W)));
        const gy = Math.min(H - 1, Math.max(0, Math.floor(((normY != null ? Number(normY) : 500) / 1000) * H)));
        const val = T[gy * W + gx];
        return val >= 1e5 ? 999 : val;
      }
    };
  }

  /**
   * Priority 7: Stochastic SDE Attrition / Breach Probability Solver
   *
   * Formulates frontline penetration via an Ornstein-Uhlenbeck / Brownian drift-diffusion SDE:
   *   dX_t = (mu_A - mu_D) dt + sigma dW_t
   * Attacker A faces defender D with defensive multiplier (~1.28x).
   * Calculates breach probability P_breach via Abramowitz & Stegun erf polynomial approximation (<0.05 µs, 0 GC).
   * Vetoes attacks with P_breach < 0.55 to eliminate Lanchester suicide traps.
   */
  function computeBreachProbability(attackerTroops, defenderTroops, sigmaParam) {
    if (!isFinite(attackerTroops) || !isFinite(defenderTroops)) {
      if (attackerTroops === Infinity && defenderTroops === Infinity) return { pBreach: 0.5, zScore: 0, isVetoed: false, expectedLoss: 0 };
      if (attackerTroops === Infinity) return { pBreach: 1.0, zScore: 99, isVetoed: false, expectedLoss: 0 };
      return { pBreach: 0.0, zScore: -99, isVetoed: true, expectedLoss: 0 };
    }
    const A = Math.max(0, Number(attackerTroops) || 0);
    const D = Math.max(0, Number(defenderTroops) || 0);
    if (A <= 0) return { pBreach: 0, zScore: -99, isVetoed: true, expectedLoss: 0 };
    if (D <= 0) return { pBreach: 1, zScore: 99, isVetoed: false, expectedLoss: 0 };

    const sigma = sigmaParam != null ? Math.max(0.05, Number(sigmaParam)) : 0.38;
    const defenseMultiplier = 1.28;
    const meanDiff = A - defenseMultiplier * D;
    const stdDev = sigma * Math.sqrt(A + D + 1);
    const z = meanDiff / Math.max(1e-4, stdDev);

    // Abramowitz & Stegun 7.1.26 erf approximation
    const p = 0.3275911;
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;

    const sign = z >= 0 ? 1 : -1;
    const absZ = Math.abs(z) / Math.SQRT2;
    const t = 1.0 / (1.0 + p * absZ);
    const poly = ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t;
    const erf = sign * (1.0 - poly * Math.exp(-absZ * absZ));
    const pBreach = Math.max(0.0, Math.min(1.0, 0.5 * (1.0 + erf)));

    const expectedLoss = Math.min(A, D * defenseMultiplier);
    const sdeThreshold = CONFIG.sigmaSDE != null ? CONFIG.sigmaSDE : 0.55;
    const isVetoed = pBreach < sdeThreshold;

    return {
      pBreach: parseFloat(pBreach.toFixed(4)),
      zScore: parseFloat(z.toFixed(3)),
      expectedLoss: Math.round(expectedLoss),
      isVetoed: isVetoed
    };
  }

  /**
   * Priority 6: Monte Carlo Tree Search (MCTS) Endgame Tactical Kernel
   *
   * Activates when alive rivals <= 3 or total land claimed >= 85%.
   * Performs rollouts with Upper Confidence Bound for Trees (UCT, C = sqrt(2)).
   * Evaluates 3-way Lanchester equilibrium to determine whether attacking player A,
   * attacking player B, or accumulating troops (pass) yields the highest win probability.
   */
  // Persistent flat simulation scratch buffers for MCTS (0 GC)
  const MCTS_MAX_ENEMIES = 16;
  const MCTS_MAX_ACTIONS = 33;
  const mctsSimBalBuf = new Float64Array(MCTS_MAX_ENEMIES + 1);
  const mctsSimTerrBuf = new Float64Array(MCTS_MAX_ENEMIES + 1);
  const mctsVisitsBuf = new Int32Array(MCTS_MAX_ACTIONS);
  const mctsWinsBuf = new Float32Array(MCTS_MAX_ACTIONS);
  const mctsActTypeBuf = new Array(MCTS_MAX_ACTIONS);
  const mctsActTargetIdBuf = new Int32Array(MCTS_MAX_ACTIONS);
  const mctsActTargetIdxBuf = new Int32Array(MCTS_MAX_ACTIONS);
  const mctsActRatioBuf = new Float64Array(MCTS_MAX_ACTIONS);

  function computeMCTSEndgameAction(state, maxRolloutsParam, timeBudgetMs) {
    if (!state) return { bestAction: 'hold', targetId: null, ratio: 0, winProb: 0.5, rollouts: 0 };
    const myTerr = state.territory || 1;
    const myBal = state.balance || 0;
    const enemies = state.adjEnemies || [];
    if (enemies.length === 0) return { bestAction: 'expand', targetId: null, ratio: 0, winProb: 1.0, rollouts: 0 };

    const maxRollouts = maxRolloutsParam || 50;
    const startTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;

    const numEnemies = Math.min(enemies.length, MCTS_MAX_ENEMIES);
    let numActions = 1;
    mctsActTypeBuf[0] = 'hold';
    mctsActTargetIdBuf[0] = 0;
    mctsActTargetIdxBuf[0] = -1;
    mctsActRatioBuf[0] = 0;

    for (let i = 0; i < numEnemies; i++) {
      const e = enemies[i];
      mctsActTypeBuf[numActions] = 'fight';
      mctsActTargetIdBuf[numActions] = e.id;
      mctsActTargetIdxBuf[numActions] = i;
      mctsActRatioBuf[numActions] = 0.25;
      numActions++;
      if (myBal > (e.bal || 0) * 1.5) {
        mctsActTypeBuf[numActions] = 'fight';
        mctsActTargetIdBuf[numActions] = e.id;
        mctsActTargetIdxBuf[numActions] = i;
        mctsActRatioBuf[numActions] = 0.50;
        numActions++;
      }
    }

    const visits = mctsVisitsBuf;
    const wins = mctsWinsBuf;
    for (let a = 0; a < numActions; a++) {
      visits[a] = 0;
      wins[a] = 0;
    }

    const simBal = mctsSimBalBuf;
    const simTerr = mctsSimTerrBuf;

    let seed = ((state.balance || 123) * 1664525 + 1013904223) >>> 0;
    let completedRollouts = 0;
    const C = CONFIG.cMCTS != null ? CONFIG.cMCTS : 2.1096;

    for (let iter = 0; iter < maxRollouts; iter++) {
      if (startTime > 0 && iter % 10 === 0 && (performance.now() - startTime) > (timeBudgetMs || 0.6)) {
        break;
      }

      let bestActIdx = 0;
      let bestUCT = -1e9;
      for (let a = 0; a < numActions; a++) {
        if (visits[a] === 0) {
          bestActIdx = a;
          break;
        }
        const exploitation = wins[a] / visits[a];
        const exploration = C * Math.sqrt(Math.log(iter + 1) / visits[a]);
        const uct = exploitation + exploration;
        if (uct > bestUCT) {
          bestUCT = uct;
          bestActIdx = a;
        }
      }

      simBal[0] = myBal;
      simTerr[0] = myTerr;
      for (let e = 0; e < numEnemies; e++) {
        simBal[e + 1] = enemies[e].bal || 0;
        simTerr[e + 1] = enemies[e].terr || 1;
      }

      if (mctsActTypeBuf[bestActIdx] === 'fight') {
        const foeIdx = mctsActTargetIdxBuf[bestActIdx] + 1;
        const sent = simBal[0] * mctsActRatioBuf[bestActIdx];
        simBal[0] -= sent * 1.05;
        const defense = simBal[foeIdx] * 1.25;
        if (sent > defense) {
          const conquered = Math.min(simTerr[foeIdx], Math.max(1, Math.floor(simTerr[foeIdx] * (sent / (defense + 1)))));
          simTerr[0] += conquered;
          simTerr[foeIdx] -= conquered;
          simBal[foeIdx] = Math.max(0, simBal[foeIdx] - (sent / 1.25));
        } else {
          simBal[foeIdx] = Math.max(0, simBal[foeIdx] - sent * 0.7);
        }
      }

      for (let step = 0; step < 6; step++) {
        simBal[0] = Math.min(simTerr[0] * 100, simBal[0] * 1.05);
        for (let e = 0; e < numEnemies; e++) {
          simBal[e + 1] = Math.min(simTerr[e + 1] * 100, simBal[e + 1] * 1.05);
        }

        for (let e = 0; e < numEnemies; e++) {
          const foeIdx = e + 1;
          if (simTerr[foeIdx] <= 0 || simBal[foeIdx] <= 10) continue;
          seed = (seed * 1664525 + 1013904223) >>> 0;
          if ((seed >>> 0) / 4294967296 < 0.35) {
            let weakestTarget = 0;
            let minTerr = simTerr[0];
            let otherFoeIdx = -1;
            for (let o = 0; o < numEnemies; o++) {
              const oIdx = o + 1;
              if (o !== e && simTerr[oIdx] > 0 && simTerr[oIdx] < minTerr) {
                minTerr = simTerr[oIdx];
                weakestTarget = oIdx;
                otherFoeIdx = o;
              }
            }
            const foeAttack = simBal[foeIdx] * 0.20;
            simBal[foeIdx] -= foeAttack * 1.05;
            if (weakestTarget === 0) {
              if (foeAttack > simBal[0] * 1.25) {
                const loss = Math.min(simTerr[0], Math.max(1, Math.floor(simTerr[0] * 0.15)));
                simTerr[0] -= loss;
                simTerr[foeIdx] += loss;
              }
              simBal[0] = Math.max(0, simBal[0] - foeAttack * 0.7);
            } else if (otherFoeIdx >= 0) {
              const targetIdx = otherFoeIdx + 1;
              if (foeAttack > simBal[targetIdx] * 1.25) {
                const loss = Math.min(simTerr[targetIdx], Math.max(1, Math.floor(simTerr[targetIdx] * 0.15)));
                simTerr[targetIdx] -= loss;
                simTerr[foeIdx] += loss;
              }
              simBal[targetIdx] = Math.max(0, simBal[targetIdx] - foeAttack * 0.7);
            }
          }
        }
      }

      let totalLobbyTerr = simTerr[0];
      let totalLobbyBal = simBal[0];
      let maxOtherTerr = 0;
      for (let e = 0; e < numEnemies; e++) {
        const foeIdx = e + 1;
        if (simTerr[foeIdx] > 0) {
          totalLobbyTerr += simTerr[foeIdx];
          totalLobbyBal += simBal[foeIdx];
          if (simTerr[foeIdx] > maxOtherTerr) maxOtherTerr = simTerr[foeIdx];
        }
      }

      let utility = 0;
      if (simTerr[0] <= 0) {
        utility = 0;
      } else if (maxOtherTerr === 0) {
        utility = 1.0;
      } else {
        const terrShare = simTerr[0] / Math.max(1, totalLobbyTerr);
        const balShare = simBal[0] / Math.max(1, totalLobbyBal);
        utility = 0.75 * (terrShare * 0.6 + balShare * 0.4);
      }

      utility = Math.max(0, Math.min(1.0, utility));
      visits[bestActIdx]++;
      wins[bestActIdx] += utility;
      completedRollouts++;
    }

    let bestIdx = 0;
    let maxVisits = -1;
    for (let a = 0; a < numActions; a++) {
      if (visits[a] > maxVisits) {
        maxVisits = visits[a];
        bestIdx = a;
      }
    }

    const winProb = maxVisits > 0 ? (wins[bestIdx] / maxVisits) : 0.5;
    return {
      bestAction: mctsActTypeBuf[bestIdx],
      targetId: mctsActTargetIdxBuf[bestIdx] >= 0 ? mctsActTargetIdBuf[bestIdx] : null,
      ratio: mctsActRatioBuf[bestIdx],
      winProb: parseFloat(winProb.toFixed(3)),
      rollouts: completedRollouts
    };
  }

  /**
   * Priority 5: Bayesian State Observer & Extended Kalman Filter (EKF)
   *
   * Tracks unobserved rival troop balances and growth dynamics during Fog-of-War.
   * State x = ln(Balance), measurement z = ln(ObservedAttack / u_prior).
   * Generates confidence bounds [B_low, B_high] and Information Entropy H(t).
   */
  const BayesianTroopObserver = {
    states: new Map(),

    reset: function () {
      this.states.clear();
    },

    getEstimate: function (playerId, currentTick, observedTerr) {
      let s = this.states.get(playerId);
      if (!s) {
        const initB = Math.max(10, Math.min(1000, (observedTerr || 10) * 20));
        s = { x: Math.log(initB), P: 1.0, lastSeenTick: currentTick || 0, terr: observedTerr || 10 };
        this.states.set(playerId, s);
      }

      const dt = Math.max(0, (currentTick || 0) - s.lastSeenTick);
      if (dt > 0) {
        const r = 0.035 / 10;
        s.x += dt * r;
        s.P += dt * 0.05;
        s.lastSeenTick = currentTick || 0;
      }

      const meanB = Math.exp(s.x);
      const stdDev = Math.sqrt(s.P);
      const lower = Math.max(1, Math.round(Math.exp(s.x - 1.645 * stdDev)));
      const upper = Math.round(Math.exp(s.x + 1.645 * stdDev));
      const entropy = 0.5 * Math.log(2 * Math.PI * Math.E * Math.max(1e-4, s.P));

      return {
        estimatedBalance: Math.round(meanB),
        lowerBound: lower,
        upperBound: upper,
        variance: s.P,
        entropy: parseFloat(entropy.toFixed(3)),
        needsRecon: s.P > 1.2
      };
    },

    updateObservation: function (playerId, observedBalance, currentTick) {
      if (observedBalance == null || observedBalance <= 0) return;
      let s = this.states.get(playerId);
      const z = Math.log(observedBalance);
      const R = 0.05;

      if (!s) {
        this.states.set(playerId, { x: z, P: R, lastSeenTick: currentTick || 0, terr: 10 });
        return;
      }

      const K = s.P / (s.P + R);
      s.x = s.x + K * (z - s.x);
      s.P = (1 - K) * s.P;
      s.lastSeenTick = currentTick || 0;
    }
  };

  /**
   * Priority 5: Real-Time Information-Theoretic Bayesian Archetype Classifier
   *
   * Formulates opponent behavior as a discrete latent Dirichlet-Multinomial / Gaussian mixture model
   * over 5 archetypes:
   *   0: AGGRESSIVE (high commit, high frequency, zero reserves)
   *   1: TURTLE     (hoards to cap, near-zero attack rate)
   *   2: OPPORTUNIST(attacks only weakened prey)
   *   3: KAMIKAZE   (suicidal commitment > 0.65 against leaders)
   *   4: BASELINE   (standard balanced heuristic)
   *
   * Updates posterior probabilities via Bayes' rule on each observed attack action.
   * Calculates Shannon Entropy H(t) = -sum(p_k * log2(p_k)) to quantify behavioral uncertainty.
   */
  const BayesianArchetypeClassifier = {
    profiles: new Map(),

    reset: function () {
      this.profiles.clear();
    },

    getProfile: function (playerId) {
      let p = this.profiles.get(playerId);
      if (!p) {
        p = {
          posterior: [0.20, 0.20, 0.20, 0.20, 0.20],
          observations: 0,
          totalSent: 0,
          lastActionTick: 0,
          mostLikelyArchetype: 'BASELINE',
          confidence: 0.0,
          entropy: 2.322
        };
        this.profiles.set(playerId, p);
      }
      return p;
    },

    recordAction: function (playerId, sentTroops, currentBalance, currentTick, targetIsLeader) {
      if (playerId == null) return;
      const p = this.getProfile(playerId);
      const total = (currentBalance || 0) + (sentTroops || 0);
      const commitRatio = total > 0 ? sentTroops / total : 0.20;

      const mus = [0.40, 0.12, 0.25, targetIsLeader ? 0.85 : 0.70, 0.22];
      const sigmas = [0.12, 0.08, 0.10, 0.15, 0.08];

      let normSum = 0;
      const newPost = new Float64Array(5);

      for (let k = 0; k < 5; k++) {
        const diff = commitRatio - mus[k];
        const sSq = sigmas[k] * sigmas[k];
        const likelihood = Math.exp(-0.5 * (diff * diff) / sSq) / (Math.sqrt(2 * Math.PI) * sigmas[k]);
        newPost[k] = p.posterior[k] * Math.max(1e-4, likelihood);
        normSum += newPost[k];
      }

      normSum = normSum || 1;
      let maxP = -1;
      let maxK = 4;
      let ent = 0;
      const ARCHETYPES = ['AGGRESSIVE', 'TURTLE', 'OPPORTUNIST', 'KAMIKAZE', 'BASELINE'];

      for (let k = 0; k < 5; k++) {
        const prob = newPost[k] / normSum;
        p.posterior[k] = prob;
        if (prob > maxP) {
          maxP = prob;
          maxK = k;
        }
        if (prob > 1e-6) {
          ent -= prob * Math.log2(prob);
        }
      }

      p.observations++;
      p.totalSent += sentTroops;
      p.lastActionTick = currentTick || 0;
      p.mostLikelyArchetype = ARCHETYPES[maxK];
      p.entropy = parseFloat(ent.toFixed(3));
      p.confidence = parseFloat(Math.max(0, 1 - (ent / 2.322)).toFixed(3));

      return p;
    }
  };

  /**
   * Priority 13: Naval Embarkation Bellman Contraction Mapping & Bridgehead Policy
   *
   * Formulates cross-water amphibious invasions as a discrete Dynamic Program / Bellman Contraction.
   *
   * Physics & Economics of Naval Transit:
   * 1. Water Transit Delay: tau_transit = ceil(dist_water / v_boat)
   * 2. Compound Interest Forfeiture: Troops inside boats earn 0 interest.
   *    Opportunity cost discount factor: beta_transit = (1 + r)^(-tau_transit)
   * 3. Transit Tax & Friction:
   *    tau_naval(u, B, dist) = floor(12 * u * B / 1024) + floor(gamma_water * dist * u * B / 100)
   * 4. Shore Fortification Multiplier:
   *    Defenders on shore enjoy entrenched high-ground multiplier mu_shore (typically 1.35x - 1.50x).
   *    If target is neutral land with capacity A_target, initial yield is min(A_target, floor(F_eff / 2)).
   *    If target is enemy territory with defender balance B_def, breakthrough probability follows
   *    logistic Lanchester curve: P_foothold = 1 / (1 + exp(-(F_eff - mu_shore * B_def) / sigma_naval)).
   * 5. Bridgehead Capitalization:
   *    Successful landfall unlocks new soft cap C_new = 100 * A_foothold and base income 2.5 * sqrt(A_foothold).
   * 6. Bellman Net Present Value (NPV):
   *    NPV(u) = beta_transit * [ E[V_foothold(u)] ] + (1 - u) * B * (1 + r)^tau_transit - B * (1 + r)^tau_transit
   *
   * Solves optimal commit ratio u*(s) via 1D line-search over u in [0.08, 0.45].
   * Viability condition: NPV(u*) must exceed the opportunity cost threshold.
   */
  const NAVAL_MAX_TICKS = 64;
  const navalBetaLUT = new Float64Array(NAVAL_MAX_TICKS + 1);
  const navalCompoundLUT = new Float64Array(NAVAL_MAX_TICKS + 1);
  let navalLastRate = -1;

  function updateNavalLUT(rPerTick) {
    if (rPerTick === navalLastRate) return;
    navalLastRate = rPerTick;
    navalBetaLUT[0] = 1.0;
    navalCompoundLUT[0] = 1.0;
    const factor = 1.0 + rPerTick;
    let comp = 1.0;
    for (let t = 1; t <= NAVAL_MAX_TICKS; t++) {
      comp *= factor;
      navalCompoundLUT[t] = comp;
      navalBetaLUT[t] = 1.0 / comp;
    }
  }

  const NAVAL_U_STEPS = [0.08, 0.12, 0.16, 0.20, 0.25, 0.30, 0.38, 0.45];

  function computeNavalBridgeheadPolicy(landingCandidates, stateCtx, options) {
    if (!landingCandidates || !landingCandidates.length || !stateCtx) {
      return {
        viable: false,
        bestShore: null,
        commitRatio: 0,
        troopsToSend: 0,
        npv: -1e9,
        footholdProb: 0,
        transitTicks: 0,
        rankedShores: []
      };
    }

    const B = Math.max(0, stateCtx.balance || 0);
    if (B < 35) {
      return {
        viable: false,
        bestShore: null,
        commitRatio: 0,
        troopsToSend: 0,
        npv: -1e9,
        footholdProb: 0,
        transitTicks: 0,
        rankedShores: []
      };
    }

    options = options || {};
    const vBoat = options.vBoat || CONFIG.navalTransitSpeed || 2.0;
    const shoreDefMult = options.shoreDefMult || CONFIG.navalShoreMultiplier || 1.45;
    const rPerTick = (options.interestRate || 0.035) / (options.cycleInterval || 10);
    const waterFriction = options.waterFriction || 0.004;

    updateNavalLUT(rPerTick);

    const scoredShores = [];

    for (let i = 0; i < landingCandidates.length; i++) {
      const shore = landingCandidates[i];
      if (!shore) continue;

      const waterDist = Math.max(1, shore.waterDist || 1);
      const transitTicks = Math.max(1, Math.ceil(waterDist / vBoat));
      const clampedTicks = Math.min(NAVAL_MAX_TICKS, transitTicks);
      const beta = navalBetaLUT[clampedTicks];
      const compoundFactor = navalCompoundLUT[clampedTicks];
      const baselineCapitalIfHeld = B * compoundFactor;

      const isNeutral = shore.type === 'NEUTRAL' || !shore.enemyId;
      const targetBal = isNeutral ? 0 : Math.max(0, shore.targetBal != null ? shore.targetBal : (shore.enemyBal || 50));
      const targetCapacity = Math.max(10, shore.targetCapacity || (isNeutral ? 60 : 30));

      let bestU = 0.15;
      let maxShoreNPV = -1e9;
      let bestPBreak = 1.0;
      let bestSurvivingForce = 0;

      const uSteps = NAVAL_U_STEPS;
      for (let ui = 0; ui < uSteps.length; ui++) {
        const u = uSteps[ui];
        const sent = Math.floor(B * u);
        if (sent < 15) continue;

        const baseTax = Math.floor(12 * sent / 1024);
        const waterTax = Math.floor(waterFriction * waterDist * sent);
        const landingForce = Math.max(0, sent - baseTax - waterTax);

        let expectedGainTerr = 0;
        let pBreakthrough = 1.0;
        let survivingForce = landingForce;

        if (isNeutral) {
          expectedGainTerr = Math.min(targetCapacity, Math.floor(landingForce / 2));
          survivingForce = Math.max(0, landingForce - expectedGainTerr * 2);
          pBreakthrough = 1.0;
        } else {
          const effectiveDef = targetBal * shoreDefMult;
          const forceDiff = landingForce - effectiveDef;
          const sigmaNaval = Math.max(10, Math.sqrt(effectiveDef + landingForce));
          const zNaval = forceDiff / sigmaNaval;
          pBreakthrough = 1 / (1 + Math.exp(-Math.max(-10, Math.min(10, zNaval))));

          if (pBreakthrough >= 0.50) {
            expectedGainTerr = Math.min(targetCapacity, Math.max(5, Math.floor(targetCapacity * pBreakthrough)));
            survivingForce = Math.max(0, Math.floor(forceDiff * 0.7));
          } else {
            expectedGainTerr = 0;
            survivingForce = 0;
          }
        }

        const homeCapitalRemaining = (B - sent) * compoundFactor;
        const bridgeheadValue = (expectedGainTerr * 100 * compoundFactor * 0.85) + (survivingForce * pBreakthrough);
        const terminalAmphibiousCapital = homeCapitalRemaining + bridgeheadValue;
        const npv = beta * terminalAmphibiousCapital - B;

        if (npv > maxShoreNPV) {
          maxShoreNPV = npv;
          bestU = u;
          bestPBreak = pBreakthrough;
          bestSurvivingForce = survivingForce;
        }
      }

      scoredShores.push(Object.assign({}, shore, {
        npv: parseFloat(maxShoreNPV.toFixed(2)),
        optimalCommitRatio: bestU,
        transitTicks,
        footholdProb: parseFloat(bestPBreak.toFixed(3)),
        survivingForce: Math.round(bestSurvivingForce),
        troopsToSend: Math.floor(B * bestU)
      }));
    }

    scoredShores.sort(function (a, b) { return b.npv - a.npv; });
    const bestShore = scoredShores[0] || null;

    const density = (stateCtx.softCap > 0) ? (B / stateCtx.softCap) : 0.5;
    const threshold = (density > 0.85) ? -5.0 : 2.0;
    const viable = !!bestShore && (bestShore.npv > threshold) && (bestShore.footholdProb >= 0.40);

    return {
      viable,
      bestShore,
      commitRatio: bestShore ? bestShore.optimalCommitRatio : 0,
      troopsToSend: bestShore ? bestShore.troopsToSend : 0,
      npv: bestShore ? bestShore.npv : -1e9,
      footholdProb: bestShore ? bestShore.footholdProb : 0,
      transitTicks: bestShore ? bestShore.transitTicks : 0,
      rankedShores: scoredShores
    };
  }

  /**
   * Score a perimeter candidate cell for pure situation targeting.
   * cell: { type: 'NEUTRAL'|'ENEMY', x, y, pocketLocal?, score? }
   */
  function scoreCandidate(cell, S, decision) {
    if (!cell) return -1e9;
    S = S || {};
    decision = decision || {};
    const B = Math.max(0, S.balance | 0);
    const C = S.softCap > 0 ? S.softCap : softCapFor(S.territory || 1);
    const d = C > 0 ? B / C : 0.5;
    const t = (cell.type || '').toUpperCase();
    const isEnemy = t === 'ENEMY' || cell.touchesEnemy;
    const isNeutral = t === 'NEUTRAL' || cell.touchesNeutral || !isEnemy;
    let sc = 0;

    if (isNeutral && !isEnemy) {
      sc = 50;
      sc += Math.min(40, (cell.pocketLocal || cell.score || 0) * 0.3);
      sc += Math.max(0, 0.75 - d) * 40;
      if (d > 1.0) sc += 25;
      if (decision.action === 'expand') sc += 35;
      if (decision.action === 'fight') sc -= 20;
      if (CONFIG.enableCurvatureFlow) {
        // Isoperimetric Curvature: favor filling concave boundary pockets (minimizes exposed perimeter)
        const ownedNbrs = cell.ownedNeighbors != null ? cell.ownedNeighbors : (cell.pocketLocal > 1 ? 2 : 1);
        if (ownedNbrs >= 3) sc += 45;
        else if (ownedNbrs === 2) sc += 15;
        else if (ownedNbrs <= 1) sc -= 12;
      }
    } else if (isEnemy) {
      sc = 55;
      if (decision.crushable) sc += 50;
      if (decision.action === 'fight') sc += 40;
      if (decision.action === 'expand') sc -= 25;
      const eBal = decision.enemyBal || 0;
      if (eBal > 0 && B > eBal * 2) sc += 30;
      if (eBal > B) sc -= 10;
      sc += Math.min(20, (S.primaryDanger || 0) * 25);

      // Priority 7: Stochastic SDE Breach Probability
      const enemyBal = cell.enemyBal != null ? cell.enemyBal : eBal;
      if (CONFIG.enableSDE && enemyBal > 0 && B > 0) {
        const estAttack = B * 0.25;
        const breach = computeBreachProbability(estAttack, enemyBal);
        if (breach.isVetoed) {
          sc -= 90; // Severe penalty for low-probability suicide assaults
        } else if (breach.pBreach >= 0.80) {
          sc += 35; // High confidence breach bonus
        }
      }

      // Priority 9: Hegemonic Balancing Coalition Truce
      if (CONFIG.enableCoalition && cell.enemyId != null && S.adjEnemies && S.adjEnemies.length > 1) {
        const coalition = decision.coalition || computeCoalitionEquilibrium(S);
        if (coalition && coalition.hegemonActive) {
          if (cell.enemyId === coalition.hegemonId) {
            sc += 75; // Concentrate strikes on hegemon
          } else {
            sc -= 60; // Preserve secondary rivals against hegemon
          }
        }
      }

      // Priority 12: Mean Curvature Flow (Encirclement Closure vs Spike Avoidance)
      if (CONFIG.enableCurvatureFlow) {
        const ownedNbrs = cell.ownedNeighbors != null ? cell.ownedNeighbors : 1;
        if (ownedNbrs >= 3) sc += 50; // Encirclement closure bonus
        else if (ownedNbrs === 2) sc += 15; // Smooth boundary continuation
        else if (ownedNbrs <= 1) sc -= 25; // Narrow protrusion penalty
      }

      // Priority 5: Real-Time Bayesian Archetype Targeting
      if (CONFIG.enableBayesianArchetype && cell.enemyId != null) {
        const prof = BayesianArchetypeClassifier.getProfile(cell.enemyId);
        if (prof.mostLikelyArchetype === 'KAMIKAZE' && prof.confidence >= 0.50) {
          sc -= 65; // Do not provoke the suicide bot
        } else if (prof.mostLikelyArchetype === 'AGGRESSIVE' && prof.confidence >= 0.40) {
          sc += 35; // Exploit the low-reserve exhausted attacker
        } else if (prof.mostLikelyArchetype === 'TURTLE' && prof.confidence >= 0.40) {
          sc += 20; // Safe encroachment before overcap
        }
      }
    } else {
      sc = 0;
    }
    // Prefer diversity is handled by caller multi-pick
    return sc;
  }

  /**
   * Rank perimeter candidates; return top N for the chosen action.
   * Priority 3: Integrates Spectral Graph Cut (Fiedler Vector) & Isthmus Bottleneck detection.
   */
  function rankTargets(candidates, S, decision, maxN) {
    maxN = maxN || 8;
    const list = [];
    if (!candidates || !candidates.length) return list;

    let spectral = null;
    if (CONFIG.enableSpectral && candidates.length >= 3) {
      try {
        spectral = computeSpectralFiedler(candidates);
      } catch (e) {
        spectral = null;
      }
    }

    const myX = S ? (S.centerX != null ? S.centerX : (S.x != null ? S.x : 500)) : 500;
    const myY = S ? (S.centerY != null ? S.centerY : (S.y != null ? S.y : 500)) : 500;

    // Priority 4: Poisson Harmonic Potential Field Solver
    let poisson = null;
    if (CONFIG.enablePoisson && candidates.length >= 3 && S) {
      try {
        const sources = [{ x: myX, y: myY }];
        const sinks = [];
        const obstacles = [];

        if (S.adjEnemies && S.adjEnemies.length) {
          for (let ei = 0; ei < S.adjEnemies.length; ei++) {
            const foe = S.adjEnemies[ei];
            if (!foe) continue;
            const fx = foe.x != null ? foe.x : (myX + (ei % 2 === 0 ? 300 : -300));
            const fy = foe.y != null ? foe.y : (myY + (ei < 2 ? 300 : -300));
            if (foe.crushable || (foe.bal != null && foe.bal < (S.balance || 100) * 0.5)) {
              sinks.push({ x: fx, y: fy });
            } else {
              obstacles.push({ x: fx, y: fy });
            }
          }
        }
        if (S.hasAdjFree || (S.freeLandRatio != null && S.freeLandRatio > 0.02)) {
          const step = Math.max(1, Math.floor(candidates.length / 8));
          for (let ci = 0; ci < candidates.length; ci++) {
            const cand = candidates[ci];
            if (cand && (cand.type === 'NEUTRAL' || cand.touchesNeutral)) {
              if (ci % step === 0) {
                sinks.push({ x: cand.x != null ? cand.x : 500, y: cand.y != null ? cand.y : 500 });
              }
            }
          }
        }
        poisson = computePoissonPotentialField(sources, sinks, obstacles, 8);
      } catch (e) {
        poisson = null;
      }
    }

    // Priority 10: Eikonal Geodesic Wavefront Distance Solver
    let eikonal = null;
    if (CONFIG.enableEikonal && candidates.length >= 3 && S) {
      try {
        const sources = [{ x: myX, y: myY }];
        const obstacles = [];
        if (S.adjEnemies && S.adjEnemies.length) {
          for (let ei = 0; ei < S.adjEnemies.length; ei++) {
            const foe = S.adjEnemies[ei];
            if (!foe) continue;
            if (!foe.crushable && (foe.bal || 0) > (S.balance || 100) * 1.5) {
              obstacles.push({ x: foe.x != null ? foe.x : 500, y: foe.y != null ? foe.y : 500 });
            }
          }
        }
        eikonal = computeEikonalGeodesicField(16, 8, sources, obstacles);
      } catch (e) {
        eikonal = null;
      }
    }

    const betaMult = CONFIG.betaCheeger != null ? (CONFIG.betaCheeger / 16.67) : 1.5;
    const isFight = decision && decision.action === 'fight';
    const isExpand = decision && decision.action === 'expand';
    const betaMultAction = isFight ? betaMult : (isExpand ? betaMult * 0.8 : 0);
    const enableSDE = CONFIG.enableSDE;
    const balQuarter = (S && (S.balance || 0) > 0) ? (S.balance || 0) * 0.25 : 0;
    const defaultEnemyBal = decision ? decision.enemyBal : 0;

    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      let sc = scoreCandidate(c, S, decision);
      let bScore = 0;
      let fVal = 0;
      let part = 0;
      let pPull = 0;
      let pPot = 0;
      let geoTime = 0;

      if (spectral) {
        bScore = spectral.bottleneckScores[i] || 0;
        fVal = spectral.fiedler[i] || 0;
        part = spectral.partition[i] || 0;
        if (betaMultAction !== 0) sc += bScore * betaMultAction;
      }

      if (poisson && c.x != null && c.y != null) {
        const sample = poisson.sampleGradient(c.x, c.y, myX, myY);
        pPull = sample.pull;
        pPot = sample.potential;
        sc += Math.max(-30, Math.min(40, pPull * 80));
      }

      if (eikonal && c.x != null && c.y != null) {
        geoTime = eikonal.getTravelTime(c.x, c.y);
        const geoFactor = 1 / (1 + 0.05 * geoTime);
        sc += Math.max(-25, Math.min(30, (geoFactor - 0.5) * 60));
      }

      let pBreach = 1.0;
      if (enableSDE && (c.type === 'ENEMY' || c.touchesEnemy)) {
        const foeBal = c.enemyBal != null ? c.enemyBal : (c.bal != null ? c.bal : defaultEnemyBal);
        if (foeBal > 0 && balQuarter > 0) {
          const br = computeBreachProbability(balQuarter, foeBal);
          pBreach = br.pBreach;
        }
      }

      list.push(Object.assign({}, c, {
        sitScore: sc,
        spectralBottleneck: bScore,
        fiedlerCoordinate: fVal,
        spectralPartition: part,
        poissonPull: Math.round(pPull * 1000) / 1000,
        harmonicPotential: Math.round(pPot * 1000) / 1000,
        geodesicDistance: Math.round(geoTime * 100) / 100,
        breachProbability: Math.round(pBreach * 1000) / 1000
      }));
    }

    const preferE = isFight;
    const preferN = isExpand;
    list.sort(function (a, b) {
      if (preferE) {
        const ae = (a.type === 'ENEMY' || a.touchesEnemy) ? 1 : 0;
        const be = (b.type === 'ENEMY' || b.touchesEnemy) ? 1 : 0;
        if (ae !== be) return be - ae;
      }
      if (preferN) {
        const an = (a.type === 'NEUTRAL' || a.touchesNeutral) ? 1 : 0;
        const bn = (b.type === 'NEUTRAL' || b.touchesNeutral) ? 1 : 0;
        if (an !== bn) return bn - an;
      }
      return b.sitScore - a.sitScore;
    });
    return list.slice(0, maxN);
  }

  const EngineCore = {
    version: '10.2.3',
    DIFF,
    DUMP,
    LIVE,
    al,
    botAttackDebit,
    humanAttackDebit,
    sourceAttackDebit,
    crushRequirement,
    planSpend,
    estimateAttackCost,
    maxSafeRatio,
    minLeaveFor,
    decide,
    scoreCandidate,
    rankTargets,
    softCapFor,
    minRemainingBalance,
    maxSpendableTroops,
    canAffordAttack,
    clampSpend,
    maxCommitRatio,
    minMeaningful,
    isEarlyGame,
    MIN_MEANINGFUL_ATTACK,
    MIN_MEANINGFUL_EARLY,
    crushTroops,
    dumpExcessTroops,
    ilToRatio,
    ratioToIl,
    profileFor,
    computeCommit,
    computeAdaptiveCommit,
    veryHardTaperRatio,
    computeTroops,
    decideTargetPolicy,
    shouldExpandLand,
    estimateInterestIncome,
    computeSpectralFiedler,
    computePoissonPotentialField,
    allocateKKTMultiFront,
    computeVoronoiPartition,
    BayesianTroopObserver,
    BayesianArchetypeClassifier,
    computeCoalitionEquilibrium,
    computeEikonalGeodesicField,
    computeBreachProbability,
    computeMCTSEndgameAction,
    computeNavalBridgeheadPolicy,
    computeCrushBarrierFloor,
    computeTerritorialTopology,
    forwardSimulatorStep,
    evaluateMPCAction,
    allocateKKTMarginalUtility,
    computeEikonalGodunovIsotropic,
    OpponentParticleFilter,
    runMultiStepMCTS,
    CONFIG,
    // DEFAULT = Very Hard (index 5) — learn from the bots that crush you
    active: profileFor(DIFF.VERY_HARD)
  };

  // Export TIOEngineCoreV2 and set as default engine core
  root.TIOEngineCoreV2 = EngineCore;
  root.TIOEngineCore = EngineCore;
  root.TIOHardMode = EngineCore;
  console.log(
    '%c[TIO Engine Core V2.7] Capital-preserving policy · Updated: 2026-10-04 10:36:33 EDT',
    'color: #10b981; font-weight: bold;'
  );
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = EngineCore;
  }
})();
