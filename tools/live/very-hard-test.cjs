'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createPlan, currentRelease, validatePlan, appendResult, report, sha256 } = require('./very-hard-standard.cjs');
const [command, filename, ...args] = process.argv.slice(2);
function read(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function evidence(plan, base, verifyOnly = false) {
  for (const result of plan.results) for (const key of ['start', 'finish']) {
    const item = result.evidence[key];
    const bytes = fs.readFileSync(path.resolve(base, item.path));
    // Check file signatures, not image semantics or screenshot authenticity.
    const png = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if (!png && !jpeg) throw Error('Evidence must be a PNG/JPEG screenshot: ' + item.path);
    const hash = sha256(bytes);
    if (verifyOnly && item.sha256 !== hash) throw Error('Evidence changed: ' + item.path);
    item.sha256 = hash;
  }
}
try {
  if (!filename) throw Error('Usage: very-hard-test.cjs init <campaign.json> <4 map labels> | record <campaign.json> <result.json> | report <campaign.json>');
  const destination = path.resolve(filename), base = path.dirname(destination);
  if (command === 'init') {
    const plan = createPlan(args);
    fs.mkdirSync(base, { recursive: true });
    fs.writeFileSync(destination, JSON.stringify(plan, null, 2) + '\n', { flag: 'wx' });
    // Produce a ready-to-edit result template alongside the frozen schedule.
    const result = {
      id: 1, map: plan.schedule[0].map, outcome: 'loss',
      ...plan.conditions, maxDurationSeconds: undefined,
      extensionVersion: plan.release.extensionVersion, engineVersion: plan.release.engineVersion,
      releaseSha256: plan.release.releaseSha256, engineSha256: plan.release.engineSha256,
      settings: plan.release.settings, mapSeed: 'undisclosed', spawnSeed: 'undisclosed',
      startedAt: '', endedAt: '', manualIntervention: false, terminalConfirmed: true,
      reason: '', evidence: { start: { path: 'match-01-start.png' }, finish: { path: 'match-01-finish.png' } }
    };
    fs.writeFileSync(destination + '.result-template.json', JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
    console.log('Created frozen 20-match plan and result template: ' + destination);
  } else if (command === 'record') {
    if (args.length !== 1) throw Error('Specify one result JSON file');
    const plan = validatePlan(read(destination));
    evidence(plan, base, true);
    const result = read(args[0]);
    evidence({ results: [result] }, base);
    const next = appendResult(plan, result, currentRelease());
    // Preserve a recoverable snapshot before updating the campaign.
    fs.copyFileSync(destination, destination + '.before-match-' + result.id + '.json', fs.constants.COPYFILE_EXCL);
    fs.writeFileSync(destination, JSON.stringify(next, null, 2) + '\n');
    console.log(JSON.stringify(report(next), null, 2));
  } else if (command === 'report') {
    const plan = validatePlan(read(destination));
    evidence(plan, base, true);
    const result = report(plan);
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== 'complete') process.exitCode = 2;
  } else throw Error('Unknown command: ' + command);
} catch (error) { console.error(error.message); process.exitCode = 1; }
