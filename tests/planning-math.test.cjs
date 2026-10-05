'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { environment } = require('../tools/cpu-benchmark.cjs');
const root = path.resolve(__dirname, '..');
function kernel(trace = false) {
  const box = environment(); box.performance = { now: () => 0 }; box.trace = [];
  vm.runInContext(fs.readFileSync(path.join(root, 'shared/config.js'), 'utf8'), box);
  let source = fs.readFileSync(path.join(root, 'content/engine-core-v2-advanced.js'), 'utf8');
  if (trace) source = source.replace('function forwardSimulatorStep(state, action, steps) {',
    'function forwardSimulatorStep(state, action, steps) { window.trace.push({state:JSON.parse(JSON.stringify(state)),action,steps});');
  vm.runInContext(source, box); return { core: box.TIOEngineCoreV2, box };
}
const plain = value => JSON.parse(JSON.stringify(value));
const base = { balance: 1000, balanceKnown: true, territory: 10, tick: 0,
  hasAdjFree: false, freeLandCells: 0, playersRemaining: 2,
  adjEnemies: [{ id: 2, bal: 10, terr: 10, available: true }] };
const hold = { type: 'hold', ratio: 0 };

test('shared transition quantizes one command, preserves input, and delays settlement', () => {
  const { core: c } = kernel(), original = plain(base);
  const action = { type: 'fight', targetId: 2, ratio: 0.4 };
  const sent = Math.floor(base.balance * (c.ratioToIl(action.ratio) + 1) / 1024);
  const next = c.transitionPlanningState(base, action, 0);
  assert.equal(next.balance, base.balance - c.humanAttackDebit(base.balance, sent).debit);
  assert.equal(next.territory, 10); assert.equal(next.adjEnemies[0].terr, 10);
  assert.equal(next.activeAttacks.length, 1);
  const settled = c.transitionPlanningState(next, hold, 10);
  assert.equal(settled.territory, 20); assert.equal(settled.adjEnemies[0].terr, 0);
  assert.equal(settled.adjEnemies[0].bal, 0); assert.equal(settled.adjEnemies[0].available, false);
  assert.equal(settled.playersRemaining, 1); assert.equal(settled.activeAttacks.length, 0);
  assert.deepEqual(base, original);
  const fromNative = c.transitionPlanningState({ ...base, planningEnemies: base.adjEnemies }, action, 10);
  assert.equal(c.transitionPlanningState(fromNative, hold, 1).adjEnemies[0].terr, 0,
    'initial native planningEnemies must not replace evolved rivals on the next transition');
  assert.equal(c.transitionPlanningState(settled, action, 0).balance, settled.balance, 'dead target cannot be attacked');
});

test('MPC and transition use identical state and explicit 10-tick horizon units', () => {
  const { core: c } = kernel(), action = { type: 'fight', targetId: 2, ratio: 0.25 };
  const expected = c.transitionPlanningState(base, action, 80);
  const outcome = c.forwardSimulatorStep(base, action, 8);
  assert.deepEqual(plain(outcome.nextState), plain(expected));
  assert.equal(outcome.value, c.planningUtility(expected).value);
  const evaluation = c.evaluateMPCAction(base, [hold, action], 8);
  for (const item of evaluation.evaluations)
    assert.deepEqual(plain(item.outcome), plain(c.forwardSimulatorStep(base, item.action, 8)));
});

test('income respects tick 9/99, source interest curve, hard cap and debt', () => {
  const { core: c } = kernel();
  const s = { ...base, balance: 1000, territory: 100, adjEnemies: [], playersRemaining: 1,
    economy: { playerSlots: 64, mapCells: 64000, hardCapPerCell: 150 } };
  assert.equal(c.transitionPlanningState({ ...s, tick: 8 }, hold, 1).balance, 1000);
  assert.equal(c.transitionPlanningState({ ...s, tick: 9 }, hold, 1).balance, 1069);
  assert.equal(c.transitionPlanningState({ ...s, tick: 99 }, hold, 1).balance, 1166);
  assert.equal(c.transitionPlanningState({ ...s, tick: 99, balance: 14990 }, hold, 1).balance, 15000);
  assert.equal(c.transitionPlanningState({ ...s, tick: 9, debt: 1200 }, hold, 1).balance, 0);
  assert.equal(c.transitionPlanningState({ ...s, tick: 9, debt: 1200 }, hold, 1).debt, 131);
  assert.equal(c.planningInterestBps(100, 1000, 9, s.economy), 697);
  assert.ok(c.planningInterestBps(100, 1000, 1929, s.economy) < 697);
});

