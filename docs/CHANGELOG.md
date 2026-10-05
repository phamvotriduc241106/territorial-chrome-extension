# Changelog

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
