# Changelog

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
