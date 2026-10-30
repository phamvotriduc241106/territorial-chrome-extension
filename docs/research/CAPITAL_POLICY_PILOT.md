# Capital-v1 — live single-player gameplay candidate

Release **10.3.9**, default kernel **V2.8.2**, updated **2026-10-14 19:08:36 EDT**. Starting main `fde124ed92e35a24d198c247116f9052eb355b0d`. The candidate is **default off** and requires explicit per-match activation. This is an actual command-controlling experiment, not another offline action advisory.

## Implemented behavior

`shared/capital-policy.js` is shared by the isolated orchestrator and native command boundary. The existing kernel remains independently available and its 80 frozen decision/spend outputs are unchanged. The candidate modifies the orchestration layer only when explicitly enabled.

- During land expansion or combat, keep at least `max(existing production reserve, contact reserve)` after a command. Contact reserve is `ceil(largest adjacent effective bank × min(1, 0.50 + 0.05 × (contacts − 1)))`. Busy neighbors count toward exposure. This restriction continues after the opening; unlike the old offline opening-only candidate, it does not expire after 60 seconds.
- With **no neutral border**, a density-bank hold can become a selective PRESSURE decision when our bank is at least **1.5 ×** an available land target's effective bank, territory is not shrinking, and there is no observed incoming adjacent force. Rank targets deterministically by effective bank, then ID. The unchanged production spend planner must still approve the new action. No defense-wall exception is introduced.
- Apply the reserve cap **after** manual/preference ratio normalization and `maxSafeRatio`, using exact native integer command units and human debit. A hold incurs no tax. Candidate mode pauses on manual-slider settings instead of silently overriding them.

The coefficients and advantage threshold are **unfitted heuristics**, not an optimal-control solution, combat forecast or proof of safety from all opponent actions. The four-game pilot freezes them before testing; there is no tuning against its results.

## Native execution contract

Activation requires the mapped `live-modern-v3` source contract and native single-player flag. It is not persisted in extension settings, never enables multiplayer experiments, and is bound to the current native match identity. A new match revokes native activation. Candidate mode never enters the vision/click fallback.

Each command carries policy/match/state/tick provenance, encoded-unit ceiling, approved debit ceiling and required reserve. The native side checks the current single-player/source state, complete physical-neighbor coverage, known incoming-force observations, match identity, version ordering and tick lag (at most **12** ticks). The isolated planner also rejects observation ages outside **0–700 ms**.

The native boundary recomputes contact reserve against fresh opponents and retains the production reserve, meaningful-force floor, target availability, front cap, action controls, arming and single-flight/spend-lock gates. Increased cost or changed state can reject an otherwise planned command. Neither the caller nor a later slider clamp may increase the approved debit. The final sender rechecks bank/reserve/meaningful force after ratio setting. Successful receipts include native-validated policy, tick, reserve, debit ceiling and observed debit.

`incoming(enemy, me)` is the current source's directed enemy→player front-force lookup. Unknown/failed observations get an explicit `incomingKnown:false` and cannot authorize a candidate action. A post-pilot hardening also requires explicit opponent `balanceKnown:true`; a failed bank lookup cannot masquerade as a weak zero-bank target. The ordinary baseline retains its prior fallback behavior. Coverage remains limited to all physical adjacent actors; there is no complete naval/non-adjacent threat model. More than 32 physical opponents cannot be represented by the current native list and must cause candidate rejection.

## Frozen development pilot

[Prospective plan](../evidence/live/2026-10-14-capital-pilot-plan.json) records release, policy hash, source hash, defaults, cutoff and all four assignments before testing. Runtime checkpoint: **`f6b0071`**. Real visible system Chrome, owned temporary profiles, installed extension, official https://territorial.io/, normal spawn controls, **Impossible/native 5**, **512 players**, normal scheduler, no manual combat actions or edited balances. Asia uses (650,480), Europe (700,400), at 1280×900.

