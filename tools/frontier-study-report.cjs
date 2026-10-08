'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),zlib=require('node:zlib'),crypto=require('node:crypto');
const {performance}=require('node:perf_hooks');
const {metrics}=require('./frontier-report.cjs');
const root=path.resolve(__dirname,'..'),models=['aggregate','static','dynamic'],fields=['territory','captured','balance','eta'];
function environment(){const b=vm.createContext({performance,console});for(const f of ['shared/config.js','content/engine-core-v2-advanced.js',
  'content/frontier-model.js','content/frontier-episodes.js','content/frontier-spatial.js','content/frontier-dynamic.js'])
  vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),b);return b;}
function dependencies(fronts,actor){const set=new Set([actor]);let changed=true;while(changed){changed=false;
  for(const f of fronts)if(f.target!=='neutral'&&(set.has(f.actor)||set.has(f.target))){
    for(const p of [f.actor,f.target])if(!set.has(p)){set.add(p);changed=true;}}}return set;}
function planning(origin,actor,pairs){const me=origin.players[actor],n=origin.players.length;
  const others=origin.players.map((p,id)=>({...p,id,bal:p.balance,terr:p.territory,adjacent:true,available:true,
    incoming:origin.fronts.filter(f=>f.actor===id&&f.target===actor).reduce((s,f)=>s+f.troops,0)})).filter(e=>e.id!==actor&&e.alive&&e.terr>0);
  const snapshot={meta:{matchId:origin.matchId,stateVersion:origin.sourceStateVersion,geometryVersion:origin.spatialVersion,
    gameTick:origin.gameTick,player:actor,confidence:1,neutralId:n},pairs:pairs.filter(p=>p.a===actor||p.b===actor)};
  return {matchId:origin.matchId,stateVersion:origin.sourceStateVersion,player:actor,tick:origin.gameTick,
    balance:me.balance,territory:me.territory,debt:me.debt,economy:me.economy,adjEnemies:others,
    outgoingAttacks:origin.fronts.filter(f=>f.actor===actor).map(f=>({targetId:f.target,troops:f.troops,reinforced:f.reinforced})),
    freeLandCells:origin.freeLandCells,hasAdjFree:snapshot.pairs.some(p=>p.a===n||p.b===n),playersRemaining:origin.players.filter(p=>p.alive).length,
    frontierSnapshot:snapshot,frontierCellCost:origin.constants.cellCost,shadowTrackEffects:true};}
function tags(origin,front,pairs){const actor=origin.players[front.actor],target=origin.players[front.target];
  const pair=pairs.find(p=>(p.a===front.actor&&p.b===front.target)||(p.b===front.actor&&p.a===front.target));
  const contact=pair?(pair.a===front.target?pair.contactA:pair.contactB):0;
  return ['hostile',front.reinforced?'reinforced-flag':'non-reinforced-flag',
    target.balance+front.counterforce>actor.balance+front.troops?'stronger-target':'weaker-target',
    actor.territory<1000?'small-empire':actor.territory<10000?'medium-empire':'large-empire',
    contact<=8?'narrow-contact':contact>=32?'wide-contact':'intermediate-contact',
    ...(origin.fronts.some(f=>f.actor===front.target&&f.target===front.actor)?['mutual']:[]),
    ...(origin.fronts.filter(f=>f.actor===front.actor).length>=2?['simultaneous-front']:[])];}
