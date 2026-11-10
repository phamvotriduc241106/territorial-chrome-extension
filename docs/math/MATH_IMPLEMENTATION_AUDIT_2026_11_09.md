# Mathematics versus implementation audit, 2026-11-09

America/New_York. Branch `claude/math-audit-2026-11-09` from `main` at
`0fa3d86` (release 10.3.14, policy V2.8.2). Release after this change:
**10.3.15**, updated 2026-11-09 20:14:25 EST.

This audit asks one question per formula: does the shipped code compute what the
documentation says, for every input that can reach it? Each answer uses an
oracle that does not share code with the function under test. Six
implementation defects were found and fixed. None of them is on the default V2
command path, and the 80 frozen decision/spend fingerprints are unchanged.

Three of the six are slider-ceiling defects. They can reach native commands,
but only in non-default modes: the legacy V1 engine (`engineVersion: 1`) and
the default-off capital-v1 experiment.

- The V1 round-up fix lowers a 0.62 ceiling by one slider code.
- The V1 zero-ceiling and capital-v1 cases are not reachable from today's
  callers (§3).

The other three are solver defects that affect target ranking in the vision
fallback.

## Method

1. **Inventory.** Every formula stated in the [planning model](PLANNING_MODEL.md),
   the [corrections](MATHEMATICAL_CORRECTIONS.md), the
   [test protocol](MATH_TEST_PROTOCOL.md) and the source comments was mapped to
   its code (table below).
2. **Prove or test each mapping.** Integer arithmetic was proved by hand and
   checked exhaustively over the reachable range. Numerical solvers were compared
   with a converged reference using the same discretization, or with an exact
   combinatorial answer such as breadth-first distance or cluster labels.
3. **Reproduce before fixing.** Each defect has a regression in
   [`tests/unit/math-implementation.test.cjs`](../../tests/unit/math-implementation.test.cjs).
   Six of its ten cases failed on the unchanged code; four are controls that
   lock in the identities proved below.
4. **Measure the fix.** Accuracy and cost were re-measured after each change.
   The ad hoc stress scripts and raw logs are in ignored
   `scratch/math-audit-2026-11-09/`.

## Formula-to-code map

`B` is our bank, `M` an opponent's effective bank, `t` the command tax, `u`
slider units (`code+1`, 1–1,024).

| Quantity | Formula | Code | Status and oracle |
| --- | --- | --- | --- |
| Native rounding | `al(a,b) = floor(a/b + 1/(2b))` | `al` | Exact; equals `floor((2a+1)/(2b))` for integer `a`, `b>0` |
| Requested force | `floor(B·u/1024)` | `estimateAttackCost`, `planSpend` | Exact; exhaustive over all codes |
| Human tax and debit | `t = floor(12B/1024)`; `sent = min(req, B−t)`; `debit = sent+t` | `humanAttackDebit` | Exact; native routine (6,144 cases) plus identity §1 |
| Bot debit | same `t`; `sent = req − t` when `req ≥ al(B,2)` | `botAttackDebit` | Exact; native routine (6,144 cases) |
| Crush condition | `al(M,8) > B` | `decide`, `crushTroops` | Exact; equals `M ≥ 8B+8` (§2) |
| Crush force | `al(11E,5) = floor((22E+1)/10)` | `crushRequirement` | Exact in doubles (§2) |
| Reserve floor | `ceil(M/7.6) + max(60, floor(0.05B))` | `computeCrushBarrierFloor` | Safe against the crush rule (§2) |
| Floor-derived ratio | `(B−t−F)/(B(1+12/1024))`, 4 d.p. | same | Conservative; rounding never admits a command (§3) |
| Safe slider code | largest `u` with `B − debit(u) ≥ L`, `u/1024 ≤ cap` | `maxSafeRatio` (V2) | Exact; binary search valid by monotonicity (§3) |
| Same, legacy engine | as above | `maxSafeRatio` (V1) | **Fixed:** ceiling rounded up; zero ceiling spent |
| Capital-v1 ceiling | `u ≤ floor(ratio·1024)` | `TIOCapitalPolicy.constrain` | **Fixed:** used `Math.round` |
| Interest rate | `100 + iroot(g)`, early boost, over-cap cut, cap 700 bps | `planningInterestBps` | Matches native (1,512 cases); `iroot` is not `√` (§4) |
| Income credit | interest at tick `%10=9`, territory at `%100=99`, hard cap, debt | `planningIncome` | Matches native |
| Front allocation | max `Σ wᵢ(1−e^(−yᵢ/sᵢ))` | `allocateKKTMultiFrontDetailed` | Optimal for this objective; DP/exhaustive oracles |
| Bank observer | scalar Kalman in `log B` | `BayesianTroopObserver` | Correct filter algebra; drift is an estimate (§6) |
| Particle beliefs | weighted P05/P95 | `OpponentParticleFilter` | Correct quantiles; dynamics are an estimate (§6) |
| Breach probability | `Φ(z)`, `z = (A−1.28D)/(0.38√(A+D+1))` | `computeBreachProbability` | Accurate to rounding (§5); heuristic model |
| Travel time | Godunov upwind, fast sweeping | `computeEikonal*` | **Fixed:** stopped before convergence |
| Harmonic field | Laplace, SOR | `computePoissonPotentialField` | **Fixed:** stopped before convergence |
| Fiedler vector | power iteration on `μI − L` | `computeSpectralFiedler` | **Fixed:** far from converged |

