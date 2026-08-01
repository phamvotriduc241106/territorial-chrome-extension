/**
 * Territorial.io Coordinate System v6.0.0
 *
 * Single source of truth for Screen ↔ Vision-Grid conversions.
 * All modules that reason about space should convert through this API.
 */
(function () {
  'use strict';

  if (window.__TIO_COORD_SYSTEM_V6_LOADED__) return;
  window.__TIO_COORD_SYSTEM_V6_LOADED__ = true;

  class CoordSystem {
    constructor() {
      this.scaleFactor = 0.25;
      this.gridWidth = 0;
      this.gridHeight = 0;
      this.canvasWidth = 0;
      this.canvasHeight = 0;
      this.rect = { left: 0, top: 0, width: 0, height: 0 };
      // Playable map inset — avoid top chrome, bottom slider/buttons, side UI
      this.safeInset = { top: 0.10, bottom: 0.18, left: 0.04, right: 0.04 };
    }

    /**
     * Sync from vision output + live canvas element.
     */
    update(visionResult, canvas) {
      if (visionResult) {
        this.scaleFactor = visionResult.scaleFactor || this.scaleFactor || 0.25;
        this.gridWidth = visionResult.width || this.gridWidth;
        this.gridHeight = visionResult.height || this.gridHeight;
      }

      const el = canvas || document.querySelector('canvas');
      if (el) {
        this.canvasWidth = el.width || window.innerWidth;
        this.canvasHeight = el.height || window.innerHeight;
        this.rect = el.getBoundingClientRect();
      } else {
        this.rect = {
          left: 0,
          top: 0,
          width: window.innerWidth,
          height: window.innerHeight
        };
      }
    }

    /** Screen-space playable rectangle (no menus / slider / buttons). */
    getSafeScreenRect() {
      const r = this.rect;
      const left = r.left + r.width * this.safeInset.left;
      const right = r.left + r.width * (1 - this.safeInset.right);
      const top = r.top + r.height * this.safeInset.top;
      const bottom = r.top + r.height * (1 - this.safeInset.bottom);
      return { left, right, top, bottom, width: right - left, height: bottom - top };
    }

    /** True if client coords are inside the safe map area. */
    isSafeScreenPoint(clientX, clientY) {
      const s = this.getSafeScreenRect();
      return clientX >= s.left && clientX <= s.right && clientY >= s.top && clientY <= s.bottom;
    }

    /** True if grid cell maps into safe screen zone. */
    isSafeGridCell(gx, gy) {
      const p = this.gridToScreen(gx, gy);
      return this.isSafeScreenPoint(p.x, p.y);
    }

    /** Clamp screen point into safe rect (for emergency retarget). */
    clampToSafeScreen(clientX, clientY) {
      const s = this.getSafeScreenRect();
      return {
        x: Math.round(Math.max(s.left + 2, Math.min(s.right - 2, clientX))),
        y: Math.round(Math.max(s.top + 2, Math.min(s.bottom - 2, clientY)))
      };
    }

    screenToGrid(clientX, clientY) {
      // Prefer CSS-rect mapping (matches drawn pixels on screen)
      const rw = Math.max(1, this.rect.width);
      const rh = Math.max(1, this.rect.height);
      const gw = Math.max(1, this.gridWidth);
      const gh = Math.max(1, this.gridHeight);

      const nx = (clientX - this.rect.left) / rw;
      const ny = (clientY - this.rect.top) / rh;

      return {
        x: Math.max(0, Math.min(gw - 1, Math.floor(nx * gw))),
        y: Math.max(0, Math.min(gh - 1, Math.floor(ny * gh)))
      };
    }

    gridToScreen(gx, gy) {
      const rw = Math.max(1, this.rect.width);
      const rh = Math.max(1, this.rect.height);
      const gw = Math.max(1, this.gridWidth);
      const gh = Math.max(1, this.gridHeight);

      return {
        x: Math.round(this.rect.left + ((gx + 0.5) / gw) * rw),
        y: Math.round(this.rect.top + ((gy + 0.5) / gh) * rh)
      };
    }

    clampGrid(gx, gy) {
      const gw = Math.max(1, this.gridWidth);
      const gh = Math.max(1, this.gridHeight);
      return {
        x: Math.max(0, Math.min(gw - 1, Math.floor(gx))),
        y: Math.max(0, Math.min(gh - 1, Math.floor(gy)))
      };
    }

    /**
     * Pick an adjacent non-mine cell to click toward (neutral/enemy),
     * falling back to the border cell itself.
     */
    resolveAttackCell(borderCell, typeMatrix, preferEnemy = false) {
      if (!borderCell || !typeMatrix) return borderCell;
      const w = this.gridWidth;
      const h = this.gridHeight;
      if (!w || !h) return borderCell;

      const bx = Math.floor(borderCell.x);
      const by = Math.floor(borderCell.y);
      const offsets = [
        [1, 0], [-1, 0], [0, 1], [0, -1],
        [1, 1], [1, -1], [-1, 1], [-1, -1]
      ];

      let bestNeutral = null;
      let bestEnemy = null;

      for (let i = 0; i < offsets.length; i++) {
        const nx = bx + offsets[i][0];
        const ny = by + offsets[i][1];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const t = typeMatrix[ny * w + nx];
        if (t === 2 && !bestNeutral) bestNeutral = { x: nx, y: ny, type: 'NEUTRAL' };
        if (t === 4 && !bestEnemy) bestEnemy = { x: nx, y: ny, type: 'ENEMY' };
      }

      if (preferEnemy && bestEnemy) return bestEnemy;
      if (bestNeutral) return bestNeutral;
      if (bestEnemy) return bestEnemy;
      return { x: bx, y: by, type: borderCell.type || 'NEUTRAL' };
    }
  }

  window.CoordSystem = CoordSystem;
  console.log('%c[TIO CoordSystem v6.0] Screen↔Grid conversion loaded.', 'color: #10b981;');
})();
