'use strict';
const { kernel } = require('../tools/cpu-benchmark.cjs');
const { evaluateOpeningBudget } = require('./contact-risk-candidate.cjs');
const core=kernel().TIOEngineCore;
// Illustrative fixtures, not complete native observations or causal replay.
const sourceHash='0'.repeat(64);
const cases=[
  { name:'no-contact',B:10000,enemies:[],ratio:0.72,reserve:1000 },
  { name:'busy-neighbor-contact-cap',B:10000,enemies:[12000,15000],ratio:0.72,reserve:1000 },
  { name:'Europe-peak-inspired-fixture',B:2903,enemies:[3742,4416,4915,5442,5814,5908],ratio:0.08,reserve:923 },
];
const results=cases.map(c=>{
  const snapshot={matchId:c.name,stateVersion:1,sourceHash,ageMs:0,coverage:'complete-adjacent',
    situation:{balance:c.B,balanceKnown:true,gameTimeSec:20,hasAdjFree:true,
      adjEnemies:c.enemies.map((bal,id)=>({id,bal,effectiveBal:bal,incoming:0,adjacent:true,available:id!==1}))}};
  const baseline={matchId:c.name,stateVersion:1,sourceHash,
    decision:{action:'expand',reason:'fixture-neutral'},
    plan:{balance:c.B,canAfford:true,minRemaining:c.reserve,maxSpendTotal:c.B-c.reserve,minAttack:4,ratio:c.ratio}};
  const candidate=evaluateOpeningBudget(core,snapshot,baseline,{matchId:c.name,sourceHash,minStateVersion:1});
  return {name:c.name,baselineRatio:c.ratio,candidate};
});
console.log(JSON.stringify({evidenceKind:'synthetic-accounting-fixtures-not-live-strength',
  productionPolicyChanged:false,results},null,2));
