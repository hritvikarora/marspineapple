# MARS PATHFINDER — Admissibility, Exclusions & Cost Model Specification (`educational-eva-v1`)

This document is the engineering and scientific reference for **Point 3 of Ayush's assignment**: how the solver determines where a simulated astronaut can walk (**Hard Exclusions / Admissibility**), how source observation-quality codes are separated into hard exclusions vs. soft penalties, how competing corridors are scored (**Soft Costs & Policies**), and the critical model caveats and edge cases we enforce in `src/routing/`.

---

## 1. Scientific & Engineering Grounding — and Model Note Distinctions

### 1.1 The $20^\circ$ Limit Is a Grid-Scale Modeling Assumption
Our default profile (`educational-eva-v1`) caps terrain slope at $20^\circ$ and along-edge grade at $20^\circ$ (with sensitivity profiles at $15^\circ$ and $25^\circ$). While NASA's *Exploration EVA System Concept of Operations (`EVA-EXP-0042`)* uses $20^\circ$ as an operational surface walking limit, **three critical physical distinctions must be stated in the model note and UI**:

1. **Resolution Baseline Dependence ($10\text{ m}$ vs. $40\text{ m}$):**
   - A $3 \times 3$ Horn slope measures elevation gradient over a horizontal baseline of approximately **two cell widths ($2\Delta x$)**.
   - On a $5\text{ m}$ DEM, $2\Delta x = 10\text{ m}$. On a $20\text{ m}$ CTX DEM, $2\Delta x = 40\text{ m}$.
   - A $20^\circ$ cutoff over a $40\text{ m}$ baseline is a completely different terrain feature than a $20^\circ$ cutoff over a $10\text{ m}$ baseline (or a $1\text{ m}$ HiRISE post). Sensitivity checks at $15^\circ$ and $25^\circ$ do not capture resolution scaling—we must always report the **effective slope baseline ($2\Delta x\text{ m}$)** alongside the angle.
2. **Symmetric Uphill, Downhill, and Cross-Slope Treatment:**
   - Real EVA ergonomics distinguish uphill climbing (metabolic cost), downhill walking (slip/braking hazard), and cross-slope sidehilling (ankle/cuff roll).
   - Our model intentionally collapses directional grade into absolute grade $|g(u,v)|$ and isotropic gradient magnitude $s[k]$.
   - **Why:** This keeps every edge cost **symmetric ($\text{cost}(u,v) = \text{cost}(v,u)$)**, which makes the admissible graph undirected and guarantees that the reversed outbound path is cost-optimal for the return leg. The model note explicitly states that directional categories are not modeled in the cost, so return-leg reversal is optimal only while costs remain symmetric.
3. **One `NoData` Post Expands Under All-or-Nothing $3\times 3$ Horn Windows:**
   - Under an all-or-nothing $3 \times 3$ Horn slope rule, a single missing `NoData` pixel marks all $8$ of its surrounding neighbors as `UNSUPPORTED_DERIVATIVE` (creating a $3 \times 3$ blocked island), and the diagonal no-corner-cutting rule blocks diagonals around that $3 \times 3$ ring.
   - Before locking the all-or-nothing derivative rule on a real crop, the preprocessing validation record must count how many finite-elevation cells are deleted by `UNSUPPORTED_DERIVATIVE`. If isolated `NoData` posts sever a $1\text{ km}$ crop, preprocessing may use a documented partial-window fit and force those cells' observation quality to `UNKNOWN`.

---

### 1.2 Separating USGS Source Confidence Codes Before Soft Penalties
In USGS Astrogeology HiRISE DTMs (generated via BAE Systems **SOCET SET**, source `S07`), the companion **Figure of Merit (FOM)** / PDS 8-class confidence raster encodes fundamentally different photogrammetric states that **must not all be collapsed into a single soft penalty $U = 1$**:

- **Raw Source Code Preservation:** The region bundle preserves the raw integer category (`sourceQualityCode: Uint8Array`) separately from our versioned penalty mapping (`qualityMapVersion: 'usgs-fom-v1'`).
- **Category Split:**