function evaluate(recording,options={}){
  if(recording.schema!==3||!recording.complete||recording.policyInfluence!==false||recording.finalAlive>1||recording.startTick!==0)
    throw Error('Incomplete or unsupported match');
  const box=environment(),sp=box.TIOSpatial,core=box.TIOEngineCoreV2;
  const nativeOffsets=recording.baseline.offsets||recording.records.find(e=>e.event==='research_origin')?.offsets;
  if(!Array.isArray(nativeOffsets)||nativeOffsets.length!==4)throw Error('Missing native neighbor-offset provenance');
  let snapshot=sp.restore(recording.baseline),previousSnapshot=snapshot,pending=[],lastId=0;const episodes=new Map(),rows=[],timings={geometry:[],aggregate:[],static:[],dynamic:[]};
  const counters={origins:0,forecasts:0,reconciledDeltas:0,cellWrites:0,commands:0,sourceFaults:0,nativeContactChecks:0};
  function episode(id){if(!episodes.has(id))episodes.set(id,{id,actor:null,target:null,launchTick:null,captured:0,
    reinforcementCount:0,refundCount:0,terminationTick:null,reason:null,commands:[]});return episodes.get(id);}
  function forecast(origin){
    if(origin.spatialVersion!==snapshot.spatialVersion)throw Error('Origin spatial version mismatch');
    const begin=performance.now(),pairs=sp.contacts(snapshot);timings.geometry.push(performance.now()-begin);
    origin={...origin,freeLandCells:sp.counts(snapshot)[snapshot.neutralId]};
    const dynamic=new Map(),baselines=new Map();
    for(const h of origin.horizons){const start=performance.now();try{dynamic.set(h,{result:box.TIODynamicFrontier.simulate(origin,snapshot,h)});}
      catch(error){dynamic.set(h,{error:String(error.message)});}timings.dynamic.push(performance.now()-start);}
    for(const actor of new Set(origin.fronts.filter(f=>origin.forecastFrontIds.includes(f.nativeFrontId)).map(f=>f.actor))){
      const base=planning(origin,actor,pairs);
      for(const h of origin.horizons){const result={};for(const model of ['aggregate','static']){
        const start=performance.now();try{result[model]=core.transitionPlanningState({...base,frontierExperiment:model==='static'},{type:'hold'},h);}
        catch(error){result[model]={error:String(error.message)};}timings[model].push(performance.now()-start);}
        baselines.set(actor+':'+h,result);}
    }
    for(const id of origin.forecastFrontIds){const f=origin.fronts.find(f=>f.nativeFrontId===id);if(!f||f.target==='neutral')throw Error('Invalid forecast front');
      const ep=episode(id),deps=dependencies(origin.fronts,f.actor),category=tags(origin,f,pairs);
      for(const h of origin.horizons){const p={matchId:origin.matchId,split:recording.split,frontId:id,episodeId:origin.matchId+':'+id,
        actor:f.actor,target:f.target,gameTick:origin.gameTick,dueTick:origin.gameTick+h,horizon:h,originRecordId:origin.recordId,
        sourceStateVersion:origin.sourceStateVersion,spatialVersion:origin.spatialVersion,capturedAtOrigin:ep.captured,
        reinforcementAtOrigin:ep.reinforcementCount,refundAtOrigin:ep.refundCount,tags:category.slice(),
        dependencyActors:[...deps],predictions:{},errors:{},interveningCommands:[],invalid:null};
        for(const model of ['aggregate','static']){const r=baselines.get(f.actor+':'+h)[model];
          if(r.error)p.errors[model]=r.error;else{const effect=r.shadowEffects[f.actor+':'+f.target]||{};
            p.predictions[model]={balance:r.balance,territory:r.territory,captured:effect.captured||0,
              eta:effect.terminationTick==null?null:effect.terminationTick-origin.gameTick};}}
        const d=dynamic.get(h);if(d.error)p.errors.dynamic=d.error;else{const df=d.result.fronts.find(x=>x.nativeFrontId===id),actor=d.result.players[f.actor];
          p.predictions.dynamic={balance:actor.balance,territory:actor.territory,captured:df.captured,
            eta:df.terminationTick==null?null:df.terminationTick-origin.gameTick};}
        pending.push(p);counters.forecasts++;
      }
    }counters.origins++;
  }
  function score(label){const remaining=[];for(const p of pending){if(p.dueTick>label.gameTick){remaining.push(p);continue;}
    if(p.dueTick!==label.gameTick)p.invalid=p.invalid||'missed-exact-label';
    const ep=episode(p.frontId);p.actual={territory:label.territories[p.actor],balance:label.balances[p.actor],captured:ep.captured-p.capturedAtOrigin,
      eta:ep.reason==='native-return'&&ep.terminationTick>=p.gameTick&&ep.terminationTick<=p.dueTick?ep.terminationTick-p.gameTick:null};
    p.observationTick=label.gameTick;p.observedSourceStateVersion=label.sourceStateVersion;
    p.tags.push(ep.reinforcementCount>p.reinforcementAtOrigin?'support-during-interval':'no-support-during-interval');
    if(ep.refundCount>p.refundAtOrigin)p.tags.push('refund-during-interval');
    p.censored=!!p.invalid;p.commonSupport=!p.censored&&models.every(m=>p.predictions[m]);rows.push(p);
  }pending=remaining;}
  for(const e of recording.records){if(e.recordId!==lastId+1)throw Error('Missing/duplicate event record');lastId=e.recordId;
    if(e.event==='native_spatial_delta'){
      previousSnapshot=snapshot;snapshot=sp.advance(snapshot,e,e.territories);counters.reconciledDeltas++;counters.cellWrites+=e.changes.length;
      if(e.cause!=='combat')for(const p of pending)if(e.changes.some(([,from,to])=>p.dependencyActors.includes(from)||p.dependencyActors.includes(to)))p.invalid=p.invalid||'unmodeled-spatial-action';
    }
    const ep=e.nativeFrontId!=null?episode(e.nativeFrontId):null;
    if(ep){if(typeof e.actor==='number')ep.actor=e.actor;if(e.target!=null)ep.target=e.target;}
    if(e.event==='native_command'){
      counters.commands++;if(ep){ep.commands.push(e.recordId);if(e.kind==='front-admission')ep.launchTick=e.observationTick;}
      for(const p of pending){p.interveningCommands.push(e.recordId);if(p.interveningCommands.length>256)throw Error('Command ledger cap');
        if(p.dependencyActors.includes(e.actor)||p.dependencyActors.includes(e.target))p.invalid=p.invalid||'future-action-disturbance';}
    }
    if(e.event==='native_reinforcement'&&ep)ep.reinforcementCount++;
    if(e.event==='native_external_credit')for(const p of pending)if(p.dependencyActors.includes(e.actor))p.invalid=p.invalid||'unmodeled-external-credit';
    if(e.event==='native_batch'&&ep){ep.captured+=e.territoryDelta;
      if(e.selectedFrontier){const before=e.changedCells.length?previousSnapshot:snapshot;
        const selected=box.TIODynamicFrontier.candidates(i=>sp.at(before,i),e.selectedFrontier,nativeOffsets,
          e.target==='neutral'?before.neutralId:e.target,before.cells);
        // Native fb ordering must be carried by the baseline, not guessed.
        if(JSON.stringify(selected)!==JSON.stringify(e.candidateIndices))throw Error('Recorded native contact selection mismatch');
        counters.nativeContactChecks++;}
    }
    if(e.event==='native_termination'&&ep){ep.terminationTick=e.observationTick;ep.reason=e.reason;if(e.refund>0)ep.refundCount++;
      if(e.reason!=='native-return')for(const p of pending)if(p.dependencyActors.includes(e.actor))p.invalid=p.invalid||'unsupported-native-termination';}
    if(e.event==='research_origin')forecast(e);
    if(e.event==='research_label')score(e);
  }
  for(const p of pending){p.invalid=p.invalid||'match-ended-before-horizon';p.censored=true;p.commonSupport=false;rows.push(p);}
  return {matchId:recording.matchId,index:recording.index,split:recording.split,fold:recording.fold,stratum:recording.stratum,
    sourceSha256:recording.sourceSha256,seed:recording.seed,startTick:recording.startTick,endTick:recording.endTick,
    totals:recording.totals,counters,rows,episodes:[...episodes.values()],timings};
}
function summarizeRows(rows){const result={forecasts:rows.length,censored:rows.filter(r=>r.censored).length,
  censoringRate:rows.length?rows.filter(r=>r.censored).length/rows.length:null,commonSupport:rows.filter(r=>r.commonSupport).length,
  models:{},reasons:{}};
  for(const r of rows)if(r.invalid)result.reasons[r.invalid]=(result.reasons[r.invalid]||0)+1;
  for(const m of models){const valid=rows.filter(r=>!r.censored&&r.predictions[m]);
    result.models[m]={predictionCoverage:rows.length?rows.filter(r=>r.predictions[m]).length/rows.length:null,
      validCoverage:rows.length?valid.length/rows.length:null,unsupported:rows.filter(r=>!r.predictions[m]).length,
      errors:{},allValid:{},commonSupport:{},etaActualLabels:valid.filter(r=>r.actual?.eta!=null).length,
      etaPredictionsForValidLabels:valid.filter(r=>r.actual?.eta!=null&&r.predictions[m].eta!=null).length};
    for(const r of rows)if(r.errors?.[m]){const e=r.errors[m];result.models[m].errors[e]=(result.models[m].errors[e]||0)+1;}
    for(const f of fields){result.models[m].allValid[f]=metrics(valid.filter(r=>r.actual?.[f]!=null&&r.predictions[m][f]!=null).map(r=>r.predictions[m][f]-r.actual[f]));
      result.models[m].commonSupport[f]=metrics(rows.filter(r=>r.commonSupport&&r.actual?.[f]!=null&&
        (f!=='eta'||models.every(model=>r.predictions[model].eta!=null))).map(r=>r.predictions[m][f]-r.actual[f]));}
  }return result;}
