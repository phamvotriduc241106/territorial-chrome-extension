"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http"),
  os = require("node:os");
const assert = require("node:assert/strict"),
  { chromium } = require("playwright"),
  { PNG } = require("pngjs");
const root = path.resolve(__dirname, ".."),
  out = path.join(
    root,
    process.argv.includes("--inject-visual-regression")
      ? "scratch/ui-roadmap/negative-control"
      : "scratch/ui-roadmap/qa",
  );
const baselines = path.join(
    root,
    "tests/ui-baselines",
    process.platform === "linux" ? "linux" : "",
  ),
  update = process.argv.includes("--update");
const onlyA11y = process.argv.includes("--a11y");
const capture = process.argv.includes("--capture");
assert.ok(
  !capture || (!update && !onlyA11y),
  "Candidate capture cannot approve baselines or skip screenshot recording",
);
const injectVisualRegression = process.argv.includes(
  "--inject-visual-regression",
);
assert.ok(
  !injectVisualRegression || (!update && !onlyA11y && !capture),
  "Visual negative control cannot update baselines or skip comparisons",
);
const stats = {
  checks: 0,
  visuals: 0,
  a11yScans: 0,
  seriousCriticalViolations: 0,
};
function check(condition, message) {
  assert.ok(condition, message);
  stats.checks++;
}
function fixture(initial = {}) {
  const f = (window.__uiFixture = {
    stored: {},
    status: { inGame: false, armed: false, botEnabled: true },
    url: "https://territorial.io/",
    tabId: 7,
    messageDelay: 0,
    failGet: false,
    failSet: false,
    failMessage: false,
    holdWrite: false,
    replies: [],
    changed: [],
    listeners: [],
    messages: [],
    writes: [],
  });
  Object.assign(f, initial);
  const runtime = {
    lastError: null,
    onMessage: { addListener: (fn) => f.listeners.push(fn) },
  };
  function callback(cb, value, error) {
    runtime.lastError = error ? { message: error } : null;
    cb(value);
    runtime.lastError = null;
  }
  window.chrome = {
    runtime,
    storage: {
      local: {
        get: (defaults, cb) =>
          setTimeout(
            () =>
              callback(
                cb,
                { ...defaults, ...f.stored },
                f.failGet ? "Fixture read failure" : null,
              ),
            0,
          ),
        set: (patch, cb) => {
          const commit = () => {
            f.writes.push(patch);
            if (!f.failSet) {
              const changes = {};
              for (const [k, v] of Object.entries(patch)) {
                changes[k] = { oldValue: f.stored[k], newValue: v };
                f.stored[k] = v;
              }
              f.changed.forEach((fn) => fn(changes, "local"));
            }
            if (cb)
              callback(
                cb,
                undefined,
                f.failSet ? "Fixture write failure" : null,
              );
          };
          if (f.holdWrite) f.releaseWrite = commit;
          else setTimeout(commit, 0);
        },
      },
      onChanged: { addListener: (fn) => f.changed.push(fn) },
    },
    tabs: {
      query: (query, cb) =>
        setTimeout(() => callback(cb, [{ id: f.tabId, url: f.url }]), 0),
      sendMessage: (id, msg, cb) => {
        f.messages.push(msg);
        if (f.failMessage) {
          setTimeout(
            () => callback(cb, undefined, "Fixture connection failure"),
            f.messageDelay,
          );
          return;
        }
        if (msg.action === "STATE_CHANGED") {
          Object.assign(f.status, msg.settings);
          setTimeout(() => callback(cb, { success: true }), 0);
          return;
        }
        const reply = f.replies.shift(),
          status = reply ? reply.status : { ...f.status };
        const response = {
          success: true,
          status: {
            ...status,
            statusSampledAt:
              reply && "timestamp" in reply ? reply.timestamp : Date.now(),
          },
        };
        setTimeout(
          () => callback(cb, response),
          reply ? reply.delay : f.messageDelay,
        );
      },
    },
  };
}
const baseStatus = {
  botEnabled: true,
  inGame: true,
  armed: true,
  actuatorReady: true,
  automationRunning: true,
  pendingSpawn: false,
  telemetryAgeMs: 0,
  blockReason: null,
  balance: 12400,
  balanceProvenance: "observed",
  softCap: 90000,
  softCapProvenance: "observed",
  territory: 900,
  territoryProvenance: "observed",
  plannedAction: "expand",
  path: "Native",
  policy: "free-land",
};
const states = {
  disconnected: null,
  ready: { ...baseStatus, inGame: false, armed: false },
  confirming: {
    ...baseStatus,
    inGame: false,
    armed: false,
    pendingSpawn: true,
  },
  playing: baseStatus,
  paused: { ...baseStatus, botEnabled: false },
  blocked: {
    ...baseStatus,
    actuatorReady: false,
    blockReason: "hook-unavailable",
  },
  stale: { ...baseStatus, telemetryAgeMs: 4000 },
  "user-hold": { ...baseStatus, blockReason: "user-hold" },
};
async function statusRegressionChecks(context, base) {
  async function popup(setup, verify) {
    // Playwright clocks are context-wide; never leak a frozen clock into visual QA.
    const timed = await context.browser().newContext();
    await timed.route("**/*", (route) =>
      route.request().url().startsWith(base) ? route.continue() : route.abort(),
    );
    const page = await timed.newPage();
    await page.clock.install({ time: new Date("2026-10-09T14:00:00Z") });
    await page.addInitScript(fixture, { ...setup, status: baseStatus });
    await page.goto(base + "/popup/popup.html");
    await verify(page);
    await timed.close();
  }
  await popup({ messageDelay: 1100 }, async (page) => {
    await page.clock.runFor(3500);
    check(
      (await page.locator("#status-text").getAttribute("data-state")) ===
        "playing",
      "Periodic polling must not cancel every valid 1100 ms status reply",
    );
    check(
      Number.parseInt(await page.locator("#tele-age").textContent(), 10) >=
        1100,
      "Displayed telemetry age includes actual delivery delay",
    );
    check(
      (await page.evaluate(
        () =>
          __uiFixture.messages.filter((m) => m.action === "GET_STATUS").length,
      )) <= 3,
      "Background status polling is single-flight",
    );
    await page.evaluate(() => {
      __uiFixture.messageDelay = 2000;
    });
    await page.clock.runFor(6000);
    check(
      (await page.locator("#status-text").getAttribute("data-state")) ===
        "stale",
      "Timed-out replies still age out",
    );
    check(
      (await page.locator("#tele-balance").textContent()) === "Unavailable",
      "Timed-out observations hide cached bank",
    );
    await page.evaluate(() => {
      __uiFixture.messageDelay = 0;
    });
    await page.clock.runFor(2500);
    check(
      (await page.locator("#status-text").getAttribute("data-state")) ===
        "playing",
      "Status polling recovers after a timeout",
    );
  });
  await popup({}, async (page) => {
    await page.clock.runFor(50);
    check(
      (await page.locator("#status-text").getAttribute("data-state")) ===
        "playing",
      "Initial game tab is live",
    );
    await page.evaluate(() => {
      __uiFixture.tabId = 8;
      __uiFixture.failMessage = true;
      document.querySelector("#retry-connection").click();
    });
    await page.clock.runFor(50);
    check(
      (await page.locator("#status-text").getAttribute("data-state")) !==
        "playing",
      "Failed response from a different tab cannot retain the previous tab's Playing state",
    );
    check(
      (await page.locator("#tele-balance").textContent()) === "Unavailable",
      "Previous tab's bank is discarded before reading a different tab",
    );
    await page.evaluate(() => {
      __uiFixture.tabId = 9;
      __uiFixture.failMessage = false;
      __uiFixture.replies = [
        {
          status: { ...__uiFixture.status, botEnabled: false, balance: 77 },
          delay: 0,
          timestamp: Date.now() - 2000,
        },
      ];
      document.querySelector("#retry-connection").click();
    });
    await page.clock.runFor(50);
    check(
      (await page.locator("#status-text").getAttribute("data-state")) ===
        "paused",
      "New tab's valid older timestamp is not compared against the previous tab",
    );
    check(
      (await page.locator("#tele-balance").textContent()) === "77",
      "New tab's own metrics are shown",
    );
    await page.evaluate(() => {
      __uiFixture.url = "https://territorial.io/?new-document";
      __uiFixture.replies = [
        {
          status: { ...__uiFixture.status, botEnabled: false, balance: 66 },
          delay: 0,
          timestamp: Date.now() - 2100,
        },
      ];
      document.querySelector("#retry-connection").click();
    });
    await page.clock.runFor(50);
    check(
      (await page.locator("#tele-balance").textContent()) === "66",
      "Changed document URL resets the same tab's ordering watermark",
    );
    await page.evaluate(() => {
      __uiFixture.failMessage = true;
      document.querySelector("#retry-connection").click();
    });
    await page.clock.runFor(50);
    check(
      await page.locator("#error-feedback").isVisible(),
      "Current tab failure has a retryable error",
    );
    await page.evaluate(() => {
      __uiFixture.url = "https://example.com/";
      document.querySelector("#retry-connection").click();
    });
    await page.clock.runFor(50);
    check(
      await page.locator("#error-feedback").isHidden(),
      "Old connection error does not follow an unsupported tab",
    );
  });
  for (const failMessage of [false, true])
    await popup({ messageDelay: 1100, failMessage }, async (page) => {
      await page.clock.runFor(500);
      await page.evaluate(() => {
        __uiFixture.tabId = 8;
        __uiFixture.failMessage = false;
        __uiFixture.status = {
          ...__uiFixture.status,
          botEnabled: false,
          balance: 77,
        };
        __uiFixture.messageDelay = 0;
      });
      await page.clock.runFor(700);
      check(
        (await page.locator("#status-text").getAttribute("data-state")) ===
          "paused",
        "Tab switch during a delayed reply/error rechecks the recipient before displaying status",
      );
      check(
        (await page.locator("#tele-balance").textContent()) === "77",
        "Mid-flight tab switch displays only the new tab's bank",
      );
    });
  const hud = await context.newPage();
  await hud.goto(base + "/tests/ui-fixture.html");
  for (const file of [
    "shared/config.js",
    "shared/presentation.js",
    "content/hud.js",
  ])
    await hud.addScriptTag({ path: path.join(root, file) });
  await hud.evaluate((status) => {
    const frozen = { ...status, statusSampledAt: Date.now() - 4000 };
    __TIO_HUD_EARLY__.setStatusProvider(() => frozen);
    __TIO_HUD_EARLY__.setPreferences({ hudMode: "detailed" });
  }, baseStatus);
  check(
    (await hud.locator("#tio-hud-v5-panel").getAttribute("data-state")) ===
      "stale",
    "HUD ages a cached status timestamp instead of assuming every provider response is new",
  );
  check(
    (await hud.locator("#tio-hud-troops").textContent()) === "Unavailable",
    "HUD hides stale bank",
  );
  await hud.evaluate((status) => {
    __TIO_HUD_EARLY__.setStatusProvider(() => ({
      ...status,
      statusSampledAt: Date.now() + 5000,
    }));
  }, baseStatus);
  check(
    (await hud.locator("#tio-hud-v5-panel").getAttribute("data-state")) ===
      "blocked",
    "HUD rejects future snapshots",
  );
  await hud.evaluate((status) => {
    const frozen = {
      ...status,
      telemetryAgeMs: 100,
      statusSampledAt: Date.now() - 500,
    };
    __TIO_HUD_EARLY__.setStatusProvider(() => frozen);
  }, baseStatus);
  check(
    Number.parseInt(await hud.locator("#tio-hud-age").textContent(), 10) >= 600,
    "HUD telemetry age includes snapshot cache time",
  );
  await hud.close();
}
async function deterministicFont(page, base) {
  await page.evaluate(() => document.fonts.ready);
}
async function visual(name, page) {
  if (onlyA11y) return;
  if (injectVisualRegression && name === "popup-disconnected")
    await page.addStyleTag({ content: "body{background:#ffffff!important}" });
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  const target = path.join(baselines, name + ".png");
  // Assert the real release labels first. Only these volatile strings use the
  // already-reviewed baseline release during capture; restore them immediately.
  // Geometry, colors, status, controls and metrics are never normalized.
  const labels = await page.evaluate(
    (reference) => {
      const cfg = window.TIOConfig;
      if (cfg.ENGINE_VERSION !== reference.engineVersion)
        throw Error(
          "Policy engine label changed; visual baseline review required",
        );
      const replacements = {
        "theme-updated": [cfg.ENGINE_UPDATED_AT, reference.updatedAt],
        "version-label": [cfg.buildVersionLabel(), "v" + reference.version],
        "version-details": [
          cfg.buildEngineDetails(),
          reference.engineVersion +
            " production policy · Updated " +
            reference.updatedAt,
        ],
        "tio-hud-engine-details": [
          cfg.buildVersionLabel() + " · " + cfg.buildEngineDetails(),
          "v" +
            reference.version +
            " · " +
            reference.engineVersion +
            " production policy · Updated " +
            reference.updatedAt,
        ],
      };
      const original = {};
      for (const [id, [live, baseline]] of Object.entries(replacements)) {
        const node = document.getElementById(id);
        if (!node) continue;
        if (node.textContent !== live)
          throw Error("Incorrect live release label: " + id);
        original[id] = node.textContent;
        node.textContent = baseline;
      }
      return original;
    },
    JSON.parse(
      fs.readFileSync(
        path.join(root, "tests/ui-baselines/metadata.json"),
        "utf8",
      ),
    ),
  );
  stats.checks++;
  let actual;
  try {
    actual =
      name.startsWith("hud-") && name !== "hud-hidden"
        ? await page
            .locator("#tio-hud-v5-panel")
            .screenshot({ animations: "disabled" })
        : await page.screenshot({ fullPage: true, animations: "disabled" });
  } finally {
    await page.evaluate((labels) => {
      for (const [id, value] of Object.entries(labels))
        document.getElementById(id).textContent = value;
    }, labels);
  }
  fs.writeFileSync(path.join(out, name + ".png"), actual);
  if (update) {
    fs.mkdirSync(baselines, { recursive: true });
    fs.writeFileSync(target, actual);
  } else {
    if (capture) {
      stats.visuals++;
      return;
    }
    check(fs.existsSync(target), "Missing approved visual baseline " + name);
    const a = PNG.sync.read(actual),
      b = PNG.sync.read(fs.readFileSync(target));
    assert.equal(a.width, b.width, name + " width");
    assert.equal(a.height, b.height, name + " height");
    const diff = new PNG({ width: a.width, height: a.height }),
      pixelmatch = (await import("pixelmatch")).default;
    const changed = pixelmatch(a.data, b.data, diff.data, a.width, a.height, {
      threshold: 0.2,
    });
    fs.writeFileSync(path.join(out, name + "-diff.png"), PNG.sync.write(diff));
    check(
      changed / (a.width * a.height) < 0.005,
      name + " unexpected visual diff: " + changed + " pixels",
    );
  }
  stats.visuals++;
}
async function axe(page) {
  // Debugger evaluation for QA only; do not relax the real MV3 popup CSP.
  await page.evaluate(
    fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8"),
  );
  const result = await page.evaluate(() =>
    window.axe.run(document, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
      },
    }),
  );
  const violations = result.violations.filter((v) =>
    ["critical", "serious"].includes(v.impact),
  );
  stats.a11yScans++;
  stats.seriousCriticalViolations += violations.length;
  check(
    !violations.length,
    JSON.stringify(
      violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
    ),
  );
}
async function setState(page, key) {
  await page.evaluate(
    ({ key, status }) => {
      __uiFixture.url =
        key === "disconnected"
          ? "https://example.com/"
          : "https://territorial.io/";
      __uiFixture.status = status || {};
    },
    { key, status: states[key] },
  );
  await page.locator("#retry-connection").click();
  await page.waitForFunction(
    (key) =>
      document.querySelector("#status-text").dataset.state ===
      (key === "user-hold" ? "blocked" : key),
    key,
  );
  const labels = {
    disconnected: "Disconnected",
    ready: "Ready",
    confirming: "Confirming spawn",
    playing: "Playing",
    paused: "Paused",
    blocked: "Waiting",
    stale: "Connection delayed",
    "user-hold": "Waiting",
  };
  check(
    (await page.locator("#status-text").textContent()) === labels[key],
    "Truthful headline for " + key,
  );
}
async function popupChecks(context, base) {
  const page = await context.newPage();
  await page.addInitScript(fixture);
  await page.goto(base + "/popup/popup.html");
  await page.waitForFunction(
    () => !document.querySelector(".strategy-btn").disabled,
  );
  await deterministicFont(page, base);
  check(
    await page.evaluate(() =>
      ["Commander Pixel", "Commander Mono"].every((name) =>
        [...document.fonts].some(
          (font) => font.family === name && font.status === "loaded",
        ),
      ),
    ),
    "Both actual packaged synthwave fonts are loaded",
  );
  check(
    await page.evaluate(
      () =>
        getComputedStyle(document.querySelector("h1")).color ===
          "rgb(253, 52, 229)" &&
        getComputedStyle(document.querySelector("h1")).fontFamily.includes(
          "Commander Pixel",
        ),
    ),
    "Reference theme uses magenta pixel headings, without a test font override",
  );
  for (const key of Object.keys(states)) {
    await setState(page, key);
    await visual("popup-" + key, page);
    await axe(page);
  }
  await setState(page, "playing");
  check(
    (await page.locator("#advanced").getAttribute("open")) === null,
    "Advanced collapsed by default",
  );
  await page.locator("#advanced summary").click();
  await page.waitForFunction(
    () => __uiFixture.stored.advancedExpanded === true,
  );
  await page.waitForFunction(
    () => !document.querySelector("#hud-mode").disabled,
  );
  await page.locator("#hud-mode").selectOption("hidden");
  await page.waitForFunction(() => __uiFixture.stored.hudMode === "hidden");
  await page.waitForFunction(
    () => !document.querySelector("#input-cps").disabled,
  );
  await page.locator("#input-cps").focus();
  await page.keyboard.press("ArrowLeft");
  await page.waitForFunction(() => __uiFixture.stored.clickSpeed === 3);
  await page.waitForFunction(
    () => !document.querySelector("#input-ratio").disabled,
  );
  await page.locator("#input-ratio").focus();
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(() => __uiFixture.stored.sliderPercentage === 5);
  await page.waitForFunction(
    () => !document.querySelector("[data-strategy=defensive]").disabled,
  );
  await page.locator("[data-strategy=defensive]").click();
  await page.waitForFunction(() => __uiFixture.stored.strategy === "defensive");
  await page.waitForFunction(
    () => !document.querySelector(".strategy-btn").disabled,
  );
  check(
    (await page
      .locator("[data-strategy=defensive]")
      .getAttribute("aria-pressed")) === "true",
    "Preset selected semantics",
  );
  await visual("popup-advanced", page);
  await axe(page);
  const persisted = await page.evaluate(() => __uiFixture.stored);
  await page.reload();
  await page.waitForFunction(
    () => !document.querySelector(".strategy-btn").disabled,
  );
  await page.evaluate((stored) => {
    __uiFixture.stored = stored;
    __uiFixture.changed.forEach((fn) =>
      fn(
        Object.fromEntries(
          Object.entries(stored).map(([k, v]) => [k, { newValue: v }]),
        ),
        "local",
      ),
    );
  }, persisted);
  check(
    (await page.locator("#hud-mode").inputValue()) === "hidden",
    "HUD preference restored",
  );
  check(
    (await page.locator("#input-cps").inputValue()) === "3",
    "Command preference restored",
  );
  await page.evaluate(() => {
    __uiFixture.failSet = true;
  });
  await page.locator("[data-strategy=expansionist]").click();
  await page.waitForFunction(
    () => !document.querySelector("#error-feedback").hidden,
  );
  check(
    (await page
      .locator("[data-strategy=defensive]")
      .getAttribute("aria-pressed")) === "true",
    "Failed write rolls back preset",
  );
  check(
    (await page.locator("#save-feedback").textContent()) === "Not saved.",
    "No false success after failed write",
  );
  await deterministicFont(page, base);
  await visual("popup-save-error", page);
  await axe(page);
  await page.evaluate(() => {
    __uiFixture.failSet = false;
  });
  await page.locator("#retry-save").click();
  await page.waitForFunction(
    () => __uiFixture.stored.strategy === "expansionist",
  );
  await page.waitForFunction(
    () => !document.querySelector(".strategy-btn").disabled,
  );
  await page.evaluate(() => {
    __uiFixture.failSet = true;
    __uiFixture.holdWrite = true;
  });
  await page.locator("#toggle-bot").uncheck();
  await page.waitForFunction(() => __uiFixture.status.botEnabled === false);
  check(
    (await page.locator("#save-feedback").textContent()) ===
      "Saving preference...",
    "Pause precedes storage completion",
  );
  await page.evaluate(() => {
    __uiFixture.releaseWrite();
    __uiFixture.holdWrite = false;
  });
  await page.waitForFunction(
    () => document.querySelector("#save-feedback").textContent === "Not saved.",
  );
  await page.evaluate(() => {
    __uiFixture.failSet = false;
  });
  check(
    await page.locator("#resume-tab").isVisible(),
    "Failed pause save leaves an explicit local resume control",
  );
  await page.locator("#resume-tab").click();
  await page.waitForFunction(
    () =>
      __uiFixture.status.botEnabled === true &&
      __uiFixture.stored.botEnabled === true,
  );
  await setState(page, "playing");
  await page.evaluate((status) => {
    __uiFixture.status = { ...status, blockReason: "user-hold" };
    __uiFixture.replies = [
      { status, delay: 700 },
      { status: __uiFixture.status, delay: 0 },
    ];
  }, baseStatus);
  await page.locator("#retry-connection").click();
  await page.waitForTimeout(50);
  await page.locator("#retry-connection").click();
  await page.waitForTimeout(750);
  check(
    (await page.locator("#status-text").getAttribute("data-state")) ===
      "blocked",
    "Obsolete response cannot restore Playing",
  );
  await page.evaluate((status) => {
    __uiFixture.replies = [{ status, delay: 0, timestamp: Date.now() - 5000 }];
  }, baseStatus);
  await page.locator("#retry-connection").click();
  await page.waitForTimeout(50);
  check(
    (await page.locator("#status-text").getAttribute("data-state")) ===
      "blocked",
    "Older sample timestamp rejected",
  );
  await page.evaluate((status) => {
    __uiFixture.replies = [{ status, delay: 0, timestamp: null }];
  }, baseStatus);
  await page.locator("#retry-connection").click();
  await page.waitForTimeout(50);
  check(
    (await page.locator("#status-text").getAttribute("data-state")) !==
      "playing",
    "Corrupted timestamps cannot claim play",
  );
  await page.evaluate((status) => {
    __uiFixture.replies = [{ status, delay: 0, timestamp: Date.now() + 10000 }];
  }, baseStatus);
  await page.locator("#retry-connection").click();
  await page.waitForTimeout(50);
  check(
    (await page.locator("#status-text").getAttribute("data-state")) !==
      "playing",
    "Future timestamps rejected",
  );
  await page.evaluate(() => {
    __uiFixture.failMessage = true;
  });
  await page.locator("#retry-connection").click();
  await page.waitForFunction(
    () => document.querySelector("#status-text").dataset.state === "stale",
    null,
    { timeout: 7000 },
  );
  check(
    (await page.locator("#status-text").getAttribute("data-state")) === "stale",
    "Missing responses age out",
  );
  check(
    (await page.locator("#tele-balance").textContent()) === "Unavailable",
    "Stale bank not displayed as current",
  );
  await page.evaluate(() => {
    __uiFixture.failMessage = false;
  });
  await setState(page, "ready");
  await page.locator("#advanced summary").focus();
  await page.keyboard.press("Escape");
  check(
    (await page.locator("#advanced").getAttribute("open")) === null,
    "Escape closes disclosure",
  );
  await page.waitForFunction(
    () =>
      __uiFixture.stored.advancedExpanded === false &&
      !document.querySelector("#hud-mode").disabled,
  );
  await page.keyboard.press("Tab");
  const focus = await page.evaluate(() => {
    const e = document.activeElement;
    return { tag: e.tagName, outline: getComputedStyle(e).outlineStyle };
  });
  check(focus.outline !== "none", "Visible keyboard focus");
  await page.locator("#toggle-bot").focus();
  await page.keyboard.press("Space");
  await page.waitForFunction(() => __uiFixture.stored.botEnabled === false);
  await page.keyboard.press("Space");
  await page.waitForFunction(() => __uiFixture.stored.botEnabled === true);
  check(
    await page.locator("#toggle-bot").isChecked(),
    "Space operates the primary switch in both directions",
  );
  await page.waitForFunction(
    () => !document.querySelector(".strategy-btn").disabled,
  );
  await page.locator("[data-strategy=defensive]").focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    () =>
      __uiFixture.stored.strategy === "defensive" &&
      !document.querySelector(".strategy-btn").disabled,
  );
  check(
    (await page
      .locator("[data-strategy=defensive]")
      .getAttribute("aria-pressed")) === "true",
    "Enter changes the selected preset",
  );
  await page.keyboard.press("Shift+Tab");
  check(
    await page
      .locator("[data-strategy=aggressive]")
      .evaluate((e) => e === document.activeElement),
    "Shift+Tab reaches the preceding preset",
  );
  await page.locator("#advanced summary").focus();
  await page.keyboard.press("Enter");
  check(
    await page.locator("#advanced").evaluate((e) => e.open),
    "Enter opens Advanced",
  );
  await page.waitForFunction(
    () => !document.querySelector("#hud-mode").disabled,
  );
  await page.evaluate(() => {
    for (const id of ["advanced", "help", "about"])
      document.getElementById(id).open = true;
  });
  // Disclosure toggle events persist asynchronously; traverse the settled form,
  // not a form whose controls are temporarily disabled during that write.
  await page.waitForTimeout(50);
  await page.waitForFunction(
    () => !document.querySelector("#hud-mode").disabled,
  );
  const targets = await page.evaluate(() => {
    const elements = [
      ...document.querySelectorAll(
        "a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),summary",
      ),
    ].filter((e) => e.getClientRects().length && !e.closest("[hidden]"));
    elements.forEach((e, i) => (e.dataset.qaFocus = String(i)));
    document.body.tabIndex = -1;
    document.body.focus();
    return elements.map((e) => e.dataset.qaFocus);
  });
  const visited = new Set();
  for (let i = 0; i < targets.length + 2; i++) {
    await page.keyboard.press("Tab");
    visited.add(
      await page.evaluate(() => document.activeElement.dataset.qaFocus),
    );
  }
  check(
    targets.every((id) => visited.has(id)),
    "Every visible enabled popup control is reachable by Tab; missing IDs: " +
      targets.filter((id) => !visited.has(id)).join(","),
  );
  for (const width of [360, 288, 180]) {
    await page.setViewportSize({ width, height: 800 });
    for (const id of ["advanced", "help", "about"])
      await page.evaluate(
        (id) => (document.getElementById(id).open = true),
        id,
      );
    await page.waitForTimeout(30);
    check(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "No horizontal overflow at 100/125/200% equivalent width " + width,
    );
    await axe(page);
  }
  await page.close();
  const failed = await context.newPage();
  await failed.addInitScript(fixture);
  await failed.addInitScript(() => {
    __uiFixture.failGet = true;
  });
  await failed.goto(base + "/popup/popup.html");
  await failed.waitForFunction(
    () => !document.querySelector("#error-feedback").hidden,
  );
  check(
    await failed.locator(".strategy-btn").first().isDisabled(),
    "Unread preferences cannot silently enable configuration",
  );
  await failed.evaluate(() => {
    __uiFixture.failGet = false;
  });
  await failed.locator("#retry-save").click();
  await failed.waitForFunction(
    () => !document.querySelector(".strategy-btn").disabled,
  );
  check(
    await failed.locator("#error-feedback").isHidden(),
    "Read retry clears failure",
  );
  await failed.close();
}
async function hudChecks(context, base) {
  const page = await context.newPage();
  await page.addInitScript(fixture);
  await page.goto(base + "/tests/ui-fixture.html");
  await deterministicFont(page, base);
  await page.addScriptTag({ path: path.join(root, "shared/config.js") });
  await page.addScriptTag({ path: path.join(root, "shared/presentation.js") });
  await page.addScriptTag({ path: path.join(root, "content/hud.js") });
  await page.evaluate((status) => {
    window.fixtureStatus = { ...status, statusSampledAt: Date.now() };
    __TIO_HUD_EARLY__.setStatusProvider(() => ({
      ...fixtureStatus,
      statusSampledAt: Date.now(),
    }));
  }, baseStatus);
  for (const size of [
    { width: 1280, height: 720 },
    { width: 1366, height: 768 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(size);
    for (const mode of ["compact", "detailed", "hidden"]) {
      await page.evaluate(
        (mode) => __TIO_HUD_EARLY__.setPreferences({ hudMode: mode }),
        mode,
      );
      const bounds = await page.locator("#tio-hud-v5-panel").boundingBox();
      if (mode === "hidden")
        check(bounds === null, "Hidden HUD remains hidden");
      else
        check(
          bounds.x >= 0 &&
            bounds.y >= 0 &&
            bounds.x + bounds.width <= size.width &&
            bounds.y + bounds.height <= size.height,
          "HUD stays in viewport",
        );
      if (mode === "compact")
        check(
          bounds.width === 210 && bounds.height >= 110 && bounds.height <= 150,
          "Compact footprint meets roadmap target",
        );
      check(
        (await page.evaluate(
          () =>
            getComputedStyle(document.querySelector("#tio-hud-v5-panel"))
              .pointerEvents,
        )) === "none",
        "HUD stays click-through",
      );
      if (size.width === 1280) {
        await visual("hud-" + mode, page);
        await axe(page);
      }
    }
  }
  await page.evaluate(() => {
    fixtureStatus = {
      ...fixtureStatus,
      inGame: false,
      armed: false,
      pendingSpawn: true,
    };
    __TIO_HUD_EARLY__.setPreferences({ hudMode: "compact" });
  });
  check(
    !(await page.locator("#tio-hud-v5-panel").isVisible()),
    "Compact HUD autohides at spawn",
  );
  await page.evaluate(() => {
    document.querySelector("#tio-hud-v5-panel").remove();
    __TIO_HUD_EARLY__.render();
  });
  check(
    !(await page.locator("#tio-hud-v5-panel").isVisible()),
    "DOM recreation preserves spawn visibility",
  );
  // Actual orchestrator, with only hardware/vision constructors stubbed, no policy execution.
  await page.evaluate(() => {
    for (const n of [
      "CoordSystem",
      "VisionEngine",
      "OccupancyGrid",
      "RegionDetector",
      "BorderDetector",
      "EnemyTracker",
      "EconomyAnalyzer",
      "HeatmapEngine",
    ])
      window[n] = function () {};
    window.MouseController = function () {
      this.clearQueue = () => {};
      this.setPacing = () => {};
    };
  });
  const source = fs
    .readFileSync(path.join(root, "content/content.js"), "utf8")
    .replace(
      "window.TerritorialEngineV5 = new TerritorialMasterOrchestrator();",
      "",
    )
    .replace("window.TerritorialEngineV5.init();", "");
  await page.addScriptTag({ content: source });
  await page.evaluate(() => {
    window.agent = new TerritorialMasterOrchestrator();
    agent.bindHotkeys();
  });
  for (const [key, field, value] of [
    ["h", "hudMode", "detailed"],
    ["h", "hudMode", "hidden"],
    ["h", "hudMode", "compact"],
    ["z", "botEnabled", false],
    ["z", "botEnabled", true],
    ["x", "autoExpand", false],
    ["c", "sliderPercentage", 25],
    ["v", "sliderPercentage", 40],
    ["b", "sliderPercentage", 0],
  ]) {
    await page.keyboard.press(key);
    check(
      await page.evaluate(
        ({ field, value }) => agent.settings[field] === value,
        { field, value },
      ),
      "Actual hotkey " + key,
    );
  }
  await page.locator("#typing").focus();
  await page.keyboard.press("z");
  await page.keyboard.press("h");
  check(
    await page.evaluate(
      () => agent.settings.botEnabled && agent.settings.hudMode === "compact",
    ),
    "Input typing never hijacked",
  );
  await page.locator("#editable").focus();
  await page.keyboard.press("z");
  await page.keyboard.press("h");
  check(
    await page.evaluate(
      () => agent.settings.botEnabled && agent.settings.hudMode === "compact",
    ),
    "Contenteditable never hijacked",
  );
  await page.locator("body").click({ position: { x: 700, y: 400 } });
  await page.keyboard.press("Control+z");
  check(
    await page.evaluate(() => agent.settings.botEnabled),
    "Modifier shortcut ignored",
  );
  await page.evaluate(() =>
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "z", repeat: true }),
    ),
  );
  check(
    await page.evaluate(() => agent.settings.botEnabled),
    "Held shortcut does not repeat toggles",
  );
  await page.evaluate(() => {
    agent.matchArmed = true;
    agent.isPlayerSpawnCalibrated = true;
    agent.isActive = true;
    agent.engineStarted = true;
    agent.internal = {
      lastState: {
        ready: true,
        armed: true,
        alive: true,
        territory: 900,
        balance: 0,
        balanceKnown: true,
        softCap: 90000,
      },
      lastStateAt: performance.now(),
      armed: true,
      isReady: () => true,
    };
  });
  const status = await page.evaluate(() => agent.getStatus());
  check(
    status.inGame &&
      status.balance === 0 &&
      status.balanceProvenance === "observed" &&
      status.fps === null,
    "Real status preserves native zero, no invented FPS",
  );
  check(
    (await page.evaluate(
      () =>
        TIOPresentation.derivePresentationState(
          agent.getStatus(),
          agent.settings,
          0,
        ).key,
    )) === "playing",
    "Actual status authorizes only proven play",
  );
  await page.evaluate(() => {
    agent.internal.lastStateAt = performance.now() - 4000;
  });
  check(
    (await page.evaluate(
      () =>
        TIOPresentation.derivePresentationState(
          agent.getStatus(),
          agent.settings,
          0,
        ).key,
    )) === "stale",
    "Actual old native sample is stale",
  );
  const times = await page.evaluate(() => {
    agent.internal.lastStateAt = performance.now();
    const a = [];
    for (let i = 0; i < 500; i++) {
      const start = performance.now();
      agent.hud.updateDashboard({});
      a.push(performance.now() - start);
    }
    return a.sort((a, b) => a - b);
  });
  stats.hudRender = {
    samples: 500,
    p95Ms: times[474],
    p99Ms: times[494],
    maxMs: times[499],
  };
  check(stats.hudRender.p95Ms < 16, "HUD P95 render budget 16 ms");
  await page.close();
}
async function extensionSmoke(base) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "tio-ui-profile-"));
  const context = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    args: ["--disable-extensions-except=" + root, "--load-extension=" + root],
  });
  try {
    const worker =
      context.serviceWorkers()[0] ||
      (await context.waitForEvent("serviceworker"));
    const id = new URL(worker.url()).host;
    // Wait for onInstalled migration, not an arbitrary race with its initial write.
    await worker.evaluate(async () => {
      for (let i = 0; i < 50; i++) {
        if (
          (await chrome.storage.local.get("settingsSchema")).settingsSchema ===
          2
        )
          return;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw Error("Extension install did not initialize preferences");
    });
    await worker.evaluate(() =>
      chrome.storage.local.set({ botEnabled: false, hudMode: "hidden" }),
    );
    const page = await context.newPage();
    await page.goto("chrome-extension://" + id + "/popup/popup.html");
    await page.evaluate(() => document.fonts.ready);
    check(
      await page.evaluate(() =>
        ["Commander Pixel", "Commander Mono"].every((name) =>
          [...document.fonts].some(
            (font) => font.family === name && font.status === "loaded",
          ),
        ),
      ),
      "Real MV3 CSP loads both packaged fonts without remote assets",
    );
    await page.waitForFunction(
      () =>
        document.querySelector("#enabled-label").textContent ===
        "Preference: disabled",
    );
    check(
      !(await page.locator("#toggle-bot").isChecked()),
      "Real MV3 preferences load",
    );
    check(
      (await page.locator("#status-text").getAttribute("data-state")) ===
        "disconnected",
      "Real MV3 popup never claims active outside game",
    );
    await page.locator("#toggle-bot").check();
    await page.waitForFunction(() =>
      document.querySelector("#save-feedback").textContent.startsWith("Saved."),
    );
    const stored = await worker.evaluate(() =>
      chrome.storage.local.get(["botEnabled", "hudMode"]),
    );
    check(
      stored.botEnabled && stored.hudMode === "hidden",
      "Real MV3 API persists only changed preference",
    );
    check(
      (await worker.evaluate(() => chrome.action.getTitle({}))).includes(
        "preference only",
      ),
      "Badge states preference only",
    );
    await page.reload();
    await page.waitForFunction(
      () =>
        document.querySelector("#enabled-label").textContent ===
        "Preference: enabled",
    );
    check(
      await page.locator("#toggle-bot").isChecked(),
      "Real MV3 reload retains preference",
    );
    if (!onlyA11y)
      await page.screenshot({
        path: path.join(out, "mv3-popup.png"),
        fullPage: true,
      });
    await axe(page);
    const fontPage = await context.newPage();
    await fontPage.goto(base + "/tests/ui-fixture.html");
    const crossOriginFonts = await fontPage.evaluate(async (extensionId) => {
      const loaded = [];
      for (const name of ["vt323", "share-tech-mono"]) {
        const font = new FontFace(
          "TIOCrossOrigin" + name,
          `url("chrome-extension://${extensionId}/shared/fonts/${name}.woff2")`,
        );
        await font.load();
        loaded.push(font.status);
      }
      return loaded;
    }, id);
    check(
      crossOriginFonts.every((status) => status === "loaded"),
      "Both HUD fonts are accessible from a real matched page under MV3",
    );
    await fontPage.close();
  } finally {
    await context.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
}
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      ),
      file = path.resolve(root, "." + pathname);
    if (
      !file.startsWith(root + path.sep) ||
      !fs.existsSync(file) ||
      !fs.statSync(file).isFile()
    ) {
      res.statusCode = 404;
      res.end();
      return;
    }
    res.setHeader(
      "Content-Type",
      file.endsWith(".html")
        ? "text/html"
        : file.endsWith(".css")
          ? "text/css"
          : file.endsWith(".woff2")
            ? "font/woff2"
            : "text/javascript",
    );
    res.end(fs.readFileSync(file));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  let browser;
  try {
    browser = await chromium.launch({ channel: "chromium" });
    const context = await browser.newContext({
      viewport: { width: 360, height: 800 },
      reducedMotion: "reduce",
    });
    await context.route("**/*", (route) =>
      route.request().url().startsWith(base) ? route.continue() : route.abort(),
    );
    await statusRegressionChecks(context, base);
    if (!process.argv.includes("--status-regressions")) {
      await popupChecks(context, base);
      await hudChecks(context, base);
    }
    await context.close();
    if (!process.argv.includes("--status-regressions"))
      await extensionSmoke(base);
    stats.browser = browser.version();
    stats.platform = process.platform;
    stats.visualMode = process.argv.includes("--status-regressions")
      ? "status regressions only"
      : onlyA11y
        ? "none"
        : capture
          ? "candidate capture only"
          : update
            ? "baseline update"
            : "approved comparison";
    stats.font =
      "Actual packaged VT323 + Share Tech Mono fonts; no test-only override";
    fs.writeFileSync(
      path.join(
        out,
        process.argv.includes("--status-regressions")
          ? "status-results.json"
          : onlyA11y
            ? "a11y-results.json"
            : "results.json",
      ),
      JSON.stringify(stats, null, 2),
    );
    console.log(JSON.stringify(stats, null, 2));
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
