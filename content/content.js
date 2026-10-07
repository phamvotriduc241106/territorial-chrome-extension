/**
 * Territorial.io Orchestrator v10.3.1 — internal-first, vision fallback
 *
 * - MAIN-world brain ports dump dF/dJ/cE/dU (expand-empty → crush-weak)
   * - Exact source economics with one mutation in flight
 * - Arms only after YOU click spawn on the map
 * - Zero canvas mouse when internal ready
 */
(function () {
  'use strict';

  if (window.__TIO_MASTER_ORCHESTRATOR_V5_LOADED__) return;
  window.__TIO_MASTER_ORCHESTRATOR_V5_LOADED__ = true;

  // Strict Hardware Shield: Prohibit any camera or media capture
  try {
    if (typeof navigator !== 'undefined' && navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
      navigator.mediaDevices.getUserMedia = function () {
        return Promise.reject(new DOMException('Camera/media access is strictly prohibited by security policy.', 'NotAllowedError'));
      };
    }
  } catch (_) {}

  const CFG = window.TIOConfig;
  const CORE = window.TIOEngineCore || window.TIOHardMode;
  const AGENT_VERSION = CFG ? CFG.VERSION : '10.3.1';
  const DEFAULT_SETTINGS = CFG ? CFG.DEFAULT_SETTINGS : {
    botEnabled: true, autoExpand: true, autoAttack: true, clickSpeed: 4,
    sliderPercentage: 0, hotkeysEnabled: true, strategy: 'aggressive',
    allowVisionFallback: true, visionFps: 12, allowCameraAccess: false
  };
  console.log(`%c[TIO v${AGENT_VERSION}] internal-first deterministic engine (Zero Mouse/Camera Takeover Shield Active)`, 'color:#f59e0b;font-weight:bold');

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
      this.enemy = new window.EnemyTracker();
      this.economy = new window.EconomyAnalyzer();
      this.heatmap = new window.HeatmapEngine(120, 120);
      this.hud = window.__TIO_HUD_EARLY__ || new window.HUDEngine();
      this.controller = new window.MouseController();
      this.internal = window.__TIO_internal || (window.InternalActuator ? new window.InternalActuator() : null);
      this.scheduler = window.AdaptiveScheduler
        ? new window.AdaptiveScheduler(DEFAULT_SETTINGS.visionFps || 12)
        : { shouldRunFrame: () => true, measuredFps: 0 };
      this.internalRefreshAt = 0;
      this.internalPlanningGate = window.InternalPlanningGate ? new window.InternalPlanningGate(100) : null;
      this.internalFailStreak = 0;
      this.smoothedCommit = 0.34;
      this.lastCommitMeta = null;

      this.isActive = false;
      this.loopId = null;
      this.frameCount = 0;
      this.lastTickTime = performance.now();
      this.lastAttackDispatchTime = 0;
      this.matchStartTime = performance.now();
      this.lastInternalHudAt = 0;
      this.internalNotAliveSince = 0;
      this.internalArmPending = false;
      this.internalAttackCount = 0;
      this.lastSuccessfulGameTick = -1;
      this.lastStrategicTerritory = null;
      this.lastStrategicGameTick = -1;
      this.internalAreaTrend = 0;
      this.internalShrinkFrames = 0;

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

    /**
     * Fallback: foreign cells (neutral/enemy) that share an EDGE with mine.
     * Returns the FOREIGN cell coords (click targets), never deep inland.
     */
    scanMineBorders(typeMatrix, w, h, maxFind) {
      return window.TIOProfiler ? window.TIOProfiler.measureCall('border.scan', this.scanMineBordersImpl, this, arguments) : this.scanMineBordersImpl(typeMatrix, w, h, maxFind);
    }
    scanMineBordersImpl(typeMatrix, w, h, maxFind) {
      const out = [];
      if (!typeMatrix || !w || !h) return out;
      maxFind = maxFind || 40;
      const step = Math.max(1, Math.floor(Math.min(w, h) / 100));
      const nbs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      const seen = new Set();
      for (let y = 1; y < h - 1 && out.length < maxFind; y += step) {
        for (let x = 1; x < w - 1 && out.length < maxFind; x += step) {
          if (typeMatrix[y * w + x] !== 3) continue;
          for (let k = 0; k < 4; k++) {
            const fx = x + nbs[k][0];
            const fy = y + nbs[k][1];
            const t = typeMatrix[fy * w + fx];
            if (t !== 2 && t !== 4) continue;
            if (!this.isLandAttackCell(typeMatrix, w, h, fx, fy)) continue;
            const key = fx + ',' + fy;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push({
              x: fx,
              y: fy,
              targetX: fx,
              targetY: fy,
              mineX: x,
              mineY: y,
              dx: nbs[k][0],
              dy: nbs[k][1],
              touchesNeutral: t === 2,
              touchesEnemy: t === 4,
              type: t === 4 ? 'ENEMY' : 'NEUTRAL',
              perimeterOnly: true
            });
          }
        }
      }
      return out;
    }

    /**
     * STRICT: foreign pixel (neutral=2 / enemy=4) with 4-connected mine (3) neighbor.
     * Diagonal-only contact is NOT enough — must share an edge with our border.
     * Inland free land and non-adjacent empires are uncapturable.
     */
    isLandAttackCell(typeMatrix, w, h, x, y) {
      x = x | 0;
      y = y | 0;
      if (!typeMatrix || x < 0 || y < 0 || x >= w || y >= h) return false;
      const t = typeMatrix[y * w + x];
      if (t !== 2 && t !== 4) return false;
      // 4-connected only (edge-touch with OUR land)
      if (x + 1 < w && typeMatrix[y * w + (x + 1)] === 3) return true;
      if (x - 1 >= 0 && typeMatrix[y * w + (x - 1)] === 3) return true;
      if (y + 1 < h && typeMatrix[(y + 1) * w + x] === 3) return true;
      if (y - 1 >= 0 && typeMatrix[(y - 1) * w + x] === 3) return true;
      return false;
    }

    /**
     * Keep only perimeter-attackable foreign cells (edge-adjacent to mine).
     * Accepts cells that store aim in x/y, targetX/Y, enemyTarget*, neutralTarget*.
     */
    filterPerimeterOnly(cells, typeMatrix, w, h) {
      if (!cells || !cells.length || !typeMatrix) return [];
      const out = [];
      const seen = new Set();
      for (let i = 0; i < cells.length; i++) {
        const c = cells[i];
        if (!c) continue;
        const aims = [];
        if (c.enemyTargetX != null) aims.push([c.enemyTargetX, c.enemyTargetY, 'ENEMY']);
        if (c.neutralTargetX != null) aims.push([c.neutralTargetX, c.neutralTargetY, 'NEUTRAL']);
        if (c.targetX != null) aims.push([c.targetX, c.targetY, c.type]);
        aims.push([c.x, c.y, c.type]);

        let kept = null;
        for (let a = 0; a < aims.length; a++) {
          const fx = aims[a][0] | 0;
          const fy = aims[a][1] | 0;
          if (!this.isLandAttackCell(typeMatrix, w, h, fx, fy)) continue;
          const ft = typeMatrix[fy * w + fx];
          kept = {
            x: fx,
            y: fy,
            targetX: fx,
            targetY: fy,
            type: ft === 4 ? 'ENEMY' : 'NEUTRAL',
            touchesNeutral: ft === 2,
            touchesEnemy: ft === 4,
            touchesMine: true,
            score: c.score,
            perimeterOnly: true,
            mineX: c.mineX,
            mineY: c.mineY
          };
          break;
        }
        if (!kept) continue;
        const key = kept.x + ',' + kept.y;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(kept);
      }
      return out;
    }

    /**
     * Perimeter foreign cells: mine pixel → 4-neighbor neutral/enemy.
     * mode: 'neutral' | 'enemy' | 'any'
     * stepScale < 1 = denser scan (use for enemy late-game borders).
     */
    collectBorderTouchTargets(typeMatrix, w, h, mode, maxN, stepScale) {
      const out = [];
      if (!typeMatrix || !w || !h) return out;
      maxN = maxN || 24;
      mode = mode || 'any';
      const scale = stepScale != null ? stepScale : 1;
      const step = Math.max(1, Math.floor((Math.min(w, h) / 100) * scale));
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      const seen = new Set();

      for (let y = 1; y < h - 1 && out.length < maxN; y += step) {
        for (let x = 1; x < w - 1 && out.length < maxN; x += step) {
          if (typeMatrix[y * w + x] !== 3) continue;
          for (let d = 0; d < 4; d++) {
            const fx = x + dirs[d][0];
            const fy = y + dirs[d][1];
            const ft = typeMatrix[fy * w + fx];
            if (ft !== 2 && ft !== 4) continue;
            if (mode === 'neutral' && ft !== 2) continue;
            if (mode === 'enemy' && ft !== 4) continue;
            const key = fx + ',' + fy;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push({
              x: fx,
              y: fy,
              type: ft === 4 ? 'ENEMY' : 'NEUTRAL',
              touchesEnemy: ft === 4,
              touchesNeutral: ft === 2,
              targetX: fx,
              targetY: fy,
              mineX: x,
              mineY: y,
              dx: dirs[d][0],
              dy: dirs[d][1]
            });
            if (out.length >= maxN) break;
          }
        }
      }
      return out;
    }

    /**
     * Fast pack: perimeter foreign cell → screen.
     * opts.enemyLoosen: only hard chrome block (allow lower-map enemy borders).
     */
    packPerimeterClick(seed, typeMatrix, w, h, opts) {
      if (!seed || !typeMatrix) return null;
      opts = opts || {};
      const fx = (seed.targetX != null ? seed.targetX : seed.x) | 0;
      const fy = (seed.targetY != null ? seed.targetY : seed.y) | 0;
      if (fx < 0 || fy < 0 || fx >= w || fy >= h) return null;
      const ft = typeMatrix[fy * w + fx];
      if (ft !== 2 && ft !== 4) return null;
      if (!this.isLandAttackCell(typeMatrix, w, h, fx, fy)) return null;

      this.coords.gridWidth = w;
      this.coords.gridHeight = h;
      let gx = fx;
      let gy = fy;
      if (seed.dx != null && seed.dy != null) {
        gx = fx + seed.dx * 0.2;
        gy = fy + seed.dy * 0.2;
      }
      const screen = this.coords.gridToScreen(gx, gy);
      if (!screen) return null;

      const isEnemy = ft === 4 || seed.type === 'ENEMY' || opts.enemyLoosen;
      // Always block Quit-logo chrome; enemy targets may sit lower on map
      if (this.coords && typeof this.coords.isUiChromePoint === 'function') {
        if (this.coords.isUiChromePoint(screen.x, screen.y)) return null;
      }
      if (!isEnemy && this.coords && typeof this.coords.isSafeScreenPoint === 'function') {
        if (!this.coords.isSafeScreenPoint(screen.x, screen.y)) return null;
      } else if (isEnemy) {
        // Looser bounds for enemy: only reject true canvas exterior + hard chrome
        const canvas = document.querySelector('canvas');
        if (canvas) {
          const r = canvas.getBoundingClientRect();
          const nx = (screen.x - r.left) / Math.max(1, r.width);
          const ny = (screen.y - r.top) / Math.max(1, r.height);
          if (nx < 0.02 || nx > 0.98 || ny < 0.05 || ny > 0.93) return null;
          if (nx < 0.14 && ny > 0.80) return null; // Quit logo corner
        }
      } else {
        const canvas = document.querySelector('canvas');
        if (canvas) {
          const r = canvas.getBoundingClientRect();
          if (screen.x < r.left || screen.x > r.right ||
              screen.y < r.top || screen.y > r.bottom) return null;
        }
      }
      return {
        cell: { x: fx, y: fy, type: ft === 4 ? 'ENEMY' : 'NEUTRAL' },
        screen,
        type: ft === 4 ? 'ENEMY' : 'NEUTRAL'
      };
    }

    /** Spray: first foreign cell along ray that touches our land (attackable). */
    sprayTargets(typeMatrix, w, h, centroid, count) {
      const targets = [];
      if (!typeMatrix || !w || !h) return targets;
      const cx = centroid.x || (w / 2);
      const cy = centroid.y || (h / 2);
      for (let i = 0; i < count; i++) {
        const ang = this.sprayAngle + (i * (Math.PI * 2 / Math.max(3, count)));
        for (let r = 2; r < Math.min(w, h) / 2; r += 1) {
          const x = Math.round(cx + Math.cos(ang) * r);
          const y = Math.round(cy + Math.sin(ang) * r);
          if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) break;
          const t = typeMatrix[y * w + x];
          if (t === 1) break;
          if ((t === 2 || t === 4) && this.isLandAttackCell(typeMatrix, w, h, x, y)) {
            targets.push({
              x, y,
              type: t === 4 ? 'ENEMY' : 'NEUTRAL',
              touchesNeutral: t === 2,
              touchesEnemy: t === 4,
              targetX: x,
              targetY: y
            });
            break;
          }
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
          this.controller.setPacing(CFG ? CFG.actionIntervalMs(this.settings) : 250);
          this.startIdleLoop();
          console.log(
            `%c[TIO v${AGENT_VERSION}] STAND BY — ${this.settings.clickSpeed}/s command ceiling, ${this.settings.visionFps} FPS vision fallback.`,
            'color: #f59e0b; font-weight: bold;'
          );
        }
      }, 250);
    }

    loadSettings() {
      try {
        if (!chrome || !chrome.storage || !chrome.storage.local) return;
        chrome.storage.local.get(DEFAULT_SETTINGS, (data) => {
          this.applySettings(data);
        });
      } catch (e) { /* ignore */ }
    }

    applySettings(raw) {
      this.settings = CFG
        ? CFG.normalizeSettings({ ...this.settings, ...(raw || {}) })
        : { ...DEFAULT_SETTINGS, ...this.settings, ...(raw || {}) };
      const interval = CFG
        ? CFG.actionIntervalMs(this.settings)
        : Math.round(1000 / Math.max(1, this.settings.clickSpeed | 0));
      this.controller.setPacing(interval);
      if (this.scheduler) {
        const fps = Math.max(4, this.settings.visionFps | 0 || 12);
        this.scheduler.targetFPS = fps;
        this.scheduler.frameIntervalMs = 1000 / fps;
      }
      if (typeof window !== 'undefined' && typeof window.TIOSetEngineVersion === 'function' && this.settings.engineVersion) {
        window.TIOSetEngineVersion(this.settings.engineVersion);
      }
    }

    persistSettings(partial) {
      this.applySettings(partial);
      try { chrome.storage.local.set(this.settings); } catch (_) { /* ignore */ }
    }

    bindSettingsListeners() {
      try {
        if (chrome && chrome.storage && chrome.storage.onChanged) {
          chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local') return;
            for (const key of Object.keys(changes)) {
              if (key in this.settings) this.settings[key] = changes[key].newValue;
            }
            this.applySettings(this.settings);
          });
        }
        if (chrome && chrome.runtime && chrome.runtime.onMessage) {
          chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
            if (msg && msg.action === 'STATE_CHANGED' && msg.settings) {
              this.applySettings(msg.settings);
            } else if (msg && msg.action === 'SET_ENGINE_VERSION') {
              const ver = Number(msg.version) || 2;
              this.persistSettings({ engineVersion: ver });
              if (typeof window !== 'undefined' && typeof window.TIOSetEngineVersion === 'function') {
                window.TIOSetEngineVersion(ver);
              }
              sendResponse({ success: true, version: ver });
              return true;
            } else if (msg && msg.action === 'GET_STATUS') {
              const adapterStatus = (typeof window !== 'undefined' && typeof window.TIOGetEngineStatus === 'function')
                ? window.TIOGetEngineStatus()
                : null;
              sendResponse({
                success: true,
                status: {
                  inGame: !!this.isGameActive,
                  armed: !!this.matchArmed,
                  botEnabled: !!this.settings.botEnabled,
                  engineVersion: adapterStatus ? adapterStatus.activeVersion : (this.settings.engineVersion || 2),
                  engineName: adapterStatus ? adapterStatus.activeEngine : 'V2.8.1-Advanced',
                  strategy: this.settings.strategy || 'aggressive',
                  internalReady: !!(this.internal && this.internal.isReady && this.internal.isReady()),
                  path: this._lastPath || 'hy/hg',
                  policy: this._lastPolicy || 'standby',
                  balance: this.economy ? (this.economy.estimatedTroopBalance | 0) : 0,
                  softCap: this.economy ? (this.economy.softCap | 0) : 0,
                  fps: 60
                }
              });
              return true;
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
          this.persistSettings({ botEnabled: !this.settings.botEnabled });
          if (!this.settings.botEnabled) this.controller.clearQueue();
          console.log('[TIO] Bot', this.settings.botEnabled ? 'ON' : 'OFF');
        }
        if (e.key === 'x' || e.key === 'X') {
          this.persistSettings({ autoExpand: !this.settings.autoExpand });
        }
        // Manual troop overrides (0 / unset = full auto-adaptive)
        if (e.key === 'c' || e.key === 'C') this.persistSettings({ sliderPercentage: 25 });
        if (e.key === 'v' || e.key === 'V') this.persistSettings({ sliderPercentage: 40 });
        if (e.key === 'b' || e.key === 'B') this.persistSettings({ sliderPercentage: 0 });
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

    /** Finish the trusted-click arm handshake once a live territory is proven. */
    armConfirmedMatch(source) {
      if (this.matchArmed || !this.pendingSpawn) return false;
      this.playerSpawnScreen = { x: this.pendingSpawn.x, y: this.pendingSpawn.y };
      this.isPlayerSpawnCalibrated = true;
      this.matchArmed = true;
      this.noTerritoryFrames = 0;
      this.pendingSpawn = null;
      this.matchStartTime = performance.now();
      if (this.economy.resetMatch) this.economy.resetMatch();
      this.smoothedCommit = 0.30;
      this.engineStarted = true;
      this.lastAttackDispatchTime = 0;
      this.internalFailStreak = 0;
      this.internalAttackCount = 0;
      this.lastSuccessfulGameTick = -1;
      this.lastStrategicTerritory = null;
      this.lastStrategicGameTick = -1;
      this.internalAreaTrend = 0;
      this.internalShrinkFrames = 0;

      try {
        if (this.internal && this.internal.setArmed) {
          this.internalArmPending = true;
          this.internal.setArmed(true).then((result) => {
            this.internalArmPending = false;
            if (result && result.ok && this.internal.setTroopRatio) {
              this.internal.setTroopRatio(0.30).catch(() => {});
            }
          }).catch(() => {
            this.internalArmPending = false;
          });
        }
      } catch (_) {
        this.internalArmPending = false;
      }
      console.log(
        `%c[TIO v${AGENT_VERSION}] Spawn confirmed (${source || 'territory'}) — engine armed`,
        'color: #34d399; font-weight: bold;'
      );
      return true;
    }

    /** Confirm pending spawn directly from the exact internal game state. */
    tryConfirmSpawnFromInternal() {
      if (this.matchArmed || !this.pendingSpawn || !this.internal) return false;
      const st = this.internal.lastState;
      if (!st || !st.ready || st.player == null || st.player < 0 ||
          st.alive === false || !(Number(st.territory) > 0)) return false;
      return this.armConfirmedMatch(`internal territory=${Number(st.territory) | 0}`);
    }

    /** Confirm pending spawn when mine pixels appear (fallback path). */
    tryConfirmSpawnFromVision(visionResult) {
      if (this.matchArmed || !this.pendingSpawn || !visionResult) return false;
      const age = performance.now() - this.pendingSpawn.t;
      if (age > 12000) {
        this.pendingSpawn = null;
        return false;
      }
      // Very short wait so we can open fire ASAP after spawn
      if (age < 80) return false;

      try {
        this.vision.sampleAndCalibratePlayerColor(this.pendingSpawn.x, this.pendingSpawn.y);
      } catch (_) { /* ignore */ }

      const vr = this.vision.processFrame() || visionResult;
      const hist = vr.histogram || {};
      const mine = hist.mineCount || 0;
      const water = hist.waterCount || 0;
      const neutral = hist.neutralCount || 0;
      const total = Math.max(1, (vr.width || 1) * (vr.height || 1));
      const mapish = (water + neutral + mine) / total;

      // Loose gates: early game spawn blob can be tiny
      if (mapish < 0.03 && age < 1500) return false;
      if (mine < 4 && age < 800) return false;
      // After 800ms, arm on any mine signal
      if (mine < 2 && age < 2500) return false;
      if (mine < 1) return false;

      return this.armConfirmedMatch(`vision mine=${mine}`);
    }

    disarmMatch(reason) {
      if (!this.matchArmed && !this.isPlayerSpawnCalibrated && !this.pendingSpawn) return;
      this.matchArmed = false;
      this.isPlayerSpawnCalibrated = false;
      this.pendingSpawn = null;
      this.engineStarted = false;
      this.internalArmPending = false;
      this.internalAttackCount = 0;
      this.lastSuccessfulGameTick = -1;
      this.lastStrategicTerritory = null;
      this.lastStrategicGameTick = -1;
      this.internalAreaTrend = 0;
      this.internalShrinkFrames = 0;
      this.controller.clearQueue();
      if (this.internalPlanningGate) this.internalPlanningGate.reset();
      try {
        if (this.internal && this.internal.setArmed) this.internal.setArmed(false);
      } catch (_) { /* ignore */ }
      console.log(`[TIO] Match disarmed (${reason || 'reset'}) — engine idle`);
    }

    /**
     * Strip Territorial main-menu username INPUT if it appears mid-match.
     * Trigger: bot click on bottom-left logo → Quit → jD.bi() shows name field.
     */
    suppressUsernamePopup() {
      try {
        const inputs = document.querySelectorAll('body > input[type="text"]');
        for (let i = 0; i < inputs.length; i++) {
          const el = inputs[i];
          if (!el || !el.parentNode) continue;
          const pos = (el.style && el.style.position) || '';
          // Game name field is absolute-positioned over the canvas
          if (pos === 'absolute' || getComputedStyle(el).position === 'absolute') {
            try {
              if (document.activeElement === el) el.blur();
            } catch (_) {}
            try {
              el.parentNode.removeChild(el);
            } catch (_) {
              el.style.display = 'none';
              el.style.pointerEvents = 'none';
            }
          }
        }
      } catch (_) { /* ignore */ }
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
        if (this.matchArmed && this.internal && now - this.internalRefreshAt >= 200) {
          this.internalRefreshAt = now;
          this.internal.refresh().catch(() => {});
        }
        if (!this.matchArmed && !this.pendingSpawn) {
          // Pure standby — do not read canvas / run vision / attack
          this.runStandbyHud(now);
        } else if (!this.matchArmed && this.pendingSpawn) {
          // Only after a map click: light vision to confirm territory
          if (this.internal && now - this.internalRefreshAt >= 100) {
            this.internalRefreshAt = now;
            this.internal.refresh().catch(() => {});
          }
          this.runPendingSpawnCheck(now);
        } else if (this.internal && this.internal.isReady && this.internal.isReady() && this.internal.armed) {
          this.executeInternalPipeline(now);
          this.lastTickTime = now;
        } else if (this.internalArmPending) {
          // Never race physical fallback clicks against the MAIN-world arm RPC.
          this.runHookPendingHud(now);
        } else if (this.settings.allowVisionFallback === false) {
          this.runHookPendingHud(now);
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

    runHookPendingHud(now) {
      if (now - this.idleHudAt < 400) return;
      this.idleHudAt = now;
      const telemetry = this.internal && this.internal.getTelemetry
        ? this.internal.getTelemetry()
        : { mode: 'unavailable' };
      this.hud.updateDashboard({
        version: AGENT_VERSION, fps: 0,
        state: this.internalArmPending ? 'ARMING INTERNAL' : 'HOOK PENDING', aggression: 'SAFE HOLD',
        myArea: 0, compactness: 0, ecoHealth: telemetry.mode, troopBalance: 0,
        growthPerSec: 0, attackROI: 0, enemyCount: 0, primaryThreat: '-',
        dangerScore: 0, targetCoord: '-', smoothingLock: 'vision-fallback-off', waves: '0',
        pincer: 'NO ACTION', hint: 'Internal hook unavailable; vision fallback is disabled.'
      });
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
      // Check often so we arm the moment territory appears
      if (now - this.lastTickTime < 50) return;
      this.lastTickTime = now;

      // Prefer exact game state. This avoids making internal mode depend on
      // color calibration or canvas readback succeeding first.
      if (this.tryConfirmSpawnFromInternal()) return;

      const visionResult = this.vision.processFrame();
      if (visionResult && visionResult.typeMatrix) {
        if (this.tryConfirmSpawnFromVision(visionResult)) {
          // If MAIN is usable, wait for its arm handshake to avoid dual-path
          // execution. Otherwise the next frame enters the vision fallback.
          if (!(this.internal && this.internal.isReady && this.internal.isReady())) {
            try {
              this.executePipeline(performance.now(), 0.05);
            } catch (e) {
              console.warn('[TIO] first-fire', e);
            }
          }
          return;
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

    /** Fast path: exact game state and native actuator; no canvas readback. */
    executeInternalPipeline(now) {
      return window.TIOProfiler ? window.TIOProfiler.measureCall('control.internal', this.executeInternalPipelineImpl, this, arguments) : this.executeInternalPipelineImpl(now);
    }
    executeInternalPipelineImpl(now) {
      const st = this.internal && this.internal.lastState;
      if (!st || !st.ready) return;

      const balance = Number(st.balance) | 0;
      const balanceKnown = st.balanceKnown === true;
      const territory = Math.max(0, Number(st.territory) | 0);
      const alive = st.alive !== false && territory > 0;
      if (!alive) {
        if (!this.internalNotAliveSince) this.internalNotAliveSince = now;
        if (now - this.internalNotAliveSince > 2500) this.disarmMatch('internal-match-ended');
        return;
      }
      this.internalNotAliveSince = 0;

      const userDriving = this.controller ? this.controller.userPointerDown === true : false;
      const interval = CFG ? CFG.actionIntervalMs(this.settings) : 160;
      const bankInterval = balanceKnown && balance < 800 ? 280 : 160;
      const due = now - this.lastAttackDispatchTime >= Math.max(interval, bankInterval);
      const busy = this.internal.isBusy && this.internal.isBusy();
      const engineVersion = window.TIOEngineAdapter ? window.TIOEngineAdapter.activeVersion : 2;
      const controls = Number(userDriving) | (Number(!!busy) << 1) | (Number(due) << 2) | (engineVersion << 3);
      if (this.internalPlanningGate && !this.internalPlanningGate.shouldRun(st, now,
          this.internalAttackCount, this.settings, controls)) return;

      const adjacentEnemies = Array.isArray(st.enemies)
        ? st.enemies.filter((enemy) => enemy && enemy.adjacent)
        : [];
      const enemies = adjacentEnemies.filter((enemy) => enemy.available !== false);
      const neighbors = Array.isArray(st.neighbors) ? st.neighbors : [];
      const physicalNeighbors = Array.isArray(st.physicalNeighbors) ? st.physicalNeighbors : neighbors;
      const hasAdjFree = st.neutralId != null && physicalNeighbors.indexOf(st.neutralId) >= 0;
      const neutralAvailable = st.neutralId != null && neighbors.indexOf(st.neutralId) >= 0;
      const largestEnemy = adjacentEnemies.reduce((max, enemy) =>
        Math.max(max, Number(enemy.effectiveBal) || Number(enemy.bal) || 0), 0);
      const incomingTroops = adjacentEnemies.reduce((sum, enemy) =>
        sum + Math.max(0, Number(enemy.incoming) || 0), 0);
      const danger = largestEnemy > 0 ? largestEnemy / Math.max(1, balance + largestEnemy) : 0;
      const relativePower = largestEnemy > 0 ? balance / largestEnemy : 1;
      const freeHint = hasAdjFree ? 0.08 : 0;
      const gameTimeSec = Math.max(0, (now - this.matchStartTime) / 1000);
      const gameTick = Math.max(0, Number(st.gameTick) | 0);
      if (this.lastStrategicTerritory == null) {
        this.lastStrategicTerritory = territory;
        this.lastStrategicGameTick = gameTick;
      } else if (gameTick !== this.lastStrategicGameTick) {
        const delta = territory - this.lastStrategicTerritory;
        this.internalAreaTrend = delta;
        if (delta < 0) this.internalShrinkFrames++;
        else if (delta > 0) this.internalShrinkFrames = 0;
        else this.internalShrinkFrames = Math.max(0, this.internalShrinkFrames - 1);
        this.lastStrategicTerritory = territory;
        this.lastStrategicGameTick = gameTick;
      }
      const activeFronts = Math.max(0, Number(st.activeFronts) | 0);
      const frontCap = Math.max(1, Math.min(4, Number(st.humanFrontCap || st.multiFront || 4) | 0));
      const situation = {
        balance,
        balanceKnown,
        territory,
        softCap: st.softCap || (CORE && CORE.softCapFor
          ? CORE.softCapFor(territory)
          : Math.min(100 * Math.max(1, territory), 1000000000)),
        freeLandRatio: freeHint,
        hasAdjFree,
        adjEnemies: enemies,
        planningEnemies: adjacentEnemies,
        economy: st.economy,
        outgoingAttacks: st.outgoingAttacks,
        freeLandCells: st.freeLandCells,
        totalEnemyBalance: st.totalEnemyBalance,
        perimeterNeutral: hasAdjFree ? 1 : 0,
        perimeterEnemy: enemies.length,
        totalEnemyTerr: st.totalEnemyTerritory != null
          ? Math.max(0, Number(st.totalEnemyTerritory) | 0)
          : adjacentEnemies.reduce((sum, enemy) => sum + Math.max(0, enemy.terr | 0), 0),
        globalRank: st.globalRank,
        leaderTerritory: st.leaderTerritory,
        leaderId: st.leaderId,
        playersRemaining: st.alivePlayers,
        areaTrend: this.internalAreaTrend,
        shrinkFrames: this.internalShrinkFrames,
        incoming: incomingTroops,
        tick: gameTick,
        attackSequence: this.internalAttackCount,
        activeFronts,
        primaryDanger: danger,
        relativePower,
        gameTimeSec,
        strategy: this.settings.strategy
      };

      let decision = CORE && CORE.decide
        ? CORE.decide(situation)
        : { action: hasAdjFree ? 'expand' : (enemies.length ? 'fight' : 'hold'), phaseLabel: 'LAND_RUSH', reason: 'fallback' };

      if (decision.action === 'expand' && this.settings.autoExpand === false) {
        decision = this.settings.autoAttack !== false && enemies.length
          ? Object.assign({}, decision, { action: 'fight', wantEnemy: true, preferNeutral: false, phaseLabel: 'PRESSURE', reason: 'expand-disabled' })
          : Object.assign({}, decision, { action: 'hold', wantEnemy: false, preferNeutral: false, reason: 'expand-disabled' });
      } else if (decision.action === 'fight' && this.settings.autoAttack === false) {
        decision = this.settings.autoExpand !== false && hasAdjFree
          ? Object.assign({}, decision, { action: 'expand', wantEnemy: false, preferNeutral: true, phaseLabel: 'LAND_RUSH', reason: 'attack-disabled' })
          : Object.assign({}, decision, { action: 'hold', wantEnemy: false, preferNeutral: false, reason: 'attack-disabled' });
      }

      const wantEnemy = decision.action === 'fight';
      const enemyBalance = decision.enemyBal != null
        ? decision.enemyBal
        : (enemies[0] ? enemies[0].bal : 0);
      let budget = CORE && CORE.planSpend
        ? CORE.planSpend({
            balance, balanceKnown, territory, softCap: situation.softCap,
            freeLandRatio: freeHint, wantEnemy, crushable: !!decision.crushable,
            enemyBal: enemyBalance, adjEnemyCount: enemies.length,
            primaryDanger: danger, relativePower: enemyBalance > 0 ? balance / enemyBalance : 1, fronts: 1,
            activeFronts, frontCap, attackSequence: this.internalAttackCount,
            adjEnemies: adjacentEnemies, incoming: incomingTroops,
            areaTrend: this.internalAreaTrend, shrinkFrames: this.internalShrinkFrames,
            gameTick,
            phase: decision.phaseLabel,
            gameTimeSec
          })
        : { canAfford: balance > 30, ratio: 0.2, fronts: 1, minRemaining: 1, reason: 'fallback' };

      if (decision.action === 'hold' || this.settings.botEnabled === false) {
        budget = Object.assign({}, budget, { canAfford: false, fronts: 0 });
      }

      let ratio = budget.ratio || 0;
      const manualRatio = (this.settings.sliderPercentage | 0) / 100;
      if (manualRatio > 0) ratio = manualRatio;
      ratio = manualRatio > 0
        ? Math.max(0.08, Math.min(0.40, ratio))
        : Math.max(0.06, Math.min(0.72, ratio));
      if (balanceKnown && balance > 0 && CORE && CORE.maxSafeRatio) {
        const safeRatio = CORE.maxSafeRatio(balance, Math.max(1, budget.minRemaining | 0));
        ratio = safeRatio > 0 ? Math.min(ratio, safeRatio) : 0;
      }

      const canFire = this.settings.botEnabled !== false && !userDriving && !busy && due &&
        budget.canAfford && ratio > 0 && decision.action !== 'hold' &&
        (decision.action !== 'expand' || neutralAvailable);

      this._decision = decision;
      this.lastCommitMeta = {
        ratio, reason: `${budget.reason || ''}|${decision.reason || ''}`,
        minRemaining: budget.minRemaining | 0, maxSpend: budget.maxSpendTotal | 0,
        canAfford: !!budget.canAfford, action: decision.action, scores: decision.scores,
        urgency: budget.urgency
      };

      if (canFire) {
        // Reserve immediately; completion time is too late to prevent rAF request floods.
        this.lastAttackDispatchTime = now;
        this.internal.attack({
          ratio,
          preferNeutral: decision.action === 'expand',
          phase: decision.phaseLabel || (wantEnemy ? 'PRESSURE' : 'LAND_RUSH'),
          freeLand: freeHint,
          target: wantEnemy ? decision.focusEnemyId : null,
          autoExpand: this.settings.autoExpand,
          autoAttack: this.settings.autoAttack,
          minRemaining: budget.minRemaining,
          primaryDanger: danger,
          attackSequence: this.internalAttackCount,
          gameTimeSec,
          areaTrend: this.internalAreaTrend,
          shrinkFrames: this.internalShrinkFrames
        }).then((result) => {
          if (result && result.ok) {
            this.internalFailStreak = 0;
            this.internalAttackCount++;
            this.lastSuccessfulGameTick = Number(st.gameTick) | 0;
            this._lastPath = result.path || (result.last && result.last.path) || 'native';
            this._lastPolicy = result.policy || decision.reason;
          } else if (result && ['below-reserve', 'unsafe-spend', 'spend-lock', 'target-busy', 'zero-troops', 'negative-troops'].indexOf(result.err) < 0) {
            this.internalFailStreak++;
            this._lastPolicy = result.err || 'internal-failed';
          }
        }).catch(() => {
          this.internalFailStreak++;
        });
      }

      if (now - this.lastInternalHudAt >= 200) {
        this.lastInternalHudAt = now;
        const block = this.settings.botEnabled === false ? 'bot-off'
          : userDriving ? 'user-hold'
            : busy ? 'single-flight'
              : decision.action === 'expand' && !neutralAvailable ? 'neutral-settlement'
              : !budget.canAfford ? budget.reason
                : !due ? 'pacing'
                  : decision.action === 'hold' ? decision.reason : '';
        this.hud.updateDashboard({
          version: AGENT_VERSION,
          fps: 0,
          state: `${decision.action.toUpperCase()} · ${block || this._lastPolicy || 'native'}`,
          aggression: hasAdjFree ? 'FREE BORDER' : `${enemies.length} ENEMY BORDER`,
          myArea: territory,
          compactness: 0,
          ecoHealth: `dens=${Number(st.density || 0).toFixed(2)} · ${this.settings.strategy}`,
          troopBalance: balance,
          growthPerSec: 0,
          attackROI: 0,
          enemyCount: enemies.length,
          primaryThreat: enemies[0] ? enemies[0].id : 'NONE',
          dangerScore: danger,
          targetCoord: this._lastPolicy || decision.reason,
          smoothingLock: block || this._lastPath || 'ready',
          waves: `${activeFronts}/${frontCap} + 1×${Math.round(ratio * 100)}%`,
          pincer: 'INTERNAL · NO VISION',
          hint: `Native engine · ${decision.reason} · bal=${balance} · hook=${st.hookVer || '—'}`
        });
      }
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

      // If Quit-logo was hit, main-menu username INPUT can reappear — strip it mid-match
      if (this.matchArmed && this.frameCount % 20 === 0) {
        this.suppressUsernamePopup();
      }

      this.playerSpawnGrid = this.coords.screenToGrid(this.playerSpawnScreen.x, this.playerSpawnScreen.y);
      this.grid.updateFromVision(visionResult);
      this.region.setGrid(this.grid);
      this.border.setGrid(this.grid);

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
      const gameTimeSec = (now - this.matchStartTime) / 1000.0;

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
      // Early spawn can be tiny — arm attacks as soon as any mine is seen
      const hasTerritory = borderStats.totalTerritoryArea > 0 || mineEst > 2 || histMine > 3
        || (this.matchArmed && (histMine > 0 || mineEst > 0));

      if (!hasTerritory) {
        this.noTerritoryFrames++;
        // Time-based: ~2.5s without territory → disarm (frame count varies with uncapped FPS)
        if (!this._noTerrSince) this._noTerrSince = now;
        if (now - this._noTerrSince > 2500) {
          this.disarmMatch('no-territory');
          this._noTerrSince = 0;
          return;
        }
      } else {
        this.noTerritoryFrames = 0;
        this._noTerrSince = 0;
      }

      // ONLY perimeter-claimable free land (edge-adjacent to us) — not map-wide neutral
      const freeLandRatio = landSnap && landSnap.freeLandRatio != null
        ? landSnap.freeLandRatio
        : (() => {
            // Fallback: count edge-adjacent neutrals only
            const tm = visionResult.typeMatrix;
            const w = visionResult.width;
            const h = visionResult.height;
            if (!tm || !w || !h) return 0;
            let adjN = 0;
            let mine = 0;
            const step = Math.max(1, Math.floor(Math.min(w, h) / 100));
            for (let y = 1; y < h - 1; y += step) {
              for (let x = 1; x < w - 1; x += step) {
                const t = tm[y * w + x];
                if (t === 3) mine++;
                else if (t === 2 && this.isLandAttackCell(tm, w, h, x, y)) adjN++;
              }
            }
            return adjN / Math.max(1, mine + adjN);
          })();
      const landPhase = (landSnap && landSnap.phase) || 'OPENING';
      const landPolicy = this.neutral
        ? this.neutral.getPhasePolicy()
        : { preferNeutral: true, wantEnemy: false, multiFront: 4, pulseMs: 0, ratio: 0.25, label: 'OPEN' };

      // Hard bot tables — adaptive commit computed after we know wantEnemy / phase
      const avgEnemy = (() => {
        const list = enemyAnalytics.opponentsList || [];
        if (!list.length) return 0;
        let s = 0;
        for (let i = 0; i < list.length; i++) s += list[i].area;
        return s / list.length;
      })();

      this.economy.updateEconomy(borderStats.totalTerritoryArea, dtSec, avgEnemy);
      // Prefer real balance from game hook when available (better density/commit)
      // Sync economy with live balance including 0 / negative (do not keep stale positive)
      if (this.internal && this.internal.lastState && this.internal.lastState.balance != null) {
        this.economy.estimatedTroopBalance = this.internal.lastState.balance;
        if (this.internal.lastState.density != null) {
          this.economy.density = this.internal.lastState.density;
        } else if (this.internal.lastState.territory > 0) {
          const cap = CORE && CORE.softCapFor
            ? CORE.softCapFor(this.internal.lastState.territory)
            : Math.min(100 * this.internal.lastState.territory, 1000000000);
          this.economy.density = this.internal.lastState.balance / Math.max(1, cap);
        }
      }
      // ============================================================
      // PURE SITUATION LOOP: Sense → decide(S) → planSpend → Act
      // No phase playbook. Phases are labels only.
      // ============================================================
      const stEarly = (this.internal && this.internal.lastState) || {};
      // balanceKnown distinguishes "couldn't read" (play) vs "truly 0/debt" (hold)
      let balKnown = stEarly.balanceKnown === true;
      let realBal = 0;
      if (stEarly.balance != null && isFinite(Number(stEarly.balance))) {
        realBal = Number(stEarly.balance) | 0;
        // If hook says known, trust it; if flag missing but balance non-zero, treat known
        if (stEarly.balanceKnown === true || realBal !== 0) balKnown = true;
        if (stEarly.balanceKnown === false) balKnown = false;
      } else if (this.economy.estimatedTroopBalance > 0) {
        realBal = this.economy.estimatedTroopBalance | 0;
        balKnown = false; // estimate only
      }
      try {
        const domBal = document.documentElement.getAttribute('data-tio-bal');
        if (domBal != null && domBal !== '' && stEarly.balanceKnown !== false) {
          const db = parseInt(domBal, 10);
          if (!isNaN(db)) {
            realBal = db;
            // DOM bal alone is known only if internal also has balanceKnown
            if (stEarly.balanceKnown === true) balKnown = true;
          }
        }
      } catch (_) { /* ignore */ }
      const realTerr = stEarly.territory != null && stEarly.territory > 0
        ? stEarly.territory
        : borderStats.totalTerritoryArea;
      const userDriving = this.controller ? this.controller.userPointerDown === true : false;
      const botOn = this.settings.botEnabled !== false;
      const isGameActive = this.matchArmed && this.isPlayerSpawnCalibrated && hasTerritory;
      const pulseMs = CFG ? CFG.actionIntervalMs(this.settings) : 160;

      const stForPolicy = stEarly;
      const adjEnemyList = (stForPolicy.enemies || []).filter((e) => e && e.adjacent);
      const hasAdjEnemy = adjEnemyList.length > 0;
      const hasCrushAdj = adjEnemyList.some((e) => e.crushable);

      // Perimeter-claimable free only (already in freeLandRatio from neutral engine)
      let freeEff = freeLandRatio;
      if (landSnap && landSnap.freeLandRatio != null) {
        freeEff = landSnap.freeLandRatio;
      }
      freeEff = Math.max(0, Math.min(1, freeEff));

      const liveDensEarly = stForPolicy.density != null
        ? stForPolicy.density
        : this.economy.density;
      const tm0 = visionResult.typeMatrix;
      const tw0 = visionResult.width;
      const th0 = visionResult.height;
      this.coords.gridWidth = tw0;
      this.coords.gridHeight = th0;

      // Collect ALL perimeter candidates (edge-adj neutral + enemy) — game-legal only
      let allPerim = [];
      allPerim = allPerim.concat(this.collectBorderTouchTargets(tm0, tw0, th0, 'any', 48, 0.65));
      if (landSnap && landSnap.topTargets) allPerim = allPerim.concat(landSnap.topTargets);
      if (this.border) {
        if (this.border.expansionFrontier) allPerim = allPerim.concat(this.border.expansionFrontier);
        if (this.border.enemyFrontier) allPerim = allPerim.concat(this.border.enemyFrontier);
      }
      allPerim = this.filterPerimeterOnly(allPerim, tm0, tw0, th0);
      // Soft chrome filter
      allPerim = allPerim.filter((c) => {
        const gx = c.targetX != null ? c.targetX : c.x;
        const gy = c.targetY != null ? c.targetY : c.y;
        if (!this.isLandAttackCell(tm0, tw0, th0, gx, gy)) return false;
        const scr = this.coords.gridToScreen(gx, gy);
        if (!scr) return false;
        if (this.coords.isUiChromePoint && this.coords.isUiChromePoint(scr.x, scr.y)) return false;
        if (c.type === 'ENEMY' || c.touchesEnemy) return true;
        return this.coords.isSafeScreenPoint(scr.x, scr.y);
      });

      let perimNeutral = 0;
      let perimEnemy = 0;
      for (let i = 0; i < allPerim.length; i++) {
        const c = allPerim[i];
        if (c.type === 'ENEMY' || c.touchesEnemy) perimEnemy++;
        else perimNeutral++;
      }
      const hasAdjFree = perimNeutral > 0
        || !!(stForPolicy.neighbors && stForPolicy.neutralId != null
          && stForPolicy.neighbors.indexOf(stForPolicy.neutralId) >= 0);

      // Total enemy territory (for leaderboard rank / first-place objective)
      let totalEnemyTerr = 0;
      const allEnemies = stForPolicy.enemies || [];
      for (let ei = 0; ei < allEnemies.length; ei++) {
        if (allEnemies[ei] && allEnemies[ei].terr > 0) totalEnemyTerr += allEnemies[ei].terr | 0;
      }
      if (!totalEnemyTerr && enemyAnalytics.opponentsList) {
        for (let oi = 0; oi < enemyAnalytics.opponentsList.length; oi++) {
          totalEnemyTerr += (enemyAnalytics.opponentsList[oi].area | 0) || 0;
        }
      }

      const sitState = {
        balance: realBal | 0,
        balanceKnown: balKnown,
        territory: realTerr,
        softCap: stForPolicy.softCap > 0
          ? stForPolicy.softCap
          : (CORE && CORE.softCapFor
            ? CORE.softCapFor(realTerr)
            : Math.min(100 * Math.max(1, realTerr), 1000000000)),
        freeLandRatio: freeEff,
        hasAdjFree,
        adjEnemies: adjEnemyList.length ? adjEnemyList : (stForPolicy.enemies || []).filter((e) => e && e.terr > 0),
        perimeterNeutral: perimNeutral,
        perimeterEnemy: perimEnemy,
        totalEnemyTerr: stForPolicy.totalEnemyTerritory != null ? stForPolicy.totalEnemyTerritory : totalEnemyTerr,
        totalEnemyBalance: stForPolicy.totalEnemyBalance,
        globalRank: stForPolicy.globalRank,
        leaderId: stForPolicy.leaderId,
        leaderTerritory: stForPolicy.leaderTerritory,
        playersRemaining: stForPolicy.alivePlayers,
        economy: stForPolicy.economy,
        outgoingAttacks: stForPolicy.outgoingAttacks,
        freeLandCells: stForPolicy.freeLandCells,
        tick: stForPolicy.gameTick,
        areaTrend: this.economy.areaTrend || 0,
        shrinkFrames: this.economy.consecutiveShrinkFrames || 0,
        primaryDanger: enemyAnalytics.primaryThreat
          ? (enemyAnalytics.primaryThreat.dangerScore || 0)
          : 0,
        relativePower: this.economy.relativePower || 1,
        gameTimeSec,
        strategy: this.settings.strategy
      };

      // ---- decide(S): expand | fight | hold ----
      let decision = {
        action: hasAdjFree ? 'expand' : (hasAdjEnemy || perimEnemy ? 'fight' : 'hold'),
        wantEnemy: !hasAdjFree && (hasAdjEnemy || perimEnemy > 0),
        preferNeutral: hasAdjFree,
        crushable: hasCrushAdj,
        phaseLabel: 'LAND_RUSH',
        reason: 'fallback',
        scores: {}
      };
      if (window.TIOHardMode && typeof window.TIOHardMode.decide === 'function') {
        decision = window.TIOHardMode.decide(sitState);
      }
      if (decision.action === 'expand' && this.settings.autoExpand === false) {
        decision = this.settings.autoAttack !== false && (hasAdjEnemy || perimEnemy > 0)
          ? Object.assign({}, decision, { action: 'fight', wantEnemy: true, preferNeutral: false, phaseLabel: 'PRESSURE', reason: 'expand-disabled' })
          : Object.assign({}, decision, { action: 'hold', wantEnemy: false, preferNeutral: false, reason: 'expand-disabled' });
      } else if (decision.action === 'fight' && this.settings.autoAttack === false) {
        decision = this.settings.autoExpand !== false && hasAdjFree
          ? Object.assign({}, decision, { action: 'expand', wantEnemy: false, preferNeutral: true, phaseLabel: 'LAND_RUSH', reason: 'attack-disabled' })
          : Object.assign({}, decision, { action: 'hold', wantEnemy: false, preferNeutral: false, reason: 'attack-disabled' });
      }
      // Force hold only when balance is KNOWN <= 0 (not unknown read)
      if (balKnown && !(sitState.balance > 0)) {
        decision = Object.assign({}, decision, {
          action: 'hold',
          wantEnemy: false,
          preferNeutral: false,
          phaseLabel: 'HOLD',
          reason: sitState.balance < 0 ? 'negative-troops' : 'zero-troops'
        });
      }
      const wantEnemy = decision.action === 'fight';
      const brainPhase = decision.phaseLabel || 'LAND_RUSH';

      // Rank perimeter targets by situation score
      let ranked = allPerim;
      if (window.TIOHardMode && typeof window.TIOHardMode.rankTargets === 'function') {
        ranked = window.TIOHardMode.rankTargets(allPerim, sitState, decision, 24);
      } else {
        ranked = allPerim.slice().sort((a, b) => {
          const ae = (a.type === 'ENEMY') ? 1 : 0;
          const be = (b.type === 'ENEMY') ? 1 : 0;
          if (wantEnemy && ae !== be) return be - ae;
          if (!wantEnemy && ae !== be) return ae - be;
          return 0;
        });
      }

      // ---- planSpend(S): pure money (authority for ratio + fronts) ----
      const planCtx = {
        balance: sitState.balance,
        balanceKnown: balKnown,
        territory: sitState.territory,
        softCap: sitState.softCap,
        freeLandRatio: freeEff,
        wantEnemy,
        crushable: !!decision.crushable,
        enemyBal: decision.enemyBal != null ? decision.enemyBal
          : (adjEnemyList[0] ? adjEnemyList[0].bal : null),
        adjEnemyCount: adjEnemyList.length,
        primaryDanger: sitState.primaryDanger,
        areaTrend: sitState.areaTrend,
        shrinkFrames: sitState.shrinkFrames,
        fronts: 4, // upper wish; planSpend caps by bank
        activeFronts: 0,
        frontCap: 4,
        attackSequence: this.internalAttackCount,
        phase: brainPhase,
        gameTimeSec
      };
      // Hold → zero fronts
      if (decision.action === 'hold') planCtx.fronts = 0;

      let budget = null;
      if (window.TIOHardMode && typeof window.TIOHardMode.planSpend === 'function') {
        budget = window.TIOHardMode.planSpend(planCtx);
      } else {
        const balN0 = sitState.balance;
        const rem = balN0 > 0 ? Math.max(8, Math.floor(balN0 * 0.18)) : 0;
        const maxS = balN0 > 0 ? Math.max(0, balN0 - rem) : 0;
        budget = {
          canAfford: decision.action !== 'hold' && (!balKnown || (balN0 > 0 && maxS >= 8)),
          minRemaining: rem,
          maxSpendTotal: maxS,
          ratio: balN0 > 0 ? Math.min(0.4, maxS / balN0) : 0.28,
          fronts: decision.action === 'hold' ? 0 : 2,
          reason: 'fallback',
          density: liveDensEarly,
          urgency: decision.urgency || 0.4
        };
      }
      if (decision.action === 'hold') {
        budget = Object.assign({}, budget, {
          canAfford: false,
          fronts: 0,
          reason: decision.reason || 'hold'
        });
      }

      const balN = sitState.balance | 0;
      // troopsOk: known positive, OR unknown (let MAIN act). Block only known <=0.
      const troopsOk = !balKnown || balN > 0;
      let canAfford = troopsOk && !!budget.canAfford && decision.action !== 'hold';
      const minRemaining = budget.minRemaining | 0;
      const maxSpend = budget.maxSpendTotal | 0;
      const maxSafeRatio = balKnown && balN > 0
        ? Math.min(0.72, maxSpend / balN)
        : (budget.ratio || 0.3);
      // Fronts = budget only (not freeLand tables)
      let waveCount = canAfford ? Math.max(0, budget.fronts | 0) : 0;

      // Money: planSpend only — NO EMA inflation (EMA was causing overspend/debt)
      let commitRatio = budget.ratio != null ? budget.ratio : 0.12;
      const slider = this.settings.sliderPercentage | 0;
      if (slider > 0 && slider < 100) {
        commitRatio = Math.min(commitRatio, slider / 100);
      }
      commitRatio = slider > 0
        ? Math.max(0.08, Math.min(0.40, commitRatio))
        : Math.max(0.06, Math.min(0.72, commitRatio));
      if (balKnown && maxSafeRatio > 0) {
        commitRatio = Math.min(commitRatio, maxSafeRatio);
      }
      // Exact human-command debit cap.
      if (balKnown && balN > 0 && window.TIOHardMode && window.TIOHardMode.maxSafeRatio) {
        const leave = Math.max(
          minRemaining | 0,
          window.TIOHardMode.minLeaveFor ? window.TIOHardMode.minLeaveFor(balN) : Math.floor(balN * 0.14)
        );
        const sr = window.TIOHardMode.maxSafeRatio(balN, leave);
        if (sr > 0) commitRatio = Math.min(commitRatio, sr);
        else {
          canAfford = false;
          waveCount = 0;
        }
        // Absolute: cost must be < bal
        if (window.TIOHardMode.estimateAttackCost) {
          const cost = window.TIOHardMode.estimateAttackCost(balN, commitRatio);
          if (cost >= balN || balN - cost < 1) {
            canAfford = false;
            waveCount = 0;
          }
        }
      }
      // Unknown balance: tiny bites only
      if (!balKnown) {
        commitRatio = Math.min(commitRatio, 0.12);
        waveCount = Math.min(waveCount, 1);
      }
      // Zero-debt multi-front: only with fat known bank
      if (balKnown && balN < 1200) waveCount = Math.min(waveCount, 1);
      else if (balKnown && balN < 3000) waveCount = Math.min(waveCount, 2);

      canAfford = canAfford && decision.action !== 'hold' && (!balKnown || balN > 0);
      if (!canAfford) waveCount = 0;

      // Pace attacks so balance can update (prevents frame-stack overspend)
      const minGap = balKnown && balN < 800 ? 280 : 160;
      if (canAfford && this.lastAttackDispatchTime && (performance.now() - this.lastAttackDispatchTime) < minGap) {
        canAfford = false;
      }

      this.lastCommitMeta = {
        ratio: commitRatio,
        reason: (budget.reason || '') + '|' + (decision.reason || ''),
        minRemaining,
        maxSpend,
        canAfford,
        action: decision.action,
        scores: decision.scores,
        urgency: budget.urgency
      };
      this._reserveDebug = {
        bal: balN,
        minRemaining,
        maxSpend,
        canAfford,
        maxSafeRatio: parseFloat((maxSafeRatio || 0).toFixed(3)),
        waveCount,
        reason: budget.reason,
        action: decision.action,
        decide: decision.reason,
        urgency: budget.urgency,
        density: budget.density
      };
      this._decision = decision;
      this._rankedTargets = ranked;

      // Keep legacy vars used below
      // FORCE game troop bar (must move visible % AND aS.hd spend code)
      // Re-apply often — game may reset bar; drag path is throttled in MAIN
      if (!this._troopSetAt || now - this._troopSetAt > 180) {
        this._troopSetAt = now;
        try {
          if (this.internal && this.internal.setTroopRatio) {
            this.internal.setTroopRatio(commitRatio).then((r) => {
              this._lastTroopSet = r;
              // If live bar still >55%, force again harder
              if (r && r.livePct != null && r.livePct > 55) {
                this.internal.setTroopRatio(Math.min(0.3, commitRatio));
              }
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
      else if (!troopsOk) {
        blockWhy = balN < 0 ? `debt bal=${balN} wait>0` : 'zero-troops wait>0';
      } else if (this.internal && this.internal.isBusy && this.internal.isBusy()) {
        blockWhy = 'single-flight';
      } else if (!canAfford || waveCount < 1) {
        blockWhy = `budget ${budget && budget.reason || 'hold'} bal=${balN} rem=${minRemaining}`;
      }

      // Refresh internal state often — need fresh adjacent-enemy list for late war
      if (this.internal && (now - this.internalRefreshAt > 200)) {
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
        const tm = visionResult.typeMatrix;
        const tw = visionResult.width;
        const th = visionResult.height;
        this.coords.gridWidth = tw;
        this.coords.gridHeight = th;

        // Seeds = situation-ranked perimeter targets only
        let seeds = (this._rankedTargets && this._rankedTargets.length)
          ? this._rankedTargets.slice()
          : [];
        if (!seeds.length) {
          seeds = this.collectBorderTouchTargets(
            tm, tw, th, wantEnemy ? 'enemy' : 'any', waveCount * 8, 0.65
          );
        }
        seeds = seeds.filter((s) => {
          const fx = (s.targetX != null ? s.targetX : s.x) | 0;
          const fy = (s.targetY != null ? s.targetY : s.y) | 0;
          return this.isLandAttackCell(tm, tw, th, fx, fy);
        });

        const clicks = [];
        const seen = new Set();
        for (let i = 0; i < seeds.length && clicks.length < waveCount; i++) {
          const hit = this.packPerimeterClick(seeds[i], tm, tw, th, {
            enemyLoosen: wantEnemy || seeds[i].type === 'ENEMY'
          });
          if (!hit) continue;
          if (!this.isLandAttackCell(tm, tw, th, hit.cell.x, hit.cell.y)) continue;
          const key = hit.cell.x + ',' + hit.cell.y;
          if (seen.has(key)) continue;
          seen.add(key);
          clicks.push(hit);
        }

        let minePx = 0;
        const sampleStep = Math.max(1, Math.floor((tw * th) / 4000));
        for (let i = 0; i < tm.length; i += sampleStep) {
          if (tm[i] === 3) minePx++;
        }

        const mode = wantEnemy ? 'enemy' : (decision.action || 'expand');
        this._perimDebug = {
          mineSample: minePx,
          seeds: seeds.length,
          clicks: clicks.length,
          mode,
          free: freeEff,
          wantEnemy,
          adjE: adjEnemyList.length,
          dens: liveDensEarly,
          action: decision.action,
          decide: decision.reason
        };

        // NEVER dual-path; max 1 physical attack per paced tick (zero debt)
        const useInternal = internalReady && canAfford;
        const useClicks = canAfford && !useInternal;
        const maxClicks = useClicks ? 1 : 0;
        const burstFronts = 1;

        if (useInternal) {
          this.lastAttackDispatchTime = now;
          const intPhase = brainPhase || (wantEnemy ? 'PRESSURE' : 'LAND_RUSH');
          const intOpts = {
            ratio: commitRatio,
            preferNeutral: !wantEnemy,
            phase: intPhase,
            freeLand: freeEff,
            allowShip: false,
            attackSequence: this.internalAttackCount
          };
          const fireInt = () => {
            if (burstFronts > 1 && this.internal.attackBurst) {
              return this.internal.attackBurst(Object.assign({}, intOpts, {
                fronts: burstFronts
              }));
            }
            return this.internal.attack(intOpts);
          };
          fireInt().then((r) => {
            if (r && r.ok) {
              this.internalFailStreak = 0;
              this.internalAttackCount++;
              this._lastPath = r.path || (r.last && r.last.path) || 'hg';
              this._lastPolicy = r.policy || decision.reason || 'int';
              this.lastAttackDispatchTime = performance.now();
            } else if (r && (r.err === 'below-reserve' || r.err === 'unsafe-spend' ||
                r.err === 'negative-troops' || r.err === 'zero-troops' ||
                r.err === 'spend-lock' || r.err === 'target-busy')) {
              this._lastPolicy = r.err;
              this.lastAttackDispatchTime = performance.now(); // back off
            } else if (r && r.err === 'not-adjacent') {
              /* clicks may handle */
            } else if (r && r.err === 'no-border-neighbor' && wantEnemy && this.internal.attackEnemy) {
              // only if still can afford
              if (canAfford) {
                this.internal.attackEnemy(commitRatio, intPhase).then((r2) => {
                  if (r2 && r2.ok) {
                    this.internalFailStreak = 0;
                    this._lastPolicy = r2.policy || 'enemy-force';
                    this.lastAttackDispatchTime = performance.now();
                  } else if (r2 && r2.err) {
                    this._lastPolicy = r2.err;
                  }
                }).catch(() => {});
              }
            } else if (r && !r.ok) {
              this.internalFailStreak++;
            }
          }).catch(() => {});
        }

        if (useClicks) {
          for (let i = 0; i < maxClicks; i++) {
            const c = clicks[i];
            if (!c) continue;
            const fired = this.controller.fireAttack
              ? this.controller.fireAttack(c.screen.x, c.screen.y)
              : this.controller.fireNow(c.screen.x, c.screen.y);
            if (fired) {
              enqueued++;
              this._lastClickCell = `${c.cell.x},${c.cell.y}:${c.type}`;
            }
          }
        }

        if (enqueued > 0) {
          this.internalAttackCount += enqueued;
          this.economy.recordAttackDispatch(
            commitRatio,
            wantEnemy ? 'ENEMY' : 'NEUTRAL',
            70 * enqueued
          );
          this.lastAttackDispatchTime = now;
          didAttack = true;
          actMode = 'PERIMETER';
          this._lastInternalMode = `FIRE ×${enqueued}`;
          this._lastPolicy = decision.reason || (wantEnemy ? 'perim-enemy' : 'perim-neutral');
        } else if (internalReady && seeds.length > 0 && canAfford) {
          actMode = 'INT-TRY';
          this._lastInternalMode = `seeds=${seeds.length} ${decision.action}`;
        } else if (!didAttack && decision.action === 'hold') {
          blockWhy = `hold:${decision.reason}`;
          actMode = 'HOLD';
        } else if (!didAttack) {
          blockWhy = `seek seeds=${seeds.length} act=${decision.action}`;
          actMode = 'SEEK';
        }
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
      else if (didAttack) {
        const rk = this._decision && this._decision.rank != null ? `#${this._decision.rank}` : '';
        stateLabel = `${rk} ${(this._decision && this._decision.action) || 'act'} ${modeLabel}`;
      } else {
        const rk = this._decision && this._decision.rank != null ? `#${this._decision.rank}` : '';
        stateLabel = `${rk} ${(this._decision && this._decision.action) || landPolicy.label} · ${blockWhy || modeLabel}`;
      }

      const st = intTel.lastState || {};
      const crushN = (st.enemies || []).filter((e) => e.crushable).length;
      this.hud.updateDashboard({
        version: AGENT_VERSION,
        fps: visionResult.visionFPS
          || (this.scheduler && this.scheduler.measuredFps)
          || 0,
        state: stateLabel,
        aggression: this.matchArmed ? `FREE ${freePct}%` : 'STANDBY',
        myArea: st.territory != null && st.territory > 0
          ? st.territory
          : borderStats.totalTerritoryArea,
        compactness: borderStats.isoperimetricQuotient,
        ecoHealth: this.matchArmed
          ? `${(this._decision && this._decision.phaseLabel) || landPhase} · dens=${st.density != null ? st.density.toFixed(2) : '—'}`
          : 'await spawn',
        troopBalance: st.balance != null ? st.balance : Math.round(this.economy.estimatedTroopBalance),
        growthPerSec: this.economy.growthPerSec,
        attackROI: this.economy.attackROI,
        enemyCount: st.enemies ? st.enemies.length : (enemyAnalytics.totalTracked || 0),
        primaryThreat: enemyAnalytics.primaryThreat ? enemyAnalytics.primaryThreat.id : 'NONE',
        dangerScore: enemyAnalytics.primaryThreat ? enemyAnalytics.primaryThreat.dangerScore : 0,
        targetCoord: policyTag || (this._lastClickCell || (this._decision ? this._decision.action : '—')),
        smoothingLock: blockWhy
          ? `BLOCK:${blockWhy}`
          : (didAttack
            ? `${pathTag || 'int'} ${policyTag || 'ok'}`
            : `free=${freePct}% crush=${crushN}`),
        waves: `${waveCount}×${Math.round(commitRatio * 100)}% ${pathTag || modeLabel}${(this._reserveDebug && !this._reserveDebug.canAfford) ? ' HOLD' : ''}`,
        pincer: this.matchArmed
          ? (actMode.indexOf('CLICK') >= 0 || actMode === 'HYBRID' ? 'VH-CLICK' : 'NO-MOUSE')
          : 'STANDBY',
        hint: !this.matchArmed
          ? 'STANDBY. Play → spawn on map. Adaptive troop% arms with engine.'
          : `WIN#1 ${(this._decision && this._decision.isLeading) ? 'LEAD' : ('rank' + (this._decision && this._decision.rank || '?'))} · ${(this._decision && this._decision.action) || '—'} ${(this._decision && this._decision.reason) || ''} · ${Math.round(commitRatio * 100)}% · bal=${balN}`
      });
    }
  }

  window.TerritorialMasterOrchestrator = TerritorialMasterOrchestrator;
  window.TerritorialEngineV5 = new TerritorialMasterOrchestrator();
  window.TerritorialEngineV5.init();
  window.__TIO_AGENT_VERSION__ = AGENT_VERSION;

  console.log(`%c[TIO v${AGENT_VERSION}] Internal single-player mode.`, 'color: #10b981; font-weight: bold;');
})();
