/**
 * Diagnostic Experiment: Terminal-Tick Barrier Deflation
 * Tests whether hyperbolic barrier deflation as t -> 250
 * recovers the 13 TIMING_ERROR timeout losses from Phase 7.
 */
'use strict';

const path = require('path');
const { VeryHardBot, RigorousMatchSimulation, loadEngine } = require('../experiments/rigorous-simulator.cjs');

const baseEngine = loadEngine(path.join(__dirname, '../content/engine-core.js'));

// The 13 seeds mined as TIMING_ERROR in Phase 7
const timeoutSeeds = [
  701411, 701577, 703071, 704067, 705893, 706225, 706723,
  707055, 708964, 709047, 710043, 710873, 711620
];

// Create variant with hyperbolic terminal deflation
function createTerminalDeflatingEngine() {
  const engine = Object.create(baseEngine);

  engine.planSpend = function (ctx) {
    const orig = baseEngine.planSpend.call(this, ctx);
    const tick = ctx.gameTick || 0;
    const maxTicks = 250;
    const tau = Math.max(0, maxTicks - tick);

    // If within final 30 ticks and holding substantial balance
    if (tick >= 220 && ctx.balance > 200 && orig.canAfford) {
      // Hyperbolic barrier relaxation factor: tanh(tau / 12)
      const relaxation = Math.tanh(tau / 12);
      // As tau -> 0, increase commit ratio to convert balance into land
      const boost = (1.0 - relaxation) * 0.35;
      orig.ratio = Math.min(0.65, orig.ratio + boost);
      // Deflate minRemaining
      orig.minRemaining = Math.max(20, Math.floor(orig.minRemaining * (0.3 + 0.7 * relaxation)));
      orig.reason = 'terminal-hyperbolic-deflation';
    }

    return orig;
  };

  return engine;
}

const deflatingEngine = createTerminalDeflatingEngine();

console.log('======================================================================');
console.log(' TESTING TERMINAL BARRIER DEFLATION ON TIMEOUT LOSS SEEDS');
console.log('======================================================================\n');

let baseWins = 0;
let deflatedWins = 0;

for (let i = 0; i < timeoutSeeds.length; i++) {
  const seed = timeoutSeeds[i];

  // 1. Run Baseline Engine
  const simBase = new RigorousMatchSimulation({
    mapType: 'europe',
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

  // 2. Run Deflating Engine
  const simDeflated = new RigorousMatchSimulation({
    mapType: 'europe',
    width: 80,
    height: 40,
    seed,
    maxTicks: 250,
    defenderAdvantage: 1.30
  });
  simDeflated.addPlayer(1, 'Deflated', deflatingEngine, { isV2: true });
  simDeflated.addPlayer(2, 'VH-2', new VeryHardBot(2, 'VH-2', seed + 62));
  simDeflated.addPlayer(3, 'VH-3', new VeryHardBot(3, 'VH-3', seed + 93));
  simDeflated.addPlayer(4, 'VH-4', new VeryHardBot(4, 'VH-4', seed + 124));

  const resDeflated = simDeflated.run();
  const deflatedWon = resDeflated.winner.id === 1;
  if (deflatedWon) deflatedWins++;

  const pBase = simBase.players.find(p => p.id === 1);
  const pDef = simDeflated.players.find(p => p.id === 1);

  console.log(`Seed ${seed}:`);
  console.log(`  Base:     ${baseWon ? 'WON' : 'LOST'} | Terr: ${pBase.territory} | Bal: ${pBase.balance}`);
  console.log(`  Deflated: ${deflatedWon ? 'WON' : 'LOST'} | Terr: ${pDef.territory} | Bal: ${pDef.balance}`);
}

console.log('\n----------------------------------------------------------------------');
console.log(`Baseline Win Rate on Timeout Seeds: ${baseWins} / ${timeoutSeeds.length} (${((baseWins/timeoutSeeds.length)*100).toFixed(1)}%)`);
console.log(`Deflated Win Rate on Timeout Seeds: ${deflatedWins} / ${timeoutSeeds.length} (${((deflatedWins/timeoutSeeds.length)*100).toFixed(1)}%)`);
console.log(`Net Conversion Gain: +${deflatedWins - baseWins} wins recovered!`);
console.log('======================================================================\n');
