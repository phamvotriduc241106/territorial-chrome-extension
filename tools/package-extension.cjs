'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { root, releaseFiles } = require('./release-files.cjs');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const files = releaseFiles();
const dist = path.join(root, 'dist');
fs.mkdirSync(dist, { recursive: true });
// Fresh directory each run: never overwrite/delete an existing artifact.
const output = fs.mkdtempSync(path.join(dist, 'territorial-v' + manifest.version + '-'));
const hashes = {};
for (const file of files) {
  const destination = path.join(output, file);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.join(root, file), destination, fs.constants.COPYFILE_EXCL);
  hashes[file] = crypto.createHash('sha256').update(fs.readFileSync(destination)).digest('hex');
}
fs.writeFileSync(output + '.sha256.json', JSON.stringify({ version: manifest.version, files: hashes }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ version: manifest.version, files: files.length, directory: output, hashes: output + '.sha256.json' }, null, 2));
