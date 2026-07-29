/**
 * Territorial.io Comprehensive Economy Analyzer v5.0.0
 * 
 * Production-Grade Mathematical Economy & Expansionist ROI Engine (~320 lines):
 * 1. Aggressive Compounding Philosophy:
 *    - "Need economy? -> Expand into neutral land -> Increase income -> Attack stronger later"
 *    - Early-game economy in Territorial.io is built through fast, efficient expansion, not sitting still!
 * 2. Exponential Compound Interest Curve Modeling: N(t) = N0 * (1 + r)^t
 * 3. Dynamic Storage Cap Cap = Math.max(2000, Area * 150) & 1.8s Cycle Synchronization
 * 4. Compound Interest Payback Period Calculator (time to amortize captured territory cost)
 * 5. Emergency Defense Budget Reserve Allocator (protecting minimum counter-attack budget)
 * 6. Expansion-Biased Economic Decision Rules (shouldSave, shouldAttack, shouldFarm, recommendedRatio)
 */

(function () {
  'use strict';

  if (window.__TIO_ECONOMY_ANALYZER_V5_LOADED__) return;
  window.__TIO_ECONOMY_ANALYZER_V5_LOADED__ = true;

  console.log('%c[TIO Economy Analyzer v5.0] Initializing Expansion-Driven Compounding & ROI Suite (~320 LOC)...', 'color: #34d399; font-weight: bold; font-size: 14px;');

  // ==========================================
  // CLASS 1: ECONOMIC SNAPSHOT & TRANSACTION LOG
  // ==========================================
  class EconomicTransaction {
    constructor(timestamp, actionType, troopDelta, areaDelta) {
      this.timestamp = timestamp;
      this.actionType = actionType; // 'INTEREST_TICK', 'ATTACK_DISPATCH', 'AREA_CAPTURE'
      this.troopDelta = troopDelta;
      this.areaDelta = areaDelta;
    }
  }

  // ==========================================
  // CLASS 2: PAYBACK PERIOD CALCULATOR
  // ==========================================
  class PaybackCalculator {
    /**
     * Calculates the exact number of interest cycles required for a captured territory tile
     * to pay back its initial troop acquisition cost through compound interest.
     */
    static computePaybackCycles(troopCost, expectedAreaGain, interestRatePerTick = 0.12) {
      if (expectedAreaGain <= 0 || troopCost <= 0) return Infinity;
      const gainValue = expectedAreaGain * 15.0; // Effective compounding base addition
      const ratio = troopCost / gainValue;
      const cycles = Math.ceil(Math.log(1 + (ratio * interestRatePerTick)) / Math.log(1 + interestRatePerTick));
      return Math.max(1, Math.min(100, cycles));
    }
  }

  // ==========================================
  // CLASS 3: ECONOMY ANALYZER MASTER ENGINE
  // ==========================================
  class EconomyAnalyzer {
    constructor() {
      this.estimatedTroopBalance = 1000;
      this.maxTroopCap = 5000;
      this.interestRatePerTick = 0.12; // 12% interest per 1.8s tick
      this.interestCycleDurationMs = 1800;
      this.lastInterestTickTimestamp = performance.now();

      this.estimatedIncome = 120;
      this.growthPerSec = 66.6;
      this.lossPerSec = 0.0;
      this.attackROI = 1.0;
      this.expansionROI = 1.25;
      this.efficiencyIndex = 0.85;
      this.paybackCycles = 4;

      this.emergencyDefenseReserve = 300;
      this.transactionLog = [];
      this.maxLogSize = 100;
      this.lastLandArea = 0;
      this.lastTroopExpenditure = 0;

      this.economicHealth = 'STRONG'; // 'STRONG', 'MODERATE', 'CRITICAL_DEFICIT'
      this.lastExecutionTimeMs = 0;
    }

    updateEconomy(currentLandArea, dtSec) {
      const startTime = performance.now();
      const now = performance.now();

      // 1. Dynamic Storage Cap Calculation: Cap = Math.max(2000, currentLandArea * 150)
      this.maxTroopCap = Math.max(2000, currentLandArea * 150);
      this.emergencyDefenseReserve = Math.floor(this.maxTroopCap * 0.15); // 15% minimum emergency reserve

      // 2. 1.8-Second Compound Interest Tick Synchronization
      if (now >= this.lastInterestTickTimestamp + this.interestCycleDurationMs) {
        if (this.estimatedTroopBalance < this.maxTroopCap * 0.95) {
          const interestGain = Math.floor(this.estimatedTroopBalance * this.interestRatePerTick);
          this.estimatedTroopBalance += interestGain;
          this.estimatedIncome = interestGain;
          this.growthPerSec = parseFloat((interestGain / (this.interestCycleDurationMs / 1000.0)).toFixed(1));

          this.logTransaction(now, 'INTEREST_TICK', interestGain, 0);
        } else {
          this.estimatedIncome = 0;
          this.growthPerSec = 0.0;
        }
        this.lastInterestTickTimestamp = now;
      }

      this.calculateROIMetrics(currentLandArea);

      // 3. Classify Economic Health State
      const reserveRatio = this.estimatedTroopBalance / Math.max(1, this.maxTroopCap);
      if (reserveRatio >= 0.50) {
        this.economicHealth = 'STRONG';
      } else if (reserveRatio >= 0.25) {
        this.economicHealth = 'MODERATE';
      } else {
        this.economicHealth = 'CRITICAL_DEFICIT';
      }

      this.lastLandArea = currentLandArea;
      this.lastExecutionTimeMs = parseFloat((performance.now() - startTime).toFixed(2));
    }

    logTransaction(timestamp, actionType, troopDelta, areaDelta) {
      this.transactionLog.push(new EconomicTransaction(timestamp, actionType, troopDelta, areaDelta));
      if (this.transactionLog.length > this.maxLogSize) {
        this.transactionLog.shift();
      }
    }

    recordAttackDispatch(ratio, targetType = 'NEUTRAL', expectedAreaGain = 50) {
      const now = performance.now();
      const troopExpenditure = Math.max(50, Math.floor(this.estimatedTroopBalance * ratio));

      this.estimatedTroopBalance = Math.max(
        this.emergencyDefenseReserve,
        this.estimatedTroopBalance - troopExpenditure
      );
      this.lastTroopExpenditure = troopExpenditure;
      this.lossPerSec = parseFloat(troopExpenditure.toFixed(1));

      const terrainCostFactor = (targetType === 'NEUTRAL') ? 10.0 : 80.0;
      const expectedCost = expectedAreaGain * terrainCostFactor;
      this.attackROI = parseFloat((expectedCost / Math.max(1, troopExpenditure)).toFixed(2));

      this.paybackCycles = PaybackCalculator.computePaybackCycles(
        troopExpenditure,
        expectedAreaGain,
        this.interestRatePerTick
      );

      this.logTransaction(now, 'ATTACK_DISPATCH', -troopExpenditure, expectedAreaGain);
    }

    calculateROIMetrics(currentLandArea) {
      const areaDiff = currentLandArea - this.lastLandArea;
      if (areaDiff > 0 && this.lastTroopExpenditure > 0) {
        const netYieldValue = areaDiff * 150.0;
        this.expansionROI = parseFloat((netYieldValue / Math.max(1, this.lastTroopExpenditure)).toFixed(2));
        this.efficiencyIndex = parseFloat(Math.min(1.0, (areaDiff * 10.0) / Math.max(1, this.lastTroopExpenditure)).toFixed(2));
      }
    }

    /**
     * Aggressive Expansionist Economic Policy:
     * - Even at MODERATE troop reserve (25% - 50%), if neutral land is available (neutralRatio > 0.03),
     *   we CONTINUE expanding! Capturing neutral land expands the compound interest base and increases income!
     */
    getEconomicDecisions(neutralRatio = 0.10, aggressionValue = 0.75) {
      const reserveRatio = this.estimatedTroopBalance / Math.max(1, this.maxTroopCap);
      const isNeutralAvailable = (neutralRatio > 0.02);

      let shouldSave = false;
      let shouldFarm = false;
      let shouldAttack = true;
      let recommendedRatio = 0.25;

      if (isNeutralAvailable) {
        // EARLY & MID GAME EXPANSION: Never block attacks due to dynamic cap percentage!
        // Only pause if troop balance drops to an absolute emergency floor (< 200 troops)
        shouldSave = (this.estimatedTroopBalance < 200);
        shouldAttack = !shouldSave;
        shouldFarm = true;
        recommendedRatio = (this.estimatedTroopBalance > 3000) ? 0.25 : 0.18;
      } else {
        // LATE GAME PVP WARS: Pause to regenerate if reserve ratio drops below 20%
        shouldSave = (reserveRatio < 0.20);
        shouldAttack = !shouldSave;
        shouldFarm = false;
        if (reserveRatio > 0.75) {
          recommendedRatio = 0.375;
        } else if (reserveRatio > 0.40) {
          recommendedRatio = 0.25;
        } else {
          recommendedRatio = 0.125;
        }
      }

      return {
        shouldSave: shouldSave,
        shouldFarm: shouldFarm,
        shouldAttack: shouldAttack,
        recommendedRatio: recommendedRatio,
        reserveRatioPercentage: Math.round(reserveRatio * 100),
        health: this.economicHealth,
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
  }

  // Export to global scope
  window.EconomicTransaction = EconomicTransaction;
  window.PaybackCalculator = PaybackCalculator;
  window.EconomyAnalyzer = EconomyAnalyzer;

  console.log('%c[TIO Economy Analyzer v5.0] Expansion-Driven Compounding & ROI Engine Loaded.', 'color: #10b981;');
})();