## 1. Tax identity: the half-unit never matters

For an integer bank `B ≥ 0`, write `12B = 1024q + r` with `0 ≤ r ≤ 1023`. Then

$$\mathrm{al}(12B,1024)=\left\lfloor\frac{24B+1}{2048}\right\rfloor
=\left\lfloor q+\frac{2r+1}{2048}\right\rfloor=q,$$

because `2r+1 ≤ 2047`. The same argument with `3B = 256q′ + r′` gives
`al(3B,256) = floor(3B/256) = q`. So:

- the human and bot taxes are the **same** number, `floor(3B/256)`; and
- the `+0.5` in the documented `floor((12B+0.5)/1024)` never changes the
  result for an integer bank.

In doubles, `12B/1024 + 1/2048` needs at most 25 integer bits and 11 fractional
bits for `B < 2³¹`, so it is computed exactly. The control test checks every
bank from 0 to 300,000. The ad hoc audit checked 3,200,001 banks, including
200,000 random banks up to `2³¹−1`, with zero mismatches.

## 2. Crush rule and reserve floor

For integers, `al(M,8) = floor((2M+1)/16)`, and

$$\mathrm{al}(M,8)>B \iff 2M+1\ge 16B+16 \iff M\ge 8B+8.$$

The old source comment said "`B_bot > 8·B_us`". That is off by up to 8 troops;
the comment now states the exact condition. A bank `B` is therefore safe from
an opponent bank `M` exactly when `B ≥ ceil((M−7)/8)`.

The shipped floor `F = ceil(M/7.6) + σ`, with `σ ≥ 60`, satisfies
`F ≥ M/7.6 > (M−7)/8`, so it always lies outside the crush region. Its margin
is about `0.0066·M + σ`.

Checks:
- the equivalence over 1,604,401 `(B, M)` pairs;
- the safety of `F` for 285,715 opponent banks up to 2,000,000.

Both had zero failures.

`crushRequirement` evaluates `11E/5 + 0.1` in floating point. Since
`(22E+1) mod 10` is odd, the exact value is never within 0.1 of an integer.
Double rounding error is far smaller for every reachable `E`.

## 3. Slider search and the floor-derived ratio

`debit(u) = min(floor(Bu/1024), B−t) + t` is nondecreasing in `u`. So the set of
codes that keep the reserve is a prefix, and the V2 binary search returns its
maximum. Two checks confirmed this against an exhaustive scan of every code:
3,000 cases in the test and 20,000 in the audit, with zero mismatches.

`computeCrushBarrierFloor` also reports
`ρ = (B−t−F) / (B(1+c))`, with `c = 12/1024`, rounded to four decimals. Two
observations:

- **It double-counts the tax.** The tax is already subtracted, so the exact
  continuous bound is `ρ* = (B−t−F)/B`, and `ρ ≈ ρ*/1.0117`.
- **The rounding can go up** by up to `5·10⁻⁵`. That only exceeds `ρ*` when
  `ρ < 5·10⁻⁵/c ≈ 0.0043`, and the slider search never considers codes below
  `10/1024 ≈ 0.0098`.

Of 178,188 random states with a positive ratio, 199 rounded above `ρ*`. All
199 were below `10/1024`, so none can admit a command. The exact reserve search
also enforces `F` independently. This is documented, not changed: it is
frozen-policy code and the behaviour is safe.

**Fixed: two ceilings were rounded up.** The protocol requires that an explicit
upper bound is never rounded upward, and that a zero or nonfinite ceiling
blocks spending. V2 was corrected on 2026-10-21; two siblings were not.

| Defect | Failing input | Before | After |
| --- | --- | ---: | ---: |
| Legacy V1 `maxSafeRatio` used `round(cap·1024)` | `B = 10⁶`, ceiling 0.62 (the V1 crush cap) | 635/1024 = 0.6201 | 634/1024 |
| Legacy V1 clamped a zero ceiling to 0.01 | ceiling 0 | 737/1024 | 0 |
| Capital-v1 `constrain` used `round(ratio·1024)` | ratio 0.0605 | 62 units = 0.0605 + 5·10⁻⁵ | 61 |

