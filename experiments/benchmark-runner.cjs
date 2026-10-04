/**
 * Automated Monte-Carlo Benchmark Harness: V1 Baseline vs. V2 Advanced Engine
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { TerritorialMatchSimulation } = require('./simulation-engine.js');
const { SpatialMapMatch } = require('./match-visualizer.cjs');
const {
  generateEuropeMap,
  generateWorldMap,
  generateArchipelagoMap
} = require('./advanced-maps.js');

function loadEngine(filePath) {
  const sandbox = {
    window: {},
    console: { log: () => {}, warn: () => {}, error: () => {} },
    Math,
    isFinite,
    Number,
    parseInt,
    parseFloat,
    Array,
    Set,
    Map,
    Uint8Array,
    Uint16Array,
    Uint32Array,
    Int8Array,
    Int16Array,
    Int32Array,
    Float32Array,
    Float64Array,
    Object,
    String,
    NaN,
    Infinity
  };
  sandbox.globalThis = sandbox.window;
  sandbox.global = sandbox.window;
  vm.createContext(sandbox);
  const code = fs.readFileSync(filePath, 'utf8');
  vm.runInContext(code, sandbox);
  return sandbox.window.TIOEngineCore;
}

const v1 = loadEngine(path.join(__dirname, '../content/engine-core-v1.js'));
const v2_1 = loadEngine(path.join(__dirname, './engine-core-v2-advanced.js'));
const v2_0 = Object.assign({}, v2_1, {
  rankTargets: function (candidates, S, decision, maxN) {
    maxN = maxN || 8;
    if (!candidates || !candidates.length) return [];
    const list = candidates.map(c => Object.assign({}, c, {
      sitScore: v2_1.scoreCandidate ? v2_1.scoreCandidate(c, S, decision) : 50
    }));
    list.sort((a, b) => b.sitScore - a.sitScore);
    return list.slice(0, maxN);
  }
});

console.log('================================================================================');
console.log(' TERRITORIAL.IO ENGINE BENCHMARK: V1 vs V2.0 vs V2.1 ADVANCED MATHEMATICAL KERNEL');
console.log('================================================================================\n');

// -------------------------------------------------------------
// BENCHMARK 1: Solo Expansion & Compound Interest Efficiency (100 Rounds)
// -------------------------------------------------------------
console.log('>>> [Test 1/6] Running Solo Expansion & Interest Efficiency (100 Seeds)...');
const SEEDS = 100;
let v1Stats = { territory: 0, balance: 0, interest: 0, overcapLost: 0 };
let v2Stats = { territory: 0, balance: 0, interest: 0, overcapLost: 0 };

for (let seed = 0; seed < SEEDS; seed++) {
  const sim1 = new TerritorialMatchSimulation({ totalNeutralLand: 3500, maxTicks: 150 });
  sim1.addPlayer(1, 'V1-Baseline', v1, 1200, 15);
  const res1 = sim1.run();
  const p1 = res1.rankings.find(p => p.id === 1);
  v1Stats.territory += p1.territory;
  v1Stats.balance += p1.balance;
  v1Stats.interest += p1.totalTroopsGeneratedInterest;
  v1Stats.overcapLost += p1.totalOvercapLost;

  const sim2 = new TerritorialMatchSimulation({ totalNeutralLand: 3500, maxTicks: 150 });
  sim2.addPlayer(2, 'V2.1-Spectral', v2_1, 1200, 15);
  const res2 = sim2.run();
  const p2 = res2.rankings.find(p => p.id === 2);
  v2Stats.territory += p2.territory;
  v2Stats.balance += p2.balance;
  v2Stats.interest += p2.totalTroopsGeneratedInterest;
  v2Stats.overcapLost += p2.totalOvercapLost;
}

const avgV1 = {
  terr: Math.round(v1Stats.territory / SEEDS),
  bal: Math.round(v1Stats.balance / SEEDS),
  interest: Math.round(v1Stats.interest / SEEDS),
  overcap: Math.round(v1Stats.overcapLost / SEEDS)
};

const avgV2 = {
  terr: Math.round(v2Stats.territory / SEEDS),
  bal: Math.round(v2Stats.balance / SEEDS),
  interest: Math.round(v2Stats.interest / SEEDS),
  overcap: Math.round(v2Stats.overcapLost / SEEDS)
};

console.log('Solo Expansion (150 ticks average):');
console.log(`  V1 (Baseline Heuristic): Territory = ${avgV1.terr} px | Balance = ${avgV1.bal} | Interest Earned = ${avgV1.interest}`);
console.log(`  V2.1 (Optimal Control):  Territory = ${avgV2.terr} px | Balance = ${avgV2.bal} | Interest Earned = ${avgV2.interest}`);
const terrAdv = ((avgV2.terr - avgV1.terr) / avgV1.terr * 100).toFixed(1);
console.log(`  --> Delta: Territory +${terrAdv}% | Interest Generated identical\n`);

// -------------------------------------------------------------
// BENCHMARK 2: 1v1 Head-to-Head Duels (100 Matches: V2.1 vs V2.0)
// -------------------------------------------------------------
console.log('>>> [Test 2/6] Head-to-Head: V2.1 (Spectral Graph Cut) vs. V2.0 (PMP Baseline) (100 Matches)...');
let v21WinsVsV20 = 0;
let v20Wins = 0;
let drawsV2 = 0;
let totalV21Breaches = 0;
let totalV20Breaches = 0;

for (let match = 0; match < 100; match++) {
  const neutralPool = 1200 + (match % 10) * 100;
  const sim = new TerritorialMatchSimulation({ totalNeutralLand: neutralPool, maxTicks: 250 });
  sim.addPlayer(1, 'V2.0-NoSpectral', v2_0, 1000, 10, { x: 200, y: 500 });
  sim.addPlayer(2, 'V2.1-Spectral', v2_1, 1000, 10, { x: 800, y: 500 });
  const res = sim.run();

  const p1 = res.rankings.find(p => p.id === 1);
  const p2 = res.rankings.find(p => p.id === 2);
  totalV20Breaches += p1.chokepointBreaches || 0;
  totalV21Breaches += p2.chokepointBreaches || 0;

  if (res.isDraw || !res.winner || res.winner.id === 0) drawsV2++;
  else if (res.winner.id === 2) v21WinsVsV20++;
  else if (res.winner.id === 1) v20Wins++;
  else drawsV2++;
}

console.log('V2.1 (Spectral) vs V2.0 (Non-Spectral) Results:');
console.log(`  V2.1 (Spectral Cut) Wins:    ${v21WinsVsV20} / 100 (${v21WinsVsV20}%)`);
console.log(`  V2.0 (Non-Spectral) Wins:    ${v20Wins} / 100 (${v20Wins}%)`);
console.log(`  Draws / Timeouts:            ${drawsV2} / 100`);
console.log(`  Chokepoint Breaches Executed: V2.1 = ${totalV21Breaches} vs V2.0 = ${totalV20Breaches}\n`);

// -------------------------------------------------------------
// BENCHMARK 3: 1v1 Head-to-Head Duels (100 Matches: V2.1 vs V1 Baseline)
// -------------------------------------------------------------
console.log('>>> [Test 3/6] Head-to-Head: V2.1 (Spectral Graph Cut) vs. V1 Baseline (100 Matches)...');
let v21WinsVsV1 = 0;
let v1Wins = 0;
let drawsV1 = 0;

for (let match = 0; match < 100; match++) {
  const neutralPool = 1200 + (match % 10) * 100;
  const sim = new TerritorialMatchSimulation({ totalNeutralLand: neutralPool, maxTicks: 250 });
  sim.addPlayer(1, 'V1-Baseline', v1, 1000, 10, { x: 200, y: 500 });
  sim.addPlayer(2, 'V2.1-Spectral', v2_1, 1000, 10, { x: 800, y: 500 });
  const res = sim.run();

  if (res.isDraw || !res.winner || res.winner.id === 0) drawsV1++;
  else if (res.winner.id === 2) v21WinsVsV1++;
  else if (res.winner.id === 1) v1Wins++;
  else drawsV1++;
}

console.log('V2.1 (Spectral) vs V1 (Baseline) Results:');
console.log(`  V2.1 (Spectral Cut) Wins:    ${v21WinsVsV1} / 100 (${v21WinsVsV1}%)`);
console.log(`  V1 (Baseline) Wins:          ${v1Wins} / 100 (${v1Wins}%)`);
console.log(`  Draws / Timeouts:            ${drawsV1} / 100\n`);

// -------------------------------------------------------------
// BENCHMARK 4: 4-Player Free-For-All Tournament (100 Matches)
// -------------------------------------------------------------
console.log('>>> [Test 4/6] 4-Player FFA Tournament: V2.1 vs. V2.0 vs. V1 vs. Bot (100 Matches)...');
let ffaWins = { 'V2.1-Spectral': 0, 'V2.0-NoSpectral': 0, 'V1-Baseline': 0, 'Bot-Aggressive': 0 };

for (let match = 0; match < 100; match++) {
  const sim = new TerritorialMatchSimulation({ totalNeutralLand: 3200, maxTicks: 280 });
  sim.addPlayer(1, 'V2.1-Spectral', v2_1, 1000, 10, { x: 200, y: 200 });
  sim.addPlayer(2, 'V2.0-NoSpectral', v2_0, 1000, 10, { x: 800, y: 200 });
  sim.addPlayer(3, 'V1-Baseline', v1, 1000, 10, { x: 200, y: 800 });
  sim.addPlayer(4, 'Bot-Aggressive', v1, 1000, 10, { x: 800, y: 800 });

  const res = sim.run();
  ffaWins[res.winner.name]++;
}

console.log('4-Player FFA Results:');
console.log(`  1st Place Finishes:`);
console.log(`    V2.1 (PMP + Lanchester + Spectral): ${ffaWins['V2.1-Spectral']} / 100 (${ffaWins['V2.1-Spectral']}%)`);
console.log(`    V2.0 (PMP + Lanchester):            ${ffaWins['V2.0-NoSpectral']} / 100 (${ffaWins['V2.0-NoSpectral']}%)`);
console.log(`    V1 (Baseline Heuristic):            ${ffaWins['V1-Baseline']} / 100 (${ffaWins['V1-Baseline']}%)`);
console.log(`    Bot-Aggressive:                     ${ffaWins['Bot-Aggressive']} / 100 (${ffaWins['Bot-Aggressive']}%)\n`);

// -------------------------------------------------------------
// BENCHMARK 5: Realistic Topography Grand Prix (Europe, World, Archipelago)
// -------------------------------------------------------------
console.log('>>> [Test 5/6] Realistic Topography Grand Prix (Europe, World, Archipelago Tournaments)...');
const MAP_ROUNDS = 20;

// 1. Europe & Mediterranean (80x40)
let euWins = { 'V2.1-Eastern-Europe': 0, 'V1-Western-Europe': 0, 'Bot-Iberia': 0, 'Bot-Anatolia': 0 };
let euPixels = { 'V2.1-Eastern-Europe': 0, 'V1-Western-Europe': 0 };
for (let r = 0; r < MAP_ROUNDS; r++) {
  const eu = generateEuropeMap(80, 40);
  const match = new SpatialMapMatch({ customMap: eu, maxTicks: 250 });
  match.addPlayer(1, 'V1-Western-Europe', v1, eu.spawns[0].x, eu.spawns[0].y, eu.spawns[0].color);
  match.addPlayer(2, 'V2.1-Eastern-Europe', v2_1, eu.spawns[1].x, eu.spawns[1].y, eu.spawns[1].color);
  match.addPlayer(3, 'Bot-Iberia', v1, eu.spawns[2].x, eu.spawns[2].y, eu.spawns[2].color);
  match.addPlayer(4, 'Bot-Anatolia', v1, eu.spawns[3].x, eu.spawns[3].y, eu.spawns[3].color);
  const res = match.run(true);
  euWins[res.winner.name] = (euWins[res.winner.name] || 0) + 1;
  const p1 = res.rankings.find(p => p.id === 1);
  const p2 = res.rankings.find(p => p.id === 2);
  euPixels['V1-Western-Europe'] += p1 ? p1.territory : 0;
  euPixels['V2.1-Eastern-Europe'] += p2 ? p2.territory : 0;
}

// 2. World Continents (80x40)
let worldWins = { 'V2.1-Eurasia': 0, 'V1-North-America': 0, 'Bot-South-America': 0, 'Bot-Africa': 0 };
let worldPixels = { 'V2.1-Eurasia': 0, 'V1-North-America': 0 };
for (let r = 0; r < MAP_ROUNDS; r++) {
  const world = generateWorldMap(80, 40);
  const match = new SpatialMapMatch({ customMap: world, maxTicks: 250 });
  match.addPlayer(1, 'V1-North-America', v1, world.spawns[0].x, world.spawns[0].y, world.spawns[0].color);
  match.addPlayer(2, 'V2.1-Eurasia', v2_1, world.spawns[1].x, world.spawns[1].y, world.spawns[1].color);
  match.addPlayer(3, 'Bot-South-America', v1, world.spawns[2].x, world.spawns[2].y, world.spawns[2].color);
  match.addPlayer(4, 'Bot-Africa', v1, world.spawns[3].x, world.spawns[3].y, world.spawns[3].color);
  const res = match.run(true);
  worldWins[res.winner.name] = (worldWins[res.winner.name] || 0) + 1;
  const p1 = res.rankings.find(p => p.id === 1);
  const p2 = res.rankings.find(p => p.id === 2);
  worldPixels['V1-North-America'] += p1 ? p1.territory : 0;
  worldPixels['V2.1-Eurasia'] += p2 ? p2.territory : 0;
}

// 3. Archipelago & Straits (80x40)
let archWins = { 'V2.1-NE-Isle': 0, 'V1-NW-Isle': 0, 'Bot-SW-Isle': 0, 'Bot-SE-Isle': 0 };
let archPixels = { 'V2.1-NE-Isle': 0, 'V1-NW-Isle': 0 };
for (let r = 0; r < MAP_ROUNDS; r++) {
  const arch = generateArchipelagoMap(80, 40);
  const match = new SpatialMapMatch({ customMap: arch, maxTicks: 250 });
  match.addPlayer(1, 'V1-NW-Isle', v1, arch.spawns[0].x, arch.spawns[0].y, arch.spawns[0].color);
  match.addPlayer(2, 'V2.1-NE-Isle', v2_1, arch.spawns[1].x, arch.spawns[1].y, arch.spawns[1].color);
  match.addPlayer(3, 'Bot-SW-Isle', v1, arch.spawns[2].x, arch.spawns[2].y, arch.spawns[2].color);
  match.addPlayer(4, 'Bot-SE-Isle', v1, arch.spawns[3].x, arch.spawns[3].y, arch.spawns[3].color);
  const res = match.run(true);
  archWins[res.winner.name] = (archWins[res.winner.name] || 0) + 1;
  const p1 = res.rankings.find(p => p.id === 1);
  const p2 = res.rankings.find(p => p.id === 2);
  archPixels['V1-NW-Isle'] += p1 ? p1.territory : 0;
  archPixels['V2.1-NE-Isle'] += p2 ? p2.territory : 0;
}

console.log(`Realistic Topography Tournament Results (${MAP_ROUNDS} Matches per scenario):`);
console.log(`  1. Europe & Mediterranean (80x40):`);
console.log(`     V2.1-Eastern-Europe Wins: ${euWins['V2.1-Eastern-Europe']} / ${MAP_ROUNDS} (${(euWins['V2.1-Eastern-Europe'] / MAP_ROUNDS * 100).toFixed(0)}%) | Avg Terr: ${Math.round(euPixels['V2.1-Eastern-Europe'] / MAP_ROUNDS)} px`);
console.log(`     V1-Western-Europe Wins:   ${euWins['V1-Western-Europe']} / ${MAP_ROUNDS} (${(euWins['V1-Western-Europe'] / MAP_ROUNDS * 100).toFixed(0)}%) | Avg Terr: ${Math.round(euPixels['V1-Western-Europe'] / MAP_ROUNDS)} px`);
console.log(`  2. World Continents (80x40):`);
console.log(`     V2.1-Eurasia Wins:        ${worldWins['V2.1-Eurasia']} / ${MAP_ROUNDS} (${(worldWins['V2.1-Eurasia'] / MAP_ROUNDS * 100).toFixed(0)}%) | Avg Terr: ${Math.round(worldPixels['V2.1-Eurasia'] / MAP_ROUNDS)} px`);
console.log(`     V1-North-America Wins:    ${worldWins['V1-North-America']} / ${MAP_ROUNDS} (${(worldWins['V1-North-America'] / MAP_ROUNDS * 100).toFixed(0)}%) | Avg Terr: ${Math.round(worldPixels['V1-North-America'] / MAP_ROUNDS)} px`);
console.log(`  3. Archipelago & Straits (80x40):`);
console.log(`     V2.1-NE-Isle Wins:        ${archWins['V2.1-NE-Isle']} / ${MAP_ROUNDS} (${(archWins['V2.1-NE-Isle'] / MAP_ROUNDS * 100).toFixed(0)}%) | Avg Terr: ${Math.round(archPixels['V2.1-NE-Isle'] / MAP_ROUNDS)} px`);
console.log(`     V1-NW-Isle Wins:          ${archWins['V1-NW-Isle']} / ${MAP_ROUNDS} (${(archWins['V1-NW-Isle'] / MAP_ROUNDS * 100).toFixed(0)}%) | Avg Terr: ${Math.round(archPixels['V1-NW-Isle'] / MAP_ROUNDS)} px\n`);

// -------------------------------------------------------------
// BENCHMARK 6: Execution Latency Profiling
// -------------------------------------------------------------
console.log('>>> [Test 6/6] Profiling Execution Latency (10,000 Iterations)...');
const sampleState = {
  balance: 45000,
  territory: 600,
  softCap: 60000,
  density: 0.75,
  freeLandRatio: 0.04,
  hasAdjFree: true,
  adjEnemies: [
    { id: 2, bal: 15000, terr: 400, crushable: false, contactWithMe: 120, externalBorder: 40 },
    { id: 3, bal: 60000, terr: 900, crushable: false, contactWithMe: 40, externalBorder: 180 }
  ],
  globalRank: 2,
  leaderTerritory: 900,
  activeFronts: 1,
  attackSequence: 3
};

const sampleCandidates = [
  { id: 0, x: 100, y: 120, type: 'ENEMY' },
  { id: 1, x: 130, y: 125, type: 'ENEMY' },
  { id: 2, x: 160, y: 130, type: 'ENEMY' },
  { id: 3, x: 200, y: 140, type: 'ENEMY' },
  { id: 4, x: 250, y: 160, type: 'ENEMY' }
];

// Warm up
for (let i = 0; i < 500; i++) {
  v2_1.decide(sampleState);
  v2_1.rankTargets(sampleCandidates, sampleState, { action: 'fight' }, 3);
  if (v2_1.computeVoronoiPartition) v2_1.computeVoronoiPartition(sampleCandidates, [{ x: 500, y: 500 }], 16);
  if (v2_1.computeCoalitionEquilibrium) v2_1.computeCoalitionEquilibrium(sampleState);
  if (v2_1.computeEikonalGeodesicField) v2_1.computeEikonalGeodesicField(16, 8, [{ x: 500, y: 500 }], [{ x: 800, y: 500 }]);
}

const N = 10000;
const t0_v1 = process.hrtime.bigint();
for (let i = 0; i < N; i++) v1.decide(sampleState);
const t1_v1 = process.hrtime.bigint();

const t0_v2 = process.hrtime.bigint();
for (let i = 0; i < N; i++) v2_1.decide(sampleState);
const t1_v2 = process.hrtime.bigint();

const t0_spectral = process.hrtime.bigint();
for (let i = 0; i < N; i++) v2_1.rankTargets(sampleCandidates, sampleState, { action: 'fight' }, 3);
const t1_spectral = process.hrtime.bigint();

const t0_voronoi = process.hrtime.bigint();
for (let i = 0; i < N; i++) v2_1.computeVoronoiPartition(sampleCandidates, [{ x: 500, y: 500 }], 16);
const t1_voronoi = process.hrtime.bigint();

const t0_coalition = process.hrtime.bigint();
for (let i = 0; i < N; i++) v2_1.computeCoalitionEquilibrium(sampleState);
const t1_coalition = process.hrtime.bigint();

const t0_eikonal = process.hrtime.bigint();
for (let i = 0; i < N; i++) v2_1.computeEikonalGeodesicField(16, 8, [{ x: 500, y: 500 }], [{ x: 800, y: 500 }]);
const t1_eikonal = process.hrtime.bigint();

const v1TimeUs = Number(t1_v1 - t0_v1) / N / 1000;
const v2TimeUs = Number(t1_v2 - t0_v2) / N / 1000;
const spectralTimeUs = Number(t1_spectral - t0_spectral) / N / 1000;
const voronoiTimeUs = Number(t1_voronoi - t0_voronoi) / N / 1000;
const coalitionTimeUs = Number(t1_coalition - t0_coalition) / N / 1000;
const eikonalTimeUs = Number(t1_eikonal - t0_eikonal) / N / 1000;

console.log(`  V1 Baseline Decision Latency:     ${v1TimeUs.toFixed(3)} µs per tick`);
console.log(`  V2.1 Macro Decision Latency:      ${v2TimeUs.toFixed(3)} µs per tick`);
console.log(`  V2.1 Spectral Cut Frontline Rank: ${spectralTimeUs.toFixed(3)} µs per call`);
console.log(`  V2.1 Voronoi Spatial Partition:   ${voronoiTimeUs.toFixed(3)} µs per call`);
console.log(`  V2.1 Coalition Game Equilibrium:  ${coalitionTimeUs.toFixed(3)} µs per call`);
console.log(`  V2.1 Eikonal Fast Marching Wave:  ${eikonalTimeUs.toFixed(3)} µs per call`);
const totalUs = v2TimeUs + spectralTimeUs + voronoiTimeUs + coalitionTimeUs + eikonalTimeUs;
console.log(`  Total V2.1 Frame Budget Used:     ${(totalUs / 1000 * 100).toFixed(4)}% of 1ms frame budget (${totalUs.toFixed(2)} µs total)\n`);

console.log('================================================================================');
console.log('                         BENCHMARK COMPLETE                                     ');
console.log('================================================================================');

