# Installed-extension live Chrome audit — v10.3.7

Updated **2026-10-09 16:13:36 EDT**. Engine remains **V2.8.2**.
Baseline checkout: `3853028` / v10.3.6. Work is isolated on
`codex/live-chrome-engine-audit`; no merge or GitHub push is implied.

## Observation, not a win-rate experiment

Used Playwright MCP to open actual visible system **Google Chrome
154.0.8037.98**, install the unpacked extension through browser-level
`Extensions.loadUnpacked`, navigate to the official https://territorial.io/
page, select Custom Scenario, 64 players and the **Very Hard UI label**, and
confirm the spawn through the normal two-click castle control. The extension's
MAIN and isolated worlds plus its background service worker were present.
No engine scripts were injected, no balance/territory was edited, no scheduler
was accelerated, and no manual combat command was sent. No multiplayer match
was joined. Profiles are separate from the user's personal Chrome profile.

Source contract: `live-modern-v3`, SHA-256:

`155a2db1cc6f256317fc6178ce12993c76b51630ba5985be4e9ef1d7cad7fcff`

Procedural Island map index 2, seed 14071; spawn confirmation at viewport
coordinate (550,160), 1280x900. Bot spawning was not frozen across runs. These
are diagnostics, not paired trials or a prospective 20-match campaign.

| Observation | Baseline v10.3.6 | Startup-fix diagnostic |
| --- | ---: | ---: |
| Players at start | 64 | 64 |
| Native difficulty selected by Very Hard UI | 4 | 4 |
| Premature vision-based arms before native spawn | 2 | 0 at recorded pre-confirmation checkpoint |
| Commands acknowledged by observation cutoff | 71 | 56 |
| Maximum observed command-failure streak | 0 | 0 |
| Observation period | 255.001 s to first last-survivor sample | 120 s cutoff |
| Remaining opponents at cutoff | 0 | 17 |
| Full official game completion confirmed | No | No; time-censored |

The startup-fix diagnostic ran from a modified v10.3.6 checkout before metadata
was bumped; its exact release hash is in its local report. A subsequent
v10.3.7 120-second run recorded 53 acknowledgements, no command failures and
10,048 cells at its cutoff. It is also censored. A final-release 20-second run
recorded 21 acknowledgements, 767 maximum cells and no observed failures.
Its pre-confirmation checkpoint had zero native territory, pending spawn,
no arming and zero commands. Unequal durations and random bot spawns
make territory/command differences unsuitable for strength comparisons.

### Corrected last-survivor interpretation

The baseline reached one remaining native player at tick 4564, with 102,691
cells and 71 acknowledged commands. Later it settled at 111,443 cells,
**98.68% of 112,926 land cells**, with **1,483 neutral cells** left. The actual
screen still says a neutral pixel needs to be conquered. Physical neighbors
and active fronts are both zero; `shipsEnabled` is false. Thus this establishes
elimination of all 63 opponents, **not official full-map completion**.

An initial commentary/raw report called this a win too early. The original
observations are retained, with a separate `assessment.json` correcting that
classification. The new recorder uses `opponents-eliminated`, not `win`, for
this milestone. This result is not inserted into the prospective win campaign.

## Strengths and weaknesses supported by this run

| Finding | Evidence | Engineering conclusion |
| --- | --- | --- |
| Reliable native command path | 71 acknowledgements, 0 maximum failure streak | Preserve source signatures, single-flight dispatch and reserve checks |
| Land expansion and capital accumulation work here | 63 opponents eliminated; initial rank 1; 111,443 final cells | This policy can beat these Very Hard opponents on this one map/spawn |
| Repeated-state gating is active | 2,807 evaluations / 58,497 skips at first last-survivor sample | Avoided 95.42% of recorded gate opportunities; not a measured whole-browser CPU saving |
| False spawn confirmation | Two terrain-color arms while native territory was 0 | Fix authority/freshness before attempting strategic tuning |
| Terminal coverage gap | 1,483 neutral cells, 0 land contacts, no native boats | Naval reachability and source-verified endgame settlement are the next capability gap |
| Potentially conservative banking | 128 sampled `hard-build-combat-bank` decisions before last survivor | Investigate with replay/held-out matches; holds alone do not prove bad decisions |
| Difficulty evidence mismatch | UI Very Hard sets native 4; hook policy `difficulty` remains 5 | Policy configuration is not the game difficulty label |

