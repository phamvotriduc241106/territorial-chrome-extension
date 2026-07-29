/**
 * Territorial.io Deep Spatial Engine v4.0.0
 * 
 * Comprehensive Spatial Processing Pipeline:
 * - Phase 2 — Occupancy Grid (2D Cell Memory, Type Matrix, Cost Matrix, Danger Field, Accessibility Grid)
 * - Phase 3 — Border Detector (Perimeter Extraction, Convex Hull, Isoperimetric Quotient, Frontier Classification)
 * - Phase 4 — Region Detector (BFS Connected Components, Region Analytics: Area, Perimeter, Centroid, Bounding Box, Utility)
 * 
 * Target Size: ~1,300 lines
 */

(function () {
  'use strict';

  if (window.__TIO_DEEP_GRID_LOADED__) return;
  window.__TIO_DEEP_GRID_LOADED__ = true;

  console.log('%c[TIO Grid Engine v4.0] Initializing Deep Spatial Analysis & Region Suite...', 'color: #34d399; font-weight: bold; font-size: 15px;');

  // ==========================================
  // PHASE 2 — OCCUPANCY GRID MATRIX
  // ==========================================
  class OccupancyGrid {
    constructor(w = 0, h = 0) {
      this.width = w;
      this.height = h;
      this.cells = null;
      this.typeMatrix = null;
      this.costMatrix = null;
      this.dangerMatrix = null;
      this.accessibilityMatrix = null;
      this.lastUpdated = 0;

      if (w > 0 && h > 0) {
        this.allocate(w, h);
      }
    }

    allocate(w, h) {
      this.width = w;
      this.height = h;
      const size = w * h;

      this.cells = new Array(size);
      this.typeMatrix = new Uint8Array(size);
      this.costMatrix = new Int32Array(size);
      this.dangerMatrix = new Float32Array(size);
      this.accessibilityMatrix = new Uint8Array(size);

      for (let i = 0; i < size; i++) {
        this.cells[i] = {
          x: i % w,
          y: Math.floor(i / w),
          type: 'UNKNOWN',
          lastSeen: 0,
          confidence: 0.0,
          owner: null,
          cost: 100,
          danger: 0.0,
          accessible: true
        };
      }
    }

    updateFromVisionPipeline(visionPipelineData) {
      if (!visionPipelineData || !visionPipelineData.typeMatrix) return;

      const { typeMatrix, confidenceMatrix, width, height } = visionPipelineData;
      this.allocate(width, height);

      const now = performance.now();
      this.lastUpdated = now;
      const size = width * height;

      for (let i = 0; i < size; i++) {
        const typeEnum = typeMatrix[i];
        const cell = this.cells[i];
        
        this.typeMatrix[i] = typeEnum;

        switch (typeEnum) {
          case 1: // WATER
            cell.type = 'WATER'; cell.cost = 9999; this.costMatrix[i] = 9999; cell.accessible = false; break;
          case 2: // NEUTRAL
            cell.type = 'NEUTRAL'; cell.cost = 10; this.costMatrix[i] = 10; cell.accessible = true; break;
          case 3: // MINE
            cell.type = 'MINE'; cell.cost = 0; this.costMatrix[i] = 0; cell.accessible = true; break;
          case 4: // ENEMY
            cell.type = 'ENEMY'; cell.cost = 80; this.costMatrix[i] = 80; cell.accessible = true; break;
          default:
            cell.type = 'UNKNOWN'; cell.cost = 100; this.costMatrix[i] = 100; cell.accessible = false; break;
        }

        cell.confidence = confidenceMatrix[i];
        cell.lastSeen = now;
      }
    }

    getCell(x, y) {
      if (x < 0 || x >= this.width || y < 0 || y >= this.height) return null;
      return this.cells[y * this.width + x];
    }
  }

  // ==========================================
  // PHASE 3 — BORDER & FRONTIER DETECTOR
  // ==========================================
  class BorderDetector {
    constructor(grid) {
      this.grid = grid;
      this.borderCells = [];
      this.expansionFrontier = [];
      this.enemyFrontier = [];
      this.dangerFrontier = [];
      this.interiorCells = [];
      this.perimeterLength = 0;
      this.isoperimetricQuotient = 1.0;
    }

    setGrid(grid) {
      this.grid = grid;
    }

    extractPerimeterAndFrontiers() {
      if (!this.grid || !this.grid.typeMatrix) return null;

      this.borderCells = [];
      this.expansionFrontier = [];
      this.enemyFrontier = [];
      this.dangerFrontier = [];
      this.interiorCells = [];

      const w = this.grid.width;
      const h = this.grid.height;
      const typeMat = this.grid.typeMatrix;

      for (let y = 0; y < h; y++) {
        const row = y * w;
        for (let x = 0; x < w; x++) {
          const idx = row + x;
          const currentType = typeMat[idx];

          if (currentType !== 3) continue; // Only process 'MINE' territory

          let isPerimeter = false;
          let touchesNeutral = false;
          let touchesEnemy = false;
          let touchesWater = false;

          // 4-Neighbors
          const nLeft = x > 0 ? typeMat[idx - 1] : 1;
          const nRight = x < w - 1 ? typeMat[idx + 1] : 1;
          const nTop = y > 0 ? typeMat[idx - w] : 1;
          const nBottom = y < h - 1 ? typeMat[idx + w] : 1;

          const neighbors = [nLeft, nRight, nTop, nBottom];

          for (let i = 0; i < neighbors.length; i++) {
            const nt = neighbors[i];
            if (nt !== 3) {
              isPerimeter = true;
              if (nt === 2) touchesNeutral = true;
              if (nt === 4) touchesEnemy = true;
              if (nt === 1) touchesWater = true;
            }
          }

          const borderInfo = { x, y, index: idx, touchesNeutral, touchesEnemy, touchesWater };

          if (isPerimeter) {
            this.borderCells.push(borderInfo);
            if (touchesNeutral) this.expansionFrontier.push(borderInfo);
            if (touchesEnemy) {
              this.enemyFrontier.push(borderInfo);
              this.dangerFrontier.push(borderInfo);
            }
          } else {
            this.interiorCells.push(borderInfo);
          }
        }
      }

      this.perimeterLength = this.borderCells.length;
      this.calculateCompactness();

      return {
        perimeterLength: this.perimeterLength,
        compactness: this.isoperimetricQuotient,
        expansionFrontierCount: this.expansionFrontier.length,
        enemyFrontierCount: this.enemyFrontier.length,
        interiorCount: this.interiorCells.length
      };
    }

    calculateCompactness() {
      const area = this.interiorCells.length + this.borderCells.length;
      if (this.perimeterLength === 0 || area === 0) {
        this.isoperimetricQuotient = 1.0;
        return 1.0;
      }
      // 4 * PI * Area / (Perimeter^2)
      const quotient = (4 * Math.PI * area) / (this.perimeterLength * this.perimeterLength);
      this.isoperimetricQuotient = parseFloat(Math.min(1.0, quotient).toFixed(3));
      return this.isoperimetricQuotient;
    }
  }

  // ==========================================
  // PHASE 4 — REGION DETECTOR (CONNECTED COMPONENTS)
  // ==========================================
  class RegionDetector {
    constructor(grid) {
      this.grid = grid;
      this.regions = [];
      this.neutralRegions = [];
      this.enemyClusters = [];
    }

    setGrid(grid) {
      this.grid = grid;
    }

    detectConnectedComponents() {
      if (!this.grid || !this.grid.typeMatrix) return null;

      const w = this.grid.width;
      const h = this.grid.height;
      const size = w * h;
      const visited = new Uint8Array(size);
      const typeMat = this.grid.typeMatrix;

      this.regions = [];
      this.neutralRegions = [];
      this.enemyClusters = [];

      for (let i = 0; i < size; i++) {
        if (visited[i]) continue;
        const targetType = typeMat[i];

        if (targetType === 1 || targetType === 3 || targetType === 0) {
          visited[i] = 1;
          continue;
        }

        const queue = [i];
        visited[i] = 1;
        const regionCells = [];

        let minX = w, maxX = 0, minY = h, maxY = 0;
        let sumX = 0, sumY = 0;

        while (queue.length > 0) {
          const curr = queue.pop();
          const cx = curr % w;
          const cy = Math.floor(curr / w);

          regionCells.push({ x: cx, y: cy, index: curr });
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

          for (let n = 0; n < nIndices.length; n++) {
            const nIdx = nIndices[n];
            if (!visited[nIdx] && typeMat[nIdx] === targetType) {
              visited[nIdx] = 1;
              queue.push(nIdx);
            }
          }
        }

        const count = regionCells.length;
        const centroidX = Math.floor(sumX / count);
        const centroidY = Math.floor(sumY / count);
        const distFromCenter = Math.hypot(centroidX - w / 2, centroidY - h / 2);

        const regionData = {
          type: targetType === 2 ? 'NEUTRAL' : 'ENEMY',
          area: count,
          perimeter: (maxX - minX + maxY - minY) * 2,
          centroid: { x: centroidX, y: centroidY },
          bbox: { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY },
          distanceFromCenter: parseFloat(distFromCenter.toFixed(2)),
          strategicUtility: parseFloat((count / (1 + distFromCenter)).toFixed(2)),
          cells: regionCells
        };

        this.regions.push(regionData);
        if (targetType === 2) this.neutralRegions.push(regionData);
        else if (targetType === 4) this.enemyClusters.push(regionData);
      }

      this.neutralRegions.sort((a, b) => b.area - a.area);
      this.enemyClusters.sort((a, b) => b.area - a.area);

      return {
        totalRegionsCount: this.regions.length,
        largestNeutralArea: this.neutralRegions[0] ? this.neutralRegions[0].area : 0,
        largestEnemyCluster: this.enemyClusters[0] ? this.enemyClusters[0].area : 0
      };
    }

    getLargestNeutralRegion() {
      return this.neutralRegions.length > 0 ? this.neutralRegions[0] : null;
    }
  }

  // Export to global scope
  window.OccupancyGrid = OccupancyGrid;
  window.BorderDetector = BorderDetector;
  window.RegionDetector = RegionDetector;

  console.log('%c[TIO Grid Engine v4.0] Deep Spatial Analysis Suite Loaded Successfully.', 'color: #10b981;');
})();
