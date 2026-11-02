# ENG-01: current-source integration repair

2026-11-02, America/New_York. **Integration accepted on the source below;
stronger gameplay is not established.** This implements only ENG-01 from the
user-supplied independent audit. ENG-02 through ENG-13 remain separate work.

## Identity and original failure

Baseline: `main` at `ddc2c29139410b434f5f26c23ac9fe221916c284`, extension
10.3.11, policy V2.8.2. The reused worktree was clean when the scoped
`codex/eng01-source-repair` branch started. Earlier uncommitted cross-ticket work
was preserved locally on `codex/engine-improvements` at `45f1b38`; it is absent
from this patch. The main checkout's untracked dump files were preserved.

| Identity | SHA-256 |
| --- | --- |
| Baseline runtime | `0a3dfb07d29e39ff394345162d7858d8d33943dc4332fb0f789de0b1dc9b8cb6` |
| November 2 official source | `0446414b842bfcf43078afb98f50fcce60ecf740d82b5e418ba714cd31df4e04` |
| Tested 10.3.12 runtime | `6191c1e7794cc4e452d8e6d7455019a066ff8ce0646969e0271431d984bff055` |

Production policy remains **V2.8.2**. The version/timestamp change identifies
this adapter release; it does not activate the earlier local policy changes.

On unchanged code, `npm test` passed 155 Node cases plus existing assertion
suites. The three fresh-source gates each exited 1: arithmetic could not locate
the trusted economy constructor; bootstrap and spatial checks rejected the
unknown contract. The source was 683,989 UTF-8 bytes / 682,467 JavaScript string
code units. The new two-case source regression also failed on unchanged code.

## Root cause, changed code and mathematical proof

The game renamed capabilities while retaining the tested ordinary land
arithmetic. Names alone are insufficient to accept a family. `source-adapter.js`
now recognizes **live-modern-v6** only when all 13 independently inspected
structural signatures match: debit, sender, fronts, slider, cap, ownership,
living-state, income, rounding and the actual economy constructor binding.
Removing any required signature or mutating the checked debit/rate operators
is covered by negative tests.

| Role | Canonical v4 binding | Verified November 2 binding |
| --- | --- | --- |
| Bank / land / alive arrays | `y.ax` / `y.aO` / `y.an` | `ah.hb` / `ah.hN` / `ah.nU` |
| Actor / player slots / humans | `c.t` / `c.c2` / `c.aI` | `aE.fJ` / `aE.fW` / `aE.ku` |
| Soft-cap maximum | `c.aXJ` | `aE.a6e` |
| Economy instance / constructor | `ay` / `aJR` | `af` / `cd` |
| Interest / income / clock | `ay.bb` / `ay.b8` / `bc.ql` | `af.aDc` / `af.ee` / `bi.kr` |
| Incoming / target busy / front count | `a0n.pv` / `a0n.q5` / `a0n.q7` | `ae.hc` / `ae.kF` / `ae.gg` |
| Human command / slider | `ss.a1M.xn` / `nl.a1R` | `bB.hz.i6` / `aS.i3` |
| Match identity / living-state guard | `y.bW` / `y.xR` | `ah.h1` / `ah.a5a` |

Offline token matching generated hypotheses only. Its one-vote proposal for the
economy constructor was wrong and was rejected: inspection established the
actual `af` construction and income call path. No discovery/inference script or
automatic rename matching ships in the extension.

The runtime uses explicit reviewed binding maps to instantiate the existing v4
capability recipe for v6, avoiding another copied shadow-hook implementation.
The lexical helper handles this known recipe and extracted arithmetic fragments;
it is not a general JavaScript parser. Unknown families still throw/reject.
The v4 path is retained unchanged.

The arithmetic gate extracts **original** functions, alpha-renames identifiers
into the canonical VM environment and runs independent expected arithmetic.
Operators, constants and branches are not replaced with model predictions.
The native debit is independently rechecked with integer arithmetic:

```
tax = (24*B + 1) div 2048
requested = B*(sliderCode + 1) div 1024
sent = min(requested, B - tax)
debit = sent + tax
```

