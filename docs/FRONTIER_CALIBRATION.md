# Controlled shadow evidence

Release 10.3.2 / V2.8.2. Updated 2026-10-07 10:19:32 EDT.

This is a **telemetry release**, not a production combat-policy improvement. Full contract, live-source and packaging checks pass. All 80 frozen production decision/spend fingerprints are unchanged. Recording is off by default; no fitted parameters are imported by runtime. No Workers, WASM, WebGPU or tree-search activation.

## Recorded cohort

Three complete local official-source single-player Very Hard matches, 64 players, procedural seeds 14071/21990/29909. Our controlled player submits a 20%-bank neutral command every 100 ticks when legal, otherwise holds. Native bots play normally. Full native ticks are accelerated in an isolated Chrome profile; nonlocal browser traffic is blocked. This is **not production autoplay**, a human-recorded campaign, or a real-time CPU benchmark.

Official HTML fetched 2026-10-07; SHA-256 `155a2db1cc6f256317fc6178ce12993c76b51630ba5985be4e9ef1d7cad7fcff`. Recorded end ticks: 8537, 9328, 9864; all reached one alive player. No dropped events, orphan prediction labels or independently detected contaminated scores. The recorded draft has the previous build timestamp; final changes synchronize release details and harden startup/signature guards, not combat arithmetic.

[Machine-readable summary](frontier/2026-10-07-shadow-summary.json) includes per-match/horizon/subset metrics, raw-recording hashes and parameter sample counts. Raw exports remain locally under ignored `scratch/frontier-recordings/2026-10-07T14-20-04-059Z/`; game HTML, browser profiles and personal data are not committed.

## Paired descriptive errors

384 horizon forecasts, 259 paired scores, 125 censored (32.5521%), zero pending. Paired coverage: 67.4479%. Native-command coverage: 384/384; model availability: 384/384. Of 56 observed player-contact episodes, 51 receive forecasts; 5930 global episodes are observed in total. Thus global episode forecast coverage is only 0.8600%, deliberately restricted to our player contacts, not whole-map combat prediction. The retained observations are mostly quiet neutral-expansion windows. Multiple origins and horizons in one match are correlated; **259 is not 259 independent matches**.

| Metric, same 259 labels | Aggregate | Frontier shadow |
| --- | ---: | ---: |
| Actor territory MAE, cells | 348.6834 | 14.9382 |
| Actor territory RMSE, cells | 751.9374 | 28.8941 |
| Actor territory P95 absolute error, cells | 2332 | 59 |
| Bank MAE, troops | 10.1197 | 0.7490 |
| Bank RMSE, troops | 65.1037 | 5.5737 |
| Bank P95 absolute error, troops | 66 | 0 |
| Valid forecast ETA labels | 0 | 0 |

Attack-specific captured-territory errors equal actor-total territory errors in this restricted cohort; the recorder/report keep the two separate for simultaneous-front cases. Bank P95 of zero still permits nonzero outliers, as RMSE shows. No forecast-ETA accuracy claim is possible from zero valid paired labels. Censoring is selection bias: these errors do not describe excluded reinforcements, refunds, future commands or third-party fronts.

| Current native flag | Forecasts | Paired | Censored |
| --- | ---: | ---: | ---: |
| Reinforced | 52 | 29 | 23 |
| Non-reinforced | 332 | 230 | 102 |

The native reinforcement flag is not the same as reinforcement being delivered. The offline report separates them and leaves empty subsets empty.

## Offline estimates, not applied

Whole-match split: seeds 21990 and 29909 train; seed 14071 is held out. The split is reproducible from saved local match IDs, not random horizon/tick splitting. Native global-front events allow cadence/support/refund/duration estimation beyond our player's modeled contacts; this does not extend frontier prediction coverage to those fronts.

| Conditional estimate | Training sample count | Median |
| --- | ---: | ---: |
| Cadence, actor territory <1000 cells | 3405 | 4 ticks |
| Cadence, 1000–9999 cells | 17585 | 3 ticks |
| Cadence, 10000–59999 cells | 5172 | 2 ticks |
| Cadence, ≥60000 cells | 836 | 1 tick |
| First observed native batch delay | 4028 | 7 ticks |
| Candidate contact log-growth / tick | 23627 | 0 |
| Native candidate / observed contact ratio | 224 | 1 |
| Delivered reinforcement / requested force | 234 | 1 |
| Unconstrained refund credit / remaining force | 3599 | 1 |

First-batch delay P10/P90: 3/7 ticks. Contact growth P10/P90: −0.062034/0.023828 per tick; candidate/contact ratio P10/P90: 0.666667/1.062500. These distributions do not identify timer phase, native candidate selection or a universal geometry-growth constant. Recorded reinforcement bank/debt fractions and refund debt/cap subsets remain conditional observations; this cohort has no debt/cap-limited refund samples, so those estimates are `null`.

The diagnostic ETA baseline is median full native return duration by initial actor-territory band, fitted on 2303 labeled episodes without observed reinforcement or later relevant commands. Its 1026 held-out native-duration labels give MAE 9.7583, RMSE 17.0246, P95 absolute error 36 ticks. This baseline is separate from horizon-limited aggregate/frontier ETA predictions and is not a calibrated completion distribution. Left/right-censored or disturbed episodes are never inserted as zero-duration failures.

## Reproduce and next boundary

```sh
node tools/frontier-record.cjs 3 20000
node tools/frontier-report.cjs scratch/frontier-recordings/<run>/match-1.json scratch/frontier-recordings/<run>/match-2.json scratch/frontier-recordings/<run>/match-3.json
node tools/frontier-fit.cjs scratch/frontier-recordings/<run>/match-1.json scratch/frontier-recordings/<run>/match-2.json scratch/frontier-recordings/<run>/match-3.json
```

The collector fetches the changing official source and saves generated local artifacts. A new run may differ because native setup/timing and the source can change; saved hashes identify this exact cohort. Unsupported signatures or missing telemetry fail closed. Future work needs representative contested-front and fleet recordings, broader whole-match held-out splits, and explicit reinforcement/refund/phase dynamics before any model can influence production policy. The prospective 20-match Very Hard win-rate standard remains unplayed by this work.
