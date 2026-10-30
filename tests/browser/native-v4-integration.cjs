'use strict';
// Local downloaded-source fixture only. Save/restore every modified native value.
// This is integration/math evidence, never an official gameplay outcome.
async function verify(page) {
  return page.evaluate(async () => {
    const g = window.__TIO_GAME__, api = window.__TIO_HOOK_API__, core = window.TIOEngineCore;
    const raster = g.modern.ownership(4194304);
    if (!raster || raster.counts.some((n,p) => n !== g.modern.territory(p))) throw Error('Ownership mismatch');
    let combatCases = 0, incomeCases = 0;
    for (const land of [1,10,100,10000]) for (const cells of [1,Math.min(land,3),land])
      for (const bank of [0,land*10,land*150]) for (const counter of [0,100])
        for (const troops of [0,cells*g.aE.a0x,cells*g.aE.a0x+1,10000]) {
          const x={territory:land,cells,bank,counter,troops};
          const actual=g.testCombatBatch(x),expected=window.TIOFrontier.resolveNativeBatch(troops,bank,land,cells,counter,g.aE.a0x);
          if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error('Combat mismatch '+JSON.stringify({x,actual,expected}));
          combatCases++;
        }
    for(const troops of [0,2,3,10000]){
      const x={territory:10,cells:3,bank:0,counter:0,troops,neutral:true};
      if(JSON.stringify(g.testCombatBatch(x))!==JSON.stringify(window.TIOFrontier.resolveNativeBatch(troops,0,10,3,0,g.aE.a0x,true)))throw Error('Neutral mismatch');
      combatCases++;
    }
    const me=g.modern.me(),tick=g.bi.yR.sU,banks=g.ah.ax.slice(),lands=g.ah.aO.slice(),debts=g.ah.xa.slice();
    try{
      for(const territory of [100,Math.floor(g.aE.aP*.03),Math.floor(g.aE.aP*.4)])
        for(const at of [8,9,99,1919,1929,2999]) for(const bank of [territory*10,territory*100,territory*150-10]){
          g.bi.yR.sU=at;g.ah.ax[me]=bank;g.ah.aO[me]=territory;g.ah.xa[me]=0;
          const economy=g.modern.economy(me);
          if(core.planningInterestBps(territory,bank,at,economy)!==economy.interestRateBps)throw Error('Interest rate mismatch');
          const predicted=core.transitionPlanningState({tick:at,balance:bank,territory,economy,adjEnemies:[],playersRemaining:1},{type:'hold'},1);
          g.af.b8();if(predicted.balance!==g.ah.ax[me])throw Error('Income mismatch');incomeCases++;
          g.ah.ax.set(banks);g.ah.aO.set(lands);g.ah.xa.set(debts);
        }
    }finally{g.bi.yR.sU=tick;g.ah.ax.set(banks);g.ah.aO.set(lands);g.ah.xa.set(debts);}
    const paths=[[g.ae,'iu'],[g.ae,'q4'],[g.ae,'clear'],[g.bD.bY,'aTe'],[g.bD.bY,'zw'],[g.af,'a5f'],[g.bi,'b8'],
      ...['a19','aT5','aU1','aTJ','aVI'].map(k=>[g.ad,k]),[g.af,'b8'],[g.bD.bY,'aED'],[g.bD.bY,'py'],[g.ap.aGr,'aHD']];
    const originals=paths.map(([o,k])=>o[k]);
    if(api.frontier.report().status.enabled)throw Error('Diagnostics default on');
    const start=api.frontier.start({spatial:true,maxBytes:33554432});
    const deadline=performance.now()+7000;
    while(performance.now()<deadline&&!api.frontier.report().telemetry?.records.some(e=>e.event==='prediction_scored'&&e.predictions.frontier))
      await new Promise(resolve=>setTimeout(resolve,50));
    const report=api.frontier.stop();
    if(!start.ok||report.status.error||!report.status.nativeEvents?.ok||!report.status.spatial?.reconciled||report.telemetry?.dropped||g.shadow.active()||!paths.every(([o,k],i)=>o[k]===originals[i]))throw Error('Shadow integration/restoration failed '+JSON.stringify(report.status));
    for(const event of ['geometry_snapshot','prediction','prediction_scored','spatial_baseline'])
      if(!report.telemetry.records.some(e=>e.event===event))throw Error('Missing '+event);
    return {cells:raster.owners.length,reconciledPlayers:raster.counts.length,combatCases,incomeCases,restoredNativeFunctions:paths.length,scored:report.telemetry.scored};
  });
}
module.exports={verify};
