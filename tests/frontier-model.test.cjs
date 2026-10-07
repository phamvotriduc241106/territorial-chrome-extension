'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { environment } = require('../tools/cpu-benchmark.cjs');
function setup() {
  const box = environment(); box.performance = { now: () => 0 };
  for (const file of ['shared/config.js', 'content/engine-core-v2-advanced.js', 'content/frontier-model.js', 'content/frontier-episodes.js', 'content/source-adapter.js'])
    vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '..', file), 'utf8'), box);
  return { box, f: box.TIOFrontier, c: box.TIOEngineCoreV2 };
}
const meta = { matchId: 'fixture', stateVersion: 1, geometryVersion: 1, gameTick: 0 };
const raster = rows => ({ width: rows[0].length, height: rows.length, owners: Uint16Array.from(rows.flat()), neutralId: 3 });
const plain = x => JSON.parse(JSON.stringify(x));
const hold = { type: 'hold' };

test('loading the spatial module preserves all 80 production decision/spend fingerprints', () => {
  const { c } = setup();
  const fixtures = require('../tools/cpu-benchmark.cjs').states();
  const results = fixtures.map(s => ({ decision: c.decide(s), spend: c.planSpend(s) }));
  const hash = require('node:crypto').createHash('sha256').update(JSON.stringify(results)).digest('hex');
  assert.equal(hash, 'd49794e32d3cc195e357b4edc5d14f0731b24a408c25ab03633a019cf015b0c6');
});

test('straight frontier uses four-neighbor contact and separates edge count from cells', () => {
  const { f } = setup();
  const g = f.extract(raster([[0, 1], [0, 1], [0, 1]]), meta);
  assert.equal(g.meta.segmentCount, 1); assert.equal(g.meta.boundaryEdges, 3);
  assert.equal(g.length[0], 3); assert.equal(g.nx[0], 1);
  assert.deepEqual(plain(g.pairs[0]), { a: 0, b: 1, length: 3, contactA: 3, contactB: 3 });
  const corner = f.extract(raster([[0, 0], [0, 1]]), meta);
  assert.equal(corner.pairs[0].length, 2); assert.equal(corner.pairs[0].contactB, 1);
  assert.equal(corner.edgeTarget.length, 2, 'perpendicular pair runs connected at corner');
  const diagonal = f.extract(raster([[0, 65535], [65535, 1]]), meta);
  assert.equal(diagonal.meta.boundaryEdges, 0, 'diagonal contact cannot create attack legality');
});

test('islands, holes, corridor and three-player junction have complete bounded coverage', () => {
  const { f } = setup();
  for (const rows of [
    [[0, 0, 0], [0, 1, 0], [0, 0, 0]],
    [[1, 1, 1], [1, 3, 1], [1, 1, 1]],
    [[0, 65535, 1], [0, 0, 1], [0, 65535, 1]],
    [[0, 1], [2, 1]]
  ]) {
    const g = f.extract(raster(rows), meta);
    assert.equal([...g.length].reduce((a, b) => a + b, 0), g.meta.boundaryEdges);
    for (let i = 0; i < g.meta.segmentCount; i++) for (const j of g.edgeTarget.subarray(g.edgeOffset[i], g.edgeOffset[i + 1])) {
      assert.equal([g.ownerA[i], g.ownerB[i]].sort().join(), [g.ownerA[j], g.ownerB[j]].sort().join());
    }
  }
  const focused = f.extract(raster([[0, 1], [2, 1]]), meta, { player: 0 });
  assert.equal(focused.meta.boundaryEdges, 2);
  assert.ok(focused.pairs.every(p => p.a === 0 || p.b === 0));
});

test('long borders split deterministically and overflow fails closed without dropped edges', () => {
  const { f } = setup(), r = raster(Array.from({ length: 70 }, () => [0, 1]));
  const g = f.extract(r, meta);
  assert.deepEqual([...g.length], [32, 32, 6]);
  assert.deepEqual([...g.id], [...f.extract(r, meta).id]);
  assert.throws(() => f.extract(r, meta, { maxSegments: 1 }), /segment-cap/);
});

test('ownership adapter maps native owner IDs, neutral and terrain, reconciles every player', () => {
  const { box } = setup();
  Object.assign(box, { ah: { hb: [10, 20], hN: [2, 1], nU: [1, 1] }, aE: { fJ: 0, fW: 2, gt: 2, data: {} },
    bv: { i5() {}, i8() {}, fS() {} }, ae: { kF() {} },
    bV: { fk: 3, fl: 2, fF: 4, mapSeed: 123 },
    ad: { h9: i => [0, 0, 1, -1, -2, -2][i / 4] >= 0,
      fR: i => [0, 0, 1, -1, -2, -2][i / 4], fQ: i => i === 12 } });
  vm.runInContext(box.TIOSourceAdapter.buildExportSnippet('test', 'live-modern-v3'), box);
  const api = box.__TIO_GAME__.modern;
  const r = api.ownership(100);
  assert.deepEqual([...r.owners], [0, 0, 1, 2, 65535, 65535]);
  assert.deepEqual([...r.counts], [2, 1]); assert.equal(r.freeLandCells, 1);
  assert.equal(api.ownership(5), null); box.ah.hN[1] = 2;
  assert.equal(api.ownership(100), null, 'do not trust unreconciled geometry');
});

