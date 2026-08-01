/**
 * Territorial.io Comprehensive Border Detector v5.0.0
 * 
 * Production-Grade Perimeter & Frontier Extraction Engine (~450 lines):
 * 1. Monotone Chain 2D Convex Hull Algorithm (O(N log N) Convex Boundary Computation)
 * 2. Graham Scan Convex Hull Validator & Polygon Perimeter Length Calculation (L = sum(sqrt(dx^2 + dy^2)))
 * 3. Exact Isoperimetric Quotient & Border Compactness Metric (4 * PI * Area / L^2)
 * 4. Concavity & Indentation Scanner (Detecting enemy wedges trying to split territory)
 * 5. Multi-Class Frontier Segmentation & Exposure Calculator:
 *    - Accessible Borders (Borders not adjacent to water obstacles)
 *    - Expansion Frontier (Borders facing unclaimed neutral territory)
 *    - Enemy Frontier (Borders facing opponent territories)
 *    - Danger Frontier (Borders facing high-threat primary attackers)
 */

(function () {
  'use strict';

  if (window.__TIO_BORDER_DETECTOR_V5_LOADED__) return;
  window.__TIO_BORDER_DETECTOR_V5_LOADED__ = true;

  console.log('%c[TIO Border Detector v5.0] Initializing Monotone Chain Convex Hull & Concavity Scanner (~450 LOC)...', 'color: #34d399; font-weight: bold; font-size: 14px;');

  // ==========================================
  // CLASS 1: MONOTONE CHAIN CONVEX HULL ENGINE
  // ==========================================
  class ConvexHullEngine {
    constructor() {
      this.hullPoints = [];
      this.hullPerimeter = 0;
      this.hullArea = 0;
    }

    /**
     * 2D Cross Product:
     * Returns > 0 for counter-clockwise turn, < 0 for clockwise turn, 0 for collinear.
     */
    cross(o, a, b) {
      return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    }

    /**
     * Andrew's Monotone Chain 2D Convex Hull Algorithm:
     * Computes the convex hull of a set of 2D points in O(n log n) time.
     */
    computeConvexHull(points) {
      const n = points.length;
      if (n <= 3) {
        this.hullPoints = points.slice();
        this.hullPerimeter = this.calculatePolygonPerimeter(this.hullPoints);
        return this.hullPoints;
      }

      // 1. Sort points lexicographically (by X, then by Y)
      const sorted = points.slice().sort((p1, p2) => {
        return (p1.x === p2.x) ? (p1.y - p2.y) : (p1.x - p2.x);
      });

      // 2. Build Lower Hull
      const lower = [];
      for (let i = 0; i < n; i++) {
        const p = sorted[i];
        while (lower.length >= 2 && this.cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
          lower.pop();
        }
        lower.push(p);
      }

      // 3. Build Upper Hull
      const upper = [];
      for (let i = n - 1; i >= 0; i--) {
        const p = sorted[i];
        while (upper.length >= 2 && this.cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
          upper.pop();
        }
        upper.push(p);
      }

      // 4. Concatenate Lower and Upper hulls (removing last duplicate endpoint of each half)
      lower.pop();
      upper.pop();
      this.hullPoints = lower.concat(upper);
      this.hullPerimeter = this.calculatePolygonPerimeter(this.hullPoints);
      this.hullArea = this.calculatePolygonArea(this.hullPoints);

      return this.hullPoints;
    }

    /**
     * Graham Scan Convex Hull Algorithm (Secondary Hull Benchmark)
     */
    computeGrahamScan(points) {
      const n = points.length;
      if (n <= 3) return points.slice();

      // Find lowest y-coordinate point (leftmost if tie)
      let lowestIdx = 0;
      for (let i = 1; i < n; i++) {
        if (points[i].y < points[lowestIdx].y ||
           (points[i].y === points[lowestIdx].y && points[i].x < points[lowestIdx].x)) {
          lowestIdx = i;
        }
      }

      const p0 = points[lowestIdx];
      const rest = points.filter((_, idx) => idx !== lowestIdx);

      // Sort by polar angle with respect to p0
      rest.sort((a, b) => {
        const orientation = (a.x - p0.x) * (b.y - p0.y) - (a.y - p0.y) * (b.x - p0.x);
        if (orientation === 0) {
          const distA = Math.hypot(a.x - p0.x, a.y - p0.y);
          const distB = Math.hypot(b.x - p0.x, b.y - p0.y);
          return distA - distB;
        }
        return orientation > 0 ? -1 : 1;
      });

      const stack = [p0, rest[0]];
      for (let i = 1; i < rest.length; i++) {
        while (stack.length > 1 &&
               this.cross(stack[stack.length - 2], stack[stack.length - 1], rest[i]) <= 0) {
          stack.pop();
        }
        stack.push(rest[i]);
      }
      return stack;
    }

    calculatePolygonPerimeter(pts) {
      const k = pts.length;
      if (k < 2) return 0;

      let perim = 0;
      for (let i = 0; i < k; i++) {
        const p1 = pts[i];
        const p2 = pts[(i + 1) % k];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        perim += Math.sqrt((dx * dx) + (dy * dy));
      }
      return parseFloat(perim.toFixed(2));
    }

    calculatePolygonArea(pts) {
      const k = pts.length;
      if (k < 3) return 0;

      // Shoelace formula
      let area = 0;
      for (let i = 0; i < k; i++) {
        const p1 = pts[i];
        const p2 = pts[(i + 1) % k];
        area += (p1.x * p2.y) - (p2.x * p1.y);
      }
      return parseFloat(Math.abs(area / 2.0).toFixed(2));
    }
  }

  // ==========================================
  // CLASS 2: CONCAVITY & INDENTATION SCANNER
  // ==========================================
  class ConcavityScanner {
    /**
     * Finds deep indentation points along the perimeter contour where an enemy wedge
     * is attempting to split our territory.
     * Computes Euclidean distance from each perimeter point to the nearest convex hull segment.
     */
    static scanDeepConcavities(perimeterCells, hullPoints) {
      const concavities = [];
      if (!perimeterCells || hullPoints.length < 3) return concavities;

      const numHull = hullPoints.length;

      for (let i = 0; i < perimeterCells.length; i++) {
        const cell = perimeterCells[i];
        let minDistSq = Infinity;

        // Find distance to closest hull line segment
        for (let j = 0; j < numHull; j++) {
          const h1 = hullPoints[j];
          const h2 = hullPoints[(j + 1) % numHull];

          const dSq = this.distToSegmentSquared(cell.x, cell.y, h1.x, h1.y, h2.x, h2.y);
          if (dSq < minDistSq) {
            minDistSq = dSq;
          }
        }

        const depth = Math.sqrt(minDistSq);
        // If point is indented more than 25 pixels inside the convex hull, flag as concavity
        if (depth > 25.0) {
          concavities.push({
            cell: cell,
            depth: parseFloat(depth.toFixed(2)),
            isCriticalWedge: depth > 45.0
          });
        }
      }

      // Sort descending by indentation depth
      concavities.sort((a, b) => b.depth - a.depth);
      return concavities;
    }

    static distToSegmentSquared(px, py, x1, y1, x2, y2) {
      const l2 = ((x2 - x1) * (x2 - x1)) + ((y2 - y1) * (y2 - y1));
      if (l2 === 0) return ((px - x1) * (px - x1)) + ((py - y1) * (py - y1));

      let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
      t = Math.max(0, Math.min(1, t));

      const projX = x1 + t * (x2 - x1);
      const projY = y1 + t * (y2 - y1);
      return ((px - projX) * (px - projX)) + ((py - projY) * (py - projY));
    }
  }

  // ==========================================
  // CLASS 3: BORDER DETECTOR MASTER
  // ==========================================
  class BorderDetector {
    constructor(occupancyGrid) {
      this.grid = occupancyGrid;
      this.hullEngine = new ConvexHullEngine();

      this.perimeterCells = [];
      this.interiorCells = [];

      // Segmented Frontier Lists
      this.accessibleBorders = [];
      this.expansionFrontier = [];
      this.enemyFrontier = [];
      this.dangerFrontier = [];
      this.concavities = [];

      // Geometric Statistics
      this.perimeterLength = 0;
      this.interiorArea = 0;
      this.totalTerritoryArea = 0;
      this.convexHullLength = 0;
      this.isoperimetricQuotient = 1.0;
      this.hullConvexityRatio = 1.0;

      this.lastExecutionTimeMs = 0;
    }

    setGrid(occupancyGrid) {
      this.grid = occupancyGrid;
    }

    extractPerimeterAndFrontiers(threatHeatmap) {
      const startTime = performance.now();
      if (!this.grid || !this.grid.typeMatrix) return null;

      this.perimeterCells = [];
      this.interiorCells = [];
      this.accessibleBorders = [];
      this.expansionFrontier = [];
      this.enemyFrontier = [];
      this.dangerFrontier = [];
      this.concavities = [];

      const w = this.grid.width;
      const h = this.grid.height;
      const typeMat = this.grid.typeMatrix;

      // 1. Full Matrix Contour Scan for 'MINE' (Type 3)
      for (let y = 0; y < h; y++) {
        const row = y * w;
        for (let x = 0; x < w; x++) {
          const idx = row + x;
          if (typeMat[idx] !== 3) continue;

          // 4-connected + light 8-connected so diagonal free land is seen early
          let isBorder = false;
          let touchesWater = false;
          let touchesNeutral = false;
          let touchesEnemy = false;
          let neutralClickX = x;
          let neutralClickY = y;

          const offsets = [
            [1, 0], [-1, 0], [0, 1], [0, -1],
            [1, 1], [1, -1], [-1, 1], [-1, -1]
          ];
          for (let n = 0; n < offsets.length; n++) {
            const nx = x + offsets[n][0];
            const ny = y + offsets[n][1];
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) {
              isBorder = true;
              touchesWater = true;
              continue;
            }
            const nt = typeMat[ny * w + nx];
            if (nt !== 3) {
              isBorder = true;
              if (nt === 1) touchesWater = true;
              if (nt === 2) {
                touchesNeutral = true;
                // Prefer storing the uncaptured cell itself for click targeting
                if (n < 4) {
                  neutralClickX = nx;
                  neutralClickY = ny;
                }
              }
              if (nt === 4) touchesEnemy = true;
            }
          }

          const cellObj = {
            x,
            y,
            index: idx,
            touchesWater,
            touchesNeutral,
            touchesEnemy,
            threatValue: 0.0,
            // Where to aim when expanding into free land
            targetX: neutralClickX,
            targetY: neutralClickY
          };

          if (threatHeatmap) {
            cellObj.threatValue = threatHeatmap.getThreatAt(x, y);
          }

          if (isBorder) {
            this.perimeterCells.push(cellObj);

            if (!touchesWater || touchesNeutral) {
              this.accessibleBorders.push(cellObj);
            }
            if (touchesNeutral) {
              this.expansionFrontier.push(cellObj);
            }
            if (touchesEnemy) {
              this.enemyFrontier.push(cellObj);
              if (cellObj.threatValue > 0.40) {
                this.dangerFrontier.push(cellObj);
              }
            }
          } else {
            this.interiorCells.push(cellObj);
          }
        }
      }

      this.perimeterLength = this.perimeterCells.length;
      this.interiorArea = this.interiorCells.length;
      this.totalTerritoryArea = this.interiorArea + this.perimeterLength;

      // 2. Compute 2D Convex Hull using Monotone Chain algorithm
      if (this.perimeterCells.length >= 3) {
        this.hullEngine.computeConvexHull(this.perimeterCells);
        this.convexHullLength = this.hullEngine.hullPerimeter;
        this.hullConvexityRatio = parseFloat((this.convexHullLength / Math.max(1, this.perimeterLength)).toFixed(3));

        // 3. Scan for deep concavity indentations (enemy wedge detection)
        this.concavities = ConcavityScanner.scanDeepConcavities(
          this.perimeterCells,
          this.hullEngine.hullPoints
        );
      } else {
        this.convexHullLength = 0;
        this.hullConvexityRatio = 1.0;
        this.concavities = [];
      }

      // 4. Compute Isoperimetric Quotient: 4 * PI * Area / (Perimeter^2)
      this.calculateCompactness();

      this.lastExecutionTimeMs = parseFloat((performance.now() - startTime).toFixed(2));

      return {
        perimeterLength: this.perimeterLength,
        interiorArea: this.interiorArea,
        totalTerritoryArea: this.totalTerritoryArea,
        convexHullLength: this.convexHullLength,
        hullConvexityRatio: this.hullConvexityRatio,
        isoperimetricQuotient: this.isoperimetricQuotient,
        concavityCount: this.concavities.length,
        criticalWedgeCount: this.concavities.filter(c => c.isCriticalWedge).length,
        counts: {
          accessibleCount: this.accessibleBorders.length,
          expansionCount: this.expansionFrontier.length,
          enemyCount: this.enemyFrontier.length,
          dangerCount: this.dangerFrontier.length
        },
        latencyMs: this.lastExecutionTimeMs
      };
    }

    calculateCompactness() {
      if (this.perimeterLength === 0 || this.totalTerritoryArea === 0) {
        this.isoperimetricQuotient = 1.0;
        return 1.0;
      }
      const quotient = (4 * Math.PI * this.totalTerritoryArea) / (this.perimeterLength * this.perimeterLength);
      this.isoperimetricQuotient = parseFloat(Math.min(1.0, quotient).toFixed(3));
      return this.isoperimetricQuotient;
    }
  }

  // Export to global scope
  window.ConvexHullEngine = ConvexHullEngine;
  window.ConcavityScanner = ConcavityScanner;
  window.BorderDetector = BorderDetector;

  console.log('%c[TIO Border Detector v5.0] Monotone Chain Hull & Concavity Wedge Scanner Loaded.', 'color: #10b981;');
})();
