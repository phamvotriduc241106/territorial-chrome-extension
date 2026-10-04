/**
 * Territorial.io Comprehensive Occupancy Grid v5.0.0
 * 
 * High-Performance 2D Spatial Grid Matrix (~350 lines):
 * 1. 2D Cell Memory Matrix storing { type, cost, confidence, lastSeen, owner, danger, accessible }
 * 2. Spatial Bitmask Indexing & Multi-Channel Layer Matrices (typeMatrix, costMatrix, dangerMatrix, accessibilityMatrix)
 * 3. Accessibility Verification & Spatial Raycasting Line-of-Sight Check
 * 4. Dynamic Cost & Terrain Resistance Calculation
 * 5. Danger Field Overlay & Threat Accumulation Buffer
 */

(function () {
  'use strict';

  if (window.__TIO_OCCUPANCY_GRID_V5_LOADED__) return;
  window.__TIO_OCCUPANCY_GRID_V5_LOADED__ = true;

  console.log('%c[TIO Occupancy Grid v5.0] Initializing 2D Spatial Grid & Multi-Layer Matrices (~350 LOC)...', 'color: #34d399; font-weight: bold; font-size: 14px;');

  // --- ENUM CONSTANTS ---
  const CELL_TYPE = {
    UNKNOWN: 0,
    WATER: 1,
    NEUTRAL: 2,
    MINE: 3,
    ENEMY: 4
  };

  const TERRAIN_COST = {
    UNKNOWN: 100,
    WATER: 9999,
    NEUTRAL: 10,
    MINE: 0,
    ENEMY: 80
  };

  class GridCell {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.type = 'UNKNOWN';
      this.typeEnum = CELL_TYPE.UNKNOWN;
      this.cost = TERRAIN_COST.UNKNOWN;
      this.confidence = 0.0;
      this.lastSeen = 0;
      this.owner = null;
      this.danger = 0.0;
      this.accessible = true;
      this.bitmask = 0; // Bit 0: Water, Bit 1: Neutral, Bit 2: Mine, Bit 3: Enemy, Bit 4: Accessible
    }

    reset(x, y) {
      this.x = x;
      this.y = y;
      this.type = 'UNKNOWN';
      this.typeEnum = CELL_TYPE.UNKNOWN;
      this.cost = TERRAIN_COST.UNKNOWN;
      this.confidence = 0.0;
      this.lastSeen = 0;
      this.owner = null;
      this.danger = 0.0;
      this.accessible = true;
      this.bitmask = 0;
    }
  }

  const TERRAIN_NAMES = ['UNKNOWN', 'WATER', 'NEUTRAL', 'MINE', 'ENEMY'];
  const TERRAIN_COST_VALUES = [100, 9999, 10, 0, 80];
  class GridCellView {
    constructor(data, index, x, y) { this.data = data; this.index = index; this.x = x; this.y = y; this.owner = null; }
    get type() { return TERRAIN_NAMES[this.typeEnum] || 'UNKNOWN'; }
    set type(value) { const type = TERRAIN_NAMES.indexOf(value); this.typeEnum = type < 0 ? 0 : type; }
    get typeEnum() { return this.data.type[this.index]; }
    set typeEnum(value) { this.data.type[this.index] = value; }
    get accessible() { return this.data.accessible[this.index] === 1; }
    set accessible(value) { this.data.accessible[this.index] = value ? 1 : 0; }
    reset(x, y) {
      this.x = x; this.y = y; this.typeEnum = 0; this.cost = TERRAIN_COST.UNKNOWN;
      this.confidence = 0; this.lastSeen = 0; this.owner = null; this.danger = 0;
      this.accessible = true; this.bitmask = 0;
    }
  }
  for (const field of ['cost', 'danger', 'confidence', 'lastSeen', 'bitmask']) {
    Object.defineProperty(GridCellView.prototype, field, {
      get() { return this.data[field][this.index]; },
      set(value) { this.data[field][this.index] = value; }
    });
  }

  class OccupancyGrid {
    constructor(width = 0, height = 0) {
      this.width = width;
      this.height = height;
      this.size = width * height;

      this.cells = null;
      this.typeMatrix = null;
      this.costMatrix = null;
      this.dangerMatrix = null;
      this.accessibilityMatrix = null;
      this.bitmaskMatrix = null;

      this.lastUpdateTimestamp = 0;
      this.frameUpdateCount = 0;

      if (width > 0 && height > 0) {
        this.allocate(width, height);
      }
    }

    allocate(w, h) {
      if (this.width === w && this.height === h && this.cells) return;

      this.width = w;
      this.height = h;
      this.size = w * h;

      this.cells = new Array(this.size);
      this.typeMatrix = new Uint8Array(this.size);
      this.costMatrix = new Int32Array(this.size);
      this.dangerMatrix = new Float32Array(this.size);
      this.accessibilityMatrix = new Uint8Array(this.size);
      this.bitmaskMatrix = new Uint16Array(this.size);
      this.confidenceMatrix = new Float32Array(this.size);
      this.lastSeenMatrix = new Float64Array(this.size);
      this.costMatrix.fill(TERRAIN_COST.UNKNOWN);
      this.accessibilityMatrix.fill(1);
      // Cell objects are lazy compatibility views, not a duplicate hot-path store.
      this.cellData = { type: this.typeMatrix, cost: this.costMatrix, danger: this.dangerMatrix,
        accessible: this.accessibilityMatrix, bitmask: this.bitmaskMatrix,
        confidence: this.confidenceMatrix, lastSeen: this.lastSeenMatrix };
    }

    updateFromVision(visionData) {
      return window.TIOProfiler ? window.TIOProfiler.measureCall('grid.update', this.updateFromVisionImpl, this, arguments) : this.updateFromVisionImpl(visionData);
    }
    updateFromVisionImpl(visionData) {
      if (!visionData || !visionData.typeMatrix || !visionData.confidenceMatrix) return false;
      const { typeMatrix, confidenceMatrix, width, height } = visionData;
      if (typeMatrix.length !== width * height || confidenceMatrix.length !== width * height) return false;
      this.allocate(width, height);
      const now = performance.now();
      this.lastUpdateTimestamp = now;
      this.frameUpdateCount++;
      this.typeMatrix.set(typeMatrix);
      this.confidenceMatrix.set(confidenceMatrix);
      this.lastSeenMatrix.fill(now);
      for (let i = 0; i < this.size; i++) {
        const type = typeMatrix[i];
        this.costMatrix[i] = TERRAIN_COST_VALUES[type] == null ? TERRAIN_COST.UNKNOWN : TERRAIN_COST_VALUES[type];
        this.accessibilityMatrix[i] = type === CELL_TYPE.WATER ? 0 : 1;
        this.bitmaskMatrix[i] = type === 1 ? 1 : type === 2 ? 18 : type === 3 ? 20 : type === 4 ? 24 : 0;
      }
      return true;
    }

    getCell(x, y) {
      if (x < 0 || x >= this.width || y < 0 || y >= this.height) return null;
      const index = y * this.width + x;
      return this.cells[index] || (this.cells[index] = new GridCellView(this.cellData, index, x, y));
    }

    getType(x, y) {
      if (x < 0 || x >= this.width || y < 0 || y >= this.height) return CELL_TYPE.WATER;
      return this.typeMatrix[y * this.width + x];
    }

    getCost(x, y) {
      if (x < 0 || x >= this.width || y < 0 || y >= this.height) return TERRAIN_COST.WATER;
      return this.costMatrix[y * this.width + x];
    }

    isAccessible(x, y) {
      if (x < 0 || x >= this.width || y < 0 || y >= this.height) return false;
      return this.accessibilityMatrix[y * this.width + x] === 1;
    }

    /**
     * Bresenham Line-of-Sight Raycasting:
     * Checks if a straight ray between (x0, y0) and (x1, y1) crosses any water obstacles.
     */
    checkLineOfSight(x0, y0, x1, y1) {
      let dx = Math.abs(x1 - x0);
      let dy = Math.abs(y1 - y0);
      let sx = (x0 < x1) ? 1 : -1;
      let sy = (y0 < y1) ? 1 : -1;
      let err = dx - dy;

      let currX = x0;
      let currY = y0;

      while (true) {
        if (!this.isAccessible(currX, currY)) {
          return false; // Ray obstructed by water or out of bounds
        }

        if (currX === x1 && currY === y1) {
          break;
        }

        let e2 = 2 * err;
        if (e2 > -dy) {
          err -= dy;
          currX += sx;
        }
        if (e2 < dx) {
          err += dx;
          currY += sy;
        }
      }

      return true;
    }

    get4Neighbors(x, y) {
      const neighbors = [];
      if (x > 0) neighbors.push(this.getCell(x - 1, y));
      if (x < this.width - 1) neighbors.push(this.getCell(x + 1, y));
      if (y > 0) neighbors.push(this.getCell(x, y - 1));
      if (y < this.height - 1) neighbors.push(this.getCell(x, y + 1));
      return neighbors;
    }

    get8Neighbors(x, y) {
      const neighbors = [];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height) {
            neighbors.push(this.getCell(nx, ny));
          }
        }
      }
      return neighbors;
    }
  }

  // Export to global scope
  window.OccupancyGrid = OccupancyGrid;
  window.GridCell = GridCell;
  window.CELL_TYPE = CELL_TYPE;
  window.TERRAIN_COST = TERRAIN_COST;

  console.log('%c[TIO Occupancy Grid v5.0] Loaded Successfully.', 'color: #10b981;');
})();
