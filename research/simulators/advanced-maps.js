/**
 * Advanced Topographical Maps & Terrain Generator for Territorial.io V2 Experiments
 *
 * Implements high-resolution realistic topological maps:
 *   1. "EUROPE_MEDITERRANEAN" (80x40): Features Atlantic, Mediterranean, Black Sea, Baltic,
 *      and key historical chokepoints: Gibraltar, Bosphorus, English Channel, Danish Straits.
 *   2. "WORLD_CONTINENTS" (80x40): Americas, Eurasia, Africa, Australia, with Panama and Sinai.
 *   3. "ARCHIPELAGO_STRAITS" (80x40): Multi-island chains for Voronoi landing optimization.
 *
 * Provides analytical topology functions:
 *   - computeMapSpectralConductance(grid, w, h)
 *   - detectGlobalChokepoints(grid, w, h)
 */
'use strict';

// 80x40 Europe ASCII Bitmap Definition
// '~' = Water / Sea (-1)
// '.' = Neutral Land (0)
// '^' = Mountain Impassable (-2)
const EUROPE_RAW = [
  "~~~~~~~~~~~~~~~~~~~~~~.......~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~",
  "~~~~~~~~~~~~~~~~~..............~~~~~~~~~~~~~~~~~~~~~~~...................~~~~~~~",
  "~~~~~~~~~~~~~~...................~~~~~~~~~~~~~~~~~~~~.....................~~~~~~",
  "~~~~~~~~~~~~......................~~~~~~~~~~~~~~~~~~~......................~~~~~",
  "~~~~~~~~~~......~~~~................~~~~~~~~~~~~~~~~........................~~~~",
  "~~~~~~~~~....~~~~~~~~~...............~~~~~~~~~~~~~~~.........................~~~",
  "~~~~~~~~...~~~~~~~~~~~~...............~~~~~~~~~~~~~..........................~~~",
  "~~~~~~~...~~~~~~~~~~~~~................~~~~~~~~~~~...........................~~~",
  "~~~~~~....~~~~~~~~~~~~~.................~~~~~~~~~............................~~~",
  "~~~~~.....~~~~~~~~~~~~~.................~~~~~~~~..............................~~",
  "~~~~~.....~~~~~~~~~~~~..................~~~~~~~...............................~~",
  "~~~~~.....~~~~~~~~~~~...................~~~~~~................................~~",
  "~~~~~.....~~~~~~~~~~....................~~~~~~................................~~",
  "~~~~~~...~~~~~~~~~~.....................~~~~~~................................~~",
  "~~~~~~~..~~~~~~~~~~......................~~~~~................................~~",
  "~~~~~~~~~~~~~~~~~~~......................~~~~~................................~~",
  "~~~~~~~~~~~~~~~~~~~...........................................................~~",
  "~~~~~~~~~~~~~~~~~~~~..........................................................~~",
  "~~~~~~~~~~~~~~~~~~~~..........................................................~~",
  "~~~~~~~~~~~~~~~~~~~...........................................................~~",
  "~~~~~~~~~~~~~~~~~~............................................................~~",
  "~~~~~~~~~~~~~~~~~.............................................................~~",
  "~~~~~~~~~~~~~~~~...................~~~~~~~....................................~~",
  "~~~~~~~~~~~~~~~...................~~~~~~~~~...................................~~",
  "~~~~~~~~~~~~~~...................~~~~~~~~~~~...............~~~~~~~~~~.........~~",
  "~~~~~~~~~~~~~...................~~~~~~~~~~~~~.............~~~~~~~~~~~~~.......~~",
  "~~~~~~~~~~~~...................~~~~~~~~~~~~~~~...........~~~~~~~~~~~~~~~......~~",
  "~~~~~~~~~~~...................~~~~~~~~~~~~~~~~~.........~~~~~~~~~~~~~~~~~.....~~",
  "~~~~~~~~~~...................~~~~~~~~~~~~~~~~~~~.......~~~~~~~~~~~~~~~~~~~....~~",
  "~~~~~~~~~...................~~~~~~~~~~~~~~~~~~~~~.....~~~~~~~~~~~~~~~~~~~~~...~~",
  "~~~~~~~~...................~~~~~~~~~~~~~~~~~~~~~~~...~~~~~~~~~~~~~~~~~~~~~~~..~~",
  "~~~~~~~...................~~~~~~~~~~~~~~~~~~~~~~~~~.~~~~~~~~~~~~~~~~~~~~~~~~~~~~",
  "~~~~~~...................~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~",
  "~~~~~...................~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~",
  "~~~~...................~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~",
  "~~~...................~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~",
  "~~...................~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~",
  "~...................~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~",
  "...................~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~",
  "..................~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~"
];

