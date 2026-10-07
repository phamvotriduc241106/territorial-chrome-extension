'use strict';
const fs = require('node:fs');
function metrics(values) {
  if (!values.length) return { n: 0, mae: null, rmse: null, p95AbsoluteError: null };
  const absolute = values.map(Math.abs).sort((a, b) => a - b);
  return { n: values.length, mae: absolute.reduce((s, n) => s + n, 0) / values.length,
    rmse: Math.sqrt(values.reduce((s, n) => s + n * n, 0) / values.length),
    p95AbsoluteError: absolute[Math.ceil(0.95 * absolute.length) - 1] };
}
function summarize(exports) {
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
      if (fs.statSync(path).size > 16 * 1024 * 1024) throw Error('Telemetry file exceeds 16 MiB');
      return JSON.parse(fs.readFileSync(path, 'utf8'));
    });
    console.log(JSON.stringify(summarize(data), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { summarize };
