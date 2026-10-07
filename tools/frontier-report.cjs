'use strict';
const fs = require('node:fs');
function metrics(values) {
  if (!values.length) return { n: 0, mae: null, rmse: null, p95AbsoluteError: null };
  const absolute = values.map(Math.abs).sort((a, b) => a - b);
  return { n: values.length, mae: absolute.reduce((s, n) => s + n, 0) / values.length,
    rmse: Math.sqrt(values.reduce((s, n) => s + n * n, 0) / values.length),
    p95AbsoluteError: absolute[Math.ceil(0.95 * absolute.length) - 1] };
}
function legacySummarize(exports) {
  const groups = new Map(), seen = new Map();
  let unpaired = 0, censored = 0, droppedRecords = 0;
  for (const input of exports) {
    const data = input.telemetry || input;
    if (data.schema !== 1 || data.policyInfluence !== false || !Array.isArray(data.records) || data.records.length > 4096)
      throw Error('Unsupported shadow telemetry');
    droppedRecords += Number.isFinite(data.dropped) ? data.dropped : 0;
    for (const record of data.records) {
      if (record.event === 'prediction_censored') { censored++; continue; }
      if (record.event !== 'prediction_scored') continue;
      if (typeof record.matchId !== 'string' || !Number.isInteger(record.stateVersion) ||
        !Number.isInteger(record.dueTick) || record.dueTick !== record.gameTick + 10)
        throw Error('Invalid prediction provenance');
      const key = record.matchId + ':' + record.stateVersion + ':' + record.dueTick;
      const serialized = JSON.stringify(record);
      if (seen.has(key)) {
        if (seen.get(key) !== serialized) throw Error('Conflicting prediction labels');
        continue; // overlapping exports must not multiply the effective sample
      }
      seen.set(key, serialized);
      const p = record.predictions;
      if (!p || !p.frontier || p.frontier.modelKind !== 'native-cost-static-frontier-shadow') { unpaired++; continue; }
      if (!p.aggregate || p.aggregate.modelKind !== 'aggregate-combat-estimate') throw Error('Missing aggregate baseline');
      let group = groups.get(record.matchId);
      if (!group) { group = { aggregate: { balance: [], territory: [] }, frontier: { balance: [], territory: [] } };
        groups.set(record.matchId, group); }
      for (const model of ['aggregate', 'frontier']) for (const field of ['balance', 'territory']) {
        const predicted = p[model][field], actual = record.actual && record.actual[field];
        if (!Number.isFinite(predicted) || !Number.isFinite(actual) || predicted < 0 || actual < 0 ||
          predicted > 1e12 || actual > 1e12) throw Error('Invalid numeric forecast or observation');
        group[model][field].push(predicted - actual);
      }
    }
  }
  const pooled = { aggregate: { balance: [], territory: [] }, frontier: { balance: [], territory: [] } };
  const byMatch = [];
  for (const [matchId, group] of groups) {
    const entry = { matchId };
    for (const model of ['aggregate', 'frontier']) {
      entry[model] = {};
      for (const field of ['balance', 'territory']) {
        entry[model][field] = metrics(group[model][field]);
        pooled[model][field].push(...group[model][field]);
      }
    }
    byMatch.push(entry);
  }
  const result = { schema: 1, matchCount: groups.size, unpaired, censored, droppedRecords,
    policyPromotionAllowed: false,
    limitation: 'Descriptive live trajectory errors, not independent samples or held-out validation. Split by complete match offline. No win-rate evidence.', byMatch };
  for (const model of ['aggregate', 'frontier']) {
    result[model] = {};
    for (const field of ['balance', 'territory']) result[model][field] = metrics(pooled[model][field]);
  }
  return result;
}
if (require.main === module) {
  try {
    const paths = process.argv.slice(2);
    if (!paths.length || paths.length > 100) throw Error('Usage: node tools/frontier-report.cjs <shadow-export.json> [more exports]');
    const data = paths.map(path => {
      if (fs.statSync(path).size > 256 * 1024 * 1024) throw Error('Telemetry file exceeds 256 MiB');
      return JSON.parse(fs.readFileSync(path, 'utf8'));
    });
    console.log(JSON.stringify(summarize(data), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
function recordsFrom(inputs) {
  const records = new Map(), sessions = new Map();
  function ingest(input) {
    if (Array.isArray(input.chunks)) { input.chunks.forEach(ingest); return; }
    const data = input.telemetry || input;
    if (data.schema !== 2 || data.policyInfluence !== false || !Array.isArray(data.records) || data.records.length > 16384 || !data.sessionId)
      throw Error('Unsupported episode telemetry');
    const previous = sessions.get(data.sessionId) || { dropped: 0 };
    previous.dropped = Math.max(previous.dropped, data.dropped || 0); sessions.set(data.sessionId, previous);
    for (const r of data.records) {
      if (typeof r.eventId !== 'string' || !r.eventId.startsWith(data.sessionId + ':')) throw Error('Missing event provenance');
      const old = records.get(r.eventId);
      if (old && JSON.stringify(old) !== JSON.stringify(r)) throw Error('Conflicting event labels');
      records.set(r.eventId, r);
    }
  }
  inputs.forEach(ingest);
  return { records: [...records.values()], droppedRecords: [...sessions.values()].reduce((s, d) => s + d.dropped, 0), sessions };
}
function episodeSummarize(inputs) {
  const { records, droppedRecords, sessions } = recordsFrom(inputs), byId = new Map(records.map(r => [r.eventId, r]));
  const starts = new Map(), ends = new Map(), predictions = new Map(), labels = new Map(), native = new Map(), gaps = new Set();
  for (const r of records) {
    if (r.event === 'match_meta') starts.set(r.matchId, r);
    if (r.event === 'match_end') ends.set(r.matchId, r);
    if (r.event === 'telemetry_gap') gaps.add(r.matchId);
    if (r.event === 'prediction') {
      if (predictions.has(r.predictionId)) throw Error('Conflicting prediction origins');
      predictions.set(r.predictionId, r);
    }
    if (['prediction_scored', 'prediction_censored'].includes(r.event)) {
      if (labels.has(r.predictionId)) throw Error('Conflicting prediction labels');
      labels.set(r.predictionId, r);
    }
    if (['native_command', 'native_reinforcement', 'native_termination'].includes(r.event)) {
      if (!native.has(r.matchId)) native.set(r.matchId, []);
      native.get(r.matchId).push(r);
    }
  }
  const bucket = () => ({ forecasts: 0, scored: 0, paired: 0, censored: 0, pending: 0, invalid: 0, etaLabels: 0,
    coverage: { aggregate: 0, frontier: 0, commands: 0, knownFronts: 0 },
    aggregate: { territory: [], captured: [], balance: [], etaTicks: [] },
    frontier: { territory: [], captured: [], balance: [], etaTicks: [] } });
  const overall = bucket(), completeOverall = bucket(), matches = new Map(), episodes = new Map(), horizons = new Map(), subsets = new Map();
  for (const key of ['reinforced', 'non-reinforced', 'flag-unknown', 'reinforcement-observed', 'no-reinforcement-observed'])
    subsets.set(key, bucket());
  const episodeStarts = new Map(records.filter(r => r.event === 'episode_start').map(r => [r.episodeId, r]));
  const activeMatches = new Set(records.filter(r => ['match_active', 'episode_start', 'prediction'].includes(r.event)).map(r => r.matchId));
  const episodeEnds = new Map(records.filter(r => ['episode_termination', 'episode_censored'].includes(r.event)).map(r => [r.episodeId, r]));
  const reasons = {};
  function get(map, key) { if (!map.has(key)) map.set(key, bucket()); return map.get(key); }
  for (const [id, p] of predictions) {
    if (!Number.isInteger(p.horizon) || p.dueTick !== p.gameTick + p.horizon || !Array.isArray(p.affectedPlayers))
      throw Error('Invalid prediction provenance');
    const label = labels.get(id), coverage = p.modelCoverage || {}, affected = p.affectedPlayers;
    const session = p.eventId.slice(0, p.eventId.lastIndexOf(':'));
    let invalidReason = null;
    if (label && label.event === 'prediction_scored') {
      if (label.matchId !== p.matchId || label.episodeId !== p.episodeId || label.frontId !== p.frontId ||
        label.horizon !== p.horizon || label.observedTick !== p.dueTick || label.dueTick !== p.dueTick || label.gameTick !== p.gameTick ||
        !Number.isInteger(p.sourceStateVersion) || !Number.isInteger(label.observedSourceStateVersion) ||
        label.observedSourceStateVersion < p.sourceStateVersion) invalidReason = 'invalid-provenance';
      if (sessions.get(session).dropped || gaps.has(p.matchId)) invalidReason = 'incomplete-event-ledger';
      if ((label.interveningCommands || []).some(key => !byId.has(key))) invalidReason = 'missing-command-reference';
      for (const e of native.get(p.matchId) || []) {
        if (!(e.sourceStateVersion > p.sourceStateVersion && e.sourceStateVersion <= label.observedSourceStateVersion)) continue;
        const relevant = affected.includes(e.actor) || e.event === 'native_command' && affected.includes(e.target);
        if (relevant && (e.event !== 'native_termination' || e.refund > 0)) invalidReason = 'action-contaminated';
        if (e.event === 'native_command' && !(label.interveningCommands || []).includes(e.eventId)) invalidReason = 'incomplete-command-ledger';
      }
      if (!coverage.commands || !coverage.knownFronts) invalidReason = 'unmodeled-context';
    }
    const subset = p.reinforced === true ? 'reinforced' : p.reinforced === false ? 'non-reinforced' : 'flag-unknown';
    const groups = [overall, get(matches, p.matchId), get(episodes, p.episodeId), get(horizons, String(p.horizon)), get(subsets, subset)];
    if (complete(p.matchId)) groups.push(completeOverall);
    if (label && label.reinforcementDuringInterval) groups.push(get(subsets, 'reinforcement-observed'));
    else if (label && !invalidReason) groups.push(get(subsets, 'no-reinforcement-observed'));
    const reason = invalidReason || (label && label.event === 'prediction_censored' ? label.reason : null);
    if (reason) reasons[reason] = (reasons[reason] || 0) + 1;
    for (const group of groups) {
      group.forecasts++;
      for (const key of Object.keys(group.coverage)) if (coverage[key]) group.coverage[key]++;
      if (!label) { group.pending++; continue; }
      if (reason) { group.censored++; if (invalidReason) group.invalid++; continue; }
      group.scored++;
      if (label.etaLabelValid) group.etaLabels++;
      if (!coverage.aggregate || !coverage.frontier) continue; // paired comparison only
      if (p.predictions?.aggregate?.modelKind !== 'aggregate-combat-estimate' ||
        p.predictions?.frontier?.modelKind !== 'native-cost-static-frontier-shadow') throw Error('Invalid paired model identity');
      group.paired++;
      for (const model of ['aggregate', 'frontier']) for (const field of ['territory', 'captured', 'balance', 'etaTicks']) {
        const value = p.predictions && p.predictions[model] && p.predictions[model][field];
        const actual = field === 'etaTicks' ? label.actualEtaTicks : label.actual && label.actual[field];
        if (field === 'etaTicks' && (!label.etaLabelValid || value == null)) continue;
        if (!Number.isFinite(value) || !Number.isFinite(actual) || Math.abs(value) > 1e12 || Math.abs(actual) > 1e12)
          throw Error('Invalid numeric forecast or observation');
        group[model][field].push(value - actual);
      }
    }
  }
  const finish = b => ({ ...b, censoringRate: b.forecasts ? b.censored / b.forecasts : null,
    pairedCoverage: b.forecasts ? b.paired / b.forecasts : null,
    coverage: Object.fromEntries(Object.entries(b.coverage).map(([k, n]) => [k, { n, fraction: b.forecasts ? n / b.forecasts : null }])),
    aggregate: Object.fromEntries(Object.entries(b.aggregate).map(([k, v]) => [k, metrics(v)])),
    frontier: Object.fromEntries(Object.entries(b.frontier).map(([k, v]) => [k, metrics(v)])) });
  function complete(id) { return !!(starts.get(id)?.startObserved && ends.get(id)?.terminalObserved && !gaps.has(id) &&
    !sessions.get(starts.get(id).eventId.slice(0, starts.get(id).eventId.lastIndexOf(':'))).dropped); }
  const byMatch = [...new Set([...starts.keys(), ...matches.keys()])].filter(id => activeMatches.has(id)).map(matchId => ({ matchId,
    complete: complete(matchId), startTick: starts.get(matchId)?.startTick ?? null,
    endTick: ends.get(matchId)?.gameTick ?? null, ...finish(matches.get(matchId) || bucket()) }));
  return { schema: 2, policyPromotionAllowed: false, matchCount: byMatch.length,
    completeMatchCount: byMatch.filter(m => m.complete).length, droppedRecords,
    episodeCoverage: { observed: episodeStarts.size, forecasted: episodes.size,
      fraction: episodeStarts.size ? episodes.size / episodeStarts.size : null,
      playerContactObserved: [...episodeStarts.values()].filter(e => e.playerContact).length,
      playerContactForecasted: [...episodes.keys()].filter(id => episodeStarts.get(id)?.playerContact).length },
    geometryCoverage: { successfulScans: records.filter(r => r.event === 'geometry_snapshot').length,
      failedScans: records.filter(r => r.event === 'geometry_unavailable').length,
      episodeObservations: records.filter(r => r.event === 'episode_observation').length },
    orphanLabels: [...labels.keys()].filter(k => !predictions.has(k)).length,
    ...finish(overall), censoringReasons: reasons, byMatch,
    byEpisode: [...new Set([...episodeStarts.keys(), ...episodes.keys()])].map(episodeId => ({ episodeId,
      matchId: episodeStarts.get(episodeId)?.matchId, actor: episodeStarts.get(episodeId)?.actor,
      target: episodeStarts.get(episodeId)?.target, playerContact: episodeStarts.get(episodeId)?.playerContact ?? null,
      launchTick: episodeStarts.get(episodeId)?.launchTick ?? null,
      terminationTick: episodeEnds.get(episodeId)?.terminationTick ?? null,
      outcome: episodeEnds.get(episodeId)?.outcome || episodeEnds.get(episodeId)?.reason || 'not-observed',
      ...finish(episodes.get(episodeId) || bucket()) })),
    byHorizon: [...horizons].map(([horizon, b]) => ({ horizon: Number(horizon), ...finish(b) })),
    subsets: Object.fromEntries([...subsets].map(([key, b]) => [key, finish(b)])),
    completeMatches: byMatch.filter(m => m.complete),
    completeMatchMetrics: finish(completeOverall),
    limitation: 'Paired exact-tick, action-censored errors; captured is attack-specific territory delta, territory is total actor territory. Correlated horizons are not independent samples. Complete-match splits required; no policy promotion or win-rate claim.' };
}
function summarize(inputs) {
  return inputs.every(x => (x.telemetry || x).schema === 1) ? legacySummarize(inputs) : episodeSummarize(inputs);
}
module.exports = { summarize, recordsFrom, metrics };
