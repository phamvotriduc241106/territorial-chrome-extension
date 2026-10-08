# Dynamic frontier validation — v10.3.3

Updated **2026-10-07 20:39:28 EDT**. Production engine remains **V2.8.2**.

## Decision

The dynamic candidate substantially improves short, action-censored hostile-combat transitions on all eight untouched final matches. **Do not promote it into production policy. Another model-validation phase is required.** Private scheduler access is still research-only; fleets/elimination are unsupported; only one procedural map family and 2–20-tick horizons were tested. Instrumentation has measurable cost. This is transition-model evidence, not stronger gameplay or win-rate evidence.

Baseline is `3488aab53cb57f75855a9b633007ed6bb489fecf`; branch is `codex/dynamic-frontier-research`. No Workers, WASM, WebGPU, tree search, frontier MPC/UCB commands or policy changes were introduced. The dynamic module is separately loadable but **absent from the release manifest and package**. Native spatial recording is opt-in, observational and reversible.

Machine-readable [summary](frontier/2026-10-07-dynamic-summary.json) contains full per-match, horizon, category, all-valid/common-support metrics, match-clustered uncertainty, calibration estimates, source/freeze/dataset hashes and benchmark definitions. The [compressed episode report](frontier/2026-10-07-dynamic-episodes.json.gz) retains all 31,733 observed hostile episodes, including episodes with no forecasts. The [protocol](frontier/RESEARCH_PROTOCOL.md) defines the split and censor rules.

## Spatial ground-truth gate

The first hostile reconstruction gate passed **before dynamic rollout implementation**: 143,738 ordered ownership writes, 376 hostile batches, 4,272 reconciliations and nine full-grid audits. The refreshed gate additionally checks 252 original native support/debt kernels. Its result is embedded in the summary: 143,599 ownership writes, 396 hostile batches, 4,293 reconciliations, nine full-grid audits, exact changed-cell attribution and candidate ordering, all five ownership writers restored.

Observations contain exact native/observation ticks, attacker/defender/front IDs, source and geometry versions, selected candidate cells and ordered old/new ownership changes. Immutable baselines use private 256-cell pages; updates validate match/version/tick, old owner and every native player's territory. An update commits only after reconciliation. Repeated writes to the same cell are retained in native order. There is no inferred raster or disappearance-based conquest label.

One RLE baseline is recorded per match, followed by sparse deltas. Raster size is capped at 4,194,304 cells, an update at 32,768 ordered writes, and the default rollout overlay at 32,768 net entries. Schema2 recording has an 8 MiB conservative serialized-byte bound by default, with explicit eviction/drop/oversize counts; sparse CLI buffers drain every 40 ticks. Peak formal-cohort buffered events were 1,229. No full ownership grid is exported every tick or cloned for each rollout.

The complete cohort replay checks **331,512 spatial updates**, **14,622,553 ownership writes**, **373,045 ordered native candidate sequences** and **409 full-grid audits**. Every replay update reconciles native player territory. Stale, incomplete, unsupported or inconsistent observations fail closed.

Live console spatial recording requires an initialized match before `frontier.start({spatial:true})`. Starting before map initialization can lack a reconciled baseline and is rejected; this does not establish tick-zero coverage. The CLI initializes the match, starts a reconciled tick-zero baseline and records complete matches. Its private scheduler accessor is test-only, not part of the extension.

## Dataset and separation

All 24 games are complete accelerated local official-source **Very Hard** matches, from tick zero until at most one native player remains. Native opponents run their own policies; controlled human interventions exercise eight scenario strata. These are not production-autoplay matches. Every map is 512×512, map ID 2, with distinct seeds. Player density is 32/64 in development and 96 in final evaluation: a deliberate distribution shift, not a density-matched random split or multiple map families.

