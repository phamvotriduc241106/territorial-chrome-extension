# CPU optimization: measured first pass

Release **10.2.5**, engine **V2.7**. Updated **2026-10-04 11:29:34 EDT**.

Implemented the report's profiling, redundant-work and typed-array priorities. No M4-specific instruction code, workers, WASM or GPU kernel was added without a measured need. The report's hardware-utilization ratings and predicted speedup ranges are assessments, not measurements. [Chrome's off-main-thread guidance](https://web.dev/articles/off-main-thread) explicitly notes messaging overhead; [extension worlds](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts) are separate environments, not promises of separate CPU cores.

## Changes

- `shared/performance.js`: at most 64 metrics, 256 Float64 timing samples each. Mean and rates cover time since reset; P50/P95/P99 cover the recent ring. Nested timings are inclusive and overlap: do not sum them into total CPU. Synchronous dispatch time excludes RPC waiting/network time. Metrics are collected independently in MAIN and ISOLATED worlds.
- `content/optimization.js`: fresh snapshots/control edges/sequence changes wake planning immediately. Identical snapshots are skipped between a 100 ms backstop; opening clocks, successful commands, busy transitions and manual-pointer transitions remain live. A skipped frame neither reuses nor submits an old command. Native actuation still checks current targets, front capacity, balance, exact tax and reserve.
- `content/engine-core-v2-advanced.js`: pure coalition calculation once per decision instead of per candidate plus return. PMP, MPC, MCTS, multi-step MCTS, coalition, spectral, Poisson and Eikonal functions are measured only when actually called.
- `content/engine-adapter.js`: cached proxy wrappers and honest method-call counters. Removed counters that claimed a `rankTargets` call necessarily executed spectral/Poisson/Eikonal or that `planSpend` necessarily ran KKT.
- `content/grid.js`: typed confidence/timestamps and lazy stable compatibility views. No eager GridCell construction or object writes during a vision update. Neighbor APIs create views only on demand; views retain the correct buffers across grid resizing.
- TypedArray pools retain at most 8 MiB globally and reject duplicate release; Float32 pooling now exists. Spatial queries accept caller-owned output, retaining the default allocation-compatible API.

## Measured fixed-fixture result

Local Apple M4, 10 logical CPUs, arm64, Node v26.8.2. Baseline is commit `27872b0`. Engine: 200 warmup + 1,200 measured decision/spend pairs over 80 states. Grid: 320×180 cells, 200 warmup + 400 updates. Updated engine profiling is enabled; grid timing is an isolated loop without profiler instrumentation. One benchmark run, not a significance test or a browser/thermal measurement.

| Metric | Baseline | Updated |
| --- | ---: | ---: |
| Decision + spend mean | 0.194151 ms | 0.191785 ms |
| Decision + spend P95 | 0.554083 ms | 0.542959 ms |
| Grid update mean | 0.200328 ms | 0.087996 ms |
| Grid update P95 | 0.222667 ms | 0.102833 ms |
| Initial GridCell objects at 320×180 | 57,600 | 0 |
| Evaluations over 600 unchanged frames at 60 Hz | 600 | 100 |

Grid-loop mean improved approximately 2.28×; engine-pair mean is effectively flat. The synthetic gate skipped 500/600 evaluations (83.33%); actual activity depends on fresh-state and control events. Neither figure establishes overall Chrome CPU, battery life, temperature, core utilization or win-rate improvement. Viewing every cell can still allocate up to one compatibility view per cell; this is not a zero-allocation guarantee.

All 80 decision fixtures matched the old policy with a frozen clock. Real MCTS is deliberately wall-time bounded, so completed rollouts and estimates can vary with scheduling/profiler overhead; fixed-clock equivalence is not bit-for-bit live-game replay proof. New gate/grid/profiler tests exercise safety wakeups, object/array synchronization and genuine algorithm counters. The native command tests remain the final boundary checks.

## Use

```sh
npm test
npm run test:live
npm run benchmark:cpu
```

The CPU benchmark needs the historical baseline commit in your local Git history; use a full clone, not a shallow checkout that omits `27872b0`.

In DevTools MAIN world (native state/command and MAIN kernel metrics):

```js
window.TIOProfiler.reset()
// Play normally for 60 seconds, then:
console.table(window.TIOGetPerformance().metrics)
// Optional when investigating profiler overhead:
window.TIOProfiler.enabled = false
```

Select the extension's ISOLATED execution context to inspect planning/vision/grid metrics. Profiler settings are per world. Export both snapshots with the map/player settings; do not confuse MAIN-only smoke-test numbers with a full orchestrator profile.

Next steps require a real 60-second match profile. Consider workers only when repeated independent jobs materially block responsiveness after the gate; benchmark end-to-end messaging and reject stale responses by game tick/release revision. Consider WASM SIMD for demonstrated large image/numerical loops, and GPU only after dispatch/synchronization overhead is measured. Native commands, emergency reserve checks and final target validation stay on the main thread.
