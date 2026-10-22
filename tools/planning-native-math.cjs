'use strict';
// Differential arithmetic audit of the current public bundle. This executes
// extracted native routines in a VM, not a match or the extension integration.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { environment } = require('./cpu-benchmark.cjs');
const root = path.resolve(__dirname, '..');

/** Extract one original function, respecting strings and balanced braces. */
function nativeFunction(source, marker) {
  const start = source.indexOf(marker);
  assert.ok(start >= 0 && source.indexOf(marker, start + 1) < 0, 'Ambiguous/missing native marker: ' + marker);
  const body = source.indexOf('{', start);
  let depth = 0, quote = null;
  for (let i = body; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'" || ch === '`') quote = ch;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) {
      const text = source.slice(start, i + 1);
      return text.slice(text.indexOf('function'));
    }
  }
  throw Error('Unclosed native function: ' + marker);
}

async function audit(source) {
  if (source == null) {
    const response = await fetch('https://territorial.io/', { signal: AbortSignal.timeout(30000) });
    assert.ok(response.ok, 'Official source HTTP ' + response.status);
    source = await response.text();
  }
  // A source-family boundary, independent of the production v3 adapter.
  const economySource = nativeFunction(source, 'function aJR()');
  for (const token of ['13440-6*bc.ql()', 'this.bb=function(player)', '100*y.aO[player]', 'this.b8=function()'])
    assert.ok(economySource.includes(token), 'Unverified economy routine: ' + token);
  const box = environment();
  vm.runInContext(fs.readFileSync(path.join(root, 'content/engine-core-v2-advanced.js'), 'utf8'), box);
  const c = box.TIOEngineCoreV2;
  const native = vm.createContext({ c: { c2: 64, aP: 64000, aXJ: 1e9, aXL: 150, qI: 1.5e9, aI: 1, t: 0, d: 0 },
    y: { ax: [0], aO: [100], xa: [0] }, bc: { ql: () => native.tick },
    aJ: { aK: 1, bX: [0] }, aa: { bY: { o2: () => native.disabled } },
    ij: { aUC: [0], zr: [0, 0] }, pz: { qH: new Array(32).fill(0) },
    a0n: { iu: (player, sent) => { native.sent = sent; } },
    aAZ: { yd() {} }, aTz() {}, tick: 9, disabled: false, q: {}, aIw: {} });
  native.q.aN = vm.runInContext('(' + nativeFunction(source, 'this.aN=function(cy,cT)') + ')', native);
  for (const name of ['aPX', 'aPY'])
    vm.runInContext(nativeFunction(source, 'function ' + name + '('), native);
  for (const name of ['py', 'aYY', 'aTU', 'aTe'])
    native.aa.bY[name] = vm.runInContext('(' + nativeFunction(source, 'this.' + name + '=function(') + ')', native);
  for (const name of ['aNK', 'aNL'])
    native.aIw[name] = vm.runInContext('(' + nativeFunction(source, 'this.' + name + '=function(') + ')', native);
  native.bot = vm.runInContext('(' + nativeFunction(source, 'this.aHD=function(') + ')', native);
  native.ay = vm.runInContext('new (' + economySource + ')()', native);
  native.ay.a2p();
  const settings = [
    {}, { iIncomeType: 1, iIncomeValue: 0 }, { iIncomeType: 1, iIncomeValue: 255 },
    { aIncomeType: 1, aIncomeValue: 128 }, { tIncomeType: 1, tIncomeValue: 0 },
    { iIncomeType: 2, iIncomeData: [32], aIncomeType: 2, aIncomeData: [255], tIncomeType: 2, tIncomeData: [64] },
    { disabled: true }
  ];
  let incomeCases = 0, commandCases = 0;
  for (const setting of settings) for (const territory of [1, 100, 50000])
    for (const tick of [8, 9, 99, 1919, 1929, 2999]) for (const density of [0, 1, 10, 100, 150, 200])
      for (const debt of [0, 200000]) {
        const bank = territory * density;
        native.c.data = { iIncomeType: 0, tIncomeType: 0, aIncomeType: 0, ...setting };
        native.disabled = setting.disabled === true; native.tick = tick;
        native.y.ax[0] = bank; native.y.aO[0] = territory; native.y.xa[0] = debt;
        native.ay.b();
        const d = native.c.data;
        const economy = { playerSlots: 64, mapCells: 64000, softCapMaximum: 1e9,
          hardCapPerCell: 150, hardCapMaximum: 1.5e9, interestDisabled: native.disabled,
          interestType: d.iIncomeType, interestValue: d.iIncomeType === 2 ? d.iIncomeData[0] : d.iIncomeValue,
          additionalIncomeType: d.aIncomeType,
          additionalIncomeValue: d.aIncomeType === 2 ? d.aIncomeData[0] : d.aIncomeValue,
          territoryIncomeValue: d.tIncomeType === 0 ? 32 : d.tIncomeType === 2 ? d.tIncomeData[0] : d.tIncomeValue };
        assert.equal(c.planningInterestBps(territory, bank, tick, economy), native.ay.bb(0), 'Native rate');
        const predicted = c.transitionPlanningState({ tick, balance: bank, territory, debt, economy, adjEnemies: [] },
          { type: 'hold' }, 1);
        native.ay.b8();
        assert.equal(predicted.balance, native.y.ax[0], 'Native income: ' + JSON.stringify({ setting, territory, tick, bank, debt }));
        assert.equal(predicted.debt, native.y.xa[0], 'Native debt');
        incomeCases++;
      }
  for (const bank of [1, 37, 99, 10000, 1e9, 1.5e9]) for (let code = 0; code < 1024; code++) {
    const requested = Math.floor(bank * (code + 1) / 1024);
    native.y.ax[0] = bank;
    native.aa.bY.aTU(0, code, 12, 0);
    const humanSent = native.ij.zr[0], tax = native.ij.zr[1];
    native.aa.bY.aTe(0);
    const actualHuman = c.humanAttackDebit(bank, requested);
    assert.equal(actualHuman.sent, humanSent, 'Human sent');
    assert.equal(actualHuman.tax, tax, 'Human tax');
    assert.equal(actualHuman.debit, bank - native.y.ax[0], 'Human debit');
    native.y.ax[0] = bank; native.sent = null;
    native.bot(0, 1, 0, requested);
    const actualBot = c.botAttackDebit(bank, requested);
    assert.equal(actualBot.sent, native.sent, 'Bot sent');
    assert.equal(actualBot.debit, bank - native.y.ax[0], 'Bot debit');
    commandCases++;
  }
  return { sourceSha256: crypto.createHash('sha256').update(source).digest('hex'),
    nativeFamily: '2026-10-21-renamed-bundle', incomeCases, humanCommandCases: commandCases,
    botCommandCases: commandCases, integrationVerified: false, status: 'passed' };
}
if (require.main === module) audit(process.argv[2] && fs.readFileSync(process.argv[2], 'utf8'))
  .then(result => console.log(JSON.stringify(result, null, 2)))
  .catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { audit, nativeFunction };
