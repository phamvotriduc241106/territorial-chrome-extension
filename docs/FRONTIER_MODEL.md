# Frontier observability and shadow baseline

Release 10.3.3 / production engine V2.8.2. Updated 2026-10-07 20:39:28 EDT.

Production remains V2.8.2. The static shadow and the new, separately loadable
dynamic research candidate are **disabled by default**, local only and never
change production policy or spending safety. Tree search remains disabled.
Recorded estimates are offline diagnostics and are not automatically applied.

## Immutable spatial recording and dynamic research

Use `frontier.start({spatial:true,capacity:16384,maxBytes:33554432})` to additionally
record exact cell ownership. The first reconciled snapshot is exported as
`spatial_baseline` with `owner-rle-v1` encoding. Subsequent
`native_spatial_delta` records carry base/new spatial versions, match and source
versions, raw and observation ticks, `[index,oldOwner,newOwner]` changes and native
territories. Combat changes have actor, target and stable native front IDs;
outside-combat changes are explicitly unsupported, not assigned to a fictitious
attack. `native_batch` carries exact candidate indices and ordered source frontier
cells. Reinforcement, return, external credit and debit events retain source
states and their own provenance. Never infer conquest from front disappearance.

Snapshots hide their buffers in a WeakMap. Sparse replay copies only touched
256-cell pages and reconciles every native player count before publishing a new
immutable version. Match/version/old-owner/count mismatches fail closed. Maximum
grid size is 4,194,304 cells; a delta has at most 32,768 writes and a rollout overlay
at most 32,768 changed cells by default. The main baseline export rejects more
than 262,144 RLE integers. The recording ring has a default 8 MiB conservative
serialized-byte bound (64 KiB–32 MiB configurable), independent of its event cap.
This byte bound is not a JS heap guarantee. Export/drop counts must be checked.

Only explicit spatial recording adds five reversible native ownership-writer
hooks and the additional debit/credit hooks. Source routine signatures are
verified first. Sink failures do not escape into native game code; instead they
invalidate telemetry. `stop()` restores wrappers and releases current snapshots.
No complete grids are exported each tick; full audits are controlled diagnostics.

The dynamic model is **not packaged**. Load `content/frontier-dynamic.js` with the
spatial/core modules for offline research. `simulate(origin,snapshot,horizon)`
uses observed queue order, the 2048-cell source selection limit and native timer
phase, updates contact after each capture, prunes interior/lost queue cells in
native swap order and simulates exact support/debt and land return caps. The
research harness alone exposes the private scheduler phase through a verified
read-only source splice. Missing phase, stale state, unmodeled elimination or
overlay overflow rejects the candidate rather than falling back invisibly.

All three transitions remain independent: aggregate V2.8, static V2.8.2 and
dynamic shadow. See [protocol](frontier/RESEARCH_PROTOCOL.md) and the dynamic
validation report for the 16-development/8-frozen split, category coverage,
match-clustered uncertainty, conditional ETA and runtime limits.

## Record a local single-player session

Reload the extension and open a fresh game tab. In the game page's MAIN-world DevTools console:

```js
window.__TIO_HOOK_API__.frontier.start({ capacity: 16384, horizons: [2, 5, 10, 20] })
// Start before the match for complete-match fitting. Play normally.
// Save EACH drain as a separate JSON file; full native logs fill quickly.
copy(JSON.stringify(window.__TIO_HOOK_API__.frontier.drain(), null, 2))
window.__TIO_HOOK_API__.frontier.stop()
```

`copy()` is a Chrome DevTools utility. Save the copied JSON manually; there is no automatic file write or upload in the extension. Save the final `stop()` result too. `report()` copies without draining; `drain()` empties only the retained ring, not episode state or pending forecasts. Default capacity is 4096; allowed range is 32–16384. If records are dropped, a match is not eligible for complete-match fitting. From the isolated world, `await window.__TIO_internal.frontierShadow('start', options)` and `'report'`, `'drain'` or `'stop'` use the versioned bridge. Do not confuse the two JavaScript worlds.

```sh
node tools/frontier-report.cjs chunk-1.json chunk-2.json chunk-final.json
node tools/frontier-fit.cjs chunk-1.json chunk-2.json chunk-final.json
# Controlled research recording: 3 isolated Very Hard matches, 20000-tick cap.
node tools/frontier-record.cjs 3 20000
```

The report computes paired total actor-territory, attack-specific captured territory, balance and valid native-termination ETA MAE/RMSE/P95. It groups by complete match, episode and horizon, and separates current native reinforcement flag from reinforcement actually observed during the interval. Coverage, pending/unpaired/censored forecasts and censoring reasons remain in the denominator. Empty metrics are `null`, not zero. It deduplicates event IDs, rejects conflicting labels and independently checks the command ledger against purported valid scores.

Complete means recording began at tick 0, the competition became active, a terminal at-most-one-alive state was observed, and no telemetry gaps/drops occurred. Merely watching our player die is not a complete match. The fitter uses two or more complete training matches and a disjoint complete held-out match when available; insufficient data is explicit. No policy promotion or win-rate claim is produced. See FRONTIER_CALIBRATION.md for the controlled recordings and identifiability limits.

## Native source boundary

Only modern-v3 has the verified ownership decoder: native offset `4*cell`, `ad.h9/fR/fQ`, dimensions `bV.fk/fl`. Owner IDs remain per player; neutral is `aE.fW`; non-land terrain is 65535. Every owner count must equal native `ah.hN` or extraction fails. Maximum raster is 4,194,304 cells. No image-color inference is substituted on failure.