The recorded commands have sufficient bank, so `B-tax` is nonnegative. These
ordinary human-command equations do not substitute for bot/resource-mode rules;
the separate bot oracle is retained. Geometry, reinforcement/refunds and
scheduler behavior are checked only within the documented source-fixture scope.

Changed boundaries:

- `content/source-adapter.js`: explicit family recognition, binding maps, recipe
  adaptation and exported validation helpers.
- `content/preloader.js`, `content/main-hook.js`, `shared/capital-policy.js`:
  admit the verified new family without changing policy or guard thresholds.
- `research/planner/planner-observer.cjs`: opt-in native observer accepts the
  matching stable v6 delegation; it still calls each original exactly once.
- `tools/validation/planning-native-math.cjs`: original-routine extraction on
  supported v4/v6 families; independent oracles unchanged.
- Browser/spatial harnesses and `tools/lib/native-fixture.cjs`: test-only
  canonical private-field access. No fixture initialization/mutation is added
  to the production import closure or official match.
- `tests/unit/source-v6.test.cjs`: structural rejection, native facade/reset,
  map round-trip/unknown-family rejection, retained live evidence and exact ledger.
- Release metadata: 10.3.12, updated **2026-11-02 15:58:44 EST**; engine remains
  V2.8.2. The manifest still contains 41 runtime files and both existing worlds.

Entry lines in the repaired source: `content/source-adapter.js:9` (binding maps),
`:19` (lexical mapping), `:122` (required signatures), `:722` (v6 export);
`content/preloader.js:38` and `content/main-hook.js:272` (admission);
`tools/validation/planning-native-math.cjs:33` (original-routine oracle);
`tools/lib/native-fixture.cjs:3` (test-only access). The scoped PR diff identifies
all remaining changed lines. Pinned old audit line numbers refer to the baseline.

## Validation results

| Gate | Before | After |
| --- | ---: | ---: |
| Source-dependent math/live/spatial exits | 1 / 1 / 1 | 0 / 0 / 0 |
| New initial source regression | 0 / 2 passing | 2 / 2 passing |
| Full Node subtests, including final evidence checks | 155 | 159 |
| Native income/debt comparisons | unavailable | 1,512 |
| Native human / bot command comparisons | unavailable | 6,144 / 6,144 |
| Source-fixture combat / income cases | unavailable | 292 / 54 |
| Ownership cells / player slots reconciled | unavailable | 262,144 / 512 |
| Exact native function restoration checks | unavailable | 16 |
| Spatial support arithmetic / full audits / restored ownership hooks | unavailable | 252 / 9 / 5 |
| UI checks / screenshot comparisons / accessibility scans | historical | 170 / 13 / 17 |
| Serious/critical accessibility violations | historical | 0 |

The v4 arithmetic audit also passed its 13,800 cases on the retained older source.
The frozen 80-state behavior checks and original safety regressions still pass.
Browser fixtures, UI state, accessibility, import closure and packaging passed.

The complete **validation command/exit-code log**, timestamps and raw text are
in the [evidence manifest](../evidence/eng01/2026-11-02-eng01.json) and its hashed
compressed log artifact. Initial failures are retained. One intermediate edit
introduced an invalid generated signature string; its failing output is kept
under `green-source-v6`, followed by the passing correction. That was an
implementation error, not another game-source failure.

The dated October 30 diagnostic CLIs intentionally require the old runtime hash;
they are not release regression tests to weaken or rewrite after repair. Their
original findings remain in the October 30 review. The current CPU benchmark
compares a different historical policy at `188b1bf`; it is not an isolated speedup
measurement for this patch.

## Installed MCP test and negative outcome

A dedicated new Chrome profile was created for this test. Playwright MCP loaded
the frozen unpacked extension through browser-level CDP. Chrome **156.0.8078.74**
reported extension 10.3.12, policy V2.8.2, experiment off and the v6 contract.
The **actual preloader XHR response**, not a subsequent GET, matched the source
hash above; exactly one response was captured per navigation and its string
length matched preloader metadata. Original downloaded game HTML and browser
profile data stay outside Git.

The prospective integration plan fixed Europe, 512 players, visible **Impossible**
(native value 5), 1280×900, spawn `(560,440)`, normal scheduling, no manual combat,
and a 90-second cutoff. It was an integration smoke test, not a randomized or
paired policy comparison. A procedural seed recorded on this geographic map
must not be treated as a frozen opponent-placement seed.

