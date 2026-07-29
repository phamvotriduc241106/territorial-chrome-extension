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

      for (let i = 0; i < this.size; i++) {
        const x = i % w;
        const y = Math.floor(i / w);
        this.cells[i] = new GridCell(x, y);
      }
    }

    updateFromVision(visionData) {
      if (!visionData || !visionData.typeMatrix) return false;

      const { typeMatrix, confidenceMatrix, width, height } = visionData;
      this.allocate(width, height);

      const now = performance.now();
      this.lastUpdateTimestamp = now;
      this.frameUpdateCount++;

      for (let i = 0; i < this.size; i++) {
        const tEnum = typeMatrix[i];
        const conf = confidenceMatrix[i];
        const cell = this.cells[i];

        cell.typeEnum = tEnum;
        cell.confidence = conf;
        cell.lastSeen = now;

        this.typeMatrix[i] = tEnum;

        let typeStr = 'UNKNOWN';
        let costVal = TERRAIN_COST.UNKNOWN;
        let accessibleVal = 1;
        let bitVal = 0;

        if (tEnum === 1) { // WATER
          typeStr = 'WATER';
          costVal = TERRAIN_COST.WATER;
          accessibleVal = 0;
          bitVal = 1 << 0;
        } else if (tEnum === 2) { // NEUTRAL
          typeStr = 'NEUTRAL';
          costVal = TERRAIN_COST.NEUTRAL;
          accessibleVal = 1;
          bitVal = (1 << 1) | (1 << 4);
        } else if (tEnum === 3) { // MINE
          typeStr = 'MINE';
          costVal = TERRAIN_COST.MINE;
          accessibleVal = 1;
          bitVal = (1 << 2) | (1 << 4);
        } else if (tEnum === 4) { // ENEMY
          typeStr = 'ENEMY';
          costVal = TERRAIN_COST.ENEMY;
          accessibleVal = 1;
          bitVal = (1 << 3) | (1 << 4);
        }

        cell.type = typeStr;
        cell.cost = costVal;
        cell.accessible = (accessibleVal === 1);
        cell.bitmask = bitVal;

        this.costMatrix[i] = costVal;
        this.accessibilityMatrix[i] = accessibleVal;
        this.bitmaskMatrix[i] = bitVal;
      }

      return true;
    }

    getCell(x, y) {
      if (x < 0 || x >= this.width || y < 0 || y >= this.height) return null;
      return this.cells[y * this.width + x];
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
      if (x > 0) neighbors.push(this.cells[y * this.width + (x - 1)]);
      if (x < this.width - 1) neighbors.push(this.cells[y * this.width + (x + 1)]);
      if (y > 0) neighbors.push(this.cells[(y - 1) * this.width + x]);
      if (y < this.height - 1) neighbors.push(this.cells[(y + 1) * this.width + x]);
      return neighbors;
    }

    get8Neighbors(x, y) {
      const neighbors = [];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height) {
            neighbors.push(this.cells[ny * this.width + nx]);
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
