/**
 * Territorial.io Uncaptured-Land Awareness Engine v7.1.0
 *
 * Tracks free/neutral land so the bot expands well from opening through mid-game.
 *
 * Metrics (grid space):
 *  - totalNeutralPx, freeLandRatio
 *  - reachableNeutral: neutral cells adjacent to MINE (immediately claimable)
 *  - openPockets: connected neutral regions ranked by area / distance
 *  - sectorFill: free-land mass in 8 angular sectors around empire center
 *  - phase: OPENING | LAND_RUSH | CONTESTED | LATE
 *
 * Attack candidates are NEUTRAL cells next to MINE (where clicks should land),
 * not only own-border pixels.
 */
(function () {
  'use strict';

  if (window.__TIO_NEUTRAL_LAND_V7_LOADED__) return;
  window.__TIO_NEUTRAL_LAND_V7_LOADED__ = true;

  const TYPE = { WATER: 1, NEUTRAL: 2, MINE: 3, ENEMY: 4 };

  class NeutralLandEngine {
    constructor() {
      this.totalNeutral = 0;
      this.totalMine = 0;
      this.totalEnemy = 0;
      this.totalWater = 0;
      this.freeLandRatio = 0;
      this.reachableNeutral = []; // {x,y, pocketId, score, sector}
      this.pockets = []; // {id, area, centroid, minDistToMine, score}
      this.sectorFill = new Float32Array(8);
      this.phase = 'OPENING';
      this.bestSectors = [];
      this.lastExecutionTimeMs = 0;
      this.snapshot = null;
    }

    /**
     * Full analysis of uncaptured land.
     * @param {Uint8Array} typeMatrix
     * @param {number} w
     * @param {number} h
     * @param {{x:number,y:number}} myCentroid
     * @param {number} gameTimeSec
     */
    analyze(typeMatrix, w, h, myCentroid, gameTimeSec) {
      const t0 = performance.now();
      this.reachableNeutral = [];
      this.pockets = [];
      this.sectorFill.fill(0);

      if (!typeMatrix || !w || !h) {
        this.snapshot = this._emptySnapshot();
        return this.snapshot;
      }

      let nN = 0, nM = 0, nE = 0, nW = 0;
      const size = w * h;
      // Sampled full counts (fast) + exact for small maps
      const step = size > 200000 ? 2 : 1;
      for (let i = 0; i < size; i += step) {
        const t = typeMatrix[i];
        if (t === TYPE.NEUTRAL) nN++;
        else if (t === TYPE.MINE) nM++;
        else if (t === TYPE.ENEMY) nE++;
        else if (t === TYPE.WATER) nW++;
      }
      if (step > 1) {
        nN *= step; nM *= step; nE *= step; nW *= step;
      }

      this.totalNeutral = nN;
      this.totalMine = nM;
      this.totalEnemy = nE;
      this.totalWater = nW;
      const landish = Math.max(1, nN + nM + nE);
      this.freeLandRatio = nN / landish;

      const cx = (myCentroid && myCentroid.x) || (w / 2);
      const cy = (myCentroid && myCentroid.y) || (h / 2);

      // 1) Reachable uncaptured: NEUTRAL adjacent (4-conn) to MINE
      //    These are the real click targets for expansion.
      const reach = [];
      const seen = new Uint8Array(size);
      const scanStep = Math.max(1, Math.floor(Math.min(w, h) / 120));

      for (let y = 1; y < h - 1; y += scanStep) {
        for (let x = 1; x < w - 1; x += scanStep) {
          const idx = y * w + x;
          if (typeMatrix[idx] !== TYPE.NEUTRAL) continue;

          let touchesMine = false;
          let enemyNear = false;
          const nbs = [idx - 1, idx + 1, idx - w, idx + w];
          for (let k = 0; k < 4; k++) {
            const nt = typeMatrix[nbs[k]];
            if (nt === TYPE.MINE) touchesMine = true;
            if (nt === TYPE.ENEMY) enemyNear = true;
          }
          if (!touchesMine) continue;
          if (seen[idx]) continue;
          seen[idx] = 1;

          // Local pocket density: how much neutral is around this cell
          let pocketLocal = 0;
          for (let dy = -3; dy <= 3; dy++) {
            for (let dx = -3; dx <= 3; dx++) {
              const nx = x + dx, ny = y + dy;
              if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
              if (typeMatrix[ny * w + nx] === TYPE.NEUTRAL) pocketLocal++;
            }
          }

          const dx = x - cx;
          const dy = y - cy;
          const dist = Math.hypot(dx, dy);
          const ang = Math.atan2(dy, dx);
          const sector = ((Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 8)) % 8 + 8) % 8;
          this.sectorFill[sector] += 1 + pocketLocal * 0.05;

          // Score: prefer fat pockets near empire, avoid contested enemy edges early
          let score = pocketLocal * 2.5 + Math.max(0, 40 - dist * 0.15);
          if (enemyNear) score *= 0.45; // free land first
          // Prefer cells slightly farther into neutral (deeper claim)
          score += this._depthIntoNeutral(typeMatrix, w, h, x, y) * 3;

          reach.push({
            x, y,
            type: 'NEUTRAL',
            touchesNeutral: true,
            touchesEnemy: enemyNear,
            touchesMine: true,
            pocketLocal,
            dist,
            sector,
            score: parseFloat(score.toFixed(2))
          });
        }
      }

      // Sort and keep top candidates
      reach.sort((a, b) => b.score - a.score);
      this.reachableNeutral = reach.slice(0, 120);

      // 2) Lightweight pocket clustering via sector aggregation + top cells
      this.pockets = this._buildPockets(reach, cx, cy);

      // 3) Phase from free-land share + time
      this.phase = this._phaseFor(this.freeLandRatio, gameTimeSec || 0, nM, nE);

      // Best sectors for multi-front expand
      const sectors = [];
      for (let s = 0; s < 8; s++) sectors.push({ s, v: this.sectorFill[s] });
      sectors.sort((a, b) => b.v - a.v);
      this.bestSectors = sectors.filter((x) => x.v > 0).slice(0, 4).map((x) => x.s);

      this.lastExecutionTimeMs = parseFloat((performance.now() - t0).toFixed(2));
      this.snapshot = {
        totalNeutral: this.totalNeutral,
        totalMine: this.totalMine,
        totalEnemy: this.totalEnemy,
        freeLandRatio: parseFloat(this.freeLandRatio.toFixed(4)),
        reachableCount: this.reachableNeutral.length,
        pocketCount: this.pockets.length,
        largestPocket: this.pockets[0] ? this.pockets[0].area : 0,
        phase: this.phase,
        bestSectors: this.bestSectors.slice(),
        topTargets: this.reachableNeutral.slice(0, 16),
        sectorFill: Array.from(this.sectorFill),
        latencyMs: this.lastExecutionTimeMs
      };
      return this.snapshot;
    }

    _depthIntoNeutral(typeMatrix, w, h, x, y) {
      // How many steps you can walk into pure neutral away from mine
      let depth = 0;
      // Sample 4 directions away from nearest mine approximation: just count radial neutrals
      for (let d = 1; d <= 4; d++) {
        let any = false;
        const pts = [[x + d, y], [x - d, y], [x, y + d], [x, y - d]];
        for (let i = 0; i < 4; i++) {
          const nx = pts[i][0], ny = pts[i][1];
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          if (typeMatrix[ny * w + nx] === TYPE.NEUTRAL) any = true;
        }
        if (!any) break;
        depth++;
      }
      return depth;
    }

    _buildPockets(reach, cx, cy) {
      if (!reach.length) return [];
      // Grid-hash cluster of top reach cells
      const cell = 12;
      const map = new Map();
      for (let i = 0; i < Math.min(reach.length, 80); i++) {
        const r = reach[i];
        const key = `${Math.floor(r.x / cell)}_${Math.floor(r.y / cell)}`;
        let p = map.get(key);
        if (!p) {
          p = { id: key, area: 0, sumX: 0, sumY: 0, sumScore: 0, minDist: Infinity };
          map.set(key, p);
        }
        p.area += 1 + (r.pocketLocal || 0) * 0.1;
        p.sumX += r.x;
        p.sumY += r.y;
        p.sumScore += r.score;
        if (r.dist < p.minDist) p.minDist = r.dist;
      }
      const list = Array.from(map.values()).map((p) => {
        const centroid = {
          x: Math.round(p.sumX / Math.max(1, p.area)),
          y: Math.round(p.sumY / Math.max(1, p.area))
        };
        // Prefer large, nearby, high-score pockets
        const score = p.sumScore + p.area * 3 - p.minDist * 0.2;
        return {
          id: p.id,
          area: parseFloat(p.area.toFixed(1)),
          centroid,
          minDistToMine: parseFloat(p.minDist.toFixed(1)),
          score: parseFloat(score.toFixed(2))
        };
      });
      list.sort((a, b) => b.score - a.score);
      return list.slice(0, 12);
    }

    _phaseFor(freeRatio, gameTimeSec, minePx, enemyPx) {
      // Opening: lots of free land, early time
      if (gameTimeSec < 25 && freeRatio > 0.12) return 'OPENING';
      if (freeRatio > 0.08) return 'LAND_RUSH';
      if (freeRatio > 0.03) return 'CONTESTED';
      return 'LATE';
    }

    _emptySnapshot() {
      return {
        totalNeutral: 0,
        totalMine: 0,
        totalEnemy: 0,
        freeLandRatio: 0,
        reachableCount: 0,
        pocketCount: 0,
        largestPocket: 0,
        phase: 'OPENING',
        bestSectors: [],
        topTargets: [],
        sectorFill: [0, 0, 0, 0, 0, 0, 0, 0],
        latencyMs: 0
      };
    }

    /**
     * Multi-front targets: best reachable neutral in distinct sectors.
     */
    getMultiSectorTargets(count) {
      count = count || 3;
      const selected = [];
      const usedSectors = new Set();
      const list = this.reachableNeutral;

      // First pass: one per best sector
      for (let i = 0; i < this.bestSectors.length && selected.length < count; i++) {
        const sec = this.bestSectors[i];
        for (let j = 0; j < list.length; j++) {
          if (list[j].sector === sec && !usedSectors.has(sec)) {
            selected.push(list[j]);
            usedSectors.add(sec);
            break;
          }
        }
      }
      // Fill with top scores not too close
      for (let j = 0; j < list.length && selected.length < count; j++) {
        const c = list[j];
        let close = false;
        for (let k = 0; k < selected.length; k++) {
          const dx = c.x - selected[k].x;
          const dy = c.y - selected[k].y;
          if (dx * dx + dy * dy < 400) { close = true; break; }
        }
        if (!close) selected.push(c);
      }
      return selected;
    }

    /**
     * Policy for this free-land phase.
     */
    getPhasePolicy() {
      // Aligned with dump Very Hard: fast multi-front expand, punchy ratios
      switch (this.phase) {
        case 'OPENING':
          return {
            preferNeutral: true,
            wantEnemy: false,
            multiFront: 6,
            pulseMs: 70,
            ratio: 0.42,
            label: 'VH OPEN dF'
          };
        case 'LAND_RUSH':
          return {
            preferNeutral: true,
            wantEnemy: false,
            multiFront: 6,
            pulseMs: 80,
            ratio: 0.38,
            label: 'VH RUSH dF'
          };
        case 'CONTESTED':
          return {
            preferNeutral: this.freeLandRatio > 0.03,
            wantEnemy: this.freeLandRatio < 0.035,
            multiFront: 5,
            pulseMs: 85,
            ratio: 0.35,
            label: 'VH CONTEST'
          };
        case 'LATE':
        default:
          return {
            preferNeutral: this.freeLandRatio > 0.02,
            wantEnemy: true,
            multiFront: 5,
            pulseMs: 90,
            ratio: 0.40,
            label: 'VH dJ pressure'
          };
      }
    }
  }

  window.NeutralLandEngine = NeutralLandEngine;
  console.log('%c[TIO NeutralLand v7.1] Uncaptured-land awareness loaded.', 'color: #10b981;');
})();
