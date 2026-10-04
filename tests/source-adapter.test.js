(function () {
  'use strict';
  const adapter = globalThis.TIOSourceAdapter;
  const source = globalThis.SOURCE_TEXT;
  let assertions = 0;
  function assert(condition, message) {
    assertions++;
    if (!condition) throw new Error(message);
  }

  assert(adapter && source, 'adapter and source loaded');
  const report = adapter.inspect(source);
  assert(report.kind === 'readable-legacy', 'readable dump classification');
  assert(report.patchable, 'true IIFE tail found');
  assert(report.readableFunctions === 5, 'engine functions detected');
  assert(report.insertionPoint > source.length * 0.95, 'insertion constrained to tail');

  const snippet = ';window.__TIO_GAME__={test:true};';
  const patched = adapter.patch(source, snippet);
  assert(patched && patched.length === source.length + snippet.length, 'single insertion length');
  assert(patched.slice(0, report.insertionPoint) === source.slice(0, report.insertionPoint), 'prefix unchanged');
  assert(patched.slice(report.insertionPoint + snippet.length) === source.slice(report.insertionPoint), 'suffix unchanged');
  assert(adapter.patch(patched, snippet) === patched, 'patch idempotent');
  assert(adapter.patch('not a game', snippet) === null, 'non-game rejected');

  const collisionSource = 'canvasA territorial.io ' + 'x'.repeat(80000) +
    ' function cE(){} function dF(){} function dJ(){} function dD(){} function dU(){} })();';
  assert(adapter.detectContract(collisionSource) === 'unknown', 'short-name collisions are not trusted');
  assert(adapter.classify(collisionSource) === 'minified-live', 'unknown game remains fallback-compatible');

  const modernSource = 'canvasA ' + 'x'.repeat(80000) + [
    'var jw=bO.fs(12*ah.hT[player],1024);',
    'bB.hr.hy(aS.hv(),aE.fO);',
    'this.jz=function(player,k0){};',
    'this.k6=function(player){};',
    'if(bO.fs(ah.hT[player],8)>ah.hT[jv]){}',
    'this.hv=function(){return bO.iZ(Math.floor(j4*1024+0.5)-1,0,1023);};',
    '})();'
  ].join('');
  assert(adapter.detectContract(modernSource) === 'live-modern', 'modern structural contract detected');
  assert(adapter.classify(modernSource) === 'live-modern', 'modern game classified');
  assert(adapter.buildExportSnippet('10.1.0', 'live-modern').indexOf('live-modern-v1') >= 0,
    'modern contract embedded in export');

  const modernV3Source = 'canvasA ' + 'x'.repeat(80000) + [
    'var k4=bO.g0(12*ah.hb[player],1024);',
    'bB.hz.i6(aS.i3(),aE.fW);',
    'this.k7=function(player,k8){};',
    'this.kE=function(player){};',
    'if(bO.g0(ah.hb[player],8)>ah.hb[k3]){}',
    'this.i3=function(){return bO.ij(Math.floor(jC*1024+0.5)-1,0,1023);};',
    'this.ka=function(player){return Math.min(100*ah.hN[player],aE.a6d);};',
    'this.gg=function(player){return size[player];};',
    '})();'
  ].join('');
  assert(adapter.detectContract(modernV3Source) === 'live-modern-v3', 'latest structural contract detected');
  assert(adapter.classify(modernV3Source) === 'live-modern-v3', 'latest game classified');
  assert(adapter.buildExportSnippet('10.2.2', 'live-modern-v3').indexOf('live-modern-v3') >= 0,
    'latest contract embedded in export');
  assert(adapter.buildExportSnippet('10.1.0', 'readable-legacy').indexOf('legacy-v1') >= 0,
    'legacy contract embedded in export');

  const realSnippet = adapter.buildExportSnippet('10.1.0-test');
  assert(realSnippet.indexOf('get readable()') >= 0, 'legacy adapter exported');
  assert(realSnippet.indexOf('ca(g,t)') >= 0, 'team predicate enforced');
  assert(realSnippet.indexOf('activeCount:function') >= 0, 'live active-front counter exported');
  assert(realSnippet.indexOf('softCap:function') >= 0, 'live exact soft-cap getter exported');
  const realPatched = adapter.patch(source, realSnippet);
  const scriptOpen = realPatched.indexOf('<script');
  const scriptStart = realPatched.indexOf('>', scriptOpen) + 1;
  const scriptEnd = realPatched.lastIndexOf('</script>');
  assert(scriptOpen >= 0 && scriptStart > scriptOpen && scriptEnd > scriptStart, 'inline game script extracted');
  new Function(realPatched.slice(scriptStart, scriptEnd));
  assertions++;

  // Execute the real export against a tiny closure model. Player 2 is an ally,
  // player 3 is an enemy, and 99 is free land.
  globalThis.__TIO_GAME__ = null;
  const fixture = `(function(){
    var b1=99,aO=[0,1,2,3],bF=[];bF[1]=[10];
    var owners={11:2,12:3,13:1},ay={
      b9:function(n){return n===10},
      b8:function(n){return owners[n]},
      b7:function(n){return owners[n]!=null}
    };
    function ca(g,t){return t!==2}
    var cb=[],cZ=0;
    function cR(g,k){cZ=0;for(var q=0;q<4;q++){
      var n=bF[g][0]+aO[q],t=ay.b9(n)?b1:ay.b8(n);
      if(t===b1||(ay.b7(n)&&t!==g&&(k||ca(g,t))))cb[cZ++]=t
    }return cZ>0}
    function cd(g,k){return cR(g,k)}
    function ce(){for(var i=cZ-1;i>=0;i--)if(cb[i]===b1){cb.splice(i,1);cZ--;return true}return false}
    var aX={active:{},ch:function(g,t){return !!this.active[t]}};
    function cg(g){for(var i=cZ-1;i>=0;i--)if(aX.ch(g,cb[i])){cb.splice(i,1);cZ--}return cZ===0}
    function cl(){return cb[0]}
    function co(){return cb[cZ-1]}
    ${realSnippet}
  })();`;
  new Function(fixture)();
  const legacy = globalThis.__TIO_GAME__.readable;
  const neighbors = legacy.neighbors(1, false, true);
  assert(neighbors.indexOf(2) < 0, 'ally excluded from neighbors');
  assert(neighbors.indexOf(3) >= 0 && neighbors.indexOf(99) >= 0, 'enemy and free land retained');
  assert(legacy.contains(1, 2) === false, 'ally rejected by exact adjacency proof');
  assert(legacy.contains(1, 3) === true, 'enemy accepted by exact adjacency proof');
  assert(legacy.contains(1, 99) === true, 'free land accepted by exact adjacency proof');
  const selected = legacy.select(1, false, true, false);
  assert(selected && selected.target === 3 && selected.empty === false, 'weak enemy selected after free removal');
  globalThis.__TIO_GAME__.aX.active[99] = true;
  assert(legacy.available(1, 99) === false, 'active target excluded from actionable adjacency');
  delete globalThis.__TIO_GAME__.aX.active[99];
  assert(legacy.available(1, 99) === true, 'inactive target remains actionable');

  print(`source-adapter.test.js: PASS (${assertions} assertions)`);
})();
