/**
 * Zero-allocation MCTS endgame solver using flat typed arrays.
 * Optimized for Apple M4 ARM64 (Node.js/V8).
 */

const MAX_ENEMIES = 8;
const MAX_ACTIONS = 24;
const CONFIG = {
  cMCTS: 1.414,
  maxSimSteps: 6,
  attackChance: 0.35,
  attackRatio: 0.2,
  attackSuccessMult: 1.25,
  terrLossPct: 0.15,
  defDrainPct: 0.70,
};

// Pre-allocate arrays outside rollout loop to prevent GC pauses
const simBal = new Float64Array(MAX_ENEMIES + 1);
const simTerr = new Float64Array(MAX_ENEMIES + 1);
const visits = new Int32Array(MAX_ACTIONS);
const totalReward = new Float64Array(MAX_ACTIONS);

// Parallel arrays for actions
const actType = new Int32Array(MAX_ACTIONS); // 0: hold, 1: fight, 2: expand
const actTargetId = new Int32Array(MAX_ACTIONS);
const actTargetIdx = new Int32Array(MAX_ACTIONS);
const actRatio = new Float64Array(MAX_ACTIONS);

// Pre-compute log table for UCT
const MAX_ROLLOUTS_LIMIT = 50000;
const logTable = new Float64Array(MAX_ROLLOUTS_LIMIT);
for (let i = 0; i < MAX_ROLLOUTS_LIMIT; i++) {
  logTable[i] = Math.log(i + 1);
}

let prngState = 123456789;
function nextFloat() {
  let s = prngState;
  s ^= s << 13;
  s ^= s >>> 17;
  s ^= s << 5;
  prngState = s >>> 0;
  return prngState / 4294967296.0;
}

/**
 * @param {object} state - { territory, balance, adjEnemies: [{id, bal, terr}, ...] }
 * @param {number} maxRolloutsParam - max rollout count (default 50)
 * @param {number} timeBudgetMs - time budget in ms (default 0.6)
 * @returns {object} { bestAction, targetId, ratio, winProb, rollouts }
 */
