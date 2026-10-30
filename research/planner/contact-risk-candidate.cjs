'use strict';
// Offline research only. No manifest import, browser APIs or native commands.
const DEFAULTS = Object.freeze({ baseReserve: 0.50, perContact: 0.05,
  openingSeconds: 60, maxAgeMs: 700 });
const integer = n => Number.isSafeInteger(n) && n >= 0;
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const unsupported = reason => ({ status: 'unsupported', reason,
  policyInfluence: false, assumptions: 'unfitted-contact-heuristic', ledger: null });

function context(snapshot, baseline, expected, parameters) {
  if (!snapshot || !baseline || !expected || !parameters) return { error: 'missing-context' };
  if (typeof expected.matchId !== 'string' || !expected.matchId ||
      !hash(expected.sourceHash) || !integer(expected.minStateVersion) ||
      snapshot.matchId !== expected.matchId || snapshot.sourceHash !== expected.sourceHash ||
      !integer(snapshot.stateVersion) || snapshot.stateVersion < expected.minStateVersion ||
      baseline.matchId !== snapshot.matchId || baseline.stateVersion !== snapshot.stateVersion ||
      baseline.sourceHash !== snapshot.sourceHash) return { error: 'stale-or-mismatched-provenance' };
  if (!Number.isFinite(snapshot.ageMs) || snapshot.ageMs < 0 || snapshot.ageMs > parameters.maxAgeMs)
    return { error: 'stale-observation' };
  if (snapshot.coverage !== 'complete-adjacent') return { error: 'incomplete-opponent-coverage' };
  const s = snapshot.situation;
  if (!s || s.balanceKnown !== true || !integer(s.balance) || s.balance > 2147483647 ||
      !Number.isFinite(s.gameTimeSec) || s.gameTimeSec < 0 || !Array.isArray(s.adjEnemies) ||
      s.adjEnemies.length > 511)
    return { error: 'unsupported-state' };
  const seen = new Set();
  let largestBank = 0;
  for (const e of s.adjEnemies) {
    if (!e || !integer(e.id) || seen.has(e.id) || e.adjacent !== true ||
        !integer(e.bal) || !integer(e.incoming) || !integer(e.effectiveBal) ||
        e.effectiveBal !== e.bal + e.incoming)
      return { error: 'invalid-opponent-observation' };
    seen.add(e.id);
    // Busy opponents still create exposure even if no command can target them.
    largestBank = Math.max(largestBank, e.effectiveBal);
  }
  return { s, plan: baseline.plan, contacts: seen.size, largestBank };
}

function evaluateOpeningBudget(core, snapshot, baseline, expected, options = {}) {
  const p = { ...DEFAULTS, ...options };
  if (!Number.isFinite(p.baseReserve) || p.baseReserve < 0 || p.baseReserve > 1 ||
      !Number.isFinite(p.perContact) || p.perContact < 0 || p.perContact > 1 ||
      !Number.isFinite(p.openingSeconds) || p.openingSeconds < 0 ||
      !Number.isFinite(p.maxAgeMs) || p.maxAgeMs < 0) return unsupported('invalid-parameters');
  const c = context(snapshot, baseline, expected, p);
  if (c.error) return unsupported(c.error);
  if (!core || typeof core.humanAttackDebit !== 'function') return unsupported('missing-native-debit');
  const { s, plan, contacts, largestBank } = c;
  const B = s.balance;
  if (!plan || typeof plan.canAfford !== 'boolean' || plan.balance !== B ||
      !integer(plan.minRemaining) || !integer(plan.maxSpendTotal)) return unsupported('invalid-baseline-plan');
  if (!baseline.decision || !['expand', 'fight', 'hold'].includes(baseline.decision.action))
    return unsupported('missing-baseline-action');
  const scoped = baseline.decision.action === 'expand' && s.hasAdjFree === true &&
    s.gameTimeSec <= p.openingSeconds;
  const contactReserve = scoped && contacts > 0
    ? Math.ceil(largestBank * Math.min(1, p.baseReserve + p.perContact * (contacts - 1))) : 0;
  const reserve = Math.max(plan.minRemaining, contactReserve);
  const result = { status: 'unchanged', reason: 'baseline-retained', policyInfluence: false,
    assumptions: 'unfitted-contact-heuristic', contactCount: contacts, largestBank,
    contactReserve, requiredReserve: reserve, ratio: 0, sliderUnits: 0, canAfford: false,
    ledger: { before: B, requested: 0, sent: 0, tax: 0, debit: 0, after: B } };
  if (!plan.canAfford) return { ...result, reason: 'baseline-blocked' };
  if (!Number.isFinite(plan.ratio) || plan.ratio < 0.01 || plan.ratio > 0.95 ||
      !integer(plan.minAttack) || plan.minAttack < 1 || plan.maxSpendTotal > B - plan.minRemaining)
    return unsupported('invalid-baseline-budget');
  const ceiling = Math.round(plan.ratio * 1024);
  const debit = units => {
    const requested = Math.floor(B * units / 1024);
    const cost = core.humanAttackDebit(B, requested);
    return { before: B, requested, ...cost, after: B - cost.debit };
  };
  const original = debit(ceiling);
  if (original.sent < plan.minAttack || original.debit > plan.maxSpendTotal ||
      original.after < plan.minRemaining) return unsupported('unsafe-baseline-budget');
  if (!scoped || contacts === 0)
    return { ...result, ratio: plan.ratio, sliderUnits: ceiling, canAfford: true, ledger: original };
  // Monotone exact integer debit search: only reduce the approved baseline.
  let low = Math.round(0.01 * 1024), high = ceiling, best = 0;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2), cost = debit(mid);
    if (cost.after >= reserve && cost.debit <= plan.maxSpendTotal) {
      best = mid; low = mid + 1;
    } else high = mid - 1;
  }
  if (!best || debit(best).sent < plan.minAttack)
    return { ...result, status: 'candidate', reason: 'contact-reserve-hold' };
  const ledger = debit(best);
  return { ...result, status: best < ceiling ? 'candidate' : 'unchanged',
    reason: best < ceiling ? 'contact-reserve-cap' : 'baseline-retained',
    ratio: best === ceiling ? plan.ratio : best / 1024,
    sliderUnits: best, canAfford: true, ledger };
}

function reviewBanking(snapshot, baseline, expected) {
  const c = context(snapshot, baseline, expected, DEFAULTS);
  if (c.error) return { ...unsupported(c.error), needsReview: false, executable: false };
  const d = baseline.decision, s = c.s;
  if (!d || typeof d.reason !== 'string')
    return { ...unsupported('missing-baseline-decision'), needsReview: false, executable: false };
  if (!Number.isFinite(s.areaTrend) || !integer(s.shrinkFrames))
    return { ...unsupported('missing-loss-signals'), needsReview: false, executable: false };
  const loss = s.areaTrend < -3 || s.shrinkFrames > 0;
  const banking = d.action === 'hold' && d.reason === 'hard-build-combat-bank';
  return { status: 'advisory', needsReview: banking && loss, executable: false,
    policyInfluence: false, reason: banking && loss ? 'density-hold-during-territory-loss' : 'baseline-retained',
    nextStep: banking && loss ? 'evaluate-reserve-feasible-alternatives' : null };
}

module.exports = { DEFAULTS, evaluateOpeningBudget, reviewBanking };