Attempt 0 failed before spawn: DPR=2 affected the canvas placement, and native
land/tick remained zero. Its settings/selection screenshots and record are
retained as **one setup error**, not a loss. An initial reconnect/leaderboard
explanation was a hypothesis and was corrected in the journal. Retry 1 initialized
a fresh page at DPR=1 with the same source, settings and assigned coordinates.
No gameplay runtime was edited between attempts.

| Retry 1 observation | Measured value |
| --- | ---: |
| Outcome | **Loss** |
| Time from confirmed spawn to terminal observation | 50.819 s |
| Final native tick / territory | 904 / 0 |
| Peak observed territory | 1,997 cells |
| Captured decisions | 537 |
| Submissions / receipts / native admissions | 31 / 31 / 31 |
| Unique command joins | 31 / 31 |
| Exact-debit / reserve / planner-ceiling violations | 0 / 0 / 0 |
| Observer drops / errors / remaining buffered events after drain | 0 / 0 / 0 |
| Manual combat commands / scheduler acceleration | 0 / 0 |

The sampled terminal duration is not an exact conquest timestamp. The cumulative
observer count is authoritative for command exposure: the orchestrator's ordinary
counter resets on game end and reports zero in the final sample. Every admission
was joined by the single-flight receipt interval plus exact native target/code.
Observer tails were explicitly stopped and drained. Wrapper removal was checked
in the installed page; exact original identity restoration is tested separately
by the source integration fixture. Negative outcomes are retained without pooling
them into earlier experiments or claiming a treatment effect.

[Terminal screenshot](../evidence/eng01/2026-11-02-retry1-finish.png),
[confirmed spawn](../evidence/eng01/2026-11-02-retry1-start.png).

## Performance: separate measurement scopes

| Measurement | Environment / samples | P50 | P95 |
| --- | --- | ---: | ---: |
| v4 snippet construction | Node v26.12.1, M4; 10 warmups + 100 calls | 0.000375 ms | 0.000875 ms |
| v6 snippet construction | Same Node setup; 10 warmups + 100 calls | 0.790792 ms | 0.863583 ms |
| Actual submission-to-receipt wall time | Installed Chrome; 31 commands | 8 ms | 12 ms |

The Node rows measure recipe construction for different source families, once
per bootstrap in ordinary use. The Chrome row includes bridge/observer/scheduling
latency and is **not** CPU time, native acknowledgement ticks, a GC profile or
end-to-end planning cost. The recorder's segment timings exclude original calls.
No allocation/CPU reduction, startup P50/P95, responsiveness gain or strength
improvement is claimed. [Raw timing fixture](../evidence/eng01/2026-11-02-adapter-timing.json).

## Safety acceptance and next work

- Unknown/mutated source: negative recognition tests reject; native admission
  is not made unconditional.
- Exact debit, integer slider ceilings, reserves, active fronts, busy/illegal
  targets, disabled actions and single-flight dispatch: original regressions pass;
  the installed 31-command ledger checks debit/reserve/planner ceiling and target.
- Match token and live arrays: facade tests observe replaced arrays/tokens.
  This patch does not implement ENG-03 belief resets or ENG-09 intent provenance.
- Research defaults: unchanged; no tree/frontier policy activation. Capital-v1
  stays off and retains its existing explicit single-player activation boundary.
- Observer teardown, bounded journals and available tails: verified as above;
  no missing event is invented. Profile cleanup closes only the owned test browser.
- Frozen fingerprints and historical evidence: unchanged. Packaging excludes
  tests, tools, research journals, downloaded source and credentials.

**Next ticket: ENG-02**, complete physical-neighbor risk before target truncation,
with 0/1/32/33/64-neighbor independent oracles and live reserve revalidation.
ENG-03 follows separately. The local cross-ticket WIP is useful prior work, not an
accepted substitute for these scoped regressions. ENG-11 remains a source-derived
hypothesis until its 25,600-component test is reproduced. Full ENG-13 efficacy
needs a separate frozen whole-match evaluation; this single loss cannot satisfy it.
