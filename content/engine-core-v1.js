/**
 * Territorial.io deterministic policy kernel v10.1.0
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
  if (root.__TIO_ENGINE_CORE_V1_LOADED__) return;
  root.__TIO_ENGINE_CORE_V1_LOADED__ = true;

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

    const minRemaining = Math.max(1, minLeaveFor(B), Math.floor(B * reserveRatio));
    const maxSpendTotal = Math.max(0, B - minRemaining);
    let minAttack = Math.max(6, Math.floor(B * 0.04));
    if (B < 60) minAttack = Math.max(4, Math.floor(B * 0.10));
    minAttack = Math.min(minAttack, Math.max(4, maxSpendTotal));
    if (maxSpendTotal < minAttack) {
      return stopped('bank-too-thin', minRemaining, minAttack, urgency);
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
      primaryDanger: threat
    });

    let safeRatio = maxSafeRatio(B, minRemaining, adaptive.maxRatio || 0.72);
    if (!(safeRatio > 0)) return stopped('unsafe-spend', minRemaining, minAttack, urgency);
    let ratio = Math.min(adaptive.ratio, safeRatio);

    // Raise a microscopic ratio only to the meaningful command floor.
    if (Math.floor(B * ratio) < minAttack) {
      ratio = Math.min(safeRatio, Math.ceil(minAttack * 1024 / B) / 1024);
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
   * Source-calibrated competitive ratio. Safety is intentionally not mixed in;
   * planSpend() applies the exact human debit and reserve after this choice.
   */
  function computeAdaptiveCommit(ctx) {
    ctx = ctx || {};
    const free = Math.max(0, Math.min(1,
      ctx.freeLandRatio != null ? Number(ctx.freeLandRatio) : 0.08));
    const balance = Math.max(0, Number(ctx.balance) | 0);
    const territory = Math.max(1, Number(ctx.territory) | 0);
    const softCap = ctx.softCap > 0 ? Number(ctx.softCap) : softCapFor(territory);
    const density = ctx.density != null
      ? Math.max(0, Number(ctx.density) || 0)
      : balance / Math.max(1, softCap);
    const power = ctx.relativePower != null ? Math.max(0, Number(ctx.relativePower) || 0) : 1;
    const activeFronts = Math.max(0, Math.min(12, Number(ctx.activeFronts) | 0));
    const attackSequence = Math.max(0, Number(ctx.attackSequence) | 0);
    const wantEnemy = !!ctx.wantEnemy;
    const crushable = !!ctx.crushable;
    const enemyBal = ctx.enemyBal != null ? Math.max(0, Number(ctx.enemyBal) | 0) : 0;
    const phase = ctx.phase || (wantEnemy ? 'PRESSURE' : 'LAND_RUSH');

    let ratio = veryHardTaperRatio(attackSequence);
    let reason = attackSequence === 0 ? 'vh-open-midpoint' : 'vh-taper';

    // The extension can fill several legal human slots within one bot cycle.
    // Cap later fronts sharply so four rapid commands leave about 40% of the
    // original bank instead of the old ~12% death spiral.
    if (activeFronts === 1 && ratio > 0.18) {
      ratio = 0.18;
      reason += '+front2';
    } else if (activeFronts === 2 && ratio > 0.14) {
      ratio = 0.14;
      reason += '+front3';
    } else if (activeFronts >= 3 && ratio > 0.11) {
      ratio = 0.11;
      reason += '+front4';
    }

    if (!wantEnemy) {
      if (free >= 0.12 && attackSequence < 4 && activeFronts === 0) {
        ratio += 0.02;
        reason += '+free-land';
      }
      if (density < 0.35 && attackSequence > 0) {
        ratio = Math.min(ratio, 0.14);
        reason += '+interest';
      }
    } else if (!crushable) {
      if (power < 0.75) {
        ratio = Math.min(ratio, 0.08);
        reason += '+outmatched';
      } else if (power < 1) {
        ratio = Math.min(ratio, 0.10);
        reason += '+underdog';
      } else if (power >= 1.5 && activeFronts === 0) {
        ratio = Math.max(ratio, 0.16);
        reason += '+advantage';
      }
    }

    // Current VH dumps balance above af.kS(player). Subtract the human command
    // tax first so the resulting bank lands near the real soft cap.
    let overcapRatio = 0;
    if (balance > softCap && softCap > 0) {
      const tax = humanAttackDebit(balance, 0).tax;
      overcapRatio = Math.max(0, (balance - softCap - tax) / balance);
      if (overcapRatio > ratio) {
        ratio = overcapRatio;
        reason = 'softcap-dump';
      }
    }

    if (crushable && enemyBal > 0 && balance > 0) {
      const needRatio = Math.ceil(crushRequirement(enemyBal) * 1024 / balance) / 1024;
      ratio = Math.max(0.10, needRatio, overcapRatio);
      reason = 'crush-sized';
    }

    // 72% is allowed only for a real soft-cap dump. Normal opening and crush
    // commands remain bounded well below the old accidental 79% loop.
    let maxRatio = 0.50;
    if (overcapRatio > 0.50) maxRatio = 0.72;
    else if (crushable) maxRatio = 0.62;
    const minRatio = wantEnemy && power < 1 && !crushable ? 0.06 : 0.08;
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
      if (!e) continue;
      const eBal = e.bal != null ? e.bal : 0;
      const eTerr = e.terr != null ? e.terr : 1;
      const crush = !!e.crushable || (B > 0 && al(B, 8) > eBal);
      // Prefer weak, small, crushable
      let sc = 1000 - eTerr * 2 - eBal * 0.15;
      if (crush) sc += 400;
      if (eBal < B * 0.5) sc += 80;
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

    // Hold rarely — primary goal is win FAST (only protect bank / no targets)
    let holdScore = 2;
    if (!hasFree && !hasEnemy) holdScore = 90;
    if (B > 0 && B < 30) holdScore += 50; // protect from debt
    if (isLeading && threat < 0.25 && free < 0.015 && !crushable && d > 0.5) holdScore += 15;
    if ((hasFree || hasEnemy) && B >= 30) holdScore -= 50;
    // Climb ASAP
    if (!isLeading && B >= 30 && (hasFree || hasEnemy)) holdScore -= 80;
    // Extra expand/fight already include winPressure; add speed bias
    if (!isLeading && hasFree) expandScore += 25;
    if (!isLeading && hasEnemy) fightScore += 20;
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
      action = 'fight';
      reason = crushable ? 'crush-adj' : (shrink > 3 ? 'defend-push' : 'pressure-adj');
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

    // Exact free land has priority unless we are actually losing territory.
    if (S.hasAdjFree === true && shrink <= 6 && trend >= -15 && hasFree) {
      action = 'expand';
      reason = 'exact-free-first';
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
      objective: 'first-place-win'
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
      if (cell.touchesEnemy) sc -= 15; // contested free
    } else if (isEnemy) {
      sc = 55;
      if (decision.crushable) sc += 50;
      if (decision.action === 'fight') sc += 40;
      if (decision.action === 'expand') sc -= 25;
      const eBal = decision.enemyBal || 0;
      if (eBal > 0 && B > eBal * 2) sc += 30;
      if (eBal > B) sc -= 10;
      sc += Math.min(20, (S.primaryDanger || 0) * 25);
    } else {
      sc = 0;
    }
    // Prefer diversity is handled by caller multi-pick
    return sc;
  }

  /**
   * Rank perimeter candidates; return top N for the chosen action.
   */
  function rankTargets(candidates, S, decision, maxN) {
    maxN = maxN || 8;
    const list = [];
    if (!candidates || !candidates.length) return list;
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      const sc = scoreCandidate(c, S, decision);
      list.push(Object.assign({}, c, { sitScore: sc }));
    }
    // Filter to preferred type when decision is clear, but keep fallbacks
    const preferE = decision && decision.action === 'fight';
    const preferN = decision && decision.action === 'expand';
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
    version: '10.1.0',
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
    // DEFAULT = Very Hard (index 5) — learn from the bots that crush you
    active: profileFor(DIFF.VERY_HARD)
  };

  // Register V1 explicitly
  root.TIOEngineCoreV1 = EngineCore;
  if (!root.TIOEngineCore) {
    root.TIOEngineCore = EngineCore;
  }
  if (!root.TIOHardMode) {
    root.TIOHardMode = EngineCore;
  }
  console.log(
    '%c[TIO Engine Core V1] Baseline heuristic policy kernel loaded',
    'color: #94a3b8; font-weight: bold;'
  );
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = EngineCore;
  }
})();
