'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { terminal, summarize } = require('../tools/live-chrome-audit.cjs');

test('live diagnostic requires affirmative native termination, not missing players or a stopped timer', () => {
  assert.equal(terminal(null), null);
  assert.equal(terminal({ ready: false, alive: false, territory: 0, gameTick: 100 }), null);
  assert.equal(terminal({ ready: true, alive: true, territory: 12, alivePlayers: 1, gameTick: 0 }), null);
  assert.equal(terminal({ ready: true, alive: true, territory: 100, alivePlayers: 2, gameTick: 100 }), null);
  assert.equal(terminal({ ready: true, alive: true, territory: 100, alivePlayers: 1, gameTick: 100 }), 'opponents-eliminated');
  assert.equal(terminal({ ready: true, alive: true, territory: 100, freeLandCells: 1000, alivePlayers: 1, gameTick: 100 }), 'opponents-eliminated');
  assert.equal(terminal({ ready: true, alive: false, territory: 0, gameTick: 100 }), 'loss');
  assert.equal(terminal({ ready: true, alive: false, territory: 100, gameTick: 100 }), null);
});

test('live summary preserves unknown measurements and never estimates a win rate from correlated ticks', () => {
  assert.equal(summarize([]).maxObservedFailureStreak, null);
  const empty = summarize([{ native: { gameTick: 100 }, agent: null }]);
  assert.equal(empty.maxAcknowledgedCommands, null);
  assert.equal(empty.maximumObservedTerritory, null);
  assert.equal(empty.maxObservedFailureStreak, null);
  const result = summarize([
    { native: { gameTick: 0, territory: 0 }, agent: { commands: 9000 } },
    { native: { gameTick: 1, territory: 12 }, agent: { commands: 0, failures: 0, decision: { reason: 'expand' } } },
    { native: { gameTick: 2, territory: 20 }, agent: { commands: 1, failures: 0, decision: { reason: 'expand' } } },
  ]);
  assert.equal(result.maxAcknowledgedCommands, 1);
  assert.equal(result.maximumObservedTerritory, 20);
  assert.equal(result.maxObservedFailureStreak, 0);
  assert.equal(result.decisionReasonSamples.expand, 2);
  assert.equal(result.statisticalWinRate, null);
});

test('no-land-route has actionable UI copy without advertising full game completion', () => {
  const { derivePresentationState } = require('../shared/presentation.js');
  const status = { statusSampledAt: Date.now(), telemetryAgeMs: 0, botEnabled: true,
    inGame: true, armed: true, actuatorReady: true, automationRunning: true, blockReason: 'no-land-route' };
  const result = derivePresentationState(status);
  assert.equal(result.key, 'blocked');
  assert.match(result.hint, /native boats are unavailable/);
  assert.equal(result.playing, false);
});