| Match | Split / dev fold | Intervention stratum | Seed | Players | End tick |
| --- | --- | --- | ---: | ---: | ---: |
| 01 | Development / 0 | Weak target | 240071 | 32 | 6915 |
| 02 | Development / 1 | Strong target | 247990 | 32 | 7974 |
| 03 | Development / 2 | Mutual | 255909 | 32 | 7862 |
| 04 | Development / 3 | Reinforced | 263828 | 32 | 7408 |
| 05 | Development / 0 | Refund | 271747 | 32 | 7431 |
| 06 | Development / 1 | Narrow border | 279666 | 32 | 6906 |
| 07 | Development / 2 | Wide border | 287585 | 32 | 9285 |
| 08 | Development / 3 | Simultaneous fronts | 295504 | 32 | 8969 |
| 09 | Development / 0 | Weak target | 303423 | 64 | 9104 |
| 10 | Development / 1 | Strong target | 311342 | 64 | 8384 |
| 11 | Development / 2 | Mutual | 319261 | 64 | 8798 |
| 12 | Development / 3 | Reinforced | 327180 | 64 | 8698 |
| 13 | Development / 0 | Refund | 335099 | 64 | 9074 |
| 14 | Development / 1 | Narrow border | 343018 | 64 | 8481 |
| 15 | Development / 2 | Wide border | 350937 | 64 | 9130 |
| 16 | Development / 3 | Simultaneous fronts | 358856 | 64 | 7806 |
| 17 | Final held-out | Weak target | 366775 | 96 | 10264 |
| 18 | Final held-out | Strong target | 374694 | 96 | 9873 |
| 19 | Final held-out | Mutual | 382613 | 96 | 9307 |
| 20 | Final held-out | Reinforced | 390532 | 96 | 8504 |
| 21 | Final held-out | Refund | 398451 | 96 | 9702 |
| 22 | Final held-out | Narrow border | 406370 | 96 | 10070 |
| 23 | Final held-out | Wide border | 414289 | 96 | 11553 |
| 24 | Final held-out | Simultaneous fronts | 422208 | 96 | 9993 |

The final candidate and seven instrumentation/evaluation files were frozen at **2026-10-08T00:31:10.653Z** (October 7, 20:31:10.653 EDT), before recording or opening matches 17–24. Their SHA-256 values remain unchanged and are tested against the committed summary. Candidate fitted parameters: **zero**. Development uses four match-grouped folds of four validation matches; duration-median ETA fitting uses the other 12 matches in each fold. The final eight are not a fitting fold.

An earlier development-only diagnostic cohort lacked the complete non-land credit ledger. It is preserved locally but excluded. Development was recollected with the corrected ledger before the candidate freeze or any final data. No final-result-driven tuning occurred. A later physical-contact audit separated zero-contact episodes from positive narrow borders without changing frozen predictions.

Totals: 861,123 native ledger events; 195,567 hostile and 177,478 neutral batches; 4,137 support events; 1,714 external credits; 41,172 positive refunds; 46,522 terminations; 1,912 forecast origins; 32,596 episode/horizon forecasts. Scenario names are controller intentions, not category labels. The measured categories below establish actual hostile representation.

## Three independent transitions

| Component | V2.8 aggregate | V2.8.2 static frontier | Dynamic research candidate |
| --- | --- | --- | --- |
| Production command influence | Existing policy only | 0 | 0 |
| Cell-level contact evolves after capture | 0 | 0 | 1 |
| Native ordered candidate queue reproduced | 0 | 0 | 1 |
| Exact native scheduler phase supplied | 0 | 0 | 1, test-only accessor |
| Native support/refund rules simulated | 0 | 0 | 1 |
| Final comparisons | Same 8 matches | Same 8 matches | Same 8 matches |

Existing aggregate/static transition implementations are retained unchanged. Shared contact extraction matches the original static implementation on 1,000 randomized maps. The new model uses an immutable origin and bounded sparse overlay, evolves four-neighbor contact and ordered frontier queues after each capture, and simulates all current land fronts/counterforce in native scheduler order.

Source-verified mechanics include `gr/hR/hZ/gw` combat thresholds/rounding, reinforced support and capped debt surcharge, candidate deduplication/order, first-activation sentinel/reset, 4/3/2/1-tick cadence with large-empire extra passes, queue removal/interior pruning, economics and capped return/debt repayment. Signed private rounding residue is preserved while stored native successful force is clamped. Observed launches have already debited bank: rollout does not charge commands again. First-batch delay, later cadence and termination are separate state transitions.

No measured contact-growth ratio or duration-median ETA parameter is injected. Source-derived cell selection replaces fitted geometry in this candidate. The result is therefore an improvement of the **whole transition package**, not an ablation proving geometry alone caused the gain. Separate geometry/timing/support/refund ablations are required next.

## Held-out prediction accuracy

All models forecast from the same recorded origins, actions, episodes and horizons **2, 5, 10, 20 ticks**. Predictions are constructed before future events are read. The common valid territory/capture/balance cohort has **10,183 rows**; ETA uses **2,056 identical native-return labels with finite forecasts in all three models**. Each cell below is MAE / RMSE / P95 absolute error.