function computeMCTSFlat(state, maxRolloutsParam, timeBudgetMs) {
  if (!state) {
    return { bestAction: 'hold', targetId: null, ratio: 0, winProb: 0.5, rollouts: 0 };
  }

  const enemies = state.adjEnemies || [];
  const numEnemies = Math.min(enemies.length, MAX_ENEMIES);

  if (numEnemies === 0) {
    return { bestAction: 'expand', targetId: null, ratio: 1.0, winProb: 1.0, rollouts: 0 };
  }

  const maxRollouts = maxRolloutsParam || 50;
  const timeLimit = (timeBudgetMs || 0.6) + performance.now();

  // Seed PRNG
  prngState = ((state.balance || 123) * 1664525 + 1013904223) >>> 0;
  if (prngState === 0) prngState = 1; // xorshift32 cannot have 0 state

  // Build actions
  let numActions = 0;

  // 1. Hold
  actType[numActions] = 0; // hold
  actTargetId[numActions] = 0;
  actTargetIdx[numActions] = 0;
  actRatio[numActions] = 0;
  numActions++;

  // 2. Fights
  for (let i = 0; i < numEnemies && numActions < MAX_ACTIONS; i++) {
    const enemy = enemies[i];
    
    // Fight 0.25
    actType[numActions] = 1; // fight
    actTargetId[numActions] = enemy.id;
    actTargetIdx[numActions] = i + 1; // 1-indexed for sim arrays
    actRatio[numActions] = 0.25;
    numActions++;

    // Fight 0.50
    if (state.balance > enemy.bal * 1.5 && numActions < MAX_ACTIONS) {
      actType[numActions] = 1; // fight
      actTargetId[numActions] = enemy.id;
      actTargetIdx[numActions] = i + 1;
      actRatio[numActions] = 0.50;
      numActions++;
    }
  }

  // Clear MCTS stats
  for (let a = 0; a < numActions; a++) {
    visits[a] = 0;
    totalReward[a] = 0.0;
  }

  const cMCTS = CONFIG.cMCTS;
  let rollouts = 0;

  // Main MCTS Loop
  while (rollouts < maxRollouts) {
    if ((rollouts & 15) === 0 && performance.now() > timeLimit) {
      break;
    }

    // UCT Selection
    let selectedAction = 0;
    let bestScore = -1.0;
    
    // Inline Math.sqrt(Math.log(...)) using cached logTable
    const logIterTableVal = rollouts < MAX_ROLLOUTS_LIMIT ? logTable[rollouts] : Math.log(rollouts + 1);

    for (let a = 0; a < numActions; a++) {
      if (visits[a] === 0) {
        selectedAction = a;
        break;
      }
      const exploit = totalReward[a] / visits[a];
      const explore = cMCTS * Math.sqrt(logIterTableVal / visits[a]);
      const score = exploit + explore;
      if (score > bestScore) {
        bestScore = score;
        selectedAction = a;
      }
    }

    // Set up initial state for rollout
    simBal[0] = state.balance || 0;
    simTerr[0] = state.territory || 0;
    for (let i = 0; i < numEnemies; i++) {
      simBal[i + 1] = enemies[i].bal || 0;
      simTerr[i + 1] = enemies[i].terr || 0;
    }

    // Apply selected action
    const sType = actType[selectedAction];
    if (sType === 1) { // fight
      const sTargetIdx = actTargetIdx[selectedAction];
      const attackAmt = simBal[0] * actRatio[selectedAction];
      simBal[0] -= attackAmt;
      
      const defenseThreshold = simBal[sTargetIdx] * CONFIG.attackSuccessMult;
      if (attackAmt > defenseThreshold) {
        const stolen = simTerr[sTargetIdx] * CONFIG.terrLossPct;
        simTerr[sTargetIdx] -= stolen;
        simTerr[0] += stolen;
      } else {
        simBal[sTargetIdx] -= attackAmt * CONFIG.defDrainPct;
        if (simBal[sTargetIdx] < 0) simBal[sTargetIdx] = 0;
      }
    }

    // Rollout Simulation
    let usDead = false;
    let enemiesDead = false;

    for (let step = 0; step < CONFIG.maxSimSteps; step++) {
      // 1. Balance Growth
      let terr0 = simTerr[0];
      let bal0 = simBal[0];
      simBal[0] = Math.min(terr0 * 100, bal0 * 1.05);

      let totalEnemyTerr = 0;
      for (let i = 1; i <= numEnemies; i++) {
        let terr = simTerr[i];
        if (terr > 0) {
          simBal[i] = Math.min(terr * 100, simBal[i] * 1.05);
          totalEnemyTerr += terr;
        }
      }

      if (terr0 <= 0) usDead = true;
      if (totalEnemyTerr <= 0) enemiesDead = true;
      if (usDead || enemiesDead) break;

      // 2. Enemy Attacks
      for (let i = 1; i <= numEnemies; i++) {
        if (simTerr[i] <= 0) continue;
        
        if (nextFloat() < CONFIG.attackChance) {
          const attackAmt = simBal[i] * CONFIG.attackRatio;
          
          // Find weakest (including us)
          let weakestIdx = -1;
          let minBal = 999999999;
          for (let p = 0; p <= numEnemies; p++) {
            if (p === i || simTerr[p] <= 0) continue;
            if (simBal[p] < minBal) {
              minBal = simBal[p];
              weakestIdx = p;
            }
          }

          if (weakestIdx !== -1) {
            simBal[i] -= attackAmt;
            const defenseThreshold = simBal[weakestIdx] * CONFIG.attackSuccessMult;
            if (attackAmt > defenseThreshold) {
              const stolen = simTerr[weakestIdx] * CONFIG.terrLossPct;
              simTerr[weakestIdx] -= stolen;
              simTerr[i] += stolen;
            } else {
              simBal[weakestIdx] -= attackAmt * CONFIG.defDrainPct;
              if (simBal[weakestIdx] < 0) simBal[weakestIdx] = 0;
            }
          }
        }
      }
    }

    // Utility calculation
    let reward = 0.0;
    if (simTerr[0] <= 0) {
      reward = 0.0;
    } else {
      let totalEnemyTerr = 0;
      let totalEnemyBal = 0;
      for (let i = 1; i <= numEnemies; i++) {
        if (simTerr[i] > 0) {
          totalEnemyTerr += simTerr[i];
          totalEnemyBal += simBal[i];
        }
      }

      if (totalEnemyTerr <= 0) {
        reward = 1.0;
      } else {
        const totalTerr = simTerr[0] + totalEnemyTerr;
        const totalBal = simBal[0] + totalEnemyBal;
        
        const terrShare = totalTerr > 0 ? simTerr[0] / totalTerr : 0;
        const balShare = totalBal > 0 ? simBal[0] / totalBal : 0;
        
        reward = 0.75 * (terrShare * 0.6 + balShare * 0.4);
      }
    }

    // Backprop
    visits[selectedAction]++;
    totalReward[selectedAction] += reward;
    rollouts++;
  }

  // Select best action (most visited)
  let bestAct = 0;
  let maxVisits = -1;
  for (let a = 0; a < numActions; a++) {
    if (visits[a] > maxVisits) {
      maxVisits = visits[a];
      bestAct = a;
    }
  }

  let finalActionStr = 'hold';
  if (actType[bestAct] === 1) finalActionStr = 'fight';
  
  const winProbRaw = maxVisits > 0 ? (totalReward[bestAct] / maxVisits) : 0;
  const winProb = Math.fround(winProbRaw);

  return {
    bestAction: finalActionStr,
    targetId: actTargetId[bestAct] || null,
    ratio: actRatio[bestAct],
    winProb: Number(winProb.toFixed(3)),
    rollouts: rollouts
  };
}

module.exports = { computeMCTSFlat };
