# Territorial.io Auto Commander

Chrome Manifest V3 extension for [Territorial.io](https://territorial.io), using native in-game commands rather than synthetic mouse input.

**Release:** v10.2.4 · **Engine:** V2.7 · **Updated:** 2026-10-04 10:50:25 EDT

## Install

1. Open `chrome://extensions/`, enable Developer mode, and select **Load unpacked** → this repository.
2. Open a fresh Territorial.io tab, select a single-player game, and choose your spawn.
3. The bot arms after your spawn selection. Reload the extension and open a fresh tab after updates.

For a clean runtime-only folder, run `npm run package` and load the printed `dist/territorial-v…` directory. No bundler or npm installation is needed to load the repository directly.

## Development

Requires Node.js 20+; npm dependencies are development-only.

```sh
npm ci
npm test
npx playwright install chromium
npm run test:browser
npm run test:live
npm run package
```

`test:live` fetches the official page and tests it locally; no online match is joined. CI uses deterministic fixtures, not the changing live website. See [contributing](CONTRIBUTING.md) for browser overrides and release rules.

## Engine and evidence

The shipped kernel is [`content/engine-core-v2-advanced.js`](content/engine-core-v2-advanced.js), loaded in both browser worlds. V2.7 includes neutral-first expansion, lobby-wide duel detection, a 55%-capacity combat-bank target, incoming-aware targeting, timed opening recovery and native-boundary reserve protection.

Approximate paired simulation: **367/800 wins (45.875%)**, versus **353/800 (44.125%)** with the new policy disabled. **Real Hard-mode win rate is unmeasured.** This release reorganizes the repository without changing strategy. See [validation and reproduction](docs/VALIDATION.md); archived performance claims are not release claims.

## Repository

- [Architecture and ownership](docs/ARCHITECTURE.md)
- [Validation and benchmark limits](docs/VALIDATION.md)
- [20-match Very Hard test standard](docs/VERY_HARD_TEST.md)
- [Changelog](docs/CHANGELOG.md)
- [Historical source map](docs/SOURCE_MAP.md)
- [Historical reports](docs/archive/)

Runtime: `content/`, `shared/`, `background/`, `popup/`, `icons/`. Research: `experiments/`. Verification: `tests/`. Release tooling: `tools/`. Generated artifacts: ignored `dist/`.

## Controls and diagnostics

`Z`: toggle bot · `C`: ~25% commit · `V`: 40% commit · `B`: adaptive ratio.

In the game tab's DevTools console:

```js
window.__TIO_HOOK_API__?.state()
window.TIOGetEngineStatus?.()
document.documentElement.getAttribute('data-tio-internal') // "1" when ready
```

If the hook is not ready, reload the extension and open a fresh game tab. Do not post access tokens, credential-helper output or downloaded game source in issues.
