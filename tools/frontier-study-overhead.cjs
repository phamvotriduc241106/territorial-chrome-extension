'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const{chromium}=require('playwright'),{bootstrap}=require('./frontier-study-record.cjs');
const root=path.resolve(__dirname,'..');
async function measure(){const response=await fetch('https://territorial.io/');if(!response.ok)throw Error('HTTP '+response.status);
  const html=await response.text(),hash=crypto.createHash('sha256').update(html).digest('hex');
  const server=http.createServer((q,r)=>{r.setHeader('Content-Type','text/html');r.end(html);});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
  try{browser=await chromium.launch({headless:true,executablePath:process.env.TIO_CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-precise-memory-info']});
    const context=await browser.newContext(),base='http://127.0.0.1:'+server.address().port;await context.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());
    const results=[];for(const mode of ['disabled','native-events','spatial-replay']){const page=await context.newPage();await page.addInitScript({content:bootstrap()});await page.goto(base);
      await page.waitForFunction(()=>window.__TIO_GAME__?.modern);
      await page.evaluate(mode=>{const g=__TIO_GAME__;g.aE.data.botDifficultyValue=5;g.aE.data.playerCount=64;g.aE.data.selectableSpawn=0;g.aE.data.mapSeed=240071;
        g.aE.a6i.a7A();g.aE.a6i.a77();g.aE.a6m();let snapshot=null,events=[],writes=0;
        if(mode!=='disabled'){const result=g.shadow.install(e=>{if(e.event==='native_tick')return;events.push(e);
          if(e.event==='native_spatial_delta'){snapshot=TIOSpatial.advance(snapshot,{...e,matchId:'cpu'},e.territories);writes+=e.changes.length;}
          if(events.length>16384)throw Error('Event cap');},{spatial:mode==='spatial-replay'});if(!result.ok)throw Error(result.err);
          if(mode==='spatial-replay'){const r=g.shadow.spatialBegin();snapshot=TIOSpatial.baseline(r,{matchId:'cpu',spatialVersion:0,sourceStateVersion:r.sourceStateVersion,gameTick:r.gameTick});}}
        const times=[],heap=[],serial=[];window.__overhead={chunk(){for(let i=0;i<40;i++){const begin=performance.now();g.researchStep();times.push(performance.now()-begin);
          heap.push(performance.memory.usedJSHeapSize);if(g.shadow.fault())throw Error(g.shadow.fault());}
          const t=performance.now();const exported=JSON.stringify(events);serial.push(performance.now()-t);events=[];return exported.length;},
          finish(){g.shadow.stop();times.sort((a,b)=>a-b);return {mode,ticks:times.length,meanMs:times.reduce((a,b)=>a+b,0)/times.length,
            p95Ms:times[Math.ceil(times.length*.95)-1],p99Ms:times[Math.ceil(times.length*.99)-1],peakObservedJSHeapMiB:Math.max(...heap)/1048576,
            exportMeanMs:serial.reduce((a,b)=>a+b,0)/serial.length,cellWrites:writes};}};
      },mode);
      const session=await context.newCDPSession(page);await session.send('Performance.enable');const before=await session.send('Performance.getMetrics');
      let exportBytes=0;for(let i=0;i<50;i++)exportBytes+=await page.evaluate(()=>__overhead.chunk());const after=await session.send('Performance.getMetrics');
      const r=await page.evaluate(()=>__overhead.finish()),get=(v,k)=>v.metrics.find(m=>m.name===k)?.value||0;
      results.push({...r,exportBytes,rendererTaskSeconds:get(after,'TaskDuration')-get(before,'TaskDuration')});await page.close();}
    const result={recordedAt:new Date().toISOString(),officialSourceSha256:hash,chrome:browser.version(),ticksPerMode:2000,
      conditions:'Three isolated, sequential local headless Chrome matches, same seed, 64 native Very Hard players, no human commands, accelerated ticks, no rendering frames. Includes event export every 40 ticks. Not live game CPU or power.',
      scope:'Native instrumentation and immutable ownership replay; excludes geometry forecasts, production planner and browser UI.',results,
      extraTaskFraction:results[2].rendererTaskSeconds/results[0].rendererTaskSeconds-1};
    fs.writeFileSync(path.join(root,'scratch/dynamic-frontier-research/chrome-instrumentation-overhead.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));return result;
  }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}}
if(require.main===module)measure().catch(e=>{console.error(e);process.exitCode=1;});module.exports={measure};
