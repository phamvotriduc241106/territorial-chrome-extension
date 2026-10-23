'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createBuffer,installPlannerObserver,installNativeObserver}=require('../research/planner-observer.cjs');
const {kernel,states}=require('../tools/cpu-benchmark.cjs');
const {createAnalysis}=require('../research/planner-shadow-analysis.cjs');
test('recording on preserves all 80 frozen outputs and one underlying call per evaluation',()=>{
  const box=kernel();box.performance={now:()=>0};const core=box.TIOEngineCore,raw=box.TIOEngineAdapter.getActive();
  const agent={internal:{lastState:null,lastStateAt:0,attack:()=>Promise.resolve({ok:true})},settings:{},
    executeInternalPipelineImpl(s){const d=core.decide(s),p=core.planSpend(s);
      this._decision=d;this.lastCommitMeta={ratio:p.ratio,canAfford:p.canAfford,maxSpend:p.maxSpendTotal};
      return {decision:d,spend:p};}};
  const original=raw.decide;
  const observer=installPlannerObserver(agent,raw,{now:()=>0,sourceHash:'a'.repeat(64)});
  const results=states().map((s,i)=>{agent.internal.lastState={balance:s.balance,territory:s.territory,
    gameTick:s.tick,matchId:'fixture',stateVersion:i+1};return agent.executeInternalPipelineImpl(s);});
  assert.equal(crypto.createHash('sha256').update(JSON.stringify(results)).digest('hex'),
    'd49794e32d3cc195e357b4edc5d14f0731b24a408c25ab03633a019cf015b0c6');
  assert.equal(box.TIOEngineAdapter.telemetry.methodCalls.decide,80);
  assert.equal(box.TIOEngineAdapter.telemetry.methodCalls.planSpend,80);
  const events=observer.drain();assert.equal(events.length,80);assert.ok(events[0].rawPlan.minAttack>0);
  assert.equal(events[0].situation.balance,states()[0].balance);
  assert.ok(observer.stats().retainedBytes===0);
  observer.stop();assert.equal(raw.decide,original);
});
test('bounded export is independent, tags unknown values and makes overflow visible',()=>{
  const q=createBuffer({maxEvents:1,maxBytes:256});const input={n:1,x:undefined,y:NaN};q.push(input);input.n=99;
  q.push({n:2});assert.equal(q.stats().dropped,1);const [r]=q.drain();assert.equal(r.n,1);
  assert.equal(r.x.$tioType,'undefined');assert.equal(r.y.$tioType,'NaN');assert.equal(q.stats().retainedBytes,0);
});
test('native wrappers preserve void return, exceptions, exact debit and restoration',()=>{
  let B=1000,calls=0;const ae={hc(p){if(p===2)throw Error('source-fault');return 0;}},
    bB={hz:{i6(){calls++;B-=108;}}};
  const game={contract:'live-modern-v3',ae,bB,get modern(){return {
    me:()=>0,gameTick:()=>8,balance:()=>B,
    incoming:function(p,t){return ae.hc(p,t)},attack:function(code,t){return bB.hz.i6(code,t)}};}};
  const modern=game.modern,original=bB.hz.i6,o=installNativeObserver(game,{sourceHash:'a'.repeat(64)});
  assert.notEqual(game.modern,modern,'fresh facade must still reach the observed stable functions');
  assert.equal(modern.incoming(1,0),0);assert.throws(()=>modern.incoming(2,0),/source-fault/);
  assert.equal(modern.attack(100,1),undefined);assert.equal(calls,1);
  const events=o.drain();assert.equal(events[0].valid,true);assert.equal(events[1].valid,false);
  assert.equal(events[2].observedDebit,108);assert.equal(events[2].beforeTick,8);
  o.stop();assert.equal(bB.hz.i6,original);
});
test('full plans, promises and raw planner outputs survive observation without mutation',async()=>{
  let dCalls=0,pCalls=0;const promise=Promise.resolve({ok:true});
  const native={balance:100,territory:10,gameTick:1,matchId:'m',stateVersion:1};
  const s={balance:100,territory:10,tick:1};
  const decision={action:'expand',reason:'test'},plan={balance:100,canAfford:true,minAttack:4,minRemaining:10,maxSpendTotal:90,ratio:0.2};
  const core={decide(){dCalls++;return decision;},planSpend(){pCalls++;return plan;}};
  const agent={settings:{},internal:{lastState:native,lastStateAt:0,attack:()=>promise},
    executeInternalPipelineImpl(){this._decision=core.decide(s);const p=core.planSpend(s);
      this.lastCommitMeta={ratio:p.ratio,canAfford:true,maxSpend:p.maxSpendTotal};
      assert.equal(this.internal.attack({ratio:0.2}),promise);return p;}};
  const o=installPlannerObserver(agent,core,{now:()=>1});assert.equal(agent.executeInternalPipelineImpl(),plan);
  await promise;const events=o.drain();assert.equal(dCalls,1);assert.equal(pCalls,1);
  plan.minAttack=99;assert.equal(events.find(e=>e.kind==='decision').rawPlan.minAttack,4);
  assert.equal(events.find(e=>e.kind==='receipt').nativeAckTick,null);o.stop();
});
function event(){return {kind:'decision',decisionId:'d1',sourceHash:'a'.repeat(64),ageMs:0,
  native:{matchId:'m',stateVersion:1,gameTick:8,balance:10000,territory:100,player:0,neutralId:512,
    physicalNeighbors:[1,512],enemies:[{id:1,bal:12000,effectiveBal:12000,incoming:0,adjacent:true,available:false}]},
  situation:{balance:10000,balanceKnown:true,territory:100,tick:8,gameTimeSec:20,hasAdjFree:true,adjEnemies:[],areaTrend:0,shrinkFrames:0},
  rawPlan:{balance:10000,canAfford:true,minRemaining:1000,maxSpendTotal:9000,minAttack:4,ratio:0.72},
  commitSummary:{maxSpend:9000},approvedPlan:{balance:10000,canAfford:true,minRemaining:1000,maxSpendTotal:9000,minAttack:4,ratio:0.72},
  finalDecision:{action:'expand',reason:'neutral'},submittedCommands:['c1']};}
