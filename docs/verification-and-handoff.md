# MARS PATHFINDER — Verification Matrix, Hand-Computable Fixtures & Handoff Specification

This document is the reference for **Point 6 of Ayush's assignment**: how we verify the routing engine using a reference Dijkstra oracle and 12 hand-computable synthetic fixtures in `tests/fixtures/`, how we measure solve times on the demonstration machine, and the handoff deliverables for Gates G0–G6.

---

## 1. The Reference Dijkstra Verification Protocol

### 1.1 Why Compare Against Dijkstra?
By running a standalone **Dijkstra solver** (`solveDijkstra`, which sets $h(u) \equiv 0$ and explores strictly in order of accumulated cost $g[u]$) alongside A*, we verify that the heuristic, binary heap, and tie-breakers never alter optimal cost on the 8-neighbor graph.
- **Identical Effective Objective & Canonical Admissibility:** Both A* and `solveDijkstra` evaluate the **exact same effective policy weight vector** $(\alpha_p, \beta_p, \gamma_{\text{eff}, p})$ recorded in `effectiveWeights` (including $\gamma_{\text{eff}} = 0$ when $U_{\max} = U_{\min}$ across admissible cells) and call the single canonical `getCellExclusionReason` and `isEdgeAdmissible` functions.

### 1.2 The Five Automated Equivalence & Invariant Assertions
For every test fixture and every requested policy $p \in \{\text{'shortest'}, \text{'terrain'}, \text{'uncertainty'}\}$:
1. **Status Match:** `resultAStar.status === resultDijkstra.status` (`'success'` vs. `'no_path'` vs. `'invalid_input'`).
2. **Independent Path Admissibility Audit:** `verifyPathAdmissibility(bundle, path, profile, qualityMode)` walks every vertex $k_i$ and edge $(k_{i-1} \to k_i)$ in `resultAStar.path` (including 0-edge same-cell paths `[k_0]`) and confirms:
   - Start and end cells match the normalized request endpoints and pass the full 7-priority `getCellExclusionReason` check (including `INTERPOLATED_OR_UNRELIABLE`).
   - Consecutive cells are valid 8-neighbors ($|\Delta r| \le 1, |\Delta c| \le 1, (\Delta r, \Delta c) \neq (0,0)$).
   - Every cell passes all cell-level exclusions.
   - Every diagonal step has both orthogonal corner neighbors admissible.
   - Every edge satisfies $g_{\text{abs}}(k_{i-1}, k_i) \le \theta_{\text{maxGrade}}$.
3. **Optimal Cost Equality Under `effectiveWeights` (Allowing Valid Tie Geometries):**
   We recompute the exact sum of edge costs $C_{\text{eff}}(P) = \sum_{j=1}^m \text{cost}_{\text{eff}}(k_{j-1}, k_j)$ from scratch and assert:
   $$\big|C_{\text{eff}}(P_{\text{A*}}) - C_{\text{eff}}(P_{\text{Dijkstra}})\big| \le 10^{-7}$$
4. **Heuristic Efficiency Bound:**
   Whenever a path exists, A* expands no more nodes than Dijkstra:
   $$\text{exploredNodes}_{\text{A*}} \le \text{exploredNodes}_{\text{Dijkstra}}$$
5. **Strict Weak Ordering & Permutation-Invariant Heap Extraction:**
   Unit tests verify that `hasHigherPriority(u, v)` is irreflexive, asymmetric, and transitive on micro-spaced triples $A=(f=10, g=1)$, $B=(f=10 + 0.75\times 10^{-9}, g=2)$, $C=(f=10 + 1.50\times 10^{-9}, g=3)$ ($A \prec B \prec C$ and $A \prec C$, never cycling), and that pushing all 6 permutations of $\{A, B, C\}$ into `BinaryMinHeap` pops `[A, B, C]` in every case.

---

## 2. The 12 Canonical Hand-Computable Test Fixtures (`tests/fixtures/`)

All shared synthetic fixtures live in `tests/fixtures/` so every role and test suite references one canonical location.