Order: baseline Asia, candidate Asia, candidate Europe, baseline Europe. This is a counterbalanced **development/safety screen**, not randomized, not paired by proven bot placement, and not untouched final validation. One match per arm/map cannot establish a strength improvement. Setup errors, losses and cutoffs must all be retained. Last survivor alone never means an official win.

### Completed outcomes — all four assignments retained

[Complete source-bound evidence](../evidence/live/2026-10-14-capital-pilot-evidence.json) and [per-match summary](../evidence/live/2026-10-14-capital-pilot-summary.json) preserve the prospective order, full compressed reports/planner/native journals, original-file hashes and treatment identity. All four games completed as native-confirmed losses; there were **0 setup errors, 0 cutoffs and 0 official wins**. Recorded October 14, 2026, approximately 19:12–19:18 EDT / 23:12–23:18 UTC, Chrome **155.0.8059.40**.

| Map / measurement | Baseline | Capital-v1 candidate |
| --- | ---: | ---: |
| Asia sampled time to loss | 33.781 s | 89.090 s |
| Asia maximum sampled territory | 596 | 535 |
| Asia maximum sampled bank | 2,229 | 52,193 |
| Asia acknowledged commands / hostile commands | 22 / 0 | 21 / 7 |
| Europe sampled time to loss | 61.453 s | 172.905 s |
| Europe maximum sampled territory | 1,034 | 1,160 |
| Europe maximum sampled bank | 11,898 | 141,031 |
| Europe acknowledged commands / hostile commands | 30 / 1 | 27 / 6 |
| Completed matches / losses | 2 / 2 | 2 / 2 |
| Native debit cases / mismatches | 52 / 0 | 48 / 0 |

These are observed outcomes from **one match per arm/map**, not a causal estimate or a general survival/win-rate improvement. Sampling is approximately one second; decimal durations describe the first sampled terminal observation, not exact native death-event timing. Whole-match sample size is four, not 4,305 independent decision frames. Geographic opponent placement is not frozen; ordering is not randomized. No strength confidence interval or promotion recommendation is justified.

### Proof that the candidate actually controlled commands

| Treatment accounting | Asia | Europe |
| --- | ---: | ---: |
| Explicit candidate activation / source-bound match | 1 / 1 | 1 / 1 |
| Captured candidate decision frames | 1,058 | 2,030 |
| Capped frames / reserve-hold frames | 64 / 618 | 75 / 1,395 |
| Early-opportunity decision changes | 153 | 126 |
| Tagged submissions / successful validated receipts | 23 / 21 | 27 / 27 |
| Admissions with a changed cap or decision | 11 | 13 |
| Admitted early-opportunity attacks | 4 | 0 |
| Native reserve violations / debit-ceiling violations | 0 / 0 | 0 / 0 |
| Fresh-budget expiry rejections | 2 | 0 |

All **48** candidate admissions carry native-validated policy/match/reserve/debit metadata. All **100** actual native commands across both arms match exact human arithmetic; every successful command uniquely joined a receipt. Failed expiry checks reached no native sender and caused no debit. Repeated decisions/holds are descriptive correlated frames, not independent opportunities. The Europe selector proposed early opportunities, but none of those particular decisions reached admission; later baseline-selected hostile actions still executed with candidate reserve caps.

### Why the candidate still lost

The observed bank deficit was reduced or delayed, but capital alone did not secure a viable territorial economy. Asia's smaller maximum territory (535 versus 596) illustrates the land-versus-bank trade-off; the experiment does not establish that more conservation is always better.

| Candidate timeline | Elapsed | Land | Bank | Remaining players | Acknowledgements |
| --- | ---: | ---: | ---: | ---: | ---: |
| Asia | 30.731 s | 494 | 6,284 | 512 | 14 |
| Asia | 61.502 s | 471 | 43,894 | 404 | 20 |
| Asia | 89.090 s | 0 | 0 | 291 | 21 |
| Europe | 30.639 s | 790 | 5,389 | 512 | 19 |
| Europe | 61.419 s | 833 | 42,864 | 434 | 22 |
| Europe | 92.190 s | 1,064 | 115,213 | 319 | 25 |
| Europe | 122.883 s | 1,008 | 123,403 | 236 | 27 |
| Europe | 153.533 s | 707 | 90,014 | 175 | 27 |
| Europe | 172.905 s | 0 | 0 | 149 | 27 |

