/**
 * Territorial.io Comprehensive Pathfinding Engine v5.0.0
 * 
 * Production-Grade Min-Heap A* Search & Reachability Verification Engine (~400 lines):
 * 1. High-Performance Min-Heap Priority Queue for O(log N) extraction
 * 2. Complete A* Priority Queue Pathfinding over Occupancy Grid:
 *    fCost = gCost + hCost (Manhattan / Euclidean heuristic)
 * 3. Water Obstacle Avoidance & Danger Terrain Penalty Weights
 * 4. Path Worthiness Verification (isWorthIt API: comparing path cost against target utility)
 */

(function () {
  'use strict';

  if (window.__TIO_PATHFINDING_ENGINE_V5_LOADED__) return;
  window.__TIO_PATHFINDING_ENGINE_V5_LOADED__ = true;

  console.log('%c[TIO Pathfinding Engine v5.0] Initializing Min-Heap A* Priority Queue & Path Worthiness API (~400 LOC)...', 'color: #34d399; font-weight: bold; font-size: 14px;');

  // ==========================================
  // CLASS 1: MIN-HEAP PRIORITY QUEUE
  // ==========================================
  class MinHeap {
    constructor() {
      this.heap = [];
    }

    push(item) {
      this.heap.push(item);
      this.bubbleUp(this.heap.length - 1);
    }

    pop() {
      if (this.heap.length === 0) return null;
      const top = this.heap[0];
      const bottom = this.heap.pop();
      if (this.heap.length > 0) {
        this.heap[0] = bottom;
        this.sinkDown(0);
      }
      return top;
    }

    size() {
      return this.heap.length;
    }

    bubbleUp(idx) {
      const item = this.heap[idx];
      while (idx > 0) {
        const parentIdx = Math.floor((idx - 1) / 2);
        const parent = this.heap[parentIdx];
        if (item.fCost >= parent.fCost) break;
        this.heap[idx] = parent;
        this.heap[parentIdx] = item;
        idx = parentIdx;
      }
    }

    sinkDown(idx) {
      const length = this.heap.length;
      const item = this.heap[idx];
      while (true) {
        let leftIdx = (2 * idx) + 1;
        let rightIdx = (2 * idx) + 2;
        let smallestIdx = idx;

        if (leftIdx < length && this.heap[leftIdx].fCost < this.heap[smallestIdx].fCost) {
          smallestIdx = leftIdx;
        }
        if (rightIdx < length && this.heap[rightIdx].fCost < this.heap[smallestIdx].fCost) {
          smallestIdx = rightIdx;
        }
        if (smallestIdx === idx) break;

        const tmp = this.heap[idx];
        this.heap[idx] = this.heap[smallestIdx];
        this.heap[smallestIdx] = tmp;
        idx = smallestIdx;
      }
    }
  }

  // ==========================================
  // CLASS 2: PATH NODE PROFILE
  // ==========================================
  class PathNode {
    constructor(x, y, index, gCost, hCost, parentIndex) {
      this.x = x;
      this.y = y;
      this.index = index;
      this.gCost = gCost;
      this.hCost = hCost;
      this.fCost = gCost + hCost;
      this.parentIndex = parentIndex;
    }
  }

  // ==========================================
  // CLASS 3: A* PATHFINDING MASTER ENGINE
  // ==========================================
  class PathfindingEngine {
    constructor(occupancyGrid) {
      this.grid = occupancyGrid;
      this.openSet = new MinHeap();
      this.gCostMap = null;
      this.parentMap = null;
      this.visitedMap = null;
      this.lastExecutionTimeMs = 0;
    }

    setGrid(occupancyGrid) {
      this.grid = occupancyGrid;
    }

    allocate(size) {
      if (!this.gCostMap || this.gCostMap.length !== size) {
        this.gCostMap = new Float32Array(size);
        this.parentMap = new Int32Array(size);
        this.visitedMap = new Uint8Array(size);
      } else {
        this.gCostMap.fill(1e9);
        this.parentMap.fill(-1);
        this.visitedMap.fill(0);
      }
    }

    /**
     * Complete A* Pathfinding Search over Occupancy Grid.
     * Returns ordered coordinate path array from start to target, or null if unreachable.
     */
    findPath(startX, startY, targetX, targetY, maxSearchNodes = 3000) {
      const startTime = performance.now();
      if (!this.grid || !this.grid.typeMatrix) return null;

      const w = this.grid.width;
      const h = this.grid.height;
      const size = w * h;
      const startIdx = startY * w + startX;
      const targetIdx = targetY * w + targetX;

      if (startIdx < 0 || startIdx >= size || targetIdx < 0 || targetIdx >= size) {
        return null;
      }

      this.allocate(size);
      this.openSet = new MinHeap();

      const startH = Math.abs(targetX - startX) + Math.abs(targetY - startY);
      this.openSet.push(new PathNode(startX, startY, startIdx, 0, startH, -1));
      this.gCostMap[startIdx] = 0;

      let searchedCount = 0;

      while (this.openSet.size() > 0 && searchedCount < maxSearchNodes) {
        searchedCount++;
        const curr = this.openSet.pop();

        if (curr.index === targetIdx) {
          // Reconstruct path
          const path = [];
          let idx = targetIdx;
          while (idx !== -1 && idx !== startIdx) {
            const px = idx % w;
            const py = Math.floor(idx / w);
            path.unshift({ x: px, y: py, index: idx });
            idx = this.parentMap[idx];
          }
          this.lastExecutionTimeMs = parseFloat((performance.now() - startTime).toFixed(2));
          return {
            path: path,
            totalCost: curr.gCost,
            searchedNodes: searchedCount,
            reachable: true,
            latencyMs: this.lastExecutionTimeMs
          };
        }

        this.visitedMap[curr.index] = 1;

        // Check 4-connected neighbors
        const nOffsets = [
          { dx: -1, dy: 0, cost: 1.0 },
          { dx: 1, dy: 0, cost: 1.0 },
          { dx: 0, dy: -1, cost: 1.0 },
          { dx: 0, dy: 1, cost: 1.0 }
        ];

        for (let i = 0; i < nOffsets.length; i++) {
          const nx = curr.x + nOffsets[i].dx;
          const ny = curr.y + nOffsets[i].dy;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;

          const nIdx = ny * w + nx;
          if (this.visitedMap[nIdx] || !this.grid.isAccessible(nx, ny)) continue;

          const stepCost = nOffsets[i].cost + (this.grid.getCost(nx, ny) * 0.1);
          const tentativeG = curr.gCost + stepCost;

          if (tentativeG < this.gCostMap[nIdx]) {
            this.gCostMap[nIdx] = tentativeG;
            this.parentMap[nIdx] = curr.index;

            const hCost = Math.abs(targetX - nx) + Math.abs(targetY - ny);
            this.openSet.push(new PathNode(nx, ny, nIdx, tentativeG, hCost, curr.index));
          }
        }
      }

      this.lastExecutionTimeMs = parseFloat((performance.now() - startTime).toFixed(2));
      return {
        path: null,
        totalCost: Infinity,
        searchedNodes: searchedCount,
        reachable: false,
        latencyMs: this.lastExecutionTimeMs
      };
    }

    /**
     * Path Worthiness Verification (isWorthIt API).
     * Utility scores are typically in ~0.2–1.5 range (not 0–100).
     */
    isWorthIt(pathResult, targetUtilityScore) {
      if (!pathResult || !pathResult.reachable) {
        return { worthy: false, reason: 'UNREACHABLE' };
      }
      // Adjacent / very short path: always ok
      if (!pathResult.path || pathResult.path.length <= 2) {
        return { worthy: true, reason: 'ADJACENT' };
      }
      const util = (typeof targetUtilityScore === 'number') ? targetUtilityScore : 0.5;
      const costPerStep = pathResult.totalCost / Math.max(1, pathResult.path.length);
      if (pathResult.path.length > 80 && util < 0.4) {
        return { worthy: false, reason: 'TOO_FAR' };
      }
      if (costPerStep > 8.0 && util < 0.35) {
        return { worthy: false, reason: 'COST_EXCEEDS_UTILITY' };
      }
      return { worthy: true, reason: 'OPTIMAL_PATH' };
    }

    /**
     * Cheap flood: is target adjacent to any MINE (type 3) cell?
     * Prefer this for expansion clicks instead of full A* every frame.
     */
    isAdjacentToMine(targetX, targetY) {
      if (!this.grid || !this.grid.typeMatrix) return false;
      const w = this.grid.width;
      const h = this.grid.height;
      const tx = Math.floor(targetX);
      const ty = Math.floor(targetY);
      if (tx < 0 || ty < 0 || tx >= w || ty >= h) return false;

      const offsets = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
      for (let i = 0; i < offsets.length; i++) {
        const nx = tx + offsets[i][0];
        const ny = ty + offsets[i][1];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (this.grid.typeMatrix[ny * w + nx] === 3) return true;
      }
      return false;
    }

    /**
     * BFS reachability from nearest MINE cell near start to target (non-water).
     */
    isReachableFromMine(startX, startY, targetX, targetY, maxNodes = 2500) {
      if (!this.grid || !this.grid.typeMatrix) return false;
      const w = this.grid.width;
      const h = this.grid.height;
      const size = w * h;
      const sx = Math.max(0, Math.min(w - 1, Math.floor(startX)));
      const sy = Math.max(0, Math.min(h - 1, Math.floor(startY)));
      const tx = Math.max(0, Math.min(w - 1, Math.floor(targetX)));
      const ty = Math.max(0, Math.min(h - 1, Math.floor(targetY)));

      // Fast path: target next to mine
      if (this.isAdjacentToMine(tx, ty)) return true;

      const visited = new Uint8Array(size);
      const queue = new Int32Array(Math.min(maxNodes + 8, size));
      let head = 0;
      let tail = 0;

      // Seed: any mine in a small window around start, else scan all mine (capped)
      const seed = sy * w + sx;
      queue[tail++] = seed;
      visited[seed] = 1;

      // Also seed known mine near start
      for (let dy = -8; dy <= 8; dy++) {
        for (let dx = -8; dx <= 8; dx++) {
          const nx = sx + dx;
          const ny = sy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const idx = ny * w + nx;
          if (this.grid.typeMatrix[idx] === 3 && !visited[idx]) {
            visited[idx] = 1;
            queue[tail++] = idx;
          }
        }
      }

      let explored = 0;
      while (head < tail && explored < maxNodes) {
        const curr = queue[head++];
        explored++;
        const cx = curr % w;
        const cy = (curr / w) | 0;
        if (cx === tx && cy === ty) return true;

        const nbs = [curr - 1, curr + 1, curr - w, curr + w];
        for (let i = 0; i < 4; i++) {
          const nIdx = nbs[i];
          if (nIdx < 0 || nIdx >= size || visited[nIdx]) continue;
          const nx = nIdx % w;
          const ny = (nIdx / w) | 0;
          // stay 4-connected correctly on row wrap
          if (Math.abs(nx - cx) + Math.abs(ny - cy) !== 1) continue;
          const t = this.grid.typeMatrix[nIdx];
          if (t === 1 || t === 0) continue; // water / unknown
          visited[nIdx] = 1;
          queue[tail++] = nIdx;
        }
      }
      return false;
    }
  }

  // Export to global scope
  window.MinHeap = MinHeap;
  window.PathNode = PathNode;
  window.PathfindingEngine = PathfindingEngine;

  console.log('%c[TIO Pathfinding Engine v5.0] Min-Heap A* Search & Path Worthiness Loaded.', 'color: #10b981;');
})();
