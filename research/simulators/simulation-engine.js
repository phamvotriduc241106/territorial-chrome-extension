/**
 * Discrete-event Territorial.io Match Simulation Engine
 * Faithfully models:
 *   - Compound interest cycles (r = 3.5%, capped by min(100*T, 1B))
 *   - Transaction tax: tau(B) = floor(12*B / 1024)
 *   - Neutral land yield: 1 territory pixel per 2 troops
 *   - Lanchester combat attrition with defender advantage
 *   - Crush routing: B_att / 8 > B_def
 */
'use strict';

class TerritorialMatchSimulation {
  constructor(options = {}) {
    this.totalNeutralLand = options.totalNeutralLand || 5000;
    this.remainingNeutralLand = this.totalNeutralLand;
    this.interestRate = options.interestRate || 0.035;
    this.interestInterval = options.interestInterval || 10;
    this.actionCooldown = options.actionCooldown !== undefined ? options.actionCooldown : 2;
    this.maxTicks = options.maxTicks || 300;
    this.players = [];
    this.tick = 0;
    this.logHistory = options.logHistory || false;
    this.history = [];
  }

  addPlayer(id, name, engineCore, initialBalance = 1000, initialTerritory = 10, customProps = {}) {
    const defaultX = customProps.x != null ? customProps.x : Math.round(500 + 350 * Math.cos((this.players.length * 2 * Math.PI) / 4));
    const defaultY = customProps.y != null ? customProps.y : Math.round(500 + 350 * Math.sin((this.players.length * 2 * Math.PI) / 4));
    this.players.push({
      id,
      name,
      engine: engineCore,
      balance: initialBalance,
      territory: initialTerritory,
      alive: true,
      x: defaultX,
      y: defaultY,
      cooldown: 0,
      activeFronts: 0,
      attackSequence: 0,
      attacksExecuted: 0,
      chokepointBreaches: 0,
      totalTroopsSpent: 0,
      totalTroopsGeneratedInterest: 0,
      totalOvercapLost: 0,
      customProps
    });
  }

