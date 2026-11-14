# Routing Core Assembly, Benchmark & Handoff Report (T40)

## 1. Repository & Branch Status

- **Base Branch:** `codex/routing-base`
- **Pre-T40 Merged Base Commit (T01–T39):** `a40c50b` (`38` task branches `codex/routing-t02-*` through `codex/routing-t39-*` merged cleanly with zero unresolved conflicts; pre-T40 suite: `39/39` test files, `143/143` tests)
- **Assembly Branch:** `codex/routing-t40-assembly-benchmark`
- **Frozen Contracts Preserved:** `src/contracts/routing.ts` and `src/routing/types.ts` (T01) remain unmodified.

## 2. T40 Deliverables

1. `src/routing/index.ts` — Explicit collision-free public exports across T01–T30 modules plus assembled factory functions:
   - `createDefaultCellAdmissibility`
   - `createDefaultEdgeEvaluator`
   - `createDefaultEngineDependencies`
   - `createDefaultRoutingEngine`
   - `createDefaultWorkerMessageHandler`
   - `createDefaultRoutePlannerClient`
2. `tests/fixtures/routingFixtures.ts` — Unified, collision-free barrel re-exporting all 12 canonical fixtures (`F01`–`F12`) and fixture helpers.
3. `tests/routing/t40-benchmark-and-assembly.test.ts` — End-to-end integration test suite (`11` tests) verifying `createDefaultRoutingEngine()` (and worker/client wiring) against `F01`–`F12`, the 5-part Dijkstra oracle protocol, and the `200 x 200` Western Jezero synthetic laptop benchmark.
4. `docs/routing-handoff-report.md` — This verification and team handoff report.

## 3. End-to-End Integration & Conformance Verification

Executed inside `mars-t40-assembly-benchmark` via:

```powershell
npm run typecheck   # tsc --noEmit -> exit code 0
npm test            # vitest run -> exit code 0
```

- **Test Files:** `40 passed (40)`
- **Tests:** `154 passed (154)` (`t40-benchmark-and-assembly.test.ts`: `11 passed` in `5249 ms`; full Vitest run duration `6.87 s`)
- **Verified Integration Scope (`t40-benchmark-and-assembly.test.ts`):**
  - Full `F01`–`F12` cross-module verification through the assembled `RoutingEngine` (`createDefaultRoutingEngine()`) and headless worker/client path.
  - All 5 Dijkstra oracle protocol checks verified across fixture scenarios:
    1. Route `status` match between A* and Dijkstra
    2. `verifyPathAdmissibility` checks pass on produced paths
    3. Objective equivalence: `|C_eff(A*) - C_eff(Dijkstra)| <= 1e-7`
    4. Search-space efficiency: `exploredNodes(A*) <= exploredNodes(Dijkstra)`
    5. Strict binary-heap ordering / transitivity
  - Fixture behavioral invariants verified end-to-end:
    - `F08`: Genuine 3-way policy split (`fastest`, `safest`, `balanced`)
    - `F09`: Uniform quality override (`uniformQualityOverride = true`) vs unshifted `uncertainty` bounds (`0.75..1.0`, `gamma = 2`) and `ACCEPTABLE` mode handling
    - `F10`: Elevation spike support mask and `strict` vs `prefer` quality mode route split
    - `F11`: Rectangular grid cell geometry (`cellWidthMeters !== cellHeightMeters`)
    - `F12`: Boundary point clamping (`(0,0)` / `(50,50)`), rover profiles, request cancellation / cooperative yield, and 3D quad elevation draping

## 4. Laptop Synthetic Benchmark (`200 x 200` Western Jezero)

Measured live via `performance.now()` in `tests/routing/t40-benchmark-and-assembly.test.ts` on the actual integrated `createDefaultRoutingEngine()` path across `20` representative 3-policy queries (`short`, `diagonal`, `three_way_split`, `unreachable_basin`):

