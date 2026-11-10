# Elo strength testing protocol

Version 1, 2026-11-09 America/New_York. This is the standard for measuring how
strong the engine is against the game's bots, and whether a change makes it
stronger. The goal it serves is winning at **Impossible**.

| What it gives you | How |
| --- | --- |
| A rating: the engine's Elo against one Impossible bot (bot = 0 Elo) | Single-arm rating campaign |
| A decision: is candidate B stronger than baseline A? | Two-arm sequential test (SPRT) |
| A target: the Elo at which the engine would win half its games | Computed from the same model |

Tooling: [`tools/lib/elo-model.cjs`](../../tools/lib/elo-model.cjs) (mathematics)
and [`tools/live/elo-campaign.cjs`](../../tools/live/elo-campaign.cjs)
(`npm run elo -- …`). Matches are played by the existing installed-extension
recorder ([live audit](LIVE_CHROME_AUDIT.md)). This tool only plans, records
and analyzes them. It never plays a game and never touches a personal browser
profile.

## 1. Why placement, not win rate

At Impossible the engine almost always loses. Every dated Impossible/512 run in
this repository is a loss. A win-rate test learns nothing from a string of
losses: zero wins in 20 matches is still consistent with any win rate below 17%
(Clopper–Pearson). Comparing two engines that both lose every time is
impossible.

Every match still has a finishing place. The recorder samples the number of
players alive once per second, so the place at which the engine was eliminated
is known to within a few players. A candidate that survives longer, outlasting
more bots, is stronger, even before it ever wins.

The tool quantifies the difference as Fisher information per match, from
`npm run elo -- power`:

| Players | Engine strength | Placement info ÷ win-only info |
| ---: | ---: | ---: |
| 64 | 0 Elo (equal to a bot) | 4.2× |
| 512 | 0 Elo | 14.9× |
| 512 | −400 Elo | 2.4·10¹⁷× (win-only is effectively zero) |

## 2. The rating model

The engine (strength `e^θ`) plays `N−1` exchangeable bots (strength 1). Players
are eliminated one at a time. Whenever the engine and `k` bots are alive, the
engine is the next one eliminated with probability

$$\frac{q}{k+q},\qquad q=e^{-\theta}.$$

This is the worst-first Plackett–Luce model. The rating is
`Elo = 400·θ / ln 10`, so one bot of the pool is **0 Elo**.

With `G(m) = Π_{k=m+1}^{N−1} k/(k+q)` (the probability of still being alive
when `m` bots remain), finishing place `r` (1 = last survivor) has probability
`G(r−1) − G(r−2)`, where `G(−1)=0`.

Every match is recorded as an interval `lo..hi` of possible places, so sampling
gaps and time limits are handled exactly rather than guessed:

| Match ends in | Interval | Why |
| --- | --- | --- |
| Loss | `[bots alive at first dead sample + 1, players alive at last alive sample]` | Several bots can be eliminated between 1 Hz samples |
| Last survivor | `[1, 1]` | Every opponent was eliminated |
| Time limit while alive, `A` players left | `[1, A]` | Right-censored: we only know the engine finished in the top `A` |

Its likelihood is `G(hi−1) − G(lo−2)`.

Checked properties (all in [`tests/unit/elo-model.test.cjs`](../../tests/unit/elo-model.test.cjs)):

- **Equal strength.** With `θ = 0`, every place has probability `1/N`, so the
  win probability is `1/N`.
- **Two players.** With `N = 2`, the model is exactly the standard Elo curve,
  `1/(1+10^(−Elo/400))`.
- **Small exact case.** The `N = 3` probabilities match a hand derivation.
- **Simulation.** The placement distribution matches a direct simulation of the
  elimination process.

**Win target.** The model's win probability is `G(0)`. At 512 players, a 50%
win rate needs **+395 Elo** over an Impossible bot; at 64 players, +329. This
is the number to climb toward.

### Assumptions, and how each is checked

| Assumption | Check in every report | If it fails |
| --- | --- | --- |
| Bots are exchangeable; matches are independent | Fixed conditions; maps rotated; one match at a time | Not testable per match; keep conditions fixed |
| The elimination model fits | Observed vs model-expected first places (`winZ`); mean mid-PIT of placements (`midPitZ`, should be ≈ 0.5) | Flag `model-misfit` when \|z\| > 3; report raw placement distributions alongside Elo |
| One rating fits every map | Likelihood-ratio test across maps | Flag `map-heterogeneity` when p < 0.01; report per-map ratings |
| Strength is stable during the campaign | First half vs second half, z-test | Flag `drift` when \|z\| > 3; look for a game update or machine-load change |

**A rating belongs to one configuration:** difficulty, player count, map set
and official source version. Elo at Impossible/512 is not comparable with Elo
at Very Hard/64. Use one configuration throughout.