### Fixture F01 — Flat Jezero Floor & Negative Elevations ($5 \times 5$, $\Delta x = 5\text{ m}, \Delta y = 5\text{ m}$)
- **Grid Setup:** $W=5, H=5$, uniform elevation $z \equiv -2540.0\text{ m}$ (testing negative Martian elevations), slope $s \equiv 0^\circ$, roughness $r \equiv 0$, quality $q \equiv \text{ACCEPTABLE}$.
- **Subtest A (Cardinal East):** $(r=2, c=0) \to (r=2, c=4) \implies D_{\text{horiz}} = 20.0\text{ m}$, $D_{\text{surface}} = 20.0\text{ m}$.
- **Subtest B (Pure Diagonal NE):** $(r=4, c=0) \to (r=0, c=4) \implies D_{\text{horiz}} = 20\sqrt{2} \approx \mathbf{28.284271\text{ m}}$.
- **Subtest C (Octile Mix):** $(r=4, c=0) \to (r=2, c=4)$ ($\Delta c = 4, \Delta r = 2$) $\implies D_{\text{horiz}} = 10\sqrt{2} + 10 \approx \mathbf{24.142136\text{ m}}$ (optimal on the 8-neighbor graph). All 3 policies merge into `['shortest', 'terrain', 'uncertainty']`.

---

### Fixture F02 — Wall Barrier with 1-Cell Gap & Corner-Cutting Enforcement ($5 \times 5$, $\Delta x = 10\text{ m}, \Delta y = 10\text{ m}$)
- **Grid Setup:** Column $c = 2$ is blocked (`NoData`) at rows $r \in \{1, 2, 3, 4\}$, leaving only the northern gap at $(r=0, c=2)$ open.
- **Request:** Start $(r=2, c=0) \to$ Goal $(r=2, c=4)$.
- **Hand Calculation:**
  - Because $(r=1, c=2)$ is blocked, diagonal steps $(1,1) \to (0,2)$ and $(0,2) \to (1,3)$ are forbidden by the no-corner-cutting rule.
  - The shortest valid path must step cardinally through $(0,1) \to (0,2) \to (0,3)$:
    $$(2,0) \xrightarrow{\text{NE } 10\sqrt{2}} (1,1) \xrightarrow{\text{N } 10} (0,1) \xrightarrow{\text{E } 10} (0,2) \xrightarrow{\text{E } 10} (0,3) \xrightarrow{\text{S } 10} (1,3) \xrightarrow{\text{SE } 10\sqrt{2}} (2,4)$$
  - **Exact Expected Length:** $4 \times 10 + 2 \times 10\sqrt{2} = 40 + 20\sqrt{2} \approx \mathbf{68.284271\text{ m}}$.

---

### Fixture F03 — The Diagonal Corner-Cutting Trap ($3 \times 3$, $\Delta x = 5\text{ m}, \Delta y = 5\text{ m}$)
- **Subtest A (Single Blocked Orthogonal Corner):**
  - Start $(r=1, c=1) \to$ Goal $(r=0, c=2)$. Cell $(r=0, c=1)$ is blocked (`NoData`), while $(r=1, c=2)$ is valid.
  - Diagonal step $(1,1) \to (0,2)$ is forbidden; optimal path goes $(1,1) \to (1,2) \to (0,2)$ with length $5 + 5 = \mathbf{10.0\text{ m}}$.
- **Subtest B (Double Checkerboard Pinch):**
  - Both $(r=0, c=1)$ and $(r=1, c=2)$ are blocked $\implies$ returns `status: 'no_path'`.

---

### Fixture F04 — Separated Multi-Cell Basin (`no_path` With Non-Zero Goal Degree, $7 \times 7$)
- **Grid Setup:** $7 \times 7$ grid ($\Delta x = 10\text{ m}, \Delta y = 10\text{ m}$).
  - Column $c = 3$ is an impassable ridge ($s = 26^\circ > 20^\circ$ for all $r \in \{0..6\}$) dividing the grid into a Western Basin ($c \in \{0,1,2\}$, flat $s = 0^\circ$) and an Eastern Basin ($c \in \{4,5,6\}$, flat $s = 0^\circ$).
  - Start is at $(r=3, c=1)$ in the Western Basin; Goal is at $(r=3, c=5)$ in the center of the $3 \times 3$ Eastern Basin.
