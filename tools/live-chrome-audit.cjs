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
const root = path.resolve(__dirname, '..');
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

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
  assert.ok(['Normal', 'Hard', 'Very Hard'].includes(difficultyLabel));
  const players = options.players ?? 64;
  assert.ok(Number.isInteger(players) && players >= 2 && players <= 512);
  const spawn = options.spawn ?? { x: 550, y: 160 };
  assert.ok(Number.isFinite(spawn.x) && Number.isFinite(spawn.y));
  const output = options.output ?? path.join(root, 'scratch/live-chrome-audit',
    new Date().toISOString().replace(/[:.]/g, '-'));
  fs.mkdirSync(output, { recursive: true });
  const reportPath = path.join(output, 'report.json');
  assert.ok(!fs.existsSync(reportPath), 'Do not overwrite an existing observation');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tio-live-chrome-'));
  const report = { schema: 1, evidenceKind: 'live-official-installed-extension-diagnostic',
    startedAt: new Date().toISOString(), release: currentRelease(),
    difficultyLabel, players, spawn, samples: [], outcome: 'error',
    terminalConfirmed: false, manualCombatCommands: 0, accelerated: false,
    policyInfluence: 'existing-production-autoplay-only', performanceMicrobenchmark: false };
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
    await page.goto('https://territorial.io/');
    const source = await (await page.request.get('https://territorial.io/')).text();
    report.sourceSha256 = sha256(source);
    const contexts = [];
    const session = await context.newCDPSession(page);
    session.on('Runtime.executionContextCreated', event => contexts.push(event.context));
    await session.send('Runtime.enable');
    const isolated = contexts.find(c => c.origin === 'chrome-extension://' + extension.id);
    assert.ok(isolated, 'Actual extension isolated world was not created');
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
    report.extensionWorkers = context.serviceWorkers().map(w => w.url());
    await page.getByText('Custom Scenario', { exact: false }).click();
    await page.locator('#input1').fill(String(players));
    await page.getByRole('button', { name: 'Settings', exact: true }).nth(2).click();
    // Click the current official UI label; do not equate hook's policy DIFF=5
    // with game difficulty. Current Very Hard is native value 4.
    await page.getByText(new RegExp('^[⚪🟢] ' + difficultyLabel + '$')).click();
    await page.getByRole('button', { name: '⬅️ Back', exact: true }).click();
    report.scenario = await page.evaluate(() => {
      const g = window.__TIO_GAME__, d = g.aE.data;
      return { nativeDifficulty: d.botDifficultyValue, playerCount: d.playerCount,
        mapType: d.mapType, mapIndex: d.mapProceduralIndex, mapSeed: d.mapSeed };
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
  const seconds = Number(process.argv[2] ?? 300);
  run({ seconds }).catch(error => { console.error(String(error)); process.exitCode = 1; });
}
module.exports = { run, terminal, summarize };
