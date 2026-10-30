'use strict';
// Frozen development safety pilot. No tuning, retries, promotion or multiplayer.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {run}=require('./live-chrome-audit.cjs'),{currentRelease}=require('./very-hard-standard.cjs');
const root = require("../lib/repository.cjs").root,sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const planFile=path.join(root,'docs/evidence/live/2026-10-14-capital-pilot-plan.json');
async function main(command){
  if(command==='--freeze'){
    const plan={schema:1,createdAt:new Date().toISOString(),kind:'development-safety-pilot-not-final-validation',
      policyPromotionAllowed:false,release:currentRelease(),
      policySha256:sha(fs.readFileSync(path.join(root,'shared/capital-policy.js'))),
      expectedSourceSha256:'155a2db1cc6f256317fc6178ce12993c76b51630ba5985be4e9ef1d7cad7fcff',
      conditions:{difficultyLabel:'Impossible',players:512,seconds:300,shadow:true},
      ordering:'Preassigned counterbalanced order, not randomized or paired; geographic bot placement not frozen.',
      schedule:[{id:1,policy:'baseline',mapLabel:'Asia'},{id:2,policy:'capital-v1',mapLabel:'Asia'},
        {id:3,policy:'capital-v1',mapLabel:'Europe'},{id:4,policy:'baseline',mapLabel:'Europe'}]};
    fs.writeFileSync(planFile,JSON.stringify(plan,null,2)+'\n',{flag:'wx'});console.log(planFile);return;
  }
  if(command!=='--run')throw Error('Use --freeze before --run');
  const plan=JSON.parse(fs.readFileSync(planFile));
  const verify=()=>{if(JSON.stringify(currentRelease())!==JSON.stringify(plan.release)||
    sha(fs.readFileSync(path.join(root,'shared/capital-policy.js')))!==plan.policySha256)
      throw Error('Frozen runtime changed; do not mix policies in this cohort');};
  const indexPath=path.join(root,'scratch/live-chrome-audit/capital-pilot-2026-10-14-index.json');
  if(fs.existsSync(indexPath))throw Error('Do not rerun/overwrite an assigned pilot');
  const results=[];
  fs.writeFileSync(indexPath,JSON.stringify({planFile,results}),{flag:'wx'});
  for(const assignment of plan.schedule){
    verify();const output=path.join(root,'scratch/live-chrome-audit',
      new Date().toISOString().replace(/[:.]/g,'-')+'-capital-'+assignment.id);
    console.log(JSON.stringify({assignment,output}));
    let report;
    try{report=await run({...plan.conditions,...assignment,output});}
    catch(error){report=fs.existsSync(path.join(output,'report.json'))?JSON.parse(fs.readFileSync(path.join(output,'report.json'))):{outcome:'error',error:String(error)};}
    results.push({...assignment,reportPath:path.join(output,'report.json'),outcome:report.outcome});
    fs.writeFileSync(indexPath,JSON.stringify({planFile,results},null,2));
    if(report.sourceSha256!==plan.expectedSourceSha256)throw Error('Source changed; pilot stopped with attempt retained');
    if(report.treatment?.reserveViolations || report.treatment?.debitCeilingViolations)
      throw Error('Safety violation; pilot stopped, no policy promotion');
    if(assignment.policy!=='baseline' && report.outcome!=='error' && !report.treatment?.validatedReceipts)
      throw Error('No verified candidate admission; stop rather than mislabel baseline gameplay');
  }
  console.log(JSON.stringify({indexPath,results}));
}
if(require.main===module)main(process.argv[2]).catch(e=>{console.error(e);process.exitCode=1;});
module.exports={main};
