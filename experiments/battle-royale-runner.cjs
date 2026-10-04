/**
 * Massive 50-Player Battle Royale Simulation & Tournament Harness
 * Pits V2.1 Advanced Engine against 49 adversarial bots across diverse archetypes:
 *   1. V2.1-Advanced (10 Mathematical Modules + SDE + MCTS)
 *   2. Aggressive-Swarm (High commit ratio, relentless front pressure)
 *   3. Turtle-Fortress (Capital accumulation, soft-reserve hoarding, counter-strike only)
 *   4. Opportunist-Vulture (Predatory strikes on weakened, shrinking rivals)
 *   5. V1-Baseline (Classic single-decision heuristic bot)
 *
 * Employs SpatialHashGrid for O(1) multi-agent proximity queries.
 * Runs on both MegaWorldMap (20,000 cells) and Procedural Voronoi Continents.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { SpatialHashGrid } = require('./spatial-index.js');
const {
  generateMegaWorldMap,
  generateProceduralVoronoiMap,
  detectGlobalChokepoints
} = require('./advanced-maps.js');

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
const v2_1 = loadEngine(path.join(__dirname, '../content/engine-core-v2-advanced.js'));

class BattleRoyaleSimulation {
  constructor(options = {}) {
    this.map = options.map || generateMegaWorldMap(200, 100);
    this.w = this.map.width;
    this.h = this.map.height;
    this.grid = new Int16Array(this.map.grid); // Int16 to support 50+ player IDs
    this.maxTicks = options.maxTicks || 300;
    this.tick = 0;
    this.players = [];
    this.spatialGrid = new SpatialHashGrid(this.w, this.h, 16);
    this.chokepoints = this.map.chokepoints || [];
    this.logHistory = !!options.exportPath;
    this.exportPath = options.exportPath || null;
    this.replayDeltas = [];
    this.eliminations = [];

    if (this.logHistory) {
      this.replayLog = {
        metadata: {
          mapName: this.map.name,
          width: this.w,
          height: this.h,
          maxTicks: this.maxTicks,
          initialGrid: Array.from(this.grid),
          chokepoints: this.chokepoints
        },
        players: [],
        ticks: []
      };
    }

    // Track boundary cells for each player: Map<playerId, Set<cellIndex>>
    this.playerBoundaries = new Map();
    this.playerCellCounts = new Int32Array(1024);
  }

  addPlayer(id, name, archetype, engine, spawnX, spawnY) {
    if (engine && engine.BayesianArchetypeClassifier && typeof engine.BayesianArchetypeClassifier.reset === 'function') {
      engine.BayesianArchetypeClassifier.reset();
    }
    if (engine && engine.BayesianTroopObserver && typeof engine.BayesianTroopObserver.reset === 'function') {
      engine.BayesianTroopObserver.reset();
    }
    const p = {
      id,
      name,
      archetype,
      engine,
      color: `hsl(${((id * 137.5) % 360).toFixed(1)}, 75%, 55%)`,
      x: spawnX,
      y: spawnY,
      centerX: spawnX,
      centerY: spawnY,
      balance: 1000,
      territory: 1,
      alive: true,
      cooldown: 0,
      kills: 0,
      deathTick: 0,
      peakTerritory: 1,
      peakBalance: 1000,
      chokepointBreaches: 0,
      totalDamageDealt: 0,
      totalDamageReceived: 0
    };
    this.players.push(p);
    this.playerBoundaries.set(id, new Set());

    // Claim initial spawn cell
    const idx = spawnY * this.w + spawnX;
    this.grid[idx] = id;
    this.playerCellCounts[id] = 1;
    this.playerBoundaries.get(id).add(idx);
    this.spatialGrid.insert(id, spawnX, spawnY);
  }

  getPerimeterCandidates(playerId) {
    const boundary = this.playerBoundaries.get(playerId);
    if (!boundary || boundary.size === 0) return [];

    const candidates = [];
    const visited = new Set();
    const dirs = [
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 }
    ];

    for (const cellIdx of boundary) {
      const cx = cellIdx % this.w;
      const cy = Math.floor(cellIdx / this.w);

      for (let d = 0; d < 4; d++) {
        const nx = cx + dirs[d].dx;
        const ny = cy + dirs[d].dy;
        if (nx < 0 || nx >= this.w || ny < 0 || ny >= this.h) continue;

        const nIdx = ny * this.w + nx;
        if (visited.has(nIdx)) continue;
        visited.add(nIdx);

        const val = this.grid[nIdx];
        if (val === -1 || val === playerId) continue; // Water or self

        const isChokepoint = this.chokepoints && this.chokepoints.some(cp => Math.abs(cp.x - nx) <= 1 && Math.abs(cp.y - ny) <= 1);
        let ownedNbrs = 0;
        for (let od = 0; od < 4; od++) {
          const onx = nx + dirs[od].dx;
          const ony = ny + dirs[od].dy;
          if (onx >= 0 && onx < this.w && ony >= 0 && ony < this.h) {
            if (this.grid[ony * this.w + onx] === playerId) ownedNbrs++;
          }
        }

        candidates.push({
          id: nIdx,
          x: Math.round((nx / Math.max(1, this.w - 1)) * 1000),
          y: Math.round((ny / Math.max(1, this.h - 1)) * 1000),
          gridX: nx,
          gridY: ny,
          type: val === 0 ? 'NEUTRAL' : 'ENEMY',
          enemyId: val > 0 ? val : null,
          touchesEnemy: val > 0,
          touchesNeutral: val === 0,
          isChokepoint,
          ownedNeighbors: ownedNbrs
        });
      }
    }
    return candidates;
  }

  conquerCell(cellIdx, newOwnerId) {
    const oldOwnerId = this.grid[cellIdx];
    this.grid[cellIdx] = newOwnerId;
    if (this.logHistory) {
      this.replayDeltas.push(cellIdx, newOwnerId);
    }

    if (oldOwnerId > 0) {
      this.playerCellCounts[oldOwnerId]--;
      const oldB = this.playerBoundaries.get(oldOwnerId);
      if (oldB) oldB.delete(cellIdx);
    }

    this.playerCellCounts[newOwnerId]++;
    let newB = this.playerBoundaries.get(newOwnerId);
    if (!newB) {
      newB = new Set();
      this.playerBoundaries.set(newOwnerId, newB);
    }
    newB.add(cellIdx);

    // Update 4 neighbors
    const cx = cellIdx % this.w;
    const cy = Math.floor(cellIdx / this.w);
    const dirs = [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }];
    for (let d = 0; d < 4; d++) {
      const nx = cx + dirs[d].dx;
      const ny = cy + dirs[d].dy;
      if (nx >= 0 && nx < this.w && ny >= 0 && ny < this.h) {
        const nIdx = ny * this.w + nx;
        const nVal = this.grid[nIdx];
        if (nVal > 0) {
          const nb = this.playerBoundaries.get(nVal);
          if (nb) nb.add(nIdx);
        }
      }
    }
  }

  step() {
    this.tick++;

    // Dynamic territory delta and shrink tracking
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      if (!p.alive) continue;
      const currentTerr = this.playerCellCounts[p.id] || 1;
      const prevTerr = p.territory || currentTerr;
      p.areaTrend = currentTerr - prevTerr;
      if (currentTerr < prevTerr) {
        p.shrinkFrames = (p.shrinkFrames || 0) + 1;
      } else {
        p.shrinkFrames = 0;
      }
      p.territory = currentTerr;
      if (currentTerr > p.peakTerritory) p.peakTerritory = currentTerr;
    }

    // 1. Economy & Liquid Interest (Every 10 ticks)
    if (this.tick % 10 === 0) {
      for (let i = 0; i < this.players.length; i++) {
        const p = this.players[i];
        if (!p.alive) continue;
        const terr = p.territory;

        const softCap = Math.min(100 * terr, 1000000000);
        const baseIncome = Math.max(2, Math.floor(Math.sqrt(terr) * 2.5));
        let interest = 0;
        if (p.balance < softCap) {
          interest = Math.floor(p.balance * 0.035);
        }
        p.balance += baseIncome + interest;
        if (p.balance > p.peakBalance) p.peakBalance = p.balance;
      }
    }

    // 2. Spatial Hash Grid Re-Index (for O(1) nearby rival queries)
    this.spatialGrid.clear();
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      if (p.alive) {
        this.spatialGrid.insert(p.id, p.centerX, p.centerY);
      }
    }

    // 3. Action Phase (shuffle or alternate execution order to eliminate turn bias)
    const turnOrder = this.tick % 2 === 0 ? [...this.players] : [...this.players].reverse();
    const queryBuffer = [];

    for (let pi = 0; pi < turnOrder.length; pi++) {
      const p = turnOrder[pi];
      if (!p.alive) continue;
      if (p.cooldown > 0) {
        p.cooldown--;
        continue;
      }

      p.territory = this.playerCellCounts[p.id] || 1;
      const candidates = this.getPerimeterCandidates(p.id);
      if (candidates.length === 0) continue;

      // Find nearby rivals via spatial hash grid (radius = 35 cells)
      this.spatialGrid.queryRadius(p.centerX, p.centerY, 35, queryBuffer);
      const nearbyEnemies = [];
      for (let qi = 0; qi < queryBuffer.length; qi++) {
        const rId = queryBuffer[qi];
        if (rId !== p.id) {
          const foe = this.players[rId - 1];
          if (foe && foe.alive) {
            nearbyEnemies.push({
              id: foe.id,
              terr: foe.territory,
              bal: foe.balance,
              x: Math.round((foe.centerX / Math.max(1, this.w - 1)) * 1000),
              y: Math.round((foe.centerY / Math.max(1, this.h - 1)) * 1000),
              crushable: p.balance > 0 && Math.floor(p.balance / 8) > foe.balance
            });
          }
        }
      }

      // Context construction
      const freeCount = candidates.filter(c => c.type === 'NEUTRAL').length;
      const freeRatio = freeCount / Math.max(1, candidates.length);
      const stateCtx = {
        balance: p.balance,
        balanceKnown: true,
        territory: p.territory,
        softCap: Math.min(100 * p.territory, 1000000000),
        freeLandRatio: freeRatio,
        hasAdjFree: freeCount > 0,
        adjEnemies: nearbyEnemies,
        primaryDanger: nearbyEnemies.length > 2 ? 0.7 : 0.2,
        areaTrend: p.areaTrend || 0,
        shrinkFrames: p.shrinkFrames || 0,
        fronts: 4,
        attackSequence: p.attackSequence || 0,
        centerX: Math.round((p.centerX / Math.max(1, this.w - 1)) * 1000),
        centerY: Math.round((p.centerY / Math.max(1, this.h - 1)) * 1000),
        x: Math.round((p.centerX / Math.max(1, this.w - 1)) * 1000),
        y: Math.round((p.centerY / Math.max(1, this.h - 1)) * 1000)
      };

      // Decision execution based on archetype
      let decision = null;
      let ratio = 0.20;

      if (p.archetype === 'V2.1-Advanced' || p.archetype === 'Candidate' || p.isV2) {
        decision = p.engine.decide(stateCtx);
        const plan = p.engine.planSpend(Object.assign({}, stateCtx, {
          wantEnemy: decision.action === 'fight',
          crushable: decision.crushable
        }));
        ratio = plan.canAfford ? plan.ratio : 0.14;
      } else if (p.archetype === 'Aggressive-Swarm') {
        const wantFight = nearbyEnemies.some(e => e.bal < p.balance * 1.3);
        decision = {
          action: (wantFight && freeRatio < 0.15) ? 'fight' : 'expand',
          crushable: nearbyEnemies.some(e => p.balance > e.bal * 8)
        };
        ratio = 0.35;
      } else if (p.archetype === 'Turtle-Fortress') {
        const overcap = p.balance > stateCtx.softCap * 0.9;
        decision = {
          action: overcap ? (freeRatio > 0.05 ? 'expand' : 'fight') : (freeRatio > 0.3 ? 'expand' : 'hold'),
          crushable: false
        };
        ratio = 0.08;
      } else if (p.archetype === 'Opportunist-Vulture') {
        let weakest = null, minBal = Infinity;
        for (const e of nearbyEnemies) {
          if (e.bal < minBal) { minBal = e.bal; weakest = e; }
        }
        if (weakest && (minBal < p.balance * 0.6 || freeRatio < 0.05)) {
          decision = { action: 'fight', focusEnemyId: weakest.id, crushable: p.balance > minBal * 6 };
          ratio = 0.28;
        } else {
          decision = { action: 'expand', crushable: false };
          ratio = 0.15;
        }
      } else if (p.archetype === 'Kingmaker-Kamikaze') {
        // Ruthless adversarial kamikaze: always targets highest territory rival or V2.1
        let target = null, maxScore = -1;
        for (const e of nearbyEnemies) {
          const foe = this.players[e.id - 1];
          const isV2 = foe && foe.archetype && foe.archetype.includes('V2');
          const foeScore = e.terr * (isV2 ? 2.5 : 1.0);
          if (foeScore > maxScore) { maxScore = foeScore; target = e; }
        }
        if (target && p.balance > 50) {
          decision = { action: 'fight', focusEnemyId: target.id, crushable: false };
          ratio = 0.85; // Massive all-in suicide strike!
        } else {
          decision = { action: 'expand', crushable: false };
          ratio = 0.25;
        }
      } else if (p.archetype === 'Cartel-Sybil') {
        // Coordinated cartel: never attacks other cartel members, concentrates on outsiders
        const nonCartel = nearbyEnemies.filter(e => {
          const foe = this.players[e.id - 1];
          return foe && (!foe.archetype || !foe.archetype.includes('Cartel'));
        });
        if (nonCartel.length > 0) {
          const leader = nonCartel.sort((a, b) => b.terr - a.terr)[0];
          decision = { action: 'fight', focusEnemyId: leader.id, crushable: false };
          ratio = 0.35;
        } else {
          decision = { action: 'expand', crushable: false };
          ratio = 0.18;
        }
      } else if (p.archetype === 'Interest-Arbitrageur') {
        // Mathematically optimal hoarder: hoards to max softcap and snipes only when target liquid balance is low
        const canOvercap = p.balance > p.territory * 95;
        let snipeTarget = null;
        for (const e of nearbyEnemies) {
          if (e.bal < p.balance * 0.35) { snipeTarget = e; break; }
        }
        if (snipeTarget && (canOvercap || freeRatio < 0.02)) {
          decision = { action: 'fight', focusEnemyId: snipeTarget.id, crushable: true };
          ratio = 0.30;
        } else if (canOvercap) {
          decision = { action: 'expand', crushable: false };
          ratio = 0.12;
        } else {
          decision = { action: 'hold', crushable: false };
          ratio = 0;
        }
      } else {
        decision = p.engine.decide(stateCtx);
        ratio = 0.22;
      }

      if (!decision || decision.action === 'hold' || p.balance <= 30) continue;

      // Select targets
      let ranked = null;
      if ((p.archetype === 'V2.1-Advanced' || p.archetype === 'Candidate' || p.isV2) && typeof p.engine.rankTargets === 'function') {
        ranked = p.engine.rankTargets(candidates, stateCtx, decision, 4);
      } else {
        const preferE = decision.action === 'fight';
        ranked = candidates.slice().sort((a, b) => {
          if (preferE) {
            const ae = a.type === 'ENEMY' ? 1 : 0;
            const be = b.type === 'ENEMY' ? 1 : 0;
            if (ae !== be) return be - ae;
          }
          return b.ownedNeighbors - a.ownedNeighbors;
        }).slice(0, 4);
      }

      if (!ranked || ranked.length === 0) continue;

      // Allocate troops per front
      const debitResult = p.engine.humanAttackDebit ? p.engine.humanAttackDebit(p.balance, Math.floor(p.balance * ratio)) : { sent: Math.floor(p.balance * ratio), debit: Math.floor(p.balance * ratio * 1.05) };
      const totalSent = debitResult.sent;
      p.balance = Math.max(0, p.balance - debitResult.debit);
      p.attackSequence = (p.attackSequence || 0) + 1;
      p.cooldown = 2;

      // Priority 5: Record action in Bayesian Archetype Classifier for all observers
      const topPlayer = this.players.slice().sort((a, b) => b.territory - a.territory)[0];
      const targetIsLeader = decision.focusEnemyId === (topPlayer && topPlayer.id);
      for (let oi = 0; oi < this.players.length; oi++) {
        const obs = this.players[oi];
        if (obs.alive && obs.engine && obs.engine.BayesianArchetypeClassifier && typeof obs.engine.BayesianArchetypeClassifier.recordAction === 'function') {
          obs.engine.BayesianArchetypeClassifier.recordAction(p.id, totalSent, p.balance, this.tick, targetIsLeader);
        }
      }

      const sentPerFront = Math.max(1, Math.floor(totalSent / ranked.length));

      for (let ri = 0; ri < ranked.length; ri++) {
        const targetCell = ranked[ri];
        const cellIdx = targetCell.gridY * this.w + targetCell.gridX;
        const currentOwner = this.grid[cellIdx];

        if (currentOwner === 0) {
          this.conquerCell(cellIdx, p.id);
        } else if (currentOwner > 0 && currentOwner !== p.id) {
          const defender = this.players[currentOwner - 1];
          if (!defender || !defender.alive) {
            this.conquerCell(cellIdx, p.id);
            continue;
          }

          let defAdv = 1.30;
          if (p.archetype === 'V2.1-Advanced' && targetCell.spectralBottleneck > 50) {
            defAdv = 1.05;
            p.chokepointBreaches++;
          }

          const damage = Math.floor(sentPerFront / defAdv);
          p.totalDamageDealt += damage;
          defender.totalDamageReceived += damage;
          defender.balance -= damage;

          if (sentPerFront > 20 && damage > 10) {
            this.conquerCell(cellIdx, p.id);
          }

          if (defender.balance <= 0 || this.playerCellCounts[defender.id] <= 0) {
            defender.alive = false;
            defender.deathTick = this.tick;
            p.kills++;
            this.eliminations.push({
              victimId: defender.id,
              killerId: p.id,
              tick: this.tick
            });

            const defBound = this.playerBoundaries.get(defender.id);
            if (defBound) {
              for (const didx of defBound) {
                if (this.grid[didx] === defender.id) {
                  this.conquerCell(didx, p.id);
                }
              }
            }
          }
        }
      }
    }

    if (this.logHistory) {
      this.replayLog.ticks.push({
        tick: this.tick,
        deltas: this.replayDeltas.slice(),
        players: this.players.map(p => ({
          id: p.id,
          name: p.name,
          archetype: p.archetype,
          balance: p.balance,
          territory: this.playerCellCounts[p.id] || 0,
          alive: p.alive
        }))
      });
      this.replayDeltas.length = 0;
    }

    const aliveCount = this.players.filter(p => p.alive).length;
    return aliveCount <= 1 || this.tick >= this.maxTicks;
  }

  run() {
    const startTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    while (!this.step()) {}
    const elapsedMs = ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - startTime;

    const ranked = [...this.players].sort((a, b) => {
      if (a.alive !== b.alive) return b.alive ? 1 : -1;
      if (b.territory !== a.territory) return b.territory - a.territory;
      return b.balance - a.balance;
    });

    if (this.logHistory && this.exportPath) {
      this.replayLog.players = this.players.map(p => ({
        id: p.id,
        name: p.name,
        archetype: p.archetype,
        color: p.color
      }));
      fs.writeFileSync(this.exportPath, JSON.stringify(this.replayLog));
    }

    return {
      winner: ranked[0],
      rankings: ranked,
      totalTicks: this.tick,
      elapsedMs: parseFloat(elapsedMs.toFixed(2)),
      ticksPerSec: Math.round((this.tick / (elapsedMs || 1)) * 1000),
      eliminations: this.eliminations
    };
  }
}

function runBattleRoyaleTournament(rounds = 5) {
  console.log('================================================================================');
  console.log(` 50-PLAYER BATTLE ROYALE TOURNAMENT (${rounds} Rounds across Procedural Maps)`);
  console.log('================================================================================\n');

  const archetypeStats = {
    'V2.1-Advanced':       { wins: 0, top5: 0, top10: 0, totalTerr: 0, kills: 0, matches: 0 },
    'Aggressive-Swarm':    { wins: 0, top5: 0, top10: 0, totalTerr: 0, kills: 0, matches: 0 },
    'Turtle-Fortress':     { wins: 0, top5: 0, top10: 0, totalTerr: 0, kills: 0, matches: 0 },
    'Opportunist-Vulture': { wins: 0, top5: 0, top10: 0, totalTerr: 0, kills: 0, matches: 0 },
    'V1-Baseline':         { wins: 0, top5: 0, top10: 0, totalTerr: 0, kills: 0, matches: 0 }
  };

  let totalSimTicks = 0;
  let totalElapsedMs = 0;

  for (let r = 1; r <= rounds; r++) {
    const seed = 1000 + r * 37;
    const map = (r % 2 === 0)
      ? generateMegaWorldMap(200, 100)
      : generateProceduralVoronoiMap(160, 80, seed, 7);

    const sim = new BattleRoyaleSimulation({ map, maxTicks: 250 });

    const archetypes = [
      'V2.1-Advanced',
      'Aggressive-Swarm',
      'Turtle-Fortress',
      'Opportunist-Vulture',
      'V1-Baseline'
    ];

    const shuffledArchetypes = [];
    for (let i = 0; i < 50; i++) {
      shuffledArchetypes.push(archetypes[i % 5]);
    }
    for (let i = shuffledArchetypes.length - 1; i > 0; i--) {
      const j = Math.floor(((seed * 1103515245 + 12345) >>> 0) / 4294967296 * (i + 1));
      const t = shuffledArchetypes[i];
      shuffledArchetypes[i] = shuffledArchetypes[j];
      shuffledArchetypes[j] = t;
    }

    for (let i = 0; i < Math.min(50, map.spawns.length); i++) {
      const sp = map.spawns[i];
      const arch = shuffledArchetypes[i];
      const eng = arch === 'V1-Baseline' ? v1 : v2_1;
      sim.addPlayer(i + 1, `${arch}-${i + 1}`, arch, eng, sp.x, sp.y);
    }

    const res = sim.run();
    totalSimTicks += res.totalTicks;
    totalElapsedMs += res.elapsedMs;

    console.log(`Round ${r}/${rounds} [${map.name}]: Winner = ${res.winner.name} (${res.winner.archetype}) | Ticks: ${res.totalTicks} | Time: ${res.elapsedMs}ms (${res.ticksPerSec} ticks/s)`);

    for (let rank = 0; rank < res.rankings.length; rank++) {
      const p = res.rankings[rank];
      const st = archetypeStats[p.archetype];
      if (st) {
        st.matches++;
        st.totalTerr += p.territory;
        st.kills += p.kills;
        if (rank === 0) st.wins++;
        if (rank < 5) st.top5++;
        if (rank < 10) st.top10++;
      }
    }
  }

  console.log('\n--------------------------------------------------------------------------------');
  console.log(' TOURNAMENT AGGREGATE RESULTS (Across All 50-Player Matches)');
  console.log('--------------------------------------------------------------------------------');
  console.log('Archetype               | Wins | Win%   | Top 5% | Top 10% | Avg Terr | Avg Kills');
  console.log('--------------------------------------------------------------------------------');

  for (const [arch, st] of Object.entries(archetypeStats)) {
    const total = st.matches || 1;
    const winPct = ((st.wins / rounds) * 100).toFixed(1);
    const top5Pct = ((st.top5 / total) * 100).toFixed(1);
    const top10Pct = ((st.top10 / total) * 100).toFixed(1);
    const avgTerr = Math.round(st.totalTerr / total);
    const avgKills = (st.kills / total).toFixed(2);
    console.log(`${arch.padEnd(23)} | ${String(st.wins).padStart(4)} | ${winPct.padStart(5)}% | ${top5Pct.padStart(5)}% | ${top10Pct.padStart(6)}% | ${String(avgTerr).padStart(8)} | ${avgKills.padStart(9)}`);
  }

  console.log('--------------------------------------------------------------------------------');
  console.log(`Simulation Throughput: ${totalSimTicks} ticks across ${rounds} matches in ${totalElapsedMs.toFixed(1)}ms (${Math.round((totalSimTicks / (totalElapsedMs || 1)) * 1000)} ticks/s)\n`);
}

if (require.main === module) {
  runBattleRoyaleTournament(5);
}

module.exports = {
  BattleRoyaleSimulation,
  runBattleRoyaleTournament
};
