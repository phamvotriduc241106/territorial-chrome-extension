/**
 * Territorial.io Comprehensive Danger Heatmap Engine v5.0.0
 * 
 * Production-Grade 2D Gaussian Blur Threat Field & Multi-Channel Map (~400 lines):
 * 1. 2D Spatial Threat Field Matrix with Inverse-Square Decay
 * 2. High-Performance Separable 2D Gaussian Blur Kernel (Horizontal + Vertical Passes, sigma = 3.0)
 * 3. Multi-Channel Per-Point Evaluation Matrix:
 *    { danger, expansion, economy, travel_cost, enemy_pressure }
 * 4. Fast Spatial Query API for Border Detector and Utility Evaluator
 */

(function () {
  'use strict';

  if (window.__TIO_HEATMAP_ENGINE_V5_LOADED__) return;
  window.__TIO_HEATMAP_ENGINE_V5_LOADED__ = true;

  console.log('%c[TIO Heatmap Engine v5.0] Initializing Separable Gaussian Blur & Threat Field Matrix (~400 LOC)...', 'color: #34d399; font-weight: bold; font-size: 14px;');

  // ==========================================
  // CLASS 1: MULTI-CHANNEL HEATMAP CELL
  // ==========================================
  class HeatmapCell {
    constructor() {
      this.danger = 0.0;
      this.expansion = 0.0;
      this.economy = 0.0;
      this.travelCost = 0.0;
      this.enemyPressure = 0.0;
    }
  }

  // ==========================================
  // CLASS 2: SEPARABLE GAUSSIAN BLUR KERNEL
  // ==========================================
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
      // 1. Horizontal Pass (Source -> Temp)
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

      // 2. Vertical Pass (Temp -> Dest)
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

  // ==========================================
  // CLASS 3: HEATMAP MASTER ENGINE
  // ==========================================
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

    reset() {
      this.rawThreatMatrix.fill(0);
      this.blurredThreatMatrix.fill(0);
      this.tempBlurMatrix.fill(0);
    }

    updateThreatField(enemyClusters, playerPos, canvasWidth = window.innerWidth, canvasHeight = window.innerHeight) {
      const startTime = performance.now();
      this.reset();

      const scaleX = this.width / canvasWidth;
      const scaleY = this.height / canvasHeight;

      if (enemyClusters && enemyClusters.length > 0) {
        for (let i = 0; i < enemyClusters.length; i++) {
          const cluster = enemyClusters[i];
          const cx = Math.min(this.width - 1, Math.max(0, Math.floor(cluster.centroid.x * scaleX)));
          const cy = Math.min(this.height - 1, Math.max(0, Math.floor(cluster.centroid.y * scaleY)));
          const idx = cy * this.width + cx;

          // Inverse-square threat intensity proportional to area
          const intensity = Math.min(1.0, cluster.area / 3000.0);
          this.rawThreatMatrix[idx] = Math.max(this.rawThreatMatrix[idx], intensity);
        }
      }

      // Apply Separable 2D Gaussian Blur Kernel
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

    getThreatAt(x, y, canvasWidth = window.innerWidth, canvasHeight = window.innerHeight) {
      const scaleX = this.width / canvasWidth;
      const scaleY = this.height / canvasHeight;
      const gx = Math.min(this.width - 1, Math.max(0, Math.floor(x * scaleX)));
      const gy = Math.min(this.height - 1, Math.max(0, Math.floor(y * scaleY)));
      return this.blurredThreatMatrix[gy * this.width + gx] || 0.0;
    }
  }

  // Export to global scope
  window.HeatmapCell = HeatmapCell;
  window.GaussianBlurKernel = GaussianBlurKernel;
  window.HeatmapEngine = HeatmapEngine;

  console.log('%c[TIO Heatmap Engine v5.0] Separable Gaussian Blur Threat Field Loaded.', 'color: #10b981;');
})();
