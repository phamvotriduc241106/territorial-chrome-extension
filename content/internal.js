/**
 * Isolated-world RPC client for the MAIN-world Territorial adapter.
 * Requests are versioned, bounded, and game mutations are single-flight.
 */
(function () {
  'use strict';

  if (window.__TIO_INTERNAL_BRIDGE__) return;
  window.__TIO_INTERNAL_BRIDGE__ = true;

  const CFG = window.TIOConfig || {};
  const PROTOCOL = CFG.BRIDGE || {};
  const SRC = PROTOCOL.requestSource || 'tio-engine-isolated';
  const REPLY = PROTOCOL.responseSource || 'tio-engine-main';
  const VERSION = PROTOCOL.version || 1;
  const MAX_PENDING = PROTOCOL.maxPending || 8;
  const TARGET_ORIGIN = location.origin === 'null' ? '*' : location.origin;

  let reqId = 1;
  const pending = new Map();

  window.addEventListener('message', (ev) => {
    if (ev.source !== window) return;
    const data = ev.data;
    if (!data || data.source !== REPLY || data.version !== VERSION) return;
    const request = pending.get(data.id);
    if (!request) return;
    pending.delete(data.id);
    clearTimeout(request.timer);
    request.resolve(data.result || { ok: false, err: 'empty-response' });
  });

  function callMain(type, payload, timeoutMs) {
    if (pending.size >= MAX_PENDING) {
      return Promise.resolve({ ok: false, err: 'bridge-saturated' });
    }
    const id = reqId++;
    if (reqId >= Number.MAX_SAFE_INTEGER) reqId = 1;
    const msg = Object.assign({ source: SRC, version: VERSION, id, type }, payload || {});
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        resolve({ ok: false, err: 'timeout' });
      }, timeoutMs || PROTOCOL.actionTimeoutMs || 1200);
      pending.set(id, { resolve, timer, type });
      try {
        window.postMessage(msg, TARGET_ORIGIN);
      } catch (error) {
        clearTimeout(timer);
        pending.delete(id);
        resolve({ ok: false, err: String(error && error.message || error) });
      }
    });
  }

  class InternalActuator {
    constructor() {
      this.lastResult = null;
      this.lastState = null;
      this.lastStateAt = 0;
      this.lastActionAt = 0;
      this.ready = false;
      this.armed = false;
      this.mode = 'pending';
      this.failStreak = 0;
      this.successCount = 0;
      this.lastPolicy = '';
      this.lastPath = '';
      this._refreshPromise = null;
      this._actionPromise = null;
      this._ratioPromise = null;
    }

    async refresh() {
      if (this._refreshPromise) return this._refreshPromise;
      this._refreshPromise = callMain('state', {}, PROTOCOL.stateTimeoutMs || 700)
        .then((result) => {
          if (result && result.ok && result.state) {
            this.lastState = result.state;
            this.lastStateAt = performance.now();
            this.ready = !!result.state.ready;
            this.armed = result.state.armed === true;
            this.mode = this.ready ? 'internal' : (result.state.patched ? 'patched-not-ready' : 'unavailable');
          } else {
            this.ready = false;
            this.mode = 'unavailable';
          }
          return this.lastState;
        })
        .finally(() => {
          this._refreshPromise = null;
        });
      return this._refreshPromise;
    }

    async setArmed(armed) {
      const want = armed !== false;
      const result = await callMain(want ? 'arm' : 'disarm', { armed: want }, 700);
      if (result && result.ok) {
        this.armed = want;
        if (result.state) {
          this.lastState = result.state;
          this.lastStateAt = performance.now();
          this.ready = !!result.state.ready;
        }
      }
      return result;
    }

    isReady() { return this.ready; }
    // Explicit diagnostic-only activation. Normal autoplay never calls this.
    frontierShadow(command = 'report', options = {}) {
      if (!['start', 'stop', 'report', 'drain'].includes(command)) return Promise.reject(Error('Invalid frontier command'));
      return callMain('frontier-' + command, { options }, PROTOCOL.stateTimeoutMs || 700);
    }
    isBusy() { return !!this._actionPromise; }

    async _runAction(type, payload, timeoutMs) {
      if (!this.armed) return { ok: false, err: 'not-armed' };
      if (this._actionPromise) return { ok: false, err: 'action-in-flight' };
      this.lastActionAt = performance.now();
      this._actionPromise = callMain(type, payload, timeoutMs)
        .then((result) => {
          this._ingest(result && result.last ? result.last : result);
          if (result && result.ok && result.okCount > 1) this.successCount += result.okCount - 1;
          this.lastResult = result;
          return result;
        })
        .finally(() => {
          this._actionPromise = null;
        });
      return this._actionPromise;
    }

    async attack(ratioOrOpts, preferNeutral) {
      const opts = ratioOrOpts && typeof ratioOrOpts === 'object'
        ? ratioOrOpts
        : { ratio: ratioOrOpts, preferNeutral: preferNeutral !== false };
      return this._runAction('attack', {
        ratio: opts.ratio,
        preferNeutral: opts.preferNeutral !== false,
        phase: opts.phase || 'LAND_RUSH',
        freeLand: opts.freeLand,
        target: opts.target,
        autoExpand: opts.autoExpand,
        autoAttack: opts.autoAttack,
        minRemaining: opts.minRemaining,
        primaryDanger: opts.primaryDanger,
        attackSequence: opts.attackSequence,
        gameTimeSec: opts.gameTimeSec,
        areaTrend: opts.areaTrend,
        shrinkFrames: opts.shrinkFrames
      }, PROTOCOL.actionTimeoutMs || 1200);
    }

    async attackBurst(opts) {
      opts = opts || {};
      return this._runAction('attack-burst', {
        ratio: opts.ratio,
        preferNeutral: opts.preferNeutral !== false,
        phase: opts.phase || 'LAND_RUSH',
        freeLand: opts.freeLand,
        fronts: opts.fronts,
        target: opts.target,
        autoExpand: opts.autoExpand,
        autoAttack: opts.autoAttack,
        minRemaining: opts.minRemaining,
        primaryDanger: opts.primaryDanger,
        attackSequence: opts.attackSequence,
        gameTimeSec: opts.gameTimeSec,
        areaTrend: opts.areaTrend,
        shrinkFrames: opts.shrinkFrames
      }, 1800);
    }

    async attackNeutral(ratio, freeLand) {
      return this._runAction('attack-neutral', { ratio, freeLand }, 1000);
    }

    async attackEnemy(ratio, phase) {
      return this._runAction('attack-enemy', {
        ratio,
        phase: phase || 'PRESSURE',
        freeLand: 0,
        allowShip: false
      }, 1000);
    }

    async attackShip() { return { ok: false, err: 'ship-disabled-border-only' }; }

    async setDifficulty(diff) {
      return callMain('set-diff', { diff: diff | 0 }, 500);
    }

    async setTroopRatio(ratio) {
      if (!this.armed) return { ok: false, err: 'not-armed' };
      if (this._ratioPromise) return this._ratioPromise;
      this._ratioPromise = callMain('set-troop', {
        ratio: ratio != null ? ratio : 0.25
      }, 600).then((result) => {
        if (result && (result.ok || result.il != null)) this.lastTroopSet = result;
        return result;
      }).finally(() => {
        this._ratioPromise = null;
      });
      return this._ratioPromise;
    }

    _ingest(result) {
      this.lastResult = result;
      if (result && result.ok) {
        this.successCount++;
        this.failStreak = 0;
        this.ready = true;
        this.mode = 'internal';
        this.lastPolicy = result.policy || (result.last && result.last.policy) || '';
        this.lastPath = result.path || (result.last && result.last.path) || '';
      } else if (!result || ['action-in-flight', 'spend-lock', 'target-busy', 'below-reserve', 'zero-troops', 'negative-troops'].indexOf(result.err) < 0) {
        this.failStreak++;
        if (this.failStreak > 8) this.mode = 'unavailable';
      }
    }

    getTelemetry() {
      return {
        mode: this.mode,
        ready: this.ready,
        armed: this.armed,
        busy: this.isBusy(),
        pendingRequests: pending.size,
        successCount: this.successCount,
        failStreak: this.failStreak,
        lastResult: this.lastResult,
        lastState: this.lastState,
        lastStateAt: this.lastStateAt,
        lastPolicy: this.lastPolicy,
        lastPath: this.lastPath
      };
    }
  }

  window.InternalActuator = InternalActuator;
  window.__TIO_internal = new InternalActuator();
  console.log('%c[TIO Bridge v10] versioned, armed, single-flight RPC ready.', 'color:#38bdf8');
})();
