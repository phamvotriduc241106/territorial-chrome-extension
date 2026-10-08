# Dynamic frontier protocol (frozen before data collection)

Baseline: `3488aab53cb57f75855a9b633007ed6bb489fecf`. Branch: `codex/dynamic-frontier-research`.

Production decisions and spending remain V2.8.2. No candidate is a planner dependency.
First gate: ownership replay, hostile native capture attribution, immutability,
bounded allocation, stale rejection and reversible instrumentation must pass before rollouts.

The initial experiment has 24 complete, local, accelerated native-source matches.
Indices 1–16 are development; 17–24 are sealed evaluation. Seeds are
`240071 + (index - 1) * 7919`. Model selection uses development matches only;
four folds use `(index - 1) % 4`. Final evaluations are a one-time run of a
frozen candidate, not another tuning fold. Incomplete games do not count.

Eight controller/scenario strata repeat three times: weak-target, strong-target,
mutual, reinforced, refund, narrow-border, wide-border and simultaneous-front.
Native Very Hard opponents remain enabled. Controller strata are interventions,
not proof that every episode realizes that category. Report actual events and
valid coverage; absent categories trigger further collection, not success claims.
Native map/contact widths and empire sizes are measured, not inferred from labels.

Compare aggregate, static and dynamic predictions on identical origins/horizons
(2, 5, 10, 20 ticks). No realized future captures, bank states or termination
labels may enter forecasts. Known command conditioning is explicitly labelled;
unmodeled commands, ownership changes, deaths or unknown schedules censor the
interval for all comparable models. Include per-model failures in coverage, and
report common-support metrics alongside all-valid metrics. Match bootstrap
uncertainty uses 2,000 deterministic resamples of complete matches.

Report territory, attack-specific captures, balance and valid termination ETA
MAE/RMSE/P95, censored/unsupported rates, category and match breakdowns, source
SHA-256, artifact hashes, runtime and immutable production fingerprints.
Accelerated controlled Chrome measurements are not interactive online performance
or win-rate evidence. Preserve negative results. No policy promotion in this PR.
