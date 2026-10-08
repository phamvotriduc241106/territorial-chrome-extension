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
      const bootstrap = ['shared/config.js', 'shared/performance.js', 'content/engine-core-v1.js',
        'content/engine-core-v2-advanced.js', 'content/engine-adapter.js', 'content/source-adapter.js', 'content/frontier-model.js',
        'content/frontier-episodes.js',
        'content/frontier-spatial.js', 'content/frontier-dynamic.js',
        'content/preloader.js', 'content/main-hook.js'].map(read);
      // Test-only access to the ORIGINAL native gr/hR/hQ routines. This hook is
      // never packaged. It restores mutable globals/arrays/functions in finally.
      bootstrap.splice(7, 0, `{
        const build = TIOSourceAdapter.buildExportSnippet;
        window.TIOSourceAdapter = { ...TIOSourceAdapter, buildExportSnippet: function(version, kind) {
          const result = build(version, kind);
          if (kind !== 'live-modern-v3') return result;
          return result.replace('window.__TIO_GAME__={', \`window.__TIO_GAME__={
            testCombatBatch:function(input){
              var saved=[gQ,gU,gR,gV,gS,gT],me=aE.fJ,foe=(me+1)%aE.fW;
              var bank=ah.hb[foe],land=ah.hN[foe],counter=input.counter;
              var gz=bg.gz,hc=ae.hc,ha=ae.ha;
              try{gQ=me;gU=input.neutral?aE.fW:foe;gR=input.troops;gV=input.cells;gS=false;
                ah.hb[foe]=input.bank;ah.hN[foe]=input.territory;
                bg.gz=function(){};ae.hc=function(){return counter};ae.ha=function(p,t,n){counter=n};
                var captured=0,resolved=true;
                if(gV>0&&gr()){captured=hA()?gV:0;resolved=!captured;}
                return {remaining:gR,bank:ah.hb[foe],counter:counter,captured:captured,resolved:resolved};
              }finally{gQ=saved[0];gU=saved[1];gR=saved[2];gV=saved[3];gS=saved[4];gT=saved[5];
                ah.hb[foe]=bank;ah.hN[foe]=land;bg.gz=gz;ae.hc=hc;ae.ha=ha;}
            },\`);
        } };
      }`);
      await page.addInitScript({ content: bootstrap.join('\n') });
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
      if (expectedContract === 'live-modern-v3') {
        const frontier = await page.evaluate(async () => {
          const game = window.__TIO_GAME__, f = window.TIOFrontier, api = window.__TIO_HOOK_API__;
          const state = api.state(), t0 = performance.now(), r = game.modern.ownership(4 * 1024 * 1024);
          if (!r) throw Error('Native ownership does not reconcile');
          const g = f.extract(r, { matchId: state.matchId, stateVersion: state.stateVersion,
            gameTick: state.gameTick, geometryVersion: 1 }, { player: state.player });
          for (let p = 0; p < r.counts.length; p++)
            if (r.counts[p] !== game.ah.hN[p]) throw Error('Native ownership territory mismatch');
          const extractionMs = performance.now() - t0;
          let cases = 0;
          for (const land of [1, 10, 100, 10000]) for (const cells of [1, Math.min(land, 3), land])
            for (const bank of [0, land * 10, land * 150]) for (const counter of [0, 100])
              for (const troops of [0, cells * game.aE.gt, cells * game.aE.gt + 1, 10000]) {
                const input = { territory: land, cells, bank, counter, troops };
                const expected = game.testCombatBatch(input);
                const predicted = f.resolveNativeBatch(troops, bank, land, cells, counter, game.aE.gt);
                if (JSON.stringify(predicted) !== JSON.stringify(expected))
                  throw Error('Native combat batch mismatch: ' + JSON.stringify({ input, expected, predicted }));
                cases++;
              }
          for (const troops of [0, 2, 3, 10000]) {
            const input = { territory: 10, cells: 3, bank: 0, counter: 0, troops, neutral: true };
            if (JSON.stringify(game.testCombatBatch(input)) !== JSON.stringify(f.resolveNativeBatch(troops, 0, 10, 3, 0, game.aE.gt, true)))
              throw Error('Native neutral combat mismatch'); cases++;
          }
          if (api.frontier.report().status.enabled) throw Error('Shadow mode must default off');
          const originals = [game.ae.ei, game.ae.h0, game.ae.clear, game.bD.gv.n4,
            game.bD.gv.gw, game.af.qr, game.bi.ee, game.ad.h4, game.ad.zu, game.ad.k6,
            game.ad.a0G, game.ad.aJi, game.af.ee, game.bD.gv.m6, game.bD.gv.gy, game.ap.jf.k2];
          const start = api.frontier.start({spatial:true,maxBytes:33554432});
          // Exercise the actual timer -> exact-tick paired label path, not only
          // synchronous start/stop. No extra attacks or online matches.
          const deadline = performance.now() + 5000;
          while (performance.now() < deadline && !api.frontier.report().telemetry.records.some(x =>
            x.event === 'prediction_scored' && x.predictions.frontier && x.modelCoverage.frontier))
            await new Promise(resolve => setTimeout(resolve, 50));
          const report = api.frontier.stop();
          const restored = [game.ae.ei, game.ae.h0, game.ae.clear, game.bD.gv.n4,
            game.bD.gv.gw, game.af.qr, game.bi.ee, game.ad.h4, game.ad.zu, game.ad.k6,
            game.ad.a0G, game.ad.aJi, game.af.ee, game.bD.gv.m6, game.bD.gv.gy, game.ap.jf.k2];
          if (!originals.every((f, i) => f === restored[i]) || game.shadow.active())
            throw Error('Opt-in native hooks did not restore original functions');
          if (!start.ok || !report.telemetry || report.status.policyInfluence || report.status.error ||
            !report.telemetry.records.some(x => x.event === 'geometry_snapshot') ||
            !report.telemetry.records.some(x => x.event === 'prediction' && x.predictions.frontier) ||
            !report.telemetry.records.some(x => x.event === 'prediction_scored' && x.predictions.frontier))
            throw Error('Shadow integration failed: ' + JSON.stringify(report));
          if(!report.status.spatial?.reconciled||!report.telemetry.records.some(x=>x.event==='spatial_baseline')||report.telemetry.dropped)
            throw Error('Integrated spatial baseline/replay unavailable');
          return { width: r.width, height: r.height, cells: r.owners.length, reconciledPlayers: r.counts.length,
            segments: g.meta.segmentCount, boundaryEdges: g.meta.boundaryEdges, extractionMs,
            exactCombatCases: cases, restoredNativeFunctions: originals.length,
            scoredShadowPredictions: report.telemetry.scored, policyInfluence: false };
        });
        console.log('Official ownership and combat shadow: PASS ' + JSON.stringify(frontier));
        const economics = await page.evaluate(() => {
          const game = window.__TIO_GAME__, core = window.TIOEngineCore;
          const me = game.modern.me(), originalTick = game.bi.a2Q.ae0;
          const banks = game.ah.hb.slice(), lands = game.ah.hN.slice(), debts = game.ah.a5j.slice();
          const cases = [];
          try {
            for (const territory of [100, Math.floor(game.aE.ke * 0.03), Math.floor(game.aE.ke * 0.4)]) {
             for (const tick of [8, 9, 99, 1919, 1929, 2999]) {
              for (const bank of [territory * 10, territory * 100, territory * 150 - 10]) {
                game.bi.a2Q.ae0 = tick; game.ah.hN[me] = territory; game.ah.hb[me] = bank; game.ah.a5j[me] = 0;
                const economy = game.modern.economy(me);
                const predictedRate = core.planningInterestBps(territory, bank, tick, economy);
                if (predictedRate !== economy.interestRateBps) throw Error('Native interest-rate mismatch: ' +
                  JSON.stringify({ tick, bank, economy, predictedRate }));
                const predicted = core.transitionPlanningState({ tick, balance: bank, territory,
                  economy, adjEnemies: [], playersRemaining: 1 }, { type: 'hold' }, 1);
                game.af.ee();
                if (predicted.balance !== game.ah.hb[me]) throw Error('Native income mismatch: ' +
                  JSON.stringify({ tick, bank, predicted: predicted.balance, native: game.ah.hb[me] }));
                cases.push({ territory, tick, bank, after: predicted.balance });
                game.ah.hb.set(banks); game.ah.hN.set(lands); game.ah.a5j.set(debts);
              }
             }
            }
            const snapshot = window.__TIO_HOOK_API__.state();
            if (!snapshot.economy || !Array.isArray(snapshot.outgoingAttacks) || snapshot.totalEnemyBalance == null)
              throw Error('Planning economics missing from native snapshot');
          } finally {
            game.bi.a2Q.ae0 = originalTick; game.ah.hb.set(banks); game.ah.hN.set(lands); game.ah.a5j.set(debts);
          }
          return { cases: cases.length, exactIncomeAndRate: true };
        });
        console.log('Official planning economics: PASS ' + JSON.stringify(economics));
      }
      await page.close();
    }
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
