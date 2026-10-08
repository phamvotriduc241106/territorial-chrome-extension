'use strict';
const fs=require('node:fs'),path=require('node:path');
const {read}=require('./frontier-study-report.cjs');
function quantiles(a){if(!a.length)return {n:0,median:null,p25:null,p75:null};a=a.slice().sort((x,y)=>x-y);
  return {n:a.length,median:a[Math.ceil(a.length*.5)-1],p25:a[Math.ceil(a.length*.25)-1],p75:a[Math.ceil(a.length*.75)-1]};}
const band=t=>t<1000?'under-1000':t<10000?'1000-9999':t<60000?'10000-59999':'60000-plus';
function estimate(matches){if(matches.some(m=>m.index>16||m.split!=='development'))throw Error('Final held-out matches may not calibrate parameters');
  const cadence={},growth={},first={},refund=[],support=[],durations=[],perMatch=[];
  for(const m of matches){const episodes=new Map(),actorBatch=new Map(),lastFront=new Map();let count=0;
    for(const e of m.records){
      if(e.event==='native_command'&&e.nativeFrontId!=null){if(e.kind==='front-admission')episodes.set(e.nativeFrontId,{id:e.nativeFrontId,actor:e.actor,target:e.target,
        launch:e.observationTick,first:null,topup:false});else if(e.kind==='front-topup'&&episodes.has(e.nativeFrontId))episodes.get(e.nativeFrontId).topup=true;}
      if(e.event==='native_reinforcement')support.push({matchId:m.matchId,requested:e.requested,delivered:e.delivered,
        bankDebit:e.actorBefore.balance-e.actorAfter.balance,debtIncrease:e.actorAfter.debt-e.actorBefore.debt});
      if(e.event==='native_batch'){
        const ep=episodes.get(e.nativeFrontId);if(ep&&ep.first==null){ep.first=e.observationTick;const key=e.target==='neutral'?'neutral':'hostile';
          (first[key]||=([])).push(e.observationTick-ep.launch);}
        const previous=actorBatch.get(e.actor);if(!previous||previous.tick!==e.observationTick){
          if(previous){const dt=e.observationTick-previous.tick;if(dt>=1&&dt<=4)(cadence[band(previous.territory)]||=([])).push(dt);}
          actorBatch.set(e.actor,{tick:e.observationTick,territory:e.before.actor.territory});}
        const last=lastFront.get(e.nativeFrontId);if(last&&last.cells>0&&e.candidateCells>0&&e.observationTick>last.tick)
          (growth[e.target==='neutral'?'neutral':'hostile']||=([])).push(e.candidateCells/last.cells);
        lastFront.set(e.nativeFrontId,{tick:e.observationTick,cells:e.candidateCells});
      }
      if(e.event==='native_termination'&&e.reason==='native-return'){
        const ep=episodes.get(e.nativeFrontId);if(ep&&ep.launch!=null&&!ep.topup){durations.push({matchId:m.matchId,fold:m.fold,
          ticks:e.observationTick-ep.launch,band:band(e.actorAfter.territory),hostile:ep.target!=='neutral'});count++;}
        if(e.refund!=null)refund.push({matchId:m.matchId,remaining:e.remainingForce,credit:e.refund,debt:e.actorAfter.debt});
      }
    }perMatch.push({matchId:m.matchId,fold:m.fold,durationLabels:count});
  }
  const folds=[0,1,2,3].map(fold=>{const training=durations.filter(d=>d.fold!==fold),validation=durations.filter(d=>d.fold===fold);
    const params=Object.fromEntries([...new Set(training.map(d=>d.band))].map(b=>[b,quantiles(training.filter(d=>d.band===b).map(d=>d.ticks)).median]));
    const errors=validation.filter(d=>params[d.band]!=null).map(d=>Math.abs(params[d.band]-d.ticks));
    return {fold,trainingMatchIds:matches.filter(m=>m.fold!==fold).map(m=>m.matchId),validationMatchIds:matches.filter(m=>m.fold===fold).map(m=>m.matchId),
      medianDurationByEmpire:params,validLabels:errors.length,mae:errors.length?errors.reduce((a,b)=>a+b,0)/errors.length:null};});
  return {schema:1,status:'development-only observational estimates; no fitted parameter is injected into any candidate',
    developmentMatches:matches.map(m=>m.matchId),sourceHashes:[...new Set(matches.map(m=>m.sourceSha256))],perMatch,
    cadence:Object.fromEntries(Object.entries(cadence).map(([k,v])=>[k,quantiles(v)])),
    firstBatchDelay:Object.fromEntries(Object.entries(first).map(([k,v])=>[k,quantiles(v)])),
    contactGrowthRatio:Object.fromEntries(Object.entries(growth).map(([k,v])=>[k,quantiles(v)])),
    reinforcement:{events:support.length,requested:quantiles(support.map(r=>r.requested)),
      deliveredFraction:quantiles(support.filter(r=>r.requested>0).map(r=>r.delivered/r.requested)),
      debtSurcharge:'Source verified: 5 * (shortage >> 2), capped at 50000; matched 252 native controlled cases.'},
    refund:{events:refund.length,positiveCredits:refund.filter(r=>r.credit>0).length,creditedFraction:quantiles(refund.filter(r=>r.remaining>0).map(r=>r.credit/r.remaining)),
      rule:'Source verified cap min(force, 150*T-bank, 1.5e9-bank), then repay debt. Unsupported non-land credits censor forecasts.'},
    etaGroupedValidation:folds,
    uncertainties:['Cadence medians exclude activation gaps and extra empire passes; not a full scheduler fit.',
      'Contact growth ratios are descriptive and not independent observations. The candidate reproduces verified cell selection and queue growth instead of fitting these ratios.',
      'ETA medians are a grouped baseline, not a fitted dynamic ETA. Dynamic ETA is simulated native return within the forecast horizon.',
      'No opponent action distribution, naval transitions, elimination/gifting or return beyond the finite horizon is calibrated.']};
}
function run(directory){const matches=fs.readdirSync(directory).filter(f=>/^match-(?:0[1-9]|1[0-6])\.json\.gz$/.test(f)).sort().map(f=>read(path.join(directory,f)));
  if(matches.length!==16)throw Error('Require all 16 development matches');const result=estimate(matches);
  const output=path.resolve(directory,'../development-estimates.json');fs.writeFileSync(output,JSON.stringify(result,null,2));console.log(output);return result;}
if(require.main===module)run(process.argv[2]||path.resolve(__dirname,'../scratch/dynamic-frontier-research/dataset-v2'));
module.exports={estimate,quantiles,run};
