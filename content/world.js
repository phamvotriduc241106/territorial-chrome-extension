/**
 * Territorial.io Autonomous Human-Level Agent — World & Enemy Intelligence Suite
 * 
 * Includes:
 * - Phase 5 — World Model (Persistent Memory & 10-Frame Sliding Window History)
 * - Phase 6 — Enemy Tracker (Per-Opponent Analytics: Position, Area, Growth Rate, Aggression, Threat Index)
 * - Phase 7 — Economy Analyzer (Troop Balance Estimation, Compound Interest Cycles, Economic Decision Rules)
 */

(function () {
  'use strict';

  if (window.__TIO_WORLD_ENGINE_LOADED__) return;
  window.__TIO_WORLD_ENGINE_LOADED__ = true;

  console.log('%c[TIO World Engine] Initializing Phases 5-7 World Model, Enemy Tracker & Economy Suite...', 'color: #34d399; font-weight: bold; font-size: 14px;');

  // ==========================================
  // PHASE 5 — WORLD MODEL (PERSISTENT MEMORY)
  // ==========================================
  class WorldModel {
    constructor() {
      this.frameHistory = []; // Sliding 10-frame window history
      this.maxHistoryLength = 10;
      this.myBorderHistory = [];
      this.neutralAreaHistory = [];
      this.enemyClustersHistory = [];
      this.matchStartTime = 0;
      this.lastDelta = null;
    }

    reset() {
      this.frameHistory = [];
      this.myBorderHistory = [];
      this.neutralAreaHistory = [];
      this.enemyClustersHistory = [];
      this.matchStartTime = performance.now();
      this.lastDelta = null;
    }

    recordFrame(spatialData) {
      if (!spatialData) return;

      const frameSnapshot = {
        timestamp: performance.now(),
        borderStats: spatialData.borderStats,
        regionStats: spatialData.regionStats,
        perimeterRatio: spatialData.perimeterRatio
      };

      this.frameHistory.push(frameSnapshot);
      if (this.frameHistory.length > this.maxHistoryLength) {
        this.frameHistory.shift();
      }

      this.computeFrameDelta();
    }

    computeFrameDelta() {
      if (this.frameHistory.length < 2) return;

      const latest = this.frameHistory[this.frameHistory.length - 1];
      const previous = this.frameHistory[this.frameHistory.length - 2];
      const timeDeltaSec = (latest.timestamp - previous.timestamp) / 1000;

      if (timeDeltaSec <= 0) return;

      const myAreaChange = latest.borderStats.interiorCount - previous.borderStats.interiorCount;
      const neutralChange = latest.regionStats.largestNeutralArea - previous.regionStats.largestNeutralArea;

      this.lastDelta = {
        timeDeltaSec,
        myAreaGrowthRate: parseFloat((myAreaChange / timeDeltaSec).toFixed(2)),
        neutralDepletionRate: parseFloat((neutralChange / timeDeltaSec).toFixed(2)),
        compactnessDelta: parseFloat((latest.perimeterRatio - previous.perimeterRatio).toFixed(3))
      };
    }

    getExpansionVelocity() {
      return this.lastDelta ? this.lastDelta.myAreaGrowthRate : 0;
    }
  }

  // ==========================================
  // PHASE 6 — ENEMY TRACKER
  // ==========================================
  class EnemyTracker {
    constructor() {
      this.opponents = new Map(); // Key: Enemy Cluster ID / Color, Value: Enemy Profile
      this.strongestEnemy = null;
      this.weakestEnemy = null;
      this.primaryAttacker = null;
    }

    updateEnemyClusters(enemyClusters) {
      if (!enemyClusters) return;

      const activeIds = new Set();

      for (let i = 0; i < enemyClusters.length; i++) {
        const cluster = enemyClusters[i];
        const clusterId = `enemy_cluster_${i}_${cluster.centerX}_${cluster.centerY}`;
        activeIds.add(clusterId);

        let profile = this.opponents.get(clusterId);
        const now = performance.now();

        if (!profile) {
          profile = {
            id: clusterId,
            centerX: cluster.centerX,
            centerY: cluster.centerY,
            area: cluster.size,
            previousArea: cluster.size,
            growthRate: 0,
            aggressionScore: 0.5,
            threatIndex: 0,
            status: 'FARMING', // 'FARMING', 'ATTACKING', 'DYING', 'IDLE'
            lastSeen: now
          };
          this.opponents.set(clusterId, profile);
        } else {
          const dtSec = (now - profile.lastSeen) / 1000;
          if (dtSec > 0) {
            const areaDiff = cluster.size - profile.area;
            profile.growthRate = parseFloat((areaDiff / dtSec).toFixed(2));
          }
          profile.previousArea = profile.area;
          profile.area = cluster.size;
          profile.centerX = cluster.centerX;
          profile.centerY = cluster.centerY;
          profile.lastSeen = now;

          // Classify Enemy Status
          if (profile.growthRate > 50) profile.status = 'ATTACKING';
          else if (profile.growthRate < -20) profile.status = 'DYING';
          else profile.status = 'FARMING';
        }

        // Calculate Threat Index: Area / Distance
        profile.threatIndex = parseFloat((profile.area / (1 + Math.hypot(cluster.centerX - window.innerWidth / 2, cluster.centerY - window.innerHeight / 2))).toFixed(2));
      }

      this.rankOpponents();
    }

    rankOpponents() {
      const list = Array.from(this.opponents.values());
      if (list.length === 0) {
        this.strongestEnemy = null;
        this.weakestEnemy = null;
        return;
      }

      list.sort((a, b) => b.area - a.area);
      this.strongestEnemy = list[0];
      this.weakestEnemy = list[list.length - 1];

      // Identify primary threat by highest Threat Index
      list.sort((a, b) => b.threatIndex - a.threatIndex);
      this.primaryAttacker = list[0];
    }

    getEnemyAnalytics() {
      return {
        totalEnemiesTracked: this.opponents.size,
        strongestArea: this.strongestEnemy ? this.strongestEnemy.area : 0,
        weakestArea: this.weakestEnemy ? this.weakestEnemy.area : 0,
        primaryThreatIndex: this.primaryAttacker ? this.primaryAttacker.threatIndex : 0
      };
    }
  }

  // ==========================================
  // PHASE 7 — ECONOMY ANALYZER
  // ==========================================
  class EconomyAnalyzer {
    constructor() {
      this.estimatedTroopBalance = 1000;
      this.maxTroopCap = 5000;
      this.compoundInterestRate = 0.12; // 12% interest per tick
      this.lastInterestTickTime = performance.now();
      this.interestCycleMs = 1800; // ~1.8s interest cycle in Territorial.io
      this.economicHealth = 'STRONG'; // 'STRONG', 'MODERATE', 'CRITICAL_DEFICIT'
    }

    updateEconomy(myLandArea, timeSeconds) {
      // Max interest storage cap scales with total land pixels
      this.maxTroopCap = Math.max(2000, myLandArea * 150);

      const now = performance.now();
      if (now >= this.lastInterestTickTime + this.interestCycleMs) {
        // Compound interest tick
        if (this.estimatedTroopBalance < this.maxTroopCap * 0.95) {
          this.estimatedTroopBalance += Math.floor(this.estimatedTroopBalance * this.compoundInterestRate);
        }
        this.lastInterestTickTime = now;
      }

      // Classify Economic Health
      const reserveRatio = this.estimatedTroopBalance / this.maxTroopCap;
      if (reserveRatio > 0.6) this.economicHealth = 'STRONG';
      else if (reserveRatio > 0.3) this.economicHealth = 'MODERATE';
      else this.economicHealth = 'CRITICAL_DEFICIT';
    }

    recordTroopDispatch(ratio) {
      // Deduct dispatched troops from estimated balance
      const dispatched = Math.floor(this.estimatedTroopBalance * ratio);
      this.estimatedTroopBalance = Math.max(500, this.estimatedTroopBalance - dispatched);
    }

    getEconomicDecisions() {
      const reserveRatio = this.estimatedTroopBalance / this.maxTroopCap;

      return {
        shouldSave: reserveRatio < 0.35,
        shouldAttack: reserveRatio >= 0.50,
        shouldFarm: reserveRatio >= 0.35 && reserveRatio < 0.50,
        recommendedRatio: reserveRatio > 0.7 ? 0.25 : 0.125,
        reserveRatioPercentage: Math.round(reserveRatio * 100)
      };
    }
  }

  // Export to global scope
  window.WorldModel = WorldModel;
  window.EnemyTracker = EnemyTracker;
  window.EconomyAnalyzer = EconomyAnalyzer;

  console.log('%c[TIO World Engine] Phases 5-7 World, Enemy & Economy Suite Loaded.', 'color: #10b981;');
})();
