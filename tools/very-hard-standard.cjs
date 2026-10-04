'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { root, releaseFiles } = require('./release-files.cjs');
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const TOTAL = 20;
const SCHEMA = 1;

function currentRelease() {
  const sandbox = {};
  vm.runInNewContext(fs.readFileSync(path.join(root, 'shared/config.js'), 'utf8'), sandbox);
  const cfg = sandbox.TIOConfig;
  const hash = crypto.createHash('sha256');
  for (const file of releaseFiles()) {
    const bytes = fs.readFileSync(path.join(root, file));
    hash.update(file + '\0' + bytes.length + '\0').update(bytes);
  }
  return {
    extensionVersion: cfg.VERSION, engineVersion: cfg.ENGINE_VERSION,
    updatedAt: cfg.ENGINE_UPDATED_AT, releaseSha256: hash.digest('hex'),
    engineSha256: sha256(fs.readFileSync(path.join(root, 'content/engine-core-v2-advanced.js'))),
    settings: JSON.parse(JSON.stringify(cfg.DEFAULT_SETTINGS))
  };
}

function createPlan(maps, release = currentRelease(), createdAt = new Date().toISOString()) {
  assert.equal(maps.length, 4, 'Specify exactly 4 distinct map labels from your game');
  assert.ok(maps.every(m => typeof m === 'string' && m.trim() === m && m.length > 0));
  assert.equal(new Set(maps).size, 4, 'Map labels must be distinct');
  return {
    schema: SCHEMA, evidenceKind: 'human-recorded-official-single-player', createdAt,
    conditions: { difficulty: 5, players: 64, mode: 'single-player', maxDurationSeconds: 900 },
    release, maps: [...maps],
    // Interleave maps to avoid grouping all favorable conditions first.
    schedule: Array.from({ length: TOTAL }, (_, i) => ({ id: i + 1, map: maps[i % maps.length] })),
    results: []
  };
}

function date(value) {
  assert.equal(typeof value, 'string', 'Time must be an ISO timestamp with timezone');
  assert.match(value, /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/);
  const result = Date.parse(value);
  assert.ok(Number.isFinite(result), 'Invalid timestamp');
  return result;
}

function validatePlan(plan) {
  assert.equal(plan.schema, SCHEMA);
  assert.equal(plan.evidenceKind, 'human-recorded-official-single-player');
  date(plan.createdAt);
  assert.deepEqual(plan.conditions, { difficulty: 5, players: 64, mode: 'single-player', maxDurationSeconds: 900 });
  assert.equal(plan.maps.length, 4);
  assert.equal(new Set(plan.maps).size, 4);
  assert.ok(plan.maps.every(m => typeof m === 'string' && m.trim() === m && m.length > 0));
  assert.deepEqual(plan.schedule, Array.from({ length: TOTAL }, (_, i) => ({ id: i + 1, map: plan.maps[i % 4] })));
  assert.match(plan.release.releaseSha256, /^[a-f0-9]{64}$/);
  assert.match(plan.release.engineSha256, /^[a-f0-9]{64}$/);
  assert.match(plan.release.extensionVersion, /^\d+\.\d+\.\d+$/);
  assert.equal(typeof plan.release.engineVersion, 'string');
  assert.equal(typeof plan.release.settings, 'object');
  assert.ok(Array.isArray(plan.results) && plan.results.length <= TOTAL);
  for (let i = 0; i < plan.results.length; i++) validateResult(plan, plan.results[i], i);
  return plan;
}

