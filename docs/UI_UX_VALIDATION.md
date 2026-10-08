# Commander UI/UX — v10.3.4

Updated **2026-10-08 10:53:25 EDT**. Production engine: **V2.8.2**.
Review branch: `codex/commander-ui-ux`; base: `b407960643c096d5de334ab409c7970cdd930cd4`.
Source roadmap: `/Users/phamvotriduc/Downloads/Territorial_Commander_UI_UX_9of10_Roadmap.pdf`.

## Delivery boundary

This release implements the roadmap's engineering changes. It does **not** claim
a 9/10 usability rating: the required five-person first-use study has not run.
There are no new strategy algorithms, reserve rules, native combat changes,
frontier-driven decisions, Workers, WASM, WebGPU or tree-search activation.

The production kernel is byte-identical to the base after normalizing its three
release-metadata edits. `source-adapter.js`, `main-hook.js`, `internal.js`, and
all four frontier modules are unchanged. All 80 frozen production decision/spend
fingerprints pass. Changing HUD mode or disclosure state preserves the existing
planner settings object and does not change pacing or switch engines.

## Roadmap coverage

| Ticket / requirement | Delivery | Evidence / remaining limit |
| --- | --- | --- |
| UI-01 Runtime lifecycle | Shared read-only state contract; enabled preference never implies Playing | Node matrix plus browser transitions, stale/corrupt/future/reordered response tests |
| UI-02 Consistent onboarding | Enabled by default; Single Player → select spawn → confirmed territory; Z pauses/resumes | Popup/HUD/help copy, real orchestrator keyboard tests |
| UI-03 Explicit persistence | Pending/saved/failure/retry states; partial writes; no false success; pause precedes storage | Failed read/write, held write, rollback, retry, real MV3 storage/reload tests |
| UI-04 Map-first HUD | Compact, detailed, hidden; persistent H cycling; compact hides before spawn; fully click-through | 3 modes × 3 viewports, DOM-recreation check, pointer-event assertions |
| UI-05 Focused popup | One primary switch; 3 existing strategy IDs; advanced/help/about disclosures | State screenshots; saved disclosure and selected-state tests |
| UI-06 Honest measurements | Native observed, vision estimated, missing unavailable; real observation ages; no fixed 60 FPS | Genuine orchestrator snapshots, observed-zero tests, stale-value suppression |
| UI-07 Keyboard/accessibility | Labels, focus, pressed states, fieldsets, range descriptions, reduced motion | 17 axe scans; editable/modifier/repeat hotkey protection; focus checks |
| UI-08 Shared visuals | Shared dark tokens; responsive wrapping; single HUD stylesheet | 13 reviewed screenshots; 100/125/200% equivalent popup-width checks |
| UI-09 Reconnection/freshness | Request sequencing, timestamp rejection, explicit retry, stale metrics unavailable | Late response, reversed timestamp, corrupt/future timestamp, missing response tests |
| UI-10 Toolbar semantics | Neutral ON badge reports saved preference only; unknown storage uses ? | Real MV3 badge/title assertion; migration failure unit test |
| UI-11 Accurate claims | Multiplayer unvalidated; no guaranteed win/percentage/front count or active-tree claims | Copy review; existing engine and strategy IDs retained |
| UI-12 Regression + first-use study | UI, accessibility and visual tests added to CI with failure artifacts | Automated gates delivered; five-participant study pending |

The existing `aggressive` strategy is labeled **Pressure**, not Balanced: relabeling
an aggressive policy as a mathematically balanced policy would misrepresent its
behavior. `expansionist` and `defensive` are labeled Expand and Defend. The ratio
and command-rate controls retain their existing values and semantics; a command
ceiling is not a promise to issue that many commands per second.

## State and measurement contract

Playing requires all of: confirmed in-game territory, armed match, enabled
runtime, running automation, ready actuator, fresh transport and native/vision
observation, and no blocking reason. Saved enable alone proves none of these.
Paused can represent a local pause whose storage write failed; the popup shows
the saved preference separately and provides an explicit resume control.

