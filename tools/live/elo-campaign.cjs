'use strict';
// Preregistered Elo campaign bookkeeping for installed-extension single-player
// matches. It never plays a game: matches are produced by the live recorder
// (`npm run audit:live`) and recorded here slot by slot. See
// docs/testing/ELO_TESTING_PROTOCOL.md.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const model = require('../lib/elo-model.cjs');
const { currentRelease } = require('./very-hard-standard.cjs');

const SCHEMA = 1;
const KIND = 'tio-elo-campaign';
const MODEL = 'elimination-plackett-luce-v1';
const DIFFICULTIES = ['Normal', 'Hard', 'Very Hard', 'Impossible'];
const MAPS = ['Europe', 'Asia'];
const MAX_SETUP_RETRIES = 3;
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const canonical = value => JSON.stringify(value, Object.keys(flatKeys(value)).sort());
function flatKeys(value, out = {}) {
  if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) { out[k] = 1; flatKeys(v, out); }
  return out;
}

function validateSpec(spec) {
  assert.ok(DIFFICULTIES.includes(spec.difficultyLabel), 'difficultyLabel must be a recorder UI label');
  assert.ok(Number.isInteger(spec.players) && spec.players >= 2 && spec.players <= 512, 'players must be 2..512');
  assert.ok(Array.isArray(spec.maps) && spec.maps.length >= 1 && spec.maps.every(m => MAPS.includes(m)), 'maps must be recorder map labels');
  assert.equal(new Set(spec.maps).size, spec.maps.length, 'map labels must be distinct');
  assert.ok(Number.isInteger(spec.seconds) && spec.seconds >= 60 && spec.seconds <= 900, 'seconds must be 60..900');
  assert.ok(spec.sourceSha256 === null || /^[a-f0-9]{64}$/.test(spec.sourceSha256), 'sourceSha256 must be a hash or null');
  assert.ok(Array.isArray(spec.arms) && (spec.arms.length === 1 || spec.arms.length === 2), 'one arm (rating) or two arms (A/B)');
  for (const arm of spec.arms) {
    assert.match(arm.name, /^[a-z0-9][a-z0-9-]{0,31}$/);
    assert.match(arm.releaseSha256, /^[a-f0-9]{64}$/);
    assert.ok(['baseline', 'capital-v1'].includes(arm.policy), 'policy must be a recorder policy');
  }
  assert.equal(new Set(spec.arms.map(a => a.name)).size, spec.arms.length);
  assert.ok(Number.isInteger(spec.matchesPerArm) && spec.matchesPerArm >= 8 && spec.matchesPerArm <= 2000);
  if (spec.arms.length === 2) {
    const s = spec.sprt;
    assert.ok(s && Number.isFinite(s.elo0) && Number.isFinite(s.elo1) && s.elo1 > s.elo0, 'A/B needs sprt.elo0 < sprt.elo1');
    assert.ok(s.alpha > 0 && s.alpha < 0.5 && s.beta > 0 && s.beta < 0.5);
    assert.ok(Number.isInteger(s.minMatchesPerArm) && s.minMatchesPerArm >= 8);
  } else assert.equal(spec.sprt ?? null, null, 'a single-arm rating campaign has no SPRT');
  assert.ok(Number.isInteger(spec.bootstrap) && spec.bootstrap >= 0 && spec.bootstrap <= 10000);
  assert.ok(Number.isInteger(spec.seed));
}

/** Two arms: map-rotated pairs in ABBA order. One arm: map rotation. */
function schedule(spec) {
  const slots = [];
  for (let p = 0; p < spec.matchesPerArm; p++) {
    const map = spec.maps[p % spec.maps.length];
    const order = spec.arms.length === 1 ? [spec.arms[0].name]
      : (p % 2 === 0 ? [spec.arms[0].name, spec.arms[1].name] : [spec.arms[1].name, spec.arms[0].name]);
    for (const arm of order) slots.push({ id: slots.length + 1, arm, map });
  }
  return slots;
}

function createPlan(spec, createdAt = new Date().toISOString()) {
  validateSpec(spec);
  const body = { schema: SCHEMA, kind: KIND, model: MODEL, createdAt, spec, schedule: schedule(spec) };
  return { ...body, planSha256: sha256(canonical(body)) };
}