test('native batch uses strict threshold, density, incoming-counter priority and neutral cost', () => {
  const { f } = setup();
  assert.equal(f.resolveNativeBatch(32, 1000, 100, 1).captured, 0);
  assert.equal(f.resolveNativeBatch(33, 1000, 100, 1).captured, 1);
  assert.equal(f.resolveNativeBatch(1000, 1000, 100, 3).captured, 3);
  const narrow = f.resolveNativeBatch(1000, 1000, 100, 1);
  const broad = f.resolveNativeBatch(1000, 1000, 100, 10);
  assert.ok(broad.captured > narrow.captured);
  const counter = f.resolveNativeBatch(100, 100, 100, 1, 1000);
  assert.equal(counter.bank, 100); assert.equal(counter.counter, 902);
  assert.equal(f.resolveNativeBatch(100, 0, 20, 3, 0, 2, true).remaining, 94);
  assert.equal(f.resolveNativeBatch(0, 100, 100, 3).captured, 0);
});

function fixture(f) {
  const snapshot = f.extract(raster(Array.from({ length: 10 }, () => [0, 1])), meta, { player: 0 });
  return { matchId: meta.matchId, stateVersion: 1, player: 0, tick: 0, balance: 10000,
    territory: 100, playersRemaining: 2, freeLandCells: 0, hasAdjFree: false,
    adjEnemies: [{ id: 1, bal: 100, terr: 100 }],
    frontierSnapshot: snapshot, frontierExperiment: true };
}

test('shadow reuses command/economy transition; zero/negative ticks debit exactly once and input is pure', () => {
  const { f, c } = setup(), s = fixture(f), before = plain(s), action = { type: 'fight', targetId: 1, ratio: 0.4 };
  for (const ticks of [0, -5]) {
    const result = c.transitionPlanningState(s, action, ticks);
    const aggregate = c.transitionPlanningState({ ...s, frontierExperiment: false }, action, ticks);
    assert.equal(result.balance, aggregate.balance); assert.equal(result.territory, 100);
    assert.equal(result.activeAttacks.length, 1); assert.equal(result.tick, 0);
  }
  const later = c.transitionPlanningState(s, action, 10);
  assert.equal(later.modelKind, 'native-cost-static-frontier-shadow');
  assert.ok(later.territory > 100 && later.territory < 200, 'incremental capture, not whole-target teleport');
  assert.equal(later.territory + later.adjEnemies[0].terr, 200);
  assert.deepEqual(plain(s), before);
  const one = c.transitionPlanningState(s, action, 1);
  assert.deepEqual(plain(c.transitionPlanningState(one, hold, 9)), plain(later), 'split ticks give same deterministic trajectory');
});

test('stale, mismatched, malformed and missing geometry reproduce numeric aggregate fallback', () => {
  const { f, c } = setup(), s = fixture(f), action = { type: 'fight', targetId: 1, ratio: 0.4 };
  const baseline = c.transitionPlanningState({ ...s, frontierExperiment: false }, action, 10);
  for (const changed of [ { matchId: 'other' }, { stateVersion: 2 }, { tick: 1 }, { player: 2 },
    { frontierSnapshot: null }, { frontierSnapshot: {} } ]) {
    const result = c.transitionPlanningState({ ...s, ...changed }, action, 10);
    const expected = changed.tick ? c.transitionPlanningState({ ...s, ...changed, frontierExperiment: false }, action, 10) : baseline;
    assert.equal(result.frontierActive, false); assert.equal(result.balance, expected.balance);
    assert.equal(result.territory, expected.territory); assert.equal(result.modelKind, baseline.modelKind);
  }
});

test('source-cost shadow kernel obeys 10000 seeded force and territory bounds', () => {
  const { f, c } = setup(); let seed = 371;
  const rand = n => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) % n);
  for (let i = 0; i < 10000; i++) {
    const bank = rand(100000), troops = rand(100000), land = 1 + rand(500), cells = rand(land + 1), counter = rand(10000);
    const result = f.resolveNativeBatch(troops, bank, land, cells, counter);
    assert.ok(result.remaining >= 0 && result.remaining <= troops);
    assert.ok(result.bank >= 0 && result.bank <= bank); assert.ok(result.counter >= 0 && result.counter <= counter);
    assert.ok(result.captured >= 0 && result.captured <= land);
    if (i < 500) {
      const s = { ...fixture(f), balance: troops, adjEnemies: [{ id: 1, bal: bank, terr: land }],
        outgoingAttacks: [{ targetId: 1, troops: rand(10000) }] };
      const before = plain(s), result = c.transitionPlanningState(s, hold, rand(40));
      assert.equal(result.territory + result.adjEnemies[0].terr, 100 + land);
      assert.ok(result.balance >= 0 && result.adjEnemies[0].bal >= 0);
      assert.deepEqual(plain(s), before);
    }
  }
});

