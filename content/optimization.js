/**
 * Territorial.io Comprehensive Performance Optimization Engine v5.0.0
 * 
 * Production-Grade Memory Pooling & Dynamic Scheduler (~300 lines):
 * 1. Bounded TypedArray reuse (reduces allocations; does not guarantee zero GC)
 * 2. Spatial Hash Indexing for O(1) Candidate Neighborhood Queries
 * 3. Dynamic Frame-Skipping & Adaptive FPS Budgeting
 * 4. Dirty Rectangle Tracking & Partial Refresh Invalidation Scheduler
 */

(function () {
  'use strict';

  if (window.__TIO_OPTIMIZATION_ENGINE_V5_LOADED__) return;
  window.__TIO_OPTIMIZATION_ENGINE_V5_LOADED__ = true;

  console.log('%c[TIO Optimization Engine v5.0] Initializing TypedArray Memory Pool & Adaptive Frame Scheduler (~300 LOC)...', 'color: #34d399; font-weight: bold; font-size: 14px;');

  // ==========================================
  // CLASS 1: TYPEDARRAY MEMORY POOL
  // ==========================================
  class MemoryPool {
    constructor(maxRetainedBytes = 8 * 1024 * 1024) {
      this.uint8Pools = new Map();
      this.int32Pools = new Map();
      this.float32Pools = new Map();
      this.retainedBytes = 0;
      this.maxRetainedBytes = maxRetainedBytes;
      this.retained = new WeakSet();
    }
    get(poolMap, Constructor, size) {
      const pool = poolMap.get(size);
      if (!pool || !pool.length) return new Constructor(size);
      const array = pool.pop();
      if (!pool.length) poolMap.delete(size);
      this.retained.delete(array);
      this.retainedBytes -= array.byteLength;
      return array;
    }
    release(poolMap, Constructor, array) {
      if (!(array instanceof Constructor) || !array.byteLength || this.retained.has(array) ||
          this.retainedBytes + array.byteLength > this.maxRetainedBytes) return;
      let pool = poolMap.get(array.length);
      if (pool && pool.length >= 20) return;
      if (!pool) poolMap.set(array.length, pool = []);
      pool.push(array);
      this.retained.add(array);
      this.retainedBytes += array.byteLength;
    }
    getUint8Array(size) { return this.get(this.uint8Pools, Uint8Array, size); }
    releaseUint8Array(array) { this.release(this.uint8Pools, Uint8Array, array); }
    getInt32Array(size) { return this.get(this.int32Pools, Int32Array, size); }
    releaseInt32Array(array) { this.release(this.int32Pools, Int32Array, array); }
    getFloat32Array(size) { return this.get(this.float32Pools, Float32Array, size); }
    releaseFloat32Array(array) { this.release(this.float32Pools, Float32Array, array); }
  }

  // ==========================================
  // CLASS 2: SPATIAL HASH GRID INDEX
  // ==========================================
  class SpatialHashGrid {
    constructor(cellWidth = 60, cellHeight = 60) {
      this.cellWidth = cellWidth;
      this.cellHeight = cellHeight;
      this.buckets = new Map();
    }

    clear() {
      this.buckets.clear();
    }

    getKey(x, y) {
      const cx = Math.floor(x / this.cellWidth);
      const cy = Math.floor(y / this.cellHeight);
      return `${cx}_${cy}`;
    }

    insert(x, y, data) {
      const key = this.getKey(x, y);
      let bucket = this.buckets.get(key);
      if (!bucket) {
        bucket = [];
        this.buckets.set(key, bucket);
      }
      bucket.push(data);
    }

    queryNeighborhood(x, y, radiusCells = 1, results = []) {
      const cx = Math.floor(x / this.cellWidth);
      const cy = Math.floor(y / this.cellHeight);
      results.length = 0;

      for (let dy = -radiusCells; dy <= radiusCells; dy++) {
        for (let dx = -radiusCells; dx <= radiusCells; dx++) {
          const key = `${cx + dx}_${cy + dy}`;
          const bucket = this.buckets.get(key);
          if (bucket) {
            for (let i = 0; i < bucket.length; i++) {
              results.push(bucket[i]);
            }
          }
        }
      }
      return results;
    }
  }

  // Skip only an unchanged snapshot between real control/time events. No plan
  // or native command is reused, and the time backstop keeps opening FSM live.
  class InternalPlanningGate {
    constructor(maxAgeMs = 100) {
      this.maxAgeMs = maxAgeMs;
      this.evaluations = 0;
      this.skipped = 0;
      this.reset();
    }
    reset() { this.state = null; this.at = -Infinity; this.sequence = -1; this.settings = null; this.controls = -1; }
    shouldRun(state, now, sequence, settings, controls) {
      if (state !== this.state || sequence !== this.sequence || settings !== this.settings || controls !== this.controls ||
          now < this.at || now - this.at >= this.maxAgeMs) {
        this.state = state; this.at = now; this.sequence = sequence; this.settings = settings; this.controls = controls;
        this.evaluations++;
        return true;
      }
      this.skipped++;
      return false;
    }
  }

  // ==========================================
  // CLASS 3: FRAME SCHEDULER (hardware-uncapped)
  // ==========================================
  // targetFPS <= 0  → every requestAnimationFrame (display refresh / hardware)
  // targetFPS > 0   → optional soft cap (legacy)
  class AdaptiveScheduler {
    constructor(targetFPS = 0) {
      this.targetFPS = targetFPS > 0 ? targetFPS : 0;
      this.frameIntervalMs = this.targetFPS > 0 ? (1000 / this.targetFPS) : 0;
      this.lastFrameTimestamp = 0;
      this.frameDropCount = 0;
      this.totalFrameCount = 0;
      this.measuredFps = 0;
      this._fpsFrames = 0;
      this._fpsWindowStart = 0;

      // Dirty region bounding box for partial updates
      this.dirtyBox = { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
      this.isDirty = true;
    }

    /** Uncapped: run every rAF tick. Optional targetFPS soft-caps only if > 0. */
    shouldRunFrame(now) {
      this.totalFrameCount++;

      if (this.frameIntervalMs > 0) {
        const elapsed = now - this.lastFrameTimestamp;
        if (elapsed < this.frameIntervalMs) {
          this.frameDropCount++;
          return false;
        }
      }

      this.lastFrameTimestamp = now;
      this._fpsFrames++;
      if (!this._fpsWindowStart) this._fpsWindowStart = now;
      if (now - this._fpsWindowStart >= 1000) {
        this.measuredFps = Math.round(
          (this._fpsFrames * 1000) / Math.max(1, now - this._fpsWindowStart)
        );
        this._fpsFrames = 0;
        this._fpsWindowStart = now;
      }
      return true;
    }

    markDirtyRegion(x, y, w, h) {
      this.isDirty = true;
      this.dirtyBox.x = Math.max(0, x);
      this.dirtyBox.y = Math.max(0, y);
      this.dirtyBox.width = Math.min(window.innerWidth - x, w);
      this.dirtyBox.height = Math.min(window.innerHeight - y, h);
    }

    getSchedulerTelemetry() {
      return {
        targetFPS: this.targetFPS || 'uncapped',
        measuredFps: this.measuredFps,
        frameDropRatio: parseFloat((this.frameDropCount / Math.max(1, this.totalFrameCount)).toFixed(3)),
        isDirty: this.isDirty,
        dirtyBox: this.dirtyBox
      };
    }
  }

  // Export to global scope
  window.MemoryPool = MemoryPool;
  window.SpatialHashGrid = SpatialHashGrid;
  window.AdaptiveScheduler = AdaptiveScheduler;
  window.InternalPlanningGate = InternalPlanningGate;

  console.log('%c[TIO Optimization Engine v5.0] Memory Pool & Adaptive Scheduler Loaded.', 'color: #10b981;');
})();
