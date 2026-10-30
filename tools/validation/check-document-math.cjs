'use strict';
// Independent worked-example checks for docs/MATHEMATICAL_CORRECTIONS.md.
// No network or game mutation; these are mathematical counterexamples, not play.
const assert = require('node:assert/strict');
const { kernel } = require('../benchmarks/cpu-benchmark.cjs');
const ceilDiv = (a,b) => (a+b-1n)/b;
const oldReserve = ceilDiv(750n*2n,15n)+25n;
const nextReserve = ceilDiv(3105n*2n,4n*15n)+25n;
assert.equal(oldReserve,125n);
assert.equal(nextReserve,129n);
assert.equal(oldReserve-nextReserve,-4n);
assert.ok(125n*32n>3105n, 'Reserve-set exit does not establish a crossed 8:1 threshold');

// Exact rational identity: r=7/200, c=3/256, kappa=1/2, u=224/326475.
assert.equal(7n*256n*326475n-200n*13059n*224n,0n);
for (const B of [1,125,1000]) for (const r of [0,.035,.1])
  for (const c of [0,3/256]) for (const kappa of [0,.01,.5]) for (const alpha of [.85,1]) {
    const u=r/(1+c+alpha*100*kappa);
    const dB=r*B-(1+c)*u*B, dT=kappa*u*B;
    assert.ok(Math.abs(dB-alpha*100*dT)<1e-12*Math.max(1,B), 'Boundary tangency');
  }
const wrongU=.035*125/(125*(1+3/256)+100/.5);
assert.ok(Math.abs(.035-(1+3/256+100*.5)*wrongU)>.6, 'Retain the old derivation counterexample');

const edges=[[0,1],[0,2],[0,3],[0,4]];
const L=Array.from({length:5},()=>Array(5).fill(0));
for (const [a,b] of edges) { L[a][a]++; L[b][b]++; L[a][b]--; L[b][a]--; }
const multiply=v=>L.map(row=>row.reduce((sum,x,i)=>sum+x*v[i],0));
const eigenbasis=[[1,1,1,1,1],[0,1,-1,0,0],[0,1,0,-1,0],[0,1,0,0,-1],[4,-1,-1,-1,-1]];
const eigenvalues=[0,1,1,1,5];
function determinant(a) {
  if (a.length===1) return a[0][0];
  return a[0].reduce((sum,x,j)=>sum+(-1)**j*x*determinant(a.slice(1).map(row=>row.filter((_,i)=>i!==j))),0);
}
assert.notEqual(determinant(eigenbasis),0, 'A complete eigenbasis certifies the spectrum');
for (let i=0;i<eigenbasis.length;i++)
  assert.deepEqual(multiply(eigenbasis[i]),eigenbasis[i].map(x=>x*eigenvalues[i]));
const v=[0,1,1,-1,-1];
assert.deepEqual(multiply(v),v);
const signMask=v.reduce((mask,x,i)=>x>=0?mask|(1<<i):mask,0);
const cut=mask=>edges.reduce((sum,[a,b])=>sum+Number(Boolean(mask&(1<<a))!==Boolean(mask&(1<<b))),0);
const masks=Array.from({length:30},(_,i)=>i+1);
assert.equal(cut(signMask),2);
assert.equal(Math.min(...masks.map(cut)),1, 'Unconstrained minimum cut differs');
assert.equal(Math.min(...masks.filter(mask=>[2,3].includes(mask.toString(2).replace(/0/g,'').length)).map(cut)),2,
  'Do not confuse balanced and unconstrained cut objectives');

const B=10240, requested=Math.floor(B*128/1024);
const tax=Math.floor((12*B+.5)/1024), wrongTax=Math.floor(12*requested/1024);
assert.equal(requested,1280); assert.equal(tax,120); assert.equal(wrongTax,15);
assert.equal(requested+tax,1400);
assert.equal(kernel().TIOEngineCore.humanAttackDebit(B,requested).debit,1400);
assert.equal(102+102,204); assert.notEqual(102+102,203);
assert.equal(102+102+65+39,308); assert.notEqual(102+102+65+39,307);
console.log(JSON.stringify({status:'passed',scope:'document worked examples; no current-source or gameplay claim',
  reserve:{before:Number(oldReserve),after:Number(nextReserve),hNext:-4},
  boundaryControl:'224/326475; exact residual 0',
  spectral:{eigenvalues,signCut:cut(signMask),minimumCut:1,balancedMinimumCut:2},
  humanCommand:{bank:B,requested,tax,wrongProportionalTax:wrongTax,debit:1400},
  withdrawnTable:{connectedSum:204,claimedConnected:203,totalSum:308,claimedTotal:307}},null,2));
