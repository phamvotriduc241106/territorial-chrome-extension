'use strict';
const {evaluateOpeningBudget,reviewBanking}=require('./contact-risk-candidate.cjs');
function createAnalysis(core, sourceHash, options = {}) {
  const lookups=new Map(),pendingNative=[],submissions=new Map();
  let nativeIncomplete=false,lookupEntries=0;
  const maxLookupEntries=options.maxLookupEntries??20000;
  if(!Number.isSafeInteger(maxLookupEntries)||maxLookupEntries<1)throw Error('Invalid lookup bound');
  const summary={decisions:0,supported:0,unsupported:0,reasons:{},changedProposals:0,
    holdProposals:0,capProposals:0,bankingLossAdvisories:0,submissions:0,receipts:0,
    nativeCommands:0,joinedCommands:0,unjoinedReceipts:0,policyInfluence:false};
  function reason(r){summary.reasons[r]=(summary.reasons[r]||0)+1;}
  function nativeBatch(events, quality = {}){
    if(quality.dropped>0||quality.errors>0){nativeIncomplete=true;lookups.clear();lookupEntries=0;}
    for(const e of events){
      if(e.kind==='incoming-lookup'){
        if(nativeIncomplete)continue;
        const key=`${e.tick}:${e.actor}:${e.exclude}`;
        let item=lookups.get(key);if(!item){item={valid:new Set(),error:false};lookups.set(key,item);lookupEntries++;}
        if(e.valid&&!item.valid.has(e.value)){item.valid.add(e.value);lookupEntries++;}else if(!e.valid)item.error=true;
        if(lookupEntries>maxLookupEntries){nativeIncomplete=true;lookups.clear();lookupEntries=0;}
      }else if(e.kind==='native-command'){summary.nativeCommands++;pendingNative.push(e);}
    }
    // Rolling join window; full raw events remain in the external journal.
    const ticks=events.filter(e=>Number.isFinite(e.tick)).map(e=>e.tick);
    if(ticks.length && !options.keepAllLookups){const minimum=Math.max(...ticks)-90;
      for(const [key,item] of lookups)if(Number(key.split(':')[0])<minimum){
        lookupEntries-=1+item.valid.size;lookups.delete(key);}}
    if(pendingNative.length>512)pendingNative.splice(0,pendingNative.length-512);
  }
  function decision(event){
    summary.decisions++;
    const n=event.native,s=event.situation;
    let reject=nativeIncomplete?'native-observer-incomplete':event.pipelineError?'original-pipeline-error':null;
    if(!n||!s||event.sourceHash!==sourceHash||n.balance!==s.balance||n.territory!==s.territory||n.gameTick!==s.tick)
      reject='snapshot-input-mismatch';
    const physical=n?.physicalNeighbors;
    const actors=Array.isArray(n?.enemies)?n.enemies:[];
    const ids=Array.isArray(physical)?physical.filter(id=>id!==n.player&&id!==n.neutralId):null;
    if(!reject && (!ids||new Set(ids).size!==ids.length||actors.length!==ids.length||
      actors.some(e=>!ids.includes(e.id))))reject='incomplete-physical-coverage';
    if(!reject)for(const e of actors){const v=lookups.get(`${n.gameTick}:${e.id}:${n.player}`);
      if(!v||v.error||!v.valid.has(e.incoming)){reject='unverified-incoming-field';break;}}
    if(!reject && (!event.rawPlan||event.commitSummary?.maxSpend!==event.rawPlan.maxSpendTotal))
      reject='incomplete-approved-plan';
    if(reject){summary.unsupported++;reason(reject);return{decisionId:event.decisionId,status:'unsupported',reason:reject};}
    const snapshot={matchId:n.matchId,stateVersion:n.stateVersion,sourceHash,
      ageMs:event.ageMs,coverage:'complete-adjacent',
      situation:{...s,adjEnemies:actors}}; // Explicit risk view, original situation kept in raw event.
    const baseline={matchId:n.matchId,stateVersion:n.stateVersion,sourceHash,
      decision:event.finalDecision,plan:event.approvedPlan};
    const expected={matchId:n.matchId,sourceHash,minStateVersion:n.stateVersion};
    const proposal=evaluateOpeningBudget(core,snapshot,baseline,expected);
    const advisory=reviewBanking(snapshot,baseline,expected);
    reason(proposal.reason);
    if(proposal.status==='unsupported')summary.unsupported++;else summary.supported++;
    if(proposal.status==='candidate'){summary.changedProposals++;
      if(proposal.canAfford)summary.capProposals++;else summary.holdProposals++;}
    if(advisory.needsReview)summary.bankingLossAdvisories++;
    return{decisionId:event.decisionId,tick:n.gameTick,stateVersion:n.stateVersion,
      baselineSubmitted:event.submittedCommands.length>0,riskView:'native-all-retained-physical-actors',
      proposal,advisory};
  }
  function plannerBatch(events){
    const out=[];
    for(const e of events){
      if(e.kind==='decision')out.push(decision(e));
      else if(e.kind==='submission'){summary.submissions++;submissions.set(e.commandId,e);
        if(submissions.size>512)submissions.delete(submissions.keys().next().value);}
      else if(e.kind==='receipt'){
        summary.receipts++;const issued=e.result?.last||e.result;
        const s=submissions.get(e.commandId);
        // Join only affirmative matching native admissions in the receipt interval.
        const matches=s&&issued?.ok?pendingNative.map((n,index)=>({n,index})).filter(({n})=>
          n.error===null&&n.target===issued.target&&n.il===issued.il&&
          Date.parse(n.at)>=Date.parse(s.at)&&Date.parse(n.at)<=Date.parse(e.at)):[];
        const index=matches.length===1?matches[0].index:-1;
        if(index>=0){const native=pendingNative.splice(index,1)[0];summary.joinedCommands++;
          out.push({commandId:e.commandId,nativeCommandId:native.nativeCommandId,kind:'command-join',
            nativeAdmissionTick:native.beforeTick,nativeAckTick:null,observedDebit:native.observedDebit,
            target:native.target,il:native.il,joinMethod:'single-flight receipt interval + exact native target/code'});
        }else if(issued?.ok){summary.unjoinedReceipts++;}
        submissions.delete(e.commandId);
      }
    }
    return out;
  }
  return{nativeBatch,plannerBatch,summary:()=>({...summary,validCoverage:summary.decisions?
    summary.supported/summary.decisions:null,retainedLookupKeys:lookups.size,
    retainedLookupEntries:lookupEntries,maxLookupEntries,
    unjoinedNative:pendingNative.length,nativeIncomplete})};
}
module.exports={createAnalysis};
