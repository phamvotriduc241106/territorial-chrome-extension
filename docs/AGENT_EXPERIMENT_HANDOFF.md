# Agent instructions: Impossible-mode engineering experiment

Prepared **2026-10-13 14:17:56 EDT**. Verified starting GitHub/local main: `1c54ece654fbf1f4a2dc456bc26ce779ef597214`. Fetch and verify the current repository before working; these instructions are a handoff snapshot, not a permanently current version claim.

Repository: https://github.com/phamvotriduc241106/territorial-chrome-extension

Mac checkout: `/Users/phamvotriduc/territorial-chrome-extension`.

## 1. Mission and working loop

Continuation update: [Cycle 01](PLANNER_SHADOW_CYCLE_01.md) adds opt-in diagnostic factories, `--shadow`, complete compressed pilot journals and executed-bootstrap source binding. Read its limitations before repeating this snapshot's initial tasks. The candidate remains non-actuating and larger held-out/treatment validation is still pending.

Improve real single-player Impossible performance through a repeated engineering loop:

1. Test an explicitly identified baseline or candidate in real Chrome.
2. Record native observations, actual planner inputs, commands, outcomes and provenance.
3. Write a detailed diagnosis separating observed facts, source-verified mechanics, hypotheses and unknowns.
4. Propose a narrow, measurable change with an experiment and acceptance gate.
5. Implement, verify invariants/regressions, and compare on appropriate data.
6. Push reports/proposals/code, open a PR, inspect CI, and merge validated in-scope work. Repeat.

The user authorized autonomous routine implementation decisions, pushing and merging. That does **not** authorize skipping failing checks, unsupported native commands, speculative production promotion, personal-profile access or unrelated changes. Ask only when materially new authority, an external dependency or a meaningful scope expansion is required. Preserve negative results instead of tuning the narrative.

**Immediate task: exact planner/command observation and bounded candidate shadow evaluation. Do not spend another cycle merely repeating the unchanged baseline and calling it an improvement test.**

## 2. Read these files first

| File | Purpose |
| --- | --- |
| `docs/IMPOSSIBLE_CHROME_AUDIT.md` | Detailed two-match loss diagnosis and limitations |
| `docs/live-audits/2026-10-13-impossible-evidence.json` | Published projection of 161 observations; not complete replay inputs |
| `docs/IMPOSSIBLE_IMPROVEMENT_PROPOSAL.md` | Approved staged proposal, formulas and validation gates |
| `research/contact-risk-candidate.cjs` | Offline opening-budget candidate and non-executable banking advisory |
| `tests/contact-risk-candidate.test.cjs` | Eight focused tests, including 5,000 seeded accounting cases |
| `tools/live-chrome-audit.cjs` | Real installed-extension single-player recorder |
| `content/content.js` | Actual situation, decision, spend, ratio normalization and dispatch pipeline |
| `content/internal.js`, `content/main-hook.js`, `content/source-adapter.js` | Isolated bridge, native command/state boundaries and source contracts |
| `content/engine-core-v2-advanced.js` | Authoritative production policy, arithmetic and safety floors |
| `tests/cpu-optimization.test.cjs`, `tests/frontier-study.test.cjs` | Frozen production fingerprints and research isolation |
| `tools/release-files.cjs`, `.github/workflows/ci.yml` | Release import closure and real CI steps |

Also inspect applicable `AGENTS.md` instructions in the checkout and parent directories. Do not assume historical source symbols or paths still match the latest source.

## 3. Current baseline and known results

Extension **v10.3.8**, production engine **V2.8.2**, release update **2026-10-13 12:39:34 EDT**. Candidate code is **not** in the manifest or release package. `research/` is offline-only; its existence on main does not change autoplay.

| Actual Impossible run | Players | Loss after | Peak land | Acknowledgements | Maximum sampled failure streak |
| --- | ---: | ---: | ---: | ---: | ---: |
| Island, October 13 | 64 | 115.824 s | 1,669 | 37 | 0 |
| Europe, October 13 | 512 | 44.451 s | 965 | 28 | 0 |
| Europe repeat, October 13 | 512 | 70.784 s | 1,003 | 29 | 0 |

All three were baseline runs. Source/release/engine hashes were unchanged. The repeated Europe survival increase is **not** a treatment effect. Spawn placement/opponent behavior were not frozen and the comparisons are not paired experiments.

The first two runs are published with 161 projected observations. The third has 71 observations stored locally, **not included in that published JSON**:

`scratch/live-chrome-audit/2026-10-13T17-37-13-568Z/report.json`

`scratch/live-chrome-audit/2026-10-13T17-37-13-568Z/assessment.md`

