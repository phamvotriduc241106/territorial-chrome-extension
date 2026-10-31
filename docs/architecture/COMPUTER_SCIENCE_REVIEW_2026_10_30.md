# Production engine: computer science review

Reviewed 2026-10-30 against `main` commit
`5cb3bf93a5c98ebccd546c05113bb15920fcdf3c`, release **10.3.11**, kernel **V2.8.2**.
The runtime release SHA-256 is
`0a3dfb07d29e39ff394345162d7858d8d33943dc4332fb0f789de0b1dc9b8cb6`.
Source links below are pinned to that commit. This review changes no engine behavior.

## Assessment and order of work

The production system is a rules policy with conditional single-action MPC and
a seeded UCB action bandit. It is not using the exported multi-step tree search
in normal play. Its useful engineering foundations are exact integer command
pricing, live reserve/target checks, bounded RPC queues and single-flight
dispatch. Its principal weaknesses are incomplete risk observations, inconsistent
handling of unknown values and coordinate units, an unbounded quadratic fallback,
and an aggregate prediction model with unvalidated strategic assumptions.

| Order | Priority | Finding and quantified evidence | Improvement |
| --- | --- | --- | --- |
| R1 | P0 | All 3 fresh native gates reject the current public source | Restore verified bindings and source-dependent acceptance |
| R2 | P1 | A 33-neighbor fixture exports 32; largest threat falls from 1,000,000 to 100 | Separate complete risk aggregates from bounded target shortlists |
| R3 | P1 | An unknown enemy with a 1,000-troop observer estimate is reported as 0 and crushable | Normalize known/estimated balances once and retain uncertainty |
| R4 | P1 | Vision grid coordinates reach fields using a 1,000-unit domain; equivalent travel-time probes return 6 versus 2 | Define and validate coordinate units at the ranking boundary |
| R5 | P1 | Ranking 1,024 candidates takes 57.981 ms median in the Node probe; quadratic buffers approach 20 MiB | Bound the input to dense geometry algorithms before ranking |
| R6 | P2 | The aggregate model awards 100,000 enemy cells after 10 ticks in a roughly 498-troop attack fixture | Bound capture by contact/cost/timing and validate action rankings |
| R7 | P2 | One 512-player synthetic snapshot reads the modern-adapter getter 4,860 times | Cache the capability facade and reduce repeated extraction work |
| R8 | P2 | A nominal 0.5 ms search takes 0.806 ms median with 32 modeled enemies; the last sample covers only 2 of 17 actions | Make search coverage, work budgets and replay scheduling explicit |
| R9 | P2 | Normal commands omit match/tick provenance; the experimental route already checks it | Extend epoch/freshness checks to normal command proposals |
| R10 | P2 | Bootstrap performs synchronous page XHR and document replacement | Measure startup stalls and redesign bootstrap with parser-order tests |
| R11 | P3 | Three principal files contain 7,728 lines; V1 and V2 load in both worlds | Extract state/model/command interfaces and a smaller production kernel |

P0 blocks native acceptance. P1 findings have direct source/fixture evidence of
incorrect state interpretation or unbounded work. P2 items need additional
runtime/model validation. These priorities are engineering judgments; no
win-rate or implementation-time gain is estimated.

## What actually runs

| Path | Active computation | Important boundary |
| --- | --- | --- |
| Native fast path | Snapshot extraction, `decide`, adaptive spend/reserve calculation, optional MPC/bandit, native revalidation | Does not call `rankTargets` or run vision geometry |
| Vision fallback | Image/grid/region/frontier processing, `decide`, `rankTargets`, spectral/Poisson/Eikonal scoring, paced actuation | R4 and R5 affect this path |
| Research/exported helpers | Multi-step tree search, particle-filter class and additional numerical helpers | Export or a configuration name does not establish production use |

The [manifest][manifest] loads V1 and V2 into MAIN and ISOLATED worlds. The
[native pipeline][pipeline] uses exact adjacency and global totals and issues
one command at a time. Its command ceiling is **4/s**, state-refresh interval
**200 ms**, and unchanged-snapshot backstop **100 ms**; fresh observations and
control events wake planning immediately. The MAIN hook also samples state for
DOM telemetry every **350 ms**. These are configured intervals, not measured
end-to-end latency guarantees.

`planSpend` computes KKT allocation metadata, but normal native requests use
one front. The allocator already has a one-front fast path; its multi-front
80-iteration bisection is not the ordinary native bottleneck.

