/**
 * PHASE 1 — HOLDOUT TOURNAMENT (200 FRESH MATCHES)
 * ================================================
 * Evaluates V2.5 exactly as shipped against authentic Dump dU Very Hard bots.
 * Complete randomization: seeds, maps, sizes, spawns, opponent counts.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { VeryHardBot, RigorousMatchSimulation, loadEngine } = require('./rigorous-simulator.cjs');

// Load shipped V2.5 engine
const v2_5 = loadEngine(path.join(__dirname, '../content/engine-core.js'));

function computeWilsonCI(wins, total, z = 1.96) {
  if (total === 0) return { lower: 0, upper: 0 };
  const p = wins / total;
  const denominator = 1 + (z * z) / total;
  const center = p + (z * z) / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total));
  return {
    lower: Math.max(0, (center - margin) / denominator),
    upper: Math.min(1, (center + margin) / denominator)
  };
}

function median(arr) {
  if (!arr || arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function runHoldoutTournament(numMatches = 200) {
  console.log('================================================================================');
  console.log(' PHASE 1: HOLDOUT TOURNAMENT (200 UNBIASED MATCHES vs VERY HARD BOTS)');
  console.log('================================================================================');
  console.log('Loading production engine: content/engine-core.js (as shipped)');
  console.log('Opponent Archetype: Dump dU/dD Very Hard Bot (dI=90%, dK=0%, crush, tapering)');
  console.log('Map classes: Europe, World, Archipelago, Procedural Voronoi (various sizes)');
  console.log('Spawn positions: 100% randomized asymmetric placement');
  console.log('Combat physics: strict defender advantage 1.30x (NO chokepoint cheat)');
  console.log('--------------------------------------------------------------------------------\n');

  const mapTypes = ['voronoi', 'europe', 'world', 'archipelago'];
  const mapSizes = [
    { w: 80, h: 40 },
    { w: 100, h: 50 },
    { w: 120, h: 60 }
  ];
  const playerCounts = [2, 3, 4, 6, 10];

  let wins = 0;
  const ranks = [];
  const terrShares = [];
  const survivalTicks = [];
  const allGames = [];
  const lossReasons = {};

  const startTime = Date.now();

  for (let m = 0; m < numMatches; m++) {
    // High-entropy fresh seed
    const matchSeed = 100000 + m * 7919 + (m % 13) * 101;
    const mapType = mapTypes[m % mapTypes.length];
    const size = mapSizes[m % mapSizes.length];
    const totalPlayers = playerCounts[m % playerCounts.length];

    const sim = new RigorousMatchSimulation({
      mapType,
      width: size.w,
      height: size.h,
      seed: matchSeed,
      maxTicks: 250,
      defenderAdvantage: 1.30,
      fogOfWar: false,
      logTrajectory: true
    });

    // Player 1: V2.5
    sim.addPlayer(1, 'V2.5-Candidate', v2_5, { isV2: true });

    // Opponents: Very Hard Bots
    for (let p = 2; p <= totalPlayers; p++) {
      const vhBot = new VeryHardBot(p, 'VH-Bot-' + p, matchSeed + p * 31);
      sim.addPlayer(p, 'VH-Bot-' + p, vhBot, { isV2: false });
    }

    const res = sim.run();

    const myRank = res.rankings.findIndex(p => p.id === 1) + 1;
    const myPlayer = sim.players.find(p => p.id === 1);
    const totalMapTerr = res.rankings.reduce((sum, p) => sum + p.territory, 0);
    const terrShare = totalMapTerr > 0 ? (myPlayer.territory / totalMapTerr) : 0;
    const isWin = res.winner.id === 1;

    if (isWin) wins++;
    ranks.push(myRank);
    terrShares.push(terrShare);
    survivalTicks.push(res.totalTicks);

    let lossReason = null;
    if (!isWin) {
      if (!myPlayer.alive) {
        lossReason = 'ELIMINATED_IN_COMBAT';
      } else if (terrShare < 0.15) {
        lossReason = 'CORNERED_LOW_TERRITORY';
      } else if (res.winner.territory > myPlayer.territory * 1.5) {
        lossReason = 'LEADER_EXPANSION_SNOWBALL';
      } else {
        lossReason = 'DUEL_ATTRITION_TIMEOUT';
      }
      lossReasons[lossReason] = (lossReasons[lossReason] || 0) + 1;
    }

    allGames.push({
      matchIndex: m + 1,
      seed: matchSeed,
      mapType,
      size: size.w + 'x' + size.h,
      players: totalPlayers,
      rank: myRank,
      territory: myPlayer.territory,
      terrShare,
      balance: myPlayer.balance,
      alive: myPlayer.alive,
      ticks: res.totalTicks,
      winner: res.winner.name,
      isWin,
      lossReason
    });

    if ((m + 1) % 50 === 0) {
      const currentWinRate = ((wins / (m + 1)) * 100).toFixed(1);
      console.log('  Completed match ' + String(m + 1).padStart(3) + ' / ' + numMatches + ' | Current Win Rate: ' + currentWinRate + '%');
    }
  }

  const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(2);
  const winRate = (wins / numMatches) * 100;
  const ci = computeWilsonCI(wins, numMatches);
  const avgRank = (ranks.reduce((s, r) => s + r, 0) / numMatches).toFixed(2);
  const medRank = median(ranks);
  const medTerrShare = (median(terrShares) * 100).toFixed(1);
  const medSurvival = median(survivalTicks);

  console.log('\n================================================================================');
  console.log(' PHASE 1: STATISTICAL RESULTS ACROSS 200 HOLDOUT MATCHES');
  console.log('================================================================================');
  console.log('Total Matches:            ' + numMatches);
  console.log('Execution Time:           ' + elapsedSec + 's (' + ((numMatches / elapsedSec)).toFixed(1) + ' matches/sec)');
  console.log('Overall Wins:             ' + wins + ' / ' + numMatches + ' (' + winRate.toFixed(2) + '%)');
  console.log('Wilson 95% CI:            [' + (ci.lower * 100).toFixed(2) + '%, ' + (ci.upper * 100).toFixed(2) + '%]');
  console.log('Average Rank:             ' + avgRank);
  console.log('Median Rank:              ' + medRank);
  console.log('Median Territory Share:   ' + medTerrShare + '%');
  console.log('Median Survival Time:     ' + medSurvival + ' ticks');
  console.log('--------------------------------------------------------------------------------');

  console.log('LOSS REASONS BREAKDOWN:');
  const totalLosses = numMatches - wins;
  if (totalLosses === 0) {
    console.log('  None! (0 losses across all 200 matches)');
  } else {
    for (const [reason, count] of Object.entries(lossReasons)) {
      const pct = ((count / totalLosses) * 100).toFixed(1);
      console.log('  - ' + reason.padEnd(26) + ': ' + count + ' (' + pct + '% of losses)');
    }
  }
  console.log('--------------------------------------------------------------------------------');

  // Worst 10 Games
  const worstGames = [...allGames].sort((a, b) => {
    if (b.rank !== a.rank) return b.rank - a.rank;
    if (a.terrShare !== b.terrShare) return a.terrShare - b.terrShare;
    return a.ticks - b.ticks;
  }).slice(0, 10);

  console.log('WORST 10 GAMES:');
  console.log('Match | Seed   | Map         | Size    | Plyrs | Rank | Terr (Share)  | Ticks | Loss Reason');
  console.log('------+--------+-------------+---------+-------+------+---------------+-------+----------------------');
  for (const g of worstGames) {
    const shareStr = g.territory + ' (' + (g.terrShare * 100).toFixed(1) + '%)';
    console.log(
      String(g.matchIndex).padStart(5) + ' | ' +
      String(g.seed).padStart(6) + ' | ' +
      g.mapType.padEnd(11) + ' | ' +
      g.size.padEnd(7) + ' | ' +
      String(g.players).padStart(5) + ' | ' +
      String(g.rank).padStart(4) + ' | ' +
      shareStr.padStart(13) + ' | ' +
      String(g.ticks).padStart(5) + ' | ' +
      (g.lossReason || 'WON')
    );
  }
  console.log('================================================================================\n');

  // Export results for loss mining and acceptance
  fs.writeFileSync('experiments/phase1-results.json', JSON.stringify({
    totalMatches: numMatches,
    wins,
    winRate,
    ci,
    avgRank,
    medRank,
    medTerrShare,
    medSurvival,
    lossReasons,
    worstGames,
    allGames
  }, null, 2));
}

if (require.main === module) {
  runHoldoutTournament(200);
}

module.exports = { runHoldoutTournament };
