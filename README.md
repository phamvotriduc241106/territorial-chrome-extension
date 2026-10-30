# Territorial.io Auto Commander

Chrome Manifest V3 extension for [Territorial.io](https://territorial.io), with a
native command bridge, deterministic policy and separate research/test tooling.

**Release:** v10.3.11 · **Production engine:** V2.8.2 · **Updated:** 2026-10-22 22:10:30 EDT

**Native integration:** the fresh-source checks on October 29
returned an unknown contract and failed closed. October 22 native integration
passes and four Impossible/512 comparison losses remain dated evidence. See the
[mathematical corrections](docs/math/MATHEMATICAL_CORRECTIONS.md),
[current-source checks](docs/architecture/REPOSITORY_LAYOUT.md#verification)
and [live MCP report](docs/research/MCP_IMPOSSIBLE_LOOP_2026_10_22.md).
Capital-v1 remains an explicit, default-off, per-match single-player experiment.

## Install

1. In `chrome://extensions/`, enable Developer mode and choose **Load unpacked**.
2. Select this repository root, which contains `manifest.json`, or the clean
   directory printed by `npm run package`.
3. Open a fresh `https://territorial.io/` tab. Autopilot starts after native spawn
   confirmation when the game source is supported. Reload the extension and tab
   after updating.

The in-page engine is scoped to the exact official HTTPS host. The toolbar popup
is available on explicit click. Unsupported source contracts remain closed to
native commands; testing success must be interpreted within the source/version
shown in its report.

## Repository map

```text
manifest.json                 Chrome entry point; load-unpacked root
background/ content/          Packaged browser worker and controller modules
icons/ popup/ shared/         Packaged assets, UI, settings and shared code
docs/                         Guides by topic, dated evidence and archive
research/                     Unshipped models, simulations, benchmarks, replays
tests/                        Contracts, unit, compatibility, browser, UI, manual
tools/                        Release, validation, live, research and report CLIs
```

Start with the [documentation index](docs/README.md),
[research index](research/README.md), [test guide](tests/README.md), or
[tool index](tools/README.md). The
[layout guide and migration map](docs/architecture/REPOSITORY_LAYOUT.md) explain
the October 29 reorganization and old filenames. Manifest-listed runtime files
keep their original paths and bytes; npm command names remain stable.

## Develop and verify

Requires Node.js 20+; npm dependencies are development-only. Run from the root:

```sh
npm ci
npm test
npx playwright install chromium
npm run test:browser
npm run test:ui-state
npm run test:ui
npm run test:a11y
npm run package
```

| Task | Command or guide |
| --- | --- |
| Layout, local links and runtime import closure | `npm run check` or `npm run check:layout` |
| Mathematical worked examples | `npm run test:math-docs` |
| Fresh native arithmetic | `npm run test:math-native` |
| Downloaded-source local integration/spatial replay | `npm run test:live`, `npm run test:spatial` |
| Installed official-game diagnostics | [MCP runbook](docs/testing/AGENT_EXPERIMENT_HANDOFF.md), `npm run audit:live` |
| Approximate policy/CPU benchmarks | `npm run benchmark`, `npm run benchmark:cpu` |
| Prospective official outcomes | [Very Hard standard](docs/testing/VERY_HARD_TEST.md) |

Offline fixtures do not join an official online match. Fresh-source commands
fetch the changing public bundle and may fail its signatures. CI verifies the
curated offline, browser/UI and package gates; current native compatibility and
real-game effectiveness are separate checks. See [contributing](CONTRIBUTING.md).

## Engine and evidence

[`content/engine-core-v2-advanced.js`](content/engine-core-v2-advanced.js) is loaded
in both browser worlds through the adapter. It combines neutral-first expansion,
incoming-aware targeting, rule-based spending, exact command accounting,
conditional aggregate planning and bank observation. Native admission rechecks
match, target, fronts, reserve and debit. Experimental tree search is disabled.

The integer allocator optimizes a specified separable utility; native single
commands do not execute its allocation vector. Frontier models and numerical
helpers have explicit research/coverage limits. **Reliable competitive strength
and a win-rate improvement are unestablished.** Unsupported historical 81.20%
win-rate and approximately 1 µs controller claims are withdrawn.

- [Architecture](docs/architecture/ARCHITECTURE.md)
- [Planning model](docs/math/PLANNING_MODEL.md) and [math protocol](docs/math/MATH_TEST_PROTOCOL.md)
- [Validation and limits](docs/testing/VALIDATION.md)
- [Dynamic-frontier model study](docs/research/frontier/FRONTIER_DYNAMIC_VALIDATION.md)
- [Capital-v1 pilot](docs/research/CAPITAL_POLICY_PILOT.md)
- [Measured CPU work](docs/performance/CPU_OPTIMIZATION.md)
- [Release history](docs/CHANGELOG.md) and [historical archive](docs/archive/README.md)

## Controls and diagnostics

`Z`: pause/resume · `H`: HUD mode · `X`: expansion · `C`: 25% allocation ·
`V`: 40% allocation · `B`: adaptive allocation. Shortcuts ignore editable controls
and modifier keys. The toolbar ON badge reports the saved preference; live
connection, arming and freshness are separate dashboard states.

In the game tab's MAIN DevTools context:

```js
window.__TIO_HOOK_API__?.state()
window.TIOGetEngineStatus?.()
document.documentElement.getAttribute('data-tio-internal')
```

See [UI behavior and verification](docs/ui/UI_UX_VALIDATION.md) and
[theme assets](docs/ui/NEON_THEME.md). Do not publish credentials, browser
profiles or downloaded game source in issues or commits.