Extension-side complexity, excluding the native accessors' internal work:

| Operation | Work bound | Current scale |
| --- | --- | --- |
| Global snapshot and neighbor ordering | `O(P + E log E)` | Up to 512 players; E physical rivals sorted before truncation |
| Rule decision without speculation | `O(n)` | At most 32 exported rivals |
| One-front spending | `O(n + log 1024)` | Rival risk scan and exact slider bisection; one-front allocation fast path |
| Passive MPC candidates | `O(3H(n + F*n))` | 3 candidates, H=80 ticks; F unsettled fronts |
| Action bandit | Conservative `O(R*H*n²)` with `F=O(n)` | R≤45, H=60; repeated rival/front scans and state cloning |
| Dense spectral scoring | Expected `O(N²)` time; `O(N²)` memory | N is uncapped input size; 8 fixed power iterations |

Here P is global player count, E the physical neighborhood, n the exported
planning neighborhood, and N vision candidates. The 64-entry scratch pool does
not bound N. Image classification/copying is linear in grid cells, but the
complete fallback also includes hull, concavity and dense candidate work.
The spectral estimate assumes ordinary linear-time quickselect behavior;
the implementation does not provide a worst-case linear selection guarantee.

## Confirmed state and geometry defects

### R1: recover a verified native interface

The current [contract detector][detector] recognizes source families through
version-specific signatures. The fresh public source is unknown, so numerical
and browser acceptance cannot establish current native compatibility. Keep
that rejection intact while recovering bindings from the actual bundle.

Separate source-family discovery, capability/type validation and arithmetic
oracles. Record fetched-page and native-script hashes with the verified
capability manifest.
Acceptance requires all three source-dependent gates on that exact bundle,
then an MCP run of the installed extension that confirms spawn, state updates,
acknowledged commands and complete recorder output. Source signatures alone
do not verify combat behavior or strategic strength.

### R2: target truncation also truncates risk

[Snapshot extraction][snapshot] sorts enemies by availability and increasing
effective balance, then truncates the array to 32. Both isolated planning and
[final native context construction][live-context] use that array for risk.
Consequently a freshly reread snapshot can repeat the same omission.

The synthetic fixture has 33 physical enemies: 32 banks of 100 and one bank of
1,000,000 on 10,000 cells, against our bank of 10,000 on 100 cells. These balances
respect the modeled land-based caps. The strongest enemy is discarded.

| Measure | Complete physical neighborhood | Exported 32-target list |
| --- | ---: | ---: |
| Maximum threat | 1,000,000 | 100 |
| Policy crush-reserve floor | 132,079 | 514 |
| Neutral spend approved by `planSpend` | 0 commands | 1 command at ratio 0.1884765625 |

This demonstrates an understatement of the policy's own intended reserve. It
does not turn that reserve heuristic into a proof of survival.
Independent rational arithmetic reproduces both reported reserve floors.

Compute maximum effective bank, total incoming force and completeness flags
over **every physical neighbor**, including busy targets. Use a separate bounded
list for attack selection. Regression acceptance: 33/64-neighbor cases and
enemy-ID permutations preserve complete risk aggregates and reject this spend.

### R3: unknown bank becomes a zero-bank opportunity

Inside [`decide`][unknown], the observer estimate is used while scoring a rival,
but the selected rival's crushability and returned `enemyBal` are recomputed
from the original object using `bestFoe.bal || 0`. A declared
`balanceKnown:false` is also not honored there when `bal` contains zero.

| Identical underlying fixture, enemy field | Observer estimate | Returned enemy bank | Result |
| --- | ---: | ---: | --- |
| `bal` absent | 1,000 | 0 | Fight; `crush-adj` |
| `bal:0, balanceKnown:false` | 1,000 | 0 | Fight; `crush-adj` |
| `bal:1000, balanceKnown:true` | 1,000 | 1,000 | Hold; build combat bank |

Introduce a normalized enemy record carrying observed bank, knownness,
estimated distribution and the statistic chosen for planning. Reuse that record
for ranking, crush tests, reserve calculation and simulation. Unknown is not
evidence of a weak target. Key observer state by match and player; the exported
reset currently has no production caller. Acceptance cases should distinguish
known zero, missing bank, unknown zero and a reused player ID in a new match.

### R4: vision coordinates violate field assumptions