  step() {
    this.tick++;
    const totalMapLand = this.totalNeutralLand + this.players.reduce((sum, p) => sum + (p.alive ? p.territory : 0), 0);
    const freeLandRatio = Math.max(0, this.remainingNeutralLand / Math.max(1, totalMapLand));

    // 1. Income & Interest Cycle
    if (this.tick % this.interestInterval === 0) {
      for (const p of this.players) {
        if (!p.alive) continue;
        const softCap = Math.min(100 * p.territory, 1000000000);
        
        // Authentic Territorial.io income: territory base income + liquid interest
        const baseIncome = Math.max(2, Math.floor(Math.sqrt(Math.max(1, p.territory)) * 2.5));
        let interestEarned = 0;
        if (p.balance < softCap) {
          interestEarned = Math.floor(p.balance * this.interestRate);
        } else {
          // Overcap: balance above softCap earns zero interest
          const overcap = p.balance - softCap;
          p.totalOvercapLost += Math.floor(overcap * this.interestRate);
        }

        const totalCycleIncome = baseIncome + interestEarned;
        p.balance += totalCycleIncome;
        p.totalTroopsGeneratedInterest += totalCycleIncome;
      }
    }

    // 2. Player Decisions & Action Phase (alternate turn order to eliminate first-mover bias)
    const turnOrder = (this.tick % 2 === 0) ? [...this.players] : [...this.players].reverse();
    for (let i = 0; i < turnOrder.length; i++) {
      const p = turnOrder[i];
      if (!p.alive) continue;

      if (p.cooldown > 0) {
        p.cooldown--;
        continue;
      }

      const softCap = Math.min(100 * p.territory, 1000000000);
      const density = p.balance / Math.max(1, softCap);

      // Build opponent adjacency context with spatial topology & contact lengths
      const adjEnemies = this.players
        .filter(other => other.id !== p.id && other.alive)
        .map(other => {
          const dx = (other.x || 0) - (p.x || 0);
          const dy = (other.y || 0) - (p.y || 0);
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const contactWithMe = Math.max(10, Math.floor(Math.min(p.territory, other.territory) * (600 / Math.max(200, dist))));
          
          let externalBorder = 0;
          for (const spectator of this.players) {
            if (spectator.id !== p.id && spectator.id !== other.id && spectator.alive) {
              const sDx = (other.x || 0) - (spectator.x || 0);
              const sDy = (other.y || 0) - (spectator.y || 0);
              const sDist = Math.sqrt(sDx * sDx + sDy * sDy) || 1;
              externalBorder += Math.max(5, Math.floor(Math.min(other.territory, spectator.territory) * (600 / Math.max(200, sDist))));
            }
          }
          const totalPerimeter = contactWithMe + externalBorder;
          const isolationRatio = contactWithMe / Math.max(1, totalPerimeter);

          return {
            id: other.id,
            bal: other.balance,
            terr: other.territory,
            x: other.x,
            y: other.y,
            contactWithMe,
            externalBorder,
            isolationRatio,
            crushable: p.balance > 0 && Math.floor(p.balance / 8) > other.balance,
            power: (other.balance + 100 * other.territory) / Math.max(1, p.balance + 100 * p.territory)
          };
        });

      const leaderTerr = Math.max(...this.players.filter(o => o.alive).map(o => o.territory));
      const myRank = 1 + this.players.filter(o => o.alive && o.territory > p.territory).length;

      // Construct state context S
      const stateCtx = {
        balance: p.balance,
        territory: p.territory,
        softCap,
        density,
        freeLandRatio,
        hasAdjFree: this.remainingNeutralLand > 0,
        adjEnemies,
        globalRank: myRank,
        leaderTerritory: leaderTerr,
        activeFronts: p.activeFronts,
        attackSequence: p.attackSequence,
        strategy: 'aggressive'
      };

      let decision;
      try {
        decision = p.engine.decide(stateCtx);
      } catch (e) {
        decision = { action: 'hold', wantEnemy: false, preferNeutral: false };
      }

      if (decision.action === 'hold' || p.balance < 30) {
        continue;
      }

      const planCtx = {
        balance: p.balance,
        balanceKnown: true,
        territory: p.territory,
        softCap,
        freeLandRatio,
        wantEnemy: decision.wantEnemy,
        crushable: decision.crushable,
        enemyBal: decision.enemyBal || 0,
        activeFronts: p.activeFronts,
        attackSequence: p.attackSequence,
        fronts: 1
      };

      let plan;
      try {
        plan = p.engine.planSpend(planCtx);
      } catch (e) {
        plan = { canAfford: false, ratio: 0 };
      }

      if (!plan.canAfford || plan.ratio <= 0) continue;

      const commitRatio = plan.ratio;
      const requestedTroops = Math.floor(p.balance * commitRatio);
      const debitInfo = p.engine.humanAttackDebit ? p.engine.humanAttackDebit(p.balance, requestedTroops) : { tax: Math.floor(12*p.balance/1024), sent: requestedTroops, debit: requestedTroops };
      
      const sentTroops = debitInfo.sent;
      const totalDebit = debitInfo.debit;

      if (p.balance < totalDebit || sentTroops <= 0) continue;

      // Deduct troops
      p.balance -= totalDebit;
      p.totalTroopsSpent += totalDebit;
      p.attackSequence++;
      p.attacksExecuted++;
      p.cooldown = this.actionCooldown;

      // Execute Action
      if (decision.action === 'expand' || (!decision.wantEnemy && this.remainingNeutralLand > 0)) {
        // Expand into neutral territory: yield is 1 pixel per 2 sent troops
        const desiredTerritory = Math.floor(sentTroops / 2);
        const actualClaim = Math.min(this.remainingNeutralLand, desiredTerritory);
        p.territory += actualClaim;
        this.remainingNeutralLand -= actualClaim;
      } else if (decision.action === 'fight' && decision.focusEnemyId != null) {
        const target = this.players.find(other => other.id === decision.focusEnemyId && other.alive);
        if (target) {
          // Combat Resolution
          const isCrush = decision.crushable || (p.balance > 0 && Math.floor((p.balance + totalDebit) / 8) > target.balance);

          let breachedChokepoint = false;
          if (typeof p.engine.rankTargets === 'function') {
            const midX = ((p.x || 0) + (target.x || 100)) / 2;
            const midY = ((p.y || 0) + (target.y || 100)) / 2;
            // Generate border candidate sectors:
            // Isthmus / chokepoint connecting two outer lobes
            const candidates = [
              { id: 0, x: midX - 60, y: midY - 20, type: 'ENEMY' },
              { id: 1, x: midX - 40, y: midY - 15, type: 'ENEMY' },
              { id: 2, x: midX,      y: midY,      type: 'ENEMY', isChokepoint: true },
              { id: 3, x: midX + 40, y: midY + 15, type: 'ENEMY' },
              { id: 4, x: midX + 60, y: midY + 20, type: 'ENEMY' }
            ];
            const ranked = p.engine.rankTargets(candidates, stateCtx, decision, 3);
            if (ranked && ranked.length > 0 && ranked[0].isChokepoint) {
              breachedChokepoint = true;
              p.chokepointBreaches = (p.chokepointBreaches || 0) + 1;
            }
          }

          if (isCrush) {
            // Crush: defender suffers massive breach
            const defLoss = Math.min(target.balance, Math.floor(sentTroops * 0.9));
            target.balance -= defLoss;
            const capturedTerr = Math.min(target.territory, Math.floor(sentTroops / 1.5));
            target.territory -= capturedTerr;
            p.territory += capturedTerr;
          } else {
            // Attrition Exchange (defender advantage 1.4x standard)
            // If the attacker spectrally bisected the frontline at the chokepoint,
            // defender defense advantage drops to 1.05x and territory capture gains +35%
            const defAdv = breachedChokepoint ? 1.05 : 1.4;
            const defenderDamage = Math.floor(sentTroops / defAdv);
            const actualLoss = Math.min(target.balance, defenderDamage);
            target.balance -= actualLoss;

            // Territorial Penetration:
            const penetrationThreshold = breachedChokepoint ? 0.7 : 0.9;
            if (sentTroops >= 15 && target.territory > 10) {
              const penetrationPower = Math.max(0, sentTroops - actualLoss * penetrationThreshold);
              if (penetrationPower > 0) {
                const capRate = breachedChokepoint ? 2.0 : 3.5;
                const gained = Math.max(1, Math.min(
                  Math.floor(target.territory * (breachedChokepoint ? 0.20 : 0.10)),
                  Math.floor(penetrationPower / capRate)
                ));
                target.territory -= gained;
                p.territory += gained;
              }
            }
          }

          if (target.territory <= 0 || target.balance <= 0) {
            target.alive = false;
            p.territory += target.territory > 0 ? target.territory : 0;
            target.territory = 0;
          }
        }
      }
    }

    if (this.logHistory && this.tick % 5 === 0) {
      this.history.push({
        tick: this.tick,
        neutral: this.remainingNeutralLand,
        players: this.players.map(p => ({
          id: p.id,
          name: p.name,
          balance: p.balance,
          territory: p.territory,
          alive: p.alive
        }))
      });
    }

    // Check terminal condition
    const alivePlayers = this.players.filter(p => p.alive);
    if ((this.players.length > 1 && alivePlayers.length <= 1) || this.tick >= this.maxTicks) {
      return true; // Match finished
    }
    return false;
  }

  run() {
    while (!this.step()) {}
    // Rank players by territory (primary) then balance
    const ranked = [...this.players].sort((a, b) => {
      if (a.alive !== b.alive) return b.alive ? 1 : -1;
      if (b.territory !== a.territory) return b.territory - a.territory;
      return b.balance - a.balance;
    });

    const isDraw = ranked.length > 1 &&
      ranked[0].alive === ranked[1].alive &&
      ranked[0].territory === ranked[1].territory &&
      ranked[0].balance === ranked[1].balance;

    const winner = isDraw ? { id: 0, name: 'Draw', territory: ranked[0].territory, balance: ranked[0].balance } : ranked[0];

    return {
      winner: winner,
      isDraw: isDraw,
      rankings: ranked,
      totalTicks: this.tick,
      remainingNeutral: this.remainingNeutralLand,
      history: this.history
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TerritorialMatchSimulation };
}
