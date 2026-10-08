'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {environment,states}=require('../tools/cpu-benchmark.cjs');
function setup(){const b=environment();b.performance={now:()=>0};
  for(const f of ['shared/config.js','content/engine-core-v2-advanced.js','content/frontier-model.js','content/frontier-episodes.js','content/frontier-spatial.js','content/frontier-dynamic.js'])
    vm.runInContext(fs.readFileSync(path.join(__dirname,'..',f),'utf8'),b);return b;}
const plain=x=>JSON.parse(JSON.stringify(x));
test('all 80 production decision/spend fingerprints remain unchanged with both research modules loaded',()=>{
  const b=setup(),r=states().map(s=>({decision:b.TIOEngineCoreV2.decide(s),spend:b.TIOEngineCoreV2.planSpend(s)}));
  assert.equal(require('node:crypto').createHash('sha256').update(JSON.stringify(r)).digest('hex'),'d49794e32d3cc195e357b4edc5d14f0731b24a408c25ab03633a019cf015b0c6');
});
test('dynamic normal arithmetic equals existing source-verified normal kernel in 10000 seeded cases',()=>{
  const b=setup();let seed=871;const rand=n=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)%n);
  for(let i=0;i<10000;i++){const force=rand(100000),bank=rand(100000),territory=rand(500)+1,cells=rand(territory+1),counter=rand(100000),neutral=!!rand(2);
    const a=b.TIOFrontier.resolveNativeBatch(force,bank,territory,cells,counter,2,neutral);
    const d=b.TIODynamicFrontier.batch({force,bank,territory,cells,counter,neutral});
    assert.equal(Math.max(0,d.force),a.remaining);assert.equal(d.bank,a.bank);assert.equal(d.counter,a.counter);
    assert.equal(d.captured,a.captured);assert.equal(d.terminal,a.resolved);}
});
test('reinforcement respects exact debt surcharge, threshold and counterforce refusal',()=>{
  const d=setup().TIODynamicFrontier;
  const r=d.batch({force:0,bank:1000,territory:100,cells:10,reinforced:true,actorBank:1});
  assert.equal(r.captured,10);assert.equal(r.borrowed,337);assert.equal(r.debt,415);assert.equal(r.force,0);
  const blocked=d.batch({force:10,bank:1000,territory:100,cells:10,counter:1000,reinforced:true,actorBank:1});
  assert.equal(blocked.captured,0);assert.equal(blocked.counter,990);assert.equal(blocked.bank,1000);
});
test('10000 supported batches preserve the exact source force ledger including signed rounding residue',()=>{
  const d=setup().TIODynamicFrontier;let seed=339;
  const rand=n=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)%n);
  for(let i=0;i<10000;i++){const x={force:rand(100000),bank:rand(100000),territory:1000,cells:rand(1000)+1,
    counter:rand(10000),actorBank:rand(100000),debt:rand(50001),reinforced:true,neutral:!!rand(2)};
    const r=d.batch(x);assert.equal(x.force+r.borrowed,r.force+r.spent);
    assert.ok(r.bank>=0&&r.bank<=x.bank&&r.counter>=0&&r.counter<=x.counter);
    assert.ok(r.actorBank>=0&&r.actorBank<=x.actorBank&&r.debt>=x.debt&&r.debt<=50000);}
});
test('shared immutable contact extraction equals the original static extractor on 1000 maps',()=>{
  const b=setup();let seed=670;const rand=n=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)%n);
  const order=a=>plain(a).sort((a,b)=>a.a-b.a||a.b-b.b);
  for(let k=0;k<1000;k++){const owners=Array.from({length:64},()=>[0,1,2,3,65535][rand(5)]),counts=[0,0,0];
    owners.forEach(o=>{if(o<3)counts[o]++;});const r={width:8,height:8,neutralId:3,owners,counts};
    const s=b.TIOSpatial.baseline(r,{matchId:'m',spatialVersion:0,sourceStateVersion:0,gameTick:0});
    assert.deepEqual(order(b.TIOSpatial.contacts(s)),order(b.TIOFrontier.extract(r,{}, {maxSegments:4096}).pairs));}
});
function fixture(b){const s=b.TIOSpatial.baseline({width:6,height:1,neutralId:2,owners:[0,0,0,1,1,1],counts:[3,3]},
  {matchId:'m',spatialVersion:0,sourceStateVersion:0,gameTick:0});
  const o={matchId:'m',spatialVersion:0,sourceStateVersion:0,gameTick:0,
    players:[{territory:3,balance:100,debt:0,alive:true,economy:{}},{territory:3,balance:10,debt:0,alive:true,economy:{}}],
    frontierQueues:[[2],[3]],offsets:[-6,1,6,-1],scheduler:{order:[0],timers:[0,0]},
    fronts:[{actor:0,target:1,troops:1000,reinforced:false,nativeFrontId:1}],
    constants:{cellCost:2,debtCap:50000,hardCapMaximum:1500000000,hardCapPerCell:150}};return {s,o};}
test('capture updates next contact from sparse geometry, conserves territory and leaves input immutable',()=>{
  const b=setup(),{s,o}=fixture(b),before=plain(o),r=b.TIODynamicFrontier.simulate(o,s,5);
  assert.equal(r.players[0].territory,5);assert.equal(r.players[1].territory,1);
  assert.equal(r.fronts[0].captured,2);assert.equal(r.changedCells,2);assert.equal(b.TIOSpatial.at(s,3),1);
  assert.deepEqual(plain(o),before);
});
test('first delay, recurring cadence and return/refund are distinct; horizon zero never debits twice',()=>{
  const b=setup(),{s,o}=fixture(b);o.scheduler.timers[0]=64;
  assert.equal(b.TIODynamicFrontier.simulate(o,s,7).fronts[0].captured,0);
  assert.equal(b.TIODynamicFrontier.simulate(o,s,8).fronts[0].captured,1);
  o.scheduler.timers[0]=0;o.fronts[0].troops=1;
  const r=b.TIODynamicFrontier.simulate(o,s,1);assert.equal(r.fronts[0].terminationTick,1);assert.equal(r.players[0].balance,101);
  const z=b.TIODynamicFrontier.simulate(o,s,0);assert.equal(z.players[0].balance,100);assert.equal(z.fronts[0].troops,1);
});
test('mismatched state, versions and unsupported origin fail closed, never return invented geometry',()=>{
  const b=setup(),{s,o}=fixture(b);
  for(const bad of [{matchId:'x'},{spatialVersion:1},{sourceStateVersion:-1},{scheduler:null}])
    assert.throws(()=>b.TIODynamicFrontier.simulate({...o,...bad},s,5),/dynamic-/);
  o.players[0].territory=4;assert.throws(()=>b.TIODynamicFrontier.simulate(o,s,5),/inconsistent/);
});
