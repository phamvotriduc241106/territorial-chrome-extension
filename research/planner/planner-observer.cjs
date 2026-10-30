'use strict';
// Opt-in diagnostic factories serialized by the live tool. Not release imports.
function createBuffer(options = {}) {
  const maxEvents = options.maxEvents ?? 4096, maxBytes = options.maxBytes ?? 4194304;
  if (!Number.isInteger(maxEvents) || maxEvents < 1 || !Number.isInteger(maxBytes) || maxBytes < 256)
    throw Error('Invalid observer bounds');
  let records = [], bytes = 0, peakBytes = 0, dropped = 0, errors = 0;
  const encode = value => JSON.stringify(value, (_, v) => v === undefined
    ? { $tioType: 'undefined' } : typeof v === 'number' && !Number.isFinite(v)
      ? { $tioType: String(v) } : v);
  return {
    copy(value) { return JSON.parse(encode(value)); },
    push(record) {
      try {
        const json = encode(record), size = new TextEncoder().encode(json).length;
        if (records.length >= maxEvents || bytes + size > maxBytes) { dropped++; return; }
        records.push(json); bytes += size; peakBytes = Math.max(peakBytes, bytes);
      } catch (_) { errors++; }
    },
    fault() { errors++; },
    drain() { const out = records.map(v => JSON.parse(v)); records = []; bytes = 0; return out; },
    stats() { return { retainedEvents: records.length, retainedBytes: bytes,
      peakRetainedBytes: peakBytes, dropped, errors, maxEvents, maxBytes }; }
  };
}

function installPlannerObserver(agent, engine, options = {}) {
  if (!agent || !engine || typeof agent.executeInternalPipelineImpl !== 'function' ||
      !agent.internal || typeof agent.internal.attack !== 'function' ||
      typeof engine.decide !== 'function' || typeof engine.planSpend !== 'function')
    throw Error('Actual planner/actuator unavailable');
  const now = options.now || (() => performance.now());
  const buffer = createBuffer(options), prefix = options.experimentId || 'observer';
  const originals = { pipeline: agent.executeInternalPipelineImpl,
    decide: engine.decide, spend: engine.planSpend, attack: agent.internal.attack };
  let active = true, frame = null, decisionSeq = 0, commandSeq = 0;
  const timing = [];
  let timed = 0, maxOverheadMs = 0;
  const safe = fn => { try { return fn(); } catch (_) { buffer.fault(); return null; } };
  const copy = value => buffer.copy(value);
  function recordTime(start) {
    const ms = Math.max(0, now() - start); timed++; maxOverheadMs = Math.max(maxOverheadMs, ms);
    if (timing.length === 2048) timing.shift(); timing.push(ms);
  }
  function decide(...args) {
    const begin = now();
    if (active && frame) safe(() => {
      frame.decisionId = `${prefix}:d${++decisionSeq}`;
      frame.native = copy(agent.internal.lastState);
      frame.ageMs = now() - agent.internal.lastStateAt;
      frame.situation = copy(args[0]);
      frame.settings = copy(agent.settings);
    });
    safe(() => recordTime(begin));
    // Exactly one original call; returns and exceptions are not replaced.
    const result = originals.decide.apply(this, args);
    const end = now();
    if (active && frame) safe(() => { frame.rawDecision = copy(result); });
    safe(() => recordTime(end));
    return result;
  }
  function spend(...args) {
    const begin = now();
    if (active && frame) safe(() => { frame.spendContext = copy(args[0]); });
    safe(() => recordTime(begin));
    const result = originals.spend.apply(this, args);
    const end = now();
    if (active && frame) safe(() => { frame.rawPlan = copy(result); });
    safe(() => recordTime(end));
    return result;
  }
  function attack(...args) {
    const commandId = `${prefix}:c${++commandSeq}`, decisionId = frame?.decisionId ?? null;
    const begin = now();
    if (active) safe(() => {
      if (frame) frame.submittedCommands.push(commandId);
      buffer.push({ kind: 'submission', commandId, decisionId, at: new Date().toISOString(),
        localTimeMs: now(), nativeObservation: copy(agent.internal.lastState),
        payload: copy(args[0]), nativeAckTick: null });
    });
    safe(() => recordTime(begin));
    const promise = originals.attack.apply(this, args);
    safe(() => { if (promise && typeof promise.then === 'function') promise.then(result => {
      if (active) safe(() => buffer.push({ kind: 'receipt', commandId, decisionId,
        at: new Date().toISOString(), localTimeMs: now(), result: copy(result), nativeAckTick: null }));
    }, error => {
      if (active) safe(() => buffer.push({ kind: 'receipt', commandId, decisionId,
        at: new Date().toISOString(), localTimeMs: now(), error: String(error), nativeAckTick: null }));
    }); });
    return promise; // Preserve original Promise identity/settlement.
  }
  function pipeline(...args) {
    const previous = frame;
    frame = { kind: 'decision', at: new Date().toISOString(), submittedCommands: [] };
    try { return originals.pipeline.apply(this, args); }
    catch(error) { safe(()=>{frame.pipelineError=String(error);});throw error; }
    finally {
      const begin = now();
      if (active && frame.decisionId) safe(() => {
        frame.finalDecision = copy(agent._decision);
        frame.commitSummary = copy(agent.lastCommitMeta);
        frame.approvedPlan = agent.experimentalPolicy==='capital-v1' && agent.lastExperimental?.approvedPlan
          ? copy(agent.lastExperimental.approvedPlan)
          : { ...frame.rawPlan, ratio: agent.lastCommitMeta?.ratio,canAfford: agent.lastCommitMeta?.canAfford };
        if(agent.experimentalPolicy==='capital-v1')frame.experiment=copy(agent.lastExperimental);
        frame.sourceHash = options.sourceHash;
        frame.snapshotStage = 'native-state-at-original-decide-call';
        buffer.push(frame);
      });
      safe(() => recordTime(begin)); frame = previous;
    }
  }
  // Caller supplies the adapter's raw active engine, not its telemetry Proxy.
  engine.decide = decide; engine.planSpend = spend;
  agent.internal.attack = attack; agent.executeInternalPipelineImpl = pipeline;
  return {
    drain: () => buffer.drain(),
    stats() {
      const sorted = timing.slice().sort((a,b) => a-b);
      return { ...buffer.stats(), active, decisions: decisionSeq, commands: commandSeq,
        overheadSegments: timed, retainedTimingSamples: sorted.length,
        recentSegmentP95Ms: sorted.length ? sorted[Math.ceil(sorted.length*0.95)-1] : null,
        recentSegmentP99Ms: sorted.length ? sorted[Math.ceil(sorted.length*0.99)-1] : null,
        maxSegmentMs: maxOverheadMs, timingMeaning: 'observer segments, excludes original calls; not browser CPU' };
    },
    stop() {
      active = false;
      if (engine.decide === decide) engine.decide = originals.decide;
      if (engine.planSpend === spend) engine.planSpend = originals.spend;
      if (agent.internal.attack === attack) agent.internal.attack = originals.attack;
      if (agent.executeInternalPipelineImpl === pipeline) agent.executeInternalPipelineImpl = originals.pipeline;
      return this.stats();
    }
  };
}

