# ENG-01: November 9 current-source integration repair

2026-11-09, America/New_York. **Integration accepted on the source below;
stronger gameplay is not established. The installed run was CLI-driven, not
MCP-driven** (see [installed flow](#installed-flow-and-negative-outcome)).
This repairs only ENG-01. ENG-02 and later tickets remain separate work.

## Identity and original failure

Baseline: `main` at `de35c3b97c6beaeb9e631e2fababe2daf1c80431`, extension
10.3.12, policy V2.8.2. Work was done on the scoped branch
`claude/eng01-source-repair-2026-11-09`, based on the current `origin/main`.
The untracked `repo_dump.txt` / `repo_dump_extra.txt` files were preserved and not staged.
`codex/engine-improvements` (`45f1b38`) was not used.

| Identity | Value |
| --- | --- |
| November 9 official source SHA-256 | `2c70f903a601cb0725776bb1843567c5efca84bbe61a5a58b8ab44d7ca511066` |
| Source size | 705,217 UTF-8 bytes / 703,690 JavaScript string code units (the preloader `bytes` field is the latter) |
| Tested 10.3.13 runtime (`releaseSha256`) | `d8e7f0b05f8a1818ebb521af9ce37eed0a79dc24ac96616f45bd0089c3bfe704` |
| Engine file SHA-256 | `cd4d9765fd0e68954dbd5caa612cd8c33d33c1063d9a73f9010f1a575901c67e` |
| Environment | Node v26.12.1, Apple M4, macOS 27.2, Chrome 156.0.8078.80 (installed run) |

The same hash was observed in all of these places:
- the initial capture (21:13 UTC);
- two later fresh-fetch rechecks (21:27, 21:28 UTC);
- the fresh `test:math-native`, `test:live` and `test:spatial` fetches;
- the executed preloader XHR of the installed run.

No source change occurred between stages. Downloaded HTML stays in ignored `scratch/`.

On unchanged code, `npm test` passed 159 Node cases. All three fresh-source
gates exited 1 with `unknown`:
- arithmetic: `Unsupported native arithmetic source: unknown`;
- bootstrap: `Unsupported live source: unknown`;
- spatial: `Unsupported native spatial source: unknown (2c70f903…)`.

Twelve of the thirteen v6 signatures were absent; only `af=new cd()` remained.

## Root cause: renamed bindings plus one real guard change

The official bundle was re-minified, so every private name in the verified
recipe changed. Some names moved **across roles**: v6 `ae.gm` was the front's
troop count, while current `ae.gm` is its target and `ae.gn` the troop count.
Name similarity alone would have produced a wrong map.

**Hypothesis generation (not shipped).** No retained copy of the November 2
bundle exists. A public Internet Archive snapshot of the official page
(2026-10-28 04:18:56 UTC) is recognised as `live-modern-v4` by all nine v4
signatures, and v4 names are the canonical names of the adapter recipe. A
whole-file token diff gave weak and noisy votes. Pairing instead *function units
with identical token shapes* (2,055 unique pairs) produced a **unanimous, unique**
correspondence for every recipe binding (43 globals, 81 members, bijective). The
archived page is not committed.

**Verification.** For each native routine the recipe reads, wraps or
executes, the v4 unit and the current unit were tokenized. Mapped names were
translated back, and all other identifiers were canonicalised by first use.
The results:

| Routine (v4 → current) | Result |
| --- | --- |
| Economy constructor `aJR → cd`, income/interest/cap/transfer | Alpha-equivalent (1,364 tokens) |
| Front manager `pk → cc` (active, force, count, target, troops, flag, add, remove) | Alpha-equivalent (1,244) |
| Interest table `aPX → aRs`, `aPY → aNo`; batch `abQ → gi`; return `a0e → gq`; tick `sf → nC` | Alpha-equivalent |
| Human/bot/naval debit `aTe → n6`, `aHD → k4`, `aED → m8`; credit `py → gz`; `aYY`, `aTU`, `aNK`, `aNL` | Alpha-equivalent |
| Guards `a1D → hm`, `bZ → hn`; rounding `aN → g1`; clamp `a0 → il`; slider `a1R → i5`; storage `fG → yO` | Alpha-equivalent |
| **Human command class `aRu → qo`** (sender `xn → i8`) and `aRv → qp` | **Changed: a new guard on every method** |
| Start routine `qu → a85` (test fixtures only) | Changed: sets the new guard, resets `a3q`, reorders resets |

**Actual mechanic change.** Every human command now begins with
`if(aE.hk){return;}`. The flag is set in the start routine as `this.hk=this.data.a86`.
`data.a86` defaults to 0 and is assigned only on the multiplayer lobby path,
when the local client's index is past the human list (it then selects a
spectated player). The input handlers test `aE.hj||aE.hk||…` (replay ||
spectating). So `aE.hk` is a **spectating** flag that turns commands into a
silent `undefined` return. The adapter makes this explicit: `canAttack` is
false while it is set, and `modern.spectating()` reports it. A void native
return is never treated as admission. In single-player Custom Scenario it was
observed false throughout.

The ordinary land arithmetic did **not** change: the tax, slider, rate, cap,
debt and front routines are alpha-equivalent to the v4 routines whose arithmetic
is checked below.

| Role | v4 canonical | v6 (Nov 2) | v7 (Nov 9) |
| --- | --- | --- | --- |
| Bank / land / alive arrays | `y.ax` / `y.aO` / `y.an` | `ah.hb` / `ah.hN` / `ah.nU` | `ah.hc` / `ah.hO` / `ah.nY` |
| Actor / player slots / humans | `c.t` / `c.c2` / `c.aI` | `aE.fJ` / `aE.fW` / `aE.ku` | `aE.fK` / `aE.fX` / `aE.kw` |
| Soft-cap maximum | `c.aXJ` | `aE.a6e` | `aE.a7w` |
| Economy instance / constructor | `ay` / `aJR` | `af` / `cd` | `af` / `cd` (verified `af=new cd()` beside `ae=new cc()`) |
| Interest / income / clock | `ay.bb` / `ay.b8` / `bc.ql` | `af.aDc` / `af.ee` / `bi.kr` | `af.aF6` / `af.ef` / `bi.kt` |
| Front active / directed force / count | `a0n.q5` / `a0n.pv` / `a0n.q7` | `ae.kF` / `ae.hc` / `ae.gg` | `ae.kH` / `ae.hd` / `ae.gh` |
| Front target / troops / reinforced | `a0n.q8` / `q9` / `qD` | `ae.gl` / `gm` / `gn` | `ae.gm` / `gn` / `go` |
| Human command / slider | `ss.a1M.xn` / `nl.a1R` | `bB.hz.i6` / `aS.i3` | `bB.i1.i8` / `aS.i5` |
| Match identity / living-state guard | `y.bW` / `y.xR` | `ah.h1` / `ah.a5a` | `ah.h2` / `ah.a6r` |
| Spectating guard | — | — | `aE.hk` (new) |

Directed force keeps its verified direction: `ae.hd(player,target)` returns the
troops of `player`'s front against `target` (alpha-equivalent to v4
`pv(player,pt)`). `incoming(t, me)` is therefore force *from* `t` against us; the
old observer field named `exclude` is the target, not an exclusion filter.
Front cap is `p<aE.kw ? (aE.kw<16 ? 12 : 8) : 4` in the native allocator. Unknown
values remain null/unavailable as before.

