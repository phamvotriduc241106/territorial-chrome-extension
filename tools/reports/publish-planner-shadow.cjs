'use strict';
// Publish explicitly requested, sanitized game evidence; never game HTML/profile data.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const {kernel}=require('../benchmarks/cpu-benchmark.cjs');
const {createAnalysis}=require('../../research/planner/planner-shadow-analysis.cjs');
const root = require("../lib/repository.cjs").root,sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function publish(output, inputs){
  const target=path.resolve(root,output),directory=path.join(root,'docs/evidence/live');
  if(path.dirname(target)!==directory||!target.endsWith('.json')||!inputs.length)throw Error('Invalid publication target');
  const core=kernel().TIOEngineCore;
  const runs=inputs.map(input=>{
    const reportPath=path.resolve(root,input),dir=path.dirname(reportPath);
    if(!dir.startsWith(path.join(root,'scratch/live-chrome-audit')+path.sep))throw Error('Not a local live-audit record');
    const reportBytes=fs.readFileSync(reportPath),report=JSON.parse(reportBytes);
    const hashes={report:sha(reportBytes)};
    function read(file){const p=path.join(dir,file);if(!fs.existsSync(p))return [];
      const bytes=fs.readFileSync(p);hashes[file]=sha(bytes);return bytes.toString('utf8').trim().split('\n').filter(Boolean).map(JSON.parse);}
    const planner=read('planner-events.ndjson'),native=read('native-observer-events.ndjson'),shadow=read('shadow-proposals.ndjson');
    const id=path.basename(dir),file=id+'.planner-evidence.json.gz';
    const artifact=zlib.gzipSync(JSON.stringify({schema:1,report,planner,native,shadow}),{level:9});
    fs.writeFileSync(path.join(directory,file),artifact,{flag:'wx'});
    const admissions=native.filter(e=>e.kind==='native-command');
    const mismatches=admissions.filter(e=>e.observedDebit!==core.humanAttackDebit(e.before,
      Math.floor(e.before*(e.il+1)/1024)).debit);
    const replay=createAnalysis(core,report.sourceSha256,{keepAllLookups:true,maxLookupEntries:250000,
      bankingAlternatives:report.bankingAlternativesShadow===true});
    replay.nativeBatch(native,report.shadow?.nativeObserver);replay.plannerBatch(planner);
    const replaySummary=replay.summary();
    const verified=report.sourceBinding==='captured-preloader-synchronous-xhr-response-before-patch';
    return {id,artifact:{file,sha256:sha(artifact),bytes:artifact.length},originalFileHashes:hashes,
      sourceBindingQualification:verified?'executed-bootstrap-response-verified':'navigation-only-not-executed-bootstrap-bound',
      sourceIdentityEligible:verified,assignedPolicy:report.assignedPolicy??'baseline',
      productionPolicy:`${report.release.extensionVersion}-${report.release.engineVersion}-${report.assignedPolicy??'baseline'}`,
      combatExposure:!!report.matchStartedAt && report.samples.length>0,
      outcome:report.outcome,elapsedSeconds:report.matchStartedAt && report.samples.length
        ?(Date.parse(report.samples.at(-1).at)-Date.parse(report.matchStartedAt))/1000:null,
      summary:report.summary,shadow:report.shadow,replaySummary,treatment:report.treatment,
      admissionDebitChecks:{cases:admissions.length,mismatches:mismatches.length},
      changedAtActualSubmission:shadow.filter(e=>e.baselineSubmitted&&e.proposal?.status==='candidate').length};
  });
  const treatmentMatches=runs.filter(r=>r.combatExposure && r.assignedPolicy!=='baseline').length;
  const result={schema:1,evidenceKind:treatmentMatches?'live-official-policy-pilot':'real-baseline-with-offline-action-shadow',
    policyPromotionAllowed:false,candidateTreatmentMatches:treatmentMatches,attempts:runs.length,
    independentMatches:runs.filter(r=>r.combatExposure).length,
    sourceBoundMatches:runs.filter(r=>r.sourceIdentityEligible && r.combatExposure).length,
    limitations:'Development pilots only. No fitted parameters, treatment outcomes, transition-error scoring, official wins, or CPU-strength proof.',runs};
  fs.writeFileSync(target,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({manifest:target,runs:runs.map(r=>({id:r.id,sourceEligible:r.sourceIdentityEligible,
    shadow:r.shadow?.decisions ?? 0,bytes:r.artifact.bytes,debit:r.admissionDebitChecks}))}));
  return result;
}
if(require.main===module)publish(process.argv[2],process.argv.slice(3));
module.exports={publish};
