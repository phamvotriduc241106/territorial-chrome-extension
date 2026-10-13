# Impossible — actual installed-extension diagnostic

Analysis updated October 13, 2026. **Two completed Impossible matches, two losses.** This is a diagnostic cohort, not an estimated general win rate. The extension remains v10.3.8 / V2.8.2; this changes research tooling/documentation, not production policy.

Recorded October 13, 2026, 12:53:40–12:55:36 EDT. Production policy unchanged.

## Identity and protocol

- Extension v10.3.8, production V2.8.2; local main commit `4ff4d99`.
- Real visible Google Chrome 155.0.8059.40, fresh owned temporary profile, actual unpacked extension installed through browser-level CDP.
- Official https://territorial.io/ Custom Scenario, **Impossible UI label**, native difficulty **5**, 64 players. Hook policy difficulty is a separate field.
- Procedural Island index 2, seed 14071, 1280×900 viewport, normal two-click spawn at (550,160). Bot placements are not frozen.
- No manual combat commands, balance edits, scheduler acceleration, tree search or frontier-policy activation.
- Source SHA-256: `155a2db1cc6f256317fc6178ce12993c76b51630ba5985be4e9ef1d7cad7fcff`.
- Release SHA-256: `8bc4a083709f5f01bc0b0418c131f3a98e3f8259b673319a95ef2bf83d08b311`.
- Engine SHA-256: `8331d51ebfbc55bbf91efe4ca0d543231a01be75d3844cdee2d9ab5f61c107c7`.

## Result

**Confirmed loss**: native alive=false, territory=0, balance=0 at tick 2069; actual finish screenshot displays DEFEAT and conquest by Kingdom of Poland. Elapsed time to sampled termination: **115.824 seconds**, with one-second polling uncertainty. Five-minute limit was not reached.

| Measurement | Value |
| --- | ---: |
| Recorded observations | 116 |
| Maximum territory | 1,669 cells |
| Acknowledged commands | 37 |
| Maximum observed command-failure streak | 0 |
| Recorded page errors | 0 |
| hard-build-combat-bank sampled decisions | 78/116 (67.24%) |
| hard-neutral-first sampled decisions | 33 |
| pressure-adj sampled decisions | 3 |

Sampled reasons are correlated snapshots, not counts of unique commands. Zero observed failure streak does not prove every dispatch was flawless between observations. No statistical win-rate claim follows from one match.

| Elapsed seconds | Territory | Bank | Territory rank | Acknowledged commands |
| ---: | ---: | ---: | ---: | ---: |
| 15.097 | 423 | 1,027 | 5 | 16 |
| 30.204 | 1,206 | 4,075 | 15 | 30 |
| 45.315 | 1,180 | 19,471 | 41 | 31 |
| 60.424 | 1,180 | 60,469 | 46 | 31 |
| 68.479 | 1,669 | 59,691 | 33 | 34 |
| 90.647 | 1,175 | 62,302 | 41 | 36 |
| 105.752 | 511 | 16,175 | 38 | 37 |
| 115.824 | 0 | 0 | 36 | 37 |

Pre-confirmation checkpoint: territory=0, pendingSpawn=true, armed=false and commands=0. Spawn fix remains effective in this run.

## Assessment

The native command path worked, but the strategy lost economic position early: territory rank dropped from 5 to 46 while command count stayed at 31 between 45 and 60 seconds. At peak territory, all three recorded neighboring banks exceeded ours (67,457, 87,918, 97,408 versus 59,691). The next recorded territory loss occurred at 69.486 seconds. This is a contested-combat failure, not the disconnected-neutral naval limitation from the previous Very Hard diagnostic.

Source inspection identifies a concrete candidate for evaluation: the final hard-policy override holds when density is below `combatBankTarget=0.55`, the target is not classified crushable, and the duel exception does not apply. That override does not explicitly check territory shrink or trend. At tick 918 it held with bank 30,873 versus focused enemy 11,778 (2.62×), density 0.262, fight score 305 and hold score −58. The score comparison is evidence of an override, not proof attacking would have succeeded against all neighbors.

Prioritize threat/territory-loss-aware banking and opportunity-cost validation; evaluate early capture windows and multi-neighbor reserve constraints jointly. Do not simply lower reserves or infer an optimal threshold from this match. Test candidates against whole held-out Impossible matches with varying spawn positions and borders. No production-policy change is made here.

## Reproduction and evidence

Recorder now accepts an explicit difficulty argument:

