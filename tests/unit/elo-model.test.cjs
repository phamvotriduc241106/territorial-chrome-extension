'use strict';
// Elo model checks. Oracles: hand-derived small cases, direct simulation of the
// elimination process, finite differences, and known-truth coverage studies.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const m = require('../../tools/lib/elo-model.cjs');

/** Independent simulator: run the elimination process one event at a time. */
function simulatePlacement(theta, players, random) {
  const q = Math.exp(-theta);
  for (let bots = players - 1; bots > 0; bots--) if (random() < q / (bots + q)) return bots + 1;
  return 1;
}

test('equal strength gives a uniform placement; every distribution sums to one', () => {
  for (const N of [2, 3, 64, 512]) for (const theta of [-4, -1, 0, 1.5, 4]) {
    const d = m.placementDistribution(theta, N);
    assert.ok(Math.abs(d.reduce((a, b) => a + b, 0) - 1) < 1e-12);
    if (theta === 0) d.forEach(p => assert.ok(Math.abs(p - 1 / N) < 1e-12));
  }
});

test('two players reduce to the standard Elo expectation', () => {
  for (const elo of [-800, -200, 0, 100, 400, 1200])
    assert.ok(Math.abs(m.winProbability(m.toTheta(elo), 2) - 1 / (1 + 10 ** (-elo / 400))) < 1e-12);
});

test('three players match the hand-derived probabilities', () => {
  for (const theta of [-2, 0.3, 2]) {
    const q = Math.exp(-theta), d = m.placementDistribution(theta, 3);
    // Agent survives the first elimination with 2/(2+q), then wins with 1/(1+q).
    assert.ok(Math.abs(d[0] - (2 / (2 + q)) * (1 / (1 + q))) < 1e-12);
    assert.ok(Math.abs(d[1] - (2 / (2 + q)) * (q / (1 + q))) < 1e-12);
    assert.ok(Math.abs(d[2] - q / (2 + q)) < 1e-12);
  }
});

test('placement distribution matches a direct simulation of eliminations', () => {
  const random = m.lcg(7), N = 10, theta = 0.8, draws = 200000, counts = new Array(N).fill(0);
  for (let i = 0; i < draws; i++) counts[simulatePlacement(theta, N, random) - 1]++;
  const d = m.placementDistribution(theta, N);
  let chi = 0; for (let r = 0; r < N; r++) chi += (counts[r] - draws * d[r]) ** 2 / (draws * d[r]);
  assert.ok(m.chiSquareSurvival(chi, N - 1) > 0.001, `chi-square ${chi}`);
});

test('an interval probability is the sum of its exact placements', () => {
  for (const [N, theta] of [[64, -1], [512, 0.5], [7, 3]]) {
    const d = m.placementDistribution(theta, N);
    for (const [lo, hi] of [[1, 1], [1, N], [2, 5], [N, N], [Math.ceil(N / 2), N]]) {
      const sum = d.slice(lo - 1, hi).reduce((a, b) => a + b, 0);
      assert.ok(Math.abs(Math.exp(m.logIntervalProbability(theta, N, lo, hi)) - sum) < 1e-12 * Math.max(1, sum));
    }
  }
});

test('analytic Fisher information equals a finite-difference expectation', () => {
  for (const [N, theta] of [[2, 0], [64, -1.2], [512, 0.7]]) {
    const d = m.placementDistribution(theta, N), h = 1e-5;
    let info = 0;
    for (let r = 1; r <= N; r++) {
      const s = (m.logIntervalProbability(theta + h, N, r, r) - m.logIntervalProbability(theta - h, N, r, r)) / (2 * h);
      info += d[r - 1] * s * s;
    }
    assert.ok(Math.abs(m.placementInformation(theta, N) - info) < 1e-6 * Math.max(1, info));
  }
  // N=2: placement and win/loss are the same observation.
  assert.ok(Math.abs(m.placementInformation(0.4, 2) - m.winOnlyInformation(0.4, 2)) < 1e-12);
});

test('maximum likelihood recovers a known rating with honest 95% intervals', () => {
  const random = m.lcg(20261109), N = 64, trueTheta = -1, reps = 150, n = 40;
  let covered = 0, sum = 0; const estimates = [];
  for (let rep = 0; rep < reps; rep++) {
    const obs = [];
    for (let i = 0; i < n; i++) {
      const r = simulatePlacement(trueTheta, N, random);
      // Mimic 1 Hz sampling: widen some placements into intervals.
      const width = Math.floor(random() * 4), lo = Math.max(1, r - Math.floor(random() * (width + 1)));
      obs.push({ players: N, lo, hi: Math.min(N, lo + width < r ? r : lo + width) });
    }
    const fit = m.fitRating(obs);
    estimates.push(fit.theta); sum += fit.theta;
    if (fit.ci95Profile[0] <= m.toElo(trueTheta) && m.toElo(trueTheta) <= fit.ci95Profile[1]) covered++;
  }
  const mean = sum / reps;
  assert.ok(Math.abs(m.toElo(mean - trueTheta)) < 30, `bias ${m.toElo(mean - trueTheta)} Elo`);
  assert.ok(covered / reps >= 0.9 && covered / reps <= 0.99, `coverage ${covered / reps}`);
});

