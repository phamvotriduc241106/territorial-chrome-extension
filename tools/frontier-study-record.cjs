'use strict';
// Local official-source matches, isolated profile, offline network, no production policy.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), crypto = require('node:crypto'), zlib = require('node:zlib');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const strata = ['weak-target', 'strong-target', 'mutual', 'reinforced', 'refund', 'narrow-border', 'wide-border', 'simultaneous-front'];
function bootstrap() {
  const files = ['shared/config.js', 'shared/performance.js', 'content/engine-core-v1.js', 'content/engine-core-v2-advanced.js',
    'content/engine-adapter.js', 'content/source-adapter.js', 'content/frontier-model.js', 'content/frontier-spatial.js', 'content/frontier-episodes.js'];
  const scripts = files.map(f => fs.readFileSync(path.join(root, f), 'utf8'));
  scripts.push(`{
    const adapter = TIOSourceAdapter;
    window.TIOSourceAdapter = { ...adapter, patch(html, snippet) {
      const signature='function cA(){var nJ;var nK;var nL;';
      if (html.split(signature).length!==2 || !html.includes('nL[player]=nR?2:64')) throw Error('Scheduler signature changed');
      // Read-only private phase access, exclusively in this un-packaged research harness.
      html=html.replace(signature,signature+'this.researchPhase=function(){return {order:Array.from(nK.subarray(0,nJ)),timers:Array.from(nL)};};');
      return adapter.patch(html,snippet);
    }, buildExportSnippet(v,k) {
      if(k!=='live-modern-v3')throw Error('Unsupported study source');
      return adapter.buildExportSnippet(v,k).replace('window.__TIO_GAME__={', 'window.__TIO_GAME__={researchStep:function(){return n8();},');
    }};
    window.requestAnimationFrame=()=>0;
  }`);
  scripts.push(...['content/preloader.js', 'content/main-hook.js'].map(f => fs.readFileSync(path.join(root, f), 'utf8')));
  return scripts.join('\n');
}
async function record(options = {}) {
  const first = options.first || 1, last = options.last || 16, maxTicks = options.maxTicks || 20000;
  if (!Number.isInteger(first) || !Number.isInteger(last) || first < 1 || last < first || last > 24) throw Error('Invalid split');
  const gate = JSON.parse(fs.readFileSync(path.join(root, 'scratch/dynamic-frontier-research/spatial-gate.json'), 'utf8'));
  if (gate.status !== 'passed') throw Error('Spatial gate not passed');
  const response = await fetch('https://territorial.io/', { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw Error('Official HTTP ' + response.status);
  const html = await response.text(), sourceSha256 = crypto.createHash('sha256').update(html).digest('hex');
  if (sourceSha256 !== gate.officialSourceSha256) throw Error('Source changed after gate');
  const directory = path.resolve(options.directory || path.join(root, 'scratch/dynamic-frontier-research/dataset-v2')); fs.mkdirSync(directory, { recursive: true });
  const server = http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(html);});
  await new Promise(r=>server.listen(0,'127.0.0.1',r)); let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath: process.env.TIO_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
    const context = await browser.newContext(), base = 'http://127.0.0.1:' + server.address().port;
    await context.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());
    for (let index = first; index <= last; index++) {
      const output = path.join(directory, 'match-' + String(index).padStart(2,'0') + '.json.gz');
      if (fs.existsSync(output)) throw Error('Refuse to overwrite frozen recording ' + output);
      const page = await context.newPage(); await page.addInitScript({ content: bootstrap() });
      await page.goto(base); await page.waitForFunction(()=>window.__TIO_GAME__?.modern);
      const initial = await page.evaluate(({ index, stratum }) => {
        const g = __TIO_GAME__, matchId = 'study-' + String(index).padStart(2,'0');
        g.aE.data.botDifficultyValue=5;g.aE.data.playerCount=[32,64,96][Math.floor((index-1)/8)];
        g.aE.data.selectableSpawn=0;g.aE.data.mapSeed=240071+(index-1)*7919;
        g.aE.a6i.a7A();g.aE.a6i.a77();
        let records=[], sequence=0, snapshot=null, changedAttribution=0;
        const totals={ events:0,deltas:0,writes:0,hostileBatches:0,neutralBatches:0,reinforcements:0,externalCredits:0,
          refunds:0,terminations:0,fullAudits:0,origins:0,labels:0,peakBufferedEvents:0 };
        const add=e=>{ if(records.length>=16384)throw Error('Research event capacity');
          records.push({...e,matchId,recordId:++sequence});totals.events++;totals.peakBufferedEvents=Math.max(totals.peakBufferedEvents,records.length); };
        const installed=g.shadow.install(e=>{
          if(e.event==='native_tick')return;
          if(e.event==='native_spatial_delta'){
            if(!snapshot)throw Error('Delta before baseline');
            snapshot=TIOSpatial.advance(snapshot,{...e,matchId},e.territories);
            totals.deltas++;totals.writes+=e.changes.length;
            if(e.cause==='combat')for(const [i,from,to]of e.changes){
              if(from!==(e.target==='neutral'?g.aE.fW:e.target)||to!==e.actor)throw Error('Capture attribution'); changedAttribution++;
            }
          }
          if(e.event==='native_batch'){if(e.target==='neutral')totals.neutralBatches++;else totals.hostileBatches++;}
          if(e.event==='native_reinforcement')totals.reinforcements++;
          if(e.event==='native_external_credit')totals.externalCredits++;
          if(e.event==='native_termination'){totals.terminations++;if(e.refund>0)totals.refunds++;}
          add(e);
        },{spatial:true});if(!installed.ok)throw Error(installed.err);
        g.aE.a6m();
        const native=g.shadow.spatialBegin();if(!native)throw Error('Spatial initialization rejected');
        snapshot=TIOSpatial.baseline(native,{matchId,spatialVersion:0,sourceStateVersion:native.sourceStateVersion,gameTick:native.gameTick});
        const horizons=[2,5,10,20],due=new Set();
        function alive(){return Array.from(g.ah.nU).reduce((a,b)=>a+!!b,0);}
        function label(){const gameTick=g.bi.kr();add({event:'research_label',gameTick,sourceStateVersion:g.shadow.version(),
          spatialVersion:snapshot.spatialVersion,balances:Array.from(g.ah.hb),territories:Array.from(g.ah.hN),
          debts:Array.from(g.ah.a5j),alive:Array.from(g.ah.nU)});totals.labels++;}
        function origin(){const gameTick=g.bi.kr(),fronts=g.shadow.fronts(),hostile=fronts.filter(f=>f.target!=='neutral');
          if(!hostile.length)return;
          const queues=g.ah.h1.map(q=>q?Array.from(q,f=>f/4):[]);
          if(queues.reduce((n,q)=>n+q.length,0)>65536)throw Error('Frontier queue capacity');
          const players=Array.from(g.ah.hN,(territory,p)=>({territory,balance:g.ah.hb[p],debt:g.ah.a5j[p],alive:!!g.ah.nU[p],economy:g.modern.economy(p)}));
          add({event:'research_origin',gameTick,sourceStateVersion:g.shadow.version(),spatialVersion:snapshot.spatialVersion,
            players,fronts,frontierQueues:queues,offsets:Array.from(g.ad.fb,f=>f/4),scheduler:g.aG.researchPhase(),
            constants:{cellCost:g.aE.gt,debtCap:g.aE.a5v,hardCapMaximum:g.aE.a5m,hardCapPerCell:g.aE.a5l},
            forecastFrontIds:hostile.map(f=>f.nativeFrontId),horizons});
          horizons.forEach(h=>due.add(gameTick+h));totals.origins++;
        }
        function control(){const me=g.aE.fJ,tick=g.bi.kr();if(!g.ah.nU[me]||tick%64!==0||!g.modern.canAttack(me))return;
          let targets=g.modern.neighbors(me,false).filter(t=>t!==g.aE.fW);
          const bank=t=>g.ah.hb[t];targets.sort((a,b)=>bank(a)-bank(b));
          if(stratum==='strong-target')targets.reverse();
          if(stratum==='mutual')targets.sort((a,b)=>g.ae.hc(b,me)-g.ae.hc(a,me));
          if(stratum==='narrow-border'||stratum==='wide-border'){
            const width=t=>{let n=0;for(const f of g.ah.hF[me]||[])for(const d of g.ad.fb)if(g.ad.h9(f+d)&&g.ad.fR(f+d)===t)n++;return n;};
            targets.sort((a,b)=>stratum==='narrow-border'?width(a)-width(b):width(b)-width(a));
          }
          if(!targets.length&&g.modern.neighbors(me,false).includes(g.aE.fW))targets=[g.aE.fW];
          const ratio=stratum==='refund'?0.02:stratum==='reinforced'?0.05:stratum==='strong-target'?0.6:0.25;
          const limit=stratum==='simultaneous-front'?Math.min(3,targets.length):Math.min(1,targets.length);
          for(let i=0;i<limit;i++)g.bB.qg.i6(me,Math.round(ratio*1024)-1,targets[i]);
        }
        window.__study={totals,step(n){for(let i=0;i<n;i++){
          g.researchStep();control();const tick=g.bi.kr();if(due.has(tick)){label();due.delete(tick);}
          if(tick%80===0)origin();
          if(tick%500===0){const r=g.shadow.spatialState();if(!r)throw Error('Native reconciliation unavailable');
            for(let j=0;j<r.owners.length;j++)if(TIOSpatial.at(snapshot,j)!==r.owners[j])throw Error('Spatial audit mismatch at '+j+' tick '+tick+' reconstructed '+TIOSpatial.at(snapshot,j)+' native '+r.owners[j]);totals.fullAudits++;}
          if(g.shadow.fault())throw Error(g.shadow.fault());if(alive()<=1)break;
        }const chunk=records;records=[];return {records:chunk,totals:{...totals},tick:g.bi.kr(),alive:alive()};},
        finish(){label();const chunk=records;records=[];g.shadow.stop();return {records:chunk,totals:{...totals},
          tick:g.bi.kr(),alive:alive(),changedAttribution};}};
        return {matchId,baseline:{...TIOSpatial.serialize(snapshot),offsets:native.offsets},startTick:g.bi.kr(),seed:g.bV.mapSeed,
          mapId:g.bV.fF,players:g.aE.data.playerCount,dimensions:[native.width,native.height],sourceContract:g.contract};
      },{index,stratum:strata[(index-1)%8]});
      const chunks=[];let status;
      for(let t=0;t<maxTicks;t+=40){status=await page.evaluate(()=>__study.step(40));chunks.push(status.records);
        if(t%2000===1960)console.log('Study '+index+': tick '+status.tick+', alive '+status.alive+', hostile '+status.totals.hostileBatches);
        if(status.alive<=1)break;
      }
      if(status.alive>1)throw Error('Incomplete match '+index+' at '+status.tick);
      const finish=await page.evaluate(()=>__study.finish());chunks.push(finish.records);
      const recording={schema:3,index,split:index<=16?'development':'held-out',fold:index<=16?(index-1)%4:null,
        stratum:strata[(index-1)%8],sourceSha256,recordedAt:new Date().toISOString(),...initial,
        acceleratedNativeTicks:true,policyInfluence:false,complete:true,endTick:finish.tick,
        finalAlive:finish.alive,totals:finish.totals,records:chunks.flat()};
      const bytes=Buffer.from(JSON.stringify(recording)),compressed=zlib.gzipSync(bytes,{level:6});fs.writeFileSync(output,compressed);
      console.log('Recorded '+index+': '+recording.endTick+' ticks, '+bytes.length+' raw bytes, '+compressed.length+' gzip bytes');
      await page.close();
    }
    return directory;
  }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
}
if(require.main===module)record({first:Number(process.argv[2]||1),last:Number(process.argv[3]||16)})
  .catch(e=>{console.error(e);process.exitCode=1;});
module.exports={record,bootstrap,strata};