```sh
npm run audit:live -- 300 Impossible
```

Raw report and screenshots remain local under ignored `scratch/live-chrome-audit/2026-10-13T16-53-37-510Z/`. The report includes all 116 observations, source/release identities, decisions, budgets, native front state and actual loss evidence. `start.png` is a black compositor capture and cannot substantiate visual state; `finish.png` clearly shows the defeat. Native observations establish startup and progression independently.

Recorder regression tests: 3/3 passed. Only the diagnostic tool was extended; extension runtime files and policy were unchanged. Remembered workflow was saved separately at the user's explicit request.

## Repeat: Europe, 512 players

October 13, 2026, 13:00:34–13:01:19 EDT. Actual Chrome 155.0.8059.40; unchanged v10.3.8/V2.8.2 and source hash above. Native configuration confirms mapType=1 (realistic), mapRealisticIndex=0 (Europe), difficulty=5 (Impossible), playerCount=512; the first native sample confirms **512 alive players**. The stored procedural index/seed are inactive settings, not a geographic-map random seed. Spawn was confirmed through normal UI at (700,400).

**Confirmed loss after 44.451 seconds** (one-second polling). Native alive=false, territory=0 and balance=0 at tick 795; finish screenshot displays DEFEAT and conquest by Gurunsi. No manual combat commands or production-policy edits.

| Diagnostic | Island / 64 players | Europe / 512 players |
| --- | ---: | ---: |
| Difficulty native value | 5 | 5 |
| Survival seconds to sampled loss | 115.824 | 44.451 |
| Peak territory cells | 1,669 | 965 |
| Commands acknowledged | 37 | 28 |
| Maximum observed failure streak | 0 | 0 |
| Recorded observations | 116 | 45 |

These are **not paired trials**: map, spawn density and random bot placements differ. The table does not isolate the effect of player count or support a win-rate estimate.

At peak land (27.257 seconds), bank was 2,903, versus neighboring banks 3,742–5,908 across six contacts. Bank/soft-cap density was 0.0301. Command count then remained at 28 until defeat. Sixteen sampled decisions were hard-build-combat-bank, 28 were hard-neutral-first, and none were sampled fight decisions. At 40.410 seconds, our bank was 2,959 versus neighbor banks up to 17,843, territory 397 and rank 496.

Diagnosis hypothesis: neutral expansion creates exposed frontage and soft-cap capacity faster than the bank can defend against Impossible bots; the later fixed-density banking gate cannot recover the competitive deficit before conquest. Evaluate contact-aware opening allocation and threat/territory-loss-aware banking jointly, rather than removing reserve protections. This run cannot prove an alternative attack or spawn would have won.

Raw evidence: ignored `scratch/live-chrome-audit/2026-10-13T17-00-32-007Z/`, including report.json, finish.png and live-progress.ndjson. A separate attempt at `2026-10-13T16-59-27-099Z` failed to select the map **before spawning**; retained as setup error, not a completed combat match. Selection now uses the unique map-name locator rather than assuming the selected-circle label is stable.

Reproduce: `npm run audit:live -- 300 Impossible 512 Europe` (or substitute `Asia`). Recorder now supports the two geographic maps, records native map settings and writes incremental observations plus 30-sample console checkpoints. Recorder tests remained 3/3 passing; git diff check passed. No extension runtime changes or policy promotion.

## Why we lost: evidence-ranked diagnosis

### 1. Opening bank/contact imbalance — strongest in the 512-player run

At 10.088 seconds in Europe, expansion had produced 348 cells but bank was only 415; three visible neighboring banks were 838–1,235. At 27.257 seconds, six visible neighbors had 3,742–5,908 troops versus our 2,903. Despite initial land rank 1, bank strength lagged before the collapse. Territory growth alone was therefore a misleading success signal.

The subsequent density goal was `0.55 × softCap`, not a deadline-aware defensive objective. At peak territory, softCap=96,500, so the target was **53,075 troops**, **18.28×** the observed bank. Density was 0.0301, only 5.47% of that target. This arithmetic does not prove that a lower density target is optimal; it shows that waiting for the existing target was a poor recovery mechanism within the observed conquest interval. Twenty-eight commands were acknowledged, then the count stayed unchanged through death.

Hypothesis: opening spend/territory expansion exposes multiple contacts faster than sustainable capital growth can defend them. Required validation: compare opening schedules with native interest/territory income, exact command tax, first-contact timing and neighbor strength. Do not assume a summed neighbor bank is a simultaneous incoming attack.