function validatePlan(plan) {
  assert.equal(plan.schema, SCHEMA); assert.equal(plan.kind, KIND); assert.equal(plan.model, MODEL);
  validateSpec(plan.spec);
  assert.deepEqual(plan.schedule, schedule(plan.spec), 'schedule was edited after preregistration');
  const { planSha256, ...body } = plan;
  assert.equal(planSha256, sha256(canonical(body)), 'plan hash mismatch: the plan was edited after preregistration');
}

/** Turn one recorder report into a placement interval (1 = winner). */
function derivePlacement(report, players) {
  if (!report.matchStartedAt) return { status: 'setup-error' };
  const samples = (report.samples || []).filter(s => s.native && s.native.ready && s.native.gameTick > 0);
  const alive = s => s.native.alive === true && s.native.territory > 0;
  const count = s => { const v = s.native.alivePlayers; assert.ok(Number.isInteger(v) && v >= 0 && v <= players, 'invalid alivePlayers'); return v; };
  if (!samples.length) return { status: 'game-error', lo: 1, hi: players, censored: true };
  const death = samples.findIndex(s => s.native.alive === false && s.native.territory === 0);
  if (death >= 0) {
    // Before death alivePlayers includes the agent; after death it counts bots only.
    const before = samples.slice(0, death).reverse().find(alive);
    const hi = before ? count(before) : players, lo = count(samples[death]) + 1;
    assert.ok(lo >= 1 && lo <= hi && hi <= players, `inconsistent placement interval [${lo},${hi}]`);
    assert.equal(report.outcome, 'loss', 'recorder outcome disagrees with its samples');
    return { status: 'loss', lo, hi, censored: false };
  }
  const last = samples[samples.length - 1];
  if (alive(last) && count(last) === 1) {
    assert.equal(report.outcome, 'opponents-eliminated', 'recorder outcome disagrees with its samples');
    return { status: 'opponents-eliminated', lo: 1, hi: 1, censored: false };
  }
  const hi = alive(last) ? Math.max(1, count(last)) : players;
  if (report.outcome === 'censored-time-limit') return { status: 'censored', lo: 1, hi, censored: true };
  return { status: 'game-error', lo: 1, hi, censored: true };
}

function loadRecords(file) { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : []; }

function finalSlots(records) {
  const final = new Map();
  for (const r of records) if (r.status !== 'setup-error') final.set(r.slot, r);
  return final;
}

function nextSlot(plan, records) {
  const final = finalSlots(records);
  return plan.schedule.find(s => !final.has(s.id) && !isAbandoned(records, s.id)) || null;
}
const isAbandoned = (records, id) => records.filter(r => r.slot === id && r.status === 'setup-error').length >= MAX_SETUP_RETRIES;

/** Validate a recorder report against its slot and append a record. */
function recordMatch(plan, records, slotId, report, reportBytes, reportPath) {
  validatePlan(plan);
  const slot = plan.schedule.find(s => s.id === slotId);
  assert.ok(slot, 'unknown slot');
  const next = nextSlot(plan, records);
  assert.ok(next && next.id === slotId, `slots are recorded in order; next is ${next ? next.id : 'none'}`);
  const arm = plan.spec.arms.find(a => a.name === slot.arm), digest = sha256(reportBytes);
  assert.ok(!records.some(r => r.reportSha256 === digest), 'this report was already recorded');
  assert.equal(report.evidenceKind, 'live-official-installed-extension-diagnostic');
  assert.equal(report.difficultyLabel, plan.spec.difficultyLabel, 'difficulty differs from the plan');
  assert.equal(report.players, plan.spec.players, 'player count differs from the plan');
  if (report.scenario && report.scenario.playerCount != null) assert.equal(report.scenario.playerCount, plan.spec.players);
  assert.equal(report.mapLabel, slot.map, 'map differs from the scheduled slot');
  assert.equal(report.release && report.release.releaseSha256, arm.releaseSha256, 'release differs from the arm');
  assert.equal(report.assignedPolicy, arm.policy, 'policy differs from the arm');
  assert.equal(report.manualCombatCommands, 0); assert.equal(report.accelerated, false);
  const placement = derivePlacement(report, plan.spec.players);
  if (placement.status !== 'setup-error' && plan.spec.sourceSha256)
    assert.equal(report.sourceSha256, plan.spec.sourceSha256, 'official source changed: stop this campaign and preregister a new one');
  const record = { slot: slotId, arm: slot.arm, map: slot.map, reportSha256: digest, reportPath,
    startedAt: report.matchStartedAt || report.startedAt || null, sourceSha256: report.sourceSha256 || null, ...placement };
  return [...records, record];
}

