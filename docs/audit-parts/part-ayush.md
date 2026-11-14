# Audit Report — Ayush (Routing Algorithm Deliverable)

**Scope & Sources Audited:** `algorithm/docs/*.md`, `algorithm/src/contracts/routing.ts`, `algorithm/src/coordinates/grid.ts`, `algorithm/src/routing/*`, `algorithm/tests/**/*`, root `src/routing/index.ts`, `src/routing/placeholderEngine.ts`, `src/contracts/*`, `src/worker/handler.ts`, `src/sim/invariants.ts`, `docs/SIMULATION-FOR-AYUSH.md`, and `INTERFACE.md`.

---

## 1. Original Goal

From [algorithm/docs/team-tasks.md](../../algorithm/docs/team-tasks.md), [algorithm/docs/project-plan.md](../../algorithm/docs/project-plan.md), [INTERFACE.md](../../INTERFACE.md), and [docs/SIMULATION-FOR-AYUSH.md](../SIMULATION-FOR-AYUSH.md):

- Deliver a deterministic, browser-runnable TypeScript routing engine running inside a Web Worker over a north-up, row-major Mars region grid with cell-center coordinates and explicit rectangular (`dx !== dy`) cell support.
- Enforce hard admissibility before cost calculation: out-of-bounds, NoData/non-finite elevation (while allowing valid negative Martian elevations), `INTERPOLATED`/unreliable source quality, unsupported derivative neighborhoods, explicit exclusions, configurable terrain slope and along-edge grade limits (`educational-eva-v1`: `20°` max terrain slope, `20°` max route grade, `0.5 m` roughness scale, `0.5 m/s` nominal speed), diagonal no-corner-cutting, and optional strict quality exclusion (`strictQuality` / `qualityMode: 'strict'`).
- Implement 8-neighbor A* with an indexed binary min-heap, flat TypedArray workspace, admissible/consistent 2D Euclidean heuristic, deterministic tie-breaking, bounded predecessor reconstruction, and a standalone Dijkstra reference oracle for automated verification.
- Compute 3 routing policies (`shortest`, `terrain`, `uncertainty` / `shortest-feasible`, `terrain-aware`, `uncertainty-aware`), deduplicate identical cell paths, compute physical/elevation/length-weighted quality metrics and RLE intervals, support explicit round-trip return legs (`round-trip-complete` vs `round-trip-incomplete`), generate template-based factual explanations, handle uniform-quality datasets honestly, and integrate into root `src/routing/index.ts` (`solveRoute`, `MODEL_VERSION`) satisfying `src/sim/invariants.ts` and `INTERFACE.md`.

---

## 2. Actually Built (Exact Files & Exports)

All deliverables reside in the standalone sub-package `algorithm/` (`mars-pathfinder-routing@0.1.0`):

### Contracts & Coordinates
- [algorithm/src/contracts/routing.ts](../../algorithm/src/contracts/routing.ts): Exports `QUALITY_CODE`, `SOURCE_FOM_CODE`, and types (`PolicyId`, `QualityMode`, `QualityClass`, `QualityCode`, `SourceFomCode`, `ExclusionReasonCode`, `LocalMeterPoint`, `NormalizedGridPoint`, `ConstraintProfileId`, `ConstraintProfile`, `PolicyWeightVector`, `EffectivePolicyWeights`, `RegionRoutingBundle`, `RouteRequest`, `ElevationProfilePoint`, `QualityExposureInterval`, `RouteMetrics`, `Draped3DPoint`, `RouteExplanation`, `ReturnLegResult`, `RouteCandidate`, `EquivalenceTopology`, `RouteResponse`).
- [algorithm/src/coordinates/grid.ts](../../algorithm/src/coordinates/grid.ts): Exports `rowColToIndex`, `indexToRowCol`, `cellCenterToLocalMeters`, `localMetersToGridPoint`, `stepPlanarDistanceM`.

