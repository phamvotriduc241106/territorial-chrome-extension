# Changelog

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
