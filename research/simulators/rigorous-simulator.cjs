/**
 * Rigorous & Unbiased Territorial.io Match Simulation Engine
 * ==========================================================
 * Specifically built to eliminate all simulator bias:
 * 1. FIXED defender advantage (1.30x) for ALL players — NO artificial chokepoint cheat.
 * 2. Authentic Dump dU / dD / dJ / dF / d3 Very Hard bot archetypes.
 * 3. Fog of War: hidden enemy balance option, forcing belief estimation.
 * 4. Procedural maps: Europe, World, Archipelago, Voronoi, Islands.
 * 5. Trajectory logger for hindsight regret and loss mining.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {
  generateEuropeMap,
  generateWorldMap,
  generateArchipelagoMap,
  generateProceduralVoronoiMap
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

/**
 * Authentic Dump dU / dD / dJ / dF Very Hard Bot
 * Exact rules from Territorial.io decompilation:
 * - dI = 90% weakest adjacent target
 * - dK = 0% human bias
 * - dF: expands to adjacent neutral FIRST if any exists
 * - k = 400-500 start commit, tapering to y = 50-150 (5%-15%)
 * - Crush: if B_att / 8 > B_def
 */
class VeryHardBot {
  constructor(id, name, rngSeed = 12345) {
    this.id = id;
    this.name = name;
    this.seed = (rngSeed >>> 0) || 12345;
    this.attackSequence = 0;
  }

  nextRand() {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  decide(stateCtx) {
    const B = stateCtx.balance || 0;
    const hasFree = stateCtx.hasAdjFree || (stateCtx.freeLandRatio != null && stateCtx.freeLandRatio > 0.005);
    const enemies = stateCtx.adjEnemies || [];

    // Rule 1: Expand to empty first (dF)
    if (hasFree) {
      return {
        action: 'expand',
        wantEnemy: false,
        preferNeutral: true,
        crushable: false,
        focusEnemyId: null,
        enemyBal: 0
      };
    }

    if (enemies.length === 0 || B < 30) {
      return {
        action: 'hold',
        wantEnemy: false,
        preferNeutral: false,
        crushable: false,
        focusEnemyId: null,
        enemyBal: 0
      };
    }

    // Rule 2: Check for Crush (B / 8 > B_def)
    let crushTarget = null;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e && e.bal != null && Math.floor(B / 8) > e.bal) {
        crushTarget = e;
        break;
      }
    }

    if (crushTarget) {
      return {
        action: 'fight',
        wantEnemy: true,
        preferNeutral: false,
        crushable: true,
        focusEnemyId: crushTarget.id,
        enemyBal: crushTarget.bal
      };
    }

    // Rule 3: dI = 90% pick weakest adjacent neighbor, 10% closest
    let target = null;
    const roll = this.nextRand() * 100;
    if (roll < 90) {
      // 90% weakest
      let minBal = Infinity;
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (e && (e.bal != null ? e.bal : e.terr) < minBal) {
          minBal = e.bal != null ? e.bal : e.terr;
          target = e;
        }
      }
    } else {
      // 10% closest (or first)
      target = enemies[0];
    }

    if (!target) target = enemies[0];

    return {
      action: 'fight',
      wantEnemy: true,
      preferNeutral: false,
      crushable: false,
      focusEnemyId: target.id,
      enemyBal: target.bal || 0
    };
  }

  planSpend(planCtx) {
    const B = planCtx.balance || 0;
    if (B < 30) return { canAfford: false, ratio: 0 };

    if (planCtx.crushable) {
      return { canAfford: true, ratio: 0.35 };
    }

    // Tapering ratio: start around 35-45%, taper down to 10-18%
    const seq = this.attackSequence++;
    const ratio = Math.max(0.10, Math.min(0.45, 0.45 * Math.exp(-seq * 0.08) + 0.12));
    return { canAfford: true, ratio };
  }

  humanAttackDebit(bal, sent) {
    const tax = Math.floor(12 * bal / 1024);
    return {
      sent,
      debit: sent + tax,
      tax
    };
  }
}

/**
 * Authentic Territorial.io Match Simulation
 */
