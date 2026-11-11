'use strict';
// Campaign bookkeeping: preregistration, slot order, identity checks and
// placement derivation from synthetic recorder reports. No game is played.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const c = require('../../tools/live/elo-campaign.cjs');
const m = require('../../tools/lib/elo-model.cjs');

const BASE = 'a'.repeat(64), CAND = 'b'.repeat(64), SOURCE = 'c'.repeat(64);
function spec(overrides = {}) {
  return { difficultyLabel: 'Impossible', players: 64, maps: ['Europe', 'Asia'], seconds: 900, sourceSha256: SOURCE,
    arms: [{ name: 'baseline', releaseSha256: BASE, policy: 'baseline' }, { name: 'candidate', releaseSha256: CAND, policy: 'baseline' }],
    matchesPerArm: 24, sprt: { elo0: 0, elo1: 100, alpha: 0.05, beta: 0.05, minMatchesPerArm: 8 }, bootstrap: 0, seed: 1, ...overrides };
}
const native = (alive, territory, alivePlayers, tick) => ({ ready: true, gameTick: tick, alive, territory, alivePlayers });
/** Synthetic recorder report whose samples end in the given placement. */
function report(plan, slot, placement, extra = {}) {
  const arm = plan.spec.arms.find(a => a.name === slot.arm), N = plan.spec.players, samples = [];
  let tick = 10;
  for (let alive = N; alive > Math.max(placement, 1); alive -= 3) samples.push({ native: native(true, 50, alive, tick += 10) });
  samples.push({ native: native(true, 40, placement, tick += 10) });
  let outcome = 'opponents-eliminated';
  if (placement > 1) { samples.push({ native: native(false, 0, placement - 1, tick += 10) }); outcome = 'loss'; }
  return { evidenceKind: 'live-official-installed-extension-diagnostic', difficultyLabel: plan.spec.difficultyLabel,
    players: N, scenario: { playerCount: N }, mapLabel: slot.map, release: { releaseSha256: arm.releaseSha256 },
    assignedPolicy: arm.policy, manualCombatCommands: 0, accelerated: false, sourceSha256: SOURCE,
    matchStartedAt: '2026-11-09T20:00:00.000Z', outcome, samples, nonce: Math.random(), ...extra };
}
const bytes = r => Buffer.from(JSON.stringify(r));

test('preregistered plan has map-rotated ABBA pairs and detects later edits', () => {
  const plan = c.createPlan(spec(), '2026-11-09T20:00:00.000Z');
  assert.deepEqual(plan.schedule.slice(0, 4).map(s => s.arm), ['baseline', 'candidate', 'candidate', 'baseline']);
  assert.deepEqual(plan.schedule.slice(0, 4).map(s => s.map), ['Europe', 'Europe', 'Asia', 'Asia']);
  assert.equal(plan.schedule.length, 48);
  c.validatePlan(plan);
  const edited = JSON.parse(JSON.stringify(plan)); edited.spec.sprt.elo1 = 60;
  assert.throws(() => c.validatePlan(edited), /plan hash mismatch/);
  const reordered = JSON.parse(JSON.stringify(plan)); reordered.schedule[0].arm = 'candidate';
  assert.throws(() => c.validatePlan(reordered), /schedule was edited/);
  assert.throws(() => c.createPlan(spec({ arms: [spec().arms[0]] })), /no SPRT/);
  c.createPlan(spec({ arms: [spec().arms[0]], sprt: null }));
});

test('placement intervals come from the recorder samples', () => {
  const plan = c.createPlan(spec()), slot = plan.schedule[0];
  // Last alive sample showed 20 players (agent included); first dead sample shows 17 bots.
  const r = report(plan, slot, 20); r.samples[r.samples.length - 1].native.alivePlayers = 17;
  assert.deepEqual(c.derivePlacement(r, 64), { status: 'loss', lo: 18, hi: 20, censored: false });
  assert.deepEqual(c.derivePlacement(report(plan, slot, 1), 64), { status: 'opponents-eliminated', lo: 1, hi: 1, censored: false });
  const timeout = report(plan, slot, 9); timeout.samples.pop(); timeout.outcome = 'censored-time-limit';
  assert.deepEqual(c.derivePlacement(timeout, 64), { status: 'censored', lo: 1, hi: 9, censored: true });
  assert.deepEqual(c.derivePlacement({ samples: [] }, 64), { status: 'setup-error' });
  const lying = report(plan, slot, 5); lying.outcome = 'opponents-eliminated';
  assert.throws(() => c.derivePlacement(lying, 64), /disagrees/);
});

