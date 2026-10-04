# Development

Use Node.js 20 or newer. Install the pinned development dependency with `npm ci`.

```sh
npm test
npx playwright install chromium
npm run test:browser
npm run test:live
npm run package
```

`npm test` is offline and requires no browser. Browser tests use isolated profiles, block external requests, and never join an online match. Only `test:live` downloads the official page for local verification. `TIO_CHROME` selects a browser executable; `TIO_PLAYWRIGHT` selects an existing Playwright installation.

Production code belongs in `content/`, `shared/`, `background/` or `popup/`. Keep candidate kernels, simulations and tuning under `experiments/`. Historical manuscripts belong in `docs/archive/`, not the release README.

For a release, update manifest, package, runtime, UI and test versions together. Record exact local date, time and timezone in `shared/config.js` and all release details. `npm test` rejects mismatches. Document changes in `docs/CHANGELOG.md`; do not infer a real-game win-rate improvement from passing contracts or approximate simulations.

Do not commit tokens, credential-helper output, `.env` files, browser profiles, game-source downloads or personal attachments. Never paste tokens into issues or pull requests. Report suspected exposures privately to the repository owner.

No license was present in the original repository. Do not assume redistribution rights for game source or archived material; packaged artifacts include only extension runtime assets.
