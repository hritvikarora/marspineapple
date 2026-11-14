# MARS PATHFINDER — Parallel Worktree Implementation Task Plan (`routing-tasks.md`)

- **Owner:** Ayush — *Algorithms, Route Modeling, and Explainable Results* (`src/routing/`, `src/coordinates/`, `src/contracts/`, `tests/fixtures/`, `tests/routing/`)
- **Target Executor Tier:** Gemini **Hydrogen** (Low-Thinking / Fast Worker Subagents)
- **Architecture:** **40 Tasks (`T01`–`T40`)** organized in a **Star-Topology Worktree Graph**:
  - **Task 01 (`T01`)** initializes the Git repository, `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, directory layout, and the **frozen TypeScript contracts & structural port interfaces** (`src/contracts/routing.ts` and `src/routing/types.ts`) on branch `codex/routing-base` (producing commit `BASE_SHA`).
  - **Tasks 02 through 39 (`T02`–`T39`)** are **100% mutually independent**. Every single task `T02`–`T39` branches **directly from `T01` (`BASE_SHA`)** in its own isolated Git worktree, imports **only** from `src/contracts/routing.ts` and `src/routing/types.ts`, and creates **strictly disjoint source and test files**. A worker assigned to `T10` or `T35` never waits for `T09` or `T34` to finish, and merging `T02`–`T39` produces **zero Git merge conflicts**.
  - **Task 40 (`T40`)** is the post-wave barrel assembly and laptop benchmark gate (`src/routing/index.ts`, `tests/fixtures/routingFixtures.ts`, `tests/routing/t40-benchmark-and-assembly.test.ts`), run after `T02`–`T39` are merged into `codex/routing-base`.

---

## 0. Mandatory Rules Every Hydrogen Subagent Must Follow

1. **Star-Topology Worktree Setup (Run First Before Any Code Edits):**
   - For **Task 01 (`T01`)**: Run directly in the main checkout `c:\Users\Ayush\Documents\ChatGPT\mars` on branch `codex/routing-base`, install dependencies once (`npm install`), verify `npx tsc --noEmit` and `npx vitest run`, commit as `T01: Initialize repository, tooling, and frozen routing contracts`, and record the resulting commit hash as `BASE_SHA` (`git rev-parse HEAD`).
   - For **Every Task `T02`–`T39`**: Create a dedicated Git worktree branched directly from `codex/routing-base` (`BASE_SHA`) and junction `node_modules` from the main checkout so you never run `npm install` repeatedly:
     ```powershell
     cd C:\Users\Ayush\Documents\ChatGPT\mars
     git worktree add ..\mars-tXX-<slug> -b codex/routing-tXX-<slug> codex/routing-base
     cd ..\mars-tXX-<slug>
     if (-not (Test-Path .\node_modules)) {
       cmd /c mklink /J node_modules C:\Users\Ayush\Documents\ChatGPT\mars\node_modules
     }
     git log -1 --oneline
     ```
2. **Strict Owned-File Isolation (Zero Merge Conflicts):**
   - You may create or edit **ONLY** the exact files listed under **Owned Files** for your task.
   - **Never** edit `package.json`, `tsconfig.json`, `vitest.config.ts`, `src/contracts/routing.ts`, `src/routing/types.ts`, or any file owned by another task (`T02`–`T39`).
   - If you discover a follow-up needed outside your owned files, document it under `Follow-ups` in your final report; do not touch unowned files.
3. **Zero Cross-Task Runtime Dependencies (`T02`–`T39`):**
   - Inside `T02`–`T39`, import shared types, constants, and structural port interfaces **only** from `../contracts/routing` (or `../../src/contracts/routing`) and `./types` (or `../../src/routing/types`), which already exist in `T01`.
   - Do **not** `import` files created by other parallel tasks (`T02`–`T39`). Where your module collaborates with another stage (for example, `astar.ts` calling an `EdgeEvaluatorPort`, or `engine.ts` calling a `PolicySolverPort`), accept that collaborator through the structural port interface defined in `src/routing/types.ts` and test your module with a deterministic inline port implementation inside your owned `.test.ts` file.
4. **Zero External Runtime NPM Dependencies:**
   - Use only standard TypeScript and built-in ES2022 / Web / Node globals (`Float32Array`, `Float64Array`, `Int32Array`, `Uint32Array`, `Uint8Array`, `Math.*`, `performance.now`, `MessageChannel`, `Worker`). Never install third-party runtime packages.
5. **Exact Mathematical & Scientific Fidelity:**
   - Follow the exact equations, tie-breaking rules, corner-cutting guards, and IEEE-754 floating-point rules given in your task specification and the referenced `docs/*.md` files.
   - Never use an $\epsilon$ tolerance window inside the binary heap or relaxation comparator (use strict `<`, `>`, `!==`); use numerical tolerances (`1e-7` or `1e-4`) **only** inside post-solve test assertions and explanation delta branching.
6. **Mandatory Verification Before Committing:**
   - Every subagent must run and pass both commands from its worktree root before committing:
     ```powershell
     npx tsc --noEmit
     npx vitest run <your-owned-test-file>
     ```
7. **Commit Convention & Final Report:**
   - Create exactly **one commit** on your worktree branch with the message `TXX: <Task Title>`. Do not merge or push to `main`.
   - Your final completion report must list:
     1. Worktree path, branch name, and base commit SHA (`BASE_SHA`)
     2. Owned files created
     3. Exact output of `npx tsc --noEmit` and `npx vitest run <your-owned-test-file>`
     4. Any follow-up notes for `T40` assembly

---

## 1. Canonical Plan & External Research Reference Index

Every task below cites specific sections from our 9 repository specification documents plus primary external scientific/engineering standards:

### 1.1 Internal Specification Documents (`c:\Users\Ayush\Documents\ChatGPT\mars\docs\`)
- **[P1] Project Plan:** [docs/project-plan.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/project-plan.md) — Product scope, spatial contract (*"One Region Definition, One Route Result, Multiple Views"*), 8-neighbor A* policies, and delivery gates `G0`–`G6`.
- **[P2] Team Tasks Brief:** [docs/team-tasks.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/team-tasks.md#L11-L157) — Ayush's 6 core responsibilities (`src/routing/`).
- **[P3] Mathematical Specification:** [docs/maths.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/maths.md) — Complete end-to-end formulas, Stage 0–6 normalization, $3\times 3$ Horn slope, detrended plane-fit roughness, effective-policy rule ($\gamma_{\text{eff}} = 0$ when $U_{\max}=U_{\min}$), 3D saddle-quad diagonal draping, and square vs. rectangular grid digitization bounds.
- **[P4] Admissibility & Cost Model:** [docs/admissibility-and-cost-model.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/admissibility-and-cost-model.md) — Elevation-support mask, FOM source code split (`fom-mapping-v1`), 7-priority `getCellExclusionReason`, diagonal corner-cutting and soft-quality corner rules, and heuristic consistency proof.
- **[P5] Search & Worker Execution:** [docs/search-and-worker-execution.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/search-and-worker-execution.md) — Indexed binary min-heap, strict 4-level lexicographic tie-breaking, lazy connected-component labeling, single-active-owner workspace mutex (`activeTaskEpoch`), and unified request deadline (`t_deadline`).
- **[P6] Metrics, Deduplication & Explanations:** [docs/metrics-and-explanations.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/metrics-and-explanations.md) — Horizontal vs. 3D surface distance, telescoping ascent/descent, RLE quality intervals, policy deduplication, return-leg reversal, and signed-delta explanation clause builders.
- **[P7] Verification Matrix & Fixtures:** [docs/verification-and-handoff.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/verification-and-handoff.md) — Reference Dijkstra protocol and exact hand-computed numbers for Fixtures `F01`–`F12`.
- **[P8] Algorithmic Efficiency & Baseline Discipline:** [docs/efficiency.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/efficiency.md) — TypedArray workspace, generation stamps, clean-path reuse vs. uniform-quality override, and deferred optimizations.
- **[P9] Independent Workflow & Merge Strategy:** [docs/independent-workflow-and-merge-strategy.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/independent-workflow-and-merge-strategy.md) — Module boundaries, zero external runtime dependencies, and adapter isolation.

### 1.2 External Scientific & Engineering References
- **[E1] Horn (1981) $3\times 3$ Weighted Finite-Difference Slope:** B. K. P. Horn, *"Hill shading and the reflectance map,"* Proceedings of the IEEE, 69(1), 14–47 (1981), https://doi.org/10.1109/PROC.1981.11918
- **[E2] Hart, Nilsson & Raphael (1968) A* Optimality & Consistency:** P. E. Hart, N. J. Nilsson, and B. Raphael, *"A Formal Basis for the Heuristic Determination of Minimum Cost Paths,"* IEEE Transactions on Systems Science and Cybernetics, 4(2), 100–107 (1968), https://doi.org/10.1109/TSSC.1968.300136
- **[E3] USGS Astrogeology Mars 2020 Jezero CTX/HiRISE Terrain Products:** https://astrogeology.usgs.gov/search/map/mars_2020_science_investigation_ctx_dem_mosaic
- **[E4] Bae et al. (2023) Mars 2020 Landing Site Bundle (PDS4):** https://doi.org/10.17189/1522933
- **[E5] GDAL Raster Data Model (North-Up Affine GeoTransform & Cell Centers):** https://gdal.org/user/raster_data_model.html
- **[E6] MDN Web Workers & Structured Clone Algorithm (TypedArray Transfer vs. Clone):** https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm

---

## 2. Master 40-Task Worktree & Disjoint File-Ownership Matrix

| Task | Branch (`codex/routing-...`) | Worktree Directory | Prerequisite | Owned Source File(s) | Owned Test File(s) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **T01** | `codex/routing-base` | `..\mars` (main) | None (Root) | `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `src/contracts/routing.ts`, `src/routing/types.ts` | `tests/routing/t01-contracts.test.ts` |
| **T02** | `codex/routing-t02-bundle-validator` | `..\mars-t02-bundle-validator` | **T01 Only** | `src/routing/bundleValidator.ts` | `tests/routing/t02-bundle-validator.test.ts` |
| **T03** | `codex/routing-t03-grid-coords` | `..\mars-t03-grid-coords` | **T01 Only** | `src/coordinates/grid.ts` | `tests/routing/t03-grid-coordinates.test.ts` |
| **T04** | `codex/routing-t04-profiles` | `..\mars-t04-profiles` | **T01 Only** | `src/routing/profiles.ts` | `tests/routing/t04-profiles.test.ts` |
| **T05** | `codex/routing-t05-quality-mapping` | `..\mars-t05-quality-mapping` | **T01 Only** | `src/routing/qualityMapping.ts` | `tests/routing/t05-quality-mapping.test.ts` |
| **T06** | `codex/routing-t06-elevation-support` | `..\mars-t06-elevation-support` | **T01 Only** | `src/routing/elevationSupport.ts` | `tests/routing/t06-elevation-support.test.ts` |
| **T07** | `codex/routing-t07-horn-slope` | `..\mars-t07-horn-slope` | **T01 Only** | `src/routing/hornSlope.ts` | `tests/routing/t07-horn-slope.test.ts` |
| **T08** | `codex/routing-t08-roughness` | `..\mars-t08-roughness` | **T01 Only** | `src/routing/roughness.ts` | `tests/routing/t08-roughness.test.ts` |
| **T09** | `codex/routing-t09-cell-admissibility` | `..\mars-t09-cell-admissibility` | **T01 Only** | `src/routing/cellAdmissibility.ts` | `tests/routing/t09-cell-admissibility.test.ts` |
| **T10** | `codex/routing-t10-endpoints` | `..\mars-t10-endpoints` | **T01 Only** | `src/routing/endpoints.ts` | `tests/routing/t10-endpoints.test.ts` |
| **T11** | `codex/routing-t11-edge-admissibility` | `..\mars-t11-edge-admissibility` | **T01 Only** | `src/routing/edgeAdmissibility.ts` | `tests/routing/t11-edge-admissibility.test.ts` |
| **T12** | `codex/routing-t12-effective-weights` | `..\mars-t12-effective-weights` | **T01 Only** | `src/routing/effectiveWeights.ts` | `tests/routing/t12-effective-weights.test.ts` |
| **T13** | `codex/routing-t13-edge-cost` | `..\mars-t13-edge-cost` | **T01 Only** | `src/routing/edgeCost.ts` | `tests/routing/t13-edge-cost.test.ts` |
| **T14** | `codex/routing-t14-workspace` | `..\mars-t14-workspace` | **T01 Only** | `src/routing/workspace.ts` | `tests/routing/t14-workspace.test.ts` |
| **T15** | `codex/routing-t15-binary-heap` | `..\mars-t15-binary-heap` | **T01 Only** | `src/routing/binaryHeap.ts` | `tests/routing/t15-binary-heap.test.ts` |
| **T16** | `codex/routing-t16-components` | `..\mars-t16-components` | **T01 Only** | `src/routing/components.ts` | `tests/routing/t16-components.test.ts` |
| **T17** | `codex/routing-t17-astar` | `..\mars-t17-astar` | **T01 Only** | `src/routing/astar.ts` | `tests/routing/t17-astar.test.ts` |
| **T18** | `codex/routing-t18-dijkstra` | `..\mars-t18-dijkstra` | **T01 Only** | `src/routing/dijkstra.ts` | `tests/routing/t18-dijkstra.test.ts` |
| **T19** | `codex/routing-t19-path-audit` | `..\mars-t19-path-audit` | **T01 Only** | `src/routing/pathAudit.ts` | `tests/routing/t19-path-audit.test.ts` |
| **T20** | `codex/routing-t20-metrics-distance` | `..\mars-t20-metrics-distance` | **T01 Only** | `src/routing/metricsDistance.ts` | `tests/routing/t20-metrics-distance.test.ts` |
| **T21** | `codex/routing-t21-metrics-elevation` | `..\mars-t21-metrics-elevation` | **T01 Only** | `src/routing/metricsElevation.ts` | `tests/routing/t21-metrics-elevation.test.ts` |
| **T22** | `codex/routing-t22-metrics-quality` | `..\mars-t22-metrics-quality` | **T01 Only** | `src/routing/metricsQuality.ts` | `tests/routing/t22-metrics-quality.test.ts` |
| **T23** | `codex/routing-t23-draping-3d` | `..\mars-t23-draping-3d` | **T01 Only** | `src/routing/draping3d.ts` | `tests/routing/t23-draping-3d.test.ts` |
| **T24** | `codex/routing-t24-deduplicate` | `..\mars-t24-deduplicate` | **T01 Only** | `src/routing/deduplicate.ts` | `tests/routing/t24-deduplicate.test.ts` |
| **T25** | `codex/routing-t25-return-leg` | `..\mars-t25-return-leg` | **T01 Only** | `src/routing/returnLeg.ts` | `tests/routing/t25-return-leg.test.ts` |
| **T26** | `codex/routing-t26-explanations` | `..\mars-t26-explanations` | **T01 Only** | `src/routing/explanations.ts` | `tests/routing/t26-explanations.test.ts` |
| **T27** | `codex/routing-t27-mutex` | `..\mars-t27-mutex` | **T01 Only** | `src/routing/mutex.ts` | `tests/routing/t27-mutex.test.ts` |
| **T28** | `codex/routing-t28-engine` | `..\mars-t28-engine` | **T01 Only** | `src/routing/engine.ts` | `tests/routing/t28-engine.test.ts` |
| **T29** | `codex/routing-t29-route-worker` | `..\mars-t29-route-worker` | **T01 Only** | `src/routing/route.worker.ts` | `tests/routing/t29-route-worker.test.ts` |
| **T30** | `codex/routing-t30-route-client` | `..\mars-t30-route-client` | **T01 Only** | `src/routing/routeClient.ts` | `tests/routing/t30-route-client.test.ts` |
| **T31** | `codex/routing-t31-fixtures-f01-f02` | `..\mars-t31-fixtures-f01-f02` | **T01 Only** | `tests/fixtures/f01_f02.ts` | `tests/routing/t31-f01-f02.test.ts` |
| **T32** | `codex/routing-t32-fixtures-f03-f04` | `..\mars-t32-fixtures-f03-f04` | **T01 Only** | `tests/fixtures/f03_f04.ts` | `tests/routing/t32-f03-f04.test.ts` |
| **T33** | `codex/routing-t33-fixtures-f05-f06` | `..\mars-t33-fixtures-f05-f06` | **T01 Only** | `tests/fixtures/f05_f06.ts` | `tests/routing/t33-f05-f06.test.ts` |
| **T34** | `codex/routing-t34-fixture-f07` | `..\mars-t34-fixture-f07` | **T01 Only** | `tests/fixtures/f07.ts` | `tests/routing/t34-f07-derived-ridge.test.ts` |
| **T35** | `codex/routing-t35-fixture-f08` | `..\mars-t35-fixture-f08` | **T01 Only** | `tests/fixtures/f08.ts` | `tests/routing/t35-f08-three-way-split.test.ts` |
| **T36** | `codex/routing-t36-fixture-f09` | `..\mars-t36-fixture-f09` | **T01 Only** | `tests/fixtures/f09.ts` | `tests/routing/t36-f09-uniform-and-mixed-quality.test.ts` |
| **T37** | `codex/routing-t37-fixture-f10` | `..\mars-t37-fixture-f10` | **T01 Only** | `tests/fixtures/f10.ts` | `tests/routing/t37-f10-quality-modes-and-spike-mask.test.ts` |
| **T38** | `codex/routing-t38-fixture-f11` | `..\mars-t38-fixture-f11` | **T01 Only** | `tests/fixtures/f11.ts` | `tests/routing/t38-f11-rectangular-grid.test.ts` |
| **T39** | `codex/routing-t39-fixture-f12` | `..\mars-t39-fixture-f12` | **T01 Only** | `tests/fixtures/f12.ts` | `tests/routing/t39-f12-boundaries-yield-draping.test.ts` |
| **T40** | `codex/routing-t40-assembly-benchmark` | `..\mars-t40-assembly-benchmark` | Post-Merge (`T01`–`T39`) | `src/routing/index.ts`, `tests/fixtures/routingFixtures.ts`, `docs/routing-handoff-report.md` | `tests/routing/t40-benchmark-and-assembly.test.ts` |

---

## 3. Detailed Task Specifications

---

## Wave 0: Foundation & Frozen Contracts (Prerequisite for All Worktrees)

### Task 01 (T01): Repository Initialization, Tooling & Frozen Routing Contracts

- **Prerequisite:** None (Root task executed first on `codex/routing-base`).
- **Worktree / Branch:** Main checkout `c:\Users\Ayush\Documents\ChatGPT\mars` on branch `codex/routing-base`.
- **Owned Files:**
  - `package.json`
  - `tsconfig.json`
  - `vitest.config.ts`
  - `.gitignore`
  - `src/contracts/routing.ts`
  - `src/routing/types.ts`
  - `tests/routing/t01-contracts.test.ts`
- **Plan & Research References:**
  - [docs/project-plan.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/project-plan.md#L179-L335) (Repository layout, Spatial Contract, Route Request/Response contracts)
  - [docs/team-tasks.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/team-tasks.md#L11-L157) (Ayush's contract & versioning rules)
  - [docs/maths.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/maths.md#L1-L265) (Stages 0–6, cost equations, and invariants)
  - [docs/independent-workflow-and-merge-strategy.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/independent-workflow-and-merge-strategy.md#L34-L85) (Single adapter boundary `src/routing/types.ts`)
- **Step-by-Step Implementation Instructions for Hydrogen Model:**
  1. **Create `.gitignore`** ignoring `node_modules/`, `dist/`, `coverage/`, `.env*`, and `*.tsbuildinfo`.
  2. **Create `package.json`** with `"type": "module"`, scripts `"typecheck": "tsc --noEmit"`, `"test": "vitest run"`, and `devDependencies`: `"typescript": "^5.6.3"`, `"vitest": "^2.1.4"`, `"@types/node": "^22.0.0"` (zero runtime `dependencies`).
  3. **Create `tsconfig.json`** targeting `"ES2022"`, `"module": "ESNext"`, `"moduleResolution": "Bundler"`, `"strict": true`, `"noUncheckedIndexedAccess": false`, `"skipLibCheck": true`, `"include": ["src/**/*", "tests/**/*"]`.
  4. **Create `vitest.config.ts`** with `include: ['tests/**/*.test.ts']` and `environment: 'node'`.
  5. **Create `src/contracts/routing.ts`** exporting all frozen public types so every downstream task (`T02`–`T39`) can import them without modification:
     ```ts
     export type PolicyId = 'shortest' | 'terrain' | 'uncertainty';
     export type QualityMode = 'prefer' | 'strict';
     export type QualityClass = 'acceptable' | 'unknown' | 'low' | 'invalid';

     export const QUALITY_CODE = {
       ACCEPTABLE: 0,
       UNKNOWN: 1,
       LOW: 2,
       INVALID: 3,
     } as const;
     export type QualityCode = (typeof QUALITY_CODE)[keyof typeof QUALITY_CODE];

     export const SOURCE_FOM_CODE = {
       NO_DATA: 0,
       ACCEPTABLE: 1,
       LOW_CORRELATION: 2,
       INTERPOLATED: 3,
       EXTRAPOLATED: 4,
       SATURATED: 5,
       MANUALLY_EDITED: 6,
       MISSING_QUALITY_RASTER: 7,
     } as const;
     export type SourceFomCode = (typeof SOURCE_FOM_CODE)[keyof typeof SOURCE_FOM_CODE];

     export type ExclusionReasonCode =
       | 'OUT_OF_BOUNDS'
       | 'NO_DATA'
       | 'INTERPOLATED_OR_UNRELIABLE'
       | 'EXPLICIT_HAZARD_MASK'
       | 'UNSUPPORTED_DERIVATIVE'
       | 'MAX_TERRAIN_SLOPE_EXCEEDED'
       | 'STRICT_QUALITY_EXCLUDED';

     export type LocalMeterPoint = {
       eastM: number;
       northM: number;
     };

     export type NormalizedGridPoint = {
       requestedEastM: number;
       requestedNorthM: number;
       col: number;
       row: number;
       cellIndex: number;
       cellCenterEastM: number;
       cellCenterNorthM: number;
     };

     export type ConstraintProfileId = 'educational-eva-v1' | 'conservative-15deg' | 'relaxed-25deg' | string;

     export type ConstraintProfile = {
       profileId: ConstraintProfileId;
       version: string;
       maxTerrainSlopeDeg: number;
       maxRouteGradeDeg: number;
       maxUphillGradeDeg?: number;
       maxDownhillGradeDeg?: number;
       roughnessScaleM: number;
       nominalWalkingSpeedMps: number;
       gradePenaltyKappa: number;
       isSimulatedAssumption: true;
     };

     export type PolicyWeightVector = {
       alpha: number;
       beta: number;
       gamma: number;
     };

     export type EffectivePolicyWeights = {
       policyId: PolicyId;
       nominal: PolicyWeightVector;
       effective: PolicyWeightVector;
       uniformQualityOverride: boolean;
       minAdmissibleU: number;
       maxAdmissibleU: number;
     };

     export type RegionRoutingBundle = {
       regionId: string;
       datasetVersion: string;
       gridWidth: number;
       gridHeight: number;
       cellSpacingEastM: number;
       cellSpacingNorthM: number;
       noDataSentinel: number;
       roughnessScaleM: number;
       qualityMappingVersion: string;
       elevationM: Float32Array;
       terrainSlopeDeg: Float32Array;
       roughnessNormalized: Float32Array;
       qualityCode: Uint8Array;
       derivativeSupportMask?: Uint8Array;
       explicitExclusionMask?: Uint8Array;
       sourceFomCode?: Uint8Array;
     };

     export type RouteRequest = {
       requestId: string;
       regionId: string;
       datasetVersion: string;
       start: LocalMeterPoint;
       destination: LocalMeterPoint;
       policies: PolicyId[];
       qualityMode: QualityMode;
       profileId?: ConstraintProfileId;
       customProfile?: ConstraintProfile;
       returnToStart?: boolean;
       scienceStopDurationS?: number;
       timeoutMs?: number;
     };

     export type ElevationProfilePoint = {
       sampleIndex: number;
       cellIndex: number;
       row: number;
       col: number;
       eastM: number;
       northM: number;
       distanceM: number;
       surfaceDistanceM: number;
       elevationM: number;
       terrainSlopeDeg: number;
       incomingGradeDeg: number;
       qualityClass: QualityClass;
     };

     export type QualityExposureInterval = {
       qualityClass: 'acceptable' | 'unknown' | 'low';
       startDistanceM: number;
       endDistanceM: number;
       lengthM: number;
       startSampleIndex: number;
       endSampleIndex: number;
     };

     export type RouteMetrics = {
       horizontalDistanceM: number;
       surfaceDistanceM: number;
       cumulativeAscentM: number;
       cumulativeDescentM: number;
       netElevationChangeM: number;
       maxTerrainSlopeDeg: number;
       maxTerrainSlopeAtDistanceM: number;
       maxTerrainSlopeCellIndex: number;
       maxRouteGradeDeg: number;
       maxUphillGradeDeg: number;
       maxDownhillGradeDeg: number;
       maxRouteGradeAtDistanceM: number;
       lowQualityDistanceM: number;
       lowQualityPct: number;
       unknownQualityDistanceM: number;
       unknownQualityPct: number;
       acceptableQualityDistanceM: number;
       acceptableQualityPct: number;
       weightedUncertaintyExposureM: number;
       integratedTerrainPenaltyCostM: number;
       integratedRoughnessPenaltyCostM: number;
       estimatedTimeS: number;
       gradeAdjustedTimeS: number;
       gridSpacingM: { dx: number; dy: number };
       slopeBaselineM: { eastM: number; northM: number };
       elevationProfile: ElevationProfilePoint[];
       qualityIntervals: QualityExposureInterval[];
     };

     export type Draped3DPoint = {
       eastM: number;
       northM: number;
       baseElevationM: number;
       worldY: number;
       isSubdividedMidpoint: boolean;
     };

     export type RouteExplanation = {
       summary: string;
       bullets: string[];
       reasonCodes: string[];
     };

     export type ReturnLegResult = {
       status: 'complete' | 'incomplete_round_trip';
       cellIndices: number[];
       polylineMeters: LocalMeterPoint[];
       metrics?: RouteMetrics;
       failureReason?: string;
     };

     export type RouteCandidate = {
       candidateId: string;
       matchedPolicies: PolicyId[];
       cellIndices: number[];
       polylineMeters: LocalMeterPoint[];
       draped3DPolyline?: Draped3DPoint[];
       totalCost: number;
       exploredNodes: number;
       metrics: RouteMetrics;
       explanation: RouteExplanation;
       returnLeg?: ReturnLegResult;
     };

     export type EquivalenceTopology =
       | 'case_1_all_three_merged'
       | 'case_2_terrain_uncertainty_merged'
       | 'case_3_shortest_terrain_merged'
       | 'case_4_shortest_uncertainty_merged'
       | 'case_5_all_three_distinct'
       | 'subset_request';

     export type RouteResponse =
       | {
           status: 'success';
           requestId: string;
           regionId: string;
           datasetVersion: string;
           profileId: string;
           qualityMode: QualityMode;
           normalizedStart: NormalizedGridPoint;
           normalizedDestination: NormalizedGridPoint;
           effectiveWeights: Record<PolicyId, EffectivePolicyWeights>;
           policyStatuses: Partial<Record<PolicyId, 'success' | 'no_path' | 'timeout' | 'cancelled'>>;
           equivalenceTopology: EquivalenceTopology;
           candidates: RouteCandidate[];
           reasonCodes: string[];
           solveTimeMs: number;
         }
       | {
           status: 'no_path';
           requestId: string;
           regionId: string;
           datasetVersion: string;
           normalizedStart: NormalizedGridPoint;
           normalizedDestination: NormalizedGridPoint;
           reasonCode: 'DISCONNECTED_COMPONENTS' | 'SEARCH_EXHAUSTED' | 'STRICT_QUALITY_BLOCKED';
           message: string;
           solveTimeMs: number;
         }
       | {
           status: 'invalid_input';
           requestId: string;
           endpoint?: 'start' | 'destination' | 'request';
           reasonCode: ExclusionReasonCode | 'EMPTY_POLICIES' | 'INVALID_DIMENSIONS';
           message: string;
         }
       | {
           status: 'cancelled';
           requestId: string;
           message: string;
         }
       | {
           status: 'timeout';
           requestId: string;
           timeoutMs: number;
           completedPolicies: PolicyId[];
           message: string;
         }
       | {
           status: 'data_error';
           requestId: string;
           reasonCode: 'BUNDLE_NOT_LOADED' | 'REGION_MISMATCH' | 'DATASET_VERSION_MISMATCH' | 'ARRAY_LENGTH_MISMATCH' | 'INVALID_GRID_DIMENSIONS';
           message: string;
         };
     ```
  6. **Create `src/routing/types.ts`** re-exporting `src/contracts/routing.ts` and defining the 8-direction lookup tables and structural port interfaces so `T02`–`T39` never need to import one another:
     ```ts
     export * from '../contracts/routing.js';
     import type {
       ConstraintProfile,
       EffectivePolicyWeights,
       ExclusionReasonCode,
       PolicyId,
       QualityCode,
       QualityMode,
       RegionRoutingBundle,
     } from '../contracts/routing.js';

     // 8-Neighbor Direction Tables: 0:N, 1:NE, 2:E, 3:SE, 4:S, 5:SW, 6:W, 7:NW
     export const DIR_COUNT = 8;
     export const DIR_DR = new Int8Array([-1, -1, 0, 1, 1, 1, 0, -1]);
     export const DIR_DC = new Int8Array([0, 1, 1, 1, 0, -1, -1, -1]);
     export const DIR_IS_DIAG = new Uint8Array([0, 1, 0, 1, 0, 1, 0, 1]);

     export const NOMINAL_POLICY_WEIGHTS: Record<PolicyId, { alpha: number; beta: number; gamma: number }> = {
       shortest: { alpha: 0, beta: 0, gamma: 0 },
       terrain: { alpha: 2, beta: 1, gamma: 0 },
       uncertainty: { alpha: 2, beta: 1, gamma: 2 },
     };

     export const QUALITY_PENALTY_BY_CODE: Record<QualityCode, number> = {
       0: 0.0,   // ACCEPTABLE
       1: 0.75,  // UNKNOWN
       2: 1.0,   // LOW
       3: Number.POSITIVE_INFINITY, // INVALID
     };

     export interface SolverWorkspacePort {
       readonly capacity: number;
       currentSearchId: number;
       readonly gScore: Float64Array;
       readonly fScore: Float64Array;
       readonly crossScore: Float64Array;
       readonly parentIndex: Int32Array;
       readonly seenStamp: Uint32Array;
       readonly closedStamp: Uint32Array;
       readonly heapNodes: Int32Array;
       readonly heapPos: Int32Array;
       readonly componentId: Int32Array;
       readonly adjMask: Uint8Array;
       readonly bfsQueue: Int32Array;
       beginSearch(): number;
     }

     export interface CellAdmissibilityPort {
       getCellExclusionReason(
         bundle: RegionRoutingBundle,
         row: number,
         col: number,
         profile: ConstraintProfile,
         qualityMode: QualityMode
       ): ExclusionReasonCode | null;
     }

     export interface EdgeEvaluatorPort {
       isEdgeAdmissible(
         bundle: RegionRoutingBundle,
         uIndex: number,
         vIndex: number,
         dir: number,
         profile: ConstraintProfile,
         qualityMode: QualityMode
       ): boolean;
       computeEdgeCost(
         bundle: RegionRoutingBundle,
         uIndex: number,
         vIndex: number,
         dir: number,
         profile: ConstraintProfile,
         weights: EffectivePolicyWeights['effective']
       ): number;
     }

     export type SinglePolicySolveResult = {
       status: 'success' | 'no_path' | 'timeout' | 'cancelled';
       cellIndices: number[];
       totalCost: number;
       exploredNodes: number;
     };
     ```
  7. **Create `tests/routing/t01-contracts.test.ts`** verifying `DIR_DR`, `DIR_DC`, `DIR_IS_DIAG`, `NOMINAL_POLICY_WEIGHTS`, and `QUALITY_PENALTY_BY_CODE`.
