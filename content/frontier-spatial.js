/** Immutable ownership versions. Research only; never referenced by production planning. */
(function (root) {
  'use strict';
  if (root.TIOSpatial) return;
  const PAGE = 256, WATER = 65535, privateData = new WeakMap();
  const fail = why => { throw Error('spatial-' + why); };
  function data(s) { const d = privateData.get(s); if (!d) fail('unknown-snapshot'); return d; }
  function ownerOK(o, n) { return Number.isInteger(o) && o >= 0 && (o <= n || o === WATER); }
  function metadata(m) {
    if (!m || typeof m.matchId !== 'string' || !m.matchId ||
        !['spatialVersion', 'sourceStateVersion', 'gameTick'].every(k => Number.isSafeInteger(m[k]) && m[k] >= 0)) fail('invalid-version');
  }
  function publish(d, m) { const s = Object.freeze({ ...m, width: d.width, height: d.height,
    neutralId: d.neutralId, cells: d.width * d.height }); privateData.set(s, d); return s; }
  function reconcile(counts, territories, neutralId) {
    if (!territories || territories.length !== neutralId) fail('missing-native-counts');
    for (let p = 0; p < neutralId; p++) if (!Number.isSafeInteger(territories[p]) || counts[p] !== territories[p]) fail('territory-mismatch-' + p);
  }
  function baseline(raster, m, territories = raster.counts) {
    metadata(m);
    const { width, height, neutralId, owners } = raster, n = width * height;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
        !Number.isSafeInteger(n) || n > 4194304 || !Number.isInteger(neutralId) || neutralId < 1 || neutralId >= WATER ||
        !owners || owners.length !== n) fail('invalid-baseline');
    const counts = new Uint32Array(neutralId + 1), pages = [];
    for (let i = 0; i < n; i++) { if (!ownerOK(owners[i], neutralId)) fail('invalid-owner');
      if (owners[i] !== WATER) counts[owners[i]]++; }
    reconcile(counts, territories, neutralId);
    for (let i = 0; i < n; i += PAGE) pages.push(Uint16Array.from(Array.prototype.slice.call(owners, i, i + PAGE)));
    return publish({ width, height, neutralId, pages, counts }, m);
  }
  function at(s, index) { const d = data(s); if (!Number.isSafeInteger(index) || index < 0 || index >= s.cells) fail('invalid-index');
    return d.pages[index >>> 8][index & 255]; }
  function counts(s) { return Array.from(data(s).counts); }
  function advance(s, delta, territories) {
    const d = data(s); metadata(delta);
    if (delta.matchId !== s.matchId || delta.baseVersion !== s.spatialVersion || delta.spatialVersion !== s.spatialVersion + 1 ||
        delta.sourceStateVersion < s.sourceStateVersion || delta.gameTick < s.gameTick) fail('stale-delta');
    if (!Array.isArray(delta.changes) || delta.changes.length > 32768) fail('delta-cap');
    const pages = d.pages.slice(), nextCounts = d.counts.slice(), copied = new Set();
    for (const c of delta.changes) {
      if (!Array.isArray(c) || c.length !== 3 || !ownerOK(c[1], s.neutralId) || !ownerOK(c[2], s.neutralId) || c[1] === c[2]) fail('invalid-change');
      const [i, from, to] = c;
      if (!Number.isSafeInteger(i) || i < 0 || i >= s.cells) fail('invalid-index');
      const p = i >>> 8;
      if (pages[p][i & 255] !== from) fail('old-owner-mismatch');
      if (!copied.has(p)) { pages[p] = pages[p].slice(); copied.add(p); }
      pages[p][i & 255] = to;
      if (from !== WATER) nextCounts[from]--; if (to !== WATER) nextCounts[to]++;
    }
    reconcile(nextCounts, territories, s.neutralId);
    return publish({ ...d, pages, counts: nextCounts }, { matchId: s.matchId, spatialVersion: delta.spatialVersion,
      sourceStateVersion: delta.sourceStateVersion, gameTick: delta.gameTick });
  }
  function serialize(s) {
    const runs = []; let last = -1, length = 0;
    for (let i = 0; i < s.cells; i++) { const o = at(s, i); if (o !== last && length) { runs.push(last, length); length = 0; } last = o; length++; }
    runs.push(last, length); return { ...s, encoding: 'owner-rle-v1', runs, counts: counts(s).slice(0, s.neutralId) };
  }
  function restore(b) {
    if (!b || b.encoding !== 'owner-rle-v1' || !Array.isArray(b.runs) || b.runs.length % 2 ||
        !Number.isSafeInteger(b.width * b.height) || b.width * b.height > 4194304) fail('invalid-rle');
    const owners = new Uint16Array(b.width * b.height); let cursor = 0;
    for (let i = 0; i < b.runs.length; i += 2) { const o = b.runs[i], n = b.runs[i + 1];
      if (!ownerOK(o, b.neutralId) || !Number.isSafeInteger(n) || n < 1 || cursor + n > owners.length) fail('invalid-rle');
      owners.fill(o, cursor, cursor + n); cursor += n; }
    if (cursor !== owners.length) fail('incomplete-rle'); return baseline({ ...b, owners }, b, b.counts);
  }
  // Mutable private, bounded sparse overlay for ONE rollout; base remains immutable.
  function overlay(s, cap = 32768) {
    data(s); if (!Number.isSafeInteger(cap) || cap < 1 || cap > 262144) fail('overlay-cap');
    const changes = new Map(), c = counts(s);
    return Object.freeze({ get: i => changes.has(i) ? changes.get(i) : at(s, i),
      set(i, to) { if (!ownerOK(to, s.neutralId)) fail('invalid-owner'); const from = this.get(i);
        if (from === to) return; if (!changes.has(i) && changes.size >= cap) fail('overlay-cap');
        if (from !== WATER) c[from]--; if (to !== WATER) c[to]++; changes.set(i, to); },
      count: p => c[p], size: () => changes.size,
      deltas: () => [...changes].map(([i, to]) => [i, at(s, i), to]) });
  }
  // Exactly the contact-cell/edge counts used by the existing static model.
  // Shared extraction once per origin, not a grid clone per actor/rollout.
  function contacts(s) {
    const d = data(s), pairs = new Map(), get = i => d.pages[i >>> 8][i & 255];
    function edge(i, j) { const a = get(i), b = get(j); if (a === b || a === WATER || b === WATER) return;
      const lo = Math.min(a,b), hi = Math.max(a,b), key = lo + ':' + hi;
      let p = pairs.get(key); if (!p) { p = { a: lo, b: hi, length: 0, ca: new Set(), cb: new Set() }; pairs.set(key,p); }
      p.length++; p.ca.add(a === lo ? i : j); p.cb.add(a === lo ? j : i);
    }
    for (let y=0;y<s.height;y++) for(let x=0;x<s.width;x++){const i=y*s.width+x;
      if(x+1<s.width)edge(i,i+1);if(y+1<s.height)edge(i,i+s.width);}
    return [...pairs.values()].map(p=>Object.freeze({a:p.a,b:p.b,length:p.length,contactA:p.ca.size,contactB:p.cb.size}));
  }
  root.TIOSpatial = Object.freeze({ baseline, advance, at, counts, serialize, restore, overlay, contacts, WATER });
})(typeof window !== 'undefined' ? window : globalThis);