The [vision candidate construction][vision-candidates] supplies grid coordinates.
Its situation object supplies no center coordinates, so [`rankTargets`][ranking]
defaults its source to `(500,500)`. The [field implementation][eikonal] divides
positions by 1,000 when indexing its 16×8 grid.

For a 320×180 input, valid candidates occupy only 6×2 of those 16×8 macro cells,
and the default source lies outside the input image. The diagnostic represents
the same relative origin and destination in two coordinate conventions:

| Representation | Origin | Destination | Returned macro travel time |
| --- | --- | --- | ---: |
| 1,000×1,000 convention | (500,500) | (900,500) | 6 |
| 320×180 grid passed without conversion | (160,90) | (288,90) | 2 |

Pass dimensions and the measured player center explicitly, then convert to one
documented coordinate domain. Preserve physical aspect/cell spacing where the
distance model requires it. Acceptance: equivalent scenes at two image
resolutions preserve field samples and target order within numerical tolerance.
This is a confirmed call-contract mismatch; its live gameplay effect was not measured.

### R5: returning 24 targets does not bound the spectral input

[`SPEC_MAX_N=64`][spectral] controls scratch-buffer reuse, not input size.
Larger inputs allocate full dense distance and affinity matrices. The vision
caller concatenates all frontier candidates; filtering removes duplicates but
does not impose a count cap. The final top-24 slice occurs after the work.

| Input candidates | Returned targets | Median, 9 measured calls | Maximum, 9 calls | Main quadratic buffers |
| ---: | ---: | ---: | ---: | ---: |
| 64 | 24 | 0.921 ms | 1.348 ms | Reused scratch |
| 256 | 24 | 4.305 ms | 4.648 ms | 1,309,696 bytes |
| 1,024 | 24 | 57.981 ms | 58.905 ms | 20,967,424 bytes |

The two `n²` Float64 matrices plus the pair-distance array require
`20*n*n - 4*n` bytes for inputs above 64, excluding linear buffers, results and
other ranking work. At 4,096 candidates that is approximately **320 MiB**.
This byte formula follows the allocations; it is not a browser heap measurement.

Use a cheap linear pass to deduplicate and retain a spatially diverse shortlist
of at most **64** candidates before dense scoring. Preserve the complete risk
channel from R2 separately. Another option is a sparse local graph with measured
ranking quality. Acceptance: a large-frontier integration fixture enforces the
input/work bound and preserves mandatory legal/defensive candidates. Record
fallback latency and allocation profiles in Chrome before choosing workers.

## Model, scheduling and architecture improvements

### R6: improve counterfactual fidelity before expanding the search budget

The [aggregate settlement][settlement] gives either zero territory or the
target's entire territory once force exceeds `1.25*bank`. Our fixture starts
with bank 5,000 and 100 cells against bank 10 and 100,000 cells. A 0.1 ratio
quantizes to roughly 498 sent troops; after 10 ticks the model owns **100,100**
cells. Geometry, per-cell capture costs and frontier travel do not constrain
that settlement. This is documented approximation, not a newly discovered
integer-arithmetic error.

Outside rivals' bank/land totals also remain fixed while modeled adjacent
rivals evolve. UCB therefore optimizes a deliberately partial counterfactual.
Its `winProb` field is a deprecated utility alias, not a calibrated probability.

Add contact/capture-rate bounds, unsettled-force/refund handling and uncertainty
for outside growth. Existing frontier research is a candidate model, not an
accepted production replacement. Evaluate held-out forecast error **and action
ordering**, then run paired whole-match comparisons under the MCP protocol.
Prediction accuracy alone does not establish stronger play.

### R7: reduce capability-facade churn and redundant observations

The [modern export getter][facade] constructs a facade, while
[read helpers][readers] repeatedly access `g.modern`. An instrumented fixture
running the unmodified MAIN hook with 512 alive players and 33 physical enemies
counts **4,860 getter reads for one snapshot**. This counts getter evaluations;
it does not measure browser allocations, GC pauses or an achieved speedup.

Keep a stable capability object per supported contract and hoist it for snapshot
extraction. Ensure readers still use current match arrays after resets. Reuse
an immutable per-tick observation for UI and policy, while retaining independent
live checks for mutation. Acceptance: observation parity across match resets,
stable facade identity, and a measured reduction in extraction/GC cost.

### R8–R9: make time, epoch and replay contracts explicit

The [bandit][bandit] checks its budget between complete rollouts and starts its
timer after initial normalization/action construction. Its 0.5 ms budget is
therefore soft. The following are synthetic diagnostics, with 5 warmups and
15 measured calls per row. Coverage describes the **last** sample only.

