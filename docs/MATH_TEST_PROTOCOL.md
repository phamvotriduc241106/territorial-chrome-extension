# Official mathematics test protocol

Version 1 — 2026-10-21 EDT. Applies to production kernels, spending rules,
planning transitions, observers and experimental mathematical helpers.
This is the repeatable procedure. The [October 21 audit](MATH_AUDIT_2026_10_21.md)
is a dated result, not a substitute for a fresh run. The [October 22 MCP loop](MCP_IMPOSSIBLE_LOOP_2026_10_22.md) records the subsequent source-contract repair and separate negative gameplay results.

## 1. Establish the tested identity

Use an isolated branch/worktree. Preserve unrelated changes. Before editing,
record the commit, working-tree status, Node/browser versions and relevant
runtime/settings hashes. Never read `.env`, use a personal browser profile or
commit downloaded game source. Node 20+ is required; CI currently uses Node 24.

```sh
git status --short --branch
git rev-parse HEAD
node --version
npm ci
```

Run the original tests before edits. For a demonstrated defect, retain the
smallest failing input, add a regression, verify that it fails on the original
kernel, then fix the arithmetic. Use an independent oracle: exhaustive search,
dynamic programming, exact native routines or a separately derived invariant.
Comparing a function with a copy of its implementation is insufficient.

## 2. Run every applicable layer

Run each command separately and preserve its exit code and output. During a full
audit, continue collecting independent results after a failure; the failed
layer must remain failed. Do not turn failures into passes with `|| true`.

| Order | Command | Required evidence |
| --- | --- | --- |
| 1 | `npm test` | Offline contracts, numerical stability, spending/planning regressions, experimental isolation and frozen outputs |
| 2 | `node --test tests/planning-math.test.cjs` | Focused allocation, quantization, income, transition and belief checks; useful during a fix |
| 3 | `npm run test:math-native` | Fresh public-source arithmetic comparison and source SHA-256; no match is played |
| 4 | `npm run test:browser` | Actual bridge serialization and native command boundary against controlled fixtures |
| 5 | `npm run test:ui-state`, `npm run test:ui`, `npm run test:a11y` | Display/state/visual/accessibility regressions after a runtime or release change |
| 6 | `npm run test:live` | Fresh official-source bootstrap, command debit, supported economics/combat integration |
| 7 | `npm run test:spatial` | Supported native ownership, capture attribution and spatial replay |
| 8 | `npm run package`, `git diff --check` | Runtime import closure, release metadata and patch hygiene |

Install the test browser with `npx playwright install chromium` when needed.
`TIO_CHROME` selects an executable; `TIO_PLAYWRIGHT` is supported by the bridge
harness. Offline/fixture checks do not establish current official integration.
CI runs offline, browser, UI and packaging gates; it does **not** currently run
the fresh-source arithmetic, live-bootstrap or spatial gates.

## 3. Check the mathematical contracts

For theoretical documentation, run `npm run test:math-docs` before adopting a
claim, and verify assumptions/call paths as well as algebra. A command reserve
inequality is not a forward-invariance proof; boundary tangency is not PMP
optimality; spectral relaxation is not an exact discrete partition certificate.
The [October 28 corrections](MATHEMATICAL_CORRECTIONS.md) retain counterexamples,
the corrected rate and the current fresh-source failure separately.

| Area | Invariant or oracle |
| --- | --- |
| Slider | Encoded code is an integer in `[0,1023]`; units are `code+1`; requested troops are `floor(B*units/1024)`. An explicit upper bound must never be rounded upward. Zero/nonfinite safety ceilings must block spending. |
| Human land debit | Tax is `floor((12*B+0.5)/1024)`; sent force is `min(requested,max(0,B-tax))`; debit is sent force plus tax. Validate actual native routines and distinguish admission from arithmetic. |
| Bot land debit | Tax is `floor((3*B+0.5)/256)`; native bots subtract tax from requested force at or above the half-bank threshold. Do not substitute the human formula. |
| Reserves/fronts | Every approved command retains its required reserve, respects its debit cap and excludes busy/illegal targets. A burst must use each successive remaining bank, including every command tax. |
| Income | Integer rounding, source tick phase, multipliers, per-player settings, disabled interest, debt repayment and caps match the native routine. Check ticks `8,9,99,1919,1929,2999`; do not substitute continuous compound interest. |
| Planning | One command is debited once. Incoming force has already left the sender's bank. Pending fronts persist until settlement. Inputs remain unchanged; repeated transitions evolve the previous output. Horizons use explicit source ticks. |
| Global state | Preserve outside territory, banks and player counts. A local rival set must not invent global domination or a completed game. |
| Integer allocation | Integer/nonnegative allocations, sum no greater than budget, feasible floors/caps, explicit infeasibility and no improving feasible one-troop exchange. Compare with exhaustive/DP optima and test tied/saturated utilities. |
| Beliefs/search | Quantiles use cumulative weight; median and expectation stay distinct. Utilities are labelled as utilities. Partial action coverage must not authorize a confident veto; experimental search remains isolated. |
| Numerical boundaries | Exercise zero, tiny, normal and maximum supported banks; empty/dead/busy opponents; infeasible budgets; zero horizons; degenerate geometry; and NaN/Infinity at public safety boundaries. Preserve input validity/provenance. |