The static-frontier extraction raster is temporary and is never embedded in production planning states. The separately opt-in spatial recorder above exports one bounded baseline and sparse deltas, not a raster every tick. Four-neighbor contacts in the static baseline are extracted only around our player. Maximal straight runs split on owner/orientation changes or every 32 edges. The snapshot has compact typed owner/length/centroid/normal/ID and CSR graph arrays. Candidate target cells are deduplicated separately from boundary length: a corner can touch one target cell on two edges. Maximum 512 segments; overflow rejects the whole geometry rather than omitting contacts. Water, diagonal contact and absent owner pairs cannot invent adjacency. This is not yet adaptive curvature, depth or chokepoint inference. IDs persist for unchanged exact runs, not after split/merge.

Snapshot provenance includes `(matchId, stateVersion, sourceStateVersion, gameTick, geometryVersion)`. `stateVersion` is the whole-observation counter; `sourceStateVersion` is our monotonic native-event serial, not a counter supplied by the game. `gameTick` is the native raw clock. During-tick events also carry `observationTick = gameTick + 1`; between-tick events use the current tick. End-of-tick observations have exact due ticks. Native `ah.h1` replacement identifies a new match. Session/match IDs are local random IDs, not account/browser identifiers. Logical attack/front IDs come from native actor-target admission lifetimes; re-launch receives a new ID. Geometry segment IDs are separate and do not persist through split/merge. Pure rollouts reject mismatched geometry; mutable native objects never reach search.

## Conditional source arithmetic

For candidate-cell count `C`, attack force `A`, defender bank `B`, territory `T`, incoming counterforce `I` and native cell cost `g`:

```text
round(a,b) = floor((a+0.5)/b)
forcePerCell = round(A,C)
defense = round(C*B, 1+round(10*T,16))
captureCost = C*g + 2*defense + I
offered = forcePerCell*C
capture C cells only if offered > captureCost
```

Normal batches with `forcePerCell <= g` cannot advance. Neutral batches consume `C*g`. Hostile losses absorb incoming counterforce first, then debit the defender bank using native integer arithmetic. This matches the original native routines in 292 controlled cases. Native reinforced batches can draw additional bank support and are **not** represented by this normal-batch kernel. The source exports their reinforcement flag in outgoing observations.

The existing **static** model still uses initial target-contact counts and a territory-dependent estimated cadence (4/3/2/1 ticks). Its timer phase, fresh-launch delays, cell selection, geometry evolution and huge-empire updates remain estimates. Reinforcements and refunds are observed, not simulated in that baseline; affected intervals in the schema2 live recorder are censored. Lost/stopped static attack mass is discarded, not refunded. Captures are incremental and conserve hostile territory. These limitations do not describe the separate dynamic candidate above. Neither model claims a trained opponent policy or a probabilistic ETA distribution.

The synchronous API remains `transitionPlanningState(state, action, ticks)`. Only explicit `frontierExperiment: true` with compatible geometry chooses the experimental branch, labelled `native-cost-static-frontier-shadow`. All ordinary callers remain `aggregate-combat-estimate`. Commands and economy use the shared V2.8 arithmetic once; zero/negative time still applies one command without stepping time.

## Telemetry and next gate

Opt-in native hooks observe each actual end-of-tick state. A 50 ms fallback poll never substitutes a late tick for a missing exact label. Geometry scans are at least 10 source ticks and normally 500 ms apart (`geometryIntervalMs: 0` is for controlled research). Each contact episode receives 2/5/10/20-tick predictions at fresh origins, no more often than every 20 ticks. Failed scans log uncovered aggregate baselines; waiting between successful scans does not pin forecasts to a permanently geometry-free phase. No scans or wrappers remain while disabled.

All native land admissions/topups, bank debits and transfers enter a global event ledger, including commands unrelated to the episode. Forecasts condition on observed active forces; subsequent commands involving the actor or defender censor them. Known third-party fronts touching either participant also invalidate model coverage. Reinforcement deliveries, native return credits, clock gaps, missed exact ticks and recorder failures censor affected intervals. Bank/capture tracking remains separate, and selective exact actor snapshots avoid stale labels after adjacency changes. Coverage is explicitly native land-front/debit/transfer coverage, not a complete fleet/boat or diplomacy model.

Every native batch logs candidate cells, force, counterforce, actor/target bank/debt/territory, reinforcement flag and exact territory/balance deltas. Native return/removal/clear events log the actual reason and settlement state; return credit uses the native remaining force, not the prior stored force. A known native return can label duration; generic removal/clear, disappearance and left-censored launches cannot. Target elimination is an explicit observed alive flag, never inferred conquest by this attack. Stop censors outstanding horizons and restores original functions. The ring reports dropped records; drain frequently.

`TIOGetPerformance().metrics['frontier.extract']` measures actual inclusive raster+geometry time, including failed scans; `frontier.transition` times experimental state advancement. Timings from initial maps are not enough to justify a worker layout or claim CPU/battery savings. The current stage intentionally adds no worker, SAB, WASM or GPU machinery.

Before policy influence: expand beyond controlled neutral-expansion windows to representative contested fronts, fleets and real autoplay matches; retain censored/error observations; split by complete match/map/source; test contact-growth, reinforcement/refund and cadence/ETA models on unseen matches. Censoring is selection bias, not evidence the model works on excluded intervals. Profile complex mid/endgame states before proposing parallel compute. MPC/UCB must not consume this model yet; the prospective 20-match Very Hard campaign remains separate.
