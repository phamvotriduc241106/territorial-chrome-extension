# Baseline Elo at Impossible/512, 2026-11-09

The first campaign under the [Elo testing protocol](../testing/ELO_TESTING_PROTOCOL.md).
It establishes the starting strength of release 10.3.15 (policy V2.8.2) against
the game's Impossible bots, and shows how the engine loses.

## Identity

| Item | Value |
| --- | --- |
| Plan | `planSha256 44281302985cef01156bafe1d62acd6a84a79895ea1bd6ea66fac4edbc9e5629`, preregistered 2026-11-09 20:41:14 EST before match 1 |
| Release | 10.3.15, `releaseSha256 7ef28974b6dad2f7492b3165a4be98cd73039016868c3f0c6dd2846a411ce4d4`, policy `baseline` |
| Official source | `2c70f903a601cb0725776bb1843567c5efca84bbe61a5a58b8ab44d7ca511066` (`live-modern-v7`); native arithmetic, live and spatial gates passed just before the campaign |
| Conditions | Custom Scenario, Impossible, 512 players, Europe and Asia alternating, recorder's fixed spawn points, 900 s limit |
| Browser | Chrome 157.0.8103.39, recorder-owned temporary profile, **visible window** (the plan predates the `display` field) |
| Matches played | 2026-11-10 01:41–02:12 UTC; median match 43.5 s (range 23–72 s) |

Raw recorder reports and campaign files are kept locally under ignored
`test-results/` and `scratch/`; this page is the sanitized summary.

## Result

| | Matches | Elo vs one Impossible bot | 95% interval (profile) |
| --- | ---: | ---: | --- |
| **Overall** | 38 | **−469** | −523 to −409 (bootstrap −555 to −403) |
| Europe | 19 | −359 | −432 to −274 |
| Asia | 19 | −964 | −1,074 to −854 |

- **No wins.** 0 first places in 37 finished matches (95% Clopper–Pearson
  upper bound 9.5%).
- **Target.** A 50% win rate at 512 players needs about **+395 Elo**. The
  engine is roughly 860 Elo short of it.

The report raises two flags:

- `map-heterogeneity`: the two maps disagree far beyond chance
  (likelihood-ratio p ≈ 1.4·10⁻¹⁶). Quote the per-map ratings, not only the
  pooled one.
- `abandoned-slots`: slots 39–48 were never played (see the incident below).

Other diagnostics:

- **Drift.** Early vs late halves differ by z = −1.3, so there is no
  significant drift.
- **Model fit.** The mean mid-PIT is 0.62 (z = 2.6, below the 3.0 flag). The
  engine finishes slightly worse than one shared rating predicts, consistent
  with the map split.

## How it loses

The recorder's samples show the same pattern in every match. Peak territory is
nearly constant: a median of 1,019 cells on Europe and 595 on Asia. Each
match sends only 22–30 commands.

| Phase | What the engine does | Example (Europe, slot 1) |
| --- | --- | --- |
| Opening | Expands into free land (`hard-neutral-first`) | 1,002 cells, bank 4,199 at tick 507 |
| Free land runs out | Switches to `hard-build-combat-bank` and stops issuing commands | Commands stay at 29–30 from tick 580 to the end |
| Under attack | Does not counter-attack; land shrinks while the bank grows | 782 → 289 cells while the bank rises to 11,681 and falls back |
| Elimination | Attackers' banks reach 3–9× ours, past the 8× crush threshold | Attacker bank 59,537 vs our 6,558 at tick 1,068 |

Two policy rules cause the passive phase:

- **The bank target.** Fighting requires bank density 0.55 (55% of the soft
  cap of 100 troops per owned cell). That is unreachable against Impossible
  bots, which out-earn us.
- **The defense wall.** While shrinking or under attack, a separate
  "fortification" rule sets the attack size to 0.

Asia is the same failure, only faster: that spawn has about seven neighbours
early, and two attacks arrive by tick 435.

## Incident: slots 39–48 were not played

The run was paused by the operator after slot 38. Slot 38's match was 23 s in
and is kept as a censored game error (it carries no placement information).

When the run resumed on 2026-11-10, every attempt failed before a match
started:

- **New game source.** The first few attempts loaded a new official bundle
  that the adapter does not recognise (`contract-unmapped`), so it correctly
  refused to play.
- **Cloudflare 403.** Later attempts were refused by the site (Cloudflare
  403).

The ad hoc driver retried immediately: about 30 page loads in under a minute.
That burned all ten slots' three retries each, and probably contributed to the
block.

What changed as a result:

- **`npm run elo -- run`.** The tool now has its own runner. It halts at once
  on an HTTP refusal or a source change, pauses 120 s before retrying a setup
  error, halts on a second consecutive one, and waits 15 s between matches.
  See [protocol step 2](../testing/ELO_TESTING_PROTOCOL.md#5-procedure).
- **No more pop-ups.** New plans run the recorder headless (`"display":
  "headless"`), so no window appears on screen. A plan cannot mix display
  modes.
- **Blocks are respected.** No attempt was made to work around the block.

The abandoned slots ended for a reason unrelated to match outcomes, so the 38
recorded matches remain a valid sample. The `abandoned-slots` flag stays
visible regardless.

## Next

1. **Repair source support** for the new official bundle (an ENG-01-style
   repair). No further matches are possible until it passes the fresh-source
   gates.
2. **Re-measure the baseline headless** on the new source. A rating belongs to
   one source and one display mode, so this result is not directly comparable
   with later campaigns.
3. **Screen candidates** that replace the passive hold, one change at a time:
   counter-attack when attacked; keep attacking the weakest neighbour after free
   land runs out; or lower the 0.55 bank target at Impossible. Each change
   alters the frozen decision fingerprints on purpose and needs an explicit
   before/after review.
