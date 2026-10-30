# Experiment cycle 01 — exact planner observation and action shadow

October 13, 2026, America/New_York. Raw filenames use October 14 UTC; the runs occurred around 20:10–20:20 EDT on October 13. Starting main `8508641`; production remains v10.3.8 / V2.8.2, update 2026-10-13 12:39:34 EDT. No production policy, manifest, native arithmetic, frontier/search setting or candidate parameters were changed.

## Question and intervention

Can an opt-in observer capture original planner inputs, full spend outputs, native command debit and actual acknowledgements well enough to evaluate the offline contact-risk candidate? This is **not** baseline-versus-candidate gameplay: the installed production engine still selected every actual action. Diagnostic observers were injected, but no second engine or candidate actuator was injected.

Real visible system Google Chrome 155.0.8059.40, official https://territorial.io/ Custom Scenario, Europe (native mapType=1/mapRealisticIndex=0), Impossible (native difficulty=5), 512 configured and initially alive players, viewport 1280×900, normal spawn confirmation at (700,400). No manual combat commands, artificial balances, accelerated scheduler or multiplayer. Geographic procedural-seed fields are inactive; bot placements/behavior are not frozen.

## All attempts retained

| Measurement | A: facade observer | B: stable hooks, navigation hash | C: executed-source bound |
| --- | ---: | ---: | ---: |
| Outcome | Loss | Loss | Loss |
| Survival to sampled termination | 71.281 s | 76.612 s | 66.517 s |
| Peak land | 1,027 | 1,025 | 1,037 |
| Acknowledged commands | 30 | 29 | 30 |
| Planner decisions recorded | 884 | 947 | 837 |
| Mechanically supported shadow inputs | 64 | 947 | 837 |
| Mechanical support rate | 7.24% | 100% | 100% |
| Native commands recorded/joined | 0/0 | 29/29 | 30/30 |
| Exact debit comparisons / mismatches | 0 / 0 | 29 / 0 | 30 / 0 |
| Executed bootstrap source cryptographically captured | No | No | Yes |

Mechanical support is the candidate's numerical input/coverage contract, **not calibrated combat forecast accuracy**. Runs A/B are ineligible for source-bound model validation. Run A failed to observe native calls; its 820 unverified incoming states were rejected rather than filled with zero. Run B fixed stable native hook targets, but its source label still referred to navigation HTML. Both negative observation results are published; they are not discarded setup errors or a treatment cohort.

Only **one independent source-bound match** is available. There is no meaningful win-rate or causal-strength confidence interval. Differences in survival are not evidence of improvement; instrumentation/timing and opponent behavior were not controlled.

## Observation bugs found and corrected

1. `game.modern` is a fresh facade on getter access. Wrapping one facade did not wrap the facade subsequently used by the real engine. The observer now signature-checks the v3 delegation and wraps stable `ae.hc` and `bB.hz.i6` owners, preserving original calls, return values, `this`, exceptions and restoration. Unknown signatures fail before gameplay.
2. The preloader performs a synchronous XHR, patches that response and writes a replacement document. Hashing navigation HTML does not identify the executed original game. The recorder now captures the exact bootstrap XHR response, requires one unambiguous response, verifies its text length against preloader metadata, and hashes it before patching.
3. Missing input support, observer overflow/errors and incomplete physical actor coverage are reported, not guessed. Incoming values are verified against source lookup events at the same native tick/actor/exclusion/value; ambiguous lookup errors censor the field. Numeric zero alone is not proof the lookup succeeded.
4. Command joins require a unique native admission inside the producer's receipt interval with matching target and encoded ratio. Admission tick is observed. **Native acknowledgement tick remains null**; a receipt time or captured old game tick is not relabeled as an ack tick.

Run C bootstrap source SHA-256:

`155a2db1cc6f256317fc6178ce12993c76b51630ba5985be4e9ef1d7cad7fcff`

Its distinct navigation HTML SHA-256:

`8336cb32e748a3771bab6bf1513c32361c971fc21c1675f7666bd72072b3b773`

The difference demonstrates why those identities must remain separate. Prior reports based on a follow-up GET are historical snapshots, not retrospective proof of an executed-source binding. Their bytes and hashes remain unchanged.

## What run C established

- 837/837 captured decisions met numerical/provenance/physical-coverage checks in this one match; no missing decision records were reported.
- 30 submissions, 30 receipts and 30 uniquely joined native calls. Every observed debit matched the existing exact human tax and encoded troop request. No counterfactual command was sent.
- 361 changed **shadow proposals**: 9 capped commands and 352 holds. Only 23 occurred in frames where the baseline actually submitted a command. Repeated decisions are correlated; they are not 361 independent opportunities or 361 real commands.
- 128 non-executable banking-loss advisories. They identify density-hold states coexisting with actual negative territory signals; they do not prescribe safe attacks.
- 439 proposals were baseline-blocked and 37 retained baseline spending. Candidate parameters remain the original unfitted 0.50 base reserve, 0.05 additional-contact term and 60-second scope.
- No observer drops/errors or recorded page errors. Native/isolated input reads remain distinct from a cross-realm atomic state. Lookup matching is tick/actor/value based, not a unique native observation-call ID.

At the first changed proposal on an actual submission (tick 128), balance=516, territory=241, game age=7.023 s, observation age=1.1 ms and baseline ratio=0.123046875. The candidate proposed 0.0771484375 (79 units), request=39, tax=6, debit=45, remaining=471, matching its required reserve=471. The real baseline command still executed. This establishes an exact proposed ledger, **not that the lower spend would survive**.

## Why the baseline lost again

