/**
 * Territorial.io Deep World & Intelligence Engine v4.0.0
 * 
 * Comprehensive Intelligence Processing Pipeline:
 * - Phase 5 — World Model (RAM-Like Persistent Memory & 300-Frame Sliding History Window, Velocity & Acceleration)
 * - Phase 6 — Enemy Tracker (Per-Opponent Profile Class: Growth, Velocity, Aggression, Threat Severity, Target Status)
 * - Phase 7 — Economy Analyzer (Troop Balance Estimation, Compound Interest Mechanics, Attack ROI & Decision Rules)
 * 
 * Target Size: ~1,300 lines
 */

(function () {
  'use strict';

  if (window.__TIO_DEEP_WORLD_LOADED__) return;
  window.__TIO_DEEP_WORLD_LOADED__ = true;

  console.log('%c[TIO World Engine v4.0] Initializing Deep World Model, Enemy Tracker & Economy Suite...', 'color: #34d399; font-weight: bold; font-size: 15px;');

  // ==========================================
  // PHASE 5 — WORLD MODEL (300-FRAME HISTORY RAM)
  // ==========================================
  class WorldModel {
    constructor() {
      this.history300 = []; // Sliding 300-frame history window (~10-15 seconds of game memory)
      this.maxHistorySize = 300;
      this.matchStartTime = performance.now();
      this.currentVelocity = 0; // dA/dt
      this.currentAcceleration = 0; // d^2A/dt^2
      this.lastFrame = null;
    }

    reset() {
      this.history300 = [];
      this.matchStartTime = performance.now();
      this.currentVelocity = 0;
      this.currentAcceleration = 0;
      this.lastFrame = null;
    }

    recordFrame(spatialData) {
      if (!spatialData) return;

      const now = performance.now();
      const snapshot = {
        timestamp: now,
        interiorCount: spatialData.borderStats.interiorCount,
        borderCount: spatialData.borderStats.perimeterLength,
        totalArea: spatialData.borderStats.interiorCount + spatialData.borderStats.perimeterLength,
        compactness: spatialData.borderStats.compactness,
        largestNeutralArea: spatialData.regionStats.largestNeutralArea,
        enemyClusterCount: spatialData.regionStats.enemyClusterCount
      };

      this.history300.push(snapshot);
      if (this.history300.length > this.maxHistorySize) {
        this.history300.shift();
      }

      this.calculateKinematics();
      this.lastFrame = snapshot;
    }

    calculateKinematics() {
      const len = this.history300.length;
      if (len < 5) return;

      const latest = this.history300[len - 1];
      const prev5 = this.history300[len - 5];
      const dtSec = (latest.timestamp - prev5.timestamp) / 1000;

      if (dtSec <= 0) return;

      const prevVelocity = this.currentVelocity;
      const areaDiff = latest.totalArea - prev5.totalArea;

      // Velocity: dA/dt (Area growth per second)
      this.currentVelocity = parseFloat((areaDiff / dtSec).toFixed(2));

      // Acceleration: d^2A/dt^2 (Growth acceleration per second squared)
      const velDiff = this.currentVelocity - prevVelocity;
      this.currentAcceleration = parseFloat((velDiff / dtSec).toFixed(2));
    }

    getForecastedArea(futureSeconds = 5) {
      if (!this.lastFrame) return 0;
      // Kinematic forecasting: A_future = A_current + (v * t) + (0.5 * a * t^2)
      const forecasted = this.lastFrame.totalArea + (this.currentVelocity * futureSeconds) + (0.5 * this.currentAcceleration * futureSeconds * futureSeconds);
      return Math.max(0, Math.round(forecasted));
    }
  }

  // ==========================================
  // PHASE 6 — ENEMY TRACKER & ENEMY PROFILE CLASS
  // ==========================================
  class Enemy {
    constructor(id, centerX, centerY, area) {
      this.id = id;
      this.centerX = centerX;
      this.centerY = centerY;
      this.area = area;
      this.previousArea = area;
      this.growthRate = 0; // Area / sec
      this.velocity = { x: 0, y: 0 };
      this.aggression = 0.5;
      this.averageAttackRatio = 0.25;
      this.predictedExpansion = area;
      this.dangerScore = 0;
      this.lastSeen = performance.now();
      this.status = 'FARMING'; // 'FARMING', 'ATTACKING', 'DYING', 'IDLE', 'PRIMARY_THREAT'
    }

    update(centerX, centerY, area, now) {
      const dtSec = (now - this.lastSeen) / 1000;
      if (dtSec > 0) {
        const dArea = area - this.area;
        this.growthRate = parseFloat((dArea / dtSec).toFixed(2));
        this.velocity = {
          x: parseFloat(((centerX - this.centerX) / dtSec).toFixed(2)),
          y: parseFloat(((centerY - this.centerY) / dtSec).toFixed(2))
        };
      }

      this.previousArea = this.area;
      this.area = area;
      this.centerX = centerX;
      this.centerY = centerY;
      this.lastSeen = now;

      // Classify Opponent Status
      if (this.growthRate > 60) this.status = 'ATTACKING';
      else if (this.growthRate < -15) this.status = 'DYING';
      else this.status = 'FARMING';

      // Calculate Danger Score: Area / (Distance^2)
      const dist = Math.hypot(centerX - window.innerWidth / 2, centerY - window.innerHeight / 2);
      this.dangerScore = parseFloat((this.area / Math.max(10, dist * dist)).toFixed(3));
      this.predictedExpansion = Math.max(0, Math.round(area + (this.growthRate * 5)));
    }
  }

  class EnemyTracker {
    constructor() {
      this.opponents = new Map();
      this.strongestEnemy = null;
      this.weakestEnemy = null;
      this.primaryAttacker = null;
    }

    updateOpponents(enemyClusters) {
      if (!enemyClusters) return;

      const now = performance.now();
      const currentIds = new Set();

      for (let i = 0; i < enemyClusters.length; i++) {
        const cluster = enemyClusters[i];
        const id = `opponent_${cluster.centroid.x}_${cluster.centroid.y}`;
        currentIds.add(id);

        let enemy = this.opponents.get(id);
        if (!enemy) {
          enemy = new Enemy(id, cluster.centroid.x, cluster.centroid.y, cluster.area);
          this.opponents.set(id, enemy);
        } else {
          enemy.update(cluster.centroid.x, cluster.centroid.y, cluster.area, now);
        }
      }

      this.rankOpponents();
    }

    rankOpponents() {
      const list = Array.from(this.opponents.values());
      if (list.length === 0) {
        this.strongestEnemy = null;
        this.weakestEnemy = null;
        this.primaryAttacker = null;
        return;
      }

      // Rank by area
      list.sort((a, b) => b.area - a.area);
      this.strongestEnemy = list[0];
      this.weakestEnemy = list[list.length - 1];

      // Rank by danger score
      list.sort((a, b) => b.dangerScore - a.dangerScore);
      this.primaryAttacker = list[0];
      if (this.primaryAttacker) {
        this.primaryAttacker.status = 'PRIMARY_THREAT';
      }
    }

    getEnemyAnalytics() {
      return {
        totalEnemies: this.opponents.size,
        strongestArea: this.strongestEnemy ? this.strongestEnemy.area : 0,
        weakestArea: this.weakestEnemy ? this.weakestEnemy.area : 0,
        primaryDangerScore: this.primaryAttacker ? this.primaryAttacker.dangerScore : 0,
        isUnderAttack: this.primaryAttacker ? (this.primaryAttacker.dangerScore > 5.0) : false
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
      this.compoundInterestRate = 0.12; // 12% per tick (~1.8s)
      this.lastInterestTickTime = performance.now();
      this.interestCycleMs = 1800;
      this.economicHealth = 'STRONG'; // 'STRONG', 'MODERATE', 'CRITICAL_DEFICIT'
      this.growthPerSec = 0;
      this.lossPerSec = 0;
      this.attackROI = 1.0;
    }

    updateEconomy(myLandArea, dtSec) {
      // Storage Cap = Land Area * 150
      this.maxTroopCap = Math.max(2000, myLandArea * 150);

      const now = performance.now();
      if (now >= this.lastInterestTickTime + this.interestCycleMs) {
        // Compound interest tick
        if (this.estimatedTroopBalance < this.maxTroopCap * 0.95) {
          const interestGained = Math.floor(this.estimatedTroopBalance * this.compoundInterestRate);
          this.estimatedTroopBalance += interestGained;
          this.growthPerSec = parseFloat((interestGained / (this.interestCycleMs / 1000)).toFixed(1));
        }
        this.lastInterestTickTime = now;
      }

      // Classify Economic Health
      const reserveRatio = this.estimatedTroopBalance / this.maxTroopCap;
      if (reserveRatio > 0.60) this.economicHealth = 'STRONG';
      else if (reserveRatio > 0.35) this.economicHealth = 'MODERATE';
      else this.economicHealth = 'CRITICAL_DEFICIT';
    }

    recordTroopDispatch(ratio) {
      const dispatched = Math.floor(this.estimatedTroopBalance * ratio);
      this.estimatedTroopBalance = Math.max(400, this.estimatedTroopBalance - dispatched);
      this.lossPerSec = dispatched;
    }

    getEconomicDecisions() {
      const reserveRatio = this.estimatedTroopBalance / this.maxTroopCap;

      return {
        shouldSave: reserveRatio < 0.35,
        shouldAttack: reserveRatio >= 0.50,
        shouldFarm: reserveRatio >= 0.35 && reserveRatio < 0.50,
        recommendedRatio: reserveRatio > 0.70 ? 0.25 : 0.125,
        reserveRatioPercentage: Math.round(reserveRatio * 100),
        health: this.economicHealth
      };
    }
  }

  // Export to global scope
  window.WorldModel = WorldModel;
  window.Enemy = Enemy;
  window.EnemyTracker = EnemyTracker;
  window.EconomyAnalyzer = EconomyAnalyzer;

  console.log('%c[TIO World Engine v4.0] Deep World, Enemy & Economy Intelligence Suite Loaded.', 'color: #10b981;');
})();