The V1 engine is shipped and selectable (`engineVersion: 1`). Its 0.62 crush
cap reached the round-up. The zero case was latent: V1's own `planSpend`
passes `adaptive.maxRatio || 0.72`, so a zero becomes 0.72 before the call.
Capital-v1's
runtime caller only passes exact codes or 0.06, both of which round down, so
the capital defect was latent. Its existing test had asserted the over-ceiling
value (82 units for 0.08) and now asserts 81.

## 4. Native integer root is not `√`

The interest index uses nine integer Newton steps starting from `al(g+1,2)`,
copied from the game:
`r ← al(r + al(g,r), 2)`.

This is **not** `round(√g)`:

- 53,663 of the integers `0 ≤ g ≤ 120,000` differ from it;
- the largest absolute error is 1.77.

| Player slots | Largest `g` | Native root | `√g` |
| ---: | ---: | ---: | ---: |
| 5 | 102,400 | 320 | 320.000 |
| 8 | 44,800 | 211 | 211.660 |
| 64 | 26,880 | 163 | 163.951 |
| 512 | 25,751 | 160 | 160.471 |

The model must reproduce the native routine, and it does: the fresh-source audit
compares it with the extracted original. A model that "fixed" this to `Math.sqrt`
would be wrong by up to 1–2 basis points of interest.

## 5. Breach probability

The code computes `pBreach = ½(1 + erf(z/√2))` using Abramowitz–Stegun 7.1.26
(`|ε| ≤ 1.5·10⁻⁷`), then rounds to four decimals. Against an independent
series/continued-fraction `erf`, the largest difference over 20,000 cases was
`4.996·10⁻⁵`, which is the four-decimal rounding.

The comment said the veto threshold was 0.55. It is actually
`CONFIG.sigmaSDE = 0.5765`, a probability despite its name. The comment also
called this an Ornstein–Uhlenbeck SDE; it is a normal approximation. Both
comments are corrected; the tuned threshold is unchanged.

## 6. Correct algebra, estimated dynamics

These pass their algebraic checks, but their **parameters are estimates**, not
native rules. Treat their outputs as heuristics.

| Component | Algebra checked | Estimated part |
| --- | --- | --- |
| `BayesianTroopObserver` | `K = P/(P+R)`, `P ← (1−K)P`; mean `e^(x+P/2)`; 90% interval `e^(x ± 1.645√P)`; entropy `½ln(2πeP)` of `log B` | Drift `0.0035/tick` (≈3.6% per 10 ticks). Native interest is 1–7% per 10 ticks and depends on territory and tick. |
| `OpponentParticleFilter` | Weighted cumulative quantiles; systematic resampling at `N_eff < N/2` | Interest compounds every tick, not on `%10 = 9`; `√T/4` per-tick base income; no 150·T hard cap |
| `estimateInterestIncome` (vision) | — | `2.5√T` with a capped early boost; not the native rate formula |
| `settlePlanningAttack` | One debit; settlement after an estimated 10 ticks | All-or-nothing capture at `troops > 1.25·bank` ([R6](../architecture/COMPUTER_SCIENCE_REVIEW_2026_10_30.md)) |
| `decide` selected rival | — | An unknown bank becomes 0 and crushable ([R3](../architecture/COMPUTER_SCIENCE_REVIEW_2026_10_30.md)) |

## 7. Numerical solvers in the vision ranking

`rankTargets` uses all three solvers. It runs only in the vision fallback, not
on the mapped native command path. All three solvers stopped after a fixed,
small iteration count, so they returned partial answers.

**Eikonal travel time.** The fixed two rounds of four sweeps can only follow a
few turns of a winding path. Cells further along were left at the "unreachable"
sentinel (reported as 999), and others were too far.

- *Fix:* sweep until no stored value changes. Values only decrease, so this
  terminates within one round per cell.
- *Oracle:* in a one-cell serpentine corridor every update has one finite
  upwind side, so the exact answer is the breadth-first path length.

**Poisson field.** Eight SOR sweeps left visible error. Iterating to
`|Δ| < 10⁻¹²` matches a separately converged Gauss–Seidel solve.

**Spectral (Fiedler) vector.** The shifted power iteration contracts unwanted
components by about `(μ−λ₃)/(μ−λ₂)` per step. With `μ = 2·maxDegree` this is
close to 1, so eight steps were far from converged.

Two changes:

1. **Start from the point cloud's principal axis.** For spatial RBF graphs, the
   Fiedler vector aligns with it: across a cluster split, or along the long
   axis. A `10⁻³` index-parity term keeps every component nonzero.
2. **Iterate to `|Δ| < 10⁻⁶`.** At most 64 iterations, and extra work is capped
   at 32 iterations of a 64-point input. Inputs of 128 or more points keep the
   old 8-iteration cost, so the unbounded-input ticket
   ([R5](../architecture/COMPUTER_SCIENCE_REVIEW_2026_10_30.md)) is not made
   worse.