// Refined Realistic Europe & Mediterranean Topography
function generateEuropeMap(w = 80, h = 40) {
  const grid = new Int8Array(w * h);
  grid.fill(-1); // Default water

  // Land coordinate rasterization
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // 1. Scandinavian Peninsula (North-East: x in [32, 54], y in [2, 14])
      const isScandinavia = (x >= 34 && x <= 50 && y >= 3 && y <= 13) &&
                            !(x >= 44 && y <= 5) && !(x <= 36 && y >= 11);

      // 2. British Isles (North-West: Britain x in [16, 23], y in [8, 17]; Ireland x in [10, 14], y in [10, 15])
      const isBritain = (x >= 17 && x <= 23 && y >= 9 && y <= 17) && !(x >= 22 && y <= 11);
      const isIreland = (x >= 11 && x <= 15 && y >= 11 && y <= 16);

      // 3. Continental Mainland Europe (x in [16, 78], y in [15, 33])
      const isMainland = (x >= 18 && x <= 78 && y >= 15 && y <= 28) &&
                         !(x >= 52 && x <= 72 && y >= 24 && y <= 28); // Black sea carved below

      // 4. Iberian Peninsula (Spain/Portugal: x in [4, 22], y in [24, 35])
      const isIberia = (x >= 6 && x <= 22 && y >= 25 && y <= 35) && !(x <= 9 && y >= 33);

      // 5. Italian Peninsula (Boot: x in [33, 42], y in [24, 35])
      const isItaly = (x >= 34 && x <= 39 && y >= 24 && y <= 34) || (x >= 39 && x <= 42 && y >= 31 && y <= 34);

      // 6. Balkan Peninsula & Greece (x in [43, 54], y in [24, 36])
      const isBalkans = (x >= 43 && x <= 53 && y >= 24 && y <= 35) && !(x >= 49 && y >= 34);

      // 7. Anatolia / Asia Minor (x in [56, 78], y in [27, 34])
      const isAnatolia = (x >= 56 && x <= 78 && y >= 27 && y <= 34);

      // 8. North Africa Rim (x in [4, 78], y in [37, 39])
      const isNorthAfrica = (x >= 5 && x <= 78 && y >= 38);

      // 9. Black Sea Basin (Carved out water: x in [54, 72], y in [23, 27])
      const isBlackSea = (x >= 55 && x <= 70 && y >= 23 && y <= 27);

      // 10. Baltic Sea Basin (Carved out water: x in [35, 48], y in [9, 15])
      const isBalticSea = (x >= 36 && x <= 46 && y >= 9 && y <= 14);

      // 11. English Channel (Carved out water separating Britain from France: y=18, x in [16, 25])
      const isChannel = (y === 18 && x >= 16 && x <= 24);

      if (isScandinavia || isBritain || isIreland || isMainland || isIberia || isItaly || isBalkans || isAnatolia || isNorthAfrica) {
        if (!isBlackSea && !isBalticSea && !isChannel) {
          grid[y * w + x] = 0; // Neutral Land
        }
      }
    }
  }

  // Define Chokepoint & Strait Vertices (Topological bottlenecks)
  const chokepoints = [
    { name: 'Gibraltar', x: 8, y: 36, isChokepoint: true },
    { name: 'Bosphorus', x: 54, y: 28, isChokepoint: true },
    { name: 'Oresund',   x: 37, y: 14, isChokepoint: true },
    { name: 'Pyrenees',  x: 20, y: 25, isChokepoint: true },
    { name: 'Alps-Pass', x: 34, y: 23, isChokepoint: true },
    { name: 'Sinai',     x: 72, y: 37, isChokepoint: true }
  ];

  // Ensure Gibraltar land bridge / narrow crossing is open
  grid[36 * w + 8] = 0;
  grid[37 * w + 8] = 0;

  // Ensure Bosphorus bridge is open
  grid[28 * w + 54] = 0;
  grid[28 * w + 55] = 0;

  // Ensure Danish / Oresund land bridge is open
  grid[14 * w + 37] = 0;

  return {
    name: 'Europe & Mediterranean',
    width: w,
    height: h,
    grid,
    chokepoints,
    spawns: [
      { id: 1, name: 'Western-Europe', x: 26, y: 20, color: '\x1b[31m' }, // France / Rhine
      { id: 2, name: 'Eastern-Europe', x: 62, y: 18, color: '\x1b[32m' }, // Steppes / Ukraine
      { id: 3, name: 'Mediterranean',  x: 14, y: 30, color: '\x1b[33m' }, // Iberia
      { id: 4, name: 'Asia-Minor',     x: 64, y: 31, color: '\x1b[35m' }  // Anatolia
    ]
  };
}

