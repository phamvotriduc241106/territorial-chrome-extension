# Prospective 20-match Very Hard standard

Test tooling updated: **2026-10-04 11:09:21 EDT**. Extension strategy and release identity are unchanged.

Purpose: measure consistency after the user's reported real Very Hard win. That prior win is an anecdote, not a prospective test result; it is not inserted into this campaign.

## Fixed protocol

- Official Territorial.io **single-player**, **Very Hard (difficulty 5)**, **64 total players**.
- Exactly 20 consecutive matches: 5 each on 4 distinct maps available in your current game. Enter their exact visible labels when creating the plan; the tool does not invent/validate game map IDs.
- Freeze runtime hashes, extension/engine versions and settings before match 1. Configure the extension to the settings in the generated plan. A runtime/settings change requires a new campaign, not merging results.
- Interleave the 4 maps in the generated order. Use one predetermined spawn rule throughout (for example, first valid spawn nearest the map center); do not reroll until the opening looks favorable. Manual spawn selection is allowed; manual attacks, slider adjustments, pauses or bot restarts are not.
- Use a 900-second wall-clock cutoff from match start. Record `win` or `loss` only when the official result is confirmed. Unfinished games at the cutoff are `timeout`; crashes/failed starts are `error`. Record their reasons and keep them in the denominator. No discarded losses or replacements.
- Save a start/settings/difficulty screenshot and a finish/error/timeout screenshot for each match. Record exact start/end timestamps with timezone and available map/spawn seeds; use `undisclosed` when seeds cannot be retrieved. Seeds/settings not visible in a screenshot are human-recorded, not independently verified.

The 64-player count and 900-second cutoff are controlled test conditions, not claims that other configurations are invalid gameplay or that 900 seconds is an optimal limit. If your successful setup differs, define a separate standard before starting; do not change conditions mid-campaign.

## Commands

Replace the four example arguments with map labels from your current game:

```sh
npm run test:very-hard -- init test-results/very-hard/campaign.json "Map A" "Map B" "Map C" "Map D"
```

This writes a 20-match schedule and `campaign.json.result-template.json`. The initial outcome in that template is a placeholder, **not a recorded result**. Copy/edit the template for each match: use the scheduled ID/map, observed settings/difficulty/player count, actual outcome and timestamps. For a timeout/error, set `terminalConfirmed` to `false`; otherwise it must be `true`. Screenshot paths are relative to the campaign directory. The CLI computes their SHA-256 hashes.

```sh
npm run test:very-hard -- record test-results/very-hard/campaign.json test-results/very-hard/match-01.json
npm run test:very-hard -- report test-results/very-hard/campaign.json
```

Every record preserves a pre-update campaign backup. Existing evidence hashes are checked before append/report. `init` refuses to overwrite an existing plan. `report` exits **2** for an incomplete campaign, **1** for invalid evidence, and **0** for a complete valid record set. Exit 0 means complete reporting, **not** that the bot meets an invented win-rate target.

To cross-check actual mode/player count in a live game, use the MAIN-world DevTools console:

```js
({
  difficulty: window.__TIO_GAME__?.aE?.data?.botDifficultyValue,
  players: window.__TIO_GAME__?.aE?.data?.playerCount,
  singlePlayer: window.__TIO_GAME__?.modern?.singlePlayer(),
  extension: window.TIOConfig?.VERSION,
  state: window.__TIO_HOOK_API__?.state()
})
```

Do not infer difficulty from the planner's default profile: confirm the game's actual setting and mode. These internals are contract-dependent; if unavailable, use visible game settings/screenshots and disclose that observation method.

## Report interpretation

The report includes wins, losses, timeouts, errors, per-map results, observed win rate and a 95% Wilson interval. Incomplete campaigns are explicitly labeled. Evidence remains **human-recorded official-game evidence**, not automated full-match validation: file hashes do not establish that screenshots are authentic or that labels are correct. Inspect the screenshots and seed records before relying on the report.

Twenty matches are a pilot. Even 20/20 yields a Wilson interval of approximately 83.89%–100%; 10/20 yields 29.93%–70.07%. The interval is descriptive and assumes Bernoulli-like independent trials; maps/spawns can create dependence. It is not proof of universal Very Hard reliability or significance against another engine. A comparison requires a separate predeclared paired campaign on matched maps/seeds.

`npm test` verifies this protocol with synthetic fixtures; it does **not** play 20 games. `npm run test:live` remains a one-attack integration smoke test. Neither is reported as a real win-rate measurement.
