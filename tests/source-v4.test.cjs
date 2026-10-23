'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'../content/source-adapter.js'),'utf8');
const tokens=[
 'var aU0=q.aN(12*y.ax[player],1024)', 'ss.a1M.xn(nl.a1R(),c.c2)',
 'this.q5=function(player,pt)', 'this.aTe=function(player){var po=ij.zr[0];y.ax[player]-=po+ij.zr[1]',
 'this.a1R=function(){return q.a0(Math.floor(a3c*1024+0.5)-1,0,1023)',
 'this.az=function(player){return Math.min(100*y.aO[player],c.aXJ)', 'this.q7=function(player){return size[player]',
 'a0c=a0n.q8(a0o,a0p);a0q=a0n.q9(a0o,a0p);a16=a0n.qD(a0o,a0p)',
 'this.bZ=function(player){return y.an[player]!==0&&y.xR[player]!==2'];
const box={};vm.runInNewContext(source,box);const adapter=box.TIOSourceAdapter;
test('v4 requires every native signature; changed debit or renamed symbols fail closed',()=>{
 const text=tokens.join('\n')+' '.repeat(80000);
 assert.equal(adapter.detectContract(text),'live-modern-v4');
 for(let i=0;i<tokens.length;i++)assert.equal(adapter.detectContract(text.replace(tokens[i],'')),'unknown');
 assert.equal(adapter.detectContract(text.replace('po+ij.zr[1]','po-ij.zr[1]')),'unknown');
});
test('v4 facade keeps raw native identities, selector bank root and replaced match token',()=>{
 const token=[],calls=[];
 const world={window:{},y:{ax:[1000,50],aO:[10,5],an:[1,1],bW:token},c:{t:0,c2:2,aI:1},
   a0f:{a1T:()=>true,a1X:()=>true,a1W:()=>true},a0n:{q5:()=>false,pv:()=>0,q7:()=>0},
   ss:{a1M:{xn:(...x)=>calls.push(x)}},nl:{a1R:()=>204,b:()=>{}},ep:{eq:{er:()=>{}}}};
 vm.runInNewContext(adapter.buildExportSnippet('test','live-modern-v4'),world);
 const g=world.window.__TIO_GAME__,m=g.modern;
 assert.equal(g.ah,world.y);assert.equal(g.ae,world.a0n);assert.equal(m.matchToken(),token);
 assert.equal(m.select(0,false,false).target,1);assert.equal(m.select(0,false,true).target,2);
 m.attack(204,1);assert.deepEqual(calls,[[204,1]]);
 world.y.bW=[];assert.notEqual(m.matchToken(),token);assert.equal(g.shadow.active(),false);
 assert.equal(g.shadow.install(()=>{}).err,'native-event-hooks-unavailable');
});
test('published MCP v4 loop retains all losses, censored smoke and exact native/treatment ledgers',()=>{
 const path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
 const dir=path.join(__dirname,'../docs/live-audits'),m=JSON.parse(fs.readFileSync(path.join(dir,'2026-10-22-mcp-loop-evidence.json')));
 const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
 const read=a=>{const bytes=fs.readFileSync(path.join(dir,a.file));assert.equal(hash(bytes),a.sha256);return JSON.parse(zlib.gunzipSync(bytes));};
 assert.equal(m.policyPromotionAllowed,false);assert.equal(m.statisticalWinRate,null);
 const archive=read(m.runtimeArtifact),h=crypto.createHash('sha256');
 for(const [name,value] of Object.entries(archive.files)){const bytes=Buffer.from(value,'base64');h.update(name+'\0'+bytes.length+'\0').update(bytes);}
 assert.equal(h.digest('hex'),m.comparisonRelease.releaseSha256);
 assert.equal(m.runs.filter(r=>r.comparison&&r.outcome==='loss').length,4);
 let admissions=0,treatment=0;
 for(const r of m.runs){
   const b=read(r.artifact);assert.equal(b.report.sourceSha256,m.sourceSha256);assert.equal(b.report.manualCombatCommands,0);
   assert.equal(b.report.observerTailExported,false);assert.match(m.coverageLimitation,/tail/);
   assert.equal(b.report.accelerated,false);assert.equal(b.report.ownedProfile,undefined);
   assert.equal(r.observerDropped,0);assert.equal(r.observerErrors,0);assert.equal(r.pageErrors,0);
   assert.equal(r.analysis.joinedCommands,r.nativeCommands);assert.equal(r.analysis.unjoinedReceipts,0);
   const commands=b.native.filter(e=>e.kind==='native-command');assert.equal(commands.length,r.nativeCommands);
   for(const n of commands){const tax=Math.floor((12*n.before+.5)/1024),sent=Math.min(Math.floor(n.before*(n.il+1)/1024),Math.max(0,n.before-tax));
     assert.equal(n.observedDebit,sent+tax);assert.equal(n.after,n.before-n.observedDebit);admissions++;}
   for(const e of b.planner.filter(e=>e.kind==='receipt')){const v=e.result?.last||e.result;
     if(v?.ok&&v.experimental){assert.ok(v.balance>=v.experimental.requiredReserve);assert.ok(v.experimental.observedDebit<=v.experimental.maxDebit);treatment++;}
     assert.equal(e.nativeAckTick,null);}
   if(r.comparison){assert.equal(b.report.finalNative.alive,false);assert.equal(b.report.finalNative.territory,0);}
   else{assert.equal(r.id,'final-smoke');assert.equal(r.outcome,'censored-time-limit');assert.equal(b.report.release.releaseSha256,m.finalRelease.releaseSha256);}
 }
 assert.equal(admissions,102);assert.equal(treatment,41);
});
