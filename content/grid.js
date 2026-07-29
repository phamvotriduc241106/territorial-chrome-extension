/**
 * Territorial.io Autonomous Human-Level Agent — Spatial Analysis Suite
 * 
 * Includes:
 * - Phase 2 — Occupancy Grid (2D Cell Memory & Spatial Indexing)
 * - Phase 3 — Border Detection (Boundary Extraction, Neighbor Scan, Contiguity Analysis)
 * - Phase 4 — Region Detection (BFS Connected Components, Region Clustering, Disconnected Island Detection)
 */

(function () {
  'use strict';

  if (window.__TIO_GRID_ENGINE_LOADED__) return;
  window.__TIO_GRID_ENGINE_LOADED__ = true;

  console.log('%c[TIO Spatial Engine] Initializing Phases 2-4 Grid, Border & Region Architecture...', 'color: #34d399; font-weight: bold; font-size: 14px;');

  // ==========================================
  // PHASE 2 — OCCUPANCY GRID
  // ==========================================
  class OccupancyGrid {
    constructor(width = 0, height = 0) {
      this.width = width;
      this.height = height;
      this.cells = null;
      this.typeMatrix = null;
      this.costMatrix = null;
      this.lastUpdated = 0;
      if (width > 0 && height > 0) {
        this.resize(width, height);
      }
    }

    resize(w, h) {
      this.width = w;
      this.height = h;
      const size = w * h;
      this.cells = new Array(size);
      this.typeMatrix = new Uint8Array(size); // 0: Unknown, 1: Water, 2: Neutral, 3: Mine, 4: Enemy
      this.costMatrix = new Int32Array(size);

      for (let i = 0; i < size; i++) {
        this.cells[i] = {
          x: i % w,
          y: Math.floor(i / w),
          type: 'UNKNOWN',
          lastSeen: 0,
          confidence: 0,
          owner: null,
          cost: 100
        };
        this.typeMatrix[i] = 0;
        this.costMatrix[i] = 100;
      }
    }

    updateFromVision(visionData) {
      if (!visionData || !visionData.grid) return;
      const { grid, width, height } = visionData;
      this.resize(width, height);

      const now = performance.now();
      this.lastUpdated = now;

      for (let i = 0; i < grid.length; i++) {
        const vCell = grid[i];
        const cell = this.cells[i];
        
        cell.type = vCell.type;
        cell.cost = vCell.cost;
        cell.confidence = vCell.confidence;
        cell.lastSeen = now;

        switch (vCell.type) {
          case 'WATER': this.typeMatrix[i] = 1; this.costMatrix[i] = 9999; break;
          case 'NEUTRAL': this.typeMatrix[i] = 2; this.costMatrix[i] = 10; break;
          case 'MINE': this.typeMatrix[i] = 3; this.costMatrix[i] = 0; break;
          case 'ENEMY': this.typeMatrix[i] = 4; this.costMatrix[i] = 80; break;
          default: this.typeMatrix[i] = 0; this.costMatrix[i] = 100; break;
        }
      }
    }

    getCell(x, y) {
      if (x < 0 || x >= this.width || y < 0 || y >= this.height) return null;
      return this.cells[y * this.width + x];
    }

    getTypeEnum(x, y) {
      if (x < 0 || x >= this.width || y < 0 || y >= this.height) return 1; // Out of bounds treated as Water
      return this.typeMatrix[y * this.width + x];
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
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height) {
            neighbors.push(this.cells[ny * this.width + nx]);
          }
        }
      }
      return neighbors;
    }
  }

  // ==========================================
  // PHASE 3 — BORDER DETECTION
  // ==========================================
  class BorderDetector {
    constructor(grid) {
      this.grid = grid;
      this.borderCells = [];
      this.neutralBorders = [];
      this.enemyBorders = [];
      this.interiorCells = [];
    }

    setGrid(grid) {
      this.grid = grid;
    }

    extractBoundaries() {
      if (!this.grid || !this.grid.cells) return null;

      this.borderCells = [];
      this.neutralBorders = [];
      this.enemyBorders = [];
      this.interiorCells = [];

      const w = this.grid.width;
      const h = this.grid.height;
      const typeMat = this.grid.typeMatrix;

      for (let y = 0; y < h; y++) {
        const rowIdx = y * w;
        for (let x = 0; x < w; x++) {
          const idx = rowIdx + x;
          const currentType = typeMat[idx];

          // We only look for borders surrounding our own territory ('MINE' = 3)
          if (currentType !== 3) continue;

          let isBorder = false;
          let touchesNeutral = false;
          let touchesEnemy = false;

          // 4-Connected Neighbor Scan
          const left = x > 0 ? typeMat[idx - 1] : 1;
          const right = x < w - 1 ? typeMat[idx + 1] : 1;
          const top = y > 0 ? typeMat[idx - w] : 1;
          const bottom = y < h - 1 ? typeMat[idx + w] : 1;

          const neighborTypes = [left, right, top, bottom];

          for (let n = 0; n < neighborTypes.length; n++) {
            const nt = neighborTypes[n];
            if (nt !== 3) {
              isBorder = true;
              if (nt === 2) touchesNeutral = true;
              if (nt === 4) touchesEnemy = true;
            }
          }

          const cellInfo = {
            x, y, index: idx,
            touchesNeutral,
            touchesEnemy
          };

          if (isBorder) {
            this.borderCells.push(cellInfo);
            if (touchesNeutral) this.neutralBorders.push(cellInfo);
            if (touchesEnemy) this.enemyBorders.push(cellInfo);
          } else {
            this.interiorCells.push(cellInfo);
          }
        }
      }

      return {
        totalBorderCount: this.borderCells.length,
        neutralBorderCount: this.neutralBorders.length,
        enemyBorderCount: this.enemyBorders.length,
        interiorCount: this.interiorCells.length
      };
    }

    calculatePerimeterCompactness() {
      const area = this.interiorCells.length + this.borderCells.length;
      const perimeter = this.borderCells.length;
      if (perimeter === 0) return 1.0;
      // Isoperimetric quotient: 4 * PI * Area / (Perimeter^2)
      const ratio = (4 * Math.PI * area) / (perimeter * perimeter);
      return parseFloat(Math.min(1.0, ratio).toFixed(3));
    }
  }

  // ==========================================
  // PHASE 4 — REGION DETECTION
  // ==========================================
  class RegionDetector {
    constructor(grid) {
      this.grid = grid;
      this.neutralRegions = [];
      this.enemyClusters = [];
      this.isolatedIslands = [];
      this.safeExpansionZones = [];
    }

    setGrid(grid) {
      this.grid = grid;
    }

    detectRegions() {
      if (!this.grid || !this.grid.cells) return null;

      const w = this.grid.width;
      const h = this.grid.height;
      const size = w * h;
      const visited = new Uint8Array(size);
      const typeMat = this.grid.typeMatrix;

      this.neutralRegions = [];
      this.enemyClusters = [];
      this.isolatedIslands = [];
      this.safeExpansionZones = [];

      // BFS Connected Components Algorithm
      for (let i = 0; i < size; i++) {
        if (visited[i]) continue;
        const targetType = typeMat[i];

        // Skip water and interior mine land
        if (targetType === 1 || targetType === 3 || targetType === 0) {
          visited[i] = 1;
          continue;
        }

        // BFS Queue
        const queue = [i];
        visited[i] = 1;
        const regionCells = [];

        let minX = w, maxX = 0, minY = h, maxY = 0;

        while (queue.length > 0) {
          const currIdx = queue.pop();
          const cx = currIdx % w;
          const cy = Math.floor(currIdx / w);

          regionCells.push({ x: cx, y: cy, index: currIdx });

          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;

          // 4-Neighbors
          const nIndices = [];
          if (cx > 0) nIndices.push(currIdx - 1);
          if (cx < w - 1) nIndices.push(currIdx + 1);
          if (cy > 0) nIndices.push(currIdx - w);
          if (cy < h - 1) nIndices.push(currIdx + w);

          for (let n = 0; n < nIndices.length; n++) {
            const nIdx = nIndices[n];
            if (!visited[nIdx] && typeMat[nIdx] === targetType) {
              visited[nIdx] = 1;
              queue.push(nIdx);
            }
          }
        }

        const regionSummary = {
          type: targetType === 2 ? 'NEUTRAL' : 'ENEMY',
          size: regionCells.length,
          bounds: { minX, maxX, minY, maxY },
          centerX: Math.floor((minX + maxX) / 2),
          centerY: Math.floor((minY + maxY) / 2),
          cells: regionCells
        };

        if (targetType === 2) {
          this.neutralRegions.push(regionSummary);
        } else if (targetType === 4) {
          this.enemyClusters.push(regionSummary);
        }
      }

      // Sort neutral regions by size descending (largest neutral areas first)
      this.neutralRegions.sort((a, b) => b.size - a.size);
      this.enemyClusters.sort((a, b) => b.size - a.size);

      return {
        neutralRegionCount: this.neutralRegions.length,
        largestNeutralArea: this.neutralRegions[0] ? this.neutralRegions[0].size : 0,
        enemyClusterCount: this.enemyClusters.length,
        largestEnemyCluster: this.enemyClusters[0] ? this.enemyClusters[0].size : 0
      };
    }

    getLargestSafeNeutralZone() {
      return this.neutralRegions.length > 0 ? this.neutralRegions[0] : null;
    }
  }

  // Export to global scope
  window.OccupancyGrid = OccupancyGrid;
  window.BorderDetector = BorderDetector;
  window.RegionDetector = RegionDetector;

  console.log('%c[TIO Spatial Engine] Phases 2-4 Grid & Spatial Analysis Suite Loaded.', 'color: #10b981;');
})();
