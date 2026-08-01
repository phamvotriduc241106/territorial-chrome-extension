/**
 * Territorial.io Very-Hard Bot Profile v9.1.0
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
 * ─── Live aF (desktop) for reference ───
 *   kg il: VH=80 (~7.9% tiny, but ki=6 fronts, high frequency)
 *   We blend: dump-style 35–45% openers + high frequency multi-front
 */
(function () {
  'use strict';

  if (window.__TIO_HARDMODE_V6_LOADED__) return;
  window.__TIO_HARDMODE_V6_LOADED__ = true;

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
    pulseMs: [450, 400, 340, 200, 120, 85],
    fronts: [1, 2, 3, 4, 5, 6]
  };

  // Live desktop aF (optional blend)
  const LIVE = {
    kg: [500, 450, 400, 300, 80, 50, 100],
    ki: [1, 2, 3, 4, 6, 8, 1],
    kh: [60, 74, 112, 200, 256, 512, 512]
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

  /**
   * dJ crush troop floor from dump.
   */
  function crushTroops(myBal, enemyBal, proposed) {
    let k = proposed | 0;
    if (al(myBal, 8) > enemyBal) {
      const need = al(11 * enemyBal, 5);
      if (k < need) k = need;
    }
    // Keep a thin reserve (~3%)
    const reserve = Math.max(1, al(myBal * 32, 1024));
    if (k > myBal - reserve) k = Math.max(1, myBal - reserve);
    return Math.max(1, k);
  }

  /**
   * d3-style: if over soft density reserve, dump excess into attack.
   * softCap ≈ 100 * territory (live kA).
   */
  function dumpExcessTroops(balance, territoryPixels, proposedTroops) {
    const cap = Math.min(100 * Math.max(1, territoryPixels || 1), 80000);
    // Keep ~15% of soft-cap as interest reserve (ar.dB spirit)
    const softReserve = Math.max(60, Math.floor(cap * 0.15));
    let k = proposedTroops | 0;
    if (balance > softReserve && k < balance - softReserve) {
      k = balance - softReserve;
    }
    // Minimum meaningful attack (d3 skips if k < 60)
    if (k < 60 && balance >= 60) k = Math.min(balance, 60 + Math.floor(balance * 0.1));
    return Math.max(1, k);
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
      liveFronts: LIVE.ki[Math.min(i, LIVE.ki.length - 1)],
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
      profile: profile || HardMode.active,
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
  function computeAdaptiveCommit(ctx) {
    ctx = ctx || {};
    const p = ctx.profile || HardMode.active;
    const free = Math.max(0, Math.min(1, ctx.freeLandRatio != null ? ctx.freeLandRatio : 0.1));
    const density = Math.max(0, ctx.density != null ? ctx.density : 0.6);
    const power = ctx.relativePower != null ? ctx.relativePower : 1.0;
    const trend = ctx.areaTrend != null ? ctx.areaTrend : 0;
    const t = ctx.gameTimeSec != null ? ctx.gameTimeSec : 30;
    const bal = Math.max(0, ctx.balance || 0);
    const terr = Math.max(1, ctx.territory || 1);
    const wantEnemy = !!ctx.wantEnemy;
    const crushable = !!ctx.crushable;
    const fronts = Math.max(1, Math.min(8, ctx.fronts || 1));
    const shrink = ctx.shrinkFrames || 0;
    const danger = ctx.primaryDanger || 0;
    const phase = ctx.phase || 'LAND_RUSH';

    // Soft-cap math (live kA ≈ 100 * pixels)
    const softCap = Math.min(100 * terr, 80000);
    // Keep enough for next interest tick (~10–20% of soft-cap, dump-style reserve)
    let reserveFrac = 0.12;
    if (density > 1.1) reserveFrac = 0.04;       // over-cap: dump almost everything
    else if (density > 0.95) reserveFrac = 0.07;
    else if (density < 0.35) reserveFrac = 0.22;  // under-dense: protect interest seed
    else if (density < 0.5) reserveFrac = 0.18;

    // Under severe threat keep a thicker war chest
    if (shrink > 6 || trend < -25 || danger > 0.75) {
      reserveFrac = Math.max(reserveFrac, 0.16);
    }
    // Crush windows: spend the reserve down
    if (crushable || phase === 'KILL' || phase === 'CRUSH') {
      reserveFrac = Math.min(reserveFrac, 0.05);
    }

    // --- Base ratio by intent (capped — never auto 70%+) ---
    // Real game bar stuck at 79% was killing economy; stay in 12–42% expand / 18–48% fight.
    let ratio = 0.25;
    let reason = 'base';

    if (phase === 'OPENING' || (t < 25 && free > 0.08 && !wantEnemy)) {
      // Early: frequent medium bites, NOT 45% every click
      ratio = 0.28 + Math.min(0.08, free * 0.2); // ~28–36%
      reason = 'open-expand';
    } else if (!wantEnemy && free > 0.02) {
      if (density >= 1.1) {
        ratio = 0.42; // dump excess but keep reserve
        reason = 'overcap-dump-land';
      } else if (density >= 0.95) {
        ratio = 0.36;
        reason = 'dense-expand';
      } else if (density >= 0.65) {
        ratio = 0.26 + free * 0.12; // ~26–38%
        reason = 'steady-expand';
      } else if (density >= 0.4) {
        ratio = 0.20 + free * 0.10; // ~20–30%
        reason = 'grow-efficient';
      } else {
        // Under-stacked: small bites, interest compounds
        ratio = 0.14 + free * 0.08; // ~14–22%
        reason = 'stack-aware-expand';
      }
      if (free > 0.15 && fronts >= 3) {
        ratio *= 0.88;
        reason += '+multifront';
      }
    } else if (wantEnemy) {
      if (crushable || phase === 'CRUSH' || phase === 'KILL') {
        ratio = 0.40;
        reason = 'crush-finish';
        if (ctx.enemyBal != null && bal > 0) {
          const need = al(11 * ctx.enemyBal, 5);
          const needR = need / Math.max(1, bal);
          // Cap crush at 50% — never 70%+ suicide
          ratio = Math.max(ratio, Math.min(0.50, needR * 1.05));
          reason = 'crush-sized';
        }
      } else if (phase === 'SURVIVE' || shrink > 5 || trend < -20) {
        ratio = free > 0.02 ? 0.30 : 0.34;
        reason = 'survive-push';
      } else if (power >= 1.25) {
        ratio = 0.32;
        reason = 'dominate';
      } else if (power >= 1.0) {
        ratio = 0.26;
        reason = 'even-pressure';
      } else if (power >= 0.75) {
        ratio = 0.20;
        reason = 'underdog-probe';
      } else {
        ratio = free > 0.02 ? 0.22 : 0.16;
        reason = 'weak-conserve';
      }
    } else {
      ratio = 0.24;
      reason = 'default';
    }

    // --- Situational modifiers ---
    if (trend > 40 && !crushable && density < 0.95) {
      ratio *= 0.88;
      reason += '+hot-growth';
    }
    if (Math.abs(trend) < 5 && free > 0.05 && t > 15 && density > 0.55) {
      ratio += 0.03;
      reason += '+stall-push';
    }
    if (t > 90 && free < 0.03 && wantEnemy) {
      ratio = Math.max(ratio, 0.30);
      reason += '+late-war';
    }
    // Multi-front: each click is a full bar spend in click mode — lower bar!
    if (fronts >= 3 && !crushable) {
      ratio *= Math.max(0.75, 1 - (fronts - 2) * 0.05);
      reason += '+front-split';
    }

    // HARD GLOBAL CAPS — this is what stops the "stuck at 79%" death spiral
    const minR = crushable ? 0.18 : (density < 0.35 ? 0.12 : 0.14);
    const maxR = crushable ? 0.50 : (density >= 1.05 ? 0.45 : 0.40);
    let raw = ratio;
    ratio = Math.max(minR, Math.min(maxR, ratio));

    // Tiny balance: one medium push, not all-in
    if (bal > 0 && bal < 120) {
      ratio = Math.min(0.40, Math.max(ratio, 0.28));
      reason += '+micro';
    }

    return {
      ratio: parseFloat(ratio.toFixed(3)),
      raw: parseFloat(raw.toFixed(3)),
      reason,
      reserveRatio: parseFloat(reserveFrac.toFixed(3)),
      softCap,
      factors: {
        free: parseFloat(free.toFixed(3)),
        density: parseFloat(density.toFixed(3)),
        power: parseFloat(power.toFixed(3)),
        trend: parseFloat(Number(trend).toFixed(1)),
        phase,
        wantEnemy,
        crushable,
        fronts
      }
    };
  }

  /**
   * Absolute troops for native cE path.
   */
  function computeTroops(profile, balance, territory, phase, freeLandRatio, enemyBal) {
    const adapt = computeAdaptiveCommit({
      profile,
      phase,
      freeLandRatio,
      density: balance / Math.max(1, Math.min(100 * Math.max(1, territory), 80000)),
      balance,
      territory,
      wantEnemy: phase === 'PRESSURE' || phase === 'KILL' || phase === 'CRUSH' || phase === 'SURVIVE',
      crushable: phase === 'CRUSH' || phase === 'KILL',
      enemyBal
    });
    let troops = Math.floor(balance * adapt.ratio);
    troops = dumpExcessTroops(balance, territory, troops);
    if (enemyBal != null && enemyBal >= 0) {
      troops = crushTroops(balance, enemyBal, troops);
    }
    return Math.max(profile.minTroops || 60, troops);
  }

  /**
   * dD target policy.
   * preferNeutral=true only blocks fights when free land is still rich.
   */
  function decideTargetPolicy(profile, freeLandRatio, relativePower, areaTrend) {
    const free = freeLandRatio || 0;
    const p = profile || HardMode.active;

    // Collapse → fight back hard
    if (areaTrend < -12) {
      return { preferNeutral: false, phase: 'SURVIVE', reason: 'collapse' };
    }
    // Empty land first (dD ce → dF) whenever free land exists
    if (p.expandEmptyFirst && free > 0.025) {
      return { preferNeutral: true, phase: free > 0.1 ? 'OPENING' : 'LAND_RUSH', reason: 'dF-empty' };
    }
    // Over-dense → expand even tiny free land
    // (caller may pass density; we approximate via free-only here)
    if (free > 0.012) {
      return { preferNeutral: true, phase: 'LAND_RUSH', reason: 'expand-thin' };
    }
    // Fight: VH 90% weakest
    return {
      preferNeutral: false,
      phase: 'PRESSURE',
      pickWeakest: Math.random() < (p.weakPickChance || 0.9),
      reason: 'dJ-fight'
    };
  }

  function shouldExpandLand(freeLandRatio, balance, territoryPixels, relativePower) {
    if (freeLandRatio < 0.01) return false;
    const cap = Math.min(100 * Math.max(1, territoryPixels), 80000);
    const density = balance / Math.max(1, cap);
    if (density > 0.85) return true;
    if (freeLandRatio > 0.03) return true;
    if (relativePower < 0.9 && freeLandRatio > 0.015) return true;
    return freeLandRatio > 0.02;
  }

  function estimateInterestIncome(balance, territoryPixels, gameTickApprox) {
    const cap = Math.min(100 * Math.max(1, territoryPixels), 50000);
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

  const HardMode = {
    DIFF,
    DUMP,
    LIVE,
    al,
    crushTroops,
    dumpExcessTroops,
    ilToRatio,
    ratioToIl,
    profileFor,
    computeCommit,
    computeAdaptiveCommit,
    computeTroops,
    decideTargetPolicy,
    shouldExpandLand,
    estimateInterestIncome,
    // DEFAULT = Very Hard (index 5) — learn from the bots that crush you
    active: profileFor(DIFF.VERY_HARD)
  };

  window.TIOHardMode = HardMode;
  console.log(
    '%c[TIO HardMode v9.2] adaptive troop% + VERY HARD brain · pulse=' +
      HardMode.active.pulseMs +
      'ms fronts=' + HardMode.active.multiFront,
    'color: #f59e0b; font-weight: bold;'
  );
})();
