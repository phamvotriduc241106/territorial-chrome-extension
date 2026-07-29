/**
 * Territorial.io Autonomous Human-Level Agent v3.5 Master Orchestrator
 * 
 * 14-Module Complete Engine Architecture:
 * - Module 1: Core Engine Orchestrator & Lifecycle Loop (CoreEngine)
 * - Module 2: Phase 1 — Computer Vision Pipeline (VisionEngine)
 * - Module 3: Phase 2 — 2D Occupancy Grid Matrix (OccupancyGrid)
 * - Module 4: Phase 3 — Boundary & Contiguity Extraction (BorderDetector)
 * - Module 5: Phase 5 — BFS Connected Component Clustering (RegionDetector)
 * - Module 6: Phase 5 — Persistent Memory & Frame History (WorldModel)
 * - Module 7: Phase 6 — Per-Opponent Analytics & Aggression Tracking (EnemyTracker)
 * - Module 8: Phase 7 — Compound Interest & Troop Balance Model (EconomyAnalyzer)
 * - Module 9: Phase 8 — Hierarchical Strategy State Machine (StrategyEngine)
 * - Module 10: Phase 9 — 8-Factor Multi-Term Action Scoring (UtilityEvaluator)
 * - Module 11: Phase 10 — Linear Extrapolation & Threat Forecasting (PredictionEngine)
 * - Module 12: Phase 11 — Isolated Virtual Pointer Synthesizer (MouseController)
 * - Module 13: Phase 12 — 14-Metric Real-Time Telemetry Dashboard (HUDManager)
 * - Module 14: Phase 13 — Spatial Hashing & Object Pool Optimization (OptimizationLayer)
 * 
 * Update Timestamp: 2026-07-29 21:36:04 +07:00
 */

(function () {
  'use strict';

  if (window.__TIO_HUMAN_AGENT_MASTER_LOADED__) return;
  window.__TIO_HUMAN_AGENT_MASTER_LOADED__ = true;

  console.log('%c[TIO Human Agent v3.5] Launching Master Autonomous Orchestrator...', 'color: #10b981; font-weight: bold; font-size: 16px;');

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
      console.log('%c[TIO Human Agent v3.5] All 14 Engine Modules Initialized Successfully!', 'color: #34d399;');
    }

    bindEvents() {
      document.addEventListener('click', (e) => {
        if (e.target && e.target.tagName === 'CANVAS') {
          this.spawnPos.x = e.clientX;
          this.spawnPos.y = e.clientY;

          if (!this.gameStarted) {
            console.log(`[TIO Human Agent] Game Match Activated! Spawn set to (${e.clientX}, ${e.clientY})`);
            this.gameStarted = true;
            this.worldModel.reset();
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
      // 1. Phase 1 — Vision Engine Capture
      const visionResult = this.vision.processFrame();
      if (!visionResult) return;

      // 2. Phase 2-4 — Spatial Analysis (Grid, Borders, Regions)
      this.occupancyGrid.updateFromVision(visionResult);
      const borderStats = this.borderDetector.extractBoundaries();
      const regionStats = this.regionDetector.detectRegions();
      const perimeterRatio = this.borderDetector.calculatePerimeterCompactness();

      // 3. Phase 5 — World Model Persistent Memory
      this.worldModel.recordFrame({ borderStats, regionStats, perimeterRatio });

      // 4. Phase 6 — Enemy Tracker Analytics
      this.enemyTracker.updateEnemyClusters(this.regionDetector.enemyClusters);
      const enemyAnalytics = this.enemyTracker.getEnemyAnalytics();

      // 5. Phase 7 — Economy Analyzer
      const myArea = borderStats.interiorCount + borderStats.totalBorderCount;
      this.economy.updateEconomy(myArea, this.worldModel.lastDelta ? this.worldModel.lastDelta.timeDeltaSec : 1);
      const ecoDecisions = this.economy.getEconomicDecisions();

      // 6. Phase 8 — Strategy Engine FSM
      const gameTimeSec = Math.floor((now - this.worldModel.matchStartTime) / 1000);
      const neutralRatio = regionStats.largestNeutralArea / Math.max(1, (visionResult.width * visionResult.height));
      const stateConfig = this.strategy.evaluateStateTransitions(gameTimeSec, neutralRatio, this.economy.economicHealth, myArea, enemyAnalytics);

      // 7. Phase 10 — Threat Prediction Engine
      const predictions = this.prediction.predictEnemyMovements(this.enemyTracker, this.worldModel);
      const highThreats = this.prediction.getHighThreatForecasts();

      // 8. Phase 9 — Utility Evaluation & Target Selection
      let bestTarget = null;
      let highestScore = -9999;

      // Evaluate 24-Point Radial Frontier Candidates
      const candidates = this.borderDetector.neutralBorders.length > 0 ? this.borderDetector.neutralBorders : this.borderDetector.enemyBorders;
      const sampleList = candidates.length > 0 ? candidates : [{ x: this.spawnPos.x, y: this.spawnPos.y }];

      const step = Math.max(1, Math.floor(sampleList.length / 16));
      for (let i = 0; i < sampleList.length; i += step) {
        const cand = sampleList[i];
        const cell = this.occupancyGrid.getCell(cand.x, cand.y);
        const cellType = cell ? cell.type : 'NEUTRAL';

        const score = this.utility.evaluateTargetUtility(cand.x, cand.y, this.spawnPos.x, this.spawnPos.y, cellType, ecoDecisions, stateConfig);
        if (score > highestScore) {
          highestScore = score;
          bestTarget = cand;
        }
      }

      // 9. Phase 11 — Mouse Controller Execution
      if (now - this.lastExecutionTime >= stateConfig.attackPacingMs) {
        this.lastExecutionTime = now;
        const targetX = bestTarget ? bestTarget.x : this.spawnPos.x + 50;
        const targetY = bestTarget ? bestTarget.y : this.spawnPos.y + 50;

        this.economy.recordTroopDispatch(stateConfig.recommendedRatio);
        this.mouse.sendIsolatedAttack(targetX, targetY, stateConfig.recommendedRatio);
      }

      // 10. Phase 12 — Real-Time HUD Telemetry Update
      const visionMetrics = this.vision.getMetrics();
      this.hud.updateTelemetry({
        currentFPS: this.currentFPS,
        statusText: '🔥 MATCH ACTIVE (HUMAN-LEVEL AGENT)',
        strategyState: this.strategy.currentState,
        reservePercentage: ecoDecisions.reserveRatioPercentage,
        ecoHealth: this.economy.economicHealth,
        bestUtilityScore: highestScore,
        expansionVelocity: this.worldModel.getExpansionVelocity(),
        trackedEnemiesCount: enemyAnalytics.totalEnemiesTracked,
        threatSeverity: highThreats.length > 0 ? 'HIGH' : 'LOW',
        visionFPS: visionMetrics.visionFPS
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
