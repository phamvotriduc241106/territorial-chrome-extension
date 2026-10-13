'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { kernel, states } = require('../tools/cpu-benchmark.cjs');
const { evaluateOpeningBudget, reviewBanking } = require('../research/contact-risk-candidate.cjs');
const core = kernel().TIOEngineCore;
const sourceHash = 'a'.repeat(64);
const expected = { matchId: 'fixture', sourceHash, minStateVersion: 2 };
const enemy = (id, bal, available = true) => ({ id, bal, incoming: 0,
  effectiveBal: bal, adjacent: true, available });
function fixture(B = 10000, enemies = [enemy(2, 12000)]) {
  return [{ matchId: 'fixture', sourceHash, stateVersion: 2, ageMs: 10,
    coverage: 'complete-adjacent', situation: { balance: B, balanceKnown: true,
      gameTimeSec: 20, hasAdjFree: true, adjEnemies: enemies, areaTrend: 0, shrinkFrames: 0 } },
  { matchId: 'fixture', sourceHash, stateVersion: 2,
    plan: { balance: B, canAfford: true, minRemaining: 1000, maxSpendTotal: B - 1000,
      minAttack: 4, ratio: 0.72 },
    decision: { action: 'expand', reason: 'hard-neutral-first' } }];
}
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.freeze(value); for (const v of Object.values(value)) freeze(v);
  }
  return value;
}
test('contact cap uses exact human debit, respects busy neighbors and immutable inputs', () => {
  const [s, b] = fixture(10000, [enemy(2, 12000), enemy(3, 15000, false)]);
  freeze(s); freeze(b);
  const r = evaluateOpeningBudget(core, s, b, expected);
  assert.equal(r.contactReserve, 8250);
  assert.equal(r.status, 'candidate');
  assert.ok(r.canAfford);
  assert.ok(r.ledger.after >= 8250);
  assert.equal(r.ledger.tax, Math.floor(12 * 10000 / 1024));
  assert.equal(r.ledger.debit, r.ledger.sent + r.ledger.tax);
  assert.equal(r.ledger.before - r.ledger.debit, r.ledger.after);
  assert.ok(r.sliderUnits < Math.round(b.plan.ratio * 1024));
});
test('Europe peak fixture holds without charging tax or inventing force', () => {
  const [s, b] = fixture(2903, [3742,4416,4915,5442,5814,5908].map((v,i) => enemy(i,v)));
  b.plan.ratio = 0.08; b.plan.minRemaining = 923; b.plan.maxSpendTotal = 1980;
  const r = evaluateOpeningBudget(core, s, b, expected);
  assert.equal(r.contactReserve, 4431);
  assert.equal(r.canAfford, false);
  assert.equal(r.reason, 'contact-reserve-hold');
  assert.equal(r.ledger.debit, 0);
  assert.equal(r.ledger.tax, 0);
  assert.equal(r.ledger.after, 2903);
});
test('no contacts, late state and baseline block retain approved behavior', () => {
  for (const late of [false, true]) {
    const [s,b] = fixture(10000, late ? [enemy(2, 90000)] : []);
    if (late) s.situation.gameTimeSec = 61;
    const r = evaluateOpeningBudget(core,s,b,expected);
    assert.equal(r.status, 'unchanged');
    assert.equal(r.ratio, b.plan.ratio);
  }
  const [s,b] = fixture(); b.plan.canAfford = false;
  assert.equal(evaluateOpeningBudget(core,s,b,expected).ledger.debit, 0);
  const [f,fb] = fixture(); fb.decision.action = 'fight';
  assert.equal(evaluateOpeningBudget(core,f,fb,expected).status, 'unchanged');
});
test('stale, mismatched, incomplete and unsafe states fail closed', () => {
  const mutations = [s=>s.ageMs=701, s=>s.ageMs=-1, s=>s.coverage='partial',
    s=>s.stateVersion=1, s=>s.matchId='old', s=>s.sourceHash='b'.repeat(64),
    s=>s.situation.balanceKnown=false, s=>s.situation.adjEnemies[0].incoming=undefined,
    s=>s.situation.adjEnemies.push({...s.situation.adjEnemies[0]})];
  for (const mutate of mutations) {
    const [s,b] = fixture(); mutate(s);
    const r = evaluateOpeningBudget(core,s,b,expected);
    assert.equal(r.status,'unsupported'); assert.equal(r.ledger,null);
  }
  const [s,b] = fixture(); b.plan.maxSpendTotal=1;
  assert.equal(evaluateOpeningBudget(core,s,b,expected).status,'unsupported');
});
test('banking review is non-executable and does not force an attack during loss', () => {
  const [s,b] = fixture(); s.situation.areaTrend=-78;
  b.decision = { action: 'hold', reason: 'hard-build-combat-bank' };
  freeze(s); freeze(b);
  const r=reviewBanking(s,b,expected);
  assert.equal(r.needsReview,true); assert.equal(r.executable,false);
  assert.equal(r.policyInfluence,false);
  assert.equal(r.action,undefined);
});
test('5000 seeded cases conserve bank and cannot increase approved debit or ratio units', () => {
  let seed=12345; const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  let supported=0;
  for(let i=0;i<5000;i++) {
    const B=2000+Math.floor(random()*200000);
    const n=Math.floor(random()*9);
    const [s,b]=fixture(B,Array.from({length:n},(_,id)=>enemy(id,Math.floor(random()*B*2))));
    b.plan.minRemaining=Math.floor(B*0.15); b.plan.maxSpendTotal=B-b.plan.minRemaining;
    b.plan.ratio=0.05+random()*0.65;
    const r=evaluateOpeningBudget(core,s,b,expected);
    assert.notEqual(r.status,'unsupported'); supported++;
    assert.ok(r.sliderUnits<=Math.round(b.plan.ratio*1024));
    assert.equal(r.ledger.before-r.ledger.debit,r.ledger.after);
    assert.equal(r.ledger.sent+r.ledger.tax,r.ledger.debit);
    if(r.canAfford) {
      assert.ok(r.ledger.after>=r.requiredReserve);
      assert.ok(r.ledger.debit<=b.plan.maxSpendTotal);
      assert.ok(r.ledger.sent>=b.plan.minAttack);
      if (r.sliderUnits < Math.round(b.plan.ratio * 1024)) {
        const next=core.humanAttackDebit(B,Math.floor(B*(r.sliderUnits+1)/1024));
        assert.ok(B-next.debit<r.requiredReserve || next.debit>b.plan.maxSpendTotal,
          'cap is maximal at native quantization, not an arbitrary extra cut');
      }
    } else assert.equal(r.ledger.debit,0);
  }
  assert.equal(supported,5000);
});
test('lowest encoded ratio and near-int32 bank limits preserve exact accounting', () => {
  const [s,b]=fixture(10000,[enemy(2,18000)]); b.plan.ratio=0.01;
  const low=evaluateOpeningBudget(core,s,b,expected);
  assert.equal(low.canAfford,true); assert.equal(low.sliderUnits,10);
  const [big,budget]=fixture(2147483647,[enemy(2,2000000000)]);
  budget.plan.ratio=0.50; budget.plan.minRemaining=100000000;
  budget.plan.maxSpendTotal=2147483647-budget.plan.minRemaining;
  const r=evaluateOpeningBudget(core,big,budget,expected);
  assert.equal(r.canAfford,true); assert.ok(r.ledger.after>=r.requiredReserve);
  assert.equal(r.ledger.tax,Math.floor(12*2147483647/1024));
});
test('loading research candidate cannot alter baseline outputs or release imports', () => {
  const fs=require('node:fs'),path=require('node:path');
  const manifest=require('../manifest.json');
  assert.ok(!JSON.stringify(manifest).includes('contact-risk'));
  const {releaseFiles}=require('../tools/release-files.cjs');
  assert.ok(!releaseFiles().some(f=>f.startsWith('research/')));
  assert.ok(fs.existsSync(path.join(__dirname,'../research/contact-risk-candidate.cjs')));
  const box=kernel(); box.performance={now:()=>0};
  for(const s of states()) {
    const before=JSON.stringify([box.TIOEngineCore.decide(s),box.TIOEngineCore.planSpend(s)]);
    // Module has no reference to or mutation of this VM's production kernel.
    require('../research/contact-risk-candidate.cjs');
    assert.equal(JSON.stringify([box.TIOEngineCore.decide(s),box.TIOEngineCore.planSpend(s)]),before);
  }
});
