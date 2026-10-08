'use strict';
const{test}=require('node:test'),assert=require('node:assert/strict');
const {dependencies,summarizeRows,clustered}=require('../tools/frontier-study-report.cjs');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const root=path.resolve(__dirname,'..');
test('future-action dependencies include counterforce and third-party support chains, not all neutral fronts',()=>{
  assert.deepEqual([...dependencies([{actor:0,target:1},{actor:2,target:1},{actor:3,target:'neutral'}],0)].sort(),[0,1,2]);
});
test('selection-bias accounting retains failed candidates and identical common-support ETA labels',()=>{
  const rows=[{commonSupport:true,censored:false,actual:{territory:10,captured:1,balance:10,eta:2},predictions:{
    aggregate:{territory:20,captured:2,balance:20,eta:null},static:{territory:11,captured:1,balance:11,eta:3},dynamic:{territory:10,captured:1,balance:10,eta:2}}},
  {commonSupport:false,censored:false,actual:{territory:10,captured:1,balance:10,eta:2},errors:{dynamic:'cap'},predictions:{
    aggregate:{territory:20,captured:2,balance:20,eta:4},static:{territory:11,captured:1,balance:11,eta:3}}},
  {commonSupport:false,censored:true,invalid:'action',predictions:{}}];
  const r=summarizeRows(rows);assert.equal(r.forecasts,3);assert.equal(r.commonSupport,1);
  assert.equal(r.models.dynamic.validCoverage,1/3);assert.equal(r.models.static.validCoverage,2/3);
  assert.equal(r.models.static.allValid.eta.n,2);assert.equal(r.models.static.commonSupport.eta.n,0);
  assert.equal(r.models.dynamic.errors.cap,1);
});
test('uncertainty resamples whole matches and never upgrades correlated ticks to independent games',()=>{
  const row=(a,d)=>({commonSupport:true,tags:['hostile'],actual:{territory:0},predictions:{static:{territory:a},dynamic:{territory:d}}});
  const r=clustered([{matchId:'a',rows:Array.from({length:10000},()=>row(5,2))},{matchId:'b',rows:[row(6,4)]}]);
  assert.equal(r.independentMatches,2);assert.equal(r.meanDynamicMinusStaticMAE,-2.5);assert.deepEqual(r.ci95,[-3,-2]);
  assert.equal(clustered([{matchId:'a',rows:[row(5,2)]}]).ci95,null);
});
test('published experiment retains complete split, frozen pipeline hashes and all observed episodes',()=>{
  const s=require('../docs/frontier/2026-10-07-dynamic-summary.json');
  assert.equal(s.completeMatches,24);assert.equal(s.developmentMatches,16);assert.equal(s.heldOutMatches,8);
  assert.equal(s.policyInfluence,false);assert.equal(s.policyPromotionAllowed,false);
  assert.deepEqual(s.datasetManifest.map(m=>m.index),Array.from({length:24},(_,i)=>i+1));
  for(const m of s.datasetManifest){assert.equal(m.startTick,0);assert.ok(m.endTick>0);assert.ok(m.finalAlive<=1);
    assert.equal(m.split,m.index<=16?'development':'held-out');assert.equal(m.sourceSha256,s.candidateFreeze.sourceSha256);}
  assert.equal(s.candidateFreeze.tunedCandidateParameters,0);
  require('../tools/frontier-study-freeze.cjs').check(s.candidateFreeze);
  const bytes=fs.readFileSync(path.join(root,'docs/frontier',s.episodeReport.file));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),s.episodeReport.sha256);
  const episodes=JSON.parse(zlib.gunzipSync(bytes));assert.equal(episodes.length,s.selectionBias.hostileEpisodesObserved);
  assert.equal(episodes.filter(e=>e.metrics.forecasts>0).length,s.selectionBias.hostileEpisodesForecasted);
  for(const model of Object.values(s.heldOut.models))assert.equal(model.commonSupport.territory.n,s.heldOut.commonSupport);
});
test('release never packages or selects the research candidate',()=>{
  const manifest=require('../manifest.json');
  assert.equal(manifest.content_scripts.flatMap(s=>s.js).some(f=>f.includes('frontier-dynamic')),false);
  for(const file of ['content/main-hook.js','content/engine-adapter.js','content/engine-core-v2-advanced.js']){
    const source=fs.readFileSync(path.join(root,file),'utf8');
    assert.equal(/TIODynamic|frontier-dynamic\.js/.test(source),false,file);
  }
});