test('recording enforces slot order, identity, source and no duplicates', () => {
  const plan = c.createPlan(spec());
  let records = [];
  const first = report(plan, plan.schedule[0], 30);
  assert.throws(() => c.recordMatch(plan, records, 2, report(plan, plan.schedule[1], 30), bytes(first), 'x'), /in order/);
  assert.throws(() => c.recordMatch(plan, records, 1, { ...first, mapLabel: 'Asia' }, bytes(first), 'x'), /map differs/);
  assert.throws(() => c.recordMatch(plan, records, 1, { ...first, release: { releaseSha256: CAND } }, bytes(first), 'x'), /release differs/);
  assert.throws(() => c.recordMatch(plan, records, 1, { ...first, sourceSha256: 'd'.repeat(64) }, bytes(first), 'x'), /source changed/);
  assert.throws(() => c.recordMatch(plan, records, 1, { ...first, players: 32 }, bytes(first), 'x'), /player count/);
  records = c.recordMatch(plan, records, 1, first, bytes(first), 'm1.json');
  assert.equal(records[0].lo <= 30 && 30 <= records[0].hi, true);
  assert.throws(() => c.recordMatch(plan, records, 2, report(plan, plan.schedule[1], 9), bytes(first), 'm1.json'), /already recorded/);
});

test('setup errors may be retried in the same slot, then the slot is abandoned', () => {
  const plan = c.createPlan(spec());
  let records = [];
  for (let i = 0; i < c.MAX_SETUP_RETRIES; i++) {
    const failed = { ...report(plan, plan.schedule[0], 10), matchStartedAt: undefined, attempt: i };
    records = c.recordMatch(plan, records, 1, failed, bytes(failed), `fail${i}.json`);
    assert.equal(records[records.length - 1].status, 'setup-error');
  }
  assert.equal(c.nextSlot(plan, records).id, 2);
  assert.ok(c.report(plan, records).flags.includes('abandoned-slots'));
});

test('a simulated A/B campaign recovers a +200 Elo candidate and stops by SPRT', () => {
  const plan = c.createPlan(spec({ matchesPerArm: 60, bootstrap: 200 })), random = m.lcg(12);
  const strength = { baseline: m.toTheta(-150), candidate: m.toTheta(50) };
  let records = [], result;
  for (const slot of plan.schedule) {
    const q = Math.exp(-strength[slot.arm]);
    let placement = 1;
    for (let bots = 63; bots > 0; bots--) if (random() < q / (bots + q)) { placement = bots + 1; break; }
    const r = report(plan, slot, placement);
    records = c.recordMatch(plan, records, slot.id, r, bytes(r), `m${slot.id}.json`);
    result = c.report(plan, records);
    if (result.status === 'stopped-by-sprt') break;
  }
  assert.equal(result.status, 'stopped-by-sprt');
  assert.equal(result.comparison.sprt.decision, 'accept-H1');
  assert.ok(result.comparison.deltaElo > 0);
  const base = result.arms.baseline.rating;
  assert.ok(base.ci95Profile[0] < base.elo && base.elo < base.ci95Profile[1]);
  assert.ok(base.ci95Bootstrap[0] < base.ci95Bootstrap[1]);
  assert.ok(Math.abs(result.eloFor50PercentWins - m.eloForWinProbability(0.5, 64)) < 1e-9);
});

