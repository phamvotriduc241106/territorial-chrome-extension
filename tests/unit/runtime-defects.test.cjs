'use strict';
// Regressions for runtime defects found in the 2026-11-09 repository sweep.
// Each case fails on the code before its fix. Vision-fallback modules and the
// service worker only; no policy, spend or native-command logic is touched.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { environment } = require('../../tools/benchmarks/cpu-benchmark.cjs');
const read = file => fs.readFileSync(path.join(__dirname, '../..', file), 'utf8');

function box(files, extra = {}) {
  const b = environment();
  Object.assign(b, { setTimeout, clearTimeout }, extra);
  for (const file of files) vm.runInContext(read(file), b);
  return b;
}

test('region labelling stays exact beyond 25,000 preliminary labels', () => {
  // A 400x200 checkerboard of neutral(2)/enemy(4) makes every cell its own
  // 4-connected component: 80,000 labels, 40,000 of each type, area 1 each.
  const b = box(['content/region.js']);
  const w = 400, h = 200, typeMatrix = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) typeMatrix[y * w + x] = (x + y) % 2 ? 4 : 2;
  const detector = new b.RegionDetector({ width: w, height: h, typeMatrix });
  const stats = detector.detectConnectedComponents(0, 0);
  assert.equal(stats.neutralCount, 40000);
  assert.equal(stats.enemyCount, 40000);
  assert.equal(stats.largestNeutralArea, 1);
  assert.equal(stats.largestEnemyCluster, 1);
  for (const region of detector.regions.values()) {
    assert.ok(Number.isInteger(region.label) && region.label > 0, 'every region has a real root label');
    for (const cell of region.cells) assert.equal(typeMatrix[cell.index], region.type === 'NEUTRAL' ? 2 : 4);
  }
});

test('region labelling still merges large connected components', () => {
  const b = box(['content/region.js']);
  const w = 300, h = 300, typeMatrix = new Uint8Array(w * h).fill(1);
  // A comb: many vertical teeth joined by one bottom bar produce many
  // preliminary labels that must all union into a single component.
  for (let x = 0; x < w; x += 2) for (let y = 0; y < h; y++) typeMatrix[y * w + x] = 2;
  for (let x = 0; x < w; x++) typeMatrix[(h - 1) * w + x] = 2;
  const detector = new b.RegionDetector({ width: w, height: h, typeMatrix });
  const stats = detector.detectConnectedComponents(0, 0);
  assert.equal(stats.neutralCount, 1);
  assert.equal(stats.largestNeutralArea, typeMatrix.reduce((n, t) => n + (t === 2), 0));
});

test('two new opponents in one frame are both tracked', () => {
  const b = box(['content/enemy.js']);
  const tracker = new b.EnemyTracker();
  // Distinct clusters whose centroids round to the same 20-px cell in one call.
  tracker.updateOpponents([
    { centroid: { x: 101, y: 99 }, area: 10 },
    { centroid: { x: 95, y: 105 }, area: 12 }
  ], { x: 0, y: 0 });
  assert.equal(tracker.opponents.size, 2);
  assert.equal(tracker.getEnemyAnalytics().totalTracked, 2);
});

function controllerFixture() {
  const canvas = { dispatched: [], dispatchEvent(e) { this.dispatched.push(e.type); return true; },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 800 }) };
  const b = box([], {
    document: { querySelector: () => canvas },
    MouseEvent: function (type, opts) { this.type = type; Object.assign(this, opts); },
    navigator: {}, DOMException: Error, addEventListener() {}
  });
  vm.runInContext(read('content/controller.js'), b);
  const controller = new b.MouseController();
  controller.attach(canvas);
  controller.setCoordSystem({ isUiChromePoint: () => false, isSafeScreenPoint: () => true });
  return { controller, canvas };
}

test('a paced attack dropped by a full queue is not reported as fired', () => {
  const { controller } = controllerFixture();
  controller.setPacing(250);
  controller.lastActionTimestamp = performance.now();
  controller.isDraining = true; // keep the queue untouched during the assertion
  for (let i = 0; i < 6; i++) controller.queue.push({ type: 'attack', x: 500, y: 400, priority: 10 });
  assert.equal(controller.fireAttack(500, 400), false);
  assert.equal(controller.queue.length, 6);
  controller.queue.length = 5;
  assert.equal(controller.fireAttack(500, 400), true, 'a genuinely queued attack is still accepted');
  assert.equal(controller.queue.length, 6);
});

test('fired sword-confirm timers do not accumulate', async () => {
  const { controller, canvas } = controllerFixture();
  controller.setPacing(0);
  for (let i = 0; i < 50; i++) assert.equal(controller.fireAttack(500, 400), true);
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal(canvas.dispatched.filter(t => t === 'click').length, 100, 'each attack still clicks and confirms');
  assert.equal(controller._confirmTimers.length, 0);
});

test('neutral pocket centroids are the mean of their member cells', () => {
  const b = box(['content/neutral.js']);
  const engine = new b.NeutralLandEngine();
  const w = 24, h = 24, typeMatrix = new Uint8Array(w * h).fill(2);
  for (let y = 0; y < h; y++) typeMatrix[y * w + 12] = 3; // one MINE column at x=12
  engine.analyze(typeMatrix, w, h, { x: 12, y: 12 }, 0);
  assert.ok(engine.pockets.length > 0);
  const members = new Map();
  for (const r of engine.reachableNeutral.slice(0, 80)) {
    const key = `${Math.floor(r.x / 12)}_${Math.floor(r.y / 12)}`;
    if (!members.has(key)) members.set(key, []);
    members.get(key).push(r);
  }
  for (const pocket of engine.pockets) {
    const cells = members.get(pocket.id);
    assert.equal(pocket.centroid.x, Math.round(cells.reduce((s, c) => s + c.x, 0) / cells.length), pocket.id);
    assert.equal(pocket.centroid.y, Math.round(cells.reduce((s, c) => s + c.y, 0) / cells.length), pocket.id);
  }
});

test('service-worker UPDATE_SETTINGS with a partial patch preserves other stored preferences', async () => {
  const stored = { botEnabled: true, strategy: 'defensive', clickSpeed: 2, hudMode: 'detailed', settingsSchema: 2 };
  let onMessage = null;
  const area = {
    get(keys, done) {
      const out = {};
      if (keys === null) Object.assign(out, stored);
      else if (Array.isArray(keys)) for (const k of keys) { if (k in stored) out[k] = stored[k]; }
      else for (const k of Object.keys(keys)) out[k] = k in stored ? stored[k] : keys[k];
      setTimeout(() => done(out));
    },
    set(values, done) { Object.assign(stored, values); setTimeout(() => done && done()); }
  };
  const chrome = { runtime: { lastError: undefined, onInstalled: { addListener() {} },
      onMessage: { addListener(fn) { onMessage = fn; } } },
    storage: { local: area, onChanged: { addListener() {} } },
    action: { setBadgeText() {}, setBadgeBackgroundColor() {}, setTitle() {} } };
  const b = box([], { chrome });
  b.self = b; b.importScripts = () => vm.runInContext(read('shared/config.js'), b);
  vm.runInContext(read('background/background.js'), b);
  const reply = await new Promise(resolve => {
    const async = onMessage({ action: 'UPDATE_SETTINGS', settings: { botEnabled: false } }, {}, resolve);
    assert.equal(async, true);
  });
  assert.equal(reply.status, 'ok');
  assert.equal(stored.botEnabled, false);
  assert.equal(stored.strategy, 'defensive');
  assert.equal(stored.clickSpeed, 2);
  assert.equal(stored.hudMode, 'detailed');
});
