# Changelog

## 10.3.5 — 2026-10-08 13:18:01 EDT

- Applies the supplied synthwave visual reference to popup and compact/detailed HUD: sampled navy/cyan/magenta/gold palette, pixel headings, monospace data, static scanlines, neon frames, pixel sword and cyan-glow switches.
- Packages VT323 and Share Tech Mono locally with OFL licenses. No remote font, image, script or added permission. Font-only web-accessible resources support the in-game HUD.
- Keeps runtime-derived status, spawn prerequisites, saved-preference semantics, accessible controls and reduced motion. Reference artwork's misleading ACTIVE/activation/multiplayer/performance claims are not copied.
- Production V2.8.2 remains unchanged. Theme is pushed on isolated `codex/neon-synthwave-theme`, stacked on UI PR #2; no automatic merge.
- macOS and Linux visual baselines use the actual shipped fonts, not a test-only override. Linux candidate CI run 37817795983 passed; all 13 images were individually reviewed before approval. Ordinary comparison retains the unchanged 0.5% threshold.

## 10.3.4 — 2026-10-08 10:53:25 EDT

- Runtime-derived Ready / Confirming / Playing / Paused / Waiting / Stale states replace preference-derived ACTIVE. Shared read-only presentation model powers popup and HUD.
- Compact/detailed/hidden click-through HUD, persistent H cycling, spawn-safe autohide and consolidated tokens/styles. Advanced controls, help and exact update details remain reachable in disclosures.
- Accessible labels, selected-state semantics, visible focus, reduced motion and explicit observed/estimated/unavailable metrics. No invented 60 FPS.
- Transactional preference writes, visible failures/retry, obsolete-response rejection and immediate requested pause independent of storage completion.
- Browser lifecycle/settings/keyboard/geometry/visual regression and axe checks are CI gates. Five-person usability study remains required before claiming the roadmap's 9/10 rating.
- V2.8.2 policy, spending, native source instrumentation and all 80 frozen fingerprints remain unchanged. No experimental policy promotion.

## 10.3.3 — 2026-10-07 20:39:28 EDT

- Production V2.8.2 policy is unchanged. All 80 decision/spend fingerprints remain
  identical; dynamic frontier is a research-only module, not a manifest dependency.
- Added immutable ownership pages, exact source-attributed capture deltas,
  per-update territory reconciliation, stale/partial rejection and byte/event caps.
  Native spatial/debit/credit hooks are opt-in and reversible.
- Passed hostile spatial reconstruction and ordered-cell attribution before
  implementing dynamic transitions; additionally matched 252 original native
  normal/reinforced/support cases.
- Completed a 24-match native Very Hard cohort: 16 development matches with four
  match-grouped validation folds, followed by eight untouched final matches after
  freezing the candidate. Reports retain censored/unsupported cases, identical
  metric support, episode coverage and match-clustered confidence intervals.
- Profiled local system Chrome on Apple M4, including rollout tails, throughput,
  contact extraction, observed JS heap and native instrumentation CPU burden.
- Preserved calibration assumptions, negative/unsupported observations and
  sampling limitations. No win-rate or policy-promotion claim. No Workers, WASM,
  WebGPU, tree-search activation or frontier-driven MPC/UCB commands.

## 10.3.2 — 2026-10-07 10:19:32 EDT

- Engine V2.8.2: action-conditioned frontier telemetry, still opt-in and shadow-only. Production decisions, spending, permissions and tree-search settings are unchanged.
- Native land-front IDs, exact end-of-tick observations, event/state/geometry provenance, force/counterforce progression, reinforcement flags, bank/debt changes and actual return/removal/clear events are recorded. Stop restores the original native functions. Disappearance never establishes conquest or settlement ETA.
- Forecasts at 2/5/10/20 ticks condition on observed forces. Subsequent relevant commands, unsupported existing fronts, reinforcement/refunds, missing observations and telemetry gaps censor the affected intervals. Fresh geometry gates paired origins; all native intervening commands remain in the local ledger.
- Schema2 offline reporting deduplicates exports and reports paired territory/capture/balance/valid-ETA errors by complete match, episode, horizon and reinforcement subset, with censoring and coverage denominators. Legacy schema1 remains descriptive and cannot calibrate parameters.
- Added local official-source recording and whole-match train/held-out parameter-estimation tools. Initial controlled Very Hard recordings estimate cadence, first-batch delay, contact growth, support/refund fractions and a diagnostic ETA baseline; parameters are not applied. See FRONTIER_CALIBRATION.md for evidence and limits.
- Added 15 episode/report/fitting regressions; retained all 80 production decision/spend fingerprints. No Workers, WASM, WebGPU, online games, external telemetry or tree-search activation.

## 10.3.1 — 2026-10-06 23:11:16 EDT

