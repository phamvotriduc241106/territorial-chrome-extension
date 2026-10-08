'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { summarize } = require('../tools/frontier-report.cjs');
const { fit } = require('../tools/frontier-fit.cjs');
function setup(options = {}) {
  const box = vm.createContext({ crypto: { randomUUID: require('node:crypto').randomUUID } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../content/frontier-episodes.js'), 'utf8'), box);
  return { rec: new box.TIOEpisodeTelemetry.Recorder(options), effect: box.TIOEpisodeTelemetry.effect };
}
const front = { nativeFrontId: 1, actor: 0, target: 1, troops: 100, reinforced: false,
  actorState: { territory: 100, balance: 1000 }, targetState: { territory: 100, balance: 1000 } };
const state = (tick = 0, change = {}) => ({ matchId: 'match', gameTick: tick, stateVersion: tick + 1,
  sourceStateVersion: tick + 1, contract: 'fixture', ready: true, alive: true, alivePlayers: 2,
  player: 0, territory: 100, balance: 1000, enemies: [{ id: 1, territory: 100, balance: 1000 }],
  combatFronts: [front], ...change });
const core = { transitionPlanningState(s, a, ticks) { return { ...s, tick: s.tick + ticks,
  modelKind: s.frontierExperiment ? 'native-cost-static-frontier-shadow' : 'aggregate-combat-estimate',
  adjEnemies: s.adjEnemies, shadowEffects: { '0:1': { captured: s.tick + ticks, terminationTick: 2 } } }; } };
const snapshot = { meta: { geometryVersion: 1, gameTick: 0 }, pairs: [] };
function launch(rec, f = front, s = state()) {
  rec.commandCoverage = true;
  rec.native({ event: 'native_command', kind: 'front-admission', ...f, gameTick: s.gameTick,
    observationTick: s.gameTick, sourceStateVersion: s.sourceStateVersion }, { ...s, metadata: {} });
}
const records = rec => rec.export().records;
test('spatial-sized records obey both event and byte bounds and drain releases retained records', () => {
  const { rec } = setup({ capacity: 16384, maxBytes: 65536 });
  for (let i=0;i<100;i++) rec.add({ event:'spatial-sized-fixture',i,changes:Array.from({length:100},(_,j)=>[j,1,0]) });
  const out=rec.export();assert.ok(out.bufferedByteBound<=65536);assert.ok(out.dropped>0);
  rec.export(true);assert.equal(rec.bytes,0);assert.equal(rec.size,0);assert.ok(rec.records.every(x=>x===undefined));
  assert.throws(()=>setup({maxBytes:1}),/byte capacity/);
});
test('four horizons use stable native front/episode IDs and exact provenance', () => {
  const { rec } = setup(); launch(rec); rec.observe(state(), snapshot, core);
  const p = records(rec).filter(r => r.event === 'prediction');
  assert.deepEqual(Array.from(p, r => r.horizon), [2, 5, 10, 20]);
  assert.equal(new Set(p.map(r => r.frontId)).size, 1);
  assert.equal(p[0].sourceStateVersion, 1); assert.equal(p[0].geometryVersion, 1);
  rec.observe(state(2), null, null);
  assert.equal(rec.scored, 1); assert.equal(rec.pending.length, 3);
  assert.equal(records(rec).find(r => r.event === 'prediction_scored').observedTick, 2);
});
test('forecast reinforcement subset uses current native flag, not prior batch flag', () => {
  const { rec } = setup(); launch(rec, { ...front, reinforced: true });
  rec.observe(state(0, { combatFronts: [{ ...front, reinforced: false }] }), snapshot, core);
  assert.ok(records(rec).filter(r => r.event === 'prediction').every(r => r.reinforced === false));
});
test('all commands enter ledger; irrelevant actions do not censor, relevant ones do', () => {
  const { rec } = setup(); launch(rec); rec.observe(state(), snapshot, core);
  rec.native({ event: 'native_command', kind: 'bank-debit', actor: 3, gameTick: 1, sourceStateVersion: 2 }, state(1));
  rec.observe(state(2), null, null);
  assert.equal(rec.scored, 1);
  assert.equal(records(rec).find(r => r.event === 'prediction_scored').interveningCommands.length, 1);
  rec.native({ event: 'native_command', kind: 'front-topup', ...front, gameTick: 4, sourceStateVersion: 5 }, state(4));
  rec.observe(state(5), null, null);
  assert.equal(rec.skipped, 3); assert.ok(records(rec).some(r => r.reason === 'future-action'));
});
test('native reinforcement and refund censor affected force/bank forecasts', () => {
  for (const event of ['native_reinforcement', 'native_termination']) {
    const { rec } = setup(); launch(rec); rec.observe(state(), snapshot, core);
    rec.native({ event, ...front, gameTick: 1, observationTick: 2, sourceStateVersion: 2,
      reason: 'native-return', actorAfter: front.actorState, targetAfter: front.targetState, refund: 10 }, state(1));
    rec.observe(state(2, { combatFronts: event === 'native_termination' ? [] : [front] }), null, null);
    assert.equal(rec.scored, 0); assert.equal(rec.skipped, 4);
  }
});
test('disappearance is censored, never conquest or a valid ETA label', () => {
  const { rec } = setup(); launch(rec); rec.observe(state(), snapshot, core);
  rec.observe(state(2, { combatFronts: [] }), null, null);
  assert.equal(rec.scored, 0); assert.equal(rec.skipped, 4);
  const e = records(rec).find(r => r.event === 'episode_censored');
  assert.equal(e.reason, 'unobserved-disappearance'); assert.equal(e.conquest, 'not-inferred');
  assert.equal(records(rec).filter(r => r.event === 'episode_termination').length, 0);
});
test('native return supplies actual duration, settlement state, refund and valid conditional ETA', () => {
  const { rec } = setup({ horizons: [2] }); launch(rec); rec.observe(state(), snapshot, core);
  rec.native({ event: 'native_termination', ...front, gameTick: 1, observationTick: 2, sourceStateVersion: 2,
    reason: 'native-return', actorAfter: front.actorState, targetAfter: { ...front.targetState, alive: true }, refund: 0 }, state(1));
  rec.observe(state(2, { combatFronts: [] }), null, null);
  const label = records(rec).find(r => r.event === 'prediction_scored');
  assert.equal(label.etaLabelValid, true); assert.equal(label.actualEtaTicks, 2);
  const term = records(rec).find(r => r.event === 'episode_termination');
  assert.equal(term.durationTicks, 2); assert.equal(term.targetEliminated, false); assert.equal(term.conquest, 'not-inferred');
});
test('observed mid-attack is left censored, removal cannot establish settlement ETA', () => {
  const { rec } = setup({ horizons: [2] }); rec.commandCoverage = true; rec.observe(state(), snapshot, core);
  rec.native({ event: 'native_termination', ...front, gameTick: 1, observationTick: 2, sourceStateVersion: 2,
    reason: 'native-front-removal', actorAfter: front.actorState, targetAfter: front.targetState, refund: null }, state(1));
  rec.observe(state(2, { combatFronts: [] }), null, null);
  assert.equal(records(rec).find(r => r.event === 'prediction_scored').etaLabelValid, false);
  assert.equal(records(rec).find(r => r.event === 'episode_termination').durationTicks, null);
});
test('native relaunch creates new IDs, not reused pair identity', () => {
  const { rec } = setup(); launch(rec); rec.observe(state(), null, null);
  rec.native({ event: 'native_termination', ...front, gameTick: 1, observationTick: 2, sourceStateVersion: 2,
    reason: 'native-return', actorAfter: front.actorState, refund: 0 }, state(1));
  rec.observe(state(2, { combatFronts: [] }), null, null);
  launch(rec, { ...front, nativeFrontId: 2 }, state(3));
  assert.equal(new Set(records(rec).filter(r => r.event === 'episode_start').map(r => r.frontId)).size, 2);
});
test('missing tick, unknown existing front and command coverage fail closed', () => {
  const { rec } = setup(); launch(rec); rec.observe(state(), snapshot, core); rec.observe(state(3), null, null);
  assert.ok(records(rec).some(r => r.reason === 'missed-tick'));
  const unknown = setup().rec; launch(unknown);
  unknown.observe(state(0, { combatFronts: [front, { ...front, nativeFrontId: 2, actor: 1, target: 2 }] }), snapshot, core);
  assert.equal(unknown.pending.length, 0); assert.ok(records(unknown).some(r => r.reason === 'unmodeled-existing-front'));
  const fallback = setup().rec; fallback.observe(state(), null, core);
  assert.equal(fallback.scored, 0); assert.equal(fallback.skipped, 4);
  rec.gap('sink-exception'); assert.equal(rec.commandCoverage, false); assert.equal(rec.pending.length, 0);
});
test('exact selective actor state is required; stale episode state never becomes a label', () => {
  const { rec } = setup({ horizons: [2] }); const incoming = { ...front, actor: 1, target: 0 };
  launch(rec, incoming); rec.observe(state(0, { combatFronts: [incoming] }), snapshot, core);
  rec.observe(state(2, { combatFronts: [incoming], enemies: [] }), null, null);
  assert.equal(rec.scored, 0); assert.ok(records(rec).some(r => r.reason === 'actor-state-unavailable'));
});
test('effects are attack-specific and opt-in; bounded exports drain without data aliasing', () => {
  const { rec, effect } = setup({ capacity: 32 });
  const s = { player: 0 }; effect(s, { targetId: 1 }, 5); assert.equal(s.shadowEffects, undefined);
  s.shadowTrackEffects = true; s.shadowEffects = {}; s.tick = 2;
  effect(s, { targetId: 1 }, 5, true); effect(s, { attackerId: 1, targetId: null }, 3);
  assert.equal(s.shadowEffects['0:1'].captured, 5); assert.equal(s.shadowEffects['1:0'].captured, 3);
  for (let i = 0; i < 40; i++) rec.add({ event: 'dummy', i });
  assert.equal(rec.dropped, 8); const a = rec.export(true); assert.equal(a.records.length, 32);
  a.records[0].i = -1; assert.equal(rec.export().records.length, 0);
  assert.throws(() => setup({ capacity: 3.5 }), /capacity/); assert.throws(() => setup({ horizons: [1.5] }), /horizons/);
});
function sample() {
  const { rec } = setup({ horizons: [2] }); launch(rec); rec.observe(state(), snapshot, core);
  rec.observe(state(2), null, null); rec.observe(state(3, { alivePlayers: 1 }), null, null);
  return rec.export();
}
test('offline paired episode/match/horizon metrics deduplicate and identify complete matches', () => {
  const input = sample(), report = summarize([input, input]);
  assert.equal(report.completeMatchCount, 1); assert.equal(report.forecasts, 1); assert.equal(report.byEpisode.length, 1);
  assert.equal(report.frontier.captured.mae, 2); assert.equal(report.frontier.territory.mae, 0);
  assert.equal(report.censoringRate, 0); assert.equal(report.subsets['non-reinforced'].paired, 1);
  assert.equal(report.byHorizon[0].horizon, 2); assert.equal(report.policyPromotionAllowed, false);
  assert.equal(report.episodeCoverage.observed, 1); assert.equal(report.episodeCoverage.forecasted, 1);
  assert.equal(report.subsets['reinforcement-observed'].forecasts, 0);
  assert.equal(report.subsets['reinforcement-observed'].frontier.territory.mae, null);
  const changed = JSON.parse(JSON.stringify(input)); changed.records[0].actor = 123;
  assert.throws(() => summarize([input, changed]), /Conflicting/);
});
test('offline analysis rejects precomputed scores contaminated by actions or incomplete ledger', () => {
  const input = sample(), score = input.records.find(r => r.event === 'prediction_scored');
  input.records.push({ event: 'native_command', eventId: input.sessionId + ':900', matchId: 'match', actor: 0,
    sourceStateVersion: 2, gameTick: 1 });
  score.interveningCommands.push(input.sessionId + ':900');
  const report = summarize([input]); assert.equal(report.paired, 0); assert.equal(report.invalid, 1);
  input.dropped = 10; assert.equal(summarize([input]).completeMatchCount, 0);
});
test('no recordings means no invented fit; incomplete matches excluded and schema1 cannot calibrate', () => {
  const input = sample(); input.records = input.records.filter(r => r.event !== 'match_end');
  const result = fit([input]); assert.equal(result.status, 'insufficient-complete-matches');
  assert.equal(result.trainingMatches.length, 0); assert.equal(result.firstBatchDelayTicks.median, null);
  assert.equal(result.parametersApplied, false); assert.equal(result.policyInfluence, false);
  assert.throws(() => fit([{ schema: 1, policyInfluence: false, records: [] }]), /Unsupported/);
});
test('parameter estimates split whole matches and exclude future-action-disturbed ETA', () => {
  const inputs = [];
  for (let i = 0; i < 3; i++) {
    const { rec } = setup(); const s = state(0, { matchId: 'fit-' + i }); launch(rec, front, s);
    rec.observe(s, null, null);
    for (const tick of [7, 11]) rec.native({ event: 'native_batch', ...front, gameTick: tick - 1,
      observationTick: tick, sourceStateVersion: tick, candidateCells: tick === 7 ? 10 : 20, returned: false,
      territoryDelta: 10, before: { actor: front.actorState, force: 100, counterforce: 0 },
      after: { actor: front.actorState, force: 80, counterforce: 0 } }, { ...s, gameTick: tick - 1 });
    if (i === 0) rec.native({ event: 'native_command', kind: 'bank-debit', actor: 0, gameTick: 12,
      sourceStateVersion: 12 }, { ...s, gameTick: 12 });
    rec.native({ event: 'native_termination', ...front, gameTick: 19, observationTick: 20, sourceStateVersion: 20,
      reason: 'native-return', remainingForce: 10, refund: 10, actorAfter: { ...front.actorState, debt: 0 },
      targetAfter: front.targetState }, { ...s, gameTick: 19 });
    rec.observe({ ...s, gameTick: 21, alivePlayers: 1, combatFronts: [] }, null, null);
    inputs.push(rec.export());
  }
  const result = fit(inputs);
  assert.deepEqual(result.trainingMatches, ['fit-0', 'fit-1']); assert.deepEqual(result.heldoutMatches, ['fit-2']);
  assert.equal(result.cadenceTicksByActorTerritory['<1000'].median, 4);
  assert.equal(result.firstBatchDelayTicks.median, 7); assert.equal(result.etaTerminalSamples, 1);
  assert.equal(result.etaHeldoutSamples, 1); assert.equal(result.refundCreditToRemainingForce.median, 1);
  assert.equal(result.heldoutEtaErrorTicks.n, 0, 'insufficient training episodes cannot supply a held-out ETA model');
  assert.equal(result.parametersApplied, false);
});
