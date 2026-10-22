# October 21 mathematics audit

Candidate extension 10.3.10, policy V2.8.2; prepared 2026-10-21 EDT.
Starting main: `1d74d961352ff86bb1010fee458beb255ebbdc6e`.

Three demonstrated arithmetic/algorithm defects are fixed. **The current official
game is still incompatible with the native adapter.** Fresh bootstrap/spatial
checks and the installed-extension check fail closed. This patch does not
restore native autoplay or establish a win-rate improvement.

## Repairs

| Case | Before | After |
| --- | ---: | ---: |
| Explicit zero spending ceiling | 10 / 1024 | 0 |
| Ceiling 0.6501 with balance 10,000 and reserve 1,400 | 666 / 1024 = 0.650390625 | 665 / 1024 = 0.6494140625 |
| 1,500,000,000 troops; weights 1/1, saturation 10/20 | VM timeout at 1,000 ms | Median 0.017875 ms; P95 0.033792 ms |
| Improving one-troop exchange in the retained 432-troop allocation | Exists | None |

Timing: Apple M4, Node v26.8.2, 100 warmups and 1,000 updated allocations.
The baseline was interrupted by a VM timeout, not measured to completion.
This is allocation latency, not browser CPU or gameplay speed. The large-bank
case requires explicit small saturation values; ordinary default parameters
were not demonstrated to cause that stall.

The old allocation in `tests/planning-math.test.cjs` was
`[1,1,69,78,0,81,29,172,1]`; moving one troop from front 6 to front 7 increases
the specified objective. Continuous optimization, flooring, then assigning only
leftovers cannot undo that excess troop. The updated result is
`[1,1,69,78,0,81,28,173,1]`.

For extra troops `y_i = allocation_i - min_i`, the specified utility is
`U_i(y_i) = w_i * (1 - exp(-y_i/s_i))`. Its discrete marginal gain is
`delta_i(k) = w_i * (1 - exp(-1/s_i)) * exp(-k/s_i)`.
Each front has a decreasing sequence of gains. Selecting the largest available
gains maximizes this separable integer objective under the total budget and
per-front caps. The solver bisects a **log marginal** threshold, materializes
its feasible integer endpoint, then resolves threshold ties. Log space avoids
underflow even when the ordinary utility has numerically saturated. Minimum
floors, caps and explicit infeasibility reporting retain their existing meaning.

Both allocation entrypoints share the repair. Native single-command attacks
do not consume these front allocations; no tactical strength gain follows from
repairing this helper. The slider repair rounds an upper bound down while the
existing native debit/reserve checks remain authoritative.

## Current validation

| Check | Result |
| --- | --- |
| `npm test` | PASS: 151 Node cases plus existing assertion suites |
| Frozen production decision/spend fixtures | PASS: 80/80 unchanged; original hash retained |
| Allocation oracle | PASS: 300 seeded dynamic-programming comparisons plus the existing 200 exhaustive comparisons |
| Allocation invariants | PASS: existing 5,000 floor/cap/budget cases |
| Additional allocation stress | PASS: 20,000 cases, seed 71, budgets up to 1.5 billion; no improving one-troop exchange |
| `npm run test:browser` | PASS: 9 bridge, 29 hook and 22 capital native-boundary checks |
| `npm run test:ui-state` | PASS: 6 cases |
| `npm run test:ui` | PASS: 170 checks, 13 approved screenshot comparisons |
| `npm run test:a11y` | PASS: 131 checks, 17 scans, 0 serious/critical violations |
| `npm run test:math-native` | PASS: 1,512 income/debt, 6,144 human-debit and 6,144 bot-debit cases against freshly fetched native routines |
| `npm run test:live` | FAIL: `Unsupported live source: unknown` |
| `npm run test:spatial` | FAIL: `Unsupported native spatial source: unknown`; now reports the contract/hash before launching Chrome |
| `npm run audit:live -- 5 Impossible 64` | SETUP ERROR: `contract-unmapped`; 0 active samples, 0 commands, no match outcome |
| `npm run package` | PASS: 41 runtime files, synchronized metadata |
| `npm run benchmark:cpu` | PASS; historical-baseline microbenchmark, not an ablation of this patch |

