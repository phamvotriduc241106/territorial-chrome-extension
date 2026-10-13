# Impossible-mode improvement proposal

Proposed October 13, 2026, 13:08:53 EDT. Baseline: `6c50639`, extension v10.3.8 / production V2.8.2. Approval to implement comes from the user's request; this document does not approve unvalidated production promotion.

## Objective and evidence

Improve survival and eventual official completion on Impossible without weakening native command accounting, reserves, source checks, or control safety. [Loss analysis](IMPOSSIBLE_CHROME_AUDIT.md) and [161 observations](live-audits/2026-10-13-impossible-evidence.json) are the starting evidence, not a calibrated combat dataset.

| Observation | Island, 64 players | Europe, 512 players |
| --- | ---: | ---: |
| Survival to sampled loss | 115.824 s | 44.451 s |
| Peak territory | 1,669 | 965 |
| Commands acknowledged | 37 | 28 |
| Maximum sampled failure streak | 0 | 0 |
| Banking-hold observations | 78/116 | 16/45 |

Europe peaked with 2,903 troops against six neighboring banks of 3,742–5,908. The fixed 0.55 density target then implied 53,075 troops, 18.28× available capital. Island held at tick 918 despite 2.62× the focused enemy's bank. Different maps/spawns prevent causal attribution or a general win-rate estimate.

## Architecture: keep baseline and candidate independent

Production stays loaded through the existing manifest. Start with an **offline research candidate**, not a replacement kernel or a manifest-loaded module. The candidate receives immutable current state plus the baseline decision/budget and returns a proposal with reasons, assumptions and an exact single-command debit ledger. It cannot call native actuators or Chrome APIs.

Flow: exact observations → existing baseline decision and spend → research-only candidate → safety/integrity checks → offline comparison. No automatic candidate dispatch. Preserve the V2.8 aggregate and static/dynamic frontier shadow models independently; none is promoted or used to justify a combat guarantee.

This separates three questions: does the proposal change the intended weakness, is the proposed command financially safe, and does it actually improve real matches? Passing the first two cannot answer the third.

## Work packages

### A. Contact-aware opening budget — first implementation

The opening should value land **and** the capital needed to defend the exposed contact graph. Begin with a transparent heuristic cap, not a claim of optimal control:

`R_contact = ceil(E_max × min(1, a + b × max(0, n_contact − 1)))`

`R_required = max(R_baseline, R_contact)`

`D_allowed = max(0, B − R_required)`

Here B is observed bank, E_max the largest known adjacent effective bank, n_contact the number of distinct adjacent opponents, and R_baseline the existing native/crush-barrier reserve. Effective-bank/incoming direction must retain its current named provenance; it is not the sum of hypothetical simultaneous attacks.

Initial research values: **a=0.50, b=0.05**, capped at 1.0. These are **unfitted heuristic parameters**, not source-verified defense multipliers. At six contacts they imply 0.75× largest bank. They are deliberately exposed for later development-only selection. For zero contacts, no additional reserve is imposed. Count busy adjacent opponents for risk even when they cannot be attacked; reject duplicate/malformed/missing balance observations rather than silently dropping exposure.

Only reduce an already feasible baseline neutral command; never increase ratio, front count or debit. Preserve the baseline minimum attack, minimum remaining bank and maximum spend. Compute integer slider units and the source-verified human tax for one command. A hold/zero-ratio result incurs **zero debit** because no command is sent. Do not treat the tax as a charge for thinking or waiting. Initial scope is the first **60 seconds**, another uncalibrated horizon. Missing exact age or opponent coverage means unsupported—not an invented safe action.

Limit: future contact growth and opponent choices are not modeled here. The heuristic may under-expand and lose; retain that negative result. Later replace guessed contact risk with validated spatial/contact-growth forecasts, not deeper search around an unvalidated model.

### B. Threat-aware banking and opportunity review

Do not mechanically remove the density gate. A new advisory evaluator should identify density-hold states with sustained territory loss or an unusually weak reachable target, and request evaluation of safe alternatives.

- Keep crush-immunity, single-flight dispatch, busy-target exclusion and native reserve accounting.
- A direction-verified incoming attack or territory shrink means the soft-cap threshold is not by itself a sufficient reason to ignore all alternatives.
- Evaluate hold/neutral capture/selective pressure with explicit feasibility; do not force an attack merely because hold lost historically.
- Require exact target identity and current availability. Retargeting must recompute reserves against **all** adjacent opponents, not just the intended victim.
- First implementation returns a **review advisory**, not an executable fight action. Actual defensive/opportunity dispatch awaits validated transitions and treatment tests.

### C. Close the replay/measurement gaps

The published trace is not full planner input. Record the exact immutable situation supplied to `decide`, proposed/committed command IDs, target IDs, quantized ratio, debit, dispatch/ack ticks, available and physical neighbors, outgoing committed force, and source-defined directed incoming attacks. Keep sampling and per-command events distinct. Timestamp native and isolated-world observations separately; do not claim atomicity.

Bound memory by event/byte limits, export incrementally, and fail closed when source signatures, state age, match ID or actor coverage fail. Record rejected/blocked commands with their actual reasons. Freeze source/release hashes before each cohort. Native capture-cell instrumentation remains opt-in and observational.

### D. Economy and spawn selection

After A/B are measurable, score spawn positions by reachable neutral area, time to first contact, bottlenecks and number of simultaneous exposed neighbors. Use actual ownership/terrain, not a color guess. Separate map label/index from inactive procedural seed fields. A map seed does not establish frozen bot placement.

