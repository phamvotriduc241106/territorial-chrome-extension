# Developer tools

Run commands from the repository root. Internal source paths use
[`lib/repository.cjs`](lib/repository.cjs); user-provided relative input/output
paths retain each CLI's documented meaning. Existing npm command names remain
stable.

| Directory | Tools | Entry points |
| --- | --- | --- |
| [release/](release/) | Manifest-derived file closure, clean packaging, optional icon generator | `npm run package` |
| [validation/](validation/) | Layout/link checks, document arithmetic, native arithmetic, spatial gate and source analysis | `npm run check:layout`, `npm run test:math-docs`, `npm run test:math-native`, `npm run test:spatial` |
| [live/](live/) | Installed-extension single-player recording and prospective/pilot campaign bookkeeping | `npm run audit:live`, `npm run test:very-hard` |
| [frontier/](frontier/) | Research recording, fitting, reporting, freeze checks and profiling | `npm run research:record`, `npm run research:report` |
| [reports/](reports/) | Published planner journals, capital summaries and banking replay analysis | See the [research documents](../docs/README.md#research-and-dated-observations) |
| [benchmarks/](benchmarks/) | Kernel/CPU measurement harness | `npm run benchmark:cpu` |
| [lib/](lib/) | Shared repository root and old-to-new path map | [Migration map](lib/layout-map.json) |

The optional icon generator, `python3 tools/release/generate-icons.py`, requires
Pillow, as it did before the move; it is
not a release-test dependency. Python source analysis remains a standalone CLI.
No dependency was added for the reorganization.

The [MCP runbook](../docs/testing/AGENT_EXPERIMENT_HANDOFF.md) distinguishes an
MCP-controlled installed game from a CLI-only recording. The
[Very Hard standard](../docs/testing/VERY_HARD_TEST.md) defines supported campaign
commands. Source guards and archived experiment hashes remain authoritative.
Historical freeze keys are resolved through the migration map when checking
current files; archived JSON/compressed payloads themselves are unchanged.