## Changed code

- `content/source-adapter.js:14` explicit reviewed `V7_GLOBALS`/`V7_MEMBERS`;
  `:17` per-family binding table (v6 entries unchanged); `:29` lexical mapper
  now table-driven; `:147` fifteen required v7 structural signatures, including
  the spectating guard and its source; `:750` v7 export = mapped v4 recipe plus a
  fail-closed `canAttack`/`spectating` replacement that throws unless the
  expected recipe text occurs exactly once.
- `content/preloader.js:38`, `content/main-hook.js:272,1629,1700,1981`,
  `shared/capital-policy.js:9`: admit the verified family (no threshold or
  policy change). `content/main-hook.js:1898`: the `spectating` diagnostic uses
  the verified accessor for v7; older families keep the previous expression.
- `research/planner/planner-observer.cjs:145`: explicit per-family delegation
  table (v3/v4/v6 entries reproduce the previous checks exactly); each original
  is still called exactly once.
- Test-only: `tools/lib/native-fixture.cjs:4`, `tests/browser/run.cjs`,
  `tools/validation/frontier-spatial-gate.cjs`,
  `tools/validation/planning-native-math.cjs:42` family lists.
  `tools/live/live-chrome-audit.cjs:205,211` records the visible selected
  difficulty, a settings screenshot, DPR and viewport. No fixture
  initialisation or private-state mutation enters the runtime import closure
  (repository contract: 41 release files).
- `tests/unit/source-v7.test.cjs` (new, in `npm test`).
- Release metadata: 10.3.13, updated **2026-11-09 16:27:10 EST**; engine V2.8.2.

The lexical mapper is still not a general parser. The 16 stable public getter
*names* (`game.ah`, `game.ae`, …) are v6-era names. Reverse mapping is not
injective for those names only, so the test asserts both:
- each getter resolves to the identically named v7 global;
- the full recipe round-trips byte-for-byte everywhere else, with no
  value/identifier collisions.

## Failing-then-passing regression and mathematical checks