Europe stopped increasing its command count at 27, then lost territory while opponents consolidated. The fixed largest-neighbor reserve and unchanged defense wall can still block action during decline. This is an observed stall, not proof that bypassing either constraint would win. Large bank peaks are not a substitute for sustainable territory, good target outcomes or avoiding encirclement.

There is no complete action-conditioned capture/refund ledger in this gameplay recorder. Hostile commands cannot be assigned exact conquered cells or net combat ROI merely from aggregate territory changes. Therefore this pilot does **not** prove the seven/six hostile attacks were tactically valuable or explain every individual opponent decision. The next measurement should connect actual admitted attacks to native capture/settlement episodes, including intervening actions and censoring.

### Coverage issue found and corrected after the freeze

The candidate correctly raised `minRemaining` and enforced actual debit/reserve, but its **reported** final plan initially retained the old, looser `maxSpendTotal`. The old offline opening-shadow validator rejected **128/1,058 Asia frames** and **147/2,030 Europe frames** as `invalid-baseline-budget`. Original mechanical shadow coverage was **87.90% / 92.76%**, versus baseline **100% / 100%**. All four losses remain in the denominator; no difficult match or rejected frame is discarded or relabeled.

The final-plan summary now reduces `maxSpendTotal` to at most `balance − requiredReserve`. This is a budget-report consistency correction, not a change to the native commands already tested: direct old/new orchestrator checks produced identical command payloads in **16** contact/bank/action fixtures. The raw frozen records and their lower shadow coverage are preserved; they are not retrospectively repaired to claim 100% coverage. Tests verify the corrected reporting contract separately. A fresh future cohort must identify its new release hash.

The published pilot is reproducible at checkpoint `f6b0071`; final repository code includes the post-pilot summary correction and a fail-closed guard for unknown opponent bank lookups. The latter adds an explicit observation-validity flag and cannot increase spending or create opportunities from missing data. Final native tests include that missing-bank case; this is not misrepresented as another live treatment. No further strategic coefficients were selected from the four games. The default-off controller remains a development candidate, not a policy promotion.

A separate [final-runtime smoke record](../evidence/live/2026-10-14-capital-final-smoke.json), after hardening checkpoint `df84fed`, ran Asia/512 Impossible with a **10-second cutoff**. It produced **8** native-validated candidate admissions and zero recorded reserve/debit violations; actual adjacent banks were explicitly known. Its outcome is **time-censored**, not a win or a fifth completed comparison game.

That smoke also exposed a second reporting assumption: the old shadow analyzer required final `maxSpendTotal` to equal the raw planner limit, even when the candidate legitimately lowered it. The original **59 supported / 69 rejected** frames are preserved. The corrected read-only analyzer checks the captured full final plan against the raw upper budget and reserve, rather than inventing missing values; [separately identified corrected replay](../evidence/live/2026-10-14-capital-final-smoke-analysis.json) supports **128/128** frames and joins all eight commands. This is a telemetry fix, not another gameplay intervention or a retrospective repair of the original records. Earlier pilot budget-summary rejections remain unchanged. Tests reproduce both original and corrected results.

### Next proposal and decision gate

1. Keep capital-v1 **off by default**. Longer observed survival with two losses per arm does not establish winning strength.
2. Freeze another representative development cohort before changing parameters; include alternate spawn exposures and player counts, track the cost of undersized territory, and retain errors/unsupported observations. Do not tune against the final held-out matches.
3. Record per-attack native capture/settlement and directed pressure. Compare bank preserved against land/income sacrificed and actual hostile-command return, not just bank peaks or decision scores.
4. Study stalled-action windows with complete contact geometry before designing any reserve/defense-wall exception. A largest-bank heuristic can be overconservative, but reducing it without outcome evidence is not an engineering proof.
5. Require robust whole-match, coverage-aware improvements and measured Chrome runtime cost before recommending production activation. No Workers, WASM, WebGPU or frontier/tree-search command integration is proposed here.

