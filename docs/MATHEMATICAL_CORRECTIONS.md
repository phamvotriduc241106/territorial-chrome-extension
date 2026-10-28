# Mathematical corrections and evidence boundaries

Reviewed **2026-10-28, America/New_York** against repository commit
`082eff4250ee910819d01994ec535eebcf395a56`, release 10.3.11 / policy V2.8.2.
This corrects the historical manuscript; it does not change the controller or
establish a new gameplay result. Subjective review scores are not measurements
and are not adopted as project results.

## Verification before editing

The original offline suite passed: **155 Node cases** plus existing assertion
suites. The 17 focused planning-math cases also passed, including existing
exhaustive/DP allocation oracles. Exact rational arithmetic reproduced the
barrier counterexample and checked the boundary-control residual; an independent
SymPy simplification returned zero for the corrected symbolic residual. The
graph example below was checked directly by matrix-vector multiplication and
exhaustive enumeration of nonempty cuts.

The fresh native arithmetic audit **failed closed** on October 28:
`Unverified economy routine: 13440-6*bc.ql()`. A separate fresh public-source
inspection returned `contract=unknown`, SHA-256
`4d1c844982518d113cb18d4ded518f13438b3e53a43c83a97300b22930b54067`
(679,224 decoded characters). The adapter classifies it as `minified-live`;
patch placement alone does not authorize native commands. October 22 native
passes remain dated evidence, not current-source compatibility. Repairing this
new interface is a separate runtime task; no source guard is weakened here.

## 1. A reserve inequality is not a forward-invariance proof

The historical reserve was

$$R(M)=\left\lceil\frac{M}{7.5}\right\rceil+25,\qquad h(B,M)=B-R(M).$$

Preserving `B_after_own_debit >= R(M_now)` does not imply
`h(B_next,M_next) >= 0`. The latter evaluates the moving threshold at the next
state and must also include income, incoming attacks and changing contacts.

| Quantity | Initial state | Next state in counterexample |
| --- | ---: | ---: |
| Opponent maximum `M` | 750 | 776.25 |
| Our bank `B` | 125 | 125 |
| Reserve `R(M)` | 125 | 129 |
| Barrier `h(B,M)` | 0 | -4 |

This abstract transition leaves our bank unchanged and gives the opponent 3.5%
growth. It is a counterexample to the manuscript's deduction from its stated
spend constraint, not a claim that a recorded native tick followed these values.
The 3.5% rate is illustrative, not a verified universal native growth bound.
Moreover, `776.25/8 = 97.03125 < 125`: leaving this reserve set does **not** show
that an immediate crush threshold was crossed, much less instantaneous defeat.

A sufficient discrete condition for a specified transition model would be

$$h(f(x,\pi(x),w))\ge(1-\gamma)h(x),\quad
  \forall x\in\mathcal C,\ \forall w\in W(x),\quad 0<\gamma\le1.$$

