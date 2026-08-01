/**
 * Territorial.io Danger Heatmap Engine v6.0.0
 *
 * Grid-native threat field (same coordinates as vision/grid).
 * No screen-size double scaling.
 */
(function () {
  'use strict';

  if (window.__TIO_HEATMAP_ENGINE_V5_LOADED__) return;
  window.__TIO_HEATMAP_ENGINE_V5_LOADED__ = true;

  console.log('%c[TIO Heatmap Engine v6.0] Grid-native threat field...', 'color: #34d399; font-weight: bold; font-size: 14px;');

  class GaussianBlurKernel {
    constructor(radius = 3, sigma = 2.0) {
      this.radius = radius;
      this.kernelSize = (2 * radius) + 1;
      this.weights = new Float32Array(this.kernelSize);
      this.computeKernel(sigma);
    }

    computeKernel(sigma) {
      let sum = 0.0;
      const sigmaSq = 2.0 * sigma * sigma;
      for (let i = -this.radius; i <= this.radius; i++) {
        const val = Math.exp(-(i * i) / sigmaSq);
        this.weights[i + this.radius] = val;
        sum += val;
      }
      for (let i = 0; i < this.kernelSize; i++) {
        this.weights[i] /= sum;
      }
    }

    applySeparableBlur(sourceMat, destMat, tempMat, w, h) {
      for (let y = 0; y < h; y++) {
        const row = y * w;
        for (let x = 0; x < w; x++) {
          let sumVal = 0.0;
          for (let k = -this.radius; k <= this.radius; k++) {
            const nx = Math.min(w - 1, Math.max(0, x + k));
            sumVal += sourceMat[row + nx] * this.weights[k + this.radius];
          }
          tempMat[row + x] = sumVal;
        }
      }

      for (let x = 0; x < w; x++) {
        for (let y = 0; y < h; y++) {
          let sumVal = 0.0;
          for (let k = -this.radius; k <= this.radius; k++) {
            const ny = Math.min(h - 1, Math.max(0, y + k));
            sumVal += tempMat[ny * w + x] * this.weights[k + this.radius];
          }
          destMat[y * w + x] = sumVal;
        }
      }
    }
  }

  class HeatmapEngine {
    constructor(width = 120, height = 120) {
      this.width = width;
      this.height = height;
      this.size = width * height;

      this.rawThreatMatrix = new Float32Array(this.size);
      this.blurredThreatMatrix = new Float32Array(this.size);
      this.tempBlurMatrix = new Float32Array(this.size);

      this.blurKernel = new GaussianBlurKernel(3, 2.5);
      this.lastExecutionTimeMs = 0;
    }

    ensureSize(w, h) {
      if (w === this.width && h === this.height && this.rawThreatMatrix) return;
      this.width = Math.max(1, w);
      this.height = Math.max(1, h);
      this.size = this.width * this.height;
      this.rawThreatMatrix = new Float32Array(this.size);
      this.blurredThreatMatrix = new Float32Array(this.size);
      this.tempBlurMatrix = new Float32Array(this.size);
    }

    reset() {
      this.rawThreatMatrix.fill(0);
      this.blurredThreatMatrix.fill(0);
      this.tempBlurMatrix.fill(0);
    }

    /**
     * @param {Array} enemyClusters - regions with centroid in GRID coordinates
     * @param {{x:number,y:number}} playerGridPos - player in GRID coordinates
     * @param {number} gridWidth
     * @param {number} gridHeight
     */
    updateThreatField(enemyClusters, playerGridPos, gridWidth, gridHeight) {
      const startTime = performance.now();
      const w = gridWidth || this.width;
      const h = gridHeight || this.height;
      this.ensureSize(w, h);
      this.reset();

      if (enemyClusters && enemyClusters.length > 0) {
        for (let i = 0; i < enemyClusters.length; i++) {
          const cluster = enemyClusters[i];
          const cx = Math.min(this.width - 1, Math.max(0, Math.floor(cluster.centroid.x)));
          const cy = Math.min(this.height - 1, Math.max(0, Math.floor(cluster.centroid.y)));
          const idx = cy * this.width + cx;

          const intensity = Math.min(1.0, cluster.area / 3000.0);
          this.rawThreatMatrix[idx] = Math.max(this.rawThreatMatrix[idx], intensity);

          // Local stamp so small maps still get spread before blur
          const stampR = 2;
          for (let dy = -stampR; dy <= stampR; dy++) {
            for (let dx = -stampR; dx <= stampR; dx++) {
              const nx = cx + dx;
              const ny = cy + dy;
              if (nx < 0 || ny < 0 || nx >= this.width || ny >= this.height) continue;
              const nIdx = ny * this.width + nx;
              const falloff = 1.0 - (Math.hypot(dx, dy) / (stampR + 1));
              this.rawThreatMatrix[nIdx] = Math.max(
                this.rawThreatMatrix[nIdx],
                intensity * Math.max(0, falloff)
              );
            }
          }
        }
      }

      this.blurKernel.applySeparableBlur(
        this.rawThreatMatrix,
        this.blurredThreatMatrix,
        this.tempBlurMatrix,
        this.width,
        this.height
      );

      this.lastExecutionTimeMs = parseFloat((performance.now() - startTime).toFixed(2));
      return {
        width: this.width,
        height: this.height,
        latencyMs: this.lastExecutionTimeMs
      };
    }

    /**
     * Query threat at GRID coordinates (same space as border/region cells).
     */
    getThreatAt(gx, gy) {
      if (!this.blurredThreatMatrix || this.width <= 0) return 0.0;
      const x = Math.min(this.width - 1, Math.max(0, Math.floor(gx)));
      const y = Math.min(this.height - 1, Math.max(0, Math.floor(gy)));
      return this.blurredThreatMatrix[y * this.width + x] || 0.0;
    }
  }

  window.HeatmapCell = function HeatmapCell() {
    this.danger = 0.0;
    this.expansion = 0.0;
    this.economy = 0.0;
    this.travelCost = 0.0;
    this.enemyPressure = 0.0;
  };
  window.GaussianBlurKernel = GaussianBlurKernel;
  window.HeatmapEngine = HeatmapEngine;

  console.log('%c[TIO Heatmap Engine v6.0] Grid-native threat field loaded.', 'color: #10b981;');
})();