## Use and reproduction

Normal extension installation keeps the original policy. For the candidate's real single-player driver:

```sh
npm run audit:live -- 300 Impossible 512 Asia --policy=capital-v1
npm run audit:live -- 300 Impossible 512 Europe --shadow
```

The first command activates capital-v1 before spawn, records real original planner calls, tagged submissions, native admissions and acknowledgements, then closes its owned Chrome profile at termination/cutoff. The second uses the unchanged baseline. Do not label a candidate as active merely from a setting: verify tagged submissions and successful native-validated receipts in the report.

Advanced manual activation is available in the **extension's isolated DevTools execution context**, after loading a single-player scenario and before confirming spawn:

```js
await window.TerritorialEngineV5.internal.refresh();
await window.TerritorialEngineV5.setExperimentalPolicy('capital-v1');
// Reversible; does not reset balances or issue a command:
await window.TerritorialEngineV5.setExperimentalPolicy('off');
```

The HUD hint labels the active experiment; `getStatus().experimentalPolicy` and MAIN native state expose the active mode separately from the default V2.8.2 engine label. It must be explicitly activated again for another match. No popup preference or automatic rollout is added.

## Regression and historical research integrity

Candidate tests cover exact caps, immutable inputs, controls, stale/partial/unknown observations, no vision fallback and **4,000 seeded accounting cases**. The final actual native-boundary browser harness covers **22** checks, including one native admission, exact 917 debit, reserve retention, duplicate/spend-lock rejection, old/future/mismatched tags, fresh increased reserve, unknown incoming/bank, online mode, alternate routes and new-match revocation. The initial pilot checkpoint had 21 of those checks. Existing 5,000 opening and 2,000 offline banking accounting cases remain independent tests.

The old dynamic-frontier experiment froze `content/main-hook.js`. Its published hashes are **not changed** to accommodate this new release. `docs/evidence/live/frontier-study-original-pipeline.json.gz` preserves all seven original pipeline sources from starting main; tests verify every original SHA against the old published freeze. Strict current-check mode still rejects this changed native pipeline. Historical model results are not silently treated as measurements of this new controller.

Local verification: **147 Node tests**, 80/80 original kernel fingerprints, browser bridge/main hook **9/29** checks plus **22** final candidate native checks; UI **170** checks, **13** image comparisons, **17** accessibility scans with zero serious/critical issues; UI-state **6** cases; fresh official-source **292** combat and **54** economics cases plus exact 102-sent/108-debit directional lookup; spatial **4,290** reconciliations, **143,589** cell writes and **397** hostile batches; **41** packaged runtime files. Current-head GitHub CI is reported by the delivery PR.

Largest serialized recording queues in this pilot: planner **312,480 B**, native **9,247 B**, both below the **4,194,304 B / 4,096 event** per-queue limits, with zero dropped/missing decisions and no recorded page errors. Offline publication permits at most 250,000 lookup entries; live rolling analysis retains the original 20,000-entry bound. No Chrome CPU, peak heap, complete-frame latency or candidate-throughput improvement was measured. Those remain promotion gates, not claims inferred from observer segment timings.

Original executed bootstrap source SHA-256 for all four matches and fresh source tests:

`155a2db1cc6f256317fc6178ce12993c76b51630ba5985be4e9ef1d7cad7fcff`

Full release/kernel/policy/observer hashes and unchanged defaults are in the prospective plan and raw reports. Evidence contains only extension/game telemetry and the extension's archived pipeline source, not personal Chrome profiles, credentials or downloaded official game HTML. The publisher refuses to overwrite existing artifacts. The test suite replays the complete published journals without requiring ignored local recordings.

No Workers, WASM, WebGPU, tree-search activation, frontier-driven commands or speculative winning guarantee is part of this release. Candidate promotion requires further representative development/held-out matches and prospective whole-match comparisons, with coverage and runtime cost measured separately from correlated frame counts.
