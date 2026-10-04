/**
 * Extreme 50 / 100 / 200-Player Scaling & Stress Benchmark
 * Evaluates execution throughput, sub-millisecond per-bot tick budget,
 * and memory heap growth under massive multi-agent loads.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { BattleRoyaleSimulation } = require('./battle-royale-runner.cjs');
const { generateMegaWorldMap, generateProceduralVoronoiMap } = require('./advanced-maps.js');

function loadEngine(filePath) {
  const sandbox = {
    window: {},
    console: { log: () => {}, warn: () => {}, error: () => {} },
    Math, isFinite, Number, parseInt, parseFloat, Array, Set, Map,
    Uint8Array, Uint16Array, Uint32Array, Int8Array, Int16Array, Int32Array,
    Float32Array, Float64Array, Object, String, NaN, Infinity
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

function runScalingTest(playerCount, mapWidth, mapHeight, ticks = 100) {
  const memBefore = process.memoryUsage().heapUsed;
  const map = generateProceduralVoronoiMap(mapWidth, mapHeight, 42, 8);

  const sim = new BattleRoyaleSimulation({ map, maxTicks: ticks });

  // Generate spawns if map has fewer spawns than requested
  while (map.spawns.length < playerCount) {
    const rx = Math.floor(10 + Math.random() * (map.width - 20));
    const ry = Math.floor(10 + Math.random() * (map.height - 20));
    if (map.grid[ry * map.width + rx] === 0) {
      map.spawns.push({
        id: map.spawns.length + 1,
        name: `Agent-${map.spawns.length + 1}`,
        x: rx,
        y: ry
      });
    }
  }

  const archPool = ['V2.1-Advanced', 'Aggressive-Swarm', 'Turtle-Fortress', 'Opportunist-Vulture', 'V1-Baseline'];
  for (let i = 0; i < playerCount; i++) {
    const sp = map.spawns[i];
    const arch = archPool[i % archPool.length];
    const eng = arch === 'V1-Baseline' ? v1 : v2_1;
    sim.addPlayer(i + 1, `${arch}-${i + 1}`, arch, eng, sp.x, sp.y);
  }

  const tStart = performance.now();
  for (let t = 0; t < ticks; t++) {
    if (sim.step()) break;
  }
  const tElapsed = performance.now() - tStart;
  const memAfter = process.memoryUsage().heapUsed;
  const heapDeltaMB = ((memAfter - memBefore) / (1024 * 1024)).toFixed(2);

  const totalPlayerTicks = playerCount * sim.tick;
  const avgMicrosecPerPlayerTick = ((tElapsed * 1000) / totalPlayerTicks).toFixed(2);
  const ticksPerSec = Math.round((sim.tick / (tElapsed / 1000)));

  return {
    playerCount,
    mapSize: `${mapWidth}x${mapHeight} (${mapWidth * mapHeight} cells)`,
    completedTicks: sim.tick,
    elapsedMs: parseFloat(tElapsed.toFixed(2)),
    ticksPerSec,
    avgMicrosecPerPlayerTick: parseFloat(avgMicrosecPerPlayerTick),
    heapDeltaMB: parseFloat(heapDeltaMB),
    aliveAtEnd: sim.players.filter(p => p.alive).length
  };
}

console.log('================================================================================');
console.log(' EXTREME MULTI-AGENT SCALING BENCHMARK (50 -> 100 -> 200 Players)');
console.log(' Testing sub-millisecond per-bot tick budget & memory scalability');
console.log('================================================================================\n');

const tests = [
  { players: 50,   w: 160, h: 80,  ticks: 150 },
  { players: 100,  w: 200, h: 100, ticks: 150 },
  { players: 200,  w: 300, h: 150, ticks: 150 },
  { players: 500,  w: 400, h: 200, ticks: 100 },
  { players: 1000, w: 500, h: 250, ticks: 60 }
];

console.log('Players | Map Grid         | Ticks | Total Time | Ticks/Sec | µs / Bot-Tick | Heap Delta | Status');
console.log('--------------------------------------------------------------------------------------------------');

for (const t of tests) {
  const res = runScalingTest(t.players, t.w, t.h, t.ticks);
  const status = res.avgMicrosecPerPlayerTick < 1000 ? 'PASS (< 1ms)' : 'OVER BUDGET';
  console.log(
    `${String(res.playerCount).padStart(7)} | ` +
    `${res.mapSize.padEnd(16)} | ` +
    `${String(res.completedTicks).padStart(5)} | ` +
    `${(res.elapsedMs + 'ms').padStart(10)} | ` +
    `${String(res.ticksPerSec).padStart(9)} | ` +
    `${(res.avgMicrosecPerPlayerTick + ' µs').padStart(13)} | ` +
    `${(res.heapDeltaMB + ' MB').padStart(10)} | ` +
    `${status}`
  );
}

console.log('--------------------------------------------------------------------------------------------------\n');
