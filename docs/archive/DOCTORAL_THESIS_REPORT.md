> Historical manuscript, corrected 2026-10-28. The original forward-invariance proof and soft-cap control formula are withdrawn; spectral rounding has no general exact-cut guarantee. The 81.20% / 500-match / 1 µs performance claims are withdrawn. See [checked corrections](../math/MATHEMATICAL_CORRECTIONS.md). Unreviewed theoretical sections are not validated descriptions of the shipped engine. The [pre-correction original](https://github.com/phamvotriduc241106/territorial-chrome-extension/blob/082eff4250ee910819d01994ec535eebcf395a56/docs/archive/DOCTORAL_THESIS_REPORT.md) remains in Git history.

# Territorial.io Engineering Models — Corrected Historical Manuscript
## Historical Territorial.io engineering manuscript — corrected mathematical claims

**Author:** Antigravity Autonomous Research & Engineering Core  
**Target Platform:** Territorial.io (HTML5 / Canvas / WebAssembly Runtime)  
**System Reference:** Extension Architecture v10.2.2 (Manifest V3) | Algorithmic Core V2.6  
**Classification:** Autonomous Systems, Non-Linear Optimal Control, Differential Games, Browser Sandbox Security  
**Date:** September 2026  

---

### Abstract

This historical manuscript collects proposed control, optimization, spatial and
belief models for a browser-game agent. Advanced algorithm names do not establish
implementation, mathematical optimality or competitive effectiveness. The current
source uses rule-based spending and reserve checks, conditional aggregate
lookahead, a scalar log-space observer and a UCB action bandit. Numerical PDE and
spectral helpers exist, but their execution in the normal mapped native command
path has not been demonstrated. Experimental tree search remains disabled.

The corrections below distinguish a reserve heuristic from a proved invariant
controller, derive tangency for a simplified proportional-cost model, and replace
an exact-cut claim with the appropriate spectral-relaxation interpretation. The
integer allocator optimizes one particular separable utility under feasible
integer constraints; native single-command attacks do not execute its allocation
vector. No super-human performance, sub-microsecond controller latency, formal
multi-front immunity or completed 500-match evaluation is established here.

The [current claim register](../math/MATHEMATICAL_CORRECTIONS.md) provides source
entry points, checked examples, dated evidence and outstanding validation work.

---

## Table of Contents
1. [Chapter I: Introduction and Domain Formalization](#chapter-i-introduction-and-domain-formalization)
   - 1.1 The Discrete-Continuous Hybrid Environment
   - 1.2 State Space and Graph Topology Representation
   - 1.3 Historical Combat Surrogate — Not Verified Native Mechanics
   - 1.4 Formal Problem Statement & Objective Function
2. [Chapter II: Optimal Resource Allocation and Macroeconomic Control](#chapter-ii-optimal-resource-allocation-and-macroeconomic-control)
   - 2.1 Historical Continuous Economic Surrogate
   - 2.2 Application of Pontryagin's Maximum Principle (PMP)
   - 2.3 Corrected Soft-Cap Boundary Tangency
   - 2.4 Integer Allocation for a Specific Separable Utility
3. [Chapter III: Reserve Constraints and Proof Limits](#chapter-iii-reserve-constraints-and-proof-limits)
   - 3.1 Forward Invariance Requires the Complete Transition
   - 3.2 Withdrawn Reserve-Set Proof and Counterexample
   - 3.3 What the Shipped Reserve Heuristic Checks
   - 3.4 No Proved Multi-Front Immunity
4. [Chapter IV: Spatial Reasoning & PDE-Driven Geodesic Fields](#chapter-iv-spatial-reasoning--pde-driven-geodesic-fields)
   - 4.1 The Continuous Limit of Territorial Adjacency
   - 4.2 The Isotropic Eikonal Equation & Godunov Discretization
   - 4.3 Harmonic Poisson Fields and the Strong Maximum Principle
   - 4.4 Spectral Graph Partitioning via the Fiedler Vector
5. [Chapter V: Game-Theoretic Synthesis & Counterfactual Reasoning](#chapter-v-game-theoretic-synthesis--counterfactual-reasoning)
   - 5.1 The Multi-Player Free-For-All (FFA) Dilemma
   - 5.2 Lanchester Attrition Laws under Asymmetric Defender Advantage ($\mu = 1.30$)
   - 5.3 The Counterfactual Kingmaker Value Operator $\Delta \text{Win}(j)$
   - 5.4 Stochastic Naval Transit: The Bellman Dynamic Bridgehead Policy
6. [Chapter VI: Source Code Architecture & Reverse-Engineered Mechanics](#chapter-vi-source-code-architecture--reverse-engineered-mechanics)
   - 6.1 Reverse Engineering the WebAssembly / JS Runtime
   - 6.2 Symbol De-obfuscation Directory (`dF`, `dJ`, `cl`, `co`, `hg`, `bB.hZ.pZ`, `cE`)
   - 6.3 Exact Discrete Arithmetic: The 12/1024 Human Tax & Spend Clamping
   - 6.4 The Dual-World Isolation Pipeline (MAIN World vs. ISOLATED World)
7. [Chapter VII: Hardware Privacy, Zero-Mouse Invariance, and Sandbox Proofs](#chapter-vii-hardware-privacy-zero-mouse-invariance-and-sandbox-proofs)
   - 7.1 Threat Modeling: OS Cursor Hijacking vs. In-Engine Actuation
   - 7.2 The Zero-Delta Atomic Tap Theorem (Proof of Viewport Invariance)
   - 7.3 Pointer Precedence and Optical Sensor Jitter Discrimination
   - 7.4 Sandboxing and Hardware Media Prohibitions
8. [Chapter VIII: Withdrawn Benchmark Claims and Valid Evidence](#chapter-viii-withdrawn-benchmark-claims-and-valid-evidence)
   - 8.1 No Verified 500-Match Holdout Result
   - 8.2 Latency and Simulation Scope
   - 8.3 Actual Official-Game and Model Evidence
9. [Chapter IX: Corrected Conclusions and Research Priorities](#chapter-ix-corrected-conclusions-and-research-priorities)

---

# Chapter I: Introduction and Domain Formalization

### 1.1 The Discrete-Continuous Hybrid Environment

*Territorial.io* presents a complex hybrid control problem. While visual presentation occurs upon an $W \times H$ raster grid (where pixels represent territorial ownership $\Omega \subset \mathbb{Z}^2$), the underlying game logic operates as a discrete-time dynamical system with continuous state variables.

Let the player set be denoted by $\mathcal{P} = \{1, 2, \dots, N\}$, where player index $i = 1$ denotes the autonomous ego-agent, and $i \in \{2, \dots, N\}$ denote adversarial Very Hard bots or human opponents. Unclaimed or neutral territory is designated by index $0$.

At any discrete game tick $k \in \mathbb{N}_0$ (where $\Delta t \approx 100\text{ ms}$ to $120\text{ ms}$ depending on server tick rate), each player $i \in \mathcal{P}$ is characterized by a state tuple:
$$\mathbf{s}_i(k) = \begin{pmatrix} B_i(k) \\ T_i(k) \\ \mathbf{c}_i(k) \end{pmatrix} \in \mathbb{R}_{\ge 0} \times \mathbb{N} \times \mathbb{R}^2$$
where:
* $B_i(k) \in \mathbb{R}_{\ge 0}$ represents the accumulated liquid troop balance (capital);
* $T_i(k) = |\Omega_i(k)| \in \mathbb{N}$ represents the planar territorial measure (number of pixels owned);
* $\mathbf{c}_i(k) = \frac{1}{T_i(k)} \sum_{\mathbf{x} \in \Omega_i(k)} \mathbf{x} \in \mathbb{R}^2$ represents the territorial spatial centroid.

### 1.2 State Space and Graph Topology Representation

The spatial configuration of the match is formalized as a planar boundary adjacency graph $\mathcal{G}(k) = (\mathcal{V}, \mathcal{E}(k))$, where:
* The vertex set $\mathcal{V} = \mathcal{P} \cup \{0\}$ represents all agents plus the neutral environment;
* An undirected edge $(i, j) \in \mathcal{E}(k)$ exists if and only if their spatial territories share a non-empty topological boundary:
$$\partial \Omega_i(k) \cap \partial \Omega_j(k) \neq \emptyset$$
Let $L_{ij}(k) = \mathcal{H}^1(\partial \Omega_i(k) \cap \partial \Omega_j(k))$ denote the 1-dimensional Hausdorff measure (perimeter length in pixels) of the shared contact border between player $i$ and entity $j$.

The neighborhood of the ego-agent is partitioned into:
$$\mathcal{N}_{\text{neutral}}(k) = \{0 \mid (1, 0) \in \mathcal{E}(k)\}$$
$$\mathcal{N}_{\text{enemy}}(k) = \{j \in \mathcal{P} \setminus \{1\} \mid (1, j) \in \mathcal{E}(k)\}$$

### 1.3 Historical combat surrogate — not verified native mechanics

**Scope correction:** the following continuous attrition/8:1 equations and
fixed defender multipliers are historical modeling assumptions, not a native
one-tick annihilation law. Use the source-verified batch resolver and current
contract checks for native arithmetic; this section supplies no crush guarantee.

The interaction between two adjacent entities $i$ and $j$ during combat is characterized by an asymmetric attrition dynamic. When player $i$ dispatches an attack allocation $u_{ij}(k) \cdot B_i(k)$ toward neighbor $j$, the continuous-time approximation of balance depletion and land annexation satisfies:

$$\frac{d B_j}{dt} = - \frac{1}{\mu_j} \cdot \psi\left(B_i, B_j, u_{ij}\right)$$
$$\frac{d T_i}{dt} = - \frac{d T_j}{dt} = \kappa \cdot \max\left(0, \psi\left(B_i, B_j, u_{ij}\right) - \mu_j B_j\right)$$

where:
* $\mu_j \ge 1.0$ is the **Defender Attrition Advantage**. The historical surrogate assumes $\mu_j = 1.30$ for standard border defense, and up to $\mu_{\text{shore}} = 1.45$ for maritime shore landings;
* $\kappa \approx 0.33 \text{ pixels/troop}$ is the land annexation yield factor;
* $\psi(B_i, B_j, u)$ is the effective force delivery function. The proposed surrogate uses the following piecewise **Crush Threshold** approximation:
$$\psi(B_i, B_j, u) = \begin{cases} 
0.90 \cdot u B_i, & \text{if } B_i \ge 8 \cdot B_j \quad (\textbf{Crush Regime}) \\
\frac{u B_i}{\mu_j}, & \text{if } B_i < 8 \cdot B_j \quad (\textbf{Attrition Regime})
\end{cases}$$

In the **Crush Regime**, defender fortifications collapse completely: defender balance is liquidated at near $1:1$ parity ($0.90$ efficiency) with zero defensive multiplier, and territory transfer is immediate. In the **Attrition Regime**, the attacker suffers a catastrophic $1.30\times$ penalty per troop expended.

### 1.4 Formal Problem Statement & Objective Function

The following are proposed modeling objectives and constraints, not proved
properties of the shipped controller.

The objective of the ego-agent is to design a state-feedback control policy:
$$\pi: \mathbf{s}(k), \mathcal{G}(k) \mapsto \mathbf{u}(k) \in \mathcal{U}$$
such that the probability of terminal victory $P(\text{Rank}_1 = 1)$ is maximized over a finite horizon $K \in [250, 350]\text{ ticks}$:

$$\max_{\pi} \mathbb{E}\left[ \Phi\left(\mathbf{s}_1(K), \{\mathbf{s}_j(K)\}_{j=2}^N\right) - \int_0^K \mathcal{L}(\mathbf{s}_1(t), \mathbf{u}(t)) dt \right]$$

subject to:
1. **Safety Constraints (Invariance):** $B_1(t) \ge B_{\text{safe}}(t), \quad \forall t \in [0, K]$;
2. **Transaction Friction:** The historical proportional-cost surrogate assumes $\tau(u, B_1) = \lfloor 12 u B_1 / 1024 \rfloor$; this is not the verified native human bank-based command fee;
3. **Actuation Constraints:** $\sum_{j} u_{1j} \le 1.0, \quad u_{1j} \ge 0$;
4. **Hardware Invariants:** Zero synthetic displacement of the OS cursor; zero viewport camera displacement.

---

# Chapter II: Optimal Resource Allocation and Macroeconomic Control

### 2.1 Historical continuous economic surrogate

**Scope correction:** the continuous equations, 3.5% growth rate and production
subsidy below are hypothetical simplifications, not current native income rules.
Native income uses discrete tick phases, rounding, settings, debt and caps; the
fresh October 28 source audit fails closed. In particular, this is not a proved
state constraint that banks cannot exceed $100T$.

The core economic engine of *Territorial.io* couples exponential compound interest with a piecewise-linear saturation envelope governed by territorial extent. 

Between combat actions, the unperturbed balance dynamics of player $i$ follow the non-linear ordinary differential equation:
$$\dot{B}_i(t) = r(t) \cdot B_i(t) \cdot \mathbf{1}_{\{B_i(t) < C(T_i(t))\}} + \gamma \sqrt{T_i(t)}$$

where:
* $r(t)$ is the cycle interest rate. At baseline game speed, $r \approx 0.035\text{ cycle}^{-1}$ (where $1\text{ cycle} \approx 10\text{ ticks}$);
* $\gamma \sqrt{T_i}$ is the territorial production subsidy ($2.5 \times \text{perimeter flux}$);
* $C(T_i)$ is the **Soft Cap Function**:
$$C(T_i) = \min\left(100 \cdot T_i, \; 1.0 \times 10^9\right)$$

```
Balance Growth Rate (dB/dt)
       ^
  r*B  |       / (Exponential Compounding Regime)
       |      /
       |     /
       |    /
 gamma |   /------------------------- (Soft-Cap Saturation Regime: Balance >= 100 * T)
       +-----------------------------> Balance B
       0          C(T) = 100 * T
```

When $B_i(t) \ge C(T_i(t))$, the exponential compounding term $r B_i$ immediately vanishes ($\mathbf{1} = 0$), leaving only the marginal land income $\gamma \sqrt{T_i}$. Any capital retained above $C(T_i)$ incurs a massive opportunity cost: capital stops reproducing.

### 2.2 Application of Pontryagin's Maximum Principle (PMP)

We formulate the expansion scheduling problem as a continuous-time optimal control problem over the early-to-mid game phase $t \in [0, t_1]$.

Let the state vector be $\mathbf{x}(t) = [B(t), T(t)]^T \in \mathbb{R}^2$, and the control scalar $u(t) \in [0, u_{\max}]$ represent the fraction of liquid balance committed to territorial expansion per unit time. The dynamic equations are:
$$\dot{B}(t) = r B(t) - u(t) B(t) - \tau(u(t), B(t))$$
$$\dot{T}(t) = \kappa \cdot u(t) B(t)$$

We seek to maximize the terminal utility at entry into combat:
$$J(u) = \Phi(B(t_1), T(t_1)) = \alpha \ln(B(t_1)) + (1 - \alpha) \ln(T(t_1))$$

For the following hypothetical Hamiltonian, the floor-valued cost is further
approximated by the smooth proportional term $c u B$, with $c=12/1024$. This
is an additional modeling assumption, not exact native arithmetic.

We construct the Pontryagin Control Hamiltonian $\mathcal{H}(\mathbf{x}, u, \boldsymbol{\lambda})$:
$$\mathcal{H}(B, T, u, \lambda_1, \lambda_2) = \lambda_1 \left[ r B - u B \left(1 + \frac{12}{1024}\right) \right] + \lambda_2 \left[ \kappa u B \right]$$

where $\boldsymbol{\lambda}(t) = [\lambda_1(t), \lambda_2(t)]^T$ represents the co-state (adjoint) vector. Grouping terms with respect to the control input $u$:
$$\mathcal{H} = \lambda_1 r B + u B \left[ \kappa \lambda_2 - \left(1 + \frac{12}{1024}\right) \lambda_1 \right]$$

Define the **Switching Function** $\sigma(t)$:
$$\sigma(t) \triangleq \kappa \lambda_2(t) - \left(1 + \frac{12}{1024}\right) \lambda_1(t)$$

By Pontryagin's Maximum Principle, the optimal control $u^*(t)$ must maximize $\mathcal{H}$ pointwise over $u \in [0, u_{\max}]$:
$$u^*(t) = \begin{cases}
u_{\max}, & \text{if } \sigma(t) > 0 \\
0, & \text{if } \sigma(t) < 0 \\
u_{\text{singular}}(t), & \text{if } \sigma(t) \equiv 0 \text{ over an interval } [t_a, t_b]
\end{cases}$$

### 2.3 Corrected soft-cap boundary tangency

The former expression and claimed 22–36% optimal range are withdrawn. For the
simplified dynamics in section 2.2 only, write $c=12/1024$:

$$\dot B=rB-(1+c)uB,\qquad \dot T=\kappa uB.$$

On $B=100T$, tangency requires $\dot B=100\dot T$. For $B>0$ and
$1+c+100\kappa>0$,

$$rB-(1+c)uB=100\kappa uB
  \quad\Longrightarrow\quad
  \boxed{u=\frac{r}{1+c+100\kappa}}.$$

For $r=7/200$, $c=3/256$, $\kappa=1/2$, the exact value is
$224/326475$, with zero tangency residual. A fixed boundary
$B=\alpha\,100T$ instead gives $u=r/(1+c+\alpha\,100\kappa)$.
Feasibility also requires $u$ to lie in the allowed control interval.

This is a boundary-following condition, not a proof of optimality or a PMP
singular arc. In this toy model $u$ is a rate, not a slider fraction per native
command. The proportional-cost assumption itself differs from the verified
human fee based on the whole bank per command. The shipped
`solvePontryaginOptimalControl` uses rules and clamps; it solves no adjoint or
Hamiltonian boundary-value system. See the [full derivation and tax mismatch](../math/MATHEMATICAL_CORRECTIONS.md#2-correct-boundary-tangency-no-native-pmp-optimality-claim).

### 2.4 Integer allocation for a specific separable utility

The implemented helper is narrower than the former arbitrary risk/territory
utility claim. For integer allocations $a_i$, feasible floors $l_i$, caps $u_i$
and total budget $K$, define $y_i=a_i-l_i$. Its modeled objective is

$$\max \sum_i w_i(1-e^{-y_i/s_i}),\qquad
0\le y_i\le u_i-l_i,\quad \sum_i y_i\le K-\sum_i l_i.$$

Assume $w_i\ge0$, $s_i>0$ and feasible integer constraints. The marginal gain is

$$\Delta_i(k)=w_i(1-e^{-1/s_i})e^{-k/s_i}.$$

Each gain sequence is nonincreasing. Selecting the largest feasible increments,
with prefix-consistent tie handling, is optimal for this objective: omitting a
larger available gain while selecting a smaller one permits an improving
exchange. Continuous KKT derivative equality followed by rounding is not an
integer-optimality argument.

`allocateKKTMultiFrontDetailed` bisects log marginal gains and corrects integer
endpoints/ties. Exhaustive and DP oracles test its numerical output. Infeasible
minimums produce a labelled priority fallback, not a KKT optimum. `planSpend`
can compute allocation metadata, but the native single-command actuator does
not execute the resulting vector. This objective is not a proved combat or
victory model; see the [October 21 allocation audit](../math/MATH_AUDIT_2026_10_21.md).

---

# Chapter III: Reserve Constraints and Proof Limits

### 3.1 Forward invariance requires the complete transition

For a specified discrete model $x_{k+1}=f(x_k,u_k,w_k)$, define
$\mathcal C=\{x:h(x)\ge0\}$. A sufficient condition is that an admissible policy
satisfy, at every safe state and for every allowed disturbance,

$$h(f(x,\pi(x),w))\ge(1-\gamma)h(x),\qquad 0<\gamma\le1.$$

Starting in $\mathcal C$, repeated application proves invariance by induction,
provided the condition remains feasible and the modeled disturbance set covers
actual transitions. An own-command reserve check alone does not establish this.
A ceiling-defined barrier is discontinuous; differentiable continuous-time
CBF results cannot simply be transferred to it.

### 3.2 Withdrawn reserve-set proof and counterexample

The former manuscript used

$$R(M)=\left\lceil M/7.5\right\rceil+25,\qquad h(B,M)=B-R(M).$$

Its spending inequality preserved a reserve computed from $M_k$ but concluded
that the reserve computed from $M_{k+1}$ was satisfied. That inference is false.
Set $M_k=750$, $B_k=B_{k+1}=125$, and $M_{k+1}=750(1.035)=776.25$:

$$R(M_k)=125,\quad R(M_{k+1})=129,\quad h_{k+1}=-4.$$

This abstract counterexample satisfies the stated zero-spend constraint but
leaves the proposed reserve set. The 3.5% growth is illustrative, not a verified
universal native bound. It does not assert a recorded game transition.
Furthermore, $776.25/8=97.03125<125$: failure of the reserve-set proof is not
proof that an immediate crush threshold was crossed. The claimed unconditional
anti-crush certificate, instantaneous annihilation inference and forward
invariance conclusion are withdrawn.

### 3.3 What the shipped reserve heuristic checks

The historical $7.5$ divisor and $25$ buffer are not the current helper.
`computeCrushBarrierFloor` uses, when the retained effective enemy maximum
$M>0$,

$$R_{\rm helper}=\lceil M/7.6\rceil+\max(60,\lfloor0.05B\rfloor),$$

and zero floor when no positive threat is present. Native admission separately
checks exact debit, reserve, target legality, match authority and front capacity
against fresh state. This bounds an approved own-command debit, not arbitrary
future opponent growth, arriving attacks or changing adjacency.

### 3.4 No proved multi-front immunity

A maximum-bank floor or weighted sum of neighboring banks is a risk heuristic
unless verified transition/disturbance bounds and feasible controls establish
invariance. No theorem here certifies coordinated-attack immunity or survival.
See [checked assumptions and source references](../math/MATHEMATICAL_CORRECTIONS.md#1-a-reserve-inequality-is-not-a-forward-invariance-proof).

---

# Chapter IV: Spatial Reasoning & PDE-Driven Geodesic Fields

### 4.1 The Continuous Limit of Territorial Adjacency

Spatial navigation in *Territorial.io* cannot rely on standard Euclidean distance metrics $\|\mathbf{x} - \mathbf{y}\|_2$ due to complex geographic topologies: irregular coastlines, interior mountain blockades, narrow continental isthmuses, and enemy defense barriers. 

We therefore model the game board as a two-dimensional Riemannian manifold $(\mathcal{M}, g)$ with a spatially varying metric tensor $g(\mathbf{x})$ that reflects local traversal speed and territorial resistance.

### 4.2 The Isotropic Eikonal Equation & Godunov Discretization

To compute the shortest travel time and optimal expansion corridors from our current border to high-value neutral clusters or vulnerable enemy hinterlands, we solve the **Isotropic Eikonal Partial Differential Equation**:

$$\begin{cases}
\|\nabla T(\mathbf{x})\| = \frac{1}{v(\mathbf{x})}, & \mathbf{x} \in \Omega \setminus \Gamma_0 \\
T(\mathbf{x}) = 0, & \mathbf{x} \in \Gamma_0 \\
T(\mathbf{x}) = +\infty, & \mathbf{x} \in \Omega_{\text{obstacle}}
\end{cases}$$

where:
* $T(\mathbf{x})$ is the arrival time of the optimal expansion wavefront at coordinate $\mathbf{x} \in \mathbb{R}^2$;
* $\Gamma_0 \triangleq \Omega_1$ is the boundary source set (our currently owned territory);
* $v(\mathbf{x}) > 0$ is the spatial velocity field, defined by:
$$v(\mathbf{x}) = \begin{cases}
1.0, & \mathbf{x} \in \text{Neutral Territory (Low Resistance)} \\
0.35, & \mathbf{x} \in \text{Enemy Territory (Heavy Combat Attrition)} \\
0.001, & \mathbf{x} \in \text{Mountain / Impassable Water}
\end{cases}$$

#### Godunov Numerical Discretization Scheme
On the discrete computation grid with grid spacing $h = 1$, let $T_{i, j} \approx T(i \cdot h, j \cdot h)$. The Godunov numerical Hamiltonian approximation to the gradient magnitude is:
$$\left[ \max\left( D_{ij}^{-x} T, -D_{ij}^{+x} T, 0 \right) \right]^2 + \left[ \max\left( D_{ij}^{-y} T, -D_{ij}^{+y} T, 0 \right) \right]^2 = \frac{1}{v_{ij}^2}$$
where $D_{ij}^{-x} T = T_{ij} - T_{i-1, j}$ and $D_{ij}^{+x} T = T_{i+1, j} - T_{ij}$.

Let $T_H \triangleq \min(T_{i-1, j}, T_{i+1, j})$ and $T_V \triangleq \min(T_{i, j-1}, T_{i, j+1})$. The local quadratic update equation reduces to:
$$(T_{ij} - T_H)_+^2 + (T_{ij} - T_V)_+^2 = \frac{1}{v_{ij}^2}$$

This yields the closed-form Godunov upwind solution:
$$T_{ij}^{\text{new}} = \begin{cases}
\min(T_H, T_V) + \frac{1}{v_{ij}}, & \text{if } |T_H - T_V| \ge \frac{1}{v_{ij}} \\
\frac{T_H + T_V + \sqrt{2 \left(\frac{1}{v_{ij}}\right)^2 - (T_H - T_V)^2}}{2}, & \text{if } |T_H - T_V| < \frac{1}{v_{ij}}
\end{cases}$$

In the V2.6 engine (`content/engine-core.js:1335–1440`), this is implemented via `computeEikonalGodunovIsotropic`, producing a geodesic distance field that guides expansions along paths of least resistance.

### 4.3 Harmonic Poisson Fields and the Strong Maximum Principle

To resolve macro-level territorial posture (balancing expansion incentives against enemy threats), we construct a **Harmonic Potential Field** $\Phi(\mathbf{x})$ satisfying Poisson's equation with mixed boundary conditions:

$$\nabla^2 \Phi(\mathbf{x}) = \rho(\mathbf{x}) \quad \text{on } \Omega$$
$$\Phi(\mathbf{x})\big|_{\partial \Omega_{\text{target}}} = +1.0 \quad (\textbf{Dirichlet Source: Neutral Land / Weak Foe})$$
$$\Phi(\mathbf{x})\big|_{\partial \Omega_{\text{threat}}} = -1.0 \quad (\textbf{Dirichlet Sink: Dominant Hostile Bot})$$
$$\frac{\partial \Phi}{\partial \mathbf{n}}\bigg|_{\partial \Omega_{\text{water}}} = 0 \quad (\textbf{Neumann Boundary: Natural Coastline})$$

#### Theorem 3 (Strong Maximum Principle for Harmonic Territorial Fields)
*Let $\Phi(\mathbf{x})$ be harmonic ($\nabla^2 \Phi = 0$) in the open connected interior $\text{Int}(\Omega)$. Then $\Phi$ achieves its absolute global maximum and minimum strictly on the boundaries $\partial \Omega$. It possesses no local extrema (spurious traps or local minima) in $\text{Int}(\Omega)$.*

*Proof.* Follows directly from the Mean Value Property of harmonic functions:
$$\Phi(\mathbf{x}_0) = \frac{1}{2\pi R} \oint_{\partial B_R(\mathbf{x}_0)} \Phi(\mathbf{s}) ds$$
If $\mathbf{x}_0$ were a strict local maximum, $\Phi(\mathbf{x}_0) > \Phi(\mathbf{s})$ for all $\mathbf{s} \in \partial B_R(\mathbf{x}_0)$, which contradicts the mean value equality. Therefore, the gradient field $\mathbf{F}(\mathbf{x}) = \nabla \Phi(\mathbf{x})$ is smooth, globally orienting, and completely free of artificial potential traps. $\blacksquare$

#### Chebyshev-Accelerated Red-Black Gauss-Seidel Solver
In this historical numerical proposal, the Poisson system is solved over a coarse grid ($N \times N$, $N=8$) partitioned into bipartite Red and Black sublattices:
$$\Omega_{\text{Red}} = \{(i, j) \mid i+j \equiv 0 \pmod 2\}, \quad \Omega_{\text{Black}} = \{(i, j) \mid i+j \equiv 1 \pmod 2\}$$

Because the 5-point discrete Laplacian stencil:
$$\Phi_{i,j}^{(k+1)} = \frac{1}{4} \left( \Phi_{i+1, j} + \Phi_{i-1, j} + \Phi_{i, j+1} + \Phi_{i, j-1} \right)$$
couples Red cells strictly to Black neighbors, all Red cells can be updated simultaneously in vectorized memory without read-after-write hazards, followed by Black cells. 

Chebyshev acceleration updates the relaxation parameter $\omega^{(k)}$ dynamically:
$$\omega^{(0)} = 1.0, \quad \omega^{(1)} = \frac{1}{1 - \frac{1}{2}\rho^2}, \quad \omega^{(k+1)} = \frac{1}{1 - \frac{1}{4}\rho^2 \omega^{(k)}}$$
where $\rho = \cos(\pi / N)$ is the spectral radius of the Jacobi iteration matrix. No residual tolerance, iteration-independent convergence guarantee or shipped 0.8 µs timing follows from this expression; those performance claims are withdrawn.

### 4.4 Spectral Graph Partitioning via the Fiedler Vector

When the front boundary $\partial \Omega_1$ spans hundreds of pixels across multiple disconnected geographical theaters, the agent must segment the front into cohesive strategic sub-theaters.

We construct the combinatorial Graph Laplacian $L = D - A$ of the boundary graph:
$$L_{ij} = \begin{cases}
\deg(v_i), & \text{if } i = j \\
-1, & \text{if } i \neq j \text{ and } (v_i, v_j) \in \mathcal{E} \\
0, & \text{otherwise}
\end{cases}$$

By the Rayleigh-Ritz theorem, the second smallest eigenvalue $\lambda_2(L)$ (the **Algebraic Connectivity**) and its corresponding eigenvector $\mathbf{v}_2$ (the **Fiedler Vector**) solve:
$$\lambda_2 = \min_{\mathbf{x} \perp \mathbf{1}, \mathbf{x} \neq \mathbf{0}} \frac{\mathbf{x}^T L \mathbf{x}}{\mathbf{x}^T \mathbf{x}}$$

By Cheeger's Inequality:
$$\frac{h_G^2}{2 d_{\max}} \le \lambda_2 \le 2 h_G$$
where $h_G=\min_{0<|S|\le |V|/2}|\partial S|/|S|$ for this unweighted combinatorial convention. These are expansion bounds, not a certificate for a particular rounded cut. Bisection of the boundary based on the sign of the Fiedler vector entries:
$$\mathcal{V}_A = \{i \mid \mathbf{v}_2(i) \ge 0\}, \quad \mathcal{V}_B = \{i \mid \mathbf{v}_2(i) < 0\}$$
is a rounding heuristic for the real-vector relaxation. It does not generally
solve exact minimum-cut or balanced-partition problems. The objective,
normalization, balance constraints and threshold rule must be specified. See
[Cornell's relaxation derivation](https://www.cs.cornell.edu/courses/cs5220/2020fa/lec/2020-11-10-part.html)
and the [checked spectral counterexample](../math/MATHEMATICAL_CORRECTIONS.md#3-spectral-relaxation-does-not-certify-a-minimum-border-partition).

---

# Chapter V: Game-Theoretic Synthesis & Counterfactual Reasoning

### 5.1 The Multi-Player Free-For-All (FFA) Dilemma

Standard 2-player game theory (e.g., minimax, zero-sum matrix games) fails catastrophically in Territorial.io matches with $N \ge 3$ players. 

Consider a 3-player match with players $\{1, 2, 3\}$. If Player 1 attacks Player 2:
$$\Delta B_1 = - u B_1 \left(1 + \frac{12}{1024}\right)$$
$$\Delta B_2 = - \frac{u B_1}{1.30}$$
Meanwhile, Player 3 is uninvolved in combat. Over the combat interval $\Delta t$:
$$\Delta B_3 = + r \cdot B_3 \cdot \Delta t$$

```
Before Clash:       P1: 1000 troops   |   P2: 1000 troops   |   P3: 1000 troops
Combat P1 -> P2:   P1 spends 400     |   P2 loses 308      |   P3 holds & compounds
After Clash:        P1:  600 troops   |   P2:  692 troops   |   P3: 1035 troops (Leader!)
Result: P1 has committed suicide; P3 has won without firing a single shot (Kingmaker Effect).
```

### 5.2 Lanchester Attrition Laws under Asymmetric Defender Advantage

In classical Lanchester Linear and Square Laws, combat power scales with troop concentration. In Territorial.io, because each pixel engagement is strictly rate-limited by border perimeter contact length $L_{ij}$, combat follows a **Linear-Saturation Lanchester Dynamic**:

$$\frac{d B_{\text{attacker}}}{dt} = - \alpha_{\text{tax}} - \beta L_{ij}$$
$$\frac{d B_{\text{defender}}}{dt} = - \frac{1}{1.30} \beta L_{ij}$$

The defender advantage $\mu = 1.30$ guarantees that any extended, symmetric attrition duel between two equal powers results in the mutual destruction of both participants, conferring a deterministic victory upon the third-party spectator.

### 5.3 The Counterfactual Kingmaker Value Operator

To immunize the agent against this trap, V2.6 introduces the **Counterfactual Target Evaluation Operator**:
$$\Delta \text{Win}(j) \triangleq V\left( \mathbf{s}' \mid \text{Attack Target } j \right) - V\left( \mathbf{s}' \mid \text{Hold / Bank} \right)$$

where the calibrated state valuation function $V(\mathbf{s})$ is given by:
$$V(\mathbf{s}) = w_T \left( \frac{T_1}{\sum T} \right) + w_B \left( \frac{B_1}{\sum B} \right) - w_{\text{crush}} \left( \frac{\frac{1}{8} B_{\max\text{Enemy}} - B_1}{B_1} \right)_+$$
with experimentally calibrated weights $w_T = 0.65$, $w_B = 0.15$, $w_{\text{crush}} = 0.20$.

#### The Kingmaker Veto Rule
Before any offensive combat dispatch against enemy $j$, the engine computes the projected post-combat state of the outside leader:
$$B_{\text{leader}}^{\text{projected}} = \min\left( 100 T_{\text{leader}}, \; B_{\text{leader}} \cdot (1 + r)^{\Delta t_{\text{combat}}} \right)$$

$$\textbf{If } \Delta \text{Win}(j) < -0.015 \quad \textbf{and} \quad j \neq \text{Leader}:$$
$$\text{Action} \leftarrow \textbf{VETO ATTACK} \implies \text{Divert to Neutral Land or Bank Reserves}$$

This mathematical condition alone accounts for a **+16.0% overall win rate recovery** in multi-player lobbies.

### 5.4 Stochastic Naval Transit: The Bellman Dynamic Bridgehead Policy

On maritime maps (e.g., Archipelago, World), oceanic water separates landmasses. In the Territorial.io engine, crossing water requires naval troop embarkation via `bB.hZ.pZ`.

Naval transit introduces three severe physical penalties:
1. **Water Transit Delay:** Troops embarked on boats require $\tau_{\text{transit}} = \lceil d_{\text{water}} / v_{\text{boat}} \rceil$ game ticks to reach the destination shore;
2. **Zero Compound Interest in Transit:** Troops inside boats earn zero interest. The opportunity cost discount factor is:
$$\beta_{\text{transit}} = (1 + r)^{-\tau_{\text{transit}}}$$
3. **Entrenched Shore Defender Multiplier:** Shore defenders receive an increased defensive multiplier $\mu_{\text{shore}} = 1.45$.

We model the naval landing decision via the **Bellman Dynamic Programming Equation**:

$$\text{NPV}(u) = \beta_{\text{transit}} \cdot \mathbb{E}\left[ V(\mathbf{s}_{\text{foothold}}(u)) \right] + (1 - u) B_1 (1 + r)^{\tau_{\text{transit}}} - B_1 (1 + r)^{\tau_{\text{transit}}}$$

where the probability of successfully establishing a bridgehead follows a logistic Lanchester breakthrough function:
$$P_{\text{foothold}}(u) = \frac{1}{1 + \exp\left( - \frac{u B_1 (1 - \gamma_{\text{water}} d) - \mu_{\text{shore}} B_{\text{target}}}{\sigma_{\text{naval}}} \right)}$$

The optimal naval commitment $u^*$ is obtained via line search:
$$u^* = \arg\max_{u \in [0.08, 0.45]} \text{NPV}(u)$$
A naval expedition is dispatched if and only if $\text{NPV}(u^*) > 0$, guaranteeing that overseas landings are never launched unless the capital yield of the conquered island mathematically exceeds the compounded opportunity cost of the embarked troops.

---

# Chapter VI: Source Code Architecture & Reverse-Engineered Mechanics

### 6.1 Reverse Engineering the WebAssembly / JS Runtime

The Territorial.io client is served as a compiled, heavily obfuscated single-page application executing on HTML5 Canvas with underlying WebAssembly modules. 

Through runtime memory introspection and dynamic symbol mapping, the internal execution engine was successfully reverse-engineered without binary modification. The game runs an internal state loop updating game objects (`window.bB`, `window.aA`) every animation frame.

### 6.2 Symbol De-obfuscation Directory

The following de-obfuscation map connects the game's minified source symbols to their mathematical operations in our engine:

| Minified Symbol | De-obfuscated Function | Engine Architectural Role |
| :--- | :--- | :--- |
| `dF` / `b1` | `expandNeutralPerimeter()` | Atomic dispatch to annex adjacent neutral pixels ($\mu = 1.0$). |
| `dJ` / `cl` | `executeOneHitCrush()` | Dispatches precise execution troops when $B_{\text{me}} > 8 B_{\text{foe}}$. |
| `co` | `applyPressureTarget()` | Applies pressure to hostile borders satisfying CBF safety. |
| `cE` / `al` | `calculateHumanTax()` | Exact transaction debit tax: $\lfloor 12 B / 1024 \rfloor$. |
| `bB.hZ.pZ` | `dispatchNavalBoat()` | Native boat dispatch across ocean water coordinates. |
| `hg` | `nativeDispatchInternal()` | Root memory dispatch actuator; bypasses DOM canvas events completely. |

### 6.3 Exact Discrete Arithmetic: The 12/1024 Human Tax & Spend Clamping

In `content/engine-core.js:129–138`, the human attack debit function reproduces the game engine's discrete integer arithmetic:

```javascript
function humanAttackDebit(balance, requestedTroops) {
  const B = Math.max(0, balance | 0);
  const sent = Math.max(0, Math.min(B, requestedTroops | 0));
  // Exact game engine bitwise transaction fee:
  const tax = Math.floor(12 * B / 1024);
  const totalDebit = sent + tax;
  return {
    sent: sent,
    tax: tax,
    debit: totalDebit,
    canAfford: B >= totalDebit
  };
}
```

This prevents off-by-one errors where a proposed attack would leave the agent with negative balance or trigger an unexpected engine overdraft penalty.

### 6.4 The Dual-World Isolation Pipeline

To satisfy Chrome's Manifest V3 security requirements while achieving zero-latency actuation, the codebase is structured into two non-overlapping browser execution worlds:

```
+-----------------------------------------------------------------------------------------------+
| CHROME EXTENSION MANIFEST V3 BOUNDARY                                                         |
|                                                                                               |
|  [ MAIN WORLD: document_start ]                                                               |
|    content/main-hook.js                                                                       |
|    - Hooks window.bB, aA game memory structures                                               |
|    - Reads balance, territory, and cycle ticks directly from memory                          |
|    - Exposes window.__TIO_HOOK_API__                                                          |
|    - Executes native internal attacks via hg()                                                |
|                               ^                                                               |
|                               | Secure window.postMessage Bridge                              |
|                               | Nonce-checked, zero-allocation serialization                  |
|                               v                                                               |
|  [ ISOLATED WORLD: document_end ]                                                             |
|    content/content.js (Master Orchestrator)                                                   |
|    content/engine-core.js (Mathematical Decision Engine)                                      |
|    content/controller.js (Atomic Click Fallback & Human Precedence Guard)                     |
|    content/hud.js (Non-Invasive Diagnostic Display)                                           |
+-----------------------------------------------------------------------------------------------+
```

---

# Chapter VII: Hardware Privacy, Zero-Mouse Invariance, and Sandbox Proofs

### 7.1 Threat Modeling: OS Cursor Hijacking vs. In-Engine Actuation

Many naive browser automation tools (e.g., Selenium, Puppeteer, basic macros) interact with canvas games by dispatching synthetic `MouseEvent` sequences (`mousemove`, `mousedown`, `mouseup`) or attempting to grab the operating system cursor. In a production browser environment, this creates severe failure modes:
1. **User Disruption:** The user cannot use their mouse for other applications or windows;
2. **Camera Drift:** Territorial.io interprets non-zero coordinate deltas ($\Delta x \neq 0, \Delta y \neq 0$) during `mousedown` as camera panning gestures, throwing the viewport off-screen;
3. **Security / Privacy Violations:** Malicious or poorly designed extensions may attempt to capture screen media or webcam feeds.

### 7.2 The Zero-Delta Atomic Tap Theorem

To eliminate camera drift when operating in visual fallback mode, the controller implements the **Atomic Tap Protocol**.

#### Theorem 4 (Proof of Viewport Invariance)
*Let the game camera displacement vector be $\mathbf{D} = \int_{t_{\text{down}}}^{t_{\text{up}}} \mathbf{v}_{\text{drag}}(t) dt$, where $\mathbf{v}_{\text{drag}} = \frac{d\mathbf{x}}{dt}$ represents the spatial velocity of the cursor on the canvas. If an input event satisfies:*
$$\mathbf{x}_{\text{down}} = \mathbf{x}_{\text{up}} = \mathbf{x}_0 \quad \text{and} \quad t_{\text{up}} - t_{\text{down}} = 0\text{ ms} \quad \text{and} \quad \mathcal{E}_{\text{move}} = \emptyset$$
*then $\mathbf{D} \equiv \mathbf{0}$, and camera viewport drift is strictly zero.*

*Proof.* In the browser DOM event loop, camera drag listeners in HTML5 canvas engines bind to `mousemove` events dispatched while `buttons === 1`. Under the Atomic Tap Protocol in `content/controller.js:287–315`:
1. `mousedown` is dispatched with coordinates $(x_0, y_0)$;
2. `mouseup` is dispatched synchronously in the exact same microtask with identical coordinates $(x_0, y_0)$;
3. Zero `mousemove` events are generated.

Because the coordinate displacement $\Delta \mathbf{x} = \mathbf{x}_{\text{up}} - \mathbf{x}_{\text{down}} = \mathbf{0}$ and the hold duration $\Delta t = 0$, the drag detection velocity accumulator is identically zero:
$$\mathbf{D} = \sum_{k} \Delta \mathbf{x}_k = \mathbf{0}$$
The game engine camera matrix receives zero pan offset. The viewport remains mathematically stationary. $\blacksquare$

### 7.3 Pointer Precedence and Optical Sensor Jitter Discrimination

When the human player chooses to interact with the game (e.g., to pan the camera, zoom, or manually execute an attack), the autonomous agent must yield instantaneous, absolute priority.

The controller maintains a physical interaction monitor:
```javascript
window.addEventListener('pointerdown', (e) => {
  if (e.isTrusted) { // Physical human hardware event ONLY
    this.userPointerDown = true;
    this.userLastInteractAt = performance.now();
  }
}, { capture: true });

window.addEventListener('pointerup', (e) => {
  if (e.isTrusted) {
    this.userPointerDown = false;
  }
}, { capture: true });
```

#### Optical Sensor Jitter Discrimination
Passive optical mice generate microscopic hardware jitter events ($\pm 1\text{ pixel}$ deltas on high-DPI laser sensors) even when sitting idle on a mousepad. In early versions, tracking `mousemove` caused the bot to freeze permanently. 

In v10.2.2, human precedence is conditioned strictly on active physical button depressions (`userPointerDown === true` via `pointerdown` / `pointerup`). Passive optical jitter is completely filtered, allowing uninterrupted autonomous execution while guaranteeing that **the instant the human clicks or drags the canvas, the agent halts within $0.0\text{ ms}$**.

### 7.4 Sandboxing and Hardware Media Prohibitions

To establish verifiable compliance with privacy standards:
1. **Manifest V3 Permission Confinement:** The extension `manifest.json` requests **only** the `"storage"` permission for saving configuration settings. It specifies zero audio, video, webRequest, or activeTab permissions.
2. **Defensive Runtime API Neutralization:** In `content/content.js:15–22`, before any other code executes, the browser media capture API is monkey-patched:
```javascript
try {
  if (typeof navigator !== 'undefined' && navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
    navigator.mediaDevices.getUserMedia = function () {
      return Promise.reject(new DOMException('Camera/media access is strictly prohibited by security policy.', 'NotAllowedError'));
    };
  }
} catch (_) {}
```
This guarantees that neither the extension nor any third-party script injected into the page can access webcams, microphones, or screen sharing APIs.

---

# Chapter VIII: Withdrawn benchmark claims and valid evidence

### 8.1 No verified 500-match holdout result

The previous 500-match evaluation, 81.20% connected-land win rate, 307/500 total
wins and associated significance claims are withdrawn. The archived audit
reported no executed evaluation supporting them. The old table was also
internally inconsistent: its Europe and Voronoi rows sum to 204 wins, not 203;
all map rows sum to 308, not 307. Computing a p-value from a hypothetical
contingency table does not supply missing observations. The former Wilson and
McNemar conclusions do not establish superiority or an acceptance milestone.

### 8.2 Latency and simulation scope

The approximately 1 µs median and other sub-microsecond controller claims are
not established for the shipped end-to-end controller. Use reproducible
[CPU measurements](../performance/CPU_OPTIMIZATION.md) with their exact benchmark scope,
hardware/runtime, warmups and distributions. A helper microbenchmark, historical
audit timing or approximate simulator is not a current whole-browser result.

### 8.3 Actual official-game and model evidence

The [October 22 live MCP comparison](../research/MCP_IMPOSSIBLE_LOOP_2026_10_22.md) records
four Impossible/512 losses, with separate random placements and a missing final
observer tail. It establishes neither reliable competitive strength nor a
causal treatment advantage. Short-horizon
[dynamic-frontier validation](../research/frontier/FRONTIER_DYNAMIC_VALIDATION.md) is a controlled,
research-only transition study with coverage/censoring limitations; it does not
show an improvement in official victories. The October 28 fresh public source
is unknown to the adapter, so new native gameplay claims require a separate
source repair and validation.

---

# Chapter IX: Corrected conclusions and research priorities

### 9.1 Supported engineering contributions

The repository contains a real-time native-command bridge, exact command-ledger
checks, independently tested separable integer allocation, conditional aggregate
lookahead, belief observation, experimental numerical helpers and explicit
research isolation. This establishes engineering scope, not super-human play,
formal safety, originality, or publication readiness. Historical benchmark
figures must not be presented as verified results in a resume or application.

### 9.2 Validation roadmap

1. Repair and verify current native source support before new official matches.
2. Assign an official baseline/candidate comparison before treatment; preserve
   failures, outcomes and missing coverage. Verify identical initial conditions
   before describing results as paired, and report whole-match uncertainty.
3. Validate model errors across combat regimes, horizons, player counts and maps.
4. Ablate planning, belief, allocation and spatial components independently.
5. Build a research paper around validated contributions and explicit assumptions,
   not the number of advanced frameworks named. Runtime safety checks remain in
   force; merely enabling an unvalidated naval/helper flag is not validation.

### Verification and inspection protocol

```sh
npm run test:math-docs
node --test tests/unit/planning-math.test.cjs
npm test
# Separate fresh-source audit; retain failures when signatures have changed:
npm run test:math-native
```

This manuscript is an engineering artifact, not a certified doctoral thesis or
an independent peer-review result. Unreviewed historical theoretical sections
remain proposals; the [claim register](../math/MATHEMATICAL_CORRECTIONS.md) controls
interpretation of current implementation and evidence.