| USGS / PDS FOM Class | Photogrammetric Meaning | Routing Treatment | Canonical State & Default Penalty |
| :--- | :--- | :--- | :--- |
| **Good Correlation** | Strong stereo texture match | **Admissible** | `ACCEPTABLE` ($U = 0.0$) |
| **Manually Edited** | Post repaired by photogrammetrist in SOCET SET | **Admissible** (do not treat repaired posts as worst terrain) | `ACCEPTABLE` ($U = 0.0$) or configurable minor penalty ($U = 0.25$) in versioned table |
| **Low Correlation** | Weak stereo match on bland/smooth sand or dust | **Soft Penalty** (`prefer`) / Excluded (`strict`) | `LOW` ($U = 1.0$) |
| **Absence of FOM Layer** | Coarse CTX DEM or unmapped confidence | **Soft Penalty** (`prefer`) / Excluded (`strict`) | `UNKNOWN` ($U = 0.75$) |
| **Interpolated / Extrapolated** | Missing stereo data filled by mathematical surface bridging (invented height) | **Hard Exclusion** (treated like unmeasured terrain) | `INVALID` (`INTERPOLATED_HEIGHT_EXCLUDED`) |
| **Shadowed / Saturated / Suspicious** | Deep shadow, sensor saturation, or geometric pushbroom blunder | **Hard Exclusion** | `INVALID` (`UNRELIABLE_OBSERVATION_EXCLUDED`) |
| **NoData / Null** | Outside footprint or missing post | **Hard Exclusion** | `INVALID` (`NO_DATA_ELEVATION`) |

> **Why Interpolated/Extrapolated Posts Are Hard-Excluded — and Must Be Masked Before Derivatives (Support-Validity Rule):**
> 1. When stereo matching fails across a boulder field or deep shadow, mathematical interpolation bridges straight across the gap, producing a smooth, gentle-looking $2^\circ$ surface over an unmeasured hazard. Treating invented heights as a soft penalty ($U = 1$) would still let a short detour walk across invented elevation. They belong in Hard Exclusion (`q = INVALID`) alongside `NoData`.
> 2. **Elevation-Support Mask Before Resampling & Derivatives (Finding 4 Safeguard):** Because `INTERPOLATED`, `EXTRAPOLATED`, `SHADOWED`, `SATURATED`, and `SUSPICIOUS` source posts can contain finite numeric height values in the raw GeoTIFF, preprocessing must decode source quality **before** any continuous resampling, warping, $3 \times 3$ Horn slope, or plane-fit roughness calculation. An explicit **elevation-support mask** ($\text{supported}[p] \iff \text{validElevation}[p] \land q[p] \neq \text{INVALID}$) masks out unsupported finite heights first so they never contaminate adjacent accepted cells' resampled heights, slopes, or roughness residuals. If a partial-window derivative fallback is used near unsupported posts, it must fit only supported samples and force the resulting cell's quality class to `UNKNOWN`.

---

## 2. Movement Model: 8-Neighbor Grid & Corner-Cutting Rules

### 2.1 The 8 Canonical Neighbor Offsets
For deterministic behavior across runs, the solver always iterates through the 8 neighbors of cell $u = (\text{row}_u, \text{col}_u)$ in a fixed clockwise order starting from North:

| Dir Index | Name | $\Delta r$ (`dRow`) | $\Delta c$ (`dCol`) | Type | Planar Step Length $d(u,v)$ | Orthogonal Corner Cells $(w_1, w_2)$ |
| :---: | :--- | :---: | :---: | :--- | :--- | :--- |
| `0` | **N** | $-1$ | $0$ | Cardinal | $\Delta y$ | — |
| `1` | **NE** | $-1$ | $+1$ | Diagonal | $\sqrt{\Delta x^2 + \Delta y^2}$ | $(r_u - 1, c_u)$ and $(r_u, c_u + 1)$ |
| `2` | **E** | $0$ | $+1$ | Cardinal | $\Delta x$ | — |
| `3` | **SE** | $+1$ | $+1$ | Diagonal | $\sqrt{\Delta x^2 + \Delta y^2}$ | $(r_u + 1, c_u)$ and $(r_u, c_u + 1)$ |
| `4` | **S** | $+1$ | $0$ | Cardinal | $\Delta y$ | — |
| `5` | **SW** | $+1$ | $-1$ | Diagonal | $\sqrt{\Delta x^2 + \Delta y^2}$ | $(r_u + 1, c_u)$ and $(r_u, c_u - 1)$ |
| `6` | **W** | $0$ | $-1$ | Cardinal | $\Delta x$ | — |
| `7` | **NW** | $-1$ | $-1$ | Diagonal | $\sqrt{\Delta x^2 + \Delta y^2}$ | $(r_u - 1, c_u)$ and $(r_u, c_u - 1)$ |

