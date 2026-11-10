'use strict';
// Math-vs-implementation audit (2026-11-09). Every oracle here is independent
// of the code under test: exhaustive scans, breadth-first search, cluster
// labels or a separately converged Gauss-Seidel solve.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { environment, kernel } = require('../../tools/benchmarks/cpu-benchmark.cjs');
const root = require('../../tools/lib/repository.cjs').root;
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

function v2() { const box = kernel(); box.performance = { now: () => 0 }; return box.TIOEngineCoreV2; }
function v1() {
  const box = environment(); box.performance = { now: () => 0 };
  vm.runInContext(read('shared/config.js'), box);
  vm.runInContext(read('content/engine-core-v1.js'), box);
  return box.TIOEngineCoreV1;
}
function capital() {
  const box = kernel(); box.performance = { now: () => 1000 };
  vm.runInContext(read('shared/capital-policy.js'), box);
  return { core: box.TIOEngineCore, policy: box.TIOCapitalPolicy };
}
let seed = 20261109;
const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

// ---- Controls: identities the documentation now states (pass before and after) ----

test('human and bot tax are both floor(12B/1024) for every integer bank', () => {
  const c = v2();
  for (let B = 0; B <= 300000; B++) {
    const t = Math.floor(12 * B / 1024);
    assert.equal(c.humanAttackDebit(B, 0).tax, t);
    assert.equal(c.botAttackDebit(B, 0).tax, t);
  }
});

test('bot crush rule al(M,8) > B is exactly M >= 8B+8, and the reserve floor stays outside it', () => {
  const c = v2();
  for (let B = 0; B <= 200; B++) for (let M = 0; M <= 1700; M++) assert.equal(c.al(M, 8) > B, M >= 8 * B + 8);
  for (let M = 1; M <= 400000; M += 13) {
    const floor = c.computeCrushBarrierFloor(10 * M, [{ bal: M }]).floor;
    assert.ok(!(c.al(M, 8) > floor), `floor ${floor} is crushable by ${M}`);
  }
});

test('v2 maxSafeRatio equals an exhaustive scan of all slider codes', () => {
  const c = v2();
  for (let i = 0; i < 3000; i++) {
    const B = 1 + Math.floor(random() < 0.5 ? random() * 3000 : random() * 5e7);
    const leave = Math.floor(random() * B), cap = random() * 0.8;
    const L = Math.max(c.minLeaveFor(B), leave);
    let best = 0;
    if (B > L + 8) for (let units = 10; units / 1024 <= Math.min(0.72, cap); units++) {
      if (B - c.humanAttackDebit(B, Math.floor(B * units / 1024)).debit >= L) best = units / 1024;
    }
    assert.equal(c.maxSafeRatio(B, leave, cap), best, JSON.stringify({ B, leave, cap }));
  }
});

// ---- Regressions: each failed on the code before this change ----

test('legacy v1 maxSafeRatio treats its ceiling as an upper bound and blocks a zero ceiling', () => {
  const c = v1();
  // 0.62*1024 = 634.88. Rounding to nearest selected 635 units = 0.6201 > 0.62.
  const r = c.maxSafeRatio(1000000, 1, 0.62);
  assert.ok(r <= 0.62, `ratio ${r} exceeds the 0.62 ceiling`);
  assert.equal(r, 634 / 1024);
  assert.equal(c.maxSafeRatio(1000000, 1, 0), 0, 'explicit zero ceiling must block spending');
  assert.equal(c.maxSafeRatio(1000000, 1, NaN), 0);
  assert.equal(c.maxSafeRatio(1000000, 1), 737 / 1024, 'default 0.72 ceiling unchanged');
});

test('capital-v1 constrain never selects more slider units than its ceiling allows', () => {
  const { core, policy } = capital();
  const st = { contract: 'live-modern-v3', singlePlayer: true, ready: true, alive: true,
    balance: 1000000, balanceKnown: true, territory: 100, gameTick: 100, stateVersion: 2, matchId: 'm',
    player: 0, neutralId: 512, physicalNeighbors: [512], enemies: [] };
  const plan = { balance: 1000000, minRemaining: 1000, maxSpendTotal: 999000, minAttack: 10, canAfford: true };
  for (const ratio of [0.0605, 0.08, 0.3001, 0.6499]) {
    const r = policy.constrain(core, st, { action: 'expand' }, plan, ratio, 10);
    assert.equal(r.ok, true);
    assert.ok(r.ratio <= ratio, `${r.sliderUnits}/1024 exceeds ceiling ${ratio}`);
    assert.equal(r.sliderUnits, Math.floor(ratio * 1024));
  }
});

function serpentine(W, H) {
  const wall = new Set(), obstacles = [];
  for (let x = 1; x < W; x += 2) {
    const gap = ((x - 1) / 2) % 2 === 0 ? H - 1 : 0;
    for (let y = 0; y < H; y++) if (y !== gap) {
      wall.add(y * W + x); obstacles.push({ x: (x + 0.5) * 1000 / W, y: (y + 0.5) * 1000 / H });
    }
  }
  const dist = new Array(W * H).fill(Infinity); dist[0] = 0;
  for (const queue = [0]; queue.length;) {
    const k = queue.shift(), x = k % W, y = (k / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, n = ny * W + nx;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || wall.has(n) || dist[n] !== Infinity) continue;
      dist[n] = dist[k] + 1; queue.push(n);
    }
  }
  return { wall, obstacles, dist };
}

