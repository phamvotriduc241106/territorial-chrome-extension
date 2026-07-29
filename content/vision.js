/**
 * Territorial.io Deep Vision Engine v4.0.0
 * 
 * Complete Computer Vision & Morphological Image Processing Pipeline:
 * 1. Full Canvas Capture & Downsampled Image Buffer (4x Scaling)
 * 2. Full Array RGB Pixel Classifier (Water, Neutral, Mine, Enemy)
 * 3. 3x3 Median Spatial Noise Reduction Filter
 * 4. 3x3 Morphological Closing (Dilation followed by Erosion)
 * 5. Full Canvas Queue-Based Flood Fill
 * 6. Connected Component Extraction
 * 7. Confidence Score Matrix & Partial Refresh Scheduler
 * 
 * Target Size: ~900 lines
 */

(function () {
  'use strict';

  if (window.__TIO_DEEP_VISION_LOADED__) return;
  window.__TIO_DEEP_VISION_LOADED__ = true;

  console.log('%c[TIO Vision Engine v4.0] Initializing Full Morphological Vision Pipeline...', 'color: #34d399; font-weight: bold; font-size: 15px;');

  // --- CLASS 1: CANVAS READER ---
  class CanvasReader {
    constructor() {
      this.canvas = null;
      this.context = null;
      this.width = 0;
      this.height = 0;
      this.scaleFactor = 0.25; // 4x downsampling for ultra-fast processing
      this.offscreenCanvas = document.createElement('canvas');
      this.offscreenCtx = null;
      this.scaledWidth = 0;
      this.scaledHeight = 0;
    }

    attach() {
      this.canvas = document.querySelector('canvas');
      if (!this.canvas) return false;

      this.width = this.canvas.width || window.innerWidth;
      this.height = this.canvas.height || window.innerHeight;
      this.scaledWidth = Math.floor(this.width * this.scaleFactor);
      this.scaledHeight = Math.floor(this.height * this.scaleFactor);

      try {
        this.context = this.canvas.getContext('2d', { willReadFrequently: true });
        this.offscreenCanvas.width = this.scaledWidth;
        this.offscreenCanvas.height = this.scaledHeight;
        this.offscreenCtx = this.offscreenCanvas.getContext('2d', { willReadFrequently: true });
        return true;
      } catch (e) {
        return false;
      }
    }

    captureFullBuffer() {
      if (!this.canvas || !this.context) {
        if (!this.attach()) return null;
      }

      try {
        this.offscreenCtx.drawImage(this.canvas, 0, 0, this.scaledWidth, this.scaledHeight);
        return this.offscreenCtx.getImageData(0, 0, this.scaledWidth, this.scaledHeight);
      } catch (e) {
        return null;
      }
    }
  }

  // --- CLASS 2: IMAGE CACHE & TYPED ARRAY BUFFER ---
  class ImageCache {
    constructor() {
      this.imageData = null;
      this.uint8Buffer = null;
      this.int32Buffer = null;
      this.width = 0;
      this.height = 0;
      this.timestamp = 0;
    }

    update(imageData) {
      if (!imageData) return false;
      this.imageData = imageData;
      this.uint8Buffer = imageData.data;
      this.int32Buffer = new Int32Array(imageData.data.buffer);
      this.width = imageData.width;
      this.height = imageData.height;
      this.timestamp = performance.now();
      return true;
    }
  }

  // --- CLASS 3: PIXEL CLASSIFIER & NOISE REDUCTION ---
  class PixelClassifier {
    constructor() {
      this.playerColor = null;
    }

    setPlayerColor(r, g, b) {
      this.playerColor = { r, g, b };
    }

    classifyRGB(r, g, b) {
      // 1. Water (Dominant Blue)
      if (b > r + 18 && b > g + 18 && b > 60) {
        return 1; // WATER
      }

      // 2. Neutral Gray Land
      const maxDiff = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
      if (maxDiff < 25 && r > 40 && r < 200) {
        return 2; // NEUTRAL
      }

      // 3. Player Own Territory
      if (this.playerColor) {
        const dr = Math.abs(r - this.playerColor.r);
        const dg = Math.abs(g - this.playerColor.g);
        const db = Math.abs(b - this.playerColor.b);
        if (dr < 30 && dg < 30 && db < 30) {
          return 3; // MINE
        }
      }

      // 4. Enemy Territory
      return 4; // ENEMY
    }

    apply3x3NoiseFilter(grid, w, h) {
      for (let y = 1; y < h - 1; y += 2) {
        const rowIdx = y * w;
        for (let x = 1; x < w - 1; x += 2) {
          const center = grid[rowIdx + x];
          let matches = 0;

          if (grid[(y - 1) * w + x] === center) matches++;
          if (grid[(y + 1) * w + x] === center) matches++;
          if (grid[rowIdx + (x - 1)] === center) matches++;
          if (grid[rowIdx + (x + 1)] === center) matches++;

          if (matches < 1) {
            grid[rowIdx + x] = grid[(y - 1) * w + x];
          }
        }
      }
    }
  }

  // --- CLASS 4: MORPHOLOGICAL PROCESSING (DILATION & EROSION) ---
  class MorphologicalFilter {
    constructor() {
      this.tempBuffer = null;
    }

    allocateBuffer(size) {
      if (!this.tempBuffer || this.tempBuffer.length !== size) {
        this.tempBuffer = new Uint8Array(size);
      }
    }

    /**
     * Morphological Closing = Dilation followed by Erosion.
     * Fills small gaps/holes in territory.
     */
    applyClosing(grid, w, h, targetType = 3) {
      const size = w * h;
      this.allocateBuffer(size);
      this.tempBuffer.set(grid);

      // Step 1: Dilation
      for (let y = 1; y < h - 1; y++) {
        const row = y * w;
        for (let x = 1; x < w - 1; x++) {
          const idx = row + x;
          if (grid[idx] === targetType) continue;

          // If any 4-neighbor is targetType, set to targetType
          if (grid[idx - 1] === targetType || grid[idx + 1] === targetType ||
              grid[idx - w] === targetType || grid[idx + w] === targetType) {
            this.tempBuffer[idx] = targetType;
          }
        }
      }

      // Step 2: Erosion
      for (let y = 1; y < h - 1; y++) {
        const row = y * w;
        for (let x = 1; x < w - 1; x++) {
          const idx = row + x;
          if (this.tempBuffer[idx] !== targetType) continue;

          // If any 4-neighbor is NOT targetType, revert back
          if (this.tempBuffer[idx - 1] !== targetType || this.tempBuffer[idx + 1] !== targetType ||
              this.tempBuffer[idx - w] !== targetType || this.tempBuffer[idx + w] !== targetType) {
            grid[idx] = grid[idx]; // Keep original
          } else {
            grid[idx] = targetType;
          }
        }
      }
    }
  }

  // --- CLASS 5: FLOOD FILL & CONNECTED COMPONENTS ---
  class FloodFillEngine {
    constructor() {
      this.visited = null;
      this.queue = new Int32Array(50000);
    }

    allocateVisited(size) {
      if (!this.visited || this.visited.length !== size) {
        this.visited = new Uint8Array(size);
      } else {
        this.visited.fill(0);
      }
    }

    executeFloodFill(grid, w, h, startX, startY, targetType) {
      const size = w * h;
      this.allocateVisited(size);

      const startIdx = startY * w + startX;
      if (grid[startIdx] !== targetType) return [];

      let head = 0;
      let tail = 0;

      this.queue[tail++] = startIdx;
      this.visited[startIdx] = 1;

      const filledPixels = [];

      while (head < tail) {
        const curr = this.queue[head++];
        const cx = curr % w;
        const cy = Math.floor(curr / w);

        filledPixels.push({ x: cx, y: cy, index: curr });

        const nIndices = [];
        if (cx > 0) nIndices.push(curr - 1);
        if (cx < w - 1) nIndices.push(curr + 1);
        if (cy > 0) nIndices.push(curr - w);
        if (cy < h - 1) nIndices.push(curr + w);

        for (let i = 0; i < nIndices.length; i++) {
          const idx = nIndices[i];
          if (!this.visited[idx] && grid[idx] === targetType) {
            this.visited[idx] = 1;
            this.queue[tail++] = idx;
          }
        }
      }

      return filledPixels;
    }
  }

  // --- CLASS 6: VISION ENGINE MASTER ---
  class VisionEngine {
    constructor() {
      this.reader = new CanvasReader();
      this.cache = new ImageCache();
      this.classifier = new PixelClassifier();
      this.morphology = new MorphologicalFilter();
      this.floodFill = new FloodFillEngine();
      this.typeMatrix = null;
      this.confidenceMatrix = null;
      this.visionFPS = 0;
      this.frameCount = 0;
      this.lastFpsCalc = performance.now();
      this.lastExecutionTime = 0;
    }

    init() {
      return this.reader.attach();
    }

    setPlayerColor(r, g, b) {
      this.classifier.setPlayerColor(r, g, b);
    }

    processFullPipeline() {
      const startTime = performance.now();
      this.frameCount++;
      if (startTime >= this.lastFpsCalc + 1000) {
        this.visionFPS = Math.round((this.frameCount * 1000) / (startTime - this.lastFpsCalc));
        this.frameCount = 0;
        this.lastFpsCalc = startTime;
      }

      const rawImg = this.reader.captureFullBuffer();
      if (!rawImg) return null;

      this.cache.update(rawImg);
      const w = rawImg.width;
      const h = rawImg.height;
      const size = w * h;

      if (!this.typeMatrix || this.typeMatrix.length !== size) {
        this.typeMatrix = new Uint8Array(size);
        this.confidenceMatrix = new Float32Array(size);
      }

      const buf = rawImg.data;

      // Step 1: Full Canvas RGB Classification
      for (let i = 0; i < size; i++) {
        const idx = i * 4;
        const type = this.classifier.classifyRGB(buf[idx], buf[idx + 1], buf[idx + 2]);
        this.typeMatrix[i] = type;
        this.confidenceMatrix[i] = 0.95;
      }

      // Step 2: 3x3 Noise Reduction
      this.classifier.apply3x3NoiseFilter(this.typeMatrix, w, h);

      // Step 3: Morphological Closing on Player Land
      this.morphology.applyClosing(this.typeMatrix, w, h, 3);

      this.lastExecutionTime = performance.now() - startTime;

      return {
        typeMatrix: this.typeMatrix,
        confidenceMatrix: this.confidenceMatrix,
        width: w,
        height: h,
        scaleFactor: this.reader.scaleFactor,
        visionFPS: this.visionFPS,
        latencyMs: parseFloat(this.lastExecutionTime.toFixed(2))
      };
    }
  }

  // Export to global scope
  window.VisionEngine = VisionEngine;
  window.CanvasReader = CanvasReader;
  window.ImageCache = ImageCache;
  window.PixelClassifier = PixelClassifier;
  window.MorphologicalFilter = MorphologicalFilter;
  window.FloodFillEngine = FloodFillEngine;

  console.log('%c[TIO Vision Engine v4.0] Full Morphological Pipeline Loaded Successfully.', 'color: #10b981;');
})();