`statusSampledAt` dates the UI response. `telemetryAgeMs` dates the underlying
native/vision observation, not the response wrapper. Either age above 3,000 ms
prevents Playing. Popup polling and HUD watchdogs render every 1,000 ms, so the
visible change can lag that cutoff by one render interval. Invalid ages fail
closed. Old values are not rendered as current; a real observed zero is retained.
Native gameplay FPS is unavailable, not invented. Vision sampling FPS is only
shown when measured on the actual fallback path.
The last-command time records receipt of a successful native acknowledgement,
not a speculative attempt or exact native dispatch tick; pending/failed attempts
never advance it. It clears when the match is disarmed.

Storage callbacks consume `runtime.lastError`. The popup serializes partial
preference writes, rolls back failed changes, and distinguishes durable saving
from delivery to the current tab. A user-requested pause is sent immediately and
clears queued commands even if storage is pending or fails. Resume is not sent
before a successful write. Hotkey storage failures are labeled local-only and
retryable; the recorder retains the latest failed partial patch, not a complete
history of overlapping failed hotkey changes.

## Local measurements

Measured on this Mac with bundled Chromium **153.0.8010.12**, same synthetic
1280×720 game fixture. Screenshot dimensions are rounded to pixels; the baseline
HUD's exact browser bounding box was 360×299.421875 CSS px.

| HUD measurement | Before (`b407960`) | v10.3.4 compact | Change |
| --- | ---: | ---: | ---: |
| Default width | 360 px | 210 px | −41.67% |
| Default height | 299.421875 px | 134 px | −55.25% |
| Default occupied area | 107,791.875 px² | 28,140 px² | −73.89% |
| Persisted HUD modes | 0 | 3 | +3 |

Detailed mode is 320×425 px in the approved fixture. Hidden mode has no visible
panel. All modes were checked at 1280×720, 1366×768 and 1920×1080. The compact
target of 180–220 px width and 110–150 px height is met for the recorded fixture.
Unusually long estimates or connection labels may expand the panel: readable,
honest values take priority over truncating them to the nominal height.

The popup passed no-horizontal-overflow checks at 360, 288 and 180 CSS px widths
(100%, 125%, 200% equivalent widths), with disclosures open. This is automated
responsive-layout evidence, **not** a human browser-zoom or screen-reader study.
Vertical scrolling is expected for Advanced/Help/About. Very short detailed-HUD
viewports and every OS/font combination are not exhaustively validated.

| Gate | Local result |
| --- | ---: |
| Existing Node runner cases (`npm test`) | 96 passed |
| UI state/settings/background cases | 5 passed |
| Browser UI assertions including visual checks | 125 passed |
| Approved screenshot baselines | 13 matched |
| axe scans | 17 |
| Critical/serious WCAG-tagged axe violations | 0 |
| Frozen production decision/spend fingerprints | 80 unchanged |
| Bridge / native hook browser checks | 9 / 29 passed |
| Original-source normal combat fixtures | 292 passed |
| Original-source economy fixtures | 54 passed |
| Native player ownership totals reconciled | 512 / 512 |
| Packaged runtime files | 36 |

The existing assertion suites also pass 3,112 core, 3,465 compatibility, 39 Hard
safety, 131 numerical checks and seven metadata checks. These test counts are
not independent games or evidence of win-rate improvement.

500 warmed HUD renders yielded P95/P99 ≈0.1 ms, maximum ≈0.2 ms in the recorded
local run. Timer quantization and a synthetic DOM limit interpretation: this is
not a sustained gameplay CPU/energy benchmark. CI timing can vary without
changing correctness. The existing native-source check redownloaded the official
page; HTML SHA-256 remained
`155a2db1cc6f256317fc6178ce12993c76b51630ba5985be4e9ef1d7cad7fcff`.