- **Verification Commands:**
  ```powershell
  npm install
  npx tsc --noEmit
  npx vitest run tests/routing/t01-contracts.test.ts
  ```

---

## Wave 1: Grid Coordinates, Validation, Profiles & Preprocessing Mathematics (Depend ONLY on T01)

### Task 02 (T02): Region Bundle Structural & Byte-Length Validator

- **Prerequisite:** `T01` (`codex/routing-base`) ONLY.
- **Worktree / Branch:** `..\mars-t02-bundle-validator` / `codex/routing-t02-bundle-validator`
- **Owned Files:**
  - `src/routing/bundleValidator.ts`
  - `tests/routing/t02-bundle-validator.test.ts`
- **Plan & Research References:**
  - [docs/maths.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/maths.md#L15-L38) (Stages 0–3: Request & Bundle Validation)
  - [docs/team-tasks.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/team-tasks.md#L25-L32) (Bundle dimension, version, and TypedArray length validation)
- **Step-by-Step Implementation Instructions for Hydrogen Model:**
  1. Export `validateRegionBundle(bundle: RegionRoutingBundle | null | undefined, requestId?: string)` returning `{ ok: true, cellCount: number } | { ok: false, error: Extract<RouteResponse, { status: 'data_error' }> }`.
  2. Enforce Stage 0: If `!bundle`, return `status: 'data_error'`, `reasonCode: 'BUNDLE_NOT_LOADED'`.
  3. Enforce Stage 2: Check `Number.isInteger(bundle.gridWidth) && bundle.gridWidth > 0`, `Number.isInteger(bundle.gridHeight) && bundle.gridHeight > 0`, `Number.isFinite(bundle.cellSpacingEastM) && bundle.cellSpacingEastM > 0`, and `Number.isFinite(bundle.cellSpacingNorthM) && bundle.cellSpacingNorthM > 0`. Otherwise return `reasonCode: 'INVALID_GRID_DIMENSIONS'`.
  4. Enforce Stage 3: Compute $N = \text{gridWidth} \times \text{gridHeight}$. Verify `elevationM.length === N`, `terrainSlopeDeg.length === N`, `roughnessNormalized.length === N`, `qualityCode.length === N`, and if optional `derivativeSupportMask`, `explicitExclusionMask`, or `sourceFomCode` are present, verify their `.length === N`. Otherwise return `reasonCode: 'ARRAY_LENGTH_MISMATCH'`.
  5. Export `validateRequestAgainstBundle(request: RouteRequest, bundle: RegionRoutingBundle | null | undefined)` checking `validateRegionBundle` first, then checking `request.regionId === bundle.regionId` (`REGION_MISMATCH`) and `request.datasetVersion === bundle.datasetVersion` (`DATASET_VERSION_MISMATCH`).
- **Unit Tests (`tests/routing/t02-bundle-validator.test.ts`):**
  - Null/undefined bundle returns `BUNDLE_NOT_LOADED`.
  - Non-positive `gridWidth`, `gridHeight`, `cellSpacingEastM`, or `cellSpacingNorthM` returns `INVALID_GRID_DIMENSIONS`.
  - Truncated `elevationM` ($N-1$ elements on a $5\times 5$ grid) returns `ARRAY_LENGTH_MISMATCH`.
  - Mismatched `regionId` or `datasetVersion` returns `REGION_MISMATCH` / `DATASET_VERSION_MISMATCH`.
  - Valid $5 \times 5$ bundle passes with `cellCount === 25`.
- **Verification Commands:**
  ```powershell
  npx tsc --noEmit
  npx vitest run tests/routing/t02-bundle-validator.test.ts
  ```

---

### Task 03 (T03): North-Up Row-Major Coordinate Adapter & Boundary Clamping

- **Prerequisite:** `T01` (`codex/routing-base`) ONLY.
- **Worktree / Branch:** `..\mars-t03-grid-coords` / `codex/routing-t03-grid-coords`
- **Owned Files:**
  - `src/coordinates/grid.ts`
  - `tests/routing/t03-grid-coordinates.test.ts`
- **Plan & Research References:**
  - [docs/maths.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/maths.md#L39-L57) (Stage 4: Local Meter to Row-Major Cell Conversion & Boundary Clamping)
  - [docs/project-plan.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/project-plan.md#L219-L246) (North-up row-major spatial contract: `row = 0` is north, `col = 0` is west, origin `(0, 0)` is southwest corner)
  - External: [GDAL Raster Data Model](https://gdal.org/user/raster_data_model.html)
- **Step-by-Step Implementation Instructions for Hydrogen Model:**
  1. Export pure coordinate helpers supporting arbitrary rectangular spacing $(\Delta x = \text{cellSpacingEastM}, \Delta y = \text{cellSpacingNorthM})$:
     - `rowColToIndex(row: number, col: number, width: number): number` $\to \text{row} \times \text{width} + \text{col}$.
     - `indexToRowCol(index: number, width: number): { row: number; col: number }` $\to \{ \text{row}: \lfloor \text{index} / \text{width} \rfloor, \text{col}: \text{index} \bmod \text{width} \}$.
     - `cellCenterToLocalMeters(row: number, col: number, height: number, dx: number, dy: number): LocalMeterPoint`:
       $$E_c(c) = (c + 0.5) \cdot \Delta x, \qquad N_c(r) = (H - 1 - r + 0.5) \cdot \Delta y$$
     - `localMetersToGridPoint(point: LocalMeterPoint, width: number, height: number, dx: number, dy: number): { ok: true; value: NormalizedGridPoint } | { ok: false; reasonCode: 'OUT_OF_BOUNDS'; message: string }`:
       - Compute $L_E = W \cdot \Delta x$ and $L_N = H \cdot \Delta y$.
       - Reject if `!Number.isFinite(point.eastM) || !Number.isFinite(point.northM) || point.eastM < 0 || point.eastM > L_E || point.northM < 0 || point.northM > L_N` with `reasonCode: 'OUT_OF_BOUNDS'`.
       - Compute clamped indices so exact Northeast border clicks $(E = L_E, N = L_N)$ map cleanly into valid cells rather than overflowing:
         $$c = \min\!\left(W - 1, \; \max\!\left(0, \; \left\lfloor \frac{E}{\Delta x} \right\rfloor\right)\right), \qquad r = \min\!\left(H - 1, \; \max\!\left(0, \; \left\lfloor \frac{L_N - N}{\Delta y} \right\rfloor\right)\right)$$
       - Compute `cellIndex = row * width + col` and `(cellCenterEastM, cellCenterNorthM)`.
     - `stepPlanarDistanceM(dir: number, dx: number, dy: number): number`:
       - Returns $\Delta y$ for N/S (`dir === 0 || dir === 4`), $\Delta x$ for E/W (`dir === 2 || dir === 6`), and $\sqrt{\Delta x^2 + \Delta y^2}$ (`Math.hypot(dx, dy)`) for diagonals (`dir === 1, 3, 5, 7`).
- **Unit Tests (`tests/routing/t03-grid-coordinates.test.ts`):**
  - Southwest corner $(0, 0)$ on a $5 \times 5$ grid ($\Delta x = \Delta y = 5\text{ m}$) maps to $(r=4, c=0, k=20)$ with center $(2.5\text{ m}, 2.5\text{ m})$.
  - Exact Northeast border $(25.0\text{ m}, 25.0\text{ m})$ clamps to $(r=0, c=4, k=4)$ with center $(22.5\text{ m}, 22.5\text{ m})$.
  - Rectangular grid ($W=4, H=4, \Delta x = 20\text{ m}, \Delta y = 5\text{ m}$): diagonal step length is $\sqrt{425} \approx 20.61552813\text{ m}$.
  - Out-of-bounds $(-0.001, 10)$, $(25.001, 10)$, and `NaN` return `ok: false, reasonCode: 'OUT_OF_BOUNDS'`.
- **Verification Commands:**
  ```powershell
  npx tsc --noEmit
  npx vitest run tests/routing/t03-grid-coordinates.test.ts
  ```

---

### Task 04 (T04): EVA Constraint Profiles Registry & Sensitivity Presets

- **Prerequisite:** `T01` (`codex/routing-base`) ONLY.
- **Worktree / Branch:** `..\mars-t04-profiles` / `codex/routing-t04-profiles`
- **Owned Files:**
  - `src/routing/profiles.ts`
  - `tests/routing/t04-profiles.test.ts`
- **Plan & Research References:**
  - [docs/admissibility-and-cost-model.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/admissibility-and-cost-model.md#L50-L74) ($20^\circ$ educational profile vs. $15^\circ$ and $25^\circ$ sensitivity presets, baseline dependence, symmetric grade choice)
  - [docs/metrics-and-explanations.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/metrics-and-explanations.md#L9-L22) ($0.50\text{ m/s}$ simulator constant and $\kappa_{\text{grade}} = 1.5$)
- **Step-by-Step Implementation Instructions for Hydrogen Model:**
  1. Export `DEFAULT_PROFILE_ID = 'educational-eva-v1'`.
  2. Export `CONSTRAINT_PROFILES: Record<string, ConstraintProfile>` containing:
     - `'educational-eva-v1'`: `maxTerrainSlopeDeg: 20`, `maxRouteGradeDeg: 20`, `roughnessScaleM: 0.5`, `nominalWalkingSpeedMps: 0.5`, `gradePenaltyKappa: 1.5`, `version: '1.0.0'`, `isSimulatedAssumption: true`.
     - `'conservative-15deg'`: `maxTerrainSlopeDeg: 15`, `maxRouteGradeDeg: 15`, `roughnessScaleM: 0.5`, `nominalWalkingSpeedMps: 0.5`, `gradePenaltyKappa: 1.5`, `version: '1.0.0'`, `isSimulatedAssumption: true`.
     - `'relaxed-25deg'`: `maxTerrainSlopeDeg: 25`, `maxRouteGradeDeg: 25`, `roughnessScaleM: 0.5`, `nominalWalkingSpeedMps: 0.5`, `gradePenaltyKappa: 1.5`, `version: '1.0.0'`, `isSimulatedAssumption: true`.
  3. Export `resolveConstraintProfile(profileId?: string, customProfile?: ConstraintProfile): ConstraintProfile` validating that `0 < maxTerrainSlopeDeg < 89`, `0 < maxRouteGradeDeg < 89`, `roughnessScaleM > 0`, and `nominalWalkingSpeedMps > 0`.
  4. Export `isProfileDirectionallySymmetric(profile: ConstraintProfile): boolean` returning `true` when `maxUphillGradeDeg` and `maxDownhillGradeDeg` are either both undefined or equal to `maxRouteGradeDeg`.
- **Unit Tests (`tests/routing/t04-profiles.test.ts`):**
  - Verifies default resolution to `'educational-eva-v1'` ($20^\circ$ slope/grade, $0.50\text{ m/s}$, `isSimulatedAssumption === true`).
  - Verifies `'conservative-15deg'` and `'relaxed-25deg'` presets.
  - Verifies symmetric vs. asymmetric uphill/downhill profile detection.
- **Verification Commands:**
  ```powershell
  npx tsc --noEmit
  npx vitest run tests/routing/t04-profiles.test.ts
  ```

---

### Task 05 (T05): Source FOM Observation-Quality Decoder & Versioned Mapping Table

- **Prerequisite:** `T01` (`codex/routing-base`) ONLY.
- **Worktree / Branch:** `..\mars-t05-quality-mapping` / `codex/routing-t05-quality-mapping`
- **Owned Files:**
  - `src/routing/qualityMapping.ts`
  - `tests/routing/t05-quality-mapping.test.ts`
- **Plan & Research References:**
  - [docs/admissibility-and-cost-model.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/admissibility-and-cost-model.md#L17-L49) (Section 1.2: Separating Hard-Excluded Source Codes from Soft Penalties, `fom-mapping-v1`)
  - [docs/maths.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/maths.md#L210-L227) (Normalized Quality Penalty $U[k]$)
- **Step-by-Step Implementation Instructions for Hydrogen Model:**
  1. Export `QUALITY_MAPPING_VERSION = 'fom-mapping-v1'`.
  2. Export `mapSourceFomToQualityCode(fomCode: number): QualityCode`:
     - `SOURCE_FOM_CODE.ACCEPTABLE (1)` $\to$ `QUALITY_CODE.ACCEPTABLE (0)` ($U = 0.0$)
     - `SOURCE_FOM_CODE.MANUALLY_EDITED (6)` and `SOURCE_FOM_CODE.MISSING_QUALITY_RASTER (7)` $\to$ `QUALITY_CODE.UNKNOWN (1)` ($U = 0.75$)
     - `SOURCE_FOM_CODE.LOW_CORRELATION (2)` $\to$ `QUALITY_CODE.LOW (2)` ($U = 1.0$)
     - `SOURCE_FOM_CODE.NO_DATA (0)`, `INTERPOLATED (3)`, `EXTRAPOLATED (4)`, `SATURATED (5)`, or any unrecognized code $\to$ `QUALITY_CODE.INVALID (3)` (Hard exclusion — height is invented or missing, never a soft penalty!).
  3. Export `decodeFomGridToQualityCode(sourceFom: Uint8Array): Uint8Array` mapping an entire raster in $O(N)$.
  4. Export `qualityCodeToClass(code: number): QualityClass` (`0 -> 'acceptable'`, `1 -> 'unknown'`, `2 -> 'low'`, default `'invalid'`) and `qualityCodeToPenaltyU(code: number): number` (`0 -> 0.0`, `1 -> 0.75`, `2 -> 1.0`, default `Number.POSITIVE_INFINITY`).
- **Unit Tests (`tests/routing/t05-quality-mapping.test.ts`):**
  - Verifies that `INTERPOLATED (3)`, `EXTRAPOLATED (4)`, `SATURATED (5)`, and `NO_DATA (0)` all map to `QUALITY_CODE.INVALID (3)` with penalty $+\infty$.
  - Verifies that `MANUALLY_EDITED (6)` maps to `QUALITY_CODE.UNKNOWN (1)` ($U = 0.75$), never `LOW` ($1.0$) or `INVALID`.
  - Verifies that `LOW_CORRELATION (2)` maps to `QUALITY_CODE.LOW (2)` ($U = 1.0$) and `ACCEPTABLE (1)` maps to `0` ($U = 0.0$).
- **Verification Commands:**
  ```powershell
  npx tsc --noEmit
  npx vitest run tests/routing/t05-quality-mapping.test.ts
  ```

---

### Task 06 (T06): Elevation-Support Mask & Uncontaminated Resampling Guard

- **Prerequisite:** `T01` (`codex/routing-base`) ONLY.
- **Worktree / Branch:** `..\mars-t06-elevation-support` / `codex/routing-t06-elevation-support`
- **Owned Files:**
  - `src/routing/elevationSupport.ts`
  - `tests/routing/t06-elevation-support.test.ts`
- **Plan & Research References:**
  - [docs/maths.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/maths.md#L180-L189) (Finding 4: Step 0 Elevation-Support Mask Before Resampling & Derivatives)
  - [docs/admissibility-and-cost-model.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/admissibility-and-cost-model.md#L40-L44) (Preventing finite hard-excluded heights from contaminating neighbors)
- **Step-by-Step Implementation Instructions for Hydrogen Model:**
  1. Export `isValidElevationSample(z: number, noDataSentinel: number): boolean`:
     - Returns `Number.isFinite(z) && Math.abs(z - noDataSentinel) > 1e-5`.
     - **Critical Martian Rule:** Negative elevations such as $-2540.0\text{ m}$ (Jezero Crater floor relative to the Mars MOLA areoid) are **100% valid** and must never be rejected as `NoData`!
  2. Export `buildElevationSupportMask(elevationM: Float32Array | Float64Array, qualityCode: Uint8Array, noDataSentinel: number): Uint8Array`:
     - For each cell $p \in \{0, \dots, N-1\}$, sets `supportMask[p] = 1` iff `isValidElevationSample(elevationM[p], noDataSentinel) && qualityCode[p] !== QUALITY_CODE.INVALID`; otherwise `0`.
  3. Export `createMaskedElevationGrid(elevationM: Float32Array | Float64Array, supportMask: Uint8Array): Float64Array`:
     - Copies supported elevations into a `Float64Array` and replaces any unsupported cell (`supportMask[p] === 0`) with `Number.NaN` **before** any resampling or $3\times 3$ window operation so a finite `INTERPOLATED` spike (e.g., $+1000\text{ m}$) can never bleed into adjacent accepted cells.
  4. Export `bilinearResampleSupportedOnly(maskedElev: Float64Array, srcW: number, srcH: number, normX: number, normY: number): { supported: boolean; elevationM: number }`:
     - If any of the 4 surrounding bilinear sample posts has `!Number.isFinite(z)`, returns `{ supported: false, elevationM: Number.NaN }` rather than interpolating across a hard-excluded post.
- **Unit Tests (`tests/routing/t06-elevation-support.test.ts`):**
  - Confirms $-2540.0\text{ m}$ is valid when `noDataSentinel = -32768`.
  - Confirms a cell with finite $z = +1000.0\text{ m}$ and `qualityCode = QUALITY_CODE.INVALID` gets `supportMask = 0` and `NaN` in `createMaskedElevationGrid`, preventing `bilinearResampleSupportedOnly` from blending $+1000\text{ m}$ into adjacent samples.
- **Verification Commands:**
  ```powershell
  npx tsc --noEmit
  npx vitest run tests/routing/t06-elevation-support.test.ts
  ```

---

### Task 07 (T07): $3 \times 3$ Weighted Horn Slope Operator & Complete-Window Support Mask

- **Prerequisite:** `T01` (`codex/routing-base`) ONLY.
- **Worktree / Branch:** `..\mars-t07-horn-slope` / `codex/routing-t07-horn-slope`
- **Owned Files:**
  - `src/routing/hornSlope.ts`
  - `tests/routing/t07-horn-slope.test.ts`
- **Plan & Research References:**
  - [docs/maths.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/maths.md#L190-L202) (Stage 6.3 Step 1: Neighborhood Terrain Slope $s[k]$ via Horn's $3 \times 3$ Operator)
  - [docs/verification-and-handoff.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/verification-and-handoff.md#L105-L115) (Finding 8: `Float64` vs. `Float32Array` quantization on $F07A$)
  - External: [Horn (1981) IEEE Proc.](https://doi.org/10.1109/PROC.1981.11918)
- **Step-by-Step Implementation Instructions for Hydrogen Model:**
  1. Export `computeHornSlopeGrid(elevationM: Float32Array | Float64Array, width: number, height: number, dx: number, dy: number, cellSupportMask?: Uint8Array, noDataSentinel = -32768): { slopeDeg: Float32Array; slopeDegFloat64: Float64Array; derivativeSupportMask: Uint8Array }`.
  2. For every cell $(r, c)$:
     - Border cells ($r = 0, r = H-1, c = 0, c = W-1$) lack a complete $3 \times 3$ window: set `derivativeSupportMask[k] = 0`, `slopeDeg[k] = Number.NaN`.
     - For interior cells ($1 \le r \le H-2, 1 \le c \le W-2$), inspect all 9 cells in the $3 \times 3$ window $(r+\Delta r, c+\Delta c)$ for $\Delta r, \Delta c \in \{-1, 0, +1\}$.
     - If any of the 9 cells has `cellSupportMask[idx] === 0` or `!Number.isFinite(z)` or `Math.abs(z - noDataSentinel) <= 1e-5`, set `derivativeSupportMask[k] = 0`, `slopeDeg[k] = Number.NaN`.
     - Otherwise, set `derivativeSupportMask[k] = 1` and compute Horn's weighted finite-difference partials in `Float64`:
       $$p = \frac{(z_{r-1,c+1} + 2z_{r,c+1} + z_{r+1,c+1}) - (z_{r-1,c-1} + 2z_{r,c-1} + z_{r+1,c-1})}{8\Delta x}$$
       $$q = \frac{(z_{r-1,c-1} + 2z_{r-1,c} + z_{r-1,c+1}) - (z_{r+1,c-1} + 2z_{r+1,c} + z_{r+1,c+1})}{8\Delta y}$$
       *(Remember: `r - 1` is North and `r + 1` is South!)*
       $$s[k] = \arctan\!\left(\sqrt{p^2 + q^2}\right) \cdot \frac{180}{\pi}$$
     - Store $s[k]$ in both `slopeDegFloat64[k]` and `slopeDeg[k]`.
  3. Export `cropHaloDerivativeGrid(grid: Float32Array, haloWidth: number, haloHeight: number): Float32Array` to extract the $(H_{\text{halo}}-2) \times (W_{\text{halo}}-2)$ interior from a 1-cell halo raster.
- **Unit Tests (`tests/routing/t07-horn-slope.test.ts`):**
  - On an unquantized `Float64Array` inclined plane $z(r, c) = -2540.0 + c \cdot 10 \cdot \tan(12^\circ)$ ($\Delta x = \Delta y = 10\text{ m}$), interior `slopeDegFloat64` equals $12.0^\circ$ within $\le 10^{-12}\text{ deg}$.
  - On a quantized `Float32Array` of the same plane, interior `slopeDeg` equals $12.0^\circ$ within $\le 10^{-3}\text{ deg}$ ($11.999576^\circ\text{–}12.000245^\circ$).
  - A single unsupported cell at $(2,2)$ sets `derivativeSupportMask = 0` on all 9 cells whose $3 \times 3$ window touches $(2,2)$.
- **Verification Commands:**
  ```powershell
  npx tsc --noEmit
  npx vitest run tests/routing/t07-horn-slope.test.ts
  ```

---

### Task 08 (T08): Detrended $3 \times 3$ Plane-Fit RMS Roughness Residual Calculator

- **Prerequisite:** `T01` (`codex/routing-base`) ONLY.
- **Worktree / Branch:** `..\mars-t08-roughness` / `codex/routing-t08-roughness`
- **Owned Files:**
  - `src/routing/roughness.ts`
  - `tests/routing/t08-roughness.test.ts`
- **Plan & Research References:**
  - [docs/maths.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/maths.md#L203-L214) (Stage 6.3 Step 2: Detrended Local Roughness Penalty $R[k]$ via $3 \times 3$ Plane-Fit Residual RMS)
  - [docs/verification-and-handoff.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/verification-and-handoff.md#L105-L127) (Finding 8: `F07A` and `F07B` plane-fit roughness values)
- **Step-by-Step Implementation Instructions for Hydrogen Model:**
  1. Export `computePlaneFitRoughnessGrid(elevationM: Float32Array | Float64Array, width: number, height: number, roughnessScaleM = 0.5, cellSupportMask?: Uint8Array, noDataSentinel = -32768): { rmsResidualM: Float64Array; roughnessNormalized: Float32Array; derivativeSupportMask: Uint8Array }`.
  2. For every interior cell $(r, c)$ where all 9 neighbors in the $3 \times 3$ window $(\Delta r, \Delta c) \in \{-1, 0, +1\}^2$ are supported:
     - Because the index offsets $\xi_m = \Delta c \in \{-1, 0, +1\}$ and $\eta_m = -\Delta r \in \{-1, 0, +1\}$ are symmetric and orthogonal ($\sum \xi_m = \sum \eta_m = \sum \xi_m \eta_m = 0$, $\sum \xi_m^2 = \sum \eta_m^2 = 6$), compute the exact closed-form least-squares plane $\hat{z}(\xi, \eta) = a\xi + b\eta + c$:
       $$c = \frac{1}{9}\sum_{m=1}^{9} z_m, \qquad a = \frac{1}{6}\sum_{m=1}^{9} \xi_m z_m, \qquad b = \frac{1}{6}\sum_{m=1}^{9} \eta_m z_m$$
     - Compute the RMS residual $\sigma_{\text{res}}[k]$ and normalized roughness $R[k] \in [0, 1]$:
       $$\sigma_{\text{res}}[k] = \sqrt{\max\!\left(0, \; \frac{1}{9}\sum_{m=1}^{9} \big(z_m - (a\xi_m + b\eta_m + c)\big)^2\right)}, \qquad R[k] = \min\!\left(1, \; \frac{\sigma_{\text{res}}[k]}{R_{\text{scale}}}\right)$$
- **Unit Tests (`tests/routing/t08-roughness.test.ts`):**
  - On an unquantized `Float64Array` tilted plane of $12^\circ$ (or any arbitrary tilt in X and Y), $\sigma_{\text{res}} \le 10^{-12}\text{ m}$ (proving detrending never double-counts smooth slope as roughness!).
  - On the `Float32Array` quantized $12^\circ$ plane, $\sigma_{\text{res}} \le 10^{-4}\text{ m}$ ($\approx 5.75 \times 10^{-5}\text{ m}$).
  - On the `F07B` $7 \times 9$ `Float32Array` ridge, interior Row 0 has $\sigma_{\text{res}} = 0.0000\text{ m}$ across all 7 columns, and interior Row 3 has $\sigma_{\text{res}}$ matching `[0.0000, 0.589256, 0.0000, 1.178511, 0.0000, 0.589256, 0.0000]` to within $10^{-5}\text{ m}$.
- **Verification Commands:**
  ```powershell
  npx tsc --noEmit
  npx vitest run tests/routing/t08-roughness.test.ts
  ```

---

## Wave 2: Canonical Admissibility, Effective Policy Weights & Corner-Aware Edge Costs (Depend ONLY on T01)

### Task 09 (T09): Canonical 7-Priority Cell Exclusion Predicate

- **Prerequisite:** `T01` (`codex/routing-base`) ONLY.
- **Worktree / Branch:** `..\mars-t09-cell-admissibility` / `codex/routing-t09-cell-admissibility`
- **Owned Files:**
  - `src/routing/cellAdmissibility.ts`
  - `tests/routing/t09-cell-admissibility.test.ts`
- **Plan & Research References:**
  - [docs/maths.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/maths.md#L58-L70) (Finding 3: Stage 5 Endpoint Cell Admissibility & Canonical 7-Priority Exclusion Order)
  - [docs/admissibility-and-cost-model.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/admissibility-and-cost-model.md#L76-L95) (Section 3.1: Single Canonical Cell Exclusion Function `getCellExclusionReason`)
- **Step-by-Step Implementation Instructions for Hydrogen Model:**
  1. Export `getCellExclusionReason(bundle: RegionRoutingBundle, row: number, col: number, profile: ConstraintProfile, qualityMode: QualityMode): ExclusionReasonCode | null`:
     - **Priority 1 (`OUT_OF_BOUNDS`):** If `!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row >= bundle.gridHeight || col < 0 || col >= bundle.gridWidth`, return `'OUT_OF_BOUNDS'`.
     - Compute $k = \text{row} \times \text{bundle.gridWidth} + \text{col}$.
     - **Priority 2 (`NO_DATA`):** Let $z = \text{bundle.elevationM}[k]$. If `!Number.isFinite(z) || Math.abs(z - bundle.noDataSentinel) <= 1e-5`, return `'NO_DATA'`.
     - **Priority 3 (`INTERPOLATED_OR_UNRELIABLE`):** Let $q = \text{bundle.qualityCode}[k]$. If `q === QUALITY_CODE.INVALID` (or `q < 0 || q > 2`), return `'INTERPOLATED_OR_UNRELIABLE'`. *(Mandatory even when `elevationM[k]` and `terrainSlopeDeg[k]` are finite and `qualityMode === 'prefer'`!)*
     - **Priority 4 (`EXPLICIT_HAZARD_MASK`):** If `bundle.explicitExclusionMask && bundle.explicitExclusionMask[k] === 1`, return `'EXPLICIT_HAZARD_MASK'`.
     - **Priority 5 (`UNSUPPORTED_DERIVATIVE`):** Let $s = \text{bundle.terrainSlopeDeg}[k]$ and $r_{\text{norm}} = \text{bundle.roughnessNormalized}[k]$. If `(bundle.derivativeSupportMask && bundle.derivativeSupportMask[k] === 0) || !Number.isFinite(s) || !Number.isFinite(rNorm)`, return `'UNSUPPORTED_DERIVATIVE'`.
     - **Priority 6 (`MAX_TERRAIN_SLOPE_EXCEEDED`):** If `s > profile.maxTerrainSlopeDeg`, return `'MAX_TERRAIN_SLOPE_EXCEEDED'`.
     - **Priority 7 (`STRICT_QUALITY_EXCLUDED`):** If `qualityMode === 'strict' && q !== QUALITY_CODE.ACCEPTABLE`, return `'STRICT_QUALITY_EXCLUDED'`.
     - Otherwise return `null` (cell is admissible).
  2. Export `isCellAdmissible(bundle: RegionRoutingBundle, row: number, col: number, profile: ConstraintProfile, qualityMode: QualityMode): boolean` returning `getCellExclusionReason(...) === null`.
- **Unit Tests (`tests/routing/t09-cell-admissibility.test.ts`):**
  - Verifies exact priority order when multiple violations exist on a single cell (e.g., `NO_DATA` + `INVALID` quality returns `'NO_DATA'`; finite elevation + `INVALID` quality + $25^\circ$ slope returns `'INTERPOLATED_OR_UNRELIABLE'`).
  - Verifies that `q === QUALITY_CODE.LOW` or `UNKNOWN` is admissible (`null`) in `'prefer'` mode and returns `'STRICT_QUALITY_EXCLUDED'` in `'strict'` mode.
  - Verifies that negative Martian elevation $z = -2540.0\text{ m}$ with $s = 19.999^\circ \le 20^\circ$ is admissible (`null`).
- **Verification Commands:**
  ```powershell
  npx tsc --noEmit
  npx vitest run tests/routing/t09-cell-admissibility.test.ts
  ```

---

### Task 10 (T10): Endpoint Normalization & Pre-Shortcut Validation Stage

- **Prerequisite:** `T01` (`codex/routing-base`) ONLY.
- **Worktree / Branch:** `..\mars-t10-endpoints` / `codex/routing-t10-endpoints`
- **Owned Files:**
  - `src/routing/endpoints.ts`
  - `tests/routing/t10-endpoints.test.ts`
- **Plan & Research References:**
  - [docs/maths.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/maths.md#L58-L79) (Finding 3: Stage 5 Endpoint Validation MUST Run Before Stage 6 Same-Cell Shortcut)
  - [docs/verification-and-handoff.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/verification-and-handoff.md#L75-L83) (Fixture `F05` Subtests A & B)
- **Step-by-Step Implementation Instructions for Hydrogen Model:**
  1. Export `normalizeAndValidateEndpoints(request: RouteRequest, bundle: RegionRoutingBundle, profile: ConstraintProfile, cellAdmissibility: CellAdmissibilityPort): { ok: true; start: NormalizedGridPoint; destination: NormalizedGridPoint; isSameCell: boolean } | { ok: false; error: Extract<RouteResponse, { status: 'invalid_input' }> }`.
  2. Reject empty `request.policies` (`!request.policies || request.policies.length === 0`) with `status: 'invalid_input', endpoint: 'request', reasonCode: 'EMPTY_POLICIES'`.
  3. Convert `request.start` and `request.destination` from local meters $\{E, N\}$ into `(row, col, cellIndex)` with Northeast border clamping ($E = W\Delta x \to c = W-1$, $N = H\Delta y \to r = 0$). If either falls outside $[0, W\Delta x] \times [0, H\Delta y]$, return `status: 'invalid_input'`, `endpoint: 'start' | 'destination'`, `reasonCode: 'OUT_OF_BOUNDS'`.
  4. **Stage 5 (Before Same-Cell Check!):** Call `cellAdmissibility.getCellExclusionReason` on `(start.row, start.col)` and `(destination.row, destination.col)`. If either returns a non-null `ExclusionReasonCode`, immediately return `status: 'invalid_input'` with that `endpoint` and `reasonCode`.
  5. **Stage 6:** Only after both `start` and `destination` pass Stage 5, set `isSameCell = (start.cellIndex === destination.cellIndex)`.
- **Unit Tests (`tests/routing/t10-endpoints.test.ts`):**
  - **Fixture F05 Subtest A:** `start = (11.1, 14.2)` and `destination = (13.9, 10.4)` on a $5\times 5$ grid ($\Delta x = \Delta y = 5\text{ m}$) both normalize to $(r=2, c=2, k=12)$ and return `ok: true, isSameCell: true`.
  - **Fixture F05 Subtest B (Finding 3 Regression):** When cell $k=12$ has finite $z = -2540\text{ m}$ and $s = 0^\circ$ but `q[12] = QUALITY_CODE.INVALID` (`INTERPOLATED`), the same-cell request in `'prefer'` mode returns `ok: false, error: { status: 'invalid_input', endpoint: 'start', reasonCode: 'INTERPOLATED_OR_UNRELIABLE' }` — never bypassing validation via the same-cell shortcut!
- **Verification Commands:**
  ```powershell
  npx tsc --noEmit
  npx vitest run tests/routing/t10-endpoints.test.ts
  ```

---

### Task 11 (T11): 8-Neighbor Edge Admissibility, No-Corner-Cutting & Tangent-Space Grade Guard

- **Prerequisite:** `T01` (`codex/routing-base`) ONLY.
- **Worktree / Branch:** `..\mars-t11-edge-admissibility` / `codex/routing-t11-edge-admissibility`
- **Owned Files:**
  - `src/routing/edgeAdmissibility.ts`
  - `tests/routing/t11-edge-admissibility.test.ts`
- **Plan & Research References:**
  - [docs/maths.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/maths.md#L134-L176) (Section 6.1–6.2: 8-Neighbor Graph Topology, Strict Diagonal Corner-Cutting Rule, and Along-Edge Grade Exclusion)
  - [docs/admissibility-and-cost-model.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/admissibility-and-cost-model.md#L96-L108) (Section 3.2: Edge-Level Admissibility Rules)
- **Step-by-Step Implementation Instructions for Hydrogen Model:**
  1. Export `isEdgeAdmissible(bundle: RegionRoutingBundle, uRow: number, uCol: number, dir: number, profile: ConstraintProfile, qualityMode: QualityMode, cellAdmissibility: CellAdmissibilityPort): boolean`:
     - Let $\Delta r = \text{DIR\_DR}[\text{dir}], \Delta c = \text{DIR\_DC}[\text{dir}]$, $vRow = uRow + \Delta r, vCol = uCol + \Delta c$.
     - Check endpoint admissibility: both `(uRow, uCol)` and `(vRow, vCol)` must have `getCellExclusionReason(...) === null`.
     - **Strict No-Corner-Cutting Rule for Diagonals (`DIR_IS_DIAG[dir] === 1`):**
       Both orthogonal corner neighbors $w_1 = (uRow, vCol)$ and $w_2 = (vRow, uCol)$ must **also** pass `getCellExclusionReason(...) === null`. If either $w_1$ or $w_2$ is excluded for any reason (`NO_DATA`, `INTERPOLATED_OR_UNRELIABLE`, `MAX_TERRAIN_SLOPE_EXCEEDED`, `STRICT_QUALITY_EXCLUDED`, etc.), return `false`.
     - **Along-Edge Grade Limit:**
       Let $d = \text{stepPlanarDistance}(dir, \Delta x, \Delta y)$, $\Delta z = z[v] - z[u]$.
       - If $\Delta z > 0$ (uphill), let $\theta_{\lim} = \text{profile.maxUphillGradeDeg} ?? \text{profile.maxRouteGradeDeg}$.
       - If $\Delta z < 0$ (downhill), let $\theta_{\lim} = \text{profile.maxDownhillGradeDeg} ?? \text{profile.maxRouteGradeDeg}$.
       - Else $\theta_{\lim} = \text{profile.maxRouteGradeDeg}$.
       - Compute $g_{\text{deg}} = \arctan(|\Delta z| / d) \cdot \frac{180}{\pi}$. Return `gDeg <= thetaLim + 1e-12`.
- **Unit Tests (`tests/routing/t11-edge-admissibility.test.ts`):**
  - Verifies that a diagonal move $(1,1) \to (0,2)$ is rejected when either $(0,1)$ or $(1,2)$ is blocked (`F03` Subtest A & B, and the illegal `F08` south diagonal around $(3,2)$).
  - Verifies that on a $10\text{ m}$ step, $|\Delta z| = 10 \tan(20^\circ) \approx 3.639702\text{ m}$ is admissible while $|\Delta z| = 3.65\text{ m}$ ($20.05^\circ$) is rejected.
- **Verification Commands:**
  ```powershell
  npx tsc --noEmit
  npx vitest run tests/routing/t11-edge-admissibility.test.ts
  ```

---

### Task 12 (T12): Uniform-Quality Detector & Effective Policy Weight Resolver

- **Prerequisite:** `T01` (`codex/routing-base`) ONLY.
- **Worktree / Branch:** `..\mars-t12-effective-weights` / `codex/routing-t12-effective-weights`
- **Owned Files:**
  - `src/routing/effectiveWeights.ts`
  - `tests/routing/t12-effective-weights.test.ts`
- **Plan & Research References:**
  - [docs/maths.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/maths.md#L228-L246) (Findings 1 & 7: Why We Do NOT Subtract $U_{\min}$, and the Uniform-Quality Effective-Policy Model Rule $\gamma_{\text{eff}} = 0$)
  - [docs/admissibility-and-cost-model.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/admissibility-and-cost-model.md#L121-L163) (Section 4.1: The $3\times 5$ counterexample $120.0 < 120.710678$ and the explicit $\gamma_{\text{eff}} = 0$ model rule)
- **Step-by-Step Implementation Instructions for Hydrogen Model:**
  1. Export `resolveEffectivePolicyWeights(bundle: RegionRoutingBundle, profile: ConstraintProfile, qualityMode: QualityMode, cellAdmissibility: CellAdmissibilityPort): { effectiveWeights: Record<PolicyId, EffectivePolicyWeights>; isQualityUniform: boolean; uniformQualityClass: QualityClass | null }`:
     - Scan all cells $(r, c)$ in the bundle where `cellAdmissibility.getCellExclusionReason(bundle, r, c, profile, qualityMode) === null`.
     - Track `minAdmissibleU` and `maxAdmissibleU` across all admissible cells using the **published unshifted** penalties (`0 -> 0.0`, `1 -> 0.75`, `2 -> 1.0`).
     - Set `isQualityUniform = (admissibleCount === 0) || (Math.abs(maxAdmissibleU - minAdmissibleU) <= 1e-9)`.
     - For `shortest` ($\alpha=0,\beta=0,\gamma=0$) and `terrain` ($\alpha=2,\beta=1,\gamma=0$), `effective` equals `nominal` and `uniformQualityOverride = false`.
     - For `uncertainty` (nominal $\alpha=2,\beta=1,\gamma=2$):
       - If `isQualityUniform === true`, set `effective = { alpha: 2, beta: 1, gamma: 0 }` and `uniformQualityOverride = true`.
       - If `isQualityUniform === false`, set `effective = { alpha: 2, beta: 1, gamma: 2 }` and `uniformQualityOverride = false` (keeping the exact published unshifted $U$ penalties without subtracting $U_{\min}$!).
- **Unit Tests (`tests/routing/t12-effective-weights.test.ts`):**
  - When all admissible cells are `UNKNOWN` ($U \equiv 0.75$), `isQualityUniform === true`, `effectiveWeights.uncertainty.effective.gamma === 0`, and `uniformQualityOverride === true`.
  - When cells are a mix of `UNKNOWN` ($0.75$) and `LOW` ($1.0$) with zero `ACCEPTABLE` cells, `minAdmissibleU === 0.75`, `maxAdmissibleU === 1.0`, `isQualityUniform === false`, and `effectiveWeights.uncertainty.effective.gamma === 2`.
- **Verification Commands:**
  ```powershell
  npx tsc --noEmit
  npx vitest run tests/routing/t12-effective-weights.test.ts
  ```

---

### Task 13 (T13): Corner-Aware Conservative Edge Cost Evaluator

- **Prerequisite:** `T01` (`codex/routing-base`) ONLY.
- **Worktree / Branch:** `..\mars-t13-edge-cost` / `codex/routing-t13-edge-cost`
- **Owned Files:**
  - `src/routing/edgeCost.ts`
  - `tests/routing/t13-edge-cost.test.ts`
- **Plan & Research References:**
  - [docs/maths.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/maths.md#L166-L179) (Section 6.2: Conservative Edge Penalties Including Diagonal Corner-Quality Rule)
  - [docs/admissibility-and-cost-model.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/admissibility-and-cost-model.md#L109-L120) (Why soft penalties must not cut corners across `LOW`/`UNKNOWN` cells)
  - [docs/verification-and-handoff.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/verification-and-handoff.md#L84-L103) (Fixture `F06` analytical crossover $\gamma^* = \sqrt{2}-1$)
- **Step-by-Step Implementation Instructions for Hydrogen Model:**
  1. Export `computeEdgePenalties(bundle: RegionRoutingBundle, uRow: number, uCol: number, dir: number, profile: ConstraintProfile): { d: number; S: number; R: number; U: number }`:
     - Let $vRow = uRow + \text{DIR\_DR}[dir], vCol = uCol + \text{DIR\_DC}[dir]$, $u = uRow \cdot W + uCol$, $v = vRow \cdot W + vCol$.
     - Compute planar length $d \in \{\Delta x, \Delta y, \sqrt{\Delta x^2 + \Delta y^2}\}$.
     - Compute $S[u] = s[u] / \text{profile.maxTerrainSlopeDeg}$, $S[v] = s[v] / \text{profile.maxTerrainSlopeDeg}$, and $S(u, v) = \max(S[u], S[v])$.
     - Compute $R(u, v) = \max(0, \min(1, \max(r_{\text{norm}}[u], r_{\text{norm}}[v])))$.
     - **Corner-Aware Observation Quality $U(u, v)$:**
       - For cardinal steps (`DIR_IS_DIAG[dir] === 0`): $U(u, v) = \max(U[u], U[v])$.
       - For diagonal steps (`DIR_IS_DIAG[dir] === 1`): let $w_1 = uRow \cdot W + vCol$ and $w_2 = vRow \cdot W + uCol$ be the two orthogonal corner cells. Then:
         $$U_{\text{diag}}(u, v) = \max\big(U[u], \; U[v], \; U[w_1], \; U[w_2]\big)$$
  2. Export `computeEdgeCost(bundle: RegionRoutingBundle, uRow: number, uCol: number, dir: number, profile: ConstraintProfile, weights: { alpha: number; beta: number; gamma: number }): number`:
     $$\text{cost}(u, v) = d \cdot \big(1 + \alpha S(u, v) + \beta R(u, v) + \gamma U(u, v)\big)$$
- **Unit Tests (`tests/routing/t13-edge-cost.test.ts`):**
  - In `F06` ($3 \times 5$, $\Delta x = \Delta y = 10\text{ m}$, only $(1,2)$ has `LOW` quality $U=1.0$), verifies that the diagonal step $(1,1) \to (0,2)$ has orthogonal corners $(0,1)$ and $(1,2)$, so $U_{\text{diag}} = 1.0$ and its cost under `uncertainty` ($\gamma=2$) is $10\sqrt{2} \times (1 + 2(1.0)) = 30\sqrt{2} \approx 42.426407$, whereas the corner-clear diagonal $(1,0) \to (0,1)$ has corners $(0,0)$ and $(1,1)$ with $U_{\text{diag}} = 0.0$ and cost $10\sqrt{2} \approx 14.142136$.
- **Verification Commands:**
  ```powershell
  npx tsc --noEmit
  npx vitest run tests/routing/t13-edge-cost.test.ts
  ```

---

## Wave 3: Data Structures, Connected Components, A* Solver, Dijkstra Oracle & Path Audit (Depend ONLY on T01)

### Task 14 (T14): Pre-Allocated TypedArray Solver Workspace & $O(1)$ Generation-Stamp Reset

- **Prerequisite:** `T01` (`codex/routing-base`) ONLY.
- **Worktree / Branch:** `..\mars-t14-workspace` / `codex/routing-t14-workspace`
- **Owned Files:**
  - `src/routing/workspace.ts`
  - `tests/routing/t14-workspace.test.ts`
- **Plan & Research References:**
  - [docs/search-and-worker-execution.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/search-and-worker-execution.md#L9-L40) (Section 1: Pre-Allocated TypedArray Workspace & $O(1)$ Generation Stamp)
  - [docs/efficiency.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/efficiency.md#L23-L31) (Baseline Optimization 2.1)
- **Step-by-Step Implementation Instructions for Hydrogen Model:**
  1. Export class `SolverWorkspace implements SolverWorkspacePort` taking `capacity: number` ($N = W \cdot H$).
  2. Allocate once in the constructor:
     - `gScore = new Float64Array(capacity)`
     - `fScore = new Float64Array(capacity)`
     - `crossScore = new Float64Array(capacity)`
     - `parentIndex = new Int32Array(capacity)`
     - `seenStamp = new Uint32Array(capacity)`
     - `closedStamp = new Uint32Array(capacity)`
     - `heapNodes = new Int32Array(capacity)`
     - `heapPos = new Int32Array(capacity)` (initialized to `-1`)
     - `componentId = new Int32Array(capacity)` (initialized to `-1`)
     - `adjMask = new Uint8Array(capacity)`
     - `bfsQueue = new Int32Array(capacity)`
  3. Implement `beginSearch(): number`:
     - Increment `this.currentSearchId = (this.currentSearchId + 1) >>> 0`.
     - If `this.currentSearchId === 0` (uint32 wraparound), call `this.seenStamp.fill(0)`, `this.closedStamp.fill(0)`, and set `this.currentSearchId = 1`.
     - Return `this.currentSearchId`.
- **Unit Tests (`tests/routing/t14-workspace.test.ts`):**
  - Verifies array capacities, $O(1)$ `beginSearch()` stamp increment across multiple searches without clearing `gScore`/`fScore`, and safe `0xFFFFFFFF -> 1` wraparound reset.
- **Verification Commands:**
  ```powershell
  npx tsc --noEmit
  npx vitest run tests/routing/t14-workspace.test.ts
  ```

---

### Task 15 (T15): Indexed Binary Min-Heap with Strict Weak Lexicographic Ordering

- **Prerequisite:** `T01` (`codex/routing-base`) ONLY.
- **Worktree / Branch:** `..\mars-t15-binary-heap` / `codex/routing-t15-binary-heap`
- **Owned Files:**
  - `src/routing/binaryHeap.ts`
  - `tests/routing/t15-binary-heap.test.ts`
- **Plan & Research References:**
  - [docs/search-and-worker-execution.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/search-and-worker-execution.md#L41-L72) (Finding 2: Why $\epsilon = 10^{-9}$ Tie Windows Are Intransitive & Strict Lexicographic Ordering)
  - [docs/verification-and-handoff.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/verification-and-handoff.md#L30-L32) (Assertion 5: Strict Weak Ordering & Permutation-Invariant Heap Extraction)
- **Step-by-Step Implementation Instructions for Hydrogen Model:**
  1. Export `hasHigherPriority(u: number, v: number, fScore: Float64Array, gScore: Float64Array, crossScore: Float64Array): boolean`:
     ```ts
     const fu = fScore[u], fv = fScore[v];
     if (fu !== fv) return fu < fv;                 // Level 1: smaller fScore wins
     const gu = gScore[u], gv = gScore[v];
     if (gu !== gv) return gu > gv;                 // Level 2: larger gScore wins (closer to goal)
     const cu = crossScore[u], cv = crossScore[v];
     if (cu !== cv) return cu < cv;                 // Level 3: smaller cross-product wins
     return u < v;                                  // Level 4: smaller row-major cellIndex wins
     ```
     **NEVER** use `Math.abs(fu - fv) <= 1e-9` here!
  2. Export class `BinaryMinHeap` operating directly on `heapNodes: Int32Array`, `heapPos: Int32Array`, `fScore: Float64Array`, `gScore: Float64Array`, and `crossScore: Float64Array`:
     - `clear(): void`
     - `pushOrDecreaseKey(node: number): void` (if `heapPos[node] >= 0`, calls `siftUp(heapPos[node])`; else appends at `size++` and calls `siftUp`)
     - `popMin(): number` (returns `-1` when empty; otherwise extracts `heapNodes[0]`, sets `heapPos[minNode] = -1`, moves last element to `0`, and calls `siftDown(0)`).
- **Unit Tests (`tests/routing/t15-binary-heap.test.ts`):**
  - **Finding 2 Regression Test:** Constructs $A=(f=10, g=1)$, $B=(f=10+0.75\times 10^{-9}, g=2)$, $C=(f=10+1.50\times 10^{-9}, g=3)$. Asserts `hasHigherPriority(A, B) === true`, `hasHigherPriority(B, C) === true`, `hasHigherPriority(A, C) === true`, and that inserting all $3! = 6$ permutations of $[A, B, C]$ into `BinaryMinHeap` pops `[A, B, C]` in every permutation.
  - Verifies `pushOrDecreaseKey` updates an existing node's position in place without creating duplicate entries.
- **Verification Commands:**
  ```powershell
  npx tsc --noEmit
  npx vitest run tests/routing/t15-binary-heap.test.ts
  ```

---

### Task 16 (T16): Lazy Connected-Component Labeler & 8-Bit Adjacency Mask Builder

- **Prerequisite:** `T01` (`codex/routing-base`) ONLY.
- **Worktree / Branch:** `..\mars-t16-components` / `codex/routing-t16-components`
- **Owned Files:**
  - `src/routing/components.ts`
  - `tests/routing/t16-components.test.ts`
- **Plan & Research References:**
  - [docs/search-and-worker-execution.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/search-and-worker-execution.md#L74-L90) (Section 3: Lazy Connected-Component Labeling for Multi-Cell Walled Basins)
  - [docs/verification-and-handoff.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/verification-and-handoff.md#L64-L74) (Fixture `F04`: Separated Multi-Cell Basin with Non-Zero Goal Degree)
- **Step-by-Step Implementation Instructions for Hydrogen Model:**
  1. Export `computeConnectedComponentsAndAdjMask(bundle: RegionRoutingBundle, profile: ConstraintProfile, qualityMode: QualityMode, edgeEvaluator: Pick<EdgeEvaluatorPort, 'isEdgeAdmissible'>, cellAdmissibility: CellAdmissibilityPort, componentIdOut: Int32Array, adjMaskOut: Uint8Array, bfsQueue: Int32Array): { componentCount: number }`:
     - First pass ($u = 0 \dots N-1$): initialize `componentIdOut[u] = -1` and build the 8-bit neighbor mask `adjMaskOut[u]` where bit $d \in \{0..7\}$ is `1` iff `edgeEvaluator.isEdgeAdmissible(bundle, u, v, d, profile, qualityMode)` is `true`.
     - Second pass ($u = 0 \dots N-1$): if `componentIdOut[u] === -1` and `cellAdmissibility.getCellExclusionReason(bundle, uRow, uCol, profile, qualityMode) === null`, assign a new component ID `compId++` and run a zero-allocation flat-array BFS using `bfsQueue` and `adjMaskOut` to label all reachable cells in that component.
  2. Export `areCellsInSameComponent(componentId: Int32Array, startIndex: number, goalIndex: number): boolean` returning `componentId[startIndex] >= 0 && componentId[startIndex] === componentId[goalIndex]`.
- **Unit Tests (`tests/routing/t16-components.test.ts`):**
  - **Fixture F04 ($7 \times 7$ Western vs. Eastern Basin Divided by Column $c=3$ at $26^\circ$):** Verifies that Goal $(r=3, c=5)$ has all 8 bits of `adjMaskOut` set (`0b11111111 === 255`, degree $8$), yet `componentIdOut[start]` ($0$) $\neq$ `componentIdOut[goal]` ($1$), detecting unreachability in $O(1)$ without running A*.
- **Verification Commands:**
  ```powershell
  npx tsc --noEmit
  npx vitest run tests/routing/t16-components.test.ts
  ```

---

### Task 17 (T17): Deterministic 8-Neighbor A* Search Engine

- **Prerequisite:** `T01` (`codex/routing-base`) ONLY.
- **Worktree / Branch:** `..\mars-t17-astar` / `codex/routing-t17-astar`
- **Owned Files:**
  - `src/routing/astar.ts`
  - `tests/routing/t17-astar.test.ts`
- **Plan & Research References:**
  - [docs/search-and-worker-execution.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/search-and-worker-execution.md#L41-L120) (A* relaxation, heuristic reuse, and bounded path reconstruction)
  - [docs/admissibility-and-cost-model.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/admissibility-and-cost-model.md#L165-L185) (Theorem 1 & 2: Heuristic admissibility and consistency proof)
  - External: [Hart, Nilsson & Raphael (1968)](https://doi.org/10.1109/TSSC.1968.300136)
- **Step-by-Step Implementation Instructions for Hydrogen Model:**
  1. Export `solveAStar(params: { bundle: RegionRoutingBundle; workspace: SolverWorkspacePort; startIndex: number; goalIndex: number; profile: ConstraintProfile; qualityMode: QualityMode; weights: { alpha: number; beta: number; gamma: number }; edgeEvaluator: EdgeEvaluatorPort; adjMask?: Uint8Array; isCancelled?: () => boolean; isTimedOut?: () => boolean }): SinglePolicySolveResult`:
     - Handle same-cell (`startIndex === goalIndex`) immediately: return `{ status: 'success', cellIndices: [startIndex], totalCost: 0, exploredNodes: 0 }`.
     - Call `const searchId = workspace.beginSearch()`.
     - Compute Euclidean horizontal heuristic:
       $$h(u) = \sqrt{\big((c_u - c_{\text{goal}})\Delta x\big)^2 + \big((r_{\text{goal}} - r_u)\Delta y\big)^2}$$
     - Compute collinearity cross-product tie-breaker in meters:
       $$\text{cross}(u) = \frac{\big|(E_c(u) - E_c(\text{start}))(N_c(\text{goal}) - N_c(\text{start})) - (E_c(\text{goal}) - E_c(\text{start}))(N_c(u) - N_c(\text{start}))\big|}{\max(1, \; D_{\text{euclid}}(\text{start}, \text{goal}))} \times 10^{-6}$$
     - When relaxing edge $(u \to v)$ in direction `dir`:
       - If `closedStamp[v] === searchId`, continue (because $h$ is consistent, closed nodes already have optimal $g$).
       - Let `candidateG = gScore[u] + edgeEvaluator.computeEdgeCost(bundle, u, v, dir, profile, weights)`.
       - If `seenStamp[v] !== searchId`: initialize `seenStamp[v] = searchId`, `gScore[v] = candidateG`, `fScore[v] = candidateG + h(v)`, `crossScore[v] = cross(v)`, `parentIndex[v] = u`, and push `v` into the heap.
       - Else if `candidateG < gScore[v]`: reuse the already-computed heuristic `const hv = fScore[v] - gScore[v]`, set `gScore[v] = candidateG`, `fScore[v] = candidateG + hv`, `parentIndex[v] = u`, and decrease-key `v` in place.
     - Reconstruct path from `goalIndex` back to `startIndex` with a strict step limit `steps <= bundle.gridWidth * bundle.gridHeight` to prevent cycles.
- **Unit Tests (`tests/routing/t17-astar.test.ts`):**
  - Verifies exact path and cost on flat cardinal, pure diagonal ($20\sqrt{2}$), octile ($10\sqrt{2}+10$), barrier gap (`F02`, $40+20\sqrt{2}$), and weighted detour grids.
  - Verifies immediate cancellation (`status: 'cancelled'`) and timeout (`status: 'timeout'`) callbacks.
- **Verification Commands:**
  ```powershell
  npx tsc --noEmit
  npx vitest run tests/routing/t17-astar.test.ts
  ```

---

### Task 18 (T18): Standalone Reference Dijkstra Oracle

- **Prerequisite:** `T01` (`codex/routing-base`) ONLY.
- **Worktree / Branch:** `..\mars-t18-dijkstra` / `codex/routing-t18-dijkstra`
- **Owned Files:**
  - `src/routing/dijkstra.ts`
  - `tests/routing/t18-dijkstra.test.ts`
- **Plan & Research References:**
  - [docs/verification-and-handoff.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/verification-and-handoff.md#L7-L32) (Section 1: The Reference Dijkstra Verification Protocol)
- **Step-by-Step Implementation Instructions for Hydrogen Model:**
  1. Export `solveDijkstra(params: { bundle: RegionRoutingBundle; startIndex: number; goalIndex: number; profile: ConstraintProfile; qualityMode: QualityMode; weights: { alpha: number; beta: number; gamma: number }; edgeEvaluator: EdgeEvaluatorPort }): SinglePolicySolveResult`:
     - Implement a completely self-contained reference Dijkstra solver with $h(u) \equiv 0$ (ordering nodes strictly by `(gScore[u], u)`), using its own local `Float64Array(N)` and `Int32Array(N)` buffers so it shares zero mutable state with `SolverWorkspace`.
     - Evaluate the exact same `weights` (representing $\alpha, \beta, \gamma_{\text{eff}}$) and `edgeEvaluator` as A*.
- **Unit Tests (`tests/routing/t18-dijkstra.test.ts`):**
  - Verifies `solveDijkstra` on flat, barrier, and 3-corridor grids (`F08`: Middle $40.0$, North $48.284271$, South $58.284271$).
- **Verification Commands:**
  ```powershell
  npx tsc --noEmit
  npx vitest run tests/routing/t18-dijkstra.test.ts
  ```

---

### Task 19 (T19): Independent Post-Solve Path Admissibility & Cost Auditor

- **Prerequisite:** `T01` (`codex/routing-base`) ONLY.
- **Worktree / Branch:** `..\mars-t19-path-audit` / `codex/routing-t19-path-audit`
- **Owned Files:**
  - `src/routing/pathAudit.ts`
  - `tests/routing/t19-path-audit.test.ts`
- **Plan & Research References:**
  - [docs/verification-and-handoff.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/verification-and-handoff.md#L12-L32) (Section 1.2: Independent Path Admissibility Audit & Optimal Cost Equality)
- **Step-by-Step Implementation Instructions for Hydrogen Model:**
  1. Export `verifyPathAdmissibility(params: { bundle: RegionRoutingBundle; cellIndices: number[]; expectedStartIndex: number; expectedGoalIndex: number; profile: ConstraintProfile; qualityMode: QualityMode; weights: { alpha: number; beta: number; gamma: number }; cellAdmissibility: CellAdmissibilityPort; edgeEvaluator: EdgeEvaluatorPort }): { valid: boolean; recomputedCost: number; failureReason?: string }`:
     - Check `cellIndices.length >= 1`, `cellIndices[0] === expectedStartIndex`, `cellIndices[cellIndices.length - 1] === expectedGoalIndex`.
     - Check that every vertex `cellIndices[i]` has `cellAdmissibility.getCellExclusionReason(...) === null` (including `i = 0` for 0-edge same-cell paths!).
     - For each consecutive step $u = k_{j-1} \to v = k_j$:
       - Verify $|\Delta r| \le 1, |\Delta c| \le 1, (\Delta r, \Delta c) \neq (0, 0)$ and resolve direction index `dir` $\in \{0..7\}$.
       - Verify `edgeEvaluator.isEdgeAdmissible(bundle, u, v, dir, profile, qualityMode) === true` (which checks diagonal orthogonal corners $w_1, w_2$ and edge grade $|\Delta z| / d$).
       - Accumulate `recomputedCost += edgeEvaluator.computeEdgeCost(bundle, u, v, dir, profile, weights)`.
  2. Export `assertAStarMatchesDijkstra(aStarResult: SinglePolicySolveResult, dijkstraResult: SinglePolicySolveResult, auditResult: { valid: boolean; recomputedCost: number }): void` asserting status match, `auditResult.valid === true`, `Math.abs(aStarResult.totalCost - dijkstraResult.totalCost) <= 1e-7`, `Math.abs(auditResult.recomputedCost - dijkstraResult.totalCost) <= 1e-7`, and `aStarResult.exploredNodes <= dijkstraResult.exploredNodes`.
- **Unit Tests (`tests/routing/t19-path-audit.test.ts`):**
  - Detects an illegal diagonal step cutting a blocked corner (like the old `F08` south path `(3,1) -> (4,2)` past blocked `(3,2)`).
  - Detects a 0-edge same-cell path on an `INVALID` quality cell.
  - Passes valid cardinal and diagonal paths and confirms cost equality to $< 10^{-7}$.
- **Verification Commands:**
  ```powershell
  npx tsc --noEmit
  npx vitest run tests/routing/t19-path-audit.test.ts
  ```

---

## Wave 4: Physical Route Metrics, 3D Draping, Deduplication, Return Legs & Signed Explanations (Depend ONLY on T01)

### Task 20 (T20): Horizontal vs. 3D Surface Distance, Secant Bound & Travel-Time Calculator

- **Prerequisite:** `T01` (`codex/routing-base`) ONLY.
- **Worktree / Branch:** `..\mars-t20-metrics-distance` / `codex/routing-t20-metrics-distance`
- **Owned Files:**
  - `src/routing/metricsDistance.ts`
  - `tests/routing/t20-metrics-distance.test.ts`
- **Plan & Research References:**
  - [docs/metrics-and-explanations.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/metrics-and-explanations.md#L9-L48) (Section 1.1 & 2.1: $0.50\text{ m/s}$ Labeled Simulator Constant, Grade-Adjusted Briefing Time, and Secant Bound $D_{\text{horiz}} \le D_{\text{surface}} \le D_{\text{horiz}}\sec(\theta_{\text{maxGrade}})$)
- **Step-by-Step Implementation Instructions for Hydrogen Model:**
  1. Export `computeDistanceAndTimeMetrics(bundle: RegionRoutingBundle, cellIndices: number[], profile: ConstraintProfile, scienceStopDurationS = 0): { horizontalDistanceM: number; surfaceDistanceM: number; estimatedTimeS: number; gradeAdjustedTimeS: number; cumulativeHorizM: Float64Array; cumulativeSurfaceM: Float64Array }`:
     - Let $m = \max(0, \text{cellIndices.length} - 1)$. Allocate `cumulativeHorizM = new Float64Array(m + 1)` and `cumulativeSurfaceM = new Float64Array(m + 1)`.
     - For each edge $j \in \{1, \dots, m\}$ connecting $u = k_{j-1}$ to $v = k_j$:
       - Compute planar distance $d_j = \sqrt{((c_v - c_u)\Delta x)^2 + ((r_u - r_v)\Delta y)^2}$.
       - Compute $\Delta z_j = z[v] - z[u]$ and 3D surface step $d_{3\text{D}, j} = \sqrt{d_j^2 + (\Delta z_j)^2}$.
       - Compute along-edge grade in degrees $g_{\text{deg}, j} = \arctan(|\Delta z_j| / d_j) \cdot \frac{180}{\pi}$ and neighborhood slope $s_j = \max(s[u], s[v])$.
       - Compute grade-adjusted display speed (post-solve display metric ONLY, never used inside A*):
         $$v_{\text{eff}, j} = \frac{v_{\text{sim}}}{1 + \kappa_{\text{grade}}\left(\frac{\max(g_{\text{deg}, j}, s_j)}{\theta_{\text{maxSlope}}}\right)^2}, \qquad \Delta t_{\text{grade}, j} = \frac{d_{3\text{D}, j}}{v_{\text{eff}, j}}$$
     - Compute `estimatedTimeS = (surfaceDistanceM / profile.nominalWalkingSpeedMps) + scienceStopDurationS` and `gradeAdjustedTimeS = sumGradeTimeS + scienceStopDurationS`.
- **Unit Tests (`tests/routing/t20-metrics-distance.test.ts`):**
  - Verifies 0-edge same-cell path (`[12]`): `horizontalDistanceM === 0`, `surfaceDistanceM === 0`, `estimatedTimeS === scienceStopDurationS`.
  - Verifies that on a sloped path, `horizontalDistanceM <= surfaceDistanceM <= horizontalDistanceM * (1 / Math.cos(20 * Math.PI / 180)) + 1e-9`.
  - Verifies that a flat detour around a $19^\circ$ ridge can have a larger `estimatedTimeS` yet a smaller `gradeAdjustedTimeS`.
- **Verification Commands:**
  ```powershell
  npx tsc --noEmit
  npx vitest run tests/routing/t20-metrics-distance.test.ts
  ```

---

### Task 21 (T21): Cumulative Ascent/Descent, Slope/Grade Extremes & Elevation Profile Builder

- **Prerequisite:** `T01` (`codex/routing-base`) ONLY.
- **Worktree / Branch:** `..\mars-t21-metrics-elevation` / `codex/routing-t21-metrics-elevation`
- **Owned Files:**
  - `src/routing/metricsElevation.ts`
  - `tests/routing/t21-metrics-elevation.test.ts`
- **Plan & Research References:**
  - [docs/metrics-and-explanations.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/metrics-and-explanations.md#L23-L84) (Sections 1.2, 2.2–2.4: Vertical Coastline Paradox, Telescoping Net-Elevation Identity, Slope vs. Grade Extremes, and Cumulative-Distance Profile)
- **Step-by-Step Implementation Instructions for Hydrogen Model:**
  1. Export `computeElevationAndSlopeMetrics(bundle: RegionRoutingBundle, cellIndices: number[], profile: ConstraintProfile): { cumulativeAscentM: number; cumulativeDescentM: number; netElevationChangeM: number; maxTerrainSlopeDeg: number; maxTerrainSlopeAtDistanceM: number; maxTerrainSlopeCellIndex: number; maxRouteGradeDeg: number; maxUphillGradeDeg: number; maxDownhillGradeDeg: number; maxRouteGradeAtDistanceM: number; integratedTerrainPenaltyCostM: number; integratedRoughnessPenaltyCostM: number; gridSpacingM: { dx: number; dy: number }; slopeBaselineM: { eastM: number; northM: number }; elevationProfile: ElevationProfilePoint[] }`:
     - Enforce the exact telescoping identity:
       $$\Delta Z_{\text{ascent}} = \sum_{j=1}^{m} \max(0, \Delta z_j), \qquad \Delta Z_{\text{descent}} = \sum_{j=1}^{m} \max(0, -\Delta z_j), \qquad \Delta Z_{\text{net}} = z[k_m] - z[k_0]$$
     - Track `maxTerrainSlopeDeg` across all vertices $i \in \{0, \dots, m\}$ and `maxRouteGradeDeg`, `maxUphillGradeDeg`, `maxDownhillGradeDeg` across all edges $j \in \{1, \dots, m\}$ ($0^\circ$ when $m = 0$).
     - Compute `integratedTerrainPenaltyCostM` $= \sum_{j=1}^m d_j (2 S_j + 1 R_j)$ and `integratedRoughnessPenaltyCostM` $= \sum_{j=1}^m d_j R_j$ for comparative explanation clauses.
     - Always populate `gridSpacingM: { dx: bundle.cellSpacingEastM, dy: bundle.cellSpacingNorthM }` and `slopeBaselineM: { eastM: 2 * bundle.cellSpacingEastM, northM: 2 * bundle.cellSpacingNorthM }`.
- **Unit Tests (`tests/routing/t21-metrics-elevation.test.ts`):**
  - Asserts `Math.abs((cumulativeAscentM - cumulativeDescentM) - netElevationChangeM) <= 1e-6` on multi-step oscillating Martian elevation profiles (`z = [-2540, -2535, -2538, -2532]`).
  - Verifies `elevationProfile.length === cellIndices.length` and `incomingGradeDeg === 0` at `sampleIndex === 0`.
- **Verification Commands:**
  ```powershell
  npx tsc --noEmit
  npx vitest run tests/routing/t21-metrics-elevation.test.ts
  ```

---

### Task 22 (T22): Corner-Aware Length-Weighted Quality Exposure & RLE Interval Builder

- **Prerequisite:** `T01` (`codex/routing-base`) ONLY.
- **Worktree / Branch:** `..\mars-t22-metrics-quality` / `codex/routing-t22-metrics-quality`
- **Owned Files:**
  - `src/routing/metricsQuality.ts`
  - `tests/routing/t22-metrics-quality.test.ts`
- **Plan & Research References:**
  - [docs/metrics-and-explanations.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/metrics-and-explanations.md#L88-L103) (Section 2.5: Length-Weighted Quality Exposure & Run-Length Encoded Intervals)
- **Step-by-Step Implementation Instructions for Hydrogen Model:**
  1. Export `computeQualityExposureMetrics(bundle: RegionRoutingBundle, cellIndices: number[]): { lowQualityDistanceM: number; lowQualityPct: number; unknownQualityDistanceM: number; unknownQualityPct: number; acceptableQualityDistanceM: number; acceptableQualityPct: number; weightedUncertaintyExposureM: number; qualityIntervals: QualityExposureInterval[] }`:
     - For each edge $e_j = (u \to v)$ of planar length $d_j$:
       - If cardinal, let $Q(e_j) = \{q[u], q[v]\}$.
       - If diagonal, let $w_1 = (r_u, c_v)$ and $w_2 = (r_v, c_u)$ and set $Q(e_j) = \{q[u], q[v], q[w_1], q[w_2]\}$ (matching the cost model's corner-aware rule!).
       - Classify `edgeClass`: if `QUALITY_CODE.LOW` ($2$) $\in Q(e_j)$ $\to$ `'low'`; else if `QUALITY_CODE.UNKNOWN` ($1$) $\in Q(e_j)$ $\to$ `'unknown'`; else `'acceptable'`.
     - Sum $D_{\text{low}}, D_{\text{unknown}}, D_{\text{acceptable}}$ and compute `weightedUncertaintyExposureM` $= 1.0 \cdot D_{\text{low}} + 0.75 \cdot D_{\text{unknown}}$.
     - Guard $D_{\text{horiz}} = 0$ (0-edge same-cell route): return `0` for all percentages (`lowQualityPct = 0`, `unknownQualityPct = 0`, `acceptableQualityPct = 0`, never `NaN`!).
     - Merge consecutive edges with identical `edgeClass` into contiguous RLE `QualityExposureInterval[]`.
- **Unit Tests (`tests/routing/t22-metrics-quality.test.ts`):**
  - Same-cell route `[12]` returns `0` for all distances and percentages and `qualityIntervals: []`.
  - Diagonal step clipping a `LOW` orthogonal corner reports its full $10\sqrt{2}\text{ m}$ length under `lowQualityDistanceM`.
  - Contiguous runs merge into compact RLE intervals whose `lengthM` sum equals `horizontalDistanceM`.
- **Verification Commands:**
  ```powershell
  npx tsc --noEmit
  npx vitest run tests/routing/t22-metrics-quality.test.ts
  ```

---

### Task 23 (T23): 3D Saddle-Quad Diagonal Surface Draping Geometry Builder

- **Prerequisite:** `T01` (`codex/routing-base`) ONLY.
- **Worktree / Branch:** `..\mars-t23-draping-3d` / `codex/routing-t23-draping-3d`
- **Owned Files:**
  - `src/routing/draping3d.ts`
  - `tests/routing/t23-draping-3d.test.ts`
- **Plan & Research References:**
  - [docs/maths.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/maths.md#L121-L132) (Finding 9: Diagonal Saddle-Quad Surface Draping Rule for 3D Rendering)
  - [docs/verification-and-handoff.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/verification-and-handoff.md#L203-L205) (Fixture `F12` Subtest C: Saddle-Quad Diagonal Midpoint Draping)
- **Step-by-Step Implementation Instructions for Hydrogen Model:**
  1. Export `export type MeshQuadDiagonalSplit = 'ne_sw' | 'nw_se'`.
  2. Export `buildDraped3DRoutePolyline(bundle: RegionRoutingBundle, cellIndices: number[], options?: { verticalExaggeration?: number; hoverOffsetM?: number; refElevationM?: number; quadSplit?: MeshQuadDiagonalSplit }): Draped3DPoint[]`:
     - Let $E_z = \text{options?.verticalExaggeration} ?? 1.0$, $\delta_{\text{lift}} = \text{options?.hoverOffsetM} ?? 0.35$, $z_{\text{ref}} = \text{options?.refElevationM} ?? 0.0$.
     - For every vertex $k_i$ ($i = 0 \dots m$): emit the cell-center vertex with `baseElevationM = z[k_i]`, `worldY = (z[k_i] - zRef) * Ez + deltaLift`, `isSubdividedMidpoint: false`.
     - Whenever step $k_{i-1} \to k_i$ is **diagonal** (`Math.abs(r_i - r_{i-1}) === 1 && Math.abs(c_i - c_{i-1}) === 1`):
       - Let $w_1 = (r_{i-1}, c_i)$ and $w_2 = (r_i, c_{i-1})$ be the two orthogonal corner cells of that $2 \times 2$ quad.
       - Compute $z_{\text{edgeMid}} = 0.5 \cdot (z[k_{i-1}] + z[k_i])$ and the opposite diagonal midpoint $z_{\text{oppMid}} = 0.5 \cdot (z[w_1] + z[w_2])$.
       - Set the draped quad-center base height to:
         $$z_{\text{drapedMid}} = \max(z_{\text{edgeMid}}, \; z_{\text{oppMid}})$$
       - Insert a subdivided midpoint vertex `(eastMid, northMid, baseElevationM: zDrapedMid, worldY: (zDrapedMid - zRef) * Ez + deltaLift, isSubdividedMidpoint: true)` between $k_{i-1}$ and $k_i$ so the 3D route polyline never tunnels beneath the opposite triangle diagonal on a saddle quad at $1\times$ or exaggerated $E_z$!
- **Unit Tests (`tests/routing/t23-draping-3d.test.ts`):**
  - **Finding 9 Regression Test ($2 \times 2$ Saddle Quad):** Sets $z_{00} = 0\text{ m}, z_{11} = 0\text{ m}, z_{01} = 10\text{ m}, z_{10} = 10\text{ m}$. Verifies that for diagonal step $(0,0) \to (1,1)$, the inserted midpoint has `baseElevationM === 10.0` (never $0.0$, which would be $5\text{ m}$ underground at $1\times$ and $15\text{ m}$ underground at $3\times$), and at $E_z = 3, \delta_{\text{lift}} = 0.35$, `worldY === 30.35` vs. mesh midpoint $30.0$.
- **Verification Commands:**
  ```powershell
  npx tsc --noEmit
  npx vitest run tests/routing/t23-draping-3d.test.ts
  ```

---

### Task 24 (T24): Multi-Policy Path Deduplicator & Equivalence Topology Classifier

- **Prerequisite:** `T01` (`codex/routing-base`) ONLY.
- **Worktree / Branch:** `..\mars-t24-deduplicate` / `codex/routing-t24-deduplicate`
- **Owned Files:**
  - `src/routing/deduplicate.ts`
  - `tests/routing/t24-deduplicate.test.ts`
- **Plan & Research References:**
  - [docs/metrics-and-explanations.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/metrics-and-explanations.md#L106-L119) (Finding 7: Section 3 Policy Deduplication & Full vs. Subset Policy Requests)
- **Step-by-Step Implementation Instructions for Hydrogen Model:**
  1. Export `areCellPathsIdentical(pathA: number[], pathB: number[]): boolean` checking `pathA.length === pathB.length && pathA.every((v, i) => v === pathB[i])`.
  2. Export `deduplicatePolicyPaths(requestedPolicies: PolicyId[], solvedByPolicy: Partial<Record<PolicyId, SinglePolicySolveResult>>): { groups: Array<{ candidateId: string; matchedPolicies: PolicyId[]; primaryPolicy: PolicyId; solveResult: SinglePolicySolveResult }>; equivalenceTopology: EquivalenceTopology }`:
     - Canonical display order of policies is `['shortest', 'terrain', 'uncertainty']` filtered to **only** those policies present in `requestedPolicies` and succeeded in `solvedByPolicy` (never injecting an unrequested policy into `matchedPolicies`!).
     - Merge policies with identical `cellIndices` into one group.
     - If all 3 policies (`shortest`, `terrain`, `uncertainty`) were requested and succeeded, classify into the exact 5 topologies (`case_1_all_three_merged`, `case_2_terrain_uncertainty_merged`, `case_3_shortest_terrain_merged`, `case_4_shortest_uncertainty_merged`, `case_5_all_three_distinct`). Otherwise return `'subset_request'`.
- **Unit Tests (`tests/routing/t24-deduplicate.test.ts`):**
  - Verifies all 5 three-policy equivalence topologies.
  - **Finding 7 Regression Test:** When `requestedPolicies = ['uncertainty']`, returns `equivalenceTopology: 'subset_request'` and `matchedPolicies: ['uncertainty']` without requiring `'terrain'` or `'shortest'`.
- **Verification Commands:**
  ```powershell
  npx tsc --noEmit
  npx vitest run tests/routing/t24-deduplicate.test.ts
  ```

---

### Task 25 (T25): Round-Trip Return-Leg Builder & Asymmetric Profile Validator

- **Prerequisite:** `T01` (`codex/routing-base`) ONLY.
- **Worktree / Branch:** `..\mars-t25-return-leg` / `codex/routing-t25-return-leg`
- **Owned Files:**
  - `src/routing/returnLeg.ts`
  - `tests/routing/t25-return-leg.test.ts`
- **Plan & Research References:**
  - [docs/metrics-and-explanations.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/metrics-and-explanations.md#L120-L128) (Section 4: Round-Trip Return Journeys `returnToStart: true`)
  - [docs/efficiency.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/efficiency.md#L56-L59) (Section 2.5: Return-Leg Reversal Under Symmetric Costs)
- **Step-by-Step Implementation Instructions for Hydrogen Model:**
  1. Export `buildReturnLeg(params: { bundle: RegionRoutingBundle; outboundCellIndices: number[]; profile: ConstraintProfile; qualityMode: QualityMode; edgeEvaluator: Pick<EdgeEvaluatorPort, 'isEdgeAdmissible'>; computeMetrics: (cellIndices: number[]) => RouteMetrics; resolveReturnPathIfAsymmetric?: () => SinglePolicySolveResult }): ReturnLegResult`:
     - Reverse the outbound sequence: `reversed = [...outboundCellIndices].reverse()`.
     - Check whether every step in `reversed` is admissible under `(profile, qualityMode)` via `edgeEvaluator.isEdgeAdmissible`.
     - Under symmetric `educational-eva-v1`, `reversed` is always admissible: return `{ status: 'complete', cellIndices: reversed, polylineMeters, metrics: computeMetrics(reversed) }` (where $\Delta Z_{\text{ascent, return}} \equiv \Delta Z_{\text{descent, outbound}}$ and $\Delta Z_{\text{descent, return}} \equiv \Delta Z_{\text{ascent, outbound}}$).
     - If an asymmetric directional profile causes `reversed` to fail admissibility, call `resolveReturnPathIfAsymmetric?.()`; if no admissible return path exists, return `{ status: 'incomplete_round_trip', cellIndices: [], polylineMeters: [], failureReason: 'RETURN_PATH_INFEASIBLE_UNDER_DIRECTIONAL_GRADE_LIMIT' }`.
- **Unit Tests (`tests/routing/t25-return-leg.test.ts`):**
  - Verifies that under `educational-eva-v1`, outbound ascent and descent swap on the reversed return leg (`returnMetrics.cumulativeAscentM === outboundMetrics.cumulativeDescentM`).
  - Verifies that an asymmetric profile (`maxUphillGradeDeg: 20, maxDownhillGradeDeg: 10`) on a $15^\circ$ outbound climb triggers `resolveReturnPathIfAsymmetric` or returns `status: 'incomplete_round_trip'`.
- **Verification Commands:**
  ```powershell
  npx tsc --noEmit
  npx vitest run tests/routing/t25-return-leg.test.ts
  ```

---

### Task 26 (T26): Deterministic Signed-Delta Explanation Engine

- **Prerequisite:** `T01` (`codex/routing-base`) ONLY.
- **Worktree / Branch:** `..\mars-t26-explanations` / `codex/routing-t26-explanations`
- **Owned Files:**
  - `src/routing/explanations.ts`
  - `tests/routing/t26-explanations.test.ts`
- **Plan & Research References:**
  - [docs/metrics-and-explanations.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/metrics-and-explanations.md#L130-L184) (Finding 6: Section 5 Deterministic Signed-Delta Explanation Engine — Clause Builders 1, 2, 3 and Templates 1a–5)
  - [docs/verification-and-handoff.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/verification-and-handoff.md#L148-L176) (`F08` equal-length clause and `F09` `LOW`-for-`UNKNOWN` trade-off clause)
- **Step-by-Step Implementation Instructions for Hydrogen Model:**
  1. Export the three pure signed-delta clause builders:
     - `formatDistanceDelta(distBM: number, distAM: number): string`:
       - Let $\Delta D = \text{distBM} - \text{distAM}$.
       - If $\Delta D > 1e-4$: `"adds {deltaDistM} m (+{deltaDistPct}%)"`.
       - If $\Delta D < -1e-4$: `"takes a {absDeltaDistM} m (-{absDeltaDistPct}%) shorter corridor"`.
       - Else ($|\Delta D| \le 1e-4$): `"follows an equal-length {distBM} m alternative corridor"`.
     - `formatTerrainDelta(metricsB: RouteMetrics, metricsA: RouteMetrics): string`:
       - Branch T1 ($\theta_{\text{maxSlope}}(B) < \theta_{\text{maxSlope}}(A) - 1e-4$): `"to reduce maximum modeled terrain slope from {slopeADeg}° to {slopeBDeg}°"` (plus roughness reduction if $C_R(B) < C_R(A) - 1e-4$).
       - Branch T2 ($|\Delta \theta_{\text{maxSlope}}| \le 1e-4$ and $C_{SR}(B) < C_{SR}(A) - 1e-4$): `"to reduce cumulative slope and roughness exposure from {srPenaltyA} to {srPenaltyB} cost-m (at {slopeBDeg}° max slope)"`.
       - Branch T3 ($\theta_{\text{maxSlope}}(B) > \theta_{\text{maxSlope}}(A) + 1e-4$ and $C_{SR}(B) < C_{SR}(A) - 1e-4$): `"accepting a higher single-cell peak slope ({slopeADeg}° → {slopeBDeg}°) to reduce cumulative weighted slope/roughness exposure from {srPenaltyA} to {srPenaltyB} cost-m"`.
     - `formatQualityDelta(metricsB: RouteMetrics, metricsA: RouteMetrics): string`:
       - Branch Q1 (non-increasing in both `LOW` and `UNKNOWN`, strict reduction in at least one): report `LOW` and/or `UNKNOWN` reductions separately.
       - Branch Q2 (`LOW`-for-`UNKNOWN` trade-off: $\Delta D_{\text{low}} < -1e-4$ and $\Delta D_{\text{unknown}} > 1e-4$ with $\Delta W_U < -1e-4$): `"to reduce high-penalty low-confidence exposure from {lowAM} m ({lowAPct}%) to {lowBM} m ({lowBPct}%) by routing through {unkBM} m ({unkBPct}%) of unknown-quality terrain (vs. {unkAM} m), lowering weighted observation-uncertainty exposure from {weightedUA} to {weightedUB} m-eq"`.
       - Append `"while crossing a {slopeBDeg}° max-slope corridor (vs. {slopeADeg}° on the terrain route)"` when $\theta_{\text{maxSlope}}(B) > \theta_{\text{maxSlope}}(A) + 1e-4$.
  2. Export `buildCandidateExplanations(params: { candidates: Array<{ matchedPolicies: PolicyId[]; metrics: RouteMetrics }>; equivalenceTopology: EquivalenceTopology; profile: ConstraintProfile; qualityMode: QualityMode; effectiveWeights: Record<PolicyId, EffectivePolicyWeights>; uniformQualityClass: QualityClass | null }): RouteExplanation[]` implementing Templates 1a, 1b, 2, 3a, 3b, 4, and 5 (including standalone single-policy requests).
- **Unit Tests (`tests/routing/t26-explanations.test.ts`):**
  - **Finding 6 Regression 1 (`F08` Equal-Length North vs. South):** Both North (`terrain`) and South (`uncertainty`) have `horizontalDistanceM = 48.284271`. Asserts explanation contains `"follows an equal-length 48.3 m alternative corridor"` and `"while crossing a 5.0° max-slope corridor (vs. 0.0° on the terrain route)"`, never `"adds 0.0 m"`.
  - **Finding 6 Regression 2 (`LOW`-for-`UNKNOWN` Trade-Off):** Asserts Branch Q2 wording when `LOW` drops $20\text{ m} \to 0\text{ m}$ and `UNKNOWN` rises $20\text{ m} \to 48.28\text{ m}$.
  - **Finding 6 Regression 3 (Higher Peak Slope Accepted for Lower Integrated Terrain Penalty):** Asserts Branch T3 wording.
  - **Finding 6 Regression 4 (Shorter Uncertainty Corridor $\Delta D < 0$):** Asserts `"takes a ... shorter corridor"`.
- **Verification Commands:**
  ```powershell
  npx tsc --noEmit
  npx vitest run tests/routing/t26-explanations.test.ts
  ```

---

## Wave 5: Concurrency Mutex, Stateful Routing Engine, Web Worker & Client Adapter (Depend ONLY on T01)

### Task 27 (T27): Single-Active-Owner Workspace Mutex, Epoch Cancellation & Unified Request Deadline

- **Prerequisite:** `T01` (`codex/routing-base`) ONLY.
- **Worktree / Branch:** `..\mars-t27-mutex` / `codex/routing-t27-mutex`
- **Owned Files:**
  - `src/routing/mutex.ts`
  - `tests/routing/t27-mutex.test.ts`
- **Plan & Research References:**
  - [docs/search-and-worker-execution.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/search-and-worker-execution.md#L159-L220) (Finding 5: Section 5.3 Serialized Single-Owner Workspace Execution & Unified Request Deadline)
- **Step-by-Step Implementation Instructions for Hydrogen Model:**
  1. Export class `AsyncWorkspaceMutex`:
     - Tracks `private activeTaskEpoch = 0`, `private activeRequestId: string | null = null`, and `private queueChain: Promise<void> = Promise.resolve()`.
     - `supersedeAndEnqueue<T>(requestId: string | null, task: (context: { readonly epoch: number; isCancelled: () => boolean }) => Promise<T> | T): Promise<T>`:
       - Immediately increments `this.activeTaskEpoch++` and sets `this.activeRequestId = requestId` so any currently suspended yielded search sees `isCancelled() === true` the instant its `MessageChannel` continuation wakes up!
       - Chains `task` onto `this.queueChain` so `task` **never starts** until the previous task has resumed from its `await` and exited `SolverWorkspace`.
     - `cancelRequest(requestId: string): boolean`: if `this.activeRequestId === requestId`, increments `this.activeTaskEpoch++`, sets `this.activeRequestId = null`, and returns `true`.
  2. Export `createYieldChannel(): () => Promise<void>` using `MessageChannel` (`port1`/`port2`) with a `setImmediate` / `setTimeout(..., 0)` fallback.
  3. Export `createUnifiedDeadline(timeoutMs = 5000, nowFn: () => number = () => performance.now())` returning `{ readonly deadlineMs: number; isTimedOut: () => boolean; elapsedMs: () => number }` shared across component labeling, all policy solves, and post-solve metric assembly.
- **Unit Tests (`tests/routing/t27-mutex.test.ts`):**
  - **Finding 5 Regression Test:** Task A mutates a shared array, yields via `MessageChannel` (`await yieldToEventLoop()`), and checks `isCancelled()` after waking. While Task A is suspended at the `await`, Task B is enqueued via `supersedeAndEnqueue`. Asserts that Task B does **not** begin executing until Task A wakes up, observes `isCancelled() === true`, and exits cleanly—proving zero concurrent mutation of shared state!
- **Verification Commands:**
  ```powershell
  npx tsc --noEmit
  npx vitest run tests/routing/t27-mutex.test.ts
  ```

---

### Task 28 (T28): Stateful Multi-Policy Routing Engine & Clean-Path Reuse Coordinator

- **Prerequisite:** `T01` (`codex/routing-base`) ONLY.
- **Worktree / Branch:** `..\mars-t28-engine` / `codex/routing-t28-engine`
- **Owned Files:**
  - `src/routing/engine.ts`
  - `tests/routing/t28-engine.test.ts`
- **Plan & Research References:**
  - [docs/search-and-worker-execution.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/search-and-worker-execution.md#L121-L157) (Findings 1, 5, 7: Section 5.2 Execution Order, Effective Uniform-Quality Override, Clean-Path Reuse & Standalone Policy Requests)
  - [docs/admissibility-and-cost-model.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/admissibility-and-cost-model.md#L147-L163) (Standalone `['uncertainty']` execution)
- **Step-by-Step Implementation Instructions for Hydrogen Model:**
  1. Export class `RoutingEngine` parameterized by structural ports (`EngineDependenciesPort`) so it compiles and tests standalone off `T01` while accepting the real modules in `T40`.
  2. Maintain `loadedBundle: RegionRoutingBundle | null`, `workspace: SolverWorkspacePort | null`, and cached component maps keyed by `${profile.profileId}|${qualityMode}|${profile.maxTerrainSlopeDeg}|${profile.maxRouteGradeDeg}`.
  3. In `planRoutes(request: RouteRequest, options?: { isCancelled?: () => boolean; isTimedOut?: () => boolean })`:
     - Run bundle & request validation (Stages 0–3), endpoint normalization & canonical 7-priority cell exclusion (Stages 4–5), and same-cell shortcut (Stage 6).
     - Resolve `effectiveWeights` (`uniformQualityOverride: true` and $\gamma_{\text{eff}} = 0$ when $U_{\max} = U_{\min}$ across admissible cells).
     - Lazily compute connected components for `(profile, qualityMode)` inside the unified request deadline; if `componentId[start] !== componentId[goal]`, return `status: 'no_path'` (`reasonCode: qualityMode === 'strict' ? 'STRICT_QUALITY_BLOCKED' : 'DISCONNECTED_COMPONENTS'`).
     - Evaluate **only the requested policies** in the relative order `['terrain', 'uncertainty', 'shortest'].filter(p => request.policies.includes(p))`:
       - **Case A (`p === 'uncertainty'` and `'terrain'` was already solved in this request):**
         - If `uniformQualityOverride === true` ($\gamma_{\text{eff}} = 0$): reuse `terrain`'s solved path/cost and attach `'UNIFORM_QUALITY_NO_DIFFERENTIATION'`.
         - Else if every edge of `terrain`'s path has corner-aware $U(e) = 0$: reuse `terrain`'s path/cost (true cost-preserving reuse since $C_{\text{unc}}(P_{\text{terr}}) = C_{\text{terr}}(P_{\text{terr}})$) and attach `'TERRAIN_ALREADY_OPTIMAL_FOR_UNCERTAINTY'`.
         - Else run A* for `uncertainty` with $\gamma_{\text{eff}} = 2$.
       - **Case B (`p === 'uncertainty'` and `'terrain'` was NOT requested — Finding 7):**
         - Run A* directly for `uncertainty` using its effective weight vector $(\alpha=2, \beta=1, \gamma_{\text{eff}})$. If `uniformQualityOverride === true`, attach `'UNIFORM_QUALITY_NO_DIFFERENTIATION'`. Never fail on a missing `terrain` result or inject `'terrain'` into `matchedPolicies`!
- **Unit Tests (`tests/routing/t28-engine.test.ts`):**
  - Verifies policy execution order `terrain -> uncertainty -> shortest`.
  - Verifies uniform-quality reuse ($\gamma_{\text{eff}} = 0$), clean-path reuse ($U(e) = 0$), standalone `policies: ['uncertainty']` without `'terrain'`, and partial-policy success when timeout occurs before `'shortest'`.
- **Verification Commands:**
  ```powershell
  npx tsc --noEmit
  npx vitest run tests/routing/t28-engine.test.ts
  ```

---

### Task 29 (T29): Web Worker Message Transport Wrapper

- **Prerequisite:** `T01` (`codex/routing-base`) ONLY.
- **Worktree / Branch:** `..\mars-t29-route-worker` / `codex/routing-t29-route-worker`
- **Owned Files:**
  - `src/routing/route.worker.ts`
  - `tests/routing/t29-route-worker.test.ts`
- **Plan & Research References:**
  - [docs/search-and-worker-execution.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/search-and-worker-execution.md#L159-L220) (Section 5.1 & 5.3: Non-detaching bundle copy & serialized single-owner worker queue)
  - External: [MDN Structured Clone Algorithm](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm)
- **Step-by-Step Implementation Instructions for Hydrogen Model:**
  1. Export discriminated union worker message types:
     - `WorkerInboundMessage`: `{ type: 'LOAD_BUNDLE'; requestId: string; bundle: RegionRoutingBundle }` | `{ type: 'PLAN_ROUTE'; request: RouteRequest }` | `{ type: 'CANCEL_REQUEST'; requestId: string }`.
     - `WorkerOutboundMessage`: `{ type: 'BUNDLE_LOADED'; requestId: string; ok: boolean; error?: RouteResponse }` | `{ type: 'ROUTE_RESULT'; requestId: string; response: RouteResponse }`.
  2. Export `createWorkerMessageHandler(enginePort: { loadBundle(b: RegionRoutingBundle): { ok: boolean; error?: RouteResponse }; planRoutes(req: RouteRequest, hooks: { isCancelled: () => boolean; isTimedOut: () => boolean }): Promise<RouteResponse> | RouteResponse }, postMessageFn: (msg: WorkerOutboundMessage) => void)` serializing all `LOAD_BUNDLE` and `PLAN_ROUTE` operations so a superseding request increments the epoch and waits for any suspended yielded task to exit before touching the engine.
- **Unit Tests (`tests/routing/t29-route-worker.test.ts`):**
  - Verifies `LOAD_BUNDLE`, `PLAN_ROUTE`, and `CANCEL_REQUEST` message flow and confirms that overlapping `PLAN_ROUTE` messages during a yielded search never execute concurrently.
- **Verification Commands:**
  ```powershell
  npx tsc --noEmit
  npx vitest run tests/routing/t29-route-worker.test.ts
  ```

---

### Task 30 (T30): Promise-Based Worker Client with In-Process Headless Fallback

- **Prerequisite:** `T01` (`codex/routing-base`) ONLY.
- **Worktree / Branch:** `..\mars-t30-route-client` / `codex/routing-t30-route-client`
- **Owned Files:**
  - `src/routing/routeClient.ts`
  - `tests/routing/t30-route-client.test.ts`
- **Plan & Research References:**
  - [docs/independent-workflow-and-merge-strategy.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/independent-workflow-and-merge-strategy.md#L51-L85) (Headless verification without browser and non-detaching `postMessage`)
- **Step-by-Step Implementation Instructions for Hydrogen Model:**
  1. Export class `RoutePlannerClient`:
     - Accepts either a Web Worker factory `() => WorkerLike` or an in-process engine adapter (used automatically in Node/Vitest when `Worker` is not provided).
     - **Critical Rule:** In `loadBundle(bundle)`, call `worker.postMessage({ type: 'LOAD_BUNDLE', requestId, bundle })` **without** passing a transfer list (`[bundle.elevationM.buffer, ...]`), so the main thread's 2D Leaflet map and 3D Three.js terrain view never have their `ArrayBuffer`s detached!
     - When a new `planRoute(request)` call arrives while an older request is still pending on the client, automatically send `{ type: 'CANCEL_REQUEST', requestId: previousRequestId }` and resolve the older promise with `{ status: 'cancelled', requestId: previousRequestId }`.
- **Unit Tests (`tests/routing/t30-route-client.test.ts`):**
  - Verifies that `loadBundle` leaves `bundle.elevationM.byteLength > 0` on the caller side (buffer is never detached!).
  - Verifies automatic superseding cancellation when two rapid `planRoute` calls are made.
- **Verification Commands:**
  ```powershell
  npx tsc --noEmit
  npx vitest run tests/routing/t30-route-client.test.ts
  ```

---

## Wave 6: The 12 Canonical Hand-Computable Synthetic Fixtures & Verification Suites (Depend ONLY on T01)

> **Independence Rule for Fixture Tasks (`T31`–`T39`):**
> Every fixture task `T31`–`T39` branches **directly from `T01` (`codex/routing-base`)** and imports types/constants **only** from `src/contracts/routing.ts` and `src/routing/types.ts`. Each fixture file (`tests/fixtures/fXX.ts`) exports both the `RegionRoutingBundle` generator and a self-contained reference evaluator so its paired test (`tests/routing/t3X-*.test.ts`) compiles and verifies all hand-computed numbers immediately on a clean checkout of `T01` without waiting for `T02`–`T30`!

---

### Task 31 (T31): Fixtures `F01` & `F02` — Flat Jezero Negative Elevations & Single-Gap Wall Barrier

- **Prerequisite:** `T01` (`codex/routing-base`) ONLY.
- **Worktree / Branch:** `..\mars-t31-fixtures-f01-f02` / `codex/routing-t31-fixtures-f01-f02`
- **Owned Files:**
  - `tests/fixtures/f01_f02.ts`
  - `tests/routing/t31-f01-f02.test.ts`
- **Plan & Research References:**
  - [docs/verification-and-handoff.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/verification-and-handoff.md#L34-L53) (Fixtures `F01` and `F02` exact hand calculations)
- **Step-by-Step Implementation Instructions for Hydrogen Model:**
  1. In `tests/fixtures/f01_f02.ts`, export `createFixtureF01Bundle()` ($5 \times 5$, $\Delta x = \Delta y = 5\text{ m}$, uniform $z \equiv -2540.0\text{ m}$, $s \equiv 0^\circ$, $r_{\text{norm}} \equiv 0$, $q \equiv \text{ACCEPTABLE}$) and `createFixtureF02Bundle()` ($5 \times 5$, $\Delta x = \Delta y = 10\text{ m}$, column $c = 2$ blocked with `noDataSentinel = -32768` at rows $r \in \{1, 2, 3, 4\}$, leaving only $(r=0, c=2)$ open).
  2. Export the exact expected hand-computed constants:
     - `F01_SUBTEST_A_CARDINAL_M = 20.0` ($(2,0) \to (2,4)$)
     - `F01_SUBTEST_B_DIAGONAL_M = 20 * Math.SQRT2` ($\approx 28.28427125\text{ m}$, $(4,0) \to (0,4)$)
     - `F01_SUBTEST_C_OCTILE_M = 10 * Math.SQRT2 + 10` ($\approx 24.14213562\text{ m}$, $(4,0) \to (2,4)$)
     - `F02_GAP_PATH_CELLS = [10, 6, 1, 2, 3, 8, 14]` ($(2,0) \to (1,1) \to (0,1) \to (0,2) \to (0,3) \to (1,3) \to (2,4)$)
     - `F02_EXPECTED_LENGTH_M = 40 + 20 * Math.SQRT2` ($\approx 68.28427125\text{ m}$, because $(1,2)$ is blocked so diagonals $(1,1) \to (0,2)$ and $(0,2) \to (1,3)$ are forbidden by the no-corner-cutting rule).
- **Unit Tests (`tests/routing/t31-f01-f02.test.ts`):**
  - Verifies `F01` Subtests A, B, C and `F02` exact cell path and cost $40 + 20\sqrt{2} \approx 68.28427125\text{ m}$ to $< 10^{-7}$.
- **Verification Commands:**
  ```powershell
  npx tsc --noEmit
  npx vitest run tests/routing/t31-f01-f02.test.ts
  ```

---

### Task 32 (T32): Fixtures `F03` & `F04` — Diagonal Corner-Cutting Traps & Separated Multi-Cell Basin

- **Prerequisite:** `T01` (`codex/routing-base`) ONLY.
- **Worktree / Branch:** `..\mars-t32-fixtures-f03-f04` / `codex/routing-t32-fixtures-f03-f04`
- **Owned Files:**
  - `tests/fixtures/f03_f04.ts`
  - `tests/routing/t32-f03-f04.test.ts`
- **Plan & Research References:**
  - [docs/verification-and-handoff.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/verification-and-handoff.md#L54-L74) (Fixtures `F03` and `F04`)
- **Step-by-Step Implementation Instructions for Hydrogen Model:**
  1. In `tests/fixtures/f03_f04.ts`, export:
     - `createFixtureF03SubtestABundle()` ($3 \times 3$, $\Delta x = \Delta y = 5\text{ m}$, cell $(r=0, c=1)$ blocked with `NoData`, $(r=1, c=2)$ open): Start $(1,1) \to$ Goal $(0,2)$ must step cardinally $(1,1) \to (1,2) \to (0,2)$ with length $5 + 5 = \mathbf{10.0\text{ m}}$.
     - `createFixtureF03SubtestBBundle()` (both $(0,1)$ and $(1,2)$ blocked): Start $(1,1) \to$ Goal $(0,2)$ returns `no_path`.
     - `createFixtureF04Bundle()` ($7 \times 7$, $\Delta x = \Delta y = 10\text{ m}$, column $c = 3$ is an impassable ridge with $s = 26^\circ > 20^\circ$ for all $r \in \{0..6\}$, Western Basin $c \in \{0,1,2\}$ at $s = 0^\circ$, Eastern Basin $c \in \{4,5,6\}$ at $s = 0^\circ$): Start $(r=3, c=1, k=22) \to$ Goal $(r=3, c=5, k=26)$.
- **Unit Tests (`tests/routing/t32-f03-f04.test.ts`):**
  - Verifies `F03A` ($10.0\text{ m}$), `F03B` (`no_path`), and `F04` (confirms Goal $(3,5)$ has 8 valid $0^\circ$ neighbors with degree $8$, yet is in a distinct connected component from Start $(3,1)$ and returns `no_path`).
- **Verification Commands:**
  ```powershell
  npx tsc --noEmit
  npx vitest run tests/routing/t32-f03-f04.test.ts
  ```

---

### Task 33 (T33): Fixtures `F05` & `F06` — Same-Cell Admissible vs. `INTERPOLATED` Rejection & Corner-Clear Low-Quality Detour

- **Prerequisite:** `T01` (`codex/routing-base`) ONLY.
- **Worktree / Branch:** `..\mars-t33-fixtures-f05-f06` / `codex/routing-t33-fixtures-f05-f06`
- **Owned Files:**
  - `tests/fixtures/f05_f06.ts`
  - `tests/routing/t33-f05-f06.test.ts`
- **Plan & Research References:**
  - [docs/verification-and-handoff.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/verification-and-handoff.md#L75-L103) (Fixtures `F05` Subtests A/B and `F06` Corner-Clear Low-Quality Detour)
- **Step-by-Step Implementation Instructions for Hydrogen Model:**
  1. In `tests/fixtures/f05_f06.ts`, export:
     - `createFixtureF05AdmissibleBundle()` and `createFixtureF05InterpolatedCenterBundle()` ($5 \times 5$, $\Delta x = \Delta y = 5\text{ m}$, where cell $k=12$ at $(2,2)$ has finite $z = -2540\text{ m}, s = 0^\circ$ and `q[12] = QUALITY_CODE.INVALID` in Subtest B).
     - `createFixtureF06Bundle()` ($3 \times 5$, $\Delta x = \Delta y = 10\text{ m}$, flat $s = 0^\circ, r = 0$, center cell $(r=1, c=2, k=7)$ has `q[7] = QUALITY_CODE.LOW` ($U = 1.0$), all other cells `ACCEPTABLE` ($U = 0.0$)).
     - Export `F06_CROSSOVER_GAMMA = Math.SQRT2 - 1` ($\approx 0.41421356$), `F06_DIRECT_PATH = [5, 6, 7, 8, 9]` ($40.0\text{ m}$, $D_{\text{low}} = 20.0\text{ m}$), and `F06_CORNER_CLEAR_DETOUR = [5, 1, 2, 3, 9]` (`[(1,0), (0,1), (0,2), (0,3), (1,4)]`, length $20 + 20\sqrt{2} \approx 48.28427125\text{ m}$, $D_{\text{low}} = 0.0\text{ m}$).
- **Unit Tests (`tests/routing/t33-f05-f06.test.ts`):**
  - Verifies `F05` Subtest A returns `[12]` with $0\text{ m}$ distance and finite `0%` quality percentages (never `NaN`), while `F05` Subtest B rejects the same-cell request in `'prefer'` mode with `status: 'invalid_input'` and `reasonCode: 'INTERPOLATED_OR_UNRELIABLE'`.
  - Verifies `F06` direct path for `shortest`/`terrain` ($40.0\text{ m}$), proves the corner-clipping path `[(1,0),(1,1),(0,2),(1,3),(1,4)]` costs $20 + 60\sqrt{2} \approx 104.852814$ under $\gamma = 2$ due to the diagonal corner-quality rule, and proves `uncertainty` ($\gamma = 2$) selects the true corner-clear detour `[(1,0),(0,1),(0,2),(0,3),(1,4)]` at cost $20 + 20\sqrt{2} \approx 48.28427125$.
- **Verification Commands:**
  ```powershell
  npx tsc --noEmit
  npx vitest run tests/routing/t33-f05-f06.test.ts
  ```

---

### Task 34 (T34): Fixture `F07A` & `F07B` — Derived $12^\circ$ Inclined Plane (`Float64` vs. `Float32`) & Closed-Form $7 \times 9$ Halo Ridge

- **Prerequisite:** `T01` (`codex/routing-base`) ONLY.
- **Worktree / Branch:** `..\mars-t34-fixture-f07` / `codex/routing-t34-fixture-f07`
- **Owned Files:**
  - `tests/fixtures/f07.ts`
  - `tests/routing/t34-f07-derived-ridge.test.ts`
- **Plan & Research References:**
  - [docs/verification-and-handoff.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/verification-and-handoff.md#L105-L127) (Finding 8: `F07A` `Float64` vs. `Float32Array` tolerances and `F07B` Closed-Form $7 \times 9$ Halo Ridge Generator)
- **Step-by-Step Implementation Instructions for Hydrogen Model:**
  1. In `tests/fixtures/f07.ts`, export `createFixtureF07AInclinedPlane(deg = 12)` returning both the unquantized `Float64Array` elevation grid $z(r, c) = -2540.0 + c \cdot 10 \cdot \tan(12^\circ)$ and the serialized `Float32Array` `RegionRoutingBundle` derived via $3\times 3$ Horn slope and plane-fit roughness.
  2. Export `createFixtureF07BDerivedRidgeBundle()` implementing the exact closed-form $7 \times 9$ `Float32Array` halo elevation formula ($\Delta x = \Delta y = 10\text{ m}, R_{\text{scale}} = 0.5\text{ m}$):
     $$z_{\text{halo}}(r_h, c_h) = \begin{cases} -2540.0 & \text{if } r_h \in \{0, 1, 2\} \\ -2535.0 & \text{if } r_h \in \{3, 4, 5, 6\} \text{ and } c_h = 4 \\ -2537.5 & \text{if } r_h \in \{3, 4, 5, 6\} \text{ and } c_h \in \{3, 5\} \\ -2540.0 & \text{otherwise} \end{cases}$$
     Compute $3\times 3$ Horn slope and plane-fit RMS roughness on the $7 \times 9$ `Float32Array` halo and crop the 1-cell border to produce the $5 \times 7$ interior `RegionRoutingBundle`.
- **Unit Tests (`tests/routing/t34-f07-derived-ridge.test.ts`):**
  - **F07A (`Float64` vs. `Float32`):** Asserts `Float64` Horn slope matches $12.0^\circ$ to $\le 10^{-12}\text{ deg}$ and roughness $\le 10^{-12}\text{ m}$, while the `Float32Array` bundle satisfies $|s - 12.0^\circ| \le 10^{-3}\text{ deg}$ and $\sigma_{\text{res}} \le 10^{-4}\text{ m}$.
  - **F07B (Derived Ridge Detour):**
    - Verifies interior Row $0$ has exact `Float32` slope $0.000000^\circ$ and roughness $0.000000\text{ m}$ across all 7 columns.
    - Verifies Start $(r=2, c=0, k=14) \to$ Goal $(r=2, c=6, k=20)$ under `shortest` takes the direct row-2 ridge path `[14, 15, 16, 17, 18, 19, 20]` with cost $\mathbf{60.000000}$, whereas `terrain` and `uncertainty` detour along the flat northern valley floor `[(2,0),(1,0),(0,1),(0,2),(0,3),(0,4),(0,5),(1,6),(2,6)]` (`[14, 7, 1, 2, 3, 4, 5, 13, 20]`) with exact cost $60 + 20\sqrt{2} \approx \mathbf{88.28427125}$ (beating the row-2 `terrain` cost of $121.028990$ and matching Dijkstra to $< 10^{-7}$).
- **Verification Commands:**
  ```powershell
  npx tsc --noEmit
  npx vitest run tests/routing/t34-f07-derived-ridge.test.ts
  ```

---

### Task 35 (T35): Fixture `F08` — Corner-Legal Three-Way Policy Split & Equal-Length Signed Explanation

- **Prerequisite:** `T01` (`codex/routing-base`) ONLY.
- **Worktree / Branch:** `..\mars-t35-fixture-f08` / `codex/routing-t35-fixture-f08`
- **Owned Files:**
  - `tests/fixtures/f08.ts`
  - `tests/routing/t35-f08-three-way-split.test.ts`
- **Plan & Research References:**
  - [docs/verification-and-handoff.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/verification-and-handoff.md#L129-L154) (Fixture `F08`: Corner-Legal Three-Way Policy Split & Equal-Length Signed Explanation)
- **Step-by-Step Implementation Instructions for Hydrogen Model:**
  1. In `tests/fixtures/f08.ts`, export `createFixtureF08Bundle()` ($5 \times 5$, $\Delta x = \Delta y = 10\text{ m}$, zero blocked cells, Start $(2,0, k=10) \to$ Goal $(2,4, k=14)$):
     - Middle Corridor ($r=2$, cells $(2,1),(2,2),(2,3)$): $s = 15^\circ$ ($S = 0.75$), $r_{\text{norm}} = 0.5$ ($R = 0.5$), `ACCEPTABLE` ($U = 0$).
     - North Corridor ($r \in \{0,1\}$): $s = 0^\circ, r_{\text{norm}} = 0$, cells $(0,2)$ and $(1,2)$ have `LOW` quality ($U = 1.0$).
     - South Corridor ($r \in \{3,4\}$): `ACCEPTABLE` quality ($U = 0$), $r_{\text{norm}} = 0$, cells $(3,2)$ and $(4,2)$ have $s = 5^\circ$ ($S = 0.25$).
- **Unit Tests (`tests/routing/t35-f08-three-way-split.test.ts`):**
  - Verifies 3 distinct, corner-legal paths matching Dijkstra to $< 10^{-7}$:
    - `shortest`: Middle `[10, 11, 12, 13, 14]`, length $40.0\text{ m}$, cost $\mathbf{40.0}$.
    - `terrain`: North `[10, 6, 7, 8, 14]`, length $20 + 20\sqrt{2} \approx \mathbf{48.284271\text{ m}}$, cost $\mathbf{48.284271}$ (vs. South $58.284271$ and Middle $120.0$).
    - `uncertainty`: South `[10, 16, 17, 18, 14]`, length $20 + 20\sqrt{2} \approx \mathbf{48.284271\text{ m}}$, cost $20\sqrt{2} + 30 \approx \mathbf{58.284271}$ (vs. North $88.284271$ and Middle $120.0$).
  - Verifies that the `uncertainty` vs. `terrain` explanation uses the **equal-length clause** ($\Delta D_{\text{horiz}} = 0$), never `"adds 0.0 m"`.
- **Verification Commands:**
  ```powershell
  npx tsc --noEmit
  npx vitest run tests/routing/t35-f08-three-way-split.test.ts
  ```

---

### Task 36 (T36): Fixture `F09` — Uniform-Quality Counterexample ($\gamma_{\text{eff}} = 0$ vs. Raw $\gamma = 2$), Standalone `['uncertainty']` & `LOW`-for-`UNKNOWN` Trade-Off

- **Prerequisite:** `T01` (`codex/routing-base`) ONLY.
- **Worktree / Branch:** `..\mars-t36-fixture-f09` / `codex/routing-t36-fixture-f09`
- **Owned Files:**
  - `tests/fixtures/f09.ts`
  - `tests/routing/t36-f09-uniform-and-mixed-quality.test.ts`
- **Plan & Research References:**
  - [docs/verification-and-handoff.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/verification-and-handoff.md#L156-L176) (Findings 1, 6, 7: Fixture `F09` Subtests A, B, C)
  - [docs/admissibility-and-cost-model.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/admissibility-and-cost-model.md#L121-L163) ($3\times 5$ counterexample $120.0 < 120.710678$ vs. $\gamma_{\text{eff}} = 0$)
- **Step-by-Step Implementation Instructions for Hydrogen Model:**
  1. In `tests/fixtures/f09.ts`, export:
     - `createFixtureF09SubtestACounterexampleBundle()` ($3 \times 5$, $\Delta x = \Delta y = 10\text{ m}$, uniform `UNKNOWN` quality $U \equiv 0.75$ everywhere, center cell $(1,2)$ has $s = 10^\circ \implies S = 0.5$, all other cells $s = 0^\circ$).
     - `createFixtureF09SubtestCMixedUnknownLowBundle()` ($3 \times 5$, $\Delta x = \Delta y = 10\text{ m}$, flat $s = 0^\circ$, center cell $(1,2)$ has `LOW` quality $U = 1.0$, all other cells have `UNKNOWN` quality $U = 0.75$ with zero `ACCEPTABLE` cells).
- **Unit Tests (`tests/routing/t36-f09-uniform-and-mixed-quality.test.ts`):**
  - **Subtest A (Finding 1 Verification):** Confirms that under raw unshifted $\gamma = 2$, direct path `[5,6,7,8,9]` costs $120.0$ while detour `[5,1,2,3,9]` costs $(20+20\sqrt{2})(2.5) \approx 120.710678$, whereas under our **Explicit Effective-Policy Model Rule** ($U_{\max} = U_{\min} = 0.75 \implies \gamma_{\text{eff}} = 0$, `uniformQualityOverride: true`), both `terrain` and `uncertainty` (and Dijkstra under $\gamma_{\text{eff}} = 0$) select the gentler detour `[5,1,2,3,9]` at cost $\mathbf{48.28427125}$ and emit `'UNIFORM_QUALITY_NO_DIFFERENTIATION'`.
  - **Subtest B (Finding 7 Verification):** Calling `planRoutes` with standalone `policies: ['uncertainty']` (without `'terrain'`) succeeds with `matchedPolicies: ['uncertainty']` and cost $48.28427125$.
  - **Subtest C (Unshifted $U$ & `LOW`-for-`UNKNOWN` Explanation):** Confirms that when $(1,2)$ is `LOW` ($1.0$) and all other cells are `UNKNOWN` ($0.75$), adding a single `ACCEPTABLE` cell at corner $(0,4)$ does not change corridor edge costs, and when `uncertainty` detours around `LOW` through `UNKNOWN`, the explanation selects **Branch Q2 (`LOW`-for-`UNKNOWN` Trade-Off)**.
- **Verification Commands:**
  ```powershell
  npx tsc --noEmit
  npx vitest run tests/routing/t36-f09-uniform-and-mixed-quality.test.ts
  ```

---

### Task 37 (T37): Fixture `F10` — `strict` vs. `prefer` Mode, FOM Exclusion Split & $+1000\text{ m}$ Spike Support-Mask Immunity

- **Prerequisite:** `T01` (`codex/routing-base`) ONLY.
- **Worktree / Branch:** `..\mars-t37-fixture-f10` / `codex/routing-t37-fixture-f10`
- **Owned Files:**
  - `tests/fixtures/f10.ts`
  - `tests/routing/t37-f10-quality-modes-and-spike-mask.test.ts`
- **Plan & Research References:**
  - [docs/verification-and-handoff.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/verification-and-handoff.md#L178-L185) (Finding 4: Fixture `F10` Subtests A, B, C)
- **Step-by-Step Implementation Instructions for Hydrogen Model:**
  1. In `tests/fixtures/f10.ts`, export:
     - `createFixtureF10LowBarrierBundle()` ($3 \times 5$, column $c = 2$ has `LOW` quality across all rows $r \in \{0,1,2\}$).
     - `createFixtureF10FomSplitBundle()` (testing `SOURCE_FOM_CODE.INTERPOLATED` vs. `SOURCE_FOM_CODE.MANUALLY_EDITED`).
     - `createFixtureF10InterpolatedSpikeBundle(spikeHeightM = 1000.0)` ($7 \times 7$ grid where cell $(3,3)$ is marked `INTERPOLATED` (`q = INVALID`) and given finite elevation $+1000.0\text{ m}$ while all other cells have $z = -2540.0\text{ m}$ and `ACCEPTABLE` quality).
- **Unit Tests (`tests/routing/t37-f10-quality-modes-and-spike-mask.test.ts`):**
  - **Subtest A:** `prefer` mode succeeds across the `LOW` column; `strict` mode returns `status: 'no_path', reasonCode: 'STRICT_QUALITY_BLOCKED'`.
  - **Subtest B:** `INTERPOLATED` is hard-excluded in `prefer` mode (`INTERPOLATED_OR_UNRELIABLE`), whereas `MANUALLY_EDITED` is admissible (`UNKNOWN`, $U = 0.75$).
  - **Subtest C (Finding 4 Regression):** Applying the Step 0 elevation-support mask before derivatives marks the 8 neighbors touching $(3,3)$ as `UNSUPPORTED_DERIVATIVE` and leaves all non-adjacent cells at exact slope $0.0^\circ$ and roughness $0.0\text{ m}$, proving that changing the `INTERPOLATED` spike from $-2540\text{ m}$ to $+1000\text{ m}$ has **zero effect** on any accepted cell's elevation, slope, or roughness.
- **Verification Commands:**
  ```powershell
  npx tsc --noEmit
  npx vitest run tests/routing/t37-f10-quality-modes-and-spike-mask.test.ts
  ```

---

### Task 38 (T38): Fixture `F11` — Rectangular Cells ($\Delta x = 20\text{ m}, \Delta y = 5\text{ m}$) & Digitization Excess Counterexample

- **Prerequisite:** `T01` (`codex/routing-base`) ONLY.
- **Worktree / Branch:** `..\mars-t38-fixture-f11` / `codex/routing-t38-fixture-f11`
- **Owned Files:**
  - `tests/fixtures/f11.ts`
  - `tests/routing/t38-f11-rectangular-grid.test.ts`
- **Plan & Research References:**
  - [docs/verification-and-handoff.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/verification-and-handoff.md#L187-L192) (Finding 10: Fixture `F11` Subtests A & B)
  - [docs/maths.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/maths.md#L249-L261) (Section 7.1: Square vs. Rectangular Grid Digitization Bounds)
- **Step-by-Step Implementation Instructions for Hydrogen Model:**
  1. In `tests/fixtures/f11.ts`, export `createFixtureF11Bundle()` ($5 \times 5$, $\Delta x = 20\text{ m}, \Delta y = 5\text{ m}$, flat $z = -2540\text{ m}, s = 0^\circ, r = 0, q = \text{ACCEPTABLE}$).
  2. Export `F11_SINGLE_DIAG_M = Math.sqrt(425)` ($\approx 20.61552813\text{ m}$) and `F11_SUBTEST_B_PATH_M = Math.sqrt(425) + 10` ($\approx 30.61552813\text{ m}$ vs. $25.0\text{ m}$ Euclidean).
- **Unit Tests (`tests/routing/t38-f11-rectangular-grid.test.ts`):**
  - **Subtest A:** $(r=3, c=0) \to (r=2, c=1)$ has optimal 8-neighbor length $\sqrt{425} \approx \mathbf{20.61552813\text{ m}}$.
  - **Subtest B (Finding 10 Verification):** $(r=3, c=0) \to (r=0, c=1)$ ($\Delta c = 1, \Delta r = 3$) has Euclidean distance $\sqrt{20^2 + 15^2} = 25.0\text{ m}$ and optimal 8-neighbor length $\sqrt{425} + 10 \approx \mathbf{30.61552813\text{ m}}$ ($+22.4621\% > 8.239\%$), confirming why the $\approx 8.24\%$ unobstructed digitization bound applies only to square cells ($\Delta x = \Delta y$).
- **Verification Commands:**
  ```powershell
  npx tsc --noEmit
  npx vitest run tests/routing/t38-f11-rectangular-grid.test.ts
  ```

---

### Task 39 (T39): Fixture `F12` — Boundary Clamping, Sensitivity Profiles ($15^\circ, 20^\circ, 25^\circ$), Mid-Search Yield Race & 3D Saddle-Quad Draping

- **Prerequisite:** `T01` (`codex/routing-base`) ONLY.
- **Worktree / Branch:** `..\mars-t39-fixture-f12` / `codex/routing-t39-fixture-f12`
- **Owned Files:**
  - `tests/fixtures/f12.ts`
  - `tests/routing/t39-f12-boundaries-yield-draping.test.ts`
- **Plan & Research References:**
  - [docs/verification-and-handoff.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/verification-and-handoff.md#L194-L205) (Findings 5 & 9: Fixture `F12` Subtests A, B, C)
- **Step-by-Step Implementation Instructions for Hydrogen Model:**
  1. In `tests/fixtures/f12.ts`, export:
     - `createFixtureF12SensitivityBundle()` ($5 \times 5$, $\Delta x = \Delta y = 10\text{ m}$, where the direct corridor has $s = 18^\circ$ and a northern detour has $s = 12^\circ$, so `'conservative-15deg'` blocks the direct corridor and forces the northern detour while `'educational-eva-v1'` ($20^\circ$) and `'relaxed-25deg'` ($25^\circ$) allow the direct corridor for `shortest`).
     - `createFixtureF12SaddleQuadBundle()` ($2 \times 2$, $z_{00}=0, z_{11}=0, z_{01}=10, z_{10}=10$).
- **Unit Tests (`tests/routing/t39-f12-boundaries-yield-draping.test.ts`):**
  - **Subtest A:** Verifies SW $(0,0)$ and NE $(L_E, L_N)$ boundary clamping, `DATASET_VERSION_MISMATCH` rejection, and $15^\circ$ vs. $20^\circ$ vs. $25^\circ$ profile corridor switching.
  - **Subtest B (Finding 5 Mid-Search Yield Race):** Runs a search that yields via `MessageChannel` every 8 pops, dispatches a superseding `PLAN_ROUTE` and `LOAD_BUNDLE` while suspended, and verifies that the single-owner mutex prevents concurrent workspace mutation and returns bitwise-identical results to an unyielded run.
  - **Subtest C (Finding 9 Saddle-Quad Draping):** Verifies that diagonal step $(0,0) \to (1,1)$ inserts the quad-center vertex draped to $10.0\text{ m}$ before vertical exaggeration and hover offset while keeping `RouteMetrics` elevations at cell centers.
- **Verification Commands:**
  ```powershell
  npx tsc --noEmit
  npx vitest run tests/routing/t39-f12-boundaries-yield-draping.test.ts
  ```

---

## Wave 7: Post-Merge Barrel Assembly, Full Conformance & Laptop Timing Benchmark Gate

### Task 40 (T40): Public Barrel Assembly (`src/routing/index.ts`), Full 12-Fixture Cross-Module Conformance & Measured Laptop Benchmark

- **Prerequisite:** Executed **after** parallel worktrees `T02`–`T39` have been merged into `codex/routing-base`.
- **Worktree / Branch:** `..\mars-t40-assembly-benchmark` / `codex/routing-t40-assembly-benchmark`
- **Owned Files:**
  - `src/routing/index.ts`
  - `tests/fixtures/routingFixtures.ts`
  - `tests/routing/t40-benchmark-and-assembly.test.ts`
  - `docs/routing-handoff-report.md`
- **Plan & Research References:**
  - [docs/verification-and-handoff.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/verification-and-handoff.md#L1-L225) (Sections 1–4: Full 12-fixture Dijkstra equivalence matrix, laptop timing benchmark protocol, and canonical file locations)
  - [docs/efficiency.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/efficiency.md#L1-L65) (Measuring solve times on the demonstration machine before considering any deferred optimization)
- **Step-by-Step Implementation Instructions for Hydrogen Model:**
  1. **Create `src/routing/index.ts`** re-exporting all public modules from `T01`–`T30` and providing a zero-config `createDefaultRoutingEngine()` factory that wires `bundleValidator`, `grid`, `profiles`, `qualityMapping`, `elevationSupport`, `hornSlope`, `roughness`, `cellAdmissibility`, `endpoints`, `edgeAdmissibility`, `effectiveWeights`, `edgeCost`, `workspace`, `binaryHeap`, `components`, `astar`, `dijkstra`, `pathAudit`, `metricsDistance`, `metricsElevation`, `metricsQuality`, `draping3d`, `deduplicate`, `returnLeg`, `explanations`, `mutex`, `engine`, and `routeClient`.
  2. **Create `tests/fixtures/routingFixtures.ts`** re-exporting all 12 canonical fixtures (`F01`–`F12`) from `f01_f02.ts` through `f12.ts`.
  3. **Create `tests/routing/t40-benchmark-and-assembly.test.ts`:**
     - Runs the integrated `createDefaultRoutingEngine()` across all 12 fixtures (`F01`–`F12`) and asserts all 5 automated Dijkstra oracle equivalence & invariant checks (`status` match, `verifyPathAdmissibility`, $|C_{\text{eff}}(P_{\text{A*}}) - C_{\text{eff}}(P_{\text{Dijkstra}})| \le 10^{-7}$, $\text{exploredNodes}_{\text{A*}} \le \text{exploredNodes}_{\text{Dijkstra}}$, and strict heap transitivity).
     - Runs the $200 \times 200$ ($40{,}000$-cell) Western Jezero synthetic benchmark across 20 representative 3-policy route queries (short, diagonal, 3-way split, and unreachable basin) and measures actual component-labeling initialization time (ms), median solve time (ms), 95th percentile solve time (ms), and worst-case solve time (ms).
  4. **Create `docs/routing-handoff-report.md`** recording the exact measured machine timings from `t40-benchmark-and-assembly.test.ts`, the verified commit SHA, and the complete Gate G0–G6 handoff checklist for Dhani and Roles A, B, and C.
- **Verification Commands:**
  ```powershell
  npm run typecheck
  npm test
  ```

---

## 4. Orchestrator Merge & Verification Runbook

Because Tasks `T02` through `T39` touch **100% disjoint files**, the orchestrator merges all completed worktrees into `codex/routing-base` with zero merge conflicts:

```powershell
cd C:\Users\Ayush\Documents\ChatGPT\mars
git checkout codex/routing-base

# Merge every completed independent worktree branch (T02..T39)
foreach ($branch in (git for-each-ref --format='%(refname:short)' refs/heads/codex/routing-t*)) {
  if ($branch -ne 'codex/routing-t40-assembly-benchmark') {
    Write-Host "Merging $branch ..."
    git merge --no-edit $branch
  }
}

# Verify all individual task tests pass together before running T40
npm run typecheck
npm test
```


---

## 5. Hydrogen-Ready Implementation Blueprints, Numerical Test Tables & Pitfall Checklists (`T02`–`T40`)

This section provides the exact TypeScript function signatures, step-by-step code blueprints, numerical input/output tables, external references, and "Do / Do Not" guardrails so a **Hydrogen** worker subagent can execute any task `T02`–`T40` in a single pass without ambiguity.

---

### Blueprint T02 — `src/routing/bundleValidator.ts`
- **Internal Plan Refs:** [docs/maths.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/maths.md#L15-L38), [docs/team-tasks.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/team-tasks.md#L25-L32)
- **External Refs:** [MDN TypedArray.prototype.length](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypedArray/length), [Number.isFinite](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/isFinite)
- **Exact Code Blueprint:**
  ```ts
  import type { RegionRoutingBundle, RouteRequest, RouteResponse } from '../contracts/routing.js';

  export type BundleValidationOutcome =
    | { ok: true; cellCount: number }
    | { ok: false; error: Extract<RouteResponse, { status: 'data_error' }> };

  export function validateRegionBundle(
    bundle: RegionRoutingBundle | null | undefined,
    requestId = 'bundle-load'
  ): BundleValidationOutcome {
    if (!bundle) {
      return {
        ok: false,
        error: {
          status: 'data_error',
          requestId,
          reasonCode: 'BUNDLE_NOT_LOADED',
          message: 'No RegionRoutingBundle is currently loaded in the routing engine.',
        },
      };
    }
    const { gridWidth, gridHeight, cellSpacingEastM, cellSpacingNorthM, roughnessScaleM } = bundle;
    if (
      !Number.isInteger(gridWidth) ||
      gridWidth <= 0 ||
      !Number.isInteger(gridHeight) ||
      gridHeight <= 0 ||
      !Number.isFinite(cellSpacingEastM) ||
      cellSpacingEastM <= 0 ||
      !Number.isFinite(cellSpacingNorthM) ||
      cellSpacingNorthM <= 0 ||
      !Number.isFinite(roughnessScaleM) ||
      roughnessScaleM <= 0
    ) {
      return {
        ok: false,
        error: {
          status: 'data_error',
          requestId,
          reasonCode: 'INVALID_GRID_DIMENSIONS',
          message: `Invalid grid dimensions or spacing: width=${gridWidth}, height=${gridHeight}, dx=${cellSpacingEastM}, dy=${cellSpacingNorthM}, roughnessScaleM=${roughnessScaleM}.`,
        },
      };
    }
    const expectedCells = gridWidth * gridHeight;
    const requiredArrays: Array<[string, { length: number } | undefined]> = [
      ['elevationM', bundle.elevationM],
      ['terrainSlopeDeg', bundle.terrainSlopeDeg],
      ['roughnessNormalized', bundle.roughnessNormalized],
      ['qualityCode', bundle.qualityCode],
      ['derivativeSupportMask', bundle.derivativeSupportMask],
      ['explicitExclusionMask', bundle.explicitExclusionMask],
      ['sourceFomCode', bundle.sourceFomCode],
    ];
    for (const [name, arr] of requiredArrays) {
      if (arr !== undefined && arr.length !== expectedCells) {
        return {
          ok: false,
          error: {
            status: 'data_error',
            requestId,
            reasonCode: 'ARRAY_LENGTH_MISMATCH',
            message: `Bundle array '${name}' has length ${arr.length}, expected ${expectedCells} (${gridWidth}x${gridHeight}).`,
          },
        };
      }
    }
    return { ok: true, cellCount: expectedCells };
  }

  export function validateRequestAgainstBundle(
    request: RouteRequest,
    bundle: RegionRoutingBundle | null | undefined
  ): BundleValidationOutcome {
    const baseCheck = validateRegionBundle(bundle, request.requestId);
    if (!baseCheck.ok || !bundle) return baseCheck;
    if (request.regionId !== bundle.regionId) {
      return {
        ok: false,
        error: {
          status: 'data_error',
          requestId: request.requestId,
          reasonCode: 'REGION_MISMATCH',
          message: `Request regionId '${request.regionId}' does not match loaded bundle '${bundle.regionId}'.`,
        },
      };
    }
    if (request.datasetVersion !== bundle.datasetVersion) {
      return {
        ok: false,
        error: {
          status: 'data_error',
          requestId: request.requestId,
          reasonCode: 'DATASET_VERSION_MISMATCH',
          message: `Request datasetVersion '${request.datasetVersion}' does not match loaded bundle '${bundle.datasetVersion}'.`,
        },
      };
    }
    return baseCheck;
  }
  ```
- **Hydrogen Pitfall Checklist:**
  - **DO NOT** check `.byteLength === expectedCells`, because `Float32Array.byteLength` is `4 * expectedCells` while `Uint8Array.byteLength` is `1 * expectedCells`. Always check `.length === expectedCells`.
  - **DO** validate optional masks (`derivativeSupportMask`, `explicitExclusionMask`, `sourceFomCode`) whenever they are defined (`!== undefined`).

---

### Blueprint T03 — `src/coordinates/grid.ts`
- **Internal Plan Refs:** [docs/maths.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/maths.md#L39-L57), [docs/project-plan.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/project-plan.md#L219-L246)
- **External Refs:** [GDAL Raster Data Model — Affine GeoTransform](https://gdal.org/user/raster_data_model.html)
- **Exact Code Blueprint:**
  ```ts
  import type { LocalMeterPoint, NormalizedGridPoint } from '../contracts/routing.js';
  import { DIR_IS_DIAG, DIR_DR, DIR_DC } from '../routing/types.js';

  export function rowColToIndex(row: number, col: number, width: number): number {
    return row * width + col;
  }

  export function indexToRowCol(index: number, width: number): { row: number; col: number } {
    const row = Math.floor(index / width);
    const col = index - row * width;
    return { row, col };
  }

  export function cellCenterToLocalMeters(
    row: number,
    col: number,
    height: number,
    dx: number,
    dy: number
  ): LocalMeterPoint {
    return {
      eastM: (col + 0.5) * dx,
      northM: (height - 1 - row + 0.5) * dy,
    };
  }

  export function localMetersToGridPoint(
    point: LocalMeterPoint,
    width: number,
    height: number,
    dx: number,
    dy: number
  ): { ok: true; value: NormalizedGridPoint } | { ok: false; reasonCode: 'OUT_OF_BOUNDS'; message: string } {
    const maxEastM = width * dx;
    const maxNorthM = height * dy;
    if (
      !Number.isFinite(point.eastM) ||
      !Number.isFinite(point.northM) ||
      point.eastM < 0 ||
      point.eastM > maxEastM ||
      point.northM < 0 ||
      point.northM > maxNorthM
    ) {
      return {
        ok: false,
        reasonCode: 'OUT_OF_BOUNDS',
        message: `Point (${point.eastM}, ${point.northM}) lies outside [0, ${maxEastM}] x [0, ${maxNorthM}] m.`,
      };
    }
    const col = Math.min(width - 1, Math.max(0, Math.floor(point.eastM / dx)));
    const row = Math.min(height - 1, Math.max(0, Math.floor((maxNorthM - point.northM) / dy)));
    const cellIndex = row * width + col;
    const center = cellCenterToLocalMeters(row, col, height, dx, dy);
    return {
      ok: true,
      value: {
        requestedEastM: point.eastM,
        requestedNorthM: point.northM,
        col,
        row,
        cellIndex,
        cellCenterEastM: center.eastM,
        cellCenterNorthM: center.northM,
      },
    };
  }

  export function stepPlanarDistanceM(dir: number, dx: number, dy: number): number {
    if (DIR_IS_DIAG[dir] === 1) return Math.hypot(dx, dy);
    return DIR_DR[dir] !== 0 ? dy : dx;
  }
  ```
- **Exact Numerical Test Table (`tests/routing/t03-grid-coordinates.test.ts`):**
  | Grid ($W\times H, \Delta x, \Delta y$) | Input $(E, N)$ | Expected $(r, c, k)$ | Expected Cell Center $(E_c, N_c)$ |
  | :--- | :--- | :--- | :--- |
  | $5\times 5, 5\text{ m}, 5\text{ m}$ | $(0.0, 0.0)$ (SW corner) | $(4, 0, 20)$ | $(2.5, 2.5)$ |
  | $5\times 5, 5\text{ m}, 5\text{ m}$ | $(25.0, 25.0)$ (NE border) | $(0, 4, 4)$ | $(22.5, 22.5)$ |
  | $5\times 5, 5\text{ m}, 5\text{ m}$ | $(11.1, 14.2)$ | $(2, 2, 12)$ | $(12.5, 12.5)$ |
  | $4\times 4, 20\text{ m}, 5\text{ m}$ | $(80.0, 20.0)$ (NE border) | $(0, 3, 3)$ | $(70.0, 17.5)$ |

---

### Blueprint T04 — `src/routing/profiles.ts`
- **Internal Plan Refs:** [docs/admissibility-and-cost-model.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/admissibility-and-cost-model.md#L50-L74), [docs/metrics-and-explanations.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/metrics-and-explanations.md#L9-L22)
- **External Refs:** [NASA Mars Architecture / EVA Mobility Context](https://science.nasa.gov/mission/mars-2020-perseverance/)
- **Exact Code Blueprint:**
  ```ts
  import type { ConstraintProfile, ConstraintProfileId } from '../contracts/routing.js';

  export const DEFAULT_PROFILE_ID: ConstraintProfileId = 'educational-eva-v1';

  export const CONSTRAINT_PROFILES: Readonly<Record<string, ConstraintProfile>> = {
    'educational-eva-v1': {
      profileId: 'educational-eva-v1',
      version: '1.0.0',
      maxTerrainSlopeDeg: 20.0,
      maxRouteGradeDeg: 20.0,
      roughnessScaleM: 0.5,
      nominalWalkingSpeedMps: 0.5,
      gradePenaltyKappa: 1.5,
      isSimulatedAssumption: true,
    },
    'conservative-15deg': {
      profileId: 'conservative-15deg',
      version: '1.0.0',
      maxTerrainSlopeDeg: 15.0,
      maxRouteGradeDeg: 15.0,
      roughnessScaleM: 0.5,
      nominalWalkingSpeedMps: 0.5,
      gradePenaltyKappa: 1.5,
      isSimulatedAssumption: true,
    },
    'relaxed-25deg': {
      profileId: 'relaxed-25deg',
      version: '1.0.0',
      maxTerrainSlopeDeg: 25.0,
      maxRouteGradeDeg: 25.0,
      roughnessScaleM: 0.5,
      nominalWalkingSpeedMps: 0.5,
      gradePenaltyKappa: 1.5,
      isSimulatedAssumption: true,
    },
  };

  export function resolveConstraintProfile(
    profileId?: ConstraintProfileId,
    customProfile?: ConstraintProfile
  ): ConstraintProfile {
    const candidate = customProfile ?? CONSTRAINT_PROFILES[profileId ?? DEFAULT_PROFILE_ID] ?? CONSTRAINT_PROFILES[DEFAULT_PROFILE_ID];
    if (
      !Number.isFinite(candidate.maxTerrainSlopeDeg) ||
      candidate.maxTerrainSlopeDeg <= 0 ||
      candidate.maxTerrainSlopeDeg >= 89 ||
      !Number.isFinite(candidate.maxRouteGradeDeg) ||
      candidate.maxRouteGradeDeg <= 0 ||
      candidate.maxRouteGradeDeg >= 89 ||
      !Number.isFinite(candidate.roughnessScaleM) ||
      candidate.roughnessScaleM <= 0 ||
      !Number.isFinite(candidate.nominalWalkingSpeedMps) ||
      candidate.nominalWalkingSpeedMps <= 0
    ) {
      throw new Error(`Invalid ConstraintProfile parameters for '${candidate.profileId}'.`);
    }
    return candidate;
  }

  export function isProfileDirectionallySymmetric(profile: ConstraintProfile): boolean {
    const up = profile.maxUphillGradeDeg ?? profile.maxRouteGradeDeg;
    const down = profile.maxDownhillGradeDeg ?? profile.maxRouteGradeDeg;
    return Math.abs(up - profile.maxRouteGradeDeg) <= 1e-12 && Math.abs(down - profile.maxRouteGradeDeg) <= 1e-12;
  }
  ```

---

### Blueprint T05 — `src/routing/qualityMapping.ts`
- **Internal Plan Refs:** [docs/admissibility-and-cost-model.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/admissibility-and-cost-model.md#L17-L49), [docs/maths.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/maths.md#L210-L227)
- **External Refs:** [Bae et al. (2023) Mars 2020 PDS4 Terrain Bundle Documentation](https://doi.org/10.17189/1522933)
- **Exact Code Blueprint:**
  ```ts
  import {
    QUALITY_CODE,
    SOURCE_FOM_CODE,
    type QualityClass,
    type QualityCode,
  } from '../contracts/routing.js';
  import { QUALITY_PENALTY_BY_CODE } from './types.js';

  export const QUALITY_MAPPING_VERSION = 'fom-mapping-v1';

  export function mapSourceFomToQualityCode(fomCode: number): QualityCode {
    switch (fomCode) {
      case SOURCE_FOM_CODE.ACCEPTABLE:
        return QUALITY_CODE.ACCEPTABLE;
      case SOURCE_FOM_CODE.MANUALLY_EDITED:
      case SOURCE_FOM_CODE.MISSING_QUALITY_RASTER:
        return QUALITY_CODE.UNKNOWN;
      case SOURCE_FOM_CODE.LOW_CORRELATION:
        return QUALITY_CODE.LOW;
      case SOURCE_FOM_CODE.NO_DATA:
      case SOURCE_FOM_CODE.INTERPOLATED:
      case SOURCE_FOM_CODE.EXTRAPOLATED:
      case SOURCE_FOM_CODE.SATURATED:
      default:
        return QUALITY_CODE.INVALID;
    }
  }

  export function decodeFomGridToQualityCode(sourceFom: Uint8Array): Uint8Array {
    const out = new Uint8Array(sourceFom.length);
    for (let i = 0; i < sourceFom.length; i++) {
      out[i] = mapSourceFomToQualityCode(sourceFom[i]);
    }
    return out;
  }

  export function qualityCodeToClass(code: number): QualityClass {
    if (code === QUALITY_CODE.ACCEPTABLE) return 'acceptable';
    if (code === QUALITY_CODE.UNKNOWN) return 'unknown';
    if (code === QUALITY_CODE.LOW) return 'low';
    return 'invalid';
  }

  export function qualityCodeToPenaltyU(code: number): number {
    if (code === 0 || code === 1 || code === 2) {
      return QUALITY_PENALTY_BY_CODE[code];
    }
    return Number.POSITIVE_INFINITY;
  }
  ```

---

### Blueprint T06 — `src/routing/elevationSupport.ts`
- **Internal Plan Refs:** [docs/maths.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/maths.md#L180-L189), [docs/admissibility-and-cost-model.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/admissibility-and-cost-model.md#L40-L44)
- **External Refs:** [Rasterio Masks and Valid Data Handling](https://rasterio.readthedocs.io/en/stable/topics/masks.html)
- **Exact Code Blueprint:**
  ```ts
  import { QUALITY_CODE } from '../contracts/routing.js';

  export function isValidElevationSample(z: number, noDataSentinel: number): boolean {
    return Number.isFinite(z) && Math.abs(z - noDataSentinel) > 1e-5;
  }

  export function buildElevationSupportMask(
    elevationM: Float32Array | Float64Array,
    qualityCode: Uint8Array,
    noDataSentinel: number
  ): Uint8Array {
    const n = elevationM.length;
    const mask = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      mask[i] =
        isValidElevationSample(elevationM[i], noDataSentinel) &&
        qualityCode[i] !== QUALITY_CODE.INVALID
          ? 1
          : 0;
    }
    return mask;
  }

  export function createMaskedElevationGrid(
    elevationM: Float32Array | Float64Array,
    supportMask: Uint8Array
  ): Float64Array {
    const n = elevationM.length;
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      out[i] = supportMask[i] === 1 ? elevationM[i] : Number.NaN;
    }
    return out;
  }

  export function bilinearResampleSupportedOnly(
    maskedElev: Float64Array,
    srcW: number,
    srcH: number,
    colFrac: number,
    rowFrac: number
  ): { supported: boolean; elevationM: number } {
    if (colFrac < 0 || colFrac > srcW - 1 || rowFrac < 0 || rowFrac > srcH - 1) {
      return { supported: false, elevationM: Number.NaN };
    }
    const c0 = Math.floor(colFrac);
    const r0 = Math.floor(rowFrac);
    const c1 = Math.min(srcW - 1, c0 + 1);
    const r1 = Math.min(srcH - 1, r0 + 1);
    const z00 = maskedElev[r0 * srcW + c0];
    const z10 = maskedElev[r0 * srcW + c1];
    const z01 = maskedElev[r1 * srcW + c0];
    const z11 = maskedElev[r1 * srcW + c1];
    if (!Number.isFinite(z00) || !Number.isFinite(z10) || !Number.isFinite(z01) || !Number.isFinite(z11)) {
      return { supported: false, elevationM: Number.NaN };
    }
    const tx = colFrac - c0;
    const ty = rowFrac - r0;
    const top = z00 * (1 - tx) + z10 * tx;
    const bottom = z01 * (1 - tx) + z11 * tx;
    return { supported: true, elevationM: top * (1 - ty) + bottom * ty };
  }
  ```

---

### Blueprint T07 — `src/routing/hornSlope.ts`
- **Internal Plan Refs:** [docs/maths.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/maths.md#L190-L202), [docs/verification-and-handoff.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/verification-and-handoff.md#L105-L115)
- **External Refs:** [Horn (1981) IEEE Proc.](https://doi.org/10.1109/PROC.1981.11918)
- **Exact Code Blueprint:**
  ```ts
  export function computeHornSlopeGrid(
    elevationM: Float32Array | Float64Array,
    width: number,
    height: number,
    dx: number,
    dy: number,
    cellSupportMask?: Uint8Array,
    noDataSentinel = -32768
  ): {
    slopeDeg: Float32Array;
    slopeDegFloat64: Float64Array;
    derivativeSupportMask: Uint8Array;
  } {
    const n = width * height;
    const slopeDeg = new Float32Array(n);
    const slopeDegFloat64 = new Float64Array(n);
    const derivativeSupportMask = new Uint8Array(n);
    slopeDeg.fill(Number.NaN);
    slopeDegFloat64.fill(Number.NaN);

    const isCellValid = (idx: number): boolean => {
      if (cellSupportMask && cellSupportMask[idx] === 0) return false;
      const z = elevationM[idx];
      return Number.isFinite(z) && Math.abs(z - noDataSentinel) > 1e-5;
    };

    const radToDeg = 180 / Math.PI;
    for (let r = 1; r < height - 1; r++) {
      for (let c = 1; c < width - 1; c++) {
        const k = r * width + c;
        let allSupported = true;
        for (let dr = -1; dr <= 1 && allSupported; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (!isCellValid((r + dr) * width + (c + dc))) {
              allSupported = false;
              break;
            }
          }
        }
        if (!allSupported) continue;

        const zNW = elevationM[(r - 1) * width + (c - 1)];
        const zN  = elevationM[(r - 1) * width + c];
        const zNE = elevationM[(r - 1) * width + (c + 1)];
        const zW  = elevationM[r * width + (c - 1)];
        const zE  = elevationM[r * width + (c + 1)];
        const zSW = elevationM[(r + 1) * width + (c - 1)];
        const zS  = elevationM[(r + 1) * width + c];
        const zSE = elevationM[(r + 1) * width + (c + 1)];

        const dzdx = ((zNE + 2 * zE + zSE) - (zNW + 2 * zW + zSW)) / (8 * dx);
        const dzdy = ((zNW + 2 * zN + zNE) - (zSW + 2 * zS + zSE)) / (8 * dy);
        const deg = Math.atan(Math.hypot(dzdx, dzdy)) * radToDeg;

        derivativeSupportMask[k] = 1;
        slopeDegFloat64[k] = deg;
        slopeDeg[k] = deg;
      }
    }
    return { slopeDeg, slopeDegFloat64, derivativeSupportMask };
  }

  export function cropHaloDerivativeGrid(
    grid: Float32Array,
    haloWidth: number,
    haloHeight: number
  ): Float32Array {
    const intW = haloWidth - 2;
    const intH = haloHeight - 2;
    const out = new Float32Array(intW * intH);
    for (let r = 0; r < intH; r++) {
      for (let c = 0; c < intW; c++) {
        out[r * intW + c] = grid[(r + 1) * haloWidth + (c + 1)];
      }
    }
    return out;
  }
  ```

---

### Blueprint T08 — `src/routing/roughness.ts`
- **Internal Plan Refs:** [docs/maths.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/maths.md#L203-L214), [docs/verification-and-handoff.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/verification-and-handoff.md#L105-L127)
- **Exact Code Blueprint:**
  ```ts
  export function computePlaneFitRoughnessGrid(
    elevationM: Float32Array | Float64Array,
    width: number,
    height: number,
    roughnessScaleM = 0.5,
    cellSupportMask?: Uint8Array,
    noDataSentinel = -32768
  ): {
    rmsResidualM: Float64Array;
    roughnessNormalized: Float32Array;
    derivativeSupportMask: Uint8Array;
  } {
    const n = width * height;
    const rmsResidualM = new Float64Array(n);
    const roughnessNormalized = new Float32Array(n);
    const derivativeSupportMask = new Uint8Array(n);
    rmsResidualM.fill(Number.NaN);
    roughnessNormalized.fill(Number.NaN);

    const isCellValid = (idx: number): boolean => {
      if (cellSupportMask && cellSupportMask[idx] === 0) return false;
      const z = elevationM[idx];
      return Number.isFinite(z) && Math.abs(z - noDataSentinel) > 1e-5;
    };

    for (let r = 1; r < height - 1; r++) {
      for (let c = 1; c < width - 1; c++) {
        const k = r * width + c;
        let sumZ = 0;
        let sumXiZ = 0;
        let sumEtaZ = 0;
        let allSupported = true;

        for (let dr = -1; dr <= 1 && allSupported; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const idx = (r + dr) * width + (c + dc);
            if (!isCellValid(idx)) {
              allSupported = false;
              break;
            }
            const z = elevationM[idx];
            const xi = dc;
            const eta = -dr;
            sumZ += z;
            sumXiZ += xi * z;
            sumEtaZ += eta * z;
          }
        }
        if (!allSupported) continue;

        const c0 = sumZ / 9;
        const a = sumXiZ / 6;
        const b = sumEtaZ / 6;

        let sumSqRes = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const z = elevationM[(r + dr) * width + (c + dc)];
            const zHat = a * dc + b * (-dr) + c0;
            const diff = z - zHat;
            sumSqRes += diff * diff;
          }
        }
        const rms = Math.sqrt(Math.max(0, sumSqRes / 9));
        derivativeSupportMask[k] = 1;
        rmsResidualM[k] = rms;
        roughnessNormalized[k] = Math.min(1, rms / roughnessScaleM);
      }
    }
    return { rmsResidualM, roughnessNormalized, derivativeSupportMask };
  }
  ```

---

### Blueprint T09 — `src/routing/cellAdmissibility.ts`
- **Internal Plan Refs:** [docs/maths.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/maths.md#L58-L70), [docs/admissibility-and-cost-model.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/admissibility-and-cost-model.md#L76-L95)
- **Exact Code Blueprint:**
  ```ts
  import {
    QUALITY_CODE,
    type ConstraintProfile,
    type ExclusionReasonCode,
    type QualityMode,
    type RegionRoutingBundle,
  } from '../contracts/routing.js';

  export function getCellExclusionReason(
    bundle: RegionRoutingBundle,
    row: number,
    col: number,
    profile: ConstraintProfile,
    qualityMode: QualityMode
  ): ExclusionReasonCode | null {
    if (
      !Number.isInteger(row) ||
      !Number.isInteger(col) ||
      row < 0 ||
      row >= bundle.gridHeight ||
      col < 0 ||
      col >= bundle.gridWidth
    ) {
      return 'OUT_OF_BOUNDS';
    }
    const k = row * bundle.gridWidth + col;
    const z = bundle.elevationM[k];
    if (!Number.isFinite(z) || Math.abs(z - bundle.noDataSentinel) <= 1e-5) {
      return 'NO_DATA';
    }
    const q = bundle.qualityCode[k];
    if (q === QUALITY_CODE.INVALID || q < 0 || q > 2) {
      return 'INTERPOLATED_OR_UNRELIABLE';
    }
    if (bundle.explicitExclusionMask && bundle.explicitExclusionMask[k] === 1) {
      return 'EXPLICIT_HAZARD_MASK';
    }
    const s = bundle.terrainSlopeDeg[k];
    const rNorm = bundle.roughnessNormalized[k];
    if (
      (bundle.derivativeSupportMask && bundle.derivativeSupportMask[k] === 0) ||
      !Number.isFinite(s) ||
      !Number.isFinite(rNorm)
    ) {
      return 'UNSUPPORTED_DERIVATIVE';
    }
    if (s > profile.maxTerrainSlopeDeg) {
      return 'MAX_TERRAIN_SLOPE_EXCEEDED';
    }
    if (qualityMode === 'strict' && q !== QUALITY_CODE.ACCEPTABLE) {
      return 'STRICT_QUALITY_EXCLUDED';
    }
    return null;
  }

  export function isCellAdmissible(
    bundle: RegionRoutingBundle,
    row: number,
    col: number,
    profile: ConstraintProfile,
    qualityMode: QualityMode
  ): boolean {
    return getCellExclusionReason(bundle, row, col, profile, qualityMode) === null;
  }
  ```

---

### Blueprint T10, T11, T12 & T13 — Endpoints, Edge Admissibility, Effective Weights & Edge Cost
- **Internal Plan Refs:** [docs/admissibility-and-cost-model.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/admissibility-and-cost-model.md#L76-L163)
- **Exact Code Blueprint for `T11` (`src/routing/edgeAdmissibility.ts`) & `T13` (`src/routing/edgeCost.ts`):**
  ```ts
  // T11: Edge Admissibility with Strict No-Corner-Cutting & Grade Guard
  export function isEdgeAdmissible(
    bundle: RegionRoutingBundle,
    uRow: number,
    uCol: number,
    dir: number,
    profile: ConstraintProfile,
    qualityMode: QualityMode,
    cellAdmissibility: CellAdmissibilityPort
  ): boolean {
    const vRow = uRow + DIR_DR[dir];
    const vCol = uCol + DIR_DC[dir];
    if (cellAdmissibility.getCellExclusionReason(bundle, uRow, uCol, profile, qualityMode) !== null) return false;
    if (cellAdmissibility.getCellExclusionReason(bundle, vRow, vCol, profile, qualityMode) !== null) return false;

    if (DIR_IS_DIAG[dir] === 1) {
      // Both orthogonal corner neighbors w1=(uRow, vCol) and w2=(vRow, uCol) must be admissible
      if (cellAdmissibility.getCellExclusionReason(bundle, uRow, vCol, profile, qualityMode) !== null) return false;
      if (cellAdmissibility.getCellExclusionReason(bundle, vRow, uCol, profile, qualityMode) !== null) return false;
    }

    const w = bundle.gridWidth;
    const uIdx = uRow * w + uCol;
    const vIdx = vRow * w + vCol;
    const dz = bundle.elevationM[vIdx] - bundle.elevationM[uIdx];
    const dx = bundle.cellSpacingEastM;
    const dy = bundle.cellSpacingNorthM;
    const d = DIR_IS_DIAG[dir] === 1 ? Math.hypot(dx, dy) : DIR_DR[dir] !== 0 ? dy : dx;

    const maxGradeDeg =
      dz > 0
        ? (profile.maxUphillGradeDeg ?? profile.maxRouteGradeDeg)
        : dz < 0
          ? (profile.maxDownhillGradeDeg ?? profile.maxRouteGradeDeg)
          : profile.maxRouteGradeDeg;

    const gradeDeg = Math.atan(Math.abs(dz) / d) * (180 / Math.PI);
    return gradeDeg <= maxGradeDeg + 1e-12;
  }

  // T13: Corner-Aware Conservative Edge Cost
  export function computeEdgeCost(
    bundle: RegionRoutingBundle,
    uRow: number,
    uCol: number,
    dir: number,
    profile: ConstraintProfile,
    weights: { alpha: number; beta: number; gamma: number }
  ): number {
    const w = bundle.gridWidth;
    const vRow = uRow + DIR_DR[dir];
    const vCol = uCol + DIR_DC[dir];
    const uIdx = uRow * w + uCol;
    const vIdx = vRow * w + vCol;

    const dx = bundle.cellSpacingEastM;
    const dy = bundle.cellSpacingNorthM;
    const d = DIR_IS_DIAG[dir] === 1 ? Math.hypot(dx, dy) : DIR_DR[dir] !== 0 ? dy : dx;

    const S = Math.max(bundle.terrainSlopeDeg[uIdx], bundle.terrainSlopeDeg[vIdx]) / profile.maxTerrainSlopeDeg;
    const R = Math.max(0, Math.min(1, Math.max(bundle.roughnessNormalized[uIdx], bundle.roughnessNormalized[vIdx])));

    const uQ = QUALITY_PENALTY_BY_CODE[bundle.qualityCode[uIdx] as 0 | 1 | 2] ?? Number.POSITIVE_INFINITY;
    const vQ = QUALITY_PENALTY_BY_CODE[bundle.qualityCode[vIdx] as 0 | 1 | 2] ?? Number.POSITIVE_INFINITY;
    let U = Math.max(uQ, vQ);

    if (DIR_IS_DIAG[dir] === 1) {
      const w1Q = QUALITY_PENALTY_BY_CODE[bundle.qualityCode[uRow * w + vCol] as 0 | 1 | 2] ?? Number.POSITIVE_INFINITY;
      const w2Q = QUALITY_PENALTY_BY_CODE[bundle.qualityCode[vRow * w + uCol] as 0 | 1 | 2] ?? Number.POSITIVE_INFINITY;
      U = Math.max(U, w1Q, w2Q);
    }

    return d * (1 + weights.alpha * S + weights.beta * R + weights.gamma * U);
  }
  ```

---

### Blueprint T14, T15, T16, T17, T18 & T19 — Workspace, Binary Heap, Components, A*, Dijkstra & Audit
- **Internal Plan Refs:** [docs/search-and-worker-execution.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/search-and-worker-execution.md#L9-L120), [docs/verification-and-handoff.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/verification-and-handoff.md#L7-L32)
- **External Refs:** [Hart, Nilsson & Raphael (1968)](https://doi.org/10.1109/TSSC.1968.300136)
- **Exact Code Blueprint for `T15` (`src/routing/binaryHeap.ts`):**
  ```ts
  export function hasHigherPriority(
    u: number,
    v: number,
    fScore: Float64Array,
    gScore: Float64Array,
    crossScore: Float64Array
  ): boolean {
    const fu = fScore[u];
    const fv = fScore[v];
    if (fu !== fv) return fu < fv;

    const gu = gScore[u];
    const gv = gScore[v];
    if (gu !== gv) return gu > gv;

    const cu = crossScore[u];
    const cv = crossScore[v];
    if (cu !== cv) return cu < cv;

    return u < v;
  }

  export class BinaryMinHeap {
    private count = 0;

    constructor(
      private readonly heapNodes: Int32Array,
      private readonly heapPos: Int32Array,
      private readonly fScore: Float64Array,
      private readonly gScore: Float64Array,
      private readonly crossScore: Float64Array
    ) {}

    public get size(): number {
      return this.count;
    }

    public clear(): void {
      for (let i = 0; i < this.count; i++) {
        this.heapPos[this.heapNodes[i]] = -1;
      }
      this.count = 0;
    }

    public pushOrDecreaseKey(node: number): void {
      const existingPos = this.heapPos[node];
      if (existingPos >= 0) {
        this.siftUp(existingPos);
      } else {
        const idx = this.count++;
        this.heapNodes[idx] = node;
        this.heapPos[node] = idx;
        this.siftUp(idx);
      }
    }

    public popMin(): number {
      if (this.count === 0) return -1;
      const minNode = this.heapNodes[0];
      this.heapPos[minNode] = -1;
      this.count--;
      if (this.count > 0) {
        const lastNode = this.heapNodes[this.count];
        this.heapNodes[0] = lastNode;
        this.heapPos[lastNode] = 0;
        this.siftDown(0);
      }
      return minNode;
    }

    private siftUp(idx: number): void {
      const node = this.heapNodes[idx];
      while (idx > 0) {
        const parentIdx = (idx - 1) >> 1;
        const parentNode = this.heapNodes[parentIdx];
        if (!hasHigherPriority(node, parentNode, this.fScore, this.gScore, this.crossScore)) {
          break;
        }
        this.heapNodes[idx] = parentNode;
        this.heapPos[parentNode] = idx;
        idx = parentIdx;
      }
      this.heapNodes[idx] = node;
      this.heapPos[node] = idx;
    }

    private siftDown(idx: number): void {
      const node = this.heapNodes[idx];
      const half = this.count >> 1;
      while (idx < half) {
        let bestChildIdx = (idx << 1) + 1;
        let bestChildNode = this.heapNodes[bestChildIdx];
        const rightIdx = bestChildIdx + 1;
        if (
          rightIdx < this.count &&
          hasHigherPriority(this.heapNodes[rightIdx], bestChildNode, this.fScore, this.gScore, this.crossScore)
        ) {
          bestChildIdx = rightIdx;
          bestChildNode = this.heapNodes[rightIdx];
        }
        if (!hasHigherPriority(bestChildNode, node, this.fScore, this.gScore, this.crossScore)) {
          break;
        }
        this.heapNodes[idx] = bestChildNode;
        this.heapPos[bestChildNode] = idx;
        idx = bestChildIdx;
      }
      this.heapNodes[idx] = node;
      this.heapPos[node] = idx;
    }
  }
  ```

---

### Blueprint T20, T21, T22, T23, T24 & T25 — Metrics, 3D Draping, Deduplication & Return Legs
- **Internal Plan Refs:** [docs/metrics-and-explanations.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/metrics-and-explanations.md#L9-L128), [docs/maths.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/maths.md#L121-L132)
- **Exact Code Blueprint for `T23` (`src/routing/draping3d.ts` — Finding 9 Saddle-Quad Draping):**
  ```ts
  import type { Draped3DPoint, RegionRoutingBundle } from '../contracts/routing.js';

  export function buildDraped3DRoutePolyline(
    bundle: RegionRoutingBundle,
    cellIndices: number[],
    options?: {
      verticalExaggeration?: number;
      hoverOffsetM?: number;
      refElevationM?: number;
    }
  ): Draped3DPoint[] {
    const Ez = options?.verticalExaggeration ?? 1.0;
    const lift = options?.hoverOffsetM ?? 0.35;
    const zRef = options?.refElevationM ?? 0.0;
    const w = bundle.gridWidth;
    const h = bundle.gridHeight;
    const dx = bundle.cellSpacingEastM;
    const dy = bundle.cellSpacingNorthM;
    const out: Draped3DPoint[] = [];

    for (let i = 0; i < cellIndices.length; i++) {
      const k = cellIndices[i];
      const r = Math.floor(k / w);
      const c = k - r * w;
      const eastM = (c + 0.5) * dx;
      const northM = (h - 1 - r + 0.5) * dy;
      const z = bundle.elevationM[k];

      if (i > 0) {
        const prevK = cellIndices[i - 1];
        const prevR = Math.floor(prevK / w);
        const prevC = prevK - prevR * w;
        if (Math.abs(r - prevR) === 1 && Math.abs(c - prevC) === 1) {
          const prevEastM = (prevC + 0.5) * dx;
          const prevNorthM = (h - 1 - prevR + 0.5) * dy;
          const prevZ = bundle.elevationM[prevK];
          const w1Z = bundle.elevationM[prevR * w + c];
          const w2Z = bundle.elevationM[r * w + prevC];
          const zEdgeMid = 0.5 * (prevZ + z);
          const zOppMid = 0.5 * (w1Z + w2Z);
          const zDrapedMid = Math.max(zEdgeMid, zOppMid);

          out.push({
            eastM: 0.5 * (prevEastM + eastM),
            northM: 0.5 * (prevNorthM + northM),
            baseElevationM: zDrapedMid,
            worldY: (zDrapedMid - zRef) * Ez + lift,
            isSubdividedMidpoint: true,
          });
        }
      }

      out.push({
        eastM,
        northM,
        baseElevationM: z,
        worldY: (z - zRef) * Ez + lift,
        isSubdividedMidpoint: false,
      });
    }
    return out;
  }
  ```

---

### Blueprint T26 — `src/routing/explanations.ts` (Signed-Delta Clause Selection Table)
- **Internal Plan Refs:** [docs/metrics-and-explanations.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/metrics-and-explanations.md#L130-L184) (Finding 6)
- **Exact Signed-Delta Decision Table for Hydrogen Model:**

| Clause Type | Signed Delta Condition | Exact Required Phrase Template |
| :--- | :--- | :--- |
| **Distance ($\Delta D = D_B - D_A$)** | $\Delta D > 10^{-4}\text{ m}$ | `"adds {deltaDistM} m (+{deltaDistPct}%)"` |
| **Distance ($\Delta D = D_B - D_A$)** | $\Delta D < -10^{-4}\text{ m}$ | `"takes a {absDeltaDistM} m (-{absDeltaDistPct}%) shorter corridor"` |
| **Distance ($\Delta D = D_B - D_A$)** | $|\Delta D| \le 10^{-4}\text{ m}$ (`F08` North vs. South) | `"follows an equal-length {distBM} m alternative corridor"` |
| **Terrain ($\Delta \theta_{\text{maxSlope}}, \Delta C_{SR}$)** | $\Delta \theta_{\text{maxSlope}} < -10^{-4}$ (Branch T1) | `"to reduce maximum modeled terrain slope from {slopeADeg}° to {slopeBDeg}°"` |
| **Terrain ($\Delta \theta_{\text{maxSlope}}, \Delta C_{SR}$)** | $|\Delta \theta_{\text{maxSlope}}| \le 10^{-4} \land \Delta C_{SR} < -10^{-4}$ (Branch T2) | `"to reduce cumulative slope and roughness exposure from {srPenaltyA} to {srPenaltyB} cost-m (at {slopeBDeg}° max slope)"` |
| **Terrain ($\Delta \theta_{\text{maxSlope}}, \Delta C_{SR}$)** | $\Delta \theta_{\text{maxSlope}} > 10^{-4} \land \Delta C_{SR} < -10^{-4}$ (Branch T3) | `"accepting a higher single-cell peak slope ({slopeADeg}° → {slopeBDeg}°) to reduce cumulative weighted slope/roughness exposure from {srPenaltyA} to {srPenaltyB} cost-m"` |
| **Quality ($\Delta D_{\text{low}}, \Delta D_{\text{unk}}, \Delta W_U$)** | $\Delta D_{\text{low}} \le 10^{-4} \land \Delta D_{\text{unk}} \le 10^{-4} \land \Delta W_U < -10^{-4}$ (Branch Q1) | Report `LOW` and/or `UNKNOWN` reductions separately (omitting classes that are $0\text{ m}$ on both routes) |
| **Quality ($\Delta D_{\text{low}}, \Delta D_{\text{unk}}, \Delta W_U$)** | $\Delta D_{\text{low}} < -10^{-4} \land \Delta D_{\text{unk}} > 10^{-4}$ (Branch Q2: `LOW`-for-`UNKNOWN`) | `"to reduce high-penalty low-confidence exposure from {lowAM} m ({lowAPct}%) to {lowBM} m ({lowBPct}%) by routing through {unkBM} m ({unkBPct}%) of unknown-quality terrain (vs. {unkAM} m), lowering weighted observation-uncertainty exposure from {weightedUA} to {weightedUB} m-eq"` |
| **Quality + Terrain Trade-Off (`F08` South vs. North)** | $\Delta W_U < -10^{-4} \land \Delta \theta_{\text{maxSlope}} > 10^{-4}$ (Branch Q3) | Append `"while crossing a {slopeBDeg}° max-slope corridor (vs. {slopeADeg}° on the terrain route)"` |

---

### Blueprint T27, T28, T29 & T30 — Mutex, Engine, Web Worker & Client
- **Internal Plan Refs:** [docs/search-and-worker-execution.md](file:///c:/Users/Ayush/Documents/ChatGPT/mars/docs/search-and-worker-execution.md#L121-L220) (Findings 1, 5, 7)
- **External Refs:** [MDN Web Workers API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API), [MDN MessageChannel](https://developer.mozilla.org/en-US/docs/Web/API/MessageChannel)
- **Exact Code Blueprint for Single-Owner Workspace Mutex (`T27`):**
  ```ts
  export class AsyncWorkspaceMutex {
    private activeTaskEpoch = 0;
    private activeRequestId: string | null = null;
    private queueChain: Promise<void> = Promise.resolve();

    public getCurrentEpoch(): number {
      return this.activeTaskEpoch;
    }

    public cancelRequest(requestId: string): boolean {
      if (this.activeRequestId === requestId) {
        this.activeTaskEpoch++;
        this.activeRequestId = null;
        return true;
      }
      return false;
    }

    public supersedeAndEnqueue<T>(
      requestId: string | null,
      task: (ctx: { readonly epoch: number; isCancelled: () => boolean }) => Promise<T> | T
    ): Promise<T> {
      const myEpoch = ++this.activeTaskEpoch;
      this.activeRequestId = requestId;
      const isCancelled = () => this.activeTaskEpoch !== myEpoch;

      const runPromise = this.queueChain.then(() =>
        task({ epoch: myEpoch, isCancelled })
      );

      this.queueChain = runPromise.then(
        () => undefined,
        () => undefined
      );

      return runPromise;
    }
  }
  ```

---

### Blueprint T31–T39 & T40 — Master Numerical Verification Table for Fixtures `F01`–`F12`

Every fixture task (`T31`–`T39`) and the integrated assembly suite (`T40`) must assert these exact hand-computed and machine-verified numbers:

| Fixture | Task | Grid & Spacing | Start $\to$ Goal | Policy | Expected Cell Path `(r, c)` / Indices | Expected $D_{\text{horiz}}$ (m) | Expected Total Cost | Key Invariant / Review Finding Verified |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **F01A** | `T31` | $5\times 5$, $5\times 5\text{ m}$ | $(2,0) \to (2,4)$ | All 3 | `[10, 11, 12, 13, 14]` | $20.000000$ | $20.000000$ | Negative Martian elevation $z = -2540.0\text{ m}$ is valid |
| **F01B** | `T31` | $5\times 5$, $5\times 5\text{ m}$ | $(4,0) \to (0,4)$ | All 3 | `[20, 16, 12, 8, 4]` | $28.28427125$ | $28.28427125$ | Pure $45^\circ$ diagonal ($20\sqrt{2}\text{ m}$) |
| **F01C** | `T31` | $5\times 5$, $5\times 5\text{ m}$ | $(4,0) \to (2,4)$ | All 3 | $2$ diag $+ 2$ card | $24.14213562$ | $24.14213562$ | Optimal on 8-neighbor graph ($10\sqrt{2}+10\text{ m}$) |
| **F02** | `T31` | $5\times 5$, $10\times 10\text{ m}$ | $(2,0) \to (2,4)$ | All 3 | `[10, 6, 1, 2, 3, 8, 14]` | $68.28427125$ | $68.28427125$ | Cardinal gap step through $(0,1)\to(0,2)\to(0,3)$ ($40+20\sqrt{2}\text{ m}$) |
| **F03A** | `T32` | $3\times 3$, $5\times 5\text{ m}$ | $(1,1) \to (0,2)$ | All 3 | `[4, 5, 2]` | $10.000000$ | $10.000000$ | Blocked corner $(0,1)$ forbids diagonal $(1,1)\to(0,2)$ |
| **F03B** | `T32` | $3\times 3$, $5\times 5\text{ m}$ | $(1,1) \to (0,2)$ | All 3 | `no_path` | — | — | Both orthogonal corners $(0,1)$ and $(1,2)$ blocked |
| **F04** | `T32` | $7\times 7$, $10\times 10\text{ m}$ | $(3,1) \to (3,5)$ | All 3 | `no_path` | — | — | Goal $(3,5)$ has degree $8$ ($0^\circ$ neighbors), caught in $O(1)$ by `componentId` |
| **F05A** | `T33` | $5\times 5$, $5\times 5\text{ m}$ | $(2,2) \to (2,2)$ | All 3 | `[12]` | $0.000000$ | $0.000000$ | 0-edge same-cell route; `lowQualityPct === 0` (never `NaN`) |
| **F05B** | `T33` | $5\times 5$, $5\times 5\text{ m}$ | $(2,2) \to (2,2)$ | All 3 | `invalid_input` | — | — | **Finding 3:** Same-cell inside `INTERPOLATED` (`q=INVALID`) rejected before shortcut |
| **F06** | `T33` | $3\times 5$, $10\times 10\text{ m}$ | $(1,0) \to (1,4)$ | `shortest`, `terrain` | `[5, 6, 7, 8, 9]` | $40.000000$ | $40.000000$ | Direct shortcut through `LOW` $(1,2)$ ($D_{\text{low}} = 20.0\text{ m}$) |
| **F06** | `T33` | $3\times 5$, $10\times 10\text{ m}$ | $(1,0) \to (1,4)$ | `uncertainty` | `[5, 1, 2, 3, 9]` | $48.28427125$ | $48.28427125$ | Corner-clear detour `[(1,0),(0,1),(0,2),(0,3),(1,4)]` ($D_{\text{low}} = 0.0\text{ m}$) |
| **F07A** | `T34` | $7\times 9 \to 5\times 7$, $10\text{ m}$ | $12^\circ$ plane | Derivatives | All interior cells | — | — | **Finding 8:** `Float64` $\le 10^{-12}$; `Float32Array` $|s-12^\circ|\le 10^{-3}, \sigma_{\text{res}}\le 10^{-4}$ |
| **F07B** | `T34` | $7\times 9 \to 5\times 7$, $10\text{ m}$ | $(2,0) \to (2,6)$ | `shortest` | `[14,15,16,17,18,19,20]` | $60.000000$ | $60.000000$ | Direct climb over derived ridge (`terrain` cost $= 121.028990$) |
| **F07B** | `T34` | $7\times 9 \to 5\times 7$, $10\text{ m}$ | $(2,0) \to (2,6)$ | `terrain`, `uncertainty` | `[14,7,1,2,3,4,5,13,20]` | $88.28427125$ | $88.28427125$ | **Finding 8:** Detours along flat row 0 ($s=0^\circ, \sigma_{\text{res}}=0\text{ m}$) |
| **F08** | `T35` | $5\times 5$, $10\times 10\text{ m}$ | $(2,0) \to (2,4)$ | `shortest` | `[10, 11, 12, 13, 14]` | $40.000000$ | $40.000000$ | Middle corridor ($s=15^\circ, R=0.5, U=0$) |
| **F08** | `T35` | $5\times 5$, $10\times 10\text{ m}$ | $(2,0) \to (2,4)$ | `terrain` | `[10, 6, 7, 8, 14]` | $48.28427125$ | $48.28427125$ | North corridor ($s=0^\circ, R=0, D_{\text{low}}=20\text{ m}$) |
| **F08** | `T35` | $5\times 5$, $10\times 10\text{ m}$ | $(2,0) \to (2,4)$ | `uncertainty` | `[10, 16, 17, 18, 14]` | $48.28427125$ | $58.28427125$ | **Finding 6:** South corridor ($s=5^\circ, U=0$); equal-length $\Delta D = 0$ explanation |
| **F09A** | `T36` | $3\times 5$, $10\times 10\text{ m}$ | $(1,0) \to (1,4)$ | `terrain`, `uncertainty` | `[5, 1, 2, 3, 9]` | $48.28427125$ | $48.28427125$ | **Finding 1:** Uniform $U\equiv 0.75 \implies \gamma_{\text{eff}}=0$ (`uniformQualityOverride: true`) |
| **F09B** | `T36` | $3\times 5$, $10\times 10\text{ m}$ | $(1,0) \to (1,4)$ | `['uncertainty']` only | `[5, 1, 2, 3, 9]` | $48.28427125$ | $48.28427125$ | **Finding 7:** Standalone `['uncertainty']` succeeds without `'terrain'` |
| **F09C** | `T36` | $3\times 5$, $10\times 10\text{ m}$ | $(1,0) \to (1,4)$ | `uncertainty` | `[5, 1, 2, 3, 9]` | $48.28427125$ | $120.71067812$ | **Findings 1 & 6:** Mixed `UNKNOWN` ($0.75$) / `LOW` ($1.0$), unshifted $U$, Branch Q2 |
| **F10A/B**| `T37` | $3\times 5$, $10\times 10\text{ m}$ | $(1,0) \to (1,4)$ | `prefer` vs `strict` | `success` vs `no_path` | — | — | `LOW` allowed in `prefer`, blocked in `strict`; `INTERPOLATED` hard-excluded |
| **F10C** | `T37` | $7\times 7$, $10\times 10\text{ m}$ | $+1000\text{ m}$ spike | Derivatives | Non-adjacent cells | — | — | **Finding 4:** Elevation-support mask blocks $+1000\text{ m}$ `INTERPOLATED` spike |
| **F11A** | `T38` | $5\times 5$, $20\times 5\text{ m}$ | $(3,0) \to (2,1)$ | All 3 | `[15, 11]` | $20.61552813$ | $20.61552813$ | Rectangular diagonal $\sqrt{20^2+5^2} = \sqrt{425}\text{ m}$ |
| **F11B** | `T38` | $5\times 5$, $20\times 5\text{ m}$ | $(3,0) \to (0,1)$ | All 3 | $1$ diag $+ 2$ vert | $30.61552813$ | $30.61552813$ | **Finding 10:** $\sqrt{425}+10\text{ m}$ vs. $25\text{ m}$ Euclidean ($+22.46\% > 8.24\%$) |
| **F12A–C**| `T39` | $5\times 5$ & $2\times 2$ | Borders / Yield / 3D | All 3 | Verified per subtest | — | — | **Findings 5 & 9:** SW/NE borders, $15^\circ/20^\circ/25^\circ$, yield mutex, 3D saddle quad |