An agent on another machine may not have those ignored files. Do not pretend they were downloaded from GitHub. The table above is a handoff summary of the inspected local record.

Observed source SHA-256: `155a2db1cc6f256317fc6178ce12993c76b51630ba5985be4e9ef1d7cad7fcff`.

Baseline release SHA-256: `8bc4a083709f5f01bc0b0418c131f3a98e3f8259b673319a95ef2bf83d08b311`.

Baseline kernel SHA-256: `8331d51ebfbc55bbf91efe4ca0d543231a01be75d3844cdee2d9ab5f61c107c7`.

These identify prior observations. Verify fresh source/signatures; do not simply whitelist an old hash or bypass a changed contract.

Historical identity gap: the old recorder hashed a follow-up HTTP GET; a preliminary observer then hashed navigation HTML. Neither proves the preloader's executed source. Cycle 01 now captures the actual synchronous bootstrap-XHR response and verifies its text length against preloader metadata. Keep navigation/bootstrap identities separate; fail closed for ambiguous/missing capture and never reinterpret historical records as source-bound.

Evidence-backed concern: early expansion produced multiple contacts while neighboring banks exceeded ours; the final density-hold override persisted during territory decline. It uses `combatBankTarget=0.55` without an explicit shrink/trend exception in that final block. This identifies a candidate mechanism, **not proof that an alternative attack would win**.

## 4. Non-negotiable safety and research boundaries

- Single-player Custom Scenario only. Do not join multiplayer experiments automatically.
- Use the actual installed extension and normal native UI. No edited balances/territory, accelerated scheduler or fake victory state for a real-strength claim.
- Keep source-version/signature checks. Reject unknown/stale/malformed state; do not infer geometry from contact counts or colors.
- Preserve native-authoritative spawn confirmation. First castle click can be selection only; actual positive native territory confirms spawn.
- Preserve exact debit, reserves, busy-target exclusion, control preferences and single-flight dispatch. Never bypass a floor to manufacture an apparent improvement.
- Keep aggregate, static-frontier and dynamic-frontier models independently available. Frontier remains shadow-only; no frontier-driven MPC/UCB commands.
- No Workers, WASM, WebGPU or tree-search activation in this experiment phase.
- No production activation merely because a prototype or accounting test passed. Publish an explicit recommendation and validation evidence before promotion; obtain clear authority for a live candidate treatment/release when that stage is reached.
- Do not replace frozen fingerprints or historical cohort hashes to hide an intentional change.
- Keep Chrome profile/session data, secrets, credential-helper output and downloaded proprietary game source out of Git. Do not retrieve or print GitHub tokens; use existing authenticated Git/`gh`.

## 5. Reproducing the existing live baseline

Requirements: macOS with Google Chrome, Node >=20, npm dependencies, normal network access. In this desktop environment, explicit `/bin/bash` with `login:false` and the repository working directory has been reliable; the default task directory/shell may be unusable. On a fresh checkout use `npm ci`. Test harnesses may additionally require `npx playwright install chromium`; actual live recording uses the system Chrome binary, not that bundled browser.

```sh
cd /Users/phamvotriduc/territorial-chrome-extension
git status --short
git fetch origin
git log -1 --oneline origin/main
npm run audit:live -- 300 Impossible 512 Europe
```

CLI positional arguments are **seconds, difficulty label, player count, optional geographic map**. Defaults are 300 seconds, Very Hard, 64 players, procedural Island. Valid live geographic labels are Europe/Asia; seconds 5–900; players 2–512.

```sh
npm run audit:live -- 300 Impossible 512 Asia
npm run audit:live -- 300 Impossible 64
```

The recorder launches visible system Chrome in a fresh owned temporary profile, installs the real unpacked extension with browser-level CDP `Extensions.loadUnpacked`, visits https://territorial.io/, selects the scenario through the real UI, and normally confirms spawn with two clicks. It reads MAIN native state and the actual isolated-world agent, not a separately injected copy of the engine.

Default geographic spawn is (700,400) at 1280×900; Island default is (550,160). **These are not general spawn optimizers.** Invalid spawn/map UI fails with an error record. Preserve that error; correct the selection method and rerun, do not label it a combat loss or silently discard an assigned treatment attempt.

Inspect the stored UI/native configuration and first native alive count. Prior UI Very Hard corresponded to native **4**, Impossible to **5**; the hook's policy `difficulty=5` is a separate field. For Europe, mapType=1 and mapRealisticIndex=0 were observed. Its stored procedural seed/index are inactive and do not prove frozen geographic bot placement.