- Engine V2.8.1: first frontier-observability/shadow stage. Production policy and native safety checks are unchanged; recording is disabled by default. No new permissions or external telemetry.
- Modern-v3 ownership extraction decodes native four-byte cell records, reconciles every player's territory, identifies neutral/blocked cells and rejects unsupported/oversized rasters. Local match IDs and monotonic observation versions identify forecasts.
- Compact TypedArray straight-run segments preserve every four-neighbor contact, deduplicate candidate cells, split at corners/owner changes and retain owner-pair graph connectivity. Coverage caps fail closed, not by silently dropping borders.
- An explicit experimental transition reuses command/economy arithmetic with incremental source-cost combat batches. Original native normal-batch routines match in 292 controlled differential cases. Contact evolution, reinforcement, cadence and refunds remain uncalibrated estimates.
- Bounded local shadow logs preserve paired 10-tick forecasts, exact-tick labels, censored observations, attack progress and bridge-issued commands. Offline reporting deduplicates overlapping exports and reports MAE/RMSE/P95 by complete match; policy promotion is always disabled.
- Added 12 regression tests, 10,000 random topology maps, 10,000 combat-bound cases and 3 browser checks. Live ownership reconciled all 512 player slots on a 262,144-cell local Very Hard map. No full-match strength or prediction-accuracy improvement is claimed.
- Workers, adaptive curvature/chokepoint fitting, probabilistic ETA/opponents, calibrated replay and deeper search are deferred until telemetry demonstrates their value. See FRONTIER_MODEL.md.

## 10.3.0 — 2026-10-04 20:17:35 EDT

- Engine V2.8: MPC and the endgame bandit share one aggregate transition model, exact slider/debit arithmetic and source-clock economics. Modern-v3 settings, global troop totals and outgoing fronts cross the native bridge into planning.
- Differential-tested native interest and income in 54 controlled official-source cases. Combat, border evolution, opponent policy and settlement latency remain estimates.
- Corrected global coalition sizing and KKT budget rounding; unified both allocator entrypoints and explicitly reported infeasible minimums. Added 5,000 seeded allocation cases and 200 small exhaustive integer-utility comparisons.
- Fixed weighted particle confidence intervals; exposed lognormal mean separately while preserving the median-based estimate. Fixed experimental tree state propagation, duplicate-action rollout and depth accounting; tree search remains disabled and never called by decide().
- Labelled endgame utility honestly, gated hold vetoes on action coverage, and skipped lookahead when it cannot change policy. Added 13 mathematics regression tests, bridge-to-planner input checks and an intentional new behavior fingerprint.
- 400 paired approximate-simulator games against 188b1bf tied at 177 wins each. No improved official Hard/Very Hard win rate is claimed. See PLANNING_MODEL.md and VALIDATION.md.

## 10.2.5 — 2026-10-04 11:29:34 EDT

- Added bounded per-world CPU profiling for actual kernel, state, vision, grid, border and command calls. Removed proxy telemetry that incorrectly inferred algorithm executions.
- Added an internal planning gate: unchanged snapshots are skipped, with immediate reevaluation for new state/control/sequence changes and a 100 ms opening/safety backstop. Native target/debit/reserve checks remain synchronous.
- Reused pure coalition evaluation once per decision and cached proxy wrappers.
- Moved vision-grid updates to typed arrays with lazy compatibility cell views; added bounded Float32 pooling and reusable spatial-query output.
- Added CPU regressions and a fixed-fixture baseline benchmark. No workers, GPU, WASM or real-game win-rate claim; see CPU_OPTIMIZATION.md.

## Test tooling — 2026-10-04 11:09:21 EDT

- Added a prospective 20-match Very Hard protocol, frozen release/settings fingerprints, screenshot-integrity checks, recoverable match records and Wilson confidence-interval reporting.
- Added adversarial protocol unit tests to `npm test`. No engine changes or actual 20-match results are claimed.

## 10.2.4 — 2026-10-04 10:50:25 EDT

- Moved the authoritative V2.7 engine into `content/`; moved two unshipped kernels into `experiments/legacy/`. Updated both manifest worlds, tests and research runners.
- Separated archived audit/product/manuscript reports from current architecture and measured validation documentation. Preserved historical content with explicit caveats.
- Added portable npm commands, pinned Playwright, lockfile-backed development setup and read-only GitHub CI.
- Added manifest/runtime/import and release-metadata contracts; separated browser-independent tests from browser harnesses.
- Added allowlisted extension packaging with per-file SHA-256 hashes, excluding research, reports, credentials and personal files.
- Strategy behavior is unchanged from 10.2.3. No new real-game performance claim.

## 10.2.3 — 2026-10-04 10:36:33 EDT

- Added lobby-wide duel detection, capital-preserving combat policy, neutral-first intent and incoming-aware target scoring.
- Preserved opening time and defensive context through the command boundary.
- Measured 353/800 versus 367/800 wins in approximate paired simulations; official Hard-mode win rate remains unmeasured.
