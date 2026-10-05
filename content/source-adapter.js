/** Pure source recognition/patch placement for closure-scoped game bundles. */
(function (root) {
  'use strict';
  if (root.TIOSourceAdapter) return;

  const REQUIRED_READABLE = ['function cE(', 'function dF(', 'function dJ(', 'function dD(', 'function dU('];

  function compact(text) {
    return String(text || '').replace(/\s+/g, '');
  }

  /** Names are deliberately insufficient: the live game reuses short symbols. */
  function detectContract(text) {
    if (typeof text !== 'string' || text.length < 80000) return 'not-game';
    const code = compact(text);
    const legacy = [
      'functioncE(g,k,y,l){varu=al(3*aq[g],256)',
      'functiondJ(g,k,y){if(al(aq[g],8)>aq[y])',
      'functiondF(g,k){vary=b1,l=ax[g].length;cQ(g)',
      'functiondD(g,k,y){!cR(g,!0)&&!cd(g,!0)||cg(g)||',
      'this.dI=[0,0,0,0,50,90]'
    ];
    if (legacy.every((token) => code.indexOf(token) >= 0)) return 'readable-legacy';

    const modern = [
      'varjw=bO.fs(12*ah.hT[player],1024)',
      'bB.hr.hy(aS.hv(),aE.fO)',
      'this.jz=function(player,k0)',
      'this.k6=function(player)',
      'bO.fs(ah.hT[player],8)>ah.hT[jv]',
      'this.hv=function(){returnbO.iZ(Math.floor(j4*1024+0.5)-1,0,1023)'
    ];
    if (modern.every((token) => code.indexOf(token) >= 0)) return 'live-modern';
    const modernV2 = [
      'varjx=bO.ft(12*ah.hU[player],1024)',
      'bB.hs.hz(aS.hw(),aE.fP)',
      'this.k0=function(player,k1)',
      'this.k7=function(player)',
      'bO.ft(ah.hU[player],8)>ah.hU[jw]',
      'this.hw=function(){returnbO.ia(Math.floor(j5*1024+0.5)-1,0,1023)',
      'this.kT=function(player){returnMath.min(100*ah.hG[player],aE.a6Y)',
      'this.gZ=function(player){returnsize[player]'
    ];
    if (modernV2.every((token) => code.indexOf(token) >= 0)) return 'live-modern-v2';
    const modernV3 = [
      'vark4=bO.g0(12*ah.hb[player],1024)',
      'bB.hz.i6(aS.i3(),aE.fW)',
      'this.k7=function(player,k8)',
      'this.kE=function(player)',
      'bO.g0(ah.hb[player],8)>ah.hb[k3]',
      'this.i3=function(){returnbO.ij(Math.floor(jC*1024+0.5)-1,0,1023)',
      'this.ka=function(player){returnMath.min(100*ah.hN[player],aE.a6d)',
      'this.gg=function(player){returnsize[player]'
    ];
    if (modernV3.every((token) => code.indexOf(token) >= 0)) return 'live-modern-v3';
    return 'unknown';
  }

  // Version-specific symbols stop here. The controller consumes this stable API.
  function modernExport(sourceKind) {
    const m = sourceKind === 'live-modern-v3' ? {
      bank: 'hb', land: 'hN', alive: 'nU', me: 'fJ', neutral: 'fW', humans: 'ku',
      free: 'i5', adjacent: 'i8', hostile: 'fS', active: 'kF', count: 'gg',
      incoming: 'hc', cap: 'ka', tick: 'kr', slider: 'i3', reload: 'dk',
      sender: 'hz.i6', storage: 'qo.qp', single: 'lE', guard: 'gv', playing: 'hk', living: 'hl'
    } : sourceKind === 'live-modern-v2' ? {
      bank: 'hU', land: 'hG', alive: 'nN', me: 'fC', neutral: 'fP', humans: 'kn',
      free: 'hy', adjacent: 'i1', hostile: 'fL', active: 'k8', count: 'gZ',
      incoming: 'hV', cap: 'kT', tick: 'kk', slider: 'hw', reload: 'dk',
      sender: 'hs.hz', storage: 'qh.qi', single: 'l7', guard: 'go', playing: 'hd', living: 'he'
    } : {
      bank: 'hT', land: 'hF', alive: 'nM', me: 'fB', neutral: 'fO', humans: 'km',
      free: 'hx', adjacent: 'i0', hostile: 'fK', active: 'k7', count: 'gY',
      incoming: 'hU', cap: 'kS', tick: 'kj', slider: 'hv', reload: 'di',
      sender: 'hr.hy', storage: 'po.pp', single: 'l6', guard: 'gn', playing: 'hc', living: 'hd'
    };
    // Economy/settings and outgoing fronts are mapped only for the source whose
    // symbols and arithmetic have been verified. Older adapters return null.
    const planningExport = sourceKind === 'live-modern-v3' ? `
        economy:function(p){if(!af||typeof af.aDb!=='function'||!aE.data)return null;
          var d=aE.data;return {contract:'live-modern-v3',mapCells:aE.ke,playerSlots:aE.fW,
            interestRateBps:af.aDb(p),interestType:d.iIncomeType,
            interestValue:d.iIncomeType===2?d.iIncomeData[p]:d.iIncomeValue,
            interestDisabled:!!(bD.gv.kH(p)&&p<aE.ku),
            territoryIncomeValue:d.tIncomeType===0?32:d.tIncomeType===1?d.tIncomeValue:d.tIncomeData[p],
            additionalIncomeType:d.aIncomeType,
            additionalIncomeValue:d.aIncomeType===2?d.aIncomeData[p]:d.aIncomeValue,
            softCapMaximum:aE.a6d,hardCapPerCell:aE.a5l,hardCapMaximum:aE.a5m,
            debt:ah.a5j?ah.a5j[p]:0}},
        outgoing:function(p){var a=[];for(var i=0;i<ae.gg(p);i++)a.push({
          targetId:ae.gl(p,i)===aE.fW?'neutral':ae.gl(p,i),troops:ae.gm(p,i)});return a},` : `
        economy:function(){return null},outgoing:function(){return []},`;
    return `get modern(){
      if(typeof ah==='undefined'||!ah||!ah.${m.bank}||!ah.${m.land}||!ah.${m.alive}||
        typeof aE==='undefined'||!aE||typeof aE.${m.me}!=='number'||
        typeof bv==='undefined'||!bv||typeof bv.${m.free}!=='function'||
        typeof bv.${m.adjacent}!=='function'||typeof bv.${m.hostile}!=='function'||
        typeof ae==='undefined'||!ae||typeof ae.${m.active}!=='function')return null;
      return {
        me:function(){return aE.${m.me}}, neutral:function(){return aE.${m.neutral}},
        balance:function(p){return ah.${m.bank}[p]}, territory:function(p){return ah.${m.land}[p]},
        alive:function(p){return !!ah.${m.alive}[p]},
        active:function(p,t){return !!ae.${m.active}(p,t)},
        incoming:function(p,t){return ae.${m.incoming}(p,t)},
        activeCount:function(p){return ae.${m.count}(p)},
        frontCap:function(p){return p<aE.${m.humans}?(aE.${m.humans}<16?12:8):4},
        softCap:function(p){return af.${m.cap}(p)}, gameTick:function(){return bi.${m.tick}()},
        ${planningExport}
        singlePlayer:function(){return !!aE.${m.single}},
        canAttack:function(p){return !!bD.${m.guard}.${m.playing}(1)&&!!bD.${m.guard}.${m.living}(p)},
        attack:function(code,t){return bB.${m.sender}(code,t)},
        readRatio:function(){return (aS.${m.slider}()+1)/1024},
        setRatio:function(code){bm.${m.storage}(182,code);aS.${m.reload}()},
        neighbors:function(p,x){var a=[],n=aE.${m.neutral};
          if(bv.${m.free}(p)&&(!x||!ae.${m.active}(p,n)))a.push(n);
          for(var t=0;t<n;t++)if(t!==p&&ah.${m.alive}[t]&&bv.${m.hostile}(p,t)&&
            bv.${m.adjacent}(p,t)&&(!x||!ae.${m.active}(p,t)))a.push(t);return a},
        contains:function(p,t){return t===aE.${m.neutral}?!!bv.${m.free}(p):
          t>=0&&t<aE.${m.neutral}&&!!ah.${m.alive}[t]&&!!bv.${m.hostile}(p,t)&&!!bv.${m.adjacent}(p,t)},
        available:function(p,t){return !ae.${m.active}(p,t)&&this.contains(p,t)},
        select:function(p,y,l){var a=this.neighbors(p,true),n=aE.${m.neutral},b=-1,s=Infinity;
          if(l&&a.indexOf(n)>=0)return {target:n,empty:true};
          for(var i=0;i<a.length;i++){var t=a[i];if(t===n)continue;
            var q=ah.${m.bank}[t]+ae.${m.incoming}(t,p);if(q<s){s=q;b=t}}
          return b>=0?{target:b,empty:false}:a.indexOf(n)>=0?{target:n,empty:true}:null}
      }
    },`;
  }

  /** Build the only code injected into a recognized game closure. */
  function buildExportSnippet(hookVersion, sourceKind) {
    const version = JSON.stringify(String(hookVersion || 'unknown'));
    const contract = JSON.stringify(
      sourceKind === 'readable-legacy' ? 'legacy-v1'
        : sourceKind === 'live-modern-v3' ? 'live-modern-v3'
          : sourceKind === 'live-modern-v2' ? 'live-modern-v2'
          : sourceKind === 'live-modern' ? 'live-modern-v1'
          : 'unmapped'
    );
    return ';try{' +
      'window.__TIO_GAME__={' +
      'get contract(){return ' + contract + '},' +
      'get ah(){return typeof ah!=="undefined"?ah:null},' +
      'get aE(){return typeof aE!=="undefined"?aE:null},' +
      'get aS(){return typeof aS!=="undefined"?aS:null},' +
      'get aF(){return typeof aF!=="undefined"?aF:null},' +
      'get bm(){return typeof bm!=="undefined"?bm:null},' +
      'get bB(){return typeof bB!=="undefined"?bB:null},' +
      'get bD(){return typeof bD!=="undefined"?bD:null},' +
      'get bO(){return typeof bO!=="undefined"?bO:null},' +
      'get bP(){return typeof bP!=="undefined"?bP:null},' +
      'get bV(){return typeof bV!=="undefined"?bV:null},' +
      'get bR(){return typeof bR!=="undefined"?bR:null},' +
      'get bv(){return typeof bv!=="undefined"?bv:null},' +
      'get ae(){return typeof ae!=="undefined"?ae:null},' +
      'get ap(){return typeof ap!=="undefined"?ap:null},' +
      'get ad(){return typeof ad!=="undefined"?ad:null},' +
      'get af(){return typeof af!=="undefined"?af:null},' +
      'get bi(){return typeof bi!=="undefined"?bi:null},' +
      'get i(){return typeof i!=="undefined"?i:null},' +
      'get u(){return typeof u!=="undefined"?u:null},' +
      'get aG(){return typeof aG!=="undefined"?aG:null},' +
      'get aJ(){return typeof aJ!=="undefined"?aJ:null},' +
      'get aX(){return typeof aX!=="undefined"?aX:null},' +
      'get an(){return typeof an!=="undefined"?an:null},' +
      'get ay(){return typeof ay!=="undefined"?ay:null},' +
      'get ar(){return typeof ar!=="undefined"?ar:null},' +
      'get b1(){return typeof b1==="number"?b1:null},' +
      'get am(){return typeof am!=="undefined"?am:null},' +
      'get aq(){return typeof aq!=="undefined"?aq:null},' +
      'get ax(){return typeof ax!=="undefined"?ax:null},' +
      'get bF(){return typeof bF!=="undefined"?bF:null},' +
      'get bG(){return typeof bG!=="undefined"?bG:null},' +
      'get bN(){return typeof bN!=="undefined"?bN:null},' +
      'get cE(){return typeof cE==="function"?cE:null},' +
      'get dF(){return typeof dF==="function"?dF:null},' +
      'get dJ(){return typeof dJ==="function"?dJ:null},' +
      'get d3(){return typeof d3==="function"?d3:null},' +
      'get cQ(){return typeof cQ==="function"?cQ:null},' +
      'get cL(){return typeof cL==="function"?cL:null},' +
      'get readable(){' +
      'if(typeof cR!=="function"||typeof cd!=="function"||typeof ce!=="function"||' +
      'typeof cg!=="function"||typeof cl!=="function"||typeof co!=="function"||typeof ca!=="function"||' +
      'typeof aX==="undefined"||!aX||typeof aX.ch!=="function"||' +
      'typeof bF==="undefined"||typeof ay==="undefined"||typeof aO==="undefined")return null;' +
      'return {' +
      'neighbors:function(g,k,x){' +
      'var q=!!cR(g,!!k);if(!q){cd(g,!!k);q=cZ>0}if(!q)return[];' +
      'if(x&&cg(g))return[];var a=[],i;for(i=0;i<cZ;i++)a.push(cb[i]|0);return a' +
      '},' +
      'contains:function(g,k){' +
      'try{if(!bF[g])return!1;for(var i=bF[g].length-1;i>=0;i--)for(var q=3;q>=0;q--){' +
      'var n=bF[g][i]+aO[q],t=ay.b9(n)?b1:ay.b8(n);' +
      'if(t===k&&(t===b1||ay.b7(n)&&t!==g&&ca(g,t)))return!0}}catch(e){}return!1' +
      '},' +
      'available:function(g,k){try{return!aX.ch(g,k)&&this.contains(g,k)}catch(e){return!1}},' +
      'select:function(g,k,y,l){' +
      'var q=!!cR(g,!!k);if(!q){cd(g,!!k);q=cZ>0}if(!q||cg(g))return null;' +
      'var e=ce();if(e&&l)return{target:b1|0,empty:!0,count:(cZ+1)|0};' +
      'if(cZ>0)return{target:(y?cl(g):co(g))|0,empty:!1,count:(cZ+(e?1:0))|0};' +
      'return e?{target:b1|0,empty:!0,count:1}:null' +
      '}' +
      '}' +
      '},' +
      modernExport(sourceKind) +
      'get al(){return typeof al==="function"?al:null}' +
      '};window.__TIO_GAME_READY__=true;window.__TIO_HOOK_VER__=' + version + ';' +
      '}catch(e){window.__TIO_GAME_ERR__=String(e&&e.message||e);}';
  }

  function classify(text) {
    if (typeof text !== 'string' || text.length < 80000) return 'not-game';
    const contract = detectContract(text);
    if (contract === 'readable-legacy' || contract === 'live-modern' ||
        contract === 'live-modern-v2' || contract === 'live-modern-v3') return contract;
    if (text.indexOf('canvasA') >= 0 ||
        (text.indexOf('territorial.io') >= 0 && text.length > 100000) ||
        (text.indexOf('Uint32Array') >= 0 && text.indexOf('fillText') >= 0 && text.length > 200000)) {
      return 'minified-live';
    }
    return 'not-game';
  }

  function findIifeInsertionPoint(text) {
    if (classify(text) === 'not-game') return -1;
    const markers = ['})();', '})()'];
    for (let i = 0; i < markers.length; i++) {
      const index = text.lastIndexOf(markers[i]);
      if (index < 0) continue;
      const tail = text.length - index;
      if ((tail <= 800 && index > text.length * 0.95) || (tail > 80 && tail < 400)) return index;
    }
    return -1;
  }

  function patch(text, exportSnippet) {
    if (typeof text !== 'string' || typeof exportSnippet !== 'string') return null;
    if (text.indexOf('__TIO_GAME__') >= 0) return text;
    const index = findIifeInsertionPoint(text);
    if (index < 0) return null;
    return text.slice(0, index) + exportSnippet + text.slice(index);
  }

  function inspect(text) {
    const kind = classify(text);
    const insertionPoint = findIifeInsertionPoint(text);
    return Object.freeze({
      kind,
      bytes: typeof text === 'string' ? text.length : 0,
      patchable: insertionPoint >= 0,
      insertionPoint,
      alreadyPatched: typeof text === 'string' && text.indexOf('__TIO_GAME__') >= 0,
      readableFunctions: REQUIRED_READABLE.filter((token) => text && text.indexOf(token) >= 0).length
      , contract: detectContract(text)
    });
  }

  root.TIOSourceAdapter = Object.freeze({
    classify,
    findIifeInsertionPoint,
    patch,
    inspect,
    buildExportSnippet,
    detectContract
  });
})(typeof window !== 'undefined' ? window : globalThis);
