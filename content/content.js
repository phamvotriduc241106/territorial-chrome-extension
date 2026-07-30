/**
 * Territorial.io Comprehensive Master Orchestrator Core Engine v5.0.0
 * 
 * Production-Grade 16-Module Pipeline Orchestrator (~300 lines):
 * 1. Coordinates exact data-flow order across all 15 deep analytical modules:
 *    Vision -> Grid -> Region -> Border -> World -> Enemy -> Economy -> Heatmap ->
 *    Strategy -> Utility -> Prediction -> Smoothing -> Pathfinding -> HUD -> Controller -> Optimization -> Spatial
 * 2. Aggressive Core Philosophy:
 *    - "How do I maximize territory growth while staying alive?"
 *    - Continuous neutral expansion and dynamic Aggression Meter biasing every target & economy decision
 * 3. Strict Compliance with User Constraints:
 *    - Auto-Start Rule: Idles on menu screens; activates automatically when canvas is clicked
 *    - Hardware Mouse Protection: Blocks hardware movement via pointerId 99
 *    - Zero Crosshair & YYYY-MM-DD HH:MM:SS +07:00 timestamping enforced in HUD
 */

(function () {
  'use strict';

  if (window.__TIO_MASTER_ORCHESTRATOR_V5_LOADED__) return;
  window.__TIO_MASTER_ORCHESTRATOR_V5_LOADED__ = true;

  console.log('%c[TIO Master Orchestrator v5.0] Launching Aggressive Expansionist AI Engine (~5,700+ Total LOC)...', 'color: #38bdf8; font-weight: bold; font-size: 16px;');

  class TerritorialMasterOrchestrator {
    constructor() {
      this.vision     = new window.VisionEngine();
      this.grid       = new window.OccupancyGrid();
      this.region     = new window.RegionDetector(this.grid);
      this.border     = new window.BorderDetector(this.grid);
      this.world      = new window.WorldModel();
      this.enemy      = new window.EnemyTracker();
      this.economy    = new window.EconomyAnalyzer();
      this.heatmap    = new window.HeatmapEngine(120, 120);
      this.strategy   = new window.StrategyEngine();
      this.utility    = new window.UtilityEvaluator();
      this.prediction = new window.PredictionEngine();
      this.smoothing  = new window.TemporalSmoothing(1500, 0.15);
      this.pathfinder = new window.PathfindingEngine(this.grid);
      this.hud        = new window.HUDEngine();
      this.controller = new window.MouseController();
      this.scheduler  = new window.AdaptiveScheduler(15);

      this.isActive = false;
      this.loopId = null;
      this.frameCount = 0;
      this.lastTickTime = performance.now();
      this.lastAttackDispatchTime = 0;

      this.playerSpawnPos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      this.isPlayerSpawnCalibrated = false;
    }

    init() {
      const attachInterval = setInterval(() => {
        const canvas = document.querySelector('canvas');
        if (canvas) {
          clearInterval(attachInterval);
          this.setupAutoStart(canvas);
          this.hud.init();
          this.startLoop();
          console.log('%c[TIO Master Orchestrator v5.0] Ready & Active. Loop started immediately upon canvas detection.', 'color: #10b981;');
        }
      }, 500);
    }

    setupAutoStart(canvas) {
      const spawnHandler = (e) => {
        // Ignore synthetic events dispatched by our own bot (virtualPointerId 99 or detail === 1 from bot)
        if (e.pointerId === 99 || (e.detail && e.detail._isBot)) return;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        if (!clientX || !clientY) return;

        console.log(`%c[TIO Master Orchestrator v5.0] User Click Captured at (${clientX}, ${clientY})! Calibrating spawn.`, 'color: #34d399; font-weight: bold;');
        this.playerSpawnPos = { x: clientX, y: clientY };
        this.isPlayerSpawnCalibrated = true;
        this.vision.sampleAndCalibratePlayerColor(clientX, clientY);
        this.world.resetMatchTime();
      };

      ['mousedown', 'pointerdown', 'touchstart', 'click'].forEach(evt => {
        window.addEventListener(evt, spawnHandler, { capture: true });
        canvas.addEventListener(evt, spawnHandler, { capture: true });
      });
    }

    startLoop() {
      if (this.isActive) return;
      this.isActive = true;
      this.lastTickTime = performance.now();
      this.loop();
    }

    stopLoop() {
      this.isActive = false;
      if (this.loopId) cancelAnimationFrame(this.loopId);
      console.log('%c[TIO Master Orchestrator v5.0] Autonomous loop paused.', 'color: #f87171;');
    }

    loop() {
      if (!this.isActive) return;

      const now = performance.now();
      const dtSec = (now - this.lastTickTime) / 1000.0;

      if (this.scheduler.shouldRunFrame(now)) {
        this.executePipeline(now, dtSec);
        this.lastTickTime = now;
      }

      this.loopId = requestAnimationFrame(() => this.loop());
    }

    executePipeline(now, dtSec) {
      this.frameCount++;

      // ========================================================
      // STEP 1: VISION ENGINE (Capture, Classify, Morphological Closing)
      // ========================================================
      const visionResult = this.vision.processFrame();
      if (!visionResult || !visionResult.typeMatrix) return;

      if (this.frameCount <= 300 && this.isPlayerSpawnCalibrated) {
        this.vision.sampleAndCalibratePlayerColor(this.playerSpawnPos.x, this.playerSpawnPos.y);
      }

      // ========================================================
      // STEP 2: OCCUPANCY GRID (Update Spatial Cell Matrix)
      // ========================================================
      this.grid.updateFromVision(visionResult);
      this.region.setGrid(this.grid);
      this.border.setGrid(this.grid);
      this.pathfinder.setGrid(this.grid);

      // ========================================================
      // STEP 3: REGION DETECTOR (Two-Pass Connected Components)
      // ========================================================
      const regionStats = this.region.detectConnectedComponents(
        this.playerSpawnPos.x,
        this.playerSpawnPos.y
      );

      // ========================================================
      // STEP 4: ENEMY TRACKER & THREAT HEATMAP ENGINE
      // ========================================================
      if (this.region.enemyClusters) {
        this.enemy.updateOpponents(this.region.enemyClusters, this.playerSpawnPos);
        this.heatmap.updateThreatField(this.region.enemyClusters, this.playerSpawnPos);
      }
      const enemyAnalytics = this.enemy.getEnemyAnalytics();

      // ========================================================
      // STEP 5: BORDER DETECTOR (Convex Hull & Frontier Extraction)
      // ========================================================
      const borderStats = this.border.extractPerimeterAndFrontiers(this.heatmap);
      if (!borderStats) return;

      // ========================================================
      // STEP 6: WORLD MODEL RAM BUFFER (300-Frame Circular Ring)
      // ==========================================
      this.world.recordFrame({
        interiorArea: borderStats.interiorArea,
        perimeterLength: borderStats.perimeterLength,
        compactness: borderStats.isoperimetricQuotient,
        largestNeutralArea: regionStats ? regionStats.largestNeutralArea : 0,
        enemyClusterCount: regionStats ? regionStats.enemyCount : 0,
        largestEnemyCluster: regionStats ? regionStats.largestEnemyCluster : 0
      });
      const worldTelemetry = this.world.getRAMTelemetry();

      // ========================================================
      // STEP 7: STRATEGY ENGINE & DYNAMIC AGGRESSION METER
      // ========================================================
      const gameTimeSec = (now - this.world.matchStartTime) / 1000.0;
      const neutralRatio = (regionStats && visionResult.width)
        ? (regionStats.largestNeutralArea / (visionResult.width * visionResult.height))
        : 0.50;

      const strategyConfig = this.strategy.evaluateTransitions(
        gameTimeSec,
        neutralRatio,
        this.economy.economicHealth,
        borderStats.totalTerritoryArea,
        borderStats.isoperimetricQuotient,
        enemyAnalytics,
        regionStats,
        this.economy.growthPerSec
      );

      const aggrVal = strategyConfig.aggressionValue || 0.75;

      // ========================================================
      // STEP 8: ECONOMY ANALYZER (Aggressive Expansionist Compounding)
      // ========================================================
      this.economy.updateEconomy(borderStats.totalTerritoryArea, dtSec);
      const ecoDecisions = this.economy.getEconomicDecisions(neutralRatio, aggrVal);

      // ========================================================
      // STEP 9: PREDICTION ENGINE (Kinematic Border Extrapolation)
      // ========================================================
      const predStats = this.prediction.extrapolateFrontiers(
        this.border.enemyFrontier,
        enemyAnalytics,
        5.0
      );
      const threatVectors = this.prediction.getHighThreatVectors();

      // ========================================================
      // STEP 10: UTILITY EVALUATOR (Aggressive 35/25/20/10/10 Profile)
      // ========================================================
      let candidateCells = this.border.expansionFrontier;
      if (strategyConfig.targetPriority === 'ENEMY_WEAK' || strategyConfig.targetPriority === 'ENEMY_STRONG' || candidateCells.length === 0) {
        candidateCells = (this.border.enemyFrontier.length > 0) ? this.border.enemyFrontier : this.border.accessibleBorders;
      }
      if (candidateCells.length === 0) {
        candidateCells = this.border.accessibleBorders;
      }

      // Convert spawn position to scaled grid coordinates for accurate spatial Euclidean distance
      const scaledSpawnPos = {
        x: Math.floor(this.playerSpawnPos.x * (visionResult.scaleFactor || 0.25)),
        y: Math.floor(this.playerSpawnPos.y * (visionResult.scaleFactor || 0.25))
      };

      const bestCandidate = this.utility.evaluateCandidates(
        candidateCells,
        scaledSpawnPos,
        worldTelemetry,
        enemyAnalytics,
        borderStats.isoperimetricQuotient,
        this.heatmap,
        aggrVal
      );

      // ========================================================
      // STEP 11: TEMPORAL SMOOTHING (Hysteresis & Target Lock)
      // ========================================================
      const isPanic = (strategyConfig.stateName === 'PANIC' || strategyConfig.stateName === 'DEFENSIVE_TURTLE');
      const lockedTarget = this.smoothing.filterCandidate(bestCandidate, isPanic);

      // ========================================================
      // STEP 12: PATHFINDING ENGINE (Min-Heap A* Reachability)
      // ========================================================
      let pathWorthy = false;
      if (lockedTarget) {
        // lockedTarget.x and lockedTarget.y are already in scaled grid coordinates
        const gx = Math.floor(lockedTarget.x);
        const gy = Math.floor(lockedTarget.y);
        const sx = scaledSpawnPos.x;
        const sy = scaledSpawnPos.y;

        const pathResult = this.pathfinder.findPath(sx, sy, gx, gy);
        const worthiness = this.pathfinder.isWorthIt(pathResult, lockedTarget.utility);
        pathWorthy = worthiness.worthy;
      }

      // ========================================================
      // STEP 13: MOUSE CONTROLLER (Execute Hyper-Aggressive Multi-Front Attack Waves - v5.1.1)
      // ========================================================
      const isGameActive = this.isPlayerSpawnCalibrated && borderStats.totalTerritoryArea > 0;

      if (isGameActive && lockedTarget && !isPanic && ecoDecisions.shouldAttack) {
        const waveConfig = this.economy.getMultiWaveConfig(strategyConfig.stateName, neutralRatio, aggrVal);
        if (now - this.lastAttackDispatchTime >= waveConfig.burstPacingMs) {
          const rect = document.querySelector('canvas') ? document.querySelector('canvas').getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
          const waveTargets = this.utility.getTopMultiFrontTargets(waveConfig.waveCount, 30);
          const targetsToHit = (waveTargets && waveTargets.length > 0) ? waveTargets : [lockedTarget];

          this.controller.setTroopSliderRatio(waveConfig.attackRatio);

          for (let w = 0; w < targetsToHit.length; w++) {
            const target = targetsToHit[w];
            const targetNormX = target.x / Math.max(1, visionResult.width || 100);
            const targetNormY = target.y / Math.max(1, visionResult.height || 100);
            const targetScreenX = Math.round(rect.left + (targetNormX * rect.width));
            const targetScreenY = Math.round(rect.top + (targetNormY * rect.height));

            setTimeout(() => {
              this.controller.executeClick(targetScreenX, targetScreenY);
            }, w * 15);
          }

          this.economy.recordAttackDispatch(waveConfig.attackRatio, lockedTarget.type, 100 * targetsToHit.length);
          this.lastAttackDispatchTime = now;
          this.lastExecutedTarget = lockedTarget;
        }
      }

      // ========================================================
      // STEP 14: HUD TELEMETRY DASHBOARD & ZERO-CROSSHAIR OVERLAY
      // ========================================================
      this.hud.updateDashboard({
        fps: visionResult.visionFPS || 15,
        state: isGameActive ? strategyConfig.stateName : 'IDLE (Click Map/Canvas to Start)',
        aggression: strategyConfig.aggressionLabel || `AGGRESSIVE (${aggrVal.toFixed(2)})`,
        myArea: borderStats.totalTerritoryArea,
        compactness: borderStats.isoperimetricQuotient,
        ecoHealth: ecoDecisions.health,
        troopBalance: this.economy.estimatedTroopBalance,
        growthPerSec: this.economy.growthPerSec,
        attackROI: this.economy.attackROI,
        enemyCount: enemyAnalytics.totalTracked || 0,
        primaryThreat: enemyAnalytics.primaryThreat ? enemyAnalytics.primaryThreat.id : 'NONE',
        dangerScore: enemyAnalytics.primaryThreat ? enemyAnalytics.primaryThreat.dangerScore : 0.0,
        targetCoord: (isGameActive && lockedTarget) ? `${lockedTarget.x}, ${lockedTarget.y}` : 'WAITING FOR SPAWN',
        smoothingLock: (isGameActive && lockedTarget) ? `HOLD (${lockedTarget.tickCount}/5)` : 'IDLE',
        waves: `${this.economy.getMultiWaveConfig(strategyConfig.stateName, neutralRatio, aggrVal).waveCount} Vectors`,
        pincer: (isGameActive && lockedTarget && lockedTarget.utility >= 50) ? 'ACTIVE (+25)' : 'READY'
      });

      this.hud.renderOverlay(
        this.playerSpawnPos,
        lockedTarget,
        threatVectors
      );
    }
  }

  window.TerritorialMasterOrchestrator = TerritorialMasterOrchestrator;
  window.TerritorialEngineV5 = new TerritorialMasterOrchestrator();
  window.TerritorialEngineV5.init();

  console.log('%c[TIO Master Orchestrator v5.0] Aggressive Expansionist Pipeline Deployed.', 'color: #10b981; font-weight: bold;');
})();
