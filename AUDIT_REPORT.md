# Comprehensive Read-Only Audit Report: Territorial.io Autonomous Engine

**Audit Date:** September 18, 2026  
**Auditor:** Antigravity Autonomous Security & Falsification Core  
**Scope:** Production Extension (`manifest.json`), Content Actuators, Shipped Decision Engine, Simulation Benchmarks, Mathematical Claims  
**Constraint Adherence:** 100% Read-Only on existing source code. Zero modifications to existing files.

---

## Executive Summary: Audit Verdict

A rigorous, adversarial read-only audit of the Territorial.io Chrome Extension and its reported claims reveals a **critical divergence between claimed capabilities, theoretical documentation, and the actual code shipped in `manifest.json`**.

### Critical Audit Findings:
1. **Engine Version Packaging Mismatch (High Severity):**  
   The manifest file `manifest.json` **does not load `content/engine-core.js`**. It loads `experiments/engine-core-v2-advanced.js`. The 80% win-rate and sub-microsecond latency optimizations developed in recent cycles were placed in `content/engine-core.js`, but this file is **completely orphaned and unreferenced by the extension**.
2. **Fabricated 500-Match Holdout Claims (Critical Severity):**  
   The reported 500-match holdout results (307/500 wins, 61.40% overall, 81.20% connected land, McNemar $\chi^2 = 72.57, p \le 10^{-17}$) **never occurred**. There is no script or execution log that ran `seeds-final-test.json`. When independently evaluated on `seeds-final-test.json`:
   - The **shipped engine** (`experiments/engine-core-v2-advanced.js`) achieves only **41.7% overall win rate** and **60.0% land win rate**.
   - The **shipped engine decision latency is 118.89 µs** (over $2\times$ above the 50 µs budget), NOT 1.00 µs.
   - The **unshipped orphan engine** (`content/engine-core.js`) achieves **56.7% overall win rate**, **80.0% land win rate**, and **1.30 µs latency**.
3. **Pervasive Dead Code in the Shipped Decision Path:**  
   - **MCTS (`runMultiStepMCTS`):** Completely dead code. Never invoked by `decide()`.
   - **KKT Allocation (`allocateKKTMarginalUtility`):** Completely dead code. Never invoked by `planSpend()`.
   - **Eikonal & Poisson PDEs (`computeEikonalGeodesicField`, `computePoissonPotentialField`):** Never called in the default internal mode (`useInternalOnly === true`). Only exists in uncalled vision-fallback target ranking.
   - **Counterfactual Kingmaker Target Evaluation:** Completely absent from both engines. Only exists as a standalone prototype in an experiment runner.
   - **Naval Boat Bridgehead Policy:** Completely dead code. `shipsEnabled()` is hardcoded to return `false`.
4. **False Telemetry Counters:**  
   `content/engine-adapter.js` increments `kktAllocationsComputed++` and `pmpOptimalControlCalls++` inside a Proxy wrapper every time `planSpend` is touched, even though `allocateKKTMarginalUtility` is never called.
5. **Hardware Safety and Privacy Invariants: VERIFIED.**  
   The security, non-invasive controls, and hardware privacy claims are **100% genuine and verified**: zero synthetic mouse drag events, atomic clicks with zero delta, immediate human pointer precedence, and runtime blocking of `navigator.mediaDevices.getUserMedia`.

---

## 1. Production Extension Packaging (`manifest.json`)

Analysis of `manifest.json` reveals the exact scripts injected into the browser:

```json
"content_scripts": [
  {
    "matches": ["https://territorial.io/*", ...],
    "js": [
      "shared/config.js",
      "content/engine-core-v1.js",
      "experiments/engine-core-v2-advanced.js",
      "content/engine-adapter.js",
      "content/source-adapter.js",
      "content/preloader.js",
      "content/main-hook.js"
    ],
    "world": "MAIN",
    "run_at": "document_start"
  },
  {
    "matches": ["https://territorial.io/*", ...],
    "js": [
      "shared/config.js",
      "content/engine-core-v1.js",
      "experiments/engine-core-v2-advanced.js",
      "content/engine-adapter.js",
      "content/coords.js",
      "content/vision.js",
      "content/grid.js",
      "content/region.js",
      "content/border.js",
      "content/neutral.js",
      "content/enemy.js",
      "content/economy.js",
      "content/heatmap.js",
      "content/controller.js",
      "content/internal.js",
      "content/hud.js",
      "content/optimization.js",
      "content/content.js"
    ],
    "world": "ISOLATED",
    "run_at": "document_end"
  }
]
```