| Error | Aggregate | Static frontier | Dynamic |
| --- | ---: | ---: | ---: |
| Territory, cells | 151.7480 / 655.7897 / 618 | 23.8928 / 92.1660 / 98 | 0.001375 / 0.082911 / 0 |
| Attack captures, cells | 135.0556 / 626.6133 / 518 | 21.2229 / 88.5768 / 85 | 0 / 0 / 0 |
| Balance, troops | 2895.4480 / 27027.5500 / 5151 | 926.3546 / 9975.9685 / 1384 | 0.008445 / 0.842386 / 0 |
| Native return ETA, ticks | 4.6984 / 5.4587 / 9 | 2.0438 / 2.4758 / 4 | 0 / 0 / 0 |

Dynamic is not perfectly exact: nonzero territory/balance residuals remain, despite a zero P95. All eight final matches improved. Equal-match territory MAE difference, dynamic minus static, is **−23.8867 cells**; **95% match-bootstrap CI [−27.0387, −20.6790]**, 2,000 whole-match resamples. Independent experimental units: **eight matches**, not thousands of correlated forecasts.

Dev-fold static territory MAEs are 27.7005, 27.5741, 25.7116, 26.3222; corresponding dynamic MAEs are 0, 0.000649, 0, 0. These are development checks, not substitutes for final evaluation.

## Coverage, censoring and selection bias

| Final-cohort accounting | Aggregate | Static | Dynamic |
| --- | ---: | ---: | ---: |
| Forecast opportunities | 15284 | 15284 | 15284 |
| Prediction coverage | 100% | 100% | 99.7972% |
| All-valid rows | 10186 | 10186 | 10183 |
| Valid coverage | 66.6449% | 66.6449% | 66.6252% |
| Unsupported candidate forecasts | 0 | 0 | 31 |
| Shared censored rows | 5098 | 5098 | 5098 |
| Native ETA labels among all-valid rows | 3248 | 3248 | 3245 |
| Finite ETA forecasts for those labels | 2165 | 2601 | 3245 |

Shared censoring is **33.3551%**: 4,461 future-action disturbances, 513 unsupported native terminations, 124 external credits. All intervening commands remain in the ledger. A command affecting the initial hostile-front connected dependency component censors the interval; unrelated actions remain visible but do not automatically censor. Unsupported ownership/credit/clear events censor all comparable models. Reinforcement and refunds are retained where source rules are modeled. The dynamic candidate also fails closed on 31 elimination forecasts; 28 overlap shared censoring, **three further otherwise-valid rows** are excluded only from dynamic/common support and remain visible in baseline all-valid metrics. No exclusion is based on residual error.

All-valid and common-support results are both published. The primary table uses identical rows to avoid making dynamic look better through different samples. Native return events supply settlement ETA; disappearance never establishes conquest. Non-return clears are unsupported; returns beyond the finite horizon do not create ETA labels. Per-model ETA scores on different finite-label sets are descriptive only, not paired evidence.

Actual final combat coverage follows. Categories overlap, and multiple horizons in one episode are correlated. Full per-model errors, coverage and censor reasons for every category are in the JSON. Positive narrow-contact audit does **not** count zero contact as narrow.

| Actual category | Opportunities | Common valid | Valid episodes | Valid matches |
| --- | ---: | ---: | ---: | ---: |
| All hostile | 15284 | 10183 | 3472 | 8 |
| Mutual attacks | 408 | 326 | 94 | 8 |
| Source reinforced flag | 4700 | 3229 | 1098 | 8 |
| Source non-reinforced flag | 10584 | 6954 | 2387 | 8 |
| Actual support during interval | 539 | 340 | 145 | 8 |
| No support during interval | 14745 | 9843 | 3439 | 8 |
| Positive refund during interval | 5055 | 3040 | 1514 | 8 |
| Simultaneous fronts | 504 | 321 | 112 | 8 |
| Stronger target | 2072 | 1463 | 486 | 8 |
| Weaker target | 13212 | 8720 | 2986 | 8 |
| Small empire | 1820 | 1201 | 422 | 8 |
| Medium empire | 10996 | 7206 | 2485 | 8 |
| Large empire | 2468 | 1776 | 566 | 8 |
| Positive contact 1–8 cells | 1484 | 899 | 325 | 8 |
| Positive contact 9–31 cells | 6860 | 4392 | 1556 | 8 |
| Positive contact ≥32 cells | 6896 | 4869 | 1607 | 8 |
| No current contact, separate | 44 | 23 | 9 | 6 |

