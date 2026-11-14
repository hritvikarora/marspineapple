# `coord-bridge` Architecture Debate (`src/terrain3d/coordBridge.ts`)

**Role:** `coord-bridge` (`merge/integration`)  
**Owned Files:** `src/terrain3d/coordBridge.ts`, `docs/debate-parts/debate-coord-bridge.md`  
**Reviewer Model:** `grok-4.7-high` (Cursor CLI `--mode ask`)

---

## 1. Proposed Decision

1. **Pure TypeScript boundary:** Zero `import ... from 'three'` in `src/terrain3d/coordBridge.ts`; import only types from `../contracts` and shared coordinate helpers (`pointToCell`, `toSceneXYZ`) from `../contracts/grid` (via `../contracts`).
2. **Coordinate frame gating:** Delete unparameterized `localToVr2` / `vr2ToLocal`. Gate `JEZERO_VR_OFFSET` (`eastOrigin_m: 586.81`, `northOrigin_m: 470.15`) behind `isJezeroHiriseBundle(bundle)`, using bundle extent midpoint for non-HiRISE bundles (`jezero-west-ctx20m-v0.1.0`, `synthetic-v0`, test fixtures). Provide `localToVr2ForBundle`, `vr2ToLocalForBundle`, `localToSceneXYZ`, and `sceneXYZToLocal`. Keep CRISM `shiftM: [-180, 204]` strictly out of route/POI math.
3. **Unified POIs (`getUnifiedPoisForBundle`):** For Jezero HiRISE, combine manifest POIs (`poi-p3`, `poi-p4`, `poi-p5`) with Marswalk `site.json` POIs (`base`, `yori`, `rockytop`, `threeforks`), keeping `threeforks` (sol 663) distinct from `poi-p5` (sol 686/690 Depot, 41.5 m apart). Use English prose from `scripts/data/texts/ui_captions.json` and `./sites/jezero-delta/photos/...` relative URLs. For non-HiRISE bundles, map `bundle.manifest.pointsOfInterest`.
4. **Bilinear elevation sampling (`sampleElevationBilinear`):** Map `(east_m, north_m)` to cell-center index space, blend neighboring finite cells, and return `null` when out of bounds or all neighbors are non-finite.
5. **Path queries, corridor safety, and arrival:**
   - `findNearestPointOnPath(position, path)` and `findClosestRejectedPath(position, rejectedPaths, proximityThreshold_m = 18)`.
   - `checkCorridorSafety(position, bundle, activePathCells, activePath, options?)` using cell-size-proportional threshold `Math.max(6, Math.max(dx_m, dy_m) * 1.5)` (~6 m HiRISE, ~15 m synthetic, ~30 m CTX) and pre-step checking on cell admissibility (`exclusion === 0`, finite elevation/slope `<= 20°`) and `activePathCells` membership.
   - `checkArrivalAtDestination(position, destination, arrivalRadius_m = 8)`.

---

## 2. Grok's Critique & Counter-suggestions (`grok-4.7-high`)

Grok reviewed the design directly against `src/contracts/`, `public/bundles/jezero-west-hirise-v0.1.0/manifest.json`, `public/bundles/jezero-west-ctx20m-v0.1.0/manifest.json`, and `public/sites/jezero-delta/site.json`, identifying the following concrete defects and edge cases:

1. **Invalid `GridBundle` field & weak substring frame gate:**
   - `GridBundle` has `bundleVersion` and `manifest.bundleId`, **not** `bundleId`. `Pick<GridBundle, 'bundleId' | ...>` fails TypeScript compilation.
   - A substring check (`includes('jezero-west-hirise')`) would misapply the empirical `(586.81, 470.15)` offset if a future HiRISE rebuild shifts the SW corner or cell size. Gate on exact `manifest.bundleId === 'jezero-west-hirise-v0.1.0'`, `crs.localOriginInSource` matching `{ x: 4587569.0, y: 1093474.0 }` within `1e-3`, published extent (`948.567031 × 1000.0`), and cell size (`0.948567 × 1.0`).
   - Factor origin resolution into one canonical `frameForBundle(bundle)` function so terrain and pins cannot split, implement `localToSceneXYZ` via `toSceneXYZ` from `../contracts` so the `-north_m` Z sign cannot drift, and reject `verticalExaggeration === 0` or non-finite values in `sceneXYZToLocal`.