| Metric | Measured Value | Notes |
| --- | --- | --- |
| Node.js Runtime | `v24.16.0` | `win32/x64` |
| Grid Size | `200 x 200` (`40,000` cells) | `2` connected components |
| Representative Query Set | `20` queries x 3 policies | `threeWaySplitObserved = 5` |
| `bundleLoadMs` | `1.112 ms` | Grid bundle setup |
| `componentInitMs` | `285.914 ms` | Lazy/initial component pass |
| `coldFirstQueryMs` | `365.855 ms` | Cold first 3-policy query (incl. init) |
| `medianSolveMs` | `34.088 ms` | Median 3-policy solve latency |
| `p95SolveMs` | `247.154 ms` | 95th percentile 3-policy solve latency |
| `worstSolveMs` | `298.189 ms` | Maximum 3-policy solve latency |
| Category Median — `short` | `8.166 ms` | Short local traverses |
| Category Median — `diagonal` | `181.978 ms` | Long cross-grid traverses |
| Category Median — `three_way_split` | `59.958 ms` | Genuine 3-policy divergence |
| Category Median — `unreachable_basin` | `6.988 ms` | Early disconnect / failure rejection |

## 5. Gate G0–G6 Status & Team Handoff Checklist

| Gate | Target | Exit Criteria | Handoff Status & Next Owner Action |
| --- | --- | --- | --- |
| **G0: Contract Freeze** | First 45 minutes | Shared coordinate, bundle, route, and ownership agreement | **Verified** in routing core (`src/contracts/routing.ts`, `src/routing/types.ts`). |
| **G1: Data Viability** | By hour 2 | Real raster inspected; crop chosen; fine/coarse decision recorded | **Ready for Open Role A (Data/GIS):** Export real Jezero crater raster bundle matching `GridBundle` (`F01`–`F12` schema + `localMetersToGridPoint` coordinates). |
| **G2: Walking Skeleton** | By hour 5 | UI request reaches worker and returns a path on accepted data | **Ready for Dhani & Open Role C:** Wire Web Worker / client via `createDefaultWorkerMessageHandler` and `createDefaultRoutePlannerClient` (or `createDefaultRoutingEngine` in headless tests). |
| **G3: Complete Journey** | By hour 10 | Map, comparison, 3D, and briefing share one route | **Ready for Dhani & Open Role B (3D Terrain/Exploration):** Consume `RouteResult` paths, metrics, explanations, and draped 3D quad polyline coordinates from unified engine responses. |
| **G4: Scientific Review** | By hour 13 | Quality semantics, citations, limitations, and metrics reviewed | **Routing Semantics Verified:** Slope (`Horn`), roughness, elevation support mask, `strict`/`prefer`/`acceptable` quality modes, `uniformQualityOverride`, and uncertainty penalties match T04–T26 & F01–F12 specs. |
| **G5: Release Candidate** | By hour 16 | Public build, local package, regression checks, recorded demo | **Ready for Open Role C (Integration/QA/Delivery):** Include `npm run typecheck && npm test` (40/40 suites, including `T40`) in final integration & release regression checks. |
| **G6: Submission** | Before local/global cutoff | Public links verified and submission confirmation retained | **Pending final app assembly & submission** after Roles A, B, C, and Dhani integrate UI/data layers on top of `codex/routing-base`. |

### Role-Specific Integration Notes

- **Dhani (Core App & UI State):** Import exclusively from `src/routing/index.ts`. Use `createDefaultRoutePlannerClient` + `createDefaultWorkerMessageHandler` in the browser worker pipeline; cancellation and cooperative yielding are integrated end-to-end.
- **Open Role A (Data / GIS Pipeline):** Ensure DEM/DTM bundles supply valid grid dimensions, `cellWidthMeters` / `cellHeightMeters` (non-square rectangular grids verified in `F11`), nodata/quality masks, and boundary coordinates aligned with `src/coordinates/grid.ts`.
- **Open Role B (3D Terrain & Exploration):** Render the 3D quad-draped path output produced by `draping3d.ts` (verified on steep terrain and seam transitions in `T23` and `T39`/`T40`) and keep policy toggle comparisons synchronized to a single `RoutePlanResult`.
- **Open Role C (Integration / QA / Delivery):** Import shared test fixtures from `tests/fixtures/routingFixtures.ts` for app-level regression tests and verify production worker bundling alongside `npm run typecheck && npm test`.