Outputs under ignored `scratch/live-chrome-audit/<timestamp>/`: full report, incremental `live-progress.ndjson`, screenshots and release/source hashes. Console progress appears every 30 samples. The recorder currently stops at loss, last-survivor milestone or cutoff.

For direct MCP use, browser-level CDP is required for `Extensions.loadUnpacked`; page-target CDP is insufficient. Playwright MCP unsafe-code globals may not persist between calls; state attached to its supplied `page` object previously did. If contexts disappear, reacquire actual isolated extension contexts after navigation. Never work around tool workspace restrictions by widening permissions without authority.

If only a cloud/container browser is available, run regression/synthetic/shadow work there and explicitly report that **real Mac Chrome testing was not performed**. Do not substitute an injected engine, headless simulation or screenshot fixture as evidence of real gameplay.

## 6. The next implementation: exact observation, then shadow

### 6.1 Record the actual calls without changing them

Inspect `runInternalFrame` in `content/content.js`. Capture immutable copies of the **existing** inputs and results at these stages:

1. Native observation used to build the situation: match ID, native/source state versions, tick and actual receipt time.
2. Exact `situation` supplied to `CORE.decide`, and that existing call's returned decision.
3. Decision after control-preference overrides; identify any changes explicitly.
4. Exact context passed to `CORE.planSpend`, and its full returned plan.
5. Post-hold/control changes, final ratio normalization, `maxSafeRatio` result, and actual `canFire` reasons.
6. Native command submission, result/error and receipt, using stable IDs linked to the decision/event.

**Do not call `decide` twice to obtain a recording.** The kernel contains observer state and timing-sensitive work; duplicate evaluation could alter behavior and cost. Record the original invocation exactly once. Do not collect a new native state later and label it the same snapshot. Decision/plan clones must remain independent of subsequent mutation.

`lastCommitMeta` is a UI/debug summary, **not the full spend plan**. It renames `maxSpendTotal` to `maxSpend` and omits fields such as `balance` and `minAttack`. Never pass it to the candidate as if it satisfied the complete baseline-plan contract.

Record monotonic ages separately from UTC wall time. Never subtract clocks from different realms without a measured mapping. The current one-second native and isolated reads are sequential, not atomic. A sampled hold beside a command-count increase does not imply a hold dispatched an attack.

### 6.2 Prove complete opponent coverage

`situation.adjEnemies` currently contains **available** adjacent enemies, whereas the spend context uses all retained adjacent enemies. Busy neighbors still create risk. Preserve exact original planner inputs, and build a separately labeled derived risk view when necessary; do not silently rewrite the recorded situation.

Additionally, `content/main-hook.js` currently sorts and **truncates `enemies` to 32**. A 512-player match does not itself prove complete adjacent coverage. Reconcile physical neighbor IDs with the retained actors, excluding neutral/self appropriately. Missing actors mean incomplete support, not zero risk. Do not set `coverage: "complete-adjacent"` simply because a nonempty array arrived.

If a larger risk-only view is needed, add a separate opt-in bounded observation path and keep the production 32-entry behavior unchanged. Test larger empires with >32 physical contacts. The candidate accepts at most 511 opponent records.

Enemy `incoming` comes from the source adapter's `incoming(p, me)` call. Trace its source definition before calling it directed incoming force **against us**. Keep unknown directed pressure null; never substitute zero or sum unrelated reinforcement to claim an incoming attack.

The current hook catches some incoming lookup exceptions and leaves zero. Add opt-in field-validity/error provenance before treating every numeric zero as a source-confirmed absence of force. Do not change production defaults just to improve observation completeness.

### 6.3 Join command events correctly

Each record needs stable match/decision/command IDs; actor/target/front IDs where known; intended and actual native target; encoded slider units; source-defined tax/sent/debit; native dispatch tick; local receipt time; native acknowledgement tick when actually available; and explicit rejection reason.

The orchestrator's captured `st.gameTick` is not automatically the later acknowledgement tick. Existing `lastSuccessfulGameTick` assignment uses that captured observation. Do not relabel it as exact native ack timing. Obtain actual native event timing or report that label unavailable.

Log source state/geometry versions, active fronts and already committed force, all intervening commands, reinforcement/return/refund events where supported. Do not infer refund/conquest from disappearance. Reuse verified native event facilities only when their contract supports the required meaning.

### 6.4 Bound recording and preserve behavior

Recording is opt-in, default-off and reversible. Use explicit event and byte caps, overflow/censor flags and incremental export. Choose/document limits, measure the largest supported state, and never silently drop difficult episodes. Do not export complete ownership rasters every tick.

