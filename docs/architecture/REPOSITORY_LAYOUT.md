# Repository layout and migration

Reorganized 2026-10-29 from commit
`94985dc3f6a83ffe92e5c5db30cb14a2b40bae7e`.

## Ownership map

| Area | Location | Boundary |
| --- | --- | --- |
| Chrome entry point | Root `manifest.json` | Load this repository root or the packaged directory in Chrome |
| Packaged extension | `background/`, `content/`, `icons/`, `popup/`, `shared/` | The manifest and release closure define the 41 installed files |
| Documentation | `docs/architecture`, `math`, `testing`, `ui`, `performance`, `research` | [Documentation index](../README.md) routes readers by task |
| Published evidence | `docs/evidence/live`, `frontier`, `math` | Dated source-bound manifests and compressed journals |
| Historical writing | `docs/archive` | Withdrawn claims remain explicitly labelled; related PDF is retained |
| Research implementations | `research/` | Models, simulators, candidates, benchmarks, replay UI and legacy code are unshipped |
| Verification | `tests/contracts`, `unit`, `compatibility`, `browser`, `ui`, `manual` | Curated automated gates are separate from historical diagnostics |
| Developer CLIs | `tools/release`, `validation`, `live`, `frontier`, `reports`, `benchmarks`, `lib` | Existing npm commands point at the new locations |
| Generated/local work | Ignored `scratch/`, `dist/`, test output and browser profiles | Existing ignored work is preserved |

## Why the manifest and runtime paths remain stable

Chrome can load the repository directly, and historical experiments identify
release files by path and bytes. The 41 packaged files therefore keep both their
paths and contents. The release hash before and after the move is
`0a3dfb07d29e39ff394345162d7858d8d33943dc4332fb0f789de0b1dc9b8cb6`.
No controller, arithmetic rule, runtime asset or release version changed.

Eight unshipped files previously under `content/` now live under
`research/frontier/` or `research/legacy/browser/`. The one tracked HTML fixture
under `scratch/` moved to `tests/manual/`; `scratch/` remains generated/local
storage. Historical alternative engines and diagnostic scripts are grouped
under `research/legacy/`. The PDF moved from `report/` to `docs/archive/`.

The migration moves **238 of 290 original tracked files**. A byte comparison
preserved **89 data/assets**: JSON data and lockfile, compressed evidence,
PNG/SVG/PDF assets and fonts/license text. Approved screenshot baselines were
moved without replacement; evidence statistics, signatures and compressed
payloads were not rewritten. Runtime hashes were checked separately.

## Finding an old path

[`tools/lib/layout-map.json`](../../tools/lib/layout-map.json) records every
move. For example:

| Old location | Current location |
| --- | --- |
| `experiments/rigorous-simulator.cjs` | `research/simulators/rigorous-simulator.cjs` |
| `content/frontier-dynamic.js` | `research/frontier/frontier-dynamic.js` |
| `tests/planning-math.test.cjs` | `tests/unit/planning-math.test.cjs` |
| `tools/live-chrome-audit.cjs` | `tools/live/live-chrome-audit.cjs` |
| `docs/MATHEMATICAL_CORRECTIONS.md` | `docs/math/MATHEMATICAL_CORRECTIONS.md` |
| `docs/live-audits/` | `docs/evidence/live/` |

Relative imports, browser fixture URLs, npm commands, local Markdown links and
current documentation paths follow the new layout. Historical keys inside
published JSON and compressed source snapshots keep their original names. The
freeze checker uses explicit relocation only when reading the corresponding
current file; it compares archived payloads using their original keys.

## Verification

`npm run check` checks manifest/import closure, script syntax/literal imports,
layout placement and local documentation/browser imports. `npm run check:layout`
provides the layout/link check alone. The existing math, policy, browser, UI,
accessibility and package commands retain their names.

Local verification on October 29 passed the 155 Node subtests and existing math,
contract, compatibility and policy gates; all three browser harnesses; six UI
state cases; approved UI screenshot comparisons; accessibility checks; packaging;
and local replay/benchmark smoke checks. No screenshot baseline was regenerated.
The layout check verifies 238 relocated files, 41 runtime files and local links.

Fresh public-source checks on October 29 remain blocked separately:

| Command | Result |
| --- | --- |
| `npm run test:math-native` | Rejected: missing/ambiguous `function aJR()` marker |
| `npm run test:live` | Rejected: unknown source contract |
| `npm run test:spatial` | Rejected: unknown native spatial source |

The spatial gate recorded public-source SHA-256
`dcf6e0b27f8923415d32c4fee015afe82e8488b0c5327754d716fa2a56ef056e`.
These checks fail closed; no source guard was relaxed. This organization change
does not repair the native interface or establish new official-game results. Follow the
[math protocol](../math/MATH_TEST_PROTOCOL.md) and
[MCP runbook](../testing/AGENT_EXPERIMENT_HANDOFF.md) for future runtime work.
