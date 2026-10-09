"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict");
const {
  derivePresentationState: derive,
  metric,
} = require("../shared/presentation.js");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const playing = {
  statusSampledAt: 10000,
  telemetryAgeMs: 0,
  inGame: true,
  armed: true,
  actuatorReady: true,
  automationRunning: true,
  botEnabled: true,
  pendingSpawn: false,
  blockReason: null,
};
test("eight lifecycle states never infer playing from the enabled preference", () => {
  const cases = [
    ["disconnected", null],
    ["ready", { ...playing, inGame: false, armed: false }],
    [
      "confirming",
      { ...playing, inGame: false, armed: false, pendingSpawn: true },
    ],
    ["playing", playing],
    ["paused", { ...playing, botEnabled: false }],
    ["blocked", { ...playing, actuatorReady: false }],
    ["blocked", { ...playing, blockReason: "user-hold" }],
    ["stale", { ...playing, telemetryAgeMs: 4000 }],
  ];
  for (const [key, status] of cases)
    assert.equal(derive(status, { botEnabled: true }, 0).key, key);
  assert.equal(derive(playing, { botEnabled: false }, 0).key, "paused");
  assert.equal(
    derive({ ...playing, automationRunning: false }, {}, 0).key,
    "blocked",
  );
});
test("invalid, missing, delayed or future telemetry cannot authorize a live headline", () => {
  assert.equal(
    derive({ ...playing, statusSampledAt: null }, {}, 0).key,
    "blocked",
  );
  assert.equal(derive(playing, {}, 4000).key, "stale");
  assert.equal(derive(playing, {}, -1).key, "blocked");
  assert.equal(
    derive({ ...playing, telemetryAgeMs: NaN }, {}, 0).key,
    "blocked",
  );
});
test("zero is a measured value; unavailable and estimated metrics remain explicit", () => {
  assert.equal(metric(0, "observed"), "0");
  assert.equal(metric(null, "observed"), "Unavailable");
  assert.equal(metric(42, "estimated"), "~42 (estimate)");
  assert.equal(metric(NaN, "observed"), "Unavailable");
});
test("cached telemetry ages by observation age plus snapshot delivery/cache time", () => {
  const sampled = { ...playing, telemetryAgeMs: 2800 };
  assert.equal(derive(sampled, {}, 200).key, "playing");
  assert.equal(derive(sampled, {}, 201).key, "stale");
  assert.equal(derive(sampled, {}, 201).fresh, false);
  for (const telemetryAgeMs of [null, NaN, -1, Infinity]) {
    const state = derive({ ...playing, telemetryAgeMs }, {}, 0);
    assert.equal(state.fresh, false);
    assert.notEqual(state.key, "playing");
  }
});
test("presentation-only preferences preserve planner identity and never change pacing or engine", () => {
  const { environment } = require("../tools/cpu-benchmark.cjs"),
    box = environment(),
    root = path.resolve(__dirname, "..");
  vm.runInContext(
    fs.readFileSync(path.join(root, "shared/config.js"), "utf8"),
    box,
  );
  for (const name of [
    "CoordSystem",
    "VisionEngine",
    "OccupancyGrid",
    "RegionDetector",
    "BorderDetector",
    "EnemyTracker",
    "EconomyAnalyzer",
    "HeatmapEngine",
    "HUDEngine",
    "MouseController",
  ])
    box[name] = function () {};
  const source = fs
    .readFileSync(path.join(root, "content/content.js"), "utf8")
    .replace(
      "window.TerritorialEngineV5 = new TerritorialMasterOrchestrator();",
      "",
    )
    .replace("window.TerritorialEngineV5.init();", "");
  vm.runInContext(source, box);
  const agent = new box.TerritorialMasterOrchestrator(),
    original = agent.settings;
  let pacing = 0,
    engine = 0;
  agent.controller.setPacing = () => pacing++;
  box.TIOSetEngineVersion = () => engine++;
  agent.applySettings({ hudMode: "hidden", advancedExpanded: true });
  assert.equal(agent.settings, original);
  assert.equal(pacing, 0);
  assert.equal(engine, 0);
  agent.applySettings({ clickSpeed: 2 });
  assert.notEqual(agent.settings, original);
  assert.equal(pacing, 1);
  const settings = box.TIOConfig.normalizeSettings({
    hudMode: "unsupported",
    advancedExpanded: "true",
  });
  assert.equal(settings.hudMode, "compact");
  assert.equal(settings.advancedExpanded, false);
  agent.internal = {
    lastResult: { ok: true },
    lastActionAt: 1000,
    isReady: () => false,
  };
  assert.equal(
    agent.getStatus().lastCommandAt,
    null,
    "An attempted dispatch and a previous successful result are not a new acknowledgement",
  );
  agent.uiLastCommandAt = 12345;
  assert.equal(
    agent.getStatus().lastCommandAt,
    12345,
    "UI reports only an actual recorded acknowledgement timestamp",
  );
});
test("background migration never overwrites unread preferences or confirms failed writes", () => {
  for (const failure of ["read", "write", null]) {
    const box = vm.createContext({ console }),
      badge = [],
      writes = [];
    let installed;
    box.self = box;
    box.chrome = {
      action: {
        setBadgeText: (value) => badge.push(value.text),
        setBadgeBackgroundColor() {},
        setTitle() {},
      },
      runtime: {
        lastError: null,
        onInstalled: { addListener: (fn) => (installed = fn) },
        onMessage: { addListener() {} },
      },
      storage: {
        onChanged: { addListener() {} },
        local: {
          get(keys, done) {
            box.chrome.runtime.lastError =
              failure === "read" ? { message: "read failed" } : null;
            done({ botEnabled: false });
            box.chrome.runtime.lastError = null;
          },
          set(value, done) {
            writes.push(value);
            box.chrome.runtime.lastError =
              failure === "write" ? { message: "write failed" } : null;
            done();
            box.chrome.runtime.lastError = null;
          },
        },
      },
    };
    box.importScripts = () =>
      vm.runInContext(
        fs.readFileSync(path.join(__dirname, "../shared/config.js"), "utf8"),
        box,
      );
    vm.runInContext(
      fs.readFileSync(
        path.join(__dirname, "../background/background.js"),
        "utf8",
      ),
      box,
    );
    installed();
    assert.equal(writes.length, failure === "read" ? 0 : 1);
    assert.equal(badge.at(-1), failure ? "?" : "");
    if (writes.length) assert.equal(writes[0].botEnabled, false);
  }
});
