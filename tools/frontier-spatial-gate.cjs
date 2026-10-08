'use strict';
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), crypto = require('node:crypto');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
async function gate() {
  const response = await fetch('https://territorial.io/', { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw Error('Official HTTP ' + response.status);
  const html = await response.text(), hash = crypto.createHash('sha256').update(html).digest('hex');
  const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(html); });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath: process.env.TIO_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
    const page = await browser.newPage(), base = 'http://127.0.0.1:' + server.address().port;
    await page.route('**/*', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
    const files = ['shared/config.js', 'shared/performance.js', 'content/engine-core-v1.js',
      'content/engine-core-v2-advanced.js', 'content/engine-adapter.js', 'content/source-adapter.js',
      'content/frontier-model.js', 'content/frontier-spatial.js', 'content/frontier-dynamic.js', 'content/frontier-episodes.js'];
    const scripts = files.map(f => fs.readFileSync(path.join(root, f), 'utf8'));
    scripts.push(`{const build=TIOSourceAdapter.buildExportSnippet; window.TIOSourceAdapter={...TIOSourceAdapter,
      buildExportSnippet(v,k){return build(v,k).replace('window.__TIO_GAME__={',\`window.__TIO_GAME__={testStep:function(){return n8();},
      researchBatch:function(x){var saved=[gQ,gU,gR,gV,gS,gT],actor=aE.fJ,target=(actor+1)%aE.fW;
        var hb=ah.hb.slice(),hN=ah.hN.slice(),debt=ah.a5j.slice(),hc=ae.hc,ha=ae.ha,gz=bg.gz,counter=x.counter||0;
        try{gQ=actor;gU=x.neutral?aE.fW:target;gR=x.force;gV=x.cells;gS=!!x.reinforced;
          ah.hb[actor]=x.actorBank||0;ah.a5j[actor]=x.debt||0;ah.hb[target]=x.bank;ah.hN[target]=x.territory;
          ae.hc=function(){return counter};ae.ha=function(p,t,n){counter=n};bg.gz=function(){};
          var captured=gV&&gr()&&hA()?gV:0;
          return {force:gR,bank:ah.hb[target],counter:counter,actorBank:ah.hb[actor],debt:ah.a5j[actor],captured:captured};
        }finally{gQ=saved[0];gU=saved[1];gR=saved[2];gV=saved[3];gS=saved[4];gT=saved[5];
          ah.hb.set(hb);ah.hN.set(hN);ah.a5j.set(debt);ae.hc=hc;ae.ha=ha;bg.gz=gz;}}
      ,\`);}};
      window.requestAnimationFrame=()=>0;}`);
    scripts.push(...['content/preloader.js', 'content/main-hook.js'].map(f => fs.readFileSync(path.join(root, f), 'utf8')));
    await page.addInitScript({ content: scripts.join('\n') }); await page.goto(base);
    await page.waitForFunction(() => window.__TIO_GAME__?.modern);
    await page.evaluate(() => {
      const g = __TIO_GAME__; if (g.contract !== 'live-modern-v3') throw Error('Unsupported source');
      g.aE.data.botDifficultyValue = 5; g.aE.data.playerCount = 64; g.aE.data.selectableSpawn = 0;
      g.aE.data.mapSeed = 240071; g.aE.a6i.a7A(); g.aE.a6i.a77(); g.aE.a6m();
      let kernelCases = 0;
      for (const reinforced of [false,true]) for (const neutral of [false,true])
        for (const force of [0,1,20,30,100,1000,100000]) for (const counter of [0,10,1000])
          for (const actorBank of [0,1,10000]) {
            const x={force,bank:1000,territory:100,cells:10,counter,actorBank,debt:100,reinforced,neutral};
            const native=g.researchBatch(x),predicted=TIODynamicFrontier.batch(x);
            for(const k of ['force','bank','counter','actorBank','debt','captured'])if(native[k]!==predicted[k])
              throw Error('Native support arithmetic mismatch '+k+' '+JSON.stringify({x,native,predicted}));
            kernelCases++;
          }
      const originals = ['h4','zu','k6','a0G','aJi'].map(k => g.ad[k]);
      const stats = { deltas: 0, captures: 0, hostileBatches: 0, neutralBatches: 0, cellWrites: 0,
        reconciliations: 0, fullAudits: 0, changedOwnerAttribution: true, candidateSelection: true, nativeSupportKernelCases: kernelCases };
      let snapshot, pending = [], previous;
      const installed = g.shadow.install(e => {
        if (e.event === 'native_spatial_delta') {
          previous = snapshot;
          snapshot = TIOSpatial.advance(snapshot, { ...e, matchId: 'gate' }, e.territories);
          stats.deltas++; stats.cellWrites += e.changes.length; stats.reconciliations++;
          if (e.cause === 'combat') {
            for (const [i, from, to] of e.changes) {
              if (from !== (e.target === 'neutral' ? g.aE.fW : e.target) || to !== e.actor ||
                  TIOSpatial.at(previous, i) !== from || TIOSpatial.at(snapshot, i) !== to)
                throw Error('Capture attribution failure');
            }
            pending = e.changes;
          }
        } else if (e.event === 'native_batch' && e.selectedFrontier) {
          const before = e.changedCells?.length ? previous : snapshot, seen = new Set(), expected = [];
          const offsets = Array.from(g.ad.fb, x => x / 4), target = e.target === 'neutral' ? g.aE.fW : e.target;
          for (let k = 3; k >= 0; k--) for (let j = e.selectedFrontier.length - 1; j >= 0; j--) {
            const i = e.selectedFrontier[j] + offsets[k];
            if (i >= 0 && i < before.cells && !seen.has(i) && TIOSpatial.at(before, i) === target) { seen.add(i); expected.push(i); }
          }
          if (JSON.stringify(expected) !== JSON.stringify(e.candidateIndices)) throw Error('Native ordered contact mismatch');
          if (e.territoryDelta !== e.changedCells.length) throw Error('Capture count mismatch');
          if (JSON.stringify(pending) !== JSON.stringify(e.changedCells) && e.changedCells.length) throw Error('Unattributed batch writes');
          pending = []; stats.captures += e.changedCells.length;
          if (e.target === 'neutral') stats.neutralBatches++; else stats.hostileBatches++;
        }
      }, { spatial: true });
      if (!installed.ok) throw Error(installed.err);
      const b = g.shadow.spatialBegin(); if (!b) throw Error('Baseline unavailable');
      snapshot = TIOSpatial.baseline(b, { matchId: 'gate', spatialVersion: 0,
        sourceStateVersion: b.sourceStateVersion, gameTick: b.gameTick });
      window.__gate = { stats, originals, snapshot: () => snapshot, audit() {
        const r = g.shadow.spatialState(); if (!r) throw Error('Native ownership reconciliation failed');
        for (let i = 0; i < r.owners.length; i++) if (TIOSpatial.at(snapshot, i) !== r.owners[i]) throw Error('Full reconstruction mismatch at ' + i);
        stats.fullAudits++;
      } };
    });
    for (let t = 0; t < 4000; t += 100) {
      const progress = await page.evaluate(() => {
        const g = __TIO_GAME__, api = __TIO_HOOK_API__;
        for (let i = 0; i < 100; i++) {
          g.testStep(); const s = api.state();
          if (s.alive && s.gameTick % 32 === 2) {
            const hostile = s.enemies.filter(e => s.neighbors.includes(e.id)).sort((a,b)=>a.bal-b.bal);
            const target = hostile[0]?.id ?? s.neutralId;
            if (s.neighbors.includes(target)) api.attackSmart({ target, ratio: 0.35, preferNeutral: target === s.neutralId });
          }
        }
        __gate.audit(); if (g.shadow.fault()) throw Error(g.shadow.fault());
        return { ...__gate.stats, tick: g.bi.kr() };
      });
      if (t % 1000 === 900) console.log('Spatial gate', progress);
      if (progress.hostileBatches >= 200 && progress.captures >= 10000) break;
    }
    const result = await page.evaluate(() => {
      const g = __TIO_GAME__, result = { ...__gate.stats, tick: g.bi.kr() }; g.shadow.stop();
      if (!['h4','zu','k6','a0G','aJi'].every((k,i)=>g.ad[k]===__gate.originals[i])) throw Error('Ownership wrappers not restored');
      if (result.hostileBatches < 100 || result.captures < 1000 || result.fullAudits < 1) throw Error('Insufficient hostile gate coverage');
      return { ...result, restoredOwnershipFunctions: 5, status: 'passed' };
    });
    const out = { ...result, officialSourceSha256: hash, recordedAt: new Date().toISOString(), policyInfluence: false };
    fs.mkdirSync(path.join(root, 'scratch/dynamic-frontier-research'), { recursive: true });
    fs.writeFileSync(path.join(root, 'scratch/dynamic-frontier-research/spatial-gate.json'), JSON.stringify(out, null, 2));
    console.log(JSON.stringify(out, null, 2)); return out;
  } finally { if (browser) await browser.close(); await new Promise(r => server.close(r)); }
}
if (require.main === module) gate().catch(e => { console.error(e); process.exitCode = 1; });
module.exports = { gate };
