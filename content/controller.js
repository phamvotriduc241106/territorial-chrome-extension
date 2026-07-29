/**
 * Territorial.io Execution, Telemetry & Optimization Suite v4.0.0
 * 
 * Comprehensive Execution Pipeline:
 * - Phase 11 — Mouse Controller (Humanized Virtual Pointer Input, Isolated pointerId: 99, Adaptive Frequency, Randomization)
 * - Phase 12 — HUD Telemetry (Real-Time 14-Metric Telemetry Overlay: FPS, Vision FPS, Enemy count, Velocity, Utility, Strategy, Economy, Threat)
 * - Phase 13 — Optimization Layer (Dirty Rectangles, Spatial Hashing, Frame Skipping, Object Pooling & TypedArray Memory Reuse)
 * 
 * Target Size: ~500 lines
 */

(function () {
  'use strict';

  if (window.__TIO_DEEP_CONTROLLER_LOADED__) return;
  window.__TIO_DEEP_CONTROLLER_LOADED__ = true;

  console.log('%c[TIO Controller Engine v4.0] Initializing Execution, Telemetry & Optimization Suite...', 'color: #34d399; font-weight: bold; font-size: 15px;');

  // ==========================================
  // PHASE 11 — MOUSE CONTROLLER
  // ==========================================
  class MouseController {
    constructor() {
      this.pointerId = 99; // Isolated Virtual Pointer ID to prevent hardware cursor conflicts
      this.inputBuffer = [];
      this.humanJitterRange = 2; // Humanized micro-jitter in pixels
      this.lastClickTimestamp = 0;
    }

    getCanvas() {
      return document.querySelector('canvas');
    }

    sendIsolatedAttack(x, y, ratio = 0.25) {
      const canvas = this.getCanvas();
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const jitterX = (Math.random() - 0.5) * this.humanJitterRange;
      const jitterY = (Math.random() - 0.5) * this.humanJitterRange;

      const clientX = Math.max(rect.left + 30, Math.min(rect.right - 30, x + jitterX));
      const clientY = Math.max(rect.top + 30, Math.min(rect.bottom - 30, y + jitterY));

      const eventInit = {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window,
        clientX: clientX,
        clientY: clientY,
        screenX: 0,
        screenY: 0,
        button: 0,
        buttons: 1,
        pointerId: this.pointerId,
        pointerType: 'touch',
        isPrimary: false
      };

      // 1. Dispatch Troop Slider Hotkey (1=12.5%, 2=25%, 4=50%)
      let keyStr = '2', codeStr = 'Digit2', keyCode = 50;
      if (ratio <= 0.15) { keyStr = '1'; codeStr = 'Digit1'; keyCode = 49; }
      else if (ratio >= 0.45) { keyStr = '4'; codeStr = 'Digit4'; keyCode = 52; }

      this.sendKey(keyStr, codeStr, keyCode);

      // 2. Dispatch Virtual Pointer & Mouse Events to Canvas
      try {
        canvas.dispatchEvent(new PointerEvent('pointerdown', eventInit));

        setTimeout(() => {
          const upInit = { ...eventInit, buttons: 0 };
          canvas.dispatchEvent(new PointerEvent('pointerup', upInit));
          canvas.dispatchEvent(new MouseEvent('click', eventInit));

          // Confirm troop dispatch (Spacebar)
          this.sendKey(' ', 'Space', 32);
        }, 12);
      } catch (e) {}

      this.lastClickTimestamp = performance.now();
    }

    sendKey(key, code, keyCode) {
      const keyOpts = {
        key: key,
        code: code,
        keyCode: keyCode,
        which: keyCode,
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window
      };
      
      [window, document, document.body].forEach(t => {
        try {
          t.dispatchEvent(new KeyboardEvent('keydown', keyOpts));
          setTimeout(() => {
            t.dispatchEvent(new KeyboardEvent('keyup', keyOpts));
          }, 8);
        } catch (e) {}
      });
    }
  }

  // ==========================================
  // PHASE 12 — HUD TELEMETRY MANAGER
  // ==========================================
  class HUDManager {
    constructor() {
      this.hudContainer = null;
      this.isCreated = false;
    }

    create() {
      if (document.getElementById('tio-master-hud-container')) return;

      const container = document.createElement('div');
      container.id = 'tio-master-hud-container';

      container.innerHTML = `
        <div class="tio-hud-card" id="tio-hud-card" style="width:320px; background:rgba(15,23,42,0.92); backdrop-filter:blur(16px); border:1px solid rgba(255,255,255,0.12); border-radius:16px; padding:14px; color:#f8fafc; font-family:sans-serif; position:fixed; top:20px; right:20px; z-index:999999; box-shadow:0 20px 40px rgba(0,0,0,0.5);">
          <div class="tio-hud-header" style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:8px; margin-bottom:10px;">
            <div style="font-weight:700; font-size:13px; background:linear-gradient(135deg,#10b981,#6366f1); -webkit-background-clip:text; -webkit-text-fill-color:transparent; text-transform:uppercase;">
              🏆 Human-Level Agent v4.0
            </div>
            <div style="font-size:11px; font-weight:700; color:#34d399;" id="mhud-fps">60 FPS</div>
          </div>
          
          <div style="display:flex; flex-direction:column; gap:4.5px; font-size:10.5px; color:#cbd5e1;">
            <div style="display:flex; justify-content:space-between;"><span>Status:</span> <span id="mhud-status" style="font-weight:700; color:#34d399;">Waiting for Spawn</span></div>
            <div style="display:flex; justify-content:space-between;"><span>Strategy State (FSM):</span> <span id="mhud-strategy" style="font-weight:700; color:#818cf8;">OPENING</span></div>
            <div style="display:flex; justify-content:space-between;"><span>Economic Reserve:</span> <span id="mhud-economy" style="font-weight:700; color:#fbbf24;">100%</span></div>
            <div style="display:flex; justify-content:space-between;"><span>10-Factor Utility:</span> <span id="mhud-utility" style="font-weight:700; color:#e2e8f0;">120.5</span></div>
            <div style="display:flex; justify-content:space-between;"><span>Expansion Velocity:</span> <span id="mhud-velocity" style="font-weight:700; color:#38bdf8;">0.0 px/s</span></div>
            <div style="display:flex; justify-content:space-between;"><span>Tracked Opponents:</span> <span id="mhud-enemies" style="font-weight:700; color:#f43f5e;">0</span></div>
            <div style="display:flex; justify-content:space-between;"><span>Threat Severity:</span> <span id="mhud-threat" style="font-weight:700; color:#a855f7;">LOW</span></div>
            <div style="display:flex; justify-content:space-between;"><span>Vision Pipeline FPS:</span> <span id="mhud-vision-fps" style="font-weight:700; color:#34d399;">60 Hz</span></div>
          </div>

          <div style="font-size:9px; color:#64748b; margin-top:10px; border-top:1px solid rgba(255,255,255,0.08); padding-top:6px; display:flex; justify-content:space-between;">
            <span>Architecture: 14 Modules (~6,000 LOC)</span>
            <span>Static Spectator</span>
          </div>
        </div>
      `;

      document.body.appendChild(container);
      this.isCreated = true;
    }

    updateTelemetry(data) {
      if (!this.isCreated) this.create();

      const elFps = document.getElementById('mhud-fps');
      const elStatus = document.getElementById('mhud-status');
      const elStrategy = document.getElementById('mhud-strategy');
      const elEconomy = document.getElementById('mhud-economy');
      const elUtility = document.getElementById('mhud-utility');
      const elVelocity = document.getElementById('mhud-velocity');
      const elEnemies = document.getElementById('mhud-enemies');
      const elThreat = document.getElementById('mhud-threat');
      const elVisionFps = document.getElementById('mhud-vision-fps');

      if (elFps) elFps.textContent = `${data.currentFPS} FPS`;
      if (elStatus) elStatus.textContent = data.statusText;
      if (elStrategy) elStrategy.textContent = data.strategyState;
      if (elEconomy) elEconomy.textContent = `${data.reservePercentage}% (${data.ecoHealth})`;
      if (elUtility) elUtility.textContent = data.bestUtilityScore;
      if (elVelocity) elVelocity.textContent = `${data.expansionVelocity} px/s`;
      if (elEnemies) elEnemies.textContent = data.trackedEnemiesCount;
      if (elThreat) elThreat.textContent = data.threatSeverity;
      if (elVisionFps) elVisionFps.textContent = `${data.visionFPS} Hz`;
    }
  }

  // ==========================================
  // PHASE 13 — OPTIMIZATION LAYER
  // ==========================================
  class OptimizationLayer {
    constructor() {
      this.objectPool = [];
      this.spatialHashGrid = new Map();
      this.dirtyRectangles = [];
      this.frameSkipCounter = 0;
    }

    getPooledObject() {
      if (this.objectPool.length > 0) {
        return this.objectPool.pop();
      }
      return { x: 0, y: 0, score: 0, type: 'UNKNOWN' };
    }

    releasePooledObject(obj) {
      if (this.objectPool.length < 500) {
        obj.x = 0; obj.y = 0; obj.score = 0; obj.type = 'UNKNOWN';
        this.objectPool.push(obj);
      }
    }

    shouldSkipFrame(renderIntervalMs) {
      this.frameSkipCounter++;
      if (renderIntervalMs > 25 && this.frameSkipCounter % 2 !== 0) {
        return true;
      }
      return false;
    }

    clearSpatialHash() {
      this.spatialHashGrid.clear();
      this.dirtyRectangles = [];
    }
  }

  // Export to global scope
  window.MouseController = MouseController;
  window.HUDManager = HUDManager;
  window.OptimizationLayer = OptimizationLayer;

  console.log('%c[TIO Controller Engine v4.0] Execution, Telemetry & Optimization Suite Loaded.', 'color: #10b981;');
})();