test('shadow risk includes busy actors only with verified fields and complete physical coverage',()=>{
  const a=createAnalysis(kernel().TIOEngineCore,'a'.repeat(64));
  const e=event();assert.equal(a.plannerBatch([e])[0].reason,'unverified-incoming-field');
  a.nativeBatch([{kind:'incoming-lookup',tick:8,actor:1,exclude:0,value:0,valid:true}]);
  assert.equal(a.plannerBatch([e])[0].proposal.contactCount,1);
  e.native.physicalNeighbors.push(2);assert.equal(a.plannerBatch([e])[0].reason,'incomplete-physical-coverage');
  assert.equal(a.summary().decisions,3);assert.equal(a.summary().supported,1);
});
test('incoming errors censor ambiguous zeros and native joins never invent acknowledgement ticks',()=>{
  const a=createAnalysis(kernel().TIOEngineCore,'a'.repeat(64));
  a.nativeBatch([{kind:'incoming-lookup',tick:8,actor:1,exclude:0,value:0,valid:true},
    {kind:'incoming-lookup',tick:8,actor:1,exclude:0,valid:false},
    {kind:'native-command',nativeCommandId:'n1',at:'2026-10-13T20:00:01Z',target:512,il:100,
      beforeTick:8,observedDebit:108,error:null}]);
  assert.equal(a.plannerBatch([event()])[0].reason,'unverified-incoming-field');
  const out=a.plannerBatch([{kind:'submission',commandId:'c1',at:'2026-10-13T20:00:00Z'},
    {kind:'receipt',commandId:'c1',at:'2026-10-13T20:00:02Z',result:{ok:true,target:512,il:100}}]);
  assert.equal(out[0].nativeAdmissionTick,8);assert.equal(out[0].nativeAckTick,null);
  assert.equal(a.summary().joinedCommands,1);
});
test('native loss of recording and >32 missing actors cannot authorize complete coverage',()=>{
  const core=kernel().TIOEngineCore;
  const a=createAnalysis(core,'a'.repeat(64));
  a.nativeBatch([{kind:'incoming-lookup',tick:8,actor:1,exclude:0,value:0,valid:true}],{dropped:1});
  assert.equal(a.plannerBatch([event()])[0].reason,'native-observer-incomplete');
  const b=createAnalysis(core,'a'.repeat(64)),e=event();
  e.native.physicalNeighbors=Array.from({length:35},(_,i)=>i+1);
  e.native.enemies=Array.from({length:32},(_,i)=>({id:i+1,bal:100,incoming:0,effectiveBal:100,adjacent:true}));
  assert.equal(b.plannerBatch([e])[0].reason,'incomplete-physical-coverage');
  const capped=createAnalysis(core,'a'.repeat(64),{maxLookupEntries:3});
  capped.nativeBatch([0,1,2,3,4].map(value=>({kind:'incoming-lookup',tick:8,actor:1,exclude:0,value,valid:true})));
  assert.equal(capped.summary().retainedLookupEntries,0);
  assert.equal(capped.plannerBatch([event()])[0].reason,'native-observer-incomplete');
});
test('original exceptions and unknown delegation signatures are preserved/rejected before mutation',()=>{
  const fault=Error('original-fault');let calls=0;
  const engine={decide(){calls++;throw fault;},planSpend(){}};
  const agent={settings:{},internal:{lastState:{},lastStateAt:0,attack:()=>Promise.resolve()},
    executeInternalPipelineImpl(){engine.decide({balance:100});}};
  const observer=installPlannerObserver(agent,engine,{now:()=>1});
  assert.throws(()=>agent.executeInternalPipelineImpl(),e=>e===fault);
  assert.equal(calls,1);assert.match(observer.drain()[0].pipelineError,/original-fault/);observer.stop();
  const ae={hc(){}},original=ae.hc;
  const game={contract:'unknown',ae,bB:{},modern:{incoming(){},attack(){},balance(){},me(){},gameTick(){}}};
  assert.throws(()=>installNativeObserver(game),/Unsupported stable/);assert.equal(ae.hc,original);
});
test('actual orchestrator emits identical decisions and native payloads with observer on/off',async()=>{
  const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
  async function run(recording,B,free,userHold){
    const box=kernel();box.performance={now:()=>0};
    for(const name of ['CoordSystem','VisionEngine','OccupancyGrid','RegionDetector','BorderDetector',
      'EnemyTracker','EconomyAnalyzer','HeatmapEngine','HUDEngine','MouseController'])box[name]=function(){};
    const source=fs.readFileSync(path.join(__dirname,'../content/content.js'),'utf8')
      .replace('window.TerritorialEngineV5 = new TerritorialMasterOrchestrator();','')
      .replace('window.TerritorialEngineV5.init();','');vm.runInContext(source,box);
    const agent=new box.TerritorialMasterOrchestrator();agent.hud.updateDashboard=()=>{};
    agent.controller.userPointerDown=userHold;
    const commands=[];agent.internal={lastStateAt:0,isBusy:()=>false,
      lastState:{ready:true,alive:true,matchId:'m',stateVersion:1,balance:B,balanceKnown:true,
        territory:100,softCap:10000,gameTick:10,activeFronts:0,humanFrontCap:4,neutralId:512,
        neighbors:free?[512,2]:[2],physicalNeighbors:free?[512,2]:[2],alivePlayers:8,
        enemies:[{id:2,bal:200,terr:100,effectiveBal:200,incoming:0,adjacent:true,available:true}]},
      attack(payload){commands.push(payload);return Promise.resolve({ok:true,path:'fixture',target:payload.target});}};
    const observer=recording?installPlannerObserver(agent,box.TIOEngineAdapter.getActive(),{now:()=>0}):null;
    agent.executeInternalPipeline(1000);await Promise.resolve();
    if(observer){const rows=observer.drain();assert.equal(rows.filter(e=>e.kind==='decision').length,1);observer.stop();}
    return JSON.stringify({decision:agent._decision,budget:agent.lastCommitMeta,commands});
  }
  for(const [B,free,hold] of [[6000,true,false],[10000,false,false],[500,false,false],[6000,true,true]])
    assert.equal(await run(true,B,free,hold),await run(false,B,free,hold));
});
test('published journals reproduce the source-bound cohort without invented planner inputs',()=>{
  const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
  const manifest=require('../docs/live-audits/2026-10-13-planner-shadow-cycle.json');
  assert.equal(manifest.runs.length,3);assert.equal(manifest.sourceBoundMatches,1);
  for(const run of manifest.runs){
    const bytes=fs.readFileSync(path.join(__dirname,'../docs/live-audits',run.artifact.file));
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),run.artifact.sha256);
    const b=JSON.parse(zlib.gunzipSync(bytes));
    assert.equal(b.planner.filter(e=>e.kind==='decision').length,run.shadow.decisions);
    assert.equal(b.report.shadow.candidateActive,false);
    if(run.sourceIdentityEligible){
      assert.equal(b.report.sourceBinding,'captured-preloader-synchronous-xhr-response-before-patch');
      assert.notEqual(b.report.sourceSha256,b.report.navigationSourceSha256);
      const a=createAnalysis(kernel().TIOEngineCore,b.report.sourceSha256,{keepAllLookups:true});
      a.nativeBatch(b.native,b.report.shadow.nativeObserver);a.plannerBatch(b.planner);
      for(const key of ['decisions','supported','unsupported','changedProposals','joinedCommands','bankingLossAdvisories'])
        assert.equal(a.summary()[key],b.report.shadow[key],key);
      assert.equal(run.admissionDebitChecks.cases,30);assert.equal(run.admissionDebitChecks.mismatches,0);
    }
  }
});
test('v4 native observer wraps the renamed delegation and restores native identity',()=>{
  let B=1000,calls=0;
  const a0n={pv(){return 17;}},ss={a1M:{xn(){calls++;B-=108;}}};
  const originalIncoming=a0n.pv,originalAttack=ss.a1M.xn;
  const game={contract:'live-modern-v4',ae:a0n,bB:ss,get modern(){return {
    me:()=>0,balance:()=>B,gameTick:()=>8,
    incoming:function(p,t){return a0n.pv(p,t)},attack:function(code,t){return ss.a1M.xn(code,t)}};}};
  const o=installNativeObserver(game,{sourceHash:'b'.repeat(64)});
  assert.equal(game.modern.incoming(1,0),17);assert.equal(game.modern.attack(100,1),undefined);
  const e=o.drain();assert.equal(calls,1);assert.equal(e[1].observedDebit,108);
  o.stop();assert.equal(a0n.pv,originalIncoming);assert.equal(ss.a1M.xn,originalAttack);
  const spoof={...game,get modern(){return {...game.modern,attack(){return 1;}};}};
  assert.throws(()=>installNativeObserver(spoof),/Unsupported stable native delegation signature/);
  assert.equal(ss.a1M.xn,originalAttack);
});