| Modeled rivals | Requested budget | Median elapsed | Maximum elapsed | Last rollouts/actions | Last complete coverage |
| ---: | ---: | ---: | ---: | --- | --- |
| 2 | 0.5 ms | 0.531 ms | 0.542 ms | 13 / 3 | Yes |
| 16 | 0.5 ms | 0.599 ms | 0.660 ms | 3 / 17 | No |
| 32 | 0.5 ms | 0.806 ms | 0.908 ms | 2 / 17 | No |

The current veto guard correctly refuses incomplete coverage. Improve budget
admission and candidate coverage, with work units or resumable rollout chunks.
Provide a fixed-iteration, seeded replay mode and record completed work in live
journals; the same seed with a wall-clock deadline is not a deterministic replay.
Production `decide` consumes this bandit's hold veto; it does not apply the
bandit's selected fight target or ratio. A broader search policy would require
an explicit joint decision/target/spend contract and validated counterfactuals.

The [normal command envelope][command-envelope] omits originating match ID,
game tick and observation version. The experimental route already validates
these. Extend that provenance contract to normal proposals, reject wrong-match
or expired intent, and reset belief/planning state on a match epoch change.
Retain live repricing and target validation; freshness checks add causal
correctness rather than replacing command safety checks. Acceptance cases:
delayed replies, timeout followed by replan, match restart and stale worker results.

### R10–R11: bootstrap and module boundaries

The [bootstrap][bootstrap] uses synchronous XHR, compiles the patched script and
replaces the document before parser execution. The [WHATWG XHR standard][xhr]
discourages synchronous Window requests and disallows their nonzero timeout.
Measure startup network/compile/replacement duration and test stalled fetch,
unknown source and CSP behavior. An asynchronous fetch is not a drop-in fix:
the capability export must still precede the game's IIFE execution.

The kernel, MAIN hook and orchestrator contain **3,629 + 2,162 + 1,937 = 7,728**
lines. V1 contributes **44,026 source bytes**, V2 **142,362**, and both are loaded
in both worlds. This establishes source/load duplication, not a 2× heap or CPU
claim. Extract explicit observation/belief/planning/command interfaces and a
smaller production kernel, keeping exact arithmetic shared. Use differential
replays to protect behavior during extraction.

[Chrome documents execution worlds as variable isolation][chrome-worlds], not
separate compute cores. [Worker guidance documents messaging overhead][workers].
Worker placement should follow a full Chrome profile after bounding R5; the
ordinary policy timings below do not justify a GPU/WASM rewrite by themselves.

## Measurements and acceptance limits

Three sequential runs of the existing CPU benchmark were made on **Apple M4,
10 logical CPUs, arm64, Node v26.12.1**. Each run uses 200 warmups per group;
ordinary decisions have 1,200 measured calls, the active leader 300, and grid
updates 400. Values below are medians of the three run means/P95s.

| Fixture | Historical baseline `188b1bf` mean / P95 | Current engine mean / P95 |
| --- | ---: | ---: |
| 80 ordinary follower states, decision + spend | 0.195329 / 0.553375 ms | 0.028901 / 0.039084 ms |
| Search-active three-player leader, decision + spend | 0.093454 / 0.104709 ms | 0.550577 / 0.569375 ms |
| 320×180 grid update | 0.086454 / 0.096375 ms | 0.087129 / 0.100208 ms |

The older comparator uses a different policy. Of 80 frozen fixtures, 48 decision
outputs differ, including diagnostics, and 0 spending outputs differ. These
figures are not proof of behavior-preserving optimization, browser CPU savings
or gameplay improvement. The separate ranking probe uses 3 warmups and 9 calls
per size, profiling disabled. All timing results are descriptive local samples.

`npm test` passed **155 Node subtests** plus existing math, contract,
compatibility and policy checks before this report. Three fresh public-source
gates failed closed: native math lacks `function aJR()`, live integration is
unknown, and the spatial source is unknown. The spatial fetch SHA-256 was
`242b1ebcaaeb41bce841b3cc0bd4b97178180ccd82e0a788486609939de000f0`.
No official-game match or full-browser CPU profile was run for this audit.
Historical four-match Impossible results remain four losses, with unmatched
placements; they do not quantify a candidate's advantage or this audit's gains.

## Reproduction and implementation sequence