// 2. World Continents Map (Americas, Eurasia, Africa)
function generateWorldMap(w = 80, h = 40) {
  const grid = new Int8Array(w * h);
  grid.fill(-1);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // North America: x in [6, 26], y in [4, 18]
      const isNorthAmerica = (x >= 8 && x <= 24 && y >= 6 && y <= 18) && !(x <= 11 && y >= 16);

      // Panama Isthmus: narrow 2-cell corridor x in [21, 23], y in [19, 21]
      const isPanama = (x >= 21 && x <= 23 && y >= 19 && y <= 21);

      // South America: x in [20, 34], y in [22, 38]
      const isSouthAmerica = (x >= 21 && x <= 32 && y >= 22 && y <= 37) && !(x >= 28 && y >= 32);

      // Eurasia: x in [38, 76], y in [4, 24]
      const isEurasia = (x >= 40 && x <= 75 && y >= 6 && y <= 22);

      // Sinai Chokepoint: x in [50, 52], y in [23, 24]
      const isSinai = (x >= 50 && x <= 52 && y >= 23 && y <= 24);

      // Africa: x in [42, 58], y in [24, 38]
      const isAfrica = (x >= 43 && x <= 56 && y >= 24 && y <= 37) && !(x <= 46 && y >= 33);

      // Australia: x in [64, 76], y in [28, 36]
      const isAustralia = (x >= 65 && x <= 75 && y >= 29 && y <= 36);

      if (isNorthAmerica || isPanama || isSouthAmerica || isEurasia || isSinai || isAfrica || isAustralia) {
        grid[y * w + x] = 0;
      }
    }
  }

  const chokepoints = [
    { name: 'Panama Isthmus', x: 22, y: 20, isChokepoint: true },
    { name: 'Sinai Isthmus',  x: 51, y: 23, isChokepoint: true },
    { name: 'Bering Strait',  x: 77, y: 5,  isChokepoint: true }
  ];

  return {
    name: 'World Continents',
    width: w,
    height: h,
    grid,
    chokepoints,
    spawns: [
      { id: 1, name: 'North-America', x: 16, y: 12, color: '\x1b[31m' },
      { id: 2, name: 'Eurasia-Core',  x: 58, y: 14, color: '\x1b[32m' },
      { id: 3, name: 'South-America', x: 26, y: 28, color: '\x1b[33m' },
      { id: 4, name: 'Africa-Empire', x: 48, y: 30, color: '\x1b[35m' }
    ]
  };
}