test('the reported standard error matches the spread of estimates', () => {
  const random = m.lcg(99), N = 128, trueTheta = 0.5, reps = 120, n = 30, est = [], ses = [];
  for (let rep = 0; rep < reps; rep++) {
    const obs = Array.from({ length: n }, () => { const r = simulatePlacement(trueTheta, N, random); return { players: N, lo: r, hi: r }; });
    const fit = m.fitRating(obs); est.push(fit.elo); ses.push(fit.seElo);
  }
  const mean = est.reduce((a, b) => a + b, 0) / reps;
  const sd = Math.sqrt(est.reduce((a, b) => a + (b - mean) ** 2, 0) / (reps - 1));
  const meanSe = ses.reduce((a, b) => a + b, 0) / reps;
  assert.ok(Math.abs(meanSe / sd - 1) < 0.2, `se ${meanSe} vs sd ${sd}`);
  // Planning uses the same information: SE for n matches ~ seEloPerSqrtMatch/sqrt(n).
  const planned = m.plan({ players: N, elo: m.toElo(trueTheta) }).seEloPerSqrtMatch / Math.sqrt(n);
  assert.ok(Math.abs(planned / sd - 1) < 0.2, `planned ${planned} vs sd ${sd}`);
});

test('all wins or all censored survival give an unbounded estimate, not a number', () => {
  const wins = Array.from({ length: 10 }, () => ({ players: 64, lo: 1, hi: 1 }));
  const fit = m.fitRating(wins);
  assert.equal(fit.unbounded, true); assert.equal(fit.elo, Infinity); assert.equal(fit.ci95Profile[1], Infinity);
  assert.ok(Number.isFinite(fit.ci95Profile[0]) && fit.ci95Profile[0] > 0);
  const last = Array.from({ length: 10 }, () => ({ players: 64, lo: 64, hi: 64 }));
  assert.equal(m.fitRating(last).elo, -Infinity);
});

test('SPRT log-likelihood ratio equals the normal likelihood ratio', () => {
  const s = 40, e0 = 0, e1 = 50;
  for (const d of [-30, 0, 25, 60, 140]) {
    const direct = ((d - e0) ** 2 - (d - e1) ** 2) / (2 * s * s);
    const r = m.sprt({ deltaElo: d, seElo: s, elo0: e0, elo1: e1, alpha: 0.05, beta: 0.05 });
    assert.ok(Math.abs(r.llr - direct) < 1e-12);
  }
  assert.equal(m.sprt({ deltaElo: 200, seElo: 30, elo0: 0, elo1: 50 }).decision, 'accept-H1');
  assert.equal(m.sprt({ deltaElo: -100, seElo: 30, elo0: 0, elo1: 50 }).decision, 'accept-H0');
  assert.equal(m.sprt({ deltaElo: Infinity, seElo: null, elo0: 0, elo1: 50 }).decision, 'continue');
});

test('statistical helpers match published table values', () => {
  assert.ok(Math.abs(m.chiSquareSurvival(3.841458820694124, 1) - 0.05) < 1e-9);
  assert.ok(Math.abs(m.chiSquareSurvival(7.814727903251178, 3) - 0.05) < 1e-9);
  assert.ok(Math.abs(m.chiSquareSurvival(5, 2) - Math.exp(-2.5)) < 1e-12);
  assert.ok(Math.abs(m.normalQuantile(0.975) - 1.959963984540054) < 1e-8);
  assert.ok(Math.abs(m.normalQuantile(0.8) - 0.8416212335729143) < 1e-8);
  const cp = m.clopperPearson(10, 20);
  assert.ok(Math.abs(cp[0] - 0.2719578) < 1e-6 && Math.abs(cp[1] - 0.7280422) < 1e-6);
  assert.ok(Math.abs(m.clopperPearson(0, 20)[1] - 0.1684335) < 1e-6);
});

test('map heterogeneity is detected only when ratings differ', () => {
  const random = m.lcg(3), draw = (theta, n) => Array.from({ length: n }, () => {
    const r = simulatePlacement(theta, 64, random); return { players: 64, lo: r, hi: r }; });
  assert.ok(m.heterogeneity({ Europe: draw(0, 60), Asia: draw(0, 60) }).pValue > 0.001);
  assert.ok(m.heterogeneity({ Europe: draw(-2, 60), Asia: draw(2, 60) }).pValue < 1e-6);
});

test('the win threshold reproduces the model win probability', () => {
  for (const N of [2, 64, 512]) {
    const elo = m.eloForWinProbability(0.5, N);
    assert.ok(Math.abs(m.winProbability(m.toTheta(elo), N) - 0.5) < 1e-9);
  }
  assert.ok(Math.abs(m.eloForWinProbability(0.5, 2)) < 1e-6);
});