- **Why This Fixture Matters:**
  - At the Goal $(r=3, c=5)$, **all 8 of its immediate neighbors are valid $0^\circ$ cells** (so a naive degree-$0$ isolated-cell check does not trigger!).
  - Lazy connected-component labeling (`componentId[start] !== componentId[goal]`) detects that the Western and Eastern basins are in different components and returns `status: 'no_path'` without flood-filling the Western Basin.

---

### Fixture F05 — Degenerate Same-Cell Request & Hard-Excluded Same-Cell Rejection ($5 \times 5$, $\Delta x = 5\text{ m}, \Delta y = 5\text{ m}$)
- **Subtest A (Admissible Same-Cell Request):**
  - `start = { eastM: 11.1, northM: 14.2 }`, `destination = { eastM: 13.9, northM: 10.4 }` (both inside admissible cell $(r=2, c=2) \implies \text{index} = 12$).
  - **Expected Metrics:** Path `[12]` (1 vertex, 0 edges), $D_{\text{horiz}} = 0$, $D_{\text{surface}} = 0$, $\Delta Z_{\text{up}} = 0$, $\Delta Z_{\text{down}} = 0$, $\theta_{\text{maxGrade}} = 0^\circ$, $\text{Pct}_{\text{low}} = 0$ (finite `0`, never `NaN`).
- **Subtest B (Same-Cell Request Inside a Finite-Elevation `INTERPOLATED` Cell):**
  - Cell $(r=2, c=2)$ has finite elevation $z[12] = -2540.0\text{ m}$ and finite slope $s[12] = 0.0^\circ$, but source FOM `INTERPOLATED` (`q[12] = INVALID`).
  - Even with `qualityMode: 'prefer'`, Stage 5 runs `getCellExclusionReason` **before** Stage 6's `k_start === k_dest` shortcut and rejects the request with `status: 'invalid_input'` and reason `'INTERPOLATED_OR_UNRELIABLE'`.

---

### Fixture F06 — Low-Quality Shortcut vs. Corner-Clear Detour ($3 \times 5$, $\Delta x = 10\text{ m}, \Delta y = 10\text{ m}$)
- **Grid Setup:** Flat grid ($s = 0^\circ, r = 0$). Start $(r=1, c=0) \to$ Goal $(r=1, c=4)$.
  - Center cell $(r=1, c=2)$ has `LOW` quality ($U = 1.0$). All other cells are `ACCEPTABLE` ($U = 0.0$).
