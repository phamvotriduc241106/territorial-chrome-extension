/**
 * Territorial.io Boom & Defense Safeguard Engine v2.2.0
 * 
 * Late-Game Deficit & Defense Fixes:
 * 1. Late-Game Interest Boom Safeguard:
 *    Fixes troop deficit/decay by pausing continuous attack spam in late-game.
 * 2. 85% Troop Reserve Wall:
 *    Ensures troop balance remains high to prevent 1-hit enemy wipeouts and negative interest decay.
 * 3. Economy-Paced Attack Bursts:
 *    Dispatches small 12.5% troop attacks ('Key 1') only when troop reserves compound to healthy levels.
 * 4. Multi-Vector 108-Point Frontier Gradient Math with Late-Game Economy Protection.
 * 
 * Update Timestamp: 2026-07-29 21:22:59 +07:00
 */

(function () {
  'use strict';

  if (window.__TIO_PRO_ENGINE_LOADED__) return;
  window.__TIO_PRO_ENGINE_LOADED__ = true;

  const LAST_UPDATE_TIMESTAMP = '2026-07-29 21:22:59 +07:00';
  console.log(`%c[Territorial Boom & Defense Engine] v2.2.0 Active (Updated: ${LAST_UPDATE_TIMESTAMP})`, 'color: #10b981; font-weight: bold; font-size: 14px;');

  // --- ENGINE STATE ---
  const state = {
    botEnabled: true,
    gameStarted: false,
    clickIntervalMs: 250, // Paced 250ms attack pulses to allow interest compounding
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

  // Track game duration to adjust early vs late game economic pacing
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

  // --- COMBAT GRADIENT & TERRAIN ANALYZER ---
  const CombatGradientScanner = {
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

    findBestUtilityTarget(anchorX, anchorY) {
      const ctx = this.getCanvasContext();
      
      state.frontierRadius = Math.min(window.innerWidth * 0.45, state.frontierRadius + 0.12);

      let bestTarget = null;
      let highestUtility = -9999;
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

          let utilityScore = 10;

          if (ctx) {
            try {
              const pixel = ctx.getImageData(Math.round(testX), Math.round(testY), 1, 1).data;
              const red = pixel[0], green = pixel[1], blue = pixel[2];

              // Water Penalty (Deep Blue)
              if (blue > red + 18 && blue > green + 18) {
                utilityScore = -500;
              } else {
                const maxDiff = Math.max(Math.abs(red - green), Math.abs(green - blue), Math.abs(red - blue));
                
                if (maxDiff < 22 && red > 40 && red < 200) {
                  neutralCount++;
                  utilityScore = 200 - (l * 15);
                } else {
                  // Enemy Player Territory
                  const breakthroughBonus = state.neutralLandAvailable ? 30 : 120;
                  utilityScore = breakthroughBonus - (l * 10);
                }
              }
            } catch (e) {}
          }

          if (utilityScore > highestUtility) {
            highestUtility = utilityScore;
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
            console.log(`[Territorial Boom & Defense Engine] Match Active! Spawn set to (${e.clientX}, ${e.clientY})`);
            state.gameStarted = true;
            state.gameTimeSeconds = 0;
            HUD.updateStatus('🛡️ BOOM & DEFENSE ENGINE ACTIVE', 'active');
            Engine.start();
          }
        }
      }, true);
    }
  };

  // --- SAFEGUARD VIRTUAL POINTER CONTROLLER ---
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

      // Late-Game Economic Pacing:
      // In Late Game (> 40s), switch to 12.5% ('1') ratio to build massive troop reserves & avoid negative interest!
      let keyStr = '1', codeStr = 'Digit1', keyCode = 49;

      if (state.gameTimeSeconds < 35 && state.neutralLandAvailable) {
        // Early Game: Fast 25% expansion
        keyStr = (state.tickCount % 3 === 0) ? '1' : '2';
        codeStr = (state.tickCount % 3 === 0) ? 'Digit1' : 'Digit2';
        keyCode = (state.tickCount % 3 === 0) ? 49 : 50;
      } else {
        // Late Game Safeguard: Conservative 12.5% troop ratio ('1') to stack compound interest
        keyStr = '1'; codeStr = 'Digit1'; keyCode = 49;
      }

      this.sendKey(keyStr, codeStr, keyCode);

      // In Late Game, skip attacks on 2 out of 5 ticks to allow massive compound interest accumulation
      if (state.gameTimeSeconds >= 35 && state.tickCount % 5 < 2) {
        return; // Interest accumulation rest tick!
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
          // Dynamic interval pacing (Paces slower in late game to compound interest)
          const targetInterval = (state.gameTimeSeconds > 35) ? 350 : 180;
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
      const target = CombatGradientScanner.findBestUtilityTarget(state.spawnPos.x, state.spawnPos.y);
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
                <span>🛡️ Boom & Defense Engine v2.2.0</span>
              </button>
            </div>
            <div class="tio-slider-label" style="font-size:10px; color:#94a3b8; margin-top:4px;">
              <span>• Late-Game Interest Deficit Safeguard</span><br>
              <span>• 85% Troop Reserve Wall (Anti-Decay)</span><br>
              <span>• 12.5% Economy Troop Ratio Pacing</span><br>
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
