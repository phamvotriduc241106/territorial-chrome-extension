# Development

Use Node.js 20 or newer. Install the pinned development dependency with `npm ci`.

```sh
npm test
npx playwright install chromium
npm run test:browser
npm run test:live
npm run package
```

`npm test` is offline and requires no browser. Fixture browser tests use isolated profiles, block external requests, and never join an online match. `test:math-native`, `test:live` and `test:spatial` fetch the public official source for separate arithmetic/integration checks. `TIO_CHROME` selects a browser executable; `TIO_PLAYWRIGHT` selects an existing Playwright installation.

For theoretical claims, also run `npm run test:math-docs` and read the [checked mathematical corrections](docs/MATHEMATICAL_CORRECTIONS.md). The October 28 native-source audit fails closed on a changed interface; documentation checks do not restore that integration.

For mathematical changes, follow the [official mathematics test protocol](docs/MATH_TEST_PROTOCOL.md): independent oracles, exact integer/debit checks, preserved regressions and separate arithmetic/integration/gameplay conclusions. The [October 21 audit](docs/MATH_AUDIT_2026_10_21.md) records the historical source-contract blocker. The [October 22 MCP loop](docs/MCP_IMPOSSIBLE_LOOP_2026_10_22.md) records its v4 repair and the subsequent negative gameplay results.

Production code belongs in `content/`, `shared/`, `background/` or `popup/`. Keep candidate kernels, simulations and tuning under `experiments/`. Historical manuscripts belong in `docs/archive/`, not the release README.

For a release, update manifest, package, runtime, UI and test versions together. Record exact local date, time and timezone in `shared/config.js` and all release details. `npm test` rejects mismatches. Document changes in `docs/CHANGELOG.md`; do not infer a real-game win-rate improvement from passing contracts or approximate simulations.

Do not commit tokens, credential-helper output, `.env` files, browser profiles, game-source downloads or personal attachments. Never paste tokens into issues or pull requests. Report suspected exposures privately to the repository owner.

No license was present in the original repository. Do not assume redistribution rights for game source or archived material; packaged artifacts include only extension runtime assets.