- **Exact Analytical Cost Derivation (With Diagonal Corner-Quality Rule):**
  - **Direct Shortcut** `[(1,0), (1,1), (1,2), (1,3), (1,4)]`:
    - $4$ cardinal steps of $10\text{ m} \implies D_{\text{horiz}} = \mathbf{40.0\text{ m}}$, $D_{\text{low}} = \mathbf{20.0\text{ m}}$ ($50.0\%$).
    - Total cost as a function of $\gamma$: $C_{\text{direct}}(\gamma) = 40 + 20\gamma$.
  - **Why `[(1,0), (1,1), (0,2), (1,3), (1,4)]` Is Penalized:**
    - Stepping diagonally $(1,1) \to (0,2)$ has orthogonal corners $(0,1)$ and $(1,2)$. Because it clips the corner of the `LOW` cell $(1,2)$, our diagonal corner-quality rule charges $U_{\text{diag}} = 1.0$ on both diagonal steps!
  - **True Corner-Clear Detour** `[(1,0), (0,1), (0,2), (0,3), (1,4)]`:
    - Step 1: $(1,0) \to (0,1)$ (diagonal NE, $10\sqrt{2}\text{ m}$, corners $(0,0)$ and $(1,1)$ — both `ACCEPTABLE`, so $U = 0$).
    - Step 2: $(0,1) \to (0,2)$ (cardinal E, $10\text{ m}$, $U = 0$).
    - Step 3: $(0,2) \to (0,3)$ (cardinal E, $10\text{ m}$, $U = 0$).
    - Step 4: $(0,3) \to (1,4)$ (diagonal SE, $10\sqrt{2}\text{ m}$, corners $(0,4)$ and $(1,3)$ — both `ACCEPTABLE`, so $U = 0$).
    - Total length: $20 + 20\sqrt{2} \approx \mathbf{48.284271\text{ m}}$, with $D_{\text{low}} = \mathbf{0.0\text{ m}}$ ($0.0\%$) and zero corner clipping!
  - **Exact Crossover Threshold:** $\gamma^* = \sqrt{2} - 1 \approx \mathbf{0.414214}$.
  - `shortest` ($\gamma = 0$) and `terrain` ($\gamma = 0$) take the $40.0\text{ m}$ direct path; `uncertainty` ($\gamma = 2$) takes the $48.284271\text{ m}$ corner-clear detour `[(1,0), (0,1), (0,2), (0,3), (1,4)]`.

---