Verify unchanged production decisions/spend with recording off **and on**, including across asynchronous receipt and state updates. Use the existing frozen 80-case fingerprint as a gate, not the only safety test. Test stale/mismatched states, immutable copies, timeout/error paths and no duplicate native calls.

## 7. Exact candidate contract and shadow evaluation

Use `evaluateOpeningBudget(core, snapshot, baseline, expected, options)` and `reviewBanking(snapshot, baseline, expected)` from `research/contact-risk-candidate.cjs`.

Required provenance:

```js
snapshot = {
  matchId, stateVersion, sourceHash, ageMs,
  coverage: "complete-adjacent", // only when actually demonstrated
  situation // exact/explicitly derived view with its stage and provenance
};
baseline = { matchId, stateVersion, sourceHash, decision, plan };
expected = { matchId, sourceHash, minStateVersion };
```

Snapshot/baseline IDs, source hash and version must agree. Balance must be known, integral and bounded; game age finite. Every adjacent risk record needs unique ID, `adjacent:true`, exact `bal`, `incoming`, and `effectiveBal=bal+incoming`. Baseline plan needs its full budget and actual approved command ratio; distinguish raw plan from final normalized command. Preserve all original stages when deriving the candidate's approved baseline view.

Defaults are **unfitted heuristics**: baseReserve=0.50, perContact=0.05, openingSeconds=60, maxAgeMs=700. Do not describe them as learned native mechanics or optimal parameters.

The candidate caps **neutral expansion only**, never increases approved ratio units/debit, and preserves the larger of baseline and contact reserves. It computes exact one-command human debit, finds a maximal safe quantized cap, and charges zero when no command would be sent. Already-breached reserves can cause hold; that does not magically restore capital. Banking review is advisory and has `executable:false`.

Keep shadow evaluation offline first, using the CommonJS module and exported exact events. Browser integration requires an explicit adapter/bundle, not pretending `require` is available in a content world. In either approach, the candidate must have **no actuator authority**. Maintain pure debit math and release isolation.

Do not reconstruct missing planner fields from old projected observations, invent `minAttack`, reuse stale source versions or claim full replay coverage. Unsupported is a legitimate result; report its denominator and reason.

```sh
node research/run-contact-risk-fixtures.cjs
node --test tests/contact-risk-candidate.test.cjs
```

The fixture runner is explicitly synthetic. Its Europe-inspired example is not a counterfactual live result or proof the heuristic would prevent defeat.

## 8. Cohort design and statistical honesty

Initial shadow planning target: **16 development + 8 untouched held-out whole matches**, extended when categories lack valid observations. Cover Europe/Asia, 64/512 players, spawn risk, contact count, strong/weak neighbors and reinforced/multiple fronts. Within development use match-grouped cross-validation or a validation subset. The existing diagnostic losses are development-only; never final validation.

Freeze source/release/settings/candidate hashes, parameters and split manifest **before** final evaluation. Do not tune against the eight final matches. Each report must include actual scenario counts, selection exclusions, complete and incomplete matches, source changes, errors, censoring and model support.

For later explicitly authorized single-player treatment testing, the proposal's initial target is **20 baseline + 20 candidate** prospective matches, interleaved/randomized. That number is an initial plan, not guaranteed statistical power. Map label/seed without frozen placement is not a paired trial. A candidate differing only in research files is not active treatment.

Use whole-match or match-clustered uncertainty, not thousands of ticks as independent games. Report official completion/loss/timeout, survival, economic trajectory, initial contact, reserve feasibility, actual command errors and candidate valid coverage. Where transition forecasts are scored, use identical states/horizons, distinguish action disturbance from model error and valid ETA labels from censoring.

Measure candidate P95/P99 latency, peak recording memory and throughput separately from real Chrome/M4 CPU burden. Gate-skip percentage and HUD microtimings are not browser CPU savings.

## 9. Outcome classification and report template

| Classification | Required evidence |
| --- | --- |
| Loss | Ready positive-tick native observation with alive=false and territory=0; preserve actual defeat UI when available |
| Opponents eliminated | alive=true, positive territory, alivePlayers=1; **not automatically a win** |
| Official completion | Source/UI evidence of actual completion, separately verified; do not infer from a frozen clock or empty opponent list |
| Time-censored | Limit reached without a valid terminal label; keep as timeout, not victory |
| Setup/runtime error | Explicit failure record and stage; preserve assigned attempts and separate combat exposure |

A prior Very Hard baseline eliminated 63 opponents but stranded 1,483 neutral cells without boat support. That is why last-survivor is a milestone, not full-map victory. A black compositor screenshot does not prove a black/dead game; keep native evidence and label visual limitations.