function armObservations(plan, records, arm) {
  const final = finalSlots(records);
  return plan.schedule.filter(s => s.arm === arm && final.has(s.id)).map(s => {
    const r = final.get(s.id);
    return { slot: s.id, map: s.map, players: plan.spec.players, lo: r.lo, hi: r.hi, censored: r.censored, status: r.status };
  });
}

function summarizeArm(plan, observations) {
  const spec = plan.spec;
  const counts = { recorded: observations.length };
  for (const k of ['loss', 'opponents-eliminated', 'censored', 'game-error']) counts[k] = observations.filter(o => o.status === k).length;
  const fit = model.fitRating(observations, { bootstrap: spec.bootstrap, seed: spec.seed });
  if (!fit) return { counts, rating: null };
  const terminal = observations.filter(o => !o.censored), wins = terminal.filter(o => o.hi === 1).length;
  const byMap = {};
  for (const m of spec.maps) byMap[m] = observations.filter(o => o.map === m);
  const half = Math.floor(observations.length / 2);
  const early = model.fitRating(observations.slice(0, half)), late = model.fitRating(observations.slice(half));
  const drift = early && late && early.seElo && late.seElo
    ? { earlyElo: early.elo, lateElo: late.elo, z: (late.elo - early.elo) / Math.hypot(early.seElo, late.seElo) } : null;
  return {
    counts,
    rating: { elo: fit.elo, seElo: fit.seElo, ci95Profile: fit.ci95Profile, ci95Bootstrap: fit.ci95Bootstrap || null, unbounded: fit.unbounded },
    wins: { firstPlace: wins, terminalMatches: terminal.length, ci95ClopperPearson: model.clopperPearson(wins, terminal.length),
      modelWinProbability: fit.unbounded ? null : model.winProbability(fit.theta, spec.players) },
    perMap: Object.fromEntries(Object.entries(byMap).filter(([, o]) => o.length).map(([m, o]) => {
      const f = model.fitRating(o); return [m, { matches: o.length, elo: f.elo, ci95Profile: f.ci95Profile }]; })),
    heterogeneityAcrossMaps: model.heterogeneity(byMap),
    drift,
    diagnostics: fit.unbounded ? null : model.diagnostics(observations, fit.theta)
  };
}

