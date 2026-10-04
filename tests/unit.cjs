'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
global.window = global;
global.print = console.log;
for (const p of ['shared/config.js', 'content/engine-core-v1.js',
  'content/engine-core-v2-advanced.js', 'content/engine-adapter.js',
  'content/source-adapter.js', 'tests/core.test.js']) {
  vm.runInThisContext(read(p), { filename: p });
}
const assert = require('node:assert/strict');
const manifest = JSON.parse(read('manifest.json'));
assert.equal(manifest.version, TIOConfig.VERSION);
assert.equal(TIOEngineCore.version, TIOConfig.VERSION);
for (const p of ['manifest.json', 'popup/popup.html', 'README.md',
  'content/engine-adapter.js', 'content/engine-core-v2-advanced.js']) {
  assert.ok(read(p).includes(TIOConfig.ENGINE_UPDATED_AT), 'update timestamp missing: ' + p);
}
console.log('Release metadata: PASS (7 assertions)');
if (process.env.TIO_LEGACY_SOURCE) {
  global.SOURCE_TEXT = fs.readFileSync(process.env.TIO_LEGACY_SOURCE, 'utf8');
  vm.runInThisContext(read('tests/source-adapter.test.js'), { filename: 'tests/source-adapter.test.js' });
}
for (const directory of ['content', 'shared', 'background', 'popup']) {
  for (const name of fs.readdirSync(path.join(root, directory)).filter(p => p.endsWith('.js'))) {
    new vm.Script(read(directory + '/' + name), { filename: name });
  }
}
console.log('JavaScript syntax: PASS');
