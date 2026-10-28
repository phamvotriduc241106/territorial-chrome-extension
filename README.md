# Territorial.io Auto Commander

Chrome Manifest V3 extension for [Territorial.io](https://territorial.io), using native in-game commands rather than synthetic mouse input.

**Release:** v10.3.11 · **Production engine:** V2.8.2 · **Updated:** 2026-10-22 22:10:30 EDT

Restored the renamed October 22 native game interface, including command,
income, ownership and observer paths; native math, bootstrap and spatial checks
passed on that dated bundle. **October 28 recheck:** the current public source is
unknown to the adapter, and the native arithmetic audit fails closed. See the
[checked mathematical corrections and current-source limit](docs/MATHEMATICAL_CORRECTIONS.md).
Four MCP-controlled Impossible/512 development games all lost;
no strength improvement or policy promotion is claimed. See the
[live MCP loop report](docs/MCP_IMPOSSIBLE_LOOP_2026_10_22.md).

Adds a default-off, per-match **capital-v1** single-player experiment: contact-aware command caps and early weak-target opportunities. Native safety remains authoritative. This is an experimental controller, not a validated strength upgrade.

The in-page dashboard and engine run only on `https://territorial.io/`.
Localhost, loopback and subdomains are excluded. The toolbar popup remains
available on explicit click. Reload the extension and existing tabs.

The preceding runtime update fixed false spawn confirmation: native ownership now
overrules terrain-color guesses. Adds opt-in installed-extension Chrome gameplay
diagnostics without changing combat policy. See [live audit](docs/LIVE_CHROME_AUDIT.md).

v10.3.6 fixes status freshness, delayed polling and cross-tab observation races
without changing production policy. See [bug scan and verification](docs/DEBUG_STATUS.md).

## Install

1. Open `chrome://extensions/`, enable Developer mode, and select **Load unpacked** → this repository.
2. Open a fresh Territorial.io tab, select a single-player game, and choose your spawn.
3. Autopilot is enabled by default, but starts only after your spawn is verified. Use Z to pause/resume. Reload the extension and open a fresh tab after updates.

For a clean runtime-only folder, run `npm run package` and load the printed `dist/territorial-v…` directory. No bundler or npm installation is needed to load the repository directly.

## Development

Requires Node.js 20+; npm dependencies are development-only.

```sh
npm ci
npm test
npx playwright install chromium
npm run test:browser
npm run test:ui
npm run test:a11y
npm run test:live
npm run package
```

`test:live` fetches the official page and tests it locally; no online match is joined. CI uses deterministic fixtures, not the changing live website. See [contributing](CONTRIBUTING.md) for browser overrides and release rules.

## Engine and evidence

The shipped kernel is [`content/engine-core-v2-advanced.js`](content/engine-core-v2-advanced.js), loaded in both browser worlds. V2.8 adds a shared tick-based planning model, source-mapped income/outgoing fronts, global coalition sizing, budget-safe allocation and weighted belief intervals. It retains neutral-first expansion, lobby-wide duel detection, a 55%-capacity combat-bank target, incoming-aware targeting, timed opening recovery and native-boundary reserve protection. Experimental tree search remains disabled. See [planning mathematics and limitations](docs/PLANNING_MODEL.md).

V2.8.2 adds action-conditioned combat episodes, native command/settlement events, multi-horizon forecasts, disturbance censoring and offline parameter estimates to the opt-in frontier shadow. Production policy remains unchanged; the shadow model cannot control native attacks. See [recording instructions](docs/FRONTIER_MODEL.md) and [controlled-match calibration evidence](docs/FRONTIER_CALIBRATION.md). **Real Hard/Very Hard win-rate improvement remains unmeasured.** See [validation and reproduction](docs/VALIDATION.md); archived performance claims are not release claims.

Release 10.3.3 adds immutable spatial replay and native capture-cell attribution,
plus a separate, un-packaged dynamic candidate. Its research cohort has 24 complete
Very Hard native-source matches, 16 development and 8 frozen final evaluations.
See [dynamic validation and limitations](docs/FRONTIER_DYNAMIC_VALIDATION.md).
All 80 production decision/spend fingerprints remain unchanged. Another
model-validation phase is required; no frontier model controls autoplay.

## Repository

- [Official mathematics test protocol](docs/MATH_TEST_PROTOCOL.md)
- [Checked mathematical corrections and implementation claim register](docs/MATHEMATICAL_CORRECTIONS.md)
- [Agent experiment instructions and handoff](docs/AGENT_EXPERIMENT_HANDOFF.md)
- [Cycle 01: exact planner/native observation and action shadow](docs/PLANNER_SHADOW_CYCLE_01.md)
- [Cycle 02: banking alternatives, Asia loss and negative findings](docs/BANKING_ALTERNATIVES_CYCLE_02.md)
- [Capital-v1: opt-in live gameplay candidate and pilot](docs/CAPITAL_POLICY_PILOT.md)
- [Impossible-mode improvement proposal](docs/IMPOSSIBLE_IMPROVEMENT_PROPOSAL.md)
- [Architecture and ownership](docs/ARCHITECTURE.md)
- [Validation and benchmark limits](docs/VALIDATION.md)
- [20-match Very Hard test standard](docs/VERY_HARD_TEST.md)
- [Measured CPU optimization and profiler](docs/CPU_OPTIMIZATION.md)
- [Frontier shadow model and telemetry](docs/FRONTIER_MODEL.md)
- [Changelog](docs/CHANGELOG.md)
- [Historical source map](docs/SOURCE_MAP.md)
- [Historical reports](docs/archive/)

Runtime: `content/`, `shared/`, `background/`, `popup/`, `icons/`. Research: `experiments/`. Verification: `tests/`. Release tooling: `tools/`. Generated artifacts: ignored `dist/`.

## Controls and diagnostics

`Z`: pause/resume · `H`: compact/detailed/hidden HUD · `X`: toggle expansion · `C`: 25% allocation · `V`: 40% allocation · `B`: adaptive allocation. Shortcuts ignore editable controls and modifier keys.

The popup reports live connection, spawn confirmation and telemetry freshness separately from the saved enable preference. The toolbar ON badge means only preference enabled. Advanced settings and diagnostics are collapsed by default. HUD is passive/click-through and compact mode hides during initial spawn. See [UI validation and remaining usability gate](docs/UI_UX_VALIDATION.md). No 9/10 rating is claimed without five-user task testing.

v10.3.5 adds the supplied neon synthwave theme, with local pixel/monospace fonts,
static scanlines and cyan/magenta frames. [Theme details and local validation](docs/NEON_THEME.md).

In the game tab's DevTools console:

```js
window.__TIO_HOOK_API__?.state()
window.TIOGetEngineStatus?.()
document.documentElement.getAttribute('data-tio-internal') // "1" when ready
```

If the hook is not ready, reload the extension and open a fresh game tab. Do not post access tokens, credential-helper output or downloaded game source in issues.