### Routing Modules (`algorithm/src/routing/`)
- [algorithm/src/routing/index.ts](../../algorithm/src/routing/index.ts): Barrel re-exporting T01–T30 symbols, T40 default assembly factories (`createDefaultCellAdmissibility`, `createDefaultEdgeEvaluator`, `createDefaultEngineDependencies`, `createDefaultRoutingEngine`, `createDefaultWorkerMessageHandler`, `createDefaultRoutePlannerClient`), and the root-contract adapter (`marspineappleAdapter.ts`).
- [algorithm/src/routing/types.ts](../../algorithm/src/routing/types.ts): `DIR_COUNT`, `DIR_DR`, `DIR_DC`, `DIR_IS_DIAG`, `NOMINAL_POLICY_WEIGHTS`, `QUALITY_PENALTY_BY_CODE`, `SolverWorkspacePort`, `CellAdmissibilityPort`, `EdgeEvaluatorPort`, `SinglePolicySolveResult`.
- [algorithm/src/routing/bundleValidator.ts](../../algorithm/src/routing/bundleValidator.ts): `validateRegionBundle`, `validateRequestAgainstBundle`, `BundleValidationOutcome`.
- [algorithm/src/routing/profiles.ts](../../algorithm/src/routing/profiles.ts): `DEFAULT_PROFILE_ID`, `CONSTRAINT_PROFILES` (`educational-eva-v1`, `conservative-15deg`, `relaxed-25deg`), `resolveConstraintProfile`, `isProfileDirectionallySymmetric`.
- [algorithm/src/routing/qualityMapping.ts](../../algorithm/src/routing/qualityMapping.ts): `QUALITY_MAPPING_VERSION`, `mapSourceFomToQualityCode`, `decodeFomGridToQualityCode`, `qualityCodeToClass`, `qualityCodeToPenaltyU`.
- [algorithm/src/routing/elevationSupport.ts](../../algorithm/src/routing/elevationSupport.ts): `isValidElevationSample`, `buildElevationSupportMask`, `createMaskedElevationGrid`, `bilinearResampleSupportedOnly`.
- [algorithm/src/routing/hornSlope.ts](../../algorithm/src/routing/hornSlope.ts): `computeHornSlopeGrid`, `cropHaloDerivativeGrid`.
- [algorithm/src/routing/roughness.ts](../../algorithm/src/routing/roughness.ts): `computePlaneFitRoughnessGrid`.
- [algorithm/src/routing/cellAdmissibility.ts](../../algorithm/src/routing/cellAdmissibility.ts): `getCellExclusionReason`, `isCellAdmissible`.
- [algorithm/src/routing/endpoints.ts](../../algorithm/src/routing/endpoints.ts): `normalizeAndValidateEndpoints`, `EndpointValidationResult`.
- [algorithm/src/routing/edgeAdmissibility.ts](../../algorithm/src/routing/edgeAdmissibility.ts): `isEdgeAdmissible`.
- [algorithm/src/routing/effectiveWeights.ts](../../algorithm/src/routing/effectiveWeights.ts): `resolveEffectivePolicyWeights`, `EffectivePolicyWeightsResult`.
- [algorithm/src/routing/edgeCost.ts](../../algorithm/src/routing/edgeCost.ts): `computeEdgePenalties`, `computeEdgeCost`, `EdgePenalties`.
- [algorithm/src/routing/workspace.ts](../../algorithm/src/routing/workspace.ts): `SolverWorkspace`.
- [algorithm/src/routing/binaryHeap.ts](../../algorithm/src/routing/binaryHeap.ts): `BinaryMinHeap`, `hasHigherPriority`.
- [algorithm/src/routing/components.ts](../../algorithm/src/routing/components.ts): `computeConnectedComponentsAndAdjMask`, `areCellsInSameComponent`.
- [algorithm/src/routing/astar.ts](../../algorithm/src/routing/astar.ts): `solveAStar`, `SolveAStarParams`.
- [algorithm/src/routing/dijkstra.ts](../../algorithm/src/routing/dijkstra.ts): `solveDijkstra`.
- [algorithm/src/routing/pathAudit.ts](../../algorithm/src/routing/pathAudit.ts): `verifyPathAdmissibility`, `assertAStarMatchesDijkstra`.
- [algorithm/src/routing/metricsDistance.ts](../../algorithm/src/routing/metricsDistance.ts): `computeDistanceAndTimeMetrics`, `DistanceAndTimeMetrics`.
- [algorithm/src/routing/metricsElevation.ts](../../algorithm/src/routing/metricsElevation.ts): `computeElevationAndSlopeMetrics`, `ElevationAndSlopeMetrics`.
- [algorithm/src/routing/metricsQuality.ts](../../algorithm/src/routing/metricsQuality.ts): `computeQualityExposureMetrics`, `QualityExposureMetrics`.
- [algorithm/src/routing/draping3d.ts](../../algorithm/src/routing/draping3d.ts): `buildDraped3DRoutePolyline`, `Draped3DRouteOptions`, `MeshQuadDiagonalSplit`.
- [algorithm/src/routing/deduplicate.ts](../../algorithm/src/routing/deduplicate.ts): `areCellPathsIdentical`, `deduplicatePolicyPaths`, `DeduplicatedPolicyGroup`, `DeduplicationResult`.
- [algorithm/src/routing/returnLeg.ts](../../algorithm/src/routing/returnLeg.ts): `buildReturnLeg`, `BuildReturnLegParams`.
- [algorithm/src/routing/explanations.ts](../../algorithm/src/routing/explanations.ts): `buildCandidateExplanations`, `formatDistanceDelta`, `formatTerrainDelta`, `formatQualityDelta`, `BuildCandidateExplanationsParams`.
- [algorithm/src/routing/mutex.ts](../../algorithm/src/routing/mutex.ts): `AsyncWorkspaceMutex`, `createYieldChannel`, `createUnifiedDeadline`, `MutexTaskContext`, `UnifiedDeadline`.
- [algorithm/src/routing/engine.ts](../../algorithm/src/routing/engine.ts): `RoutingEngine` and port/metric types.
- [algorithm/src/routing/route.worker.ts](../../algorithm/src/routing/route.worker.ts): `createWorkerMessageHandler`, `WorkerInboundMessage`, `WorkerOutboundMessage`, `WorkerEnginePort`.
- [algorithm/src/routing/routeClient.ts](../../algorithm/src/routing/routeClient.ts): `RoutePlannerClient` and client message/option types.
- [algorithm/src/routing/marspineappleAdapter.ts](../../algorithm/src/routing/marspineappleAdapter.ts): Drop-in root-contract adapter exporting `MODEL_VERSION` (`'eva-astar-1.0.0'`), `solveRoute`, `ROUTE_POLICIES_ORDER`, `MAP_MARSPINEAPPLE_QUALITY_TO_INTERNAL`, `MAP_INTERNAL_QUALITY_TO_MARSPINEAPPLE`, and `Mars*` mirror types (`MarsRoutingGrid`, `MarsRouteRequest`, `MarsRouteFinalResponse`, etc.).

