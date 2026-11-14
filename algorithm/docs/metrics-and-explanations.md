# MARS PATHFINDER — Route Metrics, Deduplication, Return Legs & Explainable Output

This document is the engineering and scientific reference for **Point 5 of Ayush's assignment**: how an authoritative cell path $P = (k_0, k_1, \dots, k_m)$ is transformed into physical metrics, elevation profiles, run-length encoded (RLE) quality intervals, deduplicated policy groups, return legs, and deterministic, LLM-free explanations.

---

## 1. Scientific & GIS Grounding for Route Metrics

### 1.1 Travel Time: The $0.50\text{ m/s}$ Simulator Constant & Grade-Adjusted Briefing Time
In [project-plan.md](project-plan.md#L309), travel time is supporting context derived from a user-visible assumed speed (default $0.50\text{ m/s}$) plus planned science-stop duration:
- **Why $0.50\text{ m/s}$ Is a Labeled Simulator Constant (Not Apollo Telemetry):**
  Lunar gravity ($\approx 0.16g$) differs substantially from Martian gravity ($\approx 0.38g$), and spacesuit mass/mobility architectures differ between Apollo and future Mars EVA concepts. Therefore, $0.50\text{ m/s}$ must be presented strictly as a **labeled simulator assumption**, never as an empirically validated Martian walking speed.
- **Constant-Speed Time vs. Optional Grade-Adjusted Briefing Time:**
  1. **Nominal Constant-Speed Time (`estimatedTimeS`):**
     $$T_{\text{nominal}} = \frac{D_{\text{surface}}}{v_{\text{sim}}} + T_{\text{stop}}$$
     Because $v_{\text{sim}}$ is constant, a longer detour always has a larger $T_{\text{nominal}}$.
  2. **Grade-Adjusted Display Time (`gradeAdjustedTimeS` — Briefing Display Only, Outside A*):**
     To illustrate why astronauts often walk around steep ridges rather than straight over them, the briefing can also display a grade-penalized walking time over each edge $j$:
     $$v_{\text{eff}}(g_j, s_j) = \frac{v_{\text{sim}}}{1 + \kappa_{\text{grade}}\left(\frac{\max(|g_j|, s_j)}{\theta_{\text{maxSlope}}}\right)^2}, \qquad T_{\text{gradeAdjusted}} = \sum_{j=1}^{m} \frac{d_{3\text{D}, j}}{v_{\text{eff}}(g_j, s_j)} + T_{\text{stop}}$$
     *(with $\kappa_{\text{grade}} = 1.5$ as a documented simulator display parameter).*
     **Crucial Rule:** This grade-adjusted speed is computed **only as a post-solve display metric** on completed routes. It is never placed inside the A* edge cost, which preserves the "cost $\ge$ horizontal length" admissibility proof.

### 1.2 The GIS "Vertical Coastline Paradox" (Why Ascent/Descent Depend on Grid Resolution)
Cumulative ascent ($\Delta Z_{\text{ascent}}$) and descent ($\Delta Z_{\text{descent}}$) depend on **grid spacing ($\Delta x, \Delta y$)** and **photogrammetric DEM noise**:
- A fine $1\text{ m}$ DEM accumulates small pixel-to-pixel stereo ripples on every step, while a $20\text{ m}$ CTX DEM averages over narrow gullies or benches.
- **Mandatory Rule ([team-tasks.md](team-tasks.md#L89)):** Compute ascent and descent directly from the authoritative cell elevations without sub-cell interpolation, and **always include `gridSpacingM: { dx, dy }` and `slopeBaselineM: { eastM: 2*dx, northM: 2*dy }`** in `RouteMetrics` so the UI states the sampling scale next to the numbers.

---

## 2. Exact Mathematical Definitions & Invariants of Route Metrics

Let $P = (k_0, k_1, \dots, k_m)$ be the authoritative sequence of $m + 1$ cell indices ($m \ge 0$ edges) from Start $k_0$ to Destination $k_m$.

### 2.1 Horizontal vs. 3D Sampled Surface Distance
For each edge $j \in \{1, \dots, m\}$ connecting $u = k_{j-1}$ to $v = k_j$:
- **Planar Horizontal Edge Length:**
  $$d_j = \sqrt{\big(E_c(v) - E_c(u)\big)^2 + \big(N_c(v) - N_c(u)\big)^2} \in \left\{\Delta x, \; \Delta y, \; \sqrt{\Delta x^2 + \Delta y^2}\right\}$$
- **Vertical Elevation Change:** $\Delta z_j = z[v] - z[u]$
- **3D Sampled Surface Edge Length:** $d_{3\text{D}, j} = \sqrt{d_j^2 + (\Delta z_j)^2} = d_j \sec(g_j)$

Summing over all $m$ edges gives:
$$D_{\text{horiz}} = \sum_{j=1}^{m} d_j, \qquad D_{\text{surface}} = \sum_{j=1}^{m} d_{3\text{D}, j}$$

> **Mathematical Bound Invariant:**
> Because every admissible edge satisfies $|g_j| \le \theta_{\text{maxGrade}}$, $D_{\text{surface}}$ satisfies:
> $$D_{\text{horiz}} \le D_{\text{surface}} \le D_{\text{horiz}} \cdot \sec(\theta_{\text{maxGrade}})$$
> For `educational-eva-v1` ($\theta_{\text{maxGrade}} = 20^\circ$), $\sec(20^\circ) \approx \mathbf{1.064178}$ (at most $6.42\%$ longer than horizontal distance).

---

### 2.2 Cumulative Ascent, Descent & The Telescoping Net-Elevation Invariant
$$\Delta Z_{\text{ascent}} = \sum_{j=1}^{m} \max(0, \; \Delta z_j), \qquad \Delta Z_{\text{descent}} = \sum_{j=1}^{m} \max(0, \; -\Delta z_j)$$
$$\Delta Z_{\text{ascent}} - \Delta Z_{\text{descent}} \equiv z[k_m] - z[k_0] = \Delta Z_{\text{net}}$$

---

### 2.3 Maximum Terrain Slope vs. Maximum Route Grade (with Pinpoint Locations)
1. **Maximum Neighborhood Terrain Slope (`maxTerrainSlopeDeg`):**
   $$\theta_{\text{maxSlope}} = \max_{0 \le i \le m} s[k_i]$$
   Reported along with `maxTerrainSlopeAtDistanceM` ($D_i$), `maxTerrainSlopeCellIndex` ($k_i$), and the Horn window baseline $2\Delta x$.
2. **Maximum Absolute Along-Route Grade (`maxRouteGradeDeg`):**
   $$\theta_{\text{maxGrade}} = \begin{cases} \max_{1 \le j \le m} \arctan\!\left(\dfrac{|\Delta z_j|}{d_j}\right)\frac{180}{\pi} & \text{if } m \ge 1 \\ 0^\circ & \text{if } m = 0 \end{cases}$$
   Reported along with `maxUphillGradeDeg`, `maxDownhillGradeDeg`, and `maxRouteGradeAtDistanceM`.

---

### 2.4 Cumulative-Distance Elevation Profile & 2D/3D Cursor Sync
Every vertex $i \in \{0, \dots, m\}$ produces a profile sample keyed by cumulative horizontal distance $D_i$:
$$D_0 = 0, \qquad D_i = D_{i-1} + d_i \quad (i = 1, \dots, m)$$

```ts
export type ElevationProfilePoint = {
  sampleIndex: number;           // Vertex index i in 0..m
  cellIndex: number;             // Grid cell index k_i = row * width + col
  eastM: number;                 // Cell-center Easting E_c(k_i)
  northM: number;                // Cell-center Northing N_c(k_i)
  distanceM: number;             // Cumulative horizontal distance D_i (X-axis of chart)
  surfaceDistanceM: number;      // Cumulative 3D surface distance
  elevationM: number;            // Sampled elevation z[k_i] (Y-axis of chart)
  terrainSlopeDeg: number;       // Neighborhood slope s[k_i]
  incomingGradeDeg: number;      // Signed along-edge grade of step i (0 at i=0)
  qualityClass: QualityClass;    // Observation quality at cell k_i
};
```

---

### 2.5 Length-Weighted Quality Exposure & Run-Length Encoded (RLE) Intervals
Exposure is length-weighted over edges, using the exact same corner-aware rule as the cost model so a diagonal step cannot clip the corner of a low-confidence cell and report $0\text{ m}$ of exposure:

1. **Conservative Edge Classification (Including Diagonal Corner Cells):**
   For edge $e_j = (u \to v)$ of length $d_j$:
   - Let $Q(e_j) = \{q[u], q[v]\}$ if $e_j$ is cardinal, and $Q(e_j) = \{q[u], q[v], q[w_1], q[w_2]\}$ if $e_j$ is diagonal (where $w_1, w_2$ are the shared orthogonal corner cells).
   - Then:
     $$\text{edgeClass}(e_j) = \begin{cases} \text{'low'} & \text{if } \text{LOW} \in Q(e_j) \\ \text{'unknown'} & \text{else if } \text{UNKNOWN} \in Q(e_j) \\ \text{'acceptable'} & \text{otherwise} \end{cases}$$

2. **Length & Percentage Totals (with $D_{\text{horiz}} = 0$ Guard):**
   $$D_{\text{low}} = \sum_{\text{edgeClass}(e_j)=\text{'low'}} d_j, \qquad D_{\text{unknown}} = \sum_{\text{edgeClass}(e_j)=\text{'unknown'}} d_j, \qquad D_{\text{acceptable}} = \sum_{\text{edgeClass}(e_j)=\text{'acceptable'}} d_j$$
   $$\text{Pct}_c = \begin{cases} 100 \cdot \dfrac{D_c}{D_{\text{horiz}}} & \text{if } D_{\text{horiz}} > 0 \\ 0 & \text{if } D_{\text{horiz}} = 0 \end{cases}$$

3. **Run-Length Encoded (RLE) Quality Intervals:**
   Consecutive edges sharing the same `edgeClass` are merged into contiguous `{ qualityClass, startDistanceM, endDistanceM, lengthM, startSampleIndex, endSampleIndex }` intervals.

---

## 3. Policy Deduplication & Equivalence Topologies (Full & Subset Policy Requests)

Two requested policies $p_1, p_2$ merge into one `RouteCandidate` iff their cell index sequences are identical ($m = n$ and $\forall i, \; a_i = b_i$).
- **Standalone / Subset Policy Rule:** If the caller requests only a subset of policies (for example, `policies: ['uncertainty']`), deduplication and explanation generation operate strictly over the requested set without requiring `'terrain'` or `'shortest'` to be present and without injecting unrequested policies into `matchedPolicies`. When all three policies are requested, the 5 equivalence topologies are:

| Outcome | Candidate Groups Returned | Physical / Data Cause | Required Explanation Behavior |
| :--- | :--- | :--- | :--- |
| **Case 1 (All 3 Merge)** | `1` candidate: `['shortest', 'terrain', 'uncertainty']` | Either (1a) direct corridor is already flat, smooth, and well-observed, OR (1b) hard exclusions leave only a single narrow corridor | Distinguish open gentle terrain (Template 1a) from a constrained corridor or elevated-slope single route (Template 1b) |
| **Case 2 (Terrain + Uncertainty Merge)** | `2` candidates: `['shortest']` and `['terrain', 'uncertainty']` | Either (2a) the gentler terrain route is already in `ACCEPTABLE` quality ($U(e)=0$), OR (2b) quality is uniform across admissible cells ($U_{\max} = U_{\min}$, $\gamma_{\text{eff}} = 0$) | If uniform quality, explicitly disclose that observation quality does not vary across admissible cells (`uniformQualityOverride: true`, Template 4) |
| **Case 3 (Shortest + Terrain Merge)** | `2` candidates: `['shortest', 'terrain']` and `['uncertainty']` | Direct path is flat and smooth ($S \approx 0, R \approx 0$), but crosses a `LOW`/`UNKNOWN` quality patch that `uncertainty` detours around | Report the signed distance delta ($\Delta D_{\text{horiz}} \gtreqless 0$) and separate `LOW` vs. `UNKNOWN` exposure deltas (Template 3a) |
| **Case 4 (Shortest + Uncertainty Merge)** | `2` candidates: `['shortest', 'uncertainty']` and `['terrain']` | The gentler `terrain` detour enters a `LOW`/`UNKNOWN` quality zone whose $\gamma U$ penalty outweighs the terrain savings | Explain why `uncertainty` remains on the better-observed path while `terrain` detours for lower terrain cost (Template 3b) |
| **Case 5 (All 3 Distinct)** | `3` candidates: `['shortest']`, `['terrain']`, `['uncertainty']` | Direct path is steep; flatter detour crosses low-confidence data; third corridor balances or avoids both (note: North and South detours may have equal length, as in `F08`!) | Compare `terrain` vs. `shortest` and `uncertainty` vs. `terrain` using signed deltas (Templates 2 + 3a) |

---

## 4. Round-Trip Return Journeys (`returnToStart: true`)

- **Why Reversal Is Canonical Under Symmetric Costs:**
  While edge costs in `educational-eva-v1` are symmetric ($\text{cost}(u,v) = \text{cost}(v,u)$), tie-breaking rules (such as larger-$g$ preference) are directional—meaning an independent search from Destination to Start could pick a different equal-cost tie polyline. Therefore, for symmetric profiles, we construct the return leg by **reversing the authoritative outbound cell sequence** $P_{\text{ret}} = (k_m, k_{m-1}, \dots, k_0)$ and computing its directional return metrics:
  - Ascent and descent swap: $\Delta Z_{\text{ascent, return}} = \Delta Z_{\text{descent, outbound}}$ and $\Delta Z_{\text{descent, return}} = \Delta Z_{\text{ascent, outbound}}$.
  - Signed edge grades negate and profile distances run from $0$ (at the destination) to $D_{\text{horiz}}$ (back at the outpost).
- **When Can a Return Leg Differ or Fail?**
  Only if an asymmetric directional profile is configured (e.g., where maximum downhill grade is stricter than maximum uphill grade). Under symmetric `educational-eva-v1`, an admissible outbound route always has an admissible reversed return route.

---

## 5. Deterministic Signed-Delta Explanation Engine (No Hardcoded Sign Assumptions)

Explanations are built deterministically from computed metrics without an LLM. Because a comparative route $B$ vs. a reference route $A$ does **not** always increase horizontal length, reduce combined `LOW + UNKNOWN` meters, or reduce single-cell peak slope, all comparative explanations are assembled from **three signed-delta clause builders**:

### 5.1 Clause Builder 1 — Signed Horizontal Distance Comparison (`formatDistanceDelta(distB, distA)`)
Let $\Delta D = D_{\text{horiz}}(B) - D_{\text{horiz}}(A)$ and tolerance $\epsilon_D = 10^{-4}\text{ m}$:
- **Longer ($\Delta D > \epsilon_D$):** `"adds {deltaDistM} m (+{deltaDistPct}%)"`
- **Shorter ($\Delta D < -\epsilon_D$):** `"takes a {absDeltaDistM} m (-{absDeltaDistPct}%) shorter corridor"` *(occurs when `terrain` took a long detour through `LOW`/`UNKNOWN` terrain and `uncertainty` returns to a shorter, better-observed route)*
- **Equal Horizontal Length ($|\Delta D| \le \epsilon_D$):** `"follows an equal-length {distBM} m alternative corridor"` *(occurs in Fixture `F08`, where both the North `terrain` corridor and South `uncertainty` corridor have exact horizontal length $20 + 20\sqrt{2} \approx 48.284271\text{ m}$!)*

### 5.2 Clause Builder 2 — Signed Terrain Comparison (`formatTerrainDelta(metricsB, metricsA)`)
Let $\Delta \theta_{\text{maxSlope}} = \theta_{\text{maxSlope}}(B) - \theta_{\text{maxSlope}}(A)$, integrated slope-roughness penalty $C_{SR}(P) = \sum_{j=1}^m d_j (\alpha S(e_j) + \beta R(e_j))$, and roughness penalty $C_R(P) = \sum_{j=1}^m d_j R(e_j)$:
- **Branch T1 — Peak Terrain Slope Strictly Reduced ($\Delta \theta_{\text{maxSlope}} < -10^{-4}$):**
  `"to reduce maximum modeled terrain slope from {slopeADeg}° to {slopeBDeg}°"` *(appending `"and cumulative roughness exposure from {roughA} to {roughB} cost-m"` when $C_R(B) < C_R(A) - 10^{-4}$).*
- **Branch T2 — Equal Peak Slope ($|\Delta \theta_{\text{maxSlope}}| \le 10^{-4}$) With Lower Integrated Slope/Roughness Exposure ($C_{SR}(B) < C_{SR}(A) - 10^{-4}$):**
  `"to reduce cumulative slope and roughness exposure from {srPenaltyA} to {srPenaltyB} cost-m (at {slopeBDeg}° max slope)"`.
- **Branch T3 — Higher Peak Slope ($\Delta \theta_{\text{maxSlope}} > 10^{-4}$) Accepted for Lower Integrated Terrain Exposure ($C_{SR}(B) < C_{SR}(A) - 10^{-4}$):**
  `"accepting a higher single-cell peak slope ({slopeADeg}° → {slopeBDeg}°) to reduce cumulative weighted slope/roughness exposure from {srPenaltyA} to {srPenaltyB} cost-m"`.

### 5.3 Clause Builder 3 — Separate `LOW` ($U=1.0$) vs. `UNKNOWN` ($U=0.75$) Quality Comparison (`formatQualityDelta(metricsB, metricsA)`)
Let $\Delta D_{\text{low}} = D_{\text{low}}(B) - D_{\text{low}}(A)$, $\Delta D_{\text{unknown}} = D_{\text{unknown}}(B) - D_{\text{unknown}}(A)$, and weighted uncertainty exposure $W_U(P) = 1.0 \cdot D_{\text{low}}(P) + 0.75 \cdot D_{\text{unknown}}(P)$ (so $\gamma \cdot W_U(P)$ is the exact quality cost contribution):
- **Branch Q1 — Non-Increasing in Both Classes With Strict Reduction in `LOW` and/or `UNKNOWN` ($\Delta D_{\text{low}} \le 10^{-4}$, $\Delta D_{\text{unknown}} \le 10^{-4}$, $\Delta W_U < -10^{-4}$):**
  Report each class that changed separately:
  - If only `LOW` decreased: `"to reduce low-confidence quality exposure from {lowAM} m ({lowAPct}%) to {lowBM} m ({lowBPct}%)"`
  - If only `UNKNOWN` decreased: `"to reduce unknown-quality exposure from {unkAM} m ({unkAPct}%) to {unkBM} m ({unkBPct}%)"`
  - If both decreased: `"to reduce low-confidence exposure from {lowAM} m to {lowBM} m and unknown-quality exposure from {unkAM} m to {unkBM} m"`
- **Branch Q2 — `LOW`-for-`UNKNOWN` Trade-Off ($\Delta D_{\text{low}} < -10^{-4}$ and $\Delta D_{\text{unknown}} > 10^{-4}$ With Lower Weighted Uncertainty $\Delta W_U < -10^{-4}$):**
  `"to reduce high-penalty low-confidence exposure from {lowAM} m ({lowAPct}%) to {lowBM} m ({lowBPct}%) by routing through {unkBM} m ({unkBPct}%) of unknown-quality terrain (vs. {unkAM} m), lowering weighted observation-uncertainty exposure from {weightedUA} to {weightedUB} m-eq"`
- **Branch Q3 — Combined Quality + Terrain Trade-Off:**
  When `uncertainty` differs from `terrain` by trading a small quality reduction against a slight terrain increase (as in `F08` South vs. North, where `LOW` drops $20.0\text{ m} \to 0.0\text{ m}$ while max slope rises $0.0^\circ \to 5.0^\circ$ at equal $48.28\text{ m}$ length), append:
  `"while crossing a {slopeBDeg}° max-slope corridor (vs. {slopeADeg}° on the terrain route)"`.

### 5.4 Assembled Templates Across Topologies
- **Template 1a — Single Merged Candidate on Gentle, Well-Observed Terrain ($\theta_{\text{maxSlope}} \le 5^\circ$ and $D_{\text{low}} + D_{\text{unknown}} = 0$):**
  > *"All requested policies select the same {horizDistM} m route (max modeled terrain slope {maxSlopeDeg}° over a {baselineM} m baseline, 0 m low/unknown quality exposure). Along this corridor, the shortest feasible path already crosses gentle, well-observed terrain."*
- **Template 1b — Single Merged Candidate Under Constrained Corridor or Non-Zero Penalties:**
  > *"All requested policies select the same {horizDistM} m route (max modeled terrain slope {maxSlopeDeg}° over a {baselineM} m baseline, {lowM} m low-confidence and {unkM} m unknown-quality exposure). Under the active {maxSlopeLimitDeg}° admissibility constraints, no alternative corridor achieves a lower weighted terrain or observation-quality cost."*
- **Template 2 — `terrain` vs. `shortest` (Distinct Geometry):**
  > *"Compared with the shortest feasible route ({shortDistM} m), the terrain-aware route {formatDistanceDelta(terr, short)} {formatTerrainDelta(terr, short)}."*
- **Template 3a — `uncertainty` vs. `terrain` (Distinct Geometry):**
  > *"Compared with the terrain-aware route ({terrDistM} m), the uncertainty-aware route {formatDistanceDelta(unc, terr)} {formatQualityDelta(unc, terr)}."*
- **Template 3b — Case 4 (`['shortest', 'uncertainty']` Merged vs. Distinct `['terrain']`):**
  > *"The terrain-aware policy {formatDistanceDelta(terr, short)} {formatTerrainDelta(terr, short)}, but crosses {terrLowM} m low-confidence and {terrUnkM} m unknown-quality terrain. The uncertainty-aware policy remains on the {shortDistM} m path ({shortLowM} m low-confidence, {shortUnkM} m unknown-quality) because the detour's observation-quality penalty outweighs its terrain savings."*
- **Template 4 — Effective Uniform-Quality Override (`uniformQualityOverride: true`, $U_{\max} = U_{\min}$):**
  > *"Observation quality is uniform ({uniformQualityLabel}) across all admissible cells in this region, so effective quality weight is set to γ_eff = 0 (UNIFORM_QUALITY_NO_DIFFERENTIATION) and uncertainty-aware routing evaluates the terrain-only objective."*
- **Template 5 — Standalone Single-Policy Request (e.g., `policies: ['uncertainty']` Only) or `strict` Mode:**
  > When only one policy is requested, emit its self-contained metric summary (`{horizDistM} m horizontal distance, {maxSlopeDeg}° max modeled slope over {baselineM} m baseline, {lowM} m low-confidence and {unkM} m unknown-quality exposure`) plus Template 4 if `uniformQualityOverride: true` or the strict-mode notice if `qualityMode === 'strict'`.
