'use strict';
// Explicit live, single-player diagnostic. Unlike research fixtures, this uses
// an installed extension, normal game UI and real elapsed time, never injected
// engine scripts, synthetic balances or an accelerated native scheduler.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { chromium } = require('playwright');
const { currentRelease } = require('./very-hard-standard.cjs');
const { installerExpression } = require('../research/planner-observer.cjs');
const { createAnalysis } = require('../research/planner-shadow-analysis.cjs');
const root = path.resolve(__dirname, '..');
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function mapSelectionPattern(label) {
  assert.ok(['Europe','Asia'].includes(label));
  // Full labels distinguish Asia from Caucasia; alternation avoids splitting
  // the green emoji's UTF-16 surrogate pair in a non-Unicode character class.
  return new RegExp('^(?:⚪|🟢)\\s+' + label + '$', 'u');
}

function terminal(state) {
  if (!state || !state.ready || !(state.gameTick > 0)) return null;
  if (state.alive === false && state.territory === 0) return 'loss';
  // Last survivor is not necessarily the game's completion condition. Island
  // maps can still show "neutral pixel ... still needs to be conquered".
  if (state.alive === true && state.territory > 0 && state.alivePlayers === 1) return 'opponents-eliminated';
  return null;
}

function summarize(samples) {
  const active = samples.filter(s => s.native?.gameTick > 0);
  const commands = active.map(s => s.agent?.commands).filter(Number.isFinite);
  const territories = active.map(s => s.native?.territory).filter(Number.isFinite);
  const failures = active.map(s => s.agent?.failures).filter(Number.isFinite);
  const reasons = {};
  for (const s of active) {
    const reason = s.agent?.decision?.reason;
    if (reason) reasons[reason] = (reasons[reason] || 0) + 1;
  }
  return { samples: samples.length, activeSamples: active.length,
    maxAcknowledgedCommands: commands.length ? Math.max(...commands) : null,
    maximumObservedTerritory: territories.length ? Math.max(...territories) : null,
    maxObservedFailureStreak: failures.length ? Math.max(...failures) : null,
    decisionReasonSamples: reasons,
    // Counts are descriptive correlated observations, not independent matches.
    statisticalWinRate: null };
}