// 3. Archipelago & Straits Map (Island chains requiring naval expansion)
function generateArchipelagoMap(w = 80, h = 40) {
  const grid = new Int8Array(w * h);
  grid.fill(-1); // Default ocean

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Island A (North-West Isle: x in [6, 24], y in [4, 15])
      const isIslandA = (x >= 6 && x <= 24 && y >= 5 && y <= 15) &&
                        !((x - 15) * (x - 15) + (y - 10) * (y - 10) > 40);

      // Island B (North-East Isle: x in [42, 64], y in [4, 17])
      const isIslandB = (x >= 44 && x <= 62 && y >= 5 && y <= 16) &&
                        !((x - 53) * (x - 53) + (y - 10) * (y - 10) > 55);

      // Island C (South-West Long Isle: x in [8, 38], y in [24, 32])
      const isIslandC = (x >= 10 && x <= 36 && y >= 25 && y <= 31) &&
                        !(y === 25 && (x <= 14 || x >= 32));

      // Island D (South-East Isle: x in [48, 72], y in [22, 36])
      const isIslandD = (x >= 50 && x <= 70 && y >= 23 && y <= 35) &&
                        !((x - 60) * (x - 60) + (y - 29) * (y - 29) > 60);

      // Central Isle (Strategic Hub: x in [30, 42], y in [12, 20])
      const isCenterIsle = (x >= 32 && x <= 40 && y >= 14 && y <= 19);

      if (isIslandA || isIslandB || isIslandC || isIslandD || isCenterIsle) {
        grid[y * w + x] = 0;
      }
    }
  }

  // Define Chokepoint Straits & Islets
  const chokepoints = [
    { name: 'Northern Strait', x: 28, y: 10, isChokepoint: true },
    { name: 'Central Shallows', x: 36, y: 22, isChokepoint: true },
    { name: 'Eastern Pass', x: 45, y: 20, isChokepoint: true }
  ];

  return {
    name: 'Archipelago & Straits',
    width: w,
    height: h,
    grid,
    chokepoints,
    spawns: [
      { id: 1, name: 'North-West-Isle', x: 14, y: 10, color: '\x1b[31m' },
      { id: 2, name: 'North-East-Isle', x: 54, y: 10, color: '\x1b[32m' },
      { id: 3, name: 'South-West-Isle', x: 22, y: 28, color: '\x1b[33m' },
      { id: 4, name: 'South-East-Isle', x: 60, y: 28, color: '\x1b[35m' }
    ]
  };
}

/**
 * Computes Map Spectral Conductance (Cheeger Bottleneck Ratio)
 * h(G) = min_{S} |cut(S, ~S)| / min(|S|, |~S|)
 * Evaluates the degree of geographic partitioning of the terrain.
 */
