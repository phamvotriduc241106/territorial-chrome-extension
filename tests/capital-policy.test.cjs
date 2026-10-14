'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {kernel}=require('../tools/cpu-benchmark.cjs');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
function environment(){const b=kernel();b.performance={now:()=>1000};vm.runInContext(read('shared/capital-policy.js'),b);return b;}
function state(B=10000){return {contract:'live-modern-v3',singlePlayer:true,ready:true,alive:true,
  balance:B,balanceKnown:true,territory:100,softCap:10000,gameTick:100,stateVersion:2,matchId:'m',
  player:0,neutralId:512,physicalNeighbors:[512,2],neighbors:[512,2],activeFronts:0,humanFrontCap:4,
  enemies:[{id:2,bal:12000,balanceKnown:true,incoming:0,incomingKnown:true,effectiveBal:12000,terr:100,
    available:true,adjacent:true,shipOnly:false}]};}
function freeze(v){if(v&&typeof v==='object'){Object.freeze(v);Object.values(v).forEach(freeze);}return v;}
test('capital caps final normalized units, preserves immutable state and exact production reserve',()=>{
  const b=environment(),s=state(),c=b.TIOCapitalPolicy;
  const plan={balance:10000,minRemaining:2000,maxSpendTotal:8000,minAttack:400,canAfford:true};
  freeze(s);freeze(plan);assert.equal(c.inspect(s,0).reserve,6000);
  const r=c.constrain(b.TIOEngineCore,s,{action:'expand'},plan,0.72,30);
  assert.equal(r.ok,true);assert.ok(r.ratio<0.72);assert.ok(r.ledger.after>=6000);
  assert.equal(r.ledger.debit,r.ledger.sent+r.ledger.tax);
});
test('unsafe contact deficit holds without tax, while no-contact state preserves feasible encoded ratio',()=>{
  const b=environment(),p={balance:10000,minRemaining:2000,maxSpendTotal:8000,minAttack:400,canAfford:true};
  const s=state();s.enemies[0].bal=s.enemies[0].effectiveBal=30000;
  let r=b.TIOCapitalPolicy.constrain(b.TIOEngineCore,s,{action:'expand'},p,0.08,10);
  assert.equal(r.ok,false);assert.equal(r.ledger.tax,0);assert.equal(r.ledger.debit,0);
  s.enemies=[];s.physicalNeighbors=[512];
  r=b.TIOCapitalPolicy.constrain(b.TIOEngineCore,s,{action:'expand'},p,0.08,10);
  assert.equal(r.sliderUnits,82);
});
test('stale, online, missing incoming, duplicate/truncated risk and unknown availability reject',()=>{
  const c=environment().TIOCapitalPolicy;
  for(const change of [s=>s.singlePlayer=false,s=>s.contract='unknown',s=>s.balanceKnown=false,
    s=>s.enemies[0].incomingKnown=false,s=>s.enemies[0].balanceKnown=false,
    s=>s.physicalNeighbors.push(3),s=>s.physicalNeighbors.push(2),
    s=>delete s.enemies[0].available,s=>s.balance=2147483648]){
    const s=state();change(s);assert.equal(c.inspect(s,0).ok,false);}
  assert.equal(c.inspect(state(),701).ok,false);assert.equal(c.inspect(state(),-1).ok,false);
});
test('early opportunity changes a real decision only before loss/incoming and excludes busy targets',()=>{
  const b=environment(),c=b.TIOCapitalPolicy,s=state(30000),d={action:'hold',reason:'hard-build-combat-bank'};
  const situation={hasAdjFree:false,shrinkFrames:0,areaTrend:0};
  assert.equal(c.selectDecision(b.TIOEngineCore,s,situation,d).action,'fight');
  for(const update of [{hasAdjFree:true},{shrinkFrames:1},{areaTrend:-1}])
    assert.equal(c.selectDecision(b.TIOEngineCore,s,{...situation,...update},d),d);
  s.enemies[0].available=false;assert.equal(c.selectDecision(b.TIOEngineCore,s,situation,d),d);
});
function orchestrator(){const b=environment();
  for(const n of ['CoordSystem','VisionEngine','OccupancyGrid','RegionDetector','BorderDetector','EnemyTracker',
    'EconomyAnalyzer','HeatmapEngine','HUDEngine','MouseController'])b[n]=function(){};
  vm.runInContext(read('content/content.js').replace('window.TerritorialEngineV5 = new TerritorialMasterOrchestrator();','')
    .replace('window.TerritorialEngineV5.init();',''),b);
  const a=new b.TerritorialMasterOrchestrator(),commands=[];
  a.hud.updateDashboard=()=>{};a.matchStartTime=0;
  a.internal={lastState:state(),lastStateAt:1000,isBusy:()=>false,
    attack(p){commands.push(p);return Promise.resolve({ok:true});},
    setExperimentalPolicy:async mode=>({ok:true,state:state(),mode})};
  return {b,a,commands};
}
test('actual orchestrator sends capped candidate metadata, respects controls and leaves baseline untagged',async()=>{
  const off=orchestrator();off.a.executeInternalPipeline(1000);assert.ok(off.commands.length===1);
  assert.equal(off.commands[0].experimental,undefined);assert.equal(off.a.experimentalPolicy,'off');
  const on=orchestrator();await on.a.setExperimentalPolicy('capital-v1');on.a.executeInternalPipeline(1000);
  // Native baseline neutral ratio is already small, but every treatment command is tagged and revalidated.
  assert.equal(on.commands.length,1);const p=on.commands[0];assert.equal(p.experimental.mode,'capital-v1');
  assert.ok(p.minRemaining>=6000);assert.ok(p.experimental.maxDebit>0);
  assert.ok(on.a.lastExperimental.approvedPlan.maxSpendTotal<=10000-p.minRemaining,
    'reported final budget must shrink with the stronger reserve');
  for(const kind of ['manual','pointer','off','stale','match','incomplete']){
    const {a,commands}=orchestrator();await a.setExperimentalPolicy('capital-v1');
    if(kind==='manual')a.settings.sliderPercentage=20;if(kind==='pointer')a.controller.userPointerDown=true;
    if(kind==='off')a.settings.botEnabled=false;if(kind==='stale')a.internal.lastStateAt=0;
    if(kind==='match')a.internal.lastState.matchId='new';if(kind==='incomplete')a.internal.lastState.physicalNeighbors.push(9);
    a.executeInternalPipeline(1000);assert.equal(commands.length,0,kind);
  }
});
test('candidate never enters vision fallback and switching off removes experimental tags',async()=>{
  const {a,commands}=orchestrator();await a.setExperimentalPolicy('capital-v1');
  a.vision.processFrame=()=>{throw Error('forbidden fallback');};a.executePipeline(1000,0.1);
  await a.setExperimentalPolicy('off');a.executeInternalPipeline(1000);
  assert.equal(commands[0].experimental,undefined);
});
test('4000 seeded final caps cannot exceed original debit, reserves or meaningful-force floor',()=>{
  const b=environment(),c=b.TIOCapitalPolicy;let seed=84111,accepted=0;
  const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  for(let i=0;i<4000;i++){
    const B=1000+Math.floor(random()*1000000),s=state(B),e=s.enemies[0];e.bal=e.effectiveBal=Math.floor(random()*B*2);
    const p={balance:B,minRemaining:Math.floor(B*.22),maxSpendTotal:B-Math.floor(B*.22),minAttack:Math.floor(B*.04),canAfford:true};
    const ratio=.06+random()*.60,r=c.constrain(b.TIOEngineCore,s,{action:'expand'},p,ratio,20);
    if(!r.ok){assert.equal(r.ledger.debit,0);continue;}accepted++;
    const original=b.TIOEngineCore.humanAttackDebit(B,Math.floor(B*Math.round(ratio*1024)/1024));
    assert.ok(r.ledger.debit<=original.debit);assert.ok(r.ledger.debit<=p.maxSpendTotal);
    assert.ok(r.ledger.after>=r.requiredReserve);assert.ok(r.ledger.sent>=p.minAttack);
    assert.equal(r.ledger.before-r.ledger.debit,r.ledger.after);
  }
  assert.ok(accepted>500);
});
test('frozen live pilot preserves all four losses and proves 48 real candidate admissions without budget violations',()=>{
  const zlib=require('node:zlib'),crypto=require('node:crypto');
  const m=require('../docs/live-audits/2026-10-14-capital-pilot-evidence.json');
  const plan=require('../docs/live-audits/2026-10-14-capital-pilot-plan.json');
  const {createAnalysis}=require('../research/planner-shadow-analysis.cjs');
  assert.equal(m.attempts,4);assert.equal(m.independentMatches,4);assert.equal(m.candidateTreatmentMatches,2);
  assert.equal(m.policyPromotionAllowed,false);let treatment=0,baseline=0,total=0;
  for(const [i,run] of m.runs.entries()){
    const bytes=fs.readFileSync(path.join(__dirname,'../docs/live-audits',run.artifact.file));
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),run.artifact.sha256);
    const b=JSON.parse(zlib.gunzipSync(bytes)),candidate=plan.schedule[i].policy==='capital-v1';
    assert.equal(b.report.outcome,'loss');assert.equal(b.report.assignedPolicy,plan.schedule[i].policy);
    assert.equal(b.report.release.releaseSha256,plan.release.releaseSha256);
    assert.equal(b.report.sourceSha256,plan.expectedSourceSha256);assert.equal(b.report.mapLabel,plan.schedule[i].mapLabel);
    assert.equal(b.report.shadow.candidateActive,candidate);
    assert.equal(b.report.shadow.plannerObserver.dropped,0);assert.equal(b.report.shadow.nativeObserver.dropped,0);
    const admissions=b.native.filter(e=>e.kind==='native-command');
    for(const n of admissions){assert.equal(n.observedDebit,kernel().TIOEngineCore.humanAttackDebit(n.before,
      Math.floor(n.before*(n.il+1)/1024)).debit);total++;}
    for(const e of b.planner.filter(e=>e.kind==='receipt'&&e.result?.ok)){
      if(candidate){const x=e.result.experimental;assert.equal(x.mode,'capital-v1');
        assert.ok(e.result.balance>=x.requiredReserve);assert.ok(x.observedDebit<=x.maxDebit);treatment++;}
      else {assert.equal(e.result.experimental,undefined);baseline++;}
    }
    const replay=createAnalysis(environment().TIOEngineCore,b.report.sourceSha256,{keepAllLookups:true,maxLookupEntries:250000});
    replay.nativeBatch(b.native,b.report.shadow.nativeObserver);replay.plannerBatch(b.planner);
    for(const key of ['decisions','supported','unsupported','joinedCommands'])
      assert.equal(replay.summary()[key],b.report.shadow[key]);
    // The old shadow's budget-summary rejection is retained, not repaired in frozen observations.
    if(candidate)assert.ok(b.report.shadow.unsupported>0);
  }
  assert.equal(treatment,48);assert.equal(baseline,52);assert.equal(total,100);
  const smoke=require('../docs/live-audits/2026-10-14-capital-final-smoke.json').runs[0];
  const smokeBytes=fs.readFileSync(path.join(__dirname,'../docs/live-audits',smoke.artifact.file));
  assert.equal(crypto.createHash('sha256').update(smokeBytes).digest('hex'),smoke.artifact.sha256);
  const b=JSON.parse(zlib.gunzipSync(smokeBytes));
  assert.equal(b.report.outcome,'censored-time-limit');assert.equal(b.report.treatment.validatedReceipts,8);
  assert.equal(b.report.treatment.reserveViolations,0);assert.equal(b.report.treatment.debitCeilingViolations,0);
  const a=createAnalysis(environment().TIOEngineCore,b.report.sourceSha256,{keepAllLookups:true,maxLookupEntries:250000});
  a.nativeBatch(b.native,b.report.shadow.nativeObserver);a.plannerBatch(b.planner);
  assert.equal(b.report.shadow.supported,59);assert.equal(b.report.shadow.unsupported,69);
  assert.equal(a.summary().supported,128);assert.equal(a.summary().unsupported,0);
  const analysis=require('../docs/live-audits/2026-10-14-capital-final-smoke-analysis.json');
  assert.deepEqual(a.summary(),analysis.correctedSummary);
});
