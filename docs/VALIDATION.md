# Evidence and limitations

For real-match consistency, use the [prospective 20-match Very Hard standard](VERY_HARD_TEST.md). It freezes conditions, retains failures and separates human-recorded game results from simulator/unit fixtures.

Production gates: `npm test` runs core contracts, version/timestamp checks, manifest/import checks, V2 compatibility, Hard-mode safety, numerical stability, adapter switching and policy regressions. `npm run test:browser` verifies bridge serialization and native command behavior with fixtures. `npm run test:live` additionally downloads the official page, initializes a local 64-player Very Hard match, and checks one exact native debit/front transition. This is not a full-match win-rate test.

Candidate-only tests and historical falsification scripts remain accessible under `tests/` and `experiments/`; they are not silently treated as release gates. For example, `tests/test-singular-arc-spending.test.cjs` intentionally requests behavior that is not implemented. Passing the release gate does not imply every exploratory test passes.

## V2.8 mathematics, updated 2026-10-04 20:17:35 EDT

Thirteen regression cases cover aggregate-state propagation, single commands, delayed settlement, income/caps/debt, busy fronts, global coalition sizing, utility labels, incomplete search coverage and disabled tree search. Allocation coverage includes 5,000 seeded budget/floor/cap cases and 200 exhaustive small integer-utility comparisons. Native snapshot-to-orchestrator tests check economy, global troops/territory, leader identity, alive count, outgoing fronts, neutral cells and source tick.

Fresh official modern-v3 source SHA-256: `155a2db1cc6f256317fc6178ce12993c76b51630ba5985be4e9ef1d7cad7fcff`. The local source harness compares af.aDb/af.ee against planning predictions in 54 fixtures: six tick positions, three territory shares and three bank densities. Source snapshots are restored after each controlled case. This proves tested arithmetic, not combat equivalence.

Release comparison: 400 paired seeds starting at 3,100,000, stride 7,919; four maps, 2/3/4/6/10 players, 250-tick cutoff, defense multiplier 1.30. Both kernels receive the same global context, frozen search clock and fresh per-match belief state. Baseline 188b1bf; **both won 177/400 (44.25%), mean rank 2.145, survival 86.75%, zero paired gains/losses**. Simulator economics/combat differ from native mechanics; this cannot establish official Hard/Very Hard performance.

Reproduce with full baseline Git history:

```sh
node experiments/planning-model-benchmark.cjs 400 3100000
```

The real-match protocol remains a separate, unplayed campaign; no completed real-game campaign is claimed.

## Historical V2.7 policy benchmark, measured 2026-10-04

800 paired approximate-simulator seeds per policy: 2/3/4/6/10 players, four map families, three map sizes, 250-tick limit, defense multiplier 1.30. Baseline disables the new policy on the otherwise identical kernel; command-boundary improvements are not measured by this ablation.

| Metric | Policy disabled | V2.7 policy |
| --- | ---: | ---: |
| Wins / matches | 353 / 800 | 367 / 800 |
| Win rate | 44.125% | 45.875% |
| Mean final rank | 2.2165 | 2.0400 |
| Survival at match end | 87.25% | 89.875% |

Historical command (requires the matching v10.2.3–10.2.5 kernel, not the current release):

```sh
npm run benchmark -- 400 1700000
npm run benchmark -- 400 2300000
```

The +1.75 percentage-point gain is modest, with regressions in some lobby subsets. Simulation economics, timing and opponents are approximations of the official game. **Real Hard-mode win rate is unmeasured.** The 55% bank threshold is empirical, not a proved optimum. Archived product/manuscript claims about 80% wins or sub-microsecond performance do not establish the current runtime's behavior.