Requested combat categories have valid observations in all eight final matches. This does not establish statistical sufficiency for every interaction combination. Zero-contact fronts remain sparse. Across the full cohort, only **7,963 / 31,733 hostile episodes (25.09%)** receive forecasts because active fronts are sampled every 80 ticks. Short-lived episodes are underrepresented. Censoring is higher for narrow borders: 39.42% versus 29.35% for wide borders. Better conditional predictions do not prove accuracy during disruptive commands, fleets or eliminations. Expand launch-triggered coverage and unsupported categories in the next phase rather than reusing these eight matches for tuning.

## Development-only estimates and unresolved mechanics

| Quantity | Development observations | Estimate / finding | Candidate treatment |
| --- | ---: | --- | --- |
| Cadence by territory band | 22438 / 111760 / 41932 / 6204 | Median 4 / 3 / 2 / 1 ticks | Source scheduler; extra passes separate |
| Admission to first observed hostile batch | 16224 | Median 7 ticks | Exact observed phase, not universal median |
| Admission to first observed neutral batch | 8039 | Median 7 ticks | Exact observed phase |
| Hostile contact-growth ratio | 91153 | Median 1; IQR 0.9796–1.0227 | Source cell evolution, not ratio fit |
| Neutral contact-growth ratio | 90645 | Median 1; IQR 0.9231–1.0333 | Source cell evolution |
| Support delivery/request | 1854 | Median 1; requested median 2269 troops | Native thresholds, capped shortage debt |
| Positive refund returns | 21724 / 22643 eligible events | Positive-force fraction median 1 | Bank/territory cap and debt repayment |
| Grouped duration-median ETA baseline | 4 held-out dev folds | MAE 14.4548 / 14.8032 / 14.1166 / 14.0564 ticks | Not injected; not dynamic ETA evidence |

Admission-delay medians mix private phase and observation offsets; they are not a fresh-launch rule. Contact-growth observations are correlated descriptive summaries. Unsupported or unresolved: naval movement/landing and credits; elimination/gifting/ownership discontinuities; diplomacy; future opponent-action probabilities; returns beyond 20 ticks; source-version migration; production-safe exposure/inference of private scheduling phase; probabilistic ETA; contact curvature/chokepoint approximation under partial spatial observations. The exact candidate requires full native ordered queues and phase. It rejects missing phase rather than fabricating timing.

## Chrome / Apple M4 cost

Measured locally on **Apple M4, arm64, 10 logical CPUs, 16 GiB RAM**, system **Chrome 154.0.8037.98**, isolated sequential headless profiles. Each model gets eight development midpoint fixtures, 80 warmups and 800 20-tick cycles. Each cycle produces the same hostile episode set, averaging three forecast episodes. Timer resolution is approximately 0.1 ms; quantized percentiles should not be interpreted as nanosecond precision.

| Rollout metric | Aggregate | Static | Dynamic |
| --- | ---: | ---: | ---: |
| Mean cycle ms | 0.02675 | 0.033875 | 0.213875 |
| P95 cycle ms | 0.1 | 0.1 | 0.4 |
| P99 cycle ms | 0.2 | 0.2 | 0.5 |
| Forecast episodes / second | 105727 | 86022 | 13833 |
| Peak observed JS heap, MiB | 25.90 | 26.21 | 26.47 |
| Renderer task seconds, including setup/warmup | 0.353041 | 0.355910 | 0.519858 |

Ownership replay and initial contact extraction are prepared once per origin and **excluded from rollout latency**. Separate 88-call geometry timings: mean about 1.895 ms, P95 2.1–2.2 ms, P99 3.7–4.2 ms. Heap figures are maximum per-call Chrome `usedJSHeapSize`, not whole-browser RSS/native memory or a continuously measured true peak. CDP `ScriptDuration` returned zero and is not interpreted as zero CPU.

Instrumentation benchmark: same native 64-player seed, 2,000 accelerated ticks per mode, exports every 40 ticks, no rendering/planner/UI or geometry forecasts.

| Native loop metric | Disabled | Native events | Spatial replay |
| --- | ---: | ---: | ---: |
| Mean tick ms | 0.03850 | 0.04305 | 0.11265 |
| P95 tick ms | 0.1 | 0.1 | 0.3 |
| P99 tick ms | 0.2 | 0.2 | 0.4 |
| Peak observed JS heap, MiB | 18.70 | 19.72 | 70.79 |
| Renderer task seconds | 0.086663 | 0.096278 | 0.271011 |
| Exported bytes | 100 | 6646619 | 29072894 |

