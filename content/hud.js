/**
 * Read-only map-first HUD. One style source: content/content.css + shared/ui.css.
 * Visibility is a preference; telemetry freshness never grants actuator authority.
 */
(function () {
  "use strict";
  if (window.__TIO_HUD_ENGINE_V5_LOADED__) return;
  window.__TIO_HUD_ENGINE_V5_LOADED__ = true;
  const CFG = window.TIOConfig;
  class TimestampFormatter {
    static getFormattedTimestamp() {
      return new Date().toLocaleString();
    }
  }
  class HUDEngine {
    constructor() {
      this.container = null;
      this.isInitialized = false;
      this.version = CFG.VERSION;
      this.mode = CFG.DEFAULT_SETTINGS.hudMode;
      this.provider = null;
      this.latest = null;
      this.lastRenderTimeMs = 0;
      this._watchdog = null;
    }
    init() {
      this.ensurePanel();
      this.isInitialized = true;
      if (!this._watchdog)
        this._watchdog = setInterval(() => this.render(), 1000);
    }
    setStatusProvider(provider) {
      this.provider = provider;
      this.render();
    }
    setPreferences(settings) {
      this.mode = CFG.HUD_MODES.includes(settings.hudMode)
        ? settings.hudMode
        : "compact";
      this.render();
    }
    ensurePanel() {
      let panel = document.getElementById("tio-hud-v5-panel");
      if (!panel) {
        panel = document.createElement("aside");
        panel.id = "tio-hud-v5-panel";
        panel.dataset.tioHud = "1";
        panel.setAttribute("aria-label", "Commander status");
        panel.hidden = true;
        panel.innerHTML =
          '<div class="tio-heading"><strong>COMMANDER</strong><span id="tio-hud-state"></span></div>' +
          '<dl class="tio-compact"><div><dt>Mode</dt><dd id="tio-hud-mode">Unavailable</dd></div>' +
          '<div><dt>Troops</dt><dd id="tio-hud-troops">Unavailable</dd></div>' +
          '<div><dt>Action</dt><dd id="tio-hud-action">Unavailable</dd></div></dl>' +
          '<div class="tio-detailed" id="tio-hud-detailed"><h2>Game</h2><dl>' +
          '<div><dt>Territory</dt><dd id="tio-hud-area"></dd></div><div><dt>Soft cap</dt><dd id="tio-hud-cap"></dd></div>' +
          '<div><dt>Telemetry age</dt><dd id="tio-hud-age"></dd></div></dl><h2>Planner</h2><dl>' +
          '<div><dt>Last policy / guard</dt><dd id="tio-hud-policy"></dd></div></dl><h2>Diagnostics</h2><dl>' +
          '<div><dt>Command path</dt><dd id="tio-hud-path"></dd></div>' +
          '<div><dt>Vision sampling FPS</dt><dd id="tio-hud-fps"></dd></div></dl>' +
          '<p id="tio-hud-engine-details"></p></div><p class="tio-hint">H: HUD mode · Z: pause</p>';
        (document.body || document.documentElement).appendChild(panel);
      }
      this.container = panel;
    }
    setVersion(ver) {
      this.version = ver || CFG.VERSION;
      this.render();
    }
    refreshEngineDetails() {
      this.render();
    }
    updateDashboard(telemetry) {
      this.latest = telemetry;
      this.render();
    }
    render() {
      const started = performance.now();
      this.ensurePanel();
      const status = this.provider ? this.provider() : null;
      const snapshotAge = status ? Date.now() - status.statusSampledAt : 0;
      const state = window.TIOPresentation.derivePresentationState(
        status,
        { botEnabled: status ? status.botEnabled : true },
        snapshotAge,
      );
      // Do not obscure the initial spawn. Detailed mode can inspect connection without intercepting clicks.
      this.container.hidden =
        this.mode === "hidden" ||
        !status ||
        (this.mode === "compact" && !status.armed && !status.inGame);
      this.container.dataset.mode = this.mode;
      this.container.dataset.state = state.key;
      const set = (id, text) => {
        const e = this.container.querySelector("#" + id);
        if (e && e.textContent !== String(text)) e.textContent = String(text);
      };
      const st = state.fresh ? status : null;
      set("tio-hud-state", state.label);
      const action = st && st.plannedAction;
      set(
        "tio-hud-mode",
        action === "expand"
          ? "Expanding"
          : action === "fight"
            ? "Combat"
            : action === "hold"
              ? "Holding"
              : "Waiting",
      );
      set(
        "tio-hud-troops",
        window.TIOPresentation.metric(
          st && st.balance,
          st && st.balanceProvenance,
        ),
      );
      set(
        "tio-hud-action",
        state.key === "playing"
          ? action === "hold"
            ? "Banking"
            : action === "fight"
              ? "Find safe target"
              : action === "expand"
                ? "Claim free land"
                : "Monitoring"
          : state.label,
      );
      set(
        "tio-hud-area",
        window.TIOPresentation.metric(
          st && st.territory,
          st && st.territoryProvenance,
        ),
      );
      set(
        "tio-hud-cap",
        window.TIOPresentation.metric(
          st && st.softCap,
          st && st.softCapProvenance,
        ),
      );
      set(
        "tio-hud-age",
        st && Number.isFinite(st.telemetryAgeMs)
          ? Math.round(st.telemetryAgeMs + snapshotAge) + " ms"
          : "Unavailable",
      );
      set(
        "tio-hud-policy",
        (st && (st.preferencesError || st.blockReason || st.policy)) ||
          "Unavailable",
      );
      set("tio-hud-path", (st && st.path) || "Unavailable");
      set(
        "tio-hud-fps",
        st && Number.isFinite(st.fps) ? st.fps.toFixed(1) : "Unavailable",
      );
      set(
        "tio-hud-engine-details",
        CFG.buildVersionLabel() + " · " + CFG.buildEngineDetails(),
      );
      this.lastRenderTimeMs = performance.now() - started;
    }
    renderOverlay() {}
  }
  window.TimestampFormatter = TimestampFormatter;
  window.HUDEngine = HUDEngine;
  window.__TIO_AGENT_VERSION__ = CFG.VERSION;
  if (document.body) {
    const h = new HUDEngine();
    h.init();
    window.__TIO_HUD_EARLY__ = h;
  }
})();
