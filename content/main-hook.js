/**
 * MAIN-world hook v9.0 — Territorial.io SOURCE-FAITHFUL bot brain
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

  var SRC = 'tio-bot-isolated';
  var REPLY = 'tio-bot-main';
  var HOOK_VER = '9.9.9';

  // Dump dU: 0=VE … 5=Very Hard  — DEFAULT VERY HARD (learn from crushers)
  var DIFF = 5;
  var dT = [60, 74, 112, 200, 256, 512];
  // Dump kScale openers (troops ≈ k/1000 * balance). VH opens ~45%.
  var DU_K_OPEN = [1000, 1000, 900, 650, 450, 450];
  var DU_K_SUSTAIN = [1000, 920, 870, 450, 250, 220];
  // Live kg il (small for VH) — we prefer dump aggressiveness for human path
  var KG_IL = [500, 450, 400, 300, 200, 180]; // boosted VH human il (~17–20%)
  var MULTI_FRONT = [1, 2, 3, 4, 5, 6];
  var PULSE_MS = [450, 400, 340, 200, 120, 80];
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
    'get b1(){return typeof b1!=="undefined"?b1:null},' +
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
    'get al(){return typeof al==="function"?al:null}' +
    '};window.__TIO_GAME_READY__=true;window.__TIO_HOOK_VER__="' + HOOK_VER + '";' +
    '}catch(e){window.__TIO_GAME_ERR__=String(e&&e.message||e);}';

  /**
   * SAFE patch rules (fixes black screen):
   * 1) NEVER wipe/block the original script
   * 2) NEVER inject a second full copy of the game (double-boot = black canvas)
   * 3) Only rewrite textContent IN PLACE when we catch the node early enough
   * 4) Export snippet must sit within the last ~2KB of the file (true IIFE end)
   * 5) If anything looks wrong, leave the game script 100% alone
   */
  function isGameScript(text) {
    if (!text || text.length < 80000) return false;
    return (
      text.indexOf('canvasA') >= 0 ||
      (text.indexOf('territorial.io') >= 0 && text.length > 100000) ||
      (text.indexOf('Uint32Array') >= 0 && text.indexOf('fillText') >= 0 && text.length > 200000)
    );
  }

  function patchScriptText(text) {
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
    if (!b) return 0;
    return Math.floor(a / b + 1 / (2 * b));
  }

  function encodeIl(ratio) {
    // Game: spent ≈ floor(B * (il+1) / 1024), aS.hd() = floor(ratio*1024+0.5)-1
    var r = Math.max(0.08, Math.min(0.55, ratio != null ? ratio : 0.25));
    return Math.max(0, Math.min(1023, Math.floor(r * 1024 + 0.5) - 1));
  }

  function ilToRatio(il) {
    return (il + 1) / 1024;
  }

  function G() {
    return window.__TIO_GAME__ || null;
  }

  /**
   * CRITICAL: map clicks use aS.hd() which reads the UI troop bar (often stuck ~79%).
   * We force the spend % by:
   *  1) patching aS.hd() to return our il
   *  2) writing bm.eU.data[182] / bm.pW.pX(182, il) when available
   * Live: il=(data[182].value+1)/1024 ; hg also pX(182,il)
   */
  var _hdPatched = false;
  var _forcedIl = null;
  var _forcedRatio = null;

  function ensureHdPatch() {
    var g = G();
    if (!g || !g.aS || typeof g.aS.hd !== 'function') return false;
    if (_hdPatched || g.aS.__tioHdPatched) {
      _hdPatched = true;
      return true;
    }
    try {
      var orig = g.aS.hd.bind(g.aS);
      g.aS.hd = function () {
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

  /**
   * Set troop spend ratio for BOTH click path (aS.hd) and display storage.
   * Returns { ok, il, ratio, path }
   */
  function setTroopRatio(ratio) {
    // Hard cap — never all-in 70%+ (that's why you die on Normal)
    var r = Math.max(0.10, Math.min(0.50, ratio != null ? ratio : 0.25));
    var il = encodeIl(r);
    _forcedIl = il;
    _forcedRatio = r;
    window.__TIO_FORCE_IL__ = il;
    window.__TIO_FORCE_RATIO__ = r;

    var paths = [];
    ensureHdPatch();
    if (_hdPatched) paths.push('hd-patch');

    var g = G();
    if (g && g.bm) {
      try {
        if (g.bm.pW && typeof g.bm.pW.pX === 'function') {
          g.bm.pW.pX(182, il);
          paths.push('pX182');
        }
      } catch (e1) {}
      try {
        if (g.bm.eU && g.bm.eU.data && g.bm.eU.data[182]) {
          g.bm.eU.data[182].value = il;
          paths.push('data182');
        }
      } catch (e2) {}
    }

    try {
      document.documentElement.setAttribute('data-tio-troop', String(Math.round(r * 100)));
      document.documentElement.setAttribute('data-tio-il', String(il));
    } catch (e3) {}

    return {
      ok: paths.length > 0 || _hdPatched,
      il: il,
      ratio: r,
      pct: Math.round(r * 100),
      paths: paths.join('+') || 'force-only'
    };
  }

  function getTroopRatio() {
    if (_forcedRatio != null) return _forcedRatio;
    var g = G();
    try {
      if (g && g.bm && g.bm.eU && g.bm.eU.data && g.bm.eU.data[182]) {
        return ilToRatio(g.bm.eU.data[182].value | 0);
      }
    } catch (e) {}
    if (g && g.aS && typeof g.aS.hd === 'function') {
      try { return ilToRatio(g.aS.hd()); } catch (e2) {}
    }
    return null;
  }

  function myPlayer() {
    var g = G();
    if (!g) return -1;
    if (g.aE && g.aE.et != null) return g.aE.et | 0;
    if (typeof g.ap === 'number') return g.ap | 0;
    // Some builds: aE.ap or similar
    if (g.aE && typeof g.aE.ap === 'number') return g.aE.ap | 0;
    return -1;
  }

  function getBalance(p) {
    var g = G();
    if (!g) return 0;
    if (g.ah && g.ah.hB) return (g.ah.hB[p] | 0) || 0;
    if (g.aq) return (g.aq[p] | 0) || 0;
    return 0;
  }

  function getTerritory(p) {
    var g = G();
    if (!g) return 0;
    if (g.ah && g.ah.gx) return (g.ah.gx[p] | 0) || 0;
    if (g.bN) return (g.bN[p] | 0) || 0;
    return 0;
  }

  function isAlive(p) {
    var g = G();
    if (!g) return false;
    if (g.ah && g.ah.n4) return g.ah.n4[p] !== 0;
    return getTerritory(p) > 0 || getBalance(p) > 0;
  }

  function neutralTargetId() {
    var g = G();
    if (!g) return null;
    if (g.aE && g.aE.f6 != null) return g.aE.f6;
    if (g.b1 != null) return g.b1;
    return null;
  }

  function playerCount() {
    var g = G();
    if (g && g.ah && g.ah.n4) return Math.min(g.ah.n4.length, 128);
    if (g && g.ah && g.ah.hB) return Math.min(g.ah.hB.length, 128);
    if (g && g.aq) return Math.min(g.aq.length, 128);
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
    var softCap = Math.min(100 * Math.max(1, terr), 80000);
    var density = softCap > 0 ? bal / softCap : 0.6;
    var free = freeLandHint != null ? freeLandHint : 0.1;
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
   * Absolute troops for cE/dF/dJ — respect ratio, do NOT force ~80% dump.
   * Only dump excess when truly over soft-cap (density > 1.0).
   */
  function troopsFromBalance(balance, phase, freeLandHint, territory) {
    var ratio = commitRatioFor(phase, freeLandHint);
    ratio = Math.max(0.10, Math.min(0.50, ratio));
    var troops = Math.floor(balance * ratio);
    var terr = territory != null ? territory : 0;
    var softCap = Math.min(100 * Math.max(1, terr), 80000);
    var density = softCap > 0 ? balance / softCap : 0.5;
    // Only when over-cap: push toward dumping excess (still cap 50%)
    if (density > 1.05) {
      var softReserve = Math.max(60, Math.floor(softCap * 0.2));
      var dump = balance - softReserve;
      if (dump > troops) troops = Math.min(dump, Math.floor(balance * 0.48));
    }
    if (troops < 60 && balance >= 80) troops = Math.min(balance, Math.max(60, Math.floor(balance * 0.15)));
    var reserve = Math.max(al(balance * 32, 1024), Math.floor(balance * 0.12));
    if (troops > balance - reserve) troops = Math.max(1, balance - reserve);
    return Math.max(1, troops);
  }

  /**
   * dJ crush sizing: if we are 8× stronger, force enough to finish.
   *   if al(aq[g],8) > aq[y]: k = max(k, al(11*aq[y],5))
   */
  function applyCrushSizing(me, enemy, troops) {
    var myBal = getBalance(me);
    var enBal = getBalance(enemy);
    if (al(myBal, 8) > enBal) {
      var need = al(11 * enBal, 5);
      if (troops < need) troops = need;
      // Cap at balance - reserve
      var reserve = al(myBal * 32, 1024);
      if (troops > myBal - reserve) troops = Math.max(1, myBal - reserve);
    }
    return troops;
  }

  /**
   * Live game: land targets must be ADJACENT neighbors from ae (border graph).
   *   ae.gG(player) = neighbor count
   *   ae.gL(player, i) = neighbor player id (or empty marker)
   *   ae.jp(player, jd) = true if jd is adjacent to player
   * Land attack hg fails if !ae.jp && !ae.k8 (see bD.gV path).
   */
  function getAdjacentIds(me) {
    var g = G();
    var out = [];
    var seen = {};
    var nid = neutralTargetId();
    if (!g || me < 0) return out;

    // Preferred: official neighbor table
    try {
      if (g.ae && typeof g.ae.gG === 'function' && typeof g.ae.gL === 'function') {
        var n = g.ae.gG(me) | 0;
        for (var i = 0; i < n; i++) {
          var jd = g.ae.gL(me, i);
          if (jd == null || jd < 0) continue;
          if (seen[jd]) continue;
          seen[jd] = 1;
          out.push(jd | 0);
        }
        return out;
      }
    } catch (e) {}

    // Fallback: if ae.jp exists, scan alive players
    try {
      if (g.ae && typeof g.ae.jp === 'function') {
        var maxP = playerCount();
        for (var p = 0; p < maxP; p++) {
          if (p === me) continue;
          if (g.ae.jp(me, p)) {
            out.push(p);
          }
        }
      }
    } catch (e2) {}
    return out;
  }

  function isLandAdjacent(me, jd) {
    if (me < 0 || jd == null) return false;
    var nid = neutralTargetId();
    // Free land is always a valid land-attack target when bordering
    if (nid != null && jd === nid) {
      var adj = getAdjacentIds(me);
      // empty may appear as f6 in neighbor list, or always allowed when free land exists
      for (var i = 0; i < adj.length; i++) if (adj[i] === nid) return true;
      // If we have any free-land expansion, game still needs border — require jp if available
      var g = G();
      try {
        if (g && g.ae && typeof g.ae.jp === 'function') return !!g.ae.jp(me, nid);
      } catch (e) {}
      return adj.length >= 0; // expand path may still try dF
    }
    var g2 = G();
    try {
      if (g2 && g2.ae && typeof g2.ae.jp === 'function') return !!g2.ae.jp(me, jd);
    } catch (e3) {}
    var list = getAdjacentIds(me);
    for (var k = 0; k < list.length; k++) if (list[k] === jd) return true;
    return false;
  }

  /** Ships allowed on maps with aE.i3 (islands / water separation). */
  function shipsEnabled() {
    var g = G();
    try {
      if (g && g.aE && g.aE.i3) return true;
    } catch (e) {}
    return false;
  }

  /**
   * Adjacent land enemies only (workable hg targets).
   * Prefer weak / crushable among neighbors.
   */
  function pickWeakestAdjacentEnemy(me) {
    var nid = neutralTargetId();
    var adj = getAdjacentIds(me);
    var best = -1;
    var bestScore = Infinity;
    for (var i = 0; i < adj.length; i++) {
      var p = adj[i];
      if (p === me) continue;
      if (nid != null && p === nid) continue; // free land handled separately
      if (!isAlive(p)) continue;
      var t = getTerritory(p);
      if (t <= 0) continue;
      var bal = getBalance(p);
      var score = t * 10 + bal;
      if (al(getBalance(me), 8) > bal) score *= 0.35;
      // Prefer longer shared border if ae.gM available (border pressure)
      try {
        var g = G();
        if (g && g.ae && typeof g.ae.gM === 'function') {
          // gM(me, index) border weight for neighbor at same index
          var idx = i;
          var bw = g.ae.gM(me, idx);
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

  /** Any adjacent land enemy (fallback). */
  function pickAnyAdjacentEnemy(me) {
    return pickWeakestAdjacentEnemy(me);
  }

  /**
   * Island / sea-separated enemy (NOT land-adjacent) — needs ship (pZ).
   */
  function pickShipTarget(me) {
    if (!shipsEnabled()) return -1;
    var nid = neutralTargetId();
    var adjSet = {};
    var adj = getAdjacentIds(me);
    for (var i = 0; i < adj.length; i++) adjSet[adj[i]] = 1;
    var maxP = playerCount();
    var best = -1;
    var bestScore = Infinity;
    for (var p = 0; p < maxP; p++) {
      if (p === me) continue;
      if (nid != null && p === nid) continue;
      if (adjSet[p]) continue; // land-adjacent → use hg not ship
      if (!isAlive(p)) continue;
      var t = getTerritory(p);
      if (t <= 0) continue;
      var bal = getBalance(p);
      var score = t * 10 + bal;
      if (al(getBalance(me), 8) > bal) score *= 0.4;
      if (score < bestScore) {
        bestScore = score;
        best = p;
      }
    }
    return best;
  }

  /** True if free land appears as an adjacent expand target. */
  function hasAdjacentFreeLand(me) {
    var nid = neutralTargetId();
    if (nid == null) return false;
    var adj = getAdjacentIds(me);
    for (var i = 0; i < adj.length; i++) if (adj[i] === nid) return true;
    var g = G();
    try {
      if (g && g.ae && typeof g.ae.jp === 'function') return !!g.ae.jp(me, nid);
    } catch (e) {}
    return false;
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
    var cap = Math.min(100 * Math.max(1, terr), 80000);
    if (bal > cap * 0.9) return true;
    // Still some free land
    return free > 0.015;
  }

  // ---------- Attack paths ----------

  function attackViaHg(ratio, targetId) {
    var g = G();
    if (!g || !g.bB || !g.bB.hZ || typeof g.bB.hZ.hg !== 'function') {
      return { ok: false, err: 'no-hg' };
    }
    var me = myPlayer();
    if (me < 0 || !isAlive(me)) return { ok: false, err: 'no-player' };
    var jd = targetId;
    if (jd == null) jd = neutralTargetId();
    if (jd == null) return { ok: false, err: 'no-jd' };

    // LAND attacks only work on adjacent targets (or free land). Never fire dead moves.
    var nid = neutralTargetId();
    var isEmpty = nid != null && jd === nid;
    if (!isEmpty && !isLandAdjacent(me, jd)) {
      return { ok: false, err: 'not-adjacent', target: jd };
    }

    var set = setTroopRatio(ratio);
    var il = set.il;
    try {
      g.bB.hZ.hg(il, jd);
      return {
        ok: true,
        path: 'hg-land',
        player: me,
        il: il,
        ratio: set.ratio,
        pct: set.pct,
        troopSet: set.paths,
        target: jd,
        adjacent: true,
        balance: getBalance(me),
        territory: getTerritory(me)
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
  function attackViaNative(me, targetId, troops, isEmpty) {
    var g = G();
    if (!g) return { ok: false, err: 'no-game' };

    // 1) dF / dJ exact dump functions
    try {
      if (isEmpty && typeof g.dF === 'function') {
        var ok = g.dF(me, troops);
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
        // Prepare borders like dump when helpers exist
        try {
          if (isEmpty && typeof g.cQ === 'function') g.cQ(me);
          if (!isEmpty && typeof g.cL === 'function') g.cL(me, targetId);
        } catch (ePrep) {}
        g.cE(me, targetId, frontierLen, troops);
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
    var nid = neutralTargetId();
    var jd = targetId != null ? targetId : nid;
    if (jd == null) return { ok: false, err: 'no-jd' };
    var isEmpty = nid != null && jd === nid;
    if (!isEmpty && !isLandAdjacent(me, jd)) {
      return { ok: false, err: 'not-adjacent', target: jd };
    }
    var troops = troopsFromBalance(bal, phase || (isEmpty ? 'LAND_RUSH' : 'PRESSURE'), null);
    if (!isEmpty) troops = applyCrushSizing(me, jd, troops);
    return attackViaNative(me, jd, troops, isEmpty);
  }

  /**
   * Attack policy (adjacency-correct):
   *  1) Expand free land if adjacent (hg / dF) — never "attack air"
   *  2) Land-attack ADJACENT enemies only (ae.jp / gL neighbors)
   *  3) Ship-attack sea-isolated enemies via pZ when aE.i3
   * Never land-attack non-adjacent players (invalid move).
   */
  function attackSmart(opts) {
    opts = opts || {};
    var g = G();
    if (!g) return { ok: false, err: 'no-game' };
    var me = myPlayer();
    if (me < 0) return { ok: false, err: 'no-me' };
    if (!isAlive(me)) return { ok: false, err: 'dead' };

    var freeLand = opts.freeLand != null ? opts.freeLand : 0.1;
    var preferNeutral = opts.preferNeutral !== false;
    var phase = opts.phase || 'LAND_RUSH';
    var ratioOverride = opts.ratio;
    var allowShip = opts.allowShip !== false;
    var myBal = getBalance(me);
    var myTerr = getTerritory(me);
    var nid = neutralTargetId();
    var neighbors = getAdjacentIds(me);

    // Collapse override: fight even if free land remains
    if (phase === 'SURVIVE') preferNeutral = false;

    var ratio = ratioOverride != null
      ? Math.max(0.10, Math.min(0.50, ratioOverride))
      : commitRatioFor(phase, freeLand);
    setTroopRatio(ratio);

    // Count adjacent free land / enemies for policy
    var adjFree = false;
    var adjEnemyCount = 0;
    for (var ni = 0; ni < neighbors.length; ni++) {
      if (nid != null && neighbors[ni] === nid) adjFree = true;
      else if (neighbors[ni] !== me && isAlive(neighbors[ni])) adjEnemyCount++;
    }
    // freeLand vision hint — try expand if free land exists (hg validates border)
    if (freeLand > 0.02) adjFree = true;

    // --- 1) EXPAND free land (land attack to empty) ---
    var expandFirst = preferNeutral !== false && (freeLand > 0.02 || shouldExpandEmpty(me, freeLand, true));
    if (expandFirst && nid != null) {
      var expandPhase = freeLand > 0.1 ? 'OPENING' : 'LAND_RUSH';
      var expandRatio = ratioOverride != null ? ratio : commitRatioFor(expandPhase, freeLand);
      var expTroops = troopsFromBalance(myBal, expandPhase, freeLand, myTerr);
      var rN = attackViaNative(me, nid, expTroops, true);
      if (rN.ok) {
        rN.policy = 'expand-empty';
        rN.phase = expandPhase;
        rN.ratio = expandRatio;
        rN.adjacent = true;
        return rN;
      }
      var rH = attackViaHg(expandRatio, nid);
      if (rH.ok) {
        rH.policy = 'expand-empty';
        rH.phase = expandPhase;
        rH.ratio = expandRatio;
        return rH;
      }
    }

    // --- 2) LAND fight: ONLY adjacent enemies (ae neighbors) ---
    var landFoe = pickWeakestAdjacentEnemy(me);
    var wantFight = preferNeutral === false || freeLand < 0.04 ||
      phase === 'PRESSURE' || phase === 'SURVIVE' || phase === 'KILL' || adjEnemyCount > 0;

    if (landFoe >= 0 && wantFight) {
      var crushPhase = (al(myBal, 8) > getBalance(landFoe)) ? 'CRUSH' : 'PRESSURE';
      var crushRatio = ratioOverride != null
        ? Math.min(0.50, ratio * 1.1)
        : commitRatioFor(crushPhase, freeLand);
      var troops = troopsFromBalance(myBal, crushPhase, freeLand, myTerr);
      troops = applyCrushSizing(me, landFoe, troops);
      // Double-check adjacency before any land API
      if (isLandAdjacent(me, landFoe)) {
        var rC = attackViaNative(me, landFoe, troops, false);
        if (rC.ok) {
          rC.policy = 'land-adj-' + landFoe;
          rC.phase = crushPhase;
          rC.ratio = crushRatio;
          rC.adjacent = true;
          return rC;
        }
        var rC2 = attackViaHg(crushRatio, landFoe);
        if (rC2.ok) {
          rC2.policy = 'land-adj-' + landFoe;
          rC2.phase = crushPhase;
          rC2.ratio = crushRatio;
          return rC2;
        }
      }
    }

    // --- 3) SHIP fight: non-adjacent islands (pZ boat button) ---
    if (allowShip && wantFight && shipsEnabled()) {
      var shipFoe = pickShipTarget(me);
      if (shipFoe >= 0) {
        var shipRatio = ratioOverride != null ? Math.min(0.40, ratio) : commitRatioFor('PRESSURE', 0);
        var rS = attackViaShip(shipRatio, shipFoe);
        if (rS.ok) {
          rS.policy = 'ship-' + shipFoe;
          rS.phase = phase;
          return rS;
        }
      }
    }

    // --- 4) Expand fallback if any free land ---
    if (nid != null) {
      var r4 = attackViaHg(ratio, nid);
      if (r4.ok) {
        r4.policy = 'expand-fallback';
        return r4;
      }
    }

    // --- 5) Last adjacent enemy if any ---
    if (landFoe >= 0 && isLandAdjacent(me, landFoe)) {
      var r5 = attackViaHg(ratio, landFoe);
      if (r5.ok) {
        r5.policy = 'land-last-' + landFoe;
        return r5;
      }
    }

    return {
      ok: false,
      err: 'no-adjacent-target',
      phase: phase,
      neighbors: neighbors.length,
      adjEnemyCount: adjEnemyCount,
      ships: shipsEnabled(),
      balance: myBal,
      territory: myTerr
    };
  }

  /**
   * Multi-burst: VH uses ki=6 fronts. Sequential expand/fight pulses.
   */
  function attackBurst(opts) {
    opts = opts || {};
    var fronts = opts.fronts || MULTI_FRONT[Math.min(DIFF, MULTI_FRONT.length - 1)];
    fronts = Math.max(1, Math.min(8, fronts | 0));
    var results = [];
    var okCount = 0;
    for (var i = 0; i < fronts; i++) {
      var o = {
        phase: opts.phase,
        freeLand: opts.freeLand,
        preferNeutral: opts.preferNeutral,
        ratio: opts.ratio
      };
      // Later fronts: if free land drying, peel into fights (VH multi-front)
      if (opts.freeLand != null && opts.freeLand < 0.06 && i >= Math.ceil(fronts * 0.5)) {
        o.preferNeutral = false;
        o.phase = 'PRESSURE';
      }
      var r = attackSmart(o);
      results.push(r);
      if (r && r.ok) okCount++;
      else if (i === 0) break; // first fail = stop; later fail = partial ok
      else break;
    }
    return {
      ok: okCount > 0,
      okCount: okCount,
      fronts: fronts,
      results: results,
      last: results[results.length - 1] || null
    };
  }

  function getState() {
    var g = G();
    var me = myPlayer();
    var hasHg = !!(g && g.bB && g.bB.hZ && typeof g.bB.hZ.hg === 'function');
    var hasCE = !!(g && typeof g.cE === 'function');
    var hasDF = !!(g && typeof g.dF === 'function');
    var hasDJ = !!(g && typeof g.dJ === 'function');
    var ready = !!(g && me >= 0 && (hasHg || hasCE || hasDF || hasDJ) && (g.ah || g.aq));

    var enemies = [];
    if (me >= 0) {
      var maxP = playerCount();
      var nid = neutralTargetId();
      var adjSet = {};
      var adjList = getAdjacentIds(me);
      for (var ai = 0; ai < adjList.length; ai++) adjSet[adjList[ai]] = 1;
      for (var p = 0; p < maxP && enemies.length < 16; p++) {
        if (p === me) continue;
        if (nid != null && p === nid) continue;
        if (!isAlive(p)) continue;
        var t = getTerritory(p);
        if (t <= 0) continue;
        var isAdj = !!adjSet[p] || isLandAdjacent(me, p);
        enemies.push({
          id: p,
          bal: getBalance(p),
          terr: t,
          adjacent: isAdj,
          shipOnly: !isAdj,
          crushable: isAdj && al(getBalance(me), 8) > getBalance(p)
        });
      }
      // Adjacent first, then smaller
      enemies.sort(function (a, b) {
        if (a.adjacent !== b.adjacent) return a.adjacent ? -1 : 1;
        return a.terr - b.terr;
      });
    }

    var bal = me >= 0 ? getBalance(me) : 0;
    var terr = me >= 0 ? getTerritory(me) : 0;
    var softCap = Math.min(100 * Math.max(1, terr), 80000);

    return {
      ready: ready,
      patched: !!window.__TIO_SCRIPT_PATCHED__,
      hookVer: HOOK_VER,
      err: window.__TIO_GAME_ERR__ || null,
      player: me,
      alive: me >= 0 ? isAlive(me) : false,
      balance: bal,
      territory: terr,
      softCap: softCap,
      density: softCap > 0 ? bal / softCap : 0,
      neutralId: neutralTargetId(),
      hasHg: hasHg,
      hasCE: hasCE,
      hasDF: hasDF,
      hasDJ: hasDJ,
      paths: (hasHg ? 'hg' : '') + (hasCE ? '+cE' : '') + (hasDF ? '+dF' : '') + (hasDJ ? '+dJ' : ''),
      spectating: !!(g && g.aE && g.aE.hI),
      difficulty: DIFF,
      pressure: dT[Math.min(DIFF, dT.length - 1)],
      multiFront: MULTI_FRONT[Math.min(DIFF, MULTI_FRONT.length - 1)],
      pulseMs: PULSE_MS[Math.min(DIFF, PULSE_MS.length - 1)],
      hardRatio: ilToRatio(KG_IL[Math.min(DIFF, KG_IL.length - 1)]),
      troopRatio: getTroopRatio(),
      troopIl: _forcedIl,
      troopPct: _forcedRatio != null ? Math.round(_forcedRatio * 100) : null,
      hdPatched: _hdPatched,
      neighbors: me >= 0 ? getAdjacentIds(me) : [],
      shipsEnabled: shipsEnabled(),
      enemies: enemies
    };
  }

  window.addEventListener('message', function (ev) {
    if (ev.source !== window) return;
    var data = ev.data;
    if (!data || data.source !== SRC) return;

    var id = data.id;
    var result = { ok: false, err: 'unknown' };
    try {
      if (data.type === 'ping' || data.type === 'state') {
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
          freeLand: data.freeLand
        });
      } else if (data.type === 'attack-burst') {
        if (data.ratio != null) setTroopRatio(data.ratio);
        result = attackBurst({
          ratio: data.ratio,
          preferNeutral: data.preferNeutral !== false,
          phase: data.phase || 'LAND_RUSH',
          freeLand: data.freeLand,
          fronts: data.fronts
        });
      } else if (data.type === 'attack-neutral') {
        var nid = neutralTargetId();
        var rn = data.ratio != null ? data.ratio : commitRatioFor('LAND_RUSH', data.freeLand);
        result = attackViaHg(rn, nid);
        if (!result.ok) result = attackViaCE(rn, nid, 'LAND_RUSH');
        if (result.ok) result.policy = 'neutral';
      } else if (data.type === 'attack-enemy') {
        result = attackSmart({
          ratio: data.ratio != null ? data.ratio : commitRatioFor('PRESSURE', 0),
          preferNeutral: false,
          phase: data.phase || 'PRESSURE',
          freeLand: data.freeLand != null ? data.freeLand : 0,
          allowShip: data.allowShip !== false
        });
      } else if (data.type === 'attack-ship') {
        var shipT = data.target != null ? data.target : pickShipTarget(myPlayer());
        result = attackViaShip(
          data.ratio != null ? data.ratio : commitRatioFor('PRESSURE', 0),
          shipT
        );
      } else if (data.type === 'attack-target') {
        var jd = data.target;
        var rt = data.ratio != null ? data.ratio : commitRatioFor(data.phase || 'PRESSURE', 0);
        var meT = myPlayer();
        if (data.ship || (meT >= 0 && !isLandAdjacent(meT, jd))) {
          result = attackViaShip(rt, jd);
        } else {
          result = attackViaHg(rt, jd);
          if (!result.ok) result = attackViaCE(rt, jd, data.phase || 'PRESSURE');
        }
      }
    } catch (e) {
      result = { ok: false, err: String(e && e.message || e) };
    }
    window.postMessage({ source: REPLY, id: id, result: result }, '*');
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
    setDiff: function (d) { DIFF = Math.max(0, Math.min(5, d | 0)); }
  };

  console.log('%c[TIO MAIN Hook v' + HOOK_VER + '] source-faithful dF/dJ/cE + hg brain ready', 'color:#38bdf8;font-weight:bold');
})();