Every cycle report should contain:

1. Question, baseline/candidate identity, active-policy proof and hypothesis fixed before testing.
2. Source/engine/release/settings hashes, Chrome/platform, UTC plus local timezone, scenario/native difficulty/map/player counts, spawn and interventions.
3. Dataset manifest, splits, exact observations/events, coverage/overflow/censoring and error accounting.
4. Outcomes and numerical timeline; compare only comparable quantities in tables.
5. Source-linked mechanism analysis, competing explanations, unknown mechanics and counterfactual limitations.
6. Narrow next proposal, parameter provenance, safety/performance constraints and falsification criteria.
7. Implementation diff, validations, fingerprint results, reproduction commands, PR/CI status and explicit promotion recommendation.

Publish sanitized, reviewable evidence plus original-file hashes. Full private profiles, credentials and downloaded official game source are not evidence artifacts for GitHub. Keep original frozen data unchanged; add new cohorts rather than overwriting history.

## 10. Regression, release and Git delivery

For substantive observation/candidate changes run, proportionate to the diff:

```sh
npm test
npm run test:browser
npm run test:ui-state
npm run test:ui
npm run test:a11y
npm run test:live
npm run test:spatial
npm run package
git diff --check
```

`test:live` fetches fresh official source for controlled native-source/bootstrap checks; it is **not** the real-time gameplay recorder. `test:spatial` validates native spatial attribution/replay. CI currently runs npm test, browser/UI/UI-state/a11y and packaging; report fresh source/spatial checks separately when run locally.

Handoff validation baseline: **119 Node test cases**, existing assertion suites, and **80/80 frozen production decision/spend outputs**. Frozen fingerprint SHA-256:

`d49794e32d3cc195e357b4edc5d14f0731b24a408c25ab03633a019cf015b0c6`

Do not replace that expected hash to pass an unintended policy change. Observation/runtime edits require synchronized extension version/update date/time/timezone across config, manifest, popup, logs, README and tests; standalone research/docs edits do not manufacture a new production release. Preserve exact old cohort identities.

Work on an isolated branch from verified current main. If the checkout is dirty, preserve unrelated user work; do not hard-reset or blindly stage everything. A suitable attached managed worktree is preferable when available. Stage only scoped files. Exclude scratch/dist/profiles/secrets; check the actual diff and package closure.

Open a PR, attach it to the task when the app tool is available, and wait for **current-head** checks. New pushes may initially show stale checks from the previous SHA. All relevant required checks must pass; investigate failures rather than bypassing them. Merge with a verified full head SHA, then safely fast-forward clean local main and verify remote/local identities. Do not force-push or delete unrelated branches.

The experiment loop does not mean every research candidate becomes production. Docs, instrumentation and safely isolated prototypes may merge after validation; live policy promotion remains a separate evidence/authority gate.

## 11. Completion criteria for the next agent session

Deliver a reviewable, tested opt-in observation path and an offline shadow report proving:

- Captured decision/spend inputs belong to the same exact versioned event and command stage.
- Complete risk coverage is demonstrated or rejected, including busy neighbors and >32 physical contacts.
- Candidate supported/unsupported rates, changed proposals and blocked/unchanged proposals are counted by whole match and scenario.
- All command debit/force and immutable-state checks pass; production output fingerprint remains unchanged with observation enabled and disabled.
- At least one real official single-player run is recorded with the candidate explicitly **shadow-only**, plus current source/release hashes and actual native scenario.
- No claim of improved survival/winning is made from shadow action differences. Full treatment validation remains future work unless separately authorized and completed.
- A detailed report, next proposal, scoped code, exact test commands/results, PR and CI status are delivered. Negative/unsupported results are retained.

Do not mark the broader experiment complete just because this session ends or a prototype test passes. Handoff the remaining gate explicitly.

## 12. Copy-ready prompt for another agent

> Continue the Territorial.io Impossible-mode experiment in this repository. Read `docs/AGENT_EXPERIMENT_HANDOFF.md`, the loss report, improvement proposal, candidate module and relevant source/tests before editing. Follow the test → record → detailed diagnosis → proposal → code → validate → push/CI/merge loop. Start with exact opt-in planner/command recording and bounded offline candidate shadow evaluation, not another unchanged-baseline strength claim. Verify the latest main and source; preserve production safety and all 80 frozen fingerprints. Keep frontier/search disabled and candidate non-actuating. Resolve routine implementation choices independently, document assumptions and negative results, and deliver sanitized evidence, reproduction commands and a reviewable validated PR. Do not claim improved strength or promote a live policy without valid whole-match comparison and clear authority.