Allocation objective: for extra troops `y_i = allocation_i - min_i`,
`U_i(y_i) = w_i*(1-exp(-y_i/s_i))`. The discrete gain is
`delta_i(k) = w_i*(1-exp(-1/s_i))*exp(-k/s_i)`.
Check integer optimality using those gains or an independent oracle; a
continuous KKT solution followed by rounding is not sufficient.

Integer counts, debits, balances, debt and tick labels require exact equality.
Current exhaustive allocation checks use absolute utility error below `1e-9`;
the DP oracle allows `1e-10*max(1,optimum)`; the retained exchange regression
allows `1e-12` in log gain. Do not loosen these tolerances to conceal a failure.

## 4. Required retained coverage

At extension 10.3.10, the committed gates include 151 Node cases plus existing
assertion suites, 80 frozen decision/spend fixtures, 5,000 seeded allocation
invariant cases, 200 exhaustive comparisons and 300 DP comparisons. Keep these
cases when adding coverage. Passing counts alone do not prove correctness.

The fresh arithmetic audit checks 1,512 income/debt cases, all 1,024 slider codes
at six bank sizes for 6,144 human and 6,144 bot cases. It executes extracted
original routines in a VM with controlled state. It checks supported ordinary
land arithmetic; it does not verify geometry, scheduling, admission, special
resource-limited modes or gameplay. Missing/ambiguous source markers or changed
signatures are failures; never replace the native oracle with the prediction.

The 1.5-billion-troop allocation regression must complete within its existing
1,000 ms VM guard. For performance claims, record hardware, Node/browser,
warmups, sample count, median and P95; separate a timeout from a measured runtime.
`npm run benchmark:cpu` compares a historical baseline and must not be presented
as an isolated measurement of a new patch. Ad hoc stress results must include
their seed, generator and inputs; they are not automatically part of `npm test`.

Preserve the original 80-case fingerprint and historical evidence. An intentional
policy change needs an explicit before/after review and retained baseline;
changing an expected hash to hide accidental drift is prohibited. Historical
exploratory scripts may print failures while exiting zero: inspect the output
and distinguish their unmet strategy expectations from current release gates.

## 5. Report, merge and interpretation

Write a dated report with the tested commit/runtime/settings/source identities,
commands, exit codes, case counts, failing inputs, before/after results,
uncertainty and unresolved work. Keep raw logs under ignored
`scratch/math-validation/`; publish only sanitized summaries and reproduction
instructions. Record separate statuses for arithmetic, current integration and
gameplay strength. Never describe the whole validation as passing when a
required layer failed or was not run.

After a fix, run the full applicable gates, push a scoped PR and inspect checks
for its exact head SHA. When merge is authorized, merge only that verified SHA,
then fast-forward the clean local main and verify it matches remote main.
Existing integration failures must stay visible; merging an independent math
repair does not resolve them or authorize an unsupported native source.

For an adapter/actuator repair, verify the installed extension in an owned
temporary Chrome profile, single-player Custom Scenario only. For example:

```sh
npm run audit:live -- 5 Impossible 64
```

Confirm the actual UI/native configuration and positive native territory.
Unknown contracts, failed spawn or setup errors produce error records with no
combat outcome. Use normal scheduling and commands. Opponents eliminated is a
separate milestone from official completion. Strength comparisons require a
predeclared whole-match campaign; see [Very Hard testing](VERY_HARD_TEST.md).

**Known status on 2026-10-21:** arithmetic checks pass, while fresh bootstrap,
spatial and installed-extension checks reject the renamed official bundle.
Preserve `unknown` / `contract-unmapped` as failures until a verified adapter
migration passes those gates. See the [dated audit](MATH_AUDIT_2026_10_21.md).
