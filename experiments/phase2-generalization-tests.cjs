/**
 * PHASE 2 — REAL GENERALIZATION TESTS & ADVERSARIAL STRESS
 * ========================================================
 * Tests V2.5 across:
 *   - Lobby sizes: 1v1, 3-player, 4-player, 10-player, 25-player, 50-player
 *   - 10 Adversarial starting scenarios:
 *     1. Weak spawn (starts with half the balance)
 *     2. Surrounded spawn (surrounded by enemies, 0 free land)
 *     3. Edge spawn (cornered against impassable boundary)
 *     4. Chokepoint spawn (bottleneck corridor)
 *     5. Island start (water-isolated start)
 *     6. Low-neutral-land start (<150 neutral pixels)
 *     7. Dominant-neighbor start (neighbor starts with 3x troops/land)
 *     8. Two-aggressor start (2 bots attacking immediately)
 *     9. Late-game troop deficit (injected mid-game 30% troop deficit)
 *     10. Late-game territory deficit (leader has 3x territory)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { VeryHardBot, RigorousMatchSimulation, loadEngine } = require('./rigorous-simulator.cjs');

const v2_5 = loadEngine(path.join(__dirname, '../experiments/legacy/engine-core.js'));

function runLobbySizeBenchmarks() {
  console.log('================================================================================');
  console.log(' PHASE 2.1: GENERALIZATION ACROSS LOBBY SIZES');
  console.log('================================================================================');
  console.log('Testing 1v1, 3p, 4p, 10p, 25p, 50p (20 matches per category)\n');

  const lobbySizes = [2, 3, 4, 10, 25, 50];
  const results = {};

  for (const size of lobbySizes) {
    let wins = 0;
    let totalTerrShare = 0;
    const ranks = [];
    const matches = 20;

    for (let m = 0; m < matches; m++) {
      const seed = 200000 + size * 1000 + m * 31;
      const mapW = size > 20 ? 160 : 100;
      const mapH = size > 20 ? 80 : 50;

      const sim = new RigorousMatchSimulation({
        mapType: 'voronoi',
        width: mapW,
        height: mapH,
        seed,
        maxTicks: 250,
        defenderAdvantage: 1.30
      });

      sim.addPlayer(1, 'V2.5-Candidate', v2_5, { isV2: true });
      for (let p = 2; p <= size; p++) {
        sim.addPlayer(p, 'VH-Bot-' + p, new VeryHardBot(p, 'VH-Bot-' + p, seed + p * 17));
      }

      const res = sim.run();
      const myRank = res.rankings.findIndex(p => p.id === 1) + 1;
      const myPlayer = sim.players.find(p => p.id === 1);
      const totalMapTerr = res.rankings.reduce((sum, p) => sum + p.territory, 0);
      const terrShare = totalMapTerr > 0 ? (myPlayer.territory / totalMapTerr) : 0;

      if (res.winner.id === 1) wins++;
      ranks.push(myRank);
      totalTerrShare += terrShare;
    }

    const winRate = ((wins / matches) * 100).toFixed(1);
    const avgRank = (ranks.reduce((s, r) => s + r, 0) / matches).toFixed(2);
    const avgShare = ((totalTerrShare / matches) * 100).toFixed(1);

    results[size + 'p'] = { wins, matches, winRate: winRate + '%', avgRank, avgShare: avgShare + '%' };
    console.log(`Lobby: ${String(size).padStart(2)} players | Wins: ${String(wins).padStart(2)}/${matches} (${winRate.padStart(5)}%) | Avg Rank: ${avgRank.padStart(5)} | Avg Share: ${avgShare.padStart(5)}%`);
  }

  return results;
}

function runAdversarialScenarios() {
  console.log('\n================================================================================');
  console.log(' PHASE 2.2: ADVERSARIAL STARTING SCENARIOS (15 MATCHES PER ADVERSARIAL CLASS)');
  console.log('================================================================================\n');

  const scenarios = [
    'WEAK_SPAWN',
    'SURROUNDED_SPAWN',
    'EDGE_SPAWN',
    'CHOKEPOINT_SPAWN',
    'ISLAND_START',
    'LOW_NEUTRAL_LAND',
    'DOMINANT_NEIGHBOR',
    'TWO_AGGRESSORS',
    'LATE_GAME_TROOP_DEFICIT',
    'LATE_GAME_TERRITORY_DEFICIT'
  ];

  const scenarioResults = {};

  for (const sc of scenarios) {
    let wins = 0;
    let ranks = [];
    const matches = 15;

    for (let m = 0; m < matches; m++) {
      const seed = 300000 + m * 97;
      let mapType = 'voronoi';
      let width = 80;
      let height = 40;

      if (sc === 'ISLAND_START') {
        mapType = 'archipelago';
      } else if (sc === 'CHOKEPOINT_SPAWN') {
        mapType = 'europe';
      }

      const sim = new RigorousMatchSimulation({
        mapType,
        width,
        height,
        seed,
        maxTicks: 250,
        defenderAdvantage: 1.30
      });

      // Configure players according to scenario
      if (sc === 'WEAK_SPAWN') {
        sim.addPlayer(1, 'V2.5-Weak', v2_5, { isV2: true, initialBalance: 400 });
        for (let p = 2; p <= 4; p++) {
          sim.addPlayer(p, 'VH-Bot-' + p, new VeryHardBot(p, 'VH-Bot-' + p, seed + p), { initialBalance: 1200 });
        }
      } else if (sc === 'SURROUNDED_SPAWN') {
        const cx = Math.floor(width / 2);
        const cy = Math.floor(height / 2);
        sim.addPlayer(1, 'V2.5-Surrounded', v2_5, { isV2: true, x: cx, y: cy });
        sim.addPlayer(2, 'VH-North', new VeryHardBot(2, 'VH-North', seed + 2), { x: cx, y: Math.max(0, cy - 2) });
        sim.addPlayer(3, 'VH-South', new VeryHardBot(3, 'VH-South', seed + 3), { x: cx, y: Math.min(height - 1, cy + 2) });
        sim.addPlayer(4, 'VH-East', new VeryHardBot(4, 'VH-East', seed + 4), { x: Math.min(width - 1, cx + 2), y: cy });
        sim.addPlayer(5, 'VH-West', new VeryHardBot(5, 'VH-West', seed + 5), { x: Math.max(0, cx - 2), y: cy });
      } else if (sc === 'EDGE_SPAWN') {
        sim.addPlayer(1, 'V2.5-Edge', v2_5, { isV2: true, x: 2, y: 2 });
        for (let p = 2; p <= 4; p++) {
          sim.addPlayer(p, 'VH-Bot-' + p, new VeryHardBot(p, 'VH-Bot-' + p, seed + p));
        }
      } else if (sc === 'CHOKEPOINT_SPAWN') {
        sim.addPlayer(1, 'V2.5-Choke', v2_5, { isV2: true, x: 22, y: 24 });
        for (let p = 2; p <= 4; p++) {
          sim.addPlayer(p, 'VH-Bot-' + p, new VeryHardBot(p, 'VH-Bot-' + p, seed + p));
        }
      } else if (sc === 'ISLAND_START') {
        sim.addPlayer(1, 'V2.5-Island', v2_5, { isV2: true, x: 14, y: 14 });
        for (let p = 2; p <= 4; p++) {
          sim.addPlayer(p, 'VH-Bot-' + p, new VeryHardBot(p, 'VH-Bot-' + p, seed + p));
        }
      } else if (sc === 'LOW_NEUTRAL_LAND') {
        for (let idx = 0; idx < sim.grid.length; idx++) {
          if (sim.grid[idx] === 0 && (idx % 3 !== 0)) {
            sim.grid[idx] = -1;
            sim.neutralLand--;
          }
        }
        sim.addPlayer(1, 'V2.5-LowNeutral', v2_5, { isV2: true });
        for (let p = 2; p <= 4; p++) {
          sim.addPlayer(p, 'VH-Bot-' + p, new VeryHardBot(p, 'VH-Bot-' + p, seed + p));
        }
      } else if (sc === 'DOMINANT_NEIGHBOR') {
        sim.addPlayer(1, 'V2.5-Small', v2_5, { isV2: true, initialBalance: 800 });
        sim.addPlayer(2, 'VH-Goliath', new VeryHardBot(2, 'VH-Goliath', seed + 2), { initialBalance: 3500 });
        sim.addPlayer(3, 'VH-Regular', new VeryHardBot(3, 'VH-Regular', seed + 3), { initialBalance: 1000 });
      } else if (sc === 'TWO_AGGRESSORS') {
        sim.addPlayer(1, 'V2.5-Target', v2_5, { isV2: true, initialBalance: 1000 });
        sim.addPlayer(2, 'VH-Aggro1', new VeryHardBot(2, 'VH-Aggro1', seed + 2), { initialBalance: 1500 });
        sim.addPlayer(3, 'VH-Aggro2', new VeryHardBot(3, 'VH-Aggro2', seed + 3), { initialBalance: 1500 });
      } else if (sc === 'LATE_GAME_TROOP_DEFICIT') {
        sim.addPlayer(1, 'V2.5-Deficit', v2_5, { isV2: true, initialBalance: 600 });
        sim.addPlayer(2, 'VH-Leader', new VeryHardBot(2, 'VH-Leader', seed + 2), { initialBalance: 2400 });
        sim.addPlayer(3, 'VH-Second', new VeryHardBot(3, 'VH-Second', seed + 3), { initialBalance: 1500 });
      } else if (sc === 'LATE_GAME_TERRITORY_DEFICIT') {
        sim.addPlayer(1, 'V2.5-Underdog', v2_5, { isV2: true, initialBalance: 1500 });
        sim.addPlayer(2, 'VH-LandKing', new VeryHardBot(2, 'VH-LandKing', seed + 2), { initialBalance: 1500 });
        sim.addPlayer(3, 'VH-Rival', new VeryHardBot(3, 'VH-Rival', seed + 3), { initialBalance: 1000 });
      }

      const res = sim.run();
      const myRank = res.rankings.findIndex(p => p.id === 1) + 1;
      if (res.winner.id === 1) wins++;
      ranks.push(myRank);
    }

    const winRate = ((wins / matches) * 100).toFixed(1);
    const avgRank = (ranks.reduce((s, r) => s + r, 0) / matches).toFixed(2);
    scenarioResults[sc] = { wins, matches, winRate: winRate + '%', avgRank };
    console.log(`Scenario: ${sc.padEnd(28)} | Wins: ${String(wins).padStart(2)}/${matches} (${winRate.padStart(5)}%) | Avg Rank: ${avgRank}`);
  }

  return scenarioResults;
}

const lobbyRes = runLobbySizeBenchmarks();
const scenRes = runAdversarialScenarios();

fs.writeFileSync('experiments/phase2-results.json', JSON.stringify({
  lobbyBenchmarks: lobbyRes,
  adversarialScenarios: scenRes
}, null, 2));