function computeMapSpectralConductance(grid, w, h) {
  // Collect all land indices
  const landIndices = [];
  const indexToLand = new Int32Array(w * h).fill(-1);

  for (let idx = 0; idx < w * h; idx++) {
    if (grid[idx] >= 0) {
      indexToLand[idx] = landIndices.length;
      landIndices.push(idx);
    }
  }

  const N = landIndices.length;
  if (N < 4) return { conductance: 1.0, fiedlerValue: 1.0, landCells: N };

  // Degree vector and adjacency
  const deg = new Float64Array(N);
  const adj = new Array(N);
  for (let i = 0; i < N; i++) adj[i] = [];

  for (let i = 0; i < N; i++) {
    const idx = landIndices[i];
    const x = idx % w;
    const y = Math.floor(idx / w);

    for (const nb of [{ x: x + 1, y }, { x: x - 1, y }, { x, y: y + 1 }, { x, y: y - 1 }]) {
      if (nb.x >= 0 && nb.x < w && nb.y >= 0 && nb.y < h) {
        const nIdx = nb.y * w + nb.x;
        const j = indexToLand[nIdx];
        if (j >= 0) {
          adj[i].push(j);
        }
      }
    }
    deg[i] = Math.max(1, adj[i].length);
  }

  // Shifted Power Iteration on normalized Laplacian to find Fiedler vector
  // L_rw = I - D^{-1} A. Eigenvector for second smallest lambda of L corresponds to
  // second largest eigenvalue of M = D^{-1} A.
  let v = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const idx = landIndices[i];
    v[i] = ((idx % w) / w) - 0.5; // Coordinate spatial initialization
  }

  // Deflate trivial constant component (1)
  const deflate = vec => {
    let sum = 0;
    for (let i = 0; i < N; i++) sum += vec[i] * deg[i];
    const mean = sum / N;
    let normSq = 0;
    for (let i = 0; i < N; i++) {
      vec[i] -= mean / deg[i];
      normSq += vec[i] * vec[i];
    }
    const norm = Math.sqrt(normSq) || 1e-6;
    for (let i = 0; i < N; i++) vec[i] /= norm;
  };

  deflate(v);

  // Power iterations
  for (let iter = 0; iter < 12; iter++) {
    const vNext = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      let sum = 0;
      const neighbors = adj[i];
      for (let k = 0; k < neighbors.length; k++) {
        sum += v[neighbors[k]];
      }
      vNext[i] = sum / deg[i];
    }
    deflate(vNext);
    v = vNext;
  }

  // Rayleigh quotient for algebraic connectivity lambda_2
  let numer = 0, denom = 0;
  for (let i = 0; i < N; i++) {
    const neighbors = adj[i];
    for (let k = 0; k < neighbors.length; k++) {
      const j = neighbors[k];
      if (i < j) {
        const diff = v[i] - v[j];
        numer += diff * diff;
      }
    }
    denom += deg[i] * v[i] * v[i];
  }
  const fiedlerValue = denom > 0 ? numer / denom : 0;

  // Sweep cut along sorted Fiedler vector to compute Cheeger conductance h(G)
  const order = new Int32Array(N);
  for (let i = 0; i < N; i++) order[i] = i;
  order.sort((a, b) => v[a] - v[b]);

  let minConductance = 1.0;
  let cutBoundaryEdges = 0;
  const inS = new Uint8Array(N);

  for (let k = 0; k < Math.floor(N * 0.7); k++) {
    const node = order[k];
    inS[node] = 1;
    const neighbors = adj[node];
    for (let m = 0; m < neighbors.length; m++) {
      const nb = neighbors[m];
      if (inS[nb]) cutBoundaryEdges--; // Edge was boundary, now internal
      else cutBoundaryEdges++;         // New boundary edge
    }
    const sSize = k + 1;
    const sBarSize = N - sSize;
    const denomVol = Math.min(sSize, sBarSize);
    if (denomVol > 10) {
      const cond = cutBoundaryEdges / denomVol;
      if (cond < minConductance) minConductance = cond;
    }
  }

  return {
    conductance: Number(minConductance.toFixed(4)),
    fiedlerValue: Number(fiedlerValue.toFixed(4)),
    landCells: N
  };
}

/**
 * Global Chokepoint & Isthmus Detector
 * Pinpoints cells where land connectivity is narrowest across water boundaries
 * (detects single-cell straits as well as narrow constriction corridors <= 3 cells wide).
 */
