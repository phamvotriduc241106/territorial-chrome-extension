# Runtime bug sweep, 2026-11-09

America/New_York. Branch `claude/repo-bug-sweep-2026-11-09` from `main` at
`d6db1d6` (release 10.3.13, policy V2.8.2). Release after this change:
**10.3.14**, updated 2026-11-09 16:51:15 EST. Policy, spend, reserve and native
command behaviour are unchanged.

## Method

The sweep focused on the 41 packaged runtime files. Research/legacy code is not
shipped and was not changed. Four approaches were used:

1. **Pattern scan** of the runtime for common defect shapes: comparator-less
   sorts, string-compared `toFixed`, radix-less `parseInt`, loose equality,
   `splice` inside forward loops and falsy-zero defaults. Nothing actionable was
   found beyond one harmless edge default.
2. **Randomized invariant fuzzing** of `planSpend` (200,000 contexts) and
   `maxSafeRatio` (100,000) against independent integer checks. The checks
   covered exact human debit, reserve retention for the first command and the
   projected burst, integer slider codes, the 0.72 ratio cap, front slots and
   finite outputs. **No violations.**
3. **Manual review** of the bridge, MAIN-world command handler and spend lock,
   popup and service worker, capital-v1 controller and vision-fallback modules
   (region, enemy, neutral, border, heatmap, controller, coords, optimization,
   economy).
4. **Reproduce before fixing.** Every confirmed defect below has a regression
   in `tests/unit/runtime-defects.test.cjs`. Six of its seven cases failed on
   the unchanged code. The seventh is a control that large connected components
   still merge.

## Fixed defects

| # | Module | Defect and failing input | Effect before fix | Fix |
| --- | --- | --- | --- | --- |
| 1 | `content/region.js` | `UnionFindTable` was fixed at 25,000 labels, while two-pass labelling assigns one preliminary label per unconnected run without bound. Past the limit, `find()` read outside the typed array and returned `undefined`. **400×200 neutral/enemy checkerboard:** 12,500 neutral regions reported instead of 40,000. | Every component past the limit silently merged into one region keyed `undefined`, mixing neutral and enemy cells under one type. The vision grid is ¼ canvas resolution (480×270 at 1080p, 4× that at DPR 2), so noisy frames can reach the limit. | Grow the table to `w·h+1` labels (the maximum possible) before each pass. |
| 2 | `content/enemy.js` | New opponent IDs were `opp_<cell20>_<cell20>_<now>`, and `now` is fixed for the whole update. **Clusters at (101,99) and (95,105) in one frame:** 1 tracked instead of 2. | The second opponent overwrote the first in the tracker map and disappeared from threat ranking. | Append a per-tracker sequence number. |
| 3 | `content/controller.js` | In the paced branch, `fireAttack` returned `true` even when the 6-slot queue was full and the click was dropped. | The orchestrator counted a phantom attack and `recordAttackDispatch` deducted estimated troops for it, corrupting the vision-mode bank estimate. | Return `false` when nothing is queued. |
| 4 | `content/controller.js` | Sword-confirm timer IDs were only removed by `clearQueue()`, which is not called during an uninterrupted armed session. **50 attacks:** 50 stale IDs retained. | Unbounded growth of `_confirmTimers` (about 14k entries/hour at 4 commands/s). | Each timer removes its own ID when it fires. |
| 5 | `content/neutral.js` | Pocket centroids divided an unweighted coordinate sum by a weighted area (`1 + 0.1·pocketLocal` per cell). **Neutral cells beside a mine column at x=12:** centroid x=4, true mean 11. | Exported centroids were pulled toward (0,0). Only `pocketCount` is consumed today, so behaviour was unaffected. | Divide by the member count. |
| 6 | `background/background.js` | `UPDATE_SETTINGS` stored `normalizeSettings(patch)`, which fills every missing key with its default. **Patch `{botEnabled:false}` with stored strategy `defensive`:** strategy became `aggressive`, and click speed and HUD mode were reset too. | Any partial update would overwrite unrelated preferences. No in-repo caller uses this message today, so it was latent. | Merge the patch onto the stored settings before normalizing. |

## Reviewed, not changed

- **Known scoped defects** from the [CS review](../architecture/COMPUTER_SCIENCE_REVIEW_2026_10_30.md)
  remain separate tickets with their own acceptance criteria:
  R2/ENG-02 (risk truncated with targets), R3/ENG-03 (unknown bank treated as 0),
  R4 (vision coordinate domain) and R5 (unbounded spectral input). R2/R3 change
  policy decisions and need explicit before/after fingerprint review.
- `shared/capital-policy.js` computes its slider ceiling with
  `Math.round(ratio*1024)`. An upper bound should never round up, but every
  ratio reaching it is an exact code multiple or 0.06 (which rounds down), so it
  is unreachable. Changing frozen-pilot code was not justified.
- **Cosmetic only:** `ConvexHullEngine` keeps a stale `hullArea` for ≤3 points;
  `AdaptiveScheduler.markDirtyRegion` does not shrink the width for negative
  `x`; `sprayTargets` treats a centroid at x=0 as missing.
- **Checked and found sound:** the isolated↔MAIN bridge (timeouts are backed
  by the MAIN-side 220 ms spend lock), the MAIN handler's arm/ready gating, the
  final reserve re-check before native dispatch, and popup transactional saves.

## Validation

Each command ran separately; raw logs are under ignored `scratch/bug-sweep-2026-11-09/`.
Node v26.12.1, Apple M4, Chrome 156.

| Gate | Exit | Result |
| --- | ---: | --- |
| `runtime-defects.test.cjs` on unchanged code | 1 | 6 / 7 fail (the merge control passes) |
| `runtime-defects.test.cjs` after fixes | 0 | 7 / 7 |
| `npm test` (first run) | **1** | link check: this report did not exist yet (ordering) |
| `npm test` (rerun) | 0 | 172 / 172 Node cases (165 + 7); 80 frozen production fingerprints unchanged |
| `node --test tests/unit/planning-math.test.cjs` / `test:math-docs` | 0 / 0 | 17 / 17; pass |
| `test:math-native` / `test:live` / `test:spatial` | 0 / 0 / 0 | source `2c70f903…` as `live-modern-v7`; 1,512 + 6,144 + 6,144; bootstrap, exact attack debit, 262,144 cells, 292 + 54, 16 restorations; spatial 9 audits |
| `test:browser` | 0 | bridge 9, main-hook 29, capital-native 22 |
| `test:ui-state` / `test:ui` / `test:a11y` | 0 / 0 / 0 | 6; 170 checks + 13 visuals; 131 checks, 17 scans, 0 serious/critical |
| `npm run package` / `git diff --check` | 0 / 0 | 41 runtime files |

No installed match was run: none of these fixes touches the native command path,
and the vision fallback is not exercised by the internal (mapped) pipeline. No
strength or performance claim is made.
