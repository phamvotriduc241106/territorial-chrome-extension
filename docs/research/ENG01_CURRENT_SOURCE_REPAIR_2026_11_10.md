# ENG-01 current-source repair, 2026-11-10

America/New_York. Branch `claude/eng01-source-repair-2026-11-10` from `main` at
`b5eef31` (release 10.3.15). Release after this change: **10.3.16**, updated
2026-11-10 20:28:18 EST. Policy V2.8.2 and the 80 frozen decision/spend
fingerprints are unchanged.

## Identity and original failure

| Item | Value |
| --- | --- |
| New official source | SHA-256 `dbf736fa53c9d7bf0e18688a000ce5170f340c97dabe3194af62de181333b16f`; 705,984 bytes; 704,449 characters as executed |
| Previous supported source | `2c70f903…` (`live-modern-v7`, [November 9 report](ENG01_CURRENT_SOURCE_REPAIR_2026_11_09.md)) |
| Failure | The installed extension's synchronous bootstrap returned `contract-unmapped`, and the adapter classified the bundle `unknown`, so native commands were correctly refused |

The failure first appeared during the Elo baseline campaign
([PR #24](https://github.com/phamvotriduc241106/territorial-chrome-extension/pull/24)). For a period the site also
returned Cloudflare 403 to automated requests; no attempt was made to work
around that. By 2026-11-10 20:22 EST the page returned 200 again, and the
source was fetched once for analysis.

## Root cause: renaming only

All 15 v7 recognition fragments were missing from the new bundle. The method
followed the November 9 repair:

1. **Pair functions by shape.** Function bodies whose shape (identifiers
   normalized away) appears exactly once in each bundle were paired. 2,246 of
   about 3,020 units paired, covering 293,920 tokens.
2. **Vote on renames.** Each pair votes for identifier renames. Composing those
   votes with the v4→v7 binding map gives a v4→v8 map. All **124 bindings**
   (43 globals, 81 members) received unanimous votes, and the map is one-to-one.
3. **Check for real changes.** Among the 278 function units carrying an
   adapter-relevant name, 41 differed in shape. Every one was compared token by
   token with its new counterpart. All were UI code that shares the short
   method names `dk` and `ef`: a build-date string (`"9 Nov 2026"` →
   `"10 Nov 2026"`), shifted message IDs, one button-visibility condition, and
   a reset method on the credit object's UI state. None is arithmetic, command,
   ownership or guard code.
4. **Translate the signatures.** Each v7 recognition fragment was translated
   with the rename votes, and all 15 are present in the new bundle. That
   includes the spectating guard, now `if(aE.hm){return;}` with
   `this.hm=this.data.a8M`.

## Changed code

| File | Change |
| --- | --- |
| `content/source-adapter.js` | `V8_GLOBALS`/`V8_MEMBERS` and a `live-modern-v8` binding family; 15 v8 recognition fragments. The guarded export branch is now shared by v7 and v8, with the guard field per family (`hk`, `hm`). Older families' exports are byte-identical (golden hashes in the test) |
| `content/preloader.js`, `content/main-hook.js`, `shared/capital-policy.js` | Admit `live-modern-v8` wherever v7 is admitted, including the spectating diagnostic |
| `research/planner/planner-observer.cjs` | Explicit v8 delegation entry (`ae.hf`, `bB.i3.iA`) |
| `tests/browser/run.cjs`, `tools/validation/*`, `tools/lib/native-fixture.cjs` | Admit v8 in the harnesses and gates |
| `tests/unit/source-v8.test.cjs` | New regression (below); the v7 test's "next family is unsupported" probe moves to v9 |

**Public getter names.** The 16 getter names on `__TIO_GAME__` are a stable
API and stay identical to v7's. One getter, `bv`, now returns the global `bw`
(the v4 binding `a0f`); no consumer outside the adapter reads it. The test
asserts this exactly.

## Failing-then-passing regression

`tests/unit/source-v8.test.cjs` has five cases. On the unchanged adapter,
**four failed** (recognition, facade, binding map, export). The fifth, a
cross-family control, passed. After the repair all five pass, and so do the
v4, v6 and v7 source tests (18 cases).

The regression checks the following:
- every signature is required;
- changed arithmetic, a changed rounding constant or a removed guard is rejected;
- the facade refuses commands while spectating;
- the map is bijective and round-trips the complete recipe;
- the v8 export is the mapped v4 recipe plus only the guard.

## Validation

Raw logs are under ignored `scratch/eng01-2026-11-10/logs/`. Node v26.12.1,
Apple M4, Chrome 157.0.8103.39.

| Gate | Exit | Result |
| --- | ---: | --- |
| `source-v8.test.cjs` before / after | 1 / 0 | 4 of 5 fail / 5 of 5 pass |
| `test:math-native` | 0 | 1,512 income + 6,144 human + 6,144 bot cases against the fresh native routines |
| `test:live` | 0 | `live-modern-v8` bootstrap; exact attack debit 512 → 404 (debit 108); 262,144 cells, 292 combat + 54 income cases, 16 restorations |
| `test:spatial` | 0 | Source `dbf736fa…`; 252 native support cases, 9 full audits |
| `npm test` | 0 | 187 / 187 Node cases; 80 frozen fingerprints unchanged |
| `test:browser` | 0 | Bridge 9, main-hook 29, capital-native 22 |
| `test:ui-state` / `test:ui` / `test:a11y` | 0 / 0 / 0 | 6; 170 checks + 13 visuals; 131 checks, 0 serious/critical |
| `npm run package` / `git diff --check` | 0 / 0 | 41 runtime files |

## Installed headless check

One installed match was run through the recorder in an owned temporary profile,
**headless** (no window on screen): Custom Scenario, Impossible (native
difficulty 5), 512 players, Europe.

| Observation | Value |
| --- | --- |
| Source binding | `dbf736fa…`, captured from the preloader's synchronous response before patching; contract `live-modern-v8` |
| Release | 10.3.16 |
| Result | Loss, confirmed by the native not-alive flag and zero territory, after 66.7 s |
| Placement | 419th–422nd of 512 |
| Commands | 29 acknowledged, 0 failures, 0 page errors |
| Peak territory | 961 cells |
| Game speed | 17.86 ticks/s, the same as visible-window Europe matches (17.84–17.86) |

Headless screenshots are black: the game canvas is not drawn without a visible
window. The simulation is unaffected (identical tick rate, normal native
state), so headless is a valid playing condition. Screenshots from headless
runs are not usable evidence; the recorder's native state is.

This is an integration check, not a strength measurement. The loss follows the
passive-hold pattern recorded by the Elo baseline in
[PR #24](https://github.com/phamvotriduc241106/territorial-chrome-extension/pull/24). The MCP-driven layer was not used.

## Remaining work

- **Strength.** Re-measure the baseline Elo headless on this source, then screen
  fixes for the passive hold.
- **Future updates.** The game's minified names change with each deployment.
  Each update needs this repair until recognition can be derived safely
  without a hand-reviewed signature list.
