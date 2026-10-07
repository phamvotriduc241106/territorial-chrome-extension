# Frontier observability and shadow baseline

Release 10.3.1 / engine V2.8.1. Updated 2026-10-06 23:11:16 EDT.

This implements the first observation/geometry/shadow stage of the frontier-model roadmap, not a completed calibrated frontier engine. It is **disabled by default**, local only and never changes native commands, decision policy or spending safety. Tree search remains disabled.

## Record a local single-player session

Reload the extension and open a fresh game tab. In the game page's MAIN-world DevTools console:

```js
window.__TIO_HOOK_API__.frontier.start()
// Play normally. Export periodically; only the latest 512 records are retained.
copy(JSON.stringify(window.__TIO_HOOK_API__.frontier.report(), null, 2))
window.__TIO_HOOK_API__.frontier.stop()
```

`copy()` is a Chrome DevTools utility. Save the copied JSON manually; there is no automatic file write or upload. From the extension isolated world, `await window.__TIO_internal.frontierShadow('start')`, `'report'` or `'stop'` uses the versioned bridge. Do not confuse the two JavaScript worlds.

```sh
node tools/frontier-report.cjs shadow-export.json
```

The report computes territory/balance MAE, RMSE and P95 absolute error from paired predictions and the same actual observation. It groups by complete match and deduplicates repeated exports. Empty samples produce `null`, not zero error. These are descriptive, correlated live-trajectory errors, not held-out model-selection evidence. Future player/bot commands are uncontrolled. No policy promotion or win-rate claim is produced.

## Native source boundary

Only modern-v3 has the verified ownership decoder: native offset `4*cell`, `ad.h9/fR/fQ`, dimensions `bV.fk/fl`. Owner IDs remain per player; neutral is `aE.fW`; non-land terrain is 65535. Every owner count must equal native `ah.hN` or extraction fails. Maximum raster is 4,194,304 cells. No image-color inference is substituted on failure.

The raster is temporary and is never embedded in planning states or exported. Four-neighbor contacts are extracted only around our player. Maximal straight runs split on owner/orientation changes or every 32 edges. The snapshot has compact typed owner/length/centroid/normal/ID and CSR graph arrays. Candidate target cells are deduplicated separately from boundary length: a corner can touch one target cell on two edges. Maximum 512 segments; overflow rejects the whole geometry rather than omitting contacts. Water, diagonal contact and absent owner pairs cannot invent adjacency. This is not yet adaptive curvature, depth or chokepoint inference. IDs persist for unchanged exact runs, not after split/merge.

Snapshot provenance is `(matchId, stateVersion, gameTick, geometryVersion)`. Every observed state gets a monotonic version. Native `ah.h1` replacement identifies a new match; IDs are local random IDs, not account/browser identifiers. Pure rollouts retain origin provenance and reject mismatched geometry. Mutable native objects never reach search.

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

The experimental model uses initial target-contact counts and a territory-dependent estimated cadence (4/3/2/1 ticks). Private native timer phase, fresh-launch delays, native selection limits, geometry evolution, reinforcements, returned forces and special huge-empires updates are not reproduced. Lost/stopped experimental attack mass is discarded, not refunded. Captures are incremental and conserve hostile territory exactly; global territory limits prevent impossible land creation. Neither an ETA distribution nor a calibrated Lanchester law is claimed.

The synchronous API remains `transitionPlanningState(state, action, ticks)`. Only explicit `frontierExperiment: true` with compatible geometry chooses the experimental branch, labelled `native-cost-static-frontier-shadow`. All ordinary callers remain `aggregate-combat-estimate`. Commands and economy use the shared V2.8 arithmetic once; zero/negative time still applies one command without stepping time.

## Telemetry and next gate

Recording polls native state every 50 ms; geometry scans are at least 500 ms apart and only at new forecasts. No scans occur while disabled. Each prediction has a 10-source-tick horizon. Labels are scored only at the exact due tick; missed ticks and match ends are censored. Attack IDs track first observation and remaining-force changes, not a falsely known launch time. Disappearing fronts have unknown outcome, not inferred victory. Successful bridge-issued commands log slider code, ratio, target and observed debit. Manual/native/direct-console actions may only appear as observed fronts. The ring records dropped count; export often for longer sessions.

`TIOGetPerformance().metrics['frontier.extract']` measures actual inclusive raster+geometry time, including failed scans; `frontier.transition` times experimental state advancement. Timings from initial maps are not enough to justify a worker layout or claim CPU/battery savings. The current stage intentionally adds no worker, SAB, WASM or GPU machinery.

Before policy influence: collect complete local matches; retain censored/error observations; split by match/map/source contract; fit contact-growth, reinforcement/refund and cadence/ETA models offline; compare paired territory/balance/ETA MAE and P95 tails against the aggregate baseline on unseen matches. Then profile complex mid/endgame Chrome/M4 states and justify geometry/search workers. Only after those gates should MPC/UCB consume the new model, followed by the separate prospective 20-match Very Hard campaign. There is currently no evidence to enable it for policy.
