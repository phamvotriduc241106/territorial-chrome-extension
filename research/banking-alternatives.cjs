'use strict';
// OFFLINE ONLY: evaluate explicit action/target/budget alternatives. No actuator.
const { isDeepStrictEqual } = require('node:util');
const { DEFAULTS, reviewBanking } = require('./contact-risk-candidate.cjs');
const PARAMETERS = Object.freeze({ minimumAdvantage: 1.5 }); // unfitted, not a combat guarantee
const integer = n => Number.isSafeInteger(n) && n >= 0;

function evaluateBankingAlternatives(core, snapshot, baseline, expected, controls, spendContext) {
  const base = { policyInfluence: false, executable: false, action: 'hold', targetId: null,
    assumptions: 'unfitted-bank-advantage-and-contact-reserve', parameters: PARAMETERS,
    financiallyFeasible: false, alternatives: [], ledger: null,
    liveDispatchEligible: false, controlRevalidationRequired: true };
  const reject = reason => ({ ...base, status: 'unsupported', reason });
  const review = reviewBanking(snapshot, baseline, expected);
  if (review.status === 'unsupported') return reject(review.reason);
  const s = snapshot.situation, p = spendContext, approved = baseline.plan;
  if (!approved || approved.balance !== s.balance || !integer(approved.minRemaining))
    return reject('invalid-baseline-plan');
  if (baseline.decision.action !== 'hold' || baseline.decision.reason !== 'hard-build-combat-bank')
    return { ...base, status: 'out-of-scope', reason: 'not-density-banking' };
  if (!controls || typeof controls.botEnabled !== 'boolean' || typeof controls.autoAttack !== 'boolean' ||
      !integer(controls.sliderPercentage) || controls.sliderPercentage > 100)
    return reject('unknown-controls');
  if (!controls.botEnabled || !controls.autoAttack || controls.sliderPercentage !== 0)
    return { ...base, status: 'blocked', reason: 'control-preference' };
  if (!core || !['planSpend','humanAttackDebit','al'].every(k => typeof core[k] === 'function'))
    return reject('missing-core-mechanics');
  if (!p || p.balanceKnown !== true || p.balance !== s.balance || p.territory !== s.territory ||
      !integer(p.territory) || p.territory < 1 || !integer(p.gameTick) || p.gameTick !== s.tick ||
      p.gameTimeSec !== s.gameTimeSec || p.areaTrend !== s.areaTrend || p.shrinkFrames !== s.shrinkFrames ||
      p.activeFronts !== s.activeFronts || p.attackSequence !== s.attackSequence ||
      !integer(p.activeFronts) || !integer(p.attackSequence) || !integer(p.frontCap) ||
      p.frontCap < 1 || p.frontCap > 4 || p.fronts !== 1 ||
      !Number.isFinite(p.softCap) || p.softCap <= 0 || p.softCap !== s.softCap ||
      !Number.isFinite(p.incoming) || p.incoming < 0 || p.incoming !== s.incoming ||
      !Number.isFinite(p.primaryDanger) || p.primaryDanger < 0 || p.primaryDanger > 1 ||
      p.primaryDanger !== s.primaryDanger ||
      p.freeLandRatio !== s.freeLandRatio || typeof s.hasAdjFree !== 'boolean' ||
      !isDeepStrictEqual(p.adjEnemies, s.adjEnemies)) return reject('incomplete-or-mismatched-spend-context');
  if (s.hasAdjFree || p.freeLandRatio !== 0)
    return reject('contradictory-density-hold');
  for (const e of s.adjEnemies)
    if (e.id > 511 || typeof e.available !== 'boolean' || typeof e.shipOnly !== 'boolean' || !integer(e.terr) || e.terr < 1)
      return reject('unknown-target-availability');
  const B = s.balance, largest = Math.max(0, ...s.adjEnemies.map(e => e.effectiveBal));
  const contactReserve = Math.ceil(largest * Math.min(1,
    DEFAULTS.baseReserve + DEFAULTS.perContact * Math.max(0, s.adjEnemies.length - 1)));
  const alternatives = [];
  for (const enemy of [...s.adjEnemies].sort((a,b) => a.effectiveBal-b.effectiveBal || a.id-b.id)) {
    const a = { targetId: enemy.id, effectiveBal: enemy.effectiveBal, status: 'blocked' };
    alternatives.push(a);
    if (!enemy.available || enemy.shipOnly) { a.reason = 'target-unavailable'; continue; }
    // Do not trust an externally supplied crushable label or call incoming pressure directed.
    if (B < Math.ceil(PARAMETERS.minimumAdvantage * enemy.effectiveBal)) {
      a.reason = 'insufficient-bank-advantage'; continue;
    }
    const ctx = { ...p, wantEnemy: true, crushable: core.al(B, 8) > enemy.effectiveBal,
      enemyBal: enemy.effectiveBal, relativePower: enemy.effectiveBal > 0 ? B/enemy.effectiveBal : 1,
      phase: 'PRESSURE', fronts: 1 };
    // Recompute a NEW action budget: the old hold's zero spend is not an attack approval.
    const plan = core.planSpend(ctx);
    a.budgetReason = plan.reason;
    if (!plan.canAfford) { a.reason = 'production-spend-block'; continue; }
    if (plan.balance !== B || !integer(plan.minRemaining) || !integer(plan.minAttack) ||
        plan.minAttack < 1 || !integer(plan.maxSpendTotal) || plan.maxSpendTotal > B-plan.minRemaining ||
        !Number.isFinite(plan.ratio) || plan.ratio < 0.01 || plan.ratio > 0.72 || plan.fronts !== 1)
      return reject('invalid-counterfactual-plan');
    const reserve = Math.max(approved.minRemaining, plan.minRemaining, contactReserve);
    const cost = units => {
      const requested = Math.floor(B*units/1024), debit = core.humanAttackDebit(B, requested);
      return { before: B, requested, ...debit, after: B-debit.debit };
    };
    let lo = 10, hi = Math.round(plan.ratio*1024), best = 0;
    while (lo <= hi) {
      const mid = Math.floor((lo+hi)/2), ledger = cost(mid);
      if (ledger.after >= reserve && ledger.debit <= plan.maxSpendTotal) { best=mid;lo=mid+1; }
      else hi=mid-1;
    }
    if (!best || cost(best).sent < plan.minAttack) { a.reason='reserve-or-minimum-attack'; continue; }
    Object.assign(a, { status:'feasible', reason:'reserve-feasible-pressure', ratio:best/1024,
      sliderUnits:best, requiredReserve:reserve, maxSpendTotal:plan.maxSpendTotal,
      minAttack:plan.minAttack, ledger:cost(best), crushable:ctx.crushable });
  }
  const choice = alternatives.find(a => a.status === 'feasible');
  return { ...base, status:choice?'proposal':'blocked',
    reason:choice?'reserve-feasible-pressure':'no-reserve-feasible-alternative',
    action:choice?'fight':'hold', targetId:choice?.targetId ?? null,
    financiallyFeasible:!!choice, alternatives, contactReserve,
    ...(choice ? { ratio:choice.ratio, sliderUnits:choice.sliderUnits,
      requiredReserve:choice.requiredReserve, ledger:choice.ledger } : {}) };
}
module.exports = { PARAMETERS, evaluateBankingAlternatives };