class RigorousMatchSimulation {
  constructor(options = {}) {
    this.mapType = options.mapType || 'voronoi';
    this.width = options.width || 80;
    this.height = options.height || 40;
    this.seed = options.seed || 12345;
    this.maxTicks = options.maxTicks || 300;
    this.fogOfWar = options.fogOfWar !== undefined ? options.fogOfWar : false;
    this.defenderAdvantage = options.defenderAdvantage || 1.30;
    this.interestRate = 0.035;
    this.interestInterval = 10;
    this.actionCooldown = 2;
    this.tick = 0;
    this.players = [];
    this.history = [];
    this.logTrajectory = options.logTrajectory || false;

    this.initMap();
  }

  nextRand() {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  initMap() {
    if (this.mapType === 'europe') {
      const m = generateEuropeMap(this.width, this.height);
      this.grid = new Int16Array(m.grid);
      // Count actual neutral cells (grid === 0)
      let nLand = 0;
      for (let i = 0; i < this.grid.length; i++) if (this.grid[i] === 0) nLand++;
      this.neutralLand = nLand;
      this.spawns = m.spawns ? [...m.spawns] : [];
      // Shuffle spawns with map seed
      for (let i = this.spawns.length - 1; i > 0; i--) {
        const j = Math.floor(this.nextRand() * (i + 1));
        const tmp = this.spawns[i];
        this.spawns[i] = this.spawns[j];
        this.spawns[j] = tmp;
      }
    } else if (this.mapType === 'world') {
      const m = generateWorldMap(this.width, this.height);
      this.grid = new Int16Array(m.grid);
      // Count actual neutral cells (grid === 0)
      let nLand = 0;
      for (let i = 0; i < this.grid.length; i++) if (this.grid[i] === 0) nLand++;
      this.neutralLand = nLand;
      this.spawns = m.spawns ? [...m.spawns] : [];
      // Shuffle spawns with map seed
      for (let i = this.spawns.length - 1; i > 0; i--) {
        const j = Math.floor(this.nextRand() * (i + 1));
        const tmp = this.spawns[i];
        this.spawns[i] = this.spawns[j];
        this.spawns[j] = tmp;
      }
    } else if (this.mapType === 'archipelago') {
      const m = generateArchipelagoMap(this.width, this.height);
      this.grid = new Int16Array(m.grid);
      // Count actual neutral cells (grid === 0)
      let nLand = 0;
      for (let i = 0; i < this.grid.length; i++) if (this.grid[i] === 0) nLand++;
      this.neutralLand = nLand;
      this.spawns = m.spawns ? [...m.spawns] : [];
      // Shuffle spawns with map seed
      for (let i = this.spawns.length - 1; i > 0; i--) {
        const j = Math.floor(this.nextRand() * (i + 1));
        const tmp = this.spawns[i];
        this.spawns[i] = this.spawns[j];
        this.spawns[j] = tmp;
      }
    } else {
      // Procedural Voronoi
      const m = generateProceduralVoronoiMap(this.width, this.height, this.seed, 6);
      this.grid = new Int16Array(m.grid);
      // Count actual neutral cells (grid === 0)
      let nLand = 0;
      for (let i = 0; i < this.grid.length; i++) if (this.grid[i] === 0) nLand++;
      this.neutralLand = nLand;
      this.spawns = m.spawns ? [...m.spawns] : [];
      // Shuffle spawns with map seed
      for (let i = this.spawns.length - 1; i > 0; i--) {
        const j = Math.floor(this.nextRand() * (i + 1));
        const tmp = this.spawns[i];
        this.spawns[i] = this.spawns[j];
        this.spawns[j] = tmp;
      }
    }

    this.initialNeutralLand = this.neutralLand;
    this.playerCellCounts = new Int32Array(256);
    this.playerBoundaries = new Map();
  }

  addPlayer(id, name, engine, options = {}) {
    let spawnX = options.x;
    let spawnY = options.y;

    if (spawnX == null || spawnY == null) {
      if (this.spawns && this.spawns.length > 0) {
        const sp = this.spawns.pop();
        spawnX = sp.x;
        spawnY = sp.y;
      } else {
        const candidates = [];
        for (let y = 1; y < this.height - 1; y++) {
          for (let x = 1; x < this.width - 1; x++) {
            if (this.grid[y * this.width + x] === 0) {
              let neutralNbrs = 0;
              for (const d of [{dx:1,dy:0},{dx:-1,dy:0},{dx:0,dy:1},{dx:0,dy:-1}]) {
                if (this.grid[(y+d.dy)*this.width + (x+d.dx)] === 0) neutralNbrs++;
              }
              if (neutralNbrs >= 3) candidates.push({ x, y });
            }
          }
        }
        if (candidates.length > 0) {
          const pick = candidates[Math.floor(this.nextRand() * candidates.length)];
          spawnX = pick.x;
          spawnY = pick.y;
        } else {
          spawnX = Math.floor(this.width / 2);
          spawnY = Math.floor(this.height / 2);
        }
      }
    }

    const p = {
      id,
      name,
      engine,
      balance: options.initialBalance != null ? options.initialBalance : 1000,
      territory: 1,
      alive: true,
      x: spawnX,
      y: spawnY,
      cooldown: 0,
      attacksExecuted: 0,
      totalDamageDealt: 0,
      totalDamageReceived: 0,
      isV2: options.isV2 || false,
      decisionsLog: []
    };

    this.players.push(p);
    this.playerBoundaries.set(id, new Set());

    const idx = spawnY * this.width + spawnX;
    this.grid[idx] = id;
    this.playerCellCounts[id] = 1;
    this.playerBoundaries.get(id).add(idx);
    this.neutralLand--;
  }

  getPerimeterCandidates(playerId) {
    const boundary = this.playerBoundaries.get(playerId);
    if (!boundary || boundary.size === 0) return [];

    const candidates = [];
    const visited = new Set();
    const dirs = [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }];

    for (const cellIdx of boundary) {
      const cx = cellIdx % this.width;
      const cy = Math.floor(cellIdx / this.width);

      for (let d = 0; d < 4; d++) {
        const nx = cx + dirs[d].dx;
        const ny = cy + dirs[d].dy;
        if (nx < 0 || nx >= this.width || ny < 0 || ny >= this.height) continue;

        const nIdx = ny * this.width + nx;
        if (visited.has(nIdx)) continue;
        visited.add(nIdx);

        const val = this.grid[nIdx];
        if (val === -1 || val === playerId) continue;

        let ownedNeighbors = 0;
        for (let od = 0; od < 4; od++) {
          const onx = nx + dirs[od].dx;
          const ony = ny + dirs[od].dy;
          if (onx >= 0 && onx < this.width && ony >= 0 && ony < this.height) {
            if (this.grid[ony * this.width + onx] === playerId) ownedNeighbors++;
          }
        }

        candidates.push({
          id: nIdx,
          x: Math.round((nx / (this.width - 1)) * 1000),
          y: Math.round((ny / (this.height - 1)) * 1000),
          gridX: nx,
          gridY: ny,
          type: val === 0 ? 'NEUTRAL' : 'ENEMY',
          enemyId: val > 0 ? val : null,
          ownedNeighbors
        });
      }
    }
    return candidates;
  }

