/**
 * Territorial.io Master Engine v1.7.1
 * 
 * Clean Spectator View:
 * - Completely removed green crosshair overlay element.
 * - Virtual Pointer Isolation (pointerId: 99).
 * - Smart 24-Point Frontier Scanner.
 * - 25% Troop Expansion Power.
 * - Static Spectator Camera.
 * 
 * Update Timestamp: 2026-07-29 17:57:13 +07:00
 */

(function () {
  'use strict';

  if (window.__TIO_MASTER_ENGINE_LOADED__) return;
  window.__TIO_MASTER_ENGINE_LOADED__ = true;

  const LAST_UPDATE_TIMESTAMP = '2026-07-29 17:57:13 +07:00';
  console.log(`%c[Territorial Master Engine] v1.7.1 Active (Updated: ${LAST_UPDATE_TIMESTAMP})`, 'color: #10b981; font-weight: bold; font-size: 14px;');

  // --- ENGINE STATE ---
  const state = {
    botEnabled: true,
    gameStarted: false,
    clickSpeed: 4, // 4 CPS smooth pacing
    angleStep: 0,
    currentFPS: 60,
    spawnPos: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
    borderRadius: 60
  };

  let loopTimer = null;
  let canvasContextCache = null;

  // --- FPS MONITOR ---
  const FPSMonitor = {
    frameCount: 0,
    lastTime: performance.now(),

    start() {
      const calcFPS = (now) => {
        this.frameCount++;
        if (now >= this.lastTime + 1000) {
          state.currentFPS = Math.round((this.frameCount * 1000) / (now - this.lastTime));
          this.frameCount = 0;
          this.lastTime = now;
          HUD.updateFPS(state.currentFPS);
        }
        requestAnimationFrame(calcFPS);
      };
      requestAnimationFrame(calcFPS);
    }
  };

  // --- SMART BORDER & TERRAIN SCANNER ---
  const SmartBorderScanner = {
    getCanvasContext() {
      const canvas = document.querySelector('canvas');
      if (!canvas) return null;
      try {
        if (!canvasContextCache || canvasContextCache.canvas !== canvas) {
          canvasContextCache = canvas.getContext('2d', { willReadFrequently: true });
        }
        return canvasContextCache;
      } catch (e) {
        return null;
      }
    },

    findBestFrontierTarget(anchorX, anchorY) {
      const ctx = this.getCanvasContext();
      const radius = state.borderRadius;
      
      state.borderRadius = Math.min(window.innerWidth * 0.35, state.borderRadius + 0.15);

      let bestTarget = null;
      let bestScore = -1;

      for (let i = 0; i < 24; i++) {
        const angle = (i * Math.PI / 12) + state.angleStep;
        const testX = Math.max(40, Math.min(window.innerWidth - 40, anchorX + Math.cos(angle) * radius));
        const testY = Math.max(40, Math.min(window.innerHeight - 40, anchorY + Math.sin(angle) * radius));

        let score = 10;

        if (ctx) {
          try {
            const pixel = ctx.getImageData(Math.round(testX), Math.round(testY), 1, 1).data;
            const r = pixel[0], g = pixel[1], b = pixel[2];

            if (b > r + 20 && b > g + 20) {
              score = -100;
            } else {
              const maxDiff = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
              if (maxDiff < 25 && r > 40 && r < 200) {
                score = 50;
              }
            }
          } catch (e) {}
        }

        if (score > bestScore) {
          bestScore = score;
          bestTarget = { x: testX, y: testY };
        }
      }

      state.angleStep += 0.25;
      return bestTarget || { x: anchorX + 60, y: anchorY + 60 };
    }
  };

  // --- GAME START DETECTOR & SPAWN TRACKER ---
  const GameDetector = {
    init() {
      document.addEventListener('click', (e) => {
        if (e.target && e.target.tagName === 'CANVAS') {
          state.spawnPos.x = e.clientX;
          state.spawnPos.y = e.clientY;

          if (!state.gameStarted) {
            console.log(`[Territorial Engine] Game Match Active! Spawn set to (${e.clientX}, ${e.clientY})`);
            state.gameStarted = true;
            HUD.updateStatus('🔥 MATCH ACTIVE (SMART BOT)', 'active');
            Engine.start();
          }
        }
      }, true);
    }
  };

  // --- VIRTUAL POINTER DIRECT INPUT CONTROLLER ---
  const VirtualPointerInput = {
    getCanvas() {
      return document.querySelector('canvas');
    },

    sendVirtualAttack(x, y) {
      const canvas = this.getCanvas();
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const clientX = Math.max(rect.left + 30, Math.min(rect.right - 30, x));
      const clientY = Math.max(rect.top + 30, Math.min(rect.bottom - 30, y));

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
        pointerId: 99,
        pointerType: 'touch',
        isPrimary: false
      };

      // Set Troop Slider Ratio (Key '2' = 25% troops)
      this.sendKey('2', 'Digit2', 50);

      // Dispatch Virtual Pointer Events to Canvas
      try {
        canvas.dispatchEvent(new PointerEvent('pointerdown', eventInit));

        setTimeout(() => {
          const upInit = { ...eventInit, buttons: 0 };
          canvas.dispatchEvent(new PointerEvent('pointerup', upInit));
          canvas.dispatchEvent(new MouseEvent('click', eventInit));

          // Confirm troop dispatch
          this.sendKey(' ', 'Space', 32);
        }, 15);
      } catch (e) {}
    },

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
          }, 10);
        } catch (e) {}
      });
    }
  };

  // --- AUTOMATION ENGINE ---
  const Engine = {
    start() {
      if (loopTimer) clearInterval(loopTimer);
      const intervalMs = Math.max(160, Math.round(1000 / state.clickSpeed));
      loopTimer = setInterval(() => {
        this.tick();
      }, intervalMs);
    },

    stop() {
      if (loopTimer) {
        clearInterval(loopTimer);
        loopTimer = null;
      }
    },

    tick() {
      if (!state.botEnabled || !state.gameStarted) return;

      const target = SmartBorderScanner.findBestFrontierTarget(state.spawnPos.x, state.spawnPos.y);

      VirtualPointerInput.sendVirtualAttack(target.x, target.y);
    }
  };

  // --- FLOATING HUD UI ---
  const HUD = {
    create() {
      if (document.getElementById('tio-hud-container')) return;

      const container = document.createElement('div');
      container.id = 'tio-hud-container';

      container.innerHTML = `
        <div class="tio-hud-card" id="tio-hud-card">
          <div class="tio-hud-header">
            <div class="tio-hud-title">
              <div class="tio-status-dot" id="tio-status-dot"></div>
              <span id="tio-status-text">Click Map to Spawn & Start</span>
            </div>
            <div style="font-size:11px; font-weight:700; color:#34d399;" id="tio-fps-counter">60 FPS</div>
          </div>
          <div class="tio-hud-body">
            <div class="tio-btn-grid">
              <button class="tio-action-btn active" id="tio-btn-bot">
                <span>👑 Master Engine v1.7.1</span>
              </button>
            </div>
            <div class="tio-slider-label" style="font-size:10px; color:#94a3b8; margin-top:4px;">
              <span>• Clean Spectator View (No Crosshair)</span><br>
              <span>• Virtual Pointer (Zero Mouse Conflict)</span><br>
              <span>• Smart 24-Point Frontier Scanner</span><br>
              <span>• 25% Troop Expansion Power</span>
            </div>
            <div style="font-size:9px; color:#64748b; margin-top:6px; border-top:1px solid rgba(255,255,255,0.08); padding-top:4px;">
              <span>Updated: ${LAST_UPDATE_TIMESTAMP}</span>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(container);
    },

    updateStatus(text, type) {
      const statusText = document.getElementById('tio-status-text');
      const dot = document.getElementById('tio-status-dot');
      if (statusText) statusText.textContent = text;
      if (dot) {
        dot.className = `tio-status-dot ${type === 'active' ? 'active' : ''}`;
      }
    },

    updateFPS(fps) {
      const counter = document.getElementById('tio-fps-counter');
      if (counter) {
        counter.textContent = `${fps} FPS`;
      }
    }
  };

  // Launch Engine
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(() => {
      HUD.create();
      GameDetector.init();
      FPSMonitor.start();
    }, 800);
  } else {
    window.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => {
        HUD.create();
        GameDetector.init();
        FPSMonitor.start();
      }, 800);
    });
  }
})();
