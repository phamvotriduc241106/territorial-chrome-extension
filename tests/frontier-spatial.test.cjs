'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../content/frontier-spatial.js'), 'utf8'), context);
const s = context.TIOSpatial;
const meta = { matchId: 'm', spatialVersion: 0, sourceStateVersion: 0, gameTick: 0 };
function fixture() { return s.baseline({ width: 3, height: 2, neutralId: 2,
  owners: [0, 0, 1, 1, 2, 65535], counts: [2, 2] }, meta); }
const delta = changes => ({ ...meta, baseVersion: 0, spatialVersion: 1, sourceStateVersion: 1, gameTick: 1, changes });
test('ownership baseline is opaque immutable and serialization round-trips exactly', () => {
  const b = fixture(), r = s.restore(s.serialize(b));
  assert.ok(Object.isFrozen(b)); assert.equal(b.owners, undefined);
  for (let i = 0; i < 6; i++) assert.equal(s.at(b, i), s.at(r, i));
  const out = s.serialize(b); out.runs[0] = 1; assert.equal(s.at(b, 0), 0);
});
test('sparse replay reconciles hostile capture and rejects stale/incomplete/inconsistent updates transactionally', () => {
  const b = fixture(), d = delta([[2, 1, 0]]), next = s.advance(b, d, [3, 1]);
  assert.equal(s.at(b, 2), 1); assert.equal(s.at(next, 2), 0);
  for (const bad of [{ ...d, matchId: 'other' }, { ...d, baseVersion: 2 }, { ...d, spatialVersion: 2 },
    { ...d, sourceStateVersion: -1 }, { ...d, changes: [[2, 0, 1]] }, { ...d, changes: [[100, 1, 0]] }])
    assert.throws(() => s.advance(b, bad, [3, 1]), /spatial-/);
  assert.throws(() => s.advance(b, d, [2, 2]), /territory-mismatch/);
  assert.equal(s.at(b, 2), 1);
  assert.throws(() => s.restore({ ...s.serialize(b), runs: [0, 1] }), /incomplete/);
});
test('ordered repeated writes preserve conservation; bounded overlays never modify their input', () => {
  const b = fixture(), next = s.advance(b, delta([[2, 1, 0], [2, 0, 1]]), [2, 2]);
  assert.equal(s.at(next, 2), 1);
  const o = s.overlay(b, 1); o.set(2, 0);
  assert.equal(o.count(0), 3); assert.equal(o.count(1), 1); assert.equal(s.at(b, 2), 1);
  assert.throws(() => o.set(3, 0), /overlay-cap/); assert.equal(o.size(), 1);
});
test('10000 seeded updates preserve all owners, totals and historical versions', () => {
  let seed = 901, native = Array.from({ length: 1024 }, (_, i) => i % 3), counts = [342, 341, 341];
  let b = s.baseline({ width: 32, height: 32, neutralId: 3, owners: native, counts }, meta);
  for (let t = 1; t <= 10000; t++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; const i = seed % 1024;
    const from = native[i], to = (from + 1) % 3, old = b; counts[from]--; counts[to]++; native[i] = to;
    b = s.advance(b, { matchId: 'm', baseVersion: t - 1, spatialVersion: t,
      sourceStateVersion: t, gameTick: t, changes: [[i, from, to]] }, counts);
    assert.equal(s.at(old, i), from); assert.equal(s.at(b, i), to);
    if (t % 100 === 0) for (let j = 0; j < 1024; j++) assert.equal(s.at(b, j), native[j]);
  }
});