### Docs & Test Suite
- `algorithm/docs/*.md`: 11 design, math, worker, admissibility, efficiency, metrics, verification, and handoff docs (`routing-handoff-report.md` etc.).
- `algorithm/tests/fixtures/`: 12 canonical fixtures (`F01`–`F12`) unified in `routingFixtures.ts`.
- `algorithm/tests/routing/`: 40 Vitest files (`t01`–`t40`).

---

## 3. Interfaces / Contracts

Ayush built **two** interface layers inside `algorithm/`:

1. **Standalone `RoutingEngine` Contract (`algorithm/src/contracts/routing.ts`, `route.worker.ts`, `routeClient.ts`):**
   - Inputs: `RegionRoutingBundle` (`elevationM`, `terrainSlopeDeg`, `roughnessNormalized`, `qualityCode` `0..3` where `0=ACCEPTABLE, 1=UNKNOWN, 2=LOW, 3=INVALID`) + `RouteRequest` (`regionId`, `datasetVersion`, `start/destination: { eastM, northM }`, `policies: ('shortest' | 'terrain' | 'uncertainty')[]`, `qualityMode: 'prefer' | 'strict'`, `profileId`, `returnToStart`, `timeoutMs`).
   - Outputs: `RouteResponse` (`status: 'success' | 'no_path' | 'invalid_input' | 'cancelled' | 'timeout' | 'data_error'`) with `effectiveWeights`, `equivalenceTopology`, `draped3DPolyline`, `estimatedTimeS`, `gradeAdjustedTimeS`, `exploredNodes`, and structured `RouteExplanation`.
   - Worker protocol: `LOAD_BUNDLE | PLAN_ROUTE | CANCEL_REQUEST` -> `BUNDLE_LOADED | ROUTE_RESULT` via structured clone (no buffer detachment).