### 2.2 Strict Diagonal No-Corner-Cutting (Both Hard Exclusions AND Soft Quality Penalties)
When stepping diagonally from $u = (r_u, c_u)$ to $v = (r_u + \Delta r, c_u + \Delta c)$ where $|\Delta r| = 1$ and $|\Delta c| = 1$, the straight line connecting their cell centers passes directly through the shared corner vertex of four cells: $u$, $v$, $w_1 = (r_u + \Delta r, c_u)$, and $w_2 = (r_u, c_u + \Delta c)$.

```text
+-------------------+-------------------+
| w1 = (r_u - 1, c) | v  = (r_u - 1,c+1)|
|   [Corner 1]      |   [Target ↗]      |
+-------------------+---------/---------+
| u  = (r_u, c)     | w2 = (r_u, c + 1) |
|   [Start] --------+-------/ [Corner 2]|
+-------------------+-------------------+
```

1. **Hard Corner-Cutting Rule (Admissibility):**
   A diagonal transition $(u \to v)$ is **strictly forbidden** if **either** orthogonal neighbor $w_1$ or $w_2$ fails cell admissibility under the current request's profile and quality mode:
   $$\text{CanStepDiagonal}(u, v) \iff \text{IsCellAdmissible}(v) \land \text{IsCellAdmissible}(w_1) \land \text{IsCellAdmissible}(w_2) \land \big(g_{\text{abs}}(u, v) \le \theta_{\text{maxGrade}}\big)$$

2. **Soft Corner-Clipping Rule (Observation Quality Penalty & Exposure):**
   Even when $w_1$ and $w_2$ are admissible (e.g., `LOW` quality in `prefer` mode), a diagonal step $(u \to v)$ physically passes through the corner vertex of $w_1$ and $w_2$. If $w_1$ or $w_2$ has `LOW` or `UNKNOWN` observation quality, allowing $(u \to v)$ to pay $U = \max(U[u], U[v]) = 0$ and report $0\text{ m}$ of low-quality exposure would let Blindspot mode clip the corner of an uncertain cell while claiming full avoidance!
   Therefore, for any diagonal step $(u \to v)$, both the **quality penalty $U(u,v)$** and the **exposure classification $\text{edgeClass}(u,v)$** take the worst quality across all four cells sharing the corner vertex:
   $$U_{\text{diag}}(u, v) = \max\big(\pi_U(q[u]), \; \pi_U(q[v]), \; \pi_U(q[w_1]), \; \pi_U(q[w_2])\big)$$
   $$\text{edgeClass}_{\text{diag}}(u, v) = \max_{\text{severity}}\big(q[u], \; q[v], \; q[w_1], \; q[w_2]\big)$$

---

## 3. Step 1 — Hard Exclusions: Cell-Level vs. Edge-Level Admissibility

Hard exclusions determine **whether a cell or step exists in the traversable graph at all**.

### 3.1 Layer A: Canonical Cell-Level Admissibility (`getCellExclusionReason`)
A single canonical function `getCellExclusionReason(bundle, k, profile, qualityMode)` evaluates cell $k \in \{0, \dots, W \cdot H - 1\}$ in strict priority order. **This exact function is used for endpoint validation (before the same-cell shortcut), neighbor expansion, diagonal corner checks, connected-component labeling, and final path verification:**

| Priority | Reason Code | Condition that Triggers Exclusion | Category |
| :---: | :--- | :--- | :--- |
| **1** | `OUTSIDE_BOUNDS` | $r < 0 \lor r \ge H \lor c < 0 \lor c \ge W$ | Spatial Boundary |
| **2** | `NO_DATA_ELEVATION` | $\text{validMask}[k] = 0 \lor \neg\text{Number.isFinite}(z[k]) \lor z[k] = z_{\text{NoData}}$ | Evidence Limitation |
| **3** | `INTERPOLATED_OR_UNRELIABLE` | $q[k] = \text{INVALID}$ (e.g., interpolated/extrapolated/shadowed FOM code) | Evidence Limitation |
| **4** | `UNSUPPORTED_DERIVATIVE` | $(\text{exclusionMask}[k] \mathbin{\&} \text{BIT\_DERIV}) \neq 0 \lor \neg\text{Number.isFinite}(s[k])$ | Evidence Limitation |
| **5** | `EXPLICIT_EXCLUSION` | $(\text{exclusionMask}[k] \mathbin{\&} \text{BIT\_MANUAL}) \neq 0$ | Curated Exclusion |
| **6** | `TERRAIN_SLOPE_EXCEEDED` | $s[k] > \theta_{\text{maxSlope}}$ (e.g., $> 20^\circ$) | Physical Model Limit |
| **7** | `STRICT_QUALITY_EXCLUDED` | `qualityMode === 'strict'` $\land \; q[k] \notin \mathcal{Q}_{\text{acceptable}}$ | Evidence Limitation |
| **0** | `NONE` (Admissible) | Passes all checks 1–7 | Traversable |