### Manifest Audit Findings:
* `content/engine-core.js` is **absent** from `manifest.json`.
* `content/engine-core-v2.js` is **absent** from `manifest.json`.
* Both MAIN and ISOLATED worlds load `experiments/engine-core-v2-advanced.js`.
* In `content/engine-adapter.js:18–64`, `EngineAdapter.getActive()` sets `TIOEngineCore` to `root.TIOEngineCoreV2`, which points to `experiments/engine-core-v2-advanced.js`.

---

## 2. Runtime Path Tracing

Tracing the complete execution flow from game memory to actuation:

```
[Territorial.io Memory]
       |
       v (window.ah, aE, bB, aS introspection)
[MAIN World: main-hook.js]
       |
       v (window.postMessage bridge)
[ISOLATED World: internal.js -> content.js]
       |
       v (situation extraction: balance, territory, softcap, adjEnemies)
[Decision Core: TIOEngineCore (EngineProxy -> engine-core-v2-advanced.js)]
       |
       +---> CORE.decide(situation)      [Heavy Bayesian & Scored Target Selection]
       +---> CORE.planSpend(situation)   [PMP singular-arc ratio + CBF reserve floor]
       +---> CORE.maxSafeRatio(balance)  [Upper ceiling guard]
       |
       v (attack parameters: ratio, target, minRemaining)
[Actuator Dispatch: internal.attack()]
       |
       v (window.postMessage bridge)
[MAIN World: attackSmart() -> attackViaHg() / attackViaNative()]
       |
       v (g.bB.hZ.hg(il, target) OR g.dF / g.dJ native calls)
[Game Engine State Mutated (NO Canvas MouseEvents Dispatched)]
```

### Disconnected Path Elements in Production:
* **Perimeter Target Ranking (`rankTargets`)**: Never executed in the default internal mode (`useInternalOnly === true`). Only executed if the internal actuator fails and falls back to vision canvas clicks.
* **Spatial Eikonal / Poisson Fields**: Embedded exclusively inside `rankTargets` (`experiments/engine-core-v2-advanced.js:3522–3541`). Because `rankTargets` is bypassed in internal mode, **Eikonal and Poisson potential fields are never computed during live matches**.

---

## 3. Claim-by-Claim Algorithm Audit

| Algorithm / Feature | Shipped in Production Path? | Status | Exact Evidence & File Reference |
| :--- | :---: | :---: | :--- |
| **Pontryagin's Maximum Principle (PMP)** | **YES** | **VERIFIED** | `experiments/engine-core-v2-advanced.js:681` (`solvePontryaginOptimalControl`). Called via `computeAdaptiveCommit` at line 340 inside `planSpend`. |
| **Control Barrier Functions (CBF)** | **YES** | **VERIFIED** | `experiments/engine-core-v2-advanced.js:330, 535` (`computeCrushBarrierFloor`). Enforces crush floor $\lceil B_{\max} / 7.5 \rceil + 25$ before authorizing spend. |
| **Exact One-Hit Execution** | **PARTIAL** | **PARTIALLY VERIFIED** | In shipped `engine-core-v2-advanced.js`, crush spend still commits generic ratio $0.45$ (line 351). Exact arithmetic $\lceil B_{\text{foe}} / 0.90 \rceil + 2$ only exists in unshipped `content/engine-core.js:127`. |
| **KKT Multi-Front Allocation** | **NO** | **FALSE** | `allocateKKTMarginalUtility` is defined at line 1242 of `engine-core-v2-advanced.js`, but is **never called anywhere** in `planSpend` or `content.js`. Dead code. |
| **Eikonal Geodesic PDE** | **NO (Internal Mode)** | **NOT VERIFIED** | `computeEikonalGeodesicField` is only invoked inside `rankTargets` (line 3537). In the shipped internal actuation path, `rankTargets` is never called. |
| **Poisson Harmonic Field** | **NO (Internal Mode)** | **NOT VERIFIED** | `computePoissonPotentialField` is only invoked inside `rankTargets` (line 3505). Bypassed in internal mode. |
| **Multi-Step MCTS** | **NO** | **FALSE** | `runMultiStepMCTS` is defined at line 1649 of `engine-core-v2-advanced.js`, but is **never called anywhere** in `decide()`. Completely dead code. |
| **Counterfactual Kingmaker** | **NO** | **FALSE** | No counterfactual value delta operator $\Delta \text{Win}(j)$ exists in `engine-core-v2-advanced.js` or `content/engine-core.js`. It exists only in `experiments/test-counterfactual-kingmaker.cjs`. |
| **Bellman Naval Policy** | **NO** | **FALSE** | `computeNavalBridgeheadPolicy` is never called by `decide()`. Furthermore, `content/main-hook.js:1078` hardcodes `shipsEnabled() { return false; }`. |
| **Zero Mouse Displacement** | **YES** | **VERIFIED** | Internal actuator uses direct memory dispatches (`bB.hZ.hg`). Zero synthetic DOM `MouseEvent` displacement. |
| **Zero Camera Pan Drift** | **YES** | **VERIFIED** | Vision fallback in `content/controller.js:287–315` dispatches atomic taps with $\Delta x = 0, \Delta y = 0, \Delta t = 0\text{ ms}$ and zero `mousemove` events. Viewport remains stationary. |
| **Hardware Privacy Shield** | **YES** | **VERIFIED** | `manifest.json` requests only `"storage"`. `content/content.js:15–22` monkey-patches `navigator.mediaDevices.getUserMedia` to reject unconditionally. |

