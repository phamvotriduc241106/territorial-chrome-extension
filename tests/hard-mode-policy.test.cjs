'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadEngine } = require('../experiments/rigorous-simulator.cjs');
const engine = loadEngine(path.join(__dirname, '../content/engine-core-v2-advanced.js'));
const state = { balance: 2000, balanceKnown: true, territory: 100, softCap: 10000,
  hasAdjFree: false, freeLandRatio: 0, playersRemaining: 8, globalRank: 2,
  adjEnemies: [{ id: 2, bal: 1500, terr: 110 }], gameTimeSec: 30 };
assert.equal(engine.decide(state).action, 'hold', 'one neighbor in an eight-player lobby must not force a duel');
assert.equal(engine.decide({ ...state, playersRemaining: 2 }).action, 'fight', 'actual duel with bank advantage may apply pressure');
assert.equal(engine.decide({ ...state, balance: 6000 }).action, 'fight', 'capital recovery releases the hold');
assert.equal(engine.decide({ ...state, hasAdjFree: true, freeLandRatio: 0.08 }).action, 'expand', 'neutral intent survives speculative planner overrides');
assert.equal(engine.decide({ ...state, adjEnemies: [{ id: 2, bal: 100, terr: 110 }] }).action,
  'fight', 'a crush opportunity takes priority over bank accumulation');
const targeting = engine.decide({ ...state, balance: 12000, playersRemaining: 3,
  adjEnemies: [{ id: 2, bal: 500, incoming: 9000, terr: 50 }, { id: 3, bal: 600, terr: 50 }] });
assert.equal(targeting.focusEnemyId, 3, 'incoming troops prevent an apparently cheap target from dominating selection');
const reserve = engine.planSpend({ ...state, balance: 1000, wantEnemy: false,
  freeLandRatio: 0.08, adjEnemies: [{ id: 2, bal: 9000, terr: 110 }] });
assert.equal(reserve.canAfford, false, 'neutral priority cannot bypass the crush barrier');
console.log('hard-mode-policy.test.cjs: PASS (7 assertions)');
