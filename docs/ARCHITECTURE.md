# Runtime and repository map

The manifest is the authority for shipped code. Both content-script worlds load `content/engine-core-v2-advanced.js` through `content/engine-adapter.js`; V1 is an explicit fallback. `experiments/legacy/engine-core.js` and `engine-core-v2.js` are unshipped alternatives, not production policies.

```text
MAIN world: source adapter → preloader → main hook → native game command
                                            ↑ state / ↓ command
ISOLATED world: internal bridge → orchestrator → engine policy → spend budget
```

The MAIN hook validates the recognized source contract, target availability, current balance, front capacity, reserve and exact debit immediately before actuation. The isolated orchestrator owns arming, state freshness, intent, timing and one-command-in-flight dispatch. The bridge preserves game time, territory trend and incoming-threat context. Do not select a different target after a rejection or bypass the final reserve check.

| Location | Responsibility | Packaged |
| --- | --- | --- |
| `manifest.json`, `shared/` | Load contract, settings and release identity | Yes |
| `content/` | Shipped engines, sensing, bridge and actuation | Manifest-listed files only |
| `background/`, `popup/`, `icons/` | Browser integration and UI | Runtime assets only |
| `tests/` | Production contracts and browser harnesses | No |
| `experiments/` | Simulators, candidate engines, seeds and benchmarks | No |
| `docs/`, `report/` | Current guidance and preserved historical evidence | No |
| `tools/` | Analysis and release tooling | No |
| `dist/` | Generated load-unpacked extension directories and hashes | Ignored |

No bundler is required. Chrome loads the repository directly, or the clean directory produced by `npm run package`. The explicit release closure rejects references outside production directories. Historical reports keep their original paths and claims as archival text; they are not current release documentation.

V2.8 retains one shipped kernel file, but separates planning-state normalization, command application, income stepping, aggregate settlement and utility evaluation into shared functions. MPC and the endgame bandit use that same model. The source adapter supplies modern-v3 income parameters; the MAIN hook snapshots economy, outgoing fronts, global bank totals and leader identity; both orchestrator paths pass the context to planning. See PLANNING_MODEL.md.

Experimental tree search is disabled by default and has no call path from decide(). Native actuation remains independent of speculation: every command is repriced and validated from live state. Planning utilities are not calibrated win probabilities. The 10.2.4 restructuring was behavior-preserving; 10.3.0 intentionally changes planning mathematics.

V2.8.2 loads MAIN-only `content/frontier-model.js` and `content/frontier-episodes.js` after the source adapter and before the hook. Explicit recording installs reversible native land-admission/debit/transfer/batch/reinforcement/return/clear/tick instrumentation. The episode recorder keeps logical native front IDs across force changes, observes exact ticks, conditions on current forces and censors later unmodeled disturbances. Geometry is reconciled at the origin and discarded after compact contact extraction; no raster is exported. Event-serial source versions, whole-observation versions and geometry versions are distinct.

The bridge exposes `frontier-start/stop/report/drain`; the isolated actuator exposes `frontierShadow(command, options)`. None is called by normal autoplay. `tools/frontier-report.cjs`, `frontier-fit.cjs` and `frontier-record.cjs` are offline research tools and are not packaged. Parameter files have no runtime importer. No Workers, shared memory, WASM, WebGPU or tree-search activation are introduced. See FRONTIER_MODEL.md and FRONTIER_CALIBRATION.md.
