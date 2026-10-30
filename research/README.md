# Research workspace

These files are outside the packaged extension. The shipped controller remains
in [`content/engine-core-v2-advanced.js`](../content/engine-core-v2-advanced.js).

| Directory | Purpose |
| --- | --- |
| [planner/](planner/) | Bounded original-call observers, offline banking/contact evaluators and fixture runner |
| [frontier/](frontier/) | Research-only dynamic frontier transition |
| [simulators/](simulators/) | Approximate match simulators, map generation and spatial index |
| [engines/](engines/) | Unshipped candidate/baseline kernels and adapter |
| [benchmarks/](benchmarks/) | Simulation tournaments, ablations, parameter searches and phase-study drivers |
| [datasets/](datasets/) | Recorded seed splits and historical parameter values |
| [results/](results/) | Historical phase-study JSON outputs |
| [replays/](replays/) | Replay viewer/server, recorded simulator replays and SVG dashboards |
| [hardware/](hardware/) | Hardware-oriented numerical prototypes and equivalence scripts |
| [legacy/](legacy/) | Older alternative engines, unused browser modules and historical falsification scripts |

`npm run benchmark` runs the approximate policy benchmark. For the local replay
viewer, run `node research/replays/serve-replay.cjs` from the repository root and
open the printed localhost URL. Running a benchmark or dataset generator may
write its documented output files; the reorganization did not regenerate them.

The four compatibility/numerical scripts used by `npm test` live in
[`tests/compatibility/`](../tests/compatibility/). Historical audit/falsification
scripts under `legacy/tests/` are exploratory; their findings and exit behavior
are described in the [validation guide](../docs/testing/VALIDATION.md).

Published source-bound evidence belongs in [`docs/evidence/`](../docs/evidence/).
Generated recordings, downloaded game source and temporary browser profiles
stay outside tracked research data. Approximate simulator output, a numerical
helper, or a low prediction error does not establish official-game strength.
Read the [mathematical claim register](../docs/math/MATHEMATICAL_CORRECTIONS.md)
and [MCP runbook](../docs/testing/AGENT_EXPERIMENT_HANDOFF.md) before treatment.
