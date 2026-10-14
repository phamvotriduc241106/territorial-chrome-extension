'use strict';
// Replay complete published development journals, never inferred missing inputs.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const {kernel}=require('./cpu-benchmark.cjs');
const {createAnalysis}=require('../research/planner-shadow-analysis.cjs');
const root=path.resolve(__dirname,'..'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function replay(file){
  const manifestPath=path.resolve(root,file),manifest=JSON.parse(fs.readFileSync(manifestPath));
  const runs=manifest.runs.map(run=>{
    const bytes=fs.readFileSync(path.join(path.dirname(manifestPath),run.artifact.file));
    if(sha(bytes)!==run.artifact.sha256)throw Error('Artifact hash mismatch: '+run.id);
    const b=JSON.parse(zlib.gunzipSync(bytes));
    if(b.report.sourceBinding!=='captured-preloader-synchronous-xhr-response-before-patch')
      return{id:run.id,status:'excluded',reason:'executed-source-not-bound'};
    if(!b.report.matchStartedAt || !b.report.samples.length)
      return{id:run.id,status:'setup-error',outcome:b.report.outcome,combatExposure:false};
    const a=createAnalysis(kernel().TIOEngineCore,b.report.sourceSha256,{keepAllLookups:true,bankingAlternatives:true});
    a.nativeBatch(b.native,b.report.shadow?.nativeObserver);
    const rows=a.plannerBatch(b.planner),summary=a.summary();
    const settings=JSON.stringify([...new Set(b.planner.filter(e=>e.kind==='decision').map(e=>JSON.stringify(e.settings)))]);
    return{id:run.id,status:'development-replay',outcome:b.report.outcome,
      sourceHash:b.report.sourceSha256,release:b.report.release,settingsHash:sha(settings),
      decisions:summary.decisions,outerUnsupported:summary.unsupported,
      banking:summary.bankingAlternatives,
      financiallyFeasibleFrames:rows.filter(e=>e.banking?.financiallyFeasible).map(e=>({decisionId:e.decisionId,
        tick:e.tick,targetId:e.banking.targetId,ratio:e.banking.ratio,reserve:e.banking.requiredReserve})),
      actualCandidateCommands:0};
  });
  return{schema:1,kind:'offline-development-action-feasibility-not-treatment',
    evaluatorHash:sha(fs.readFileSync(path.join(root,'research/banking-alternatives.cjs'))),
    analyzerHash:sha(fs.readFileSync(path.join(root,'research/planner-shadow-analysis.cjs'))),
    productionKernelHash:sha(fs.readFileSync(path.join(root,'content/engine-core-v2-advanced.js'))),
    inputManifestHash:sha(fs.readFileSync(manifestPath)),runs,
    inference:'Financial feasibility is not tactical value, causal survival improvement or a predicted win.'};
}
if(require.main===module)console.log(JSON.stringify(replay(process.argv[2]),null,2));
module.exports={replay};
