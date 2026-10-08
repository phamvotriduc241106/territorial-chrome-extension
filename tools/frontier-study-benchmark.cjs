'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const{chromium}=require('playwright');
const{read,environment}=require('./frontier-study-report.cjs');
const root=path.resolve(__dirname,'..');
function fixtures(directory){const b=environment(),fixtures=[];
  for(const index of [1,2,5,8,9,10,13,16]){const d=read(path.join(directory,'match-'+String(index).padStart(2,'0')+'.json.gz'));
    const origins=d.records.filter(r=>r.event==='research_origin'),chosen=origins[Math.floor(origins.length/2)];let s=b.TIOSpatial.restore(d.baseline);
    for(const e of d.records){if(e.recordId===chosen.recordId)break;if(e.event==='native_spatial_delta')s=b.TIOSpatial.advance(s,e,e.territories);}
    fixtures.push({origin:{...chosen,freeLandCells:b.TIOSpatial.counts(s)[s.neutralId]},baseline:b.TIOSpatial.serialize(s)});
  }return fixtures;}
async function benchmark(directory){const input=fixtures(directory),browser=await chromium.launch({headless:true,
  executablePath:process.env.TIO_CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-precise-memory-info']});
  try{const results={};for(const model of ['aggregate','static','dynamic']){const page=await browser.newPage();
    await page.addScriptTag({content:['shared/config.js','content/engine-core-v2-advanced.js','content/frontier-model.js',
      'content/frontier-episodes.js','content/frontier-spatial.js','content/frontier-dynamic.js'].map(f=>fs.readFileSync(path.join(root,f),'utf8')).join('\n')});
    const session=await page.context().newCDPSession(page);await session.send('Performance.enable');
    const before=await session.send('Performance.getMetrics');
    const result=await page.evaluate(({fixtures,model})=>{
      const extractionTimes=[];
      const prepared=fixtures.map(f=>{const s=TIOSpatial.restore(f.baseline),o=f.origin,begin=performance.now(),pairs=TIOSpatial.contacts(s);
        extractionTimes.push(performance.now()-begin);
        const actors=[...new Set(o.fronts.filter(f=>o.forecastFrontIds.includes(f.nativeFrontId)).map(f=>f.actor))];
        const states=actors.map(actor=>{const me=o.players[actor],others=o.players.map((p,id)=>({...p,id,bal:p.balance,terr:p.territory,available:true,adjacent:true,
          incoming:o.fronts.filter(f=>f.actor===id&&f.target===actor).reduce((n,f)=>n+f.troops,0)})).filter(p=>p.id!==actor&&p.alive&&p.terr>0);
          return {matchId:o.matchId,stateVersion:o.sourceStateVersion,player:actor,tick:o.gameTick,balance:me.balance,territory:me.territory,
            debt:me.debt,economy:me.economy,adjEnemies:others,playersRemaining:o.players.filter(p=>p.alive).length,
            freeLandCells:o.freeLandCells,hasAdjFree:pairs.some(p=>(p.a===actor&&p.b===s.neutralId)||(p.b===actor&&p.a===s.neutralId)),
            outgoingAttacks:o.fronts.filter(f=>f.actor===actor).map(f=>({targetId:f.target,troops:f.troops})),
            frontierCellCost:o.constants.cellCost,shadowTrackEffects:true,frontierExperiment:model==='static',
            frontierSnapshot:{meta:{matchId:o.matchId,stateVersion:o.sourceStateVersion,gameTick:o.gameTick,confidence:1,player:actor,neutralId:s.neutralId},pairs}};
        });return {s,o,states};});
      function cycle(f){if(model==='dynamic')return TIODynamicFrontier.simulate(f.o,f.s,20);
        return f.states.map(s=>TIOEngineCoreV2.transitionPlanningState(s,{type:'hold'},20));}
      for(let i=0;i<80;i++){const f=prepared[i%prepared.length],at=performance.now();TIOSpatial.contacts(f.s);extractionTimes.push(performance.now()-at);}
      extractionTimes.sort((a,b)=>a-b);
      for(let i=0;i<80;i++)cycle(prepared[i%prepared.length]);
      const times=[],totalForecasts=prepared.reduce((n,f)=>n+f.o.forecastFrontIds.length,0),start=performance.now();let peak=0;
      for(let i=0;i<800;i++){const at=performance.now(),r=cycle(prepared[i%prepared.length]);times.push(performance.now()-at);
        if(!r)throw Error('Missing model result');peak=Math.max(peak,performance.memory.usedJSHeapSize);}
      const elapsed=performance.now()-start;times.sort((a,b)=>a-b);
      return {cycles:800,horizon:20,forecastEpisodesPerCycle:totalForecasts/prepared.length,meanMs:times.reduce((a,b)=>a+b,0)/times.length,
        p95Ms:times[Math.ceil(times.length*.95)-1],p99Ms:times[Math.ceil(times.length*.99)-1],
        forecastEpisodesPerSecond:1000*800*(totalForecasts/prepared.length)/elapsed,
        peakObservedJSHeapMiB:peak/1048576,elapsedMs:elapsed,
        contactExtraction:{calls:extractionTimes.length,meanMs:extractionTimes.reduce((a,b)=>a+b,0)/extractionTimes.length,
          p95Ms:extractionTimes[Math.ceil(extractionTimes.length*.95)-1],p99Ms:extractionTimes[Math.ceil(extractionTimes.length*.99)-1]}};
    },{fixtures:input,model});
    const after=await session.send('Performance.getMetrics'),metric=(r,k)=>r.metrics.find(m=>m.name===k)?.value||0;
    results[model]={...result,rendererTaskSeconds:metric(after,'TaskDuration')-metric(before,'TaskDuration'),
      rendererScriptSeconds:metric(after,'ScriptDuration')-metric(before,'ScriptDuration')};
    await page.close();console.log(model,results[model]);}
    const r={recordedAt:new Date().toISOString(),cpu:os.cpus()[0].model,architecture:process.arch,logicalCpus:os.cpus().length,
      chrome:browser.version(),source:'local headless system Chrome, isolated profiles, development fixtures only',
      memoryMeasurement:'Maximum per-call precise Chrome usedJSHeapSize; JS heap only, not whole-browser/native RSS.',
      cpuMeasurement:'CDP renderer TaskDuration/ScriptDuration for fixture setup, warmup and evaluation; accelerated microbenchmark, not live gameplay CPU or power.',
      cycleDefinition:'One 20-tick global dynamic simulation vs aggregate/static transitions for every actor with a forecasted hostile front; all produce the same forecast episode set.',
      geometryCost:'Initial ownership replay/contact extraction is prepared once per origin and excluded from these rollout latencies; report extraction separately.',results};
    fs.writeFileSync(path.resolve(directory,'../chrome-m4-benchmark.json'),JSON.stringify(r,null,2));return r;
  }finally{await browser.close();}}
if(require.main===module)benchmark(process.argv[2]||path.join(root,'scratch/dynamic-frontier-research/dataset-v2'))
  .catch(e=>{console.error(e);process.exitCode=1;});
module.exports={benchmark,fixtures};
