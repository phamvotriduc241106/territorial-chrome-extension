# Neon synthwave theme — v10.3.5

Update stamp: **2026-10-08 13:18:01 EDT**. Production: **V2.8.2**, unchanged.
Local branch: `codex/neon-synthwave-theme`, based on `d0b701e` (UI PR #2).
This theme has not been pushed, merged or validated by a new GitHub CI run.

## Reference and implementation

Reference: `/Users/phamvotriduc/Downloads/Neon Synthwave Commander Dashboard (1).png`.
Image SHA-256: `0b1141f272560084d079be53013e0ae167c6a815e2832c3406da1d36816cf5c6`.
The PNG was read for visual styling and pixel colors; it was not edited or
embedded as an opaque dashboard. All controls and data remain live DOM elements.

| Palette role | Representative sampled PNG RGB | CSS token RGB |
| --- | --- | --- |
| Navy background | 0, 6, 23 | 0, 6, 23 (`#000617`) |
| Neon cyan | 0, 246, 253 | 0, 246, 253 (`#00f6fd`) |
| Neon magenta | 253, 52, 229 | 253, 52, 229 (`#fd34e5`) |
| Bright gold | 255, 255, 125 | 255, 255, 125 (`#ffff7d`) |

Background uses the PNG's most frequent RGB. Accent samples use the most
frequent pixel after isolating the cyan, magenta and gold color ranges; the
image's antialiasing/glow contains many neighboring shades. These exact token
matches do **not** imply pixel-identical reproduction of a 1024×1536 raster in a
360 px browser popup. The original font identities cannot be recovered reliably
from the raster. VT323 pixel headings and Share Tech Mono data were selected to
reproduce the reference's typographic character while keeping text selectable.

Implemented: pink pixel title, decorative SVG pixel sword/grid, cyan section
headings, magenta/cyan framed panels, cyan illuminated switch knobs, gold metric
values, faint static scanlines/grid and local update stamp in the header/About.
Compact and detailed HUDs share the same tokens/fonts. Grid patterns are
decorative; no fabricated ownership map or metric is shown.

The reference's contradictory ACTIVE/DISCONNECTED badge, outdated date,
"press Z to activate", multiplayer implication and guaranteed 220%/2–4-front
claims are not adopted. Live status, enabled-default/spawn verification,
pause/resume, save/retry semantics, actual metrics and policy safety are retained.

## Local font distribution

Both fonts come from pinned Fontsource **5.3.0** packages, with their bundled
**OFL-1.1** licenses shipped alongside the files. No Google Fonts, remote assets,
new extension permissions, CSP relaxation or animation dependency is introduced.
Font-only web-accessible resources use the existing game/local host match scope
so the in-game HUD can load them. The previous test-only Inter dependency is
removed: visual tests now render the actual production fonts.

| Font asset | Bytes | SHA-256 |
| --- | ---: | --- |
| `shared/fonts/vt323.woff2` | 17,936 | `8ddbebcc1048154132e1d78eb9b1f7850bca1b7d857035ccf1cb4318ebc615b6` |
| `shared/fonts/share-tech-mono.woff2` | 13,500 | `41e6b9f297f7d9a2df2aaa274092f76d2f72711a15ca455f7f4f4f92caf16b72` |

Total font transfer: **31,436 bytes**, local to the extension. Packaging includes
40 runtime/license files. Shared CSS URLs and web-accessible resources must stay
inside the explicit package closure.

## Validation

Local bundled Chromium **153.0.8010.12**, macOS:

- `npm test`: existing production suites and 96 Node-runner cases pass;
  all 80 frozen decision/spend fingerprints unchanged.
- `npm run test:ui-state`: five cases pass.
- `npm run test:ui`: 129 assertions, 13 approved macOS screenshot comparisons,
  17 axe scans, zero critical/serious WCAG-tagged findings.
- `npm run test:a11y`: 103 assertions, 17 scans, zero critical/serious findings.
- Deliberate white-background mutation is rejected: 118,111 changed pixels,
  expected exit 1, with the comparison threshold unchanged.
- Actual MV3 popup loads both fonts under the shipped CSP; a real matched local
  page loads both font-only web-accessible resources successfully.
- Keyboard, typed-input protection, save failure, obsolete response rejection,
  fresh/stale metrics, hidden HUD persistence and click-through geometry pass.
- Popup responsive-width checks at 360/288/180 CSS px remain passing; all HUD
  modes stay within 1280×720, 1366×768 and 1920×1080 fixture viewports.
- Compact HUD: **210×138 px**; detailed: **320×455 px**. These are fixture
  dimensions, not a promise that every long status/estimate fits that height.
- 500 warmed HUD renders: local P95/P99 approximately 0.1 ms; a synthetic DOM
  microbenchmark, not a sustained game CPU/energy or win-rate measurement.
- `npm run test:live`: freshly downloaded official source hash remains
  `155a2db1cc6f256317fc6178ce12993c76b51630ba5985be4e9ef1d7cad7fcff`;
  bridge 9, hook 29, combat 292 and economy 54 checks pass; 512 ownership totals
  reconcile. `npm run package` passes with licensed font assets included.

Static glows/scanlines have no pulses, transitions or animation loops. Reduced
motion, visible keyboard focus and text state labels remain enforced. Automated
axe checks do not establish full accessibility or a 9/10 usability score.

## Before a future push

The prior Linux baselines still document v10.3.4. They are intentionally
preserved, **not silently approved for this new theme**. Ordinary Linux visual
CI will reject them until a Linux candidate capture is reviewed and replaced.
No new remote CI success is claimed. Run explicit candidate capture after a
future authorized push, inspect all 13 images, approve Linux baselines, then
rerun ordinary comparison CI at the unchanged 0.5% threshold.

Local reproduction:

```sh
npm ci
npm test
npm run test:ui-state
npm run test:ui
npm run test:a11y
npm run test:live
npm run package
```

Approved macOS screenshots: `tests/ui-baselines/`; local actuals/reports:
ignored `scratch/ui-roadmap/qa/`. `--update` is an explicit review operation,
never an automatic CI approval. The five-person task study and manual
accessibility review from the prior UI roadmap remain outstanding.