test('10000 small random maps match independent four-neighbor boundary enumeration', () => {
  const { f } = setup(); let seed = 1901;
  const rand = n => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) % n);
  for (let i = 0; i < 10000; i++) {
    const w = [4, 8, 16][rand(3)], h = w;
    const owners = Uint16Array.from({ length: w * h }, () => [0, 1, 2, 3, 65535][rand(5)]);
    const g = f.extract({ width: w, height: h, owners, neutralId: 3 }, meta, { maxSegments: 4096 });
    let expected = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const a = owners[y * w + x];
      for (const b of [x + 1 < w ? owners[y * w + x + 1] : 65535,
        y + 1 < h ? owners[(y + 1) * w + x] : 65535])
        if (a !== b && a !== 65535 && b !== 65535) expected++;
    }
    assert.equal(g.meta.boundaryEdges, expected);
    assert.equal([...g.length].reduce((a, b) => a + b, 0), expected);
  }
});

test('shadow recorder scores only exact ticks, censors missed labels and bounds retained data', () => {
  const { f, c } = setup(), rec = new f.Recorder(16), s = fixture(f);
  const native = { ...s, gameTick: 0, alive: true, contract: 'fixture', enemies: s.adjEnemies,
    physicalNeighbors: [1], neutralId: 3, alivePlayers: 2, outgoingAttacks: [], multiFront: 4 };
  rec.observe(native, s.frontierSnapshot, c);
  rec.observe({ ...native, gameTick: 10, stateVersion: 2 }, null, null);
  assert.equal(rec.scored, 1); assert.equal(rec.skipped, 0);
  const report = rec.export(); assert.equal(report.policyInfluence, false);
  const score = report.records.find(r => r.event === 'prediction_scored');
  assert.equal(score.observedStateVersion, 2); assert.equal(score.dueTick, 10);
  rec.observe({ ...native, gameTick: 10 }, null, c);
  rec.observe({ ...native, gameTick: 21 }, null, null);
  assert.equal(rec.skipped, 1, 'never score tick 21 as tick 20 ground truth');
  for (let i = 0; i < 100; i++) rec.add({ event: 'dummy', i });
  assert.equal(rec.export().records.length, 16); assert.ok(rec.dropped > 0);
  report.records[0].event = 'corrupt'; assert.notEqual(rec.export().records[0].event, 'corrupt');
});

test('offline report uses same paired observations, exact metrics, match grouping and no promotion claim', () => {
  const { summarize } = require('../tools/frontier-report.cjs');
  const scores = [
    { matchId: 'a', stateVersion: 1, gameTick: 0, dueTick: 10, actual: { balance: 100, territory: 100 },
      predictions: { aggregate: { balance: 110, territory: 200, modelKind: 'aggregate-combat-estimate' },
        frontier: { balance: 105, territory: 110, modelKind: 'native-cost-static-frontier-shadow' } } },
    { matchId: 'b', stateVersion: 2, gameTick: 10, dueTick: 20, actual: { balance: 100, territory: 100 },
      predictions: { aggregate: { balance: 90, territory: 0, modelKind: 'aggregate-combat-estimate' },
        frontier: { balance: 95, territory: 90, modelKind: 'native-cost-static-frontier-shadow' } } }
  ].map(x => ({ event: 'prediction_scored', ...x }));
  const input = { schema: 1, policyInfluence: false, records: scores };
  const result = summarize([input, input]); // duplicate export does not double n
  assert.equal(result.matchCount, 2); assert.equal(result.aggregate.territory.n, 2);
  assert.equal(result.aggregate.territory.mae, 100); assert.equal(result.frontier.territory.rmse, 10);
  assert.equal(result.frontier.balance.p95AbsoluteError, 5); assert.equal(result.policyPromotionAllowed, false);
  assert.equal(summarize([{ ...input, records: [] }]).frontier.balance.mae, null);
  assert.throws(() => summarize([{ ...input, policyInfluence: true }]), /Unsupported/);
  const changed = plain(input); changed.records[0].actual.balance = 99;
  assert.throws(() => summarize([input, changed]), /Conflicting/);
  const invalid = plain(input); invalid.records[0].actual.balance = null;
  assert.throws(() => summarize([invalid]), /Invalid numeric/);
});