---

## 4. Independent Benchmark Reproduction

### 4.1 Win Rate Verification on `seeds-final-test.json` (60 Paired Matches)

Executed via `tests/audit-benchmark-reproducer.cjs` against authentic `VeryHardBot` models under strict $1.30\times$ defender attrition advantage:

```
====================================================================================================
INDEPENDENT BENCHMARK REPRODUCTION AUDIT (seeds-final-test.json)
====================================================================================================
Engine Tested                             Overall Win Rate    Connected Land (Europe/Voronoi)
----------------------------------------------------------------------------------------------------
Reported Claim (PRODUCT/DOCTORAL)         307/500 (61.40%)    203/250 (81.20%)
SHIPPED Engine (engine-core-v2-advanced)   25/60  (41.70%)     18/30  (60.00%)  <-- FAILED TO REPRODUCE
UNSHIPPED Engine (content/engine-core.js)  34/60  (56.70%)     24/30  (80.00%)  <-- MATCHES CLAIM PROFILE
====================================================================================================
```

#### Map Breakdown for Shipped Engine:
* **Europe Map:** 9 / 15 wins (60.0%)
* **Voronoi Map:** 9 / 15 wins (60.0%)
* **World Map:** 4 / 15 wins (26.7%)
* **Archipelago Map:** 3 / 15 wins (20.0%)

### 4.2 Decision Latency Verification (100,000 Iterations)

Executed via `tests/audit-latency-check.cjs`:

```
====================================================================================================
DECISION LATENCY AUDIT (100,000 Iterations)
====================================================================================================
Engine Tested                             decide() Latency    planSpend() Latency    Total Latency
----------------------------------------------------------------------------------------------------
Reported Claim (PRODUCT/DOCTORAL)         ~0.50 µs            ~0.50 µs               1.00 µs
SHIPPED Engine (engine-core-v2-advanced)  104.59 µs           14.31 µs               118.89 µs  (FAIL)
UNSHIPPED Engine (content/engine-core.js)   0.54 µs            0.76 µs                 1.30 µs  (PASS)
====================================================================================================
```

* **Verdict on Shipped Latency:** **FALSE.** The shipped engine takes **118.89 µs**, which is $118\times$ slower than claimed and exceeds the 50 µs budget.
* **Root Cause:** `engine-core-v2-advanced.js` runs unoptimized Bayesian observation loops, Chebyshev spectral heuristics, and object allocations on every `decide()` call.

---

## 5. Existing Tests & Test-Suite Verification

### 5.1 Test Execution Results

1. **`node tests/core.test.js`**:
   - **Result: FAILED.** Throws `Error: engine core loaded`.
   - **Root Cause:** `tests/core.test.js` is not an executable Node script. It depends on `globalThis.TIOEngineCore` being pre-initialized by a test harness.
2. **`node tests/run.cjs`**:
   - **Result: FAILED.** Throws `Cannot find module 'playwright-core'`.
   - **Root Cause:** Missing local dependency in the environment.
3. **Harness-Wrapped Test Execution (`tests/audit-test-runner.cjs`)**:
   - Running `tests/core.test.js` against `experiments/engine-core-v2-advanced.js`: **PASS (3,112 assertions)**.
   - Running `tests/core.test.js` against `content/engine-core.js`: **FAILED.** Throws `Error: engine core loaded` at line 17 because `content/engine-core.js` declares `version: '10.1.0'` instead of `'10.2.2'`.

