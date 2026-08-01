/**
 * Isolated-world bridge to MAIN-world game internals (v9.0.0)
 * No mouse events — postMessage to main-hook source-faithful actuator.
 */
(function () {
  'use strict';

  if (window.__TIO_INTERNAL_BRIDGE__) return;
  window.__TIO_INTERNAL_BRIDGE__ = true;

  const SRC = 'tio-bot-isolated';
  const REPLY = 'tio-bot-main';
  let reqId = 1;
  const pending = new Map();

  window.addEventListener('message', (ev) => {
    if (ev.source !== window) return;
    const data = ev.data;
    if (!data || data.source !== REPLY) return;
    const p = pending.get(data.id);
    if (!p) return;
    pending.delete(data.id);
    clearTimeout(p.timer);
    p.resolve(data.result || { ok: false, err: 'empty' });
  });

  function callMain(type, payload, timeoutMs) {
    const id = reqId++;
    const msg = Object.assign({ source: SRC, id, type }, payload || {});
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        resolve({ ok: false, err: 'timeout' });
      }, timeoutMs || 900);
      pending.set(id, { resolve, timer });
      try {
        window.postMessage(msg, '*');
      } catch (e) {
        clearTimeout(timer);
        pending.delete(id);
        resolve({ ok: false, err: String(e && e.message || e) });
      }
    });
  }

  class InternalActuator {
    constructor() {
      this.lastResult = null;
      this.lastState = null;
      this.ready = false;
      this.mode = 'pending'; // pending | internal | patched-not-ready | unavailable
      this.failStreak = 0;
      this.successCount = 0;
      this.lastPolicy = '';
      this.lastPath = '';
    }

    async refresh() {
      const r = await callMain('state', {}, 700);
      if (r && r.ok && r.state) {
        this.lastState = r.state;
        this.ready = !!r.state.ready;
        this.mode = this.ready
          ? 'internal'
          : (r.state.patched ? 'patched-not-ready' : 'unavailable');
      } else {
        this.ready = false;
        this.mode = 'unavailable';
      }
      try {
        const attr = document.documentElement.getAttribute('data-tio-internal');
        if (attr === '1') {
          this.ready = true;
          this.mode = 'internal';
        }
      } catch (_) { /* ignore */ }
      return this.lastState;
    }

    isReady() {
      return this.ready;
    }

    /**
     * Single source-faithful attack (expand-empty → crush-weak).
     * opts: { ratio, preferNeutral, phase, freeLand }
     */
    async attack(ratioOrOpts, preferNeutral) {
      let opts;
      if (ratioOrOpts && typeof ratioOrOpts === 'object') {
        opts = ratioOrOpts;
      } else {
        opts = {
          ratio: ratioOrOpts != null ? ratioOrOpts : undefined,
          preferNeutral: preferNeutral !== false
        };
      }
      const r = await callMain('attack', {
        ratio: opts.ratio,
        preferNeutral: opts.preferNeutral !== false,
        phase: opts.phase || 'LAND_RUSH',
        freeLand: opts.freeLand
      }, 1200);
      this._ingest(r);
      return r;
    }

    /**
     * Multi-front burst (Hard ki=4). One round-trip to MAIN.
     */
    async attackBurst(opts) {
      opts = opts || {};
      const r = await callMain('attack-burst', {
        ratio: opts.ratio,
        preferNeutral: opts.preferNeutral !== false,
        phase: opts.phase || 'LAND_RUSH',
        freeLand: opts.freeLand,
        fronts: opts.fronts
      }, 1800);
      this._ingest(r && r.last ? r.last : r);
      if (r && r.ok) {
        this.successCount += (r.okCount || 1);
        this.failStreak = 0;
        this.ready = true;
        this.mode = 'internal';
      } else {
        this.failStreak++;
        if (this.failStreak > 8) this.mode = 'unavailable';
      }
      this.lastResult = r;
      return r;
    }

    async attackNeutral(ratio, freeLand) {
      const r = await callMain('attack-neutral', {
        ratio: ratio != null ? ratio : undefined,
        freeLand: freeLand
      }, 1000);
      this._ingest(r);
      return r;
    }

    async attackEnemy(ratio, phase) {
      const r = await callMain('attack-enemy', {
        ratio: ratio != null ? ratio : undefined,
        phase: phase || 'PRESSURE',
        freeLand: 0,
        allowShip: true
      }, 1000);
      this._ingest(r);
      return r;
    }

    /** Boat attack to sea-isolated island (game pZ). */
    async attackShip(ratio, target) {
      const r = await callMain('attack-ship', {
        ratio: ratio != null ? ratio : undefined,
        target: target
      }, 1000);
      this._ingest(r);
      return r;
    }

    async setDifficulty(diff) {
      return callMain('set-diff', { diff: diff | 0 }, 500);
    }

    /**
     * Set in-game troop bar to ratio (0–1).
     * Required so canvas CLICKS spend adaptive %, not the stuck ~79% UI bar.
     * Does not count as attack success/fail.
     */
    async setTroopRatio(ratio) {
      const r = await callMain('set-troop', {
        ratio: ratio != null ? ratio : 0.25
      }, 500);
      if (r && (r.ok || r.il != null)) {
        this.lastTroopSet = r;
      }
      return r;
    }

    _ingest(r) {
      this.lastResult = r;
      if (r && r.ok) {
        this.successCount++;
        this.failStreak = 0;
        this.ready = true;
        this.mode = 'internal';
        this.lastPolicy = r.policy || (r.last && r.last.policy) || '';
        this.lastPath = r.path || (r.last && r.last.path) || '';
      } else {
        this.failStreak++;
        if (this.failStreak > 8) this.mode = 'unavailable';
      }
    }

    getTelemetry() {
      return {
        mode: this.mode,
        ready: this.ready,
        successCount: this.successCount,
        failStreak: this.failStreak,
        lastResult: this.lastResult,
        lastState: this.lastState,
        lastPolicy: this.lastPolicy,
        lastPath: this.lastPath
      };
    }
  }

  window.InternalActuator = InternalActuator;
  window.__TIO_internal = new InternalActuator();
  console.log('%c[TIO Internal Bridge v9] source-faithful postMessage actuator ready.', 'color: #38bdf8;');
})();