Neither change alone was enough: a step-size tolerance without the better start
stopped early on nearly disconnected clusters.

Accuracy, against an independent Jacobi eigen-solver (spectral) or a converged
reference (Eikonal, Poisson):

| Solver | Check | Before | After |
| --- | --- | ---: | ---: |
| Eikonal | 16×8 serpentine: reachable cells reported unreachable | 35 | 0 |
| Eikonal | 3,000 random obstacle grids: grids with any wrong cell | 61 | 0 |
| Eikonal | same: reachable cells reported unreachable | 29 | 0 |
| Eikonal | same: largest error on reached cells | 9.25 | 3.6·10⁻⁶ (Float32) |
| Poisson | 500 random layouts: largest potential error | 0.0162 | < 10⁻⁶ |
| Poisson | 5,000 gradient samples: wrong sign of pull | 1 | 0 |
| Spectral | 300 two-cluster layouts, n ≤ 32: wrong partition | 100 | 0 |
| Spectral | 300 two-cluster layouts, n ≤ 64: wrong partition | 149 | 0 |
| Spectral | 300 uniform layouts, n ≤ 64: wrong partition | 279 | 114 |

Uniformly scattered points have `λ₂ ≈ λ₃`. Their sign cut is ill-conditioned
for any iteration budget, so a remaining disagreement there is a property of the
input, not a solver bug. The spectral sign cut is still a relaxation heuristic,
not a certified minimum or balanced cut (see
[corrections §3](MATHEMATICAL_CORRECTIONS.md#3-spectral-relaxation-does-not-certify-a-minimum-border-partition)).

Cost per call, median ms, Apple M4, Node v26.12.1, one paired run (200
warm-ups; 2,000 samples, 200 at n=200):

| Call | Before | After |
| --- | ---: | ---: |
| Spectral, 8 random points | 0.0061 | 0.0329 |
| Spectral, 24 random points | 0.0357 | 0.1206 |
| Spectral, 64 random points | 0.2209 | 0.3596 |
| Spectral, 200 random points | 2.1350 | 2.2841 |
| Eikonal 16×8, 20 obstacles | 0.1980 | 0.2045 |
| Poisson 8×8 | 0.0035 | 0.0437 |

These are single-machine microbenchmarks of the helpers, not browser CPU or
gameplay measurements. The extra cost is bounded and applies once per
vision-fallback ranking.

## What did not change

- **Command path and spend policy.** `planSpend`, the V2 debit and reserve
  checks, native admission and the 80 frozen decision/spend fingerprints are
  unchanged.
- **Separate tickets.** R2/ENG-02, R3/ENG-03, R4, R5 and R6 remain open with
  their own acceptance criteria.
- **Unused code.** `FastMinHeap` and `EIKONAL_DIRS` are unused. They are left in
  place; only the comment that claimed a priority-queue method was corrected.

## Validation

Each command ran separately; raw logs are in ignored `scratch/math-audit-2026-11-09/`.
Node v26.12.1, Apple M4, Playwright Chromium 153.

| Gate | Exit | Result |
| --- | ---: | --- |
| `math-implementation.test.cjs` on unchanged code | 1 | 6 / 10 fail; the 4 identity controls pass |
| same, after fixes | 0 | 10 / 10 |
| `npm test` | 0 | 182 / 182 Node cases (172 + 10); 80 frozen fingerprints unchanged; frozen capital-pilot replay passes |
| `npm run test:math-docs` (inside `npm test`) | 0 | Includes the new §6 worked examples |
| `node --test tests/unit/planning-math.test.cjs` | 0 | 17 / 17 |
| `test:math-native` | 0 | 1,512 income + 6,144 human + 6,144 bot cases against the fresh native routines |
| `test:live` | 0 | `live-modern-v7` bootstrap; exact attack debit (512 → 404, debit 108); 262,144 cells, 292 combat + 54 income cases, 16 restorations |
| `test:spatial` | 0 | Source `2c70f903…`; 252 native support cases, 9 full audits, 5 ownership functions restored |
| `test:browser` | 0 | Bridge 9, main-hook 29, capital-native 22 |
| `test:ui-state` / `test:ui` / `test:a11y` | 0 / 0 / 0 | 6; 170 checks + 13 visuals; 131 checks, 0 serious/critical |
| `npm run package` (first run) | **1** | `stale timestamp: docs/CHANGELOG.md`: the changelog entry was written after this run (ordering) |
| `npm run package` (rerun) / `git diff --check` | 0 / 0 | 41 runtime files |

No match was played. The fixes touch the legacy V1 ceiling, the default-off
capital-v1 ceiling and vision-fallback ranking helpers; none of them is on the
default mapped native command path. No strength claim is made.