## 3. Standard conditions

| Condition | Standard |
| --- | --- |
| Mode | Official single-player Custom Scenario only; never multiplayer |
| Difficulty | `Impossible` (native difficulty 5) |
| Players | 512 (64 is allowed as a separate, cheaper configuration) |
| Maps | `Europe` and `Asia`, rotated by the schedule |
| Spawn | The recorder's fixed point for each map; never reroll for a nicer start |
| Time limit | 900 s (the recorder's maximum); survivors become censored observations |
| Browser | Recorder-owned temporary Chrome profile, 1280×900, visible window, one match at a time |
| Machine | Same computer, plugged in, no other heavy load, for the whole campaign |
| Source | Pin the official source hash in the plan. A changed source stops the campaign |
| Input | No manual commands, slider changes, pauses or restarts |

## 4. Campaign types and decision rules

| Campaign | Arms | Settings | Measured behaviour (simulation, §7) |
| --- | --- | --- | --- |
| **Rating** | 1 | 48 matches | About ±50 Elo (95%) with exact placements; wider with intervals and censoring |
| **Screen** | 2 | SPRT `elo0=0`, `elo1=100`, α=β=0.05, min 16, cap 100 per arm | 3.5% false acceptance; 98.5% power at +100; about 42 matches per arm |
| **Confirm** | 2 | SPRT `elo0=0`, `elo1=50`, α=β=0.05, min 16, cap 400 per arm | 2.5% false acceptance; 90% power at +50; about 148 matches per arm |

**Promotion rule.** A change becomes the new baseline only if all of the
following hold:

- it passes **Confirm** with `accept-H1`;
- every release gate passes (`npm test`, browser, live and spatial);
- the report has no `model-misfit`, `drift`, `abandoned-slots` or error-rate
  flags.

Cheap ideas go through **Screen** first, and only Screen winners proceed to
Confirm. A change that ends Confirm undecided at the cap is **not** promoted.

**Hypothesis.** H0 says the candidate is no stronger (Δ ≤ `elo0`); H1 says it
is at least `elo1` stronger.

**The test statistic.** The SPRT uses the normal approximation standard in
engine testing:

$$\mathrm{LLR}=\frac{(e_1-e_0)\,(\hat\Delta-\tfrac{e_0+e_1}{2})}{s^2}.$$

Here `Δ̂` is the difference between the two arms' maximum-likelihood Elo, and
`s` is its standard error.

**Stopping.** Stop when LLR ≥ `ln((1−β)/α)` (accept H1) or LLR ≤
`ln(β/(1−α))` (accept H0). It is valid to evaluate after every match pair. Stop
for **no other reason**: not because the Elo "looks good" or "looks hopeless".

## 5. Procedure

**Step 0: preconditions.** On the pinned source, these must pass:
`npm test`, `npm run test:math-native`, `npm run test:live` and
`npm run test:spatial`. An unsupported source makes every match meaningless.

**Step 1: preregister.** Write a spec, then create the plan **before match 1**:

```json
{
  "difficultyLabel": "Impossible", "players": 512, "maps": ["Europe", "Asia"],
  "seconds": 900, "sourceSha256": "<hash from npm run test:live>",
  "arms": [
    { "name": "baseline",  "releaseSha256": "<npm run elo -- release, baseline checkout>",  "policy": "baseline" },
    { "name": "candidate", "releaseSha256": "<npm run elo -- release, candidate checkout>", "policy": "baseline" }
  ],
  "matchesPerArm": 100,
  "sprt": { "elo0": 0, "elo1": 100, "alpha": 0.05, "beta": 0.05, "minMatchesPerArm": 16 },
  "bootstrap": 2000, "seed": 1
}
```

```sh
npm run elo -- init campaign-spec.json test-results/elo/plan.json
```

- **Schedule.** The plan fixes the schedule: map-rotated pairs in ABBA order,
  which cancels slow drift between arms.
- **Integrity.** `planSha256` covers the spec and the schedule. Editing either
  later makes every report fail.
- **Single-arm rating.** Use one arm and `"sprt": null`.
- **Plan hash.** Keep the plan file. Record its hash somewhere dated, such as
  the PR or report that will cite the result.

**Step 2: play the next slot.** Each arm runs from its own checkout (use one Git
worktree per release). The recorder loads the extension from the checkout it
runs in, and stamps that checkout's release hash:

```sh
npm run audit:live -- 900 Impossible 512 Europe            # baseline worktree
npm run audit:live -- 900 Impossible 512 Europe --policy=capital-v1   # if the arm's policy is capital-v1
```

**Step 3: record it, in order.** Pass the slot number and the recorder's
report:

```sh
npm run elo -- record test-results/elo/plan.json 1 scratch/live-chrome-audit/<run>/report.json
```

The tool rejects any of the following:
- a slot recorded out of order;
- a report recorded twice;
- a report whose difficulty, player count, map, release hash or policy differs
  from the slot;
- a manual or accelerated run;
- a changed official source.

A *setup error* (no match ever started) may be retried in the same slot, at
most 3 times; after that the slot is abandoned and flagged. A *game error*
after the match started is kept as a censored observation, never discarded.

**Step 4: check the stopping rule after every pair.**

```sh
npm run elo -- report test-results/elo/plan.json
```

| Exit code | Meaning | What to do |
| ---: | --- | --- |
| 2 | In progress | Continue with the next slot |
| 0 | Complete, or stopped by SPRT | The campaign is decided |
| 1 | Invalid: edited plan, changed evidence file, or a rejected record | Fix the cause; do not continue |

**Step 5: report.** Quote the following:
- each arm's Elo with its profile 95% interval (and bootstrap interval);
- first places with the Clopper–Pearson interval, next to the model's predicted
  win probability;
- the Elo difference with its interval;
- the SPRT decision;
- every flag;
- per-map ratings.

Keep raw recorder reports and campaign files under ignored `scratch/` or
`test-results/`. Publish only sanitized summaries. Never commit downloaded game
source or browser profile data.

## 6. Reading a report

- `rating.elo`: the engine against one bot of the pool. Negative means it
  usually finishes in the bottom half.
- `rating.ci95Profile`: the likelihood-ratio interval, the primary interval.
  `ci95Bootstrap` resamples matches; large disagreement between the two means
  there are too few matches.
- `±Infinity`: the data cannot bound the estimate in that direction (for
  example, every match won). Never replace it with a number.
- `wins.firstPlace` is the **last survivor**. It is not confirmed official map
  completion, which the recorder does not detect (see the
  [live audit](LIVE_CHROME_AUDIT.md)).
- `eloFor50PercentWins`: the target for this configuration.
- `flags`: any flag blocks promotion until it is explained.

## 7. Validation of the method

These checks validate the statistics on data generated **by the model**. They
show that the estimator, intervals and SPRT behave as designed. They do not
show that the model describes the real game; the per-report diagnostics in §2
do that.

| Check | Result |
| --- | --- |
| Identities: uniform at θ=0, N=2 Elo curve, N=3 hand case, distribution sums to 1 | Exact to `1e-12` |
| Distribution vs direct simulation of eliminations (200,000 draws, N=10) | χ² test passes |
| Analytic Fisher information vs finite differences | Agree to `1e-6` |
| Recovery: N=64, 40 matches with interval placements, true −174 Elo, 150 campaigns | Bias < 30 Elo; 95% interval coverage within 90–99% |
| Coverage: N=512, 40 matches with 1-Hz-style intervals, true −200 Elo, 300 campaigns | 94.7% |
| Reported standard error vs spread of estimates (N=128, 30 matches) | Within 20% |
| Confirm SPRT [0, 50], N=64, baseline −150 Elo, 200 campaigns, evaluated every 4 pairs | Δ=0: 2.5% accept H1, 2% undecided at cap. Δ=+25: 44.5% accept H1. Δ=+50: 90% accept H1, 4% undecided. About 148 matches per arm |
| Screen SPRT [0, 100], same setup | Δ=0: 3.5% accept H1. Δ=+100: 98.5% accept H1. About 42 matches per arm |
| Full simulated A/B campaign through the CLI bookkeeping | Stops by SPRT, accepting a +200 Elo candidate |

The 90% Confirm power is below the nominal 95%. That shortfall comes from the
cap and the normal approximation, and is reported as measured, not assumed away.

Planning numbers (`npm run elo -- power --players 512`) assume exact
placements, so treat them as minimums:

| Quantity | Value |
| --- | --- |
| Standard error | About 175 Elo / √matches |
| Matches for ±50 Elo (95%) | 47 |
| Fixed-sample A/B detecting +50 Elo (one-sided α=0.05, power 0.8) | 152 matches per arm |

## 8. Cost and limits

- **Time.** Dated Impossible/512 losses lasted roughly 45–175 s. A 100-match
  Screen (both arms) is about 3–6 hours including setup. A Confirm can take
  several times that. The recorder runs unattended, but one match at a time.
- **Bots, not humans.** Elo is measured against bots, so it is not a rating
  against human players.
- **Fixed spawn.** The fixed spawn point makes conditions repeatable but
  covers only part of each map. Strength from other spawns is not measured.
- **Map labels.** Only the recorder's map labels (Europe, Asia) are supported
  today. Adding maps needs a recorder change and a new plan.
- **Game updates.** An official game update ends the campaign; compare only
  within one source hash.
- **Relation to the Very Hard standard.** The
  [Very Hard standard](VERY_HARD_TEST.md) remains a separate, human-recorded
  consistency pilot. This protocol is the automated strength measurement.