Three of the four new regression tests failed on the original kernel: the
one-troop exchange, large-budget timeout and explicit ceiling checks. All pass
after the repair. The dynamic-programming test also passes on the baseline's
sample; it supplements the retained failing counterexample.

Frozen decision/spend SHA-256 remains
`d49794e32d3cc195e357b4edc5d14f0731b24a408c25ab03633a019cf015b0c6`.

Historical exploratory scripts are not release gates and are not all green:
`tests/audit-adversarial.test.cjs` prints 3 passes/4 failures;
`tests/test-singular-arc-spending.test.cjs` prints 2 passes/3 failures. They
request absent counterfactual/naval/singular-arc behavior or historical call
names, as described in `VALIDATION.md`. Their exit status is zero despite
printed failures. They were not rewritten to conceal these results.

## Fresh source and integration boundary

The arithmetic audit's downloaded public HTML SHA-256 is
`0c117ef77ac132103a8ab9db78e8027c0ce1a93e4dc8c73811a09d04d421e9b6`.
It uses a newly renamed family (`c/y/ay/q` in place of the older
`aE/ah/af/bO` interface). Recognition of the old gameplay contract returns
`unknown`. No new source family was whitelisted.

`tools/planning-native-math.cjs` extracts the **original** native income,
integer-root, rounding, credit/cap/debt and human/bot debit routines. It executes
them in an isolated VM with controlled player arrays/settings and compares the
kernel. Cases include tick 8/9/99/1919/1929/2999; zero/low/soft-cap/over-cap
banks; disabled interest; global and per-player income settings; and debt.
All 1,024 slider codes are checked at six bank sizes, through 1.5 billion.
It fetches fresh source by default, rejects missing/ambiguous markers and checks
the expected economy routine signatures. It does not simulate map geometry,
special resource-limited modes, command admission, scheduling or a live match.

The prior recorded v3 source was also replayed locally through the full browser
harness: bootstrap, exact command debit, 292 combat cases and 54 economics cases
pass. Its original file SHA-256 is
`155a2db1cc6f256317fc6178ce12993c76b51630ba5985be4e9ef1d7cad7fcff`.
This is historical-source regression coverage, not current integration evidence.

The final installed-extension attempt used Chrome 155.0.8059.85 in an owned
temporary profile and extension 10.3.10. At 2026-10-21 20:11:24 EDT it stopped
before scenario setup because the synchronous bootstrap was `contract-unmapped`.
Its navigation-response hash is a separate identity; the recorder did not
establish an executed-bootstrap hash. No combat samples, win/loss result,
candidate promotion or real strength comparison exists from this attempt.

## Reproduction and remaining work

```sh
npm ci
npm test
npm run test:browser
npm run test:ui-state
npm run test:ui
npm run test:a11y
npm run test:math-native
npm run test:live
npm run test:spatial
npm run audit:live -- 5 Impossible 64
npm run package
npm run benchmark:cpu
git diff --check
```

Expected current failures are retained above. Raw local logs and downloaded
source remain under ignored `scratch/math-audit/`; installed-run reports remain
under ignored `scratch/live-chrome-audit/`. No game source or Chrome profile is
committed. The sanitized [summary](math-audits/2026-10-21-summary.json) records
counts, hashes and the failed integration gate.

The next functional repair is a separately verified source-adapter migration:
map state, native UI/scenario controls, adjacency, outgoing/incoming force,
command debit and private spatial hooks; validate their signatures and native
effects before admitting commands. Then rerun the installed flow and a
preassigned whole-match comparison. Merely renaming/whitelisting the bundle or
passing this arithmetic audit does not satisfy that integration gate.