function clustered(matches,category=null){const selected=matches.map(m=>({id:m.matchId,rows:m.rows.filter(r=>r.commonSupport&&(!category||r.tags.includes(category)))})).filter(m=>m.rows.length);
  const diffs=selected.map(m=>{const a=metrics(m.rows.map(r=>r.predictions.static.territory-r.actual.territory)).mae;
    const d=metrics(m.rows.map(r=>r.predictions.dynamic.territory-r.actual.territory)).mae;return d-a;});
  if(diffs.length<2)return {independentMatches:diffs.length,meanDynamicMinusStaticMAE:null,ci95:null};
  let seed=90210;const samples=[];for(let i=0;i<2000;i++){let total=0;for(let j=0;j<diffs.length;j++){
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;total+=diffs[Math.floor(seed/4294967296*diffs.length)];}samples.push(total/diffs.length);}samples.sort((a,b)=>a-b);
  return {independentMatches:diffs.length,resamples:2000,unit:'complete match',meanDynamicMinusStaticMAE:diffs.reduce((a,b)=>a+b,0)/diffs.length,
    ci95:[samples[49],samples[1949]],matchesImproved:diffs.filter(x=>x<0).length};}
function report(matches){const all=matches.flatMap(m=>m.rows),dev=matches.filter(m=>m.split==='development'),held=matches.filter(m=>m.split==='held-out');
  const byCategory={};for(const tag of new Set(all.flatMap(r=>r.tags)))byCategory[tag]={all:summarizeRows(all.filter(r=>r.tags.includes(tag))),
    heldOut:summarizeRows(held.flatMap(m=>m.rows.filter(r=>r.tags.includes(tag)))),uncertainty:clustered(held,tag)};
  return {schema:3,createdAt:new Date().toISOString(),sourceHashes:[...new Set(matches.map(m=>m.sourceSha256))],
    completeMatches:matches.length,developmentMatches:dev.length,heldOutMatches:held.length,policyInfluence:false,policyPromotionAllowed:false,
    productionFingerprint:'d49794e32d3cc195e357b4edc5d14f0731b24a408c25ab03633a019cf015b0c6',
    conditioning:'Observed current fronts and queues; subsequent commands touching the initial hostile-front dependency component censor all models. Unrelated commands retained in the complete ledger.',
    limitation:'Controlled accelerated native Very Hard games, not online win-rate evidence. Baseline transition functions unchanged. ETA metrics require observed native return and finite predicted return; missing ETA is separately counted.',
    all:summarizeRows(all),development:summarizeRows(dev.flatMap(m=>m.rows)),heldOut:summarizeRows(held.flatMap(m=>m.rows)),
    groupedCrossValidation:[0,1,2,3].map(fold=>({fold,validationMatchIds:dev.filter(m=>m.fold===fold).map(m=>m.matchId),
      metrics:summarizeRows(dev.filter(m=>m.fold===fold).flatMap(m=>m.rows)),tunedParameters:0})),
    heldOutUncertainty:clustered(held),byCategory,
    byMatch:matches.map(m=>({...m,rows:undefined,episodes:undefined,timings:undefined,metrics:summarizeRows(m.rows)})),
    byHorizon:Object.fromEntries([2,5,10,20].map(h=>[h,{all:summarizeRows(all.filter(r=>r.horizon===h)),
      heldOut:summarizeRows(held.flatMap(m=>m.rows.filter(r=>r.horizon===h)))}])),
    byEpisode:matches.flatMap(m=>m.episodes.filter(e=>e.target!==null&&e.target!=='neutral').map(e=>({
      matchId:m.matchId,episodeId:m.matchId+':'+e.id,actor:e.actor,target:e.target,launchTick:e.launchTick,
      terminationTick:e.terminationTick,outcome:e.reason,captured:e.captured,reinforcementCount:e.reinforcementCount,
      refunds:e.refundCount,commandIds:e.commands,conquest:'not-inferred',metrics:summarizeRows(m.rows.filter(r=>r.frontId===e.id))}))),
    episodeCoverage:matches.map(m=>({matchId:m.matchId,observed:m.episodes.length,forecasted:new Set(m.rows.map(r=>r.frontId)).size,
      hostileObserved:m.episodes.filter(e=>e.target!==null&&e.target!=='neutral').length,
      nativeReturn:m.episodes.filter(e=>e.reason==='native-return').length,reinforcedObserved:m.episodes.filter(e=>e.reinforcementCount>0).length,
      refundObserved:m.episodes.filter(e=>e.refundCount>0).length})),
    recommendation:'Another model-validation phase is required; do not promote a shadow model without coverage-aware contested-combat and browser runtime acceptance.'};}
