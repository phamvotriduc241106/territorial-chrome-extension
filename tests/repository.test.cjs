'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { root, releaseFiles } = require('../tools/release-files.cjs');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const sandbox = {};
vm.runInNewContext(read('shared/config.js'), sandbox);
const cfg = sandbox.TIOConfig;
assert.equal(pkg.version, manifest.version);
assert.equal(lock.version, pkg.version);
assert.equal(lock.packages[''].version, pkg.version);
assert.equal(lock.packages[''].devDependencies.playwright, pkg.devDependencies.playwright);
assert.equal(cfg.VERSION, manifest.version);
assert.match(cfg.ENGINE_UPDATED_AT, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [A-Z]{2,5}$/);
const files = releaseFiles();
const engine = 'content/engine-core-v2-advanced.js';
assert.ok(cfg.ENGINE_SOURCE.startsWith(engine));
assert.equal(manifest.content_scripts.filter(s => s.js.includes(engine)).length, 2);
assert.equal(manifest.content_scripts.filter(s => s.world === 'MAIN').length, 1);
for (const script of manifest.content_scripts) {
  assert.equal(script.js[0], 'shared/config.js');
  assert.equal(script.js[1], 'shared/performance.js');
  assert.ok(script.js.indexOf(engine) < script.js.indexOf('content/engine-adapter.js'));
}
for (const file of files) assert.ok(!file.startsWith('experiments/'));
for (const group of manifest.web_accessible_resources || []) {
  for (const file of group.resources) {
    assert.ok(files.includes(file), 'unpackaged web-accessible resource: ' + file);
    assert.match(file, /^shared\/fonts\/[a-z0-9-]+\.woff2$/, 'only the public theme fonts should be web-accessible');
  }
}
for (const file of ['manifest.json', 'popup/popup.html', 'README.md',
  'content/engine-adapter.js', engine, 'docs/CHANGELOG.md']) {
  assert.ok(read(file).includes(cfg.ENGINE_UPDATED_AT), 'stale timestamp: ' + file);
}
for (const file of ['ARCHITECTURE.md', 'VALIDATION.md', 'SOURCE_MAP.md']) assert.ok(fs.existsSync(path.join(root, 'docs', file)));
// Verify the local HTML/script import closure, not only manifest entries.
for (const file of files) {
  const text = read(file);
  const references = file.endsWith('.html')
    ? [...text.matchAll(/(?:src|href)="([^"#]+)"/g)].map(m => m[1])
    : file.endsWith('.js') ? [...text.matchAll(/importScripts\(['"]([^'"]+)['"]\)/g)].map(m => m[1])
    : file.endsWith('.css') ? [...text.matchAll(/url\(\s*['"]?([^'"()\s]+)['"]?\s*\)/g)].map(m => m[1]) : [];
  for (const reference of references.filter(r => !/^(?:https?:|data:)/.test(r))) {
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), reference));
    assert.ok(files.includes(target), 'unpackaged import: ' + file + ' -> ' + target);
  }
}
console.log('Repository contracts: PASS (' + files.length + ' release files; metadata, load order, runtime isolation, import closure)');

// Keep portable literal imports in research scripts valid after reorganizations.
function inspect(directory) {
  for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
    const file = directory + '/' + entry.name;
    if (entry.isDirectory()) inspect(file);
    else if (/\.(?:cjs|js)$/.test(file)) {
      const text = read(file);
      new vm.Script(text, { filename: file });
      for (const match of text.matchAll(/require\(['"](\.[^'"]+)['"]\)/g)) {
        assert.ok(fs.existsSync(path.resolve(root, path.dirname(file), match[1])), 'broken require: ' + file + ' -> ' + match[1]);
      }
    }
  }
}
inspect('tests');
inspect('experiments');
console.log('Research/test syntax and literal import paths: PASS');