function detectGlobalChokepoints(grid, w, h) {
  const chokepoints = [];
  const seen = new Uint8Array(w * h);

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      if (grid[idx] < 0) continue; // Land only

      // 1. Single-cell bottleneck check
      const north = grid[(y - 1) * w + x] < 0;
      const south = grid[(y + 1) * w + x] < 0;
      const west  = grid[y * w + (x - 1)] < 0;
      const east  = grid[y * w + (x + 1)] < 0;

      const isHorizontalStrait = north && south && !west && !east;
      const isVerticalStrait = west && east && !north && !south;

      const nw = grid[(y - 1) * w + (x - 1)] < 0;
      const se = grid[(y + 1) * w + (x + 1)] < 0;
      const ne = grid[(y - 1) * w + (x + 1)] < 0;
      const sw = grid[(y + 1) * w + (x - 1)] < 0;
      const isDiagStrait = (nw && se && !ne && !sw) || (ne && sw && !nw && !se);

      if (isHorizontalStrait || isVerticalStrait || isDiagStrait) {
        if (!seen[idx]) {
          seen[idx] = 1;
          chokepoints.push({
            x,
            y,
            orientation: isHorizontalStrait ? 'horizontal' : (isVerticalStrait ? 'vertical' : 'diagonal'),
            isChokepoint: true
          });
        }
        continue;
      }

      // 2. Multi-cell constriction corridor check (width <= 3 between water barriers)
      // Horizontal corridor (water to North & South within distance 1, land spans only <= 3 vertically)
      // Vertical corridor (water to West & East within distance 2, land spans only <= 3 horizontally)
      let westDist = 0;
      while (x - westDist >= 0 && grid[y * w + (x - westDist)] >= 0) westDist++;
      let eastDist = 0;
      while (x + eastDist < w && grid[y * w + (x + eastDist)] >= 0) eastDist++;
      const horizontalWidth = (westDist - 1) + 1 + (eastDist - 1);

      let northDist = 0;
      while (y - northDist >= 0 && grid[(y - northDist) * w + x] >= 0) northDist++;
      let southDist = 0;
      while (y + southDist < h && grid[(y + southDist) * w + x] >= 0) southDist++;
      const verticalWidth = (northDist - 1) + 1 + (southDist - 1);

      if (horizontalWidth <= 3 && verticalWidth >= 6) {
        if (!seen[idx]) {
          seen[idx] = 1;
          chokepoints.push({ x, y, orientation: 'vertical-corridor', isChokepoint: true });
        }
      } else if (verticalWidth <= 3 && horizontalWidth >= 6) {
        if (!seen[idx]) {
          seen[idx] = 1;
          chokepoints.push({ x, y, orientation: 'horizontal-corridor', isChokepoint: true });
        }
      }
    }
  }
  return chokepoints;
}

// 4. Procedural Randomized Multi-Continent Map Generator (For simulator-bias falsification)
function generateProceduralVoronoiMap(w = 120, h = 60, seed = 42, numContinents = 5) {
  let s = (seed >>> 0) || 12345;
  const rnd = () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };

  const grid = new Int8Array(w * h).fill(-1); // Ocean

  // Seed continent centers
  const centers = [];
  for (let c = 0; c < numContinents; c++) {
    centers.push({
      x: Math.floor(10 + rnd() * (w - 20)),
      y: Math.floor(10 + rnd() * (h - 20)),
      radius: 8 + rnd() * 14
    });
  }

  // Initial circular land blobs with noise
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let isLand = false;
      for (const c of centers) {
        const dx = x - c.x;
        const dy = y - c.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const noise = (rnd() - 0.5) * 4;
        if (dist <= c.radius + noise) {
          isLand = true;
          break;
        }
      }
      if (isLand) grid[y * w + x] = 0;
    }
  }

  // 2 Passes of Cellular Automata smoothing to produce natural irregular coastlines
  const temp = new Int8Array(w * h);
  for (let pass = 0; pass < 2; pass++) {
    temp.set(grid);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        let count = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (temp[(y + dy) * w + (x + dx)] >= 0) count++;
          }
        }
        grid[y * w + x] = count >= 5 ? 0 : -1;
      }
    }
  }

  // Generate 50 balanced spawn points on land
  const landCells = [];
  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      if (grid[y * w + x] >= 0) landCells.push({ x, y });
    }
  }

  const spawns = [];
  const minSpawnDistSq = 64; // Distance separation
  for (let i = 0; i < landCells.length && spawns.length < 50; i++) {
    const idx = Math.floor(rnd() * landCells.length);
    const cand = landCells[idx];
    const tooClose = spawns.some(sp => (sp.x - cand.x) ** 2 + (sp.y - cand.y) ** 2 < minSpawnDistSq);
    if (!tooClose) {
      spawns.push({
        id: spawns.length + 1,
        name: `Agent-${spawns.length + 1}`,
        x: cand.x,
        y: cand.y,
        color: `\x1b[3${(spawns.length % 6) + 1}m`
      });
    }
  }

  const chokepoints = detectGlobalChokepoints(grid, w, h);

  return {
    name: `Procedural Archipelago (Seed ${seed})`,
    width: w,
    height: h,
    grid,
    chokepoints,
    spawns
  };
}