### Fixture F07 — Derived Inclined Plane & Closed-Form Halo Ridge (Using Real Horn Slope + Plane-Fit Roughness Code)
Instead of hand-typing inconsistent elevation and slope numbers on a 1-pixel spike (where Horn's operator assigns $0^\circ$ to the center spike), Fixture F07 runs the **exact $3 \times 3$ Horn slope and plane-fit roughness derivative functions** on an elevation surface with a 1-cell halo:
- **Subtest A (Inclined Plane of Known $12^\circ$ Grade — `Float64` Analytical vs. Serialized `Float32Array` Contract):**
  - Analytical plane equation: $z(r, c) = -2540.0 + c \cdot \Delta x \cdot \tan(12^\circ)$ with $\Delta x = \Delta y = 10\text{ m}$.
  - **Unquantized `Float64Array` Derivative Check:** Asserts $|s - 12.0^\circ| \le 10^{-12}\text{ deg}$ and plane-fit RMS roughness $\sigma_{\text{res}} \le 10^{-12}\text{ m}$ at every interior cell.
  - **Serialized `Float32Array` Bundle Check:** Because `RegionRoutingBundle` stores `elevationM` as `Float32Array` (where 1 ULP near $-2540\text{ m}$ is $2^{-12} \approx 2.44 \times 10^{-4}\text{ m}$), machine-verified `Float32` Horn slopes across interior cells are $11.999576^\circ\text{–}12.000245^\circ$ and RMS roughness residuals are $\le 5.75 \times 10^{-5}\text{ m}$. The `Float32Array` bundle test asserts $|s - 12.0^\circ| \le 10^{-3}\text{ deg}$ and $\sigma_{\text{res}} \le 10^{-4}\text{ m}$.
- **Subtest B (Closed-Form $7 \times 9$ Halo Ridge Generator Cropped to $5 \times 7$ Interior):**
  - **Exact `Float32Array` Halo Elevation Formula ($H_{\text{halo}}=7, W_{\text{halo}}=9$, $\Delta x = \Delta y = 10\text{ m}$, $R_{\text{scale}} = 0.5\text{ m}$):**
    $$z_{\text{halo}}(r_h, c_h) = \begin{cases} -2540.0 & \text{if } r_h \in \{0, 1, 2\} \\ -2535.0 & \text{if } r_h \in \{3, 4, 5, 6\} \text{ and } c_h = 4 \\ -2537.5 & \text{if } r_h \in \{3, 4, 5, 6\} \text{ and } c_h \in \{3, 5\} \\ -2540.0 & \text{otherwise} \end{cases}$$
  - **Cropped $5 \times 7$ Interior Properties ($r_{\text{int}} = r_h - 1 \in \{0..4\}$, $c_{\text{int}} = c_h - 1 \in \{0..6\}$):**
    - Interior Row $0$ ($r_{\text{int}} = 0$, $r_h = 1$) has its entire $3 \times 3$ window inside $r_h \in \{0, 1, 2\}$, so its `Float32` Horn slope is identically $\mathbf{0.000000^\circ}$ and its plane-fit RMS roughness is identically $\mathbf{0.000000\text{ m}}$ across all 7 columns ($S = 0, R = 0$).
    - Interior Row $3$ ($r_{\text{int}} = 3$, $r_h = 4$) has machine-verified `Float32` Horn slopes `[0.0000°, 7.1250°, 14.0362°, 0.0000°, 14.0362°, 7.1250°, 0.0000°]` and RMS roughness `[0.0000, 0.5893, 0.0000, 1.1785, 0.0000, 0.5893, 0.0000] m`.
    - Maximum along-edge grade over the ridge is $\arctan(2.5 / 10) \approx 14.0362^\circ \le 20^\circ$, so the ridge is admissible.
  - **Request & Exact Expected Routes (Start $(r=2, c=0) \to$ Goal $(r=2, c=6)$):**
    - `shortest` ($\alpha=0, \beta=0, \gamma=0$) climbs straight across row $2$: `[(2,0), (2,1), (2,2), (2,3), (2,4), (2,5), (2,6)]`, with $D_{\text{horiz}} = \mathbf{60.000000\text{ m}}$ and `shortest` cost $\mathbf{60.000000}$ (its `terrain` cost is $\mathbf{121.028990}$).
    - `terrain` ($\alpha=2, \beta=1, \gamma=0$) and `uncertainty` detour along the flat northern valley floor: `[(2,0), (1,0), (0,1), (0,2), (0,3), (0,4), (0,5), (1,6), (2,6)]`, where every traversed cell has $s = 0^\circ$ and $\sigma_{\text{res}} = 0\text{ m}$, achieving exact horizontal distance and `terrain` cost $60 + 20\sqrt{2} \approx \mathbf{88.28427125}$ (matching Dijkstra to $< 10^{-7}$).

---

### Fixture F08 — Corner-Legal Three-Way Policy Split & Equal-Length Signed Explanation (`shortest` $\neq$ `terrain` $\neq$ `uncertainty`, $5 \times 5$, $\Delta x = 10\text{ m}, \Delta y = 10\text{ m}$)
- **Grid Setup:** Start $(r=2, c=0) \to$ Goal $(r=2, c=4)$. **Zero cells are blocked** (no corner-cutting traps), and the three horizontal corridors have wide, unambiguous cost margins:
  1. **Middle Corridor ($r=2$): `[(2,0), (2,1), (2,2), (2,3), (2,4)]`** ($4$ cardinal steps, length $= \mathbf{40.0\text{ m}}$).
     - Cells $(2,1), (2,2), (2,3)$ have terrain slope $s = 15^\circ$ ($S = 0.75$), roughness $R = 0.5$, and `ACCEPTABLE` quality ($U = 0$).
     - All $4$ edges along row $2$ have $S(u,v) = 0.75, R(u,v) = 0.5, U(u,v) = 0$:
       - Cost under `shortest`: $\mathbf{40.0}$
       - Cost under `terrain`: $40 \times (1 + 2(0.75) + 1(0.5)) = \mathbf{120.0}$
       - Cost under `uncertainty`: $\mathbf{120.0}$
  2. **North Corridor ($r=1$): `[(2,0), (1,1), (1,2), (1,3), (2,4)]`** ($2$ diagonal + $2$ cardinal steps, length $= 20 + 20\sqrt{2} \approx \mathbf{48.284271\text{ m}}$).
     - Rows $0$ and $1$ are completely flat and smooth ($S = 0, R = 0$), **but** column $c=2$ in the northern half — both $(0,2)$ and $(1,2)$ — has `LOW` observation quality ($U = 1.0$).
       - Cost under `shortest`: $48.284271$ (loses to Middle $40.0$ by $8.28$).
       - Cost under `terrain` ($\gamma = 0$): $\mathbf{48.284271}$ (beats South $58.284$ by **$10.00$ units** and Middle $120.0$ by **$71.72$ units**).
       - Cost under `uncertainty` ($\gamma = 2$): the two $10\text{ m}$ edges touching $(1,2)$ pay $U = 1.0$, so $C_{\text{north}} = 48.284271 + 2 \times 10 \times 2 = \mathbf{88.284271}$.
  3. **South Corridor ($r=3$): `[(2,0), (3,1), (3,2), (3,3), (2,4)]`** ($2$ diagonal + $2$ cardinal steps, length $= 20 + 20\sqrt{2} \approx \mathbf{48.284271\text{ m}}$).
     - Rows $3$ and $4$ have `ACCEPTABLE` quality ($U = 0$) and $R = 0$, and column $c=2$ in the southern half — $(3,2)$ and $(4,2)$ — has a gentle slope $s = 5^\circ$ ($S = 5/20 = 0.25$).
       - Cost under `shortest`: $48.284271$.
       - Cost under `terrain`: the two $10\text{ m}$ steps touching $(3,2)$ pay $10 \times (1 + 2 \times 0.25) = 15$ each, so $C_{\text{south}} = 20\sqrt{2} + 30 \approx \mathbf{58.284271}$.
       - Cost under `uncertainty`: since $U = 0$ everywhere on South, $C_{\text{south}} = \mathbf{58.284271}$ (beats North $88.284$ by **$30.00$ units** and Middle $120.0$ by **$61.72$ units**!).
- **Expected Outcome & Signed-Delta Explanation Verification:**
  - Returns **3 distinct, corner-legal candidates**:
    - `shortest` $\to$ Middle Row ($40.0\text{ m}$, max slope $15^\circ$, $0\text{ m}$ low quality)
    - `terrain` $\to$ North Corridor ($48.284271\text{ m}$, max slope $0^\circ$, $20.0\text{ m}$ low quality)
    - `uncertainty` $\to$ South Corridor ($48.284271\text{ m}$, max slope $5^\circ$, $0\text{ m}$ low quality)
  - Because $D_{\text{horiz}}(\text{South}) - D_{\text{horiz}}(\text{North}) = 0.0\text{ m}$, the `uncertainty` vs. `terrain` explanation selects the **equal-length clause** (`"follows an equal-length 48.3 m alternative corridor"`), never emitting `"adds 0.0 m (+0.0%)"`.

---

### Fixture F09 — Uniform-Quality Effective Policy Rule ($\gamma_{\text{eff}} = 0$), Standalone `['uncertainty']` & `LOW`-for-`UNKNOWN` Trade-Off
- **Subtest A ($3 \times 5$ Slope-vs-Distance Counterexample Under Uniform `UNKNOWN` $U \equiv 0.75$):**
  - $3 \times 5$ grid ($\Delta x = \Delta y = 10\text{ m}$), uniform $U \equiv 0.75$ across all cells, center cell $(1,2)$ has $s = 10^\circ$ ($S = 0.5, R = 0$), all other cells $s = 0^\circ$. Start $(1,0) \to$ Goal $(1,4)$.
  - Under the raw unshifted $\gamma = 2$ objective, the direct path would cost $60 + 1.5(40) = 120.0$ while the flat detour would cost $(20+20\sqrt{2})(2.5) \approx 120.710678$.
  - Verifies that because quality is strictly uniform ($U_{\max} = U_{\min} = 0.75$), our **Explicit Effective-Policy Model Rule** sets $\gamma_{\text{eff}} = 0$ (`uniformQualityOverride: true` in `effectiveWeights`), so both `terrain` and `uncertainty` (and reference Dijkstra under $\gamma_{\text{eff}} = 0$) select the gentler detour `[(1,0), (0,1), (0,2), (0,3), (1,4)]` at cost $\mathbf{48.284271}$, merge into `['terrain', 'uncertainty']`, and emit `UNIFORM_QUALITY_NO_DIFFERENTIATION`.
- **Subtest B (Standalone `policies: ['uncertainty']` Request Without `'terrain'`):**
  - Calls `planRoutes` with `policies: ['uncertainty']` (omitting `'terrain'` and `'shortest'`) on both the uniform-`UNKNOWN` bundle ($U \equiv 0.75$) and the `F06` bundle.
  - Verifies that `uncertainty` resolves directly via $\gamma_{\text{eff}}$, returns `status: 'success'` with a single candidate `matchedPolicies: ['uncertainty']`, and never fails on a missing `terrain` result or injects an unrequested `'terrain'` entry.
- **Subtest C (Mixed `UNKNOWN` $0.75$ and `LOW` $1.0$ With Zero `ACCEPTABLE` Cells + `LOW`-for-`UNKNOWN` Explanation):**
  - Replaces `ACCEPTABLE` ($U=0$) in `F06` with `UNKNOWN` ($U=0.75$), leaving cell $(1,2)$ as `LOW` ($U=1.0$).
  - Verifies that because $U_{\max} = 1.0 > U_{\min} = 0.75$, $\gamma_{\text{eff}} = 2.0$ (`uniformQualityOverride: false`), `UNKNOWN` edges pay $U = 0.75$ ($2.5 d_j$) and `LOW` edges pay $U = 1.0$ ($3.0 d_j$).
  - Adding a single `ACCEPTABLE` cell at a distant corner $(0,4)$ does **not** alter the costs along the corridor.
  - Also verifies that the explanation engine activates **Branch Q2 (`LOW`-for-`UNKNOWN` Trade-Off)** because `uncertainty` reduces `LOW` exposure from $20.0\text{ m}$ to $0.0\text{ m}$ by routing through $48.28\text{ m}$ of `UNKNOWN` terrain (lowering weighted uncertainty $W_U$ from $20.0 + 0.75(20.0) = 35.0\text{ m-eq}$ to $0.75(48.284271) \approx 36.213\text{ m-eq}$ when $\gamma$ exceeds the crossover threshold).

---

### Fixture F10 — `strict` vs. `prefer` Quality Mode, Source FOM Exclusion Split & Elevation-Support Mask
- **Subtest A (`prefer` vs. `strict`):** Column $c = 2$ has `LOW` correlation quality ($U = 1.0$). Succeeds in `prefer` mode; returns `no_path` in `strict` mode.
- **Subtest B (Interpolated vs. Manually Edited FOM Codes):** Verifies that a cell with FOM code `INTERPOLATED` is hard-excluded even in `prefer` mode (`INTERPOLATED_OR_UNRELIABLE`), whereas a `MANUALLY_EDITED` cell remains admissible.
- **Subtest C (Elevation-Support Mask Prevents Finite Hard-Excluded Spike From Corrupting Neighbors):**
  - On a $5 \times 5$ grid ($z = -2540.0\text{ m}$), center cell $(2,2)$ is marked `INTERPOLATED` (`q[12] = INVALID`) and given a synthetic finite height spike $z[(2,2)] = +1000.0\text{ m}$.
  - Verifies that applying the elevation-support mask ($\text{supported}[p] \iff \text{validElevation}[p] \land q[p] \neq \text{INVALID}$) **before** resampling and $3 \times 3$ derivative computation marks the 8 neighbors touching $(2,2)$ as `UNSUPPORTED_DERIVATIVE` and leaves all non-adjacent cells at $s = 0.0^\circ, \sigma_{\text{res}} = 0.0\text{ m}$, completely immune to the $+1000\text{ m}$ spike.

---

### Fixture F11 — Rectangular Non-Square Cells & Digitization Stretch ($5 \times 5$, $\Delta x = 20\text{ m}, \Delta y = 5\text{ m}$)
- **Subtest A (Single Diagonal Step):** Start $(r=3, c=0) \to$ Goal $(r=2, c=1)$ $\implies$ single diagonal step length $\sqrt{20^2 + 5^2} = \sqrt{425} \approx \mathbf{20.615528\text{ m}}$.
- **Subtest B (Rectangular 8-Neighbor Digitization Excess $> 8.24\%$):**
  - Start $(r=3, c=0) \to$ Goal $(r=0, c=1)$ ($\Delta c = 1, \Delta r = 3$ on flat terrain).
  - Euclidean distance is $\sqrt{20^2 + 15^2} = \mathbf{25.000000\text{ m}}$, whereas the optimal 8-neighbor path takes $1$ diagonal + $2$ vertical steps of length $\sqrt{425} + 10 \approx \mathbf{30.615528\text{ m}}$ ($+22.46\%$ over Euclidean), verifying why the $\approx 8.24\%$ bound applies only to square cells ($\Delta x = \Delta y$).

---

### Fixture F12 — Boundary Clicks, Sensitivity Profiles, Mid-Search Yield Isolation & 3D Saddle-Quad Draping
- **Subtest A (Borders, Version Mismatch & Sensitivity):** Tests exact Southwest $(0,0)$ and Northeast $(L_E, L_N)$ border clamping, out-of-bounds rejection, `datasetVersion` mismatch rejection (`data_error`), and sensitivity switching across `15°`, `20°`, and `25°` profiles.
- **Subtest B (Single-Owner Workspace Mutex Under Mid-Search `MessageChannel` Yield):**
  - Configures the worker to yield via `MessageChannel` every $8$ heap pops during an active search, then dispatches a superseding `PLAN_ROUTE` request and a `LOAD_BUNDLE` message while the first search is suspended at `await yieldToEventLoop()`.
  - Asserts that `activeTaskEpoch++` cancels the first search on wakeup and that `pendingNextTask` serializes execution so the second search never mutates `SolverWorkspace` concurrently—producing bitwise-identical routes and metrics to an unyielded synchronous solve.
- **Subtest C (3D Saddle-Quad Diagonal Midpoint Draping):**
  - On a $2 \times 2$ quad with $z_{00} = 0\text{ m}, z_{11} = 0\text{ m}, z_{10} = 10\text{ m}, z_{01} = 10\text{ m}$ where the 3D terrain mesh splits along $(0,1)\text{–}(1,0)$ at midpoint height $10\text{ m}$, verifies that a diagonal route step $(0,0) \to (1,1)$ inserts a quad-center display vertex draped to $\max(0, 10) = \mathbf{10.0\text{ m}}$ (before vertical exaggeration $E_z$ and hover offset $\delta_{\text{lift}}$) so the 3D route polyline never tunnels underground at $1\times$ or $3\times$ vertical scale, while `RouteMetrics` continues to evaluate authoritative cell-center elevations.

---

## 3. Performance Benchmarking Protocol ([team-tasks.md](team-tasks.md#L131))

No speed numbers are claimed prior to measurement. Once all 12 correctness fixtures pass, `tests/benchmark.test.ts` measures actual solve times on the machine and records:
1. Grid size ($W \times H$), valid-cell fraction, and hardware/runtime environment.
2. Component-labeling initialization time (ms) vs. per-request solve time (ms).
3. Median, 95th percentile, and worst-case solve times across representative requests (short, diagonal, 3-way split, and unreachable basin).

---

## 4. Canonical File Locations (Zero Self-Conflict at Gate G0)

To avoid conflicting directory layouts across documents, all files follow the single layout from [project-plan.md](project-plan.md#L179-L195):
- `src/contracts/` — Shared TypeScript schemas (`RouteRequest`, `RouteResponse`, `RegionBundle`). If Open Role C has not yet initialized `src/contracts/` at Gate G0, Ayush lands the initial routing contract there directly.
- `src/coordinates/` — Shared local meter $\leftrightarrow$ grid index conversion helpers.
- `src/routing/` — Ayush's solver, binary heap, admissibility/cost model, metrics, explanations, and Web Worker.
- `tests/fixtures/` — The 12 shared synthetic fixtures (`F01`–`F12`) and fixture builder utilities.
