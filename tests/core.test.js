(function () {
  'use strict';

  const core = globalThis.TIOEngineCore;
  const config = globalThis.TIOConfig;
  let assertions = 0;

  function assert(condition, message) {
    assertions++;
    if (!condition) throw new Error(message);
  }

  function equal(actual, expected, message) {
    assert(actual === expected, `${message}: expected ${expected}, got ${actual}`);
  }

  assert(core && config && core.version === config.VERSION, 'engine core matches shared release version');
  assert(config && /^\d+\.\d+\.\d+$/.test(config.VERSION), 'shared config loaded with a valid release version');

  equal(core.al(11 * 100, 5), 220, 'source rounding');
  equal(core.crushRequirement(100), 220, 'dJ crush requirement');
  equal(core.ratioToIl(0.25), 255, 'quarter ratio encoding');
  equal(core.ilToRatio(255), 0.25, 'quarter ratio decoding');

  const lowAttack = core.sourceAttackDebit(1000, 200);
  equal(lowAttack.tax, 11, 'cE tax');
  equal(lowAttack.sent, 200, 'cE sub-half sent troops');
  equal(lowAttack.debit, 211, 'cE sub-half debit');
  const highAttack = core.sourceAttackDebit(1000, 600);
  equal(highAttack.sent, 600, 'human high-ratio sent troops');
  equal(highAttack.debit, 611, 'human high-ratio debit includes command tax');
  const botHighAttack = core.botAttackDebit(1000, 600);
  equal(botHighAttack.sent, 589, 'bot high-ratio tax adjustment');
  equal(botHighAttack.debit, 600, 'bot high-ratio debit');
  equal(core.softCapFor(1000), 100000, 'live soft cap has no obsolete 80k ceiling');
  equal(core.softCapFor(20000000), 1000000000, 'live soft cap respects one-billion ceiling');
  equal(core.veryHardTaperRatio(0), 0.4, 'VH deterministic opener midpoint');
  equal(core.veryHardTaperRatio(8), 0.1, 'VH deterministic sustain midpoint');

  const simulatedAttack = core.forwardSimulatorStep({
    balance: 1000, territory: 10, freeLandRatio: 0, adjEnemies: [{ id: 2, bal: 0, terr: 1 }]
  }, { type: 'fight', targetId: 2, ratio: 0.2 }, -1);
  equal(simulatedAttack.finalBal, 789, 'MPC uses live bank-based command tax');

  const migrated = config.migrateSettings({
    clickSpeed: 14,
    sliderPercentage: 30,
    strategy: 'expansionist'
  });
  equal(migrated.clickSpeed, 4, 'legacy speed migration');
  equal(migrated.sliderPercentage, 0, 'legacy adaptive-ratio migration');
  equal(migrated.strategy, 'aggressive', 'legacy strategy migration');
  equal(config.actionIntervalMs({ clickSpeed: 4 }), 250, 'command pacing');
  equal(config.normalizeSettings({ clickSpeed: 25 }).clickSpeed, 4, 'settlement-safe command ceiling');
  equal(config.normalizeSettings({ sliderPercentage: 50 }).sliderPercentage, 40, 'declared ratio matches engine ceiling');

  const unknown = core.planSpend({ balance: 0, balanceKnown: false, territory: 10 });
  assert(unknown.canAfford && unknown.fronts === 1 && unknown.ratio === 0.12, 'unknown balance stays conservative');
  const broke = core.planSpend({ balance: 0, balanceKnown: true, territory: 10 });
  assert(!broke.canAfford && broke.fronts === 0 && broke.reason === 'zero-troops', 'known zero balance holds');
  const debt = core.planSpend({ balance: -5, balanceKnown: true, territory: 10 });
  assert(!debt.canAfford && debt.reason === 'negative-troops', 'negative balance holds');

  const balances = [20, 30, 50, 79, 80, 120, 199, 200, 500, 1000, 1199, 1200, 2999, 3000, 10000, 80000];
  const territories = [1, 10, 100, 1000];
  const freeLevels = [0, 0.02, 0.1, 0.3];
  for (const balance of balances) {
    for (const territory of territories) {
      for (const freeLandRatio of freeLevels) {
        for (const wantEnemy of [false, true]) {
          const plan = core.planSpend({
            balance,
            balanceKnown: true,
            territory,
            freeLandRatio,
            wantEnemy,
            crushable: wantEnemy && balance > 1000,
            enemyBal: wantEnemy ? Math.floor(balance / 12) : 0,
            adjEnemyCount: wantEnemy ? 2 : 0,
            fronts: 6,
            phase: wantEnemy ? 'PRESSURE' : 'LAND_RUSH'
          });
          assert(plan.fronts >= 0 && plan.fronts <= 6, 'front count bounded');
          if (!plan.canAfford) continue;
          assert(plan.ratio > 0 && plan.ratio <= core.ilToRatio(core.ratioToIl(0.72)), 'commit ratio bounded');
          assert(plan.spendPerFront >= plan.minAttack, 'meaningful attack floor');
          assert(plan.spendPerFront < balance, 'never spends full bank');
          const cost = core.estimateAttackCost(balance, plan.ratio);
          assert(cost < balance, 'estimated debit below bank');
          assert(balance - cost >= Math.min(plan.minRemaining, balance - 1), 'reserve invariant');
        }
      }
    }
  }

  const opening = core.planSpend({
    balance: 10000, balanceKnown: true, territory: 100, softCap: 10000,
    freeLandRatio: 0.08, fronts: 1, frontCap: 4, activeFronts: 0,
    attackSequence: 0, phase: 'OPENING'
  });
  if (core.CONFIG && core.CONFIG.enablePMP) {
    assert(opening.canAfford && opening.ratio >= 0.15 && opening.ratio <= 0.45,
      'PMP optimal opener within safe commit bounds');
  } else {
    assert(opening.canAfford && opening.ratio >= 0.39 && opening.ratio <= 0.41,
      'VH opener uses 40% midpoint');
  }
  const secondFront = core.planSpend({
    balance: 6000, balanceKnown: true, territory: 100, softCap: 10000,
    wantEnemy: true, enemyBal: 5000, fronts: 1, frontCap: 4,
    activeFronts: 1, attackSequence: 1, phase: 'PRESSURE'
  });
  assert(secondFront.canAfford && secondFront.ratio <= 0.18,
    'second rapid front tapers to 18%');
  const thirdFront = core.planSpend({
    balance: 5000, balanceKnown: true, territory: 100, softCap: 10000,
    wantEnemy: true, enemyBal: 4000, fronts: 1, frontCap: 4,
    activeFronts: 2, attackSequence: 2, phase: 'PRESSURE'
  });
  assert(thirdFront.canAfford && thirdFront.ratio <= 0.14,
    'third rapid front tapers to 14%');
  const cappedFronts = core.planSpend({
    balance: 5000, balanceKnown: true, territory: 100,
    wantEnemy: true, fronts: 1, frontCap: 4, activeFronts: 4,
    attackSequence: 4, phase: 'PRESSURE'
  });
  assert(!cappedFronts.canAfford && cappedFronts.reason === 'front-cap',
    'four live land fronts block a fifth');
  const trueOvercap = core.planSpend({
    balance: 20000, balanceKnown: true, territory: 100, softCap: 10000,
    freeLandRatio: 0.2, fronts: 1, activeFronts: 0,
    attackSequence: 8, phase: 'LAND_RUSH'
  });
  if (core.CONFIG && core.CONFIG.enablePMP) {
    assert(trueOvercap.canAfford && trueOvercap.ratio >= 0.47 && trueOvercap.ratio <= 0.65,
      'real soft-cap excess is dumped after human tax');
  } else {
    assert(trueOvercap.canAfford && trueOvercap.ratio > 0.47 && trueOvercap.ratio < 0.50,
      'real soft-cap excess is dumped after human tax');
  }
  const falseOvercap = core.planSpend({
    balance: 100000, balanceKnown: true, territory: 2000,
    freeLandRatio: 0.08, fronts: 1, activeFronts: 0,
    attackSequence: 8, phase: 'LAND_RUSH'
  });
  assert(falseOvercap.softCap === 200000 && falseOvercap.ratio <= 0.11,
    'large territory no longer triggers false 80k dump');

  const freeOnly = core.decide({
    balance: 1000, balanceKnown: true, territory: 100,
    hasAdjFree: true, freeLandRatio: 0.2, adjEnemies: []
  });
  equal(freeOnly.action, 'expand', 'free-only decision');
  const enemyOnly = core.decide({
    balance: 1000, balanceKnown: true, territory: 100,
    hasAdjFree: false, freeLandRatio: 0,
    adjEnemies: [{ id: 2, bal: 500, terr: 80 }]
  });
  equal(enemyOnly.action, 'fight', 'enemy-only decision');
  const noTarget = core.decide({
    balance: 1000, balanceKnown: true, territory: 100,
    hasAdjFree: false, freeLandRatio: 0, adjEnemies: []
  });
  equal(noTarget.action, 'hold', 'no-target decision');

  const mixed = {
    balance: 1000, balanceKnown: true, territory: 100,
    hasAdjFree: true, freeLandRatio: 0.08,
    adjEnemies: [{ id: 2, bal: 800, terr: 110 }],
    primaryDanger: 0.3
  };
  const expansionist = core.decide(Object.assign({}, mixed, { strategy: 'expansionist' }));
  const aggressive = core.decide(Object.assign({}, mixed, { strategy: 'aggressive' }));
  equal(expansionist.scores.expand - aggressive.scores.expand, 28, 'expansionist score bias');
  equal(aggressive.scores.fight - expansionist.scores.fight, 34, 'aggressive score bias');
  equal(aggressive.action, 'expand', 'exact adjacent free land wins before combat');

  const ranked = core.rankTargets([
    { x: 1, y: 1, type: 'NEUTRAL' },
    { x: 2, y: 2, type: 'ENEMY' }
  ], mixed, aggressive, 2);
  equal(ranked[0].type, aggressive.action === 'fight' ? 'ENEMY' : 'NEUTRAL', 'target type follows decision');

  const log = typeof print === 'function' ? print : console.log;
  log(`core.test.js: PASS (${assertions} assertions)`);
})();