function report(plan, records) {
  validatePlan(plan);
  const spec = plan.spec, final = finalSlots(records);
  const abandoned = plan.schedule.filter(s => isAbandoned(records, s.id) && !final.has(s.id)).map(s => s.id);
  const arms = Object.fromEntries(spec.arms.map(a => [a.name, summarizeArm(plan, armObservations(plan, records, a.name))]));
  const all = [...final.values()];
  const gameErrors = all.filter(r => r.status === 'game-error').length;
  const censored = all.filter(r => r.censored).length;
  const flags = [];
  if (abandoned.length) flags.push('abandoned-slots');
  if (all.length >= 20 && gameErrors / all.length > 0.05) flags.push('game-error-rate-above-5-percent');
  if (all.length >= 20 && censored / all.length > 0.2) flags.push('censored-rate-above-20-percent');
  for (const [name, a] of Object.entries(arms)) {
    const d = a.diagnostics;
    if (d && ((d.winZ != null && Math.abs(d.winZ) > 3) || (d.midPitZ != null && Math.abs(d.midPitZ) > 3))) flags.push(`model-misfit:${name}`);
    if (a.heterogeneityAcrossMaps && a.heterogeneityAcrossMaps.pValue < 0.01) flags.push(`map-heterogeneity:${name}`);
    if (a.drift && Math.abs(a.drift.z) > 3) flags.push(`drift:${name}`);
  }
  let comparison = null, stopped = false;
  if (spec.arms.length === 2) {
    const [base, cand] = spec.arms.map(a => arms[a.name]);
    const ready = base.rating && cand.rating && base.counts.recorded >= spec.sprt.minMatchesPerArm &&
      cand.counts.recorded >= spec.sprt.minMatchesPerArm;
    if (base.rating && cand.rating) {
      const delta = cand.rating.elo - base.rating.elo;
      const se = base.rating.seElo && cand.rating.seElo ? Math.hypot(base.rating.seElo, cand.rating.seElo) : null;
      comparison = { baseline: spec.arms[0].name, candidate: spec.arms[1].name, deltaElo: delta, seElo: se,
        ci95: se ? [delta - 1.959963984540054 * se, delta + 1.959963984540054 * se] : null,
        sprt: ready ? model.sprt({ deltaElo: delta, seElo: se, ...spec.sprt })
          : { decision: 'continue', reason: `fewer than ${spec.sprt.minMatchesPerArm} matches per arm` } };
      stopped = comparison.sprt.decision !== 'continue';
    }
  }
  const complete = plan.schedule.every(s => final.has(s.id) || abandoned.includes(s.id));
  return {
    kind: KIND, model: MODEL, planSha256: plan.planSha256,
    status: complete ? 'complete' : stopped ? 'stopped-by-sprt' : 'in-progress',
    conditions: { difficultyLabel: spec.difficultyLabel, players: spec.players, maps: spec.maps, seconds: spec.seconds, sourceSha256: spec.sourceSha256 },
    scale: 'Elo relative to one bot of the pool (bot = 0) under the elimination model',
    eloFor50PercentWins: model.eloForWinProbability(0.5, spec.players),
    slots: { scheduled: plan.schedule.length, recorded: final.size, abandoned, setupErrors: records.filter(r => r.status === 'setup-error').length },
    arms, comparison, flags,
    interpretation: 'Evidence from installed-extension single-player matches only. First place is the last survivor, not confirmed official map completion.'
  };
}

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function writeNew(file, value) { fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' }); }
function recordsPath(planFile) { return planFile.replace(/\.json$/, '') + '.records.json'; }

function main(argv) {
  const [command, ...args] = argv;
  const flag = (name, fallback) => { const i = args.indexOf('--' + name); return i >= 0 ? Number(args[i + 1]) : fallback; };
  if (command === 'release') { console.log(JSON.stringify(currentRelease(), null, 2)); return 0; }
  if (command === 'power') {
    console.log(JSON.stringify(model.plan({ players: flag('players', 512), elo: flag('elo', 0), halfWidthElo: flag('halfwidth', 50),
      deltaElo: flag('delta', 50), alpha: flag('alpha', 0.05), beta: flag('beta', 0.2) }), null, 2));
    return 0;
  }
  if (command === 'init') {
    const [specFile, planFile] = args; assert.ok(specFile && planFile, 'usage: init <spec.json> <plan.json>');
    const plan = createPlan(readJson(specFile)); writeNew(planFile, plan);
    console.log(JSON.stringify({ planFile, planSha256: plan.planSha256, slots: plan.schedule.length }, null, 2));
    return 0;
  }
  if (command === 'record') {
    const [planFile, slot, reportFile] = args; assert.ok(planFile && slot && reportFile, 'usage: record <plan.json> <slot> <report.json>');
    const plan = readJson(planFile), file = recordsPath(planFile), records = loadRecords(file);
    const bytes = fs.readFileSync(reportFile);
    const updated = recordMatch(plan, records, Number(slot), JSON.parse(bytes), bytes, path.relative(path.dirname(planFile), reportFile));
    if (fs.existsSync(file)) fs.copyFileSync(file, file + '.bak-' + records.length);
    fs.writeFileSync(file, JSON.stringify(updated, null, 2) + '\n');
    console.log(JSON.stringify(updated[updated.length - 1], null, 2));
    return 0;
  }
  if (command === 'report') {
    const [planFile] = args; assert.ok(planFile, 'usage: report <plan.json>');
    const plan = readJson(planFile), records = loadRecords(recordsPath(planFile));
    for (const r of records) {
      const evidence = path.resolve(path.dirname(planFile), r.reportPath);
      if (fs.existsSync(evidence)) assert.equal(sha256(fs.readFileSync(evidence)), r.reportSha256, `evidence changed: ${r.reportPath}`);
    }
    const result = report(plan, records);
    console.log(JSON.stringify(result, (k, v) => (typeof v === 'number' && !Number.isFinite(v) ? String(v) : v), 2));
    return result.status === 'in-progress' ? 2 : 0;
  }
  console.error('usage: elo-campaign.cjs release | power [--players N --elo E --halfwidth H --delta D --alpha A --beta B] | init <spec> <plan> | record <plan> <slot> <report> | report <plan>');
  return 1;
}

if (require.main === module) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (error) { console.error(String(error.message || error)); process.exitCode = 1; }
}
module.exports = { createPlan, validatePlan, schedule, derivePlacement, recordMatch, report, nextSlot, MAX_SETUP_RETRIES };