test('busy fronts and observed incoming/outgoing survive transitions without duplicate debits', () => {
  const { core: c } = kernel();
  const s = { ...base, balance: 1000, frontCap: 1,
    outgoingAttacks: [{ targetId: 2, troops: 50 }],
    adjEnemies: [{ id: 2, bal: 200, terr: 20, incoming: 100, available: false }] };
  const next = c.transitionPlanningState(s, { type: 'fight', targetId: 2, ratio: 0.25 }, 0);
  assert.equal(next.balance, 1000); assert.equal(next.adjEnemies[0].bal, 200);
  assert.equal(next.activeAttacks.length, 2);
  const later = c.transitionPlanningState(next, hold, 1);
  assert.equal(later.activeAttacks.length, 2); assert.equal(later.balance, 1000);
  const full = c.transitionPlanningState({ ...base, activeFronts: 4, frontCap: 4 },
    { type: 'fight', targetId: 2, ratio: 0.25 }, 0);
  assert.equal(full.balance, base.balance, 'unknown occupied fronts remain reserved');
});

test('global mass prevents invented victory and false local hegemon', () => {
  const { core: c } = kernel();
  const s = { ...base, territory: 100, totalEnemyTerr: 10150, totalEnemyBalance: 100000,
    playersRemaining: 64, leaderId: 40, leaderTerritory: 10000,
    adjEnemies: [{ id: 2, terr: 150, bal: 10000 }, { id: 3, terr: 0, bal: 0 }] };
  const coalition = c.computeCoalitionEquilibrium(s);
  assert.equal(coalition.hegemonActive, false); assert.equal(coalition.hegemonId, null);
  assert.equal(coalition.leaderShare, 0.015);
  assert.equal(c.computeCoalitionEquilibrium({ ...s, totalEnemyTerr: undefined }).hegemonActive, false);
  const conquered = c.transitionPlanningState({ ...s, balance: 1000000 },
    { type: 'fight', targetId: 2, ratio: 0.4 }, 10);
  assert.ok(conquered.playersRemaining > 1); assert.ok(c.planningUtility(conquered).value < 1);
  assert.equal(conquered.outsideEnemyTerr, 10000);
});

test('endgame bandit is deterministic at fixed work, excludes busy targets and labels utility', () => {
  const { core: c } = kernel();
  const s = { ...base, adjEnemies: [{ id: 2, bal: 10, terr: 10, available: false }],
    totalEnemyTerr: 10000, playersRemaining: 64 };
  const a = c.computeMCTSEndgameAction(s, 12, 0.5), b = c.computeMCTSEndgameAction(s, 12, 0.5);
  assert.deepEqual(plain(a), plain(b)); assert.equal(a.bestAction, 'hold');
  assert.equal(a.scoreKind, 'heuristic-utility'); assert.equal(a.expectedUtility, a.winProb);
  assert.ok(a.expectedUtility < 1); assert.equal(a.rollouts, 12);
});

test('partial action coverage cannot authorize a confident hold veto', () => {
  const { core: c, box } = kernel();
  let time = 0; box.performance = { now: () => time++ };
  const a = c.computeMCTSEndgameAction(base, 45, 0.5);
  assert.equal(a.rollouts, 1); assert.equal(a.completeCoverage, false);
  assert.equal(a.actionVisits, 1);
});

test('expensive lookahead runs only when it can change the shipped policy', () => {
  const { box, core: c } = kernel();
  vm.runInContext(fs.readFileSync(path.join(root, 'shared/performance.js'), 'utf8'), box);
  const leader = { ...base, balance: 9000, territory: 100, softCap: 10000, playersRemaining: 3,
    globalRank: 1, leaderId: 1, leaderTerritory: 100, totalEnemyTerr: 175,
    primaryDanger: 0.47, relativePower: 1.125,
    adjEnemies: [{ id: 2, bal: 8000, terr: 90 }, { id: 3, bal: 7500, terr: 85 }] };
  c.decide({ ...leader, hasAdjFree: true, freeLandCells: 1000 });
  assert.equal(box.TIOGetPerformance().metrics['kernel.mpc'], undefined);
  assert.equal(box.TIOGetPerformance().metrics['kernel.mcts'], undefined);
  box.TIOProfiler.reset(); c.decide(leader);
  assert.equal(box.TIOGetPerformance().metrics['kernel.mcts'].calls, 1);
  box.TIOProfiler.reset(); c.decide({ ...leader, globalRank: 2 });
  assert.equal(box.TIOGetPerformance().metrics['kernel.mcts'], undefined);
});