## Browser, visual and accessibility method

`tests/ui-browser.cjs` uses deterministic Chrome API fixtures for controlled
failures, and a separate fresh persistent Chromium profile for the **actual MV3
extension** popup, real storage, service worker, badge and reload. This exercises
the real extension document and APIs, not the physical browser toolbar geometry.
It uses only temporary profiles and never joins a multiplayer game or changes
the user's browser settings. Debugger evaluation injects axe for QA; the shipped
extension CSP is unchanged.

Visual baselines are manually inspected and platform-specific. The initial
Linux run differed from the macOS first-state baseline by 3,423 pixels, primarily
text rasterization, despite pinned fonts. The threshold was not loosened.
Test-only pinned Inter fonts avoid font substitution, but not FreeType/CoreText
rendering differences; the shipped UI still uses system fonts and does
not package or fetch these fonts. Visible HUD comparisons crop to the panel so
empty game space cannot dilute a regression. Pixelmatch uses threshold 0.2,
requiring fewer than 0.5% changed pixels and identical dimensions. A deliberate
white-background mutation failed the macOS first comparison (170,564 changed pixels;
expected exit 1), with evidence under `scratch/ui-roadmap/negative-control/`. CI never updates
baselines automatically; screenshots/diffs/results are retained for seven days.

axe checks WCAG 2 A/AA, 2.1 A/AA and 2.2 AA tags and fails on critical/serious
findings. A zero result in that filter does not establish complete accessibility
or replace screen-reader, motion, contrast and usability review. The test runner
also checks semantic states and visible keyboard focus independently.

Development-only tools are pinned: Playwright 1.63.0, axe-core 4.14.0,
pixelmatch 8.0.0, pngjs 7.0.0, Inter fixtures 5.3.0. None is in the runtime package.
The method follows [Playwright extension testing](https://playwright.dev/docs/chrome-extensions)
and [automated accessibility guidance](https://playwright.dev/docs/accessibility-testing).

## Reproduction

```sh
npm ci
npx playwright install --with-deps chromium
npm test
npm run test:ui-state
npm run test:browser
npm run test:ui
npm run test:a11y
npm run test:live
npm run package
```

Results and screenshot diffs: ignored `scratch/ui-roadmap/qa/`. Approved macOS
images: `tests/ui-baselines/`; Linux images: `tests/ui-baselines/linux/`.
The live command needs network access to the official site;
regular CI uses local native fixtures, not an unannounced network-dependent test.
GitHub CI must be checked against the exact pushed head; local passing results
alone do not establish remote CI success.

Negative control (expected nonzero exit, no baseline edits):

```sh
node tests/ui-browser.cjs --inject-visual-regression
```

Intentional baseline regeneration, followed by visual review and a normal run:

```sh
node tests/ui-browser.cjs --update
npm run test:ui
```

## Remaining human acceptance gate

For a new platform, `node tests/ui-browser.cjs --capture` writes **candidate**
images only to the ignored results directory. It does not create or update an
approved baseline. The explicit workflow-dispatch `capture_ui_candidates` option
runs this mode and uploads artifacts for review. Ordinary push/PR runs always
compare approved baselines and fail if any are missing. Captured artifacts must
be inspected and approved explicitly before being added to `tests/ui-baselines/`.

Required study: **5 first-time participants × 4 tasks = 20 attempts**; target
≥90% completion means **at least 18/20** successful attempts. Record task times,
errors, assistance, confidence and failed tasks, not just a final satisfaction
score. Tasks: connect/open game; choose spawn and identify actual start; pause
and resume; change strategy and verify saving. Separately inspect diagnostics,
keyboard navigation and screen-reader output. Preserve contradictory feedback.

Current human evidence: **0 participants, 0 task attempts**. No completion rate
is reported. The engineering release is reviewable; a 9/10 product-quality claim
remains unsupported until this study and manual accessibility checks are done.