2. **POI count, photo/MEDA ownership, and elevation source:**
   - Explicit ID pairing (`wildcat` ↔ `poi-p3`, `nukshak` ↔ `poi-p4`) with `threeforks` kept distinct from `poi-p5` produces **7** `UnifiedPoi`s, not 6. Never cluster by distance.
   - `threeforks.jpg` (sol 663) belongs only to `threeforks` (`photoUrl: null` on `poi-p5`); MEDA sol 690 belongs only to `poi-p5`. `base` has `photoUrl: null` and notes the outpost is fictional.
   - `elev_m` must be sampled from `bundle.elevation` via `sampleElevationBilinear`, never copied from `site.json`'s clipmap values.
3. **Bilinear sampling edge & `NaN` traps:**
   - Use `pointToCell(spec, point) === null` as the single outside-extent gate (matching half-open east/south outer edges and non-finite coordinates).
   - Row index formula is `fr = (spec.extent.north_m - point.north_m) / spec.cellSizeNorth_m - 0.5`.
   - Do **not** clamp `fc`/`fr` into `[0, width-1] × [0, height-1]` (clamping shifts edge strips half a cell toward cell centers); drop out-of-range corners and renormalize.
   - Validate `elevation.length === spec.width * spec.height`, use `Number.isFinite` (since `?? 0` turns `NaN` into a ~2.5 km spike on negative Jezero elevations), and return `null` whenever the containing cell itself is non-finite so missing-elevation holes are never filled by neighbor interpolation.
4. **Corridor safety, `noUncheckedIndexedAccess`, and CTX-aware thresholds:**
   - Check `activePath.length === 0` first and return non-blocking (`isOffPath: false, reason: null`) to avoid soft-locking when no route is active.
   - Enforce reason priority: outside extent / non-zero exclusion / non-finite elevation / non-finite slope → `'excluded-cell'`; slope > `maxSlope_deg` → `'steep-slope'`; distance > threshold → `'corridor-deviation'`. (`activePathCells` membership waives only the distance check, never exclusion/slope/finite checks.)
   - Never substitute `activePath[0]` over a valid segment projection (would teleport to start); project cleanly onto segments `[i, i+1]` with zero-length segment guard and `noUncheckedIndexedAccess`-safe local bindings. Track cumulative horizontal length for `progressFraction` and return both `segmentIndex` (`i`), `t`, and `nearestVertexIndex` (`t < 0.5 ? i : i + 1`).
   - Fixed `8 m` arrival radius fails on 20 m CTX where `poi-p5` lies ~10 m from its cell center; expose cell-size-aware helpers (`defaultArrivalRadiusForGrid`, `defaultCorridorThresholdForGrid`) so CTX callers scale appropriately while keeping `8 m` as the small-cell floor.

---

## 3. Final Refined Decision

1. **Frame Gating & Scene Helpers (`frameForBundle`):**
   - Accept `CoordBundleRef = Pick<GridBundle, 'bundleVersion'> & { manifest: Pick<RegionManifest, 'bundleId' | 'crs' | 'grid'> }`.
   - `isJezeroHiriseBundle(bundle)` verifies exact `manifest.bundleId === 'jezero-west-hirise-v0.1.0'`, `crs.localOriginInSource` within `1e-3` of `(4587569.0, 1093474.0)`, extent `(0..948.5670310210961, 0..1000.0)` within `1e-2`, and cell size `(0.9485670310210961, 1.0)` within `1e-3`.
   - `frameForBundle(bundle)` returns `{ east_m: 586.81, north_m: 470.15 }` for the verified HiRISE bundle and extent midpoint otherwise.
   - `localToVr2ForBundle` / `vr2ToLocalForBundle` use `frameForBundle(bundle)`. `localToSceneXYZ` delegates to `toSceneXYZ` from `../contracts` with origin subtraction; `sceneXYZToLocal` rejects `verticalExaggeration === 0` or non-finite values. Also export `localToSceneXYZForBundle`.
