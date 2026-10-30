'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { root } = require('../lib/repository.cjs');
const { releaseFiles } = require('../release/release-files.cjs');
const { moves } = require('../lib/layout-map.json');

function sourceFiles(directory) {
  const result=[];
  for (const entry of fs.readdirSync(path.join(root,directory),{withFileTypes:true})) {
    if (entry.name.startsWith('.') || entry.name==='node_modules') continue;
    const file=path.posix.join(directory,entry.name);
    if (entry.isDirectory()) result.push(...sourceFiles(file));
    else result.push(file);
  }
  return result;
}
function slug(text) {
  return text.toLowerCase().replace(/`/g,'').replace(/[^\p{L}\p{N}_\- ]/gu,'').replace(/ /g,'-');
}
function check() {
  const runtime=new Set(releaseFiles());
  for (const file of sourceFiles('content').filter(f=>/\.(?:js|css)$/.test(f)))
    assert.ok(runtime.has(file),'Unpackaged research code in runtime directory: '+file);
  const destinations=new Set();
  for (const [old,destination] of Object.entries(moves)) {
    assert.ok(!path.isAbsolute(destination)&&!destination.split('/').includes('..'),'Unsafe move: '+destination);
    assert.ok(!destinations.has(destination),'Duplicate destination: '+destination);destinations.add(destination);
    assert.ok(fs.existsSync(path.join(root,destination)),'Missing moved file: '+old+' -> '+destination);
  }
  const files=['README.md','CONTRIBUTING.md',...sourceFiles('docs'),...sourceFiles('tests'),...sourceFiles('research'),...sourceFiles('tools')];
  let markdownLinks=0,htmlImports=0;
  const headings=new Map();
  for (const file of files.filter(f=>/\.(?:md|html)$/.test(f))) {
    const text=fs.readFileSync(path.join(root,file),'utf8');
    const targets=file.endsWith('.md')?[...text.matchAll(/\]\(([^)]+)\)/g)].map(m=>m[1]):
      [...text.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map(m=>m[1]);
    for (const target of targets) {
      if (/^(?:[a-z]+:|\/\/)/i.test(target)||target.includes('${')) continue;
      const [name,anchor]=target.split('#');
      const resolved=path.resolve(root,path.dirname(file),name||'.');
      const actual=name?resolved:path.join(root,file);
      const relative=path.relative(root,actual).split(path.sep).join('/');
      if (/^(?:scratch|dist)\//.test(relative)) continue; // Generated outputs, not source imports.
      assert.ok(fs.existsSync(actual),'Broken local link/import: '+file+' -> '+target);
      if (anchor&&actual.endsWith('.md')) {
        if (!headings.has(actual)) headings.set(actual,new Set([...fs.readFileSync(actual,'utf8').matchAll(/^#{1,6} +(.+)$/gm)].map(m=>slug(m[1]))));
        assert.ok(headings.get(actual).has(anchor),'Broken heading: '+file+' -> '+target);
      }
      if (file.endsWith('.md')) markdownLinks++;else htmlImports++;
    }
  }
  return {movedFiles:destinations.size,runtimeFiles:runtime.size,markdownLinks,htmlImports};
}
if (require.main===module) console.log(JSON.stringify(check(),null,2));
module.exports={check};