  conquerCell(cellIdx, newOwnerId) {
    const oldOwnerId = this.grid[cellIdx];
    this.grid[cellIdx] = newOwnerId;

    if (oldOwnerId > 0) {
      this.playerCellCounts[oldOwnerId]--;
      const oldB = this.playerBoundaries.get(oldOwnerId);
      if (oldB) oldB.delete(cellIdx);
    } else if (oldOwnerId === 0) {
      this.neutralLand--;
    }

    this.playerCellCounts[newOwnerId]++;
    let newB = this.playerBoundaries.get(newOwnerId);
    if (!newB) {
      newB = new Set();
      this.playerBoundaries.set(newOwnerId, newB);
    }
    newB.add(cellIdx);

    const cx = cellIdx % this.width;
    const cy = Math.floor(cellIdx / this.width);
    const dirs = [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }];
    for (let d = 0; d < 4; d++) {
      const nx = cx + dirs[d].dx;
      const ny = cy + dirs[d].dy;
      if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height) {
        const nVal = this.grid[ny * this.width + nx];
        if (nVal > 0) {
          const nb = this.playerBoundaries.get(nVal);
          if (nb) nb.add(ny * this.width + nx);
        }
      }
    }
  }

  step() {
    this.tick++;

    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      if (!p.alive) continue;
      p.territory = this.playerCellCounts[p.id] || 0;
      if (p.territory <= 0) {
        p.alive = false;
      }
    }

    if (this.tick % this.interestInterval === 0) {
      for (let i = 0; i < this.players.length; i++) {
        const p = this.players[i];
        if (!p.alive) continue;
        const softCap = Math.min(100 * p.territory, 1000000000);
        const baseInc = Math.max(2, Math.floor(Math.sqrt(Math.max(1, p.territory)) * 2.5));
        let interest = 0;
        if (p.balance < softCap) {
          interest = Math.floor(p.balance * this.interestRate);
        }
        p.balance += baseInc + interest;
      }
    }

    const turnOrder = (this.tick % 2 === 0) ? [...this.players] : [...this.players].reverse();

    for (let pi = 0; pi < turnOrder.length; pi++) {
      const p = turnOrder[pi];
      if (!p.alive) continue;
      if (p.cooldown > 0) {
        p.cooldown--;
        continue;
      }

      const candidates = this.getPerimeterCandidates(p.id);
      if (candidates.length === 0) continue;

      const neutralCandidates = candidates.filter(c => c.type === 'NEUTRAL');
      const enemyCandidates = candidates.filter(c => c.type === 'ENEMY');
      const freeRatio = neutralCandidates.length / Math.max(1, candidates.length);

      const enemyIdSet = new Set(enemyCandidates.map(c => c.enemyId).filter(Boolean));
      const adjEnemies = [];
      for (const foeId of enemyIdSet) {
        const foe = this.players.find(o => o.id === foeId && o.alive);
        if (foe) {
          const contactCells = enemyCandidates.filter(c => c.enemyId === foeId).length;
          const balToExpose = (this.fogOfWar && p.isV2) ? null : foe.balance;
          adjEnemies.push({
            id: foe.id,
            bal: balToExpose,
            terr: foe.territory,
            contactWithMe: contactCells,
            crushable: foe.balance != null ? (p.balance > 0 && Math.floor(p.balance / 8) > foe.balance) : false
          });
        }
      }

      const leaderTerr = Math.max(...this.players.filter(o => o.alive).map(o => o.territory));
      const globalRank = 1 + this.players.filter(o => o.alive && o.territory > p.territory).length;

      const stateCtx = {
        balance: p.balance,
        balanceKnown: !(this.fogOfWar && p.isV2),
        territory: p.territory,
        softCap: Math.min(100 * p.territory, 1000000000),
        freeLandRatio: freeRatio,
        hasAdjFree: neutralCandidates.length > 0,
        adjEnemies,
        globalRank,
        leaderTerritory: leaderTerr,
        activeFronts: 1,
        attackSequence: p.attacksExecuted,
        tick: this.tick,
        isDuel: this.players.filter(o => o.alive).length <= 2,
        strategy: 'aggressive'
      };

      let decision;
      try {
        decision = p.engine.decide(stateCtx);
      } catch (e) {
        decision = { action: 'hold', wantEnemy: false };
      }

      if (!decision || decision.action === 'hold' || p.balance < 30) continue;

      let ratio = 0.20;
      if (typeof p.engine.planSpend === 'function') {
        try {
          const plan = p.engine.planSpend(Object.assign({}, stateCtx, {
            wantEnemy: decision.action === 'fight',
            crushable: decision.crushable,
            enemyBal: decision.enemyBal || 0
          }));
          if (!plan.canAfford || plan.ratio <= 0) continue;
          ratio = plan.ratio;
        } catch (e) {
          ratio = 0.20;
        }
      }

      const debitResult = p.engine.humanAttackDebit
        ? p.engine.humanAttackDebit(p.balance, Math.floor(p.balance * ratio))
        : { sent: Math.floor(p.balance * ratio), debit: Math.floor(p.balance * ratio * 1.05) };

      const sentTroops = debitResult.sent;
      const totalDebit = debitResult.debit;

      if (p.balance < totalDebit || sentTroops <= 0) continue;

      p.balance -= totalDebit;
      p.attacksExecuted++;
      p.cooldown = this.actionCooldown;

      if (this.logTrajectory && p.isV2) {
        p.decisionsLog.push({
          tick: this.tick,
          action: decision.action,
          ratio,
          sent: sentTroops,
          targetId: decision.focusEnemyId,
          myTerr: p.territory,
          myBal: p.balance,
          reason: decision.reason
        });
      }

      if (decision.action === 'expand' && neutralCandidates.length > 0) {
        const desiredClaims = Math.min(this.neutralLand, Math.max(1, Math.floor(sentTroops / 2)));
        let claimed = 0;
        const queue = [];
        const seen = new Uint8Array(this.width * this.height);

        neutralCandidates.sort((a, b) => b.ownedNeighbors - a.ownedNeighbors);
        for (let k = 0; k < neutralCandidates.length && claimed < desiredClaims; k++) {
          const c = neutralCandidates[k];
          this.conquerCell(c.id, p.id);
          claimed++;
          seen[c.id] = 1;
          queue.push({ x: c.gridX, y: c.gridY });
        }

        const dirs = [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }];
        let head = 0;
        while (head < queue.length && claimed < desiredClaims) {
          const curr = queue[head++];
          for (let d = 0; d < 4 && claimed < desiredClaims; d++) {
            const nx = curr.x + dirs[d].dx;
            const ny = curr.y + dirs[d].dy;
            if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height) {
              const nIdx = ny * this.width + nx;
              if (!seen[nIdx] && this.grid[nIdx] === 0) {
                seen[nIdx] = 1;
                this.conquerCell(nIdx, p.id);
                claimed++;
                queue.push({ x: nx, y: ny });
              }
            }
          }
        }
      } else if (decision.action === 'fight' && decision.focusEnemyId != null) {
        const target = this.players.find(o => o.id === decision.focusEnemyId && o.alive);
        if (target) {
          const isCrush = decision.crushable || (p.balance + totalDebit > 0 && Math.floor((p.balance + totalDebit) / 8) > target.balance);

          if (isCrush) {
            const damage = Math.min(target.balance, Math.floor(sentTroops * 0.9));
            target.balance -= damage;
            p.totalDamageDealt += damage;
            target.totalDamageReceived += damage;

            const targetBorder = enemyCandidates.filter(c => c.enemyId === target.id);
            const captured = Math.min(targetBorder.length, Math.max(1, Math.floor(sentTroops / 3)));
            for (let k = 0; k < captured; k++) {
              this.conquerCell(targetBorder[k].id, p.id);
            }
          } else {
            const damage = Math.floor(sentTroops / this.defenderAdvantage);
            const actualLoss = Math.min(target.balance, damage);
            target.balance -= actualLoss;
            p.totalDamageDealt += actualLoss;
            target.totalDamageReceived += actualLoss;

            if (sentTroops >= 20 && target.territory > 5) {
              const excess = Math.max(0, sentTroops - actualLoss * 0.9);
              if (excess > 0) {
                const targetBorder = enemyCandidates.filter(c => c.enemyId === target.id);
                const captured = Math.min(targetBorder.length, Math.max(1, Math.floor(excess / 4)));
                for (let k = 0; k < captured; k++) {
                  this.conquerCell(targetBorder[k].id, p.id);
                }
              }
            }
          }

          if (target.balance <= 0 || this.playerCellCounts[target.id] <= 0) {
            target.alive = false;
            const defBound = this.playerBoundaries.get(target.id);
            if (defBound) {
              for (const didx of defBound) {
                if (this.grid[didx] === target.id) {
                  this.conquerCell(didx, p.id);
                }
              }
            }
          }
        }
      }
    }

    const aliveCount = this.players.filter(p => p.alive).length;
    return aliveCount <= 1 || this.tick >= this.maxTicks;
  }

  run() {
    while (!this.step()) {}

    const ranked = [...this.players].sort((a, b) => {
      if (a.alive !== b.alive) return b.alive ? 1 : -1;
      if (b.territory !== a.territory) return b.territory - a.territory;
      return b.balance - a.balance;
    });

    const isDraw = ranked.length > 1 &&
      ranked[0].alive === ranked[1].alive &&
      ranked[0].territory === ranked[1].territory &&
      ranked[0].balance === ranked[1].balance;

    const winner = isDraw ? { id: 0, name: 'Draw', territory: ranked[0].territory } : ranked[0];

    return {
      winner,
      rankings: ranked,
      totalTicks: this.tick,
      neutralLand: this.neutralLand
    };
  }
}

module.exports = {
  VeryHardBot,
  RigorousMatchSimulation,
  loadEngine
};
