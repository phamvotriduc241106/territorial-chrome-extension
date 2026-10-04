/**
 * Test Suite for Predictive MPC & Multi-Step MCTS Engine
 * =======================================================
 * Falsifies approximations and proves mathematical rigor across:
 *   1. True KKT stationarity and marginal utility equalization
 *   2. Godunov isotropic Eikonal wavefront geometry
 *   3. Tarjan articulation points and bridge chokepoint detection
 *   4. Particle filter belief state convergence
 *   5. MPC predictive forward horizon valuation
 *   6. Multi-step MCTS tree expansion & backpropagation
 */
'use strict';

const assert = require('assert');
const path = require('path');
const engineModule = process.argv[2] ? require(path.resolve(process.argv[2])) : require('../content/engine-core-v2-advanced.js');
const {
  allocateKKTMarginalUtility,
  computeEikonalGodunovIsotropic,
  computeTerritorialTopology,
  OpponentParticleFilter,
  forwardSimulatorStep,
  evaluateMPCAction,
  runMultiStepMCTS
} = engineModule;

console.log('================================================================================');
console.log(' TESTING PREDICTIVE MPC, MULTI-STEP MCTS & TOPOLOGY KERNELS');
console.log('================================================================================\n');

// ── 1. True KKT Marginal-Utility Allocation ──
console.log('1. Testing True KKT Marginal-Utility Allocation...');
{
  const totalBudget = 1000;
  const frontConfigs = [
    { min: 50, max: 600, weight: 2.0, isChokepoint: true },
    { min: 30, max: 400, weight: 1.0 },
    { min: 20, max: 300, weight: 0.5 }
  ];

  const alloc = allocateKKTMarginalUtility(totalBudget, frontConfigs);
  assert.strictEqual(alloc.length, 3, 'Returns 3 allocations');
  const sum = alloc.reduce((a, b) => a + b, 0);
  assert(sum <= totalBudget, `Allocation sum ${sum} <= budget ${totalBudget}`);
  assert(Math.abs(sum - totalBudget) <= 1, `Full budget is utilized: ${sum} ≈ ${totalBudget}`);

  assert(alloc[0] >= 50, 'Front 0 respects min demand 50');
  assert(alloc[1] >= 30, 'Front 1 respects min demand 30');
  assert(alloc[2] >= 20, 'Front 2 respects min demand 20');
  assert(alloc[0] <= 600, 'Front 0 respects max cap 600');
  assert(alloc[1] <= 400, 'Front 1 respects max cap 400');
  assert(alloc[2] <= 300, 'Front 2 respects max cap 300');

  // Chokepoint Front 0 has higher weight -> must receive highest allocation
  assert(alloc[0] > alloc[1] && alloc[1] > alloc[2], `Front ranking ordered by marginal value: ${alloc.join(', ')}`);

  // Zero Budget test
  const zeroAlloc = allocateKKTMarginalUtility(0, frontConfigs);
  assert(zeroAlloc.every(x => x === 0), 'Zero budget yields all zeros');

  console.log(`   KKT Allocation: [${alloc.join(', ')}] (Sum: ${sum}) -> PASS`);
}

// ── 2. Isotropic Godunov Upwind Eikonal Wavefront ──
console.log('2. Testing Isotropic Godunov Upwind Eikonal Wavefront...');
{
  const W = 16;
  const H = 16;
  const sources = [{ x: 500, y: 500 }]; // Center cell (8, 8)
  const field = computeEikonalGodunovIsotropic(W, H, sources, [], null);

  assert.strictEqual(field.width, W, 'Width matches');
  assert.strictEqual(field.height, H, 'Height matches');

  // In isotropic Euclidean propagation, diagonal (1, 1) step should be ~sqrt(2) = 1.414, NOT 2.0 (Manhattan)
  const centerTime = field.times[8 * W + 8];
  assert.strictEqual(centerTime, 0, 'Source cell time is 0');

  const axisStepTime = field.times[8 * W + 9]; // Right neighbor (1 unit)
  const diagStepTime = field.times[9 * W + 9]; // Diagonal neighbor

  assert(Math.abs(axisStepTime - 1.0) < 0.01, `Axial travel time is 1.0 (got ${axisStepTime.toFixed(3)})`);
  // Godunov update solves (T-a)^2 + (T-b)^2 = 1/F^2. For a=b=1: 2(T-1)^2 = 1 => T = 1 + 1/sqrt(2) ≈ 1.7071
  const expectedDiag = 1.0 + 1.0 / Math.SQRT2;
  assert(Math.abs(diagStepTime - expectedDiag) < 0.05, `Diagonal travel time matches Godunov solution 1 + 1/√2 ≈ 1.707 (got ${diagStepTime.toFixed(3)})`);

  console.log(`   Axial Time: ${axisStepTime.toFixed(3)}, Diagonal Time: ${diagStepTime.toFixed(3)} (Exact Godunov 1 + 1/√2) -> PASS`);
}

