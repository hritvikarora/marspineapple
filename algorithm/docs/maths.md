# MARS PATHFINDER — Mathematical Specification: Grid Geometry, Coordinate Normalization & Routing Math

This document defines the exact mathematics used in `src/routing/`, `src/coordinates/`, and `scripts/preprocess/`—with primary focus on **Grid Geometry & Endpoint Normalization** and how every spatial transformation, admissibility check, cost function, and path metric builds upon that grid.

---

## 1. Planetary Projection to Local Meter Coordinates

### 1.1 Source Equirectangular Projection (Mars)
Orbital raster products (MRO CTX DEM and HiRISE DTM mosaics) are published in a Mars Equirectangular projection parameterized by:
- $R$: Planetary reference radius in meters (e.g., $R = 3{,}396{,}190\text{ m}$ for IAU 2000 sphere, or the local radius specified in the product's WKT metadata).
- $\varphi_c$: Planetocentric latitude in radians.
- $\lambda_E$: Positive-East longitude in radians.
- $(\lambda_0, \varphi_0)$: Central meridian and standard parallel of the projection in radians.

The projected planar coordinates $(X_{\text{proj}}, Y_{\text{proj}})$ in meters are:
$$X_{\text{proj}} = R \cdot (\lambda_E - \lambda_0) \cos(\varphi_0)$$
$$Y_{\text{proj}} = R \cdot \varphi_c$$

> **Critical Rule:** Different Mars datasets may use different reference radii $R$, standard parallels $\varphi_0$, or longitude domains ($[0^\circ, 360^\circ)$ vs. $[-180^\circ, 180^\circ)$). All source rasters are reprojected offline into **one canonical projected meter grid** before leaving `scripts/preprocess/`.

---

### 1.2 The 6-Parameter Affine Transform & North-Up Normalization
A geospatial raster maps continuous pixel space $(p_x, p_y) \in [0, W] \times [0, H]$—where $(0,0)$ is the **upper-left (northwest) outer corner**—to projected coordinates $(X_{\text{proj}}, Y_{\text{proj}})$ via the affine matrix:
$$\begin{bmatrix} X_{\text{proj}} \\ Y_{\text{proj}} \\ 1 \end{bmatrix} = \begin{bmatrix} a & b & c \\ d & e & f \\ 0 & 0 & 1 \end{bmatrix} \begin{bmatrix} p_x \\ p_y \\ 1 \end{bmatrix}$$

During preprocessing, any rotated or sheared raster ($b \neq 0$ or $d \neq 0$) is warped into a strictly **north-up, axis-aligned grid** where:
- $b = 0$ and $d = 0$ (zero rotation/shear),
- $a = \Delta x > 0$ (east-west cell width in meters, `dx`),
- $e = -\Delta y < 0$ (north-south cell height in meters, where $\Delta y = |e| > 0$, `dy`),
- $c = X_{\text{UL}}$ (projected Easting of the northwest outer corner),
- $f = Y_{\text{UL}}$ (projected Northing of the northwest outer corner).

Thus, for a normalized north-up raster:
$$X_{\text{proj}}(p_x) = X_{\text{UL}} + p_x \cdot \Delta x$$
$$Y_{\text{proj}}(p_y) = Y_{\text{UL}} - p_y \cdot \Delta y$$

---

### 1.3 Local Meter Coordinate System (`{ eastM, northM }`)
Let the discrete grid have:
- $W \in \mathbb{Z}^+$ columns (`width`),
- $H \in \mathbb{Z}^+$ rows (`height`),
- $\Delta x > 0$ meters per column (`dx`),
- $\Delta y > 0$ meters per row (`dy`).

The total physical dimensions of the region footprint are:
$$L_E = W \cdot \Delta x \quad (\text{total East-West extent in meters})$$
$$L_N = H \cdot \Delta y \quad (\text{total North-South extent in meters})$$

We define the **Local Origin $(E=0, N=0)$ at the Southwest (bottom-left) outer corner** of the cropped raster:
$$X_{\text{origin}} = X_{\text{UL}}$$
$$Y_{\text{origin}} = Y_{\text{UL}} - H \cdot \Delta y = Y_{\text{UL}} - L_N$$

Every runtime position is represented as `{ eastM: E, northM: N }` in meters relative to $(X_{\text{origin}}, Y_{\text{origin}})$:
$$E = X_{\text{proj}} - X_{\text{origin}} \in [0, L_E]$$
$$N = Y_{\text{proj}} - Y_{\text{origin}} \in [0, L_N]$$

**Inverse conversion (Local Meters $\rightarrow$ Projected Mars Coordinates):**
$$X_{\text{proj}} = X_{\text{origin}} + E$$
$$Y_{\text{proj}} = Y_{\text{origin}} + N$$

---

## 2. Discrete Grid Indexing & Memory Layout

### 2.1 Row and Column Ordering
- **Rows ($\text{row} \in \{0, 1, \dots, H - 1\}$):** Run from **North to South**.
  - $\text{row} = 0$ is the **northernmost** row (bordering $N = L_N$).
  - $\text{row} = H - 1$ is the **southernmost** row (bordering $N = 0$).
- **Columns ($\text{col} \in \{0, 1, \dots, W - 1\}$):** Run from **West to East**.
  - $\text{col} = 0$ is the **westernmost** column (bordering $E = 0$).
  - $\text{col} = W - 1$ is the **easternmost** column (bordering $E = L_E$).

```text
North (N = L_N)
  +-------------------+-------------------+-----+-------------------+
  | (row=0, col=0)    | (row=0, col=1)    | ... | (row=0, col=W-1)  |
  | index = 0         | index = 1         |     | index = W - 1     |
  +-------------------+-------------------+-----+-------------------+
  | (row=1, col=0)    | (row=1, col=1)    | ... | (row=1, col=W-1)  |
  | index = W         | index = W + 1     |     | index = 2W - 1    |
  +-------------------+-------------------+-----+-------------------+
  |        ...        |        ...        | ... |        ...        |
  +-------------------+-------------------+-----+-------------------+
  | (row=H-1, col=0)  | (row=H-1, col=1)  | ... | (row=H-1,col=W-1) |
  | index = (H-1)W    | index = (H-1)W+1  |     | index = H*W - 1   |
  +-------------------+-------------------+-----+-------------------+
South (N = 0)                                                     East (E = L_E)
West (E = 0)
```

### 2.2 2D $(\text{row}, \text{col}) \leftrightarrow$ 1D Flat Array Index (`index`)
All grid layers (`elevation`, `slopeDeg`, `roughness`, `validMask`, `qualityClass`, `exclusionMask`) are stored as flat 1D typed arrays of length $N_{\text{cells}} = W \cdot H$.

- **Forward mapping $(\text{row}, \text{col}) \rightarrow \text{index}$:**
  $$\text{index}(\text{row}, \text{col}) = \text{row} \cdot W + \text{col}$$

- **Inverse mapping $\text{index} \rightarrow (\text{row}, \text{col})$:**
  $$\text{row}(\text{index}) = \left\lfloor \frac{\text{index}}{W} \right\rfloor$$
  $$\text{col}(\text{index}) = \text{index} \bmod W = \text{index} - \text{row}(\text{index}) \cdot W$$

---

## 3. Cell Footprints & The $+0.5$ Cell-Center Convention

### 3.1 Spatial Footprint of Cell $(\text{row}, \text{col})$
Each discrete cell $(\text{row}, \text{col})$ covers the rectangular region:
$$E \in \big[\text{col} \cdot \Delta x, \; (\text{col} + 1) \cdot \Delta x\big]$$
$$N \in \big[L_N - (\text{row} + 1) \cdot \Delta y, \; L_N - \text{row} \cdot \Delta y\big]$$

### 3.2 Cell-Center Coordinates $(E_c, N_c)$
Every numeric measurement stored at $(\text{row}, \text{col})$ represents the sample at the **geometric center** of that cell ($p_x = \text{col} + 0.5$, $p_y = \text{row} + 0.5$):
$$E_c(\text{col}) = \left(\text{col} + \frac{1}{2}\right) \Delta x$$
$$N_c(\text{row}) = L_N - \left(\text{row} + \frac{1}{2}\right) \Delta y = \left(H - \text{row} - \frac{1}{2}\right) \Delta y$$

**Worked Example:**
Suppose $W = 200$, $H = 200$, $\Delta x = 5\text{ m}$, $\Delta y = 5\text{ m}$, so $L_E = 1000\text{ m}$ and $L_N = 1000\text{ m}$:
- **Northwest cell $(\text{row}=0, \text{col}=0)$:**
  $$E_c(0) = (0 + 0.5) \times 5 = 2.5\text{ m}, \qquad N_c(0) = 1000 - (0 + 0.5) \times 5 = 997.5\text{ m}$$
- **Southwest cell $(\text{row}=199, \text{col}=0)$:**
  $$E_c(0) = 2.5\text{ m}, \qquad N_c(199) = 1000 - (199 + 0.5) \times 5 = 2.5\text{ m}$$
- **Southeast cell $(\text{row}=199, \text{col}=199)$:**
  $$E_c(199) = 997.5\text{ m}, \qquad N_c(199) = 2.5\text{ m}$$

### 3.3 Outer Raster Bounds vs. Inner Cell-Center Bounds
- **Outer Raster Footprint:** $[0, L_E] \times [0, L_N]$ (span $L_E \times L_N$).
- **Cell-Center Footprint:** $\left[\frac{\Delta x}{2}, \; L_E - \frac{\Delta x}{2}\right] \times \left[\frac{\Delta y}{2}, \; L_N - \frac{\Delta y}{2}\right]$ (span $(W-1)\Delta x \times (H-1)\Delta y$).

This half-cell inset ($\frac{\Delta x}{2}$ on West/East, $\frac{\Delta y}{2}$ on South/North) is critical when mapping a texture of outer size $L_E \times L_N$ onto a 3D mesh whose vertices are placed at cell centers $(E_c, N_c)$:
$$u(\text{col}) = \frac{E_c(\text{col})}{L_E} = \frac{\text{col} + 0.5}{W}, \qquad v(\text{row}) = \frac{N_c(\text{row})}{L_N} = 1 - \frac{\text{row} + 0.5}{H}$$

---

## 4. Endpoint Normalization & Boundary Mathematics

When a user selects a start or destination point $P_{\text{req}} = (E_{\text{req}}, N_{\text{req}})$, the routing boundary executes a 6-stage mathematical pipeline.

### Stage 1: Finiteness Validation
Verify that both coordinates are finite real numbers:
$$\text{Number.isFinite}(E_{\text{req}}) \land \text{Number.isFinite}(N_{\text{req}})$$
If false (`NaN`, $+\infty$, or $-\infty$), return `invalid_input` with code `NON_FINITE_COORDINATE`.

### Stage 2: Outer Region Bounding Box Check
A point lies within the analyzed Mars crop if and only if:
$$0 \le E_{\text{req}} \le L_E \quad \text{and} \quad 0 \le N_{\text{req}} \le L_N$$
If $E_{\text{req}} < 0$, $E_{\text{req}} > L_E$, $N_{\text{req}} < 0$, or $N_{\text{req}} > L_N$, immediately return `invalid_input` with code `OUTSIDE_REGION_BOUNDS`.

### Stage 3: Continuous-to-Discrete Cell Mapping & Exact Edge Clamping
Inside the valid outer bounds $[0, L_E] \times [0, L_N]$, continuous grid coordinates are:
$$u_x = \frac{E_{\text{req}}}{\Delta x} \in [0, W], \qquad u_y = \frac{L_N - N_{\text{req}}}{\Delta y} \in [0, H]$$

**Why naive `Math.floor` fails on the exact East and South borders:**
- If a user clicks directly on the eastern border ($E_{\text{req}} = L_E$), then $u_x = W$ and $\lfloor u_x \rfloor = W$, which is outside $\{0, \dots, W-1\}$.
- If a user clicks directly on the southern border ($N_{\text{req}} = 0$), then $u_y = H$ and $\lfloor u_y \rfloor = H$, which is outside $\{0, \dots, H-1\}$.

Therefore, each cell $(\text{row}, \text{col})$ owns the half-open interval $[\text{col}\cdot\Delta x, (\text{col}+1)\cdot\Delta x)$, **except** the last column ($W-1$) and last row ($H-1$), which are closed on the outer boundary ($E_{\text{req}} = L_E$ and $N_{\text{req}} = 0$). Mathematically, **after** Stage 2 has verified $0 \le E_{\text{req}} \le L_E$ and $0 \le N_{\text{req}} \le L_N$:
$$\text{col} = \min\left(W - 1, \; \max\left(0, \; \left\lfloor \frac{E_{\text{req}}}{\Delta x} \right\rfloor\right)\right)$$
$$\text{row} = \min\left(H - 1, \; \max\left(0, \; \left\lfloor \frac{L_N - N_{\text{req}}}{\Delta y} \right\rfloor\right)\right)$$

### Stage 4: Cell-Center Snapping & Displacement Bound
The accepted endpoint is snapped to the center of cell $(\text{row}, \text{col})$:
$$E_{\text{acc}} = \left(\text{col} + \frac{1}{2}\right)\Delta x, \qquad N_{\text{acc}} = L_N - \left(\text{row} + \frac{1}{2}\right)\Delta y$$

The displacement vector between the user's click and the snapped cell center is:
$$\delta E = E_{\text{acc}} - E_{\text{req}}, \qquad \delta N = N_{\text{acc}} - N_{\text{req}}$$

By construction of the floor mapping, the snap error is strictly bounded in each axis and in Euclidean distance:
$$|\delta E| \le \frac{\Delta x}{2}, \qquad |\delta N| \le \frac{\Delta y}{2}$$
$$d_{\text{snap}} = \sqrt{(\delta E)^2 + (\delta N)^2} \le \frac{1}{2}\sqrt{(\Delta x)^2 + (\Delta y)^2}$$

Both $P_{\text{req}} = (E_{\text{req}}, N_{\text{req}})$ and $P_{\text{acc}} = (E_{\text{acc}}, N_{\text{acc}})$ are returned in the route response so the UI can disclose the grid resolution adjustment.

### Stage 5: Endpoint Cell Admissibility Check (Canonical Predicate Before Same-Cell Shortcut)
Let $k = \text{row} \cdot W + \text{col}$. Before checking whether Start and Destination share a cell (Stage 6) and before running A*, **both endpoints must pass the exact same canonical cell-admissibility function `getCellExclusionReason(bundle, k, profile, qualityMode)`** used for neighbors, diagonal corners, component labeling, and path verification, evaluated in strict priority order:
1. **`OUTSIDE_BOUNDS`:** $r < 0 \lor r \ge H \lor c < 0 \lor c \ge W$.
2. **`NO_DATA_ELEVATION`:** $\text{validMask}[k] = 0 \lor \neg\text{Number.isFinite}(z[k]) \lor z[k] = z_{\text{NoData}}$.
   *(Note: Negative elevations such as $z = -2540\text{ m}$ in Jezero Crater are valid measurements and must never be rejected by a $z \le 0$ check.)*
3. **`INTERPOLATED_OR_UNRELIABLE`:** $q[k] = \text{INVALID}$ (e.g., source FOM marks the post as interpolated, extrapolated, shadowed, saturated, or suspicious—even if $z[k]$ is finite and $\text{validMask}[k] = 1$).
4. **`UNSUPPORTED_DERIVATIVE`:** $(\text{exclusionMask}[k] \mathbin{\&} \text{BIT\_DERIV}) \neq 0 \lor \neg\text{Number.isFinite}(s[k])$.
5. **`EXPLICIT_EXCLUSION`:** $(\text{exclusionMask}[k] \mathbin{\&} \text{BIT\_MANUAL}) \neq 0$.
6. **`TERRAIN_SLOPE_EXCEEDED`:** $s[k] > \theta_{\text{maxSlope}}$ (default $20^\circ$ in `educational-eva-v1`).
7. **`STRICT_QUALITY_EXCLUDED`:** If `qualityMode === 'strict'`, $q[k] \notin \mathcal{Q}_{\text{acceptable}}$.

If either Start or Destination fails any check 1–7, the solver immediately returns `invalid_input` with the specific exclusion reason code rather than proceeding to Stage 6 or snapping to a distant valid cell.

### Stage 6: Degenerate Same-Cell Case ($k_{\text{start}} = k_{\text{dest}}$, Evaluated Only After Stage 5 Passes)
If $P_{\text{start}}$ and $P_{\text{dest}}$ both pass Stage 5 and fall inside the same admissible cell $k_0 = (\text{row}_0, \text{col}_0)$:
- The cell path is $[k_0]$ (1 vertex, 0 edges).
- All cumulative edge sums are zero:
  $$D_{\text{horiz}} = 0, \quad D_{\text{surface}} = 0, \quad \Delta Z_{\text{up}} = 0, \quad \Delta Z_{\text{down}} = 0, \quad \theta_{\text{maxGrade}} = 0^\circ$$
- Maximum terrain slope equals the standing cell's slope: $\theta_{\text{maxSlope}} = s[k_0]$.
- Quality exposure distances are $D_{\text{low}} = 0\text{ m}$ and $D_{\text{unknown}} = 0\text{ m}$.
- **Zero-Division Guard for Exposure Percentages:**
  $$\text{Pct}(D_{\text{class}}, D_{\text{horiz}}) = \begin{cases} 100 \cdot \dfrac{D_{\text{class}}}{D_{\text{horiz}}} & \text{if } D_{\text{horiz}} > 0 \\ 0 & \text{if } D_{\text{horiz}} = 0 \end{cases}$$

---

## 5. Cross-View Coordinate Adapters (2D Map & 3D Scene)

### 5.1 Leaflet `L.CRS.Simple` Adapter
Leaflet's simple CRS uses $(\text{lat}, \text{lng}) = (y, x)$. To preserve 1 meter = 1 map unit:
$$\text{toLeafletLatLng}(E, N) = \text{L.latLng}(\text{lat}: N, \; \text{lng}: E)$$
$$\text{fromLeafletLatLng}(\text{lat}, \text{lng}) = \{ \text{eastM}: \text{lng}, \; \text{northM}: \text{lat} \}$$

### 5.2 Three.js Right-Handed 3D Scene Adapter & Diagonal Saddle-Quad Draping
Three.js uses a right-handed coordinate frame where $+X$ is East, $+Y$ is Up (elevation), and $+Z$ points South (so **North is $-Z$**). Relative to a scene origin $(E_0, N_0, Z_0)$ (typically the region center $(L_E/2, L_N/2, z_{\text{ref}})$):
$$X_{3\text{D}} = E - E_0$$
$$Y_{3\text{D}} = \kappa_{\text{exag}} \cdot (z - Z_0) + \delta y_{\text{offset}}$$
$$Z_{3\text{D}} = -(N - N_0) = N_0 - N$$
where $\kappa_{\text{exag}} \ge 1$ is the display-only vertical exaggeration factor (default $1.0$) and $\delta y_{\text{offset}} \ge 0$ prevents route polyline z-fighting without altering any scientific metric.

**Diagonal Route Segments Over Triangulated Mesh Quads (Saddle-Quad Protection):**
- A standard two-triangle heightfield mesh splits each cell-center quad along one fixed diagonal (e.g., NE–SW), while the 8-neighbor router allows movement along both diagonals (NE–SW and NW–SE).
- On a non-planar "saddle" quad (e.g., NW and SE at $0\text{ m}$, NE and SW at $1\text{ m}$), a straight 3D segment connecting the NW and SE cell centers has midpoint height $0\text{ m}$, whereas the NE–SW mesh triangle diagonal bridges across the quad center at height $1\text{ m}$ ($\kappa_{\text{exag}} \times 1\text{ m}$ under vertical exaggeration)—burying the route midpoint underground regardless of a small $\delta y_{\text{offset}}$.
- **Render-Only Draping Rule:** While the authoritative route vertices, elevations, and scientific metrics remain strictly at cell centers $(E_c, N_c, z[k_i])$, the 3D route polyline builder subdivides any diagonal step $(u \to v)$ at the quad midpoint $(E_{\text{mid}}, N_{\text{mid}})$ and evaluates its display height against the actual rendered mesh triangle surface at $(E_{\text{mid}}, N_{\text{mid}})$ (using $\max(z_{\text{edgeMid}}, z_{\text{meshSurfaceMid}})$ before applying $\kappa_{\text{exag}}$ and $+\delta y_{\text{offset}}$). This guarantees that diagonal route segments remain visible above the mesh at both $1\times$ and exaggerated scales.

**Inverse (Three.js Raycast Hit $\rightarrow$ Local Meters):**
$$E = X_{3\text{D}} + E_0, \qquad N = N_0 - Z_{3\text{D}}$$

---

## 6. Neighborhood Transitions, Slope, Grade & Cost Mathematics

### 6.1 8-Neighbor Geometry on Rectangular Cells ($\Delta x \neq \Delta y$ Supported)
From cell $u = (\text{row}_u, \text{col}_u)$ to an adjacent neighbor $v = (\text{row}_u + \Delta r, \text{col}_u + \Delta c)$ where $(\Delta r, \Delta c) \in \{-1, 0, 1\}^2 \setminus \{(0,0)\}$:
$$\Delta E = \Delta c \cdot \Delta x, \qquad \Delta N = -\Delta r \cdot \Delta y$$

The planar horizontal step length $d(u,v)$ is:
$$d(u, v) = \sqrt{(\Delta c \cdot \Delta x)^2 + (\Delta r \cdot \Delta y)^2} = \begin{cases} \Delta x & \text{if } \Delta r = 0, |\Delta c| = 1 \text{ (East/West)} \\ \Delta y & \text{if } |\Delta r| = 1, \Delta c = 0 \text{ (North/South)} \\ \sqrt{(\Delta x)^2 + (\Delta y)^2} & \text{if } |\Delta r| = 1, |\Delta c| = 1 \text{ (Diagonal)} \end{cases}$$

### 6.2 Diagonal No-Corner-Cutting Rule
For any diagonal transition $(|\Delta r| = 1 \land |\Delta c| = 1)$ from $u = (\text{row}_u, \text{col}_u)$ to $v = (\text{row}_u + \Delta r, \text{col}_u + \Delta c)$, the two shared orthogonal neighbor cells are:
$$w_1 = (\text{row}_u + \Delta r, \; \text{col}_u), \qquad w_2 = (\text{row}_u, \; \text{col}_u + \Delta c)$$
The diagonal transition $(u \to v)$ is **admissible only if both $w_1$ and $w_2$ are admissible cells**:
$$\text{AdmissibleDiag}(u, v) \iff \text{AdmissibleCell}(u) \land \text{AdmissibleCell}(v) \land \text{AdmissibleCell}(w_1) \land \text{AdmissibleCell}(w_2)$$

### 6.3 Support-Mask Propagation, Modeled Terrain Slope vs. Along-Edge Route Grade
0. **Elevation-Support Mask Before Resampling & Derivatives:**
   Hard-excluded source quality classes (`INTERPOLATED`, `EXTRAPOLATED`, `SHADOWED`, `SATURATED`, `SUSPICIOUS` $\implies q = \text{INVALID}$) can carry finite height values in raw source rasters. Preprocessing must decode source quality **first** and construct an **elevation-support mask**:
   $$\text{supported}[p] \iff \text{validElevation}[p] \land \big(q[p] \neq \text{INVALID}\big)$$
   Unsupported posts (`!supported[p]`) must be masked out before any continuous resampling, $3 \times 3$ Horn slope, or plane-fit roughness calculation so invented or corrupted heights never contaminate adjacent accepted cells' elevations or derivatives.

1. **Neighborhood Terrain Slope ($s[k]$ in degrees, over a $2\Delta x \times 2\Delta y$ baseline):**
   Computed during preprocessing over the $3 \times 3$ Horn (GDAL default) window around cell $(\text{row}, \text{col})$ using only supported elevations:
   $$\frac{\partial z}{\partial E} = \frac{(z_{r-1,c+1} + 2z_{r,c+1} + z_{r+1,c+1}) - (z_{r-1,c-1} + 2z_{r,c-1} + z_{r+1,c-1})}{8\Delta x}$$
   $$\frac{\partial z}{\partial N} = \frac{(z_{r-1,c-1} + 2z_{r-1,c} + z_{r-1,c+1}) - (z_{r+1,c-1} + 2z_{r+1,c} + z_{r+1,c+1})}{8\Delta y}$$
   $$s[k] = \arctan\!\left(\sqrt{\left(\frac{\partial z}{\partial E}\right)^2 + \left(\frac{\partial z}{\partial N}\right)^2}\right) \cdot \frac{180}{\pi} \in [0^\circ, 90^\circ)$$
   - **Important Properties of Horn's Operator:**
     - The center elevation $z_{r,c}$ has weight $0$ in both finite differences; therefore, a single-cell elevation spike has $s[r,c] \approx 0^\circ$ at the spike tip and high slope on its surrounding shoulder cells.
     - The effective horizontal baseline is $2\Delta x$ ($10\text{ m}$ on a $5\text{ m}$ grid, $40\text{ m}$ on a $20\text{ m}$ CTX grid). The baseline length in meters must always be reported alongside $s[k]$.
     - If any of the 8 neighbors in the $3 \times 3$ window is unsupported (`NoData` or `q = INVALID`), all-or-nothing propagation flags cell $k$ as `UNSUPPORTED_DERIVATIVE` (unless a documented partial-window fit over supported samples is used and the cell's quality is forced to `UNKNOWN`).

2. **Along-Edge Route Grade ($g(u,v)$ in degrees):**
   Measures the directional rise/drop $\Delta z = z[v] - z[u]$ over horizontal step length $d(u,v)$:
   $$g_{\text{signed}}(u, v) = \arctan\!\left(\frac{z[v] - z[u]}{d(u, v)}\right) \cdot \frac{180}{\pi}$$
   $$g_{\text{abs}}(u, v) = \left|g_{\text{signed}}(u, v)\right| = \arctan\!\left(\frac{|z[v] - z[u]|}{d(u, v)}\right) \cdot \frac{180}{\pi}$$
   A step $(u \to v)$ is rejected if $g_{\text{abs}}(u, v) > \theta_{\text{maxGrade}}$ (default $20^\circ$ in `educational-eva-v1`). Using $g_{\text{abs}}$ keeps the graph undirected (symmetric).

3. **3D Surface Step Length ($d_{3\text{D}}(u,v)$):**
   $$d_{3\text{D}}(u, v) = \sqrt{d(u, v)^2 + (z[v] - z[u])^2}$$

### 6.4 Normalized Edge Penalties ($S, R, U$), Effective Policy Rule & Weighted Cost Function
For an admissible step $(u \to v)$, we use conservative maxima:
- **Normalized Slope Penalty $S(u,v) \in [0, 1]$:**
  $$S(u, v) = \min\!\left(1, \; \max\!\left(0, \; \frac{\max(s[u], s[v])}{\theta_{\text{maxSlope}}}\right)\right)$$
- **Normalized Roughness Penalty $R(u,v) \in [0, 1]$:**
  Let $\sigma_{\text{res}}[k]$ be the RMS elevation residual from a local best-fit plane over a physical window (e.g., $15\text{ m} \times 15\text{ m}$) using supported elevations, normalized by a fixed profile scale $R_{\text{scale}} > 0$:
  $$R(u, v) = \min\!\left(1, \; \max\!\left(0, \; \frac{\max(\sigma_{\text{res}}[u], \sigma_{\text{res}}[v])}{R_{\text{scale}}}\right)\right)$$
  *(If roughness is unavailable, $R(u,v) = 0$.)*
- **Observation Quality Penalty $U(u,v) \in [0, 1]$ (Including Diagonal Corner Grazing):**
  From the versioned quality penalty lookup $\pi_U(q) \in [0, 1]$:
  - For a **cardinal** step $(u \to v)$:
    $$U(u, v) = \max\big(\pi_U(q[u]), \; \pi_U(q[v])\big)$$
  - For a **diagonal** step $(u \to v)$ with shared orthogonal corner cells $w_1 = (r_u + \Delta r, c_u)$ and $w_2 = (r_u, c_u + \Delta c)$:
    $$U(u, v) = \max\big(\pi_U(q[u]), \; \pi_U(q[v]), \; \pi_U(q[w_1]), \; \pi_U(q[w_2])\big)$$

**Authoritative Edge Cost Equation:**
$$\text{cost}(u, v) = d(u, v) \cdot \big(1 + \alpha S(u, v) + \beta R(u, v) + \gamma_{\text{eff}} U(u, v)\big)$$

| Policy | $\alpha$ (Slope) | $\beta$ (Roughness) | Configured $\gamma$ | Effective $\gamma_{\text{eff}}$ |
| :--- | :---: | :---: | :---: | :--- |
| `shortest` | $0$ | $0$ | $0$ | $0$ |
| `terrain` | $2$ | $1$ | $0$ | $0$ |
| `uncertainty` | $2$ | $1$ | $2$ | $0$ if $U_{\max} = U_{\min}$ across admissible bundle cells (Uniform-Quality Model Rule); otherwise $2$ |

> **Uniform-Quality Effective-Policy Model Rule:**
> If every admissible cell in the loaded bundle has identical observation quality ($U_{\max} = U_{\min}$, e.g., $U \equiv 0.75$ everywhere on an undocumented CTX fallback), evaluating the raw $\gamma = 2$ formula adds $+1.5 \cdot d(u,v)$ per meter, which does **not** preserve the `terrain` optimum (it dilutes slope/roughness weights by $2.5\times$ and can force a steeper shortcut).
> Therefore, as an explicit **model rule** (not a cost-preserving shortcut claim), when $U_{\max} = U_{\min}$ across the admissible bundle, the `uncertainty` policy sets its effective weight to **$\gamma_{\text{eff}} = 0$**, exports `effectiveWeights: { alpha: 2, beta: 1, gamma: 0, configuredGamma: 2, uniformQualityOverride: true }`, and attaches `UNIFORM_QUALITY_NO_DIFFERENTIATION`. Both A* and the Dijkstra oracle evaluate $\gamma_{\text{eff}}$, and standalone `['uncertainty']` requests execute directly with $\gamma_{\text{eff}} = 0$ without requiring `'terrain'` to be requested.

---

## 7. A* Search Optimality Proof (On the 8-Neighbor Graph) & Path Metrics

### 7.1 Heuristic Admissibility & Consistency on the Declared 8-Neighbor Graph
For any cell $u$ with center $(E_c(u), N_c(u))$ and goal cell $g$ with center $(E_c(g), N_c(g))$, the heuristic is the planar Euclidean distance:
$$h(u) = \sqrt{\big(E_c(u) - E_c(g)\big)^2 + \big(N_c(u) - N_c(g)\big)^2}$$

**Proof of Admissibility & Consistency:**
Since $\alpha, \beta, \gamma_{\text{eff}} \ge 0$ and $S(u,v), R(u,v), U(u,v) \ge 0$, every admissible edge satisfies:
$$\text{cost}(u, v) = d(u, v) \cdot (1 + \alpha S + \beta R + \gamma_{\text{eff}} U) \ge d(u, v)$$
By the triangle inequality in $\mathbb{R}^2$, for any neighbor $v$ of $u$:
$$h(u) \le d(u, v) + h(v) \le \text{cost}(u, v) + h(v)$$
and $h(g) = 0$. Therefore, $h$ is both **admissible** and **consistent (monotonic)**, guaranteeing that A* finds a globally minimum-cost path **on the declared 8-neighbor graph** when the goal $g$ is popped from the priority queue.
*(Note on 8-Neighbor Graph Digitization: Because movement is constrained to 8 grid directions, an unobstructed 8-neighbor path is longer than a continuous Euclidean line in non-cardinal/non-diagonal directions. On a **square grid ($\Delta x = \Delta y$)**, the worst-case unobstructed excess is $\sqrt{4 - 2\sqrt{2}} - 1 \approx 8.24\%$ at $22.5^\circ$. On a **rectangular grid ($\Delta x \neq \Delta y$)**, allowed step angles are unevenly spaced and the unobstructed stretch is spacing- and direction-dependent—for example, with $\Delta x = 20\text{ m}, \Delta y = 5\text{ m}$, a displacement of $\Delta c = 1, \Delta r = 3$ has Euclidean length $\sqrt{20^2 + 15^2} = 25\text{ m}$ vs. optimal 8-neighbor length $\sqrt{425} + 10 \approx 30.6155\text{ m}$, an excess of $+22.46\%$. We therefore always state that the solver is **optimal on the declared 8-neighbor graph**.)*

### 7.2 Cumulative Path Metrics Over Cell Sequence $P = (k_0, k_1, \dots, k_m)$
For a path of $m$ edges ($m \ge 1$):
- **Cumulative Horizontal Distance at Vertex $i$:**
  $$D_0 = 0, \qquad D_i = \sum_{j=1}^{i} d(k_{j-1}, k_j), \qquad D_{\text{horiz}} = D_m$$
- **Total 3D Sampled Surface Distance:**
  $$D_{\text{surface}} = \sum_{j=1}^{m} \sqrt{d(k_{j-1}, k_j)^2 + (z[k_j] - z[k_{j-1}])^2}$$
- **Separate Ascent and Descent:**
  $$\Delta Z_{\text{ascent}} = \sum_{j=1}^{m} \max\big(0, \; z[k_j] - z[k_{j-1}]\big)$$
  $$\Delta Z_{\text{descent}} = \sum_{j=1}^{m} \max\big(0, \; z[k_{j-1}] - z[k_j]\big)$$
- **Maximum Terrain Slope & Maximum Along-Route Grade:**
  $$\theta_{\text{maxSlope}} = \max_{0 \le i \le m} s[k_i], \qquad \theta_{\text{maxGrade}} = \max_{1 \le j \le m} g_{\text{abs}}(k_{j-1}, k_j)$$
- **Length-Weighted Observation Quality Exposure:**
  Each edge $e_j = (k_{j-1}, k_j)$ is classified conservatively by the worst quality state of its endpoints (plus its two orthogonal corner cells $w_1, w_2$ if $e_j$ is diagonal), matching $U(u,v)$:
  $$D_{\text{low}} = \sum_{\substack{j=1 \\ \text{class}(e_j) = \text{low}}}^{m} d(k_{j-1}, k_j), \qquad D_{\text{unknown}} = \sum_{\substack{j=1 \\ \text{class}(e_j) = \text{unknown}}}^{m} d(k_{j-1}, k_j)$$
  $$\text{Pct}_{\text{low}} = 100 \cdot \frac{D_{\text{low}}}{D_{\text{horiz}}}, \qquad \text{Pct}_{\text{unknown}} = 100 \cdot \frac{D_{\text{unknown}}}{D_{\text{horiz}}}$$
- **Assumed Mission Travel Time (Optional Simulator Metric):**
  For declared constant simulator speed $v_{\text{sim}} > 0$ (default $0.5\text{ m/s}$) and science stop duration $T_{\text{stop}} \ge 0$:
  $$T_{\text{total}} = \frac{D_{\text{surface}}}{v_{\text{sim}}} + T_{\text{stop}}$$
