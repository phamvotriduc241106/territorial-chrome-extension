/** Experimental single-player controller. Default OFF; no actuator or search. */
(function(root){
  'use strict';
  const MODE='capital-v1';
  const PARAMETERS=Object.freeze({baseReserve:0.50,perContact:0.05,
    minimumAdvantage:1.5,maxAgeMs:700,maxTickLag:12});
  const integer=n=>Number.isSafeInteger(n)&&n>=0;
  function inspect(st,ageMs){
    if(!st||!['live-modern-v3','live-modern-v4'].includes(st.contract)||st.singlePlayer!==true||st.ready!==true||
        st.alive!==true||!integer(st.balance)||st.balance>2147483647||st.balanceKnown!==true||
        !integer(st.territory)||st.territory<1||!integer(st.gameTick)||
        !integer(st.stateVersion)||typeof st.matchId!=='string'||!st.matchId||
        !Number.isFinite(ageMs)||ageMs<0||ageMs>PARAMETERS.maxAgeMs)
      return {ok:false,reason:'unsupported-or-stale-state'};
    if(!Array.isArray(st.physicalNeighbors)||!Array.isArray(st.enemies))
      return {ok:false,reason:'missing-physical-coverage'};
    const ids=st.physicalNeighbors.filter(id=>id!==st.player&&id!==st.neutralId),seen=new Set();
    if(new Set(ids).size!==ids.length||ids.length!==st.enemies.length)
      return {ok:false,reason:'incomplete-physical-coverage'};
    let largest=0,incoming=0;
    for(const e of st.enemies){
      if(!e||!integer(e.id)||e.id>511||seen.has(e.id)||!ids.includes(e.id)||e.adjacent!==true||
          typeof e.available!=='boolean'||e.shipOnly!==false||e.incomingKnown!==true||e.balanceKnown!==true||
          !integer(e.bal)||!integer(e.incoming)||!integer(e.effectiveBal)||
          e.effectiveBal!==e.bal+e.incoming||!integer(e.terr)||e.terr<1)
        return {ok:false,reason:'unsupported-opponent'};
      seen.add(e.id);largest=Math.max(largest,e.effectiveBal);incoming+=e.incoming;
    }
    return {ok:true,contacts:ids.length,largest,incoming,
      reserve:ids.length?Math.ceil(largest*Math.min(1,PARAMETERS.baseReserve+
        PARAMETERS.perContact*(ids.length-1))):0};
  }
  function selectDecision(core,st,s,decision){
    if(decision.action!=='hold'||decision.reason!=='hard-build-combat-bank'||s.hasAdjFree||
        s.shrinkFrames!==0||s.areaTrend<0||st.enemies.some(e=>e.incoming>0))return decision;
    const target=st.enemies.filter(e=>e.available&&st.balance>=Math.ceil(PARAMETERS.minimumAdvantage*e.effectiveBal))
      .sort((a,b)=>a.effectiveBal-b.effectiveBal||a.id-b.id)[0];
    if(!target)return decision;
    return {...decision,action:'fight',wantEnemy:true,preferNeutral:false,focusEnemyId:target.id,
      enemyBal:target.effectiveBal,crushable:core.al(st.balance,8)>target.effectiveBal,
      phaseLabel:'PRESSURE',reason:'capital-v1-early-opportunity'};
  }
  function constrain(core,st,decision,plan,ratio,ageSeconds){
    const risk=inspect(st,0);
    const blocked=reason=>({ok:false,reason,ratio:0,requiredReserve:plan?.minRemaining??0,
      ledger:{before:st.balance,requested:0,sent:0,tax:0,debit:0,after:st.balance}});
    if(!risk.ok)return blocked(risk.reason);
    if(!plan||plan.balance!==st.balance||!integer(plan.minRemaining)||!integer(plan.maxSpendTotal)||
        !Number.isFinite(ageSeconds)||ageSeconds<0)return blocked('invalid-budget-context');
    if(!plan.canAfford||decision.action==='hold')return blocked('baseline-spend-block');
    if(!integer(plan.minAttack)||plan.minAttack<1||!Number.isFinite(ratio)||ratio<0.01||ratio>0.72||
        plan.maxSpendTotal>st.balance-plan.minRemaining)return blocked('invalid-budget');
    const reserve=Math.max(plan.minRemaining,risk.reserve);
    const B=st.balance,ceiling=Math.round(ratio*1024);
    const cost=units=>{const requested=Math.floor(B*units/1024),c=core.humanAttackDebit(B,requested);
      return {before:B,requested,...c,after:B-c.debit};};
    let lo=10,hi=ceiling,best=0;
    while(lo<=hi){const mid=Math.floor((lo+hi)/2),c=cost(mid);
      if(c.after>=reserve&&c.debit<=plan.maxSpendTotal){best=mid;lo=mid+1;}else hi=mid-1;}
    if(!best||cost(best).sent<plan.minAttack)return {...blocked('capital-v1-reserve-hold'),requiredReserve:reserve};
    return {ok:true,reason:best<ceiling?'capital-v1-contact-cap':'capital-v1-retained',
      ratio:best/1024,sliderUnits:best,requiredReserve:reserve,ledger:cost(best)};
  }
  root.TIOCapitalPolicy=Object.freeze({MODE,PARAMETERS,inspect,selectDecision,constrain});
})(typeof globalThis!=='undefined'?globalThis:this);
