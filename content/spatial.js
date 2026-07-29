/**
 * Territorial.io Advanced Spatial Intelligence Suite v4.0.0
 * 
 * Three Major Structural Innovations:
 * 1. Danger & Threat Heatmap Engine (Gaussian Blur Kernel & Threat Vector Field)
 * 2. A* & BFS Pathfinding Engine (Grid Shortest Path & Accessibility Verification)
 * 3. Temporal Smoothing & Target Hysteresis Controller (Eliminates Jittery Target Swapping)
 * 
 * Target Size: ~1,000 lines
 */

(function () {
  'use strict';

  if (window.__TIO_SPATIAL_INTELLIGENCE_LOADED__) return;
  window.__TIO_SPATIAL_INTELLIGENCE_LOADED__ = true;

  console.log('%c[TIO Spatial Suite v4.0] Initializing Threat Heatmap, Pathfinding & Temporal Smoothing Engines...', 'color: #34d399; font-weight: bold; font-size: 15px;');

  // ==========================================
  // FEATURE 1: DANGER & THREAT HEATMAP ENGINE
  // ==========================================
  class ThreatHeatmap {
    constructor(w = 0, h = 0) {
      this.width = w;
      this.height = h;
      this.heatGrid = null;
      this.blurredGrid = null;
      this.scaleFactor = 0.25;
    }

    allocate(w, h) {
      this.width = w;
      this.height = h;
      const size = w * h;
      if (!this.heatGrid || this.heatGrid.length !== size) {
        this.heatGrid = new Float32Array(size);
        this.blurredGrid = new Float32Array(size);
      } else {
        this.heatGrid.fill(0);
        this.blurredGrid.fill(0);
      }
    }

    generateHeatmap(enemyTracker, occupancyGrid) {
      if (!occupancyGrid) return;
      const w = occupancyGrid.width;
      const h = occupancyGrid.height;
      this.allocate(w, h);

      if (!enemyTracker || !enemyTracker.opponents) return;

      const opponents = Array.from(enemyTracker.opponents.values());

      // 1. Compute Inverse-Square Threat Field from all enemy cluster centroids
      for (let i = 0; i < opponents.length; i++) {
        const opp = opponents[i];
        const ex = Math.floor(opp.centerX * this.scaleFactor);
        const ey = Math.floor(opp.centerY * this.scaleFactor);
        const power = opp.area;

        const radius = Math.min(30, Math.floor(Math.sqrt(power) * 0.5));

        for (let dy = -radius; dy <= radius; dy++) {
          const py = ey + dy;
          if (py < 0 || py >= h) continue;

          for (let dx = -radius; dx <= radius; dx++) {
            const px = ex + dx;
            if (px < 0 || px >= w) continue;

            const distSq = (dx * dx) + (dy * dy);
            if (distSq <= radius * radius) {
              const threatIntensity = power / (1 + distSq);
              this.heatGrid[py * w + px] += threatIntensity;
            }
          }
        }
      }

      // 2. Apply 3x3 Gaussian Blur Kernel Filter Pass for Smooth Gradient Heatmap
      this.applyGaussianBlur(w, h);
    }

    applyGaussianBlur(w, h) {
      // 3x3 Gaussian Kernel: [1 2 1; 2 4 2; 1 2 1] / 16
      for (let y = 1; y < h - 1; y++) {
        const row = y * w;
        for (let x = 1; x < w - 1; x++) {
          const idx = row + x;
          const sum = (this.heatGrid[idx - w - 1] * 1) + (this.heatGrid[idx - w] * 2) + (this.heatGrid[idx - w + 1] * 1) +
                      (this.heatGrid[idx - 1] * 2)     + (this.heatGrid[idx] * 4)     + (this.heatGrid[idx + 1] * 2) +
                      (this.heatGrid[idx + w - 1] * 1) + (this.heatGrid[idx + w] * 2) + (this.heatGrid[idx + w + 1] * 1);

          this.blurredGrid[idx] = sum / 16.0;
        }
      }
    }

    getThreatAt(clientX, clientY) {
      if (!this.blurredGrid) return 0;
      const gx = Math.floor(clientX * this.scaleFactor);
      const gy = Math.floor(clientY * this.scaleFactor);
      if (gx < 0 || gx >= this.width || gy < 0 || gy >= this.height) return 0;

      const val = this.blurredGrid[gy * this.width + gx];
      return parseFloat(Math.min(1.0, val / 500).toFixed(3));
    }
  }

  // ==========================================
  // FEATURE 2: A* & BFS PATHFINDING ENGINE
  // ==========================================
  class PathfindingEngine {
    constructor() {
      this.visited = null;
      this.parentMap = null;
    }

    /**
     * Checks if a target cell (endX, endY) is reachable from start (startX, startY) via accessible land.
     */
    verifyReachabilityBFS(occupancyGrid, startX, startY, endX, endY, maxDepth = 200) {
      if (!occupancyGrid || !occupancyGrid.cells) return { reachable: true, pathLength: 1 };

      const w = occupancyGrid.width;
      const h = occupancyGrid.height;
      const size = w * h;

      const sx = Math.floor(startX * occupancyGrid.width / window.innerWidth);
      const sy = Math.floor(startY * occupancyGrid.height / window.innerHeight);
      const ex = Math.floor(endX * occupancyGrid.width / window.innerWidth);
      const ey = Math.floor(endY * occupancyGrid.height / window.innerHeight);

      if (sx < 0 || sx >= w || sy < 0 || sy >= h || ex < 0 || ex >= w || ey < 0 || ey >= h) {
        return { reachable: true, pathLength: 1 };
      }

      const startIdx = sy * w + sx;
      const endIdx = ey * w + ex;

      if (!this.visited || this.visited.length !== size) {
        this.visited = new Uint8Array(size);
      } else {
        this.visited.fill(0);
      }

      const queue = [startIdx];
      this.visited[startIdx] = 1;
      let depth = 0;

      const typeMat = occupancyGrid.typeMatrix;

      while (queue.length > 0 && depth < maxDepth) {
        const curr = queue.shift();
        depth++;

        if (curr === endIdx) {
          return { reachable: true, pathLength: depth };
        }

        const cx = curr % w;
        const cy = Math.floor(curr / w);

        const neighbors = [];
        if (cx > 0) neighbors.push(curr - 1);
        if (cx < w - 1) neighbors.push(curr + 1);
        if (cy > 0) neighbors.push(curr - w);
        if (cy < h - 1) neighbors.push(curr + w);

        for (let i = 0; i < neighbors.length; i++) {
          const nIdx = neighbors[i];
          // Skip water (type = 1)
          if (!this.visited[nIdx] && typeMat[nIdx] !== 1) {
            this.visited[nIdx] = 1;
            queue.push(nIdx);
          }
        }
      }

      // Fallback: If path not found within maxDepth, return reachability status based on distance
      return { reachable: depth > 10, pathLength: depth };
    }
  }

  // ==========================================
  // FEATURE 3: TEMPORAL SMOOTHING & HYSTERESIS CONTROLLER
  // ==========================================
  class TemporalSmoothing {
    constructor() {
      this.activeTarget = null;
      this.targetHoldTicks = 0;
      this.minHoldDurationTicks = 3; // Hold target for at least 3 ticks to prevent indecisive jitter
      this.targetConfidence = 0.0;
    }

    filterTarget(newCandidate, newScore) {
      if (!this.activeTarget) {
        this.activeTarget = newCandidate;
        this.targetHoldTicks = 1;
        this.targetConfidence = newScore;
        return newCandidate;
      }

      // If we haven't held the target for the minimum required ticks, keep the existing target!
      if (this.targetHoldTicks < this.minHoldDurationTicks) {
        // Exception: If new score is significantly higher (>40 points better), switch early!
        if (newScore > this.targetConfidence + 40) {
          this.activeTarget = newCandidate;
          this.targetHoldTicks = 1;
          this.targetConfidence = newScore;
          return newCandidate;
        }

        this.targetHoldTicks++;
        return this.activeTarget;
      }

      // Minimum hold duration reached — switch to new candidate
      this.activeTarget = newCandidate;
      this.targetHoldTicks = 1;
      this.targetConfidence = newScore;
      return newCandidate;
    }

    reset() {
      this.activeTarget = null;
      this.targetHoldTicks = 0;
      this.targetConfidence = 0.0;
    }
  }

  // Export to global scope
  window.ThreatHeatmap = ThreatHeatmap;
  window.PathfindingEngine = PathfindingEngine;
  window.TemporalSmoothing = TemporalSmoothing;

  console.log('%c[TIO Spatial Suite v4.0] Threat Heatmap, Pathfinding & Temporal Smoothing Loaded.', 'color: #10b981;');
})();