[Machine-readable evidence](../evidence/cs/2026-10-30-review.json) contains all
three CPU benchmark outputs and both synthetic probe outputs. The two dated
diagnostic CLIs require the reviewed runtime hash and reproduce its behavior;
they are not release regression gates that should preserve these defects.

```sh
npm test
node research/benchmarks/engine-review-state-probes.cjs
node research/benchmarks/engine-review-performance-probes.cjs
npm run benchmark:cpu
npm run test:math-native
npm run test:live
npm run test:spatial
```

Implement R1, then fix R2/R3 with independent risk/unknown-value regression
oracles. Fix R4/R5 with resolution-invariance and bounded-frontier fixtures.
Then calibrate R6 and profile R7–R11. Each change follows the
[math protocol](../math/MATH_TEST_PROTOCOL.md) and
[official MCP loop](../testing/AGENT_EXPERIMENT_HANDOFF.md): test, observe, make
one justified change, retest comparably, preserve failures, and use predeclared
held-out whole matches for any strength claim. No win-rate gain is assumed.

[manifest]: https://github.com/phamvotriduc241106/territorial-chrome-extension/blob/5cb3bf93a5c98ebccd546c05113bb15920fcdf3c/manifest.json#L25
[detector]: https://github.com/phamvotriduc241106/territorial-chrome-extension/blob/5cb3bf93a5c98ebccd546c05113bb15920fcdf3c/content/source-adapter.js#L13
[pipeline]: https://github.com/phamvotriduc241106/territorial-chrome-extension/blob/5cb3bf93a5c98ebccd546c05113bb15920fcdf3c/content/content.js#L900
[snapshot]: https://github.com/phamvotriduc241106/territorial-chrome-extension/blob/5cb3bf93a5c98ebccd546c05113bb15920fcdf3c/content/main-hook.js#L1839
[live-context]: https://github.com/phamvotriduc241106/territorial-chrome-extension/blob/5cb3bf93a5c98ebccd546c05113bb15920fcdf3c/content/main-hook.js#L1558
[unknown]: https://github.com/phamvotriduc241106/territorial-chrome-extension/blob/5cb3bf93a5c98ebccd546c05113bb15920fcdf3c/content/engine-core-v2-advanced.js#L1810
[vision-candidates]: https://github.com/phamvotriduc241106/territorial-chrome-extension/blob/5cb3bf93a5c98ebccd546c05113bb15920fcdf3c/content/content.js#L1391
[ranking]: https://github.com/phamvotriduc241106/territorial-chrome-extension/blob/5cb3bf93a5c98ebccd546c05113bb15920fcdf3c/content/engine-core-v2-advanced.js#L3397
[eikonal]: https://github.com/phamvotriduc241106/territorial-chrome-extension/blob/5cb3bf93a5c98ebccd546c05113bb15920fcdf3c/content/engine-core-v2-advanced.js#L2749
[spectral]: https://github.com/phamvotriduc241106/territorial-chrome-extension/blob/5cb3bf93a5c98ebccd546c05113bb15920fcdf3c/content/engine-core-v2-advanced.js#L2155
[settlement]: https://github.com/phamvotriduc241106/territorial-chrome-extension/blob/5cb3bf93a5c98ebccd546c05113bb15920fcdf3c/content/engine-core-v2-advanced.js#L1266
[facade]: https://github.com/phamvotriduc241106/territorial-chrome-extension/blob/5cb3bf93a5c98ebccd546c05113bb15920fcdf3c/content/source-adapter.js#L372
[readers]: https://github.com/phamvotriduc241106/territorial-chrome-extension/blob/5cb3bf93a5c98ebccd546c05113bb15920fcdf3c/content/main-hook.js#L525
[bandit]: https://github.com/phamvotriduc241106/territorial-chrome-extension/blob/5cb3bf93a5c98ebccd546c05113bb15920fcdf3c/content/engine-core-v2-advanced.js#L2923
[command-envelope]: https://github.com/phamvotriduc241106/territorial-chrome-extension/blob/5cb3bf93a5c98ebccd546c05113bb15920fcdf3c/content/internal.js#L140
[bootstrap]: https://github.com/phamvotriduc241106/territorial-chrome-extension/blob/5cb3bf93a5c98ebccd546c05113bb15920fcdf3c/content/preloader.js#L24
[xhr]: https://xhr.spec.whatwg.org/
[chrome-worlds]: https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts#work_in_isolated_worlds
[workers]: https://web.dev/articles/off-main-thread
