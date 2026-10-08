'use strict';
// Experiment bookkeeping only; never overwrite an existing freeze or open final data.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {read}=require('./frontier-study-report.cjs');
const root=path.resolve(__dirname,'..'),study=path.join(root,'scratch/dynamic-frontier-research');
const files=['content/frontier-dynamic.js','content/frontier-spatial.js','content/source-adapter.js',
  'content/frontier-episodes.js','content/main-hook.js','tools/frontier-study-record.cjs','tools/frontier-study-report.cjs'];
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function check(freeze){for(const[file,sha]of Object.entries(freeze.files)){
  if(hash(path.join(root,file))!==sha)throw Error('Frozen pipeline changed: '+file);
}return freeze;}
function run(mode){const output=path.join(study,'candidate-freeze.json');
  if(mode==='--check')return check(JSON.parse(fs.readFileSync(output)));
  if(mode!=='--create')throw Error('Use --create before final recording, or --check');
  if(fs.existsSync(output))throw Error('Existing freeze must not be overwritten');
  const directory=path.join(study,'dataset-v2');
  for(let i=17;i<=24;i++)if(fs.existsSync(path.join(directory,'match-'+i+'.json.gz')))throw Error('Final match already exists');
  const dev=[];for(let i=1;i<=16;i++){
    const d=read(path.join(directory,'match-'+String(i).padStart(2,'0')+'.json.gz'));
    if(d.index!==i||!d.complete||d.startTick!==0||d.finalAlive>1||d.split!=='development')throw Error('Invalid development match '+i);
    dev.push(d);
  }
  const sourceSha256=dev[0].sourceSha256;
  if(dev.some(d=>d.sourceSha256!==sourceSha256))throw Error('Mixed official sources');
  const report=JSON.parse(fs.readFileSync(path.join(study,'results/development-report.json')));
  if(report.completeMatches!==16||report.heldOutMatches!==0||report.sourceHashes.length!==1||report.sourceHashes[0]!==sourceSha256)
    throw Error('Development evaluation is incomplete or source mismatch');
  const freeze={frozenAt:new Date().toISOString(),baseline:'3488aab53cb57f75855a9b633007ed6bb489fecf',
    finalHeldOutIndices:Array.from({length:8},(_,i)=>i+17),developmentIndices:Array.from({length:16},(_,i)=>i+1),
    tunedCandidateParameters:0,candidate:'native-ordered-dynamic-frontier-shadow',sourceSha256,
    files:Object.fromEntries(files.map(file=>[file,hash(path.join(root,file))]))};
  fs.writeFileSync(output,JSON.stringify(freeze,null,2),{flag:'wx'});return freeze;
}
if(require.main===module)console.log(JSON.stringify(run(process.argv[2]),null,2));
module.exports={check,run};
