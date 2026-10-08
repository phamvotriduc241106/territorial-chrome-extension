'use strict';
// Independent physical-category audit. Does not refit or recompute predictions.
const fs=require('node:fs'),path=require('node:path');
const{environment,read,summarizeRows}=require('./frontier-study-report.cjs');
const root=path.resolve(__dirname,'..'),study=path.join(root,'scratch/dynamic-frontier-research');
function audit(){const b=environment(),rows=[];
  for(let index=1;index<=24;index++){
    const suffix=String(index).padStart(2,'0'),d=read(path.join(study,'dataset-v2','match-'+suffix+'.json.gz')),
      r=read(path.join(study,'results','study-'+suffix+'.json.gz')),widths=new Map();let s=b.TIOSpatial.restore(d.baseline);
    for(const e of d.records){if(e.event==='native_spatial_delta')s=b.TIOSpatial.advance(s,e,e.territories);
      if(e.event==='research_origin'){const pairs=b.TIOSpatial.contacts(s);
        for(const id of e.forecastFrontIds){const f=e.fronts.find(f=>f.nativeFrontId===id),p=pairs.find(p=>(p.a===f.actor&&p.b===f.target)||(p.b===f.actor&&p.a===f.target));
          widths.set(e.recordId+':'+id,p?(p.a===f.target?p.contactA:p.contactB):0);}}
    }
    for(const row of r.rows){const width=widths.get(row.originRecordId+':'+row.frontId);if(width==null)throw Error('Missing physical origin');
      rows.push({...row,contactWidth:width,physicalCategory:width===0?'no-current-contact':width<=8?'positive-narrow-1-8':width<32?'positive-intermediate-9-31':'positive-wide-32-plus'});}
  }
  const categories={};for(const category of ['no-current-contact','positive-narrow-1-8','positive-intermediate-9-31','positive-wide-32-plus']){
    const subset=rows.filter(r=>r.physicalCategory===category),held=subset.filter(r=>r.split==='held-out');
    categories[category]={all:summarizeRows(subset),heldOut:summarizeRows(held),heldOutValidEpisodes:new Set(held.filter(r=>r.commonSupport).map(r=>r.episodeId)).size,
      heldOutValidMatches:new Set(held.filter(r=>r.commonSupport).map(r=>r.matchId)).size};
  }
  const result={method:'Reconstruct immutable ownership at each forecast origin; exact four-neighbor unique target contact cells. Zero contact is NOT evidence of a narrow border. Frozen predictions unchanged.',categories};
  fs.writeFileSync(path.join(study,'contact-category-audit.json'),JSON.stringify(result,null,2));
  console.log(Object.fromEntries(Object.entries(categories).map(([k,v])=>[k,{valid:v.heldOut.commonSupport,episodes:v.heldOutValidEpisodes,matches:v.heldOutValidMatches}])));return result;
}
if(require.main===module)audit();module.exports={audit};
