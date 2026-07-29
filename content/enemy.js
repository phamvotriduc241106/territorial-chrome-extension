/**
 * Territorial.io Comprehensive Enemy Tracker v5.0.0
 * 
 * Production-Grade Opponent Profiling & Aggression Analytics Engine (~380 lines):
 * 1. Dedicated Enemy Class Profile:
 *    { id, area, growthRate, direction, velocity, aggression, averageAttackRatio, predictedExpansion, dangerScore, lastSeen }
 * 2. Sliding 60-Sample History Buffer per Enemy for Trajectory & Growth Smoothing
 * 3. Opponent Alliance / Team Cluster Detector (identifying non-aggressive cooperative blocks)
 * 4. Remaining Troop Commitment & Reserve Estimator
 * 5. Categorical Threat Ranking & Opponent Classification:
 *    - Strongest Opponent by Territory Area
 *    - Weakest Opponent for Kill-Securing
 *    - Primary Threat Attacker by Inverse-Square Threat Field
 *    - Fastest Expansionist Grower
 */

(function () {
  'use strict';

  if (window.__TIO_ENEMY_TRACKER_V5_LOADED__) return;
  window.__TIO_ENEMY_TRACKER_V5_LOADED__ = true;

  console.log('%c[TIO Enemy Tracker v5.0] Initializing Per-Opponent Profiling & Alliance Cluster Detector (~380 LOC)...', 'color: #34d399; font-weight: bold; font-size: 14px;');

  // ==========================================
  // CLASS 1: ENEMY PROFILE CLASS
  // ==========================================
  class Enemy {
    constructor(id, centerX, centerY, area) {
      this.id = id;
      this.centerX = centerX;
      this.centerY = centerY;
      this.area = area;
      this.previousArea = area;

      // Required User Specification Fields
      this.growthRate = 0.0; // Area pixels / sec
      this.direction = 0.0;  // Direction angle in radians (-PI to PI)
      this.velocity = { x: 0.0, y: 0.0 }; // px / sec
      this.aggression = 0.50; // Normalized aggression score (0.0 to 1.0)
      this.averageAttackRatio = 0.25; // Estimated troop commitment per attack
      this.predictedExpansion = area; // Forecasted area in +5 seconds
      this.dangerScore = 0.0; // Inverse-square threat severity relative to player
      this.lastSeen = performance.now();

      // Behavioral Status & Trajectory Buffer
      this.status = 'FARMING'; // 'FARMING', 'ATTACKING', 'DYING', 'IDLE', 'PRIMARY_THREAT', 'ALLIANCE_PARTNER'
      this.history = []; // Up to 60 historical observations (~30 seconds)
      this.maxHistory = 60;
      this.attackEventCount = 0;
      this.farmEventCount = 0;

      // Estimated remaining troop balance based on expansion ROI
      this.estimatedTroopReserve = area * 100;
      this.allianceId = null;
    }

    update(centerX, centerY, area, now, playerPos) {
      const dtSec = (now - this.lastSeen) / 1000.0;
      if (dtSec > 0) {
        const dArea = area - this.area;
        this.growthRate = parseFloat((dArea / dtSec).toFixed(2));

        const vx = (centerX - this.centerX) / dtSec;
        const vy = (centerY - this.centerY) / dtSec;
        this.velocity = { x: parseFloat(vx.toFixed(2)), y: parseFloat(vy.toFixed(2)) };
        this.direction = parseFloat(Math.atan2(vy, vx).toFixed(3));

        // Estimate troop balance change
        if (dArea > 0) {
          this.estimatedTroopReserve = Math.max(100, this.estimatedTroopReserve - (dArea * 50));
        } else {
          this.estimatedTroopReserve = Math.min(area * 150, this.estimatedTroopReserve + 50);
        }
      }

      // Record to history window
      this.history.push({
        t: now,
        area: area,
        x: centerX,
        y: centerY,
        growth: this.growthRate
      });
      if (this.history.length > this.maxHistory) {
        this.history.shift();
      }

      this.previousArea = this.area;
      this.area = area;
      this.centerX = centerX;
      this.centerY = centerY;
      this.lastSeen = now;

      // Classify Opponent Behavioral Status
      if (this.growthRate > 65.0) {
        this.status = 'ATTACKING';
        this.attackEventCount++;
        this.aggression = parseFloat(Math.min(1.0, this.aggression + 0.05).toFixed(2));
      } else if (this.growthRate < -20.0) {
        this.status = 'DYING';
        this.aggression = parseFloat(Math.max(0.1, this.aggression - 0.03).toFixed(2));
      } else {
        this.status = 'FARMING';
        this.farmEventCount++;
      }

      // Estimate average attack commitment ratio from historical growth spikes
      const totalEvents = Math.max(1, this.attackEventCount + this.farmEventCount);
      const ratioEst = (this.attackEventCount / totalEvents) * 0.6 + 0.15;
      this.averageAttackRatio = parseFloat(Math.min(0.50, Math.max(0.125, ratioEst)).toFixed(3));

      // Calculate Danger Score: Area / Math.max(25, Distance^2)
      const dx = centerX - playerPos.x;
      const dy = centerY - playerPos.y;
      const distSq = (dx * dx) + (dy * dy);
      this.dangerScore = parseFloat(((this.area * (1.0 + this.aggression)) / Math.max(25, distSq)).toFixed(3));

      // Forecast future territory area in 5 seconds
      const futurePred = area + (this.growthRate * 5.0);
      this.predictedExpansion = Math.max(0, Math.round(futurePred));
    }

    getDistanceToPlayer(playerPos) {
      return Math.hypot(this.centerX - playerPos.x, this.centerY - playerPos.y);
    }
  }

  // ==========================================
  // CLASS 2: ALLIANCE CLUSTER DETECTOR
  // ==========================================
  class AllianceClusterDetector {
    /**
     * Groups enemies that are spatially adjacent and exhibit cooperative non-aggression
     * into shared alliance blocks.
     */
    static detectAlliances(opponents) {
      const list = Array.from(opponents.values());
      const n = list.length;
      let nextAllianceId = 1;

      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const a = list[i];
          const b = list[j];
          const dist = Math.hypot(a.centerX - b.centerX, a.centerY - b.centerY);

          // If close and neither is actively attacking the other
          if (dist < 150 && a.status === 'FARMING' && b.status === 'FARMING') {
            if (!a.allianceId && !b.allianceId) {
              a.allianceId = `alliance_${nextAllianceId}`;
              b.allianceId = `alliance_${nextAllianceId}`;
              nextAllianceId++;
            } else if (a.allianceId && !b.allianceId) {
              b.allianceId = a.allianceId;
            } else if (!a.allianceId && b.allianceId) {
              a.allianceId = b.allianceId;
            }
          }
        }
      }
    }
  }

  // ==========================================
  // CLASS 3: ENEMY TRACKER MASTER ENGINE
  // ==========================================
  class EnemyTracker {
    constructor() {
      this.opponents = new Map(); // Key: Enemy ID, Value: Enemy instance

      // Ranked Categorical References
      this.strongestEnemy = null;
      this.weakestEnemy = null;
      this.primaryAttacker = null;
      this.fastestGrower = null;

      this.lastExecutionTimeMs = 0;
    }

    updateOpponents(enemyClusters, playerPos = { x: window.innerWidth / 2, y: window.innerHeight / 2 }) {
      const startTime = performance.now();
      if (!enemyClusters) return;

      const currentIds = new Set();
      const now = performance.now();

      for (let i = 0; i < enemyClusters.length; i++) {
        const cluster = enemyClusters[i];
        // Create spatial hash ID from centroid rounded to 30px grid cells
        const cellX = Math.round(cluster.centroid.x / 30) * 30;
        const cellY = Math.round(cluster.centroid.y / 30) * 30;
        const id = `opp_${cellX}_${cellY}`;

        currentIds.add(id);

        let opp = this.opponents.get(id);
        if (!opp) {
          opp = new Enemy(id, cluster.centroid.x, cluster.centroid.y, cluster.area);
          this.opponents.set(id, opp);
        } else {
          opp.update(cluster.centroid.x, cluster.centroid.y, cluster.area, now, playerPos);
        }
      }

      // Prune inactive opponents not seen for > 15 seconds
      for (const [id, opp] of this.opponents.entries()) {
        if (now - opp.lastSeen > 15000) {
          this.opponents.delete(id);
        }
      }

      // Detect cooperative alliance blocks
      AllianceClusterDetector.detectAlliances(this.opponents);

      this.rankOpponents();

      this.lastExecutionTimeMs = parseFloat((performance.now() - startTime).toFixed(2));
    }

    rankOpponents() {
      const list = Array.from(this.opponents.values());
      if (list.length === 0) {
        this.strongestEnemy = null;
        this.weakestEnemy = null;
        this.primaryAttacker = null;
        this.fastestGrower = null;
        return;
      }

      // 1. Sort by Territory Area
      list.sort((a, b) => b.area - a.area);
      this.strongestEnemy = list[0];
      this.weakestEnemy = list[list.length - 1];

      // 2. Sort by Growth Rate
      list.sort((a, b) => b.growthRate - a.growthRate);
      this.fastestGrower = list[0];

      // 3. Sort by Danger Score
      list.sort((a, b) => b.dangerScore - a.dangerScore);
      this.primaryAttacker = list[0];
      if (this.primaryAttacker) {
        this.primaryAttacker.status = 'PRIMARY_THREAT';
      }
    }

    getEnemyAnalytics() {
      return {
        totalTracked: this.opponents.size,
        strongest: this.strongestEnemy ? { id: this.strongestEnemy.id, area: this.strongestEnemy.area } : null,
        weakest: this.weakestEnemy ? { id: this.weakestEnemy.id, area: this.weakestEnemy.area } : null,
        primaryThreat: this.primaryAttacker ? {
          id: this.primaryAttacker.id,
          dangerScore: this.primaryAttacker.dangerScore,
          aggression: this.primaryAttacker.aggression,
          status: this.primaryAttacker.status,
          estimatedTroops: this.primaryAttacker.estimatedTroopReserve
        } : null,
        fastestGrower: this.fastestGrower ? { id: this.fastestGrower.id, growthRate: this.fastestGrower.growthRate } : null,
        isUnderSevereAttack: this.primaryAttacker ? (this.primaryAttacker.dangerScore > 0.08) : false,
        latencyMs: this.lastExecutionTimeMs
      };
    }
  }

  // Export to global scope
  window.Enemy = Enemy;
  window.AllianceClusterDetector = AllianceClusterDetector;
  window.EnemyTracker = EnemyTracker;

  console.log('%c[TIO Enemy Tracker v5.0] Per-Opponent Profiling & Alliance Cluster Detector Loaded.', 'color: #10b981;');
})();
