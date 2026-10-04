/**
 * Independent Audit Test Runner
 * Evaluates tests/core.test.js against shipped scripts and engine candidates.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

function runTestWithEngine(engineFile, name) {
  console.log(`\n--- Running tests/core.test.js with [${name}] (${engineFile}) ---`);
  const sandbox = {
    console,
    Math,
    Date,
    Number,
    isFinite,
    isNaN,
    parseInt,
    parseFloat,
    Array,
    Object,
    String,
    RegExp,
    Error,
    TypeError,
    Uint8Array,
    Uint16Array,
    Uint32Array,
    Int8Array,
    Int16Array,
    Int32Array,
    Float32Array,
    Float64Array,
    print: console.log
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  sandbox.global = sandbox;
  vm.createContext(sandbox);

  try {
    vm.runInContext(read('shared/config.js'), sandbox, { filename: 'shared/config.js' });
    vm.runInContext(read('content/engine-core-v1.js'), sandbox, { filename: 'content/engine-core-v1.js' });
    vm.runInContext(read(engineFile), sandbox, { filename: engineFile });
    vm.runInContext(read('content/engine-adapter.js'), sandbox, { filename: 'content/engine-adapter.js' });
    vm.runInContext(read('content/source-adapter.js'), sandbox, { filename: 'content/source-adapter.js' });
    vm.runInContext(read('tests/core.test.js'), sandbox, { filename: 'tests/core.test.js' });
    console.log(`[PASS] tests/core.test.js succeeded with ${name}`);
    return { success: true };
  } catch (err) {
    console.error(`[FAIL] tests/core.test.js failed with ${name}:`, err.message);
    return { success: false, error: err.message };
  }
}

// 1. Shipped in manifest.json
const resShipped = runTestWithEngine('experiments/engine-core-v2-advanced.js', 'SHIPPED IN MANIFEST (engine-core-v2-advanced.js)');

// 2. Unshipped content/engine-core.js
const resEngineCore = runTestWithEngine('content/engine-core.js', 'UNSHIPPED (content/engine-core.js)');

// 3. experiments/engine-core-v2-6-candidate.js
const resV26 = runTestWithEngine('experiments/engine-core-v2-6-candidate.js', 'CANDIDATE (engine-core-v2-6-candidate.js)');