2. **Root-Compatible Adapter (`algorithm/src/routing/marspineappleAdapter.ts`):**
   - Exports `MODEL_VERSION = 'eva-astar-1.0.0'` and `solveRoute(grid: MarsRoutingGrid | null, req: MarsRouteRequest, hooks?: MarsSolveHooks): MarsRouteFinalResponse`.
   - Maps root `quality` codes (`0=NO_ELEVATION, 1=GOOD, 2=LOW, 3=UNKNOWN`) to internal `QUALITY_CODE` (`[3, 0, 2, 1]`) and back (`[1, 3, 2, 0]`).
   - Uses root `RoutePolicyId` (`'shortest-feasible' | 'terrain-aware' | 'uncertainty-aware'`), `strictQuality: boolean`, `roundTrip: boolean`, `weightOverrides`, `LocalPoint { east_m, north_m }`, and `status: 'success' | 'no-path' | 'invalid-input' | 'cancelled' | 'timeout' | 'data-error'`.

---

## 4. Feature List

- **Grid & Derivatives:** Rectangular cell support (`dx !== dy`), Horn (1981) 3×3 terrain slope (`hornSlope.ts`), 3×3 plane-fit RMS roughness (`roughness.ts`), and elevation-support masking before derivatives/resampling (`elevationSupport.ts`).
- **Admissibility & Exclusions:** 7-priority cell exclusion checks (`getCellExclusionReason`), diagonal no-corner-cutting (`isEdgeAdmissible`), symmetric and directional grade checks (`maxRouteGradeDeg`, optional `maxUphillGradeDeg`/`maxDownhillGradeDeg`), strict quality mode, and `INTERPOLATED` rejection before same-cell shortcut (`F05B`).
- **Search & Optimality:** Pre-allocated `SolverWorkspace` with $O(1)$ generation-stamp reset (`seenStamp`/`closedStamp`), indexed `BinaryMinHeap` with strict IEEE-754 4-tuple lexicographic total order (`fScore`, `gScore`, `crossScore`, `cellIndex` — zero $\epsilon$-window cycles), consistent 2D Euclidean heuristic, bounded cycle/broken-parent detection, lazy $O(N)$ connected-component labeling + 8-bit `adjMask` (`components.ts`), standalone `solveDijkstra` oracle, and `verifyPathAdmissibility` / `assertAStarMatchesDijkstra`.
- **Cost Model & Policies:** `cost(u,v) = d(u,v) * (1 + alpha*S + beta*R + gamma_eff*U)` with nominal weights `(0,0,0)` (`shortest`), `(2,1,0)` (`terrain`), `(2,1,2)` (`uncertainty`), quality penalties `{ACCEPTABLE: 0, UNKNOWN: 0.75, LOW: 1.0}`, conservative corner-aware quality (`max(u, v, w1, w2)` on diagonals), and uniform-quality effective override ($\gamma_{\text{eff}} = 0$ when $U_{\max} = U_{\min}$ across admissible cells).
- **Post-Processing & Execution:** Path deduplication across policies, `buildReturnLeg` (path reversal when symmetric/admissible, A* fallback if asymmetric, explicit `incomplete_round_trip` on failure), `buildDraped3DRoutePolyline` (saddle-quad midpoint subdivision), deterministic signed-delta explanations, and `AsyncWorkspaceMutex` + `MessageChannel` cooperative yield + `RoutePlannerClient`.

