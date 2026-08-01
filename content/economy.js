/**
 * Territorial.io Economy v6.4.0 — Game-math Hard profile
 *
 * Uses TIOHardMode tables extracted from territorial.io bot AI (aF.kg / ki / density).
 * spend ≈ floor(B * (il+1) / 1024); Hard il=300 → ≈29.4%
 * density cap ≈ 100 * pixels; over-cap bleeds interest
 */
(function () {
  'use strict';

  if (window.__TIO_ECONOMY_ANALYZER_V5_LOADED__) return;
  window.__TIO_ECONOMY_ANALYZER_V5_LOADED__ = true;

  const VERSION = '6.4.0';

  class EconomicTransaction {
    constructor(timestamp, actionType, troopDelta, areaDelta) {
      this.timestamp = timestamp;
      this.actionType = actionType;
      this.troopDelta = troopDelta;
      this.areaDelta = areaDelta;
    }
  }

  class EconomyAnalyzer {
    constructor() {
      this.profile = (window.TIOHardMode && window.TIOHardMode.active) || {
        attackRatio: 0.294,
        attackRatioExpand: 0.21,
        attackRatioKill: 0.4,
        multiFront: 4,
        pulseMs: 340,
        densityCapPerPixel: 100,
        earlyTickBoostUntil: 1920,
        preferNeutralWhileFreeLand: 0.07,
        fightWhenPower: 1.05
      };

      this.estimatedTroopBalance = 700;
      this.maxTroopCap = 4000;
      this.interestRatePerTick = 0.06;
      this.interestCycleDurationMs = 480;
      this.lastInterestTickTimestamp = performance.now();
      this.matchStartTime = performance.now();
      this.approxTick = 0;

      this.estimatedIncome = 0;
      this.growthPerSec = 0.0;
      this.lossPerSec = 0.0;
      this.attackROI = 1.0;
      this.expansionROI = 1.25;
      this.efficiencyIndex = 0.7;
      this.paybackCycles = 2;

      this.emergencyDefenseReserve = 80;
      this.transactionLog = [];
      this.maxLogSize = 40;
      this.lastLandArea = 0;
      this.lastTroopExpenditure = 0;
      this.areaSamples = [];
      this.maxSamples = 50;

      this.economicHealth = 'LAND_RUSH';
      this.phase = 'OPENING';
      this.lastExecutionTimeMs = 0;
      this.consecutiveShrinkFrames = 0;
      this.areaTrend = 0;
      this.landValueScore = 1.0;
      this.cyclesSinceAttack = 0;
      this.ticksSinceAttack = 0;
      this.density = 0.5;
      this.relativePower = 1.0;
      this.softCap = 1000;
    }

    refreshProfile() {
      if (window.TIOHardMode && window.TIOHardMode.active) {
        this.profile = window.TIOHardMode.active;
      }
    }

    updateEconomy(currentLandArea, dtSec, enemyAvgArea) {
      this.refreshProfile();
      const startTime = performance.now();
      const now = performance.now();
      const area = Math.max(0, currentLandArea || 0);
      this.approxTick = Math.floor((now - this.matchStartTime) / 16.67); // ~60fps tick proxy

      // Game: softCap ≈ min(100 * gx, globalCap)
      const capPerPx = this.profile.densityCapPerPixel || 100;
      this.softCap = Math.min(capPerPx * Math.max(1, area), 80000);
      this.maxTroopCap = Math.max(this.softCap, area * 80);
      this.emergencyDefenseReserve = Math.floor(this.softCap * 0.08);
      this.landValueScore = parseFloat((1.0 + Math.log1p(area) / 7).toFixed(3));
      this.relativePower = enemyAvgArea > 0 ? (area / enemyAvgArea) : 1.15;
      this.density = this.estimatedTroopBalance / Math.max(1, this.softCap);

      this.areaSamples.push({ t: now, area });
      if (this.areaSamples.length > this.maxSamples) this.areaSamples.shift();

      if (this.lastLandArea > 0 && dtSec > 0) {
        const dArea = area - this.lastLandArea;
        const inst = dArea / Math.max(0.016, dtSec);
        this.areaTrend = (this.areaTrend * 0.6) + (inst * 0.4);
        this.growthPerSec = parseFloat(this.areaTrend.toFixed(1));
        this.lossPerSec = parseFloat(Math.max(0, -this.areaTrend).toFixed(1));
        if (dArea < -4) this.consecutiveShrinkFrames++;
        else this.consecutiveShrinkFrames = Math.max(0, this.consecutiveShrinkFrames - 1);
      }

      // Interest tick using game-inspired income estimator
      if (now >= this.lastInterestTickTimestamp + this.interestCycleDurationMs) {
        let income;
        if (window.TIOHardMode && window.TIOHardMode.estimateInterestIncome) {
          income = window.TIOHardMode.estimateInterestIncome(
            this.estimatedTroopBalance,
            area,
            this.approxTick
          );
        } else {
          income = Math.sqrt(Math.max(1, area)) * 2.5;
          if (this.density > 1) income *= 0.55;
        }
        // Also compound a small % of balance (interest income)
        const interestPart = Math.floor(this.estimatedTroopBalance * 0.04);
        const total = Math.floor(income + interestPart);
        this.estimatedTroopBalance = Math.min(this.maxTroopCap, this.estimatedTroopBalance + total);
        this.estimatedIncome = total;
        this.lastInterestTickTimestamp = now;
        this.cyclesSinceAttack++;
        this.ticksSinceAttack++;
      }

      if (area > this.lastLandArea && this.lastTroopExpenditure > 0) {
        const gain = area - this.lastLandArea;
        this.expansionROI = parseFloat(((gain * this.landValueScore * 18) / Math.max(1, this.lastTroopExpenditure)).toFixed(2));
        this.efficiencyIndex = parseFloat(Math.min(1.0, gain / 35).toFixed(2));
      }

      this.lastLandArea = area;
      this.lastExecutionTimeMs = parseFloat((performance.now() - startTime).toFixed(2));
    }

    recordAttackDispatch(ratio, targetType, expectedAreaGain) {
      const troopExpenditure = Math.max(15, Math.floor(this.estimatedTroopBalance * ratio));
      this.estimatedTroopBalance = Math.max(40, this.estimatedTroopBalance - troopExpenditure);
      this.lastTroopExpenditure = troopExpenditure;
      const landBonus = targetType === 'NEUTRAL' ? 1.5 : 0.95;
      this.attackROI = parseFloat(((expectedAreaGain * landBonus * this.landValueScore) / Math.max(1, troopExpenditure / 22)).toFixed(2));
      this.cyclesSinceAttack = 0;
      this.ticksSinceAttack = 0;
      this.transactionLog.push(new EconomicTransaction(performance.now(), 'ATTACK', -troopExpenditure, expectedAreaGain || 50));
      if (this.transactionLog.length > this.maxLogSize) this.transactionLog.shift();
    }

    getEconomicDecisions(neutralRatio, aggressionValue, settingsRatio, gameTimeSec, myArea, enemyAnalytics) {
      this.refreshProfile();
      const p = this.profile;
      const freeLand = neutralRatio > 0.012;
      const collapsing = this.consecutiveShrinkFrames > 12 || this.areaTrend < -70;
      const weakKill = !!(enemyAnalytics && enemyAnalytics.weakest &&
        enemyAnalytics.weakest.area > 20 &&
        myArea > enemyAnalytics.weakest.area * 2.0);
      const underPressure = !!(enemyAnalytics && enemyAnalytics.isUnderSevereAttack);
      const early = gameTimeSec < 20;
      const freeThresh = p.preferNeutralWhileFreeLand || 0.07;

      // Game-math expand decision
      let expandLand = true;
      if (window.TIOHardMode && window.TIOHardMode.shouldExpandLand) {
        expandLand = window.TIOHardMode.shouldExpandLand(
          neutralRatio,
          this.estimatedTroopBalance,
          myArea,
          this.relativePower
        );
      } else {
        expandLand = freeLand && (this.density > 0.85 || neutralRatio > 0.04);
      }

      if (collapsing && !freeLand) {
        this.phase = 'SURVIVE';
      } else if (weakKill && neutralRatio < freeThresh) {
        this.phase = 'KILL';
      } else if (expandLand && freeLand) {
        this.phase = early ? 'OPENING' : 'LAND_RUSH';
      } else if (this.density < 0.5 && this.ticksSinceAttack < 1 && !underPressure) {
        this.phase = 'STACK';
      } else if (!freeLand || this.relativePower >= (p.fightWhenPower || 1.05)) {
        this.phase = 'PRESSURE';
      } else {
        this.phase = 'LAND_RUSH';
      }

      // Over-density: force expand (game reduces interest when hB > 100*gx)
      if (this.density > 1.0 && freeLand) {
        this.phase = 'LAND_RUSH';
      }

      this.economicHealth = this.phase;

      let shouldAttack = true;
      let shouldSave = false;
      let waitForStack = false;
      let recommendedRatio = p.attackRatio || 0.29;

      if (window.TIOHardMode && window.TIOHardMode.computeAdaptiveCommit) {
        const adapt = window.TIOHardMode.computeAdaptiveCommit({
          profile: p,
          phase: this.phase,
          freeLandRatio: neutralRatio,
          density: this.density,
          relativePower: this.relativePower,
          areaTrend: this.areaTrend,
          gameTimeSec,
          balance: this.estimatedTroopBalance,
          territory: myArea,
          wantEnemy: this.phase === 'PRESSURE' || this.phase === 'KILL' || this.phase === 'SURVIVE',
          crushable: this.phase === 'KILL',
          fronts: p.multiFront || 4,
          shrinkFrames: this.consecutiveShrinkFrames
        });
        recommendedRatio = adapt.ratio;
        this._lastAdaptReason = adapt.reason;
      } else if (window.TIOHardMode && window.TIOHardMode.computeCommit) {
        recommendedRatio = window.TIOHardMode.computeCommit(p, this.phase, neutralRatio);
      }

      // User slider blend only when explicitly set (>0)
      if (settingsRatio >= 0.15 && settingsRatio <= 0.7) {
        recommendedRatio = 0.55 * recommendedRatio + 0.45 * settingsRatio;
      }

      switch (this.phase) {
        case 'OPENING':
          shouldAttack = true;
          recommendedRatio = Math.max(recommendedRatio, p.attackRatioExpand || 0.2);
          break;
        case 'LAND_RUSH':
          shouldAttack = true;
          break;
        case 'STACK':
          waitForStack = this.ticksSinceAttack < 1;
          shouldAttack = !waitForStack;
          break;
        case 'PRESSURE':
          shouldAttack = true;
          if (underPressure) recommendedRatio = Math.min(0.4, recommendedRatio + 0.05);
          break;
        case 'KILL':
          recommendedRatio = p.attackRatioKill || 0.4;
          shouldAttack = true;
          break;
        case 'SURVIVE':
          shouldSave = !freeLand;
          shouldAttack = freeLand || this.relativePower > 0.95;
          recommendedRatio = p.attackRatioExpand || 0.18;
          break;
        default:
          break;
      }

      // v7 MAX AGGRO: never stack-idle, always attack while alive
      waitForStack = false;
      shouldAttack = true;
      shouldSave = false;
      if (collapsing && freeLand) {
        this.phase = 'LAND_RUSH';
        this.economicHealth = 'ESCAPE_EXPAND';
      }
      if (this.phase === 'STACK') this.phase = 'LAND_RUSH';

      return {
        shouldSave,
        shouldFarm: freeLand,
        shouldAttack: true,
        waitForStack: false,
        recommendedRatio: parseFloat(Math.max(0.1, Math.min(0.5, recommendedRatio)).toFixed(3)),
        phase: this.phase,
        reserveRatioPercentage: Math.round((this.estimatedTroopBalance / Math.max(1, this.maxTroopCap)) * 100),
        health: this.economicHealth,
        areaTrend: this.areaTrend,
        landValueScore: this.landValueScore,
        density: this.density,
        relativePower: this.relativePower,
        softCap: this.softCap,
        gameRatio: p.attackRatio,
        multiFront: p.multiFront || 4,
        philosophy: 'GAME_HARD_BOT',
        metrics: {
          estimatedIncome: this.estimatedIncome,
          growthPerSec: this.growthPerSec,
          lossPerSec: this.lossPerSec,
          attackROI: this.attackROI,
          expansionROI: this.expansionROI,
          efficiencyIndex: this.efficiencyIndex,
          paybackCycles: this.paybackCycles,
          emergencyReserve: this.emergencyDefenseReserve
        },
        latencyMs: this.lastExecutionTimeMs
      };
    }

    getMultiWaveConfig(phase, neutralRatio, aggressionValue, pacingMs) {
      this.refreshProfile();
      const p = this.profile;
      let waveCount = p.multiFront || 4;
      let burstPacingMs = p.pulseMs || 340;
      let attackRatio = p.attackRatio || 0.29;

      if (phase === 'OPENING' || phase === 'LAND_RUSH') {
        attackRatio = window.TIOHardMode
          ? window.TIOHardMode.computeCommit(p, phase, neutralRatio)
          : (p.attackRatioExpand || 0.21);
        // Use all fronts when map is open (Hard ki=4)
        waveCount = neutralRatio > 0.04 ? (p.multiFront || 4) : Math.max(2, (p.multiFront || 4) - 1);
        burstPacingMs = phase === 'OPENING' ? 300 : 340;
      } else if (phase === 'KILL') {
        attackRatio = p.attackRatioKill || 0.4;
        waveCount = Math.min(3, p.multiFront || 4);
        burstPacingMs = 300;
      } else if (phase === 'PRESSURE') {
        attackRatio = p.attackRatio * 0.9;
        waveCount = 2;
        burstPacingMs = 360;
      } else if (phase === 'STACK') {
        attackRatio = p.attackRatioExpand || 0.2;
        waveCount = 1;
        burstPacingMs = 500;
      } else if (phase === 'SURVIVE') {
        attackRatio = 0.15;
        waveCount = 1;
        burstPacingMs = 450;
      }

      // Cap fronts for vision reliability (4 is game Hard max concurrent)
      waveCount = Math.min(4, Math.max(1, waveCount));
      if (pacingMs && pacingMs > 50) {
        burstPacingMs = Math.max(260, Math.min(burstPacingMs, pacingMs + 200));
      }

      return { waveCount, burstPacingMs, attackRatio, version: VERSION };
    }

    resetMatch() {
      this.matchStartTime = performance.now();
      this.approxTick = 0;
      this.estimatedTroopBalance = 700;
      this.cyclesSinceAttack = 0;
      this.ticksSinceAttack = 0;
      this.consecutiveShrinkFrames = 0;
      this.lastLandArea = 0;
      this.phase = 'OPENING';
      this.areaTrend = 0;
      this.refreshProfile();
    }
  }

  window.EconomicTransaction = EconomicTransaction;
  window.PaybackCalculator = {
    computePaybackCycles(troopCost, expectedAreaGain) {
      if (expectedAreaGain <= 0) return 4;
      return Math.max(1, Math.ceil(troopCost / (expectedAreaGain * 8)));
    }
  };
  window.EconomyAnalyzer = EconomyAnalyzer;

  console.log(`%c[TIO Economy v${VERSION}] Game Hard math (≈29%, 4 fronts, density cap).`, 'color: #10b981;');
})();
