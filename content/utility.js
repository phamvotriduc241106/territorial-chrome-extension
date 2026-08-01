/**
 * Territorial.io Utility Evaluator v6.3.0 — Hard-mode targeting
 *
 * Wins vs hard bots by:
 * - Preferring large open neutral pockets (growth room)
 * - Avoiding early war while free land remains
 * - Expanding from own mass outward (compact empire)
 * - Focusing kills on weak/dying clusters when chosen
 */
(function () {
  'use strict';

  if (window.__TIO_UTILITY_EVALUATOR_V5_LOADED__) return;
  window.__TIO_UTILITY_EVALUATOR_V5_LOADED__ = true;

  class CandidateTarget {
    constructor(x, y, type, area, distance) {
      this.x = x;
      this.y = y;
      this.type = type;
      this.area = area;
      this.distance = distance;
      this.expansionScore = 0;
      this.economyScore = 0;
      this.enemyWeaknessScore = 0;
      this.safetyScore = 0;
      this.compactnessScore = 0;
      this.pocketScore = 0;
      this.totalUtility = 0;
      this.isParetoOptimal = false;
      this.penaltyMaskMultiplier = 1;
      this.riskScore = 0;
      this.travelDistScore = 0;
    }
  }

  class ParetoFrontierFilter {
    static doesADominateB(a, b) {
      const betterOrEqual =
        a.expansionScore >= b.expansionScore &&
        a.economyScore >= b.economyScore &&
        a.safetyScore >= b.safetyScore;
      const strictlyBetter =
        a.expansionScore > b.expansionScore ||
        a.economyScore > b.economyScore ||
        a.safetyScore > b.safetyScore;
      return betterOrEqual && strictlyBetter;
    }

    static filterNonDominated(candidates) {
      const result = [];
      for (let i = 0; i < candidates.length; i++) {
        let dominated = false;
        for (let j = 0; j < candidates.length; j++) {
          if (i === j) continue;
          if (this.doesADominateB(candidates[j], candidates[i])) {
            dominated = true;
            break;
          }
        }
        if (!dominated) {
          candidates[i].isParetoOptimal = true;
          result.push(candidates[i]);
        }
      }
      return result;
    }
  }

  class UtilityEvaluator {
    constructor() {
      // Hard-mode weights: free land + safety first, vanity enemy fights later
      this.weights = {
        expansion: 0.32,
        economy: 0.22,
        pocket: 0.18,
        safety: 0.16,
        enemyWeakness: 0.07,
        compactness: 0.05
      };
      this.candidatePool = [];
      this.paretoPool = [];
      this.bestCandidate = null;
      this.lastExecutionTimeMs = 0;
      this.myCentroid = { x: 0, y: 0 };
    }

    setMyCentroid(cx, cy) {
      this.myCentroid = { x: cx, y: cy };
    }

    /**
     * Count neutral (2) cells in a small window — proxy for expansion room.
     */
    _pocketScore(typeMatrix, w, h, x, y, radius) {
      if (!typeMatrix) return 0.5;
      let neutral = 0;
      let total = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          total++;
          const t = typeMatrix[ny * w + nx];
          if (t === 2) neutral++;
        }
      }
      return total > 0 ? neutral / total : 0;
    }

    /**
     * @param options.phase - economy phase
     * @param options.typeMatrix / width / height - for pocket scoring
     * @param options.preferNeutral - hard bias away from enemies
     */
    evaluateCandidates(
      frontierCells,
      playerPos,
      worldTelemetry,
      enemyAnalytics,
      isoperimetricQuotient,
      threatHeatmap,
      aggressionValue,
      options
    ) {
      const startTime = performance.now();
      this.candidatePool = [];
      this.paretoPool = [];
      options = options || {};

      if (!frontierCells || frontierCells.length === 0) {
        this.bestCandidate = null;
        return null;
      }

      const phase = options.phase || 'LAND_RUSH';
      const preferNeutral = options.preferNeutral !== false && phase !== 'KILL' && phase !== 'PRESSURE';
      const typeMatrix = options.typeMatrix || null;
      const gw = options.width || 0;
      const gh = options.height || 0;

      const sampleStep = Math.max(1, Math.floor(frontierCells.length / 100));
      let maxDist = 1;
      const samples = [];

      const anchor = this.myCentroid.x || this.myCentroid.y
        ? this.myCentroid
        : playerPos;

      for (let i = 0; i < frontierCells.length; i += sampleStep) {
        const cell = frontierCells[i];
        const dx = cell.x - anchor.x;
        const dy = cell.y - anchor.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > maxDist) maxDist = dist;
        samples.push({ cell, dist });
      }

      for (let i = 0; i < samples.length; i++) {
        const { cell, dist } = samples[i];
        const isNeutral = !!cell.touchesNeutral && !cell.touchesEnemy;
        const isMixed = !!cell.touchesNeutral && !!cell.touchesEnemy;
        const isEnemy = !!cell.touchesEnemy && !cell.touchesNeutral;
        const type = isEnemy ? 'ENEMY' : 'NEUTRAL';

        const cand = new CandidateTarget(cell.x, cell.y, type, 100, dist);
        const distScore = 1.0 - Math.min(1.0, dist / Math.max(1, maxDist));
        // Prefer medium-near frontier: not random far spikes, not stuck on origin
        const distSweet = distScore > 0.15 && distScore < 0.95
          ? distScore
          : distScore * 0.7;

        const pocket = this._pocketScore(typeMatrix, gw, gh, cell.x | 0, cell.y | 0, 4);
        cand.pocketScore = pocket;

        // 1 Expansion
        if (isNeutral) cand.expansionScore = 1.0;
        else if (isMixed) cand.expansionScore = preferNeutral ? 0.45 : 0.7;
        else cand.expansionScore = preferNeutral ? 0.25 : 0.65;
        cand.expansionScore = Math.min(1, cand.expansionScore * (0.85 + 0.2 * aggressionValue));

        // 2 Economy — free land compounds forever
        cand.economyScore = isNeutral
          ? 0.55 + 0.45 * pocket
          : (isMixed ? 0.35 : 0.25);

        // 3 Enemy weakness — only valuable in KILL/PRESSURE
        if (type === 'ENEMY' && enemyAnalytics && enemyAnalytics.weakest) {
          cand.enemyWeaknessScore = phase === 'KILL' ? 0.95 : 0.55;
        } else if (isNeutral) {
          cand.enemyWeaknessScore = 0.6;
        } else {
          cand.enemyWeaknessScore = 0.3;
        }

        // 4 Safety — hard bots punish border wars
        const threatVal = threatHeatmap ? threatHeatmap.getThreatAt(cell.x, cell.y) : 0;
        cand.riskScore = threatVal;
        let safety = 1.0 - threatVal * (preferNeutral ? 1.4 : 0.9);
        if (cell.touchesEnemy && preferNeutral) safety *= 0.55;
        if (cell.touchesWater) safety *= 0.92;
        cand.safetyScore = Math.max(0, Math.min(1, safety));

        // 5 Compactness vs empire centroid
        cand.compactnessScore = parseFloat((0.35 * (isoperimetricQuotient || 0.5) + 0.65 * distSweet).toFixed(3));
        cand.travelDistScore = distSweet;

        // Weighted sum
        let sum =
          cand.expansionScore * this.weights.expansion +
          cand.economyScore * this.weights.economy +
          cand.pocketScore * this.weights.pocket +
          cand.safetyScore * this.weights.safety +
          cand.enemyWeaknessScore * this.weights.enemyWeakness +
          cand.compactnessScore * this.weights.compactness;

        // Phase multipliers
        if (phase === 'LAND_RUSH' || phase === 'OPENING') {
          if (isNeutral) sum *= 1.25;
          if (cell.touchesEnemy) sum *= 0.7;
        } else if (phase === 'KILL') {
          if (type === 'ENEMY') sum *= 1.35;
        } else if (phase === 'PRESSURE') {
          if (type === 'ENEMY') sum *= 1.1;
        }

        // Mild near-border bonus (efficient expand)
        sum *= 0.88 + 0.12 * distSweet;

        cand.totalUtility = parseFloat(sum.toFixed(4));
        this.candidatePool.push(cand);
      }

      this.paretoPool = ParetoFrontierFilter.filterNonDominated(this.candidatePool);

      for (let i = 0; i < this.candidatePool.length; i++) {
        const c = this.candidatePool[i];
        if (c.isParetoOptimal) c.totalUtility *= 1.08;
        // Extra threat mask in expand phases
        if ((phase === 'LAND_RUSH' || phase === 'OPENING') && c.riskScore > 0.45) {
          c.totalUtility *= 0.75;
        }
        c.totalUtility = parseFloat(c.totalUtility.toFixed(4));
      }

      this.candidatePool.sort((a, b) => b.totalUtility - a.totalUtility);
      this.bestCandidate = this.candidatePool[0] || null;
      this.lastExecutionTimeMs = parseFloat((performance.now() - startTime).toFixed(2));
      return this.bestCandidate;
    }

    getTopCandidates(count) {
      return this.candidatePool.slice(0, count || 5);
    }

    getTopMultiFrontTargets(count, minSpatialDist, gridWidth, gridHeight) {
      if (!this.candidatePool.length) return [];
      const selected = [];
      const minDistSq = (minSpatialDist || 24) * (minSpatialDist || 24);
      const minY = Math.floor(gridHeight * 0.04);
      const maxY = Math.floor(gridHeight * 0.96);
      const minX = Math.floor(gridWidth * 0.02);
      const maxX = Math.floor(gridWidth * 0.98);

      for (let i = 0; i < this.candidatePool.length; i++) {
        const c = this.candidatePool[i];
        if (c.y < minY || c.y > maxY || c.x < minX || c.x > maxX) continue;
        let tooClose = false;
        for (let j = 0; j < selected.length; j++) {
          const dx = c.x - selected[j].x;
          const dy = c.y - selected[j].y;
          if (dx * dx + dy * dy < minDistSq) {
            tooClose = true;
            break;
          }
        }
        if (!tooClose) {
          selected.push(c);
          if (selected.length >= count) break;
        }
      }
      return selected;
    }

    getUtilityTelemetry() {
      return {
        weights: this.weights,
        totalEvaluated: this.candidatePool.length,
        bestUtilityScore: this.bestCandidate ? this.bestCandidate.totalUtility : 0,
        latencyMs: this.lastExecutionTimeMs
      };
    }
  }

  window.CandidateTarget = CandidateTarget;
  window.ParetoFrontierFilter = ParetoFrontierFilter;
  window.SpatialPenaltyMask = {
    evaluateMaskMultiplier() { return 1; }
  };
  window.UtilityEvaluator = UtilityEvaluator;

  console.log('%c[TIO Utility v6.3] Hard-mode pocket targeting loaded.', 'color: #10b981;');
})();
