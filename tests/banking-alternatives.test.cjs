'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {kernel,states}=require('../tools/cpu-benchmark.cjs');
const {evaluateBankingAlternatives:evaluate}=require('../research/banking-alternatives.cjs');
const core=kernel().TIOEngineCore,sourceHash='a'.repeat(64);
function fixture(){
  const enemies=[{id:2,bal:10000,incoming:0,effectiveBal:10000,terr:500,
    available:true,adjacent:true,shipOnly:false}];
  const situation={balance:30000,balanceKnown:true,territory:1000,softCap:100000,
    gameTimeSec:90,tick:1600,hasAdjFree:false,freeLandRatio:0,adjEnemies:enemies,
    areaTrend:0,shrinkFrames:0,activeFronts:0,attackSequence:30,incoming:0,primaryDanger:0.25};
  const s={matchId:'m',sourceHash,stateVersion:2,ageMs:10,coverage:'complete-adjacent',situation};
  const p={...situation,gameTick:situation.tick,frontCap:4,fronts:1,
    wantEnemy:false,phase:'STACK'};
  const b={matchId:'m',sourceHash,stateVersion:2,decision:{action:'hold',reason:'hard-build-combat-bank'},
    plan:core.planSpend(p)};
  const expected={matchId:'m',sourceHash,minStateVersion:2};
  const controls={botEnabled:true,autoAttack:true,sliderPercentage:0};
  return [core,s,b,expected,controls,p];
}
function deepFreeze(v){if(v&&typeof v==='object'){Object.freeze(v);Object.values(v).forEach(deepFreeze);}return v;}
test('banking alternative specifies target, action and exact reserve-safe ledger without live authority',()=>{
  const args=fixture();args.slice(1).forEach(deepFreeze);
  const before=JSON.stringify(args.slice(1));
  const r=evaluate(...args);assert.equal(r.status,'proposal');assert.equal(r.action,'fight');
  assert.equal(r.targetId,2);assert.equal(r.executable,false);assert.equal(r.liveDispatchEligible,false);
  assert.equal(r.policyInfluence,false);assert.equal(r.financiallyFeasible,true);
  assert.equal(r.ledger.sent+r.ledger.tax,r.ledger.debit);
  assert.equal(r.ledger.before-r.ledger.debit,r.ledger.after);
  assert.ok(r.ledger.after>=r.requiredReserve);assert.equal(JSON.stringify(args.slice(1)),before);
  const a=r.alternatives[0];assert.ok(a.ledger.debit<=a.maxSpendTotal);assert.ok(a.ledger.sent>=a.minAttack);
});
test('shrink and incoming defense walls are independent blockers, never bypassed',()=>{
  for(const signal of ['shrink','incoming']){
    const args=fixture(),s=args[1].situation,p=args[5];
    if(signal==='shrink'){s.shrinkFrames=3;p.shrinkFrames=3;}
    else {s.incoming=1;p.incoming=1;}
    const r=evaluate(...args);assert.equal(r.status,'blocked');assert.equal(r.action,'hold');
    assert.equal(r.ledger,null);assert.equal(r.alternatives[0].budgetReason,'pmp-fortification-defense-wall');
  }
});
test('busy actors count in reserves but cannot be selected; input order cannot change selection',()=>{
  const args=fixture(),s=args[1].situation;
  s.adjEnemies.push({id:3,bal:58000,incoming:0,effectiveBal:58000,terr:900,
    adjacent:true,available:false,shipOnly:false});
  const r=evaluate(...args);assert.equal(r.contactReserve,31901);
  assert.equal(r.status,'blocked');assert.equal(r.alternatives[1].reason,'target-unavailable');
  s.adjEnemies[1].bal=20000;s.adjEnemies[1].effectiveBal=20000;
  const good=evaluate(...args);assert.equal(good.targetId,2);assert.equal(good.status,'proposal');
  s.adjEnemies.reverse();assert.deepEqual(evaluate(...args),good);
});
test('freshness, provenance, controls, field consistency and unknown target data fail closed',()=>{
  const mutations=[a=>a[1].ageMs=701,a=>a[1].stateVersion=1,a=>a[1].coverage='partial',
    a=>a[1].sourceHash='b'.repeat(64),a=>a[4]=null,a=>delete a[1].situation.adjEnemies[0].available,
    a=>a[5].activeFronts=0.5,a=>a[5].areaTrend=-12,a=>a[5].incoming=2,
    a=>a[5].adjEnemies=[],a=>a[5].softCap=1,a=>a[2].plan.balance=1,
    a=>{delete a[5].gameTick;delete a[1].situation.tick;},a=>a[1].situation.adjEnemies[0].id=512];
  for(const mutate of mutations){const a=fixture();mutate(a);const r=evaluate(...a);
    assert.equal(r.status,'unsupported');assert.equal(r.ledger,null);}
  for(const mutate of [a=>a[4].autoAttack=false,a=>a[4].botEnabled=false,a=>a[4].sliderPercentage=20]){
    const a=fixture();mutate(a);assert.equal(evaluate(...a).reason,'control-preference');}
});
test('full front cap, strong targets and existing larger baseline reserve cannot be overridden',()=>{
  let args=fixture();args[1].situation.activeFronts=4;args[5].activeFronts=4;
  assert.equal(evaluate(...args).alternatives[0].budgetReason,'front-cap');
  args=fixture();args[2].plan.minRemaining=30000;
  assert.equal(evaluate(...args).alternatives[0].reason,'reserve-or-minimum-attack');
  args=fixture();const e=args[1].situation.adjEnemies[0];e.bal=21000;e.effectiveBal=21000;
  assert.equal(evaluate(...args).alternatives[0].reason,'insufficient-bank-advantage');
});
test('2000 seeded proposals conserve capital, retain production and contact floors and respect exact units',()=>{
  let seed=81239,proposals=0;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  for(let i=0;i<2000;i++){
    const a=fixture(),s=a[1].situation,p=a[5],B=2000+Math.floor(random()*500000);
    s.balance=p.balance=B;a[2].plan.balance=B;
    const e=s.adjEnemies[0];e.bal=e.effectiveBal=Math.floor(B*(0.1+random()*0.8));
    if(i%3===0){s.shrinkFrames=p.shrinkFrames=1;}
    const r=evaluate(...a);assert.notEqual(r.status,'unsupported');
    if(!r.financiallyFeasible){assert.equal(r.ledger,null);continue;}
    proposals++;const c=r.alternatives.find(x=>x.targetId===r.targetId),l=r.ledger;
    assert.equal(l.debit,core.humanAttackDebit(B,Math.floor(B*r.sliderUnits/1024)).debit);
    assert.equal(l.after,B-l.debit);assert.ok(l.after>=a[2].plan.minRemaining);
    assert.ok(l.after>=c.requiredReserve);assert.ok(l.sent>=c.minAttack);
    assert.ok(l.debit<=c.maxSpendTotal);assert.equal(r.executable,false);
  }
  assert.ok(proposals>100);
});
test('research is absent from runtime release and does not alter 80 frozen production outputs',()=>{
  const crypto=require('node:crypto'),{releaseFiles}=require('../tools/release-files.cjs');
  assert.ok(!releaseFiles().some(f=>f.startsWith('research/')));
  const box=kernel();box.performance={now:()=>0};
  for(let i=0;i<20;i++)evaluate(...fixture());
  const result=states().map(s=>({decision:box.TIOEngineCore.decide(s),spend:box.TIOEngineCore.planSpend(s)}));
  assert.equal(crypto.createHash('sha256').update(JSON.stringify(result)).digest('hex'),
    'd49794e32d3cc195e357b4edc5d14f0731b24a408c25ab03633a019cf015b0c6');
});
test('official map selection distinguishes Asia from Caucasia and supports both selection markers',()=>{
  const {mapSelectionPattern}=require('../tools/live-chrome-audit.cjs');
  for(const map of ['Asia','Europe'])for(const marker of ['⚪','🟢']){
    assert.ok(mapSelectionPattern(map).test(marker+' '+map));
    assert.ok(!mapSelectionPattern(map).test(marker+' Caucasia'));
    assert.ok(!mapSelectionPattern(map).test(marker+' '+map+' preview'));
  }
  assert.throws(()=>mapSelectionPattern('.*'));
});
test('source-bound Europe replay exposes independent blockers without inventing a feasible attack',()=>{
  const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
  const {createAnalysis}=require('../research/planner-shadow-analysis.cjs');
  const m=require('../docs/live-audits/2026-10-13-planner-shadow-cycle.json');
  const run=m.runs.find(r=>r.sourceIdentityEligible);
  const b=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname,'../docs/live-audits',run.artifact.file))));
  const a=createAnalysis(core,b.report.sourceSha256,{keepAllLookups:true,bankingAlternatives:true});
  a.nativeBatch(b.native,b.report.shadow.nativeObserver);const rows=a.plannerBatch(b.planner);
  const summary=a.summary();assert.equal(summary.bankingAlternatives.evaluated,837);
  assert.equal(summary.bankingAlternatives.proposals,0);assert.equal(summary.bankingAlternatives.blocked,390);
  assert.equal(summary.bankingAlternatives.targetBlockers['pmp-fortification-defense-wall'],17);
  assert.equal(summary.bankingAlternatives.targetBlockers['reserve-or-minimum-attack'],64);
  assert.equal(summary.joinedCommands,30);assert.equal(summary.unsupported,0);
  assert.equal(rows.filter(r=>r.banking?.status==='blocked').length,390);
});
test('complete new evidence retains both setup errors and reproduces every published admission and proposal count',()=>{
  const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
  const {replay}=require('../tools/banking-replay-report.cjs');
  const m=require('../docs/live-audits/2026-10-14-banking-cycle.json');
  assert.equal(m.attempts,3);assert.equal(m.independentMatches,1);assert.equal(m.sourceBoundMatches,1);
  assert.equal(m.runs.filter(r=>r.outcome==='error').length,2);
  for(const run of m.runs){
    const bytes=fs.readFileSync(path.join(__dirname,'../docs/live-audits',run.artifact.file));
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),run.artifact.sha256);
    const b=JSON.parse(zlib.gunzipSync(bytes));
    if(!run.combatExposure){assert.equal(b.report.samples.length,0);assert.equal(b.native.length,0);continue;}
    assert.equal(b.report.shadow.candidateActive,false);assert.equal(b.report.outcome,'loss');
    const commands=b.native.filter(e=>e.kind==='native-command');assert.equal(commands.length,22);
    for(const e of commands){assert.equal(e.observedDebit,
      core.humanAttackDebit(e.before,Math.floor(e.before*(e.il+1)/1024)).debit);}
    assert.equal(run.shadow.decisions,421);assert.equal(run.shadow.bankingAlternatives.proposals,0);
    assert.deepEqual(run.replaySummary.bankingAlternatives,run.shadow.bankingAlternatives);
  }
  const report=replay('docs/live-audits/2026-10-14-banking-cycle.json');
  assert.equal(report.runs.filter(r=>r.status==='setup-error').length,2);
  const run=report.runs.find(r=>r.status==='development-replay');
  assert.equal(run.banking.evaluated,421);assert.equal(run.banking.blocked,116);
  assert.equal(run.banking.targetBlockers['insufficient-bank-advantage'],812);
});