---

## 5. Gaps / Conflicts vs Root & Other Roles

1. **Root App Still Uses `placeholderEngine.ts` (Not Integrated):**
   - Root [src/routing/index.ts](../../src/routing/index.ts) still exports `solveRoute` and `PLACEHOLDER_MODEL_VERSION as MODEL_VERSION` (`'placeholder-astar-0.2.0'`) from [src/routing/placeholderEngine.ts](../../src/routing/placeholderEngine.ts).
   - Consequently, [src/config.ts](../../src/config.ts), [src/worker/handler.ts](../../src/worker/handler.ts), and `src/sim/engine.ts` still run the unvalidated placeholder (`maxTerrainSlope_deg: 25`, `LOW: 0.5, UNKNOWN: 1.0`, `DEFAULT_WEIGHTS` `terrain: 1/1/0`, `uncertainty: 0.5/0.5/2`). Ayush's `algorithm/` package is currently isolated from the root Vite app and root `npm test` / `npm run sim`.

2. **Contract & Worker Protocol Divergence (`algorithm/` Core vs Root `src/contracts/`):**
   - `algorithm/src/contracts/routing.ts` and `route.worker.ts` / `routeClient.ts` define incompatible field names, status strings (`invalid_input`, `no_path` vs `invalid-input`, `no-path`), coordinate keys (`eastM`/`northM` vs `east_m`/`north_m`), quality code enum values (`0=ACCEPTABLE, 1=UNKNOWN, 2=LOW, 3=INVALID` vs `0=NO_ELEVATION, 1=GOOD, 2=LOW, 3=UNKNOWN`), and worker messages (`LOAD_BUNDLE`/`PLAN_ROUTE` vs `load-bundle`/`route`).
   - `marspineappleAdapter.ts` bridges the root `solveRoute` contract, **but** duplicates A*/metrics/explanation logic instead of delegating to `RoutingEngine`, and is not yet wired into root `src/routing/index.ts`.

3. **Gaps Between `marspineappleAdapter.ts` and `RoutingEngine` (`engine.ts`):**
   - **No connected-component pre-check:** `marspineappleAdapter.ts` does not call `computeConnectedComponentsAndAdjMask`, so unreachable destinations run a full A* flood-fill instead of $O(1)$ basin rejection.
   - **Synchronous execution & unprotected singleton workspace:** `marspineappleAdapter.ts` uses an unguarded module-level `sharedWorkspace` and runs synchronously (checking `hooks.shouldStop` every 512 pops; relying on worker termination in root `src/worker/client.ts` rather than cooperative async yields).
   - **Hardcoded profile & omitted rich fields:** Hardcodes `educational-eva-v1` (no `profileId` or `customProfile` override via root `RouteRequest`), and omits `draped3DPolyline`, `estimatedTimeS`, `gradeAdjustedTimeS`, `effectiveWeights`, and `equivalenceTopology` because root `src/contracts/route.ts` does not declare them.
   - **Subtle algorithmic/explanation differences vs `astar.ts` / `explanations.ts`:** `marspineappleAdapter.ts`'s `runAStar` only updates `parentIndex[v]` on strict `candG < gScore[v]` (missing the `candidateG === gScore[v]` collinearity tie-break in `astar.ts`), and `buildExplanations` omits `lowQualityLength_m` comparison text when `deltaDist > 0` (unlike `formatQualityDelta` in `explanations.ts`).

