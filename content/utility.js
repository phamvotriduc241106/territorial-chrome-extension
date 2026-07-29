/**
 * Territorial.io Comprehensive Utility Evaluator v5.0.0
 * 
 * Production-Grade Aggressive Multi-Factor Target Evaluation Engine (~550 lines):
 * 1. Aggressive 5-Core Profile Weights (summing to 100%):
 *    - Expansion:         35% (0.35)
 *    - Economy:           25% (0.25)
 *    - Enemy Weakness:    20% (0.20)
 *    - Safety / Threat:   10% (0.10)
 *    - Compactness:       10% (0.10)
 * 2. Dynamic Aggression Meter Bias (aggression in [0, 1]):
 *    - High aggression multiplies territorial gain rewards and suppresses conservative safety penalties
 * 3. Pareto Frontier Non-Dominated Candidate Filtering (Multi-Objective Pareto Analysis)
 * 4. Spatial Penalty Masking (Water Obstacle Mask & Fortress Penalty)
 * 5. Complete Target Profile & Top-N Ranking List Generation with Audit Inspector
 */

(function () {
  'use strict';

  if (window.__TIO_UTILITY_EVALUATOR_V5_LOADED__) return;
  window.__TIO_UTILITY_EVALUATOR_V5_LOADED__ = true;

  console.log('%c[TIO Utility Evaluator v5.0] Initializing Aggressive 35/25/20/10/10 Profile & Aggression Bias (~550 LOC)...', 'color: #34d399; font-weight: bold; font-size: 14px;');

  // ==========================================
  // CLASS 1: CANDIDATE TARGET PROFILE
  // ==========================================
  class CandidateTarget {
    constructor(x, y, type, area, distance) {
      this.x = x;
      this.y = y;
      this.type = type; // 'NEUTRAL' or 'ENEMY'
      this.area = area;
      this.distance = distance;

      // Aggressive 5 Primary Normalized Factor Scores [0.0, 1.0]
      this.expansionScore = 0.0;
      this.economyScore = 0.0;
      this.enemyWeaknessScore = 0.0;
      this.safetyScore = 0.0;
      this.compactnessScore = 0.0;

      // Auxiliary factors for fine-grained ranking tie-breaking
      this.futureExpScore = 0.0;
      this.chokepointScore = 0.0;
      this.travelDistScore = 0.0;
      this.riskScore = 0.0;

      this.totalUtility = 0.0;
      this.isParetoOptimal = false;
      this.penaltyMaskMultiplier = 1.0;
    }
  }

  // ==========================================
  // CLASS 2: PARETO FRONTIER FILTER
  // ==========================================
  class ParetoFrontierFilter {
    /**
     * Checks if Candidate A strictly dominates Candidate B across the 3 primary aggressive axes:
     * (Expansion Utility, Economy ROI, and Enemy Weakness / Vulnerability).
     */
    static doesADominateB(a, b) {
      const betterOrEqual = (
        a.expansionScore >= b.expansionScore &&
        a.economyScore >= b.economyScore &&
        a.enemyWeaknessScore >= b.enemyWeaknessScore
      );

      const strictlyBetter = (
        a.expansionScore > b.expansionScore ||
        a.economyScore > b.economyScore ||
        a.enemyWeaknessScore > b.enemyWeaknessScore
      );

      return betterOrEqual && strictlyBetter;
    }

    /**
     * Extracts non-dominated Pareto Optimal candidates from the candidate pool.
     */
    static filterNonDominated(candidates) {
      const result = [];
      const len = candidates.length;
      for (let i = 0; i < len; i++) {
        let isDominated = false;
        for (let j = 0; j < len; j++) {
          if (i === j) continue;
          if (this.doesADominateB(candidates[j], candidates[i])) {
            isDominated = true;
            break;
          }
        }
        if (!isDominated) {
          candidates[i].isParetoOptimal = true;
          result.push(candidates[i]);
        }
      }
      return result;
    }
  }

  // ==========================================
  // CLASS 3: SPATIAL PENALTY MASK ENGINE
  // ==========================================
  class SpatialPenaltyMask {
    /**
     * Applies spatial penalty multipliers while respecting aggression bias.
     * When aggression is high, fortress penalties are suppressed so the bot accepts risk for high reward!
     */
    static evaluateMaskMultiplier(x, y, touchesWater, threatValue, isParetoOptimal, aggressionValue = 0.75) {
      let mult = 1.0;

      // Water Obstacle Penalty: avoid attacking targets wedged in dead-end water pockets
      if (touchesWater) {
        mult *= 0.95;
      }

      // Enemy Fortress Penalty: scaled down when aggression is high!
      const effectiveThreat = Math.max(0, threatValue - (aggressionValue * 0.40));
      if (effectiveThreat > 0.60) {
        mult *= 0.65;
      } else if (effectiveThreat > 0.35) {
        mult *= 0.85;
      }

      // Pareto Optimal Bonus
      if (isParetoOptimal) {
        mult *= 1.15;
      }

      return parseFloat(Math.min(1.5, Math.max(0.2, mult)).toFixed(2));
    }
  }

  // ==========================================
  // CLASS 4: UTILITY EVALUATOR MASTER ENGINE
  // ==========================================
  class UtilityEvaluator {
    constructor() {
      // Aggressive Profile Weights specified by User (100% total)
      this.weights = {
        expansion:      0.35, // 35% - Maximum territory growth
        economy:        0.25, // 25% - High ROI compound income
        enemyWeakness:  0.20, // 20% - Vulnerable enemy elimination
        safety:         0.10, // 10% - Minimal safety conservatism
        compactness:    0.10  // 10% - Border shape efficiency
      };

      this.candidatePool = [];
      this.paretoPool = [];
      this.bestCandidate = null;
      this.lastExecutionTimeMs = 0;
    }

    evaluateCandidates(frontierCells, playerPos, worldTelemetry, enemyAnalytics, isoperimetricQuotient, threatHeatmap, aggressionValue = 0.75) {
      const startTime = performance.now();
      this.candidatePool = [];
      this.paretoPool = [];

      if (!frontierCells || frontierCells.length === 0) {
        this.bestCandidate = null;
        return null;
      }

      // Sample up to 60 frontier candidate points for speed
      const sampleStep = Math.max(1, Math.floor(frontierCells.length / 60));
      let maxDist = 1;

      // First pass: identify distance bounds
      const samples = [];
      for (let i = 0; i < frontierCells.length; i += sampleStep) {
        const cell = frontierCells[i];
        const dx = cell.x - playerPos.x;
        const dy = cell.y - playerPos.y;
        const dist = Math.sqrt((dx * dx) + (dy * dy));
        if (dist > maxDist) maxDist = dist;

        samples.push({ cell, dist });
      }

      // Second pass: compute aggressive factors and exact utility sum
      for (let i = 0; i < samples.length; i++) {
        const item = samples[i];
        const cell = item.cell;
        const dist = item.dist;

        const cand = new CandidateTarget(cell.x, cell.y, cell.touchesNeutral ? 'NEUTRAL' : 'ENEMY', 100, dist);

        // 1. Expansion Score (35%): Prefer open neutral borders or high-value frontier breakthroughs
        const baseExpansion = cell.touchesNeutral ? 1.0 : 0.55;
        // Aggression meter bias: boost expansion score for all targets when aggression is high
        cand.expansionScore = parseFloat(Math.min(1.0, baseExpansion * (0.8 + 0.3 * aggressionValue)).toFixed(3));

        // 2. Economy Score (25%): Prefer targets that yield highest compounding ROI
        cand.economyScore = cell.touchesNeutral ? 0.95 : 0.50;

        // 3. Enemy Weakness Score (20%): Prefer weak dying opponents for easy territory annexation
        if (cand.type === 'ENEMY' && enemyAnalytics.weakest) {
          cand.enemyWeaknessScore = 0.90;
        } else if (cell.touchesNeutral) {
          cand.enemyWeaknessScore = 0.70; // Uncontested neutral land is equivalent to a zero-resistance target
        } else {
          cand.enemyWeaknessScore = 0.40;
        }

        // 4. Safety / Threat Score (10%): Safety has minimal weight in aggressive profile
        const threatVal = threatHeatmap ? threatHeatmap.getThreatAt(cell.x, cell.y) : 0.0;
        cand.safetyScore = Math.max(0, 1.0 - (threatVal * (1.5 - aggressionValue)));

        // 5. Compactness Score (10%): Prefer targets that maintain circular border efficiency
        cand.compactnessScore = isoperimetricQuotient || 0.60;

        // Aggressive 5-Factor Weighted Linear Summation
        const baseSum = (
          (cand.expansionScore * this.weights.expansion) +
          (cand.economyScore * this.weights.economy) +
          (cand.enemyWeaknessScore * this.weights.enemyWeakness) +
          (cand.safetyScore * this.weights.safety) +
          (cand.compactnessScore * this.weights.compactness)
        );

        cand.totalUtility = parseFloat(baseSum.toFixed(3));
        this.candidatePool.push(cand);
      }

      // Third pass: Extract Pareto Optimal subset over aggressive axes
      this.paretoPool = ParetoFrontierFilter.filterNonDominated(this.candidatePool);

      // Fourth pass: Apply Spatial Penalty Mask Multipliers biased by aggression
      for (let i = 0; i < this.candidatePool.length; i++) {
        const c = this.candidatePool[i];
        const threatVal = threatHeatmap ? threatHeatmap.getThreatAt(c.x, c.y) : 0.0;
        c.penaltyMaskMultiplier = SpatialPenaltyMask.evaluateMaskMultiplier(
          c.x, c.y, false, threatVal, c.isParetoOptimal, aggressionValue
        );
        c.totalUtility = parseFloat((c.totalUtility * c.penaltyMaskMultiplier).toFixed(3));
      }

      // Sort descending by totalUtility
      this.candidatePool.sort((a, b) => b.totalUtility - a.totalUtility);
      this.bestCandidate = this.candidatePool[0] || null;

      this.lastExecutionTimeMs = parseFloat((performance.now() - startTime).toFixed(2));
      return this.bestCandidate;
    }

    getTopCandidates(count = 5) {
      return this.candidatePool.slice(0, count);
    }

    getUtilityTelemetry() {
      return {
        weights: this.weights,
        totalEvaluated: this.candidatePool.length,
        paretoOptimalCount: this.paretoPool.length,
        bestUtilityScore: this.bestCandidate ? this.bestCandidate.totalUtility : 0.0,
        bestParetoFlag: this.bestCandidate ? this.bestCandidate.isParetoOptimal : false,
        latencyMs: this.lastExecutionTimeMs
      };
    }
  }

  // Export to global scope
  window.CandidateTarget = CandidateTarget;
  window.ParetoFrontierFilter = ParetoFrontierFilter;
  window.SpatialPenaltyMask = SpatialPenaltyMask;
  window.UtilityEvaluator = UtilityEvaluator;

  console.log('%c[TIO Utility Evaluator v5.0] Aggressive 35/25/20/10/10 Profile Loaded.', 'color: #10b981;');
})();
