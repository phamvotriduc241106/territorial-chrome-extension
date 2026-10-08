'use strict';
// Publish compact derived statistics/hashes, never the official source or raw grids.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const {read,report}=require('./frontier-study-report.cjs');
const root=path.resolve(__dirname,'..'),study=path.join(root,'scratch/dynamic-frontier-research');
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function publish(){const freeze=JSON.parse(fs.readFileSync(path.join(study,'candidate-freeze.json')));
  for(const[file,sha]of Object.entries(freeze.files))if(hash(path.join(root,file))!==sha)throw Error('Frozen pipeline changed: '+file);
  const matches=[],manifest=[];for(let index=1;index<=24;index++){
    const name='match-'+String(index).padStart(2,'0')+'.json.gz',file=path.join(study,'dataset-v2',name),data=read(file),
      result=read(path.join(study,'results','study-'+String(index).padStart(2,'0')+'.json.gz'));
    if(!data.complete||data.startTick!==0||data.finalAlive>1||data.sourceSha256!==freeze.sourceSha256||
      data.split!==(index<=16?'development':'held-out'))throw Error('Invalid match '+index);
    matches.push(result);manifest.push({index,matchId:data.matchId,file:name,sha256:hash(file),compressedBytes:fs.statSync(file).size,
      split:data.split,fold:data.fold,stratum:data.stratum,seed:data.seed,mapId:data.mapId,players:data.players,dimensions:data.dimensions,
      sourceSha256:data.sourceSha256,recordedAt:data.recordedAt,startTick:data.startTick,endTick:data.endTick,finalAlive:data.finalAlive,
      totals:data.totals,metrics:result.counters});
  }
  const full=report(matches),episodes=full.byEpisode;delete full.byEpisode;
  const categoryCounts={};for(const category of Object.keys(full.byCategory)){
    const rows=matches.flatMap(m=>m.rows.filter(r=>r.tags.includes(category))),held=rows.filter(r=>r.split==='held-out');
    categoryCounts[category]={forecasts:rows.length,valid:rows.filter(r=>r.commonSupport).length,
      validEpisodes:new Set(rows.filter(r=>r.commonSupport).map(r=>r.episodeId)).size,
      validMatches:new Set(rows.filter(r=>r.commonSupport).map(r=>r.matchId)).size,
      heldOutForecasts:held.length,heldOutValid:held.filter(r=>r.commonSupport).length,
      heldOutValidEpisodes:new Set(held.filter(r=>r.commonSupport).map(r=>r.episodeId)).size,
      heldOutValidMatches:new Set(held.filter(r=>r.commonSupport).map(r=>r.matchId)).size};
  }
  full.datasetManifest=manifest;full.actualCategoryCounts=categoryCounts;full.candidateFreeze=freeze;
  full.spatialGate=JSON.parse(fs.readFileSync(path.join(study,'spatial-gate.json')));
  full.developmentEstimates=JSON.parse(fs.readFileSync(path.join(study,'development-estimates.json')));
  full.chromeBenchmark=JSON.parse(fs.readFileSync(path.join(study,'chrome-m4-benchmark.json')));
  full.instrumentationOverhead=JSON.parse(fs.readFileSync(path.join(study,'chrome-instrumentation-overhead.json')));
  const contactAudit=path.join(study,'contact-category-audit.json');
  if(fs.existsSync(contactAudit))full.verifiedContactCategories=JSON.parse(fs.readFileSync(contactAudit));
  full.validationSource='native events replayed against per-update territory counts and exact ordered candidate cells; 24 complete matches, 16 development/8 untouched final, 4 development folds, no fitted candidate parameters';
  full.selectionBias={sampling:'All active hostile fronts sampled at 80-tick origins, not every launch; short episodes are underrepresented.',
    hostileEpisodesObserved:episodes.length,hostileEpisodesForecasted:episodes.filter(e=>e.metrics.forecasts>0).length,
    navalEliminationExclusion:'Unmodeled external credits/ownership actions and non-return termination censor shared intervals; no residual-error-based exclusions.',
    eta:'Common-support ETA uses identical labels with finite estimates in all three models. All-valid per-model ETA and missing-label counts are separately retained.'};
  const out=path.join(root,'docs/frontier');fs.mkdirSync(out,{recursive:true});
  const epFile=path.join(out,'2026-10-07-dynamic-episodes.json.gz');fs.writeFileSync(epFile,zlib.gzipSync(Buffer.from(JSON.stringify(episodes)),{level:9}));
  full.episodeReport={file:path.basename(epFile),sha256:hash(epFile),episodes:episodes.length,compressedBytes:fs.statSync(epFile).size};
  fs.writeFileSync(path.join(out,'2026-10-07-dynamic-summary.json'),JSON.stringify(full,null,2));
  console.log(JSON.stringify({heldOut:full.heldOut,uncertainty:full.heldOutUncertainty,categories:categoryCounts,selection:full.selectionBias},null,2));return full;
}
if(require.main===module)publish();module.exports={publish};