### 2. Final hard-policy override suppresses other action preferences

In `content/engine-core-v2-advanced.js`, `decide` computes scores and defensive context, but its final hard-mode block unconditionally prefers adjacent neutral land. Otherwise, for a non-crushable enemy below density 0.55, it assigns hold except for the specified duel condition. That block has no explicit shrink/trend/threat exception. The core's crush test includes `floor(bank/8) > enemyBalance`, so a 2.62× bank advantage is **not** the special crush classification.

At Island tick 918, bank 30,873 versus focused enemy 11,778 (2.62×), fight score 305 and hold score −58 still produced hard-build-combat-bank. At tick 1224, the bot held with 59,691 troops/1,669 land. The next observation lost 78 cells and still held. Near death, territory and balance were falling while the same reason persisted. This verifies the override behavior and its coexistence with decline; it does **not** establish that attacking would have won or even been safe against other neighbors.

The allocation layer separately applies fortification and crush-immunity floors. In late Island samples, bank was below the recorded reserve floor and maximum spend was zero. Removing those floors would not repair the earlier deficit and could worsen collapse. A correct candidate must coordinate action selection and feasible spending rather than bypass conservation/safety.

### 3. Earlier economic position was already deteriorating

Island rank moved from 5 at 15.097 seconds to 46 at 60.424 seconds. Between 45.315 and 60.424 seconds, bank rose from 19,471 to 60,469 while territory stayed 1,180 and acknowledgements stayed 31. Competitors expanded during our waiting period. At peak territory, neighboring banks all exceeded ours. Europe fell from rank 12 at 20.187 seconds to rank 320 at 30.289 seconds, then rank 496 at 40.410 seconds.

These trajectories suggest opportunity-cost and contact-risk errors, not simply a missing last-second counterattack. Spawn positions and random bot placements were not controlled, so poor spawn geometry remains a competing explanation. Naval reachability did not cause these defeats: both were conquered during contested land combat.

### 4. What the recordings cannot establish

- Zero sampled command-failure streak and zero recorded page errors are evidence of operational reliability, not proof that no between-sample failure occurred.
- The trace does not contain complete planner inputs, directed incoming attacks against us, exact per-command acknowledgements/targets, or all capture cells. Do not infer these from enemy `incoming` fields or stale decision labels.
- One-second native and isolated-world reads are sequential, not atomic. Commands can occur between observations; a sampled hold next to a command-count increase does not mean a hold dispatched an attack.
- Two different maps/player counts cannot isolate difficulty, spawn, player-count or policy effects. No counterfactual rollout or prospective win-rate improvement is proved.

## Recommended next implementation experiment — not enabled here

| Priority | Candidate | Required checks |
| --- | --- | --- |
| 1 | Contact-aware opening allocation; explicit cost of exposing another neighbor | Exact income/tax/debit, reserve feasibility, no double debit; compare whole matches |
| 2 | Threat/territory-loss-aware banking override | Preserve crush barriers; avoid vetoing safe defensive choices solely on soft-cap density |
| 3 | Opportunity-window capture with multi-neighbor reserve budget | Check projected enemy strength, contact geometry, repayment of capture cost and worst-case defense |
| 4 | Spawn-risk evaluation and direction-specific recording | Record actual planner inputs, command ledger and directed attacks before causal replay |

Freeze candidate settings before a final held-out set. Evaluate geographically diverse Impossible matches at both 64 and 512 players, retaining losses, errors and timeouts. Use match-clustered uncertainty, survival, economic position, valid coverage and official completion; do not treat ticks as independent games. More frontier search, Workers, WASM and WebGPU are not justified by these losses.

## Published evidence and reproducibility

[Projected observations](live-audits/2026-10-13-impossible-evidence.json) include all 161 sampled states, source/release identities, native configuration, decision/budget reasons, neighbor banks, exact observed ticks, timestamps and SHA-256 hashes of the original local reports. They are an explicitly labeled projection, not a complete replay or command ledger. Raw screenshots and full reports remain local in the two ignored directories above; no personal browser profile or account data is published.

Reproduction commands:

```sh
npm run audit:live -- 300 Impossible 64
npm run audit:live -- 300 Impossible 512 Europe
node --test tests/live-chrome-audit.test.cjs tests/impossible-audit-evidence.test.cjs
npm test
git diff --check
```

Local assertions and GitHub CI validate code/evidence consistency, not live winning strength. Final CI status is available in the associated PR checks.
