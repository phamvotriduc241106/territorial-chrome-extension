'use strict';
// Elimination-order rating model for single-player matches against a bot pool.
//
// One agent (strength e^theta) plays N-1 exchangeable bots (strength 1 each).
// Players are eliminated one at a time; when the agent and k bots are alive,
// the agent is the next one eliminated with probability q/(k+q), q = e^-theta
// (worst-first Plackett-Luce). Rating: Elo = 400*theta/ln(10), so a single bot
// of the pool is 0 Elo. With N=2 this is exactly the standard Elo curve, and
// with theta=0 every placement 1..N has probability 1/N.
//
// G(m) = P(agent still alive when only m bots remain) = prod_{k=m+1}^{N-1} k/(k+q)
// P(placement r) = G(r-1) - G(r-2), with G(-1) = 0 and G(N-1) = 1.
// Every observation is an interval of placements lo..hi (1 = winner):
//   exact placement r -> [r,r]; sampled loss -> [bots after + 1, alive before];
//   win or last survivor -> [1,1]; alive at the time limit with A alive -> [1,A].
// P(lo <= r <= hi) = G(hi-1) - G(lo-2).

const ELO_PER_THETA = 400 / Math.LN10;
const THETA_LIMIT = 15; // +-2,606 Elo; beyond this the estimate is reported as unbounded.

const toElo = theta => theta * ELO_PER_THETA;
const toTheta = elo => elo / ELO_PER_THETA;

function checkInterval(o) {
  if (!Number.isInteger(o.players) || o.players < 2) throw new Error('players must be an integer >= 2');
  if (!Number.isInteger(o.lo) || !Number.isInteger(o.hi) || o.lo < 1 || o.hi < o.lo || o.hi > o.players)
    throw new Error(`invalid placement interval [${o.lo},${o.hi}] for ${o.players} players`);
}

/** logG[m+1] = log G(m) for m = -1..N-1 (index shifted by one). */
function logSurvival(theta, players) {
  const q = Math.exp(-theta), out = new Float64Array(players + 1);
  out[players] = 0; // G(N-1) = 1
  for (let m = players - 2; m >= 0; m--) out[m + 1] = out[m + 2] - Math.log1p(q / (m + 1));
  out[0] = -Infinity; // G(-1) = 0
  return out;
}

/** log P(lo <= placement <= hi), given precomputed logSurvival. */
function logIntervalFrom(logG, lo, hi) {
  const a = logG[hi], b = logG[lo - 1]; // log G(hi-1), log G(lo-2)
  if (b === -Infinity) return a;
  return a + Math.log(-Math.expm1(b - a));
}

function logIntervalProbability(theta, players, lo, hi) {
  checkInterval({ players, lo, hi });
  return logIntervalFrom(logSurvival(theta, players), lo, hi);
}

function placementDistribution(theta, players) {
  const logG = logSurvival(theta, players);
  return Array.from({ length: players }, (_, i) => Math.exp(logIntervalFrom(logG, i + 1, i + 1)));
}

const winProbability = (theta, players) => Math.exp(logSurvival(theta, players)[1]);

/** Group observations by player count; counts allow cheap bootstrap reweighting. */
function compile(observations) {
  const groups = new Map();
  for (const o of observations) {
    checkInterval(o);
    if (!groups.has(o.players)) groups.set(o.players, new Map());
    const key = o.lo + ':' + o.hi, g = groups.get(o.players);
    g.set(key, (g.get(key) || 0) + (o.weight == null ? 1 : o.weight));
  }
  return [...groups].map(([players, cells]) => ({ players,
    cells: [...cells].map(([key, count]) => { const [lo, hi] = key.split(':').map(Number); return { lo, hi, count }; }) }));
}

function logLikelihood(theta, compiled) {
  let total = 0;
  for (const g of compiled) {
    const logG = logSurvival(theta, g.players);
    for (const c of g.cells) if (c.count) total += c.count * logIntervalFrom(logG, c.lo, c.hi);
  }
  return total;
}

