// NODE_PATH may point at a local playwright-core installation. No user profile is used.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const { chromium } = require(process.env.TIO_PLAYWRIGHT || 'playwright');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
require('./unit.cjs');
let live = process.env.TIO_LIVE_SOURCE && fs.readFileSync(process.env.TIO_LIVE_SOURCE, 'utf8');
let liveKind = null;
if (live) {
  liveKind = TIOSourceAdapter.detectContract(live);
  if (!['live-modern', 'live-modern-v2', 'live-modern-v3'].includes(liveKind)) throw Error('Unsupported live source: ' + liveKind);
  console.log('Live source:', liveKind);
}
const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  const p = path.resolve(root, '.' + decodeURIComponent(url.pathname));
  if (url.pathname === '/live' && live) {
    response.setHeader('Content-Type', 'text/html');
    response.end(live);
  } else if (p.startsWith(root + path.sep) && fs.existsSync(p) && fs.statSync(p).isFile()) {
    response.setHeader('Content-Type', p.endsWith('.html') ? 'text/html' : 'text/javascript');
    response.end(fs.readFileSync(p));
  } else { response.statusCode = 404; response.end(); }
});
(async () => {
  let browser;
  try {
    if (process.env.TIO_FETCH_LIVE === '1' || process.argv.includes('--live')) {
      const response = await fetch('https://territorial.io/', { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw Error('Official source fetch: HTTP ' + response.status);
      live = await response.text();
      liveKind = TIOSourceAdapter.detectContract(live);
      if (!['live-modern', 'live-modern-v2', 'live-modern-v3'].includes(liveKind))
        throw Error('Unsupported live source: ' + liveKind);
      console.log('Fresh official source:', liveKind, require('node:crypto').createHash('sha256').update(live).digest('hex'));
    }
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = 'http://127.0.0.1:' + server.address().port;
    const systemChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    const executablePath = process.env.TIO_CHROME || (fs.existsSync(systemChrome) ? systemChrome : undefined);
    browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
    const context = await browser.newContext();
    // Keep source verification local; never join an online match.
    await context.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
    for (const test of ['bridge-harness', 'main-hook-harness']) {
      const page = await context.newPage();
      await page.goto(base + '/tests/' + test + '.html');
      await page.waitForFunction(() => document.body.dataset.status !== 'running', { timeout: 15000 });
      const result = await page.locator('#result').innerText();
      console.log(test + ': ' + result);
      if (!result.startsWith('PASS')) throw Error(test + ' failed');
      await page.close();
    }
    if (live) {
      const page = await context.newPage();
      await page.addInitScript({ content: ['shared/config.js', 'content/engine-core-v1.js',
        'content/engine-core-v2-advanced.js', 'content/engine-adapter.js', 'content/source-adapter.js',
        'content/preloader.js', 'content/main-hook.js'].map(read).join('\n') });
      await page.goto(base + '/live');
      await page.waitForFunction(() => window.__TIO_GAME__ && window.__TIO_GAME__.modern);
      const result = await page.evaluate(() => ({ preload: window.__TIO_PRELOAD_RESULT__,
        contract: window.__TIO_GAME__.contract, state: window.__TIO_HOOK_API__.state() }));
      const expectedContract = liveKind === 'live-modern' ? 'live-modern-v1' : liveKind;
      if (result.preload.status !== 'pre-exec-patched' || result.contract !== expectedContract) {
        throw Error('Live bootstrap failed: ' + JSON.stringify(result));
      }
      console.log('Official source bootstrap: PASS ' + JSON.stringify(result));
      await page.evaluate((contract) => {
        const game = window.__TIO_GAME__;
        game.aE.data.botDifficultyValue = 5;
        game.aE.data.playerCount = 64;
        game.aE.data.selectableSpawn = 0;
        if (contract === 'live-modern-v3') {
          game.aE.a6i.a7A();
          game.aE.a6i.a77();
          game.aE.a6m();
        } else {
          game.aE.a6d.a75();
          game.aE.a6d.a72();
          game.aE.a6h();
        }
      }, expectedContract);
      await page.waitForFunction(() => window.__TIO_HOOK_API__.state().alive &&
        window.__TIO_GAME__.modern.canAttack(window.__TIO_GAME__.modern.me()));
      const smoke = await page.evaluate(async () => {
        const api = window.__TIO_HOOK_API__, game = window.__TIO_GAME__, core = window.TIOEngineCore;
        const before = api.state();
        if (!game.modern.singlePlayer()) throw Error('Test must remain single-player');
        const target = before.neighbors.includes(before.neutralId) ? before.neutralId : before.neighbors[0];
        if (target == null) throw Error('No test border');
        const result = api.attackSmart({ ratio: 0.2, preferNeutral: target === before.neutralId, target });
        const after = api.state();
        const expected = core.estimateAttackCost(before.balance, result.ratio);
        if (!result.ok || before.balance - after.balance !== expected || after.activeFronts !== before.activeFronts + 1) {
          throw Error('Live debit/front mismatch: ' + JSON.stringify({ before, after, result, expected }));
        }
        return { difficulty: game.aE.data.botDifficultyValue, players: game.aE.data.playerCount,
          balanceBefore: before.balance, balanceAfter: after.balance,
          exactDebit: expected, activeFronts: after.activeFronts, target: result.target };
      });
      console.log('Official single-player attack: PASS ' + JSON.stringify(smoke));
      await page.close();
    }
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