Spatial replay adds **0.184348 renderer task seconds over 2,000 ticks**, or **212.72%** relative to the isolated native loop. The ratio matters; this is not free telemetry. It is off by default. Sub-millisecond candidate rollout tails are acceptable for continued offline research, but these microbenchmarks do **not** establish interactive Chrome/M4 CPU/battery acceptability. End-to-end live cost, recorder retention/GC and rendering interaction remain deployment gates.

## Regression and source checks

Local commands pass: `npm test`, `npm run test:browser`, `npm run test:live`, `npm run test:spatial`, and `npm run package`. Existing regression, randomized property, compatibility, numerical, browser and native-source suites remain enabled. Added tests cover 10,000 ownership updates, 10,000 normal combat and 10,000 support/force cases, 1,000 contact-extraction comparisons, input purity, force/territory accounting, single command debit, refund caps, stale rejection, exact candidate freeze and published coverage. The live suite checks 292 original native normal batches, 252 additional source support cases in the spatial gate, 54 income/rate cases and one exact native command debit. All 16 wrapped public native functions are restored in the live harness.

**80 / 80 frozen production decision/spend fingerprints unchanged**; fingerprint SHA-256:

`d49794e32d3cc195e357b4edc5d14f0731b24a408c25ab03633a019cf015b0c6`

The production core is byte-identical to baseline after normalizing the three release metadata edits. Production release is 10.3.3, engine V2.8.2; update timestamp is synchronized across configuration, manifest description, popup, README, logs and version tests. Runtime package has 34 files and no dynamic candidate/research tools. GitHub CI runs regression/property/browser/package gates on the review branch; live-source/spatial gates are separately measured locally and are not falsely described as CI jobs. Exact-head check results are attached to the PR.

Current official source, downloaded from [Territorial.io](https://territorial.io/) throughout collection and live validation, contract `live-modern-v3`, SHA-256:

`155a2db1cc6f256317fc6178ce12993c76b51630ba5985be4e9ef1d7cad7fcff`

Native instrumentation requires verified source signatures and never bypasses an unsupported source. The summary includes SHA-256 for every recording and each of the seven frozen implementation/evaluation files. Committed episode-report SHA-256:

`8e4da70fd5900fb0de6b561d39432bdbf590cc7b711a31523cf8034e8c5447b9`

## Reproduction and artifact limits

Run from the repository root with Node and supported system Chrome/Playwright. All fresh collection is local; network requests inside the isolated game are blocked. Do not rerun final collection into existing frozen files. Fresh source may change; rerun the source gate and treat a changed hash as a new experiment, not reproduction of this cohort.

```sh
npm ci
npm test
npm run test:browser
npm run test:live
npm run test:spatial
node tools/frontier-study-record.cjs 1 16
node tools/frontier-study-report.cjs scratch/dynamic-frontier-research/dataset-v2 development
node tools/frontier-study-fit.cjs
node tools/frontier-study-freeze.cjs --create
node tools/frontier-study-record.cjs 17 24
node tools/frontier-study-report.cjs scratch/dynamic-frontier-research/dataset-v2 held-out
node tools/frontier-study-freeze.cjs --check
node tools/frontier-study-contact-audit.cjs
node tools/frontier-study-benchmark.cjs
node tools/frontier-study-overhead.cjs
node tools/frontier-study-publish.cjs
npm run package
```

The sequence creates a **new** frozen experiment on a fresh checkout; timestamped raw files are not guaranteed byte-identical. For this existing local study, skip recording and freeze creation: run `--check`, replay/report and measurements against `scratch/dynamic-frontier-research/dataset-v2`. Raw source, immutable baselines, sparse ledgers and full forecast rows remain in ignored local `scratch/`, available on this Mac. They are **not published** in the PR. The compact summary and episode report allow inspection of metrics and selection coverage, but do not independently reconstruct spatial origins. External reviewers need the local raw dataset or fresh collection to reproduce spatial replay; dataset hashes are provided, not a claim of remotely available raw data.

## Next gate

Preserve this result as a successful **conditional native-land transition** experiment. Next: launch-triggered sampling; new map families/seeds and equal-density controls; untouched final matches for fleets/elimination; geometry/timing/support/refund ablations; production-safe phase observability; interactive end-to-end CPU/heap/GC measurement. Do not tune on these eight final games or convert the tiny transition error into a win-rate claim. Policy promotion remains explicitly disallowed until those coverage/runtime gates are satisfied.
