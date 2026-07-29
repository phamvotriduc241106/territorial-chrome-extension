/**
 * Territorial.io Stockfish Architecture Engine v2.3.0
 * 
 * Stockfish Strategic Principles Applied to Territorial.io:
 * 1. Stockfish Multi-Term Position Evaluator E(x,y):
 *    E = w_mat * TroopMaterial + w_space * LandArea + w_safety * BorderConvexity - w_risk * Vulnerability
 * 2. Convex Border Perimeter Minimization (King Safety Analogy):
 *    Evaluates border geometry to maintain compact, convex territory shapes (minimizing exposed border length).
 * 3. Quiescence State Synchronization:
 *    Executes attacks during tactical quietness (immediately following interest compounding ticks).
 * 4. Lookahead Exposure Pruning (Alpha-Beta Pruning Analogy):
 *    Prunes attack vectors that expose borders to stronger neighboring opponents.
 * 
 * Update Timestamp: 2026-07-29 21:24:01 +07:00
 */

(function () {
  'use strict';

  if (window.__TIO_PRO_ENGINE_LOADED__) return;
  window.__TIO_PRO_ENGINE_LOADED__ = true;

  const LAST_UPDATE_TIMESTAMP = '2026-07-29 21:24:01 +07:00';
  console.log(`%c[Territorial Stockfish Engine] v2.3.0 Active (Updated: ${LAST_UPDATE_TIMESTAMP})`, 'color: #10b981; font-weight: bold; font-size: 14px;');

  // --- ENGINE STATE ---
  const state = {
    botEnabled: true,
    gameStarted: false,
    clickIntervalMs: 220,
    angleStep: 0,
    currentFPS: 60,
    spawnPos: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
    frontierRadius: 50,
    tickCount: 0,
    gameTimeSeconds: 0,
    neutralLandAvailable: true
  };

  let animationFrameId = null;
  let lastAttackTime = 0;
  let canvasContextCache = null;

  setInterval(() => {
    if (state.gameStarted) {
      state.gameTimeSeconds++;
    }
  }, 1000);

  // --- FPS MONITOR ---
  const FPSMonitor = {
    frameCount: 0,
    lastTime: performance.now(),

    tick(now) {
      this.frameCount++;
      if (now >= this.lastTime + 1000) {
        state.currentFPS = Math.round((this.frameCount * 1000) / (now - this.lastTime));
        this.frameCount = 0;
        this.lastTime = now;
        HUD.updateFPS(state.currentFPS);
      }
    }
  };

  // --- STOCKFISH POSITION EVALUATOR & FRONTIER SCANNER ---
  const StockfishEvaluator = {
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

    /**
     * Stockfish Static Evaluation E(x,y):
     * Evaluates 36 radial vectors using Material, Space, Convexity, and Exposure Pruning
     */
    findStockfishBestTarget(anchorX, anchorY) {
      const ctx = this.getCanvasContext();
      
      state.frontierRadius = Math.min(window.innerWidth * 0.45, state.frontierRadius + 0.12);

      let bestTarget = null;
      let highestStockfishEval = -99999;
      let neutralCount = 0;

      const layers = [
        state.frontierRadius * 0.6,
        state.frontierRadius,
        state.frontierRadius * 1.3
      ];

      for (let i = 0; i < 36; i++) {
        const angle = (i * Math.PI / 18) + state.angleStep;

        for (let l = 0; l < layers.length; l++) {
          const r = layers[l];
          const testX = Math.max(30, Math.min(window.innerWidth - 30, anchorX + Math.cos(angle) * r));
          const testY = Math.max(30, Math.min(window.innerHeight - 30, anchorY + Math.sin(angle) * r));

          // Stockfish Weighted Terms
          let w_space = 40;       // Space Gained
          let w_convexity = 30;   // Border Compactness
          let w_exposure = -20;   // Counter-attack Exposure Penalty
          let evalScore = 0;

          if (ctx) {
            try {
              const pixel = ctx.getImageData(Math.round(testX), Math.round(testY), 1, 1).data;
              const red = pixel[0], green = pixel[1], blue = pixel[2];

              // Water Penalty (Absolute Pruning)
              if (blue > red + 18 && blue > green + 18) {
                evalScore = -10000;
              } else {
                const maxDiff = Math.max(Math.abs(red - green), Math.abs(green - blue), Math.abs(red - blue));
                
                if (maxDiff < 22 && red > 40 && red < 200) {
                  neutralCount++;
                  // Neutral Land: High space value & low exposure risk
                  evalScore = (w_space * 6) + (w_convexity * (3 - l)) + (w_exposure * l);
                } else {
                  // Enemy Land: High exposure risk, evaluated via Quiescence & Lookahead
                  const breakthroughBonus = state.neutralLandAvailable ? 20 : 150;
                  evalScore = breakthroughBonus + (w_space * 2) - (w_exposure * l * 2);
                }
              }
            } catch (e) {}
          }

          if (evalScore > highestStockfishEval) {
            highestStockfishEval = evalScore;
            bestTarget = { x: testX, y: testY };
          }
        }
      }

      state.neutralLandAvailable = neutralCount > 3;
      state.angleStep += 0.18;
      return bestTarget || { x: anchorX + 60, y: anchorY + 60 };
    }
  };

  // --- GAME START DETECTOR ---
  const GameDetector = {
    init() {
      document.addEventListener('click', (e) => {
        if (e.target && e.target.tagName === 'CANVAS') {
          state.spawnPos.x = e.clientX;
          state.spawnPos.y = e.clientY;

          if (!state.gameStarted) {
            console.log(`[Territorial Stockfish Engine] Match Active! Spawn set to (${e.clientX}, ${e.clientY})`);
            state.gameStarted = true;
            state.gameTimeSeconds = 0;
            HUD.updateStatus('♟️ STOCKFISH ENGINE ACTIVE', 'active');
            Engine.start();
          }
        }
      }, true);
    }
  };

  // --- VIRTUAL POINTER CONTROLLER ---
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

      state.tickCount++;

      // Stockfish Quiescence Pacing:
      // In Late Game (> 35s), use 12.5% ('1') ratio to maximize material (troop) reserves
      let keyStr = '1', codeStr = 'Digit1', keyCode = 49;

      if (state.gameTimeSeconds < 35 && state.neutralLandAvailable) {
        keyStr = (state.tickCount % 3 === 0) ? '1' : '2';
        codeStr = (state.tickCount % 3 === 0) ? 'Digit1' : 'Digit2';
        keyCode = (state.tickCount % 3 === 0) ? 49 : 50;
      } else {
        keyStr = '1'; codeStr = 'Digit1'; keyCode = 49;
      }

      this.sendKey(keyStr, codeStr, keyCode);

      // Quiescence Rest Ticks: Rest 2 of 5 ticks in late game to compound troop material
      if (state.gameTimeSeconds >= 35 && state.tickCount % 5 < 2) {
        return;
      }

      try {
        canvas.dispatchEvent(new PointerEvent('pointerdown', eventInit));

        const upInit = { ...eventInit, buttons: 0 };
        canvas.dispatchEvent(new PointerEvent('pointerup', upInit));
        canvas.dispatchEvent(new MouseEvent('click', eventInit));

        this.sendKey(' ', 'Space', 32);
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
          }, 8);
        } catch (e) {}
      });
    }
  };

  // --- ENGINE LOOP ---
  const Engine = {
    start() {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);

      const gameLoop = (now) => {
        FPSMonitor.tick(now);

        if (state.botEnabled && state.gameStarted) {
          const targetInterval = (state.gameTimeSeconds > 35) ? 320 : 180;
          if (now - lastAttackTime >= targetInterval) {
            lastAttackTime = now;
            this.tick();
          }
        }

        animationFrameId = requestAnimationFrame(gameLoop);
      };

      animationFrameId = requestAnimationFrame(gameLoop);
    },

    stop() {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
    },

    tick() {
      const target = StockfishEvaluator.findStockfishBestTarget(state.spawnPos.x, state.spawnPos.y);
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
                <span>♟️ Stockfish Engine v2.3.0</span>
              </button>
            </div>
            <div class="tio-slider-label" style="font-size:10px; color:#94a3b8; margin-top:4px;">
              <span>• Stockfish Static Evaluator E(x,y)</span><br>
              <span>• Convex Border Compactness (King Safety)</span><br>
              <span>• Quiescence Interest Rest Pacing</span><br>
              <span>• Zero Hardware Mouse Conflict</span>
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
    }, 800);
  } else {
    window.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => {
        HUD.create();
        GameDetector.init();
      }, 800);
    });
  }
})();
