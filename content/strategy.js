/**
 * Territorial.io Autonomous Human-Level Agent — High-Level Strategy & Reasoning Suite
 * 
 * Includes:
 * - Phase 8 — Strategy Engine (Hierarchical State Machine: Opening -> Expansion -> Economy -> Aggressive -> Defense -> Endgame)
 * - Phase 9 — Utility Evaluation (8-Factor Multi-Term Action Scoring Equation)
 * - Phase 10 — Prediction Engine (Velocity, Vector Trend Analysis & Opponent Forecasting)
 */

(function () {
  'use strict';

  if (window.__TIO_STRATEGY_ENGINE_LOADED__) return;
  window.__TIO_STRATEGY_ENGINE_LOADED__ = true;

  console.log('%c[TIO Strategy Engine] Initializing Phases 8-10 State Machine, Utility & Prediction Suite...', 'color: #34d399; font-weight: bold; font-size: 14px;');

  // ==========================================
  // PHASE 8 — STRATEGY ENGINE (STATE MACHINE)
  // ==========================================
  class StrategyEngine {
    constructor() {
      this.currentState = 'OPENING'; // 'OPENING', 'EXPANSION', 'ECONOMY', 'AGGRESSIVE', 'DEFENSE', 'ENDGAME'
      this.previousState = null;
      this.stateStartTime = performance.now();
      this.stateTransitions = 0;
    }

    evaluateStateTransitions(gameTimeSec, neutralRatio, ecoHealth, myArea, enemyAnalytics) {
      const prevState = this.currentState;

      if (gameTimeSec < 20 && neutralRatio > 0.4) {
        this.currentState = 'OPENING';
      } else if (neutralRatio > 0.15 && ecoHealth !== 'CRITICAL_DEFICIT') {
        this.currentState = 'EXPANSION';
      } else if (ecoHealth === 'CRITICAL_DEFICIT' || (myArea > 2000 && neutralRatio < 0.05)) {
        this.currentState = 'ECONOMY';
      } else if (enemyAnalytics.strongestArea > 0 && enemyAnalytics.strongestArea > myArea * 1.5) {
        this.currentState = 'DEFENSE';
      } else if (neutralRatio <= 0.05 && myArea > 1500) {
        this.currentState = 'AGGRESSIVE';
      } else if (gameTimeSec > 180 || neutralRatio <= 0.01) {
        this.currentState = 'ENDGAME';
      }

      if (this.currentState !== prevState) {
        this.previousState = prevState;
        this.stateStartTime = performance.now();
        this.stateTransitions++;
        console.log(`[TIO Strategy Engine] State Transition: ${prevState} -> ${this.currentState}`);
      }

      return this.getStateConfig();
    }

    getStateConfig() {
      switch (this.currentState) {
        case 'OPENING':
          return { recommendedRatio: 0.25, attackPacingMs: 150, maxTargetDistance: 120, targetPriority: 'NEUTRAL' };
        case 'EXPANSION':
          return { recommendedRatio: 0.25, attackPacingMs: 180, maxTargetDistance: 180, targetPriority: 'NEUTRAL' };
        case 'ECONOMY':
          return { recommendedRatio: 0.125, attackPacingMs: 350, maxTargetDistance: 100, targetPriority: 'CONSERVATION' };
        case 'AGGRESSIVE':
          return { recommendedRatio: 0.50, attackPacingMs: 160, maxTargetDistance: 220, targetPriority: 'ENEMY_WEAK' };
        case 'DEFENSE':
          return { recommendedRatio: 0.125, attackPacingMs: 400, maxTargetDistance: 80, targetPriority: 'COMPACT_SHELL' };
        case 'ENDGAME':
          return { recommendedRatio: 0.375, attackPacingMs: 200, maxTargetDistance: 300, targetPriority: 'BREAKTHROUGH' };
        default:
          return { recommendedRatio: 0.25, attackPacingMs: 200, maxTargetDistance: 150, targetPriority: 'BALANCED' };
      }
    }
  }

  // ==========================================
  // PHASE 9 — UTILITY EVALUATION (8-FACTOR MATH)
  // ==========================================
  class UtilityEvaluator {
    constructor() {
      // 8-Factor Weight Coefficients
      this.weights = {
        w_expansion: 100,
        w_safety: 40,
        w_compactness: 35,
        w_enemyWeakness: 50,
        w_distancePenalty: -25,
        w_futureGrowth: 45,
        w_borderStability: 30,
        w_economyBonus: 20
      };
    }

    /**
     * 8-Factor Multi-Term Action Scoring Equation:
     * Utility = w1*Expansion + w2*Safety + w3*Compactness + w4*EnemyWeakness +
     *           w5*Distance + w6*FutureGrowth + w7*BorderStability + w8*EconomyBonus
     */
    evaluateTargetUtility(candidateX, candidateY, anchorX, anchorY, cellType, ecoDecisions, stateConfig) {
      const distance = Math.hypot(candidateX - anchorX, candidateY - anchorY);
      
      // 1. Expansion Value Factor
      let expansionVal = 0;
      if (cellType === 'NEUTRAL') expansionVal = 1.0;
      else if (cellType === 'ENEMY') expansionVal = 0.6;

      // 2. Safety Factor (distance from canvas edges)
      const distToEdge = Math.min(candidateX, candidateY, window.innerWidth - candidateX, window.innerHeight - candidateY);
      const safetyVal = Math.min(1.0, distToEdge / 100);

      // 3. Compactness Factor (favors closer radial targets)
      const compactnessVal = Math.max(0, 1.0 - (distance / stateConfig.maxTargetDistance));

      // 4. Enemy Weakness Factor
      const enemyWeaknessVal = (cellType === 'ENEMY' && stateConfig.targetPriority === 'ENEMY_WEAK') ? 0.8 : 0.2;

      // 5. Distance Penalty Factor
      const distanceVal = distance / 100;

      // 6. Future Growth Factor
      const futureGrowthVal = (cellType === 'NEUTRAL') ? 0.9 : 0.4;

      // 7. Border Stability Factor
      const borderStabilityVal = (safetyVal * 0.5) + (compactnessVal * 0.5);

      // 8. Economy Bonus Factor
      const economyBonusVal = ecoDecisions.shouldSave ? 0.1 : 0.8;

      // Calculate Total Utility Score
      const totalUtility = (this.weights.w_expansion * expansionVal) +
                           (this.weights.w_safety * safetyVal) +
                           (this.weights.w_compactness * compactnessVal) +
                           (this.weights.w_enemyWeakness * enemyWeaknessVal) +
                           (this.weights.w_distancePenalty * distanceVal) +
                           (this.weights.w_futureGrowth * futureGrowthVal) +
                           (this.weights.w_borderStability * borderStabilityVal) +
                           (this.weights.w_economyBonus * economyBonusVal);

      return parseFloat(totalUtility.toFixed(2));
    }
  }

  // ==========================================
  // PHASE 10 — PREDICTION ENGINE (FORECASTING)
  // ==========================================
  class PredictionEngine {
    constructor() {
      this.predictedEnemyPositions = [];
      this.threatVectors = [];
    }

    predictEnemyMovements(enemyTracker, worldModel) {
      if (!enemyTracker || !enemyTracker.opponents) return [];

      const predictions = [];
      const opponents = Array.from(enemyTracker.opponents.values());

      for (let i = 0; i < opponents.length; i++) {
        const opp = opponents[i];
        
        // Simple linear velocity extrapolation
        const forecastedX = Math.max(30, Math.min(window.innerWidth - 30, opp.centerX + (opp.growthRate * 0.2)));
        const forecastedY = Math.max(30, Math.min(window.innerHeight - 30, opp.centerY + (opp.growthRate * 0.2)));

        const isApproachingMine = (opp.threatIndex > 50);

        predictions.push({
          enemyId: opp.id,
          currentArea: opp.area,
          forecastedArea: Math.max(0, Math.round(opp.area + (opp.growthRate * 5))),
          forecastedPosition: { x: forecastedX, y: forecastedY },
          threatSeverity: isApproachingMine ? 'HIGH' : 'LOW'
        });
      }

      this.predictedEnemyPositions = predictions;
      return predictions;
    }

    getHighThreatForecasts() {
      return this.predictedEnemyPositions.filter(p => p.threatSeverity === 'HIGH');
    }
  }

  // Export to global scope
  window.StrategyEngine = StrategyEngine;
  window.UtilityEvaluator = UtilityEvaluator;
  window.PredictionEngine = PredictionEngine;

  console.log('%c[TIO Strategy Engine] Phases 8-10 State Machine, Utility & Prediction Suite Loaded.', 'color: #10b981;');
})();
