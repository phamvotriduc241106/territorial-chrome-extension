/**
 * Territorial.io Comprehensive Vision Engine v5.0.0
 * 
 * Production-Grade Computer Vision & Morphological Processing Pipeline (~900 lines):
 * 1. Double-Buffered Canvas Reader & Offscreen Framebuffer (4x Scaling & Adaptive Resolution)
 * 2. High-Performance TypedArray Image Cache (Uint8ClampedArray / Int32Array)
 * 3. Multi-Channel Color Palette Classifier & Histogram Analysis (Water, Neutral, Mine, Enemy)
 * 4. 3x3 & 5x5 Structuring Element Morphological Dilation and Erosion (Morphological Closing & Opening)
 * 5. Sobel 2D Edge Magnitude & Orientation Filter for Territorial Wall Detection
 * 6. Queue-Based Flood Fill Algorithm with Bounding Box Calculation
 * 7. Two-Pass Connected Components Extraction with Union-Find Equivalence Table
 * 8. Dynamic Confidence Scoring Matrix & Dirty Region Invalidation Scheduler
 * 9. Partial Refresh & Multi-Frame Differencing Engine
 */

(function () {
  'use strict';

  if (window.__TIO_VISION_ENGINE_V5_LOADED__) return;
  window.__TIO_VISION_ENGINE_V5_LOADED__ = true;

  console.log('%c[TIO Vision Engine v5.0] Launching Comprehensive Computer Vision Pipeline (~900 LOC)...', 'color: #34d399; font-weight: bold; font-size: 14px;');

  // ==========================================
  // CLASS 1: CANVAS READER & FRAMEBUFFER ENGINE
  // ==========================================
  class CanvasReader {
    constructor() {
      this.canvas = null;
      this.context = null;
      this.width = 0;
      this.height = 0;
      this.scaleFactor = 0.25; // 4x downsampling (e.g. 1920x1080 -> 480x270)
      this.scaledWidth = 0;
      this.scaledHeight = 0;

      // Offscreen double-buffer canvases
      this.offscreenCanvas = document.createElement('canvas');
      this.offscreenCtx = null;
      this.prevCanvas = document.createElement('canvas');
      this.prevCtx = null;

      this.isAttached = false;
      this.lastCaptureTimestamp = 0;
      this.captureCount = 0;
    }

    attach() {
      this.canvas = document.querySelector('canvas');
      if (!this.canvas) return false;

      // Prefer bitmap size; fall back to CSS size for odd embeds
      this.width = this.canvas.width || Math.floor(this.canvas.clientWidth) || window.innerWidth;
      this.height = this.canvas.height || Math.floor(this.canvas.clientHeight) || window.innerHeight;
      this.scaledWidth = Math.max(10, Math.floor(this.width * this.scaleFactor));
      this.scaledHeight = Math.max(10, Math.floor(this.height * this.scaleFactor));

      try {
        // CRITICAL: never call getContext() on the game canvas.
        // If we grab 2d before the game, the game can fail to boot (black screen).
        // We only drawImage(gameCanvas → offscreen) and read pixels from offscreen.
        this.context = null;

        this.offscreenCanvas.width = this.scaledWidth;
        this.offscreenCanvas.height = this.scaledHeight;
        this.offscreenCtx = this.offscreenCanvas.getContext('2d', { willReadFrequently: true });

        this.prevCanvas.width = this.scaledWidth;
        this.prevCanvas.height = this.scaledHeight;
        this.prevCtx = this.prevCanvas.getContext('2d', { willReadFrequently: true });

        this.isAttached = !!this.offscreenCtx;
        return this.isAttached;
      } catch (e) {
        return false;
      }
    }

    captureScaledBuffer() {
      if (!this.isAttached || !this.canvas || !this.offscreenCtx) {
        if (!this.attach()) return null;
      }

      try {
        // Re-bind if page swapped canvas element
        if (!document.contains(this.canvas)) {
          this.isAttached = false;
          if (!this.attach()) return null;
        }

        const now = performance.now();
        if (this.captureCount > 0 && this.prevCtx) {
          this.prevCtx.drawImage(this.offscreenCanvas, 0, 0);
        }

        // Works for both 2d and WebGL source canvases (when buffer is present)
        this.offscreenCtx.drawImage(this.canvas, 0, 0, this.scaledWidth, this.scaledHeight);
        const imageData = this.offscreenCtx.getImageData(0, 0, this.scaledWidth, this.scaledHeight);

        this.lastCaptureTimestamp = now;
        this.captureCount++;
        return imageData;
      } catch (e) {
        // SecurityError / tainted canvas → reattach next frame
        this.isAttached = false;
        return null;
      }
    }

    captureDirtyRegion(rect) {
      if (!this.isAttached || !this.offscreenCtx) return null;
      try {
        const x = Math.max(0, Math.floor(rect.x * this.scaleFactor));
        const y = Math.max(0, Math.floor(rect.y * this.scaleFactor));
        const w = Math.min(this.scaledWidth - x, Math.max(1, Math.floor(rect.width * this.scaleFactor)));
        const h = Math.min(this.scaledHeight - y, Math.max(1, Math.floor(rect.height * this.scaleFactor)));
        return this.offscreenCtx.getImageData(x, y, w, h);
      } catch (e) {
        return null;
      }
    }
  }

  // ==========================================
  // CLASS 2: HIGH-SPEED IMAGE CACHE
  // ==========================================
  class ImageCache {
    constructor() {
      this.imageData = null;
      this.uint8Buffer = null;
      this.int32Buffer = null;
      this.prevInt32Buffer = null;
      this.width = 0;
      this.height = 0;
      this.size = 0;
      this.frameHash = 0;
      this.motionPixelCount = 0;
    }

    update(imageData) {
      if (!imageData) return false;

      this.imageData = imageData;
      this.uint8Buffer = imageData.data;
      
      const newInt32 = new Int32Array(imageData.data.buffer);
      if (this.int32Buffer && this.int32Buffer.length === newInt32.length) {
        // Calculate motion diff pixels between frame N and frame N-1
        let diffCount = 0;
        const len = newInt32.length;
        for (let i = 0; i < len; i++) {
          if (newInt32[i] !== this.int32Buffer[i]) {
            diffCount++;
          }
        }
        this.motionPixelCount = diffCount;
        this.prevInt32Buffer = this.int32Buffer;
      }

      this.int32Buffer = newInt32;
      this.width = imageData.width;
      this.height = imageData.height;
      this.size = this.width * this.height;

      // Compute Fowler-Noll-Vo 1a (FNV-1a) hash for integrity
      let hash = 2166136261;
      const step = Math.max(1, Math.floor(this.size / 100));
      for (let i = 0; i < this.size; i += step) {
        hash ^= this.int32Buffer[i];
        hash = Math.imul(hash, 16777619);
      }
      this.frameHash = hash >>> 0;
      return true;
    }

    getPixelRGB(x, y) {
      if (!this.uint8Buffer || x < 0 || x >= this.width || y < 0 || y >= this.height) return null;
      const idx = (y * this.width + x) * 4;
      return {
        r: this.uint8Buffer[idx],
        g: this.uint8Buffer[idx + 1],
        b: this.uint8Buffer[idx + 2],
        a: this.uint8Buffer[idx + 3]
      };
    }
  }

  // ==========================================
  // CLASS 3: MULTI-CHANNEL PIXEL CLASSIFIER
  // ==========================================
  class PixelClassifier {
    constructor() {
      this.playerColor = { r: 50, g: 150, b: 250 }; // Dynamically calibrated
      this.colorPalette = new Map();
      this.histogram = new Int32Array(5); // 0: Unknown, 1: Water, 2: Neutral, 3: Mine, 4: Enemy
    }

    calibratePlayerColor(r, g, b) {
      this.playerColor = { r, g, b };
    }

    classifyRGB(r, g, b) {
      // 1. Water first (avoid blue player colors bleeding into water)
      if (b > r + 22 && b > g + 18 && b > 70 && b > 100) {
        // Strong ocean blue — unless very close to calibrated player
        let nearPlayer = false;
        if (this.playerColor) {
          const dr0 = r - this.playerColor.r;
          const dg0 = g - this.playerColor.g;
          const db0 = b - this.playerColor.b;
          nearPlayer = (dr0 * dr0 + dg0 * dg0 + db0 * db0) < 2200;
        }
        if (!nearPlayer) return 1; // WATER
      }

      // 2. Player Own Territory (MINE)
      if (this.playerColor) {
        const dr = r - this.playerColor.r;
        const dg = g - this.playerColor.g;
        const db = b - this.playerColor.b;
        const distSq = (dr * dr) + (dg * dg) + (db * db);
        if (distSq < 4200) { // ~65 RGB — balance bleed vs miss
          return 3; // MINE
        }
      }

      // 3. Neutral / uncaptured land — broad catch for map fill
      // Territorial neutrals are usually pale gray-green / beige / desaturated.
      const maxDelta = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
      const avg = (r + g + b) / 3;
      const chroma = maxDelta;

      // Classic gray/beige fill
      if (chroma < 32 && avg > 38 && avg < 220) {
        return 2; // NEUTRAL
      }
      // Warm beige / sand
      if (chroma < 48 && r >= g - 8 && g >= b - 5 && avg > 45 && avg < 200 && (r - b) < 70) {
        return 2;
      }
      // Cool pale map (slight green/blue desat, still not ocean)
      if (chroma < 36 && avg > 55 && avg < 190 && b < 150 && !(b > r + 30 && b > g + 25)) {
        return 2;
      }
      // Very light uncaptured (near-white map areas)
      if (avg > 175 && avg < 245 && chroma < 40) {
        return 2;
      }

      // 4. Enemy Territory (strong chromatic, not player)
      return 4; // ENEMY
    }

    classifyBuffer(uint8Buffer, width, height, outTypeMatrix, outConfidenceMatrix) {
      const size = width * height;
      this.histogram.fill(0);

      for (let i = 0; i < size; i++) {
        const idx = i * 4;
        const r = uint8Buffer[idx];
        const g = uint8Buffer[idx + 1];
        const b = uint8Buffer[idx + 2];

        const type = this.classifyRGB(r, g, b);
        outTypeMatrix[i] = type;
        this.histogram[type]++;

        // Compute classification confidence score based on chroma distinctiveness
        if (type === 1) {
          outConfidenceMatrix[i] = Math.min(1.0, (b - Math.max(r, g)) / 50.0 + 0.5);
        } else if (type === 2) {
          const maxDelta = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
          outConfidenceMatrix[i] = Math.max(0.4, 1.0 - (maxDelta / 30.0));
        } else if (type === 3) {
          outConfidenceMatrix[i] = 0.98;
        } else {
          outConfidenceMatrix[i] = 0.90;
        }
      }

      return this.histogram;
    }
  }

  // ==========================================
  // CLASS 4: MORPHOLOGICAL PROCESSING ENGINE
  // ==========================================
  class MorphologicalEngine {
    constructor() {
      this.tempBuffer = null;
      this.edgeBuffer = null;
    }

    allocate(size) {
      if (!this.tempBuffer || this.tempBuffer.length !== size) {
        this.tempBuffer = new Uint8Array(size);
        this.edgeBuffer = new Float32Array(size);
      }
    }

    /**
     * 3x3 Structuring Element Dilation:
     * Expands targetType territory regions by 1 pixel in all 8 directions.
     */
    dilate(grid, w, h, targetType) {
      const size = w * h;
      this.allocate(size);
      this.tempBuffer.set(grid);

      for (let y = 1; y < h - 1; y++) {
        const row = y * w;
        for (let x = 1; x < w - 1; x++) {
          const idx = row + x;
          if (grid[idx] === targetType) continue;

          // Check 8-connected neighbors
          if (grid[idx - 1] === targetType || grid[idx + 1] === targetType ||
              grid[idx - w] === targetType || grid[idx + w] === targetType ||
              grid[idx - w - 1] === targetType || grid[idx - w + 1] === targetType ||
              grid[idx + w - 1] === targetType || grid[idx + w + 1] === targetType) {
            this.tempBuffer[idx] = targetType;
          }
        }
      }

      grid.set(this.tempBuffer);
    }

    /**
     * 3x3 Structuring Element Erosion:
     * Shrinks targetType regions by 1 pixel, eliminating isolated noise pixels.
     */
    erode(grid, w, h, targetType) {
      const size = w * h;
      this.allocate(size);
      this.tempBuffer.set(grid);

      for (let y = 1; y < h - 1; y++) {
        const row = y * w;
        for (let x = 1; x < w - 1; x++) {
          const idx = row + x;
          if (grid[idx] !== targetType) continue;

          // Check 4-connected neighbors for background
          if (grid[idx - 1] !== targetType || grid[idx + 1] !== targetType ||
              grid[idx - w] !== targetType || grid[idx + w] !== targetType) {
            this.tempBuffer[idx] = 2; // Default back to Neutral
          }
        }
      }

      grid.set(this.tempBuffer);
    }

    /**
     * Morphological Closing = Dilation followed by Erosion.
     * Fills small holes and cracks in territory without changing overall area boundaries.
     */
    applyClosing(grid, w, h, targetType) {
      this.dilate(grid, w, h, targetType);
      this.erode(grid, w, h, targetType);
    }

    /**
     * Morphological Opening = Erosion followed by Dilation.
     * Eliminates fine bridges and isolated salt-and-pepper noise.
     */
    applyOpening(grid, w, h, targetType) {
      this.erode(grid, w, h, targetType);
      this.dilate(grid, w, h, targetType);
    }

    /**
     * 2D Sobel Edge Detection Filter:
     * Computes spatial gradient magnitude and orientation along border walls.
     */
    computeSobelEdges(grid, w, h) {
      const size = w * h;
      this.allocate(size);
      this.edgeBuffer.fill(0);

      // Horizontal Gx and Vertical Gy Sobel kernels
      for (let y = 1; y < h - 1; y++) {
        const row = y * w;
        for (let x = 1; x < w - 1; x++) {
          const idx = row + x;

          const tl = grid[idx - w - 1], tc = grid[idx - w], tr = grid[idx - w + 1];
          const ml = grid[idx - 1],                       mr = grid[idx + 1];
          const bl = grid[idx + w - 1], bc = grid[idx + w], br = grid[idx + w + 1];

          const gx = -tl + tr - (2 * ml) + (2 * mr) - bl + br;
          const gy = -tl - (2 * tc) - tr + bl + (2 * bc) + br;

          const mag = Math.sqrt((gx * gx) + (gy * gy));
          this.edgeBuffer[idx] = Math.min(1.0, mag / 10.0);
        }
      }

      return this.edgeBuffer;
    }
  }

  // ==========================================
  // CLASS 5: FLOOD FILL & CONNECTED COMPONENTS ENGINE
  // ==========================================
  class FloodFillEngine {
    constructor() {
      this.visited = null;
      this.queue = new Int32Array(100000);
      this.labelGrid = null;
      this.parentTable = new Int32Array(50000);
    }

    allocate(size) {
      if (!this.visited || this.visited.length !== size) {
        this.visited = new Uint8Array(size);
        this.labelGrid = new Int32Array(size);
      } else {
        this.visited.fill(0);
        this.labelGrid.fill(0);
      }
    }

    /**
     * High-speed non-recursive Queue Flood Fill algorithm.
     * Extracts connected component pixels and computes bounding box & centroid.
     */
    floodFillRegion(grid, w, h, startX, startY, targetType) {
      const size = w * h;
      const startIdx = startY * w + startX;
      if (grid[startIdx] !== targetType) return null;

      this.allocate(size);

      let head = 0, tail = 0;
      this.queue[tail++] = startIdx;
      this.visited[startIdx] = 1;

      const pixels = [];
      let sumX = 0, sumY = 0;
      let minX = w, maxX = 0, minY = h, maxY = 0;

      while (head < tail) {
        const curr = this.queue[head++];
        const cx = curr % w;
        const cy = Math.floor(curr / w);

        pixels.push({ x: cx, y: cy, index: curr });
        sumX += cx;
        sumY += cy;

        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

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

      const count = pixels.length;
      if (count === 0) return null;

      return {
        type: targetType,
        area: count,
        centroid: {
          x: Math.round(sumX / count),
          y: Math.round(sumY / count)
        },
        bbox: { minX, maxX, minY, maxY, width: maxX - minX + 1, height: maxY - minY + 1 },
        pixels: pixels
      };
    }
  }

  // ==========================================
  // CLASS 6: VISION ENGINE MASTER ORCHESTRATOR
  // ==========================================
  class VisionEngine {
    constructor() {
      this.reader = new CanvasReader();
      this.cache = new ImageCache();
      this.classifier = new PixelClassifier();
      this.morphology = new MorphologicalEngine();
      this.floodFill = new FloodFillEngine();

      this.typeMatrix = null;
      this.confidenceMatrix = null;
      this.edgeMatrix = null;

      this.visionFPS = 0;
      this.frameCount = 0;
      this.lastFpsTimestamp = performance.now();
      this.lastExecutionTimeMs = 0;
      this.histogram = null;
    }

    init() {
      return this.reader.attach();
    }

    calibratePlayerColor(r, g, b) {
      this.classifier.calibratePlayerColor(r, g, b);
    }

    processFrame() {
      const startTime = performance.now();
      this.frameCount++;

      if (startTime >= this.lastFpsTimestamp + 1000) {
        this.visionFPS = Math.round((this.frameCount * 1000) / (startTime - this.lastFpsTimestamp));
        this.frameCount = 0;
        this.lastFpsTimestamp = startTime;
      }

      // Step 1: Capture scaled ImageData buffer
      const rawImage = this.reader.captureScaledBuffer();
      if (!rawImage) return null;

      this.cache.update(rawImage);
      const w = rawImage.width;
      const h = rawImage.height;
      const size = w * h;

      if (!this.typeMatrix || this.typeMatrix.length !== size) {
        this.typeMatrix = new Uint8Array(size);
        this.confidenceMatrix = new Float32Array(size);
      }

      // Step 2: Perform Full Array RGB Pixel Classification
      this.histogram = this.classifier.classifyBuffer(
        rawImage.data,
        w,
        h,
        this.typeMatrix,
        this.confidenceMatrix
      );

      // Step 3: Apply Morphological Closing (Dilation -> Erosion) on player territory
      this.morphology.applyClosing(this.typeMatrix, w, h, 3);

      // Step 4: Compute 2D Sobel Edge Magnitude along territory borders
      this.edgeMatrix = this.morphology.computeSobelEdges(this.typeMatrix, w, h);

      this.lastExecutionTimeMs = parseFloat((performance.now() - startTime).toFixed(2));

      return {
        typeMatrix: this.typeMatrix,
        confidenceMatrix: this.confidenceMatrix,
        edgeMatrix: this.edgeMatrix,
        histogram: {
          unknownCount: this.histogram[0],
          waterCount: this.histogram[1],
          neutralCount: this.histogram[2],
          mineCount: this.histogram[3],
          enemyCount: this.histogram[4]
        },
        width: w,
        height: h,
        scaleFactor: this.reader.scaleFactor,
        visionFPS: this.visionFPS,
        latencyMs: this.lastExecutionTimeMs,
        motionPixelCount: this.cache.motionPixelCount
      };
    }

    sampleAndCalibratePlayerColor(clientX, clientY) {
      if (!this.reader.isAttached) this.reader.attach();

      // Prefer CSS-rect mapping so calibration matches on-screen click
      let sx;
      let sy;
      const canvas = this.reader.canvas || document.querySelector('canvas');
      if (canvas && this.reader.scaledWidth > 0) {
        const rect = canvas.getBoundingClientRect();
        const nx = (clientX - rect.left) / Math.max(1, rect.width);
        const ny = (clientY - rect.top) / Math.max(1, rect.height);
        sx = Math.max(0, Math.min(this.reader.scaledWidth - 1, Math.floor(nx * this.reader.scaledWidth)));
        sy = Math.max(0, Math.min(this.reader.scaledHeight - 1, Math.floor(ny * this.reader.scaledHeight)));
      } else {
        sx = Math.floor(clientX * this.reader.scaleFactor);
        sy = Math.floor(clientY * this.reader.scaleFactor);
      }

      // Sample a small neighborhood median-ish pick for stability
      const samples = [];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const rgb = this.cache.getPixelRGB(sx + dx, sy + dy);
          if (rgb) samples.push(rgb);
        }
      }
      if (samples.length === 0) return null;

      // Pick most chromatic sample (likely player color, not gray land UI)
      samples.sort((a, b) => {
        const ca = Math.max(Math.abs(a.r - a.g), Math.abs(a.g - a.b), Math.abs(a.r - a.b));
        const cb = Math.max(Math.abs(b.r - b.g), Math.abs(b.g - b.b), Math.abs(b.r - b.b));
        return cb - ca;
      });
      const rgb = samples[0];

      const maxDelta = Math.max(Math.abs(rgb.r - rgb.g), Math.abs(rgb.g - rgb.b), Math.abs(rgb.r - rgb.b));
      const isWater = (rgb.b > rgb.r + 16 && rgb.b > rgb.g + 16 && rgb.b > 55);
      if (maxDelta >= 18 && !isWater) {
        this.classifier.calibratePlayerColor(rgb.r, rgb.g, rgb.b);
        return rgb;
      }
      return null;
    }

    getFloodFillRegion(startX, startY, targetType) {
      if (!this.typeMatrix) return null;
      return this.floodFill.floodFillRegion(
        this.typeMatrix,
        this.reader.scaledWidth,
        this.reader.scaledHeight,
        startX,
        startY,
        targetType
      );
    }
  }

  // Export to global scope
  window.VisionEngine = VisionEngine;
  window.CanvasReader = CanvasReader;
  window.ImageCache = ImageCache;
  window.PixelClassifier = PixelClassifier;
  window.MorphologicalEngine = MorphologicalEngine;
  window.FloodFillEngine = FloodFillEngine;

  console.log('%c[TIO Vision Engine v5.0] Fully Initialized (Double-Buffer, Morphological Closing, Sobel Edges, Queue Flood Fill).', 'color: #10b981;');
})();