The gate percentage is skips/(evaluations+skips), descriptive and measured in
the observational session. The recorder does not infer confidence intervals
from correlated ticks. It is not a latency, memory, battery or CPU benchmark.

Current native difficulty 5 corresponds to the UI's Impossible option, whereas
the older prospective test standard stores numeric 5 as its Very Hard condition.
Do not silently equate those fields or reinterpret historical matches. Existing
frozen calibration data and its hashes remain untouched; its difficulty labels
need a separate source/UI audit. New live records keep UI label, raw native
value and hook configuration separate. Neither a passing synthetic standard
nor an old numeric difficulty field verifies live strength.

## Implemented improvements

1. Ready native ownership overrules vision color, including zero territory,
   a dead/invalid player or incomplete spawn data. No spawn-time canvas reads
   occur when mapped native state exists or vision fallback is disabled.
2. Native confirmation requires an observation received after the spawn click,
   preventing previous-round cached land from authorizing a new spawn.
3. New-match arming resets the previous not-alive timer.
4. Read-only presentation reports **no land route / native boats unavailable**
   for the observed endgame blocker. It does not change decisions or spending.
5. An opt-in real-time live recorder preserves source/release identity, UI
   difficulty, native state, actual agent decisions, acknowledgements and
   cutoff/termination distinctions. Missing measurements stay null.

**No combat-policy tuning, frontier promotion, Workers, WASM, WebGPU or tree
search was introduced.** All 80 frozen production decision/spend fingerprints
remain unchanged; native instrumentation and the seven research freeze hashes
remain unchanged. The engine's only edits are release metadata.

## Validation and reproduction

Local validation: `npm test`, `npm run test:browser`, `npm run test:live`,
`npm run test:ui`, `npm run test:ui-state`, `npm run test:spatial`, and
`npm run package`. Thirteen new focused tests cover spawn authority/freshness,
fallback controls, lifecycle reset, unavailable-land-route presentation,
last-survivor labeling and unknown measurements. GitHub CI has not been run
for this isolated changeset; local success is not CI success.

Live-source checks retain 292 native combat cases, 54 income/rate cases and
252 native support cases in the spatial gate. UI validation uses 170 checks,
13 reviewed image comparisons and 17 accessibility scans with 0 serious/
critical violations. The ordinary tests remain local; the command below is
explicitly live and starts a single-player game on the official website:

```sh
npm run audit:live -- 300
```

Default spawn coordinates are suitable for the observed Island viewport but
are not a general spawn optimizer. Unsupported UI/source or invalid spawn
fails with an error record rather than inventing a result. Limit is 5–900 s;
reports, screenshots and hashes are generated under ignored
`scratch/live-chrome-audit/`. The test-owned temporary profile is closed and
removed; no personal profile is inspected or modified. Recorded data is not
added to the extension's package or uploaded.

Local raw records from this session:

- `scratch/live-chrome-audit/mcp-baseline-20261009/report.json`, with the
  separate corrective `assessment.json`; finish image is
  `/Users/phamvotriduc/.codex/mcp-data/playwright-output/territorial-live-baseline-finish.png`.
- `scratch/live-chrome-audit/2026-10-09T20-13-11-935Z/report.json`:
  startup-fix checkpoint and 120-second censored gameplay.
- `scratch/live-chrome-audit/2026-10-09T20-17-03-660Z/report.json`:
  release 10.3.7, 120-second censored gameplay.
- `scratch/live-chrome-audit/2026-10-09T20-20-35-613Z/report.json`:
  final release 10.3.7, 20-second censored startup smoke test.

Final local regression run: 109 Node test cases passed, in addition to the
existing assertion suites. All 80 production decision/spend fingerprints
retain SHA-256 `d49794e32d3cc195e357b4edc5d14f0731b24a408c25ab03633a019cf015b0c6`.
Actual MCP-controlled Chrome was reloaded with v10.3.7 and left on the official
game menu, with zero territory and native arming false.

## Next algorithmic work

Prioritize a separately validated native naval adapter and a reachability graph
for disconnected land components, with exact boat debit/landing/refund tests.
Do not replace it with arbitrary canvas clicks. After capability coverage,
compare bank-threshold candidates on whole held-out matches with differing
maps, borders and incoming pressure, including failures and censored outcomes.
Do not lower reserves from one winning land-combat example or promote the
dynamic frontier from these live diagnostics.
