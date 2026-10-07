# Planning mathematics and boundaries

Release 10.3.1, engine V2.8.1. Updated 2026-10-06 23:11:16 EDT.

Production planning still uses the V2.8 aggregate model described below. A separate opt-in shadow call to the **same** transition API can use source-cost incremental combat with compact initial border geometry. This path is not invoked by production policy. Geometry evolution, reinforcement, attack scheduling, refunds and opponent behavior remain estimates; see [FRONTIER_MODEL.md](FRONTIER_MODEL.md).

MPC and the UCB endgame action bandit share planning-state normalization, command application, income stepping, aggregate settlement and utility evaluation. `transitionPlanningState(state, action, ticks)` returns an independent next state. The older `forwardSimulatorStep(..., steps)` API uses ten source ticks per step, applies one action once and returns `nextState`. A zero/negative horizon applies the command without advancing time.

| Layer | Model | Boundary |
| --- | --- | --- |
| Command | Quantized 1,024-position slider; separate native human/bot debits | Native actuator revalidates live state |
| Income | Integer interest curve; interest at tick `%10=9`, territory at `%100=99`; configured multipliers, debt and caps | Exact source parameters only for modern-v3; older-source defaults are estimates |
| Global context | Global troop/territory totals, leader identity, alive count; outside mass retained | Outside rivals' future growth/attacks are not simulated |
| Active fronts | Incoming/outgoing forces persist; no repeated debit or duplicate target command | Default settlement delay 10 ticks is estimated |
| Combat | Aggregate attrition, neutral cost 2 troops/cell, defense estimate 1.25 | No pixel/frontier evolution or native return-force model |
| Search | UCB action sampling; utility, visits and coverage exposed | No calibrated win probability; `winProb` is a deprecated utility alias |

Coalition containment uses supplied global territory and verifies leader identity. A 150-cell border rival among 10,250 globally occupied cells owns 1.46%, not 60%. Unknown partial-lobby totals suppress global containment; legacy callers without any global metadata retain a local heuristic fallback.

Both KKT entrypoints share feasible-endpoint bisection and integer correction. Concave utility is on extra troops above minimum floors. `allocateKKTMultiFrontDetailed` explicitly reports infeasible minimums and uses a bounded priority fallback, not a KKT optimum. Native one-command attacks do not consume these allocations.

Particle P05/P95 use weighted cumulative mass. The log-space observer exposes `estimatedMedian` and `expectedBalance`; existing `estimatedBalance` remains the median to avoid silently changing the fog-policy statistic. This is scalar Kalman filtering, not EKF. Adaptive control is rule-based, not a solved PMP boundary-value problem; coalition containment is not Shapley computation. Legacy names remain for API compatibility.

Experimental tree search now carries complete aggregate state, rolls out without repeating the expansion action and counts expansion depth. `CONFIG.enableTreeSearch=false`; `decide` never calls it even if researchers enable the helper. Geometry, timing and opponent behavior require validation before deployment.

Lookahead is skipped when its output cannot change the current policy, including exact neutral priority and non-leading endgame states. The model still runs for search-active leader states. Apple M4 / Node v26.8.2, one local microbenchmark with profiling enabled in the updated engine:

| Decision + spend fixture | 10.2.5 mean / P95 | V2.8 mean / P95 |
| --- | ---: | ---: |
| 80 follower states, 1,200 calls | 0.203327 / 0.570750 ms | 0.028851 / 0.039042 ms |
| Search-active 3-player leader, 300 calls | 0.093276 / 0.098500 ms | 0.566048 / 0.618333 ms |

Each group has 200 warmups. These are microbenchmarks, not total Chrome CPU or battery measurements. Richer active search costs more; routine skipped speculation costs less. The bandit checks a 0.5 ms budget between complete rollouts, not a hard interruptible deadline. The 80 frozen fixtures have 48 changed decision outputs (including diagnostics) and zero changed spending outputs; equivalence to 10.2.5 is not claimed. Repeat `npm run benchmark:cpu` rather than treating one run as statistically conclusive.

See VALIDATION.md: 400 paired approximate games tied at 177 wins each. Real-game strength remains unmeasured; use the separate prospective Very Hard campaign standard.
