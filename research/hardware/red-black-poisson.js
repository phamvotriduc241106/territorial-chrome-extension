/**
 * High-performance Poisson Solver with pre-computed neighbor indices.
 * Optimized for V8/ARM64: zero-allocation hot loop, pre-computed neighbor lookups,
 * eliminates per-cell boundary checks. Uses the same sequential SOR ordering as
 * the baseline for exact numerical equivalence.
 *
 * @param {Array<{x: number, y: number}>} sources Fixed boundary points (+1.0)
 * @param {Array<{x: number, y: number}>} sinks Fixed boundary points (-1.0)
 * @param {Array<{x: number, y: number}>} obstacles Fixed boundary points (+0.6)
 * @param {number} gridSize Grid size N (creates N×N grid)
 * @returns {Object} { gridSize, potentialGrid, sampleGradient }
 */
function computePoissonRedBlack(sources, sinks, obstacles, gridSize) {
  const N = gridSize || 8;
  const numCells = N * N;
  
  // Flat typed arrays for maximum cache locality
  const potentialGrid = new Float64Array(numCells);
  const fixedMask = new Uint8Array(numCells);
  
  // Fast coordinate conversion mapping [0, 1000] -> [0, N-1]
  const toGrid = (val) => Math.max(0, Math.min(N - 1, Math.floor(((Number(val) || 0) / 1000) * N)));
  
  // Apply fixed boundary conditions
  const setFixed = (arr, val) => {
    if (!arr) return;
    for (let i = 0; i < arr.length; i++) {
      const p = arr[i];
      if (!p) continue;
      const gx = toGrid(p.x);
      const gy = toGrid(p.y);
      const idx = gy * N + gx;
      potentialGrid[idx] = val;
      fixedMask[idx] = 1;
    }
  };
  
  setFixed(sources, 1.0);
  setFixed(sinks, -1.0);
  setFixed(obstacles, 0.6);
  
  // Pre-compute interior cell indices and their neighbor offsets
  // This eliminates per-cell boundary checks in the hot loop
  // We iterate in the SAME order as the original (row-major, y=1..N-2, x=1..N-2)
  let interiorCount = 0;
  for (let y = 1; y < N - 1; y++) {
    for (let x = 1; x < N - 1; x++) {
      const idx = y * N + x;
      if (!fixedMask[idx]) interiorCount++;
    }
  }
  
  const interiorIndices = new Int32Array(interiorCount);
  let ii = 0;
  for (let y = 1; y < N - 1; y++) {
    for (let x = 1; x < N - 1; x++) {
      const idx = y * N + x;
      if (!fixedMask[idx]) {
        interiorIndices[ii++] = idx;
      }
    }
  }
  
  // SOR with omega = 1.35 (matching original exactly)
  const omega = 1.35;
  const oneMinusOmega = 1.0 - omega;
  const omegaQuarter = omega * 0.25;
  
  // 8 iterations matching original
  for (let iter = 0; iter < 8; iter++) {
    for (let i = 0; i < interiorCount; i++) {
      const idx = interiorIndices[i];
      const neighborSum = potentialGrid[idx - 1] + potentialGrid[idx + 1] + potentialGrid[idx - N] + potentialGrid[idx + N];
      potentialGrid[idx] = oneMinusOmega * potentialGrid[idx] + omegaQuarter * neighborSum;
    }
  }
  
  // Return the sampled results with attached gradient calculator
  return {
    gridSize: N,
    potentialGrid,
    sampleGradient: function(x, y, fromX, fromY) {
      const gx = Math.max(1, Math.min(N - 2, Math.floor(((Number(x) || 0) / 1000) * N)));
      const gy = Math.max(1, Math.min(N - 2, Math.floor(((Number(y) || 0) / 1000) * N)));
      
      const idx = gy * N + gx;
      
      const gradX = (potentialGrid[idx + 1] - potentialGrid[idx - 1]) * 0.5;
      const gradY = (potentialGrid[idx + N] - potentialGrid[idx - N]) * 0.5;
      
      let pull;
      if (fromX != null && fromY != null) {
        const dx = Number(x) - Number(fromX);
        const dy = Number(y) - Number(fromY);
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const ux = dx / dist;
        const uy = dy / dist;
        pull = -(gradX * ux + gradY * uy);
      } else {
        pull = Math.sqrt(gradX * gradX + gradY * gradY);
      }
      
      return {
        gradX,
        gradY,
        potential: potentialGrid[idx],
        pull
      };
    }
  };
}

module.exports = { computePoissonRedBlack };