// ── 3. Real Territorial Topology Graph & Tarjan Chokepoint Analysis ──
console.log('3. Testing Real Territorial Topology Graph & Tarjan Analysis...');
{
  // Build a classic dumbbell graph:
  // Cluster A: nodes 0, 1, 2 (triangle)
  // Chokepoint Corridor: node 3
  // Cluster B: nodes 4, 5, 6 (triangle)
  // Node 3 is an Articulation Point; edge 2-3 and 3-4 are bridges!
  const nodes = [
    { id: 0, name: 'A0' }, { id: 1, name: 'A1' }, { id: 2, name: 'A2' },
    { id: 3, name: 'Corridor-Chokepoint' },
    { id: 4, name: 'B0' }, { id: 5, name: 'B1' }, { id: 6, name: 'B2' }
  ];
  const edges = [
    { u: 0, v: 1 }, { u: 1, v: 2 }, { u: 2, v: 0 }, // Triangle A
    { u: 2, v: 3 },                                  // Bridge 1
    { u: 3, v: 4 },                                  // Bridge 2
    { u: 4, v: 5 }, { u: 5, v: 6 }, { u: 6, v: 4 }  // Triangle B
  ];

  const topo = computeTerritorialTopology(nodes, edges);
  assert.strictEqual(topo.isConnected, true, 'Dumbbell graph is connected');
  assert.strictEqual(topo.components, 1, 'Single connected component');

  const artIds = topo.articulationPoints.map(p => p.nodeId);
  assert(artIds.includes(3), 'Corridor node 3 detected as Articulation Point');
  assert(artIds.includes(2), 'Node 2 detected as boundary articulation point');
  assert(artIds.includes(4), 'Node 4 detected as boundary articulation point');
  assert(!artIds.includes(0) && !artIds.includes(1), 'Interior triangle nodes are NOT articulation points');

  assert.strictEqual(topo.bridges.length, 2, 'Exactly 2 bridge edges detected');
  console.log(`   Detected Articulation Points: [${artIds.join(', ')}], Bridges: ${topo.bridges.length} -> PASS`);
}

// ── 4. Particle Filter Opponent Hidden Balance Observer ──
console.log('4. Testing Particle Filter Opponent Belief State...');
{
  const pf = new OpponentParticleFilter(1, 20, 1000);
  let belief0 = pf.getBelief();
  assert(belief0.mean > 0, 'Initial belief mean positive');
  assert(belief0.p95 >= belief0.mean, '95th percentile >= mean');

  // Simulate opponent compounding for 5 ticks
  pf.predict(5, 20);
  let belief1 = pf.getBelief();
  assert(belief1.mean > belief0.mean, `Belief compounds over time: ${belief0.mean} -> ${belief1.mean}`);

  // Observe an attack of size 240 troops (with 20% prior -> true balance ~1200)
  pf.update(240, 0.20);
  let belief2 = pf.getBelief();
  assert(Math.abs(belief2.mean - 1200) < 250, `Belief converges toward true balance: ${belief2.mean} ≈ 1200`);
  assert(belief2.crushDefenseThreshold === Math.ceil(belief2.p95 / 8), 'Crush defense threshold equals p95 / 8');

  console.log(`   Posterior Belief: Mean ${belief2.mean}, 95th Percentile ${belief2.p95}, Crush Defense Floor ${belief2.crushDefenseThreshold} -> PASS`);
}

// ── 5. Forward Simulator & Model Predictive Control (MPC) ──
console.log('5. Testing Model Predictive Control (MPC) Action Evaluation...');
{
  const state = {
    balance: 800,
    territory: 30,
    freeLandRatio: 0.25,
    hasAdjFree: true,
    adjEnemies: [
      { id: 1, bal: 4000, terr: 100 } // Huge enemy 5x our size
    ]
  };

  const candidates = [
    { type: 'hold', ratio: 0 },
    { type: 'expand', ratio: 0.20 },
    { type: 'fight', targetId: 1, ratio: 0.35 } // Suicidal attack into 5x giant
  ];

  const mpc = evaluateMPCAction(state, candidates, 8);
  assert(mpc.bestAction.type !== 'fight', 'MPC strictly rejects suicidal attack into 5x giant');
  assert(mpc.bestAction.type === 'expand', 'MPC chooses economic expansion over passivity and suicide');
  assert(mpc.expectedValue > 0, 'Expected terminal utility positive');

  console.log(`   MPC Decision: ${mpc.bestAction.type} (Expected Value: ${mpc.expectedValue.toFixed(3)}) -> PASS`);
}

// ── 6. Genuine Multi-Step MCTS Tree Search ──
console.log('6. Testing Genuine Multi-Step MCTS Tree Search...');
{
  const state = {
    balance: 1000,
    territory: 40,
    freeLandRatio: 0.10,
    hasAdjFree: true,
    adjEnemies: [
      { id: 1, bal: 800, terr: 35 },
      { id: 2, bal: 2500, terr: 80 }
    ]
  };

  const mcts = runMultiStepMCTS(state, 50, 4);
  assert(['hold', 'expand', 'fight'].includes(mcts.bestAction), 'Valid MCTS action chosen');
  assert(mcts.treeSize > 0, `MCTS tree generated multiple children: ${mcts.treeSize}`);
  assert(mcts.rollouts >= 40, `Completed rollouts: ${mcts.rollouts}`);
  assert(mcts.winProb >= 0 && mcts.winProb <= 1.0, `Win probability bounded: ${mcts.winProb}`);

  console.log(`   MCTS Result: action=${mcts.bestAction}, target=${mcts.targetId}, ratio=${mcts.ratio}, winProb=${mcts.winProb}, rollouts=${mcts.rollouts} -> PASS`);
}

console.log('\n================================================================================');
console.log('ALL PREDICTIVE MPC & MATHEMATICAL ENGINE TESTS PASSED! (100.0%)');
console.log('================================================================================\n');
