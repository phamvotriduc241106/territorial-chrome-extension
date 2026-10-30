# Development

Use the [layout guide](docs/architecture/REPOSITORY_LAYOUT.md), [test index](tests/README.md) and [tool index](tools/README.md) to locate modules. Shared CLI root/path resolution lives in `tools/lib/repository.cjs`.

Use Node.js 20 or newer. Install the pinned development dependency with `npm ci`.

```sh
npm test
npx playwright install chromium
npm run test:browser
npm run test:live
npm run package
```

`npm test` is offline and requires no browser. Fixture browser tests use isolated profiles, block external requests, and never join an online match. `test:math-native`, `test:live` and `test:spatial` fetch the public official source for separate arithmetic/integration checks. `TIO_CHROME` selects a browser executable; `TIO_PLAYWRIGHT` selects an existing Playwright installation.

For theoretical claims, also run `npm run test:math-docs` and read the [checked mathematical corrections](docs/math/MATHEMATICAL_CORRECTIONS.md). The [October 29 native-source checks](docs/architecture/REPOSITORY_LAYOUT.md#verification) fail closed on a changed interface; documentation checks do not restore that integration.

For mathematical changes, follow the [official mathematics test protocol](docs/math/MATH_TEST_PROTOCOL.md): independent oracles, exact integer/debit checks, preserved regressions and separate arithmetic/integration/gameplay conclusions. The [October 21 audit](docs/math/MATH_AUDIT_2026_10_21.md) records the historical source-contract blocker. The [October 22 MCP loop](docs/research/MCP_IMPOSSIBLE_LOOP_2026_10_22.md) records its v4 repair and the subsequent negative gameplay results.

Production code belongs in `content/`, `shared/`, `background/` or `popup/`. Keep unshipped candidates, simulators, benchmarks and historical diagnostics under `research/`; follow its directory index. Historical manuscripts belong in `docs/archive/`, not the release README.

For a release, update manifest, package, runtime, UI and test versions together. Record exact local date, time and timezone in `shared/config.js` and all release details. `npm test` rejects mismatches. Document changes in `docs/CHANGELOG.md`; do not infer a real-game win-rate improvement from passing contracts or approximate simulations.

Do not commit tokens, credential-helper output, `.env` files, browser profiles, game-source downloads or personal attachments. Never paste tokens into issues or pull requests. Report suspected exposures privately to the repository owner.

No license was present in the original repository. Do not assume redistribution rights for game source or archived material; packaged artifacts include only extension runtime assets.
