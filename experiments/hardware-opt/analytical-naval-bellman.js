/**
 * Fast Analytical Naval Bellman Bridgehead Policy Solver
 * =======================================================
 * Accelerated dynamic programming for cross-water amphibious invasions.
 * Optimizations:
 *   1. Pre-computed discount factor & compounding factor LUT (eliminates Math.pow)
 *   2. Fast evaluation loop across commit ratios
 *   3. In-place insertion sort for ranked shores (avoids Array.sort overhead)
 *   4. Zero allocations in inner evaluation
 */
'use strict';

const MAX_TRANSIT_TICKS = 128;
const betaLUT = new Float64Array(MAX_TRANSIT_TICKS + 1);
const compoundLUT = new Float64Array(MAX_TRANSIT_TICKS + 1);
let lastRate = -1;

function updateLUT(rPerTick) {
  if (rPerTick === lastRate) return;
  lastRate = rPerTick;
  betaLUT[0] = 1.0;
  compoundLUT[0] = 1.0;
  const factor = 1.0 + rPerTick;
  let comp = 1.0;
  for (let t = 1; t <= MAX_TRANSIT_TICKS; t++) {
    comp *= factor;
    compoundLUT[t] = comp;
    betaLUT[t] = 1.0 / comp;
  }
}

const U_STEPS = [0.08, 0.12, 0.16, 0.20, 0.25, 0.30, 0.38, 0.45];

function computeNavalBellmanFast(landingCandidates, stateCtx, options) {
  if (!landingCandidates || !landingCandidates.length || !stateCtx) {
    return {
      viable: false,
      bestShore: null,
      commitRatio: 0,
      troopsToSend: 0,
      npv: -1e9,
      footholdProb: 0,
      transitTicks: 0,
      rankedShores: []
    };
  }

  const B = Math.max(0, stateCtx.balance || 0);
  if (B < 35) {
    return {
      viable: false,
      bestShore: null,
      commitRatio: 0,
      troopsToSend: 0,
      npv: -1e9,
      footholdProb: 0,
      transitTicks: 0,
      rankedShores: []
    };
  }

  options = options || {};
  const vBoat = options.vBoat || 2.0;
  const shoreDefMult = options.shoreDefMult || 1.45;
  const interestRate = options.interestRate || 0.035;
  const cycleInterval = options.cycleInterval || 10;
  const rPerTick = interestRate / cycleInterval;
  const waterFriction = options.waterFriction || 0.004;

  updateLUT(rPerTick);

  const numCandidates = landingCandidates.length;
  const scoredShores = new Array(numCandidates);

  for (let i = 0; i < numCandidates; i++) {
    const shore = landingCandidates[i];
    if (!shore) continue;

    const waterDist = Math.max(1, shore.waterDist || 1);
    const transitTicks = Math.max(1, Math.ceil(waterDist / vBoat));
    const clampedTicks = Math.min(MAX_TRANSIT_TICKS, transitTicks);
    const beta = betaLUT[clampedTicks];
    const compoundFactor = compoundLUT[clampedTicks];

    const isNeutral = shore.type === 'NEUTRAL' || !shore.enemyId;
    const targetBal = isNeutral ? 0 : Math.max(0, shore.targetBal != null ? shore.targetBal : (shore.enemyBal || 50));
    const targetCapacity = Math.max(10, shore.targetCapacity || (isNeutral ? 60 : 30));
    const voronoiBonus = (shore.voronoiScore != null) ? Math.min(25, shore.voronoiScore * 0.5) : 0;
    const baselineCapitalIfHeld = B * compoundFactor;

    let bestU = 0.15;
    let maxShoreNPV = -1e9;
    let bestPBreak = 1.0;
    let bestSurvivingForce = 0;

    for (let ui = 0; ui < 8; ui++) {
      const u = U_STEPS[ui];
      const sent = Math.floor(B * u);
      if (sent < 15) continue;

      const baseTax = Math.floor(12 * sent / 1024);
      const waterTax = Math.floor(waterFriction * waterDist * sent);
      const landingForce = Math.max(0, sent - baseTax - waterTax);

      let expectedGainTerr = 0;
      let pBreakthrough = 1.0;
      let survivingForce = landingForce;

      if (isNeutral) {
        expectedGainTerr = Math.min(targetCapacity, Math.floor(landingForce / 2));
        survivingForce = Math.max(0, landingForce - expectedGainTerr * 2);
        pBreakthrough = 1.0;
      } else {
        const effectiveDef = targetBal * shoreDefMult;
        const forceDiff = landingForce - effectiveDef;
        const sigmaNaval = Math.max(10, Math.sqrt(effectiveDef + landingForce));
        pBreakthrough = 1.0 / (1.0 + Math.exp(-forceDiff / sigmaNaval));

        if (pBreakthrough > 0.35) {
          const defLoss = Math.min(targetBal, Math.floor(landingForce / shoreDefMult));
          survivingForce = Math.max(0, landingForce - Math.floor(defLoss * shoreDefMult));
          expectedGainTerr = Math.max(1, Math.min(targetCapacity, Math.floor(survivingForce / 3.0)));
        } else {
          survivingForce = 0;
          expectedGainTerr = 0;
        }
      }

      const bridgeheadValue = pBreakthrough * (
        (expectedGainTerr * 4.5) +
        (Math.sqrt(Math.max(1, expectedGainTerr)) * 25) +
        (survivingForce * 0.75)
      );

      const homeCapitalRemaining = (B - sent) * compoundFactor;
      const npv = (beta * bridgeheadValue + homeCapitalRemaining) - baselineCapitalIfHeld;
      const totalNPV = npv + voronoiBonus;

      if (totalNPV > maxShoreNPV) {
        maxShoreNPV = totalNPV;
        bestU = u;
        bestPBreak = pBreakthrough;
        bestSurvivingForce = survivingForce;
      }
    }

    scoredShores[i] = Object.assign({}, shore, {
      npv: parseFloat(maxShoreNPV.toFixed(2)),
      optimalCommitRatio: bestU,
      transitTicks,
      footholdProb: parseFloat(bestPBreak.toFixed(3)),
      survivingForce: Math.round(bestSurvivingForce),
      troopsToSend: Math.floor(B * bestU)
    });
  }

  // Insertion sort for scoredShores
  for (let i = 1; i < numCandidates; i++) {
    const item = scoredShores[i];
    let j = i - 1;
    while (j >= 0 && scoredShores[j].npv < item.npv) {
      scoredShores[j + 1] = scoredShores[j];
      j--;
    }
    scoredShores[j + 1] = item;
  }

  const bestShore = scoredShores[0] || null;
  const density = (stateCtx.softCap > 0) ? (B / stateCtx.softCap) : 0.5;
  const threshold = (density > 0.85) ? -5.0 : 2.0;
  const viable = !!bestShore && (bestShore.npv > threshold) && (bestShore.footholdProb >= 0.40);

  return {
    viable,
    bestShore,
    commitRatio: bestShore ? bestShore.optimalCommitRatio : 0,
    troopsToSend: bestShore ? bestShore.troopsToSend : 0,
    npv: bestShore ? bestShore.npv : -1e9,
    footholdProb: bestShore ? bestShore.footholdProb : 0,
    transitTicks: bestShore ? bestShore.transitTicks : 0,
    rankedShores: scoredShores
  };
}

module.exports = { computeNavalBellmanFast };