### 3.2 Layer B: Edge-Level Admissibility (`EdgeExclusionReason`)
Evaluated when stepping from $u$ to neighbor $v$:
1. **Target Cell Blocked:** $\text{CellExclusionReason}(v) \neq \text{NONE}$.
2. **Diagonal Corner Blocked (`DIAGONAL_CORNER_BLOCKED`):** Step is diagonal and $\text{CellExclusionReason}(w_1) \neq \text{NONE} \lor \text{CellExclusionReason}(w_2) \neq \text{NONE}$.
3. **Along-Edge Grade Exceeded (`EDGE_GRADE_EXCEEDED`):**
   $$g_{\text{abs}}(u, v) = \arctan\!\left(\frac{|z[v] - z[u]|}{d(u, v)}\right) \cdot \frac{180}{\pi} > \theta_{\text{maxGrade}}$$

---

## 4. Step 2 — Soft Costs, Normalization & The Three Policies

### 4.1 The Single Authoritative Edge Cost Formula
For any admissible step $(u \to v)$ of planar length $d(u, v) > 0$:
$$\text{edgeCost}(u, v) = d(u, v) \cdot \big(1 + \alpha S(u, v) + \beta R(u, v) + \gamma_{\text{eff}} U(u, v)\big)$$

where:
- **$S(u, v) \in [0, 1]$ (Normalized Slope Penalty):**
  $$S(u, v) = \text{clamp}_{[0,1]}\!\left(\frac{\max(s[u], s[v])}{\theta_{\text{maxSlope}}}\right)$$
- **$R(u, v) \in [0, 1]$ (Normalized Roughness Penalty):**
  $$R(u, v) = \text{clamp}_{[0,1]}\!\left(\frac{\max(\sigma_{\text{res}}[u], \sigma_{\text{res}}[v])}{R_{\text{scale}}}\right)$$
- **$U(u, v) \in [0, 1]$ (Observation Quality Penalty):**
  - Cardinal edge: $U(u, v) = \max\big(\pi_U(q[u]), \; \pi_U(q[v])\big)$
  - Diagonal edge: $U(u, v) = \max\big(\pi_U(q[u]), \; \pi_U(q[v]), \; \pi_U(q[w_1]), \; \pi_U(q[w_2])\big)$

| Policy | $\alpha$ | $\beta$ | Configured $\gamma$ | Effective $\gamma_{\text{eff}}$ | Multiplier on Flat Low-Quality ($S=0,R=0,U=1$) | Multiplier on Steep Rough ($S=1,R=1,U=0$) |
| :--- | :---: | :---: | :---: | :--- | :---: | :---: |
| **`shortest`** | $0$ | $0$ | $0$ | $0$ | $1.0\times$ | $1.0\times$ |
| **`terrain`** | $2$ | $1$ | $0$ | $0$ | $1.0\times$ | **$4.0\times$** |
| **`uncertainty`** | $2$ | $1$ | $2$ | $0$ if $U_{\max}=U_{\min}$; else $2$ | **$3.0\times$** (when $\gamma_{\text{eff}}=2$) | **$4.0\times$** |

---

## 5. Critical Edge Cases & How We Handle Them

### Edge Case 1: Uniform Quality Across the Region ($U_{\max} = U_{\min}$) — Explicit Effective-Policy Model Rule ($\gamma_{\text{eff}} = 0$)
- **Why `terrain` is NOT optimal for the raw $\gamma = 2$ formula under uniform positive $U$:**
  When every admissible cell has the same positive penalty $U_0 > 0$ (e.g., uniform `UNKNOWN` with $U = 0.75$ and $\gamma = 2$), the raw cost is:
  $$C_{\text{raw}}(P) = C_{\text{terrain}}(P) + 1.5 \cdot D_{\text{horiz}}(P)$$
  **Verified Counterexample:** On a $3 \times 5$ grid ($\Delta x = \Delta y = 10\text{ m}$, $R = 0$, uniform $U = 0.75$) where cell $(1,2)$ has $s = 10^\circ$ ($S = 0.5$) and all other cells have $s = 0^\circ$:
  - Direct middle path ($40.0\text{ m}$): $C_{\text{terrain}} = 60.000000$, raw $C_{\text{uncertainty}}(\gamma=2) = 60 + 1.5(40) = \mathbf{120.000000}$.
  - Flat detour ($48.284271\text{ m}$): $C_{\text{terrain}} = \mathbf{48.284271}$, raw $C_{\text{uncertainty}}(\gamma=2) = 48.284271 \times 2.5 = 120.710678$.
  Under the raw $\gamma = 2$ objective, Dijkstra selects the **steeper direct path ($120.0$)** rather than the `terrain` detour ($120.71$). Claiming that copying `terrain` preserves the raw $\gamma = 2$ optimum is false.
