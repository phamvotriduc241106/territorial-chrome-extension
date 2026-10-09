# Runtime/status bug scan — v10.3.6

Updated **2026-10-09 11:00:45 EDT**. Isolated local branch:
`codex/debug-runtime-status`, based on `edea02b` (Commander UI branch after
theme PR #3 was merged into it). GitHub main remains `b407960` at this scan.
This debugging changeset has not been pushed, merged or run through GitHub CI.

## Reproduced defects and fixes

Each root cause was reproduced by a failing regression before its fix.

| Defect                                       | Controlled reproduction before fix                                                                                | Correct behavior                                                                                                                                                                                        |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Observation freshness undercounts time       | 2,800 ms observation age + 201 ms snapshot age still reported Playing                                             | 3,001 ms exceeds the 3,000 ms threshold; stale metrics withheld. Displayed telemetry age also includes transit/cache time.                                                                              |
| HUD assumes every returned snapshot is new   | A 4,000 ms old cached snapshot passed age 0; a snapshot 5,000 ms in the future also passed                        | Cached snapshot is Stale; future snapshot is Waiting/blocked; bank unavailable in both cases.                                                                                                           |
| Polling starves valid delayed replies        | 1,100 ms response is superseded by the 1,000 ms poll despite a 1,200 ms response timeout                          | Background polling is single-flight; replies remain usable. Explicit retries still supersede obsolete requests. 2,000 ms timeout/recovery tested separately.                                            |
| Popup status crosses tab/document boundaries | Old tab's Playing state/bank retained after a new tab failed; newer old-tab timestamp rejected valid new-tab data | Tab ID + URL scope the cached status and watermark. Recipient is rechecked after delayed replies **and errors**; new-tab bank 77 replaces old-tab bank 12,400. Same-tab URL changes reset ordering too. |

Changes are presentation/RPC observation only. No policy thresholds, strategy,
spending, native commands, model promotion, permissions or production search
settings changed. Main hook, orchestrator, actuator, controller, source adapter
and all frontier modules are byte-identical to `edea02b`. Kernel, engine adapter
and config differ only in release version/timestamp metadata.

## Validation

Local macOS Chromium **153.0.8010.12**:

- `npm test`: 96 Node-runner cases; core 3,112, compatibility 3,465, hard-mode 39,
  numerical 131 and metadata 7 assertions pass. All **80** production
  decision/spend fingerprints remain unchanged.
- `npm run test:ui-state`: six cases, including the exact additive-age boundary.
- Dedicated controlled-clock browser regressions: 22 assertions include delayed success/error,
  timeout/recovery, switched tabs/documents, invalid snapshots and displayed age.
- `npm run test:ui`: 164 assertions, 13 screenshot comparisons and actual MV3 popup/storage/reload
  smoke tests, font loads, keyboard controls, responsive bounds and HUD checks.
- `npm run test:a11y`: 125 assertions, 17 axe scans; zero critical/serious findings.
- Deliberate white-background regression still fails: 118,111 changed pixels,
  expected exit 1. Metadata stabilization did not disable visual detection.
- `npm run test:live`: fresh official-source SHA-256
  `155a2db1cc6f256317fc6178ce12993c76b51630ba5985be4e9ef1d7cad7fcff`;
  bridge 9, main hook 29, native combat 292 and economics 54 checks pass.
  All 512 ownership totals reconcile; one native attack debits exactly 108.
- Packaging verifies the 40-file runtime closure. No repository tests/research
  or debugging-only code is packaged.

Visual tests assert the **actual** current release labels, temporarily substitute
only version/update strings from `tests/ui-baselines/metadata.json`, capture,
then restore the live labels. The production engine label must still match the
reviewed baseline. This preserves approved macOS/Linux screenshots across
timestamp-only updates without approving new screenshots automatically.
Status, metrics, colors, geometry, controls and the **0.5%** pixel threshold are
not normalized or relaxed. Playwright clocks use isolated contexts so they
cannot freeze the ordinary visual/extension tests.

Linux rendering and GitHub CI have **not** been run for this local branch.
Passing local tests is not a comprehensive security audit, a real-match
win-rate result or a claim of zero remaining bugs.

## Reproduction

```sh
npm ci
npm test
npm run test:ui-state
node tests/ui-browser.cjs --status-regressions
npm run test:ui
npm run test:a11y
npm run test:live
npm run package
```

Local reports are in ignored `scratch/ui-roadmap/qa/`. Screenshot baselines were
not replaced in this debugging changeset. Existing theme/update metadata
history remains in `docs/NEON_THEME.md` and `docs/CHANGELOG.md`.