function installNativeObserver(game, options = {}) {
  const modern = game && game.modern;
  if (!modern || !['incoming','attack','balance','me','gameTick'].every(k=>typeof modern[k] === 'function'))
    throw Error('Verified modern native observation paths unavailable');
  // modern is a fresh facade on every getter access. Wrap the stable native
  // namespaces it delegates to, and reject a changed delegation signature.
  const text = fn => Function.prototype.toString.call(fn).replace(/\s+/g,'');
  const v4 = game.contract === 'live-modern-v4';
  const incomingName = v4 ? 'pv' : 'hc', attackName = v4 ? 'xn' : 'i6';
  const incomingOwner = game.ae, attackOwner = v4 ? game.bB?.a1M : game.bB?.hz;
  if (!['live-modern-v3', 'live-modern-v4'].includes(game.contract) ||
      text(modern.incoming) !== (v4 ? 'function(p,t){returna0n.pv(p,t)}' : 'function(p,t){returnae.hc(p,t)}') ||
      text(modern.attack) !== (v4 ? 'function(code,t){returnss.a1M.xn(code,t)}' : 'function(code,t){returnbB.hz.i6(code,t)}') ||
      typeof incomingOwner?.[incomingName] !== 'function' || typeof attackOwner?.[attackName] !== 'function')
    throw Error('Unsupported stable native delegation signature');
  const buffer = createBuffer(options), originals = {
    incoming: incomingOwner[incomingName], attack: attackOwner[attackName] };
  let active = true, seq = 0;
  const safe = fn => { try { fn(); } catch (_) { buffer.fault(); } };
  function incoming(...args) {
    let value, error;
    try { value = originals.incoming.apply(this,args); return value; }
    catch (e) { error=e; throw e; }
    finally { if(active) safe(()=>{if(args[1] !== modern.me())return;buffer.push({ kind:'incoming-lookup', tick: modern.gameTick(),
      actor:args[0], exclude:args[1], value, error:error?String(error):null,
      valid:!error && Number.isSafeInteger(value) && value>=0 });}); }
  }
  function attack(...args) {
    let before=null, beforeTick=null, actor=null, result, error;
    if(active) safe(()=>{actor=modern.me();before=modern.balance(actor);beforeTick=modern.gameTick();});
    try { result=originals.attack.apply(this,args); return result; }
    catch(e){error=e;throw e;}
    finally { if(active) safe(()=> {
      const after=modern.balance(actor);
      buffer.push({kind:'native-command',nativeCommandId:`${options.experimentId||'observer'}:n${++seq}`,
        at:new Date().toISOString(),actor,target:args[1],il:args[0],beforeTick,
        afterTick:modern.gameTick(),before,after,observedDebit:before-after,
        sourceHash:options.sourceHash,frontId:null,error:error?String(error):null});
    }); }
  }
  incomingOwner[incomingName]=incoming;attackOwner[attackName]=attack;
  return {drain:()=>buffer.drain(),stats:()=>({...buffer.stats(),active,nativeCommands:seq}),
    stop(){active=false;if(incomingOwner[incomingName]===incoming)incomingOwner[incomingName]=originals.incoming;
      if(attackOwner[attackName]===attack)attackOwner[attackName]=originals.attack;return this.stats();}};
}

function installerExpression(kind, options) {
  const install = kind === 'planner' ? installPlannerObserver : installNativeObserver;
  const args = kind === 'planner'
    ? 'window.TerritorialEngineV5, window.TIOEngineAdapter.getActive()'
    : 'window.__TIO_GAME__';
  const name = kind === 'planner' ? '__TIO_PLANNER_OBSERVER__' : '__TIO_NATIVE_OBSERVER__';
  return `(()=>{const createBuffer=(${createBuffer.toString()});
    window.${name}=(${install.toString()})(${args},${JSON.stringify(options)});
    return window.${name}.stats();})()`;
}
module.exports={createBuffer,installPlannerObserver,installNativeObserver,installerExpression};