test('both Eikonal solvers converge through a serpentine corridor (BFS oracle)', () => {
  const c = v2(), W = 16, H = 8, { wall, obstacles, dist } = serpentine(W, H);
  // In a one-cell corridor every Godunov update has one finite upwind side,
  // so the converged discrete solution equals the corridor path length.
  for (const solve of [c.computeEikonalGeodesicField, c.computeEikonalGodunovIsotropic]) {
    const field = solve(W, H, [{ x: 1000 / W / 2, y: 1000 / H / 2 }], obstacles);
    for (let k = 0; k < W * H; k++) if (!wall.has(k)) {
      assert.ok(field.times[k] < 1e5, `reachable cell ${k} reported unreachable`);
      assert.ok(Math.abs(field.times[k] - dist[k]) < 1e-4, `cell ${k}: ${field.times[k]} vs ${dist[k]}`);
    }
    assert.equal(field.getTravelTime((W - 2 + 0.5) * 1000 / W, (H - 1 + 0.5) * 1000 / H), dist[(H - 1) * W + W - 2]);
  }
});

test('Eikonal sweeps still report walled-off cells as unreachable', () => {
  const c = v2(), obstacles = [];
  for (let y = 0; y < 8; y++) obstacles.push({ x: (8 + 0.5) * 1000 / 16, y: (y + 0.5) * 1000 / 8 });
  const field = c.computeEikonalGeodesicField(16, 8, [{ x: 10, y: 10 }], obstacles);
  assert.equal(field.getTravelTime(900, 500), 999);
  assert.ok(field.getTravelTime(400, 500) < 20);
});

test('spectral partition separates two well-separated clusters', () => {
  const c = v2();
  // Failing case found by a seeded search: 8 fixed power iterations mixed the clusters.
  const points = [[110,183],[135,135],[828,813],[859,820],[131,166],[157,123],[126,129],[815,861],
    [127,119],[864,808],[116,151],[843,837],[827,823],[185,194],[839,838],[192,119],[808,801],
    [897,873],[148,104],[126,131],[852,802],[196,166]].map(([x, y]) => ({ x, y }));
  const r = c.computeSpectralFiedler(points), label = points.map(p => p.x < 500);
  const side = r.partition[0];
  points.forEach((_, i) => assert.equal(r.partition[i] === side, label[i] === label[0], `point ${i}`));
  let mean = 0, norm = 0;
  for (const v of r.fiedler) { mean += v; norm += v * v; }
  assert.ok(Math.abs(mean) < 1e-9); assert.ok(Math.abs(norm - 1) < 1e-9);
});

test('spectral partitions match cluster labels across 300 seeded two-cluster layouts', () => {
  const c = v2(); let checked = 0;
  for (let t = 0; t < 300; t++) {
    const n = 4 + Math.floor(random() * 40), points = [], label = [];
    for (let i = 0; i < n; i++) {
      const a = i < 2 ? i === 0 : random() < 0.5; label.push(a);
      points.push(a ? { x: 100 + random() * 120, y: 100 + random() * 120 } : { x: 780 + random() * 120, y: 760 + random() * 120 });
    }
    const r = c.computeSpectralFiedler(points), side = r.partition[0];
    for (let i = 0; i < n; i++) assert.equal(r.partition[i] === side, label[i] === label[0], `layout ${t} point ${i}`);
    checked++;
  }
  assert.equal(checked, 300);
});

test('Poisson potential matches a separately converged Laplace solve', () => {
  const c = v2();
  for (let t = 0; t < 200; t++) {
    const pts = k => Array.from({ length: k }, () => ({ x: random() * 1000, y: random() * 1000 }));
    const sources = pts(1), sinks = pts(1 + Math.floor(random() * 6)), obstacles = pts(Math.floor(random() * 4));
    const field = c.computePoissonPotentialField(sources, sinks, obstacles, 8), N = 8;
    const cell = p => Math.max(0, Math.min(N - 1, Math.floor(p.y / 1000 * N))) * N + Math.max(0, Math.min(N - 1, Math.floor(p.x / 1000 * N)));
    const P = new Float64Array(N * N), fixed = new Uint8Array(N * N);
    for (const [list, value] of [[sources, 1], [sinks, -1], [obstacles, 0.6]]) for (const p of list) { P[cell(p)] = value; fixed[cell(p)] = 1; }
    for (let it = 0; it < 4000; it++) for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
      const k = y * N + x; if (!fixed[k]) P[k] = 0.25 * (P[k - 1] + P[k + 1] + P[k - N] + P[k + N]);
    }
    for (let k = 0; k < N * N; k++) assert.ok(Math.abs(P[k] - field.potentialGrid[k]) < 1e-6, `layout ${t} cell ${k}`);
  }
});
