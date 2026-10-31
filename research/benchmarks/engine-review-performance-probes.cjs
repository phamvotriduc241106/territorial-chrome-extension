'use strict';
const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const {kernel}=require('../../tools/benchmarks/cpu-benchmark.cjs');
// Dated diagnostic, not a release regression gate. These assertions reproduce
// the reviewed defects; use the archived revision after fixing the engine.
assert.equal(require('../../tools/live/very-hard-standard.cjs').currentRelease().releaseSha256,
  '0a3dfb07d29e39ff394345162d7858d8d33943dc4332fb0f789de0b1dc9b8cb6',
  'This diagnostic requires the reviewed 10.3.11 runtime');
const box=kernel();box.TIOProfiler.enabled=false;const core=box.TIOEngineCore;
function sample(fn,warmups=3,calls=9){for(let i=0;i<warmups;i++)fn();const times=[];
  for(let i=0;i<calls;i++){const start=performance.now();fn();times.push(performance.now()-start);}
  times.sort((a,b)=>a-b);return{calls,medianMs:times[Math.floor(calls/2)],maxMs:times.at(-1)};}
const ranking=[];
for(const n of [64,256,1024]){
  const candidates=Array.from({length:n},(_,i)=>({x:(i*618.0339887)%1000,y:(i*414.2135623)%1000,type:'NEUTRAL',touchesNeutral:true}));
  const state={balance:9000,territory:100,softCap:10000,centerX:500,centerY:500,hasAdjFree:true,adjEnemies:[]};
  const spectral=core.computeSpectralFiedler(candidates);assert.equal(spectral.fiedler.length,n);
  let returned=0;const timing=sample(()=>{returned=core.rankTargets(candidates,state,{action:'expand'},24).length;});
  ranking.push({candidates:n,returned,...timing,quadraticBuffersBytes:n>64?20*n*n-4*n:null});
}
const search=[];
for(const n of [2,16,32]){
  const state={balance:9000,territory:100,hasAdjFree:false,playersRemaining:n+1,
    adjEnemies:Array.from({length:n},(_,i)=>({id:i+2,bal:7500+i*10,terr:85,available:true}))};
  let result;const timing=sample(()=>{result=core.computeMCTSEndgameAction(state,45,0.5);},5,15);
  search.push({enemies:n,budgetMs:0.5,...timing,lastResult:result});
}
const normalized=core.computeEikonalGeodesicField(16,8,[{x:500,y:500}],[]).getTravelTime(900,500);
const grid=core.computeEikonalGeodesicField(16,8,[{x:160,y:90}],[]).getTravelTime(288,90);
assert.notEqual(normalized,grid);
const result={kind:'Synthetic Node microbenchmarks; no browser CPU or gameplay inference',ranking,search,
  coordinateScale:{normalized1000:{origin:[500,500],target:[900,500],travelTime:normalized},
    grid320x180:{origin:[160,90],target:[288,90],travelTime:grid}}};
console.log(JSON.stringify(result,null,2));
