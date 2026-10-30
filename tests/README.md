# Test organization

Run commands from the repository root. `npm test` is the curated offline release
suite; it also runs the documented mathematical examples.

| Directory | Coverage | Command |
| --- | --- | --- |
| [contracts/](contracts/) | Manifest/import closure, release identity, source layout and documentation links | `npm run check` |
| [unit/](unit/) | Kernel assertions, allocation/income oracles, policy, observations and evidence integrity | `npm test` |
| [compatibility/](compatibility/) | V2 compatibility, numerical stability, adapter and synthetic Hard-mode checks | Included in `npm test` |
| [browser/](browser/) | Local bridge/native harnesses and supported downloaded-source integration | `npm run test:browser`; `npm run test:live` adds a fresh public fetch |
| [ui/](ui/) | UI state, local fixtures, approved screenshots and accessibility | `npm run test:ui-state`, `npm run test:ui`, `npm run test:a11y` |
| [manual/](manual/) | Older interactive vision-engine HTML fixture | Manual local fixture, not official-game evidence |

Approved images live in `ui/baselines/`, including separate Linux captures.
Reorganization moved them without regenerating or approving replacements.
Browser fixtures do not join an official online match. Source-dependent audits
may fail closed when the public game's private interface changes; preserve that
result separately from offline test outcomes.

Historical exploratory scripts are indexed in
[`research/legacy/tests/`](../research/legacy/tests/). They are not silently added
to the release suite. See [validation](../docs/testing/VALIDATION.md) and the
[math protocol](../docs/math/MATH_TEST_PROTOCOL.md) for evidence boundaries.
