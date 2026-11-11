'use strict';
// ENG-01 (2026-11-10): live-modern-v8 recognition, facade and binding-map regressions.
// The signatures below were inspected in the official bundle whose SHA-256 was
// dbf736fa53c9d7bf0e18688a000ce5170f340c97dabe3194af62de181333b16f. They are the
// v7 structural fragments under the bundle's new names, not a hash allowlist.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),crypto=require('node:crypto');
const box={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../content/source-adapter.js'),'utf8'),box);
const adapter=box.TIOSourceAdapter;
const signatures=[
 'var k8=bO.g3(12*ah.he[player],1024)', 'bB.i3.iA(aS.i7(),aE.fZ)',
 'this.kJ=function(player,aNx)', 'this.n8=function(player){var iM=bR.g9[0];ah.he[player]-=iM+bR.g9[1]',
 'this.i7=function(){return bO.io(Math.floor(jG*1024+0.5)-1,0,1023)',
 'this.ke=function(player){return Math.min(100*ah.hQ[player],aE.a8C)',
 'this.gj=function(player){return size[player]',
 'gX=ae.go(gT,gS);gU=ae.gp(gT,gS);gV=ae.gq(gT,gS)',
 'this.hp=function(player){return ah.na[player]!==0&&ah.a77[player]!==2',
 '13440-6*bi.kv()', 'this.g3=function(fv,fw){return Math.floor((fv+0.5)/fw)',
 'af=new ce()', 'this.aFN=function(player){return aO4(player)',
 'this.iA=function(jG,k7){if(aE.hm){return;}if(this.qx){this.qx=0;bm.r0.r1(182,jG);}if(aE.lI){bB.qs.iA(aE.fM,jG,k7);}',
 'this.hm=this.data.a8M'];
const sha=text=>crypto.createHash('sha256').update(text).digest('hex');
const stripGetterNames=text=>text.replace(/get [\w$]+\(\)\{return typeof/g,'get _(){return typeof');

test('v8 recognition requires every native signature and rejects changed arithmetic or guards',()=>{
 const text=signatures.join('\n')+' '.repeat(80000);
 assert.equal(adapter.detectContract(text),'live-modern-v8');
 assert.equal(adapter.classify(text),'live-modern-v8');
 for(const token of signatures)assert.equal(adapter.detectContract(text.replace(token,'')),'unknown',token);
 assert.equal(adapter.detectContract(text.replace('iM+bR.g9[1]','iM-bR.g9[1]')),'unknown');
 assert.equal(adapter.detectContract(text.replace('13440-6*','13440-7*')),'unknown');
 assert.equal(adapter.detectContract(text.replace('12*ah.he','13*ah.he')),'unknown');
 assert.equal(adapter.detectContract(text.replace('(fv+0.5)/fw','(fv+0.4)/fw')),'unknown');
 assert.equal(adapter.detectContract(text.replace('if(aE.hm){return;}','')),'unknown');
 assert.equal(adapter.detectContract(text.replace('this.hm=this.data.a8M','this.hm=0')),'unknown');
});

test('v8 facade maps current identities, refuses commands while spectating and observes replaced arrays',()=>{
 const calls=[],token=[];
 const world={window:{},ah:{he:[1000,50],hQ:[10,5],na:[1,1],h4:token},aE:{fM:0,fZ:2,ky:1,hm:0},
  bw:{i9:()=>true,iC:()=>true,fV:()=>true},ae:{kJ:()=>false,hf:(p,t)=>p===1&&t===0?7:0,gj:()=>0},
  bD:{gy:{ho:()=>true,hp:()=>true}},
  bB:{i3:{iA:(...x)=>calls.push(x)}},aS:{i7:()=>204,dm(){}},bm:{r0:{r1(){}}}};
 vm.runInNewContext(adapter.buildExportSnippet('test','live-modern-v8'),world);
 const g=world.window.__TIO_GAME__,m=g.modern;
 assert.equal(g.contract,'live-modern-v8');assert.equal(g.ah,world.ah);assert.equal(g.ae,world.ae);
 assert.equal(m.balance(0),1000);assert.equal(m.territory(0),10);assert.equal(m.matchToken(),token);
 assert.equal(m.incoming(1,0),7);assert.equal(m.incoming(0,1),0);
 assert.equal(m.frontCap(0),12);assert.equal(m.frontCap(1),4);
 assert.equal(m.select(0,false,false).target,1);assert.equal(m.select(0,false,true).target,2);
 assert.equal(m.readRatio(),205/1024);
 assert.equal(m.spectating(),false);assert.equal(m.canAttack(0),true);
 m.attack(204,1);assert.deepEqual(calls,[[204,1]]);
 world.aE.hm=1;assert.equal(m.spectating(),true);assert.equal(m.canAttack(0),false);
 world.aE.hm=0;world.bD.gy.ho=()=>false;assert.equal(m.canAttack(0),false);
 world.ah.he=[700,20];world.ah.h4=[];assert.equal(m.balance(0),700);assert.notEqual(m.matchToken(),token);
 assert.equal(g.shadow.install(()=>{}).err,'native-event-hooks-unavailable');
});

test('v8 binding map is bijective, collision-free and round-trips the complete recipe',()=>{
 const bindings=adapter.nativeBindings('live-modern-v8');
 for(const values of [Object.values(bindings.globals),Object.values(bindings.members)])assert.equal(new Set(values).size,values.length);
 const v7=adapter.nativeBindings('live-modern-v7');
 assert.deepEqual(Object.keys(bindings.globals).sort(),Object.keys(v7.globals).sort());
 assert.deepEqual(Object.keys(bindings.members).sort(),Object.keys(v7.members).sort());
 const v4=adapter.buildExportSnippet('rt','live-modern-v4'),v8=adapter.mapNativeSnippet(v4,'live-modern-v8');
 // The 16 public getter NAMES are a stable API and stay identical to v7's;
 // each VALUE is this family's name for the same v4 binding (a0f is now bw).
 const getters=s=>[...s.matchAll(/get ([\w$]+)\(\)\{return typeof ([\w$]+)/g)].map(m=>[m[1],m[2]]);
 const g7=getters(adapter.mapNativeSnippet(v4,'live-modern-v7')),g8=getters(v8);
 assert.equal(g8.length,16);assert.deepEqual(g8.map(x=>x[0]),g7.map(x=>x[0]));
 const reverse7=Object.fromEntries(Object.entries(v7.globals).map(([k,v])=>[v,k]));
 for(let i=0;i<16;i++){const key=reverse7[g7[i][1]];assert.equal(g8[i][1],key?bindings.globals[key]:g7[i][1],g8[i][0]);}
 assert.deepEqual(g8.filter(([n,v])=>n!==v),[['bv','bw']]);
 assert.equal(stripGetterNames(adapter.mapNativeSnippet(v8,'live-modern-v8',true)),stripGetterNames(v4));
 const keys=new Set([...Object.keys(bindings.globals),...Object.keys(bindings.members)]);
 const values=new Set([...Object.values(bindings.globals),...Object.values(bindings.members)]);
 assert.deepEqual(stripGetterNames(v4).match(/[A-Za-z_$][\w$]*/g).filter(x=>values.has(x)&&!keys.has(x)),[]);
 const fragment='function aJR(){var n=q.aN(12*y.ax[player],1024);return ij.zr[0]+ij.zr[1]+n;}';
 const mapped=adapter.mapNativeSnippet(fragment,'live-modern-v8');
 assert.ok(mapped.includes('function ce()'));assert.ok(mapped.includes('bO.g3(12*ah.he[player],1024)'));
 assert.ok(mapped.includes('bR.g9[0]+bR.g9[1]'));
 assert.equal(adapter.mapNativeSnippet(mapped,'live-modern-v8',true),fragment);
 assert.throws(()=>adapter.nativeBindings('live-modern-v9'),/Unsupported/);
});

test('v8 export is the mapped v4 recipe plus only the spectating guard; older families are byte-identical',()=>{
 const v4=adapter.buildExportSnippet('golden','live-modern-v4'),v8=adapter.buildExportSnippet('golden','live-modern-v8');
 const back=adapter.mapNativeSnippet(v8,'live-modern-v8',true).replace(/live-modern-v8/g,'live-modern-v4');
 const guarded='canAttack:function(p){return !c.hm&&!!aa.bY.a1D(1)&&!!aa.bY.bZ(p)},spectating:function(){return !!c.hm},';
 assert.equal(back.split(guarded).length,2);
 assert.equal(stripGetterNames(back.replace(guarded,'canAttack:function(p){return !!aa.bY.a1D(1)&&!!aa.bY.bZ(p)},')),stripGetterNames(v4));
 // Golden hashes recorded on main b5eef31 before this repair.
 assert.equal(sha(v4),'1c19c3318b8a97148fe057fc06b27c89fe67aa5c29eb0697ca903b15ce6e0ab6');
 assert.equal(sha(adapter.buildExportSnippet('golden','live-modern-v6')),'272bd15f191d0c1531cb0b4b1dbc4b6e8659ddfa622454d4451b3a4adaf7f186');
 assert.equal(sha(adapter.buildExportSnippet('golden','live-modern-v7')),'6525ec309ac50cda443eb74b13097d5cf7769112611f2ee178e131d526488ec3');
});

test('v7 signatures do not satisfy v8 and v8 signatures do not satisfy v7',()=>{
 const v7=['var k6=bO.g1(12*ah.hc[player],1024)', 'bB.i1.i8(aS.i5(),aE.fX)',
  'this.kH=function(player,aNi)', 'this.n6=function(player){var iK=bR.g7[0];ah.hc[player]-=iK+bR.g7[1]',
  'this.i5=function(){return bO.il(Math.floor(jE*1024+0.5)-1,0,1023)',
  'this.kc=function(player){return Math.min(100*ah.hO[player],aE.a7w)',
  'this.gh=function(player){return size[player]', 'gV=ae.gm(gR,gQ);gS=ae.gn(gR,gQ);gT=ae.go(gR,gQ)',
  'this.hn=function(player){return ah.nY[player]!==0&&ah.a6r[player]!==2',
  '13440-6*bi.kt()', 'this.g1=function(ft,fu){return Math.floor((ft+0.5)/fu)',
  'af=new cd()', 'this.aF6=function(player){return aNp(player)',
  'this.i8=function(jE,k5){if(aE.hk){return;}if(this.qv){this.qv=0;bm.qy.qz(182,jE);}if(aE.lG){bB.qq.i8(aE.fK,jE,k5);}',
  'this.hk=this.data.a86'];
 assert.equal(adapter.detectContract(v7.join('\n')+' '.repeat(80000)),'live-modern-v7');
 // v8 minus its spectating guard must not fall back to any older family.
 assert.equal(adapter.detectContract(signatures.slice(0,13).join('\n')+' '.repeat(80000)),'unknown');
});
