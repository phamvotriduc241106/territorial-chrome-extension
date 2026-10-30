'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const evidence = require('../../docs/evidence/live/2026-10-13-impossible-evidence.json');

test('published Impossible diagnostics preserve every sample and recomputed metrics', () => {
  assert.equal(evidence.matches.length, 2);
  for (const m of evidence.matches) {
    assert.match(m.rawReportSha256, /^[a-f0-9]{64}$/);
    assert.equal(m.difficultyLabel, 'Impossible');
    assert.equal(m.scenario.nativeDifficulty, 5);
    assert.equal(m.observations.length, m.summary.samples);
    assert.equal(m.outcome, 'loss');
    assert.equal(m.terminalConfirmed, true);
    assert.equal(m.summary.statisticalWinRate, null);
    const rows = m.observations;
    assert.equal(Math.max(...rows.map(r => r[2])), m.summary.maximumObservedTerritory);
    assert.equal(Math.max(...rows.map(r => r[7])), m.summary.maxAcknowledgedCommands);
    assert.equal(Math.max(...rows.map(r => r[8])), m.summary.maxObservedFailureStreak);
    const reasons = {};
    for (const r of rows) if (r[9]) reasons[r[9]] = (reasons[r[9]] || 0) + 1;
    assert.deepEqual(reasons, m.summary.decisionReasonSamples);
    assert.equal(rows.at(-1)[2], 0);
    assert.equal(rows.at(-1)[3], 0);
    for (let i = 1; i < rows.length; i++) {
      assert.ok(rows[i][0] > rows[i - 1][0]);
      assert.ok(rows[i][1] >= rows[i - 1][1]);
      assert.ok(rows[i][7] >= rows[i - 1][7]);
    }
  }
});

test('Europe configuration and initial native count both prove 512 players', () => {
  const m = evidence.matches.find(m => m.mapLabel === 'Europe');
  assert.equal(m.scenario.playerCount, 512);
  assert.equal(m.scenario.mapType, 1);
  assert.equal(m.scenario.nativeMapSettings.mapRealisticIndex, 0);
  assert.equal(m.observations[0][6], 512);
  assert.equal(m.observations.length, 45);
});
