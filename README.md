# Territorial.io Auto Commander (v9.0.0)

Chrome **Manifest V3** extension for [Territorial.io](https://territorial.io).

## v9.0.0 — greatest source surgery

Built directly from your full game dump (`source code.html`) + live site mapping.

### What the bot does (single-player INTERNAL)

| Priority | Dump symbol | Action |
| :--- | :--- | :--- |
| 1 | `dF` / empty `b1` | Expand free land first |
| 2 | `dJ` + `cl` | Crush weakest (if `me/8 > enemy`, force finish troops) |
| 3 | `co` | Pressure closest/smallest |
| 4 | `cE` tax | `al(3·B, 256)` overhead respected |
| Act | `bB.hZ.hg(il,jd)` | Live human path — **no canvas mouse** |

Hard bot tables (live `aF` / dump `dU`):

- Commit ≈ **29%** of balance (`il=300`) on Hard attacks  
- Up to **4 fronts** per pulse (`ki=4`)  
- Density soft-cap ≈ **100 × territory pixels** → expand when over-dense  
- Reserve floor ≈ **3.1%**

### Control flow

1. **MAIN world** (`main-hook.js` @ `document_start`) intercepts the game IIFE, exports `__TIO_GAME__`, runs source-faithful brain  
2. **Isolated world** (`internal.js`) talks via `postMessage` — never touches OS mouse  
3. **Orchestrator** (`content.js`) arms only after **you** click spawn on the map  

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
| **V** | Soft-cap commit ~50% |
| **B** | Full hard ratio |

## Architecture

See `docs/SOURCE_MAP.md` for full dump ↔ live symbol map.

```
Sense (vision, optional) → Decide (phase + free land) → Act (MAIN dF/dJ/hg)
```

Clicks are **disabled** when internal is ready (`useInternalOnly = true`).
