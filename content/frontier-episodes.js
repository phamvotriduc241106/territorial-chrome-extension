/** Action-conditioned shadow episodes. No production policy entrypoint. */
(function (root) {
  'use strict';
  if (root.TIOEpisodeTelemetry) return;
  let sessions = 0;
  const copy = value => JSON.parse(JSON.stringify(value));
  const hold = { type: 'hold' };
  const pairKey = (actor, target) => actor + ':' + target;
  function effect(state, attack, captured = 0, terminal = false) {
    if (!state.shadowTrackEffects) return;
    const actor = attack.attackerId == null ? state.player : attack.attackerId;
    const target = attack.targetId == null ? state.player : attack.targetId;
    const key = pairKey(actor, target);
    const previous = state.shadowEffects[key] || { captured: 0, terminationTick: null };
    state.shadowEffects[key] = { captured: previous.captured + captured,
      terminationTick: terminal ? state.tick : previous.terminationTick };
  }
  class EpisodeRecorder {
    constructor(options = {}) {
      if (typeof options === 'number') options = { capacity: options };
      if (options.capacity != null && (!Number.isInteger(options.capacity) || options.capacity < 32 || options.capacity > 16384))
        throw Error('Invalid shadow capacity');
      this.capacity = options.capacity || 4096;
      this.horizons = [...new Set(options.horizons || [2, 5, 10, 20])].sort((a, b) => a - b);
      if (!this.horizons.length || this.horizons.some(h => !Number.isInteger(h) || h < 1 || h > 100) || this.horizons.length > 8)
        throw Error('Invalid shadow horizons');
      this.sessionId = root.crypto && root.crypto.randomUUID ? root.crypto.randomUUID()
        : 'session-' + Date.now() + '-' + (++sessions);
      this.records = new Array(this.capacity); this.cursor = 0; this.size = 0; this.sequence = 0;
      this.episodes = new Map(); this.pending = []; this.matchId = null; this.lastTick = -1;
      this.commandCoverage = false; this.scored = 0; this.skipped = 0; this.dropped = 0;
      this.matchEnded = false; this.matchActive = false;
    }
    add(record) {
      const entry = { ...record, eventId: this.sessionId + ':' + (++this.sequence) };
      if (this.size === this.capacity) this.dropped++;
      this.records[this.cursor] = entry; this.cursor = (this.cursor + 1) % this.capacity;
      this.size = Math.min(this.capacity, this.size + 1); return entry.eventId;
    }
    match(state, metadata = {}) {
      if (state.matchId === this.matchId && state.gameTick >= this.lastTick) return;
      this.cancel('match-ended');
      for (const ep of this.episodes.values()) if (!ep.terminated)
        this.add({ event: 'episode_censored', ...ep.origin, episodeId: ep.episodeId, reason: 'match-ended' });
      this.episodes.clear(); this.matchId = state.matchId; this.lastTick = state.gameTick; this.matchEnded = false; this.matchActive = false;
      this.add({ event: 'match_meta', matchId: state.matchId, sourceContract: state.contract,
        startTick: state.gameTick, startObserved: state.gameTick === 0,
        engineVersion: metadata.engineVersion, updatedAt: metadata.updatedAt, ...metadata });
    }
    ensure(front, origin, launchKnown = false) {
      const key = String(front.nativeFrontId == null ? pairKey(front.actor, front.target) : front.nativeFrontId);
      let ep = this.episodes.get(key);
      if (!ep) {
        if (this.episodes.size >= 2048) {
          this.gap('episode-cap'); throw Error('episode-cap');
        }
        const frontId = this.sessionId + ':' + this.matchId + ':front:' + key;
        ep = { episodeId: frontId + ':episode', frontId, actor: front.actor, target: front.target,
          origin: { matchId: this.matchId, gameTick: origin.gameTick, stateVersion: origin.stateVersion,
            sourceStateVersion: origin.sourceStateVersion, geometryVersion: origin.geometryVersion,
            geometryTick: origin.geometryTick },
          launchTick: launchKnown ? origin.observationTick ?? origin.gameTick : null,
          leftCensored: !launchKnown, reinforced: typeof front.reinforced === 'boolean' ? front.reinforced : null,
          reinforcementObserved: false, reinforcementCount: 0, captured: 0, commands: [], terminated: false,
          observedTick: null, forecastTick: null, actorState: front.actorState || front.actorAfter || null,
          playerContact: front.actor === origin.player || front.target === origin.player };
        this.episodes.set(key, ep);
        this.add({ event: 'episode_start', ...ep.origin, episodeId: ep.episodeId, frontId,
          actor: ep.actor, target: ep.target, launchTick: ep.launchTick, leftCensored: ep.leftCensored,
          nativeFrontId: front.nativeFrontId ?? null,
          reinforced: ep.reinforced, playerContact: ep.playerContact, initialForce: front.troops ?? front.sent,
          counterforce: front.counterforce ?? null, actorState: ep.actorState,
          targetState: front.targetState || front.targetAfter || null });
      }
      return ep;
    }
    invalidate(event, reason, actors) {
      for (const p of this.pending) {
        if (p.invalid) continue;
        if (!actors || actors.some(a => p.affectedPlayers.includes(a))) {
          p.invalid = { reason, eventId: event.eventId, gameTick: event.gameTick,
            sourceStateVersion: event.sourceStateVersion };
        }
      }
    }
    gap(reason) {
      this.commandCoverage = false;
      this.add({ event: 'telemetry_gap', matchId: this.matchId, gameTick: this.lastTick, reason });
      this.cancel('telemetry-gap');
    }
    native(event, origin) {
      this.match({ ...origin, gameTick: event.gameTick }, origin.metadata);
      const record = { ...event, matchId: this.matchId, stateVersion: origin.stateVersion,
        geometryVersion: origin.geometryVersion, geometryTick: origin.geometryTick };
      if (event.event === 'native_tick') return;
      const id = this.add(record); record.eventId = id;
      let ep = null;
      if (event.nativeFrontId != null) ep = this.ensure(event, { ...origin, ...event },
        event.event === 'native_command' && event.kind === 'front-admission');
      if (event.event === 'native_command') {
        for (const p of this.pending) {
          p.interveningCommands.push(id);
          if (p.interveningCommands.length > 256) p.invalid = { reason: 'command-ledger-overflow', eventId: id };
        }
        if (ep) { ep.commands.push(id); if (ep.commands.length > 256) ep.commands.shift(); }
        this.invalidate(record, 'future-action', [event.actor, event.target].filter(a => typeof a === 'number'));
      } else if (event.event === 'native_reinforcement') {
        if (ep) { ep.reinforcementObserved = true; ep.reinforcementCount++; }
        this.invalidate(record, 'unmodeled-reinforcement', [event.actor]);
      } else if (event.event === 'native_batch' && ep) {
        ep.captured += event.territoryDelta; ep.reinforced = event.reinforced;
        ep.actorState = event.after.actor;
        ep.lastBatch = { tick: event.observationTick, candidateCells: event.candidateCells };
        this.add({ ...record, event: 'episode_progress', eventId: undefined,
          episodeId: ep.episodeId, frontId: ep.frontId, cumulativeCaptured: ep.captured,
          forceBefore: event.before.force, forceAfter: event.after.force,
          counterforceBefore: event.before.counterforce, counterforceAfter: event.after.counterforce,
          actorTerritoryDelta: event.territoryDelta, actorBalanceDelta: event.after.actor.balance - event.before.actor.balance,
          reinforced: event.reinforced, reinforcementObserved: ep.reinforcementObserved });
      } else if (event.event === 'native_termination' && ep && !ep.terminated) {
        ep.terminated = true; ep.terminationTick = event.observationTick;
        ep.actorState = event.actorAfter; ep.reason = event.reason;
        if (event.refund > 0) this.invalidate(record, 'unmodeled-refund', [event.actor]);
        this.add({ ...record, event: 'episode_termination', eventId: undefined,
          episodeId: ep.episodeId, frontId: ep.frontId,
          terminationTick: ep.terminationTick, launchTick: ep.launchTick,
          durationTicks: ep.launchTick == null ? null : ep.terminationTick - ep.launchTick,
          etaLabelValid: !ep.leftCensored && event.reason === 'native-return', reinforced: ep.reinforced,
          reinforcementObserved: ep.reinforcementObserved,
          outcome: event.reason, conquest: 'not-inferred', targetEliminated: event.targetAfter ? !event.targetAfter.alive : null,
          actualActor: event.actorAfter,
          actualTarget: event.targetAfter, refund: event.refund });
      }
    }
    censor(p, reason, state = {}) {
      this.add({ event: 'prediction_censored', ...p.origin, predictionId: p.id,
        episodeId: p.episodeId, frontId: p.frontId, horizon: p.horizon, dueTick: p.dueTick,
        observedTick: state.gameTick ?? null, reason,
        invalidation: p.invalid || null, interveningCommands: p.interveningCommands,
        modelCoverage: p.coverage, reinforced: p.reinforced,
        reinforcementObserved: (this.episodes.get(p.key) || {}).reinforcementObserved || false,
        reinforcementDuringInterval: ((this.episodes.get(p.key) || {}).reinforcementCount || 0) > p.reinforcementCount }); this.skipped++;
    }
    cancel(reason) { for (const p of this.pending) this.censor(p, reason); this.pending = []; }
    observe(state, snapshot, core, metadata = {}) {
      this.match(state, metadata); this.lastTick = state.gameTick;
      const fronts = state.combatFronts || (state.outgoingAttacks || []).map(a =>
        ({ actor: state.player, target: a.targetId, troops: a.troops, reinforced: a.reinforced }));
      const live = new Set();
      for (const front of fronts) {
        const ep = this.ensure(front, { ...state, player: state.player,
          geometryVersion: snapshot && snapshot.meta.geometryVersion,
          geometryTick: snapshot && snapshot.meta.gameTick });
        if (ep.terminated) continue;
        live.add(ep.episodeId); ep.actorState = front.actorState || ep.actorState;
        if (typeof front.reinforced === 'boolean') ep.reinforced = front.reinforced;
        if (ep.observedTick !== state.gameTick) {
          this.add({ event: 'episode_observation', matchId: state.matchId, gameTick: state.gameTick,
            stateVersion: state.stateVersion, sourceStateVersion: state.sourceStateVersion,
            geometryVersion: snapshot ? snapshot.meta.geometryVersion : null, geometryTick: snapshot ? state.gameTick : null,
            episodeId: ep.episodeId, frontId: ep.frontId, actor: ep.actor, target: ep.target,
            force: front.troops, counterforce: front.counterforce ?? null, reinforced: front.reinforced ?? null,
            actorState: ep.actorState, targetState: front.targetState || null,
            cumulativeCaptured: ep.captured });
          ep.observedTick = state.gameTick;
        }
      }
      for (const ep of this.episodes.values()) if (!ep.terminated && !live.has(ep.episodeId) && ep.observedTick != null) {
        ep.terminated = true; ep.reason = 'unobserved-disappearance';
        this.add({ event: 'episode_censored', ...ep.origin, episodeId: ep.episodeId,
          observedTick: state.gameTick, reason: ep.reason, conquest: 'not-inferred' });
        this.invalidate({ gameTick: state.gameTick }, 'unobserved-disappearance', [ep.actor]);
      }
      const remaining = [];
      for (const p of this.pending) {
        const ep = this.episodes.get(p.key);
        if (p.invalid) { this.censor(p, p.invalid.reason, state); continue; }
        if (state.gameTick < p.dueTick) { remaining.push(p); continue; }
        if (state.gameTick !== p.dueTick) { this.censor(p, 'missed-tick', state); continue; }
        if (!ep || ep.reason === 'unobserved-disappearance') { this.censor(p, 'termination-label-unavailable', state); continue; }
        const actor = state.combatPlayers && state.combatPlayers[p.actor] || (p.actor === state.player ? { territory: state.territory, balance: state.balance }
          : (state.enemies || []).find(e => e.id === p.actor));
        const actual = actor ? { territory: actor.territory ?? actor.terr, balance: actor.balance ?? actor.bal,
          captured: ep.captured - p.capturedAtOrigin } : null;
        if (!actual) { this.censor(p, 'actor-state-unavailable', state); continue; }
        const etaValid = ep.terminated && ep.reason === 'native-return' && !ep.leftCensored && ep.terminationTick >= p.origin.gameTick &&
          ep.terminationTick <= p.dueTick && !ep.reinforcementObserved;
        this.add({ event: 'prediction_scored', ...p.origin, predictionId: p.id,
          episodeId: p.episodeId, frontId: p.frontId, actor: p.actor, target: p.target,
          horizon: p.horizon, dueTick: p.dueTick, observedTick: state.gameTick,
          observedStateVersion: state.stateVersion, observedSourceStateVersion: state.sourceStateVersion,
          predictions: p.predictions, actual, reinforced: p.reinforced,
          reinforcementObserved: ep.reinforcementObserved, modelCoverage: p.coverage,
          reinforcementDuringInterval: ep.reinforcementCount > p.reinforcementCount,
          etaLabelValid: etaValid, actualEtaTicks: etaValid ? ep.terminationTick - p.origin.gameTick : null,
          interveningCommands: p.interveningCommands,
          conditioning: 'observed forces; no subsequent relevant commands; exact tick label' }); this.scored++;
      }
      this.pending = remaining;
      for (const [key, ep] of this.episodes) if (ep.terminated &&
        !this.pending.some(p => p.key === key)) this.episodes.delete(key);
      if (state.alivePlayers >= 2 && !this.matchActive) {
        this.matchActive = true;
        this.add({ event: 'match_active', matchId: state.matchId, gameTick: state.gameTick });
      }
      if (this.matchActive && !this.matchEnded && state.ready && Number.isInteger(state.alivePlayers) && state.alivePlayers <= 1 && state.gameTick > 0) {
        this.matchEnded = true;
        this.add({ event: 'match_end', matchId: state.matchId, gameTick: state.gameTick,
          stateVersion: state.stateVersion, sourceStateVersion: state.sourceStateVersion,
          alivePlayers: state.alivePlayers, playerAlive: state.alive, outcome: state.alive ? 'last-player-alive' : 'player-eliminated',
          terminalObserved: true });
        this.cancel('match-ended');
      }
      if (!core || !state.alive || this.matchEnded) return;
      const base = { ...state, tick: state.gameTick, adjEnemies: state.enemies,
        totalEnemyTerr: state.totalEnemyTerritory, playersRemaining: state.alivePlayers,
        hasAdjFree: (state.physicalNeighbors || []).includes(state.neutralId), frontCap: state.multiFront,
        shadowTrackEffects: true, shadowEffects: {} };
      for (const [key, ep] of this.episodes) {
        if (!ep.playerContact || ep.terminated || ep.forecastTick != null && state.gameTick - ep.forecastTick < 20) continue;
        ep.forecastTick = state.gameTick;
        const contextPlayers = [ep.actor, ep.target].filter(a => typeof a === 'number');
        const unmodeled = fronts.some(f => (contextPlayers.includes(f.actor) || contextPlayers.includes(f.target)) &&
          f.actor !== state.player && f.target !== state.player);
        let aggregate = core.transitionPlanningState(base, hold, 0);
        let frontier = snapshot ? core.transitionPlanningState({ ...base, frontierExperiment: true,
          frontierSnapshot: snapshot, frontierCellCost: metadata.cellCost }, hold, 0) : null;
        const capturePred = (model, ep) => {
          if (!model) return null;
          const actor = ep.actor === state.player ? { balance: model.balance, territory: model.territory }
            : model.adjEnemies.find(e => e.id === ep.actor);
          if (!actor) return null;
          const effects = model.shadowEffects[pairKey(ep.actor, ep.target)] || { captured: 0, terminationTick: null };
          return { balance: actor.balance ?? actor.bal, territory: actor.territory ?? actor.terr,
            captured: effects.captured, etaTicks: effects.terminationTick == null ? null : effects.terminationTick - state.gameTick,
            modelKind: model.modelKind };
        };
        for (let tick = 1; tick <= this.horizons[this.horizons.length - 1]; tick++) {
          aggregate = core.transitionPlanningState(aggregate, hold, 1);
          if (frontier) frontier = core.transitionPlanningState(frontier, hold, 1);
          if (!this.horizons.includes(tick)) continue;
          const origin = { matchId: state.matchId, gameTick: state.gameTick, stateVersion: state.stateVersion,
            sourceStateVersion: state.sourceStateVersion,
            geometryVersion: snapshot ? snapshot.meta.geometryVersion : null, geometryTick: snapshot ? snapshot.meta.gameTick : null };
          const id = ep.episodeId + ':prediction:' + state.stateVersion + ':' + tick;
          const predictions = { aggregate: capturePred(aggregate, ep), frontier: capturePred(frontier, ep) };
          const coverage = { aggregate: !!predictions.aggregate,
            frontier: !!predictions.frontier && predictions.frontier.modelKind === 'native-cost-static-frontier-shadow',
            commands: this.commandCoverage, knownFronts: !unmodeled };
          const p = { id, key, origin, episodeId: ep.episodeId, frontId: ep.frontId,
            actor: ep.actor, target: ep.target, horizon: tick, dueTick: state.gameTick + tick,
            capturedAtOrigin: ep.captured, reinforced: ep.reinforced, reinforcementCount: ep.reinforcementCount, coverage, predictions,
            affectedPlayers: contextPlayers, interveningCommands: [] };
          this.add({ event: 'prediction', ...origin, predictionId: id, episodeId: ep.episodeId,
            frontId: ep.frontId, actor: ep.actor, target: ep.target, affectedPlayers: contextPlayers,
            horizon: tick, dueTick: p.dueTick, reinforced: ep.reinforced,
            predictions, modelCoverage: coverage, conditioning: 'observed forces; censor future relevant actions' });
          if (!this.commandCoverage || unmodeled) this.censor(p, unmodeled ? 'unmodeled-existing-front' : 'command-coverage-unavailable', state);
          else if (this.pending.length >= 256) this.censor(p, 'prediction-cap', state);
          else this.pending.push(p);
        }
      }
    }
    export(drain = false) {
      const records = [];
      for (let i = 0; i < this.size; i++) records.push(this.records[(this.cursor - this.size + i + this.capacity) % this.capacity]);
      const result = copy({ schema: 2, sessionId: this.sessionId, policyInfluence: false, capacity: this.capacity,
        commandCoverage: this.commandCoverage, horizons: this.horizons, scored: this.scored,
        skipped: this.skipped, dropped: this.dropped, records });
      if (drain) { this.size = 0; this.cursor = 0; } return result;
    }
  }
  root.TIOEpisodeTelemetry = Object.freeze({ Recorder: EpisodeRecorder, effect });
})(typeof globalThis !== 'undefined' ? globalThis : this);
