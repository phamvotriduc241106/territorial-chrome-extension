'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createPlan, validatePlan, appendResult, report, wilson } = require('../tools/very-hard-standard.cjs');
// Synthetic fixtures only. None of these records represent played matches.
const release = { extensionVersion: '10.2.4', engineVersion: 'V2.7',
  releaseSha256: 'a'.repeat(64), engineSha256: 'b'.repeat(64),
  settings: { botEnabled: true, autoAttack: true, autoExpand: true } };
const create = () => createPlan(['A', 'B', 'C', 'D'], release, '2026-10-04T15:00:00Z');
function fixture(plan, outcome = 'win') {
  const id = plan.results.length + 1;
  const start = Date.parse(plan.createdAt) + id * 1000000;
  return {
    id, map: plan.schedule[id - 1].map, outcome,
    difficulty: 5, players: 64, mode: 'single-player',
    extensionVersion: release.extensionVersion, engineVersion: release.engineVersion,
    releaseSha256: release.releaseSha256, engineSha256: release.engineSha256,
    settings: { ...release.settings }, manualIntervention: false,
    mapSeed: 'undisclosed', spawnSeed: 1234,
    startedAt: new Date(start).toISOString(),
    endedAt: new Date(start + (outcome === 'timeout' ? 900000 : 60000)).toISOString(),
    terminalConfirmed: ['win', 'loss'].includes(outcome), reason: 'Synthetic test fixture',
    evidence: { start: { path: 'fixture-start.png', sha256: 'c'.repeat(64) },
      finish: { path: 'fixture-finish.png', sha256: 'd'.repeat(64) } }
  };
}
test('prospective schedule has 20 matches, 5 per map, interleaved', () => {
  const plan = validatePlan(create());
  assert.equal(plan.schedule.length, 20);
  for (const map of plan.maps) assert.equal(plan.schedule.filter(m => m.map === map).length, 5);
  assert.deepEqual(plan.schedule.slice(0, 4).map(m => m.map), plan.maps);
});
test('empty and single-win campaigns remain incomplete', () => {
  const plan = create();
  assert.equal(report(plan).winRatePct, null);
  assert.equal(report(plan).wilson95Pct, null);
  const next = appendResult(plan, fixture(plan), release);
  assert.equal(next.results.length, 1);
  assert.equal(plan.results.length, 0, 'append must not mutate the prior plan');
  assert.equal(report(next).status, 'incomplete');
  assert.deepEqual(report(next).wilson95Pct, [20.65, 100]);
});
test('all 20 records are required and errors/timeouts stay in the denominator', () => {
  let plan = create();
  const outcomes = ['win', 'loss', 'timeout', 'error'];
  for (let i = 0; i < 20; i++) plan = appendResult(plan, fixture(plan, outcomes[i % 4]), release);
  const result = report(plan);
  assert.equal(result.status, 'complete');
  assert.equal(result.completed, 20);
  assert.equal(result.winRatePct, 25);
  assert.equal(result.failureRatePct, 50);
  assert.deepEqual(result.outcomes, { win: 5, loss: 5, timeout: 5, error: 5 });
  assert.throws(() => appendResult(plan, {}, release), /already complete/);
});
test('Wilson intervals include boundary uncertainty, not a certainty claim', () => {
  assert.deepEqual(wilson(0, 20), [0, 16.11]);
  assert.deepEqual(wilson(20, 20), [83.89, 100]);
  assert.deepEqual(wilson(10, 20), [29.93, 70.07]);
});
const cases = [
  ['wrong difficulty', r => { r.difficulty = 3; }],
  ['online game', r => { r.mode = 'multiplayer'; }],
  ['changed player count', r => { r.players = 32; }],
  ['changed version', r => { r.extensionVersion = '10.2.5'; }],
  ['changed engine hash', r => { r.engineSha256 = 'e'.repeat(64); }],
  ['changed release hash', r => { r.releaseSha256 = 'e'.repeat(64); }],
  ['changed settings', r => { r.settings.autoAttack = false; }],
  ['manual intervention', r => { r.manualIntervention = true; }],
  ['skipped match', r => { r.id = 2; }],
  ['wrong map', r => { r.map = 'B'; }],
  ['invented outcome', r => { r.outcome = 'survived'; }],
  ['missing seed disclosure', r => { delete r.mapSeed; }],
  ['noninteger seed', r => { r.spawnSeed = 1.5; }],
  ['missing screenshot', r => { delete r.evidence.finish; }],
  ['invalid screenshot hash', r => { r.evidence.start.sha256 = 'bad'; }],
  ['unconfirmed victory', r => { r.terminalConfirmed = false; }],
  ['negative duration', r => { r.endedAt = '2026-10-04T15:00:00Z'; }],
  ['missing timezone', r => { r.startedAt = '2026-10-04T15:16:40'; }],
  ['prior anecdotal win', r => { r.startedAt = '2026-10-04T14:00:00Z'; }],
  ['late victory', r => { r.endedAt = new Date(Date.parse(r.startedAt) + 901000).toISOString(); }],
  ['premature timeout', r => { r.outcome = 'timeout'; r.terminalConfirmed = false; }],
  ['missing error reason', r => { r.outcome = 'error'; r.terminalConfirmed = false; r.reason = ''; }]
];
for (const [name, mutate] of cases) test('rejects ' + name, () => {
  const plan = create(), result = fixture(plan);
  mutate(result);
  assert.throws(() => appendResult(plan, result, release));
});
test('rejects runtime edits midway through campaign', () => {
  const plan = create();
  assert.throws(() => appendResult(plan, fixture(plan), { ...release, releaseSha256: 'f'.repeat(64) }), /Runtime changed/);
});
test('rejects duplicate, overlapping and cherry-picked schedules', () => {
  const plan = create();
  const next = appendResult(plan, fixture(plan), release);
  assert.throws(() => appendResult(next, next.results[0], release));
  const overlap = fixture(next);
  overlap.startedAt = next.results[0].startedAt;
  overlap.endedAt = next.results[0].endedAt;
  assert.throws(() => appendResult(next, overlap, release), /overlap/);
  const altered = create(); altered.schedule[1].map = 'A';
  assert.throws(() => validatePlan(altered));
  assert.throws(() => createPlan(['A', 'A', 'B', 'C'], release));
  assert.throws(() => createPlan(['A'], release));
});