// 5. Mega World Map (200x100 = 20,000 cells) for 50-100 Player Battle Royale
function generateMegaWorldMap(w = 200, h = 100) {
  const grid = new Int8Array(w * h).fill(-1);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // 1. North America: x in [15, 65], y in [12, 45]
      const isNA = (x >= 18 && x <= 62 && y >= 14 && y <= 44) &&
                   !((x <= 25 && y >= 38) || (x >= 55 && y <= 20));

      // 2. Panama Isthmus: narrow corridor x in [52, 56], y in [45, 52]
      const isPanama = (x >= 53 && x <= 55 && y >= 45 && y <= 52);

      // 3. South America: x in [48, 85], y in [53, 94]
      const isSA = (x >= 52 && x <= 82 && y >= 53 && y <= 92) &&
                   !(x >= 72 && y >= 80);

      // 4. Eurasia: x in [95, 185], y in [12, 56]
      const isEurasia = (x >= 98 && x <= 182 && y >= 14 && y <= 54) &&
                        !(x >= 135 && x <= 165 && y >= 48 && y <= 54); // Indian Ocean carve

      // 5. Sinai Isthmus: x in [122, 126], y in [54, 58]
      const isSinai = (x >= 123 && x <= 125 && y >= 54 && y <= 58);

      // 6. Africa: x in [102, 142], y in [56, 92]
      const isAfrica = (x >= 104 && x <= 140 && y >= 56 && y <= 90) &&
                       !(x <= 112 && y >= 82);

      // 7. Australia & Indonesia: x in [155, 185], y in [68, 88]
      const isAustralia = (x >= 158 && x <= 182 && y >= 70 && y <= 86);

      // 8. British Isles (Off-coast)
      const isBritain = (x >= 90 && x <= 95 && y >= 25 && y <= 38);

      // 9. Japan Archipelago
      const isJapan = (x >= 186 && x <= 190 && y >= 32 && y <= 48);

      if (isNA || isPanama || isSA || isEurasia || isSinai || isAfrica || isAustralia || isBritain || isJapan) {
        grid[y * w + x] = 0;
      }
    }
  }

  // Carve Mediterranean & Baltic Seas
  for (let y = 35; y <= 42; y++) {
    for (let x = 100; x <= 122; x++) {
      grid[y * w + x] = -1;
    }
  }
  // Open Gibraltar (width 2)
  grid[38 * w + 100] = 0;
  grid[39 * w + 100] = 0;
  // Open Bosphorus (width 2)
  grid[38 * w + 122] = 0;
  grid[39 * w + 122] = 0;

  // Generate 50 balanced spawn sites
  const spawns = [];
  const stepX = Math.floor(w / 10);
  const stepY = Math.floor(h / 6);
  for (let gy = 1; gy < 6; gy++) {
    for (let gx = 1; gx < 10; gx++) {
      const cx = gx * stepX;
      const cy = gy * stepY;
      // Find nearest land
      let found = null;
      for (let r = 0; r < 12 && !found; r++) {
        for (let dy = -r; dy <= r && !found; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            const tx = cx + dx;
            const ty = cy + dy;
            if (tx >= 2 && tx < w - 2 && ty >= 2 && ty < h - 2 && grid[ty * w + tx] === 0) {
              found = { x: tx, y: ty };
              break;
            }
          }
        }
      }
      if (found && spawns.length < 50) {
        spawns.push({
          id: spawns.length + 1,
          name: `Empire-${spawns.length + 1}`,
          x: found.x,
          y: found.y,
          color: `\x1b[3${(spawns.length % 6) + 1}m`
        });
      }
    }
  }

  const chokepoints = detectGlobalChokepoints(grid, w, h);

  return {
    name: 'Mega World Continents (200x100)',
    width: w,
    height: h,
    grid,
    chokepoints,
    spawns
  };
}

module.exports = {
  generateEuropeMap,
  generateWorldMap,
  generateArchipelagoMap,
  generateProceduralVoronoiMap,
  generateMegaWorldMap,
  computeMapSpectralConductance,
  detectGlobalChokepoints
};


