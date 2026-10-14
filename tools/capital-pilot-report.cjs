'use strict';
const fs=require('node:fs'),path=require('node:path');
const {publish}=require('./publish-planner-shadow.cjs');
const root=path.resolve(__dirname,'..');
function report(){
  const plan=require('../docs/live-audits/2026-10-14-capital-pilot-plan.json');
  const index=JSON.parse(fs.readFileSync(path.join(root,'scratch/live-chrome-audit/capital-pilot-2026-10-14-index.json')));
  if(index.results.length!==plan.schedule.length)throw Error('Incomplete pilot; keep remaining assignments in scope');
  const rows=index.results.map((r,i)=>{
    const raw=JSON.parse(fs.readFileSync(r.reportPath));
    if(r.id!==plan.schedule[i].id || raw.assignedPolicy!==plan.schedule[i].policy ||
        raw.mapLabel!==plan.schedule[i].mapLabel || raw.release.releaseSha256!==plan.release.releaseSha256 ||
        raw.sourceSha256!==plan.expectedSourceSha256)throw Error('Assignment identity mismatch');
    const readEvents=file=>{const p=path.join(path.dirname(r.reportPath),file);return fs.existsSync(p)
      ?fs.readFileSync(p,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];};
    const decisions=readEvents('planner-events.ndjson'),native=readEvents('native-observer-events.ndjson');
    const frames=new Map(decisions.filter(e=>e.kind==='decision').map(e=>[e.decisionId,e]));
    const admitted=decisions.filter(e=>e.kind==='receipt' && (e.result?.last||e.result)?.ok);
    const changedAdmissions=admitted.filter(e=>{const f=frames.get(e.decisionId);
      return f?.experiment?.reason==='capital-v1-contact-cap' || f?.experiment?.decisionChanged;}).length;
    const peak=raw.samples.reduce((a,b)=>!a || a.native.territory<b.native.territory?b:a,null);
    const contacts=raw.samples.find(s=>s.native.enemies?.length>0);
    return {id:r.id,map:r.mapLabel,policy:r.policy,outcome:raw.outcome,
      elapsedSeconds:raw.matchStartedAt && raw.samples.length?(Date.parse(raw.samples.at(-1).at)-Date.parse(raw.matchStartedAt))/1000:null,
      peakTerritory:peak?.native.territory??null,
      commands:raw.summary?.maxAcknowledgedCommands??null,maxFailureStreak:raw.summary?.maxObservedFailureStreak??null,
      treatment:raw.treatment,changedAdmissions,nativeCommands:native.filter(e=>e.kind==='native-command').length,
      sourceBound:raw.sourceBinding==='captured-preloader-synchronous-xhr-response-before-patch',coverage:raw.shadow?.validCoverage??null,
      shadowUnsupported:raw.shadow?.reasons??null,
      firstSampledContact:contacts?{tick:contacts.native.gameTick,balance:contacts.native.balance,
        territory:contacts.native.territory,contacts:contacts.native.enemies.length}:null,
      lastObserved:raw.samples.length?{tick:raw.samples.at(-1).native.gameTick,balance:raw.samples.at(-1).native.balance,
        territory:raw.samples.at(-1).native.territory}:null};
  });
  publish('docs/live-audits/2026-10-14-capital-pilot-evidence.json',index.results.map(r=>r.reportPath));
  const result={schema:1,kind:'four-match-development-safety-screen',plan:'2026-10-14-capital-pilot-plan.json',
    runtimeCheckpoint:'f6b0071',evidence:'2026-10-14-capital-pilot-evidence.json',rows,
    policyPromotionAllowed:false,prospectiveWinRate:null,heldOutMatches:0,
    uncertainty:'Two matches per arm, one per map; nonrandom preassigned order, placements not frozen. No strength inference or independent-tick statistics.'};
  fs.writeFileSync(path.join(root,'docs/live-audits/2026-10-14-capital-pilot-summary.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify(result,null,2));return result;
}
if(require.main===module)report();module.exports={report};
