/**
 * Territorial.io Autonomous Human-Level Agent v4.0 Master Orchestrator
 * 
 * 14-Module Deep Architectural Integration:
 * - Module 1: Phase 1 — Computer Vision Pipeline & Morphological Closing (VisionEngine)
 * - Module 2: Phase 2 — 2D Occupancy Grid Matrix (OccupancyGrid)
 * - Module 3: Phase 3 — Perimeter, Compactness & Frontier Extraction (BorderDetector)
 * - Module 4: Phase 4 — BFS Connected Components & Region Clustering (RegionDetector)
 * - Module 5: Phase 5 — 300-Frame Sliding RAM Memory & Kinematics (WorldModel)
 * - Module 6: Phase 6 — Enemy Class Profiling & Aggression Tracking (EnemyTracker)
 * - Module 7: Phase 7 — Economy Compound Interest & Storage Cap Model (EconomyAnalyzer)
 * - Module 8: Phase 8 — 12-State FSM Strategy Planner (StrategyEngine)
 * - Module 9: Phase 9 — 10-Factor Multi-Term Action Scoring (UtilityEvaluator)
 * - Module 10: Phase 10 — Kinematic Border Extrapolation & Forecasting (PredictionEngine)
 * - Module 11: Feature 1 — Threat Field Heatmap & 3x3 Gaussian Blur (ThreatHeatmap)
 * - Module 12: Feature 2 — A* & BFS Reachability Pathfinding Engine (PathfindingEngine)
 * - Module 13: Feature 3 — Temporal Smoothing & Target Hysteresis (TemporalSmoothing)
 * - Module 14: Phase 11-13 — Virtual Pointer, HUD Telemetry & Optimization (MouseController, HUDManager, OptimizationLayer)
 * 
 * Update Timestamp: 2026-07-29 21:41:05 +07:00
 */

