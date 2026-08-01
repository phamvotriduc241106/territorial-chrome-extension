/**
 * Territorial.io HUD Engine v6.4.0
 * Always-visible top-right panel (forced above game canvas).
 */
(function () {
  'use strict';

  if (window.__TIO_HUD_ENGINE_V5_LOADED__) return;
  window.__TIO_HUD_ENGINE_V5_LOADED__ = true;

  const HUD_VERSION = '9.9.9';

  class TimestampFormatter {
    static getFormattedTimestamp() {
      const now = new Date();
      const p = (n) => String(n).padStart(2, '0');
      return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`;
    }
  }

  class HUDEngine {
    constructor() {
      this.container = null;
      this.isInitialized = false;
      this.version = HUD_VERSION;
      this.lastRenderTimeMs = 0;
      this._watchdog = null;
    }

    init() {
      // Always re-ensure panel exists and is visible (game may wipe DOM)
      this.ensurePanel();
      if (!this._watchdog) {
        this._watchdog = setInterval(() => this.ensurePanel(), 2000);
      }
      this.isInitialized = true;
    }

    ensurePanel() {
      let panel = document.getElementById('tio-hud-v5-panel');
      let styleEl = document.getElementById('tio-hud-style-v6');

      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'tio-hud-style-v6';
        styleEl.textContent = this._css();
        (document.head || document.documentElement).appendChild(styleEl);
      }

      if (!panel || !document.body.contains(panel)) {
        if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
        panel = document.createElement('div');
        panel.id = 'tio-hud-v5-panel';
        panel.setAttribute('data-tio-hud', '1');
        panel.innerHTML = this._html();
        const host = document.body || document.documentElement;
        host.appendChild(panel);
      }

      // Force visibility every ensure (game CSS can fight us)
      panel.style.cssText = [
        'display:block',
        'visibility:visible',
        'opacity:1',
        'position:fixed',
        'top:12px',
        'right:12px',
        'left:auto',
        'bottom:auto',
        'width:360px',
        'max-width:min(360px, calc(100vw - 24px))',
        'z-index:2147483646',
        'pointer-events:none',
        'transform:none',
        'margin:0',
        'box-sizing:border-box'
      ].join(';');

      this.container = panel;
      const ver = panel.querySelector('#tio-hud-version');
      if (ver) ver.textContent = `v${this.version}`;
    }

    _css() {
      return `
        .tio-crosshair-overlay, #tio-crosshair, .tio-crosshair {
          display: none !important;
        }
        #tio-hud-v5-panel {
          position: fixed !important;
          top: 12px !important;
          right: 12px !important;
          left: auto !important;
          width: 360px !important;
          max-width: min(360px, calc(100vw - 24px)) !important;
          background: rgba(15, 23, 42, 0.94) !important;
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(56, 189, 248, 0.55) !important;
          border-radius: 12px !important;
          box-shadow: 0 8px 28px rgba(0,0,0,0.65) !important;
          color: #e2e8f0 !important;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
          font-size: 11px !important;
          padding: 12px 14px !important;
          z-index: 2147483646 !important;
          user-select: none !important;
          pointer-events: none !important;
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
        }
        #tio-hud-v5-panel .tio-hud-title-bar {
          display: flex; justify-content: space-between; align-items: flex-start;
          border-bottom: 1px solid rgba(56, 189, 248, 0.3);
          padding-bottom: 8px; margin-bottom: 8px; gap: 8px;
        }
        #tio-hud-v5-panel .tio-hud-brand-main {
          font-size: 12px; font-weight: 700; color: #38bdf8; letter-spacing: 0.3px;
        }
        #tio-hud-v5-panel .tio-hud-version-badge {
          display: inline-block; margin-top: 3px; padding: 1px 7px; border-radius: 4px;
          background: rgba(16, 185, 129, 0.2); border: 1px solid rgba(16, 185, 129, 0.5);
          color: #34d399; font-size: 10px; font-weight: 700;
        }
        #tio-hud-v5-panel .tio-hud-fps { color: #94a3b8; font-size: 10px; white-space: nowrap; }
        #tio-hud-v5-panel .tio-hud-timestamp {
          font-size: 10px; color: #64748b; margin-bottom: 8px; text-align: right;
        }
        #tio-hud-v5-panel .tio-hud-grid {
          display: grid; grid-template-columns: 1fr 1fr; gap: 6px 10px;
        }
        #tio-hud-v5-panel .tio-hud-label {
          color: #64748b; font-size: 9px; text-transform: uppercase;
        }
        #tio-hud-v5-panel .tio-hud-value {
          color: #f8fafc; font-weight: 600; font-size: 11px; word-break: break-word;
        }
        #tio-hud-v5-panel .tio-hud-state-badge {
          display: inline-block; padding: 2px 6px; border-radius: 4px;
          background: rgba(59, 130, 246, 0.22); color: #60a5fa;
          border: 1px solid rgba(59, 130, 246, 0.45); font-weight: 700; font-size: 10px;
        }
        #tio-hud-v5-panel .tio-hud-hint {
          margin-top: 8px; padding-top: 6px; border-top: 1px solid rgba(148,163,184,0.25);
          font-size: 9px; color: #94a3b8; line-height: 1.35;
        }
      `;
    }

    _html() {
      return `
        <div class="tio-hud-title-bar">
          <div class="tio-hud-brand">
            <div class="tio-hud-brand-main">TIO INTERNAL SP</div>
            <span class="tio-hud-version-badge" id="tio-hud-version">v${HUD_VERSION}</span>
          </div>
          <span class="tio-hud-fps" id="tio-hud-fps">FPS: --</span>
        </div>
        <div class="tio-hud-timestamp" id="tio-hud-time">--</div>
        <div class="tio-hud-grid">
          <div class="tio-hud-item">
            <span class="tio-hud-label">Phase / FSM</span>
            <span class="tio-hud-value"><span class="tio-hud-state-badge" id="tio-hud-state">IDLE</span></span>
          </div>
          <div class="tio-hud-item">
            <span class="tio-hud-label">Stance</span>
            <span class="tio-hud-value" id="tio-hud-aggr">--</span>
          </div>
          <div class="tio-hud-item">
            <span class="tio-hud-label">Eco / Density</span>
            <span class="tio-hud-value" id="tio-hud-eco">--</span>
          </div>
          <div class="tio-hud-item">
            <span class="tio-hud-label">My Area</span>
            <span class="tio-hud-value" id="tio-hud-area">0</span>
          </div>
          <div class="tio-hud-item">
            <span class="tio-hud-label">Compactness</span>
            <span class="tio-hud-value" id="tio-hud-compact">1.000</span>
          </div>
          <div class="tio-hud-item">
            <span class="tio-hud-label">Est. Troops</span>
            <span class="tio-hud-value" id="tio-hud-troops">0</span>
          </div>
          <div class="tio-hud-item">
            <span class="tio-hud-label">Area Δ / sec</span>
            <span class="tio-hud-value" id="tio-hud-growth">0.0</span>
          </div>
          <div class="tio-hud-item">
            <span class="tio-hud-label">Land ROI</span>
            <span class="tio-hud-value" id="tio-hud-roi">0.00x</span>
          </div>
          <div class="tio-hud-item">
            <span class="tio-hud-label">Foes</span>
            <span class="tio-hud-value" id="tio-hud-foes">0</span>
          </div>
          <div class="tio-hud-item">
            <span class="tio-hud-label">Primary Threat</span>
            <span class="tio-hud-value" id="tio-hud-threat">NONE</span>
          </div>
          <div class="tio-hud-item">
            <span class="tio-hud-label">Danger</span>
            <span class="tio-hud-value" id="tio-hud-danger">0.000</span>
          </div>
          <div class="tio-hud-item">
            <span class="tio-hud-label">Target</span>
            <span class="tio-hud-value" id="tio-hud-target">NONE</span>
          </div>
          <div class="tio-hud-item">
            <span class="tio-hud-label">Pulse</span>
            <span class="tio-hud-value" id="tio-hud-waves">--</span>
          </div>
          <div class="tio-hud-item">
            <span class="tio-hud-label">Policy</span>
            <span class="tio-hud-value" id="tio-hud-pincer">HARD≈29%</span>
          </div>
          <div class="tio-hud-item" style="grid-column: span 2;">
            <span class="tio-hud-label">Lock / Gate</span>
            <span class="tio-hud-value" id="tio-hud-lock">IDLE</span>
          </div>
        </div>
        <div class="tio-hud-hint" id="tio-hud-hint">
          v7.2: bot idle until YOU pick spawn on the map. Clicks only inside playable area (never UI buttons). Z toggles.
        </div>
      `;
    }

    setVersion(ver) {
      this.version = ver || HUD_VERSION;
      this.ensurePanel();
      const el = document.getElementById('tio-hud-version');
      if (el) el.textContent = `v${this.version}`;
    }

    updateDashboard(telemetry) {
      this.ensurePanel();
      const start = performance.now();
      const setText = (id, text) => {
        const el = document.getElementById(id);
        if (el && text !== undefined && text !== null) el.textContent = String(text);
      };

      setText('tio-hud-time', TimestampFormatter.getFormattedTimestamp());
      if (telemetry.version) this.setVersion(telemetry.version);
      else setText('tio-hud-version', `v${this.version}`);

      if (telemetry.fps !== undefined) setText('tio-hud-fps', `FPS: ${telemetry.fps}`);
      if (telemetry.state) setText('tio-hud-state', telemetry.state);
      if (telemetry.aggression) setText('tio-hud-aggr', telemetry.aggression);
      if (telemetry.ecoHealth) setText('tio-hud-eco', telemetry.ecoHealth);
      if (telemetry.myArea !== undefined) setText('tio-hud-area', Number(telemetry.myArea).toLocaleString());
      if (telemetry.compactness !== undefined) setText('tio-hud-compact', Number(telemetry.compactness).toFixed(3));
      if (telemetry.troopBalance !== undefined) setText('tio-hud-troops', Math.round(telemetry.troopBalance).toLocaleString());
      if (telemetry.growthPerSec !== undefined) {
        const g = Number(telemetry.growthPerSec);
        setText('tio-hud-growth', `${g >= 0 ? '+' : ''}${g.toFixed(1)}/s`);
      }
      if (telemetry.attackROI !== undefined) setText('tio-hud-roi', `${Number(telemetry.attackROI).toFixed(2)}x`);
      if (telemetry.enemyCount !== undefined) setText('tio-hud-foes', telemetry.enemyCount);
      if (telemetry.primaryThreat) setText('tio-hud-threat', telemetry.primaryThreat);
      if (telemetry.dangerScore !== undefined) setText('tio-hud-danger', Number(telemetry.dangerScore).toFixed(3));
      if (telemetry.targetCoord) setText('tio-hud-target', telemetry.targetCoord);
      if (telemetry.waves) setText('tio-hud-waves', telemetry.waves);
      if (telemetry.pincer) setText('tio-hud-pincer', telemetry.pincer);
      if (telemetry.smoothingLock) setText('tio-hud-lock', telemetry.smoothingLock);
      if (telemetry.hint) setText('tio-hud-hint', telemetry.hint);

      this.lastRenderTimeMs = parseFloat((performance.now() - start).toFixed(2));
    }

    renderOverlay() {}
  }

  window.TimestampFormatter = TimestampFormatter;
  window.HUDEngine = HUDEngine;
  window.__TIO_AGENT_VERSION__ = HUD_VERSION;

  // Early mount if body already ready
  if (document.body) {
    try {
      const h = new HUDEngine();
      h.init();
      window.__TIO_HUD_EARLY__ = h;
    } catch (_) {}
  }

  console.log(`%c[TIO HUD v${HUD_VERSION}] Forced top-right panel.`, 'color: #10b981;');
})();
