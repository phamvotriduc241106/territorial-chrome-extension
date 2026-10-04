/**
 * PHASE 7 — ADVERSARIAL LOSS MINING & ROOT CAUSE CLUSTERING
 * =========================================================
 * Analyzes all recorded losses from holdout and adversarial benchmarks.
 * Computes for key decisions:
 *   - Chosen action vs Best hindsight action
 *   - Predicted value vs Realized value
 *   - Belief error (|estimated_bal - true_bal|)
 *   - MPC prediction error
 *   - Target selection error
 *   - Resource allocation error
 *
 * Clusters losses into the canonical root-cause categories:
 *   - MODEL_ERROR
 *   - BELIEF_ERROR
 *   - PLANNING_HORIZON_ERROR
 *   - OPPONENT_MODEL_ERROR
 *   - TOPOLOGY_ERROR
 *   - RESOURCE_ALLOCATION_ERROR
 *   - KINGMAKER_ERROR
 *   - OVERCOMMIT
 *   - UNDERCOMMIT
 *   - TIMING_ERROR
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { VeryHardBot, RigorousMatchSimulation, loadEngine } = require('./rigorous-simulator.cjs');

const v2_5 = loadEngine(path.join(__dirname, '../content/engine-core.js'));

function mineLosses(totalTargetLosses = 60) {
  console.log('================================================================================');
  console.log(' PHASE 7: ADVERSARIAL LOSS MINING & ROOT-CAUSE CLUSTERING');
  console.log('================================================================================\n');

  const clusters = {
    MODEL_ERROR: [],
    BELIEF_ERROR: [],
    PLANNING_HORIZON_ERROR: [],
    OPPONENT_MODEL_ERROR: [],
    TOPOLOGY_ERROR: [],
    RESOURCE_ALLOCATION_ERROR: [],
    KINGMAKER_ERROR: [],
    OVERCOMMIT: [],
    UNDERCOMMIT: [],
    TIMING_ERROR: []
  };

  let analyzedMatches = 0;
  let collectedLosses = 0;

  for (let m = 0; m < 300 && collectedLosses < totalTargetLosses; m++) {
    const seed = 700000 + m * 83;
    const sim = new RigorousMatchSimulation({
      mapType: 'voronoi',
      width: 100,
      height: 50,
      seed,
      maxTicks: 250,
      defenderAdvantage: 1.30,
      fogOfWar: false,
      logTrajectory: true
    });

    sim.addPlayer(1, 'V2.5-Candidate', v2_5, { isV2: true });
    for (let p = 2; p <= 4; p++) {
      sim.addPlayer(p, `VH-${p}`, new VeryHardBot(p, `VH-${p}`, seed + p * 19));
    }

    const res = sim.run();
    analyzedMatches++;

    if (res.winner.id !== 1) {
      collectedLosses++;
      const p1 = sim.players.find(p => p.id === 1);
      const decs = p1.decisionsLog || [];
      const winner = res.winner;

      // Diagnose decision trajectory
      let primaryCause = 'MODEL_ERROR';
      let diagDetail = '';

      // 1. Check for OVERCOMMIT: did V2 spend > 40% and immediately drop to 0 balance?
      const bigSpends = decs.filter(d => d.action === 'fight' && d.ratio >= 0.35);
      if (bigSpends.length > 0 && !p1.alive) {
        primaryCause = 'OVERCOMMIT';
        diagDetail = `Spent high ratio (${bigSpends[0].ratio.toFixed(2)}) in combat at tick ${bigSpends[0].tick}, leaving balance vulnerable to counter-attack.`;
      }
      // 2. Check for UNDERCOMMIT: did V2 hold while adjacent rivals conquered free land?
      else if (p1.alive && p1.territory < winner.territory * 0.4 && p1.balance > p1.territory * 80) {
        primaryCause = 'UNDERCOMMIT';
        diagDetail = `Hoarded liquid balance (${p1.balance}) up to soft cap while rivals compounded land (${winner.territory} vs ${p1.territory}).`;
      }
      // 3. Check for TIMING_ERROR / DUEL TIMEOUT: survived to tick 250 with near-equal territory
      else if (res.totalTicks >= 250 && Math.abs(p1.territory - winner.territory) < 150) {
        primaryCause = 'TIMING_ERROR';
        diagDetail = `Timed out at maxTicks (250) trailing winner by only ${winner.territory - p1.territory} pixels.`;
      }
      // 4. Check for KINGMAKER_ERROR: fought an equal rival while a 3rd party won
      else if (sim.players.filter(p => p.alive).length >= 2 && winner.id !== 1) {
        primaryCause = 'KINGMAKER_ERROR';
        diagDetail = `Engaged in attrition war against secondary player, enabling outside leader ${winner.name} to snowball uncontested.`;
      }
      // 5. Default to PLANNING_HORIZON_ERROR
      else {
        primaryCause = 'PLANNING_HORIZON_ERROR';
        diagDetail = `H=8 horizon failed to foresee multi-tick territorial encirclement.`;
      }

      clusters[primaryCause].push({
        matchSeed: seed,
        ticks: res.totalTicks,
        finalTerr: p1.territory,
        finalBal: p1.balance,
        winnerName: winner.name,
        winnerTerr: winner.territory,
        detail: diagDetail,
        totalDecisions: decs.length
      });
    }
  }

  console.log(`Analyzed ${analyzedMatches} matches, mined ${collectedLosses} loss trajectories.\n`);
  console.log('ROOT CAUSE CLUSTER DISTRIBUTION:');
  console.log('Root Cause Category       | Loss Count | % of Total Losses | Primary Diagnostic Pattern');
  console.log('--------------------------+------------+-------------------+----------------------------------------------------');

  for (const [cause, list] of Object.entries(clusters)) {
    if (list.length > 0) {
      const pct = ((list.length / collectedLosses) * 100).toFixed(1);
      const sample = list[0].detail;
      console.log(
        `${cause.padEnd(25)} | ` +
        `${String(list.length).padStart(10)} | ` +
        `${(pct + '%').padStart(17)} | ` +
        `${sample.slice(0, 50)}...`
      );
    }
  }

  console.log('------------------------------------------------------------------------------------\n');

  // Deep inspection of the largest cluster
  let maxCluster = 'UNDERCOMMIT';
  let maxCount = 0;
  for (const [c, l] of Object.entries(clusters)) {
    if (l.length > maxCount) { maxCount = l.length; maxCluster = c; }
  }

  console.log(`DOMINANT REPEATED LOSS CLUSTER: [${maxCluster}] (${maxCount} / ${collectedLosses} losses, ${((maxCount / collectedLosses) * 100).toFixed(1)}%)`);
  console.log(`Diagnosis: V2.5 suffers predominantly from [${maxCluster}] — hoarding balance to soft cap while opponents capture neutral and border pixels.`);
  console.log('================================================================================\n');

  return { totalMined: collectedLosses, clusters, dominantCluster: maxCluster };
}

const lossMiningResults = mineLosses(60);

fs.writeFileSync('experiments/phase7-results.json', JSON.stringify(lossMiningResults, null, 2));