If the initial state is in `C={x:h(x)>=0}`, the chosen action is admissible, the
condition is feasible at every subsequent safe state, and actual disturbances
belong to `W(x)`, induction proves invariance for that model. None of these
assumptions follows just from an own-command reserve check. The ceiling-defined
`h` is also discontinuous, so a differentiable continuous-time CBF theorem
cannot be applied to it without further justification. For context, see
[Ames et al., Control Barrier Functions: Theory and Applications](https://arxiv.org/abs/1903.11199).

The shipped helper is a **reserve heuristic**, not the historical formula:
`computeCrushBarrierFloor` uses the maximum retained effective enemy bank `M`
and, when `M>0`, `ceil(M/7.6)+max(60,floor(0.05*B))`. Native admission separately
rechecks reserve, tax/debit, target, match and front constraints. These checks
do not certify immunity to coordinated attacks or future losses.

## 2. Correct boundary tangency; no native PMP optimality claim

For the manuscript's simplified continuous model only, let

$$\dot B=rB-(1+c)uB,\qquad \dot T=\kappa uB,\qquad c=12/1024.$$

Here `u` is a commitment **rate per chosen time unit**, not a native slider
fraction per command. Assume `B>0`, compatible units, constant coefficients,
and `1+c+100*kappa>0`. On the boundary `B=100T`, tangency requires

$$0=\dot B-100\dot T=B[r-(1+c+100\kappa)u],$$

so

$$\boxed{u=\frac{r}{1+c+100\kappa}}.$$

It is feasible only when this value lies in the permitted control interval.
For `r=7/200`, `c=3/256`, `kappa=1/2`, the exact value is `224/326475`; the
tangency residual is zero. The old expression
`r*B/[B*(1+c)+100/kappa]` generally has a nonzero residual. A boundary at
`B=alpha*100T`, for fixed `alpha`, instead requires
`u=r/(1+c+alpha*100*kappa)` under the same simplified dynamics.

Tangency is not a proof of optimality, a singular arc, reachability, or stability.
State-constraint multipliers and complete adjoint/terminal conditions would be
needed for a PMP result. The shipped `solvePontryaginOptimalControl` is a
clamped, rule-based controller with legacy naming; it does not solve that
Hamiltonian boundary-value problem. No 22–36% optimal spending range follows
from the corrected expression.

There is a further model mismatch: the verified ordinary human command model
charges `floor((12*B+0.5)/1024)` **per command based on the bank**, not
`floor(12*u*B/1024)` based on the committed amount. At bank 10,240 and slider
units 128/1024, requested force is 1,280; the respective taxes are 120 and 15.
The exact human debit is 1,400, subject to native admission. Thus the corrected
continuous equation is still only a hypothetical proportional-cost model;
native quantization, cadence, income phases and discrete fees require a separate
derivation. The [math protocol](MATH_TEST_PROTOCOL.md) specifies the tested debit
model; current-source support is subject to the October 28 failure above.

## 3. Spectral relaxation does not certify a minimum-border partition

For a connected undirected graph with symmetric nonnegative weights and
combinatorial Laplacian `L=D-A`, Rayleigh–Ritz gives

$$\lambda_2=\min_{x\perp\mathbf1,\ x\ne0}\frac{x^TLx}{x^Tx}.$$

This optimizes over real vectors. A minimum balanced cut also constrains
discrete membership and partition sizes; sign rounding need not solve that
problem. A threshold sweep can give approximation guarantees for specified
objectives under their assumptions. It does not certify an arbitrary sign cut
as an exact minimum cut. See the explicit relaxation in
[Cornell's graph-partitioning notes](https://www.cs.cornell.edu/courses/cs5220/2020fa/lec/2020-11-10-part.html)
and the distinction between cut ratio and conductance in
[Spielman's spectral graph theory chapter, section 16.8](https://www.cs.yale.edu/homes/spielman/PAPERS/SGTChapter.pdf).

An exact counterexample to an **unconstrained minimum-cut** guarantee is the
five-vertex star, center 0, edges `(0,1),(0,2),(0,3),(0,4)`. Its eigenvalues are
`0,1,1,1,5`; `v=(0,1,1,-1,-1)` is a valid Fiedler vector. The manuscript's
`v_i>=0` rule produces `{0,1,2}` versus `{3,4}`, cutting 2 edges. Isolating a
leaf cuts 1 edge. This does not compare different objectives as if they were
the same: under a 2/3 balance requirement, the leaf cut is infeasible and the
star's balanced optimum is 2. The point is that the constraint/objective must
be specified and optimality proved; the relaxation alone proves neither claim.

## 4. What the integer allocator actually establishes

For feasible integer floors `l_i`, caps `u_i`, budget `K`, `w_i>=0`, `s_i>0`, let
`y_i=a_i-l_i` and maximize the particular separable objective

$$\sum_i w_i(1-e^{-y_i/s_i}),\quad
  0\le y_i\le u_i-l_i,\quad \sum_i y_i\le K-\sum_i l_i.$$

The gain of increment `k` on front `i` is

$$\Delta_i(k)=w_i(1-e^{-1/s_i})e^{-k/s_i},\qquad k=0,1,\ldots.$$

Each sequence is nonincreasing. Selecting the largest feasible gains with
earlier increments preceding later ones is globally optimal for this integer
objective: any allocation omitting a larger available gain in favor of a smaller
selected gain admits an improving exchange. Prefix-consistent tie handling
retains feasibility. This is a discrete allocation argument; equality of
continuous KKT derivatives followed by flooring is insufficient.

The implementation normalizes inputs (including positive weight/scale floors),
bisects log marginal gains, then corrects integer endpoints/ties. Existing
exhaustive and DP oracles test numerical behavior; they are not a proof for every
floating-point input. Infeasible minimums return an explicitly labelled priority
fallback, not an optimum of an infeasible program. This utility is not a proved
combat or victory objective. `planSpend` may compute allocation metadata; the
native single-command actuator does not execute that allocation vector.

## 5. Implementation and performance claim register

| Component | Source entry point | Supported description |
| --- | --- | --- |
| Integer allocation | `allocateKKTMultiFrontDetailed` | Tested separable integer-utility helper; not a native multi-front command optimizer |
| MPC-style lookahead | `evaluateMPCAction`, `transitionPlanningState` | Conditional finite action scoring; aggregate combat/timing estimates; no native optimal-control guarantee |
| Belief observation | `BayesianTroopObserver` | Scalar log-space Kalman-style bank observation; median and expectation distinguished; not EKF |
| Endgame sampling | `computeMCTSEndgameAction` | Conditional UCB action bandit; no search tree and no calibrated win probability |
| Experimental tree | `runMultiStepMCTS` | `enableTreeSearch=false`; not called by `decide` |
| Eikonal/Poisson/spectral | `rankTargets` and numerical helpers | Conditional perimeter/vision ranking helpers; not demonstrated as part of the normal mapped native command path |
| Reserve control | `computeCrushBarrierFloor`, native admission | Checked command accounting plus heuristic risk floors; no invariant-controller theorem |
| PMP-labelled spending | `solvePontryaginOptimalControl` | Rule-based ratios; no solved Hamiltonian or proved singular control |

These are source/call-path classifications, not depth/originality ratings or
measured algorithm ablations. A true configuration flag alone is not evidence
that a helper ran in an observed match.

| Historical claim | Evidence status | Permitted interpretation |
| --- | --- | --- |
| 81.20% connected-land wins; 307/500 total wins | Withdrawn; the archived audit reports no executed 500-match evaluation supporting them | Do not present as verified performance in a paper, application or resume |
| Approximately 1 µs decision latency | Not established for the current shipped end-to-end controller | Use only a reproducible benchmark with exact scope, runtime, hardware and distribution |
| Four October 22 Impossible/512 comparisons | Four observed losses, two maps; separate random placements; observer tails not exported | Negative development evidence, not a causal estimate or validated win rate |
| Dynamic-frontier held-out transition errors | Controlled research-only model study, with coverage/censoring limits | Conditional prediction evidence; no demonstrated improvement in official victories |

The withdrawn table is also internally inconsistent: its Europe/Voronoi rows
sum to 204 wins, not the 203 claimed for connected land; all four map rows sum
to 308, not 307. Recomputing a percentage or p-value cannot supply missing match
data. Percentage-point changes must also be distinguished from relative percent
changes. The original pre-correction text remains in Git history. The unchanged
historical PDF is also superseded by these corrections.

## Reproduce and proceed

Run `npm run test:math-docs` for the counterexample, tangency, spectral and tax
checks; `npm test` includes it. Run
`node --test tests/planning-math.test.cjs` for existing allocation/economics
oracles. `npm run test:math-native` independently fetches the current public
bundle and must retain its failure when signatures change.

Future research needs a new assigned official-outcome comparison after source
support is repaired, model-error validation across regimes, and isolated
algorithm ablations. Paired claims require verified identical initial
conditions; an inactive procedural seed on a geographic map does not provide
that. Use the [live MCP runbook](AGENT_EXPERIMENT_HANDOFF.md) and
[existing negative comparison report](MCP_IMPOSSIBLE_LOOP_2026_10_22.md).
