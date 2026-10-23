# MCP Impossible loop — October 22, 2026 EDT

The live loop ran. The source integration blocker was repaired; the engine then
played four official Impossible/512 comparison games through MCP. **All four
lost.** The existing capital-v1 treatment remains default off. This establishes
restored integration and observed negative gameplay results, not improved strength.

## Observed results

| Map | Policy | Official result | Observed time to loss | Peak observed cells | Captured native commands |
| --- | --- | --- | ---: | ---: | ---: |
| Europe | V2.8.2 baseline | Loss | 76.270 s | 1,037 | 30 |
| Europe | Capital-v1 | Loss | 84.386 s | 832 | 20 |
| Asia | V2.8.2 baseline | Loss | 33.847 s | 599 | 22 |
| Asia | Capital-v1 | Loss | 89.717 s | 553 | 21 |

A separate final-build Europe smoke run was **censored after 10.185 seconds**:
322 peak observed cells and 9 native commands. It proves that the final installed
build starts and actuates; it is excluded from the four completed comparisons.

Loss was confirmed by the native not-alive flag and zero territory at a positive
native tick. Times include the roughly one-second sampling delay; they are not
exact elimination times. Peak territory is a sampled lower bound.

## Actual MCP execution and source identity

- Controller: `mcp__playwright.browser_run_code_unsafe`, using a dedicated visible
  persistent system Chrome 155.0.8059.85 context launched through the browser type
  supplied by MCP. The MCP server's blank isolated page was the control handle;
  the owned Chrome page was used for the game. This was not a CLI-only recording.
- Chrome used a newly created temporary profile. No personal browser session,
  cookies or saved profile was used. The actual unpacked extension was installed
  with `Extensions.loadUnpacked`; no production extension scripts were pasted
  into the game. Observers were installed separately and remained non-actuating.
- Native UI: Custom Scenario, 512 players, Realistic Map Europe/Asia, **Impossible**.
  The native setting was `botDifficultyValue=5`; the hook's own policy difficulty
  was not used as evidence of the selected game difficulty.
- Spawn: normal UI clicks at Europe `(700,400)` or Asia `(650,480)`, viewport
  1280×900. Positive fresh native territory was required before recording play.
  The actual isolated extension orchestrator supplied every combat command.
- Source SHA-256: `0c117ef77ac132103a8ab9db78e8027c0ce1a93e4dc8c73811a09d04d421e9b6`.
  Each attempt captured the **preloader's actual synchronous XHR response**, not
  a substitute later fetch. All five executed responses had this hash.
- No manual combat commands, changed banks/territories, accelerated native ticks,
  multiplayer matches or fabricated terminal results were used.

The comparison sequence was assigned one development attempt at a time:
Europe baseline, Europe treatment, Asia baseline, Asia treatment. It was not a
preregistered randomized or held-out cohort. Map seed 14071 remained an inactive
procedural setting on geographic maps; it does not establish paired opponent
placements. Survival differences cannot be attributed causally to the treatment.

## Repair and independent verification

Before repair, the installed 10.3.10 extension reported `contract-unmapped`,
`contract=unmapped`, `ready=false` on this source. That was a setup failure and
was not counted as a played loss. Short symbols from the old v3 family were
renamed/reordered. Matching normalized native function bodies found 2,252 unique
unchanged functions, supporting explicit v4 bindings; symbol similarity alone
was not used as permission to actuate.

Release **10.3.11** adds the structurally checked `live-modern-v4` adapter, native
state/economy/ownership/front paths, mutable combat observers and exact delegation
checks. A dedicated `matchToken()` reads the native frontier-array replacement so
per-match experiment authority resets correctly. Old private names are not
written onto native objects. Legacy adapters remain available, and unknown
families still fail closed. The default V2.8.2 decision/spend policy is unchanged.