4. **Coordinate Boundary Semantics Mismatch:**
   - Root [src/contracts/grid.ts](../../src/contracts/grid.ts) (`pointToCell`), [INTERFACE.md](../../INTERFACE.md) §1, [docs/SIMULATION-FOR-AYUSH.md](../SIMULATION-FOR-AYUSH.md), and `marspineappleAdapter.ts` (`pointToMarsCell`) treat the exact east and south outer edges as **outside** the grid and support arbitrary `extent.west_m` / `extent.north_m`.
   - By contrast, [algorithm/src/coordinates/grid.ts](../../algorithm/src/coordinates/grid.ts) (`localMetersToGridPoint`) assumes `[0, width*dx] × [0, height*dy]` and **clamps** points on the exact east (`E = L_E`) and south (`N = 0`) outer edges into `col = width - 1` / `row = height - 1`.

5. **Diagonal Quality Rule Difference vs Root Placeholder:**
   - `algorithm/src/routing/edgeCost.ts`, `metricsQuality.ts`, and `marspineappleAdapter.ts` classify a diagonal edge's quality across all 4 corner-adjacent cells (`u`, `v`, `w1`, `w2`), whereas root `placeholderEngine.ts` only checks `worseQuality(u, v)`.

6. **Missing Search Trace / Wavefront Frames & Runtime Heuristic/Dijkstra Comparison:**
   - **No step-by-step trace / Wavefront frames:** Neither `solveAStar`, `solveDijkstra`, `RoutingEngine`, nor `marspineappleAdapter.ts` records or streams per-step open/closed wavefront frames for UI search animation; only scalar `exploredNodes` (total in `RoutingEngine` or `onProgress(n)` every 512 pops in `marspineappleAdapter.ts`) is exposed.
   - **No runtime Dijkstra / heuristic comparison:** `solveDijkstra` is implemented only as a test oracle (`dijkstra.ts`, `pathAudit.ts`) and cannot be selected or compared alongside A* in `RoutingEngine` or `marspineappleAdapter.ts` (`MarsRouteFinalResponse` does not even carry `exploredNodes`).

---

## 6. Standalone Verification Output

Executed inside `algorithm/` on `2026-11-14`:

```powershell
cd algorithm && npm run typecheck && npm test
```

- **`npm run typecheck` (`tsc --noEmit`):** Exit code `0` (0 errors).
- **`npm test` (`vitest run`):** Exit code `0`
  - **Test Files:** `40 passed (40)`
  - **Tests:** `157 passed (157)` (includes 14 tests in `tests/routing/t40-benchmark-and-assembly.test.ts` including the `solveRoute` `marspineappleAdapter` suite; `t40` total `3742ms`, benchmark test `3568ms`)
  - **Full Duration:** `6.78s` (`transform 4.27s, setup 0ms, collect 6.83s, tests 4.18s, environment 13ms, prepare 12.93s`)

**Exact T40 `200 x 200` (40,000-cell) Western Jezero Synthetic Benchmark Output (`20 x 3-policy queries`):**

```json
{
  "benchmark": "200x200 Western Jezero Synthetic (40,000 cells, 20 x 3-policy queries)",
  "nodeVersion": "v24.16.0",
  "platform": "win32/x64",
  "gridCells": 40000,
  "componentCount": 2,
  "bundleLoadMs": 1.449,
  "componentInitMs": 264.912,
  "coldFirstQueryMs": 370.774,
  "medianSolveMs": 34.24,
  "p95SolveMs": 258.062,
  "worstSolveMs": 336.04,
  "threeWaySplitObserved": 5,
  "categoryMediansMs": {
    "short": 12.77,
    "diagonal": 191.177,
    "three_way_split": 47.272,
    "unreachable_basin": 6.62
  }
}
```