2. **7 Unified POIs for Jezero HiRISE:**
   - `getUnifiedPoisForBundle(bundle)` returns the 7 distinct `UnifiedPoi` entries for the verified Jezero HiRISE bundle (`poi-p3`/`wildcat`, `poi-p4`/`nukshak`, `poi-p5` Sample Depot, `threeforks` sol 663 traverse stop, `base` fictional outpost, `yori`, `rockytop`) with English captions, strict photo/MEDA ownership, and `elev_m` sampled via `sampleElevationBilinear`. Non-HiRISE bundles (`ctx20m`, `synthetic-v0`, test grids) map `bundle.manifest.pointsOfInterest` cleanly.
3. **Strict Bilinear Sampling (`sampleElevationBilinear`):**
   - Length check, `pointToCell` gate, finite containing-cell requirement, unclamped continuous `(fc, fr)` corner gathering with out-of-range corner renormalization and finite checks.
4. **Corridor Safety, Path Projection & Arrival:**
   - `defaultCorridorThresholdForGrid(grid)` computes `Math.max(6, Math.max(grid.cellSizeEast_m, grid.cellSizeNorth_m) * 1.5)` (used as default in `checkCorridorSafety` unless `options.maxCorridorDeviation_m` is passed).
   - `defaultArrivalRadiusForGrid(grid)` computes `Math.max(8, 0.5 * Math.hypot(grid.cellSizeEast_m, grid.cellSizeNorth_m) + 0.5)` so CTX cell centers reach arrival cleanly without merging `threeforks` and `poi-p5` (41.5 m apart).
   - `checkCorridorSafety` accepts `ReadonlySet<number> | readonly number[]` (preferring `ReadonlySet<number>` for O(1) per-tick checks), documents that it is a pre-step cell-level predicate (weaker than solver edge-grade `|dz|/len <= tan(20°)`), handles empty `activePath` without soft-locking, enforces strict reason priority (`excluded-cell` > `steep-slope` > `corridor-deviation`), and projects `nearestSafePoint` onto the nearest path segment.
   - `findNearestPointOnPath` uses cumulative horizontal distance for `progressFraction`, guards zero-length segments, avoids non-null assertions under `noUncheckedIndexedAccess`, and exposes `segmentIndex`, `t`, and `nearestVertexIndex`.


---

## 4. Pass 2 Exam-Checker Audit & Applied Fixes (`grok-4.7-high`)

`grok-4.7-high` audited the written `src/terrain3d/coordBridge.ts` line-by-line against hard benchmarks (`task-817`):
- **Passed cleanly:** `isJezeroHiriseBundle`, `frameForBundle`, `localToVr2ForBundle`, `vr2ToLocalForBundle`, `localToSceneXYZForBundle`, `sceneXYZToLocal` (`0`/`-0`/`NaN`/`±Infinity`), zero `three` imports, `sampleElevationBilinear` boundary/NaN behavior, 7 distinct Jezero POIs (`threeforks` vs `poi-p5`), empty/1-point finite paths, `Infinity` slope -> `'excluded-cell'`, CTX ~19×20 m helpers.
- **Concrete defects caught & fixed immediately:**
  1. `threeforks` summary falsely claimed sample tubes were deposited there instead of `poi-p5` (41.5 m away) — updated `threeforks` caption to clarify tubes belong to `poi-p5`.
  2. `activePathCells` could waive corridor deviation on a stale/switched polyline within the same `bundleVersion` — added `deviation_m <= Math.hypot(grid.cellSizeEast_m, grid.cellSizeNorth_m)` verification before waiving, and changed empty `activePath` `nearestPathIndex` to `-1`.
  3. Non-finite coordinates in a 1-point or multi-point path could produce `NaN` distance (`NaN > threshold === false` fail-open) — guarded finite coordinates in `findNearestPointOnPath`, `!Number.isFinite(deviation_m)` in `checkCorridorSafety`, `!Number.isFinite(sample.horizontalDistance_m)` in `findClosestRejectedPath`, non-finite/non-positive cell sizes in `defaultCorridorThresholdForGrid` / `defaultArrivalRadiusForGrid`, and rejected `0` / non-finite `verticalExaggeration` in `localToSceneXYZ`.
- **Plan updated (`docs/MERGE_PLAN.md` §3.3):** Updated documented signatures to match `CoordBundleRef`, 7 POIs, `defaultCorridorThresholdForGrid`, and `defaultArrivalRadiusForGrid`.
