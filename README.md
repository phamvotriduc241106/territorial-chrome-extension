# Territorial.io Auto Commander (v10.2.3)

Chrome **Manifest V3** extension for [Territorial.io](https://territorial.io).

## v10.2.3 — capital-preserving policy and native-context repairs

Last updated: **2026-10-04 10:36:33 EDT**

Built from the supplied readable game dump plus the current live-site contract.

### What the bot does (single-player INTERNAL)

| Priority | Dump symbol | Action |
| :--- | :--- | :--- |
| 1 | `dF` / empty `b1` | Expand free land first |
| 2 | `dJ` + `cl` | Crush weakest (if `me/8 > enemy`, force finish troops) |
| 3 | `co` | Pressure closest/smallest |
| 4 | `cE` tax | `al(3·B, 256)` overhead respected |
| Act | mapped human command | Live human path — **no canvas mouse** |

The V2.7 planner uses:

- A timed opening FSM that cannot remain permanently stuck after a rejected command
- A dynamic crush barrier using both visible enemy bank and incoming attack troops
- Up to **4** simultaneous strategic land fronts
- Exact live human command tax: `floor(12 × bank / 1024)`
- Live soft cap: `min(100 × territory, 1,000,000,000)`
- Lobby-wide survivor count, not local neighbor count, to distinguish duels from multi-player games
- Neutral-first intent even while a neutral front is settling; no accidental war because that target is busy
- Capital accumulation below 55% of soft cap before ordinary multi-player combat; crush opportunities remain eligible
- Incoming troops in target scoring, and full opening-time / territory-loss / threat context at the native command boundary

### Validation and limits

On 2026-10-04, the fresh official `live-modern-v3` source passed local single-player initialization and exact native attack-debit checks. No online match was joined.

Paired approximate-simulator runs: 800 seeds per policy, 2/3/4/6/10-player lobbies, four map families, three map sizes, 250-tick limit, defense multiplier 1.30. Baseline disables the new policy on the otherwise identical current kernel; this isolates policy effects, not the command-boundary repairs.

| Metric | Policy disabled | V2.7 policy |
| :--- | ---: | ---: |
| Wins / matches | 353 / 800 | 367 / 800 |
| Win rate | 44.125% | 45.875% |
| Mean final rank | 2.2165 | 2.0400 |
| Survived to match end | 87.25% | 89.875% |

The +1.75 percentage-point gain is modest, with regressions on some lobby subsets. These are approximate-simulator results, **not an official Hard-mode win-rate measurement**. The 55% bank threshold is empirical, not a proved optimum; no win guarantee is claimed.

Reproduce with `node experiments/hard-mode-policy-benchmark.cjs 400 1700000` and `node experiments/hard-mode-policy-benchmark.cjs 400 2300000`. Use `TIO_FETCH_LIVE=1` with `tests/run.cjs` to verify the current official source (requires Playwright and Chrome).

### Control flow

1. **MAIN world** (`main-hook.js` at `document_start`) maps the recognized game contract and submits native commands.
2. **Isolated world** (`internal.js`) talks through `postMessage` and never touches the OS mouse.
3. **Orchestrator** (`content.js`) arms only after **you** click spawn on the map.

HUD: `NO-MOUSE` / `INTERNAL` / policy (`expand-empty`, `crush-N`) / path (`hg`/`dF`/`dJ`/`cE`)

## Install / reload

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. **Load unpacked** → this folder (or **Reload** if already loaded)
4. Open a **new** tab → https://territorial.io (hard refresh: Cmd+Shift+R)
5. Click **Play**, then click your **spawn on the map** (not menus)
6. Bot runs INTERNAL — your mouse stays free

### Debug if stuck on HOOK?

In DevTools console:

```js
document.documentElement.getAttribute('data-tio-internal')  // want "1"
document.documentElement.getAttribute('data-tio-paths')     // e.g. "hg" or "hg+cE"
window.__TIO_HOOK_API__ && window.__TIO_HOOK_API__.state()
```

| Value | Meaning |
| :--- | :--- |
| `0` | Script patch missed — new tab + hard refresh |
| `patched` | Export injected, game not ready / not in match |
| `1` | Ready — INTERNAL attacks work |

### Hotkeys

| Key | Action |
| :--- | :--- |
| **Z** | Toggle bot ON/OFF |
| **C** | Soft-cap commit ~25% |
| **V** | Lock 40% commit |
| **B** | Return to adaptive ratio |

## Architecture

See `docs/SOURCE_MAP.md` for full dump ↔ live symbol map.

```
Sense (vision, optional) → Decide (phase + free land) → Act (MAIN dF/dJ/hg)
```

Clicks are **disabled** when internal is ready (`useInternalOnly = true`).
