'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

// Explicit runtime closure. Do not package research, tests, reports or secrets.
function releaseFiles(base = root) {
  const manifest = JSON.parse(fs.readFileSync(path.join(base, 'manifest.json'), 'utf8'));
  const files = new Set(['manifest.json', 'shared/config.js']);
  for (const script of manifest.content_scripts || []) {
    for (const file of [...(script.js || []), ...(script.css || [])]) files.add(file);
  }
  files.add(manifest.background.service_worker);
  files.add(manifest.action.default_popup);
  for (const file of Object.values(manifest.icons || {})) files.add(file);
  for (const file of Object.values(manifest.action.default_icon || {})) files.add(file);
  // Popup references these files; worker imports shared/config.js above.
  for (const file of ['popup/popup.js', 'popup/popup.css', 'shared/presentation.js', 'shared/ui.css']) files.add(file);
  for (const file of files) {
    if (path.isAbsolute(file) || file.includes('..') || !/^(manifest\.json|(?:content|shared|background|popup|icons)\/)/.test(file))
      throw Error('Unsafe/non-runtime release path: ' + file);
    const absolute = path.join(base, file);
    if (!fs.lstatSync(absolute).isFile() || !fs.realpathSync(absolute).startsWith(fs.realpathSync(base) + path.sep))
      throw Error('Missing, symlinked or external runtime file: ' + file);
  }
  return [...files].sort();
}
module.exports = { root, releaseFiles };
