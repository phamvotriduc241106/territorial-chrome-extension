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
     * Territorial chrome that must NEVER receive bot clicks:
     *  - Bottom-left logo (fW): opens Quit/Surrender menu; 2nd hit = Quit → username
     *  - Bottom troop bar row (eA.f2)
     *  - Top menu strip
     */
    isUiChromePoint(clientX, clientY) {
      const canvas = document.querySelector('canvas');
      if (!canvas) return true;
      const r = canvas.getBoundingClientRect();
      if (r.width < 40 || r.height < 40) return true;
      const nx = (clientX - r.left) / r.width;
      const ny = (clientY - r.top) / r.height;
      if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return true;
      // Top chrome
      if (ny < 0.06) return true;
      // Full bottom bar row (troop slider + logo + +/-)
      if (ny > 0.90) return true;
      // Bottom-left logo / Quit menu stack (wider than logo alone once open)
      if (nx < 0.16 && ny > 0.78) return true;
      // Bottom-right corner UI if present
      if (nx > 0.90 && ny > 0.82) return true;
      return false;
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
      if (this.isUiChromePoint(clientX, clientY)) return false;
      // Prefer live canvas rect (territory often sits low on the map)
      const canvas = document.querySelector('canvas');
      if (canvas) {
        const r = canvas.getBoundingClientRect();
        // Keep off true UI chrome — especially bottom-left Quit logo
        const left = r.left + r.width * 0.04;
        const right = r.left + r.width * 0.97;
        const top = r.top + r.height * 0.07;
        const bottom = r.top + r.height * 0.88;
        return clientX >= left && clientX <= right && clientY >= top && clientY <= bottom;
      }
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
     * Pick a cell to CLICK that is ON enemy/neutral AND 4-adjacent to MINE.
     * Non-perimeter foreign land is uncapturable — always rejected.
     */
    resolveAttackCell(borderCell, typeMatrix, preferEnemy = false) {
      if (!borderCell || !typeMatrix) return null;
      const w = this.gridWidth;
      const h = this.gridHeight;
      if (!w || !h) return null;

      const accept = (tx, ty, typeHint) => {
        tx = tx | 0;
        ty = ty | 0;
        if (tx < 0 || ty < 0 || tx >= w || ty >= h) return null;
        const tt = typeMatrix[ty * w + tx];
        if (tt !== 2 && tt !== 4) return null;
        if (!this._touchesMine(typeMatrix, w, h, tx, ty)) return null;
        return { x: tx, y: ty, type: typeHint || (tt === 4 ? 'ENEMY' : 'NEUTRAL') };
      };

      // Explicit aim fields from border detector (must still be edge-adjacent)
      if (preferEnemy && borderCell.enemyTargetX != null) {
        const hit = accept(borderCell.enemyTargetX, borderCell.enemyTargetY, 'ENEMY');
        if (hit) return hit;
      }
      if (!preferEnemy && borderCell.neutralTargetX != null) {
        const hit = accept(borderCell.neutralTargetX, borderCell.neutralTargetY, 'NEUTRAL');
        if (hit) return hit;
      }
      if (borderCell.targetX != null && borderCell.targetY != null) {
        const hit = accept(borderCell.targetX, borderCell.targetY);
        if (hit) return hit;
      }

      // Seed may already be the foreign perimeter cell
      const sx = Math.floor(borderCell.x);
      const sy = Math.floor(borderCell.y);
      {
        const hit = accept(sx, sy);
        if (hit) return hit;
      }

      // Search 4-neighbors of seed only (edge-touch border)
      const offsets = [
        [1, 0], [-1, 0], [0, 1], [0, -1]
      ];

      let bestNeutral = null;
      let bestEnemy = null;

      for (let i = 0; i < offsets.length; i++) {
        const hit = accept(sx + offsets[i][0], sy + offsets[i][1]);
        if (!hit) continue;
        if (hit.type === 'NEUTRAL' && !bestNeutral) bestNeutral = hit;
        if (hit.type === 'ENEMY' && !bestEnemy) bestEnemy = hit;
      }

      if (preferEnemy && bestEnemy) return bestEnemy;
      if (bestNeutral) return bestNeutral;
      if (bestEnemy) return bestEnemy;
      return null; // never click non-adjacent or own cell
    }

    _touchesMine(typeMatrix, w, h, x, y) {
      const nbs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (let k = 0; k < 4; k++) {
        const nx = x + nbs[k][0];
        const ny = y + nbs[k][1];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (typeMatrix[ny * w + nx] === 3) return true;
      }
      return false;
    }

    /**
     * Screen point for a foreign grid cell, biased slightly INTO the cell
     * (away from our border) so the pointer is clearly on enemy/neutral land.
     * fromMine: optional {x,y} of adjacent mine cell for inward bias.
     */
    foreignCellToScreen(cell, typeMatrix, fromMine) {
      if (!cell) return null;
      let gx = cell.x + 0.5;
      let gy = cell.y + 0.5;

      // Step ~0.25 cell deeper into foreign land (away from mine)
      if (fromMine) {
        const dx = cell.x - fromMine.x;
        const dy = cell.y - fromMine.y;
        const len = Math.hypot(dx, dy) || 1;
        gx += (dx / len) * 0.28;
        gy += (dy / len) * 0.28;
      } else if (typeMatrix && this.gridWidth && this.gridHeight) {
        // Nudge away from any neighboring mine
        const nbs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        let mx = 0;
        let my = 0;
        let n = 0;
        for (let k = 0; k < 4; k++) {
          const nx = (cell.x | 0) + nbs[k][0];
          const ny = (cell.y | 0) + nbs[k][1];
          if (nx < 0 || ny < 0 || nx >= this.gridWidth || ny >= this.gridHeight) continue;
          if (typeMatrix[ny * this.gridWidth + nx] === 3) {
            mx += nbs[k][0];
            my += nbs[k][1];
            n++;
          }
        }
        if (n > 0) {
          // Away from mine = opposite of mine direction
          gx -= (mx / n) * 0.28;
          gy -= (my / n) * 0.28;
        }
      }

      return this.gridToScreen(gx - 0.5, gy - 0.5);
    }

    /** Verify screen point maps back to enemy(4) or neutral(2). */
    screenHitsForeign(clientX, clientY, typeMatrix, preferEnemy) {
      if (!typeMatrix) return false;
      const g = this.screenToGrid(clientX, clientY);
      const t = typeMatrix[g.y * this.gridWidth + g.x];
      if (preferEnemy) return t === 4;
      return t === 2 || t === 4;
    }
  }

  window.CoordSystem = CoordSystem;
  console.log('%c[TIO CoordSystem v6.0] Screen↔Grid conversion loaded.', 'color: #10b981;');
})();