function validateResult(plan, result, index) {
  assert.equal(result.id, index + 1, 'Record consecutive matches in the frozen order; no skipped losses');
  assert.equal(result.map, plan.schedule[index].map, 'Wrong scheduled map');
  assert.ok(['win', 'loss', 'timeout', 'error'].includes(result.outcome), 'Invalid outcome');
  assert.equal(result.difficulty, 5, 'Normal/Hard matches cannot count as Very Hard');
  assert.equal(result.players, 64, 'Player count must match the frozen plan');
  assert.equal(result.mode, 'single-player', 'Never count an online match');
  for (const key of ['extensionVersion', 'engineVersion', 'releaseSha256', 'engineSha256'])
    assert.equal(result[key], plan.release[key], 'Changed release identity: ' + key);
  assert.deepEqual(result.settings, plan.release.settings, 'Changed settings invalidate this campaign');
  assert.equal(result.manualIntervention, false, 'No manual attacks, slider changes or bot restarts');
  for (const key of ['mapSeed', 'spawnSeed'])
    assert.ok(result[key] === 'undisclosed' || Number.isSafeInteger(result[key]), 'Record seed or explicitly use undisclosed');
  const started = date(result.startedAt), ended = date(result.endedAt);
  assert.ok(started >= date(plan.createdAt), 'A prior anecdotal win cannot be inserted into a prospective plan');
  assert.ok(ended >= started, 'Negative match duration');
  if (index > 0) assert.ok(started >= date(plan.results[index - 1].endedAt), 'Matches must not overlap');
  const duration = (ended - started) / 1000;
  if (result.outcome === 'timeout') assert.ok(duration >= plan.conditions.maxDurationSeconds, 'Timeout before the frozen cutoff');
  else assert.ok(duration <= plan.conditions.maxDurationSeconds, 'Late win/loss must be recorded as timeout');
  if (['timeout', 'error'].includes(result.outcome))
    assert.ok(typeof result.reason === 'string' && result.reason.trim().length > 0, 'Record failure reason');
  assert.equal(result.terminalConfirmed, ['win', 'loss'].includes(result.outcome), 'Win/loss requires official end-screen confirmation');
  for (const key of ['start', 'finish']) {
    const item = result.evidence && result.evidence[key];
    assert.ok(item && typeof item.path === 'string' && item.path.length > 0, 'Missing screenshot: ' + key);
    assert.match(item.sha256, /^[a-f0-9]{64}$/, 'Invalid evidence digest');
  }
}

function appendResult(plan, result, release = currentRelease()) {
  validatePlan(plan);
  assert.equal(plan.results.length < TOTAL, true, 'The 20-match campaign is already complete');
  assert.equal(release.releaseSha256, plan.release.releaseSha256, 'Runtime changed: start a new campaign, do not merge versions');
  const next = JSON.parse(JSON.stringify(plan));
  next.results.push(result);
  validatePlan(next);
  return next;
}

function wilson(wins, matches) {
  if (!matches) return null;
  const p = wins / matches, z = 1.959963984540054, z2 = z * z;
  const denominator = 1 + z2 / matches;
  const center = p + z2 / (2 * matches);
  const margin = z * Math.sqrt(p * (1 - p) / matches + z2 / (4 * matches * matches));
  return [(center - margin) / denominator, (center + margin) / denominator].map(v => +(100 * v).toFixed(2));
}

function report(plan) {
  validatePlan(plan);
  const outcomes = { win: 0, loss: 0, timeout: 0, error: 0 };
  const maps = Object.fromEntries(plan.maps.map(map => [map, { matches: 0, wins: 0 }]));
  for (const result of plan.results) {
    outcomes[result.outcome]++;
    maps[result.map].matches++;
    maps[result.map].wins += Number(result.outcome === 'win');
  }
  const completed = plan.results.length;
  return {
    evidenceKind: plan.evidenceKind, status: completed === TOTAL ? 'complete' : 'incomplete',
    completed, required: TOTAL, outcomes, maps,
    winRatePct: completed ? 100 * outcomes.win / completed : null,
    wilson95Pct: wilson(outcomes.win, completed),
    failureRatePct: completed ? 100 * (outcomes.timeout + outcomes.error) / completed : null,
    release: plan.release,
    limitations: 'Human-recorded evidence; screenshot hashes verify file integrity, not outcome authenticity. Completion is not a performance guarantee. Twenty matches give wide uncertainty; do not pool maps or seed-dependent trials as a universal win rate.'
  };
}
module.exports = { TOTAL, currentRelease, createPlan, validatePlan, appendResult, report, wilson, sha256 };
