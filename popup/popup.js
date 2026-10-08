// Popup preferences are transactional; gameplay headlines use only fresh runtime data.
document.addEventListener("DOMContentLoaded", () => {
  "use strict";
  const config = window.TIOConfig,
    view = window.TIOPresentation,
    el = (id) => document.getElementById(id);
  let confirmed = config.normalizeSettings(),
    draft = confirmed,
    loaded = false,
    saving = false,
    queued = {};
  let retryAction = null,
    errorKind = null,
    lastStatus = null,
    latestRequest = 0,
    latestSample = 0,
    renderedAdvanced = null,
    alive = true;
  const controls = [
    ...document.querySelectorAll(
      "input,select,.strategy-btn,.engine-grid button",
    ),
  ];
  const text = (id, value) => {
    el(id).textContent = value;
  };
  function error(message, retry, kind = "preference") {
    text("error-message", message);
    el("error-feedback").hidden = false;
    retryAction = retry;
    errorKind = kind;
  }
  function clearError() {
    el("error-feedback").hidden = true;
    retryAction = null;
    errorKind = null;
  }
  function call(invoke, timeout = 1500) {
    return new Promise((resolve, reject) => {
      let finished = false;
      const timer = setTimeout(() => {
        finished = true;
        reject(Error("Request timed out"));
      }, timeout);
      try {
        invoke((result) => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          const failure = chrome.runtime.lastError;
          if (failure)
            reject(Error(failure.message || "Extension request failed"));
          else resolve(result);
        });
      } catch (e) {
        if (!finished) {
          finished = true;
          clearTimeout(timer);
          reject(e);
        }
      }
    });
  }
  function validTab(tab) {
    try {
      const u = new URL(tab.url);
      return (
        tab.id != null &&
        u.protocol === "https:" &&
        (u.hostname === "territorial.io" ||
          u.hostname.endsWith(".territorial.io"))
      );
    } catch (_) {
      return false;
    }
  }
  async function activeTab() {
    const tabs = await call((done) =>
      chrome.tabs.query({ active: true, currentWindow: true }, done),
    );
    return tabs && tabs[0] && validTab(tabs[0]) ? tabs[0] : null;
  }
  async function notify(patch) {
    const tab = await activeTab();
    if (!tab) return false;
    const result = await call((done) =>
      chrome.tabs.sendMessage(
        tab.id,
        { action: "STATE_CHANGED", settings: patch },
        done,
      ),
    );
    return !!(result && result.success);
  }
  function renderStatus() {
    const age = lastStatus ? Date.now() - lastStatus.statusSampledAt : 0;
    const state = view.derivePresentationState(lastStatus, confirmed, age);
    text("status-text", state.label);
    el("status-text").dataset.state = state.key;
    text("next-step", state.hint);
    el("open-game").hidden = state.key !== "disconnected";
    const st = state.fresh ? lastStatus : null;
    const resume = !!(
      st &&
      st.botEnabled === false &&
      confirmed.botEnabled &&
      !saving
    );
    el("resume-tab").hidden = !resume;
    if (resume)
      text(
        "next-step",
        "This tab is paused. Resume here or press Z in the game.",
      );
    if (st && st.preferencesError && el("error-feedback").hidden) {
      error(
        st.preferencesError,
        async () => {
          try {
            const tab = await activeTab();
            if (!tab) throw Error("No connected game tab");
            await call((done) =>
              chrome.tabs.sendMessage(
                tab.id,
                { action: "RETRY_SETTINGS" },
                done,
              ),
            );
            void queryLiveStatus();
          } catch (_) {
            error(
              "Game preference retry failed. Reconnect and try again.",
              queryLiveStatus,
              "connection",
            );
          }
        },
        "runtime-preference",
      );
    } else if (st && !st.preferencesError && errorKind === "runtime-preference")
      clearError();
    text(
      "tele-balance",
      view.metric(st && st.balance, st && st.balanceProvenance),
    );
    text("tele-cap", view.metric(st && st.softCap, st && st.softCapProvenance));
    text(
      "tele-age",
      st && Number.isFinite(st.telemetryAgeMs)
        ? Math.round(st.telemetryAgeMs) + " ms old"
        : "Unavailable",
    );
    text("tele-engine", (st && st.path) || "Unavailable");
    text("tele-policy", (st && (st.blockReason || st.policy)) || "Unavailable");
    text(
      "tele-command",
      st && Number.isFinite(st.lastCommandAt)
        ? new Date(st.lastCommandAt).toLocaleTimeString()
        : "Unavailable",
    );
  }
  async function queryLiveStatus() {
    const request = ++latestRequest;
    try {
      const tab = await activeTab();
      if (!alive || request !== latestRequest) return;
      if (!tab) {
        lastStatus = null;
        latestSample = 0;
        renderStatus();
        return;
      }
      const response = await call(
        (done) =>
          chrome.tabs.sendMessage(tab.id, { action: "GET_STATUS" }, done),
        1200,
      );
      if (!alive || request !== latestRequest) return;
      if (
        !response ||
        response.success !== true ||
        !response.status ||
        typeof response.status !== "object"
      )
        throw Error("Invalid status response");
      const st = response.status;
      if (
        !Number.isFinite(st.statusSampledAt) ||
        st.statusSampledAt > Date.now() ||
        st.statusSampledAt <= 0
      )
        throw Error("Invalid status timestamp");
      if (st.statusSampledAt < latestSample) return;
      latestSample = st.statusSampledAt;
      lastStatus = st;
      renderStatus();
      if (errorKind === "connection") clearError();
    } catch (e) {
      if (!alive || request !== latestRequest) return;
      renderStatus();
      if (!lastStatus) {
        text(
          "next-step",
          "Connection unavailable. Retry, or reload the game tab.",
        );
      }
      if (el("error-feedback").hidden)
        error(
          "Game connection could not be confirmed. Retry or reload the tab.",
          queryLiveStatus,
          "connection",
        );
    }
  }
  function renderSettings() {
    controls.forEach((c) => {
      c.disabled = (!loaded || saving) && c.id !== "toggle-bot";
    });
    for (const [id, key] of [
      ["toggle-bot", "botEnabled"],
      ["toggle-expand", "autoExpand"],
      ["toggle-attack", "autoAttack"],
      ["toggle-fallback", "allowVisionFallback"],
    ])
      el(id).checked = draft[key];
    el("input-cps").value = draft.clickSpeed;
    el("input-ratio").value = draft.sliderPercentage;
    text("val-cps", draft.clickSpeed + " /s");
    text(
      "val-ratio",
      draft.sliderPercentage ? draft.sliderPercentage + "%" : "Adaptive",
    );
    el("input-cps").setAttribute(
      "aria-valuetext",
      draft.clickSpeed + " commands per second",
    );
    el("input-ratio").setAttribute(
      "aria-valuetext",
      draft.sliderPercentage ? draft.sliderPercentage + " percent" : "Adaptive",
    );
    el("hud-mode").value = draft.hudMode;
    if (renderedAdvanced !== draft.advancedExpanded) {
      el("advanced").open = draft.advancedExpanded;
      renderedAdvanced = draft.advancedExpanded;
    }
    document
      .querySelectorAll(".strategy-btn")
      .forEach((b) =>
        b.setAttribute(
          "aria-pressed",
          String(b.dataset.strategy === draft.strategy),
        ),
      );
    el("btn-engine-v2").setAttribute(
      "aria-pressed",
      String(draft.engineVersion === 2),
    );
    el("btn-engine-v1").setAttribute(
      "aria-pressed",
      String(draft.engineVersion === 1),
    );
    text(
      "enabled-label",
      loaded
        ? "Preference: " + (confirmed.botEnabled ? "enabled" : "disabled")
        : "Preference: checking...",
    );
    renderStatus();
  }
  async function load() {
    try {
      const stored = await call((done) =>
        chrome.storage.local.get(config.DEFAULT_SETTINGS, done),
      );
      confirmed = config.normalizeSettings(stored);
      draft = confirmed;
      loaded = true;
      clearError();
      renderSettings();
    } catch (e) {
      loaded = false;
      renderSettings();
      error(
        "Preferences could not be loaded. Autopilot can still be paused in this tab.",
        load,
      );
    }
  }
  function update(patch) {
    const normalized = config.normalizeSettings({ ...draft, ...patch });
    for (const key of Object.keys(patch)) queued[key] = normalized[key];
    draft = normalized;
    renderSettings();
    void flush();
  }
  async function deliver(patch) {
    try {
      const applied = await notify(patch);
      text(
        "save-feedback",
        applied
          ? "Saved and received by the game tab."
          : "Saved. Apply on the next connected game tab.",
      );
      if (applied && errorKind === "delivery") clearError();
      void queryLiveStatus();
    } catch (e) {
      text("save-feedback", "Saved; game delivery is unconfirmed.");
      error(
        "Preference saved, but the game tab did not confirm it. Retry delivery or reconnect.",
        () => deliver(patch),
        "delivery",
      );
    }
  }
  async function flush() {
    if (saving || !Object.keys(queued).length) return;
    const patch = queued;
    queued = {};
    saving = true;
    clearError();
    text("save-feedback", "Saving preference...");
    renderSettings();
    try {
      await call((done) => chrome.storage.local.set(patch, done));
      confirmed = config.normalizeSettings({ ...confirmed, ...patch });
      text("save-feedback", "Preference saved. Connecting to the game...");
      await deliver(patch);
    } catch (e) {
      text("save-feedback", "Not saved.");
      error(
        "Save failed. Previous preferences are retained. A requested pause remains local to this tab.",
        () => update(patch),
      );
    } finally {
      saving = false;
      draft = config.normalizeSettings({ ...confirmed, ...queued });
      renderSettings();
      void flush();
    }
  }
  el("toggle-bot").addEventListener("change", () => {
    const enabled = el("toggle-bot").checked;
    // Pause does not wait for storage. Never resume before a successful preference write.
    if (!enabled)
      void notify({ botEnabled: false })
        .then(() => queryLiveStatus())
        .catch(() => {});
    update({ botEnabled: enabled });
  });
  el("resume-tab").addEventListener("click", () =>
    update({ botEnabled: true }),
  );
  for (const [id, key] of [
    ["toggle-expand", "autoExpand"],
    ["toggle-attack", "autoAttack"],
    ["toggle-fallback", "allowVisionFallback"],
  ]) {
    el(id).addEventListener("change", () => update({ [key]: el(id).checked }));
  }
  for (const [id, key] of [
    ["input-cps", "clickSpeed"],
    ["input-ratio", "sliderPercentage"],
  ]) {
    el(id).addEventListener("input", () =>
      update({ [key]: Number(el(id).value) }),
    );
  }
  document
    .querySelectorAll(".strategy-btn")
    .forEach((b) =>
      b.addEventListener("click", () =>
        update({ strategy: b.dataset.strategy }),
      ),
    );
  el("btn-engine-v2").addEventListener("click", () =>
    update({ engineVersion: 2 }),
  );
  el("btn-engine-v1").addEventListener("click", () =>
    update({ engineVersion: 1 }),
  );
  el("hud-mode").addEventListener("change", () =>
    update({ hudMode: el("hud-mode").value }),
  );
  el("advanced").addEventListener("toggle", () => {
    if (loaded && el("advanced").open !== draft.advancedExpanded)
      update({ advancedExpanded: el("advanced").open });
  });
  el("retry-save").addEventListener("click", () => {
    if (retryAction) retryAction();
  });
  el("retry-connection").addEventListener("click", queryLiveStatus);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      for (const d of document.querySelectorAll("details")) d.open = false;
      if (loaded && draft.advancedExpanded) update({ advancedExpanded: false });
    }
  });
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      const patch = Object.fromEntries(
        Object.entries(changes).map(([k, v]) => [k, v.newValue]),
      );
      confirmed = config.normalizeSettings({ ...confirmed, ...patch });
      if (!saving) {
        draft = config.normalizeSettings({ ...confirmed, ...queued });
        renderSettings();
      }
    });
  } catch (_) {}
  text("version-label", config.buildVersionLabel());
  text("version-details", config.buildEngineDetails());
  renderSettings();
  void load();
  void queryLiveStatus();
  const poll = setInterval(() => {
    renderStatus();
    void queryLiveStatus();
  }, 1000);
  window.addEventListener("unload", () => {
    alive = false;
    latestRequest++;
    clearInterval(poll);
  });
});
