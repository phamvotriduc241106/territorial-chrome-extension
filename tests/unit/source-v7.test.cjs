'use strict';
// ENG-01 (2026-11-09): live-modern-v7 recognition, facade and binding-map regressions.
// The signatures below were inspected in the official bundle whose SHA-256 was
// 2c70f903a601cb0725776bb1843567c5efca84bbe61a5a58b8ab44d7ca511066. They are
// structural code fragments, not a hash allowlist.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),crypto=require('node:crypto');
const box={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../content/source-adapter.js'),'utf8'),box);
const adapter=box.TIOSourceAdapter;
const signatures=[
 'var k6=bO.g1(12*ah.hc[player],1024)', 'bB.i1.i8(aS.i5(),aE.fX)',
 'this.kH=function(player,aNi)', 'this.n6=function(player){var iK=bR.g7[0];ah.hc[player]-=iK+bR.g7[1]',
 'this.i5=function(){return bO.il(Math.floor(jE*1024+0.5)-1,0,1023)',
 'this.kc=function(player){return Math.min(100*ah.hO[player],aE.a7w)',
 'this.gh=function(player){return size[player]',
 'gV=ae.gm(gR,gQ);gS=ae.gn(gR,gQ);gT=ae.go(gR,gQ)',
 'this.hn=function(player){return ah.nY[player]!==0&&ah.a6r[player]!==2',
 '13440-6*bi.kt()', 'this.g1=function(ft,fu){return Math.floor((ft+0.5)/fu)',
 'af=new cd()', 'this.aF6=function(player){return aNp(player)',
 'this.i8=function(jE,k5){if(aE.hk){return;}if(this.qv){this.qv=0;bm.qy.qz(182,jE);}if(aE.lG){bB.qq.i8(aE.fK,jE,k5);}',
 'this.hk=this.data.a86'];
const sha=text=>crypto.createHash('sha256').update(text).digest('hex');
const stripGetterNames=text=>text.replace(/get [\w$]+\(\)\{return typeof/g,'get _(){return typeof');

test('v7 recognition requires every native signature and rejects changed arithmetic or guards',()=>{
 const text=signatures.join('\n')+' '.repeat(80000);
 assert.equal(adapter.detectContract(text),'live-modern-v7');
 assert.equal(adapter.classify(text),'live-modern-v7');
 for(const token of signatures)assert.equal(adapter.detectContract(text.replace(token,'')),'unknown',token);
 assert.equal(adapter.detectContract(text.replace('iK+bR.g7[1]','iK-bR.g7[1]')),'unknown');
 assert.equal(adapter.detectContract(text.replace('13440-6*','13440-7*')),'unknown');
 assert.equal(adapter.detectContract(text.replace('12*ah.hc','13*ah.hc')),'unknown');
 assert.equal(adapter.detectContract(text.replace('(ft+0.5)/fu','(ft+0.4)/fu')),'unknown');
 assert.equal(adapter.detectContract(text.replace('if(aE.hk){return;}','')),'unknown');
 assert.equal(adapter.detectContract(text.replace('this.hk=this.data.a86','this.hk=0')),'unknown');
});

test('v7 facade maps current identities, refuses commands while spectating and observes replaced arrays',()=>{
 const calls=[],token=[];
 const world={window:{},ah:{hc:[1000,50],hO:[10,5],nY:[1,1],h2:token},aE:{fK:0,fX:2,kw:1,hk:0},
  bv:{i7:()=>true,iA:()=>true,fT:()=>true},ae:{kH:()=>false,hd:(p,t)=>p===1&&t===0?7:0,gh:()=>0},
  bD:{gw:{hm:()=>true,hn:()=>true}},
  bB:{i1:{i8:(...x)=>calls.push(x)}},aS:{i5:()=>204,dk(){}},bm:{qy:{qz(){}}}};
 vm.runInNewContext(adapter.buildExportSnippet('test','live-modern-v7'),world);
 const g=world.window.__TIO_GAME__,m=g.modern;
 assert.equal(g.contract,'live-modern-v7');assert.equal(g.ah,world.ah);assert.equal(g.ae,world.ae);
 assert.equal(m.balance(0),1000);assert.equal(m.territory(0),10);assert.equal(m.matchToken(),token);
 assert.equal(m.incoming(1,0),7);assert.equal(m.incoming(0,1),0);
 assert.equal(m.frontCap(0),12);assert.equal(m.frontCap(1),4);
 assert.equal(m.select(0,false,false).target,1);assert.equal(m.select(0,false,true).target,2);
 assert.equal(m.readRatio(),205/1024);
 assert.equal(m.spectating(),false);assert.equal(m.canAttack(0),true);
 m.attack(204,1);assert.deepEqual(calls,[[204,1]]);
 world.aE.hk=1;assert.equal(m.spectating(),true);assert.equal(m.canAttack(0),false);
 world.aE.hk=0;world.bD.gw.hm=()=>false;assert.equal(m.canAttack(0),false);
 world.ah.hc=[700,20];world.ah.h2=[];assert.equal(m.balance(0),700);assert.notEqual(m.matchToken(),token);
 assert.equal(g.shadow.install(()=>{}).err,'native-event-hooks-unavailable');
});

test('v7 binding map is bijective, collision-free and round-trips the complete recipe',()=>{
 const bindings=adapter.nativeBindings('live-modern-v7');
 for(const values of [Object.values(bindings.globals),Object.values(bindings.members)])assert.equal(new Set(values).size,values.length);
 const v6=adapter.nativeBindings('live-modern-v6');
 assert.deepEqual(Object.keys(bindings.globals).sort(),Object.keys(v6.globals).sort());
 assert.deepEqual(Object.keys(bindings.members).sort(),Object.keys(v6.members).sort());
 // Canonical v4 recipe -> v7 -> canonical v4 is the identity on every injected byte
 // except the 16 stable public getter NAMES (game.ah, game.ae, ...), which are
 // deliberately v6-era names; each must resolve to the same-named v7 global.
 const v4=adapter.buildExportSnippet('rt','live-modern-v4'),v7=adapter.mapNativeSnippet(v4,'live-modern-v7');
 const getters=[...v7.matchAll(/get ([\w$]+)\(\)\{return typeof ([\w$]+)/g)];
 assert.equal(getters.length,16);for(const m of getters)assert.equal(m[1],m[2],m[0]);
 assert.equal(stripGetterNames(adapter.mapNativeSnippet(v7,'live-modern-v7',true)),stripGetterNames(v4));
 const keys=new Set([...Object.keys(bindings.globals),...Object.keys(bindings.members)]);
 const values=new Set([...Object.values(bindings.globals),...Object.values(bindings.members)]);
 assert.deepEqual(stripGetterNames(v4).match(/[A-Za-z_$][\w$]*/g).filter(x=>values.has(x)&&!keys.has(x)),[]);
 const fragment='function aJR(){var n=q.aN(12*y.ax[player],1024);return ij.zr[0]+ij.zr[1]+n;}';
 const mapped=adapter.mapNativeSnippet(fragment,'live-modern-v7');
 assert.ok(mapped.includes('function cd()'));assert.ok(mapped.includes('bO.g1(12*ah.hc[player],1024)'));
 assert.ok(mapped.includes('bR.g7[0]+bR.g7[1]'));
 assert.equal(adapter.mapNativeSnippet(mapped,'live-modern-v7',true),fragment);
 assert.throws(()=>adapter.mapNativeSnippet(fragment,'unknown'),/Unsupported/);
 assert.throws(()=>adapter.nativeBindings('live-modern-v8'),/Unsupported/);
});

test('v7 export is the mapped v4 recipe plus only the spectating guard; older families are byte-identical',()=>{
 const v4=adapter.buildExportSnippet('golden','live-modern-v4'),v7=adapter.buildExportSnippet('golden','live-modern-v7');
 const back=adapter.mapNativeSnippet(v7,'live-modern-v7',true).replace(/live-modern-v7/g,'live-modern-v4');
 const guarded='canAttack:function(p){return !c.hk&&!!aa.bY.a1D(1)&&!!aa.bY.bZ(p)},spectating:function(){return !!c.hk},';
 assert.equal(back.split(guarded).length,2);
 assert.equal(stripGetterNames(back.replace(guarded,'canAttack:function(p){return !!aa.bY.a1D(1)&&!!aa.bY.bZ(p)},')),stripGetterNames(v4));
 // Golden hashes recorded on main de35c3b before this repair.
 assert.equal(sha(v4),'1c19c3318b8a97148fe057fc06b27c89fe67aa5c29eb0697ca903b15ce6e0ab6');
 assert.equal(sha(adapter.buildExportSnippet('golden','live-modern-v6')),'272bd15f191d0c1531cb0b4b1dbc4b6e8659ddfa622454d4451b3a4adaf7f186');
 assert.equal(sha(adapter.buildExportSnippet('golden','live-modern-v3')),'448c01dcc5b2c12b4315a31ac8509078d08f449f1863ec06e16f6e32c3ed3d9b');
});

test('v6 signatures do not satisfy v7 and v7 signatures do not satisfy v6',()=>{
 const v6=['var k4=bO.g0(12*ah.hb[player],1024)', 'bB.hz.i6(aS.i3(),aE.fW)',
  'this.kF=function(player,aLS)', 'this.n4=function(player){var iI=bR.g6[0];ah.hb[player]-=iI+bR.g6[1]',
  'this.i3=function(){return bO.ij(Math.floor(jC*1024+0.5)-1,0,1023)',
  'this.ka=function(player){return Math.min(100*ah.hN[player],aE.a6e)',
  'this.gg=function(player){return size[player]', 'gU=ae.gl(gQ,gP);gR=ae.gm(gQ,gP);gS=ae.gn(gQ,gP)',
  'this.hl=function(player){return ah.nU[player]!==0&&ah.a5a[player]!==2',
  '13440-6*bi.kr()', 'this.g0=function(fs,ft){return Math.floor((fs+0.5)/ft)',
  'af=new cd()', 'this.aDc=function(player){return aLZ(player)'];
 assert.equal(adapter.detectContract(v6.join('\n')+' '.repeat(80000)),'live-modern-v6');
 // v7 minus its new spectating guard must not fall back to any older family.
 const partial=signatures.slice(0,13).join('\n')+' '.repeat(80000);
 assert.equal(adapter.detectContract(partial),'unknown');
});

test('retained installed v7 evidence has complete tails and an independently checked command ledger',()=>{
 const zlib=require('node:zlib'),dir=path.join(__dirname,'../../docs/evidence/eng01');
 const manifest=JSON.parse(fs.readFileSync(path.join(dir,'2026-11-09-eng01.json')));
 const data=fs.readFileSync(path.join(dir,manifest.artifact.file));
 assert.equal(sha(data),manifest.artifact.sha256);
 const evidence=JSON.parse(zlib.gunzipSync(data));
 assert.equal(evidence.identity.hash,manifest.sourceSha256);assert.equal(evidence.identity.contract,'live-modern-v7');
 assert.equal(evidence.identity.binding,'captured-preloader-synchronous-xhr-response-before-patch');
 assert.equal(evidence.report.outcome,'loss');assert.equal(evidence.report.final,undefined);
 assert.equal(evidence.report.finalNative.alive,false);assert.equal(evidence.report.finalNative.territory,0);
 assert.equal(evidence.report.scenario.nativeDifficulty,5);assert.equal(evidence.report.difficultySelectionVisible,1);
 assert.equal(manifest.strengthClaim,false);assert.equal(manifest.setupErrors,0);
 for(const stats of [evidence.report.shadow.plannerObserver,evidence.report.shadow.nativeObserver]){
  assert.equal(stats.dropped,0);assert.equal(stats.errors,0);assert.equal(stats.retainedEvents,0);assert.equal(stats.active,false);
 }
 const commands=evidence.native.filter(e=>e.kind==='native-command');assert.equal(commands.length,31);
 assert.equal(evidence.planner.filter(e=>e.kind==='submission').length,31);
 assert.equal(evidence.planner.filter(e=>e.kind==='receipt').length,31);
 assert.equal(evidence.planner.filter(e=>e.kind==='decision').length,evidence.report.shadow.plannerObserver.decisions);
 for(const command of commands){
  const B=BigInt(command.before),tax=(24n*B+1n)/2048n,request=B*BigInt(command.il+1)/1024n;
  const sent=request<B-tax?request:B-tax;
  assert.equal(command.observedDebit,Number(sent+tax));assert.equal(command.after,command.before-command.observedDebit);
 }
 assert.equal(evidence.analysis.joined.length,31);
 for(const row of evidence.analysis.joined){assert(row.after>=row.reserved);assert.equal(row.debit,row.tax+row.sent);}
});