- **Why subtracting $U_{\min}$ from $U(u,v)$ is also wrong:**
  On a non-uniform map that is mostly `UNKNOWN` ($0.75$) with a few `LOW` ($1.0$) cells and zero `ACCEPTABLE` cells, subtracting $U_{\min} = 0.75$ alters the objective on non-uniform maps.
- **The Correct Resolution (Explicit Effective-Policy Model Rule $\gamma_{\text{eff}} = 0$ When $U_{\max} = U_{\min}$):**
  1. We define as an explicit, exported **model rule** (not a cost-preserving shortcut claim on the raw $\gamma = 2$ formula) that when observation quality has zero spatial variation across all admissible cells in the bundle ($U_{\max} = U_{\min}$), the `uncertainty` policy sets its **effective weight to $\gamma_{\text{eff}} = 0$** (`uniformQualityOverride: true`).
  2. Both A* and the Dijkstra verification oracle evaluate the effective objective $(\alpha=2, \beta=1, \gamma_{\text{eff}}=0)$, and the response exports `effectiveWeights: { alpha: 2, beta: 1, gamma: 0, configuredGamma: 2, uniformQualityOverride: true }` alongside warning `UNIFORM_QUALITY_NO_DIFFERENTIATION`.
  3. **Standalone `['uncertainty']` Requests (Finding 7 Fix):** Because $\gamma_{\text{eff}} = 0$ is a property of the effective policy configuration, a request with `policies: ['uncertainty']` (where `'terrain'` was not requested) runs `uncertainty` directly using $\gamma_{\text{eff}}$ and returns only the requested `'uncertainty'` policy—never depending on or injecting an unrequested `'terrain'` candidate. When both `'terrain'` and `'uncertainty'` *are* requested on a uniform-quality bundle, they share identical effective weights $(\alpha=2,\beta=1,\gamma_{\text{eff}}=0)$ and merge cleanly into `['terrain', 'uncertainty']`.
  4. **Valid Cost-Preserving Reuse When $U(e) = 0$ on Every Edge of $P_{\text{terrain}}$:** Even on a non-uniform bundle ($\gamma_{\text{eff}} = 2$), if `'terrain'` was already solved in the same request and every edge along $P_{\text{terrain}}$ has $U(e) = 0$ (`ACCEPTABLE` quality), then $C_{\text{uncertainty}}(P_{\text{terrain}}) = C_{\text{terrain}}(P_{\text{terrain}}) \le C_{\text{terrain}}(P) \le C_{\text{uncertainty}}(P)$ holds exactly under $\gamma_{\text{eff}} = 2$, so reusing $P_{\text{terrain}}$ is a true cost-preserving optimization.

### Edge Case 2: `strict` Mode When the Dataset Has Zero `ACCEPTABLE` Cells
- On a CTX fallback dataset where all valid cells are `UNKNOWN`, switching `qualityMode` to `'strict'` excludes every cell not in $\mathcal{Q}_{\text{acceptable}}$.
- The solver detects that $0$ admissible cells remain and immediately returns `no_path` (or `invalid_input` on the endpoints) with `STRICT_MODE_NO_DOCUMENTED_QUALITY_IN_BUNDLE`.

### Edge Case 3: Sensitivity Profile Presets (`15°`, `20°`, `25°`)
| Profile ID | Max Terrain Slope ($\theta_{\text{maxSlope}}$) | Max Route Grade ($\theta_{\text{maxGrade}}$) | Roughness Scale ($R_{\text{scale}}$) | Purpose |
| :--- | :---: | :---: | :---: | :--- |
| `educational-eva-v1` | **$20^\circ$** | **$20^\circ$** | $0.5\text{ m}$ | Default release profile |
| `educational-eva-conservative-15` | **$15^\circ$** | **$15^\circ$** | $0.5\text{ m}$ | Lower-threshold sensitivity check |
| `educational-eva-extended-25` | **$25^\circ$** | **$25^\circ$** | $0.5\text{ m}$ | Higher-threshold sensitivity check |
