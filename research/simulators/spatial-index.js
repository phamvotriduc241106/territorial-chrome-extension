/**
 * Zero-Allocation 2D Spatial Hash Grid for Large-Scale Multi-Agent Simulation
 * Provides O(1) average-time proximity and neighborhood queries for 50-500 players.
 */
'use strict';

class SpatialHashGrid {
  constructor(width, height, cellSize = 8) {
    this.w = width;
    this.h = height;
    this.cellSize = cellSize;
    this.cols = Math.ceil(width / cellSize);
    this.rows = Math.ceil(height / cellSize);
    this.numBuckets = this.cols * this.rows;

    // Flat head/next linked-list representation (Zero GC pressure)
    this.head = new Int32Array(this.numBuckets).fill(-1);
    this.maxEntities = 4096;
    this.next = new Int32Array(this.maxEntities).fill(-1);
    this.entityId = new Int32Array(this.maxEntities).fill(-1);
    this.entityX = new Float32Array(this.maxEntities);
    this.entityY = new Float32Array(this.maxEntities);
    this.count = 0;
  }

  clear() {
    this.head.fill(-1);
    this.count = 0;
  }

  insert(id, x, y) {
    if (this.count >= this.maxEntities) return false;
    const col = Math.min(this.cols - 1, Math.max(0, Math.floor(x / this.cellSize)));
    const row = Math.min(this.rows - 1, Math.max(0, Math.floor(y / this.cellSize)));
    const bucket = row * this.cols + col;

    const idx = this.count++;
    this.entityId[idx] = id;
    this.entityX[idx] = x;
    this.entityY[idx] = y;
    this.next[idx] = this.head[bucket];
    this.head[bucket] = idx;
    return true;
  }

  queryRadius(x, y, radius, outIds) {
    outIds = outIds || (this.queryBuffer || (this.queryBuffer = []));
    outIds.length = 0;
    const rSq = radius * radius;
    const minCol = Math.max(0, Math.floor((x - radius) / this.cellSize));
    const maxCol = Math.min(this.cols - 1, Math.floor((x + radius) / this.cellSize));
    const minRow = Math.max(0, Math.floor((y - radius) / this.cellSize));
    const maxRow = Math.min(this.rows - 1, Math.floor((y + radius) / this.cellSize));

    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const bucket = r * this.cols + c;
        let curr = this.head[bucket];
        while (curr !== -1) {
          const dx = this.entityX[curr] - x;
          const dy = this.entityY[curr] - y;
          if (dx * dx + dy * dy <= rSq) {
            outIds.push(this.entityId[curr]);
          }
          curr = this.next[curr];
        }
      }
    }
    return outIds;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SpatialHashGrid };
}