function golden(f, lo, hi, iterations = 60) {
  const r = (Math.sqrt(5) - 1) / 2;
  let a = lo, b = hi, c = b - r * (b - a), d = a + r * (b - a), fc = f(c), fd = f(d);
  for (let i = 0; i < iterations; i++) {
    if (fc > fd) { b = d; d = c; fd = fc; c = b - r * (b - a); fc = f(c); }
    else { a = c; c = d; fc = fd; d = a + r * (b - a); fd = f(d); }
  }
  return (a + b) / 2;
}

function maximize(compiled, hint) {
  const f = t => logLikelihood(t, compiled);
  let best = hint != null ? hint : 0, bestValue = -Infinity;
  const step = 0.25;
  for (let t = -THETA_LIMIT; t <= THETA_LIMIT + 1e-9; t += step) {
    const v = f(t); if (v > bestValue) { bestValue = v; best = t; }
  }
  const theta = golden(f, Math.max(-THETA_LIMIT, best - step), Math.min(THETA_LIMIT, best + step));
  return { theta, logLikelihood: f(theta) };
}

/** Profile-likelihood bound: where 2*(lmax - l(theta)) reaches `drop` on one side. */
function profileBound(compiled, theta, lmax, direction, drop) {
  const target = lmax - drop / 2, edge = direction * THETA_LIMIT;
  if (logLikelihood(edge, compiled) > target) return direction * Infinity;
  let inside = theta, outside = edge;
  for (let i = 0; i < 80; i++) {
    const mid = (inside + outside) / 2;
    if (logLikelihood(mid, compiled) > target) inside = mid; else outside = mid;
  }
  return (inside + outside) / 2;
}

function lcg(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/**
 * Maximum-likelihood rating with profile and bootstrap 95% intervals.
 * Returns Elo values; unbounded ends (e.g. every match won) are +-Infinity.
 */
function fitRating(observations, options = {}) {
  if (!observations.length) return null;
  const compiled = compile(observations);
  const { theta, logLikelihood: lmax } = maximize(compiled);
  const atEdge = Math.abs(theta) > THETA_LIMIT - 0.01;
  const h = 1e-3;
  const info = -(logLikelihood(theta + h, compiled) - 2 * lmax + logLikelihood(theta - h, compiled)) / (h * h);
  const lower = profileBound(compiled, theta, lmax, -1, 3.841458820694124);
  const upper = profileBound(compiled, theta, lmax, +1, 3.841458820694124);
  const result = {
    matches: observations.length, theta, elo: atEdge ? Math.sign(theta) * Infinity : toElo(theta),
    unbounded: atEdge, logLikelihood: lmax,
    seElo: info > 0 && !atEdge ? ELO_PER_THETA / Math.sqrt(info) : null,
    ci95Profile: [toElo(lower), toElo(upper)]
  };
  const B = options.bootstrap ?? 0;
  if (B > 0) {
    const random = lcg(options.seed ?? 1), n = observations.length, draws = [];
    const cells = compiled.flatMap(g => g.cells.map(c => ({ g, c, base: c.count })));
    const expanded = [];
    for (const item of cells) for (let k = 0; k < item.base; k++) expanded.push(item.c);
    for (let b = 0; b < B; b++) {
      for (const item of cells) item.c.count = 0;
      for (let i = 0; i < n; i++) expanded[Math.floor(random() * n)].count++;
      draws.push(maximize(compiled, theta).theta);
    }
    for (const item of cells) item.c.count = item.base;
    draws.sort((x, y) => x - y);
    const pick = p => toElo(draws[Math.min(B - 1, Math.max(0, Math.floor(p * B)))]);
    result.ci95Bootstrap = [pick(0.025), pick(0.975)];
    result.bootstrapResamples = B;
  }
  return result;
}

// ---- Distribution helpers (independent closed forms where they exist) ----

function logGamma(x) { // Lanczos, g=7, n=9
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  x -= 1; let a = c[0]; const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Regularized upper incomplete gamma Q(a,x). */
function gammaQ(a, x) {
  if (x <= 0) return 1;
  if (x < a + 1) {
    let sum = 1 / a, term = sum;
    for (let n = 1; n < 1000; n++) { term *= x / (a + n); sum += term; if (Math.abs(term) < Math.abs(sum) * 1e-15) break; }
    return 1 - sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
  }
  let b = x + 1 - a, c = 1 / 1e-300, d = 1 / b, h = d;
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a); b += 2;
    d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d; const delta = d * c; h *= delta;
    if (Math.abs(delta - 1) < 1e-15) break;
  }
  return Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
}
const chiSquareSurvival = (x, df) => gammaQ(df / 2, x / 2);

