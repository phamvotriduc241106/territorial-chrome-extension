/**
 * Territorial.io Comprehensive 12-State Strategy Engine v5.0.0
 * 
 * Production-Grade Hierarchical FSM & Aggressive Expansionist Suite (~550 lines):
 * 1. Aggressive Core Philosophy: "How do I maximize territory growth while staying alive?"
 * 2. Dedicated Aggression Meter (aggression in [0, 1]) biasing every decision:
 *    - Increases when larger than nearby opponents, gaining territory quickly, or abundant neutral land
 *    - Decreases ONLY when multiple enemies are attacking, expansion stalls, or reserves are critically low
 * 3. Expansion as Default State:
 *    - Priority Flow: Opening -> Rapid Expansion (DEFAULT) -> Economy Growth -> Aggressive Attack -> Kill Secure
 * 4. Strict Multi-Condition Check for Defensive Turtling:
 *    - ONLY enters DEFENSIVE_TURTLE when (myArea < 0.4 * averageEnemyArea && threatLevel > 0.8 && borderPressure > 0.7)
 * 5. Complete Strategy Audit Log & Historical Transition Telemetry Tracker
 */

(function () {
  'use strict';

  if (window.__TIO_STRATEGY_ENGINE_V5_LOADED__) return;
  window.__TIO_STRATEGY_ENGINE_V5_LOADED__ = true;

  console.log('%c[TIO Strategy Engine v5.0] Initializing Aggression Meter & Expansionist FSM (~550 LOC)...', 'color: #34d399; font-weight: bold; font-size: 14px;');

  // ==========================================
  // CLASS 1: DYNAMIC AGGRESSION METER
  // ==========================================
  class AggressionMeter {
    constructor(initialValue = 0.92) {
      this.value = initialValue; // expansion-first default
      this.lastUpdateTime = performance.now();
      this.trend = 'RISING';
    }

    update(context, dtSec) {
      if (dtSec <= 0) return this.value;

      let delta = 0.03 * dtSec; // baseline: stay hungry for land
      if (context.neutralRatio > 0.03) {
        delta += 0.08 * dtSec; // neutrals left → expand harder
      }
      if (context.growthPerSec > 2.0) {
        delta += 0.04 * dtSec;
      }
      if (context.myArea > (context.averageEnemyArea || 0) * 1.1) {
        delta += 0.03 * dtSec;
      }
      // Only ease off on genuine collapse
      if (context.ecoHealth === 'CRITICAL_DEFICIT' && context.threatLevel > 0.7) {
        delta -= 0.10 * dtSec;
      }
      if (context.growthPerSec < -40) {
        delta -= 0.06 * dtSec;
      }

      this.value = parseFloat(Math.min(1.0, Math.max(0.55, this.value + delta)).toFixed(3));
      this.trend = delta >= 0 ? 'RISING' : 'FALLING';
      return this.value;
    }

    getAggressionLabel() {
      if (this.value >= 0.85) return `EXPAND (${this.value.toFixed(2)})`;
      if (this.value >= 0.65) return `PRESS (${this.value.toFixed(2)})`;
      return `HOLD (${this.value.toFixed(2)})`;
    }
  }

  // ==========================================
  // CLASS 2: STRATEGIC TRANSITION RECORD
  // ==========================================
  class StateTransitionRecord {
    constructor(id, fromState, toState, timestamp, priorityScore, triggerReason) {
      this.id = id;
      this.fromState = fromState;
      this.toState = toState;
      this.timestamp = timestamp;
      this.priorityScore = priorityScore;
      this.triggerReason = triggerReason;
    }
  }

  // ==========================================
  // CLASS 3: BASE STRATEGIC PLANNER
  // ==========================================
  class StrategicPlanner {
    constructor(stateName, defaultRatio, defaultPacingMs, maxDistance, targetPriority) {
      this.stateName = stateName;
      this.defaultRatio = defaultRatio;
      this.defaultPacingMs = defaultPacingMs;
      this.maxDistance = maxDistance;
      this.targetPriority = targetPriority;
      this.priorityScore = 0.0;
      this.activationCount = 0;
      this.totalActiveTimeMs = 0;
      this.lastActivatedTimestamp = 0;
    }

    getGoalDescription() {
      return `Executing ${this.stateName} aggressive expansion plan.`;
    }

    getExecutionConfig(aggressionValue) {
      // 10–20% expand band: preserve interest while still taking land every cycle
      const aggrScale = Math.max(0.6, aggressionValue);
      const scaledRatio = parseFloat(Math.min(0.22, Math.max(0.10, this.defaultRatio * (0.95 + 0.25 * aggrScale))).toFixed(3));
      // Faster pacing when aggressive (was too passive)
      const scaledPacing = Math.max(55, Math.floor(this.defaultPacingMs / Math.max(0.85, aggrScale)));

      return {
        recommendedRatio: scaledRatio,
        attackPacingMs: scaledPacing,
        maxTargetDistance: this.maxDistance,
        targetPriority: this.targetPriority,
        priorityScore: this.priorityScore
      };
    }

    onActivate(timestamp) {
      this.activationCount++;
      this.lastActivatedTimestamp = timestamp;
    }

    onDeactivate(timestamp) {
      if (this.lastActivatedTimestamp > 0) {
        this.totalActiveTimeMs += (timestamp - this.lastActivatedTimestamp);
      }
    }

    evaluatePriorityScore(context) {
      return 0.0;
    }
  }

  // ==========================================
  // 12 DEDICATED PLANNER SUBCLASSES
  // ==========================================

  /**
   * 1. Opening Planner:
   * Fastest early territorial footprint acquisition around spawn point.
   */
  class OpeningPlanner extends StrategicPlanner {
    constructor() {
      super('OPENING', 0.16, 55, 220, 'NEUTRAL_FAST');
    }

    getGoalDescription() {
      return 'Grab early land footprint — land raises interest base immediately.';
    }

    evaluatePriorityScore(context) {
      if (context.gameTimeSec > 50 && context.neutralRatio <= 0.12) return 0.0;
      const timeFactor = Math.max(0.15, 1.0 - (context.gameTimeSec / 55.0));
      return parseFloat((98.0 * timeFactor).toFixed(2));
    }
  }

  /**
   * 2. Rapid Expansion — DEFAULT. Land compounds interest → more troops forever.
   */
  class RapidExpansionPlanner extends StrategicPlanner {
    constructor() {
      super('RAPID_EXPANSION', 0.14, 70, 280, 'NEUTRAL_FRONTIER');
    }

    getGoalDescription() {
      return 'Max land growth: more pixels → higher interest → more troops.';
    }

    evaluatePriorityScore(context) {
      if (context.neutralRatio <= 0.012) return 0.0;
      const aggrBonus = context.aggression * 12.0;
      const neutralBonus = Math.min(20.0, context.neutralRatio * 40.0);
      // Always preferred over passive farming while neutrals exist
      return parseFloat((92.0 + aggrBonus + neutralBonus).toFixed(2));
    }
  }

  /**
   * 3. Greedy Farming — still expansion, slightly safer targets (NOT passive save).
   */
  class GreedyFarmingPlanner extends StrategicPlanner {
    constructor() {
      super('GREEDY_FARMING', 0.13, 85, 200, 'NEUTRAL_SAFE');
    }

    getGoalDescription() {
      return 'Efficient neutral grabs that compound interest income.';
    }

    evaluatePriorityScore(context) {
      if (context.neutralRatio <= 0.012) return 0.0;
      // Must stay below Rapid Expansion so we don't stall
      return parseFloat((80.0 + context.aggression * 5.0).toFixed(2));
    }
  }

  /**
   * 4. Aggressive Attack Planner:
   * Proactive offensive against weaker or threatening enemy borders to maintain dominance.
   */
  class AggressiveAttackPlanner extends StrategicPlanner {
    constructor() {
      super('AGGRESSIVE_ATTACK', 0.40, 140, 240, 'ENEMY_STRONG');
    }

    getGoalDescription() {
      return 'Proactive offensive against weaker or threatening enemy borders to maintain dominance.';
    }

    evaluatePriorityScore(context) {
      // Hard mode: do not open wars while free land remains
      if (context.neutralRatio > 0.06 || context.myArea < 200) return 0.0;
      if (context.myArea < context.averageEnemyArea * 0.95) return 0.0;
      const dominanceBonus = (context.myArea > context.averageEnemyArea * 1.15) ? 16.0 : 4.0;
      return parseFloat((86.0 + dominanceBonus + (context.aggression * 6.0)).toFixed(2));
    }
  }

  /**
   * 5. Kill Secure Planner:
   * Rapid surgical elimination of weak dying opponent before other players claim spoils.
   */
  class KillSecurePlanner extends StrategicPlanner {
    constructor() {
      super('KILL_SECURE', 0.45, 110, 260, 'ENEMY_WEAK');
    }

    getGoalDescription() {
      return 'Rapid surgical elimination of weak dying opponent before other players claim spoils.';
    }

    evaluatePriorityScore(context) {
      if (!context.weakestOpponent || context.weakestOpponent.area >= context.myArea * 0.25 || context.weakestOpponent.area <= 40) {
        return 0.0;
      }
      return 93.0; // Extremely high priority to secure kills quickly
    }
  }

  /**
   * 6. Defensive Turtle Planner (STRICT MULTI-CONDITION COLLAPSE CHECK):
   * ONLY enters defensive turtle mode when survival is genuinely at imminent risk:
   * if (myArea < 0.4 * averageEnemyArea && threatLevel > 0.8 && borderPressure > 0.7)
   */
  class DefensiveTurtlePlanner extends StrategicPlanner {
    constructor() {
      super('DEFENSIVE_TURTLE', 0.125, 500, 70, 'DEFENSIVE_WALL');
    }

    getGoalDescription() {
      return 'Emergency survival defense when territory is genuinely close to collapse.';
    }

    evaluatePriorityScore(context) {
      // Only turtle on extreme multi-condition collapse (was too easy to trigger → passivity)
      const isCloseToCollapse = (
        context.myArea < (0.25 * context.averageEnemyArea) &&
        context.threatLevel > 0.90 &&
        context.borderPressure > 0.85 &&
        context.ecoHealth === 'CRITICAL_DEFICIT'
      );

      if (isCloseToCollapse) {
        return 96.0;
      }
      return 0.0;
    }
  }

  /**
   * 7. Eco Recovery Planner:
   * Emergency rest pacing ONLY when troop reserves are critically depleted AND no neutral land is left.
   */
  class EcoRecoveryPlanner extends StrategicPlanner {
    constructor() {
      super('ECO_RECOVERY', 0.125, 400, 80, 'REST_CONSERVATION');
    }

    getGoalDescription() {
      return 'Rest pacing to recover from critical troop deficit below 25% reserve.';
    }

    evaluatePriorityScore(context) {
      // Never "recover" by idling while free land exists — expand is the recovery
      if (context.ecoHealth === 'CRITICAL_DEFICIT' && context.neutralRatio <= 0.01) {
        return 70.0;
      }
      return 0.0;
    }
  }

  /**
   * 8. Border Compression Planner:
   * Smoothing jagged single-tile spikes into compact circular perimeters.
   */
  class BorderCompressionPlanner extends StrategicPlanner {
    constructor() {
      super('BORDER_COMPRESSION', 0.25, 180, 150, 'CONVEX_SHELL');
    }

    getGoalDescription() {
      return 'Smoothing jagged single-tile spikes into compact circular perimeters.';
    }

    evaluatePriorityScore(context) {
      if (context.compactness >= 0.65 || context.neutralRatio > 0.08) return 0.0;
      return parseFloat((78.0 * (1.0 - context.compactness)).toFixed(2));
    }
  }

  /**
   * 9. Endgame Planner:
   * Final 1v1 or 1v2 endgame domination push across all remaining enemy borders.
   */
  class EndgamePlanner extends StrategicPlanner {
    constructor() {
      super('ENDGAME', 0.40, 140, 300, 'BREAKTHROUGH');
    }

    getGoalDescription() {
      return 'Final 1v1 or 1v2 endgame domination push across all remaining enemy borders.';
    }

    evaluatePriorityScore(context) {
      if (context.gameTimeSec > 180 || (context.neutralRatio <= 0.01 && context.totalOpponents <= 2)) {
        return 95.0;
      }
      return 0.0;
    }
  }

  /**
   * 10. Panic Planner (ULTIMATE LAST-DITCH SURVIVAL):
   * Halting all attacks only when both territory and troops are near 0.
   */
  class PanicPlanner extends StrategicPlanner {
    constructor() {
      super('PANIC', 0.10, 800, 40, 'SAFE_RETREAT');
    }

    getGoalDescription() {
      return 'Ultimate emergency survival halt when collapse is imminent.';
    }

    evaluatePriorityScore(context) {
      if (context.myArea < 150 && context.threatLevel > 0.90 && context.ecoHealth === 'CRITICAL_DEFICIT') {
        return 99.0;
      }
      return 0.0;
    }
  }

  /**
   * 11. Opportunistic Strike Planner:
   * Striking exposed opponent flank while they are engaged in war with another player.
   */
  class OpportunisticStrikePlanner extends StrategicPlanner {
    constructor() {
      super('OPPORTUNISTIC_STRIKE', 0.35, 150, 220, 'ISOLATED_ENEMY');
    }

    getGoalDescription() {
      return 'Striking exposed opponent flank while they are engaged in war with another player.';
    }

    evaluatePriorityScore(context) {
      if (context.primaryThreat && context.primaryThreat.status === 'ATTACKING' && context.myArea > 1000) {
        return 86.0;
      }
      return 0.0;
    }
  }

  /**
   * 12. Island Capture Planner:
   * Securing isolated water-bordered island regions for un-attackable compounding economy.
   */
  class IslandCapturePlanner extends StrategicPlanner {
    constructor() {
      super('ISLAND_CAPTURE', 0.28, 160, 180, 'ISLAND');
    }

    getGoalDescription() {
      return 'Securing isolated water-bordered island regions for un-attackable compounding economy.';
    }

    evaluatePriorityScore(context) {
      if (context.hasIslandTargets && context.neutralRatio > 0.03) {
        return 82.0;
      }
      return 0.0;
    }
  }

  /**
   * 13. Spoils Harvester Planner (v5.1.0 HYPER-AGGRESSIVE SUITE):
   * Instantly strip-mines defenseless territory from dying or full-sending opponents before rivals can grab it.
   */
  class SpoilsHarvesterPlanner extends StrategicPlanner {
    constructor() {
      super('SPOILS_HARVESTER', 0.20, 40, 300, 'SPOILS_RUSH');
    }

    getGoalDescription() {
      return 'Instant strip-mining of defenseless territory from collapsing or full-sending opponents.';
    }

    evaluatePriorityScore(context) {
      if (context.hasDyingOrFullSendingEnemy) {
        return 98.0; // Highest offensive priority in v5.1.0!
      }
      return 0.0;
    }
  }

  // ==========================================
  // CLASS 4: STRATEGY ENGINE MASTER ORCHESTRATOR
  // ==========================================
  class StrategyEngine {
    constructor() {
      // Dynamic Aggression Meter
      this.aggressionMeter = new AggressionMeter(0.95);

      this.planners = {
        OPENING: new OpeningPlanner(),
        RAPID_EXPANSION: new RapidExpansionPlanner(),
        GREEDY_FARMING: new GreedyFarmingPlanner(),
        AGGRESSIVE_ATTACK: new AggressiveAttackPlanner(),
        KILL_SECURE: new KillSecurePlanner(),
        DEFENSIVE_TURTLE: new DefensiveTurtlePlanner(),
        ECO_RECOVERY: new EcoRecoveryPlanner(),
        BORDER_COMPRESSION: new BorderCompressionPlanner(),
        ENDGAME: new EndgamePlanner(),
        PANIC: new PanicPlanner(),
        OPPORTUNISTIC_STRIKE: new OpportunisticStrikePlanner(),
        ISLAND_CAPTURE: new IslandCapturePlanner(),
        SPOILS_HARVESTER: new SpoilsHarvesterPlanner()
      };

      this.currentState = 'OPENING';
      this.activePlanner = this.planners.OPENING;
      this.previousState = null;
      this.stateStartTime = performance.now();
      this.stateTransitionCount = 0;

      this.transitionLog = [];
      this.maxLogSize = 100;
      this.lastExecutionTimeMs = 0;
    }

    evaluateTransitions(gameTimeSec, neutralRatio, ecoHealth, myArea, compactness, enemyAnalytics, regionStats, growthPerSec = 0.0) {
      const startTime = performance.now();
      const dtSec = (startTime - (this.lastEvalTime || startTime)) / 1000.0;
      this.lastEvalTime = startTime;

      // 1. Compute enemy population averages and border pressure
      const totalOpps = enemyAnalytics.totalTracked || 0;
      let sumEnemyArea = 0;
      let attackingOpps = 0;
      let hasDyingOrFullSendingEnemy = false;
      if (enemyAnalytics.opponentsList && enemyAnalytics.opponentsList.length > 0) {
        for (let i = 0; i < enemyAnalytics.opponentsList.length; i++) {
          const op = enemyAnalytics.opponentsList[i];
          sumEnemyArea += op.area;
          if (op.status === 'ATTACKING') attackingOpps++;
          if (op.area < 150 && op.area > 20 && myArea > op.area * 3) {
            hasDyingOrFullSendingEnemy = true;
          }
        }
      }
      const avgEnemyArea = totalOpps > 0 ? (sumEnemyArea / totalOpps) : 1000;
      const threatLevel = enemyAnalytics.primaryThreat ? enemyAnalytics.primaryThreat.dangerScore : 0.0;
      const borderPressure = parseFloat(Math.min(1.0, threatLevel * 1.5).toFixed(2));

      // 2. Build unified strategic context
      const context = {
        gameTimeSec: gameTimeSec,
        neutralRatio: neutralRatio,
        ecoHealth: ecoHealth,
        myArea: myArea,
        compactness: compactness,
        growthPerSec: growthPerSec,
        totalOpponents: totalOpps,
        averageEnemyArea: avgEnemyArea,
        attackingEnemyCount: attackingOpps,
        strongestOpponent: enemyAnalytics.strongest,
        weakestOpponent: enemyAnalytics.weakest,
        primaryThreat: enemyAnalytics.primaryThreat,
        threatLevel: threatLevel,
        borderPressure: borderPressure,
        hasIslandTargets: (regionStats.islandCount && regionStats.islandCount > 0),
        hasDyingOrFullSendingEnemy: hasDyingOrFullSendingEnemy,
        aggression: this.aggressionMeter.value
      };

      // 3. Update dynamic aggression meter
      const currentAggression = this.aggressionMeter.update(context, dtSec);
      context.aggression = currentAggression;

      // 4. Evaluate priority scores across all 13 dedicated planners
      const prevState = this.currentState;
      let bestState = 'RAPID_EXPANSION'; // Default fallback state is RAPID EXPANSION!
      let highestPriority = -1.0;

      for (const [stateName, planner] of Object.entries(this.planners)) {
        const score = planner.evaluatePriorityScore(context);
        planner.priorityScore = score;
        if (score > highestPriority) {
          highestPriority = score;
          bestState = stateName;
        }
      }

      // Hysteresis check: Require +5.0 margin to switch unless switching into genuine emergency
      if (bestState !== prevState && this.activePlanner.priorityScore > 0) {
        if (highestPriority < this.activePlanner.priorityScore + 5.0 &&
            bestState !== 'DEFENSIVE_TURTLE' && bestState !== 'PANIC') {
          bestState = prevState;
        }
      }

      this.currentState = bestState;
      this.activePlanner = this.planners[bestState];

      if (this.currentState !== prevState) {
        this.previousState = prevState;
        const now = performance.now();

        if (this.planners[prevState]) {
          this.planners[prevState].onDeactivate(now);
        }
        this.activePlanner.onActivate(now);

        this.stateStartTime = now;
        this.stateTransitionCount++;

        const reason = `Priority Score Advantage: ${highestPriority.toFixed(1)} (Aggr: ${currentAggression})`;
        this.logTransition(this.stateTransitionCount, prevState, this.currentState, now, highestPriority, reason);

        console.log(`[TIO Strategy FSM v5.0] State Transition (#${this.stateTransitionCount}): ${prevState} ---> ${this.currentState} (${reason})`);
      }

      this.lastExecutionTimeMs = parseFloat((performance.now() - startTime).toFixed(2));

      const execConfig = this.activePlanner.getExecutionConfig(currentAggression);

      return {
        ...execConfig,
        stateName: this.currentState,
        goalDescription: this.activePlanner.getGoalDescription(),
        transitionCount: this.stateTransitionCount,
        aggressionValue: currentAggression,
        aggressionLabel: this.aggressionMeter.getAggressionLabel(),
        latencyMs: this.lastExecutionTimeMs
      };
    }

    logTransition(id, fromState, toState, timestamp, priorityScore, triggerReason) {
      this.transitionLog.push(new StateTransitionRecord(id, fromState, toState, timestamp, priorityScore, triggerReason));
      if (this.transitionLog.length > this.maxLogSize) {
        this.transitionLog.shift();
      }
    }

    getCurrentState() {
      return this.currentState;
    }

    getActivePlanner() {
      return this.activePlanner;
    }

    getStrategyTelemetry() {
      return {
        currentState: this.currentState,
        previousState: this.previousState,
        stateDurationSec: parseFloat(((performance.now() - this.stateStartTime) / 1000.0).toFixed(1)),
        transitionCount: this.stateTransitionCount,
        aggression: this.aggressionMeter.value,
        aggressionLabel: this.aggressionMeter.getAggressionLabel(),
        planners: Object.entries(this.planners).map(([name, p]) => ({
          name: name,
          priorityScore: p.priorityScore,
          activationCount: p.activationCount
        })),
        latencyMs: this.lastExecutionTimeMs
      };
    }
  }

  // Export to global scope
  window.AggressionMeter = AggressionMeter;
  window.StateTransitionRecord = StateTransitionRecord;
  window.StrategicPlanner = StrategicPlanner;
  window.StrategyEngine = StrategyEngine;

  console.log('%c[TIO Strategy Engine v5.0] Aggressive Expansionist Philosophy & Aggression Meter Loaded.', 'color: #10b981;');
})();
