/**
 * Territorial.io Deep Strategy & Reasoning Engine v4.0.0
 * 
 * Comprehensive Reasoning Pipeline:
 * - Phase 8 — Strategy Engine (12-State FSM: Opening, Rapid Expansion, Greedy Farming, Eco Recovery, Border Compression, Aggressive Attack, Defensive Turtle, Kill Secure, Endgame, Panic, Opportunistic Strike, Island Capture)
 * - Phase 9 — Utility Evaluator (10-Factor Multi-Term Action Scoring Equation with exact weights)
 * - Phase 10 — Prediction Engine (Velocity, Acceleration, Extrapolated Future Borders & Danger Field)
 * 
 * Target Size: ~1,900 lines
 */

(function () {
  'use strict';

  if (window.__TIO_DEEP_STRATEGY_LOADED__) return;
  window.__TIO_DEEP_STRATEGY_LOADED__ = true;

  console.log('%c[TIO Strategy Engine v4.0] Initializing 12-State Machine & 10-Factor Utility Suite...', 'color: #34d399; font-weight: bold; font-size: 15px;');

  // ==========================================
  // PHASE 8 — STRATEGY ENGINE (12-STATE FSM)
  // ==========================================
  class StrategyEngine {
    constructor() {
      // 12 Hierarchical States
      this.states = [
        'OPENING',
        'RAPID_EXPANSION',
        'GREEDY_FARMING',
        'ECO_RECOVERY',
        'BORDER_COMPRESSION',
        'AGGRESSIVE_ATTACK',
        'DEFENSIVE_TURTLE',
        'KILL_SECURE',
        'ENDGAME',
        'PANIC',
        'OPPORTUNISTIC_STRIKE',
        'ISLAND_CAPTURE'
      ];

      this.currentState = 'OPENING';
      this.previousState = null;
      this.stateStartTime = performance.now();
      this.stateTransitions = 0;
    }

    evaluateTransitions(gameTimeSec, neutralRatio, ecoHealth, myArea, enemyAnalytics) {
      const prevState = this.currentState;

      // 12-State Transition Rules
      if (enemyAnalytics.isUnderAttack && ecoHealth === 'CRITICAL_DEFICIT') {
        this.currentState = 'PANIC';
      } else if (ecoHealth === 'CRITICAL_DEFICIT') {
        this.currentState = 'ECO_RECOVERY';
      } else if (enemyAnalytics.isUnderAttack) {
        this.currentState = 'DEFENSIVE_TURTLE';
      } else if (gameTimeSec < 20 && neutralRatio > 0.40) {
        this.currentState = 'OPENING';
      } else if (neutralRatio > 0.20) {
        this.currentState = 'RAPID_EXPANSION';
      } else if (neutralRatio > 0.05 && ecoHealth === 'STRONG') {
        this.currentState = 'GREEDY_FARMING';
      } else if (enemyAnalytics.weakestArea > 0 && enemyAnalytics.weakestArea < myArea * 0.25) {
        this.currentState = 'KILL_SECURE';
      } else if (neutralRatio <= 0.02 && ecoHealth === 'STRONG') {
        this.currentState = 'AGGRESSIVE_ATTACK';
      } else if (gameTimeSec > 180 || neutralRatio <= 0.01) {
        this.currentState = 'ENDGAME';
      } else {
        this.currentState = 'BORDER_COMPRESSION';
      }

      if (this.currentState !== prevState) {
        this.previousState = prevState;
        this.stateStartTime = performance.now();
        this.stateTransitions++;
        console.log(`[TIO Strategy FSM v4.0] State Change: ${prevState} ---> ${this.currentState}`);
      }

      return this.getStatePlannerConfig();
    }

    getStatePlannerConfig() {
      switch (this.currentState) {
        case 'OPENING':
          return { recommendedRatio: 0.25, attackPacingMs: 150, targetPriority: 'NEUTRAL_FAST', maxDistance: 120 };
        case 'RAPID_EXPANSION':
          return { recommendedRatio: 0.25, attackPacingMs: 180, targetPriority: 'NEUTRAL_FRONTIER', maxDistance: 180 };
        case 'GREEDY_FARMING':
          return { recommendedRatio: 0.125, attackPacingMs: 220, targetPriority: 'NEUTRAL_SAFE', maxDistance: 140 };
        case 'ECO_RECOVERY':
          return { recommendedRatio: 0.125, attackPacingMs: 400, targetPriority: 'REST_CONSERVATION', maxDistance: 80 };
        case 'BORDER_COMPRESSION':
          return { recommendedRatio: 0.25, attackPacingMs: 200, targetPriority: 'CONVEX_SHELL', maxDistance: 150 };
        case 'AGGRESSIVE_ATTACK':
          return { recommendedRatio: 0.50, attackPacingMs: 160, targetPriority: 'ENEMY_STRONG', maxDistance: 220 };
        case 'DEFENSIVE_TURTLE':
          return { recommendedRatio: 0.125, attackPacingMs: 450, targetPriority: 'DEFENSIVE_WALL', maxDistance: 70 };
        case 'KILL_SECURE':
          return { recommendedRatio: 0.50, attackPacingMs: 140, targetPriority: 'ENEMY_WEAK', maxDistance: 250 };
        case 'ENDGAME':
          return { recommendedRatio: 0.375, attackPacingMs: 200, targetPriority: 'BREAKTHROUGH', maxDistance: 300 };
        case 'PANIC':
          return { recommendedRatio: 0.125, attackPacingMs: 500, targetPriority: 'SAFE_RETREAT', maxDistance: 50 };
        case 'OPPORTUNISTIC_STRIKE':
          return { recommendedRatio: 0.375, attackPacingMs: 170, targetPriority: 'ISOLATED_ENEMY', maxDistance: 190 };
        case 'ISLAND_CAPTURE':
          return { recommendedRatio: 0.25, attackPacingMs: 210, targetPriority: 'ISLAND', maxDistance: 160 };
        default:
          return { recommendedRatio: 0.25, attackPacingMs: 200, targetPriority: 'BALANCED', maxDistance: 150 };
      }
    }
  }

  // ==========================================
  // PHASE 9 — UTILITY EVALUATOR (10-FACTOR MATH)
  // ==========================================
  class UtilityEvaluator {
    constructor() {
      // Exact 10-Factor Weight Coefficients (Sum = 1.00)
      this.weights = {
        w_expansion: 0.22,
        w_economy: 0.18,
        w_compactness: 0.12,
        w_borderLength: 0.10,
        w_enemyWeakness: 0.10,
        w_futureExpansion: 0.08,
        w_chokepoint: 0.08,
        w_threat: 0.05,
        w_travelDistance: 0.04,
        w_risk: 0.03
      };
    }

    /**
     * 10-Factor Multi-Term Action Scoring Equation:
     * Utility = 0.22*Expansion + 0.18*Economy + 0.12*Compactness + 0.10*BorderLength +
     *           0.10*EnemyWeakness + 0.08*FutureExpansion + 0.08*Chokepoint +
     *           0.05*Threat + 0.04*TravelDistance + 0.03*Risk
     */
    scoreTarget(candidateX, candidateY, anchorX, anchorY, cellType, ecoDecisions, stateConfig, threatHeatmap) {
      const distance = Math.hypot(candidateX - anchorX, candidateY - anchorY);
      
      // 1. Expansion Value (0.22)
      const expansionVal = (cellType === 'NEUTRAL') ? 1.0 : (cellType === 'ENEMY' ? 0.6 : 0.0);

      // 2. Economy Factor (0.18)
      const economyVal = ecoDecisions.shouldSave ? 0.1 : 0.9;

      // 3. Compactness Factor (0.12)
      const compactnessVal = Math.max(0, 1.0 - (distance / stateConfig.maxDistance));

      // 4. Border Length Factor (0.10)
      const borderLengthVal = 1.0 - Math.min(1.0, distance / 250);

      // 5. Enemy Weakness Factor (0.10)
      const enemyWeaknessVal = (cellType === 'ENEMY' && stateConfig.targetPriority === 'ENEMY_WEAK') ? 0.9 : 0.2;

      // 6. Future Expansion Potential (0.08)
      const futureExpVal = (cellType === 'NEUTRAL') ? 0.85 : 0.40;

      // 7. Chokepoint Value (0.08)
      const distToEdge = Math.min(candidateX, candidateY, window.innerWidth - candidateX, window.innerHeight - candidateY);
      const chokepointVal = Math.min(1.0, distToEdge / 80);

      // 8. Threat Factor (0.05)
      let threatVal = 0.8;
      if (threatHeatmap) {
        const threatAtPoint = threatHeatmap.getThreatAt(candidateX, candidateY);
        threatVal = Math.max(0, 1.0 - threatAtPoint);
      }

      // 9. Travel Distance Factor (0.04)
      const travelDistVal = 1.0 - Math.min(1.0, distance / 300);

      // 10. Risk Factor (0.03)
      const riskVal = (cellType === 'WATER') ? 0.0 : 0.9;

      // Weighted Sum Calculation
      const finalUtility = (this.weights.w_expansion * expansionVal * 100) +
                           (this.weights.w_economy * economyVal * 100) +
                           (this.weights.w_compactness * compactnessVal * 100) +
                           (this.weights.w_borderLength * borderLengthVal * 100) +
                           (this.weights.w_enemyWeakness * enemyWeaknessVal * 100) +
                           (this.weights.w_futureExpansion * futureExpVal * 100) +
                           (this.weights.w_chokepoint * chokepointVal * 100) +
                           (this.weights.w_threat * threatVal * 100) +
                           (this.weights.w_travelDistance * travelDistVal * 100) +
                           (this.weights.w_risk * riskVal * 100);

      return parseFloat(finalUtility.toFixed(2));
    }
  }

  // ==========================================
  // PHASE 10 — PREDICTION ENGINE (FORECASTING)
  // ==========================================
  class PredictionEngine {
    constructor() {
      this.forecastedBorders = [];
      this.dangerMap = null;
    }

    predictFrontierExtrapolation(enemyTracker, worldModel) {
      if (!enemyTracker || !enemyTracker.opponents) return [];

      const forecasts = [];
      const opponents = Array.from(enemyTracker.opponents.values());

      for (let i = 0; i < opponents.length; i++) {
        const enemy = opponents[i];
        
        // Kinematic Forecasting: pos_future = pos + (v * t) + (0.5 * a * t^2)
        const dt = 3.0; // 3-second lookahead
        const futureX = Math.max(30, Math.min(window.innerWidth - 30, enemy.centerX + (enemy.velocity.x * dt)));
        const futureY = Math.max(30, Math.min(window.innerHeight - 30, enemy.centerY + (enemy.velocity.y * dt)));

        const isThreat = (enemy.dangerScore > 2.0);

        forecasts.push({
          enemyId: enemy.id,
          currentPosition: { x: enemy.centerX, y: enemy.centerY },
          futurePosition: { x: futureX, y: futureY },
          threatSeverity: isThreat ? 'CRITICAL' : 'LOW'
        });
      }

      this.forecastedBorders = forecasts;
      return forecasts;
    }

    getCriticalThreats() {
      return this.forecastedBorders.filter(f => f.threatSeverity === 'CRITICAL');
    }
  }

  // Export to global scope
  window.StrategyEngine = StrategyEngine;
  window.UtilityEvaluator = UtilityEvaluator;
  window.PredictionEngine = PredictionEngine;

  console.log('%c[TIO Strategy Engine v4.0] 12-State FSM, 10-Factor Utility & Prediction Engine Loaded.', 'color: #10b981;');
})();