/** Inverse standard normal CDF (Acklam), |error| < 1.2e-9. */
function normalQuantile(p) {
  if (!(p > 0 && p < 1)) throw new Error('p must be in (0,1)');
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const lowTail = 0.02425;
  if (p < lowTail) { const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > 1 - lowTail) return -normalQuantile(1 - p);
  const q = p - 0.5, r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

function binomialCdf(k, n, p) {
  if (k < 0) return 0; if (k >= n) return 1;
  if (p <= 0) return 1; if (p >= 1) return 0;
  let total = 0;
  for (let i = 0; i <= k; i++) total += Math.exp(logGamma(n + 1) - logGamma(i + 1) - logGamma(n - i + 1) +
    i * Math.log(p) + (n - i) * Math.log1p(-p));
  return Math.min(1, total);
}

/** Exact (Clopper-Pearson) 95% interval for k successes in n trials. */
function clopperPearson(k, n, level = 0.95) {
  if (!n) return [0, 1];
  const tail = (1 - level) / 2;
  // binomialCdf(j, n, p) decreases in p; solve f(p) = target by bisection.
  const solve = (f, target) => { let lo = 0, hi = 1; for (let i = 0; i < 100; i++) { const mid = (lo + hi) / 2; if (f(mid) > target) lo = mid; else hi = mid; } return (lo + hi) / 2; };
  const lower = k === 0 ? 0 : solve(p => binomialCdf(k - 1, n, p), 1 - tail); // P(X >= k) = tail
  const upper = k === n ? 1 : solve(p => binomialCdf(k, n, p), tail);         // P(X <= k) = tail
  return [lower, upper];
}

// ---- Planning: expected information per match ----

/** Expected Fisher information about theta from one exactly observed placement. */
function placementInformation(theta, players) {
  const q = Math.exp(-theta), probs = placementDistribution(theta, players);
  // score(r) = sum_{k=r}^{N-1} q/(k+q) - (r-1)/(r-1+q), with the last term 0 for r=1.
  const tail = new Float64Array(players + 1);
  for (let k = players - 1; k >= 1; k--) tail[k] = tail[k + 1] + q / (k + q);
  let info = 0;
  for (let r = 1; r <= players; r++) {
    const score = tail[r] - (r > 1 ? (r - 1) / (r - 1 + q) : 0);
    info += probs[r - 1] * score * score;
  }
  return info;
}

/** Fisher information from observing only win/loss. */
function winOnlyInformation(theta, players) {
  const q = Math.exp(-theta), p = winProbability(theta, players);
  let slope = 0; for (let k = 1; k < players; k++) slope += q / (k + q);
  const dp = p * slope;
  return p > 0 && p < 1 ? dp * dp / (p * (1 - p)) : 0;
}

function eloForWinProbability(target, players) {
  if (!(target > 0 && target < 1)) throw new Error('target must be in (0,1)');
  let lo = -THETA_LIMIT, hi = THETA_LIMIT;
  for (let i = 0; i < 100; i++) { const mid = (lo + hi) / 2; if (winProbability(mid, players) < target) lo = mid; else hi = mid; }
  return toElo((lo + hi) / 2);
}

function plan({ players, elo = 0, halfWidthElo = 50, deltaElo = 50, alpha = 0.05, beta = 0.2 }) {
  const theta = toTheta(elo), info = placementInformation(theta, players), winInfo = winOnlyInformation(theta, players);
  const z = normalQuantile(0.975), za = normalQuantile(1 - alpha), zb = normalQuantile(1 - beta);
  const varElo = ELO_PER_THETA * ELO_PER_THETA / info;
  return {
    players, assumedElo: elo, model: 'elimination-plackett-luce-v1',
    winProbabilityAtAssumedElo: winProbability(theta, players),
    eloFor50PercentWins: eloForWinProbability(0.5, players),
    seEloPerSqrtMatch: Math.sqrt(varElo),
    matchesForHalfWidth: { halfWidthElo, matches: Math.ceil(z * z * varElo / (halfWidthElo * halfWidthElo)) },
    abMatchesPerArm: { deltaElo, alphaOneSided: alpha, power: 1 - beta,
      matches: Math.ceil((za + zb) * (za + zb) * 2 * varElo / (deltaElo * deltaElo)) },
    placementVsWinOnlyInformation: winInfo > 0 ? info / winInfo : Infinity,
    note: 'Assumes every match ends in an exactly observed placement. Censoring and placement intervals reduce information; treat these as minimums.'
  };
}

// ---- Sequential A/B test on the Elo difference ----

/**
 * Wald SPRT with the normal approximation used in engine testing:
 * LLR = (e1-e0)(d - (e0+e1)/2) / s^2, where d is the estimated difference.
 */
function sprt({ deltaElo, seElo, elo0, elo1, alpha = 0.05, beta = 0.05 }) {
  const lower = Math.log(beta / (1 - alpha)), upper = Math.log((1 - beta) / alpha);
  if (!(Number.isFinite(deltaElo) && seElo > 0)) return { llr: null, lower, upper, decision: 'continue', reason: 'estimate unbounded or undefined' };
  const llr = (elo1 - elo0) * (deltaElo - (elo0 + elo1) / 2) / (seElo * seElo);
  return { llr, lower, upper, decision: llr >= upper ? 'accept-H1' : llr <= lower ? 'accept-H0' : 'continue' };
}

// ---- Diagnostics ----

/** Observed vs model-expected wins and mean mid-PIT over terminal observations. */
function diagnostics(observations, theta) {
  const terminal = observations.filter(o => !o.censored);
  let expectedWins = 0, variance = 0, observedWins = 0, pit = 0;
  for (const o of terminal) {
    const logG = logSurvival(theta, o.players), p = Math.exp(logG[1]);
    expectedWins += p; variance += p * (1 - p); if (o.hi === 1) observedWins++;
    // CDF F(x) = P(r <= x) = G(x-1); mid-PIT of the observed interval.
    pit += (Math.exp(logG[o.lo - 1]) + Math.exp(logG[o.hi])) / 2;
  }
  const n = terminal.length;
  return { terminalMatches: n, observedWins, expectedWins,
    winZ: variance > 0 ? (observedWins - expectedWins) / Math.sqrt(variance) : null,
    meanMidPit: n ? pit / n : null, midPitZ: n ? (pit / n - 0.5) / Math.sqrt(1 / (12 * n)) : null };
}

/** Likelihood-ratio test that one rating fits every group (e.g. every map). */
function heterogeneity(groups) {
  const keys = Object.keys(groups).filter(k => groups[k].length);
  if (keys.length < 2) return null;
  const pooled = maximize(compile(keys.flatMap(k => groups[k]))).logLikelihood;
  const separate = keys.reduce((s, k) => s + maximize(compile(groups[k])).logLikelihood, 0);
  const statistic = Math.max(0, 2 * (separate - pooled)), df = keys.length - 1;
  return { groups: keys, statistic, df, pValue: chiSquareSurvival(statistic, df) };
}

module.exports = {
  ELO_PER_THETA, THETA_LIMIT, toElo, toTheta, logSurvival, logIntervalProbability, placementDistribution,
  winProbability, logLikelihood: (theta, obs) => logLikelihood(theta, compile(obs)), fitRating,
  placementInformation, winOnlyInformation, eloForWinProbability, plan, sprt, diagnostics, heterogeneity,
  chiSquareSurvival, normalQuantile, binomialCdf, clopperPearson, lcg
};