test('a headless plan accepts only headless reports; older plans stay visible', () => {
  const headless = c.createPlan(spec({ display: 'headless' }));
  const visibleReport = report(headless, headless.schedule[0], 30);
  assert.throws(() => c.recordMatch(headless, [], 1, visibleReport, bytes(visibleReport), 'x'), /display mode differs/);
  const ok = { ...visibleReport, headless: true };
  assert.equal(c.recordMatch(headless, [], 1, ok, bytes(ok), 'x').length, 1);
  const legacy = c.createPlan(spec());
  assert.equal(legacy.spec.display, undefined);
  const headlessReport = { ...report(legacy, legacy.schedule[0], 30), headless: true };
  assert.throws(() => c.recordMatch(legacy, [], 1, headlessReport, bytes(headlessReport), 'x'), /display mode differs/);
  assert.throws(() => c.createPlan(spec({ display: 'offscreen' })), /visible or headless/);
});

const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
/** A fake campaign directory and player for runCampaign; nothing launches a browser. */
function harness(outcomes, overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'elo-run-'));
  const plan = c.createPlan(spec({ arms: [spec().arms[0]], sprt: null, matchesPerArm: 8, ...overrides }));
  const planFile = path.join(dir, 'plan.json'); fs.writeFileSync(planFile, JSON.stringify(plan));
  const waits = [], log = [];
  let n = 0;
  const play = slot => {
    const o = outcomes[n++] ?? { placement: 40 };
    const r = o.error ? { ...report(plan, slot, 40), matchStartedAt: undefined, outcome: 'error', error: o.error, samples: [] }
      : report(plan, slot, o.placement);
    const file = path.join(dir, `report-${n}.json`); fs.writeFileSync(file, JSON.stringify(r)); return file;
  };
  const run = () => c.runCampaign(planFile, { play, wait: async ms => { waits.push(ms); }, log: e => log.push(e),
    releaseOf: () => BASE, defaultCheckout: dir });
  const records = () => JSON.parse(fs.readFileSync(path.join(dir, 'plan.records.json'), 'utf8'));
  return { run, records, waits, log, plays: () => n };
}

test('run plays every slot in order and pauses between matches', async () => {
  const h = harness([]);
  assert.deepEqual(await h.run(), { halted: false, reason: 'schedule-exhausted' });
  assert.equal(h.records().length, 8);
  assert.deepEqual(h.records().map(r => r.slot), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(h.waits.length, 8);
});

test('run halts at once when the site refuses requests or the source changes', async () => {
  for (const error of ['page.goto: net::ERR_HTTP_RESPONSE_CODE_FAILURE at https://territorial.io/',
    "AssertionError: + 'contract-unmapped' - 'pre-exec-patched'"]) {
    const h = harness([{ error }]);
    assert.deepEqual(await h.run(), { halted: true, reason: 'site-or-source' });
    assert.equal(h.plays(), 1); assert.equal(h.waits.length, 0);
    assert.equal(h.records().length, 1); assert.equal(h.records()[0].status, 'setup-error');
  }
});

test('run retries one setup error after a pause, and halts on the second in a row', async () => {
  const recovered = harness([{ error: 'page.waitForFunction: Timeout' }]);
  assert.equal((await recovered.run()).reason, 'schedule-exhausted');
  assert.equal(recovered.waits[0], 120000);
  const failing = harness([{ error: 'Timeout' }, { error: 'Timeout' }]);
  assert.deepEqual(await failing.run(), { halted: true, reason: 'setup-errors' });
  assert.equal(failing.plays(), 2);
  assert.ok(failing.records().every(r => r.slot === 1), 'no slot is burned after the halt');
});

test('run refuses to start from a checkout that is not the arm release', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'elo-run-'));
  const plan = c.createPlan(spec({ arms: [spec().arms[0]], sprt: null, matchesPerArm: 8 }));
  const planFile = path.join(dir, 'plan.json'); fs.writeFileSync(planFile, JSON.stringify(plan));
  let played = 0;
  const result = await c.runCampaign(planFile, { play: () => { played++; return null; }, releaseOf: () => CAND,
    log: () => {}, wait: async () => {}, defaultCheckout: dir });
  assert.deepEqual(result, { halted: true, reason: 'release-mismatch' });
  assert.equal(played, 0);
});
