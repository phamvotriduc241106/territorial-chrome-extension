'use strict';
// Controlled offline single-player recordings of the current official source.
// This is research tooling, never packaged. No user profile or online games.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { chromium } = require(process.env.TIO_PLAYWRIGHT || 'playwright');
const { summarize } = require('./frontier-report.cjs');
const { fit } = require('./frontier-fit.cjs');
const root = path.resolve(__dirname, '..');
async function run(options = {}) {
  const matches = options.matches ?? 3, maxTicks = options.maxTicks ?? 20000;
  if (!Number.isInteger(matches) || matches < 1 || matches > 10 || !Number.isInteger(maxTicks) || maxTicks < 20 || maxTicks > 20000)
    throw Error('Invalid recording limits');
  const response = await fetch('https://territorial.io/', { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw Error('Official source HTTP ' + response.status);
  const html = await response.text(), sourceSha256 = crypto.createHash('sha256').update(html).digest('hex');
  const server = http.createServer((request, res) => { res.setHeader('Content-Type', 'text/html'); res.end(html); });
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = 'http://127.0.0.1:' + server.address().port;
    const chrome = process.env.TIO_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    browser = await chromium.launch({ headless: true, ...(fs.existsSync(chrome) ? { executablePath: chrome } : {}) });
    const context = await browser.newContext();
    await context.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
    const bootstrap = ['shared/config.js', 'shared/performance.js', 'content/engine-core-v1.js',
      'content/engine-core-v2-advanced.js', 'content/engine-adapter.js', 'content/source-adapter.js',
      'content/frontier-model.js', 'content/frontier-episodes.js'].map(p => fs.readFileSync(path.join(root, p), 'utf8'));
    bootstrap.push(`{
      const build = TIOSourceAdapter.buildExportSnippet;
      window.TIOSourceAdapter = { ...TIOSourceAdapter, buildExportSnippet(version, kind) {
        if (kind !== 'live-modern-v3') return build(version, kind);
        return build(version, kind).replace('window.__TIO_GAME__={',
          'window.__TIO_GAME__={testStep:function(){return n8();},');
      } };
      window.requestAnimationFrame = function () { return 0; };
    }`);
    bootstrap.push(...['content/preloader.js', 'content/main-hook.js'].map(p => fs.readFileSync(path.join(root, p), 'utf8')));
    const recordings = [];
    for (let i = 0; i < matches; i++) {
      const page = await context.newPage();
      page.on('pageerror', error => console.error('Recording page:', error.message));
      page.on('console', message => { if (message.type() === 'error') console.error(message.text()); });
      await page.addInitScript({ content: bootstrap.join('\n') });
      await page.goto(base);
      await page.waitForFunction(() => window.__TIO_GAME__?.modern && window.__TIO_HOOK_API__?.frontier, null, { polling: 100 });
      await page.evaluate(seed => {
        const game = window.__TIO_GAME__, api = window.__TIO_HOOK_API__;
        if (game.contract !== 'live-modern-v3') throw Error('Unverified recording contract');
        game.aE.data.botDifficultyValue = 5; game.aE.data.playerCount = 64; game.aE.data.selectableSpawn = 0;
        game.aE.data.mapSeed = seed;
        game.aE.a6i.a7A(); game.aE.a6i.a77();
        const start = api.frontier.start({ capacity: 16384, geometryIntervalMs: 0 });
        if (!start.ok || !start.status.nativeEvents.ok) throw Error('Native events unavailable');
        game.aE.a6m();
        if (!game.modern.singlePlayer()) throw Error('Not single-player');
      }, 14071 + i * 7919);
      // Start at tick zero; overlapping initial export is deduplicated by event ID.
      const chunks = [];
      const initial = await page.evaluate(() => window.__TIO_HOOK_API__.frontier.report());
      chunks.push(initial);
      let state;
      for (let t = 0; t < maxTicks; t += 20) {
        const batch = await page.evaluate(() => {
          const game = window.__TIO_GAME__, api = window.__TIO_HOOK_API__;
          for (let j = 0; j < 20; j++) {
            game.testStep();
            const s = api.state();
            // Known controlled commands, not a new production policy. Quiet
            // 100-tick windows provide non-disturbed short-horizon labels.
            if (s.alive && s.gameTick % 100 === 2 && s.neighbors.includes(s.neutralId))
              api.attackSmart({ ratio: 0.2, target: s.neutralId, preferNeutral: true });
            if (s.alivePlayers <= 1) break;
          }
          return { state: api.state(), ...api.frontier.drain() };
        });
        state = batch.state; chunks.push({ status: batch.status, telemetry: batch.telemetry });
        if (t % 1000 === 980) console.log('Match ' + (i + 1) + ' progress: tick ' + state.gameTick + ', alive ' + state.alivePlayers);
        if (batch.telemetry.dropped || batch.status.error || !batch.telemetry.commandCoverage)
          throw Error('Recording coverage failure: ' + JSON.stringify({ status: batch.status,
            dropped: batch.telemetry.dropped, gaps: batch.telemetry.records.filter(r => r.event === 'telemetry_gap') }));
        if (state.alivePlayers <= 1) break;
      }
      chunks.push(await page.evaluate(() => window.__TIO_HOOK_API__.frontier.stop()));
      const recording = { source: 'controlled-local-official-source', sourceSha256, recordedAt: new Date().toISOString(),
        controller: '20%-bank neutral command every 100 ticks when legal; otherwise hold; native Very Hard bots',
        seed: 14071 + i * 7919, difficulty: 5, players: 64,
        acceleratedNativeTicks: true, terminal: state.alivePlayers <= 1, endTick: state.gameTick, chunks };
      recordings.push(recording);
      console.log('Match ' + (i + 1) + ': tick ' + state.gameTick + ', alive ' + state.alivePlayers + ', records ' + chunks.reduce((n, c) => n + c.telemetry.records.length, 0));
      await page.close();
    }
    const directory = path.join(root, 'scratch', 'frontier-recordings', new Date().toISOString().replace(/[:.]/g, '-'));
    fs.mkdirSync(directory, { recursive: true });
    for (let i = 0; i < recordings.length; i++) fs.writeFileSync(path.join(directory, 'match-' + (i + 1) + '.json'), JSON.stringify(recordings[i]));
    const report = summarize(recordings), parameters = fit(recordings);
    fs.writeFileSync(path.join(directory, 'report.json'), JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(directory, 'estimates.json'), JSON.stringify(parameters, null, 2));
    console.log(JSON.stringify({ directory, sourceSha256, completeMatches: report.completeMatchCount,
      forecasts: report.forecasts, paired: report.paired, censoringRate: report.censoringRate,
      estimates: parameters.status }, null, 2));
    return { directory, report, parameters };
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
if (require.main === module) run({ matches: Number(process.argv[2] || 3), maxTicks: Number(process.argv[3] || 20000) })
  .catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { run };
