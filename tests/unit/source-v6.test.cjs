'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const box={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../content/source-adapter.js'),'utf8'),box);
const adapter=box.TIOSourceAdapter;
const signatures=[
 'var k4=bO.g0(12*ah.hb[player],1024)', 'bB.hz.i6(aS.i3(),aE.fW)',
 'this.kF=function(player,aLS)', 'this.n4=function(player){var iI=bR.g6[0];ah.hb[player]-=iI+bR.g6[1]',
 'this.i3=function(){return bO.ij(Math.floor(jC*1024+0.5)-1,0,1023)',
 'this.ka=function(player){return Math.min(100*ah.hN[player],aE.a6e)',
 'this.gg=function(player){return size[player]',
 'gU=ae.gl(gQ,gP);gR=ae.gm(gQ,gP);gS=ae.gn(gQ,gP)',
 'this.hl=function(player){return ah.nU[player]!==0&&ah.a5a[player]!==2',
 '13440-6*bi.kr()', 'this.g0=function(fs,ft){return Math.floor((fs+0.5)/ft)',
 'af=new cd()', 'this.aDc=function(player){return aLZ(player)'];
test('v6 recognition requires every native signature and rejects arithmetic changes',()=>{
 const text=signatures.join('\n')+' '.repeat(80000);
 assert.equal(adapter.detectContract(text),'live-modern-v6');
 for(const token of signatures)assert.equal(adapter.detectContract(text.replace(token,'')),'unknown',token);
 assert.equal(adapter.detectContract(text.replace('iI+bR.g6[1]','iI-bR.g6[1]')),'unknown');
 assert.equal(adapter.detectContract(text.replace('13440-6*','13440-7*')),'unknown');
});
test('v6 facade maps current native identities, attack path and replaced match arrays',()=>{
 const calls=[],token=[];
 const world={window:{},ah:{hb:[1000,50],hN:[10,5],nU:[1,1],h1:token},aE:{fJ:0,fW:2,ku:1},
  bv:{i5:()=>true,i8:()=>true,fS:()=>true},ae:{kF:()=>false,hc:()=>0,gg:()=>0},
  bB:{hz:{i6:(...x)=>calls.push(x)}},aS:{i3:()=>204,dk(){}},bm:{qo:{qp(){}}}};
 vm.runInNewContext(adapter.buildExportSnippet('test','live-modern-v6'),world);
 const g=world.window.__TIO_GAME__,m=g.modern;
 assert.equal(g.contract,'live-modern-v6');assert.equal(g.ah,world.ah);assert.equal(g.ae,world.ae);
 assert.equal(m.balance(0),1000);assert.equal(m.territory(0),10);assert.equal(m.matchToken(),token);
 assert.equal(m.select(0,false,false).target,1);assert.equal(m.select(0,false,true).target,2);
 m.attack(204,1);assert.deepEqual(calls,[[204,1]]);
 world.ah.hb=[700,20];world.ah.h1=[];assert.equal(m.balance(0),700);assert.notEqual(m.matchToken(),token);
 assert.equal(g.shadow.install(()=>{}).err,'native-event-hooks-unavailable');
});
test('explicit binding maps are bijective and reject unsupported remapping',()=>{
 const bindings=adapter.nativeBindings('live-modern-v6');
 for(const values of [Object.values(bindings.globals),Object.values(bindings.members)])assert.equal(new Set(values).size,values.length);
 const fragment='function aJR(){var n=q.aN(12*y.ax[player],1024);return ij.zr[0]+ij.zr[1]+n;}';
 const mapped=adapter.mapNativeSnippet(fragment,'live-modern-v6');
 assert.ok(mapped.includes('function cd()'));assert.ok(mapped.includes('bO.g0(12*ah.hb[player],1024)'));
 assert.equal(adapter.mapNativeSnippet(mapped,'live-modern-v6',true),fragment);
 assert.equal(adapter.mapNativeSnippet(fragment,'live-modern-v4'),fragment);
 assert.throws(()=>adapter.mapNativeSnippet(fragment,'unknown'),/Unsupported/);
 assert.throws(()=>adapter.nativeBindings('unknown'),/Unsupported/);
});
test('retained installed v6 evidence has complete tails and an independently checked command ledger',()=>{
 const crypto=require('node:crypto'),zlib=require('node:zlib'),dir=path.join(__dirname,'../../docs/evidence/eng01');
 const manifest=JSON.parse(fs.readFileSync(path.join(dir,'2026-11-02-eng01.json')));
 const data=fs.readFileSync(path.join(dir,manifest.artifact.file));
 assert.equal(crypto.createHash('sha256').update(data).digest('hex'),manifest.artifact.sha256);
 const evidence=JSON.parse(zlib.gunzipSync(data));assert.equal(evidence.identity.hash,manifest.sourceSha256);
 assert.equal(evidence.report.outcome,'loss');assert.equal(evidence.report.observerTailExported,true);
 assert.equal(evidence.report.final.native.alive,false);assert.equal(evidence.report.final.native.territory,0);
 assert.equal(manifest.strengthClaim,false);assert.equal(manifest.setupErrors,1);
 for(const stats of Object.values(evidence.report.stats)){
  assert.equal(stats.dropped,0);assert.equal(stats.errors,0);assert.equal(stats.retainedEvents,0);assert.equal(stats.active,false);
 }
 const commands=evidence.native.filter(e=>e.kind==='native-command');assert.equal(commands.length,31);
 assert.equal(evidence.planner.filter(e=>e.kind==='submission').length,31);
 assert.equal(evidence.planner.filter(e=>e.kind==='receipt').length,31);
 assert.equal(evidence.planner.filter(e=>e.kind==='decision').length,evidence.report.stats.planner.decisions);
 for(const command of commands){
  const B=BigInt(command.before),tax=(24n*B+1n)/2048n,request=B*BigInt(command.il+1)/1024n;
  const sent=request<B-tax?request:B-tax;
  assert.equal(command.observedDebit,Number(sent+tax));assert.equal(command.after,command.before-command.observedDebit);
 }
 for(const row of evidence.analysis.joined){assert(row.after>=row.reserved);assert.equal(row.debit,row.tax+row.sent);}
});
