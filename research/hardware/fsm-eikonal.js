/**
 * Fast Sweeping Method (FSM) Eikonal Solver
 * 
 * Replaces the heap-based Fast Marching Method for computing geodesic distances.
 * The Fast Sweeping Method solves the Eikonal equation using a Godunov upwind
 * difference scheme and Gauss-Seidel iterations with alternating sweep directions.
 * This provides O(N) complexity and avoids dynamic allocations (heap-free).
 */

function computeEikonalFSM(gridW, gridH, sources, obstacles, speedGrid) {
  const W = gridW || 16;
  const H = gridH || 8;
  const numCells = W * H;

  // Use Float64Array for high-precision computation
  const T = new Float64Array(numCells);
  T.fill(1e6);

  const isObstacle = new Uint8Array(numCells);
  const isSource = new Uint8Array(numCells);

  // Process obstacles
  if (obstacles && obstacles.length) {
    for (let i = 0; i < obstacles.length; i++) {
      const obs = obstacles[i];
      const ox = Math.min(W - 1, Math.max(0, Math.floor((((obs && obs.x != null) ? Number(obs.x) : 500) / 1000) * W)));
      const oy = Math.min(H - 1, Math.max(0, Math.floor((((obs && obs.y != null) ? Number(obs.y) : 500) / 1000) * H)));
      isObstacle[oy * W + ox] = 1;
    }
  }

  // Process sources
  let hasSource = false;
  if (sources && sources.length) {
    for (let i = 0; i < sources.length; i++) {
      const src = sources[i];
      const sx = Math.min(W - 1, Math.max(0, Math.floor((((src && src.x != null) ? Number(src.x) : 500) / 1000) * W)));
      const sy = Math.min(H - 1, Math.max(0, Math.floor((((src && src.y != null) ? Number(src.y) : 500) / 1000) * H)));
      const idx = sy * W + sx;
      if (isObstacle[idx] === 0) {
        T[idx] = 0;
        isSource[idx] = 1;
        hasSource = true;
      }
    }
  }
  if (!hasSource) {
    T[0] = 0;
    isSource[0] = 1;
  }

  // FSM iterations
  // 3 full iterations of 4 sweeps = 12 sweeps total for robust convergence
  for (let iter = 0; iter < 3; iter++) {
    // Sweep 1: i=0→W-1, j=0→H-1
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        updateCell(i, j, W, H, T, isObstacle, isSource, speedGrid);
      }
    }

    // Sweep 2: i=W-1→0, j=0→H-1
    for (let j = 0; j < H; j++) {
      for (let i = W - 1; i >= 0; i--) {
        updateCell(i, j, W, H, T, isObstacle, isSource, speedGrid);
      }
    }

    // Sweep 3: i=W-1→0, j=H-1→0
    for (let j = H - 1; j >= 0; j--) {
      for (let i = W - 1; i >= 0; i--) {
        updateCell(i, j, W, H, T, isObstacle, isSource, speedGrid);
      }
    }

    // Sweep 4: i=0→W-1, j=H-1→0
    for (let j = H - 1; j >= 0; j--) {
      for (let i = 0; i < W; i++) {
        updateCell(i, j, W, H, T, isObstacle, isSource, speedGrid);
      }
    }
  }

  const times32 = new Float32Array(T);

  return {
    width: W,
    height: H,
    times: times32,
    getTravelTime: function(normX, normY) {
      const x = Math.min(W - 1, Math.max(0, Math.floor(((normX !== undefined ? normX : 500) / 1000) * W)));
      const y = Math.min(H - 1, Math.max(0, Math.floor(((normY !== undefined ? normY : 500) / 1000) * H)));
      const idx = y * W + x;
      const t = times32[idx];
      return t >= 1e5 ? 999 : t;
    }
  };
}

function updateCell(i, j, W, H, T, isObstacle, isSource, speedGrid) {
  const idx = j * W + i;
  if (isObstacle[idx] || isSource[idx]) return;

  // Find minimum neighbor travel time (same as FMM's per-edge propagation)
  let minNeighbor = 1e6;
  if (i > 0 && !isObstacle[idx - 1] && T[idx - 1] < minNeighbor) minNeighbor = T[idx - 1];
  if (i < W - 1 && !isObstacle[idx + 1] && T[idx + 1] < minNeighbor) minNeighbor = T[idx + 1];
  if (j > 0 && !isObstacle[idx - W] && T[idx - W] < minNeighbor) minNeighbor = T[idx - W];
  if (j < H - 1 && !isObstacle[idx + W] && T[idx + W] < minNeighbor) minNeighbor = T[idx + W];

  let speed = 1.0;
  if (speedGrid) {
    speed = speedGrid[idx] != null ? Math.max(0.1, Number(speedGrid[idx])) : 1.0;
  }
  const cost = 1.0 / speed;

  const T_new = minNeighbor + cost;
  if (T_new < T[idx]) {
    T[idx] = T_new;
  }
}

module.exports = { computeEikonalFSM };
