# Territorial.io source map (v9.0 — your dump + live site)

Source dump: `~/Downloads/source code.html`

## Readable source (your HTML dump)

| Symbol | Meaning |
|--------|---------|
| `ap` | Local human player index |
| `aq[p]` | Troop balance |
| `ax[p]` | Border cells list (attack frontier) |
| `bF[p]` | Territory cells |
| `bN[p]` | Territory size (pixels) |
| `b1` | Empty / uncaptured land marker |
| `am = 2` | Cost multiplier for empty tiles |
| `al(a,b)` | `floor(a/b + 1/(2b))` |
| `cE(g,k,y,l)` | Attack: player g → target k, frontier y, troops l |
| `dF(g,k)` | Expand into empty land with troops k |
| `dJ(g,k,y)` | Attack enemy y with troops k (crush if stronger) |
| `cQ` / `cL` | Prepare borders for empty / enemy targets |
| `cR` / `cd` | Scan neighbors into `cb[]` |
| `ce()` | True if empty land in neighbor set (then `dF`) |
| `cl(g)` | Weakest neighbor (min balance + border pressure) |
| `co(g)` | Closest neighbor by centroid |
| `dD` / `dC` | Bot decision tick (SP / multi) |
| `dU.d7` | Bot timer: `d3(p, al(kScale * aq[p], 1000))` |
| `dT` | Pressure `[60,74,112,200,256,512]` |

### Attack tax (cE)
```
tax = al(3 * balance, 256)   // ~1.2% of balance
if troops >= balance/2: troops -= tax first  // dump nuance
aq[g] -= troops + tax
```

### Crush (dJ)
```
if al(aq[me], 8) > aq[enemy]:
  troops = max(troops, al(11 * aq[enemy], 5))
cL(me, enemy)
cE(me, enemy, frontierLen, troops)
```

### Expand (dF)
```
cQ(me)  // borders facing empty
cE(me, b1, frontierLen, troops)
```

### Bot decision (dD) — single-player spirit
```
if has neighbors:
  if empty present: dF(me, troops)      // expand first
  else if random weak-bias: dJ(me, troops, cl(me))
  else: dJ(me, troops, co(me))
```

### Bot difficulty (readable dU)
```
db = Very Easy … Very Hard
dc ≈ decision weights
dT = [60,74,112,200,256,512]  // pressure scale
```

## Live desktop site mapping

| Readable | Live web |
|----------|----------|
| `aq` | `ah.hB` |
| `ap` | `aE.et` |
| empty land | `aE.f6` (for human `hg`) |
| human attack | `bB.hZ.hg(il, jd)` |
| local bot attack | `ap.jF.jc(player,jd,f9,hs)` + `ae.eg` |
| il encoding | `floor(ratio*1024+0.5)-1` ∈ [0,1023] |
| spent | `floor(balance * (il+1) / 1024)` |
| tax on jc | `floor((12*balance+0.5)/1024)` |
| Hard il | `kg[3]=300` → ≈ **29.4%** |
| fronts | `ki[3]=4` |
| reserve | `32/1024` ≈ 3.1% |
| density cap | `min(100 * territory, globalCap)` |

## Very Hard bot (dump dU index 5) — what we copy

| Behavior | Source | Our agent |
|----------|--------|-----------|
| Empty land first | `dD` → `ce` → `dF` | Always expand while freeLand > ~2.5% |
| Weak target 90% | `dI[5]=90` → `cl` | Prefer weakest enemy when fighting |
| Crush finish | `dJ` if me/8 > foe | `troops = max(k, al(11*foe,5))` |
| Commit open ~45% | VH `k≈400–500` | `attackRatio ≈ 0.42–0.45` |
| Fast ticks | `u=m=1000` → ~100 engine ticks | `pulseMs ≈ 70–85` |
| Multi-front | live `ki[VH]=6` | up to 6 expand clicks / burst |
| Dump excess | `d3` if bal > reserve | spend balance − softReserve |

## Adjacency & ships (live game, v9.4)

| Action | API | Rule |
|--------|-----|------|
| Land attack | `bB.hZ.hg(il, jd)` | Target must be **adjacent** (`ae.jp(me,jd)` / neighbor list `ae.gL`) or free land `aE.f6` |
| Ship / boat | `bB.hZ.pZ(il, pa)` | Sea-separated islands; enabled when `aE.i3`; UI: “Launch Ship Towards Mouse Pointer” |
| Neighbor list | `ae.gG(me)`, `ae.gL(me,i)`, `ae.gM(me,i)` | Border graph — only these land targets work |

Vision clicks only hit cells **4-adjacent to mine** (neutral or enemy). Never deep inland non-neighbors.

## Our actuator priority (v9.4)

1. Expand free land if bordering us  
2. Land-attack **adjacent** enemies only  
3. Ship-attack non-adjacent islands when `aE.i3`  
4. Click fallback only on adjacent cells  
5. Engine only after Play + spawn confirm  

## Hook export

Safe in-place patch only (no double-boot). DOM: `data-tio-internal`, `data-tio-paths`, `data-tio-hook`.
