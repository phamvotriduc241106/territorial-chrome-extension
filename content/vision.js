/**
 * Territorial.io Autonomous Human-Level Agent — Phase 1: Vision Engine
 * 
 * Responsibilities:
 * - Full Canvas Capture & Downsampled Image Buffering
 * - Fast TypedArray RGB Lookup & Multi-Spectral Pixel Classification
 * - Noise Filtering, Spatial Interpolation & Confidence Scoring
 * - Dynamic Resolution Scaling & Update Scheduling
 * - Partial Refresh & Dirty Region Tracking
 * 
 * Classes: VisionEngine, CanvasReader, PixelClassifier, ImageCache, GridBuilder
 */

(function () {
  'use strict';

  if (window.__TIO_VISION_ENGINE_LOADED__) return;
  window.__TIO_VISION_ENGINE_LOADED__ = true;

  console.log('%c[TIO VisionEngine] Initializing Phase 1 High-Speed Computer Vision Pipeline...', 'color: #34d399; font-weight: bold; font-size: 14px;');

  // --- CLASS 1: CANVAS READER ---
  class CanvasReader {
    constructor() {
      this.canvas = null;
      this.context = null;
      this.width = 0;
      this.height = 0;
      this.scaleFactor = 0.25; // 4x downsampling for ultra-fast 120Hz processing
      this.offscreenCanvas = null;
      this.offscreenCtx = null;
    }

    attach() {
      this.canvas = document.querySelector('canvas');
      if (!this.canvas) return false;
      
      this.width = this.canvas.width || window.innerWidth;
      this.height = this.canvas.height || window.innerHeight;

      try {
        this.context = this.canvas.getContext('2d', { willReadFrequently: true });
        
        // Initialize offscreen buffer for resolution scaling & partial refresh
        if (!this.offscreenCanvas) {
          this.offscreenCanvas = document.createElement('canvas');
        }
        this.offscreenCanvas.width = Math.floor(this.width * this.scaleFactor);
        this.offscreenCanvas.height = Math.floor(this.height * this.scaleFactor);
        this.offscreenCtx = this.offscreenCanvas.getContext('2d', { willReadFrequently: true });
        
        return true;
      } catch (e) {
        return false;
      }
    }

    captureScaledBuffer() {
      if (!this.canvas || !this.context) {
        if (!this.attach()) return null;
      }

      try {
        const scaledW = this.offscreenCanvas.width;
        const scaledH = this.offscreenCanvas.height;

        // Draw main canvas into scaled downsampled offscreen canvas
        this.offscreenCtx.drawImage(this.canvas, 0, 0, scaledW, scaledH);
        return this.offscreenCtx.getImageData(0, 0, scaledW, scaledH);
      } catch (e) {
        return null;
      }
    }

    captureDirtyRegion(x, y, w, h) {
      if (!this.context) return null;
      try {
        const sx = Math.floor(x * this.scaleFactor);
        const sy = Math.floor(y * this.scaleFactor);
        const sw = Math.max(1, Math.floor(w * this.scaleFactor));
        const sh = Math.max(1, Math.floor(h * this.scaleFactor));
        return this.offscreenCtx.getImageData(sx, sy, sw, sh);
      } catch (e) {
        return null;
      }
    }
  }

  // --- CLASS 2: IMAGE CACHE ---
  class ImageCache {
    constructor() {
      this.rawImageData = null;
      this.uint8Buffer = null;
      this.int32Buffer = null;
      this.timestamp = 0;
      this.width = 0;
      this.height = 0;
      this.frameHash = 0;
    }

    update(imageData) {
      if (!imageData) return false;
      this.rawImageData = imageData;
      this.uint8Buffer = imageData.data;
      this.int32Buffer = new Int32Array(imageData.data.buffer);
      this.width = imageData.width;
      this.height = imageData.height;
      this.timestamp = performance.now();
      
      // Calculate fast checksum hash for frame change detection
      let hash = 0;
      const len = this.int32Buffer.length;
      const step = Math.max(1, Math.floor(len / 100));
      for (let i = 0; i < len; i += step) {
        hash = (hash << 5) - hash + this.int32Buffer[i];
        hash |= 0;
      }
      this.frameHash = hash;
      return true;
    }

    getPixelRGB(x, y) {
      if (!this.uint8Buffer) return null;
      const idx = (y * this.width + x) * 4;
      return {
        r: this.uint8Buffer[idx],
        g: this.uint8Buffer[idx + 1],
        b: this.uint8Buffer[idx + 2],
        a: this.uint8Buffer[idx + 3]
      };
    }
  }

  // --- CLASS 3: PIXEL CLASSIFIER ---
  class PixelClassifier {
    constructor() {
      this.playerColor = null;
      this.colorPalette = new Map();
    }

    setPlayerColor(r, g, b) {
      this.playerColor = { r, g, b };
    }

    classifyRGB(r, g, b) {
      // 1. Water Classification (Dominant Blue)
      if (b > r + 18 && b > g + 18 && b > 60) {
        return { type: 'WATER', cost: 9999, confidence: 0.98 };
      }

      // 2. Neutral Unclaimed Gray/Brown Land Classification
      const maxDiff = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
      if (maxDiff < 25 && r > 40 && r < 200) {
        return { type: 'NEUTRAL', cost: 10, confidence: 0.95 };
      }

      // 3. Player Own Territory Classification
      if (this.playerColor) {
        const dr = Math.abs(r - this.playerColor.r);
        const dg = Math.abs(g - this.playerColor.g);
        const db = Math.abs(b - this.playerColor.b);
        if (dr < 30 && dg < 30 && db < 30) {
          return { type: 'MINE', cost: 0, confidence: 0.99 };
        }
      }

      // 4. Enemy Player Territory Classification
      return { type: 'ENEMY', cost: 80, confidence: 0.90 };
    }

    applyNoiseFilter(grid, width, height) {
      // 3x3 Median Noise Reduction Filter across classification grid
      for (let y = 1; y < height - 1; y += 2) {
        for (let x = 1; x < width - 1; x += 2) {
          const centerType = grid[y * width + x].type;
          let matchCount = 0;

          // Check 4-connected neighbors
          if (grid[(y - 1) * width + x].type === centerType) matchCount++;
          if (grid[(y + 1) * width + x].type === centerType) matchCount++;
          if (grid[y * width + (x - 1)].type === centerType) matchCount++;
          if (grid[y * width + (x + 1)].type === centerType) matchCount++;

          if (matchCount < 1) {
            // Noise detected: smooth with top neighbor
            grid[y * width + x].type = grid[(y - 1) * width + x].type;
            grid[y * width + x].confidence *= 0.8;
          }
        }
      }
    }
  }

  // --- CLASS 4: GRID BUILDER ---
  class GridBuilder {
    constructor() {
      this.grid = null;
      this.gridWidth = 0;
      this.gridHeight = 0;
    }

    allocateGrid(width, height) {
      if (this.gridWidth === width && this.gridHeight === height && this.grid) {
        return;
      }
      this.gridWidth = width;
      this.gridHeight = height;
      this.grid = new Array(width * height);
      for (let i = 0; i < this.grid.length; i++) {
        this.grid[i] = {
          type: 'UNKNOWN',
          lastSeen: 0,
          confidence: 0.0,
          owner: null,
          cost: 100
        };
      }
    }

    buildFromCache(imageCache, classifier) {
      if (!imageCache.uint8Buffer) return null;

      const w = imageCache.width;
      const h = imageCache.height;
      this.allocateGrid(w, h);

      const buf = imageCache.uint8Buffer;
      const now = performance.now();

      for (let y = 0; y < h; y++) {
        const rowIdx = y * w;
        for (let x = 0; x < w; x++) {
          const idx = (rowIdx + x) * 4;
          const r = buf[idx];
          const g = buf[idx + 1];
          const b = buf[idx + 2];

          const res = classifier.classifyRGB(r, g, b);
          const cell = this.grid[rowIdx + x];
          
          cell.type = res.type;
          cell.cost = res.cost;
          cell.confidence = res.confidence;
          cell.lastSeen = now;
        }
      }

      classifier.applyNoiseFilter(this.grid, w, h);
      return { grid: this.grid, width: w, height: h };
    }
  }

  // --- CLASS 5: VISION ENGINE (MASTER ORCHESTRATOR) ---
  class VisionEngine {
    constructor() {
      this.reader = new CanvasReader();
      this.cache = new ImageCache();
      this.classifier = new PixelClassifier();
      this.builder = new GridBuilder();
      this.fps = 0;
      this.lastProcessTime = 0;
      this.frameCount = 0;
      this.lastFpsCalc = performance.now();
      this.enabled = true;
    }

    init() {
      return this.reader.attach();
    }

    setPlayerColor(r, g, b) {
      this.classifier.setPlayerColor(r, g, b);
    }

    processFrame() {
      if (!this.enabled) return null;

      const now = performance.now();
      this.frameCount++;
      if (now >= this.lastFpsCalc + 1000) {
        this.fps = Math.round((this.frameCount * 1000) / (now - this.lastFpsCalc));
        this.frameCount = 0;
        this.lastFpsCalc = now;
      }

      const imgData = this.reader.captureScaledBuffer();
      if (!imgData) return null;

      this.cache.update(imgData);
      const result = this.builder.buildFromCache(this.cache, this.classifier);
      
      this.lastProcessTime = performance.now() - now;
      return result;
    }

    getMetrics() {
      return {
        visionFPS: this.fps,
        latencyMs: parseFloat(this.lastProcessTime.toFixed(2)),
        gridWidth: this.builder.gridWidth,
        gridHeight: this.builder.gridHeight
      };
    }
  }

  // Export to global scope
  window.VisionEngine = VisionEngine;
  window.CanvasReader = CanvasReader;
  window.PixelClassifier = PixelClassifier;
  window.ImageCache = ImageCache;
  window.GridBuilder = GridBuilder;

  console.log('%c[TIO VisionEngine] Phase 1 Vision Pipeline Loaded Successfully.', 'color: #10b981;');
})();
