'use strict';
// Observational estimates only. Never imported by runtime or applied to policy.
const fs = require('node:fs');
const { recordsFrom, summarize, metrics } = require('./frontier-report.cjs');
const median = xs => { if (!xs.length) return null; const a = [...xs].sort((a, b) => a - b), i = a.length >> 1;
  return a.length % 2 ? a[i] : (a[i - 1] + a[i]) / 2; };
const estimate = xs => ({ n: xs.length, median: median(xs), p10: xs.length ? [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) * .1)] : null,
  p90: xs.length ? [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) * .9)] : null });
const band = n => n < 1000 ? '<1000' : n < 10000 ? '1000-9999' : n < 60000 ? '10000-59999' : '>=60000';
function fit(inputs) {
  const { records } = recordsFrom(inputs), report = summarize(inputs);
  const complete = report.completeMatches.map(m => m.matchId).sort();
  // IDs define a reproducible, match-level split. Never randomly split ticks/horizons.
  const heldout = complete.length >= 3 ? [complete[complete.length - 1]] : [];
  const training = complete.filter(id => !heldout.includes(id));
  const commands = records.filter(r => r.event === 'native_command');
  const commandIndex = new Map();
  for (const c of commands) for (const actor of new Set([c.actor, c.target].filter(a => typeof a === 'number'))) {
    const key = c.matchId + ':' + actor; if (!commandIndex.has(key)) commandIndex.set(key, []);
    commandIndex.get(key).push(c.sourceStateVersion);
  }
  for (const xs of commandIndex.values()) xs.sort((a, b) => a - b);
  const disturbed = (a, b) => [a.actor, a.target].filter(p => typeof p === 'number').some(p => {
    const xs = commandIndex.get(a.matchId + ':' + p) || []; let lo = 0, hi = xs.length;
    while (lo < hi) { const m = (lo + hi) >>> 1; if (xs[m] <= a.sourceStateVersion) lo = m + 1; else hi = m; }
    return lo < xs.length && xs[lo] <= b.sourceStateVersion;
  });
  const starts = new Map(records.filter(r => r.event === 'episode_start').map(r => [r.episodeId, r]));
  const end = records.filter(r => r.event === 'episode_termination');
  const validEnds = new Set(end.filter(e => e.etaLabelValid).map(e => e.episodeId));
  const observations = records.filter(r => r.event === 'native_batch');
  const geometries = records.filter(r => r.event === 'geometry_snapshot');
  const geometryIndex = new Map(geometries.map(g => [g.matchId + ':' + g.geometryVersion, g]));
  function samples(matchIds) {
    const cadence = {}, growth = [], contactRatio = [], firstDelay = [], support = [], refunds = [], eta = [], previous = new Map();
    const selected = records.filter(r => matchIds.includes(r.matchId));
    const launchByFront = new Map([...starts.values()].filter(s => matchIds.includes(s.matchId) && !s.leftCensored)
      .map(s => [s.matchId + ':' + s.nativeFrontId, s]));
    const first = new Map();
    for (const r of observations.filter(r => matchIds.includes(r.matchId)).sort((a, b) => a.sourceStateVersion - b.sourceStateVersion)) {
      const key = r.matchId + ':' + r.nativeFrontId, old = previous.get(key);
      if (!first.has(key)) {
        first.set(key, r);
        const launch = launchByFront.get(key);
        if (launch) firstDelay.push(r.observationTick - launch.launchTick);
      }
      if (old && !disturbed(old, r) && r.observationTick > old.observationTick && band(old.before.actor.territory) === band(r.before.actor.territory)) {
        const b = band(r.before.actor.territory); (cadence[b] ||= []).push(r.observationTick - old.observationTick);
        if (!r.returned && !old.returned && old.candidateCells > 0 && r.candidateCells > 0)
          growth.push(Math.log(r.candidateCells / old.candidateCells) / (r.observationTick - old.observationTick));
      }
      previous.set(key, r);
      const g = geometryIndex.get(r.matchId + ':' + r.geometryVersion);
      if (g && g.gameTick < r.observationTick && r.observationTick - g.gameTick <= 10 &&
        !r.returned && !disturbed({ ...r, sourceStateVersion: g.sourceStateVersion }, r)) {
        const target = r.target === 'neutral' ? g.playerSlots : r.target;
        const pair = (g.pairs || []).find(p => p.a === r.actor && p.b === target || p.b === r.actor && p.a === target);
        const contacts = pair && (pair.a === r.actor ? pair.contactB : pair.contactA);
        if (contacts > 0) contactRatio.push(r.candidateCells / contacts);
      }
    }
    for (const r of selected) {
      if (r.event === 'native_reinforcement' && r.requested > 0 && Number.isFinite(r.delivered)) {
        support.push({ deliveryFraction: r.delivered / r.requested,
          bankFraction: (r.actorBefore.balance - r.actorAfter.balance) / r.requested,
          debtFraction: (r.actorAfter.debt - r.actorBefore.debt) / r.requested });
      }
      if (r.event === 'native_termination' && r.reason === 'native-return' && r.remainingForce > 0 && Number.isFinite(r.refund))
        refunds.push({ fraction: r.refund / r.remainingForce, debtLimited: r.actorAfter.debt > 0,
          capLimited: r.actorAfter.balance >= r.actorAfter.territory * 150 });
    }
    for (const r of end.filter(r => matchIds.includes(r.matchId))) {
      const s = starts.get(r.episodeId), b = s && first.get(s.matchId + ':' + s.nativeFrontId);
      if (!s || !b || !r.etaLabelValid || r.reinforcementObserved || r.durationTicks < 0 || disturbed(s, r)) continue;
      // Simple identifiable conditional ETA: median duration by initial territory band.
      eta.push({ matchId: r.matchId, band: band(b.before.actor.territory), duration: r.durationTicks,
        reinforced: s.reinforced, initialForce: s.initialForce, initialCandidateCells: b.candidateCells });
    }
    return { cadence, growth, contactRatio, firstDelay, support, refunds, eta };
  }
  const train = samples(training), test = samples(heldout), etaBands = {};
  for (const b of ['<1000', '1000-9999', '10000-59999', '>=60000'])
    etaBands[b] = estimate(train.eta.filter(e => e.band === b).map(e => e.duration));
  const etaErrors = test.eta.filter(e => etaBands[e.band].n >= 5).map(e => etaBands[e.band].median - e.duration);
  return { schema: 1, shadowOnly: true, policyInfluence: false, parametersApplied: false,
    status: complete.length >= 3 ? 'observational-estimates' : 'insufficient-complete-matches',
    trainingMatches: training, heldoutMatches: heldout, excludedIncompleteMatches: report.matchCount - complete.length,
    cadenceTicksByActorTerritory: Object.fromEntries(Object.entries(train.cadence).map(([b, xs]) => [b, estimate(xs)])),
    firstBatchDelayTicks: estimate(train.firstDelay), contactGrowthLogRatePerTick: estimate(train.growth),
    nativeCandidateToObservedContactRatio: estimate(train.contactRatio),
    reinforcement: Object.fromEntries(['deliveryFraction', 'bankFraction', 'debtFraction'].map(k => [k, estimate(train.support.map(s => s[k]))])),
    refundCreditToRemainingForce: estimate(train.refunds.map(r => r.fraction)),
    refundSubsets: { debtLimited: estimate(train.refunds.filter(r => r.debtLimited).map(r => r.fraction)),
      capLimited: estimate(train.refunds.filter(r => r.capLimited).map(r => r.fraction)),
      unconstrained: estimate(train.refunds.filter(r => !r.debtLimited && !r.capLimited).map(r => r.fraction)) },
    etaDurationTicksByInitialTerritory: etaBands, heldoutEtaErrorTicks: metrics(etaErrors),
    etaTerminalSamples: train.eta.length, etaHeldoutSamples: test.eta.length,
    rightOrLeftCensoredEpisodes: records.filter(r => r.event === 'episode_start' && !validEnds.has(r.episodeId)).length,
    limitations: [ 'Initial descriptive estimates, not causal identification or a calibrated dynamic combat model.',
      'Cadence excludes intervening commands and cross-band pairs; candidate growth also excludes native returns.',
      'Contact ratios are local player geometry only, at most 10 ticks old; topology and selection-limit effects remain confounded.',
      'Support/refund fractions are observed conditional on debt and bank caps; they do not identify a universal constant.',
      'ETA uses known native returns without reinforcement or subsequent relevant commands; censored episodes are not zero-duration labels.',
      'Median ETA is a diagnostic baseline, not a deployment parameter. Held-out evaluation needs at least 3 complete matches and 5 training episodes per band.' ] };
}
if (require.main === module) {
  try {
    const paths = process.argv.slice(2);
    if (!paths.length) throw Error('Usage: node tools/frontier-fit.cjs <episode-export.json> [more exports]');
    const data = paths.map(p => { if (fs.statSync(p).size > 256 * 1024 * 1024) throw Error('Input exceeds 256 MiB');
      return JSON.parse(fs.readFileSync(p, 'utf8')); });
    console.log(JSON.stringify(fit(data), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { fit, median, estimate };