function read(file){return JSON.parse(zlib.gunzipSync(fs.readFileSync(file),{maxOutputLength:256*1024*1024}));}
async function run(directory,split='development'){
  if(!['development','held-out','all'].includes(split))throw Error('Unknown split');
  const output=path.join(root,'scratch/dynamic-frontier-research/results');fs.mkdirSync(output,{recursive:true});const matches=[];
  for(const file of fs.readdirSync(directory).filter(f=>/^match-\d\d\.json\.gz$/.test(f)).sort()){
    const d=read(path.join(directory,file));if(split!=='all'&&d.split!==split)continue;
    const cached=path.join(output,d.matchId+'.json.gz');let result;
    const implementationHash=crypto.createHash('sha256').update(['content/frontier-dynamic.js','content/frontier-spatial.js','tools/frontier-study-report.cjs'].map(f=>fs.readFileSync(path.join(root,f),'utf8')).join('\n')).digest('hex');
    if(fs.existsSync(cached)){result=read(cached);if(result.implementationHash!==implementationHash)throw Error('Refuse stale evaluation cache '+cached);}
    else{const started=performance.now();result=evaluate(d);result.implementationHash=implementationHash;
      fs.writeFileSync(cached,zlib.gzipSync(Buffer.from(JSON.stringify(result))));console.log(d.matchId+': '+result.rows.length+' forecasts in '+Math.round(performance.now()-started)+' ms');}
    matches.push(result);
  }
  const r=report(matches);fs.writeFileSync(path.join(output,split+'-report.json'),JSON.stringify(r,null,2));
  console.log(JSON.stringify({completeMatches:r.completeMatches,heldOut:r.heldOutUncertainty,metrics:r[split==='held-out'?'heldOut':'development']},null,2));return r;
}
if(require.main===module)run(process.argv[2]||path.join(root,'scratch/dynamic-frontier-research/dataset-v2'),process.argv[3]||'development')
  .catch(e=>{console.error(e);process.exitCode=1;});
module.exports={environment,dependencies,planning,tags,evaluate,summarizeRows,clustered,report,read,run};
