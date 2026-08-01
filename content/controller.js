/**
 * Territorial.io Mouse Controller v7.2.0
 *
 * - Web-only synthetic events on canvas (never OS mouse APIs)
 * - NEVER click outside the playable map safe-zone (no UI buttons / slider)
 * - No troop-slider interaction
 * - Optional pointer restore disabled by default (less interference)
 * - Pause only while real user holds a button
 */
(function () {
  'use strict';

  if (window.__TIO_MOUSE_CONTROLLER_V5_LOADED__) return;
  window.__TIO_MOUSE_CONTROLLER_V5_LOADED__ = true;

  const BOT_POINTER_ID = 99;
  const BOT_EVENT_FLAG = '__tioBotEvent';

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
      this.minActionIntervalMs = 80;
      this.sliderEnabled = false;
      this.restorePointer = false; // OFF — do not inject mousemove after clicks
      this.userPointerDown = false;
      this.userLastInteractAt = 0;
      this.realClientX = window.innerWidth / 2;
      this.realClientY = window.innerHeight / 2;
      this._userGuardInstalled = false;
      this.rejectedUiClicks = 0;
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

      const opts = { capture: true, passive: true };
      window.addEventListener('pointermove', trackPos, opts);
      window.addEventListener('mousemove', trackPos, opts);
      window.addEventListener('pointerdown', onDown, opts);
      window.addEventListener('mousedown', onDown, opts);
      window.addEventListener('pointerup', onUp, opts);
      window.addEventListener('mouseup', onUp, opts);
      window.addEventListener('pointercancel', onUp, opts);
      window.addEventListener('blur', () => { this.userPointerDown = false; }, opts);
    }

    isUserControlling(cooldownMs = 50) {
      if (this.userPointerDown) return true;
      return (performance.now() - this.userLastInteractAt) < cooldownMs;
    }

    setPacing(minIntervalMs) {
      // VH multi-front needs sub-100ms clicks; allow down to 40ms
      this.minActionIntervalMs = Math.max(40, minIntervalMs | 0);
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
     */
    isMapSafeClick(x, y) {
      if (this.coords && typeof this.coords.isSafeScreenPoint === 'function') {
        return this.coords.isSafeScreenPoint(x, y);
      }
      // Fallback inset if coords missing
      const canvas = this.canvas || document.querySelector('canvas');
      if (!canvas) return false;
      const r = canvas.getBoundingClientRect();
      const left = r.left + r.width * 0.05;
      const right = r.left + r.width * 0.95;
      const top = r.top + r.height * 0.12;
      const bottom = r.top + r.height * 0.80;
      return x >= left && x <= right && y >= top && y <= bottom;
    }

    _dispatch(type, x, y, buttons, force) {
      if (!this.canvas) {
        this.attach();
        if (!this.canvas) return false;
      }
      if (!force && this.userPointerDown) return false;

      try {
        const opts = {
          bubbles: true,
          cancelable: true,
          composed: false,
          view: window,
          clientX: x,
          clientY: y,
          screenX: (window.screenX || 0) + x,
          screenY: (window.screenY || 0) + y,
          button: 0,
          buttons: buttons,
          detail: type === 'click' ? 1 : 0,
          movementX: 0,
          movementY: 0
        };

        // MouseEvent only — fewer browser-level pointer side effects
        if (type.startsWith('pointer')) {
          // Map pointer* to mouse* for isolation
          const map = {
            pointerdown: 'mousedown',
            pointerup: 'mouseup',
            pointermove: 'mousemove'
          };
          type = map[type] || type;
        }

        this.canvas.dispatchEvent(this._tag(new MouseEvent(type, opts)));
        return true;
      } catch (e) {
        return false;
      }
    }

    restoreRealPointer() {
      if (!this.restorePointer) return;
      const x = this.realClientX;
      const y = this.realClientY;
      this._dispatch('mousemove', x, y, 0, true);
      this.currentX = x;
      this.currentY = y;
    }

    executeClick(x, y) {
      if (this.userPointerDown) return false;
      if (!this.isMapSafeClick(x, y)) {
        this.rejectedUiClicks++;
        return false;
      }

      const startTime = performance.now();
      const canvas = this.canvas || document.querySelector('canvas');
      if (!canvas) return false;
      this.canvas = canvas;

      this._dispatch('mousedown', x, y, 1, false);
      this._dispatch('mouseup', x, y, 0, false);
      this._dispatch('click', x, y, 0, false);
      // No pointer restore by default — avoids fighting user cursor/camera

      this.lastActionTimestamp = performance.now();
      this.actionCount++;
      this.lastExecutionTimeMs = parseFloat((performance.now() - startTime).toFixed(2));
      this.currentX = x;
      this.currentY = y;
      return true;
    }

    fireNow(x, y) {
      if (this.userPointerDown) return false;
      if (!this.isMapSafeClick(x, y)) {
        this.rejectedUiClicks++;
        return false;
      }
      const now = performance.now();
      if (now - this.lastActionTimestamp < this.minActionIntervalMs) {
        return this.enqueueClick(x, y, 5);
      }
      return this.executeClick(x, y);
    }

    enqueueClick(x, y, priority) {
      if (this.userPointerDown) return false;
      if (!this.isMapSafeClick(x, y)) {
        this.rejectedUiClicks++;
        return false;
      }
      // VH multi-front uses up to 6 simultaneous expand targets
      if (this.queue.length >= 8) this.queue.shift();
      this.queue.push({ type: 'click', x, y, priority: priority || 0 });
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
        const wait = this.minActionIntervalMs - (performance.now() - this.lastActionTimestamp);
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        if (this.userPointerDown) {
          this.queue = [];
          break;
        }
        const action = this.queue.shift();
        if (action && action.type === 'click') this.executeClick(action.x, action.y);
      }
      this.isDraining = false;
    }

    clearQueue() { this.queue = []; }
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
          source: 'tio-bot-isolated',
          id: 0,
          type: 'set-troop',
          ratio: r
        }, '*');
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

  console.log('%c[TIO Mouse Controller v7.2] Map-safe clicks only (no UI).', 'color: #10b981;');
})();