| Elapsed | Tick | Territory | Bank | Rank | Acknowledgements |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 15.279 s | 273 | 515 | 728 | 2 | 17 |
| 30.643 s | 548 | 983 | 4,157 | 199 | 29 |
| 46.059 s | 823 | 691 | 12,177 | 423 | 29 |
| 61.416 s | 1097 | 373 | 11,062 | 426 | 30 |

At maximum land, bank was 4,663 against six neighboring banks 5,455–7,955. Rank collapsed despite an initially high land rank. After the first 29 acknowledgements, only one further command was acknowledged before conquest. The baseline therefore lost economic/contact position before its final collapse; operational debit/dispatch errors are not supported as the explanation in this cohort.

The fixed-density final hold and neutral-first opening remain the source-grounded candidate mechanisms from the earlier report. The new exact inputs show 128 review flags during banking/territory loss. A model still must evaluate whether holding, conserving earlier, attacking a weaker target, or choosing a different spawn is best. No alternative outcome was simulated or observed here. Removing reserve floors or enabling deeper search is not justified.

## Runtime cost and scope limits

Run C peak **serialized retained queue bytes**: planner 253,364; native 6,796. Each queue's configured limit is 4,194,304 bytes / 4,096 events. After final drain both retained zero events/bytes and observers reported inactive.

Recent last-2,048 isolated observer-segment timings: P95 about 0.1 ms, P99 about 0.2 ms, maximum across segments about 0.9 ms. They exclude original kernel calls, do not measure complete frame latency, do not time all native-wrapper work, and are **not Chrome/M4 CPU, battery or peak heap benchmarks**. Instrumentation may alter real timing; no timing-equivalence claim is made.

The production native list still truncates to 32 actors; this match had few contacts and proved complete retained physical coverage. Larger-contact states must be rejected when actors are missing. No expanded risk-only view, ownership reconstruction, directed attack model, force settlement/refund model, valid ETA forecast or transition-error comparison was implemented in this cycle.

Native event coverage here is the human land sender and selected incoming lookups, not a complete ledger of every AI/boat/refund command. Do not use these files as action-conditioned combat episodes without implementing those additional event/source contracts.

## Next proposal — before candidate treatment

1. Reproduce offline shadow counts from the complete published journals; add integrity tests for the source-bound cohort and preserve earlier unsupported attempts.
2. Test fresh facade regeneration, changed signatures, original exceptions, observer overflow and >32 physical contacts. Verify actual orchestrator decisions/command payloads with observation on/off, not only isolated kernel fixtures.
3. Keep overflow rejection conservative and command joins unique. Freeze observer/analyzer/candidate identities per run, and keep unmatched receipts/admissions in the denominator.
4. Add larger source-bound shadow cohorts across Asia/Europe and 64/512 players under the proposal's development/held-out split. Do not calibrate the contact coefficients from this single match.
5. For eventual authorized treatment, place a candidate cap after all ratio normalizers or revalidate after every normalizer; never allow a later clamp to raise a supposedly safe proposal. Pass the required reserve to the native boundary, recompute/reject stale inputs, and prove single-command accounting. Some legal native proposals are below the earlier autoplay 6% preference clamp; stage placement matters.
6. Resolve source-defined incoming semantics and native timing/capture/refund support before outcome rollouts. The banking advisory remains non-executable. Publish coverage-aware negative results and an explicit treatment/promotion gate.

This proposal improves observability and validation quality. **Live candidate policy promotion is not recommended yet.** No candidate-controlled match has been run.

Post-pilot implementation hardening: the lookup index now bounds both keys and distinct values (20,000 total entries), not merely key count. An actor reporting many different values within a stalled tick can no longer grow an unbounded Set. Overflow clears the index and makes further source-dependent proposals unsupported; tests cover this without suppressing known native command records. The pilot collector/analyzer source checkpoint is Git commit `fbee5259fdf005d610c15dadd66a4c8d16a9c57f`; its frozen hashes remain in the manifest. The additional guard reproduces all recorded supported-cohort counts but was not a new live treatment.

## Published evidence and reproduction

[Manifest and complete compressed journals](../evidence/live/2026-10-13-planner-shadow-cycle.json) retain all three pilots, original-file SHA-256 identities, raw reports, every planner/native/shadow event, source-identity eligibility and debit checks. The bundles contain game telemetry from fresh owned profiles, not profiles, tokens, official game HTML or screenshots of private apps. Raw local directories are the UTC IDs listed in that manifest. A/B are explicitly navigation-only, not executed-source eligible.

```sh
npm run audit:live -- 300 Impossible 512 Europe --shadow
node --test tests/unit/planner-observer.test.cjs
npm test
npm run test:live
npm run test:ui
npm run test:ui-state
npm run package
git diff --check
```

`--shadow` installs diagnostic wrappers around the **real installed engine's original calls**, then evaluates proposals in the local Node process. It does not choose game actions, enable frontier/search or add a manifest runtime script. Without the flag, no observer is installed. Unsupported bootstrap response/signature fails closed. The publisher refuses to overwrite evidence; add new cohort files instead.

Validation results and CI are reported with the delivery PR. The old eight candidate properties/5,000 seeded cases and all 80 frozen production outputs remain release gates, not gameplay proof. The next loop should grow source-bound shadow evidence and test an explicitly authorized treatment only after those gates—not claim baseline survival variance as a candidate improvement.

Local validation completed: 129 Node test cases plus existing assertion suites; recording-on fingerprint still `d49794e32d3cc195e357b4edc5d14f0731b24a408c25ab03633a019cf015b0c6`; actual orchestrator decisions/payloads equivalent on/off in four control fixtures; fresh official-source checks (292 combat and 54 economics cases, bridge 9/main hook 29); UI 170 checks/13 image comparisons/17 accessibility scans with zero serious or critical violations; UI-state 6 cases; package closure 40 files; diff check clean. These are local results, not a substitute for current-head GitHub CI.