For opening schedules, compare exact native interest and territory income against tax and the bank that remains after each command. Model already committed fronts separately; never refund them merely because an observation misses a front. Do not infer directed enemy pressure from an opponent's incoming reinforcement field.

### E. Naval reachability — a separate capability track

The prior Very Hard last-survivor run stalled on neutral islands, but neither Impossible defeat was a naval endgame. Fix contested land economics first. Later implement source-verified boat dispatch/landing/return/refund and a disconnected-land reachability graph. Do not mark a last-survivor state as official completion or substitute arbitrary canvas clicks for unknown mechanics.

## Sequence and delivery gates

| Stage | Deliverable | Gate |
| --- | --- | --- |
| 1 | This proposal merged | Evidence and assumptions explicit; no runtime change |
| 2 | Offline contact-cap candidate + banking advisory + tests | Exact debit/quantization, immutable input, unsupported-data handling; baseline 80/80 fingerprints unchanged |
| 3 | Full planner/command observation and bounded shadow comparison | Native source/signature checks; stale/incomplete records rejected; no candidate actuator calls |
| 4 | Development/validation matches | Minimum initial target: 16 development + 8 untouched whole matches, extended if categories lack valid coverage |
| 5 | Explicit single-player candidate treatment experiment | Candidate/release/settings frozen; randomized or interleaved baseline/candidate assignment; errors/timeouts retained |
| 6 | Production recommendation | Evidence-backed improvement and acceptable runtime cost; no automatic promotion from stage 2 |

The eight final matches cannot select parameters. Within development, use grouped cross-validation or reserve development validation matches. The two existing loss diagnostics are development-only and never final validation. Cover Europe and Asia, 64 and 512 players, early/multiple contacts, narrow/wide borders and different spawn risk. Publish actual scenario counts; 24 games is an initial research target, not a guarantee of statistical power.

For treatment testing, an initial **40 prospective matches (20 baseline, 20 candidate)** is a planning target, not sufficient proof by itself. An identical map label/seed without frozen spawn placement is **not** a paired trial. If native placement cannot be frozen safely, use randomized/interleaved whole-match assignments and report the uncertainty. Do not mutate balances or accelerate the scheduler to make a live-strength claim.

## Validation and metrics

- Safety: integer nonnegative force ledger; exact native tax; command debit at most approved budget; remaining bank at least required reserve when feasible; no double debit, stale snapshot or input mutation; unknown input never becomes fabricated certainty.
- Behavior: opening cap only reduces baseline spending; no-contact and out-of-scope states retain baseline; advisory cannot dispatch commands. Verify all 80 frozen production fingerprints unchanged.
- Research: valid coverage/censoring by match, map, player count and contact count; survival, official completion/loss/timeout, territory/bank trajectories, time to first loss, feasible opportunity windows, command errors and observed reserve breaches.
- Performance: measured P95/P99 candidate latency, throughput and memory separately from Chrome game CPU. Keep same Chrome/M4 conditions for comparisons; renderer timings are not whole-browser CPU savings.
- Uncertainty: whole-match clustered intervals. Report negative results and incomplete observation coverage. Observational action differences are not causal strength improvements.
- Regression: npm test, browser bridge/native-source checks, UI/UI-state, package closure and candidate properties. Research modules remain outside release files and manifest imports.

Before eventual production release, synchronize an exact update date/time/timezone, bump the extension version, update policy documentation and test assumptions. Preserve old evidence and hashes; do not overwrite frozen fingerprints to hide intentional changes.

## Explicit non-goals

No Workers, WASM, WebGPU, new tree search, frontier-driven MPC/UCB, automatic multiplayer testing, personal browser-profile inspection or speculative winning guarantees. No production policy change is part of the initial offline implementation. Do not call the heuristic optimal, calibrated, source-derived, or validated until the corresponding evidence exists.

## Initial implementation scope

Implement work package A and the read-only review advisory from B in an isolated research module, with deterministic fixtures and seeded accounting/property tests. Record a development-only candidate/baseline comparison without reconstructing missing planner inputs from the old projections. Then extend recording in C before deciding whether live candidate treatment is justified. This is useful executable progress while preserving the production baseline needed for comparison.

## Initial implementation — research only

`research/contact-risk-candidate.cjs` implements the opening cap and non-executable banking advisory. It requires matching match/source/state-version provenance, finite fresh age, complete adjacent coverage, exact opponent bank/incoming fields and a separately approved baseline budget. Busy opponents remain in risk accounting. Only neutral expansion inside the opening scope is reduced; holds/fights and out-of-scope states are not promoted or enlarged.

The ledger uses the existing source-verified human debit function and native ratio units. Binary search finds the largest allowed quantized command, preserving the baseline reserve, minimum attack and budget. Waiting has zero tax/debit. The advisory requests review during density-hold territory loss; it does not invent a feasible attack.

Run `node research/run-contact-risk-fixtures.cjs` for explicitly synthetic examples, and `node --test tests/contact-risk-candidate.test.cjs` for eight regression/property tests including 5,000 seeded accounting cases, native-unit maximality, input immutability, stale/partial rejection, near-int32 balances and release isolation. These prove mechanical properties, **not** better Impossible strength. The published old traces cannot pass the new exact-input contract without inventing missing data; they are not treated as full replay inputs.

Next remains work package C: exact planner/command recording followed by bounded shadow evaluation and held-out development. No manifest import, native actuator call, runtime settings change, production release bump, or changed frozen decision fingerprint is part of this implementation.
