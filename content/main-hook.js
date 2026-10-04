/**
 * MAIN-world adapter v10.1 — source-faithful, capability-gated actuator
 *
 * Ported from your readable dump (source code.html):
 *
 *   al(a,b) = floor(a/b + 1/(2b))
 *   cE(g,k,y,l)  attack player g → target k, frontier y, troops l
 *               tax = al(3*aq[g], 256);  aq[g] -= l + tax
 *   dF(g,k)     expand empty (b1): prepare borders cQ, then cE(g,b1,...)
 *   dJ(g,k,y)   crush enemy y: if al(aq[g],8) > aq[y]
 *               then k = max(k, al(11*aq[y],5)); cL then cE
 *   dD bot tick: neighbors → empty first (ce→dF) else weakest(cl)/closest(co)→dJ
 *   dU.d7: troops = al(kScale * aq, 1000)  // Hard kScale ~ 600 → ~60%
 *
 * Live desktop mapping (minified names differ):
 *   aq → ah.hB     ap → aE.et     empty → aE.f6
 *   human attack → bB.hZ.hg(il, jd)   il = floor(ratio*1024+0.5)-1
 *
 * ZERO canvas MouseEvents.
 */
(function () {
  'use strict';
  if (window.__TIO_MAIN_HOOK__) return;
  window.__TIO_MAIN_HOOK__ = true;

  // Strict Hardware Shield: Prohibit any camera or media capture
  try {
    if (typeof navigator !== 'undefined' && navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
      navigator.mediaDevices.getUserMedia = function () {
        return Promise.reject(new DOMException('Camera/media access is strictly prohibited by security policy.', 'NotAllowedError'));
      };
    }
  } catch (_) {}

  var CFG = window.TIOConfig || {};
  var PROTOCOL = CFG.BRIDGE || {};
  var SRC = PROTOCOL.requestSource || 'tio-engine-isolated';
  var REPLY = PROTOCOL.responseSource || 'tio-engine-main';
  var BRIDGE_VER = PROTOCOL.version || 1;
  var HOOK_VER = CFG.VERSION || '10.2.3';
  var _armed = false;

  function core() {
    return window.TIOEngineCore || window.TIOHardMode || null;
  }

  // Dump dU: 0=VE … 5=Very Hard  — DEFAULT VERY HARD (learn from crushers)
  var DIFF = 5;
  var dT = [60, 74, 112, 200, 256, 512];
  // Dump kScale openers (troops ≈ k/1000 * balance). VH opens ~45%.
  var DU_K_OPEN = [1000, 1000, 900, 650, 450, 450];
  var DU_K_SUSTAIN = [1000, 920, 870, 450, 250, 220];
  // Live kg il (small for VH) — we prefer dump aggressiveness for human path
  var KG_IL = [500, 450, 400, 300, 200, 180]; // boosted VH human il (~17–20%)
  var MULTI_FRONT = [1, 2, 3, 4, 5, 6];
  var PULSE_MS = [0, 0, 0, 0, 0, 0]; // uncapped — hardware / rAF
  // dI weak-pick chance
  var DI_WEAK = [0, 0, 0, 0, 0.5, 0.9];

  var EXPORT_SNIPPET =
    ';try{' +
    'window.__TIO_GAME__={' +
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
    'get al(){return typeof al==="function"?al:null}' +
    '};window.__TIO_GAME_READY__=true;window.__TIO_HOOK_VER__="' + HOOK_VER + '";' +
    '}catch(e){window.__TIO_GAME_ERR__=String(e&&e.message||e);}';

  // Source adapter owns the canonical snippet; the inline copy above is a
  // defensive standalone fallback for manual/debug loading.
  if (window.TIOSourceAdapter && typeof window.TIOSourceAdapter.buildExportSnippet === 'function') {
    EXPORT_SNIPPET = window.TIOSourceAdapter.buildExportSnippet(HOOK_VER);
  }

  /**
   * SAFE patch rules (fixes black screen):
   * 1) NEVER wipe/block the original script
   * 2) NEVER inject a second full copy of the game (double-boot = black canvas)
   * 3) Only rewrite textContent IN PLACE when we catch the node early enough
   * 4) Export snippet must sit within the last ~2KB of the file (true IIFE end)
   * 5) If anything looks wrong, leave the game script 100% alone
   */
  function isGameScript(text) {
    if (window.TIOSourceAdapter) return window.TIOSourceAdapter.classify(text) !== 'not-game';
    if (!text || text.length < 80000) return false;
    return (
      text.indexOf('canvasA') >= 0 ||
      (text.indexOf('territorial.io') >= 0 && text.length > 100000) ||
      (text.indexOf('Uint32Array') >= 0 && text.indexOf('fillText') >= 0 && text.length > 200000)
    );
  }

  function patchScriptText(text) {
    if (window.TIOSourceAdapter) {
      var sourceKind = window.TIOSourceAdapter.classify(text);
      var snippet = typeof window.TIOSourceAdapter.buildExportSnippet === 'function'
        ? window.TIOSourceAdapter.buildExportSnippet(HOOK_VER, sourceKind)
        : EXPORT_SNIPPET;
      return window.TIOSourceAdapter.patch(text, snippet);
    }
    if (!isGameScript(text)) return null;
    if (text.indexOf('__TIO_GAME__') >= 0) return text;

    // Only accept a closer that is at the TRUE end of the bundle
    // (live site ends with: window.onload=...; })();  )
    var markers = ['})();', '})()'];
    for (var m = 0; m < markers.length; m++) {
      var idx = text.lastIndexOf(markers[m]);
      if (idx < 0) continue;
      var distFromEnd = text.length - idx;
      // Must be near EOF — avoids splicing into an inner IIFE and corrupting boot
      if (distFromEnd > 80 && distFromEnd < 400) {
        return text.slice(0, idx) + EXPORT_SNIPPET + text.slice(idx);
      }
      // Allow slightly larger tail (whitespace / comments)
      if (distFromEnd <= 800 && idx > text.length * 0.95) {
        return text.slice(0, idx) + EXPORT_SNIPPET + text.slice(idx);
      }
    }
    // DO NOT append blindly — that can break parse and black-screen the page
    return null;
  }

  function tryPatchNode(node) {
    if (!node || node.nodeName !== 'SCRIPT') return;
    if (node.getAttribute && node.getAttribute('data-tio-patched')) return;
    if (window.__TIO_SCRIPT_PATCHED__) return;
    // External scripts: skip (none on live site today)
    if (node.src) return;

    var text = node.textContent || '';
    if (!isGameScript(text)) return;

    var patched = patchScriptText(text);
    if (!patched || patched === text) {
      // Leave original untouched — game must boot normally
      try {
        document.documentElement.setAttribute('data-tio-internal', '0');
        document.documentElement.setAttribute('data-tio-patch', 'skipped-safe');
      } catch (e0) {}
      return;
    }

    try {
      // IN-PLACE only. Never clear, never change type, never append a second script.
      // If the browser already executed this node, changing textContent is a no-op
      // for execution — game stays alive (export may be missing; better than black).
      node.setAttribute('data-tio-patched', '1');
      node.textContent = patched;
      window.__TIO_SCRIPT_PATCHED__ = true;
      document.documentElement.setAttribute('data-tio-internal', 'patched');
      document.documentElement.setAttribute('data-tio-patch', 'in-place');
      document.documentElement.setAttribute('data-tio-hook', HOOK_VER);
    } catch (e1) {
      // On any failure: do nothing further. Original text may already have run.
      try {
        document.documentElement.setAttribute('data-tio-patch', 'error');
      } catch (e2) {}
    }
  }

  var obs = new MutationObserver(function (mutations) {
    if (window.__TIO_SCRIPT_PATCHED__) return;
    for (var i = 0; i < mutations.length; i++) {
      var nodes = mutations[i].addedNodes;
      for (var j = 0; j < nodes.length; j++) tryPatchNode(nodes[j]);
    }
  });
  // Observe as early as possible
  if (document.documentElement) {
    obs.observe(document.documentElement, { childList: true, subtree: true });
  }

  function scanExisting() {
    if (window.__TIO_SCRIPT_PATCHED__) return;
    var scripts = document.getElementsByTagName('script');
    for (var i = 0; i < scripts.length; i++) tryPatchNode(scripts[i]);
  }
  scanExisting();
  // Early microtask / macrotask only — do NOT keep re-scanning after 200ms
  // (late rewrite of an already-executed script is useless and risky)
  setTimeout(scanExisting, 0);
  setTimeout(scanExisting, 20);

  // ---------- Math from dump ----------
  function al(a, b) {
    var k = core();
    if (k && typeof k.al === 'function') return k.al(a, b);
    if (!b) return 0;
    return Math.floor(a / b + 1 / (2 * b));
  }

  function encodeIl(ratio) {
    // Game: spent ≈ floor(B * (il+1) / 1024), aS.hd() = floor(ratio*1024+0.5)-1
    var r = Math.max(1 / 1024, Math.min(0.72, ratio != null ? ratio : 0.25));
    var k = core();
    return k && typeof k.ratioToIl === 'function'
      ? k.ratioToIl(r)
      : Math.max(0, Math.min(1023, Math.floor(r * 1024 + 0.5) - 1));
  }

  function ilToRatio(il) {
    return (il + 1) / 1024;
  }

  function G() {
    return window.__TIO_GAME__ || null;
  }

  function trustedContract(g) {
    var contract = g && g.contract;
    return contract === 'legacy-v1' || contract === 'live-modern-v1' ||
      contract === 'live-modern-v2' || contract === 'live-modern-v3' || contract === 'test-fixture';
  }

  /**
   * Troop bar anatomy (live cL / aS):
   *   local il ∈ (0,1] drives DRAW: fillText(100*il) and bar width
   *   aS.hd() = floor(il*1024+0.5)-1  → attack spend code
   *   aS.di() loads il = (bm.eU.data[182].value+1)/1024 then resize()→a9W() redraw
   *   bm.pW.pX(182, code) persists the code (0..1023)
   *
   * Writing data[182] alone does NOT move the visible bar until aS.di().
   * If __TIO_GAME__ missing (safe patch miss), we simulate a drag on the bar.
   */
  var _hdPatched = false;
  var _forcedIl = null;
  var _forcedRatio = null;
  var _lastBarDragAt = 0;
  var _lastBarDragPct = -1;

  function ensureHdPatch() {
    var g = G();
    if (!trustedContract(g)) return false;
    if (!g || !g.aS) return false;
    var method = typeof g.aS.hd === 'function' ? 'hd'
      : (typeof g.aS.hv === 'function' ? 'hv' : null);
    if (!method) return false;
    if (_hdPatched || g.aS.__tioHdPatched) {
      _hdPatched = true;
      return true;
    }
    try {
      var orig = g.aS[method].bind(g.aS);
      g.aS[method] = function () {
        if (_forcedIl != null) return _forcedIl;
        if (window.__TIO_FORCE_IL__ != null) return window.__TIO_FORCE_IL__ | 0;
        return orig();
      };
      g.aS.__tioHdPatched = true;
      _hdPatched = true;
      return true;
    } catch (e) {
      return false;
    }
  }

  /** Write storage index 182 (troop code 0..1023). */
  function writeTroopStorage(ilCode) {
    var g = G();
    var ok = false;
    if (!g || !g.bm) return false;
    try {
      // Current live build: bm.po.pp(index, value), storage at bm.eV.
      if (g.bm.po && typeof g.bm.po.pp === 'function') {
        g.bm.po.pp(182, ilCode);
        ok = true;
      }
    } catch (e0) {}
    try {
      // Live attack path uses bm.pW.pX(182, il)
      if (g.bm.pW && typeof g.bm.pW.pX === 'function') {
        // Some builds: pX(eG,value) no-ops if same value — force change then set
        try {
          if (g.bm.eU && g.bm.eU.data && g.bm.eU.data[182] &&
              (g.bm.eU.data[182].value | 0) === (ilCode | 0)) {
            g.bm.eU.data[182].value = (ilCode + 1) % 1024;
          }
        } catch (e0) {}
        g.bm.pW.pX(182, ilCode);
        ok = true;
      }
    } catch (e1) {}
    try {
      if (g.bm.eU) {
        if (typeof g.bm.eU.wB === 'function') {
          g.bm.eU.wB(182, ilCode);
          ok = true;
        } else if (typeof g.bm.eU.pX === 'function') {
          g.bm.eU.pX(182, ilCode);
          ok = true;
        } else if (g.bm.eU.data && g.bm.eU.data[182]) {
          g.bm.eU.data[182].value = ilCode;
          ok = true;
        }
      }
    } catch (e2) {}
    return ok;
  }

  /**
   * Reload aS local `il` from storage and redraw bar.
   * aS.di() → il=(data[182]+1)/1024; resize() → a9W() draws 100*il.
   */
  function reloadSliderFromStorage() {
    var g = G();
    if (!g || !g.aS) return false;
    try {
      if (typeof g.aS.di === 'function') {
        g.aS.di();
        return true;
      }
    } catch (e) {}
    try {
      if (typeof g.aS.resize === 'function') {
        g.aS.resize();
        return true;
      }
    } catch (e2) {}
    return false;
  }

  /**
   * Read displayed ratio if possible (after di, hd should match).
   */
  function readLiveTroopRatio() {
    var g = G();
    try {
      if (g && g.modern && typeof g.modern.readRatio === 'function') return g.modern.readRatio();
      if (g && g.bm && g.bm.eV && g.bm.eV.data && g.bm.eV.data[182] != null) {
        return ilToRatio(g.bm.eV.data[182].value | 0);
      }
      if (g && g.bm && g.bm.eU && g.bm.eU.data && g.bm.eU.data[182] != null) {
        return ilToRatio(g.bm.eU.data[182].value | 0);
      }
    } catch (e) {}
    try {
      if (g && g.aS && !g.aS.__tioHdPatched) {
        if (typeof g.aS.hd === 'function') return ilToRatio(g.aS.hd());
        if (typeof g.aS.hv === 'function') return ilToRatio(g.aS.hv());
      }
    } catch (e2) {}
    return null;
  }

  /**
   * Bar-drag DISABLED by default.
   * Synthetic drags on the bottom bar sit next to the bottom-left logo (fW).
   * Hitting that logo opens Quit/Surrender; a second hit calls jA() → jD.bi()
   * which pops the main-menu username INPUT mid-session.
   * Troop % is forced via storage182 + aS.di + hd-patch only.
   */
  function simulateBarDrag(/* ratio */) {
    return { ok: false, err: 'bar-drag-disabled' };
  }

  /**
   * Hide game username DOM INPUT if it reappears while a match is live.
   * Main-menu field is absolute-positioned body > input[type=text].
   */
  function suppressUsernameOverlay() {
    try {
      var me = myPlayer();
      // Only while we actually own territory (in a match)
      if (me < 0 || !isAlive(me) || getTerritory(me) < 1) return 0;
      var inputs = document.querySelectorAll('body > input[type="text"]');
      var n = 0;
      for (var i = 0; i < inputs.length; i++) {
        var el = inputs[i];
        if (!el || !el.parentNode) continue;
        var st = el.style || {};
        var pos = st.position || '';
        // Game name field: absolute, bottom-anchored, dark translucent bg
        if (pos === 'absolute' || el.readOnly === false) {
          try {
            if (document.activeElement === el) el.blur();
          } catch (e0) {}
          try {
            el.parentNode.removeChild(el);
            n++;
          } catch (e1) {
            try {
              el.style.display = 'none';
              el.style.pointerEvents = 'none';
              n++;
            } catch (e2) {}
          }
        }
      }
      return n;
    } catch (e) {
      return 0;
    }
  }

  /**
   * Set troop spend ratio — storage + aS.di redraw + hd patch.
   * No bar-drag (avoids Quit logo → username popup).
   */
  function setTroopRatio(ratio) {
    if (!trustedContract(G())) return { ok: false, err: 'unsupported-contract' };
    // Manual UI remains capped at 40%; autonomous real-soft-cap dumps may use
    // up to 72% after planSpend proves the exact human debit is safe.
    var r = Math.max(1 / 1024, Math.min(0.72, ratio != null ? ratio : 0.25));
    var il = encodeIl(r);
    r = ilToRatio(il);
    _forcedIl = il;
    _forcedRatio = r;
    window.__TIO_FORCE_IL__ = il;
    window.__TIO_FORCE_RATIO__ = r;

    var paths = [];
    var modern = G().modern;
    if (modern && typeof modern.setRatio === 'function') {
      modern.setRatio(il);
      return { ok: true, il: il, ratio: r, pct: Math.round(r * 100), paths: 'mapped-slider' };
    }

    // A) Persist code 0..1023
    if (writeTroopStorage(il)) paths.push('storage182');

    // B) Reload local il from storage and redraw (THIS moves the visible bar)
    if (reloadSliderFromStorage()) paths.push('aS.di');

    // C) Patch hd so attacks use our code even if draw lags
    if (ensureHdPatch()) paths.push('hd-patch');

    // D) Bar-drag intentionally OFF — see simulateBarDrag comment
    suppressUsernameOverlay();

    var pct = Math.round(r * 100);

    try {
      document.documentElement.setAttribute('data-tio-troop', String(pct));
      document.documentElement.setAttribute('data-tio-il', String(il));
      document.documentElement.setAttribute('data-tio-troop-path', paths.join('+') || 'none');
      var verify = readLiveTroopRatio();
      if (verify != null) {
        document.documentElement.setAttribute(
          'data-tio-troop-live',
          String(Math.round(verify * 100))
        );
      }
    } catch (e3) {}

    return {
      ok: paths.length > 0 || _forcedIl != null,
      il: il,
      ratio: r,
      pct: pct,
      paths: paths.join('+') || 'force-only',
      livePct: (function () {
        var v = readLiveTroopRatio();
        return v != null ? Math.round(v * 100) : null;
      })()
    };
  }

  function getTroopRatio() {
    var live = readLiveTroopRatio();
    if (live != null) return live;
    if (_forcedRatio != null) return _forcedRatio;
    return null;
  }

  function myPlayer() {
    var g = G();
    if (!g) return -1;
    if (g.modern && typeof g.modern.me === 'function') return g.modern.me();
    if (g.aE && typeof g.aE.fB === 'number' && Number.isFinite(g.aE.fB)) return g.aE.fB | 0;
    if (g.aE && typeof g.aE.et === 'number' && Number.isFinite(g.aE.et)) return g.aE.et | 0;
    if (typeof g.ap === 'number' && Number.isFinite(g.ap)) return g.ap | 0;
    // Some builds: aE.ap or similar
    if (g.aE && typeof g.aE.ap === 'number' && Number.isFinite(g.aE.ap)) return g.aE.ap | 0;
    return -1;
  }

  /**
   * Live troop balance. Returns { value, known }.
   * known=false → array missing / not in match (do NOT treat as zero-troops hold).
   * known=true && value<=0 → actually broke / debt → hold.
   */
  function getBalanceInfo(p) {
    var g = G();
    if (!g || p == null || p < 0) return { value: 0, known: false };
    try {
      if (g.modern && typeof g.modern.balance === 'function') {
        var exact = g.modern.balance(p);
        return { value: Number(exact) | 0, known: Number.isFinite(exact) };
      }
      // Primary live mapping aq → ah.hB
      if (g.ah) {
        var keys = ['hT', 'hB', 'hG', 'iB', 'gB', 'hC', 'aq'];
        for (var i = 0; i < keys.length; i++) {
          var arr = g.ah[keys[i]];
          if (arr && typeof arr.length === 'number' && arr.length > p && arr[p] != null && isFinite(Number(arr[p]))) {
            return { value: Number(arr[p]) | 0, known: true };
          }
        }
      }
      if (g.aq && typeof g.aq.length === 'number' && g.aq.length > p && g.aq[p] != null && isFinite(Number(g.aq[p]))) {
        return { value: Number(g.aq[p]) | 0, known: true };
      }
    } catch (e) {}
    return { value: 0, known: false };
  }

  function getBalance(p) {
    return getBalanceInfo(p).value;
  }

  function balanceIsKnown(p) {
    return getBalanceInfo(p).known;
  }

  function getTerritory(p) {
    var g = G();
    if (!g) return 0;
    if (g.modern && typeof g.modern.territory === 'function') return g.modern.territory(p) | 0;
    try {
      if (g.ah) {
        var tkeys = ['hF', 'gx', 'gA', 'bN', 'territory'];
        for (var ti = 0; ti < tkeys.length; ti++) {
          var ta = g.ah[tkeys[ti]];
          if (ta && ta.length > p && ta[p] != null && isFinite(Number(ta[p]))) {
            return Number(ta[p]) | 0;
          }
        }
      }
      if (g.bN && g.bN[p] != null) return g.bN[p] | 0;
    } catch (e2) {}
    return 0;
  }

  function isAlive(p) {
    var g = G();
    if (!g) return false;
    if (g.modern && typeof g.modern.alive === 'function') return g.modern.alive(p);
    if (g.ah && g.ah.nM) return g.ah.nM[p] !== 0;
    if (g.ah && g.ah.n4) return g.ah.n4[p] !== 0;
    return getTerritory(p) > 0 || getBalance(p) > 0;
  }

  function neutralTargetId() {
    var g = G();
    if (!g) return null;
    if (g.modern && typeof g.modern.neutral === 'function') return g.modern.neutral();
    if (g.aE && typeof g.aE.fO === 'number' && Number.isFinite(g.aE.fO)) return g.aE.fO | 0;
    if (g.aE && typeof g.aE.f6 === 'number' && Number.isFinite(g.aE.f6)) return g.aE.f6 | 0;
    if (typeof g.b1 === 'number' && Number.isFinite(g.b1)) return g.b1 | 0;
    return null;
  }

  function playerCount() {
    var g = G();
    if (g && g.modern && typeof g.modern.neutral === 'function') return Math.min(512, g.modern.neutral());
    if (g && g.aE && typeof g.aE.fO === 'number' && Number.isFinite(g.aE.fO)) return Math.min(g.aE.fO | 0, 512);
    if (g && g.ah && g.ah.nM && typeof g.ah.nM.length === 'number') return Math.min(g.ah.nM.length, 512);
    if (g && g.ah && g.ah.hT && typeof g.ah.hT.length === 'number') return Math.min(g.ah.hT.length, 512);
    if (g && g.ah && g.ah.n4 && typeof g.ah.n4.length === 'number') return Math.min(g.ah.n4.length, 128);
    if (g && g.ah && g.ah.hB && typeof g.ah.hB.length === 'number') return Math.min(g.ah.hB.length, 128);
    if (g && g.aq && typeof g.aq.length === 'number') return Math.min(g.aq.length, 128);
    return 32;
  }

  /**
   * Adaptive commit when isolated world does not pass a ratio.
   * Uses density (if known from balance/territory) + free land + phase.
   */
  function commitRatioFor(phase, freeLandHint) {
    var me = myPlayer();
    var bal = me >= 0 ? getBalance(me) : 0;
    var terr = me >= 0 ? getTerritory(me) : 1;
    var softCap = softCapOf(terr, me);
    var density = softCap > 0 ? bal / softCap : 0.6;
    var free = freeLandHint != null ? freeLandHint : 0.1;
    var kernel = core();
    if (kernel && typeof kernel.computeAdaptiveCommit === 'function') {
      return kernel.computeAdaptiveCommit({
        profile: kernel.profileFor ? kernel.profileFor(DIFF) : kernel.active,
        phase: phase || 'LAND_RUSH',
        freeLandRatio: free,
        density: density,
        balance: bal,
        territory: terr,
        wantEnemy: phase === 'PRESSURE' || phase === 'KILL' || phase === 'CRUSH' || phase === 'SURVIVE',
        crushable: phase === 'KILL' || phase === 'CRUSH',
        fronts: 1
      }).ratio;
    }
    var i = Math.min(DIFF, DU_K_OPEN.length - 1);
    var open = DU_K_OPEN[i] / 1000;
    var sus = DU_K_SUSTAIN[i] / 1000;
    var ratio;

    if (phase === 'KILL' || phase === 'CRUSH') {
      ratio = Math.min(0.65, open * 1.25);
    } else if (phase === 'SURVIVE') {
      ratio = Math.max(0.34, open * 0.9);
    } else if (phase === 'PRESSURE') {
      ratio = density > 0.9 ? 0.42 : Math.max(0.28, sus);
    } else if (density >= 1.05) {
      // d3 dump excess into land
      ratio = 0.55;
    } else if (density >= 0.9) {
      ratio = 0.44;
    } else if (free > 0.12) {
      ratio = density < 0.4 ? 0.26 : Math.max(0.36, open * 0.9);
    } else if (free > 0.04) {
      ratio = density < 0.4 ? 0.22 : Math.max(0.30, sus);
    } else {
      ratio = Math.max(0.26, sus);
    }
    // Under-dense: keep interest seed
    if (density < 0.35 && phase !== 'CRUSH' && phase !== 'KILL') {
      ratio = Math.min(ratio, 0.28);
    }
    return Math.max(0.12, Math.min(0.48, ratio));
  }

  /**
   * Situation-based spend budget (MAIN world copy — isolated cannot share JS).
   * Same algorithm as hardmode.planSpend: B, C, density, free, threat, crush.
   */
  function softCapOf(terr, player) {
    var g = G();
    var owner = player != null ? (player | 0) : myPlayer();
    try {
      if (g && g.modern && typeof g.modern.softCap === 'function' && owner >= 0) {
        var exactModern = Number(g.modern.softCap(owner));
        if (exactModern > 0 && isFinite(exactModern)) return Math.floor(exactModern);
      }
    } catch (eModern) {}
    try {
      if (g && g.af && typeof g.af.kS === 'function' && owner >= 0) {
        var exactLive = Number(g.af.kS(owner));
        if (exactLive > 0 && isFinite(exactLive)) return Math.floor(exactLive);
      }
    } catch (eLive) {}
    try {
      if (g && g.ar && typeof g.ar.dB === 'function' && owner >= 0) {
        var exactLegacy = Number(g.ar.dB(owner));
        if (exactLegacy > 0 && isFinite(exactLegacy)) return Math.floor(exactLegacy);
      }
    } catch (eLegacy) {}
    var kernel = core();
    return kernel && typeof kernel.softCapFor === 'function'
      ? kernel.softCapFor(terr)
      : Math.min(100 * Math.max(1, terr || 1), 1000000000);
  }

  // Global lock: one spend stream at a time so balance can settle
  var _spendLockUntil = 0;
  var _spendLockBal = null;

  /**
   * Conservative cost of one land attack.
   * spent = floor(B*(il+1)/1024); tax ~ al(3B,256); margin for unknown extras.
   */
  function estimateAttackCost(balance, ratio) {
    var kernel = core();
    if (kernel && typeof kernel.estimateAttackCost === 'function') {
      return kernel.estimateAttackCost(balance, ratio);
    }
    var B = Math.max(0, balance | 0);
    if (B <= 0) return 1e15;
    var r = Math.max(0.01, Math.min(0.95, ratio != null ? ratio : 0.25));
    var il = Math.max(0, Math.min(1023, Math.round(r * 1024) - 1));
    var spent = Math.floor(B * (il + 1) / 1024);
    var tax = al(12 * B, 1024);
    return Math.min(B, spent + tax);
  }

  /** Absolute minimum troops to leave after ANY attack (never 0). */
  function minLeaveFor(balance) {
    var kernel = core();
    if (kernel && typeof kernel.minLeaveFor === 'function') return kernel.minLeaveFor(balance);
    var B = balance | 0;
    if (B <= 0) return 1;
    if (B < 80) return Math.max(6, Math.floor(B * 0.25));
    if (B < 200) return Math.max(16, Math.floor(B * 0.20));
    return Math.max(32, Math.floor(B * 0.14));
  }

  function maxSafeRatio(balance, minLeave) {
    var kernel = core();
    if (kernel && typeof kernel.maxSafeRatio === 'function') return kernel.maxSafeRatio(balance, minLeave);
    var B = balance | 0;
    if (!(B > 0)) return 0;
    var leave = Math.max(minLeaveFor(B), minLeave | 0);
    if (B <= leave + 8) return 0;
    var lo = 0.01, hi = 0.72, best = 0;
    for (var i = 0; i < 20; i++) {
      var mid = (lo + hi) / 2;
      var cost = estimateAttackCost(B, mid);
      if (B - cost >= leave) { best = mid; lo = mid; }
      else hi = mid;
    }
    return best;
  }

  function canSpendNow(me) {
    var now = performance.now();
    if (now < _spendLockUntil) return false;
    var info = getBalanceInfo(me);
    if (info.known && !(info.value > 0)) return false;
    // If we locked on a balance and it hasn't dropped/updated, wait
    if (_spendLockBal != null && info.known && info.value >= _spendLockBal && now < _spendLockUntil + 50) {
      return false;
    }
    return true;
  }

  function armSpendLock(me, balBefore) {
    _spendLockUntil = performance.now() + 220; // let engine apply spend
    _spendLockBal = balBefore;
  }


  function planSpend(ctx) {
    var kernel = core();
    return kernel && typeof kernel.planSpend === 'function'
      ? kernel.planSpend(ctx || {})
      : { canAfford: false, reason: 'core-unavailable', fronts: 0, ratio: 0 };
  }

  function minRemainingBalance(balance, territory, phase) {
    return planSpend({ balance: balance, territory: territory, phase: phase, fronts: 1 }).minRemaining | 0;
  }

  function maxSpendableTroops(balance, territory, phase) {
    var p = planSpend({ balance: balance, territory: territory, phase: phase, fronts: 1 });
    return p.canAfford ? (p.maxSpendTotal | 0) : 0;
  }

  function canAffordAttack(balance, territory, phase, balanceKnown) {
    // Unknown balance: allow (caller should prefer live re-check)
    if (balanceKnown === false) return true;
    // Known empty/debt: block
    if (!(balance > 0)) return false;
    return maxSpendableTroops(balance, territory, phase) > 0;
  }

  function minMeaningful(balance, phase) {
    if (!(balance > 0)) return 12;
    return planSpend({ balance: balance, territory: 1, phase: phase, fronts: 1, balanceKnown: true }).minAttack | 0;
  }

  function clampRatioToReserve(ratio, balance, territory, phase, sit) {
    var bal = balance | 0;
    sit = sit || {};
    if (!(bal > 0)) {
      // Unknown or broke: if broke known, block; if unknown allow default
      if (sit.balanceKnown === false) return Math.max(0.15, Math.min(0.35, ratio != null ? ratio : 0.28));
      return 0;
    }
    var p = planSpend({
      balance: bal,
      territory: territory,
      phase: phase,
      freeLandRatio: sit.freeLand,
      wantEnemy: sit.wantEnemy,
      crushable: sit.crushable,
      enemyBal: sit.enemyBal,
      adjEnemyCount: sit.adjEnemyCount,
      fronts: sit.fronts || 1,
      activeFronts: sit.activeFronts,
      frontCap: sit.frontCap,
      attackSequence: sit.attackSequence
    });
    if (!p.canAfford) return 0;
    var r = ratio != null ? ratio : p.ratio;
    r = Math.max(0.06, Math.min(0.72, r));
    // Cap so spent troops never exceed maxSpend (leave bank > 0)
    var maxR = p.maxSpendTotal / bal;
    // Extra safety: never spend more than 95% of current bal
    maxR = Math.min(maxR, maxSafeRatio(bal, p.minRemaining), 0.72);
    if (r > maxR) r = maxR;
    if (Math.floor(bal * r) < p.minAttack) {
      if (p.maxSpendTotal >= p.minAttack) r = Math.min(maxR, p.minAttack / bal);
      else return 0;
    }
    // Final: ensure remaining after spend is at least 1
    if (Math.floor(bal * r) >= bal) r = Math.max(0, (bal - 1) / bal);
    return r;
  }

  function troopsFromBalance(balance, phase, freeLandHint, territory, sit) {
    sit = sit || {};
    var bal = balance | 0;
    var known = sit.balanceKnown !== false;
    if (known && !(bal > 0)) return 0;
    var p = planSpend({
      balance: bal,
      balanceKnown: known && (balance != null),
      territory: territory != null ? territory : 0,
      phase: phase,
      freeLandRatio: freeLandHint,
      wantEnemy: sit.wantEnemy != null ? sit.wantEnemy : (phase === 'PRESSURE' || phase === 'CRUSH' || phase === 'SURVIVE' || phase === 'KILL'),
      crushable: sit.crushable != null ? sit.crushable : (phase === 'CRUSH' || phase === 'KILL'),
      enemyBal: sit.enemyBal,
      adjEnemyCount: sit.adjEnemyCount,
      fronts: 1,
      activeFronts: sit.activeFronts,
      frontCap: sit.frontCap,
      attackSequence: sit.attackSequence
    });
    if (!p.canAfford) return 0;
    if (!known || !(bal > 0)) {
      // Unknown bank: spend a small fixed bite; game clamps if empty
      return Math.max(12, Math.floor((p.minAttack || 12)));
    }
    var troops = p.spendPerFront | 0;
    // Never drain to 0 or below when bank is known
    if (troops >= bal) troops = Math.max(0, bal - Math.max(1, p.minRemaining | 0));
    if (troops < p.minAttack) return 0;
    return troops;
  }

  function applyCrushSizing(me, enemy, troops, territory, phase) {
    var myBal = getBalance(me);
    var enBal = getBalance(enemy);
    var terr = territory != null ? territory : getTerritory(me);
    var ph = phase || 'CRUSH';
    if (al(myBal, 8) > enBal) {
      var needC = al(11 * enBal, 5);
      if (troops < needC) troops = needC;
    }
    if (myBal <= 0) return troops | 0;
    var p = planSpend({
      balance: myBal,
      territory: terr,
      phase: ph,
      wantEnemy: true,
      crushable: al(myBal, 8) > enBal,
      enemyBal: enBal,
      fronts: 1
    });
    if (!p.canAfford) return 0;
    if (troops > p.maxSpendTotal) troops = p.maxSpendTotal;
    if (troops < p.minAttack) return 0;
    return troops | 0;
  }

  /**
   * Live game: land targets must be ADJACENT neighbors from ae (border graph).
   *   ae.gG(player) = neighbor count
   *   ae.gL(player, i) = neighbor player id (or empty marker)
   *   ae.jp(player, jd) = true if jd is adjacent to player
   * Land attack hg fails if !ae.jp && !ae.k8 (see bD.gV path).
   */
  function isTargetActive(me, target) {
    var g = G();
    try {
      if (g && g.modern && typeof g.modern.active === 'function') return g.modern.active(me, target);
      if (g && g.ae && typeof g.ae.k7 === 'function') return !!g.ae.k7(me, target);
      if (g && g.aX && typeof g.aX.ch === 'function') return !!g.aX.ch(me, target);
    } catch (e) {}
    return false;
  }

  function getActiveLandFronts(me) {
    var g = G();
    try {
      if (g && g.modern && typeof g.modern.activeCount === 'function') {
        return Math.max(0, g.modern.activeCount(me) | 0);
      }
      if (g && g.ae && typeof g.ae.gY === 'function') return Math.max(0, g.ae.gY(me) | 0);
    } catch (e) {}
    return 0;
  }

  function getLandFrontCap(me) {
    var g = G();
    try {
      if (g && g.modern && typeof g.modern.frontCap === 'function') {
        return Math.max(1, Math.min(12, g.modern.frontCap(me) | 0));
      }
      if (g && g.aE && typeof g.aE.km === 'number') {
        return me < g.aE.km ? (g.aE.km < 16 ? 12 : 8) : 4;
      }
    } catch (e) {}
    return 4;
  }

  function getGameTick() {
    var g = G();
    try {
      if (g && g.modern && typeof g.modern.gameTick === 'function') return g.modern.gameTick() | 0;
      if (g && g.bi && typeof g.bi.kj === 'function') return g.bi.kj() | 0;
    } catch (e) {}
    return 0;
  }

  function getAdjacentIds(me, excludeActive) {
    var g = G();
    var out = [];
    var seen = {};
    var nid = neutralTargetId();
    excludeActive = excludeActive !== false;
    if (!g || me < 0) return out;

    // Preferred: official neighbor table
    try {
      if (g.ae && typeof g.ae.gG === 'function' && typeof g.ae.gL === 'function') {
        var n = g.ae.gG(me) | 0;
        for (var i = 0; i < n; i++) {
          var jd = g.ae.gL(me, i);
          if (jd == null || jd < 0) continue;
          if (excludeActive && isTargetActive(me, jd)) continue;
          if (seen[jd]) continue;
          seen[jd] = 1;
          out.push(jd | 0);
        }
        return out;
      }
    } catch (e) {}

    // Current structurally-verified live build (bv border graph + ae attacks).
    try {
      if (g.modern && typeof g.modern.neighbors === 'function') {
        var modern = g.modern.neighbors(me, excludeActive);
        for (var mi = 0; mi < modern.length; mi++) {
          var mp = modern[mi] | 0;
          if (mp < 0 || seen[mp]) continue;
          seen[mp] = 1;
          out.push(mp);
        }
        if (out.length) return out;
      }
    } catch (eModern) {}

    // Readable legacy bundle: invoke its own sampled border scanner (cR/cd).
    // This keeps legacy adjacency authoritative without exporting mutable arrays.
    try {
      if (g.readable && typeof g.readable.neighbors === 'function') {
        var legacy = g.readable.neighbors(me, false, excludeActive);
        for (var li = 0; li < legacy.length; li++) {
          var lp = legacy[li] | 0;
          if (lp < 0 || seen[lp]) continue;
          seen[lp] = 1;
          out.push(lp);
        }
        if (out.length) return out;
      }
    } catch (eLegacy) {}

    // Fallback: if ae.jp exists, scan alive players
    try {
      if (g.ae && typeof g.ae.jp === 'function') {
        var maxP = playerCount();
        for (var p = 0; p < maxP; p++) {
          if (p === me) continue;
          if (g.ae.jp(me, p)) {
            if (excludeActive && isTargetActive(me, p)) continue;
            out.push(p);
          }
        }
      }
    } catch (e2) {}
    return out;
  }

  /**
   * STRICT land adjacency: target must appear in official neighbor list
   * (ae.gL / ae.jp). No "maybe adjacent" fallbacks — non-neighbors are invalid land attacks.
   */
  function isLandAdjacent(me, jd) {
    if (me < 0 || jd == null) return false;
    var list = getAdjacentIds(me, false);
    for (var k = 0; k < list.length; k++) {
      if ((list[k] | 0) === (jd | 0)) return true;
    }
    // Double-check via jp if list empty/stale
    var g = G();
    try {
      if (g && g.ae && typeof g.ae.jp === 'function') {
        return !!g.ae.jp(me, jd | 0);
      }
    } catch (e) {}
    // Legacy cR is sampled/capped, so prove a specific target directly against
    // bF/ay rather than rejecting it merely because it missed one sample.
    try {
      if (g && g.modern && typeof g.modern.contains === 'function') {
        return !!g.modern.contains(me, jd | 0);
      }
    } catch (eModern) {}
    try {
      if (g && g.readable && typeof g.readable.contains === 'function') {
        return !!g.readable.contains(me, jd | 0);
      }
    } catch (eLegacy) {}
    return false;
  }

  /** Actionable border target: physical neighbor and no attack already in flight. */
  function isLandAvailable(me, jd) {
    if (me < 0 || jd == null) return false;
    var g = G();
    try {
      if (g && g.modern && typeof g.modern.available === 'function') {
        return !!g.modern.available(me, jd | 0);
      }
    } catch (eModern) {
      return false;
    }
    try {
      if (g && g.readable && typeof g.readable.available === 'function') {
        return !!g.readable.available(me, jd | 0);
      }
    } catch (eLegacy) {
      return false;
    }
    return isLandAdjacent(me, jd);
  }

  /** Ships exist on water maps — OFF by default (user: only pixel-adjacent land). */
  function shipsEnabled() {
    return false; // set true only if we later add explicit ship mode
  }

  /**
   * Adjacent land enemies ONLY — from ae neighbor table.
   * If no neighbor table, return -1 (do not invent far-away targets).
   */
  function pickWeakestAdjacentEnemy(me) {
    var nid = neutralTargetId();
    var g = G();
    try {
      var hasOldNeighborApi = !!(g && g.ae && (
        typeof g.ae.gG === 'function' || typeof g.ae.jp === 'function'
      ));
      if (!hasOldNeighborApi && g && g.modern && typeof g.modern.select === 'function') {
        var modernChoice = g.modern.select(me, true, false);
        if (modernChoice && !modernChoice.empty && modernChoice.target !== me &&
            (nid == null || modernChoice.target !== nid) && isAlive(modernChoice.target) &&
            isLandAvailable(me, modernChoice.target)) {
          return modernChoice.target | 0;
        }
      }
    } catch (eModern) {}
    // Reproduce dD's Very-Hard choice for the readable source: remove free
    // land via ce(), then use cl() (balance + incoming attacks) on real borders.
    try {
      var hasLiveNeighbors = !!(g && g.ae && (
        typeof g.ae.gG === 'function' || typeof g.ae.jp === 'function'
      ));
      if (!hasLiveNeighbors && g && g.readable && typeof g.readable.select === 'function') {
        var chosen = g.readable.select(me, false, true, false);
        if (chosen && !chosen.empty && chosen.target !== me &&
            (nid == null || chosen.target !== nid) && isAlive(chosen.target) &&
            isLandAdjacent(me, chosen.target)) {
          return chosen.target | 0;
        }
      }
    } catch (eReadable) {}
    var adj = getAdjacentIds(me);
    if (!adj.length) return -1;
    var best = -1;
    var bestScore = Infinity;
    for (var i = 0; i < adj.length; i++) {
      var p = adj[i] | 0;
      if (p === me) continue;
      if (nid != null && p === nid) continue; // free land id
      if (!isAlive(p)) continue;
      // Require STRICT adjacency proof
      if (!isLandAdjacent(me, p)) continue;
      var t = getTerritory(p);
      if (t <= 0) continue;
      var bal = getBalance(p);
      var score = t * 10 + bal;
      if (al(getBalance(me), 8) > bal) score *= 0.35;
      try {
        if (g && g.ae && typeof g.ae.gM === 'function') {
          var bw = g.ae.gM(me, i);
          if (bw > 0) score -= Math.min(score * 0.3, bw * 0.01);
        }
      } catch (e) {}
      if (score < bestScore) {
        bestScore = score;
        best = p;
      }
    }
    return best;
  }

  function pickAnyAdjacentEnemy(me) {
    return pickWeakestAdjacentEnemy(me);
  }

  /** Disabled by default — non-adjacent ship targets. */
  function pickShipTarget(me) {
    return -1;
  }

  /** Free land only if neighbor list includes empty marker f6/b1. */
  function hasAdjacentFreeLand(me) {
    var nid = neutralTargetId();
    if (nid == null) return false;
    try {
      var g = G();
      if (g && g.modern && typeof g.modern.available === 'function') {
        return !!g.modern.available(me, nid);
      }
      if (g && g.readable && typeof g.readable.available === 'function') {
        return !!g.readable.available(me, nid);
      }
    } catch (eLegacy) {
      return false;
    }
    return isLandAdjacent(me, nid);
  }

  /**
   * Should we still expand free land?
   * Dump dD: empty first if present in neighbor set.
   * Also density: softCap = 100 * territory — expand when over-dense.
   */
  function shouldExpandEmpty(me, freeLandHint, preferNeutral) {
    if (preferNeutral === false) return false;
    var nid = neutralTargetId();
    if (nid == null) return false;
    var free = freeLandHint != null ? freeLandHint : 0.08;
    if (free > 0.03) return true;
    // Over density soft-cap → expand to raise cap
    var bal = getBalance(me);
    var terr = getTerritory(me);
    var cap = softCapOf(terr, me);
    if (bal > cap * 0.9) return true;
    // Still some free land
    return free > 0.015;
  }

  // ---------- Attack paths ----------

  function attackViaHg(ratio, targetId, phaseHint, planContext) {
    var g = G();
    if (!trustedContract(g)) return { ok: false, err: 'unsupported-contract' };
    var hasLegacyHg = !!(g && g.bB && g.bB.hZ && typeof g.bB.hZ.hg === 'function');
    var hasModernHy = !!(g && g.bB && g.bB.hr && typeof g.bB.hr.hy === 'function');
    var mapped = g && g.modern;
    var hasMapped = !!(mapped && typeof mapped.attack === 'function');
    if (!hasLegacyHg && !hasModernHy && !hasMapped) return { ok: false, err: 'no-land-api' };
    var me = myPlayer();
    if (me < 0 || !isAlive(me)) return { ok: false, err: 'no-player' };
    if (hasMapped && !mapped.canAttack(me)) return { ok: false, err: 'not-playing' };
    if (!canSpendNow(me)) {
      return { ok: false, err: 'spend-lock', balance: getBalance(me) };
    }
    var jd = targetId;
    if (jd == null) jd = neutralTargetId();
    if (jd == null) return { ok: false, err: 'no-jd' };

    // STRICT: every land target (including free land id) must be a border neighbor.
    if (!isLandAvailable(me, jd)) {
      return {
        ok: false,
        err: isLandAdjacent(me, jd) ? 'target-busy' : 'not-adjacent',
        target: jd
      };
    }

    var bInfo = getBalanceInfo(me);
    var bal = bInfo.value;
    var balKnown = bInfo.known;
    var terr = getTerritory(me);
    var phase = phaseHint || 'LAND_RUSH';
    planContext = planContext || {};
    var activeFronts = getActiveLandFronts(me);
    var frontCap = Math.min(4, getLandFrontCap(me));
    // Only block when we KNOW troops are empty/debt
    if (balKnown && !(bal > 0)) {
      return {
        ok: false,
        err: bal < 0 ? 'negative-troops' : 'zero-troops',
        balance: bal,
        phase: phase
      };
    }
    var boundaryContext = Object.assign({}, planContext, {
      balance: bal,
      balanceKnown: balKnown,
      territory: terr,
      softCap: softCapOf(terr, me),
      phase: phase,
      wantEnemy: jd !== neutralTargetId(),
      crushable: jd !== neutralTargetId() && al(bal, 8) > getBalance(jd),
      enemyBal: jd !== neutralTargetId() ? getBalance(jd) : 0,
      fronts: 1,
      activeFronts: activeFronts,
      frontCap: frontCap,
      attackSequence: planContext.attackSequence
    });
    var plan = planSpend(boundaryContext);
    if (!plan.canAfford) {
      return {
        ok: false,
        err: (plan.reason === 'negative-troops' || plan.reason === 'zero-troops')
          ? plan.reason
          : 'below-reserve',
        balance: bal,
        minRemaining: plan.minRemaining,
        phase: phase,
        reason: plan.reason
      };
    }
    // One live policy evaluation. Replanning with a reduced context used to
    // discard opening time, incoming attacks, and target-specific information.
    var safeRatio = Math.min(0.72, ratio != null ? ratio : plan.ratio,
      maxSafeRatio(bal, Math.max(plan.minRemaining, Number(planContext.minRemaining) || 0)));
    if (safeRatio <= 0) {
      return { ok: false, err: 'below-reserve', balance: bal, phase: phase };
    }

    // Final live bank check — abort if this spend would empty/overdraw
    var leave = Math.max(1, plan.minRemaining | 0, Number(planContext.minRemaining) || 0);
    safeRatio = Math.min(safeRatio, maxSafeRatio(bal, leave));
    if (!(safeRatio > 0)) return { ok: false, err: 'unsafe-spend' };
    var cost = estimateAttackCost(bal, safeRatio);
    if (balKnown && (cost >= bal || bal - cost < leave)) {
      var safer = maxSafeRatio(bal, leave);
      if (safer <= 0 || estimateAttackCost(bal, safer) >= bal) {
        return { ok: false, err: 'unsafe-spend', balance: bal, cost: cost, phase: phase };
      }
      safeRatio = safer;
    }
    var set = setTroopRatio(safeRatio);
    var il = set.il;
    // Re-read balance after ratio set (stale bank)
    if (balKnown) {
      var bal2 = getBalance(me);
      if (!(bal2 > 0) || estimateAttackCost(bal2, safeRatio) >= bal2) {
        return { ok: false, err: bal2 < 0 ? 'negative-troops' : 'unsafe-spend', balance: bal2, phase: phase };
      }
    }
    try {
      if (hasMapped) mapped.attack(il, jd);
      else if (hasModernHy) g.bB.hr.hy(il, jd);
      else g.bB.hZ.hg(il, jd);
      armSpendLock(me, bal);
      var accepted = getBalance(me) < bal || isTargetActive(me, jd) || getActiveLandFronts(me) > activeFronts;
      return {
        ok: accepted,
        err: accepted ? null : 'command-unconfirmed',
        submitted: true,
        path: hasMapped ? 'mapped-land' : hasModernHy ? 'hy-land' : 'hg-land',
        player: me,
        il: il,
        ratio: set.ratio,
        pct: set.pct,
        troopSet: set.paths,
        target: jd,
        adjacent: true,
        balance: getBalance(me),
        territory: getTerritory(me),
        reserved: minRemainingBalance(bal, terr, phase)
      };
    } catch (e) {
      return { ok: false, err: String(e && e.message || e) };
    }
  }

  /**
   * Ship / boat attack for sea-separated islands.
   * Live: bB.hZ.pZ(il, pa) → "Launch Ship Towards Mouse Pointer"
   * Only valid when aE.i3 (water maps) and target is NOT land-adjacent.
   */
  function attackViaShip(ratio, targetId) {
    var g = G();
    if (!g || !g.bB || !g.bB.hZ || typeof g.bB.hZ.pZ !== 'function') {
      return { ok: false, err: 'no-ship-api' };
    }
    if (!shipsEnabled()) return { ok: false, err: 'ships-disabled' };
    var me = myPlayer();
    if (me < 0 || !isAlive(me)) return { ok: false, err: 'no-player' };
    if (targetId == null || targetId < 0) return { ok: false, err: 'no-ship-target' };
    if (isLandAdjacent(me, targetId)) {
      return { ok: false, err: 'use-land-not-ship', target: targetId };
    }
    if (!isAlive(targetId)) return { ok: false, err: 'target-dead' };

    var set = setTroopRatio(ratio);
    var il = set.il;
    try {
      g.bB.hZ.pZ(il, targetId);
      return {
        ok: true,
        path: 'pZ-ship',
        player: me,
        il: il,
        ratio: set.ratio,
        pct: set.pct,
        target: targetId,
        adjacent: false,
        ship: true,
        balance: getBalance(me),
        territory: getTerritory(me)
      };
    } catch (e) {
      return { ok: false, err: String(e && e.message || e) };
    }
  }

  /**
   * Prefer native dF (expand empty) / dJ (attack enemy) when exported,
   * else cE, else hg.
   */
  function attackViaNative(me, targetId, troops, isEmpty, phaseHint) {
    var g = G();
    if (!g) return { ok: false, err: 'no-game' };
    if (g.contract !== 'legacy-v1' && g.contract !== 'test-fixture') {
      return { ok: false, err: 'legacy-native-unavailable' };
    }
    if (!canSpendNow(me)) {
      return { ok: false, err: 'spend-lock', balance: getBalance(me) };
    }

    troops = troops | 0;
    var bInfo = getBalanceInfo(me);
    var bal = bInfo.value;
    var balKnown = bInfo.known;
    var terr = getTerritory(me);
    var ph = phaseHint || (isEmpty ? 'LAND_RUSH' : 'PRESSURE');
    if (balKnown && !(bal > 0)) {
      return { ok: false, err: bal < 0 ? 'negative-troops' : 'zero-troops', balance: bal };
    }
    if (balKnown) {
      var needN = minMeaningful(bal, ph);
      if (troops > 0 && troops < needN) {
        return { ok: false, err: 'below-reserve', troops: troops };
      }
      if (!canAffordAttack(bal, terr, ph, true)) {
        return { ok: false, err: 'below-reserve', balance: bal };
      }
      var maxS = maxSpendableTroops(bal, terr, ph);
      if (maxS > 0 && troops > maxS) troops = maxS;
      if (troops >= bal) troops = Math.max(0, bal - 1);
      if (troops < needN) {
        return { ok: false, err: 'below-reserve', balance: bal };
      }
    } else if (troops < 12) {
      troops = 12;
    }

    // Final boundary: no non-neighbor, allied, or already-active land target.
    if (!isLandAvailable(me, targetId)) {
      return {
        ok: false,
        err: isLandAdjacent(me, targetId) ? 'target-busy' : 'not-adjacent',
        target: targetId
      };
    }

    // 1) dF / dJ exact dump functions
    try {
      if (isEmpty && typeof g.dF === 'function') {
        var ok = g.dF(me, troops);
        armSpendLock(me, bal);
        return {
          ok: !!ok || ok === undefined,
          path: 'dF',
          player: me,
          troops: troops,
          target: targetId,
          balance: getBalance(me),
          territory: getTerritory(me)
        };
      }
      if (!isEmpty && typeof g.dJ === 'function') {
        g.dJ(me, troops, targetId);
        armSpendLock(me, bal);
        return {
          ok: true,
          path: 'dJ',
          player: me,
          troops: troops,
          target: targetId,
          balance: getBalance(me),
          territory: getTerritory(me)
        };
      }
    } catch (e1) {
      // fall through
    }

    // 2) cE(g, k, y, l)
    if (typeof g.cE === 'function') {
      try {
        var frontierLen = 1;
        if (g.ax && g.ax[me]) frontierLen = g.ax[me].length || 1;
        try {
          if (isEmpty && typeof g.cQ === 'function') g.cQ(me);
          if (!isEmpty && typeof g.cL === 'function') g.cL(me, targetId);
        } catch (ePrep) {}
        g.cE(me, targetId, frontierLen, troops);
        armSpendLock(me, bal);
        return {
          ok: true,
          path: 'cE',
          player: me,
          troops: troops,
          target: targetId,
          balance: getBalance(me),
          territory: getTerritory(me)
        };
      } catch (e2) {
        return { ok: false, err: String(e2 && e2.message || e2) };
      }
    }

    return { ok: false, err: 'no-native' };
  }

  function attackViaCE(ratio, targetId, phase) {
    var me = myPlayer();
    if (me < 0) return { ok: false, err: 'no-player' };
    var bal = getBalance(me);
    var terr = getTerritory(me);
    var nid = neutralTargetId();
    var jd = targetId != null ? targetId : nid;
    if (jd == null) return { ok: false, err: 'no-jd' };
    var isEmpty = nid != null && jd === nid;
    var ph = phase || (isEmpty ? 'LAND_RUSH' : 'PRESSURE');
    // STRICT: never attack non-neighbor players
    if (!isLandAvailable(me, jd)) {
      return {
        ok: false,
        err: isLandAdjacent(me, jd) ? 'target-busy' : 'not-adjacent',
        target: jd
      };
    }
    if (!canAffordAttack(bal, terr, ph)) {
      return { ok: false, err: 'below-reserve', balance: bal };
    }
    var troops = troopsFromBalance(bal, ph, null, terr);
    if (!isEmpty) troops = applyCrushSizing(me, jd, troops, terr, ph);
    if (troops <= 0) return { ok: false, err: 'below-reserve', balance: bal };
    return attackViaNative(me, jd, troops, isEmpty, ph);
  }

  // Execute one decision, without selecting a new intent or target after failure.
  function attackSmart(opts) {
    opts = opts || {};
    var g = G();
    if (!trustedContract(g)) return { ok: false, err: 'unsupported-contract' };
    var me = myPlayer();
    if (me < 0 || !isAlive(me)) return { ok: false, err: 'dead' };
    var expand = opts.preferNeutral !== false;
    if (expand && opts.autoExpand === false || !expand && opts.autoAttack === false) {
      return { ok: false, err: 'action-disabled' };
    }
    var target = expand ? neutralTargetId()
      : opts.target != null ? opts.target : pickWeakestAdjacentEnemy(me);
    if (!Number.isInteger(target) || target < 0 || target === me ||
        !expand && target === neutralTargetId()) return { ok: false, err: 'no-border-neighbor' };
    if (!isLandAvailable(me, target)) return {
      ok: false, err: isLandAdjacent(me, target) ? 'target-busy' : 'not-adjacent', target: target
    };
    var balance = getBalance(me), territory = getTerritory(me);
    var phase = expand ? 'LAND_RUSH' : (opts.phase || 'PRESSURE');
    var liveState = getState();
    var liveEnemies = liveState.enemies || [];
    var context = {
      balance: balance, balanceKnown: balanceIsKnown(me), territory: territory,
      softCap: softCapOf(territory, me), phase: phase,
      freeLandRatio: expand ? opts.freeLand : 0, wantEnemy: !expand,
      crushable: !expand && al(balance, 8) > getBalance(target),
      enemyBal: expand ? 0 : getBalance(target), fronts: 1,
      activeFronts: getActiveLandFronts(me), frontCap: Math.min(4, getLandFrontCap(me)),
      attackSequence: opts.attackSequence, primaryDanger: opts.primaryDanger,
      minRemaining: opts.minRemaining,
      gameTimeSec: opts.gameTimeSec,
      areaTrend: opts.areaTrend,
      shrinkFrames: opts.shrinkFrames,
      adjEnemies: liveEnemies,
      incoming: liveEnemies.reduce(function(sum, e) { return sum + Math.max(0, Number(e.incoming) || 0); }, 0)
    };
    var budget = planSpend(context);
    if (!budget.canAfford) return { ok: false, err: budget.reason, reason: budget.reason };
    var ratio = opts.ratio != null ? opts.ratio : budget.ratio;
    context.minRemaining = Math.max(budget.minRemaining, Number(opts.minRemaining) || 0);
    var result;
    if (g.modern || g.bB && (g.bB.hr || g.bB.hZ)) {
      result = attackViaHg(ratio, target, phase, context);
    } else {
      var safe = maxSafeRatio(balance, context.minRemaining);
      ratio = Math.min(ratio, safe);
      if (!(ratio > 0)) return { ok: false, err: 'unsafe-spend' };
      result = attackViaNative(me, target, Math.floor(balance * ilToRatio(encodeIl(ratio))), expand, phase);
    }
    result.policy = expand ? 'expand-empty' : 'focus-' + target;
    result.phase = phase;
    return result;
  }

  // Compatibility endpoint: one command, then await a fresh state before another.
  function attackBurst(opts) {
    if (opts && opts.fronts === 0) return { ok: false, okCount: 0, fronts: 0, results: [] };
    var result = attackSmart(opts);
    return { ok: !!result.ok, okCount: result.ok ? 1 : 0, fronts: 1,
      results: [result], last: result, err: result.err };
  }

  function getState() {
    var g = G();
    var me = myPlayer();
    var contract = g && g.contract || 'unmapped';
    var contractOk = trustedContract(g);
    var hasHg = !!(g && (
      (g.modern && typeof g.modern.attack === 'function') ||
      (g.bB && g.bB.hZ && typeof g.bB.hZ.hg === 'function') ||
      (g.bB && g.bB.hr && typeof g.bB.hr.hy === 'function')
    ));
    var legacyNative = contract === 'legacy-v1' || contract === 'test-fixture';
    var hasCE = !!(legacyNative && g && typeof g.cE === 'function');
    var hasDF = !!(legacyNative && g && typeof g.dF === 'function');
    var hasDJ = !!(legacyNative && g && typeof g.dJ === 'function');
    var ready = !!(contractOk && g && me >= 0 && (hasHg || hasCE || hasDF || hasDJ) && (g.ah || g.aq));

    var bInf = me >= 0 ? getBalanceInfo(me) : { value: 0, known: false };
    var bal = bInf.value;
    var balKnown = bInf.known;
    var terr = me >= 0 ? getTerritory(me) : 0;
    var softCap = softCapOf(terr, me);
    var activeFronts = me >= 0 ? getActiveLandFronts(me) : 0;
    var humanFrontCap = me >= 0 ? getLandFrontCap(me) : 4;
    var strategicFrontCap = Math.min(4, humanFrontCap);
    var availableNeighbors = me >= 0 ? getAdjacentIds(me, true) : [];
    var physicalNeighbors = me >= 0 ? getAdjacentIds(me, false) : [];

    // Build adjacent enemies from the authoritative border graph first. The old
    // global scan stopped after 16 low-id players and silently lost high-id
    // neighbors in large lobbies.
    var availableSet = {};
    var physicalSet = {};
    var ai;
    for (ai = 0; ai < availableNeighbors.length; ai++) availableSet[availableNeighbors[ai] | 0] = 1;
    for (ai = 0; ai < physicalNeighbors.length; ai++) physicalSet[physicalNeighbors[ai] | 0] = 1;

    var enemies = [];
    var maxP = me >= 0 ? playerCount() : 0;
    var nid = neutralTargetId();
    var globalRank = 1;
    var leaderId = me;
    var leaderTerritory = terr;
    var totalEnemyTerritory = 0;
    var alivePlayers = me >= 0 && isAlive(me) ? 1 : 0;
    for (var p = 0; p < maxP; p++) {
      if (p === me || (nid != null && p === nid) || !isAlive(p)) continue;
      var t = getTerritory(p) | 0;
      if (t <= 0) continue;
      alivePlayers++;
      totalEnemyTerritory += t;
      if (t > terr) globalRank++;
      if (t > leaderTerritory) {
        leaderTerritory = t;
        leaderId = p;
      }
      if (!physicalSet[p]) continue;
      var enemyBalance = getBalance(p) | 0;
      var incoming = 0;
      try {
        if (g && g.modern && typeof g.modern.incoming === 'function') incoming = Math.max(0, g.modern.incoming(p, me) | 0);
        else if (g && g.ae && typeof g.ae.hU === 'function') incoming = Math.max(0, g.ae.hU(p, me) | 0);
      } catch (eIncoming) {}
      enemies.push({
        id: p | 0,
        bal: enemyBalance,
        effectiveBal: enemyBalance + incoming,
        incoming: incoming,
        terr: t,
        adjacent: true,
        available: !!availableSet[p],
        shipOnly: false,
        crushable: !!(al(bal, 8) > enemyBalance)
      });
    }
    enemies.sort(function (a, b) {
      if (a.available !== b.available) return a.available ? -1 : 1;
      if (a.effectiveBal !== b.effectiveBal) return a.effectiveBal - b.effectiveBal;
      return a.terr - b.terr;
    });
    if (enemies.length > 32) enemies.length = 32;

    var planSt = me >= 0
      ? planSpend({
          balance: bal, balanceKnown: balKnown, territory: terr, softCap: softCap,
          phase: 'LAND_RUSH', fronts: 1, activeFronts: activeFronts,
          frontCap: strategicFrontCap
        })
      : { canAfford: false, minRemaining: 0, maxSpendTotal: 0 };
    var minRem = planSt.minRemaining | 0;
    var maxSp = planSt.maxSpendTotal | 0;

    return {
      ready: ready,
      armed: _armed,
      patched: !!window.__TIO_SCRIPT_PATCHED__,
      hookVer: HOOK_VER,
      contract: contract,
      err: window.__TIO_GAME_ERR__ || null,
      player: me,
      alive: me >= 0 ? isAlive(me) : false,
      balance: bal,
      balanceKnown: balKnown,
      territory: terr,
      softCap: softCap,
      density: softCap > 0 && bal > 0 ? bal / softCap : 0,
      gameTick: getGameTick(),
      globalRank: globalRank,
      leaderId: leaderId,
      leaderTerritory: leaderTerritory,
      totalEnemyTerritory: totalEnemyTerritory,
      alivePlayers: alivePlayers,
      minRemaining: minRem,
      maxSpendable: maxSp,
      canAfford: !!planSt.canAfford,
      neutralId: neutralTargetId(),
      hasHg: hasHg,
      hasCE: hasCE,
      hasDF: hasDF,
      hasDJ: hasDJ,
      paths: (hasHg ? (contract === 'live-modern-v1' ? 'hy' : 'hg') : '') +
        (hasCE ? '+cE' : '') + (hasDF ? '+dF' : '') + (hasDJ ? '+dJ' : ''),
      spectating: !!(g && g.aE && g.aE.hI),
      difficulty: DIFF,
      pressure: dT[Math.min(DIFF, dT.length - 1)],
      activeFronts: activeFronts,
      humanFrontCap: humanFrontCap,
      multiFront: strategicFrontCap,
      boatOps: [1, 2, 3, 4, 6, 8][Math.min(DIFF, 5)],
      pulseMs: PULSE_MS[Math.min(DIFF, PULSE_MS.length - 1)],
      hardRatio: ilToRatio(KG_IL[Math.min(DIFF, KG_IL.length - 1)]),
      troopRatio: getTroopRatio(),
      troopIl: _forcedIl,
      troopPct: _forcedRatio != null ? Math.round(_forcedRatio * 100) : null,
      hdPatched: _hdPatched,
      neighbors: availableNeighbors,
      physicalNeighbors: physicalNeighbors,
      shipsEnabled: shipsEnabled(),
      enemies: enemies
    };
  }

  function sanitizeForClone(obj, depth) {
    if (depth == null) depth = 0;
    if (depth > 6) return null;
    if (obj === null || obj === undefined) return obj;
    var t = typeof obj;
    if (t === 'number') return Number.isFinite(obj) ? obj : null;
    if (t === 'string' || t === 'boolean') return obj;
    if (t === 'function' || t === 'symbol' || t === 'bigint') return null;
    if (Array.isArray(obj)) {
      var arr = [];
      for (var i = 0; i < obj.length; i++) {
        var item = sanitizeForClone(obj[i], depth + 1);
        arr.push(item !== undefined ? item : null);
      }
      return arr;
    }
    if (t === 'object') {
      var clean = {};
      for (var k in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, k)) {
          var v = sanitizeForClone(obj[k], depth + 1);
          if (v !== undefined && typeof v !== 'function') {
            clean[k] = v;
          }
        }
      }
      return clean;
    }
    return null;
  }

  window.addEventListener('message', function (ev) {
    if (ev.source !== window) return;
    var data = ev.data;
    if (!data || data.source !== SRC) return;
    if (data.version !== BRIDGE_VER) return;
    if (!Number.isFinite(Number(data.id))) return;

    var id = data.id;
    var result = { ok: false, err: 'unknown' };
    try {
      var mutatesGame = data.type === 'set-troop' || data.type === 'set-ratio' ||
        data.type === 'attack' || data.type === 'attack-burst' ||
        data.type === 'attack-neutral' || data.type === 'attack-enemy' ||
        data.type === 'attack-ship' || data.type === 'attack-target';

      if (data.type === 'arm') {
        _armed = data.armed !== false;
        if (!_armed) {
          _spendLockUntil = 0;
          _spendLockBal = null;
        }
        result = { ok: true, armed: _armed, state: getState() };
      } else if (data.type === 'disarm') {
        _armed = false;
        _spendLockUntil = 0;
        _spendLockBal = null;
        result = { ok: true, armed: false, state: getState() };
      } else if (mutatesGame && !_armed) {
        result = { ok: false, err: 'not-armed' };
      } else if (mutatesGame && !getState().ready) {
        result = { ok: false, err: 'unsupported-contract' };
      } else if (data.type === 'ping' || data.type === 'state') {
        result = { ok: true, state: getState() };
      } else if (data.type === 'set-diff') {
        DIFF = Math.max(0, Math.min(5, data.diff | 0));
        result = { ok: true, difficulty: DIFF, state: getState() };
      } else if (data.type === 'set-troop' || data.type === 'set-ratio') {
        // Isolated world sets adaptive % before canvas clicks
        result = setTroopRatio(data.ratio != null ? data.ratio : 0.25);
        result.state = getState();
      } else if (data.type === 'attack') {
        if (data.ratio != null) setTroopRatio(data.ratio);
        result = attackSmart({
          ratio: data.ratio,
          preferNeutral: data.preferNeutral !== false,
          phase: data.phase || 'LAND_RUSH',
          freeLand: data.freeLand,
          target: data.target,
          autoExpand: data.autoExpand,
          autoAttack: data.autoAttack,
          minRemaining: data.minRemaining,
          primaryDanger: data.primaryDanger,
          attackSequence: data.attackSequence,
          gameTimeSec: data.gameTimeSec,
          areaTrend: data.areaTrend,
          shrinkFrames: data.shrinkFrames
        });
      } else if (data.type === 'attack-burst') {
        if (data.ratio != null) setTroopRatio(data.ratio);
        result = attackBurst({
          ratio: data.ratio,
          preferNeutral: data.preferNeutral !== false,
          phase: data.phase || 'LAND_RUSH',
          freeLand: data.freeLand,
          fronts: data.fronts,
          target: data.target,
          autoExpand: data.autoExpand,
          autoAttack: data.autoAttack,
          minRemaining: data.minRemaining,
          primaryDanger: data.primaryDanger,
          attackSequence: data.attackSequence,
          gameTimeSec: data.gameTimeSec,
          areaTrend: data.areaTrend,
          shrinkFrames: data.shrinkFrames
        });
      } else if (data.type === 'attack-neutral') {
        var nid = neutralTargetId();
        var rn = data.ratio != null ? data.ratio : commitRatioFor('LAND_RUSH', data.freeLand);
        result = attackViaHg(rn, nid, 'LAND_RUSH');
        if (!result.ok) result = attackViaCE(rn, nid, 'LAND_RUSH');
        if (result.ok) result.policy = 'neutral';
      } else if (data.type === 'attack-enemy') {
        // Land only, border neighbors only — never ship unless allowShip:true
        result = attackSmart({
          ratio: data.ratio != null ? data.ratio : commitRatioFor('PRESSURE', 0),
          preferNeutral: false,
          phase: data.phase || 'PRESSURE',
          freeLand: data.freeLand != null ? data.freeLand : 0,
          allowShip: false
        });
      } else if (data.type === 'attack-ship') {
        // Explicit ship only
        var shipT = data.target != null ? data.target : -1;
        if (shipT < 0) {
          result = { ok: false, err: 'ship-disabled-use-border-only' };
        } else {
          result = attackViaShip(
            data.ratio != null ? data.ratio : commitRatioFor('PRESSURE', 0),
            shipT
          );
        }
      } else if (data.type === 'attack-target') {
        var jd = data.target;
        var phT = data.phase || 'PRESSURE';
        var rt = data.ratio != null ? data.ratio : commitRatioFor(phT, 0);
        var meT = myPlayer();
        // Refuse non-adjacent land targets — never auto-redirect to ship
        if (meT >= 0 && !isLandAvailable(meT, jd)) {
          result = {
            ok: false,
            err: isLandAdjacent(meT, jd) ? 'target-busy' : 'not-adjacent',
            target: jd
          };
        } else {
          result = attackViaHg(rt, jd, phT);
          if (!result.ok) result = attackViaCE(rt, jd, phT);
        }
      }
    } catch (e) {
      result = { ok: false, err: String(e && e.message || e) };
    }
    try {
      var safeResult = sanitizeForClone(result);
      window.postMessage(
        { source: REPLY, version: BRIDGE_VER, id: id, result: safeResult },
        location.origin === 'null' ? '*' : location.origin
      );
    } catch (postErr) {
      try {
        window.postMessage(
          {
            source: REPLY,
            version: BRIDGE_VER,
            id: id,
            result: { ok: false, err: 'clone-error: ' + String(postErr && postErr.message || postErr) }
          },
          location.origin === 'null' ? '*' : location.origin
        );
      } catch (fatalErr) {}
    }
  });

  // DOM telemetry for isolated world + debug
  setInterval(function () {
    try {
      var st = getState();
      document.documentElement.setAttribute(
        'data-tio-internal',
        st.ready ? '1' : window.__TIO_SCRIPT_PATCHED__ ? 'patched' : '0'
      );
      document.documentElement.setAttribute('data-tio-paths', st.paths || '');
      document.documentElement.setAttribute('data-tio-hook', HOOK_VER);
      if (st.player >= 0) {
        document.documentElement.setAttribute('data-tio-player', String(st.player));
        document.documentElement.setAttribute('data-tio-bal', String(st.balance | 0));
        document.documentElement.setAttribute('data-tio-bal-known', st.balanceKnown ? '1' : '0');
      }
    } catch (e2) {}
  }, 350);

  // Expose for console debugging
  // Keep hd patch alive once game objects appear
  setInterval(function () { try { ensureHdPatch(); } catch (e) {} }, 2000);

  window.__TIO_HOOK_API__ = {
    version: HOOK_VER,
    state: getState,
    attackSmart: attackSmart,
    attackBurst: attackBurst,
    setTroopRatio: setTroopRatio,
    planSpend: planSpend,
    estimateAttackCost: estimateAttackCost,
    maxSafeRatio: maxSafeRatio,
    canSpendNow: canSpendNow,
    canAffordAttack: canAffordAttack,
    minRemainingBalance: minRemainingBalance,
    maxSpendableTroops: maxSpendableTroops,
    clampRatioToReserve: clampRatioToReserve,
    setDiff: function (d) { DIFF = Math.max(0, Math.min(5, d | 0)); }
  };

  console.log('%c[TIO MAIN Hook v' + HOOK_VER + '] source-faithful dF/dJ/cE + hg brain ready', 'color:#38bdf8;font-weight:bold');
})();