async function run(options = {}) {
  const seconds = options.seconds ?? 300;
  assert.ok(Number.isInteger(seconds) && seconds >= 5 && seconds <= 900);
  const difficultyLabel = options.difficultyLabel ?? 'Very Hard';
  assert.ok(['Normal', 'Hard', 'Very Hard', 'Impossible'].includes(difficultyLabel));
  const players = options.players ?? 64;
  assert.ok(Number.isInteger(players) && players >= 2 && players <= 512);
  const mapLabel = options.mapLabel ?? null;
  assert.ok(mapLabel === null || ['Europe', 'Asia'].includes(mapLabel));
  // Asia's old shared Europe point overlapped a bot's initial claim. This is
  // a fixed visually inspected inland point, not a spawn optimizer or a seed.
  const spawn = options.spawn ?? (mapLabel === 'Asia' ? { x: 650, y: 480 }
    : mapLabel ? { x: 700, y: 400 } : { x: 550, y: 160 });
  assert.ok(Number.isFinite(spawn.x) && Number.isFinite(spawn.y));
  const output = options.output ?? path.join(root, 'scratch/live-chrome-audit',
    new Date().toISOString().replace(/[:.]/g, '-'));
  fs.mkdirSync(output, { recursive: true });
  const reportPath = path.join(output, 'report.json');
  assert.ok(!fs.existsSync(reportPath), 'Do not overwrite an existing observation');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tio-live-chrome-'));
  const report = { schema: 1, evidenceKind: 'live-official-installed-extension-diagnostic',
    startedAt: new Date().toISOString(), release: currentRelease(),
    difficultyLabel, players, mapLabel, spawn, samples: [], outcome: 'error',
    terminalConfirmed: false, manualCombatCommands: 0, accelerated: false,
    policyInfluence: 'existing-production-autoplay-only', performanceMicrobenchmark: false };
  const researchFreeze = Object.fromEntries(['planner-observer.cjs','contact-risk-candidate.cjs','planner-shadow-analysis.cjs','banking-alternatives.cjs']
    .map(file => [file,sha256(fs.readFileSync(path.join(root,'research',file)))]));
  report.researchFreeze = researchFreeze;
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, {
      executablePath: options.chrome ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      headless: options.headless === true, chromiumSandbox: true,
      viewport: { width: 1280, height: 900 },
      ignoreDefaultArgs: ['--disable-extensions'],
      args: ['--enable-unsafe-extension-debugging'],
    });
    report.chromeVersion = context.browser().version();
    const cdp = await context.browser().newBrowserCDPSession();
    const extension = await cdp.send('Extensions.loadUnpacked', { path: root });
    report.extensionId = extension.id;
    const page = context.pages()[0];
    report.errors = [];
    page.on('pageerror', error => {
      if (report.errors.length < 100) report.errors.push(String(error));
    });
    const bootstrapResponses = [];
    page.on('response', response => {
      if (response.url() === 'https://territorial.io/' && response.request().resourceType() === 'xhr')
        bootstrapResponses.push(response);
    });
    const navigation = await page.goto('https://territorial.io/');
    assert.ok(navigation, 'No original navigation response');
    report.navigationSourceSha256 = sha256(await navigation.body());
    // The preloader executes its synchronous XHR response, not necessarily the
    // navigation HTML. Capture that exact response; never substitute a later GET.
    const bootstrap = await page.evaluate(() => window.__TIO_PRELOAD_RESULT__);
    assert.equal(bootstrap?.status, 'pre-exec-patched');
    assert.equal(bootstrapResponses.length, 1, 'Ambiguous/missing preloader source response');
    const actualSource = await bootstrapResponses[0].body();
    assert.equal(actualSource.toString('utf8').length, bootstrap.bytes, 'Bootstrap body identity mismatch');
    report.sourceSha256 = sha256(actualSource);
    report.sourceBinding = 'captured-preloader-synchronous-xhr-response-before-patch';
    const contexts = [];
    const session = await context.newCDPSession(page);
    session.on('Runtime.executionContextCreated', event => contexts.push(event.context));
    await session.send('Runtime.enable');
    const isolated = contexts.find(c => c.origin === 'chrome-extension://' + extension.id);
    assert.ok(isolated, 'Actual extension isolated world was not created');
    const isolatedEval = async expression => {
      const response = await session.send('Runtime.evaluate', {
        contextId: isolated.id, expression, returnByValue: true });
      assert.ok(!response.exceptionDetails, 'Observer evaluation failed');
      return response.result.value;
    };
    let analysis = null;
    const drainObservers = async (stop = false) => {
      if (!analysis) return;
      const planner = JSON.parse(await isolatedEval(`JSON.stringify((()=>{const o=window.__TIO_PLANNER_OBSERVER__;
        ${stop ? 'o.stop();' : ''}return {events:o.drain(),stats:o.stats()};})())`));
      const native = await page.evaluate(stop => {
        const o=window.__TIO_NATIVE_OBSERVER__;if(stop)o.stop();return {events:o.drain(),stats:o.stats()};
      }, stop);
      for(const [file,events] of [['planner-events.ndjson',planner.events],['native-observer-events.ndjson',native.events]])
        if(events.length)fs.appendFileSync(path.join(output,file),events.map(e=>JSON.stringify(e)).join('\n')+'\n');
      analysis.nativeBatch(native.events, native.stats);
      const rows=analysis.plannerBatch(planner.events);
      if(rows.length)fs.appendFileSync(path.join(output,'shadow-proposals.ndjson'),rows.map(e=>JSON.stringify(e)).join('\n')+'\n');
      report.shadow={...analysis.summary(),plannerObserver:planner.stats,nativeObserver:native.stats,
        candidateActive:false,mode:'offline-action-shadow-not-transition-or-treatment',
        observerSha256:researchFreeze['planner-observer.cjs'],
        candidateSha256:researchFreeze['contact-risk-candidate.cjs']};
      report.shadow.missingDecisionRecords=Math.max(0,planner.stats.decisions-report.shadow.decisions);
      report.shadow.coverageDenominator=Math.max(planner.stats.decisions,report.shadow.decisions);
      report.shadow.validCoverage=report.shadow.coverageDenominator
        ?report.shadow.supported/report.shadow.coverageDenominator:null;
    };
    const readAgent = async () => {
      const response = await session.send('Runtime.evaluate', {
        contextId: isolated.id, returnByValue: true,
        expression: `JSON.stringify((()=>{const a=window.TerritorialEngineV5;
          return a?{status:a.getStatus(),decision:a._decision,budget:a.lastCommitMeta,
            commands:a.internalAttackCount,failures:a.internalFailStreak,
            gate:a.internalPlanningGate?{evaluations:a.internalPlanningGate.evaluations,
              skipped:a.internalPlanningGate.skipped}:null}:null;})())`,
      });
      assert.ok(!response.exceptionDetails, 'Cannot read actual extension state');
      return JSON.parse(response.result.value);
    };
    const readNative = () => page.evaluate(() => window.__TIO_HOOK_API__?.state());
    const preload = await page.evaluate(() => window.__TIO_PRELOAD_RESULT__);
    assert.equal(preload?.status, 'pre-exec-patched', 'Fail closed for unmapped official source');
    report.contract = preload.kind;
    if (options.shadow === true || options.bankingAlternatives === true) {
      const opts={sourceHash:report.sourceSha256,experimentId:path.basename(output),maxEvents:4096,maxBytes:4194304};
      await page.evaluate(installerExpression('native',opts));
      await isolatedEval(installerExpression('planner',opts));
      const { kernel }=require('./cpu-benchmark.cjs');
      analysis=createAnalysis(kernel().TIOEngineCore,report.sourceSha256,{bankingAlternatives:options.bankingAlternatives===true});
      report.bankingAlternativesShadow=options.bankingAlternatives===true;
    }
    report.extensionWorkers = context.serviceWorkers().map(w => w.url());
    await page.getByText('Custom Scenario', { exact: false }).click();
    await page.locator('#input1').fill(String(players));
    if (mapLabel) {
      await page.getByRole('button', { name: 'Settings', exact: true }).nth(0).click();
      await page.getByText(new RegExp('^[⚪🟢] Realistic Map$')).click();
      await page.getByText(mapSelectionPattern(mapLabel)).click();
      report.mapSelectionEvidence = await page.locator('body').innerText();
      await page.getByRole('button', { name: '⬅️ Back', exact: true }).click();
    }
    await page.getByRole('button', { name: 'Settings', exact: true }).nth(2).click();
    // Click the current official UI label; do not equate hook's policy DIFF=5
    // with game difficulty. Current Very Hard is native value 4.
    await page.getByText(new RegExp('^[⚪🟢] ' + difficultyLabel + '$')).click();
    await page.getByRole('button', { name: '⬅️ Back', exact: true }).click();
    report.scenario = await page.evaluate(() => {
      const g = window.__TIO_GAME__, d = g.aE.data;
      return { nativeDifficulty: d.botDifficultyValue, playerCount: d.playerCount,
        mapType: d.mapType, mapIndex: d.mapProceduralIndex, mapSeed: d.mapSeed,
        nativeMapSettings: Object.fromEntries(Object.entries(d).filter(([key, value]) =>
          /map/i.test(key) && ['number', 'string', 'boolean'].includes(typeof value))) };
    });
    assert.equal(report.scenario.playerCount, players);
    await page.getByRole('button', { name: '⚔️ Play', exact: true }).click();
    await page.waitForFunction(() => window.__TIO_HOOK_API__?.state().economy?.mapCells > 0);
    assert.equal(await page.evaluate(() => window.__TIO_GAME__.modern.singlePlayer()), true);
    await page.mouse.click(spawn.x, spawn.y);
    await sleep(1000);
    report.beforeSpawnConfirmation = { native: await readNative(), agent: await readAgent() };
    await page.screenshot({ path: path.join(output, 'spawn-selection.png') });
    await page.mouse.click(spawn.x, spawn.y); // Confirm the native castle button.
    await page.waitForFunction(() => window.__TIO_HOOK_API__?.state().territory > 0,
      null, { timeout: 10000 });
    report.matchStartedAt = new Date().toISOString();
    await page.screenshot({ path: path.join(output, 'start.png') });
    const deadline = Date.now() + seconds * 1000;
    while (Date.now() < deadline) {
      const sample = { at: new Date().toISOString(), native: await readNative(), agent: await readAgent() };
      report.samples.push(sample);
      await drainObservers();
      fs.appendFileSync(path.join(output, 'live-progress.ndjson'), JSON.stringify(sample) + '\n');
      if (report.samples.length === 1 || report.samples.length % 30 === 0)
        console.log(JSON.stringify({ progress: true, mapLabel, difficultyLabel,
          scenario: report.scenario, sample: report.samples.length,
          tick: sample.native?.gameTick, territory: sample.native?.territory,
          balance: sample.native?.balance, alivePlayers: sample.native?.alivePlayers,
          commands: sample.agent?.commands, reason: sample.agent?.decision?.reason }));
      const outcome = terminal(sample.native);
      if (outcome) {
        report.outcome = outcome;
        report.terminalConfirmed = outcome === 'loss';
        report.milestoneConfirmed = true;
        report.terminalEvidence = outcome === 'loss'
          ? 'native not-alive flag and zero territory'
          : 'last survivor only; official game completion is not inferred';
        break;
      }
      await sleep(1000);
    }
    if (!report.milestoneConfirmed) report.outcome = 'censored-time-limit';
    report.finalNative = await readNative();
    await drainObservers(true);
    await page.screenshot({ path: path.join(output, 'finish.png') });
    report.summary = summarize(report.samples);
  } catch (error) {
    report.error = String(error.stack || error);
    throw error;
  } finally {
    report.endedAt = new Date().toISOString();
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), { flag: 'wx' });
    if (context) await context.close();
    // Only this freshly created, owned temporary profile is removed.
    fs.rmSync(profile, { recursive: true, force: true });
    console.log(JSON.stringify({ reportPath, outcome: report.outcome, summary: report.summary }));
  }
  return report;
}

if (require.main === module) {
  const args = process.argv.slice(2).filter(arg => !['--shadow','--banking-shadow'].includes(arg));
  const seconds = Number(args[0] ?? 300);
  const difficultyLabel = args[1] ?? 'Very Hard';
  const players = Number(args[2] ?? 64);
  const mapLabel = args[3] ?? null;
  const shadow = process.argv.includes('--shadow');
  const bankingAlternatives = process.argv.includes('--banking-shadow');
  run({ seconds, difficultyLabel, players, mapLabel, shadow, bankingAlternatives }).catch(error => { console.error(String(error)); process.exitCode = 1; });
}
module.exports = { run, terminal, summarize, mapSelectionPattern };