| Check | Original adapter | Repaired |
| --- | ---: | ---: |
| `tests/unit/source-v7.test.cjs` (recognition, mutation rejection, facade/spectating, map round-trip, byte-identical v3/v4/v6 snippets) | 1 / 5 pass (only the negative separation test) | 5 / 5, plus the evidence test = 6 / 6 |
| Full Node subtests (`npm test`) | 159 | 165 (+5 v7 regression, +1 retained-evidence) |
| Fresh math / live / spatial exits | 1 / 1 / 1 | 0 / 0 / 0 |

Negative tests remove each signature and mutate the debit sign, the
`13440-6*` rate, the `12*` tax numerator, the rounding offset and the spectating
guard. Every one returns `unknown`. The v4/v6/v3 injected snippets keep their
pre-repair SHA-256 values.

The arithmetic gate extracts the **original** current routines, alpha-renames
them into the canonical VM environment and compares them with independent
oracles. Operators, constants and branches are unchanged; nothing is compared
against a rewritten copy. The ordinary human land debit oracle:

```
tax = (24*B + 1) div 2048          (= floor((12B+0.5)/1024))
requested = B*(sliderCode + 1) div 1024
sent = min(requested, B - tax)
debit = sent + tax
```

The bot rule keeps its separate oracle. Results on the captured source and on
the fresh fetch (same hash): **1,512 income/debt, 6,144 human and 6,144 bot
command cases**, all exact.

## Validation log

Each command ran separately, with its timestamp, exit code and raw output in the
[evidence manifest](../evidence/eng01/2026-11-09-eng01.json) and its hashed
[log bundle](../evidence/eng01/2026-11-09-eng01-logs.json.gz). Times are UTC.

| Gate | Exit | Result |
| --- | ---: | --- |
| baseline `npm ci` / `npm test` | 0 / 0 | 159 Node cases |
| baseline `test:math-native` / `test:live` / `test:spatial` | 1 / 1 / 1 | source failures (`unknown`), not network or browser setup |
| `source-v7` on original adapter | 1 | 4 / 5 fail (retained twice: initial and final test text) |
| `npm test` (first post-repair run) | **1** | `stale timestamp: docs/CHANGELOG.md`: my ordering error (metadata bumped before the changelog entry); retained |
| `npm test` (rerun) | 0 | 164 / 164; 80 frozen production fingerprints unchanged |
| `node --test tests/unit/planning-math.test.cjs` | 0 | 17 / 17 |
| `npm run test:math-docs` | 0 | pass |
| `npm run test:math-native` (fresh) and captured-file run | 0 / 0 | 1,512 + 6,144 + 6,144 |
| `npm run test:browser` | 0 | bridge 9, main-hook 29, capital-native 22 |
| `npm run test:live` (fresh) and `TIO_LIVE_SOURCE` captured run | 0 / 0 | bootstrap `pre-exec-patched` v7; exact single-player attack debit; 262,144 cells / 512 players reconciled; 292 combat + 54 income; 16 natives restored |
| `npm run test:spatial` | 0 | 252 support cases, 9 full audits, 421 hostile batches, 5 ownership hooks restored |
| `npm run test:ui-state` / `test:ui` / `test:a11y` | 0 / 0 / 0 | 6; 170 checks + 13 visual comparisons; 131 checks, 17 scans, 0 serious/critical |
| `npm run package` / `git diff --check` | 0 / 0 | 41 runtime files |
| Final rerun after evidence/docs: `npm test` / `test:math-docs` / `package` / `git diff --check` | 0 / 0 / 0 / 0 | 165 / 165; runtime hash still `d8e7f0b0…` |

The historical coverage expectations (159 Node cases; 1,512 / 6,144 / 6,144;
292 / 54; 262,144 / 512; 16; 252 / 9 / 5) are reproduced. The only change is
6 added Node cases. The dated October 30 diagnostic CLIs still require their
old runtime hash by design and were not modified or rerun as release gates. The
CPU benchmark compares a historical policy and is not an isolated measurement
of this patch.

## Installed flow and negative outcome

**Control method: CLI automation, not MCP.** No MCP tool in this session could
load an unpacked extension into an owned temporary profile:
- the built-in browser pane uses a persistent profile shared across app sessions and cannot install extensions;
- Claude in Chrome is the user's personal browser and was not used.

The existing recorder `tools/live/live-chrome-audit.cjs` therefore launched its
own temporary system-Chrome profile and removed it afterwards. It loaded the
frozen working tree through browser-level CDP `Extensions.loadUnpacked`, drove
the normal UI with Playwright and ran the existing original-call observers.
**The MCP-controlled installed layer remains unvalidated.**