test('small integer allocation agrees with exhaustive concave-utility search', () => {
  const { core: c } = kernel(); let seed = 7;
  const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 200; i++) {
    const budget = 5 + Math.floor(rand() * 20);
    const cfg = Array.from({ length: 3 }, () => ({ min: 0, max: budget,
      weight: 0.05 + rand() * 20, saturation: 10 + rand() * 80 }));
    const utility = a => a.reduce((sum, n, k) => sum + cfg[k].weight * -Math.expm1(-n / cfg[k].saturation), 0);
    const allocation = c.allocateKKTMultiFront(budget, cfg); let best = -Infinity;
    for (let a = 0; a <= budget; a++) for (let b = 0; b <= budget - a; b++)
      best = Math.max(best, utility([a, b, budget - a - b]));
    assert.ok(Math.abs(best - utility(allocation)) < 1e-9);
  }
});

test('tree stays disabled by default; opt-in expansion carries full state and rollout holds', () => {
  const { core: c, box } = kernel(true);
  assert.equal(c.CONFIG.enableTreeSearch, false); assert.equal(c.runMultiStepMCTS(base).disabled, true);
  c.CONFIG.enableTreeSearch = true;
  c.runMultiStepMCTS(base, 1, 4);
  assert.equal(box.trace.length, 2); assert.equal(box.trace[0].action.type, 'fight');
  assert.equal(box.trace[1].action.type, 'hold');
  assert.equal(box.trace[1].state.adjEnemies[0].terr, 0);
  assert.equal(box.trace[1].state.activeAttacks.length, 0);
  box.trace.length = 0; c.decide(base);
  assert.equal(box.trace.length, 0, 'decide does not call experimental tree search');
});

test('KKT counterexample preserves budget, bounds and explicit infeasibility', () => {
  const { core: c } = kernel();
  const cfg = [{ min: 0, max: 24133, weight: 35.18247556984424, saturation: 1821.1073874186259 },
    { min: 0, max: 24133, weight: 71.57062063105404, saturation: 20441.649998343782 },
    { min: 0, max: 24133, weight: 8.563328526169062, saturation: 17330.693041093415 }];
  for (const name of ['allocateKKTMultiFront', 'allocateKKTMarginalUtility']) {
    const a = c[name](24133, cfg); assert.equal(a.reduce((sum, x) => sum + x, 0), 24133);
  }
  const bad = c.allocateKKTMultiFrontDetailed(10, [{ min: 10, max: 20 }, { min: 10, max: 20 }]);
  assert.equal(bad.feasible, false); assert.equal(bad.status, 'infeasible-minimums-priority');
  assert.equal(bad.unmetMinimums.reduce((sum, n) => sum + n, 0), 10);
  const bounded = c.allocateKKTMultiFrontDetailed(20, [{ min: 10, max: 3 }]);
  assert.equal(bounded.feasible, false); assert.deepEqual(plain(bounded.allocations), [3]);
});

test('5000 seeded KKT cases conserve budget and satisfy feasible floors/caps', () => {
  const { core: c } = kernel(); let seed = 11;
  const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 5000; i++) {
    const budget = Math.floor(rand() * 100000);
    const cfg = Array.from({ length: 1 + Math.floor(rand() * 5) }, () => ({
      min: Math.floor(rand() * 40), max: Math.floor(rand() * 100000),
      weight: 0.05 + rand() * 100, saturation: 10 + rand() * 10000 }));
    const r = c.allocateKKTMultiFrontDetailed(budget, cfg);
    assert.ok(r.allocations.reduce((sum, x) => sum + x, 0) <= budget);
    r.allocations.forEach((x, k) => {
      assert.ok(Number.isInteger(x) && x >= 0 && x <= cfg[k].max);
      if (r.feasible) assert.ok(x >= cfg[k].min);
    });
  }
});

test('weighted posterior quantiles and lognormal statistics are named correctly', () => {
  const { core: c } = kernel(), p = new c.OpponentParticleFilter(2, 10, 100);
  for (let i = 0; i < 32; i++) { p.particles[i] = i + 1; p.weights[i] = i === 0 ? 0.99 : 0.01 / 31; }
  assert.equal(p.getBelief().p05, 1); assert.equal(p.getBelief().p95, 1);
  p.weights.fill(1 / 32); assert.equal(p.getBelief().p95, 31);
  const e = c.BayesianTroopObserver.getEstimate(2, 0, 10);
  assert.equal(e.estimatedBalance, 200); assert.equal(e.estimatedMedian, 200);
  assert.equal(e.expectedBalance, 330);
});
