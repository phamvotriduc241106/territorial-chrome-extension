# Frontier observability and shadow baseline

Release 10.3.2 / engine V2.8.2. Updated 2026-10-07 10:19:32 EDT.

This implements action-conditioned observation/geometry/shadow telemetry, not a completed calibrated frontier engine. It is **disabled by default**, local only and never changes production policy or spending safety. Tree search remains disabled. Recorded estimates are offline diagnostics and are not automatically applied.

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

The raster is temporary and is never embedded in planning states or exported. Four-neighbor contacts are extracted only around our player. Maximal straight runs split on owner/orientation changes or every 32 edges. The snapshot has compact typed owner/length/centroid/normal/ID and CSR graph arrays. Candidate target cells are deduplicated separately from boundary length: a corner can touch one target cell on two edges. Maximum 512 segments; overflow rejects the whole geometry rather than omitting contacts. Water, diagonal contact and absent owner pairs cannot invent adjacency. This is not yet adaptive curvature, depth or chokepoint inference. IDs persist for unchanged exact runs, not after split/merge.

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

The experimental model still uses initial target-contact counts and a territory-dependent estimated cadence (4/3/2/1 ticks). Recorded native data support those median cadences but do not resolve private timer phase, fresh-launch delays, selection limits, geometry evolution or huge-empire updates. Reinforcements and refunds are observed, not yet simulated; affected intervals are censored. Lost/stopped experimental attack mass is discarded, not refunded. Captures are incremental and conserve hostile territory exactly. Neither an ETA distribution nor a calibrated Lanchester law is claimed.

The synchronous API remains `transitionPlanningState(state, action, ticks)`. Only explicit `frontierExperiment: true` with compatible geometry chooses the experimental branch, labelled `native-cost-static-frontier-shadow`. All ordinary callers remain `aggregate-combat-estimate`. Commands and economy use the shared V2.8 arithmetic once; zero/negative time still applies one command without stepping time.

## Telemetry and next gate

Opt-in native hooks observe each actual end-of-tick state. A 50 ms fallback poll never substitutes a late tick for a missing exact label. Geometry scans are at least 10 source ticks and normally 500 ms apart (`geometryIntervalMs: 0` is for controlled research). Each contact episode receives 2/5/10/20-tick predictions at fresh origins, no more often than every 20 ticks. Failed scans log uncovered aggregate baselines; waiting between successful scans does not pin forecasts to a permanently geometry-free phase. No scans or wrappers remain while disabled.

All native land admissions/topups, bank debits and transfers enter a global event ledger, including commands unrelated to the episode. Forecasts condition on observed active forces; subsequent commands involving the actor or defender censor them. Known third-party fronts touching either participant also invalidate model coverage. Reinforcement deliveries, native return credits, clock gaps, missed exact ticks and recorder failures censor affected intervals. Bank/capture tracking remains separate, and selective exact actor snapshots avoid stale labels after adjacency changes. Coverage is explicitly native land-front/debit/transfer coverage, not a complete fleet/boat or diplomacy model.

Every native batch logs candidate cells, force, counterforce, actor/target bank/debt/territory, reinforcement flag and exact territory/balance deltas. Native return/removal/clear events log the actual reason and settlement state; return credit uses the native remaining force, not the prior stored force. A known native return can label duration; generic removal/clear, disappearance and left-censored launches cannot. Target elimination is an explicit observed alive flag, never inferred conquest by this attack. Stop censors outstanding horizons and restores original functions. The ring reports dropped records; drain frequently.

`TIOGetPerformance().metrics['frontier.extract']` measures actual inclusive raster+geometry time, including failed scans; `frontier.transition` times experimental state advancement. Timings from initial maps are not enough to justify a worker layout or claim CPU/battery savings. The current stage intentionally adds no worker, SAB, WASM or GPU machinery.

Before policy influence: expand beyond controlled neutral-expansion windows to representative contested fronts, fleets and real autoplay matches; retain censored/error observations; split by complete match/map/source; test contact-growth, reinforcement/refund and cadence/ETA models on unseen matches. Censoring is selection bias, not evidence the model works on excluded intervals. Profile complex mid/endgame states before proposing parallel compute. MPC/UCB must not consume this model yet; the prospective 20-match Very Hard campaign remains separate.