The prospective plan was written before the attempt:
- Europe (Realistic Map), 512 players, visible **Impossible**;
- 1280×900 at DPR 1, fixed spawn (560,440) as on November 2;
- normal scheduling, baseline V2.8.2, experiment off, no capital-v1/tree/frontier;
- 90 s cutoff, at most one retry after a setup error.

The runtime was frozen at commit `e47e8dd`. It was a smoke test, not a policy comparison.

| Observation | Value |
| --- | ---: |
| Chrome / extension ID | 156.0.8078.80 / `pjinhodmpnafkmbnndonmpkcjjpdinah` |
| Executed preloader XHR (captured before patch) | `2c70f903…` (string length equals preloader metadata) |
| Navigation HTML hash (separate identity) | `5e62998f…` |
| Visible difficulty / native `botDifficultyValue` | 🟢 Impossible / 5 |
| Native players / DPR / spectating / single-player | 512 / 1 / false / true |
| Setup errors | 0 (positive native territory 12 at tick 1) |
| Outcome | **Loss** (native alive=false, territory=0; UI "You were conquered by Chauhan Dynasty") |
| Confirmed spawn → terminal sample | 45.844 s; final tick 820 |
| Peak observed territory / first enemy-contact tick | 1,966 / 436 |
| Decisions / submissions / receipts / native admissions | 581 / 31 / 31 / 31 |
| Unique provenance joins (single-flight interval + exact target + code) | 31 / 31, 0 unused natives |
| Exact-debit / reserve / ceiling / ratio-rounded-up / busy-target violations | 0 / 0 / 0 / 0 / 0 |
| Directed-incoming lookups (valid) | 1,240 (1,240) |
| Observer drops / errors / retained after final drain | 0 / 0 / 0 |
| Manual combat / scheduler acceleration / state writes | 0 / no / none |

Each admission was checked independently with integer arithmetic. All 31 were
neutral expansions (`expand-empty`, target 512). The post-command bank satisfied
both the planner's `minRemaining` and the hook's native-boundary
`minRemainingBalance`, which differ in 8 commands; c25 ended exactly on its 609
floor. Ratio encodings never rounded above the approved ratio. The orchestrator
counter resets at game end, so the observer ledger is the cumulative exposure.

Limitations:
- `start.png` was an all-black compositor capture. It is not committed; native
  samples establish the start.
- Installed-page identity restoration of observer wrappers was not asserted.
  Fixture gates verify 16 + 5 exact restorations.
- Native acknowledgement ticks are unavailable.
- No enemy-attack command occurred, so hostile admission is covered only by
  fixtures in this release.

Evidence: [manifest](../evidence/eng01/2026-11-09-eng01.json) with raw-file hashes,
[recorder bundle](../evidence/eng01/2026-11-09-eng01-live.json.gz) with full
planner/native tails and the joined ledger,
[difficulty settings](../evidence/eng01/2026-11-09-difficulty-settings.png),
[spawn selection](../evidence/eng01/2026-11-09-spawn-selection.png),
[terminal screen](../evidence/eng01/2026-11-09-finish.png).

## Status by layer

| Layer | Status |
| --- | --- |
| Native arithmetic (original routines vs independent oracles) | **Pass** on `2c70f903…` |
| Source-fixture integration (bootstrap, ownership, combat, income, restoration, spatial) | **Pass** on `2c70f903…` |
| Installed extension, official single-player Impossible | **Pass** for integration via CLI automation (31 exact admissions); **MCP-controlled: unvalidated** |
| Gameplay strength | **Not established**: one loss at 45.8 s; no comparison, no win-rate claim |

## Performance: separate scopes

| Measurement | Environment / samples | P50 | P95 |
| --- | --- | ---: | ---: |
| v7 recipe construction | Node v26.12.1, M4; 10 warmups + 100 calls | 0.826 ms | 0.964 ms |
| v6 recipe construction | same | 0.813 ms | 0.921 ms |
| Installed submission → receipt wall time | Chrome 156; 31 commands | 6 ms | 10 ms |

The Node rows run once per bootstrap. The Chrome row includes bridge, observer and
scheduling latency; it is not CPU time, native acknowledgement ticks or GC. No
CPU, startup or strength improvement is claimed.
[Raw timing](../evidence/eng01/2026-11-09-adapter-timing.json).

## Remaining uncertainty and next work

- The rename map rests on the archive snapshot plus alpha-equivalence and the
  gates above. A future bundle needs a new family; unknown sources still fail closed.
- The spectating guard is verified structurally and by facade tests. It was not
  exercised live (that would need a multiplayer spectator, which is out of scope).
- The MCP installed layer must be repeated when an MCP tool that can drive an
  owned, extension-capable profile is available.
- **Next ticket: ENG-02**, complete physical-neighbor risk before target truncation
  (0/1/32/33/64-neighbor independent oracles, live reserve revalidation). ENG-03
  follows separately.
