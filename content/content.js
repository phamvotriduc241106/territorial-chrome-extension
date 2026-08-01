/**
 * Territorial.io Master Orchestrator v9.0.0 — SOURCE-FAITHFUL INTERNAL
 *
 * - MAIN-world brain ports dump dF/dJ/cE/dU (expand-empty → crush-weak)
 * - Hard bot tables for commit ratio + multi-front burst (ki=4)
 * - Arms only after YOU click spawn on the map
 * - Zero canvas mouse when internal ready
 */
(function () {
  'use strict';

  if (window.__TIO_MASTER_ORCHESTRATOR_V5_LOADED__) return;
  window.__TIO_MASTER_ORCHESTRATOR_V5_LOADED__ = true;

  const AGENT_VERSION = '9.9.9';
  console.log(`%c[TIO v${AGENT_VERSION}] adjacent-only land + ship islands`, 'color: #f59e0b; font-weight: bold; font-size: 16px;');

  const DEFAULT_SETTINGS = {
    botEnabled: true,
    autoExpand: true,
    autoAttack: true,
    clickSpeed: 18,
    sliderPercentage: 0, // 0 = fully adaptive (C/V/B still override)
    humanJitter: true,
    hotkeysEnabled: true,
    strategy: 'aggressive'
  };

  class TerritorialMasterOrchestrator {
    constructor() {
      this.coords = new window.CoordSystem();
      this.vision = new window.VisionEngine();
      this.grid = new window.OccupancyGrid();
      this.region = new window.RegionDetector(this.grid);
      this.border = new window.BorderDetector(this.grid);
      this.neutral = window.NeutralLandEngine
        ? new window.NeutralLandEngine()
        : null;
      this.world = new window.WorldModel();
      this.enemy = new window.EnemyTracker();
      this.economy = new window.EconomyAnalyzer();
      this.heatmap = new window.HeatmapEngine(120, 120);
      this.strategy = new window.StrategyEngine();
      this.utility = new window.UtilityEvaluator();
      this.prediction = new window.PredictionEngine();
      this.smoothing = new window.TemporalSmoothing(400, 0.05);
      this.pathfinder = new window.PathfindingEngine(this.grid);
      this.hud = window.__TIO_HUD_EARLY__ || new window.HUDEngine();
      this.controller = new window.MouseController();
      this.internal = window.__TIO_internal || (window.InternalActuator ? new window.InternalActuator() : null);
      this.scheduler = window.AdaptiveScheduler
        ? new window.AdaptiveScheduler(16)
        : { shouldRunFrame: () => true };
      // Prefer INTERNAL, but NEVER sit idle if hook missing — click-expand like VH bots
      this.useInternalOnly = false;
      this.internalRefreshAt = 0;
      this.internalFailStreak = 0;
      this.smoothedCommit = 0.34;
      this.lastCommitMeta = null;

      this.isActive = false;
      this.loopId = null;
      this.frameCount = 0;
      this.lastTickTime = performance.now();
      this.lastAttackDispatchTime = 0;

      this.playerSpawnScreen = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      this.playerSpawnGrid = { x: 0, y: 0 };
      this.isPlayerSpawnCalibrated = false;
      this.matchArmed = false; // true only after YOU pick a spawn location AND territory appears
      this.pendingSpawn = null; // {x,y,t} after map click — not armed until territory confirms
      this.noTerritoryFrames = 0;
      this.myCentroid = { x: 0, y: 0 };
      this.settings = { ...DEFAULT_SETTINGS };
      this.blackFrameStreak = 0;
      this.agentVersion = AGENT_VERSION;
      this.failReason = '';
      this.sprayAngle = 0;
      this.engineStarted = false; // full vision/AI only after arm
      this.idleHudAt = 0;
    }

    computeMyCentroid(typeMatrix, w, h) {
      if (!typeMatrix || !w || !h) return this.playerSpawnGrid;
      let sumX = 0, sumY = 0, n = 0;
      const step = Math.max(1, Math.floor(Math.sqrt(w * h) / 100));
      for (let y = 0; y < h; y += step) {
        for (let x = 0; x < w; x += step) {
          if (typeMatrix[y * w + x] === 3) {
            sumX += x;
            sumY += y;
            n++;
          }
        }
      }
      if (n < 1) return this.playerSpawnGrid;
      return { x: Math.round(sumX / n), y: Math.round(sumY / n) };
    }

    countMine(typeMatrix, w, h) {
      if (!typeMatrix) return 0;
      let n = 0;
      const step = Math.max(1, Math.floor((w * h) / 8000));
      for (let i = 0; i < typeMatrix.length; i += step) {
        if (typeMatrix[i] === 3) n++;
      }
      return n * step;
    }

    /** Find any MINE border cell by scanning type matrix (fallback if border empty). */
    scanMineBorders(typeMatrix, w, h, maxFind) {
      const out = [];
      if (!typeMatrix || !w || !h) return out;
      const step = Math.max(1, Math.floor(Math.min(w, h) / 80));
      for (let y = 1; y < h - 1 && out.length < maxFind; y += step) {
        for (let x = 1; x < w - 1 && out.length < maxFind; x += step) {
          if (typeMatrix[y * w + x] !== 3) continue;
          let touchesN = false, touchesE = false, touchesW = false;
          const nbs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
          for (let k = 0; k < 4; k++) {
            const t = typeMatrix[(y + nbs[k][1]) * w + (x + nbs[k][0])];
            if (t === 2) touchesN = true;
            if (t === 4) touchesE = true;
            if (t === 1) touchesW = true;
          }
          if (touchesN || touchesE) {
            out.push({
              x, y,
              touchesNeutral: touchesN,
              touchesEnemy: touchesE,
              touchesWater: touchesW,
              type: touchesE && !touchesN ? 'ENEMY' : 'NEUTRAL'
            });
          }
        }
      }
      return out;
    }

    /**
     * Land attacks only work on cells adjacent to our territory.
     * type: 2=neutral 3=mine 4=enemy 1=water
     */
    isLandAttackCell(typeMatrix, w, h, x, y) {
      if (!typeMatrix || x < 1 || y < 1 || x >= w - 1 || y >= h - 1) return false;
      const t = typeMatrix[y * w + x];
      if (t !== 2 && t !== 4) return false; // only neutral or enemy
      const nbs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (let k = 0; k < 4; k++) {
        if (typeMatrix[(y + nbs[k][1]) * w + (x + nbs[k][0])] === 3) return true;
      }
      return false;
    }

    /** Spray fallback: click outward from centroid into non-mine */
    sprayTargets(typeMatrix, w, h, centroid, count) {
      const targets = [];
      if (!typeMatrix || !w || !h) return targets;
      const cx = centroid.x || (w / 2);
      const cy = centroid.y || (h / 2);
      for (let i = 0; i < count; i++) {
        const ang = this.sprayAngle + (i * (Math.PI * 2 / Math.max(3, count)));
        // Walk out until non-mine or edge
        for (let r = 3; r < Math.min(w, h) / 2; r += 2) {
          const x = Math.round(cx + Math.cos(ang) * r);
          const y = Math.round(cy + Math.sin(ang) * r);
          if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) break;
          const t = typeMatrix[y * w + x];
          if (t === 2 || t === 4) {
            targets.push({ x, y, type: t === 4 ? 'ENEMY' : 'NEUTRAL', touchesNeutral: t === 2, touchesEnemy: t === 4 });
            break;
          }
          if (t === 1) break; // water wall
        }
      }
      this.sprayAngle += 0.7;
      return targets;
    }

    init() {
      this.loadSettings();
      this.bindSettingsListeners();
      this.bindHotkeys();

      const attachInterval = setInterval(() => {
        const canvas = document.querySelector('canvas');
        if (canvas) {
          clearInterval(attachInterval);
          // Do NOT touch canvas getContext / vision yet — game must boot first
          this.controller.attach(canvas);
          this.controller.setCoordSystem(this.coords);
          this.setupSpawnCalibration(canvas);
          if (window.__TIO_HUD_EARLY__) this.hud = window.__TIO_HUD_EARLY__;
          this.hud.init();
          this.hud.setVersion(AGENT_VERSION);
          this.controller.setPacing(55); // VH multi-front needs fast synthetic clicks
          this.startIdleLoop();
          console.log(
            `%c[TIO v${AGENT_VERSION}] STAND BY — Play, then click spawn. VH expand engine arms after territory confirms.`,
            'color: #f59e0b; font-weight: bold;'
          );
        }
      }, 250);
    }

    loadSettings() {
      try {
        if (!chrome || !chrome.storage || !chrome.storage.local) return;
        chrome.storage.local.get(DEFAULT_SETTINGS, (data) => {
          this.settings = { ...DEFAULT_SETTINGS, ...data };
          // Force aggressive defaults if somehow off
          if (this.settings.botEnabled === undefined) this.settings.botEnabled = true;
          this.controller.setPacing(Math.round(1000 / Math.max(8, this.settings.clickSpeed || 14)));
        });
      } catch (e) { /* ignore */ }
    }

    bindSettingsListeners() {
      try {
        if (chrome && chrome.storage && chrome.storage.onChanged) {
          chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local') return;
            for (const key of Object.keys(changes)) {
              if (key in this.settings) this.settings[key] = changes[key].newValue;
            }
            this.controller.setPacing(Math.round(1000 / Math.max(8, this.settings.clickSpeed || 14)));
          });
        }
        if (chrome && chrome.runtime && chrome.runtime.onMessage) {
          chrome.runtime.onMessage.addListener((msg) => {
            if (msg && msg.action === 'STATE_CHANGED' && msg.settings) {
              this.settings = { ...this.settings, ...msg.settings };
            }
          });
        }
      } catch (e) { /* ignore */ }
    }

    bindHotkeys() {
      window.addEventListener('keydown', (e) => {
        if (!this.settings.hotkeysEnabled) return;
        const tag = (e.target && e.target.tagName) || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        if (e.key === 'z' || e.key === 'Z') {
          this.settings.botEnabled = !this.settings.botEnabled;
          try { chrome.storage.local.set({ botEnabled: this.settings.botEnabled }); } catch (_) {}
          if (!this.settings.botEnabled) this.controller.clearQueue();
          console.log('[TIO] Bot', this.settings.botEnabled ? 'ON' : 'OFF');
        }
        // Manual troop overrides (0 / unset = full auto-adaptive)
        if (e.key === 'c' || e.key === 'C') this.settings.sliderPercentage = 25;
        if (e.key === 'v' || e.key === 'V') this.settings.sliderPercentage = 50;
        if (e.key === 'b' || e.key === 'B') this.settings.sliderPercentage = 0; // back to adaptive
      }, true);
    }

    setupSpawnCalibration(canvas) {
      // Two-step arm (does NOT start engine on menu "Play"):
      // 1) Trusted click in safe map zone → pendingSpawn only
      // 2) Vision confirms YOUR territory near that click → matchArmed + engine start
      const spawnHandler = (e) => {
        if (this.matchArmed) return; // already running
        if (window.__TIO_IS_BOT_EVENT__ && window.__TIO_IS_BOT_EVENT__(e)) return;
        if (typeof e.isTrusted === 'boolean' && e.isTrusted === false) return;
        if (e.pointerId === 99) return;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        if (clientX == null || clientY == null) return;

        this.coords.update(null, canvas);
        // Reject UI chrome — bottom buttons / top bar
        if (!this.coords.isSafeScreenPoint(clientX, clientY)) {
          return;
        }

        // Record pending spawn only — engine still OFF until territory appears
        this.pendingSpawn = { x: clientX, y: clientY, t: performance.now() };
        this.playerSpawnScreen = { x: clientX, y: clientY };
        console.log(
          `%c[TIO v${AGENT_VERSION}] Map click @ (${clientX | 0},${clientY | 0}) — waiting for your territory to confirm spawn…`,
          'color: #fbbf24; font-weight: bold;'
        );
      };
      ['pointerdown', 'mousedown', 'touchstart'].forEach((evt) => {
        canvas.addEventListener(evt, spawnHandler, { capture: true, passive: true });
      });
    }

    /** Confirm pending spawn only when mine pixels appear (not menu Play). */
    tryConfirmSpawnFromVision(visionResult) {
      if (this.matchArmed || !this.pendingSpawn || !visionResult) return false;
      const age = performance.now() - this.pendingSpawn.t;
      if (age > 10000) {
        // Menu click / no spawn — clear
        this.pendingSpawn = null;
        return false;
      }
      // Need time after click for the match to place you on the map
      if (age < 400) return false;

      // 1) Calibrate player color AT the click first (otherwise mineCount is wrong)
      try {
        this.vision.sampleAndCalibratePlayerColor(this.pendingSpawn.x, this.pendingSpawn.y);
      } catch (_) { /* ignore */ }

      // 2) Re-scan with calibrated color
      const vr = this.vision.processFrame() || visionResult;
      const hist = vr.histogram || {};
      const mine = hist.mineCount || 0;
      const water = hist.waterCount || 0;
      const neutral = hist.neutralCount || 0;
      const total = Math.max(1, (vr.width || 1) * (vr.height || 1));
      const mapish = (water + neutral) / total;

      // Real map has oceans/neutral fill; pure menus usually don't
      if (mapish < 0.08) return false;
      // Need a real spawn blob, not a 1px UI tint match
      if (mine < 20) return false;

      this.playerSpawnScreen = { x: this.pendingSpawn.x, y: this.pendingSpawn.y };
      this.isPlayerSpawnCalibrated = true;
      this.matchArmed = true;
      this.noTerritoryFrames = 0;
      this.pendingSpawn = null;
      this.world.resetMatchTime();
      this.smoothing.reset();
      if (this.economy.resetMatch) this.economy.resetMatch();
      this.smoothedCommit = 0.28; // start efficient, not 79%
      this.engineStarted = true;
      console.log(
        `%c[TIO v${AGENT_VERSION}] Spawn confirmed (mine=${mine}) — engine ON.`,
        'color: #34d399; font-weight: bold;'
      );
      return true;
    }

    disarmMatch(reason) {
      if (!this.matchArmed && !this.isPlayerSpawnCalibrated && !this.pendingSpawn) return;
      this.matchArmed = false;
      this.isPlayerSpawnCalibrated = false;
      this.pendingSpawn = null;
      this.engineStarted = false;
      this.controller.clearQueue();
      console.log(`[TIO] Match disarmed (${reason || 'reset'}) — engine idle`);
    }

    /** Lightweight loop: no vision until pending spawn or armed. */
    startIdleLoop() {
      if (this.isActive) return;
      this.isActive = true;
      this.lastTickTime = performance.now();
      this.loop();
    }

    loop() {
      if (!this.isActive) return;
      const now = performance.now();
      const dtSec = (now - this.lastTickTime) / 1000.0;
      try {
        if (!this.matchArmed && !this.pendingSpawn) {
          // Pure standby — do not read canvas / run vision / attack
          this.runStandbyHud(now);
        } else if (!this.matchArmed && this.pendingSpawn) {
          // Only after a map click: light vision to confirm territory
          this.runPendingSpawnCheck(now);
        } else if (this.scheduler.shouldRunFrame(now)) {
          this.executePipeline(now, dtSec);
          this.lastTickTime = now;
        }
      } catch (err) {
        console.warn('[TIO] loop', err);
        this.failReason = String(err && err.message || err);
      }
      this.loopId = requestAnimationFrame(() => this.loop());
    }

    runStandbyHud(now) {
      if (now - this.idleHudAt < 500) return;
      this.idleHudAt = now;
      this.controller.clearQueue();
      const patch = document.documentElement.getAttribute('data-tio-patch') || '—';
      this.hud.updateDashboard({
        version: AGENT_VERSION,
        fps: 0,
        state: 'STANDBY · menu',
        aggression: 'OFF',
        myArea: 0,
        compactness: 0,
        ecoHealth: 'idle',
        troopBalance: 0,
        growthPerSec: 0,
        attackROI: 0,
        enemyCount: 0,
        primaryThreat: '-',
        dangerScore: 0,
        targetCoord: '-',
        smoothingLock: 'engine-off',
        waves: '—',
        pincer: 'STANDBY',
        hint: `Engine OFF. 1) Press Play  2) Click your spawn ON THE MAP. Hook:${patch}`
      });
    }

    runPendingSpawnCheck(now) {
      // Throttle vision while waiting for confirm
      if (now - this.lastTickTime < 200) return;
      this.lastTickTime = now;
      this.controller.clearQueue();

      const visionResult = this.vision.processFrame();
      if (visionResult && visionResult.typeMatrix) {
        if (this.tryConfirmSpawnFromVision(visionResult)) {
          return; // next frames run full pipeline
        }
      }

      const waitSec = this.pendingSpawn
        ? ((now - this.pendingSpawn.t) / 1000).toFixed(1)
        : '0';
      this.hud.updateDashboard({
        version: AGENT_VERSION,
        fps: visionResult && visionResult.visionFPS || 0,
        state: 'CONFIRMING SPAWN…',
        aggression: 'OFF',
        myArea: 0,
        compactness: 0,
        ecoHealth: 'pending',
        troopBalance: 0,
        growthPerSec: 0,
        attackROI: 0,
        enemyCount: 0,
        primaryThreat: '-',
        dangerScore: 0,
        targetCoord: this.pendingSpawn
          ? `${this.pendingSpawn.x | 0},${this.pendingSpawn.y | 0}`
          : '—',
        smoothingLock: `wait-territory ${waitSec}s`,
        waves: '—',
        pincer: 'PENDING',
        hint: 'Map click noted. Waiting for your territory to appear (Play→spawn). Menu clicks auto-clear.'
      });
    }

    executePipeline(now, dtSec) {
      this.frameCount++;
      this.failReason = '';
      const canvas = document.querySelector('canvas');

      // Hard gate: never attack / heavy AI without arm
      if (!this.matchArmed || !this.isPlayerSpawnCalibrated) {
        this.controller.clearQueue();
        return;
      }

      const visionResult = this.vision.processFrame();
      if (!visionResult || !visionResult.typeMatrix) {
        this.failReason = 'no-vision';
        this.hud.updateDashboard({
          version: AGENT_VERSION,
          fps: 0,
          state: 'NO VISION',
          aggression: 'OFF',
          myArea: 0,
          compactness: 0,
          ecoHealth: '-',
          troopBalance: 0,
          growthPerSec: 0,
          attackROI: 0,
          enemyCount: 0,
          primaryThreat: '-',
          dangerScore: 0,
          targetCoord: '-',
          smoothingLock: this.failReason,
          waves: '0',
          pincer: 'WAIT',
          hint: 'Waiting for canvas pixels…'
        });
        return;
      }

      const visionHist = visionResult.histogram || {};
      const totalPx = Math.max(1, visionResult.width * visionResult.height);
      const known = (visionHist.waterCount || 0) + (visionHist.neutralCount || 0) +
        (visionHist.mineCount || 0) + (visionHist.enemyCount || 0);
      if (known / totalPx < 0.01) {
        this.blackFrameStreak++;
        this.failReason = 'black-frame';
        if (this.blackFrameStreak > 5) {
          this.hud.updateDashboard({
            version: AGENT_VERSION,
            fps: visionResult.visionFPS || 0,
            state: 'VISION BLACK',
            aggression: 'OFF',
            myArea: 0, compactness: 0, ecoHealth: '-', troopBalance: 0,
            growthPerSec: 0, attackROI: 0, enemyCount: 0, primaryThreat: '-',
            dangerScore: 0, targetCoord: '-', smoothingLock: 'black', waves: '0',
            pincer: 'FAIL', hint: 'Canvas read empty — try resize window / another browser tab focus.'
          });
        }
        return;
      }
      this.blackFrameStreak = 0;

      this.coords.update(visionResult, canvas);
      this.controller.setCoordSystem(this.coords);

      // Continuous color lock only after YOU armed the match
      if (this.matchArmed && this.isPlayerSpawnCalibrated && this.frameCount % 45 === 0) {
        this.vision.sampleAndCalibratePlayerColor(this.playerSpawnScreen.x, this.playerSpawnScreen.y);
      }

      this.playerSpawnGrid = this.coords.screenToGrid(this.playerSpawnScreen.x, this.playerSpawnScreen.y);
      this.grid.updateFromVision(visionResult);
      this.region.setGrid(this.grid);
      this.border.setGrid(this.grid);
      this.pathfinder.setGrid(this.grid);

      const regionStats = this.region.detectConnectedComponents(
        this.playerSpawnGrid.x,
        this.playerSpawnGrid.y
      );

      if (this.region.enemyClusters) {
        this.enemy.updateOpponents(this.region.enemyClusters, this.playerSpawnGrid);
        this.heatmap.updateThreatField(
          this.region.enemyClusters,
          this.playerSpawnGrid,
          visionResult.width,
          visionResult.height
        );
      }
      const enemyAnalytics = this.enemy.getEnemyAnalytics();
      const borderStats = this.border.extractPerimeterAndFrontiers(this.heatmap);
      if (!borderStats) {
        this.failReason = 'no-border';
        return;
      }

      this.myCentroid = this.computeMyCentroid(visionResult.typeMatrix, visionResult.width, visionResult.height);
      if (this.utility.setMyCentroid) this.utility.setMyCentroid(this.myCentroid.x, this.myCentroid.y);

      const gameTimeSec = (now - this.world.matchStartTime) / 1000.0;

      // ---- UNCAPTURED LAND AWARENESS ----
      const landSnap = this.neutral
        ? this.neutral.analyze(
          visionResult.typeMatrix,
          visionResult.width,
          visionResult.height,
          this.myCentroid,
          gameTimeSec
        )
        : null;

      // NO auto-start. Territory only matters after you chose spawn.
      const mineEst = this.countMine(visionResult.typeMatrix, visionResult.width, visionResult.height);
      const histMine = visionHist.mineCount || 0;
      const hasTerritory = borderStats.totalTerritoryArea > 0 || mineEst > 20 || histMine > 30;

      if (!hasTerritory) {
        this.noTerritoryFrames++;
        // After match ends / back to menu, disarm so we don't click lobby buttons
        if (this.noTerritoryFrames > 90) {
          this.disarmMatch('no-territory');
          return;
        }
      } else {
        this.noTerritoryFrames = 0;
      }

      const mapArea = Math.max(1, visionResult.width * visionResult.height);
      // Prefer neutral-engine free ratio (more accurate than largest-region only)
      const freeLandRatio = landSnap
        ? Math.max(landSnap.freeLandRatio, (visionHist.neutralCount || 0) / mapArea * 0.9)
        : Math.max(
          regionStats ? regionStats.largestNeutralArea / mapArea : 0,
          (visionHist.neutralCount || 0) / mapArea
        );
      const settingsRatio = (this.settings.sliderPercentage > 0)
        ? Math.max(0.15, Math.min(0.7, this.settings.sliderPercentage / 100))
        : 0; // 0 → fully adaptive
      const landPhase = (landSnap && landSnap.phase) || 'OPENING';
      const landPolicy = this.neutral
        ? this.neutral.getPhasePolicy()
        : { preferNeutral: true, wantEnemy: false, multiFront: 4, pulseMs: 90, ratio: 0.25, label: 'OPEN' };

      // Hard bot tables — adaptive commit computed after we know wantEnemy / phase
      const hm = (window.TIOHardMode && window.TIOHardMode.active) || null;

      const avgEnemy = (() => {
        const list = enemyAnalytics.opponentsList || [];
        if (!list.length) return 0;
        let s = 0;
        for (let i = 0; i < list.length; i++) s += list[i].area;
        return s / list.length;
      })();

      this.economy.updateEconomy(borderStats.totalTerritoryArea, dtSec, avgEnemy);
      // Prefer real balance from game hook when available (better density/commit)
      if (this.internal && this.internal.lastState && this.internal.lastState.balance > 0) {
        this.economy.estimatedTroopBalance = this.internal.lastState.balance;
        if (this.internal.lastState.density != null) {
          this.economy.density = this.internal.lastState.density;
        } else if (this.internal.lastState.territory > 0) {
          const cap = Math.min(100 * this.internal.lastState.territory, 80000);
          this.economy.density = this.internal.lastState.balance / Math.max(1, cap);
        }
      }
      const strategyConfig = this.strategy.evaluateTransitions(
        gameTimeSec,
        freeLandRatio,
        this.economy.economicHealth,
        borderStats.totalTerritoryArea,
        borderStats.isoperimetricQuotient,
        enemyAnalytics,
        regionStats || {},
        this.economy.growthPerSec
      );
      const aggrVal = 1.0;
      const ecoDecisions = this.economy.getEconomicDecisions(
        freeLandRatio, aggrVal, settingsRatio, gameTimeSec,
        borderStats.totalTerritoryArea, enemyAnalytics
      );

      // ---- VH dD policy: empty first, else 90% weakest ----
      let wantEnemy = false;
      let brainPhase = landPhase === 'OPENING' ? 'OPENING' : 'LAND_RUSH';
      if (hm && window.TIOHardMode.decideTargetPolicy) {
        const pol = window.TIOHardMode.decideTargetPolicy(
          hm,
          freeLandRatio,
          this.economy.relativePower || 1,
          this.economy.areaTrend || 0
        );
        wantEnemy = !pol.preferNeutral;
        brainPhase = pol.phase || brainPhase;
      } else {
        // Fallback mirrors dump dD
        if (this.economy.areaTrend < -12 || this.economy.consecutiveShrinkFrames > 4) {
          wantEnemy = true;
          brainPhase = 'SURVIVE';
        } else if (freeLandRatio > 0.025) {
          wantEnemy = false;
          brainPhase = freeLandRatio > 0.1 ? 'OPENING' : 'LAND_RUSH';
        } else {
          wantEnemy = true;
          brainPhase = 'PRESSURE';
        }
      }
      // Over-dense → expand (interest soft-cap)
      if (this.economy.density > 0.85 && freeLandRatio > 0.015) {
        wantEnemy = false;
        brainPhase = 'LAND_RUSH';
      }

      // Filter: only cells that map into safe playable screen (no UI)
      const safeFilter = (cells) => {
        if (!cells || !cells.length) return [];
        return cells.filter((c) => {
          const gx = c.targetX != null ? c.targetX : c.x;
          const gy = c.targetY != null ? c.targetY : c.y;
          return this.coords.isSafeGridCell(gx, gy);
        });
      };

      // Primary candidates = reachable uncaptured cells (click on free land)
      let candidateCells = [];
      if (landSnap && landSnap.topTargets && landSnap.topTargets.length) {
        candidateCells = landSnap.topTargets.map((t) => ({
          x: t.x,
          y: t.y,
          type: 'NEUTRAL',
          touchesNeutral: true,
          touchesEnemy: !!t.touchesEnemy,
          score: t.score
        }));
      }
      if (this.border.expansionFrontier && this.border.expansionFrontier.length) {
        const mapped = this.border.expansionFrontier.map((c) => ({
          x: (c.targetX != null ? c.targetX : c.x),
          y: (c.targetY != null ? c.targetY : c.y),
          type: 'NEUTRAL',
          touchesNeutral: true,
          touchesEnemy: !!c.touchesEnemy,
          fromBorder: true
        }));
        candidateCells = candidateCells.concat(mapped);
      }
      if (wantEnemy && this.border.enemyFrontier && this.border.enemyFrontier.length) {
        candidateCells = candidateCells.concat(this.border.enemyFrontier);
      }
      if (!candidateCells.length) {
        candidateCells = this.scanMineBorders(
          visionResult.typeMatrix, visionResult.width, visionResult.height, 50
        );
      }
      candidateCells = safeFilter(candidateCells);

      const bestCandidate = candidateCells.length
        ? this.utility.evaluateCandidates(
          candidateCells,
          this.myCentroid.x ? this.myCentroid : this.playerSpawnGrid,
          this.world.getRAMTelemetry ? this.world.getRAMTelemetry() : {},
          enemyAnalytics,
          borderStats.isoperimetricQuotient,
          this.heatmap,
          1.0,
          {
            phase: landPhase === 'LATE' ? 'PRESSURE' : 'LAND_RUSH',
            preferNeutral: !wantEnemy,
            typeMatrix: visionResult.typeMatrix,
            width: visionResult.width,
            height: visionResult.height
          }
        )
        : null;

      // Prefer highest-score neutral-engine target when expanding
      let lockedTarget = this.smoothing.filterCandidate(bestCandidate, false);
      if (!lockedTarget && bestCandidate) lockedTarget = bestCandidate;
      if (!lockedTarget && landSnap && landSnap.topTargets && landSnap.topTargets[0]) {
        lockedTarget = landSnap.topTargets[0];
      }

      let spray = [];
      if (!lockedTarget) {
        spray = this.sprayTargets(
          visionResult.typeMatrix, visionResult.width, visionResult.height,
          this.myCentroid, 4
        );
        if (spray.length) lockedTarget = spray[0];
      }

      let attackCell = lockedTarget
        ? (this.coords.resolveAttackCell(
          lockedTarget,
          visionResult.typeMatrix,
          wantEnemy || lockedTarget.type === 'ENEMY'
        ) || lockedTarget)
        : null;

      // If target is already a neutral cell adjacent to mine, click it directly
      if (lockedTarget && lockedTarget.type === 'NEUTRAL') {
        attackCell = { x: lockedTarget.x, y: lockedTarget.y, type: 'NEUTRAL' };
      }

      const userDriving = this.controller.userPointerDown === true;
      const botOn = this.settings.botEnabled !== false;
      // Must be armed by YOUR spawn click AND have territory
      const isGameActive = this.matchArmed && this.isPlayerSpawnCalibrated && hasTerritory;

      // VERY HARD pacing
      const pulseMs = hm
        ? Math.max(55, hm.pulseMs || 85)
        : Math.max(55, landPolicy.pulseMs || 85);

      // ---- ADAPTIVE TROOP % (situation-aware) ----
      const stEarly = (this.internal && this.internal.lastState) || {};
      const crushableEnemy = !!(stEarly.enemies && stEarly.enemies.some((e) => e.crushable));
      const realBal = stEarly.balance != null ? stEarly.balance : this.economy.estimatedTroopBalance;
      const realTerr = stEarly.territory != null && stEarly.territory > 0
        ? stEarly.territory
        : borderStats.totalTerritoryArea;
      // Prefer live density from game balance when available
      const liveDensity = stEarly.density != null
        ? stEarly.density
        : this.economy.density;

      // Fronts: each click spends FULL bar — keep 2–4 so we don't empty stack
      let waveCount = 3;
      if (liveDensity > 0.95 && freeLandRatio > 0.05) waveCount = 4;
      if (liveDensity < 0.45) waveCount = 2;
      if (wantEnemy && freeLandRatio < 0.03) waveCount = 2;

      let commitMeta = null;
      let commitRatio = 0.34;
      if (hm && window.TIOHardMode.computeAdaptiveCommit) {
        commitMeta = window.TIOHardMode.computeAdaptiveCommit({
          profile: hm,
          phase: brainPhase,
          freeLandRatio,
          density: liveDensity,
          relativePower: this.economy.relativePower || 1,
          areaTrend: this.economy.areaTrend || 0,
          gameTimeSec,
          balance: realBal,
          territory: realTerr,
          wantEnemy,
          crushable: crushableEnemy && wantEnemy,
          enemyBal: stEarly.enemies && stEarly.enemies[0] ? stEarly.enemies[0].bal : null,
          fronts: waveCount,
          shrinkFrames: this.economy.consecutiveShrinkFrames || 0,
          primaryDanger: enemyAnalytics.primaryThreat
            ? (enemyAnalytics.primaryThreat.dangerScore || 0)
            : 0
        });
        commitRatio = commitMeta.ratio;
      } else if (hm && window.TIOHardMode.computeCommit) {
        commitRatio = window.TIOHardMode.computeCommit(hm, brainPhase, freeLandRatio);
        commitMeta = { ratio: commitRatio, reason: 'legacy' };
      }

      // EMA smooth — avoid thrashing 20%↔50% every frame (still tracks situation)
      const alpha = 0.35;
      this.smoothedCommit = this.smoothedCommit * (1 - alpha) + commitRatio * alpha;
      commitRatio = this.smoothedCommit;

      // Manual slider only if user set C/V (25/50). B or 0 = full adaptive.
      const slider = this.settings.sliderPercentage | 0;
      if (slider > 0 && slider < 100) {
        // Soft blend toward user preference, still allow adaptive ±12%
        const userR = slider / 100;
        commitRatio = commitRatio * 0.55 + userR * 0.45;
        if (commitMeta) commitMeta.reason = (commitMeta.reason || '') + '+slider';
      }

      // Hard clamp — never send 70%+ (user saw stuck 79% death spiral)
      commitRatio = Math.max(0.12, Math.min(0.45, commitRatio));
      this.lastCommitMeta = commitMeta
        ? Object.assign({}, commitMeta, { ratio: commitRatio })
        : { ratio: commitRatio, reason: 'fallback' };

      // FORCE game troop bar BEFORE any attack (click path uses aS.hd() → was stuck ~79%)
      // Fire async; also set every attack burst
      if (!this._troopSetAt || now - this._troopSetAt > 200) {
        this._troopSetAt = now;
        try {
          if (this.internal && this.internal.setTroopRatio) {
            this.internal.setTroopRatio(commitRatio).then((r) => {
              this._lastTroopSet = r;
            }).catch(() => {});
          } else if (this.controller && this.controller.setTroopSliderRatio) {
            this.controller.setTroopSliderRatio(commitRatio);
          }
        } catch (_) { /* ignore */ }
      }

      let didAttack = false;
      let enqueued = 0;
      let blockWhy = '';

      if (!botOn) blockWhy = 'bot-off';
      else if (!this.matchArmed) blockWhy = 'await-spawn-click';
      else if (userDriving) blockWhy = 'user-hold';
      else if (!isGameActive) blockWhy = 'no-territory-yet';
      else if (now - this.lastAttackDispatchTime < pulseMs) blockWhy = 'pacing';

      // Refresh internal state occasionally
      if (this.internal && (now - this.internalRefreshAt > 800)) {
        this.internalRefreshAt = now;
        this.internal.refresh().then((st) => {
          if (st && st.balance != null && st.balance > 0 && this.economy) {
            this.economy.estimatedTroopBalance = st.balance;
          }
        }).catch(() => {});
      }

      const internalReady = !!(this.internal && this.internal.isReady && this.internal.isReady())
        && this.internalFailStreak < 4;
      let actMode = internalReady ? 'INTERNAL' : 'CLICK-VH';

      if (!blockWhy) {
        const preferNeutral = !wantEnemy;

        // ---- 1) Try INTERNAL (source dF/dJ/hg) ----
        let usedInternal = false;
        if (internalReady) {
          usedInternal = true;
          const runInternal = async () => {
            let okCount = 0;
            let lastPolicy = '';
            let lastPath = '';
            try {
              if (this.internal.attackBurst) {
                const burst = await this.internal.attackBurst({
                  ratio: commitRatio,
                  preferNeutral,
                  phase: brainPhase,
                  freeLand: freeLandRatio,
                  fronts: waveCount
                });
                if (burst && burst.ok) {
                  okCount = burst.okCount || 1;
                  const last = burst.last || (burst.results && burst.results[0]);
                  if (last) {
                    lastPolicy = last.policy || '';
                    lastPath = last.path || '';
                  }
                }
              } else {
                for (let b = 0; b < waveCount; b++) {
                  const r = await this.internal.attack({
                    ratio: commitRatio,
                    preferNeutral: preferNeutral || b === 0,
                    phase: brainPhase,
                    freeLand: freeLandRatio
                  });
                  if (r && r.ok) {
                    okCount++;
                    lastPolicy = r.policy || lastPolicy;
                    lastPath = r.path || lastPath;
                  } else break;
                }
              }
            } catch (_) { /* ignore */ }

            if (okCount > 0) {
              this.internalFailStreak = 0;
              this.economy.recordAttackDispatch(
                commitRatio,
                preferNeutral ? 'NEUTRAL' : 'ENEMY',
                80 * okCount
              );
              this.lastAttackDispatchTime = performance.now();
              this._lastInternalMode = `VH ${lastPath || 'hg'} ${lastPolicy || brainPhase}`;
              this._lastPolicy = lastPolicy;
              this._lastPath = lastPath;
            } else {
              this.internalFailStreak++;
              this._lastInternalMode = 'INT-FAIL→CLICK';
            }
            this._lastInternalOk = okCount;
          };
          runInternal().catch(() => {});
          // Do NOT set lastAttackDispatchTime until success — avoids fake pacing
          // Still try click same frame if we already know internal is flaky
          if (this.internalFailStreak === 0) {
            enqueued = waveCount;
            didAttack = true;
            actMode = 'INTERNAL';
            // optimistic only when streak clean; real timestamp set in async
            this.lastAttackDispatchTime = now;
          }
        }

        // ---- 2) CLICK FALLBACK — ONLY cells adjacent to our land ----
        if (!didAttack || this.internalFailStreak > 0) {
          const tm = visionResult.typeMatrix;
          const tw = visionResult.width;
          const th = visionResult.height;
          const adjOnly = (cells) => (cells || []).filter((c) => {
            const x = (c.targetX != null ? c.targetX : c.x) | 0;
            const y = (c.targetY != null ? c.targetY : c.y) | 0;
            return this.isLandAttackCell(tm, tw, th, x, y);
          });

          let fronts = [];
          // Free land next to us (reachable neutrals already touch mine)
          if (this.neutral && preferNeutral) {
            fronts = adjOnly(safeFilter(this.neutral.getMultiSectorTargets(waveCount) || []));
          }
          if (fronts.length < waveCount && this.border.expansionFrontier) {
            fronts = fronts.concat(adjOnly(safeFilter(this.border.expansionFrontier.slice(0, waveCount * 2).map((c) => ({
              x: c.targetX != null ? c.targetX : c.x,
              y: c.targetY != null ? c.targetY : c.y,
              type: 'NEUTRAL',
              touchesNeutral: true
            })))));
          }
          // Enemy frontier = already our border facing enemy (adjacent)
          if (wantEnemy && this.border.enemyFrontier) {
            fronts = fronts.concat(adjOnly(safeFilter(this.border.enemyFrontier.slice(0, 4))));
          }
          if (!fronts.length && lockedTarget) {
            fronts = adjOnly(safeFilter([lockedTarget]));
          }
          if (!fronts.length) {
            fronts = adjOnly(safeFilter(this.sprayTargets(tm, tw, th, this.myCentroid, waveCount * 2)));
          }
          // Extra scan: mine borders touching neutral/enemy
          if (!fronts.length) {
            fronts = adjOnly(this.scanMineBorders(tm, tw, th, 40).map((c) => ({
              x: c.x, y: c.y,
              type: c.touchesEnemy ? 'ENEMY' : 'NEUTRAL'
            })));
          }

          const seen = new Set();
          const unique = [];
          for (let i = 0; i < fronts.length && unique.length < waveCount; i++) {
            const f = fronts[i];
            const key = `${f.x | 0},${f.y | 0}`;
            if (seen.has(key)) continue;
            // Final adjacency gate
            if (!this.isLandAttackCell(tm, tw, th, f.x | 0, f.y | 0)) continue;
            seen.add(key);
            unique.push(f);
          }
          fronts = unique;

          for (let i = 0; i < fronts.length; i++) {
            const borderT = fronts[i];
            // Click the adjacent neutral/enemy cell itself (not deep inland)
            const cell = { x: borderT.x | 0, y: borderT.y | 0, type: borderT.type || 'NEUTRAL' };
            if (!this.coords.isSafeGridCell(cell.x, cell.y)) continue;
            if (!this.isLandAttackCell(tm, tw, th, cell.x, cell.y)) continue;
            const screen = this.coords.gridToScreen(cell.x, cell.y);
            if (this.controller.fireNow(screen.x, screen.y)) enqueued++;
          }
          if (enqueued > 0) {
            this.economy.recordAttackDispatch(commitRatio, wantEnemy ? 'ENEMY' : 'NEUTRAL', 70 * enqueued);
            this.lastAttackDispatchTime = now;
            didAttack = true;
            actMode = usedInternal ? 'HYBRID' : 'CLICK-ADJ';
            this._lastInternalMode = actMode + ` ×${enqueued}`;
            this._lastPolicy = preferNeutral ? 'land-expand' : 'land-adj-enemy';
          } else if (!didAttack) {
            // No land-adjacent target — try ship if internal available
            if (this.internal && this.internal.attackShip && wantEnemy) {
              this.internal.attackShip(commitRatio).then((r) => {
                if (r && r.ok) {
                  this._lastPolicy = r.policy || 'ship';
                  this._lastPath = 'pZ-ship';
                  this.lastAttackDispatchTime = performance.now();
                }
              }).catch(() => {});
              didAttack = true;
              actMode = 'SHIP?';
              this._lastInternalMode = 'try-ship';
            } else {
              blockWhy = 'no-adjacent-cell';
              actMode = 'STUCK';
            }
          }
        }
      }

      // Clear click queue only when pure internal success (hybrid needs queue)
      if (actMode === 'INTERNAL' && this.internalFailStreak === 0) {
        this.controller.clearQueue();
      }

      if (userDriving) {
        this.controller.clearQueue();
        // Do not restore pointer — avoids any mouse/screen interference
      }

      const freePct = (freeLandRatio * 100).toFixed(0);
      const reachN = landSnap ? landSnap.reachableCount : 0;
      const pockets = landSnap ? landSnap.pocketCount : 0;

      const intTel = this.internal && this.internal.getTelemetry
        ? this.internal.getTelemetry()
        : { mode: 'none' };
      const modeLabel = this._lastInternalMode || actMode || intTel.mode || '—';
      const policyTag = this._lastPolicy || intTel.lastPolicy || '';
      const pathTag = this._lastPath || intTel.lastPath || '';

      let stateLabel = 'IDLE';
      if (!botOn) stateLabel = 'BOT OFF (Z)';
      else if (!this.matchArmed) stateLabel = 'CLICK SPAWN ON MAP';
      else if (userDriving) stateLabel = 'USER HOLD';
      else if (!isGameActive) stateLabel = 'ARMED · wait territory';
      else if (didAttack) stateLabel = `${landPolicy.label} ${modeLabel}`;
      else stateLabel = `${landPolicy.label} · ${blockWhy || modeLabel}`;

      const st = intTel.lastState || {};
      const crushN = (st.enemies || []).filter((e) => e.crushable).length;
      this.hud.updateDashboard({
        version: AGENT_VERSION,
        fps: visionResult.visionFPS || 12,
        state: stateLabel,
        aggression: this.matchArmed ? `FREE ${freePct}%` : 'STANDBY',
        myArea: st.territory != null && st.territory > 0
          ? st.territory
          : borderStats.totalTerritoryArea,
        compactness: borderStats.isoperimetricQuotient,
        ecoHealth: this.matchArmed
          ? `${landPhase} · dens=${st.density != null ? st.density.toFixed(2) : '—'}`
          : 'await spawn',
        troopBalance: st.balance != null ? st.balance : Math.round(this.economy.estimatedTroopBalance),
        growthPerSec: this.economy.growthPerSec,
        attackROI: this.economy.attackROI,
        enemyCount: st.enemies ? st.enemies.length : (enemyAnalytics.totalTracked || 0),
        primaryThreat: enemyAnalytics.primaryThreat ? enemyAnalytics.primaryThreat.id : 'NONE',
        dangerScore: enemyAnalytics.primaryThreat ? enemyAnalytics.primaryThreat.dangerScore : 0,
        targetCoord: policyTag || (attackCell ? `${attackCell.x|0},${attackCell.y|0}` : '—'),
        smoothingLock: blockWhy
          ? `BLOCK:${blockWhy}`
          : (didAttack
            ? `${pathTag || 'int'} ${policyTag || 'ok'}`
            : `free=${freePct}% crush=${crushN}`),
        waves: `${waveCount}×${Math.round(commitRatio * 100)}% ${pathTag || modeLabel}`,
        pincer: this.matchArmed
          ? (actMode.indexOf('CLICK') >= 0 || actMode === 'HYBRID' ? 'VH-CLICK' : 'NO-MOUSE')
          : 'STANDBY',
        hint: !this.matchArmed
          ? 'STANDBY. Play → spawn on map. Adaptive troop% arms with engine.'
          : `TROOP ${Math.round(commitRatio * 100)}% force→game (${(this.lastCommitMeta && this.lastCommitMeta.reason) || '—'}) · dens=${liveDensity.toFixed(2)} · free ${freePct}% · ${actMode} · bar=${st.troopPct != null ? st.troopPct + '%' : '?'} · ×${waveCount}`
      });
    }
  }

  window.TerritorialMasterOrchestrator = TerritorialMasterOrchestrator;
  window.TerritorialEngineV5 = new TerritorialMasterOrchestrator();
  window.TerritorialEngineV5.init();
  window.__TIO_AGENT_VERSION__ = AGENT_VERSION;

  console.log(`%c[TIO v${AGENT_VERSION}] Internal single-player mode.`, 'color: #10b981; font-weight: bold;');
})();