| Layer | Fresh result |
| --- | --- |
| Offline regression suite | 155 Node cases plus existing assertion suites; 80 frozen decision/spend fixtures unchanged |
| Independent native arithmetic | 1,512 income/debt + 6,144 human + 6,144 bot cases |
| Local official-source integration | One exact native debit/front transition, 292 combat cases, 54 income/rate cases, ownership reconciliation across 512 slots |
| Native observer restoration | 16 original methods restored after integrated observation |
| Spatial fixture gate | 252 support-kernel cases; 143,599 captured cell writes; 4,293 reconciled deltas; 396 hostile batches; 9 full ownership audits; 5 ownership methods restored |
| Browser/UI/accessibility/package | Passed; no approved screenshot baselines changed |

Local downloaded-source fixtures deliberately control state and scheduling for
math and replay checks. They are separate from official gameplay; their success
is not included in the outcome table.

## Command evidence and diagnosis

The four completed comparisons contain **3,443 planner decisions and 93 native
commands**. All 93 affirmative receipts join uniquely to native admissions using
single-flight timing plus exact target and ratio code. The final smoke contributes
120 further decisions and 9 commands. Independent integer accounting reproduced
all **102 observed debits** exactly. No native acknowledgement tick was invented.

All 41 treatment admissions carried capital-v1 authority and retained the
recorded required reserve and debit cap. Two additional Asia treatment submissions
were rejected as `experimental-budget-expired`; they did not become native
commands. Both are preserved. All five attempts recorded zero buffer-overflow drops, observer errors and page
errors at their periodic drains. However, the final post-loop observer tail was
not exported after stopping. End-to-end lossless coverage is therefore **not**
claimed; counts, joins and support apply only to captured records. Captured
decisions retain full input/budget fields, rather than sampled HUD summaries alone.

The Europe baseline contacted an enemy by sampled tick 92: bank 349, territory
180, adjacent enemy bank 579. It later peaked at 1,037 cells and remained in
`hard-build-combat-bank` before elimination. The treatment reached less land on
both maps, despite longer observed survival. Treatment reserve holds occurred in
319 Europe and 681 Asia decision frames; those are correlated frames, not games.
This is consistent with a capital-versus-growth problem, but different opponent
placements prevent a causal conclusion about which mechanism caused each loss.

**Decision:** merge the verified integration repair; do not promote capital-v1 or
relax native safety floors. The next development question is how pre-contact
expansion, territory income and contact geometry affect reaching a sustainable
bank before encirclement. Define a new narrow candidate and assign its comparison
schedule before treatment; do not tune on these four losses and call them held out.

## Retained artifacts and reproduction

The [evidence manifest](live-audits/2026-10-22-mcp-loop-evidence.json) links five
compressed bundles containing captured report snapshots, planner journals and
native-observer journals, with SHA-256 digests. Downloaded official source and
browser profiles are excluded. Original screenshots remain in the local ignored
`scratch/live-mcp-loop/2026-10-23/` folders (UTC date).

The comparison runtime is archived separately as the extension's own files,
encoded as base64. The final release differs only by removing one whitespace-only
line in the adapter and updating the manifest description. Both release hashes
are retained. The final smoke reinstalled the final runtime; it is not substituted
for a completed comparison.

```sh
npm test
npm run test:math-native
npm run test:live
npm run test:spatial
npm run test:browser
npm run test:ui-state
npm run test:ui
npm run test:a11y
npm run package
git diff --check
```

`tests/source-v4.test.cjs` checks required recognition signatures, fail-closed
mutations, raw native identity, selector scoping, match-token replacement and
published journal accounting. `tests/planner-observer.test.cjs` checks renamed
native delegation, exact debit and restoration. `tests/native-v4-integration.cjs`
executes the independent local-source combat/income/ownership/observer checks.
Follow the [MCP runbook](AGENT_EXPERIMENT_HANDOFF.md) for the next official match;
none of these commands alone replays an official completed game through MCP.
