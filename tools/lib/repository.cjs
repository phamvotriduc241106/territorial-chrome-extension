'use strict';
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const moves = require('./layout-map.json').moves;
// Resolve names in historical freeze manifests without editing archived bytes.
const relocated = file => moves[file] || file;
module.exports = { root, relocated };