(function () {
  'use strict';

  if (window.__TIO_HUMAN_AGENT_MASTER_V4_LOADED__) return;
  window.__TIO_HUMAN_AGENT_MASTER_V4_LOADED__ = true;

  console.log('%c[TIO Human Agent v4.0] Launching Master Autonomous Orchestrator...', 'color: #10b981; font-weight: bold; font-size: 16px;');

  // --- MASTER CORE ENGINE ---
  class CoreEngine {
    constructor() {
      this.vision = new window.VisionEngine();
      this.occupancyGrid = new window.OccupancyGrid();
      this.borderDetector = new window.BorderDetector(this.occupancyGrid);
      this.regionDetector = new window.RegionDetector(this.occupancyGrid);
      this.worldModel = new window.WorldModel();
      this.enemyTracker = new window.EnemyTracker();
      this.economy = new window.EconomyAnalyzer();
      this.strategy = new window.StrategyEngine();
      this.utility = new window.UtilityEvaluator();
      this.prediction = new window.PredictionEngine();
      this.heatmap = new window.ThreatHeatmap();
      this.pathfinding = new window.PathfindingEngine();
      this.smoothing = new window.TemporalSmoothing();
      this.mouse = new window.MouseController();
      this.hud = new window.HUDManager();
      this.optimizer = new window.OptimizationLayer();

      this.gameStarted = false;
      this.spawnPos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      this.currentFPS = 60;
      this.frameCount = 0;
      this.lastFpsTimestamp = performance.now();
      this.animationFrameId = null;
      this.lastExecutionTime = 0;
    }

    init() {
      this.hud.create();
      this.vision.init();
      this.bindEvents();
      this.startMasterLoop();
      console.log('%c[TIO Human Agent v4.0] All 14 Engine Modules Initialized Successfully!', 'color: #34d399;');
    }

    bindEvents() {
      document.addEventListener('click', (e) => {
        if (e.target && e.target.tagName === 'CANVAS') {
          this.spawnPos.x = e.clientX;
          this.spawnPos.y = e.clientY;

          if (!this.gameStarted) {
            console.log(`[TIO Human Agent v4.0] Match Activated! Spawn set to (${e.clientX}, ${e.clientY})`);
            this.gameStarted = true;
            this.worldModel.reset();
            this.smoothing.reset();
          }
        }
      }, true);
    }

    startMasterLoop() {
      const loop = (now) => {
        this.frameCount++;
        if (now >= this.lastFpsTimestamp + 1000) {
          this.currentFPS = Math.round((this.frameCount * 1000) / (now - this.lastFpsTimestamp));
          this.frameCount = 0;
          this.lastFpsTimestamp = now;
        }

        if (this.gameStarted) {
          this.executeTick(now);
        }

        this.animationFrameId = requestAnimationFrame(loop);
      };

      this.animationFrameId = requestAnimationFrame(loop);
    }

    executeTick(now) {
      // 1. Phase 1 — Morphological Vision Pipeline
      const visionResult = this.vision.processFullPipeline();
      if (!visionResult) return;

      // 2. Phase 2-4 — Spatial Occupancy Grid, Borders & Regions
      this.occupancyGrid.updateFromVisionPipeline(visionResult);
      const borderStats = this.borderDetector.extractPerimeterAndFrontiers();
      const regionStats = this.regionDetector.detectConnectedComponents();

      // 3. Phase 5 — 300-Frame Sliding RAM World Model
      this.worldModel.recordFrame({ borderStats, regionStats });

      // 4. Phase 6 — Enemy Tracker & Opponent Profiles
      this.enemyTracker.updateOpponents(this.regionDetector.enemyClusters);
      const enemyAnalytics = this.enemyTracker.getEnemyAnalytics();

      // 5. Threat Heatmap Generation (Gaussian Blur Pass)
      this.heatmap.generateHeatmap(this.enemyTracker, this.occupancyGrid);

      // 6. Phase 7 — Economy Analyzer
      const myArea = borderStats.interiorCount + borderStats.perimeterLength;
      const dtSec = this.worldModel.lastFrame ? (now - this.worldModel.lastFrame.timestamp) / 1000 : 1;
      this.economy.updateEconomy(myArea, dtSec);
      const ecoDecisions = this.economy.getEconomicDecisions();

      // 7. Phase 8 — 12-State FSM Strategy Engine
      const gameTimeSec = Math.floor((now - this.worldModel.matchStartTime) / 1000);
      const neutralRatio = regionStats.largestNeutralArea / Math.max(1, (visionResult.width * visionResult.height));
      const stateConfig = this.strategy.evaluateTransitions(gameTimeSec, neutralRatio, this.economy.economicHealth, myArea, enemyAnalytics);

      // 8. Phase 10 — Kinematic Prediction Engine
      const predictions = this.prediction.predictFrontierExtrapolation(this.enemyTracker, this.worldModel);
      const highThreats = this.prediction.getCriticalThreats();

      // 9. Phase 9 — 10-Factor Utility Scoring & Candidate Evaluation
      let bestTargetCandidate = null;
      let highestScore = -9999;

      const candidates = this.borderDetector.expansionFrontier.length > 0 ? this.borderDetector.expansionFrontier : this.borderDetector.borderCells;
      const sampleList = candidates.length > 0 ? candidates : [{ x: this.spawnPos.x, y: this.spawnPos.y }];

      const step = Math.max(1, Math.floor(sampleList.length / 24));
      for (let i = 0; i < sampleList.length; i += step) {
        const cand = sampleList[i];
        const cell = this.occupancyGrid.getCell(cand.x, cand.y);
        const cellType = cell ? cell.type : 'NEUTRAL';

        // Reachability Verification via Pathfinding Engine
        const reachability = this.pathfinding.verifyReachabilityBFS(this.occupancyGrid, this.spawnPos.x, this.spawnPos.y, cand.x, cand.y);
        if (!reachability.reachable) continue;

        const score = this.utility.scoreTarget(cand.x, cand.y, this.spawnPos.x, this.spawnPos.y, cellType, ecoDecisions, stateConfig, this.heatmap);
        if (score > highestScore) {
          highestScore = score;
          bestTargetCandidate = cand;
        }
      }

      // 10. Temporal Smoothing & Target Hysteresis Filter
      const smoothedTarget = this.smoothing.filterTarget(bestTargetCandidate, highestScore);

      // 11. Phase 11 — Mouse Controller Execution
      if (now - this.lastExecutionTime >= stateConfig.attackPacingMs) {
        this.lastExecutionTime = now;
        const targetX = smoothedTarget ? smoothedTarget.x : this.spawnPos.x + 50;
        const targetY = smoothedTarget ? smoothedTarget.y : this.spawnPos.y + 50;

        this.economy.recordTroopDispatch(stateConfig.recommendedRatio);
        this.mouse.sendIsolatedAttack(targetX, targetY, stateConfig.recommendedRatio);
      }

      // 12. Phase 12 — Real-Time HUD Telemetry Update
      this.hud.updateTelemetry({
        currentFPS: this.currentFPS,
        statusText: '🔥 MATCH ACTIVE (HUMAN-LEVEL AGENT)',
        strategyState: this.strategy.currentState,
        reservePercentage: ecoDecisions.reserveRatioPercentage,
        ecoHealth: this.economy.economicHealth,
        bestUtilityScore: highestScore,
        expansionVelocity: this.worldModel.getExpansionVelocity(),
        trackedEnemiesCount: enemyAnalytics.totalEnemies,
        threatSeverity: highThreats.length > 0 ? 'HIGH' : 'LOW',
        visionFPS: visionResult.visionFPS
      });
    }
  }

  // Launch Master Orchestrator when DOM is ready
  const masterAgent = new CoreEngine();

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(() => masterAgent.init(), 800);
  } else {
    window.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => masterAgent.init(), 800);
    });
  }
})();
