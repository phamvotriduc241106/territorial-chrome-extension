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

This restructuring changes file ownership and validation, not strategy mathematics. The V2.7 kernel remains monolithic; decomposing its policy, economics and numerical helpers should be a separate behavior-preserving change with paired replay evidence, not a silent rewrite.
