/**
 * Setup Disjoint Experimental Seed Datasets
 * =========================================
 * Generates:
 *   - Training Set:   1,000 seeds (experiments/seeds-training.json)
 *   - Validation Set:   300 seeds (experiments/seeds-validation.json)
 *   - Final Test Set:   500 seeds (experiments/seeds-final-test.json)
 *
 * Programmatically asserts zero overlap between all three partitions.
 */
'use strict';

const fs = require('fs');
const path = require('path');

function generateSplitSeeds() {
  const trainSet = new Set();
  const valSet = new Set();
  const testSet = new Set();

  let seedCandidate = 100003;

  // LCG to generate deterministic, high-entropy pseudo-random seeds
  function nextSeed() {
    seedCandidate = (seedCandidate * 1664525 + 1013904223) >>> 0;
    return seedCandidate;
  }

  // 1. Training Set: 1,000 seeds
  while (trainSet.size < 1000) {
    const s = nextSeed();
    if (!trainSet.has(s)) trainSet.add(s);
  }

  // 2. Validation Set: 300 seeds
  while (valSet.size < 300) {
    const s = nextSeed();
    if (!trainSet.has(s) && !valSet.has(s)) valSet.add(s);
  }

  // 3. Final Test Set: 500 seeds
  while (testSet.size < 500) {
    const s = nextSeed();
    if (!trainSet.has(s) && !valSet.has(s) && !testSet.has(s)) testSet.add(s);
  }

  // Programmatic Disjoint Assertion
  for (const s of valSet) {
    if (trainSet.has(s)) throw new Error(`Overlap detected between Train and Val: ${s}`);
  }
  for (const s of testSet) {
    if (trainSet.has(s)) throw new Error(`Overlap detected between Train and Test: ${s}`);
    if (valSet.has(s)) throw new Error(`Overlap detected between Val and Test: ${s}`);
  }

  const trainArr = Array.from(trainSet);
  const valArr = Array.from(valSet);
  const testArr = Array.from(testSet);

  fs.writeFileSync(path.join(__dirname, 'seeds-training.json'), JSON.stringify(trainArr, null, 2));
  fs.writeFileSync(path.join(__dirname, 'seeds-validation.json'), JSON.stringify(valArr, null, 2));
  fs.writeFileSync(path.join(__dirname, 'seeds-final-test.json'), JSON.stringify(testArr, null, 2));

  console.log('================================================================================');
  console.log(' DATASET SPLITS INITIALIZED & PROGRAMMATICALLY VERIFIED DISJOINT');
  console.log('================================================================================');
  console.log(`Training Set:    ${trainArr.length} seeds (saved to experiments/seeds-training.json)`);
  console.log(`Validation Set:  ${valArr.length} seeds (saved to experiments/seeds-validation.json)`);
  console.log(`Final Test Set:  ${testArr.length} seeds (saved to experiments/seeds-final-test.json)`);
  console.log('Zero seed overlap confirmed across all partitions.');
  console.log('================================================================================\n');
}

generateSplitSeeds();