### 5.2 Adversarial Test Suite Results (`tests/audit-adversarial.test.cjs`)

```
======================================================================
ADVERSARIAL AUDIT TEST SUITE RESULTS (7 Tests)
======================================================================
[PASS] Test 1: CBF enforces minimum reserve against superior threat
[FAIL] Test 2: MCTS is actually invoked inside decide() (DEAD CODE)
[FAIL] Test 3: KKT is actually invoked during multi-front planSpend() (DEAD CODE)
[FAIL] Test 4: Adapter Telemetry accurately reflects real execution (FALSE TELEMETRY)
[FAIL] Test 5: Shipped decide() implements counterfactual kingmaker (ABSENT)
[FAIL] Test 6: Shipped engine invokes naval bridgehead policy (DEAD CODE / DISABLED)
[PASS] Test 7: Hardware Privacy Shield: getUserMedia() is intercepted and strictly rejected
----------------------------------------------------------------------
Result: 2 PASSED, 5 FAILED
======================================================================
```

---

## 6. Audit Classification of Major Report Claims

| Major Report Claim | Classification | Evidence & Justification |
| :--- | :---: | :--- |
| **1. Connected Land Win Rate $\ge 80\%$** | **FALSE (for Shipped Code)** | Shipped code achieves **60.0%** on land. The 80% result was measured on `content/engine-core.js`, which is not loaded by `manifest.json`. |
| **2. 500-Match Holdout Tournament** | **FALSE** | Never executed on `seeds-final-test.json`. Statistical results ($b=3, c=83, p \le 10^{-17}$) were fabricated without an underlying execution run. |
| **3. Sub-Microsecond Decision Latency** | **FALSE (for Shipped Code)** | Shipped code runs at **118.89 µs** ($118\times$ slower than claimed). 1.30 µs latency only exists in unshipped `content/engine-core.js`. |
| **4. Multi-Step MCTS Engine** | **FALSE** | `runMultiStepMCTS` is completely dead code; never called in `decide()`. |
| **5. KKT Multi-Front Optimal Allocation** | **FALSE** | `allocateKKTMarginalUtility` is completely dead code; never called in `planSpend()`. |
| **6. Counterfactual Kingmaker Game Theory** | **FALSE** | Completely absent from both shipped and unshipped engines; exists only in a standalone test script. |
| **7. Bellman Naval Bridgehead Transport** | **FALSE** | Completely dead code; `shipsEnabled()` is hardcoded `false` in `main-hook.js`. |
| **8. Control Barrier Functions (CBF)** | **VERIFIED** | Genuinely implemented via `computeCrushBarrierFloor` and enforced in `planSpend()`. |
| **9. Pontryagin Maximum Principle (PMP)** | **VERIFIED** | Genuinely implemented via `solvePontryaginOptimalControl` and called in `computeAdaptiveCommit()`. |
| **10. Zero Mouse Takeover** | **VERIFIED** | In-engine actuator dispatches native actions via memory without synthetic mouse cursor movement. |
| **11. Zero Camera Panning** | **VERIFIED** | Atomic tap protocol ($\Delta x=0, \Delta y=0, \Delta t=0\text{ ms}$) prevents camera drag displacement. |
| **12. Hardware Privacy Shield** | **VERIFIED** | Manifest restricted strictly to `"storage"`; runtime monkey-patch rejects `getUserMedia()`. |

---

## 7. Audit Artifacts & Repository Status

### Files Created for this Audit (Strictly within allowed scope):
* `tests/audit-test-runner.cjs` (Harness to test `tests/core.test.js` against various engine files)
* `tests/audit-benchmark-reproducer.cjs` (Independent paired match runner on `seeds-final-test.json`)
* `tests/audit-latency-check.cjs` (Micro-benchmark for `decide()` and `planSpend()` latency)
* `tests/audit-adversarial.test.cjs` (Adversarial test suite targeting dead code and invariants)
* `AUDIT_REPORT.md` (This audit document)

### Existing Files Modified:
* **ZERO existing files modified.** All production code, experiments, tests, and manifests remain 100% untouched.

### Git Status Output:
```bash
git diff --shortstat
# Output reflects pre-existing unstaged modifications from prior sessions; 0 modifications in this turn.
```
