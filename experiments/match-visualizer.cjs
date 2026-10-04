/**
 * 2D Spatial Cellular Match Visualizer & Strategy Replay Harness
 * Pits V1 Baseline against V2.1 Advanced Engine on a discrete 2D spatial map
 * featuring straits, continents, and a narrow isthmus chokepoint.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

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
const v2 = loadEngine(path.join(__dirname, '../content/engine-core-v2-advanced.js'));
const {
  generateEuropeMap,
  generateWorldMap,
  generateArchipelagoMap,
  computeMapSpectralConductance,
  detectGlobalChokepoints
} = require('./advanced-maps.js');

const MAP_W = 40;
const MAP_H = 20;

// Cell values:
// -1: Water (impassable)
//  0: Neutral land
//  1: Player 1 (V1 Baseline - Red)
//  2: Player 2 (V2.1 Advanced - Green)
//  3: Player 3 (Bot Aggressive - Yellow)
//  4: Player 4 (Bot Expansionist - Magenta)

class SpatialMapMatch {
  constructor(options = {}) {
    if (options.customMap) {
      this.w = options.customMap.width;
      this.h = options.customMap.height;
      this.grid = new Int8Array(options.customMap.grid);
      this.mapName = options.customMap.name;
      this.chokepoints = options.customMap.chokepoints || [];
    } else {
      this.w = MAP_W;
      this.h = MAP_H;
      this.grid = new Int8Array(this.w * this.h);
      this.mapName = 'Continental Isthmus';
      this.chokepoints = [{ x: 19, y: 9, isChokepoint: true }, { x: 20, y: 10, isChokepoint: true }];
      this.initTerrain();
    }
    this.tick = 0;
    this.maxTicks = options.maxTicks || 200;
    this.players = [];

    this.recordReplay = !!options.exportPath;
    this.exportPath = options.exportPath || null;
    this.currentDeltas = [];
    if (this.recordReplay) {
      this.replayLog = {
        metadata: {
          mapName: this.mapName,
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
  }

  setGridCell(idx, val) {
    if (this.grid[idx] !== val) {
      this.grid[idx] = val;
      if (this.recordReplay) {
        this.currentDeltas.push(idx, val);
      }
    }
  }

  initTerrain() {
    // Generate two continents separated by a water channel at y=10
    // with an isthmus / land bridge at x in [18, 21]
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (y === 9 || y === 10) {
          if (x < 18 || x > 21) {
            this.grid[y * this.w + x] = -1; // Water
          }
        }
      }
    }
  }

  addPlayer(id, name, engine, startX, startY, colorCode) {
    const p = {
      id,
      name,
      engine,
      color: colorCode,
      balance: 1000,
      territory: 0,
      alive: true,
      cooldown: 0,
      attacks: 0,
      chokepointsCut: 0,
      navalLandings: 0,
      lastAction: 'init',
      centerX: startX,
      centerY: startY
    };

    // Claim 4x4 initial spawn
    for (let dy = -1; dy <= 2; dy++) {
      for (let dx = -1; dx <= 2; dx++) {
        const x = startX + dx;
        const y = startY + dy;
        if (x >= 0 && x < this.w && y >= 0 && y < this.h && this.grid[y * this.w + x] === 0) {
          this.setGridCell(y * this.w + x, id);
          p.territory++;
        }
      }
    }
    this.players.push(p);

    if (this.recordReplay) {
      this.replayLog.players.push({
        id: p.id,
        name: p.name,
        color: p.color,
        startX: p.centerX,
        startY: p.centerY
      });
    }
  }

  getNavalLandingCandidates(playerId) {
    const shores = [];
    const visited = new Uint8Array(this.w * this.h);
    const coastCells = [];

    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.grid[y * this.w + x] !== playerId) continue;
        let touchesWater = false;
        for (const nb of [{x:x+1,y},{x:x-1,y},{x,y:y+1},{x,y:y-1}]) {
          if (nb.x >= 0 && nb.x < this.w && nb.y >= 0 && nb.y < this.h && this.grid[nb.y * this.w + nb.x] === -1) {
            touchesWater = true; break;
          }
        }
        if (touchesWater) coastCells.push({ x, y });
      }
    }

    if (!coastCells.length) return [];

    const dirs = [
      { dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
      { dx: 1, dy: 1 }, { dx: -1, dy: -1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 1 }
    ];

    for (const c of coastCells) {
      for (const d of dirs) {
        for (let dist = 1; dist <= 12; dist++) {
          const tx = c.x + d.dx * dist;
          const ty = c.y + d.dy * dist;
          if (tx < 0 || tx >= this.w || ty < 0 || ty >= this.h) break;
          const idx = ty * this.w + tx;
          const v = this.grid[idx];
          if (v === playerId) break; // Our own land across water
          if (v >= 0) {
            if (!visited[idx]) {
              visited[idx] = 1;
              shores.push({
                id: idx,
                gridX: tx,
                gridY: ty,
                x: Math.round((tx / Math.max(1, this.w - 1)) * 1000),
                y: Math.round((ty / Math.max(1, this.h - 1)) * 1000),
                type: v === 0 ? 'NEUTRAL' : 'ENEMY',
                enemyId: v > 0 ? v : null,
                isNavalLanding: true,
                launchX: c.x,
                launchY: c.y,
                waterDist: dist
              });
            }
            break;
          }
        }
      }
    }
    return shores;
  }

  getPerimeterCandidates(playerId) {
    const candidates = [];
    const visited = new Uint8Array(this.w * this.h);

    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const idx = y * this.w + x;
        if (this.grid[idx] !== playerId) continue;

        // Check 4-connected neighbors
        const neighbors = [
          { x: x + 1, y },
          { x: x - 1, y },
          { x, y: y + 1 },
          { x, y: y - 1 }
        ];

        for (const n of neighbors) {
          if (n.x < 0 || n.x >= this.w || n.y < 0 || n.y >= this.h) continue;
          const nIdx = n.y * this.w + n.x;
          if (visited[nIdx]) continue;
          const nVal = this.grid[nIdx];
          if (nVal === -1 || nVal === playerId) continue; // Water or self

          visited[nIdx] = 1;
          const isChokepoint = this.chokepoints && this.chokepoints.some(cp => Math.abs(cp.x - n.x) <= 1 && Math.abs(cp.y - n.y) <= 1);
          let ownedNeighbors = 0;
          for (const cnb of [
            { x: n.x + 1, y: n.y },
            { x: n.x - 1, y: n.y },
            { x: n.x, y: n.y + 1 },
            { x: n.x, y: n.y - 1 }
          ]) {
            if (cnb.x >= 0 && cnb.x < this.w && cnb.y >= 0 && cnb.y < this.h) {
              if (this.grid[cnb.y * this.w + cnb.x] === playerId) ownedNeighbors++;
            }
          }
          candidates.push({
            id: nIdx,
            x: Math.round((n.x / Math.max(1, this.w - 1)) * 1000),
            y: Math.round((n.y / Math.max(1, this.h - 1)) * 1000),
            gridX: n.x,
            gridY: n.y,
            type: nVal === 0 ? 'NEUTRAL' : 'ENEMY',
            enemyId: nVal > 0 ? nVal : null,
            touchesEnemy: nVal > 0,
            touchesNeutral: nVal === 0,
            isChokepoint,
            ownedNeighbors
          });
        }
      }
    }
    return candidates;
  }

  step() {
    this.tick++;
    this.currentDeltas = [];

    // 1. Economic Interest Cycle (Every 10 ticks)
    if (this.tick % 10 === 0) {
      for (const p of this.players) {
        if (!p.alive) continue;
        const softCap = Math.min(100 * p.territory, 1000000000);
        const baseIncome = Math.max(2, Math.floor(Math.sqrt(p.territory) * 2.5));
        let interest = 0;
        if (p.balance < softCap) {
          interest = Math.floor(p.balance * 0.035);
        }
        p.balance += baseIncome + interest;
      }
    }

    // 2. Action Turn Phase
    const turnOrder = this.tick % 2 === 0 ? [...this.players] : [...this.players].reverse();
    for (const p of turnOrder) {
      if (!p.alive) continue;

      // Track shrinkage & area trend
      if (p.prevTerritory != null) {
        const delta = p.territory - p.prevTerritory;
        if (delta < 0) {
          p.shrinkFrames = (p.shrinkFrames || 0) + 1;
        } else {
          p.shrinkFrames = 0;
        }
        p.areaTrend = (p.areaTrend || 0) * 0.7 + delta * 0.3;
      } else {
        p.shrinkFrames = 0;
        p.areaTrend = 0;
      }
      p.prevTerritory = p.territory;

      if (p.cooldown > 0) {
        p.cooldown--;
        continue;
      }

      const candidates = this.getPerimeterCandidates(p.id);
      
      // Naval Operation & Bellman Bridgehead Landing Logic
      if (!candidates.length || (candidates.every(c => c.type === 'ENEMY') && p.balance > 120)) {
        const navalShores = this.getNavalLandingCandidates(p.id);
        if (navalShores && navalShores.length && p.balance >= 35) {
          let bestShore = navalShores[0];
          let commitRatio = 0.22;
          let method = 'naive';

          if (typeof p.engine.computeNavalBridgeheadPolicy === 'function') {
            const rivals = this.players.filter(o => o.id !== p.id && o.alive).map(o => ({ x: o.centerX, y: o.centerY }));
            let candidatePool = navalShores;
            if (typeof p.engine.computeVoronoiPartition === 'function') {
              candidatePool = p.engine.computeVoronoiPartition(navalShores, rivals, 16);
            }
            const stateCtx = {
              balance: p.balance,
              territory: p.territory,
              softCap: Math.min(100 * p.territory, 1000000000),
              freeLandRatio: 0.1,
              adjEnemies: this.players.filter(o => o.id !== p.id && o.alive).map(o => ({ id: o.id, bal: o.balance, terr: o.territory }))
            };
            const navalResult = p.engine.computeNavalBridgeheadPolicy(candidatePool, stateCtx);
            if (navalResult.viable && navalResult.bestShore) {
              bestShore = navalResult.bestShore;
              commitRatio = navalResult.commitRatio;
              method = 'bellman';
            } else if (!candidates.length) {
              bestShore = navalResult.bestShore || navalShores[0];
              commitRatio = 0.18;
              method = 'bellman-forced';
            } else {
              // Bellman policy rejected naval landing due to negative NPV vs holding
              continue;
            }
          } else if (typeof p.engine.computeVoronoiPartition === 'function') {
            const rivals = this.players.filter(o => o.id !== p.id && o.alive).map(o => ({ x: o.centerX, y: o.centerY }));
            const scoredShores = p.engine.computeVoronoiPartition(navalShores, rivals, 16);
            if (scoredShores && scoredShores.length) {
              scoredShores.sort((a, b) => b.voronoiScore - a.voronoiScore);
              bestShore = scoredShores[0];
              method = 'voronoi';
            }
          }

          const debit = Math.min(p.balance, Math.max(30, Math.floor(p.balance * commitRatio)));
          p.balance -= debit;
          p.navalLandings++;
          p.lastAction = `naval-landing (${method})`;

          const lIdx = bestShore.gridY * this.w + bestShore.gridX;
          if (this.grid[lIdx] <= 0) {
            if (this.grid[lIdx] === 0) p.territory++;
            this.setGridCell(lIdx, p.id);
          }

          const bridgeheadDesired = Math.max(1, Math.floor((debit - 10) / 2));
          let bridgeheadClaimed = 1;
          const bQueue = [{ x: bestShore.gridX, y: bestShore.gridY }];
          const bSeen = new Uint8Array(this.w * this.h);
          bSeen[lIdx] = 1;

          while (bQueue.length > 0 && bridgeheadClaimed < bridgeheadDesired) {
            const curr = bQueue.shift();
            for (const nb of [
              { x: curr.x + 1, y: curr.y }, { x: curr.x - 1, y: curr.y },
              { x: curr.x, y: curr.y + 1 }, { x: curr.x, y: curr.y - 1 }
            ]) {
              if (nb.x >= 0 && nb.x < this.w && nb.y >= 0 && nb.y < this.h) {
                const nbIdx = nb.y * this.w + nb.x;
                if (!bSeen[nbIdx] && this.grid[nbIdx] === 0) {
                  bSeen[nbIdx] = 1;
                  this.setGridCell(nbIdx, p.id);
                  p.territory++;
                  bridgeheadClaimed++;
                  bQueue.push(nb);
                }
              }
            }
          }
          continue;
        }
      }

      if (!candidates.length) continue;

      const softCap = Math.min(100 * p.territory, 1000000000);
      const density = p.balance / Math.max(1, softCap);
      const neutralCands = candidates.filter(c => c.type === 'NEUTRAL');
      const enemyCands = candidates.filter(c => c.type === 'ENEMY');

      // Update player centroid
      let sumX = 0, sumY = 0, count = 0;
      for (let y = 0; y < this.h; y++) {
        for (let x = 0; x < this.w; x++) {
          if (this.grid[y * this.w + x] === p.id) {
            sumX += Math.round((x / Math.max(1, this.w - 1)) * 1000);
            sumY += Math.round((y / Math.max(1, this.h - 1)) * 1000);
            count++;
          }
        }
      }
      if (count > 0) {
        p.centerX = sumX / count;
        p.centerY = sumY / count;
      }

      // Adjacency context
      const adjEnemies = [];
      const enemyIds = new Set(enemyCands.map(c => c.enemyId).filter(Boolean));
      for (const eid of enemyIds) {
        const foe = this.players.find(o => o.id === eid && o.alive);
        if (foe) {
          const contact = enemyCands.filter(c => c.enemyId === eid).length * 10;
          adjEnemies.push({
            id: foe.id,
            bal: foe.balance,
            terr: foe.territory,
            contactWithMe: contact,
            externalBorder: 50,
            x: foe.centerX,
            y: foe.centerY,
            crushable: p.balance > 0 && Math.floor(p.balance / 8) > foe.balance
          });
        }
      }

      const totalFree = this.grid.reduce((sum, v) => sum + (v === 0 ? 1 : 0), 0);
      const totalLand = this.grid.reduce((sum, v) => sum + (v >= 0 ? 1 : 0), 0);
      const freeRatio = totalFree / Math.max(1, totalLand);

      const aliveCount = this.players.filter(o => o.alive).length;
      const stateCtx = {
        balance: p.balance,
        territory: p.territory,
        softCap,
        density,
        freeLandRatio: freeRatio,
        hasAdjFree: neutralCands.length > 0,
        adjEnemies,
        centerX: p.centerX,
        centerY: p.centerY,
        shrinkFrames: p.shrinkFrames || 0,
        areaTrend: p.areaTrend || 0,
        playersRemaining: aliveCount,
        isDuel: aliveCount <= 2,
        globalRank: 1 + this.players.filter(o => o.alive && o.territory > p.territory).length
      };

      const decision = p.engine.decide(stateCtx);
      p.lastAction = `${decision.action} (${decision.reason})`;

      if (decision.action === 'hold' || p.balance < 25) continue;

      // Plan Spend
      const plan = p.engine.planSpend({
        balance: p.balance,
        balanceKnown: true,
        territory: p.territory,
        softCap,
        freeLandRatio: freeRatio,
        wantEnemy: decision.wantEnemy,
        crushable: decision.crushable,
        fronts: 1
      });

      if (!plan.canAfford || plan.ratio <= 0) continue;

      const requestedTroops = Math.floor(p.balance * plan.ratio);
      const debit = p.engine.humanAttackDebit ? p.engine.humanAttackDebit(p.balance, requestedTroops) : { debit: requestedTroops, sent: requestedTroops };
      if (p.balance < debit.debit || debit.sent <= 0) continue;

      p.balance -= debit.debit;
      p.cooldown = 1;
      p.attacks++;

      // Rank Targets using Engine (Poisson & Spectral evaluation)
      const ranked = p.engine.rankTargets(candidates, stateCtx, decision, 4);
      if (!ranked || !ranked.length) continue;

      const targetCell = ranked[0];
      if (targetCell.isChokepoint) {
        p.chokepointsCut++;
      }

      // Multi-cell spatial expansion / conquest wave (1 cell per 2 troops)
      if (decision.action === 'expand' || targetCell.type === 'NEUTRAL') {
        const desiredCells = Math.max(1, Math.floor(debit.sent / 2));
        let claimed = 0;
        const queue = [{ x: targetCell.gridX, y: targetCell.gridY }];
        const seen = new Uint8Array(this.w * this.h);
        seen[targetCell.gridY * this.w + targetCell.gridX] = 1;

        while (queue.length > 0 && claimed < desiredCells) {
          const curr = queue.shift();
          const cIdx = curr.y * this.w + curr.x;
          if (this.grid[cIdx] === 0) {
            this.setGridCell(cIdx, p.id);
            p.territory++;
            claimed++;
          }

          const nbrs = [
            { x: curr.x + 1, y: curr.y },
            { x: curr.x - 1, y: curr.y },
            { x: curr.x, y: curr.y + 1 },
            { x: curr.x, y: curr.y - 1 }
          ];
          for (const nb of nbrs) {
            if (nb.x >= 0 && nb.x < this.w && nb.y >= 0 && nb.y < this.h) {
              const nbIdx = nb.y * this.w + nb.x;
              if (!seen[nbIdx] && this.grid[nbIdx] === 0) {
                seen[nbIdx] = 1;
                queue.push(nb);
              }
            }
          }
        }
      } else if (decision.action === 'fight' && targetCell.enemyId != null) {
        const defender = this.players.find(o => o.id === targetCell.enemyId);
        if (defender) {
          const isChoke = targetCell.isChokepoint;
          const defAdv = isChoke ? 1.05 : 1.4;
          const defLoss = Math.floor(debit.sent / defAdv);
          const actualDefLoss = Math.min(defender.balance, defLoss);
          defender.balance -= actualDefLoss;

          // Territorial breach conquest
          const penetration = Math.max(0, debit.sent - actualDefLoss * (isChoke ? 0.7 : 0.9));
          const desiredCapture = Math.max(1, Math.min(Math.floor(defender.territory * 0.25), Math.floor(penetration / (isChoke ? 2 : 4))));

          let captured = 0;
          const queue = [{ x: targetCell.gridX, y: targetCell.gridY }];
          const seen = new Uint8Array(this.w * this.h);
          seen[targetCell.gridY * this.w + targetCell.gridX] = 1;

          while (queue.length > 0 && captured < desiredCapture) {
            const curr = queue.shift();
            const cIdx = curr.y * this.w + curr.x;
            if (this.grid[cIdx] === defender.id) {
              this.setGridCell(cIdx, p.id);
              p.territory++;
              defender.territory = Math.max(0, defender.territory - 1);
              captured++;
            }
            const nbrs = [
              { x: curr.x + 1, y: curr.y },
              { x: curr.x - 1, y: curr.y },
              { x: curr.x, y: curr.y + 1 },
              { x: curr.x, y: curr.y - 1 }
            ];
            for (const nb of nbrs) {
              if (nb.x >= 0 && nb.x < this.w && nb.y >= 0 && nb.y < this.h) {
                const nbIdx = nb.y * this.w + nb.x;
                if (!seen[nbIdx] && this.grid[nbIdx] === defender.id) {
                  seen[nbIdx] = 1;
                  queue.push(nb);
                }
              }
            }
          }
          if (defender.territory <= 0) defender.alive = false;
        }
      }
    }

    // Record tick replay snapshot
    if (this.recordReplay) {
      this.replayLog.ticks.push({
        tick: this.tick,
        players: this.players.map(p => ({
          id: p.id,
          name: p.name,
          balance: p.balance,
          territory: p.territory,
          alive: p.alive,
          lastAction: p.lastAction,
          cuts: p.chokepointsCut,
          naval: p.navalLandings
        })),
        deltas: this.currentDeltas
      });
    }
  }

  render() {
    const lines = [];
    lines.push(`\n=== MATCH TICK: ${this.tick} / ${this.maxTicks} ===`);
    for (const p of this.players) {
      const status = p.alive ? `B=${p.balance} | Terr=${p.territory}px | Cuts=${p.chokepointsCut} | ${p.lastAction}` : `ELIMINATED`;
      lines.push(`  Player ${p.id} (${p.color}${p.name}\x1b[0m): ${status}`);
    }
    lines.push('+' + '-'.repeat(this.w) + '+');

    for (let y = 0; y < this.h; y++) {
      let row = '|';
      for (let x = 0; x < this.w; x++) {
        const v = this.grid[y * this.w + x];
        if (v === -1) row += '\x1b[36m~\x1b[0m'; // Water
        else if (v === 0) row += '\x1b[90m.\x1b[0m'; // Neutral
        else {
          const p = this.players.find(o => o.id === v);
          const col = p ? p.color : '\x1b[37m';
          row += `${col}${v}\x1b[0m`;
        }
      }
      row += '|';
      lines.push(row);
    }
    lines.push('+' + '-'.repeat(this.w) + '+');
    return lines.join('\n');
  }

  run(silent = false) {
    while (this.tick < this.maxTicks) {
      this.step();
      const alive = this.players.filter(p => p.alive);
      if (alive.length <= 1) break;
      if (!silent && (this.tick % 40 === 0 || this.tick === 1 || this.tick === this.maxTicks)) {
        console.log(this.render());
      }
    }
    const ranked = [...this.players].sort((a, b) => {
      if (a.alive !== b.alive) return b.alive ? 1 : -1;
      return b.territory - a.territory;
    });

    if (this.recordReplay && this.exportPath) {
      this.replayLog.metadata.totalTicks = this.tick;
      this.replayLog.metadata.winner = { id: ranked[0].id, name: ranked[0].name, territory: ranked[0].territory };
      fs.writeFileSync(this.exportPath, JSON.stringify(this.replayLog, null, 2), 'utf8');
      console.log(`[Replay Exporter] Saved match replay JSON to: ${this.exportPath}`);
    }

    return { winner: ranked[0], rankings: ranked };
  }

  async runAsync(options = {}) {
    const live = options.live || false;
    const fps = options.fps || 15;
    const silent = options.silent || false;
    const delayMs = Math.max(5, Math.floor(1000 / fps));

    while (this.tick < this.maxTicks) {
      this.step();
      const alive = this.players.filter(p => p.alive);
      if (alive.length <= 1) break;

      if (live) {
        process.stdout.write('\x1b[2J\x1b[H');
        process.stdout.write(this.render() + '\n');
        await new Promise(r => setTimeout(r, delayMs));
      } else if (!silent && (this.tick % 40 === 0 || this.tick === 1 || this.tick === this.maxTicks)) {
        console.log(this.render());
      }
    }

    if (live) {
      process.stdout.write('\x1b[2J\x1b[H');
      console.log(this.render());
    }

    const ranked = [...this.players].sort((a, b) => {
      if (a.alive !== b.alive) return b.alive ? 1 : -1;
      return b.territory - a.territory;
    });

    if (this.recordReplay && this.exportPath) {
      this.replayLog.metadata.totalTicks = this.tick;
      this.replayLog.metadata.winner = { id: ranked[0].id, name: ranked[0].name, territory: ranked[0].territory };
      fs.writeFileSync(this.exportPath, JSON.stringify(this.replayLog, null, 2), 'utf8');
      console.log(`[Replay Exporter] Saved match replay JSON to: ${this.exportPath}`);
    }

    return { winner: ranked[0], rankings: ranked };
  }
}

if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);
    const mapType = (args.find(a => a.startsWith('--map='))?.split('=')[1] || '').toLowerCase();
    const isFFA = args.includes('--ffa') || mapType === 'europe' || mapType === 'world' || mapType === 'archipelago';
    const maxTicks = parseInt(args.find(a => a.startsWith('--maxTicks='))?.split('=')[1] || '500', 10);
    const silent = args.includes('--silent');
    const live = args.includes('--live');
    const fps = parseInt(args.find(a => a.startsWith('--fps='))?.split('=')[1] || '15', 10);
    const exportPath = args.find(a => a.startsWith('--export='))?.split('=')[1] || null;

    let match;
    if (mapType === 'europe') {
      const eu = generateEuropeMap(80, 40);
      console.log('================================================================================');
      console.log('   SCENARIO: EUROPE & MEDITERRANEAN GRAND PRIX (V1 vs V2.1 vs BOTS)             ');
      console.log('================================================================================');
      match = new SpatialMapMatch({ customMap: eu, maxTicks, exportPath });
      match.addPlayer(1, 'V1-Western-Europe', v1, eu.spawns[0].x, eu.spawns[0].y, eu.spawns[0].color);
      match.addPlayer(2, 'V2.1-Eastern-Europe', v2, eu.spawns[1].x, eu.spawns[1].y, eu.spawns[1].color);
      match.addPlayer(3, 'Bot-Iberia', v1, eu.spawns[2].x, eu.spawns[2].y, eu.spawns[2].color);
      match.addPlayer(4, 'Bot-Anatolia', v1, eu.spawns[3].x, eu.spawns[3].y, eu.spawns[3].color);
    } else if (mapType === 'world') {
      const world = generateWorldMap(80, 40);
      console.log('================================================================================');
      console.log('   SCENARIO: WORLD CONTINENTS TOURNAMENT (V1 vs V2.1 vs BOTS)                   ');
      console.log('================================================================================');
      match = new SpatialMapMatch({ customMap: world, maxTicks, exportPath });
      match.addPlayer(1, 'V1-North-America', v1, world.spawns[0].x, world.spawns[0].y, world.spawns[0].color);
      match.addPlayer(2, 'V2.1-Eurasia', v2, world.spawns[1].x, world.spawns[1].y, world.spawns[1].color);
      match.addPlayer(3, 'Bot-South-America', v1, world.spawns[2].x, world.spawns[2].y, world.spawns[2].color);
      match.addPlayer(4, 'Bot-Africa', v1, world.spawns[3].x, world.spawns[3].y, world.spawns[3].color);
    } else if (mapType === 'archipelago') {
      const arch = generateArchipelagoMap(80, 40);
      console.log('================================================================================');
      console.log('   SCENARIO: ARCHIPELAGO & STRAITS VORONOI NAVAL GRAND PRIX                     ');
      console.log('================================================================================');
      match = new SpatialMapMatch({ customMap: arch, maxTicks, exportPath });
      match.addPlayer(1, 'V1-NW-Isle', v1, arch.spawns[0].x, arch.spawns[0].y, arch.spawns[0].color);
      match.addPlayer(2, 'V2.1-NE-Isle', v2, arch.spawns[1].x, arch.spawns[1].y, arch.spawns[1].color);
      match.addPlayer(3, 'Bot-SW-Isle', v1, arch.spawns[2].x, arch.spawns[2].y, arch.spawns[2].color);
      match.addPlayer(4, 'Bot-SE-Isle', v1, arch.spawns[3].x, arch.spawns[3].y, arch.spawns[3].color);
    } else if (isFFA) {
      console.log('================================================================================');
      console.log('   SCENARIO: 4-PLAYER CONTINENTAL FFA (V1 vs V2.1 vs BOTS)                      ');
      console.log('================================================================================');
      match = new SpatialMapMatch({ maxTicks, exportPath });
      match.addPlayer(1, 'V1-Baseline', v1, 8, 4, '\x1b[31m');        // North-West
      match.addPlayer(2, 'V2.1-Spectral', v2, 8, 15, '\x1b[32m');    // South-West
      match.addPlayer(3, 'Bot-Aggressive', v1, 30, 4, '\x1b[33m');    // North-East
      match.addPlayer(4, 'Bot-Defensive', v1, 30, 15, '\x1b[35m');   // South-East
    } else {
      console.log('================================================================================');
      console.log('   SCENARIO: 1v1 CONTINENTAL DUEL ACROSS ISTHMUS (V1 vs V2.1 SYMMETRIC)         ');
      console.log('================================================================================');
      match = new SpatialMapMatch({ maxTicks, exportPath });
      match.addPlayer(1, 'V1-Baseline', v1, 10, 4, '\x1b[31m');       // North (Red)
      match.addPlayer(2, 'V2.1-Spectral', v2, 10, 15, '\x1b[32m');   // South (Green)
    }

    const res = await match.runAsync({ live, fps, silent });
    if (!live) console.log(match.render());
    console.log('\n================================================================================');
    console.log(`MATCH WINNER: Player ${res.winner.id} (${res.winner.name}) with ${res.winner.territory} pixels!`);
    console.log('================================================================================\n');
  })();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SpatialMapMatch };
}
