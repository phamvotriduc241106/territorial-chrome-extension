/**
 * Territorial.io Mouse Controller v7.4.0
 *
 * Land attack is TWO clicks in the live game:
 *  1) Click foreign territory → green radial sword button appears (aM menu)
 *  2) Click the sword (same spot / center of radial) → bB.hZ.hg actually fires
 *
 * fireAttack() does both steps. Single executeClick alone only opens the menu.
 *
 * NEVER click bottom-left logo (fW): 1st hit opens Quit menu, 2nd hit Quits →
 * main menu username INPUT. Canvas-only events (game listens on #canvasA).
 */
(function () {
  'use strict';

  if (window.__TIO_MOUSE_CONTROLLER_V5_LOADED__) return;
  window.__TIO_MOUSE_CONTROLLER_V5_LOADED__ = true;

  const BOT_POINTER_ID = 99;
  const BOT_EVENT_FLAG = '__tioBotEvent';
  // Delay so radial menu is open before confirm (aM.a30) — minimal for game UI
  const SWORD_CONFIRM_MS = 16;

  // Strict Hardware Shield: Prohibit any camera or media access
  try {
    if (typeof navigator !== 'undefined' && navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
      navigator.mediaDevices.getUserMedia = function () {
        return Promise.reject(new DOMException('Camera/media access is strictly prohibited by security policy.', 'NotAllowedError'));
      };
    }
  } catch (_) {}

  class MouseController {
    constructor() {
      this.canvas = null;
      this.coords = null; // set via setCoordSystem
      this.virtualPointerId = BOT_POINTER_ID;
      this.lastActionTimestamp = 0;
      this.actionCount = 0;
      this.isBusy = false;
      this.currentX = 0;
      this.currentY = 0;
      this.lastExecutionTimeMs = 0;
      this.queue = [];
      this.isDraining = false;
      this.minActionIntervalMs = 250;
      this.sliderEnabled = false;
      this.restorePointer = false;
      this.userPointerDown = false;
      this.userLastInteractAt = 0;
      this.realClientX = window.innerWidth / 2;
      this.realClientY = window.innerHeight / 2;
      this._userGuardInstalled = false;
      this.rejectedUiClicks = 0;
      this._confirmTimers = [];
      this.allowCameraAccess = false; // Strict Invariant: Camera access prohibited
    }

    setCoordSystem(coords) {
      this.coords = coords || null;
    }

    attach(canvasElement) {
      this.canvas = canvasElement || document.querySelector('canvas');
      if (this.canvas) this.installUserGuard();
      return !!this.canvas;
    }

    installUserGuard() {
      if (this._userGuardInstalled) return;
      this._userGuardInstalled = true;

      const trackPos = (e) => {
        if (!e.isTrusted) return;
        if (e.pointerId === BOT_POINTER_ID) return;
        if (typeof e.clientX === 'number') {
          this.realClientX = e.clientX;
          this.realClientY = e.clientY;
        }
      };

      const onDown = (e) => {
        if (!e.isTrusted) return;
        if (e.pointerId === BOT_POINTER_ID) return;
        trackPos(e);
        this.userPointerDown = true;
        this.userLastInteractAt = performance.now();
        this.queue = [];
      };

      const onUp = (e) => {
        if (!e.isTrusted) return;
        if (e.pointerId === BOT_POINTER_ID) return;
        trackPos(e);
        this.userPointerDown = false;
        this.userLastInteractAt = performance.now();
      };

      const onWheel = (e) => {
        if (!e.isTrusted) return;
        this.userLastInteractAt = performance.now();
      };

      const opts = { capture: true, passive: true };
      window.addEventListener('pointermove', trackPos, opts);
      window.addEventListener('mousemove', trackPos, opts);
      window.addEventListener('pointerdown', onDown, opts);
      window.addEventListener('mousedown', onDown, opts);
      window.addEventListener('pointerup', onUp, opts);
      window.addEventListener('mouseup', onUp, opts);
      window.addEventListener('pointercancel', onUp, opts);
      window.addEventListener('wheel', onWheel, opts);
      window.addEventListener('touchstart', onDown, opts);
      window.addEventListener('touchend', onUp, opts);
      window.addEventListener('blur', () => { this.userPointerDown = false; }, opts);
    }

    isUserControlling(cooldownMs = 120) {
      if (this.userPointerDown) return true;
      return (performance.now() - this.userLastInteractAt) < cooldownMs;
    }

    setPacing(minIntervalMs) {
      // Explicit scheduler ceiling; zero remains available to deterministic tests.
      this.minActionIntervalMs = Math.max(0, minIntervalMs | 0);
    }

    _tag(evt) {
      try { evt[BOT_EVENT_FLAG] = true; } catch (_) {}
      return evt;
    }

    static isBotEvent(e) {
      return !!(e && (e[BOT_EVENT_FLAG] || e.pointerId === BOT_POINTER_ID));
    }

    /**
     * Hard reject: never fire on UI chrome / outside safe map.
     * Bottom-left logo opens Quit → username; always blocked.
     */
    isMapSafeClick(x, y) {
      if (this.coords && typeof this.coords.isUiChromePoint === 'function') {
        if (this.coords.isUiChromePoint(x, y)) return false;
      }
      if (this.coords && typeof this.coords.isSafeScreenPoint === 'function') {
        return this.coords.isSafeScreenPoint(x, y);
      }
      // Fallback: keep clear of bottom-left logo + bottom bar
      const canvas = this.canvas || document.querySelector('canvas');
      if (!canvas) return false;
      const r = canvas.getBoundingClientRect();
      const nx = (x - r.left) / Math.max(1, r.width);
      const ny = (y - r.top) / Math.max(1, r.height);
      if (nx < 0.04 || nx > 0.97 || ny < 0.07 || ny > 0.88) return false;
      if (nx < 0.16 && ny > 0.78) return false;
      return true;
    }

    _dispatch(type, x, y, buttons, force) {
      if (!this.canvas) {
        this.attach();
        if (!this.canvas) return false;
      }
      if (!force && this.userPointerDown) return false;

      // CAMERA & CURSOR PROTECTION: NEVER dispatch mousemove (moves cursor and pans game camera)
      if (type && type.indexOf('move') >= 0) return false;

      try {
        let evtType = type;
        if (type.startsWith('pointer')) {
          const map = {
            pointerdown: 'mousedown',
            pointerup: 'mouseup',
            pointermove: 'mousemove'
          };
          evtType = map[type] || type;
        }

        const opts = {
          bubbles: true,
          cancelable: true,
          composed: true,
          view: window,
          clientX: x,
          clientY: y,
          screenX: (window.screenX || 0) + x,
          screenY: (window.screenY || 0) + y,
          button: 0,
          buttons: buttons,
          detail: evtType === 'click' ? 1 : 0,
          movementX: 0,
          movementY: 0
        };

        // Game listens ONLY on #canvasA — never window (avoids DOM name INPUT focus)
        const evt = this._tag(new MouseEvent(evtType, opts));
        this.canvas.dispatchEvent(evt);
        return true;
      } catch (e) {
        return false;
      }
    }

    restoreRealPointer() {
      // Hardware Shield: Intentionally disabled to guarantee physical mouse cursor is never manipulated
      return;
    }

    /**
     * Single physical click (open radial OR press a UI button).
     * force=true skips user-hold only — UI chrome is ALWAYS blocked.
     */
    executeClick(x, y, force) {
      if (!force && this.userPointerDown) return false;
      // ALWAYS block logo / Quit / bar chrome — force only ignores user-hold
      if (!this.isMapSafeClick(x, y)) {
        this.rejectedUiClicks++;
        return false;
      }

      const startTime = performance.now();
      const canvas = this.canvas || document.querySelector('canvas');
      if (!canvas) return false;
      this.canvas = canvas;

      // ZERO mousemove and ZERO camera drag:
      // Synchronous atomic down-up with movementX=0, movementY=0 and 0ms hold time.
      // Game canvas receives mousedown, mouseup, and click to trigger radial/sword menu,
      // but camera drag controller is NEVER engaged because delta is zero and hold is 0ms.
      this._dispatch('mousedown', x, y, 1, !!force);
      this._dispatch('mouseup', x, y, 0, !!force);
      this._dispatch('click', x, y, 0, !!force);

      this.lastActionTimestamp = performance.now();
      this.actionCount++;
      this.lastExecutionTimeMs = parseFloat((performance.now() - startTime).toFixed(2));
      this.currentX = x;
      this.currentY = y;
      return true;
    }

    /**
     * FULL land attack:
     *  1) Click foreign land → green sword radial (rb[0]) appears
     *  2) Click again near same point → aM.a30 → hZ.hg sends troops
     *
     * Sword button 0 is drawn centered on the first click (fG/fI = click - a6G/2,
     * rb[0] relative 0,0), so the same client coords hit the sword.
     */
    fireAttack(x, y) {
      if (this.userPointerDown) return false;
      // Hard block Quit-logo / troop-bar chrome (never full-canvas force)
      if (!this.isMapSafeClick(x, y)) {
        this.rejectedUiClicks++;
        return false;
      }

      const now = performance.now();
      // Only queue if a hard pacing floor is set; uncapped (0) fires immediately
      const pace = this.minActionIntervalMs | 0;
      if (pace > 0 && now - this.lastActionTimestamp < pace) {
        if (this.queue.length < 6) {
          this.queue.push({ type: 'attack', x, y, priority: 10 });
          this.drainQueue();
        }
        return true;
      }

      // Step 1: open radial sword menu on foreign land
      if (!this.executeClick(x, y, true)) return false;

      // Step 2: confirm sword (same coords — button centered on first click)
      const self = this;
      const t = setTimeout(() => {
        if (self.userPointerDown) return;
        // Re-check chrome in case coords are stale
        if (!self.isMapSafeClick(x, y)) return;
        self.executeClick(x, y, true);
      }, SWORD_CONFIRM_MS);
      this._confirmTimers.push(t);
      return true;
    }

    /** @deprecated use fireAttack for land attacks */
    fireNow(x, y) {
      return this.fireAttack(x, y);
    }

    enqueueClick(x, y, priority) {
      if (this.userPointerDown) return false;
      if (!this.isMapSafeClick(x, y)) {
        this.rejectedUiClicks++;
        return false;
      }
      if (this.queue.length >= 8) this.queue.shift();
      this.queue.push({ type: 'attack', x, y, priority: priority || 0 });
      this.drainQueue();
      return true;
    }

    async drainQueue() {
      if (this.isDraining) return;
      this.isDraining = true;
      while (this.queue.length > 0) {
        if (this.userPointerDown) {
          this.queue = [];
          break;
        }
        const pace = this.minActionIntervalMs | 0;
        if (pace > 0) {
          const wait = pace - (performance.now() - this.lastActionTimestamp);
          if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        }
        if (this.userPointerDown) {
          this.queue = [];
          break;
        }
        const action = this.queue.shift();
        if (!action) continue;
        if (action.type === 'attack' || action.type === 'click') {
          this.fireAttack(action.x, action.y);
          // Wait only for sword confirm pair (one frame-ish)
          await new Promise((r) => setTimeout(r, SWORD_CONFIRM_MS + 4));
        }
      }
      this.isDraining = false;
    }

    clearQueue() {
      this.queue = [];
      while (this._confirmTimers.length) {
        clearTimeout(this._confirmTimers.pop());
      }
    }
    async executeDrag() { return false; }
    /**
     * Ask MAIN world to force aS.hd() / data[182] to this ratio.
     * Without this, map clicks spend whatever the UI bar shows (often ~79%).
     */
    setTroopSliderRatio(ratio) {
      const r = Math.max(0.10, Math.min(0.50, ratio != null ? ratio : 0.25));
      this._desiredTroopRatio = r;
      // Fire-and-forget into MAIN via postMessage (same bridge as internal)
      try {
        if (window.__TIO_internal && typeof window.__TIO_internal.setTroopRatio === 'function') {
          window.__TIO_internal.setTroopRatio(r);
          return true;
        }
        window.postMessage({
          source: window.TIOConfig && window.TIOConfig.BRIDGE
            ? window.TIOConfig.BRIDGE.requestSource
            : 'tio-engine-isolated',
          version: window.TIOConfig && window.TIOConfig.BRIDGE
            ? window.TIOConfig.BRIDGE.version
            : 1,
          id: 0,
          type: 'set-troop',
          ratio: r
        }, location.origin === 'null' ? '*' : location.origin);
        return true;
      } catch (e) {
        return false;
      }
    }

    getControllerTelemetry() {
      return {
        actionCount: this.actionCount,
        queueLen: this.queue.length,
        rejectedUiClicks: this.rejectedUiClicks,
        userControlling: this.isUserControlling(),
        mode: 'map-safe-web-only'
      };
    }
  }

  window.BezierInterpolator = { generatePath() { return []; } };
  window.MouseController = MouseController;
  window.__TIO_BOT_POINTER_ID__ = BOT_POINTER_ID;
  window.__TIO_IS_BOT_EVENT__ = MouseController.isBotEvent;

  console.log('%c[TIO Mouse Controller v10] Safe perimeter fallback ready.', 'color:#10b981');
})();
