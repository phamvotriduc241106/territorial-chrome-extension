/** Native spatial observability and bounded, opt-in combat shadow experiments.
 * Never used by decide()/planSpend(). No raster is copied into rollout states. */
(function (root) {
  'use strict';
  if (root.TIOFrontier) return;
  const WATER = 65535;
  const integer = n => Math.max(0, Math.floor(Number.isFinite(n) ? n : 0));
  const round = (a, b) => Math.floor((a + 0.5) / b); // live bO.g0

  // Exact modern-v3 hR/hZ arithmetic for a NORMAL (not reinforced) attack batch.
  // cells is the native candidate-cell count, NOT boundary edge length.
  // Selection of cells, update schedule and force refunds are separate mechanics.
  function resolveNativeBatch(troops, bank, territory, cells, counter = 0, cellCost = 2, neutral = false) {
    troops = integer(troops); bank = integer(bank); territory = integer(territory);
    cells = Math.min(integer(cells), territory); counter = integer(counter);
    cellCost = Math.max(1, integer(cellCost));
    if (!cells || round(troops, cells) <= cellCost)
      return { remaining: troops, bank, counter, captured: 0, resolved: true };
    if (neutral) return { remaining: Math.max(0, troops - cells * cellCost), bank,
      counter, captured: cells, resolved: false };
    const defense = round(cells * bank, 1 + round(10 * territory, 16));
    const cost = cells * cellCost + 2 * defense + counter;
    const offered = round(troops, cells) * cells;
    const captured = offered > cost ? cells : 0; // strict native comparison
    const spent = captured ? cost : offered;
    let damage = Math.max(0, spent - cells * cellCost);
    const absorbed = Math.min(counter, damage);
    counter -= absorbed; damage -= absorbed;
    bank -= Math.min(bank, round(damage, 2));
    return { remaining: Math.max(0, troops - spent), bank, counter, captured, resolved: !captured };
  }

  // Four-neighbor borders only. Maximal straight owner-pair runs are split at
  // corners, junctions, owner changes and maxLength. Coverage is all-or-nothing.
  // This is a first geometry baseline, not calibrated curvature/choke inference.
  function extract(raster, meta, options = {}) {
    const { width: w, height: h, owners, neutralId } = raster;
    if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 ||
        !owners || owners.length !== w * h) throw Error('Invalid ownership raster');
    if (!Number.isInteger(neutralId) || neutralId < 1 || neutralId >= WATER) throw Error('Invalid neutral identifier');
    const maxSegments = Math.min(4096, Math.max(1, integer(options.maxSegments || 512)));
    const maxLength = Math.max(1, integer(options.maxLength || 32));
    const focus = options.player;
    const runs = [], pairs = new Map();
    let boundaryEdges = 0, hash = 2166136261;
    for (let i = 0; i < owners.length; i++) {
      const owner = owners[i];
      if (!Number.isInteger(owner) || owner < 0 || (owner > neutralId && owner !== WATER)) throw Error('Invalid cell owner');
      hash = Math.imul(hash ^ owner, 16777619) >>> 0;
    }
    const eligible = (a, b) => a !== b && a !== WATER && b !== WATER &&
      a <= neutralId && b <= neutralId && (focus == null || a === focus || b === focus);
    function edge(a, b, ia, ib) {
      boundaryEdges++;
      const lo = Math.min(a, b), hi = Math.max(a, b), key = lo + ':' + hi;
      let pair = pairs.get(key);
      if (!pair) { pair = { a: lo, b: hi, length: 0, cellsA: new Set(), cellsB: new Set() }; pairs.set(key, pair); }
      pair.length++; pair.cellsA.add(a === lo ? ia : ib); pair.cellsB.add(a === lo ? ib : ia);
    }
    function emit(a, b, x, y, length, vertical) {
      if (runs.length >= maxSegments) throw Error('frontier-segment-cap');
      runs.push({ a, b, x, y, length, vertical });
    }
    // Vertical edges between x-1 and x; horizontal edges between y-1 and y.
    for (let vertical = 0; vertical <= 1; vertical++) {
      const outer = vertical ? w : h, inner = vertical ? h : w;
      for (let k = 1; k < outer; k++) {
        let start = 0, length = 0, pa = -1, pb = -1;
        for (let j = 0; j <= inner; j++) {
          const ia = vertical ? j * w + k - 1 : (k - 1) * w + j;
          const ib = vertical ? ia + 1 : ia + w;
          const a = j < inner ? owners[ia] : WATER, b = j < inner ? owners[ib] : WATER;
          const valid = j < inner && eligible(a, b);
          if (length && (!valid || a !== pa || b !== pb || length === maxLength)) {
            emit(pa, pb, vertical ? k : start, vertical ? start : k, length, vertical);
            length = 0;
          }
          if (valid) { edge(a, b, ia, ib); if (!length) { start = j; pa = a; pb = b; } length++; }
        }
      }
    }
    const s = runs.length;
    const snapshot = { meta: Object.freeze({ ...meta, width: w, height: h, segmentCount: s,
      boundaryEdges, ownerHash: hash.toString(16).padStart(8, '0'), confidence: 1,
      scope: focus == null ? 'all-owner-pairs' : 'player-contact', player: focus,
      geometryKind: 'straight-runs', neutralId }),
      ownerA: new Uint16Array(s), ownerB: new Uint16Array(s), length: new Float32Array(s),
      cx: new Float32Array(s), cy: new Float32Array(s), nx: new Float32Array(s), ny: new Float32Array(s),
      id: new Uint32Array(s), edgeOffset: new Uint32Array(s + 1), edgeTarget: null,
      pairs: [...pairs.values()].map(p => Object.freeze({ a: p.a, b: p.b, length: p.length,
        contactA: p.cellsA.size, contactB: p.cellsB.size })) };
    const endpoints = new Map(), neighbors = Array.from({ length: s }, () => new Set());
    for (let i = 0; i < s; i++) {
      const r = runs[i]; snapshot.ownerA[i] = r.a; snapshot.ownerB[i] = r.b; snapshot.length[i] = r.length;
      snapshot.cx[i] = r.x + (r.vertical ? 0 : r.length / 2);
      snapshot.cy[i] = r.y + (r.vertical ? r.length / 2 : 0);
      snapshot.nx[i] = r.vertical ? 1 : 0; snapshot.ny[i] = r.vertical ? 0 : 1;
      // ID is stable for an unchanged exact run; split/merge changes get new IDs.
      let id = 2166136261;
      for (const n of [r.a, r.b, r.x, r.y, r.length, r.vertical]) id = Math.imul(id ^ n, 16777619) >>> 0;
      snapshot.id[i] = id;
      for (const [x, y] of [[r.x, r.y], [r.x + (r.vertical ? 0 : r.length), r.y + (r.vertical ? r.length : 0)]]) {
        const key = x + ':' + y + ':' + Math.min(r.a, r.b) + ':' + Math.max(r.a, r.b);
        let list = endpoints.get(key); if (!list) { list = []; endpoints.set(key, list); }
        for (const j of list) { neighbors[i].add(j); neighbors[j].add(i); } list.push(i);
      }
    }
    for (let i = 0; i < s; i++) snapshot.edgeOffset[i + 1] = snapshot.edgeOffset[i] + neighbors[i].size;
    snapshot.edgeTarget = new Uint16Array(snapshot.edgeOffset[s]);
    for (let i = 0; i < s; i++) snapshot.edgeTarget.set([...neighbors[i]].sort((a, b) => a - b), snapshot.edgeOffset[i]);
    return snapshot; // TypedArray buffers are private; callers must not mutate.
  }

  function compatible(snapshot, state) {
    return !!snapshot && !!snapshot.meta && Array.isArray(snapshot.pairs) &&
      snapshot.meta.confidence === 1 && snapshot.meta.matchId === state.matchId &&
      snapshot.meta.stateVersion === state.stateVersion &&
      snapshot.meta.gameTick === (state.frontierOriginTick == null ? state.tick : state.frontierOriginTick) &&
      state.tick >= snapshot.meta.gameTick && snapshot.meta.player === state.player;
  }

  // Static initial geometry extrapolated for a short horizon. Native costs are
  // exact conditional on candidate cells; geometry evolution/scheduling/refunds
  // remain estimates. No advance when contact is absent, no invented adjacency.
  function advanceAttack(state, attack) {
    const own = attack.attackerId == null;
    const actor = own ? null : state.adjEnemies.find(e => e.id === attack.attackerId);
    const actorId = own ? state.player : attack.attackerId;
    const targetId = attack.targetId === 'neutral' ? state.frontierSnapshot.meta.neutralId
      : attack.targetId == null ? state.player : attack.targetId;
    const neutral = attack.targetId === 'neutral';
    const foe = own && !neutral ? state.adjEnemies.find(e => e.id === targetId) : null;
    if ((!own && (!actor || actor.terr <= 0)) || (own && state.territory <= 0)) return true;
    const land = neutral ? state.freeLandCells : own ? (foe ? foe.terr : 0) : state.territory;
    if (land <= 0) return true;
    const pair = state.frontierSnapshot.pairs.find(p =>
      (p.a === actorId && p.b === targetId) || (p.b === actorId && p.a === targetId));
    // Never transfer all the target based on a global bank threshold.
    if (!pair) return true;
    const actorLand = own ? state.territory : actor.terr;
    const cadence = actorLand < 1000 ? 4 : actorLand < 10000 ? 3 : actorLand < 60000 ? 2 : 1;
    if (attack.frontierNextTick == null) attack.frontierNextTick = state.tick + cadence;
    if (state.tick < attack.frontierNextTick) return false;
    attack.frontierNextTick = state.tick + cadence;
    const counterAttack = state.activeAttacks.find(a => a !== attack &&
      a.attackerId === (own ? targetId : null) && a.targetId === (own ? null : actorId));
    const bank = neutral ? 0 : own ? foe.bal : state.balance;
    const cells = pair.a === targetId ? pair.contactA : pair.contactB;
    const result = resolveNativeBatch(attack.troops, bank, land, cells,
      counterAttack ? counterAttack.troops : 0, state.frontierCellCost, neutral);
    attack.troops = result.remaining;
    if (counterAttack) counterAttack.troops = result.counter;
    if (own) {
      state.territory += result.captured;
      if (neutral) { state.freeLandCells -= result.captured; state.hasAdjFree = state.freeLandCells > 0; }
      else { foe.terr -= result.captured; foe.bal = foe.terr > 0 ? result.bank : 0;
        if (!foe.terr) { foe.available = false; foe.adjacent = false; } }
    } else { actor.terr += result.captured; state.territory -= result.captured;
      state.balance = state.territory > 0 ? result.bank : 0; }
    attack.frontierProgress = (attack.frontierProgress || 0) + result.captured;
    if (state.shadowTrackEffects && root.TIOEpisodeTelemetry) root.TIOEpisodeTelemetry.effect(state, attack, result.captured);
    attack.estimatedTiming = true;
    return result.resolved || result.remaining <= 0;
  }

  class Recorder {
    constructor(capacity = 512) {
      this.capacity = Math.max(16, Math.min(4096, integer(capacity)));
      this.records = new Array(this.capacity); this.cursor = 0; this.size = 0;
      this.pending = null; this.lastTick = -1; this.matchId = null;
      this.attacks = new Map(); this.attackSequence = 0;
      this.scored = 0; this.skipped = 0; this.dropped = 0;
    }
    add(record) { if (this.size === this.capacity) this.dropped++;
      this.records[this.cursor] = record; this.cursor = (this.cursor + 1) % this.capacity;
      this.size = Math.min(this.capacity, this.size + 1); }
    observe(state, snapshot, core, metadata = {}) {
      if (this.matchId !== state.matchId || state.gameTick < this.lastTick) {
        if (this.pending) this.add({ event: 'prediction_censored', reason: 'match-ended', ...this.pending.origin });
        this.pending = null; this.matchId = state.matchId;
        this.attacks.clear();
        this.add({ event: 'match_meta', matchId: state.matchId, contract: state.contract, ...metadata });
      }
      this.lastTick = state.gameTick;
      this.observeAttacks(state);
      if (this.pending && state.gameTick >= this.pending.dueTick) {
        const p = this.pending;
        if (state.gameTick === p.dueTick) {
          const errors = {};
          for (const kind of ['aggregate', 'frontier']) {
            if (!p[kind]) continue;
            errors[kind] = { balance: p[kind].balance - state.balance, territory: p[kind].territory - state.territory };
          }
          this.add({ event: 'prediction_scored', ...p.origin, observedStateVersion: state.stateVersion,
            dueTick: p.dueTick, actual: { balance: state.balance, territory: state.territory },
            predictions: { aggregate: p.aggregate, frontier: p.frontier }, errors }); this.scored++;
        } else { this.add({ event: 'prediction_censored', ...p.origin, reason: 'missed-tick',
          dueTick: p.dueTick, observedTick: state.gameTick }); this.skipped++; }
        this.pending = null;
      }
      if (this.pending || !state.alive || !core) return;
      const base = { ...state, tick: state.gameTick, adjEnemies: state.enemies,
        totalEnemyTerr: state.totalEnemyTerritory, playersRemaining: state.alivePlayers,
        hasAdjFree: state.physicalNeighbors.includes(state.neutralId), frontCap: state.multiFront };
      const horizon = 10;
      const aggregate = core.transitionPlanningState(base, { type: 'hold' }, horizon);
      const frontier = snapshot ? core.transitionPlanningState({ ...base, frontierExperiment: true,
        frontierSnapshot: snapshot, frontierCellCost: metadata.cellCost }, { type: 'hold' }, horizon) : null;
      const summary = x => x ? { balance: x.balance, territory: x.territory, modelKind: x.modelKind } : null;
      const origin = { matchId: state.matchId, gameTick: state.gameTick, stateVersion: state.stateVersion,
        geometryVersion: snapshot ? snapshot.meta.geometryVersion : null };
      this.pending = { origin, dueTick: state.gameTick + horizon,
        aggregate: summary(aggregate), frontier: summary(frontier) };
      this.add({ event: 'state_snapshot', ...origin, balance: state.balance, territory: state.territory,
        outgoingAttacks: state.outgoingAttacks, enemies: state.enemies.map(e =>
          ({ id: e.id, bal: e.bal, terr: e.terr, incoming: e.incoming })) });
      this.add({ event: 'prediction', ...origin, dueTick: this.pending.dueTick,
        aggregate: this.pending.aggregate, frontier: this.pending.frontier,
        limitation: 'normal-batch cost baseline; reinforcement, refunds, future commands and opponents are not forecast' });
    }
    observeAttacks(state) {
      const observed = [];
      for (const a of state.outgoingAttacks || []) observed.push({ actor: state.player, target: a.targetId,
        troops: a.troops, reinforced: a.reinforced });
      for (const e of state.enemies || []) if (e.incoming > 0)
        observed.push({ actor: e.id, target: state.player, troops: e.incoming });
      const live = new Set();
      for (const a of observed) {
        const key = a.actor + ':' + a.target; live.add(key);
        let previous = this.attacks.get(key);
        if (!previous) {
          previous = { attackId: state.matchId + ':' + state.gameTick + ':' + (++this.attackSequence), troops: a.troops };
          this.attacks.set(key, previous);
          this.add({ event: 'attack_observed', matchId: state.matchId, gameTick: state.gameTick,
            stateVersion: state.stateVersion, attackId: previous.attackId, ...a,
            launchTickKnown: false });
        } else if (previous.troops !== a.troops) {
          this.add({ event: 'attack_progress', matchId: state.matchId, gameTick: state.gameTick,
            stateVersion: state.stateVersion, attackId: previous.attackId, ...a,
            forceDelta: a.troops - previous.troops }); previous.troops = a.troops;
        }
      }
      for (const [key, a] of this.attacks) if (!live.has(key)) {
        this.add({ event: 'attack_disappeared', matchId: state.matchId, gameTick: state.gameTick,
          stateVersion: state.stateVersion, attackId: a.attackId, lastObservedTroops: a.troops,
          outcome: 'unknown; disappearance is not proof of conquest' }); this.attacks.delete(key);
      }
    }
    export() {
      const records = [];
      for (let i = 0; i < this.size; i++) records.push(this.records[(this.cursor - this.size + i + this.capacity) % this.capacity]);
      // Return independent records; no caller may corrupt pending observations.
      return JSON.parse(JSON.stringify({ schema: 1, policyInfluence: false, capacity: this.capacity,
        scored: this.scored, skipped: this.skipped, dropped: this.dropped, records }));
    }
  }
  root.TIOFrontier = Object.freeze({ WATER, extract, compatible, resolveNativeBatch, advanceAttack, Recorder });
})(typeof globalThis !== 'undefined' ? globalThis : this);
