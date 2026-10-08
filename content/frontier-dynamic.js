/** Native ordered-cell transition candidate. Shadow-only, no planner integration. */
(function (root) {
  'use strict';
  if (root.TIODynamicFrontier) return;
  const round = (a, b) => Math.floor((a + 0.5) / b);
  const cadence = t => t < 1000 ? 4 : t < 10000 ? 3 : t < 60000 ? 2 : 1;
  function credit(p, force, cfg) {
    const accepted = Math.max(0, Math.min(force, cfg.hardCapPerCell * p.territory - p.balance, cfg.hardCapMaximum - p.balance));
    p.balance += accepted; const repaid = Math.min(p.debt, p.balance); p.debt -= repaid; p.balance -= repaid;
    return { accepted, repaid };
  }
  // Source-verified gr/hR/hZ/gw arithmetic, including first-batch support and debt.
  // Returns private gR, which native hL clamps when persisting a successful front.
  function batch(input) {
    let { force, bank, territory, cells, counter = 0, reinforced = false, neutral = false,
      actorBank = 0, debt = 0, cellCost = 2, debtCap = 50000 } = input;
    if (![force, bank, territory, cells, counter, actorBank, debt, cellCost, debtCap].every(n => Number.isSafeInteger(n) && n >= 0) ||
        cells > territory || cellCost < 1) throw Error('dynamic-invalid-batch');
    let borrowed = 0, support = 0, spent = 0;
    function borrow(requested) {
      if (!Number.isSafeInteger(requested) || requested < 0) throw Error('dynamic-invalid-support');
      borrowed += requested; support++;
      if (requested <= actorBank) actorBank -= requested;
      else { const shortage = requested - actorBank; actorBank = 0; debt = Math.min(debtCap, debt + 5 * (shortage >> 2)); }
      return requested;
    }
    const result = (captured, terminal) => ({ force, bank, counter, actorBank, debt, borrowed, support, spent, captured, terminal });
    if (!cells) return result(0, true);
    let quotient = round(force, cells);
    if (quotient <= cellCost) {
      if (!reinforced) return result(0, true);
      force += borrow(cells * (1 + cellCost) - force); quotient = round(force, cells);
    }
    if (neutral) { spent = cells * cellCost; force -= spent; return result(cells, false); }
    const terrain = cells * cellCost, defense = round(cells * bank, 1 + round(10 * territory, 16));
    const cost = terrain + 2 * defense + counter, offered = quotient * cells;
    let captured = 0;
    if (offered > cost) { spent = cost; force -= cost; captured = cells; }
    else if (reinforced && counter === 0) { force -= offered; spent = offered + borrow(cost - offered + 1); captured = cells; }
    else { force -= offered; spent = offered; }
    let damage = spent - terrain;
    if (counter > 0) { const absorbed = Math.min(counter, damage); counter -= absorbed; damage -= absorbed; }
    bank -= Math.min(bank, round(damage, 2));
    return result(captured, !captured);
  }
  function candidates(get, frontier, offsets, target, total) {
    const seen = new Set(), cells = [];
    for (let k = 3; k >= 0; k--) for (let j = frontier.length - 1; j >= 0; j--) {
      const i = frontier[j] + offsets[k];
      if (i >= 0 && i < total && !seen.has(i) && get(i) === target) { seen.add(i); cells.push(i); }
    }
    return cells;
  }
  function removeSwap(queue, predicate) {
    for (let i = queue.length - 1; i >= 0; i--) if (predicate(queue[i])) { queue[i] = queue[queue.length - 1]; queue.pop(); }
  }
  function simulate(origin, snapshot, horizon, options = {}) {
    if (!root.TIOSpatial || !root.TIOEngineCoreV2 || !snapshot ||
        snapshot.matchId !== origin.matchId || snapshot.spatialVersion !== origin.spatialVersion ||
        snapshot.sourceStateVersion > origin.sourceStateVersion || snapshot.gameTick > origin.gameTick ||
        !Number.isInteger(horizon) || horizon < 0 || horizon > 100 || !origin.scheduler ||
        !Array.isArray(origin.offsets) || origin.offsets.length !== 4) throw Error('dynamic-stale-or-unsupported-origin');
    const spatial = root.TIOSpatial.overlay(snapshot, options.maxChangedCells || 32768);
    const players = origin.players.map(p => ({ ...p, economy: { ...p.economy } }));
    const queues = origin.frontierQueues.map(q => q.slice());
    const fronts = origin.fronts.map(f => ({ ...f, captured: 0, terminationTick: null }));
    const order = origin.scheduler.order.slice(), timers = origin.scheduler.timers.slice();
    const offsets = origin.offsets, cfg = origin.constants, n = snapshot.neutralId;
    if (!cfg || players.length !== n || queues.length !== n || timers.length !== n ||
        root.TIOSpatial.counts(snapshot).slice(0, n).some((v, i) => v !== players[i].territory)) throw Error('dynamic-inconsistent-origin');
    const active = f => f.terminationTick == null;
    const ownFronts = p => fronts.filter(f => f.actor === p && active(f));
    const terminated = [];
    let supportEvents = 0, refundEvents = 0;
    function runActor(actor, tick) {
      const p = players[actor]; if (!p || !p.alive || p.territory <= 0) throw Error('dynamic-unmodeled-elimination');
      // ge reverses the first (at most) 2048 queue entries. gf empties the queue.
      const selected = queues[actor].slice(0, 2048).reverse(); queues[actor] = [];
      let grew = false;
      for (const f of ownFronts(actor).reverse()) {
        const target = f.target === 'neutral' ? n : f.target, neutral = target === n, defender = players[target];
        if (!neutral && (!defender || !defender.alive || defender.territory <= 0)) throw Error('dynamic-unmodeled-elimination');
        const indices = candidates(spatial.get, selected, offsets, target, snapshot.cells);
        const counterFront = fronts.find(x => active(x) && x.actor === target && x.target === actor);
        const r = batch({ force: f.troops, bank: neutral ? 0 : defender.balance,
          territory: spatial.count(target), cells: indices.length, counter: counterFront?.troops || 0,
          reinforced: f.reinforced, neutral, actorBank: p.balance, debt: p.debt,
          cellCost: cfg.cellCost, debtCap: cfg.debtCap });
        p.balance = r.actorBank; p.debt = r.debt; supportEvents += r.support;
        if (counterFront) counterFront.troops = r.counter;
        if (!neutral) defender.balance = r.bank;
        if (r.captured) {
          grew = true; f.troops = Math.max(0, r.force); f.reinforced = false; f.captured += r.captured;
          for (let i = indices.length - 1; i >= 0; i--) { spatial.set(indices[i], actor); queues[actor].push(indices[i]); }
          p.territory = spatial.count(actor);
          if (!neutral) { defender.territory = spatial.count(target);
            // hH preserves the native swap-removal ordering of the defender queue.
            removeSwap(queues[target], i => spatial.get(i) !== target && spatial.get(i) !== 65535);
          }
        } else {
          f.troops = 0; f.terminationTick = tick; f.outcome = 'native-return';
          const refund = credit(p, r.force, cfg); f.refund = refund.accepted - refund.repaid;
          if (refund.accepted > 0) refundEvents++; terminated.push(f.nativeFrontId);
          if (!ownFronts(actor).length) { const index = order.indexOf(actor); if (index >= 0) order.splice(index, 1); }
        }
      }
      if (grew) removeSwap(queues[actor], i => !offsets.some(o => {
        const j = i + o; return j >= 0 && j < snapshot.cells && spatial.get(j) !== 65535 && spatial.get(j) !== actor;
      })); // gj removes newly captured cells which have become interior.
    }
    for (let h = 0; h < horizon; h++) {
      const rawTick = origin.gameTick + h, observationTick = rawTick + 1;
      for (const p of players) if (p.alive && p.territory > 0 && rawTick % 10 === 9) {
        const e = p.economy;
        credit(p, Math.max(1, round(root.TIOEngineCoreV2.planningInterestBps(p.territory, p.balance, rawTick, e) * p.balance, 10000)), cfg);
        if (e.additionalIncomeType > 0) credit(p, round(e.additionalIncomeValue * p.territory, 128), cfg);
        if (rawTick % 100 === 99) credit(p, round(e.territoryIncomeValue * p.territory, 32), cfg);
      }
      for (let i = order.length - 1; i >= 0; i--) {
        const actor = order[i];
        if (timers[actor] === 64) timers[actor] = 6;
        else if (timers[actor]-- === 0) { timers[actor] = cadence(players[actor].territory) - 1; runActor(actor, observationTick); }
      }
      // Native large-empires can receive extra passes, independently of cadence.
      const largest = Math.max(...players.map(p => p.territory));
      for (const threshold of [160000, 300000]) if (largest >= threshold)
        for (let i = order.length - 1; i >= 0; i--) { const a = order[i]; if (timers[a] === 0 && players[a].territory >= threshold) runActor(a, observationTick); }
    }
    if (players.some((p, i) => p.territory !== spatial.count(i))) throw Error('dynamic-conservation-failed');
    return { modelKind: 'native-ordered-dynamic-frontier-shadow', players, fronts, supportEvents, refundEvents,
      changedCells: spatial.size(), spatialDeltas: spatial.deltas(), terminated,
      gameTick: origin.gameTick + horizon, sourceStateVersion: origin.sourceStateVersion,
      spatialVersion: origin.spatialVersion, policyInfluence: false };
  }
  root.TIODynamicFrontier = Object.freeze({ batch, candidates, simulate, cadence, credit });
})(typeof window !== 'undefined' ? window : globalThis);
