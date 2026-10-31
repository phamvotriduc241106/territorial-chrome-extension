'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const {root}=require('../../tools/lib/repository.cjs');
const {kernel}=require('../../tools/benchmarks/cpu-benchmark.cjs');
// Dated diagnostic, not a release regression gate. These assertions reproduce
// the reviewed defects; use the archived revision after fixing the engine.
assert.equal(require('../../tools/live/very-hard-standard.cjs').currentRelease().releaseSha256,
  '0a3dfb07d29e39ff394345162d7858d8d33943dc4332fb0f789de0b1dc9b8cb6',
  'This diagnostic requires the reviewed 10.3.11 runtime');
const box=kernel();box.TIOProfiler.enabled=false;
const core=box.TIOEngineCore;
const base={balance:1000,balanceKnown:true,territory:100,softCap:10000,hasAdjFree:false,
  freeLandRatio:0,playersRemaining:20,globalRank:2,tick:100,gameTimeSec:50,
  areaTrend:0,shrinkFrames:0,primaryDanger:0.3};
const unknowns=[];
for(const enemy of [{id:2,terr:100},{id:2,terr:100,bal:0,balanceKnown:false},{id:2,terr:100,bal:1000,balanceKnown:true}]){
  core.BayesianTroopObserver.reset();core.BayesianTroopObserver.updateObservation(2,1000,100);
  const decision=core.decide({...base,adjEnemies:[enemy]});
  unknowns.push({enemy,observer:core.BayesianTroopObserver.getEstimate(2,100,100).estimatedBalance,
    action:decision.action,reason:decision.reason,crushable:decision.crushable,enemyBal:decision.enemyBal});
}
assert.equal(unknowns[0].observer,1000);assert.equal(unknowns[0].enemyBal,0);assert.equal(unknowns[0].crushable,true);
assert.equal(unknowns[1].crushable,true);assert.equal(unknowns[2].crushable,false);
const sudden=core.transitionPlanningState({balance:5000,territory:100,tick:2000,hasAdjFree:false,
  playersRemaining:2,adjEnemies:[{id:2,bal:10,terr:100000}]},{type:'fight',targetId:2,ratio:0.1},10);
assert.equal(sudden.territory,100100);
const attrs={};Object.assign(box,{
  document:{documentElement:{setAttribute:(k,v)=>{attrs[k]=v;}},getElementsByTagName:()=>[],querySelectorAll:()=>[]},
  location:{origin:'https://territorial.io',hostname:'territorial.io',protocol:'https:',href:'https://territorial.io/'},
  MutationObserver:class{observe(){}},setTimeout:()=>0,setInterval:()=>0,clearTimeout(){},clearInterval(){},
  addEventListener(){},postMessage(){},__TIO_SCRIPT_PATCHED__:true
});
const count=512,bank=Array(count).fill(100),land=Array(count).fill(10),alive=Array(count).fill(true);
bank[1]=10000;land[1]=100;bank[34]=1000000;land[34]=10000;
const neighbors=Array.from({length:33},(_,i)=>i+2);
let modernReads=0;
const modern={me:()=>1,neutral:()=>count,balance:p=>bank[p],territory:p=>land[p],alive:p=>alive[p],
  neighbors:()=>neighbors,contains:(me,p)=>neighbors.includes(p),available:(me,p)=>neighbors.includes(p),
  activeCount:()=>0,active:()=>false,frontCap:()=>12,softCap:()=>10000,gameTick:()=>2000,
  incoming:()=>0,economy:()=>null,outgoing:()=>[],attack(){},matchToken:()=>alive};
box.__TIO_GAME__={contract:'live-modern-v4',ah:{},get modern(){modernReads++;return {...modern};}};
vm.runInContext(fs.readFileSync(root+'/content/main-hook.js','utf8'),box);
const snapshot=box.__TIO_HOOK_API__.state();
assert.equal(snapshot.ready,true);assert.equal(snapshot.enemies.length,32);
assert.equal(snapshot.enemies.some(e=>e.id===34),false);
const fullThreat=core.computeCrushBarrierFloor(bank[1],neighbors.map(id=>({id,bal:bank[id]})));
const truncatedThreat=core.computeCrushBarrierFloor(bank[1],snapshot.enemies);
assert.equal(fullThreat.maxThreat,1000000);assert.equal(truncatedThreat.maxThreat,100);
const spendContext={balance:10000,balanceKnown:true,territory:100,softCap:10000,
  freeLandRatio:0.08,wantEnemy:false,fronts:1,frontCap:4,phase:'LAND_RUSH',gameTimeSec:50,attackSequence:8};
const fullPlan=core.planSpend({...spendContext,adjEnemies:neighbors.map(id=>({id,bal:bank[id]}))});
const truncatedPlan=core.planSpend({...spendContext,adjEnemies:snapshot.enemies});
assert.equal(fullPlan.canAfford,false);assert.equal(truncatedPlan.canAfford,true);
const result={unknownBalances:unknowns,aggregateCapture:{territoryBefore:100,enemyTerritory:100000,
  enemyBalance:10,requestedRatio:0.1,horizonTicks:10,territoryAfter:sudden.territory,balanceAfter:sudden.balance},
  threatTruncation:{physicalEnemies:neighbors.length,exportedEnemies:snapshot.enemies.length,
    omittedId:34,actualLargestBalance:1000000,largestEnemyTerritory:land[34],exportedLargestBalance:100,
    fullReserve:fullThreat.floor,truncatedReserve:truncatedThreat.floor,
    fullPlan:{canAfford:fullPlan.canAfford,reason:fullPlan.reason},
    truncatedPlan:{canAfford:truncatedPlan.canAfford,ratio:truncatedPlan.ratio}},
  extraction:{fixturePlayers:count,modernGetterReads:modernReads}};
console.log(JSON.stringify(result,null,2));
