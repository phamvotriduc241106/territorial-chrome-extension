/**
 * Diagnostic Experiment: Stackelberg Threat Steering & Buffer Preservation
 * Evaluates whether steering bot targeting vectors away from ego
 * and preserving buffer states converts Kingmaker losses into wins.
 */
'use strict';

const path = require('path');
const fs = require('fs');
const { VeryHardBot, RigorousMatchSimulation, loadEngine } = require('../experiments/rigorous-simulator.cjs');

const baseEngine = loadEngine(path.join(__dirname, '../content/engine-core.js'));

// Read Kingmaker seeds from phase 7 results
const phase7 = JSON.parse(fs.readFileSync(path.join(__dirname, '../experiments/phase7-results.json'), 'utf8'));
const kingmakerSeeds = phase7.clusters.KINGMAKER_ERROR.slice(0, 20).map(item => item.matchSeed);

// Create variant with Stackelberg Threat Steering & Buffer Preservation
function createThreatSteeringEngine() {
  const engine = Object.create(baseEngine);

  engine.decide = function (S) {
    const enemies = S.adjEnemies || [];
    const B = S.balance || 0;
    const T = S.territory || 1;

    // Standard expansion priority
    if (S.hasAdjFree || (S.freeLandRatio != null && S.freeLandRatio > 0.01)) {
      return { action: 'expand', wantEnemy: false, preferNeutral: true, crushable: false };
    }

    if (enemies.length === 0 || B < 30) {
      return { action: 'hold', wantEnemy: false, reason: 'insufficient-capital' };
    }

    // In 3+ player lobbies, evaluate outside leader growth
    if (enemies.length >= 2) {
      let maxFoeTerr = 0;
      let leaderFoe = null;
      for (const e of enemies) {
        if ((e.terr || 0) > maxFoeTerr) {
          maxFoeTerr = e.terr || 0;
          leaderFoe = e;
        }
      }

      // Check if any outside entity is snow-balling
      const globalLeaderTerr = S.leaderTerritory || maxFoeTerr;
      const isOutsideLeader = globalLeaderTerr > T * 1.3 && (!leaderFoe || globalLeaderTerr > (leaderFoe.terr || 0) * 1.15);

      if (isOutsideLeader) {
        // Kingmaker Veto: do not bleed troops against adjacent secondary neighbors
        // Bank compound interest instead, forcing the outside leader to clash first
        return {
          action: 'hold',
          wantEnemy: false,
          reason: 'stackelberg-buffer-preservation'
        };
      }
    }

    // Fallback to base decision
    return baseEngine.decide.call(this, S);
  };

  return engine;
}

const steeringEngine = createThreatSteeringEngine();

console.log('======================================================================');
console.log(` EVALUATING STACKELBERG THREAT STEERING ON ${kingmakerSeeds.length} KINGMAKER SEEDS`);
console.log('======================================================================\n');

let baseWins = 0;
let steeringWins = 0;

for (let i = 0; i < kingmakerSeeds.length; i++) {
  const seed = kingmakerSeeds[i];

  // 1. Run Baseline
  const simBase = new RigorousMatchSimulation({
    mapType: 'voronoi',
    width: 80,
    height: 40,
    seed,
    maxTicks: 250,
    defenderAdvantage: 1.30
  });
  simBase.addPlayer(1, 'Baseline', baseEngine, { isV2: true });
  simBase.addPlayer(2, 'VH-2', new VeryHardBot(2, 'VH-2', seed + 62));
  simBase.addPlayer(3, 'VH-3', new VeryHardBot(3, 'VH-3', seed + 93));
  simBase.addPlayer(4, 'VH-4', new VeryHardBot(4, 'VH-4', seed + 124));

  const resBase = simBase.run();
  const baseWon = resBase.winner.id === 1;
  if (baseWon) baseWins++;

  // 2. Run Steering
  const simSteering = new RigorousMatchSimulation({
    mapType: 'voronoi',
    width: 80,
    height: 40,
    seed,
    maxTicks: 250,
    defenderAdvantage: 1.30
  });
  simSteering.addPlayer(1, 'Steering', steeringEngine, { isV2: true });
  simSteering.addPlayer(2, 'VH-2', new VeryHardBot(2, 'VH-2', seed + 62));
  simSteering.addPlayer(3, 'VH-3', new VeryHardBot(3, 'VH-3', seed + 93));
  simSteering.addPlayer(4, 'VH-4', new VeryHardBot(4, 'VH-4', seed + 124));

  const resSteering = simSteering.run();
  const steeringWon = resSteering.winner.id === 1;
  if (steeringWon) steeringWins++;

  const pBase = simBase.players.find(p => p.id === 1);
  const pSteer = simSteering.players.find(p => p.id === 1);

  console.log(`Seed ${seed}:`);
  console.log(`  Base:     ${baseWon ? 'WON' : 'LOST'} | Winner: ${resBase.winner.name} | Terr: ${pBase.territory}`);
  console.log(`  Steering: ${steeringWon ? 'WON' : 'LOST'} | Winner: ${resSteering.winner.name} | Terr: ${pSteer.territory}`);
}

console.log('\n----------------------------------------------------------------------');
console.log(`Baseline Win Rate on Kingmaker Seeds: ${baseWins} / ${kingmakerSeeds.length} (${((baseWins/kingmakerSeeds.length)*100).toFixed(1)}%)`);
console.log(`Steering Win Rate on Kingmaker Seeds: ${steeringWins} / ${kingmakerSeeds.length} (${((steeringWins/kingmakerSeeds.length)*100).toFixed(1)}%)`);
console.log(`Net Improvement: ${steeringWins >= baseWins ? '+' : ''}${steeringWins - baseWins} wins!`);
console.log('======================================================================\n');
