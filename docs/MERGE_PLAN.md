# Mars Pathfinder — Wave 2 & Wave 3 Integration Blueprint (`merge/integration`)

> **Status:** Authoritative implementation specification for Wave 2 (12 parallel implementation workers) and Wave 3 (4 verification workers) on branch `merge/integration`.  
> **Non-negotiable rule:** Every Wave 2 worker edits ONLY its assigned files in Section 1, obeys `tsconfig.app.json` (`strict`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`), obeys `eslint.config.js` (`@typescript-eslint/no-explicit-any: error`), emits ZERO `console.log`/`debug`/`info`/`trace`, and imports `'three'` EXCLUSIVELY inside `src/terrain3d/`.

---

## Executive Architectural Decisions

1. **`src/state/`, `src/worker/`, `src/export/`, `src/app/`, `src/contracts/`, `src/data/`, `src/sim/`, `src/config.ts` remain 100% UNTOUCHED in Wave 2.**
   - **Why `src/worker/` stays untouched:** `src/worker/handler.ts` already consumes `{ MODEL_VERSION, solveRoute, type RoutingGrid }` from `../routing` and forwards `{ shouldStop, onProgress }`. Keeping `solveRoute` contract-compatible keeps the worker bundle tiny (~8–15 KB gz vs. `50 KB` limit) and protects all worker cancellation, timeout (`1500 ms` E2E), stale-reply, and buffer-copy tests (`tests/sim/worker.sim.test.ts`, `e2e/failures.spec.ts`).
   - **Why `src/state/` stays untouched:** Store actions, invalidation (`INVALIDATING_ACTIONS`), stale request guards, and `selectSelection()` (`candidateId`, `hover`, `isStale`) are release-verified (`tests/store.test.ts`, `tests/selectionSync.test.tsx`). Interactive UI workflow state (`stage`, `startMenuOpen`, `vizOpen`, `vizPlaying`, `thinkingOpen`, `soundEnabled`, `arrivalSummary`) lives cleanly inside `src/ui/App.tsx` React state.
   - **Why `src/app/TerrainSlot.tsx` stays untouched:** `TerrainSlot.tsx:85` renders `<Lazy {...viewProps} onError={...} />`, automatically spreading `viewProps: Omit<TerrainViewProps, 'onError'>`. Extending `TerrainViewProps` strictly with **optional** props preserves 100% backward compatibility with `tests/terrain3d.test.tsx` and `src/app/TerrainSlot.tsx`.
   - **Why `src/routing/searchTrace.ts` runs outside the worker:** Running trace/Dijkstra comparison lazily on-demand in the UI (never imported by `src/routing/index.ts` or `src/worker/handler.ts`) keeps search latency untouched (`168 ms` on `512x512`) and prevents Vite from bundling trace/explanation code into the worker chunk.
   - **Isolation from prototype folders:** `src/` MUST NEVER import from `algorithm/`, `marswalk/`, or `scripts/`. `tsconfig.app.json` scopes `"include": ["src"]`, and all `src/` imports use extensionless relative specifiers (not `.js` ESM suffixes used in `algorithm/`).
   - **Dependencies already satisfied:** Root `package.json` already provides `"three": "^0.187.0"` and `"@types/three": "^0.187.0"` (present in `node_modules/`). No `package.json` or lockfile changes are needed.

---

## 1. Exact Disjoint File Ownership Table

No two Wave 2 workers may touch the same file. Shared interfaces are frozen in Section 3 below.

### Wave 2 — 12 Parallel Implementation Workers

| Worker | Owned Files (Create / Edit) | Strict Boundary / Must NOT Touch |
|---|---|---|
| **`eng-solver`** | `src/contracts/route.ts` (edit — add optional `SearchTraceFrame`/`SearchTraceData` & `trace?: SearchTraceData` on `RouteSuccess`)<br>`src/routing/evaEngine.ts` (new)<br>`src/routing/index.ts` (edit) | Keep `src/routing/placeholderEngine.ts` untouched (`src/sim/engine.ts` imports `SolveHooks` from it). Must NOT import `searchTrace.ts` or `three`. Must keep `sharedWorkspace` lazy. |
| **`eng-trace`** | `src/routing/searchTrace.ts` (new) | Lazy UI-only module (must NOT be statically imported by main entry or worker). Imports `edgeCost`/`isCellAdmissible` from `evaEngine.ts` and uses its own separate `SolverWorkspace`. |
| **`coord-bridge`** | `src/terrain3d/coordBridge.ts` (new) | **Pure TypeScript math/data only — MUST NOT import `three`**. Must NOT export an unparameterized `localToVr2` (always gate `(586.81, 470.15)` by `bundle`). |
| **`sfx-audio`** | `src/ui/soundEffects.ts` (new) | Zero external `.mp3`/`.wav` files. Pure Web Audio API synthesis + safe jsdom/no-AudioContext no-ops. |
| **`vr-terrain`** | `src/terrain3d/marswalkTypes.ts` (new)<br>`src/terrain3d/marswalkTerrain.ts` (new)<br>`src/terrain3d/marswalkSky.ts` (new)<br>`src/terrain3d/marswalkPois.ts` (new) | Must NOT touch `TerrainView.tsx`, `coordBridge.ts`, or `src/ui/*`. Always ground `heightAtSceneXZ` on `bundle.elevation`; layer Jezero textures cleanly with `inner_nav.png` route OFF; keep `threeforks` distinct from `poi-p5`. |
| **`vr-player-mission`** | `src/terrain3d/marswalkPlayer.ts` (new)<br>`src/terrain3d/marswalkMission.ts` (new)<br>`src/terrain3d/marswalkArm.ts` (new) | Depends only on `marswalkTypes.ts`, `marswalkTerrain.ts`, `coordBridge.ts`, and `src/contracts/`. Pre-step safety check before applying movement; `[R]` bound on `window`. |
| **`vr-hud-panels`** | `src/terrain3d/marswalkUi.ts` (new)<br>`src/terrain3d/marswalkHud.ts` (new)<br>`src/terrain3d/marswalkHelmet.ts` (new)<br>`src/terrain3d/marswalkInfo.ts` (new) | Depends only on `marswalkTypes.ts`, `marswalkMission.ts`, `coordBridge.ts`. All user-facing HUD/Wrist/Debrief text must be in English (driven by caption pack, never Italian `site.json` prose). |
| **`vr-view`** | `src/terrain3d/TerrainView.tsx` (edit) | Check `getContext('webgl2') || getContext('webgl')` BEFORE `new THREE.WebGLRenderer`; expose deterministic DOM simulation buttons on BOTH WebGL & fallback views; draw both `outbound` & `returnLeg`. |
| **`ui-start-menu`** | `src/ui/StartMenuModal.tsx` (new) | Imports only React, `src/contracts/`, `coordBridge.ts`, and optional callback props. Must NOT import `three`. Non-blocking docked strip by default. |
| **`ui-viz-thinking`** | `src/ui/PathfindingVizPanel.tsx` (new)<br>`src/ui/SeeThinkingDrawer.tsx` (new) | Dynamically imported (`React.lazy`) from `App.tsx`. Imports `src/routing/searchTrace.ts` only inside this lazy chunk (zero solver code in main entry!). |
| **`ui-map-canvas`** | `src/ui/MapCanvas.tsx` (edit)<br>`src/ui/features/map-routes/MapRoutes.tsx` (edit) | Preserves Dhani's custom canvas hooks (`rasters`, `routes`, `markers`, `chrome`), `layers`, `stale`, `data-testid="map-canvas"`, `data-selected-candidate`, `data-hover-index`. Adds wavefront & dashed rejected-path overlays. Must NOT import `three`. |
| **`ui-app-shell`** | `src/state/store.ts` (edit — add `'mission/reset'` action calling `clearRoutes`)<br>`src/ui/App.tsx` (edit)<br>`src/ui/Briefing.tsx` (edit)<br>`src/ui/ElevationProfile.tsx` (edit)<br>`src/ui/app.css` (edit)<br>`src/ui/features/destinations/Destinations.tsx` (edit)<br>`src/ui/features/request-controls/RequestControls.tsx` (edit)<br>`src/ui/features/mission-context/MissionContext.tsx` (edit)<br>`src/ui/features/assumptions/Assumptions.tsx` (edit)<br>`src/ui/features/layer-controls/LayerControls.tsx` (edit) | Reconciles Dhani's slot components with `4dfb88f` `data-testid`s (`start-preset`, `destination-preset`, `calculate`, `cancel-route`, `view-2d/3d`, `route-status[data-status]`, `route-message`, `candidate-*`, `export-json`, `OptionalAssetsStatus`), wires lazy `PathfindingVizPanel`, `StartMenuModal`, `ArrivalModal`, and `mission/reset`. Keeps `.controls` print hiding intact. Must NOT import `three`. |

### Wave 3 — 4 Verification & Alignment Workers (Run After Wave 2 Merges)

| Worker | Scope / Owned Files | Commands & Exit Criteria |
|---|---|---|
| **`test-unit-int`** | `.gitattributes` (add `*.json text eol=lf`)<br>`tests/sim/pipeline.sim.test.ts` (normalize CRLF on golden read)<br>`tests/sim/golden/*.json` (regenerate via `npm run sim:update-golden`)<br>`tests/evaEngine.test.ts` (new)<br>`tests/searchTrace.test.ts` (new)<br>`tests/coordBridge.test.ts` (new) | `npm run typecheck`, `npm run lint`, and `npm test` all exit `0` with 0 failed or skipped assertions. |
| **`test-sim`** | Read-only run + optional non-invasive diagnostics (`tests/sim/`, `tests/realdata.test.ts`) | `npm run sim`, `tests/realdata.test.ts`, `tests/sim/engine.sim.test.ts`, `tests/sim/contract.sim.test.ts`, `tests/sim/fuzz.sim.test.ts` (31 terrains x 7 = 217 cases), and `tests/sim/worker.sim.test.ts` all pass 100%. |
| **`test-e2e`** | `e2e/journey.spec.ts` (edit)<br>`e2e/release.spec.ts` (edit)<br>`e2e/golden/export-outpost-eastbench-c2.json` (regenerate/update) | Normalize CRLF in `journey.spec.ts:55`, update hardcoded placeholder model version/strings to `eva-astar-1.0.0`, add full integrated E2E flow spec (Start Menu -> A/B -> Visualizer/See Thinking -> 3D Walkthrough -> Off-Path/Respawn -> Point B Arrival -> Menu), and pass `npm run test:e2e`. (`e2e/failures.spec.ts` must pass untouched.) |
| **`audit-verify`** | Read-only final gatekeeper across `dist/` and `public/bundles/` | `npm run build && npm run validate-bundle && npm run audit` exit `0` within all byte/gzip budgets and 0 banned patterns. |

---

## 2. Verified Contract, Algorithm Parity & Golden-Test Strategy

### 2.1 `MODEL_VERSION` & Test Impact Matrix
Decision: **`evaEngine.ts` sets `export const MODEL_VERSION = 'eva-astar-1.0.0'`** (updating `src/routing/index.ts`, so `src/config.ts`'s `EXPECTED_MODEL_VERSION` automatically becomes `'eva-astar-1.0.0'`). We **replace placeholder identity and regenerate placeholder goldens** rather than faking `'placeholder-astar-0.2.0'`.

Exact verified assertions impacted by changing `placeholder-astar-0.2.0` -> `eva-astar-1.0.0` and replacing the placeholder 3D view:
- `tests/sim/pipeline.sim.test.ts` (lines 13, 34, 58, 82): already reads dynamic `MODEL_VERSION` from `../../src/routing`.
- `tests/sim/pipeline.sim.test.ts` (lines 87–98, `golden exports`): compares `serializeRouteExport(...)` (`\n` LF) against `tests/sim/golden/*.json`. Both `.json` content (still at `placeholder-astar-0.2.0`) AND Windows CRLF checkouts fail line 97.
- `e2e/journey.spec.ts`:
  - `:29` asserts `'Horizontal distance: 207 m'` on synthetic `c2`
  - `:34` asserts `'Inspecting 48 m along route'`
  - `:39` asserts `'3D terrain placeholder'`
  - `:51` asserts download filename `'mars-pathfinder_synthetic-v0.1.0_placeholder-astar-0.2.0_c2.json'`
  - `:55` compares download bytes against `e2e/golden/export-outpost-eastbench-c2.json`
  - `:93` asserts `'app 0.1.0 · bundle synthetic-v0.1.0 · model placeholder-astar-0.2.0'`
- `e2e/release.spec.ts`:
  - `:13` asserts `app 0.1.0 · bundle ${BUNDLE} · model placeholder-astar-0.2.0`
  - `:23` asserts exact HiRISE `<select data-testid="start-preset">` options: `['— choose —', /^Delta front – Skinner Ridge/, /^Delta front base – Enchanted Lake/, /^Three Forks Sample Depot/]` (**MUST NOT be altered on `start-preset`!** Extra POIs go in `StartMenuModal` / `coordBridge.ts`).
  - `:53` asserts download filename `mars-pathfinder_${BUNDLE}_placeholder-astar-0.2.0_c0.json`.

### 2.2 Critical Windows CRLF Golden Fix (`test-unit-int` + `test-e2e`)
**Root cause verified:** `src/export/serialize.ts` appends `\n` (`LF`), whereas Windows `git` with `core.autocrlf=true` checks out `*.json` with `\r\n` (`CRLF`), causing 4 deterministic failures at `tests/sim/pipeline.sim.test.ts:97` (`expect(json).toBe(readFileSync(file, 'utf8'))`).
**Exact fix:**
1. In `tests/sim/pipeline.sim.test.ts:97`, normalize file read: `readFileSync(file, 'utf8').replace(/\r\n/g, '\n')`.
2. In `e2e/journey.spec.ts:55`, normalize golden read similarly: `readFileSync(...).replace(/\r\n/g, '\n')`.
3. In `.gitattributes`, add `*.json text eol=lf` so future checkouts remain LF.
4. Run `npm run sim:update-golden` (`UPDATE_GOLDEN=1`) after `evaEngine.ts` lands, and regenerate `e2e/golden/export-outpost-eastbench-c2.json`.

### 2.3 Exact Routing Algorithm & Invariant Parity Rules (`evaEngine.ts`)
Verified empirically by running `algorithm/src/routing/marspineappleAdapter.ts` against the simulation suite (`tests/sim/contract.sim.test.ts`, `engine.sim.test.ts`, `fuzz.sim.test.ts`) and `jezero-west-hirise-v0.1.0`:
- `marspineappleAdapter.ts` passed **30/30** `contract.sim.test.ts`, **217/217** `fuzz.sim.test.ts`, `large-512` in **168 ms**, and all **3 HiRISE POI pairs** (`poi-p3 <-> poi-p4 <-> poi-p5`, reducing `poi-p4 -> poi-p5` peak slope from `18.9°` to `9.8°`).
- **One verified invariant failure found and solved (`engine.sim.test.ts:132`):**
  On `quality-patchwork` (`src/sim/scenarios.ts:184-196`), an `UNKNOWN` band crosses 210 m directly across the center while a `GOOD` bridge at `r = 2..4` requires a ~368 m detour. In `marspineappleAdapter.ts`, `gamma = 2` with `UNKNOWN = 0.75` gave `2 * 0.75 = 1.50` penalty (`315 < 368`), causing `uncertainty-aware` to walk straight through `UNKNOWN` (`210 m < 210 m` failed).
  - **Fix:** Set nominal `uncertainty-aware` weights to **`(alpha: 2, beta: 1, gamma: 3)`** with `QUALITY_PENALTY_BY_CODE = { 0 (NO_ELEV): Inf, 1 (GOOD): 0.0, 2 (LOW): 1.0, 3 (UNKNOWN): 0.75 }` (mapped directly from root `quality.u8` codes `0/1/2/3`, so `gamma * 0.75 = 2.25 > 368/210 = 1.753`). This preserves Ayush's `LOW >= UNKNOWN > GOOD` hazard ordering AND detours cleanly around the `UNKNOWN` band on `quality-patchwork` AND separates `uncertainty-aware` (`c2`) from `terrain-aware` (`c1`) via the south gap on `synthetic-v0`.
- **Exact Edge Rules (matching `src/sim/invariants.ts` 1:1):**
  1. **Slope & Grade Constraints:** `maxTerrainSlopeDeg = 20`, `maxAbsEdgeGradeDeg = 20` (`maxGradeTan = tan(20°)`), `roughnessScaleM = 0.5`.
  2. **Admissibility:** Cell `i` is base-admissible iff `exclusion[i] === 0 && Number.isFinite(elevation[i]) && Number.isFinite(slope[i]) && Number.isFinite(roughness[i]) && slope[i] <= 20 && (quality[i] === 1 || quality[i] === 2 || quality[i] === 3)`. In `strictQuality: true`, additionally require `quality[i] === 1`.
  3. **Diagonal Corner Cutting:** Diagonal move `(ur, uc) -> (vr, vc)` is inadmissible if either cardinal corner `(ur * width + vc)` or `(vr * width + uc)` is inadmissible (`admissible[c1] === 0 || admissible[c2] === 0`). Also note: `elevation`/`slope`/`roughness` finite checks ensure `0` NaN arithmetic.
  4. **2-Endpoint Conservative `worseQuality(quality[u], quality[v])` Rule:**
     Unlike `marspineappleAdapter.ts` (which checked 4 corner cells only for quality penalty), `evaEngine.ts` MUST compute step quality using the **2 endpoints `(u, v)`** (`worseQuality(q[u], q[v])`) identically in BOTH `runAStar()` edge cost AND `buildLeg()` `qualityIntervals` / `lowQualityLength_m` / `unknownQualityLength_m`. This keeps edge-level cost accounting 100% consistent with route exposure metrics required by `src/sim/invariants.ts`.
  5. **Edge Cost Formula:**
     ```ts
     const stepLen = isDiag ? Math.hypot(dx, dy) : (dr !== 0 ? dy : dx);
     const sNorm = Math.max(slope[u]!, slope[v]!) / 20;
     const rNorm = Math.max(0, Math.min(1, Math.max(roughness[u]!, roughness[v]!) / 0.5));
     const qPen = qualityPenalty(worseQuality(quality[u]!, quality[v]!)); // GOOD=0, UNKNOWN=0.75, LOW=1.0
     const edgeCost = stepLen * (1 + w.slope * sNorm + w.roughness * rNorm + w.quality * qPen);
     ```
  6. **Heuristic & Determinism:** Octile/Euclidean admissible lower bound `Math.hypot((col - goalCol) * dx, (row - goalRow) * dy)` (since `1 + ... >= 1`, admissible and consistent!). Deterministic tie-break via binary min-heap (`f`, then cross-product `(Math.abs(vx * sy - sx * vy) / norm) * 1e-6`, then cell index).
  7. **Uniform Quality Optimization (`gamma_eff = 0`):** If all admissible cells share identical quality penalty (e.g., `jezero-west-hirise-v0.1.0` where all 1,000,000 cells are `quality = 3`), set `gamma_eff = 0` for `uncertainty-aware` and reuse `terrain-aware`'s solved leg when `{ slope, roughness }` match.
  8. **Candidate Deduplication & Ordering:** Evaluate in fixed `ROUTE_POLICIES_ORDER` (`'shortest-feasible'`, `'terrain-aware'`, `'uncertainty-aware'`), group policies yielding identical `outbound.cells` (and `returnLeg.cells` when `roundTrip: true`), assign `c0`, `c1`, `c2` in first-appearance order. **Policy order in `req.policies` MUST NOT change candidate paths or order** (verified by `engine.sim.test.ts` determinism test).
  9. **Exact `no-path` Strict-Quality Disconnection Check:** When `req.strictQuality && successfulRecords.length === 0`, test relaxed admissibility (`strictQuality = false`) reachability/A* cleanly to distinguish `'strict-quality-disconnects'` from `'disconnected-under-limits'`.

---

## 3. Exact Copyable TypeScript Module Signatures

### 3.1 `src/routing/evaEngine.ts` & `src/routing/index.ts` (`eng-solver`)

`src/routing/index.ts`:
```ts
export { MODEL_VERSION, solveRoute, type RoutingGrid, type SolveHooks } from './evaEngine';
```

`src/routing/evaEngine.ts`:
```ts
import type {
  EndpointResolution,
  GridSpec,
  QualityCode,
  RouteCandidate,
  RouteFinalResponse,
  RouteLeg,
  RoutePolicyId,
  RouteRequest,
  TerrainLayerId,
} from '../contracts';
import { cellCenter, pointToCell } from '../contracts';

export const MODEL_VERSION = 'eva-astar-1.0.0';

export interface RoutingGrid {
  manifest: {
    strictQualitySupported: boolean;
    grid: GridSpec;
  };
  bundleVersion: string;
  elevation: Float32Array;
  slope: Float32Array;
  roughness: Float32Array;
  quality: Uint8Array;
  exclusion: Uint8Array;
}

export interface SolveHooks {
  /** Polled every ~512 explored nodes; throwing AbortSearchSignal maps cleanly to 'cancelled' | 'timeout'. */
  shouldStop?: () => 'cancelled' | 'timeout' | null;
  onProgress?: (exploredNodes: number) => void;
  now?: () => number;
}

export interface PolicyWeights {
  slope: number;
  roughness: number;
  quality: number;
}

export const EVA_LIMITS = {
  maxTerrainSlope_deg: 20,
  maxAbsEdgeGrade_deg: 20,
  roughnessScale_m: 0.5,
} as const;

export const EVA_POLICY_WEIGHTS: Record<RoutePolicyId, PolicyWeights> = {
  'shortest-feasible': { slope: 0, roughness: 0, quality: 0 },
  'terrain-aware': { slope: 2, roughness: 1, quality: 0 },
  'uncertainty-aware': { slope: 2, roughness: 1, quality: 3 },
};

export function worseQuality(a: QualityCode, b: QualityCode): QualityCode;
export function qualityPenalty(q: QualityCode): number; // 1 -> 0, 3 -> 0.75, 2 -> 1.0, 0 -> Infinity

export function solveRoute(
  grid: RoutingGrid,
  req: RouteRequest,
  hooks?: SolveHooks,
): RouteFinalResponse;
```

**Notes for `eng-solver`:**
- Copy `BinaryMinHeap` and `SolverWorkspace` internally inside `evaEngine.ts` (typed strictly with zero `any`, zero `console.*`, `noUncheckedIndexedAccess`-safe via helper guards).
- Must also map non-finite raster elements, unknown `layer`, and wrong `request.modelVersion !== MODEL_VERSION` / `request.bundleVersion !== grid.bundleVersion` / missing `policies` to `'invalid-input'` or `'data-error'` cleanly matching `src/sim/invariants.ts` and `tests/sim/contract.sim.test.ts`.
- Pre-allocate & reuse module-level `SolverWorkspace` when capacity fits (`workspace.capacity >= totalCells`), resetting `seenStamp` search counter safely (`beginSearch()`).
- Verify `computeEndpointResolution` snaps via `pointToCell(grid.manifest.grid, pt)` -> `cellCenter(grid.manifest.grid, cell.row, cell.col)`.
- When `start.cell.index === destination.cell.index`, return single candidate `c0` with 1-cell `cells`, `horizontalDistance_m: 0`, `qualityIntervals: []`, etc.

---

### 3.2 `src/routing/searchTrace.ts` (`eng-trace`)

Runs lazily on-demand in UI when inspecting visualization or 3D rejected corridors (never imported by `src/routing/index.ts` or `src/worker/*`).

```ts
import type { LocalPoint, LocalPoint3, RouteCandidate, RoutePolicyId, RouteRequest } from '../contracts';
import type { RoutingGrid, PolicyWeights } from './evaEngine';

export interface SearchTraceFrame {
  step: number;
  policy: RoutePolicyId;
  /** Row-major grid cell indices newly closed in this sampled batch. */
  closedCells: number[];
  /** Current best frontier cell indices (downsampled if large). */
  frontierCells: number[];
  /** Best path-so-far backtrace at this snapshot (for live glowing tentative spline). */
  currentBestCells: number[];
  currentBestCost: number;
  exploredCount: number;
  openSize: number;
  /** Short human reasoning caption for this wavefront phase. */
  note: string;
}

export interface AlgorithmComparison {
  policy: RoutePolicyId;
  astar: {
    exploredNodes: number;
    pathCellCount: number;
    weightedCost: number;
    horizontalDistance_m: number;
    computeMs: number;
  };
  dijkstra: {
    exploredNodes: number;
    pathCellCount: number;
    weightedCost: number;
    horizontalDistance_m: number;
    computeMs: number;
  };
  /** astar.exploredNodes === 0 ? 1 : dijkstra.exploredNodes / astar.exploredNodes */
  nodeReductionFactor: number;
  /** True iff |astar.weightedCost - dijkstra.weightedCost| <= 1e-4. */
  optimalCostMatch: boolean;
}

export type RejectionCategory =
  | 'excess-slope'
  | 'high-uncertainty'
  | 'rough-terrain'
  | 'suboptimal-detour'
  | 'alternative-policy';

export interface RejectedPathOption {
  id: string;
  label: string;
  category: RejectionCategory;
  /** Concise explanation shown in 2D tooltip and 3D proximity HUD when near dotted path. */
  reason: string;
  metricsDelta: {
    distanceDelta_m: number;
    maxSlope_deg: number;
    unknownLengthDelta_m: number;
    costRatio: number;
  };
  /** Elevation-draped 3D local points (`east_m`, `north_m`, `elevation_m`). */
  path: LocalPoint3[];
  /** Distinct dashed stroke color hex, e.g. '#f59e0b' | '#ef4444' | '#a855f7'. */
  colorHex: string;
}

export interface ThinkingStep {
  index: number;
  phase: 'endpoints' | 'admissibility' | 'policy-eval' | 'frontier-pruning' | 'comparison' | 'selection';
  title: string;
  formula?: string;
  detail: string;
  policy?: RoutePolicyId;
}

export interface SearchTraceResult {
  policy: RoutePolicyId;
  selectedCandidateId: string;
  frames: SearchTraceFrame[];
  comparison: AlgorithmComparison;
  rejectedPaths: RejectedPathOption[];
  thinkingSteps: ThinkingStep[];
  /** Non-fatal notice if grid > 250k cells used coarsened/sampled visualization trace for responsiveness. */
  sampledNotice: string | null;
}

export interface SearchTraceOptions {
  /** Max wavefront snapshots returned across the solve (default 48). */
  maxFrames?: number;
  /** Node cap for comparison Dijkstra on large 1000x1000 grids before strided fallback (default 250_000). */
  maxDijkstraNodes?: number;
  /** Policy to trace & compare (defaults to primary selected candidate policy). */
  policy?: RoutePolicyId;
  weightsOverride?: PolicyWeights;
}

export function computeSearchTraceAndCompare(
  grid: RoutingGrid,
  request: RouteRequest,
  candidates: RouteCandidate[],
  selectedCandidateId: string,
  options?: SearchTraceOptions,
): SearchTraceResult;

export function buildRejectedPathOptions(
  grid: RoutingGrid,
  start: LocalPoint,
  destination: LocalPoint,
  candidates: RouteCandidate[],
  selectedCandidateId: string,
): RejectedPathOption[];
```

**Implementation requirements for `eng-trace`:**
1. **`computeSearchTraceAndCompare`** runs instrumented A* vs. Dijkstra (`h(n) = 0`) using the EXACT same 2-endpoint `worseQuality`, `20°` slope/grade, `0.5 m` roughness, diagonal corner admissibility, and `EVA_POLICY_WEIGHTS` formulas as `evaEngine.ts`.
2. **Wavefront Frame Downsampling:** On `20x12` (`synthetic-v0`) or `51x51` (`ctx20m`), record dense frames up to `maxFrames = 48`. On `1000x1000` (`jezero-west-hirise`), cap frame closed-cell arrays cleanly (stride-sample frontier/closed indices to at most 400 indices/frame and bound total UI trace time `< 400 ms`) so browser main thread never janks! Similarly, if Dijkstra exceeds `maxDijkstraNodes` (`250_000`) on `1000x1000`, measure actual partial/coarsened-2x-stride Dijkstra cleanly OR run bounded local corridor Dijkstra and mark `sampledNotice` transparently—never freeze the UI tab!
3. **`buildRejectedPathOptions`** generates 2–3 meaningful dashed/dotted corridors for both 2D (`MapCanvas`) and 3D (`TerrainView`):
   - Any non-selected solved `RouteCandidate` (e.g., if `c2` uncertainty-aware is selected, `c0` `shortest-feasible` is shown as dotted rejected alternative with exact metrics delta: e.g. `"Avoids +82 m of unknown-quality terrain via c2"`).
   - A synthetic **Naive Straight-Line / Direct Slope Corridor** (Bresenham/linear interpolation from `start` -> `destination` draped onto `grid.elevation`) labeled `'excess-slope'` or `'rough-terrain'` when direct straight corridor hits `> 20°` ridge/excluded cell, or `'high-uncertainty'` if it cuts straight across `UNKNOWN`/`LOW` cells!
   - An **Unpenalized / Low-Roughness Corridor** (when all candidates collapse on uniform quality, run one fast `alpha=0, beta=0, gamma=0` shortest or local alternate corridor so 3D walkthrough always demonstrates why the chosen blue path beats naive straight-line climbing!).

---

### 3.3 `src/terrain3d/coordBridge.ts` (`coord-bridge`)

**STRICT:** Pure TypeScript only — **NO `import ... from 'three'`**.

Exact Verified Georeference Transform:
- Verified against `public/bundles/jezero-west-hirise-v0.1.0/manifest.json` and `public/sites/jezero-delta/site.json`:
  - `wildcat`: `site.json (23.89, 186.55)` -> `+ (586.81, 470.15)` = `(610.70, 656.70)` vs `manifest poi-p3 (610.687, 656.700)` (`< 0.02 m` delta).
  - `nukshak`: `site.json (-228.27, -282.96)` -> `+ (586.81, 470.15)` = `(358.54, 187.19)` vs `manifest poi-p4 (358.558, 187.200)` (`< 0.02 m` delta).
  - `threeforks`: `site.json (144.97, -162.07)` -> `(731.78, 308.08)` (sol 663 sample depot) vs `manifest poi-p5 (752.498, 344.000)` (sol 686/690 sample depot, ~41 m apart; mapped accurately with both IDs!).
  - `base`: `site.json (276.58, -92.10)` -> `(863.39, 378.05)`.
  - `yori`: `site.json (-356.83, -110.01)` -> `(229.98, 360.14)`.
  - `rockytop`: `site.json (-144.25, 365.79)` -> `(442.56, 835.94)`.
- **Three.js / Marswalk VR axes:**
  - Marswalk `site.json` 2D `(x_vr, y_vr)` places mesh vertices at Three.js `(X = x_vr, Y = elev - h0, Z = -y_vr)`.
  - Therefore, from HiRISE local grid `(east_m, north_m, elevation_m)` to Marswalk 3D world `(x, y, z)`:
    - `x_vr = east_m - 586.81`
    - `y_vr = north_m - 470.15`
    - `z_three = -y_vr = 470.15 - north_m`
    - `y_three = (elevation_m - originElev_m) * verticalExaggeration` (when in Jezero Marswalk mode with `originElev_m = h0`, matching `Terrain.h0`).
  - Conversely, when rendering **non-Jezero procedural bundles** (`synthetic-v0`, `ctx20m`, unit test grids), use bundle center as origin `(cx = (west_m + east_m)/2, cy = (south_m + north_m)/2)` and root's `[east_m - cx, (elevation_m - baseElev) * verticalExaggeration, -(north_m - cy)]` convention.

```ts
import type { GridBundle, GridSpec, LocalPoint, LocalPoint3 } from '../contracts';

export const JEZERO_VR_OFFSET = {
  eastOrigin_m: 586.81,
  northOrigin_m: 470.15,
} as const;

export interface VrPoint2 {
  x_vr: number;
  y_vr: number;
}

export interface VrPoint3 {
  x: number;
  y: number;
  z: number;
}

export interface UnifiedPoi {
  id: string;
  /** Matching manifest POI id if present in manifest.pointsOfInterest (`'poi-p3' | 'poi-p4' | 'poi-p5'`). */
  manifestPoiId: string | null;
  /** Matching site.json POI id (`'base' | 'threeforks' | 'nukshak' | 'yori' | 'wildcat' | 'rockytop'`). */
  marswalkPoiId: string | null;
  name: string;
  shortLabel: string;
  kind: 'base' | 'science' | 'sample-depot' | 'outpost' | 'test';
  sol: number | null;
  position: LocalPoint;
  vr: VrPoint2;
  elev_m: number | null;
  summary: string;
  photoUrl: string | null;
  medaTempC?: { min: number; max: number; sol: number };
}

export interface NearestPathSample {
  /** Nearest index in route `path` (`0 .. path.length - 1`). */
  segmentIndex: number;
  /** Exact projected point along polyline segment `[i, i+1]` or vertex `0` for single-point paths. */
  closestPoint: LocalPoint3;
  /** Horizontal distance in meters from player's current position to active blue path centerline. */
  horizontalDistance_m: number;
  /** Progress ratio `0..1` along route from start to destination. */
  progressFraction: number;
}

export interface DottedProximityHit {
  rejectedId: string;
  label: string;
  reason: string;
  distance_m: number;
  closestPoint: LocalPoint3;
}

export interface CorridorCheckResult {
  isOffPath: boolean;
  reason: 'corridor-deviation' | 'steep-slope' | 'excluded-cell' | null;
  deviation_m: number;
  cellSlope_deg: number | null;
  nearestSafePoint: LocalPoint3 | null;
  nearestPathIndex: number;
}

export interface ArrivalStatus {
  arrived: boolean;
  distanceToDestination_m: number;
}

export type CoordBundleRef = Pick<GridBundle, 'bundleVersion'> & {
  manifest: Pick<RegionManifest, 'bundleId' | 'crs' | 'grid'>;
};

export function isJezeroHiriseBundle(bundle: CoordBundleRef): boolean;
export function frameForBundle(bundle: CoordBundleRef): LocalPoint;
export function localToVr2ForBundle(point: LocalPoint, bundle: CoordBundleRef): VrPoint2;
export function vr2ToLocalForBundle(vr: VrPoint2, bundle: CoordBundleRef): LocalPoint;
export function localToSceneXYZ(
  point: LocalPoint3,
  origin: { east_m: number; north_m: number; elevation_m: number },
  verticalExaggeration?: number,
): VrPoint3;
export function sceneXYZToLocal(
  scene: VrPoint3,
  origin: { east_m: number; north_m: number; elevation_m: number },
  verticalExaggeration?: number,
): LocalPoint3;
export function defaultCorridorThresholdForGrid(
  grid: Pick<GridSpec, 'cellSizeEast_m' | 'cellSizeNorth_m'>,
): number;
export function defaultArrivalRadiusForGrid(
  grid: Pick<GridSpec, 'cellSizeEast_m' | 'cellSizeNorth_m'>,
): number;

/** Returns 7 unified POIs for Jezero HiRISE/delta bundles (keeping `threeforks` distinct from `poi-p5`), or bundle.manifest.pointsOfInterest mapped to UnifiedPoi for others. */
export function getUnifiedPoisForBundle(bundle: GridBundle): UnifiedPoi[];

export function findNearestPointOnPath(position: LocalPoint, path: readonly LocalPoint3[]): NearestPathSample | null;

export function findClosestRejectedPath<T extends { id: string; label: string; reason: string; path: readonly LocalPoint3[] }>(
  position: LocalPoint,
  rejectedPaths: readonly T[],
  proximityThreshold_m?: number, // default 18 m; pass defaultCorridorThresholdForGrid(grid) on CTX
): DottedProximityHit | null;

export function checkCorridorSafety(
  position: LocalPoint,
  bundle: GridBundle,
  activePathCells: ReadonlySet<number> | readonly number[],
  activePath: readonly LocalPoint3[],
  options?: { maxCorridorDeviation_m?: number; maxSlope_deg?: number; routeBundleVersion?: string }, // defaults defaultCorridorThresholdForGrid(grid), 20 deg
): CorridorCheckResult;

export function checkArrivalAtDestination(
  position: LocalPoint,
  destination: LocalPoint,
  arrivalRadius_m?: number, // default 8 m; pass defaultArrivalRadiusForGrid(grid) on CTX
): ArrivalStatus;

export function sampleElevationBilinear(spec: GridSpec, elevation: Float32Array, point: LocalPoint): number | null;
```

**Notes for `coord-bridge`:**
- All functions handle empty arrays and single-point `path.length === 1` routes cleanly (safe `noUncheckedIndexedAccess` guards).
- `photoUrl` uses relative `./sites/jezero-delta/photos/...` so `vite` `base: './'` works on root and GitHub Pages sub-paths alike.

---

### 3.4 `src/terrain3d/marswalk*.ts` (Ported from `marswalk/app/src/`)

All files below MUST live under `src/terrain3d/`, pass strict TS (`noUncheckedIndexedAccess`, zero `any`), emit ZERO `console.log`/`debug`/`info`/`trace`, and clean up all Three.js GPU resources cleanly.

#### A. `src/terrain3d/marswalkTypes.ts` (`vr-terrain`)
```ts
import type * as THREE from 'three';

export interface TerrainRingSpec {
  name: 'inner' | 'mid' | 'outer';
  half: number;
  res: number;
  n: number;
  tile: number;
  lods: number[];
  lodDist: number[];
  hmin: number;
  hscale: number;
  orthoTiles: number;
  slopeMax?: number;
}

export interface SitePoiRaw {
  id: string;
  name: string;
  sol: number;
  kind: 'base' | 'science';
  title: string;
  text: string;
  photo: {
    file: string;
    imageid?: string;
    sol: number;
    camera: string;
    w: number;
    h: number;
    credit?: string;
  } | null;
  meda?: { sol: number; min: number; max: number; source: string };
  x: number;
  y: number;
  elev: number;
}

export interface MarswalkSiteData {
  id: string;
  name: string;
  rings: TerrainRingSpec[];
  pois: SitePoiRaw[];
  start?: { sol?: number; yawDeg?: number };
  mission: {
    title: string;
    objective: string;
    startLMST: string;
    walk: { flatSpeed: number; toblerK: number; toblerOffset: number };
    slopeLimitsDeg: [number, number, number];
    metabolic: { baseW: number; walkJperM: number; massKg: number; efficiency: number };
    oxygen: { tankKg: number; kJperLitre: number; gPerLitre: number; reserveFraction: number };
    radiation: { mSvPerDay: number };
    gravity: number;
  };
  weather: {
    terrestrial_date: string;
    sol: string;
    ls: string;
    season: string;
    min_temp: number;
    max_temp: number;
    pressure: number;
    sunrise: string;
    sunset: string;
  };
  overlays?: {
    minerals?: { file: string; half: number; shiftM?: [number, number] };
    thermal?: { file: string; half: number };
  };
}

export type OverlayLayerId = 'ortho' | 'slope' | 'minerals' | 'thermal';

export interface MarswalkTerrainHandle {
  group: THREE.Group;
  h0: number;
  maxHalf: number;
  isProceduralFallback: boolean;
  heightAtSceneXZ(x: number, z: number): number;
  slopeDegAtSceneXZ(x: number, z: number): number;
  setLayer(layer: OverlayLayerId): void;
  updateLod(cameraX: number, cameraZ: number): void;
  dispose(): void;
}
```

#### B. `src/terrain3d/marswalkTerrain.ts`, `marswalkSky.ts`, `marswalkPois.ts` (`vr-terrain`)
- **`marswalkTerrain.ts`:**
  - `loadMarswalkSiteJson(signal?: AbortSignal): Promise<MarswalkSiteData>` (fetches `'./sites/jezero-delta/site.json'`).
  - `createJezeroTerrain(site: MarswalkSiteData, options?: { verticalExaggeration?: number; signal?: AbortSignal }): Promise<MarswalkTerrainHandle>`
    - Loads `inner_h.bin`, `mid_h.bin`, `outer_h.bin` (`Uint16Array` quantized heights: `hmin + u16 * hscale`, exact parity with `marswalk/app/src/terrain.js`) and `inner_ortho_*.jpg` / `slope` / `minerals` / `thermal` textures from `'./sites/jezero-delta/...'`. Uses `THREE.MeshStandardMaterial` + LOD tile grid + clean `dispose()` of all `BufferGeometry`, `Material`, `Texture`.
  - `createProceduralTerrainFromBundle(bundle: GridBundle, options?: { verticalExaggeration?: number; originElev_m?: number }): MarswalkTerrainHandle`
    - Synchronous zero-network fallback! Builds indexed `THREE.PlaneGeometry` / `BufferGeometry` directly from `bundle.elevation`, vertex colors derived from elevation + `bundle.slope` + `bundle.quality` + `bundle.exclusion` (`#22c55e`/sandy tones for admissible, red/amber stripes for >20° steep or excluded cells!), with identical `heightAtSceneXZ`, `slopeDegAtSceneXZ`, `setLayer`, `updateLod`, and `dispose()` API.
- **`marswalkSky.ts`:**
  - `MARS_HORIZON_COLOR`, `MARS_ZENITH_COLOR`, `makeMarsSky(scene: THREE.Scene): { skyMesh: THREE.Mesh; dispose: () => void }`.
- **`marswalkPois.ts`:**
  - `MarswalkPoisHandle`: creates floating beacons/rings for Point A (Start), Point B (Destination), and any `UnifiedPoi[]` pins (`coordBridge`), plus raycast/proximity nearest-POI lookup & animated pulse `update(elapsedS)` + `dispose()`.

#### C. `src/terrain3d/marswalkPlayer.ts`, `marswalkMission.ts`, `marswalkArm.ts` (`vr-player-mission`)
- **`marswalkMission.ts`:**
  - `MarswalkMission` class (clean TypeScript port of `marswalk/app/src/mission.js` using Tobler flat speed `0.7 m/s`, `toblerK = 3.5`, and live distance/ascent tracking relative to selected A* route length — NO oxygen or survival gauges per `AGENTS.md`).

- **`marswalkPlayer.ts`:**
  - `MarswalkPlayer` class supporting BOTH Pointer-Lock first-person WASD/Arrows (`'walk'`) AND orbital drag/pan overview (`'orbit'`), terrain ground clamping (`terrain.heightAtSceneXZ(x, z) + EYE_HEIGHT`), Tobler slope speed modulation, smooth vertical exaggeration alignment, **pre-step safe-corridor enforcement** (`defaultCorridorThresholdForGrid(grid)` + `defaultArrivalRadiusForGrid(grid)`), pointer-lock exit on off-path block + `[R]` Respawn to nearest blue point, plus `dispose()` removing every DOM listener (`keydown`, `keyup`, `pointerdown`, `pointermove`, `pointerup`, `wheel`, `pointerlockchange`).
- **`marswalkArm.ts`:**
  - `MarswalkArmDisplay` class: Three.js articulated wrist-mounted EVA tablet mesh attached cleanly to `camera` (matching `marswalk/app/src/arm.js`) displaying live `CanvasTexture` telemetry in English (`getContext('2d')` null-guarded); clean `dispose()`.

#### D. `src/terrain3d/marswalkUi.ts`, `marswalkHud.ts`, `marswalkHelmet.ts`, `marswalkInfo.ts` (`vr-hud-panels`)
- **`marswalkUi.ts`:** `CanvasPanel`, `roundRect`, `drawText`, `wrapText`, `formatHoursMinutes`, `formatDistance` (English formatting, e.g., `1.24 km` / `207 m`, no `any`).
- **`marswalkHud.ts`:** HUD overlay manager in 100% English: heading compass, slope (`deg`), remaining route distance, active overlay mode, center-screen **`[✕]` Off-Path Block** overlay, **Dotted-Path Proximity Explanation** card, and Point B Arrival Summary (NO oxygen/survival gauges!).
- **`marswalkHelmet.ts`:** `MarswalkHelmet` subtle visor vignette/glass edge frame attached cleanly to camera (`dispose()`).
- **`marswalkInfo.ts`:** English dataset credits, DOIs & licences matching PR #2 (`HiRISE`, `CTX`, `CRISM`, `THEMIS`, `Perseverance Mastcam-Z / MEDA`), explicitly marking the outpost fictional and mission educational.

---

### 3.5 `src/terrain3d/TerrainView.tsx` (`vr-view`)

**CRITICAL CONTRACT:**
1. Preserves all 9 required properties of `TerrainViewProps` verbatim (`src/app/TerrainSlot.tsx` and `tests/terrain3d.test.tsx` depend on them!).
2. Adds strictly optional props for the merged 3D EVA experience.
3. Always renders root `<div data-testid="terrain-view" data-selected-candidate={selectedCandidateId ?? ''} data-hover-index={highlightPathIndex ?? ''}>` so `tests/selectionSync.test.tsx` and `tests/terrain3d.test.tsx` continue to find `terrain-view` with synced dataset attributes even when WebGL `getContext` returns `null` in jsdom!
4. **WebGL Handling Rule:**
   - When `THREE.WebGLRenderer` fails to initialize or throws in headless/jsdom environments (where `detectWebGL` was stubbed `ok: true`), `TerrainView` catches the error cleanly without emitting `console.error` or breaking mount, and renders the **Interactive 2.5D Fallback Simulator** directly inside `data-testid="terrain-view"` (with Play/Walk step slider along the selected route, Start/Point B beacons, Dotted Rejected Path warning preview, Off-Path simulation button + Respawn button, and Point B Arrival trigger).
   - When a live WebGL context *does* initialize and later fires `'webglcontextlost'`, `TerrainView` invokes `onError?.({ kind: 'context-lost', message: 'WebGL context lost' })` (required by `tests/terrain3d.test.tsx:68`).

```ts
import type { GridBundle, LocalPoint, RouteCandidate } from '../contracts';
import type { RejectedPathOption, SearchTraceFrame } from '../routing/searchTrace';
import type { CorridorCheckResult, DottedProximityHit, UnifiedPoi } from './coordBridge';

export interface TerrainErrorEvent {
  kind: 'webgl-unavailable' | 'context-lost' | 'terrain-data' | 'texture';
  message: string;
}

export interface ArrivalSummary {
  candidateId: string;
  distanceWalked_m: number;
  elapsedSimSeconds: number;
  ascent_m: number;
  descent_m: number;
  maxSlope_deg: number;
  offPathEvents: number;
  destinationName: string;
}

export interface TerrainViewProps {
  // === Frozen Role C / TerrainSlot base contract (required) ===
  bundle: GridBundle;
  candidates: RouteCandidate[];
  selectedCandidateId: string | null;
  highlightPathIndex: number | null;
  verticalExaggeration: number;
  camera: unknown;
  onCameraChange?: (camera: unknown) => void;
  onSelectCandidate?: (candidateId: string) => void;
  onError?: (e: TerrainErrorEvent) => void;

  // === Integrated Marswalk 3D Walkthrough optional extensions ===
  rejectedPaths?: RejectedPathOption[];
  searchTrace?: SearchTraceFrame[];
  startPoint?: LocalPoint | null;
  destinationPoint?: LocalPoint | null;
  destinationLabel?: string;
  poiCatalog?: UnifiedPoi[];
  soundEnabled?: boolean;
  onPlaySfx?: (event: 'off-path' | 'respawn' | 'arrive' | 'click' | 'poi') => void;
  onArriveAtDestination?: (summary: ArrivalSummary) => void;
  onReturnToMenu?: () => void;
  onToggleSound?: () => void;
}
```

**3D Scene Features inside `TerrainView.tsx`:**
- **Active Blue Path:** Selected candidate's `outbound.path` draped smoothly `0.35 m` above terrain mesh (`THREE.Line` + glowing waypoint spheres + clickable/selectable candidate ribbons so clicking a visible candidate curve calls `onSelectCandidate?.(candidateId)`).
- **Hover Sync Marker:** When `highlightPathIndex !== null`, renders a highlighted beacon sphere at `selectedCandidate.outbound.path[highlightPathIndex]` and allows clicking/dragging to sync route inspection.
- **Rejected Paths (Dotted/Dashed):** Renders `rejectedPaths` using `THREE.LineDashedMaterial({ dashSize: 2.2, gapSize: 1.6 })` + `line.computeLineDistances()`. On every frame / player position update, runs `findClosestRejectedPath(playerLocal, rejectedPaths, 18)`: if `hit !== null`, displays a non-intrusive floating **Dotted-Path Proximity Tooltip** (`data-testid="dotted-path-tooltip"`) showing `hit.label`, `hit.reason`, and `hit.distance_m.toFixed(1) m away`.
- **Off-Path `X` Safety Block & Respawn:** On each movement tick, runs `checkCorridorSafety(playerLocal, bundle, selectedPath, { maxCorridorDeviation_m: 22, maxSlope_deg: 20 })`. When `corridor.isOffPath === true`, blocks further forward movement into the hazard, flashes a prominent center-screen **`✕` Off-Path Warning Overlay** (`data-testid="off-path-overlay"`) naming the hazard (`corridor.reason`), plays `'off-path'` SFX once per entry, and enables a **`Respawn to Nearest Safe Blue Point` (`[R]`)** button (`data-testid="respawn-button"`) that snaps player cleanly to `corridor.nearestSafePoint` (`player.teleportToSceneXZ(...)`) and plays `'respawn'` SFX.
- **Point B Arrival Detector:** Runs `checkArrivalAtDestination(playerLocal, destinationPoint, 8)` while walking (or simulated arrival button in non-WebGL / preview bar). On first arrival, plays `'arrive'` SFX, exits pointer lock cleanly (`document.exitPointerLock?.()`), and invokes `onArriveAtDestination?.(summary)`.

---

### 3.6 `src/ui/soundEffects.ts` (`sfx-audio`)

Zero external audio files; synthesized strictly with `window.AudioContext` / `webkitAudioContext` wrapped in safe try/catch checks (no-op in headless/jsdom).

```ts
export type SfxKind = 'click' | 'search-tick' | 'route-complete' | 'off-path' | 'respawn' | 'arrive' | 'poi';

export interface SoundController {
  isMuted(): boolean;
  setMuted(muted: boolean): void;
  toggleMute(): boolean;
  play(kind: SfxKind, pitchFactor?: number): void;
  dispose(): void;
}

export function createSoundController(initialMuted?: boolean): SoundController;
export function playSfxOnce(kind: SfxKind, muted?: boolean, pitchFactor?: number): void;
```

---

### 3.7 `src/ui/StartMenuModal.tsx` (`ui-start-menu`)

Zero `three` import. Uses `getUnifiedPoisForBundle(bundle)` from `coordBridge.ts`.

```ts
import type { GridBundle, LocalPoint, RegionId, RoutePolicyId } from '../contracts';
import type { UnifiedPoi } from '../terrain3d/coordBridge';

export interface StartMenuLaunchPayload {
  regionId: RegionId;
  startPoint: LocalPoint;
  destinationPoint: LocalPoint;
  startLabel: string;
  destinationLabel: string;
  strictQuality: boolean;
  roundTrip: boolean;
  policies: RoutePolicyId[];
  launchMode: 'animate-then-3d' | 'planner-only';
}

export interface StartMenuModalProps {
  /** 'docked' = compact non-blocking header strip; 'expanded' = full interactive mission briefing & Point A/B picker modal. */
  displayMode: 'docked' | 'expanded';
  activeRegionId: RegionId;
  bundle: GridBundle | null;
  bundleLoading: boolean;
  pois: UnifiedPoi[];
  currentStart: LocalPoint | null;
  currentDestination: LocalPoint | null;
  soundEnabled: boolean;
  onExpand(): void;
  onCollapse(): void;
  onSwitchRegion(regionId: RegionId): void;
  onSelectEndpoints(start: LocalPoint, destination: LocalPoint, startLabel?: string, destLabel?: string): void;
  onLaunchMission(payload: StartMenuLaunchPayload): void;
  onToggleSound(): void;
}

export function StartMenuModal(props: StartMenuModalProps): React.JSX.Element;
```

---

### 3.8 `src/ui/PathfindingVizPanel.tsx` & `src/ui/SeeThinkingDrawer.tsx` (`ui-viz-thinking`)

Zero `three` import. Controlled playback state allows `MapCanvas.tsx` to render the active `SearchTraceFrame` wavefront simultaneously in 2D!

```ts
import type { RouteCandidate } from '../contracts';
import type { AlgorithmComparison, SearchTraceFrame, SearchTraceResult, ThinkingStep } from '../routing/searchTrace';

export interface PathfindingVizPanelProps {
  open: boolean;
  trace: SearchTraceResult | null;
  candidates: RouteCandidate[];
  selectedCandidateId: string | null;
  frameIndex: number;
  playing: boolean;
  speedMultiplier: 1 | 4 | 16;
  showRejectedPaths: boolean;
  onFrameIndexChange(index: number): void;
  onTogglePlay(): void;
  onStepForward(): void;
  onReset(): void;
  onSpeedChange(speed: 1 | 4 | 16): void;
  onToggleRejectedPaths(): void;
  onOpenThinking(): void;
  onEnter3dWalkthrough(): void;
  onClose(): void;
}

export function PathfindingVizPanel(props: PathfindingVizPanelProps): React.JSX.Element | null;

export interface SeeThinkingDrawerProps {
  open: boolean;
  trace: SearchTraceResult | null;
  comparison: AlgorithmComparison | null;
  steps: ThinkingStep[];
  activeFrame: SearchTraceFrame | null;
  onClose(): void;
}

export function SeeThinkingDrawer(props: SeeThinkingDrawerProps): React.JSX.Element | null;
```

---

### 3.9 `src/ui/MapCanvas.tsx` (`ui-map-canvas`)

**CRITICAL:** Must keep ALL existing props optional-compatible and preserve `<div data-testid="map-canvas" data-selected-candidate={selectedCandidateId ?? ''} data-hover-index={highlightPathIndex ?? ''} ...>`. Note `selectionSync.test.tsx:22-26` reads `map.dataset.selectedCandidate` and `map.dataset.hoverIndex`. Also note `e2e/failures.spec.ts:123` asserts `expect(fb.getByTestId(ids.map)).toBeVisible()` inside WebGL fallback!

```ts
import type { GridBundle, LocalPoint, RouteCandidate } from '../contracts';
import type { RejectedPathOption, SearchTraceFrame } from '../routing/searchTrace';
import type { UnifiedPoi } from '../terrain3d/coordBridge';

export interface MapCanvasProps {
  bundle: GridBundle;
  candidates: RouteCandidate[];
  selectedCandidateId: string | null;
  highlightPathIndex: number | null;
  start: LocalPoint | null;
  destination: LocalPoint | null;
  /** Which endpoint next map click sets ('start' | 'destination' | null disables pick). */
  pickMode?: 'start' | 'destination' | null;
  /** Optional overlays from visualizer & unified POI catalog. */
  activeTraceFrame?: SearchTraceFrame | null;
  rejectedPaths?: RejectedPathOption[];
  showRejectedPaths?: boolean;
  unifiedPois?: UnifiedPoi[];
  onSelectCandidate(candidateId: string): void;
  onHoverPathIndex(index: number | null): void;
  onPickPoint?(which: 'start' | 'destination', point: LocalPoint): void;
}

export function MapCanvas(props: MapCanvasProps): React.JSX.Element;
```

**Visual features cleanly layered inside SVG/Canvas in `MapCanvas.tsx`:**
- Existing terrain elevation shading + candidate polylines + hover ring.
- Optional **wavefront exploration overlay** (`activeTraceFrame.closedCells` translucent cyan tint + `activeTraceFrame.frontierCells` bright amber dots + `activeTraceFrame.currentBestCells` tentative path).
- Optional **rejected paths** (`showRejectedPaths` dashed SVG polylines with `<title>` + hover tooltip showing `reason`).
- Interactive click-to-set Point A / Point B when `pickMode !== null` (converting client offset -> `(east_m, north_m)` within `bundle.grid.extent`).

---

### 3.10 `src/ui/App.tsx`, `src/ui/Briefing.tsx`, `src/ui/ElevationProfile.tsx`, `src/ui/app.css` (`ui-app-shell`)

Keep all exported component names & existing `data-testid`s verbatim:
- `Briefing.tsx`: preserves `data-testid="briefing"`, `data-candidate-id`, `data-hover-index`, `"Selected route ${id}"`, `"Horizontal distance: ${f(...)} m"`, and `data-testid="briefing-hover"` `"Inspecting ${f(...)} m along route ..."`. Adds an optional `comparison?: AlgorithmComparison | null` badge row when trace comparison has run.
- `ElevationProfile.tsx`: preserves `data-testid="profile"`, `data-candidate-id`, `data-hover-index`, and `<input type="range" aria-label="Inspect position along route" ... />` (explicitly queried by `tests/selectionSync.test.tsx:67`!).
- `App.tsx`:
  - Preserves `<div className="app-shell">`, `data-testid="release-id"`, `data-testid="bundle-error"`, `data-testid="region-select"`, `data-testid="start-preset"`, `data-testid="destination-preset"`, `data-testid="round-trip"`, `data-testid="strict-quality"`, `data-testid="calculate"`, `data-testid="cancel"`, `data-testid="status"`, `data-testid="message"`, `data-testid="candidates"` (`candidate-c0/c1/c2` radios matching `/shortest-feasible|terrain-aware|uncertainty-aware/`), `data-testid="view-2d"`, `data-testid="view-3d"`, `data-testid="imagery-status"`, `data-testid="asset-warnings"`, `data-testid="export-json"`.
  - Renders Point B **Mission Complete / Arrival Modal** (`data-testid="arrival-modal"`) when `onArriveAtDestination` fires from `TerrainView`, showing summary stats (`ArrivalSummary`) + **`Return to Start Menu`** (`data-testid="return-to-menu"`) & **`Stay in 3D`** buttons.

---

### 3.11 Critical Non-Blocking DOM Layout Strategy (Test Compatibility Guarantee)

**Why this matters:** `tests/app.smoke.test.tsx`, `tests/selectionSync.test.tsx`, `e2e/journey.spec.ts`, `e2e/release.spec.ts`, and `e2e/failures.spec.ts` immediately interact with `start-preset`, `destination-preset`, `calculate`, `candidate-c0..c2`, `profile` slider, `view-3d`, and `export-json` right after `./` opens — WITHOUT clicking any modal close button first.

**Exact Layout Contract for `ui-start-menu` + `ui-app-shell`:**
1. **Default state on page load (`startMenuMode = 'docked'`):**
   - `StartMenuModal` renders as a compact top mission strip (`<section data-testid="start-menu-strip">`) ABOVE `.toolbar` in normal document flow — **ZERO `position: fixed` backdrop over `.toolbar`, `.sidebar`, or `.stage`**.
   - Clicking **`Mission Setup & Start Menu`** (`data-testid="open-start-menu"`) sets `startMenuMode = 'expanded'`, opening the full centered Start Menu Modal (`data-testid="start-menu-modal"`) with 6 Jezero EVA POIs (from `coordBridge.ts`), Point A/B visual cards, and **"Launch Animated Search -> 3D EVA"** CTA (`animate-then-3d`).
   - Clicking **"Launch Animated Search -> 3D EVA"** automatically sets endpoints, triggers route calculation (`handleCalculate`), collapses the expanded Start Menu (`startMenuMode = 'docked'`), and opens `<PathfindingVizPanel />` (`vizOpen = true`, auto-playing trace animation)!
2. **`<select data-testid="start-preset">` & `<select data-testid="destination-preset">`:**
   - Populated strictly from `bundle.pointsOfInterest` (`manifest.json`), NEVER polluted with synthetic extra options, so `e2e/release.spec.ts:23` continues to see the exact 3 HiRISE POIs (`Delta front – Skinner Ridge...`, `Delta front base...`, `Three Forks Sample Depot`) in `<select>`.
   - The additional 3 Marswalk POIs (`Base`, `Yori Pass`, `Rocky Top`) live inside `<StartMenuModal />` (`data-testid="poi-card-base"`, etc.) and map pins in `MapCanvas`, dispatching `{ type: 'mission/set-start', value: { kind: 'point', point } }` cleanly into the untouched `store.ts`!
3. **`<PathfindingVizPanel />` & `<SeeThinkingDrawer />`:**
   - When `vizOpen === false` (default on manual `Calculate route` clicks by automated tests!), the 2D `<MapCanvas />`, `<ElevationProfile />`, and `<Briefing />` remain 100% unobstructed.
   - An explicit `"Animate Pathfinding & See Thinking"` button (`data-testid="open-visualizer"`) in `.sidebar` / `.stage` header (and auto-open after `StartMenuModal` `"Launch"`!) opens `PathfindingVizPanel` docked cleanly below/beside the map header (never obscuring `view-2d`, `view-3d`, or `export-json`).
4. **3D Walkthrough (`viewMode === '3d'`):**
   - Renders `<TerrainSlot>` containing `<TerrainView {...viewProps} ... />` with `fallback={<MapCanvas ... />}`.
   - If WebGL is unavailable natively or stubbed `false` before mount, `TerrainSlot` still renders `data-testid="terrain-fallback"` (`data-kind="webgl-unavailable"`) containing `<MapCanvas />` (`e2e/failures.spec.ts:120-124` passes unchanged!).
   - If chunk load fails, `TerrainSlot` still renders `data-kind="load-error"` + `Retry 3D` (`e2e/failures.spec.ts:94-105` passes unchanged!).
   - If WebGL fails *inside* `TerrainView` (e.g. `selectionSync.test.tsx` / `terrain3d.test.tsx` in jsdom where `detectWebGL` is mocked `ok: true` but `getContext` returns `null`), `TerrainView` stays mounted as `data-testid="terrain-view"` in **Interactive Fallback Simulator** mode so `t3d.dataset` sync tests continue to pass 100%!

---

## 4. Build Budgets, Audit Compliance & Execution Sequence

### 4.1 Hard Ceilings (`scripts/audit.mjs`) — Verified Pre-Merge Baselines vs. Post-Merge Targets

| Budget Metric | Pre-Merge (`part-hritvik.md`) | Audit Hard Ceiling | Post-Merge Target & Guardrail |
|---|---:|---:|---|
| `entryJsGz` | `79.7 KB` | **`150 KB`** | **~`95–110 KB`**. GUARANTEED by never importing `three` outside `src/terrain3d/`. |
| `totalJsGz` | `84.1 KB` | **`450 KB`** | **~`255–275 KB`** (`three` + Marswalk chunk built in `marswalk` was `151.02 KB` gz). |
| `workerJsGz` | `4.0 KB` | **`50 KB`** | **~`10–15 KB`**. GUARANTEED by keeping `searchTrace.ts` and `coordBridge.ts` unimported in `src/routing/index.ts` & `src/worker/`. |
| `cssGz` | `0.5 KB` | **`30 KB`** | **~`4–8 KB`** (`app.css`). |
| `bundleDirGz` (non-HiRISE) | well under | **`15 MB`** | Unchanged (`public/bundles/` untouched). |
| `totalDistRaw` | `37.91 MB` | **`60.00 MB`** | **~`38.15 MB`** (`public/sites/jezero-delta/` = `24.53 MB` already counted in baseline!). |

### 4.2 Banned Patterns (`scripts/audit.mjs`) — Zero Tolerance
- **Zero** `console.log(`, `console.debug(`, `console.info(`, `console.trace(` anywhere in `src/`. Note: `marswalk/app/src/` MUST have every debug `console.log` stripped during TypeScript port (only legitimate `console.error` on fatal unexpected failures if truly needed, or prefer UI error states / `onError`).
- **Zero** `debugger`, Vite dev references, absolute filesystem paths (`/Users/...`, `/home/...`, `C:\Users\...`), `API_KEY` / `TOKEN` literals, or `mars-pathfinder/sim@1` strings in `dist/`.
- **All runtime fetches relative `./`** (`'./sites/jezero-delta/site.json'`, `'./sites/jezero-delta/photos/...'`), never leading `/sites/...`.

### 4.3 Wave Execution & Verification Checklist

1. **Wave 2 Batch A (Core Foundation — zero internal dependencies, run immediately in parallel):**
   `eng-solver`, `coord-bridge`, `sfx-audio`, `vr-terrain`
2. **Wave 2 Batch B (Dependent Modules — run in parallel once Batch A interfaces settle):**
   `eng-trace` (imports `evaEngine` types/helpers), `vr-player-mission` (imports `marswalkTypes`, `marswalkTerrain`, `coordBridge`), `vr-hud-panels` (imports `marswalkTypes`, `marswalkMission`, `coordBridge`), `ui-start-menu` (imports `coordBridge`), `ui-viz-thinking` (imports `searchTrace`), `ui-map-canvas` (imports `searchTrace`, `coordBridge`)
3. **Wave 2 Batch C (Assembly — run as soon as Batch A+B modules exist cleanly):**
   `vr-view` (`src/terrain3d/TerrainView.tsx`), `ui-app-shell` (`App.tsx`, `Briefing.tsx`, `ElevationProfile.tsx`, `app.css`)
4. **Wave 3 Verification Gate (4 parallel/staged agents after `npm run typecheck`):**
   - `test-unit-int`: Fix Windows CRLF read normalization in `pipeline.sim.test.ts:97`, add `*.json text eol=lf` in `.gitattributes`, run `npm run sim:update-golden`, write & pass `evaEngine.test.ts`, `searchTrace.test.ts`, `coordBridge.test.ts`, verify `npm run typecheck && npm run lint && npm test`.
   - `test-sim`: Verify all sim scenarios (`38+`), fuzz (`217`), realdata (`tests/realdata.test.ts` under `8000 ms`), determinism, and worker lifecycle tests pass `100%`.
   - `test-e2e`: Update `e2e/journey.spec.ts`, `e2e/release.spec.ts`, `e2e/golden/export-outpost-eastbench-c2.json`, add integrated flow test covering Start Menu -> Animated Visualizer -> See Thinking -> 3D Walkthrough -> Off-Path Respawn -> Point B Arrival -> Menu, verify `npm run test:e2e` (including untouched `e2e/failures.spec.ts`).
   - `audit-verify`: Final check `npm run build && npm run validate-bundle && npm run audit` exits `0` cleanly.


---

## 5. Authoritative Post-Debate Refinements & PR #2 / `dhani/ui-integrated` Overrides

> Ratified against `grok-4.7-high` across Rounds 1–3 (`docs/DEBATE_LOGS.md`). These rules override any conflicting details in Sections 2–4 above:

1. **Solver Quality Code Mapping (`evaEngine.ts`):**
   - Preserve exact placeholder hazard semantics **`UNKNOWN (1.0) > LOW (0.5) > GOOD (0.0)`** (`MAP_MARSPINEAPPLE_QUALITY_TO_INTERNAL`: `[3, 0, 2, 1]` where internal `1 = UNKNOWN -> 1.0`, `2 = LOW -> 0.5`, `0 = GOOD -> 0.0`, `3 = INVALID -> Infinity` — do NOT invert internal `1` and `2`!).
   - Apply **2-endpoint `worseQuality(u, v)`** identically in ALL THREE call sites (`step cost`, `buildMarsLeg`, `pathHasZeroQualityPenalty`).
   - Enforce BOTH cell slope `<= 20°` (verifying `tests/realdata.test.ts` `1.25x` straight-line ratio in Wave 3) AND edge grade `|dz| / len <= tan(20°)`.
   - Honor explicit `weightOverrides` on all policies (never zero out explicit `override.quality`).
   - Keep `sharedWorkspace` lazily allocated (`acquireWorkspace()`), clear heap in `finally`, and check `shouldStop`/`onProgress` ONLY when `(explored.n & 511) === 0` (`worker.sim.test.ts` advances `Date.now` 1 ms/call with `timeoutMs = 3`).
2. **Real Trace on `RouteSuccess` & Lazy Comparator (`src/contracts/route.ts`, `evaEngine.ts`, `searchTrace.ts`, `PathfindingVizPanel.tsx`):**
   - Add optional `trace?: SearchTraceData` (`<= 48` deterministic sampled frames, zero timestamps/randomness/functions) onto `RouteSuccess`.
   - Dynamically import `PathfindingVizPanel`, `SeeThinkingDrawer`, `StartMenuModal`, and `src/routing/searchTrace.ts` (`React.lazy`) from `App.tsx`, and NEVER add new `src/ui/features/*/entry.tsx` modules (so Vite's eager glob in `src/ui/shared/registry.ts` does NOT pull heavy modules into `entryJsGz`).
   - Run Dijkstra (`h=0`) & Greedy Best-First on a **separate local `SolverWorkspace`** strictly when `totalCells <= 100_000` (selected policy only), showing an honest skip notice on `1,000,000`-cell HiRISE and never emitting `optimalCostMatch`/optimality ratio for inadmissible Greedy Best-First.
3. **HiRISE Canvas Bitmap & Performance Safety (`MapCanvas.tsx`, `MapRasters.tsx`, `MapRoutes.tsx`):**
   - Fix Dhani's `MapCanvas.tsx` `PX_PER_CELL = 28` bug (`28000×28000` = `784M` px returns `null` from `getContext('2d')` on HiRISE!): clamp effective cell pixel scaling so canvas backing dimensions stay `<= 1000×1000` (e.g. `cellPx = Math.max(1, Math.min(28, Math.floor(800 / Math.max(width, height))))`, preserving 20×12 synthetic readability while fitting HiRISE!).
   - Render raster terrain (`MapRasters` / baseline terrain) into an offscreen/cached canvas keyed cleanly by `{ bundleVersion, layerVisibility, layerOpacity }`, and give `MapCanvas`'s `useEffect` an explicit dependency array so `vizFrameIndex` playback never re-paints 1,000,000 `fillRect`s per frame!
   - Draw wavefront + dashed rejected-path overlays cleanly inside BOTH `MapRoutes.tsx` (custom `routes` layer when discovered) AND `MapCanvas.tsx` fallback (for isolated unit tests).
4. **Reconciling Dhani's `origin/dhani/ui-integrated` (`55d1565`) with `4dfb88f` E2E & Feature Tests:**
   - In `App.tsx`: render `<OptionalAssetsStatus bundle={bundle} />`, keep `data-status={run.kind === 'finished' ? run.response.status : run.kind}` directly on `<p data-testid="route-status">`, keep `data-testid="route-message"`, `data-testid="candidate-${c.candidateId}"`, `data-testid="view-2d"`, `data-testid="view-3d"`, `data-testid="export-json"`, and keep `.controls` print CSS untouched.
   - In `Destinations.tsx`: align `data-testid="start-preset"` (placeholder `'— choose —'`, options strictly matching manifest `pois` for `e2e/release.spec.ts`) and `data-testid="destination-preset"`.
   - In `RequestControls.tsx`: keep `data-testid="cancel-request"` cleanly (`RequestControls.test.tsx` asserts it while `e2e/` never queries `cancel-route`; keep fallback button accessible).
   - In `Assumptions.tsx`: rebuild toggled policies in canonical `ROUTE_POLICIES` order and replace inaccurate `"OUTSIDE_EXTENT / MANUAL"` wording on strict-quality.
   - Fix the 4 mock `GridBundle` fixtures missing `manifestUrl` (`endpoints.test.tsx`, `MapRasters.test.tsx`, `MissionContext.test.tsx`, `foundation.test.tsx`) in Wave 3 `test-unit-int` (or `ui-app-shell`).
5. **Coordinate Bridge, Walkable 3D Terrain & Store Reset (`coordBridge.ts`, `marswalk*.ts`, `TerrainView.tsx`, `store.ts`):**
   - Delete unparameterized `localToVr2`; always gate `(586.81, 470.15)` by `bundle` (`isJezeroHiriseBundle`).
   - Keep `threeforks` (sol 663) distinct from `poi-p5` (sol 686/690 Depot, 41.5 m apart); keep CRISM `shiftM [-180, 204]` strictly on minerals texture.
   - Ground physics (`heightAtSceneXZ`) always on `bundle.elevation`; turn off `inner_nav.png` `route_through_array`; draw BOTH `outbound` and `returnLeg` (`roundTrip: true`).
   - Gate safety pre-move on proposed cell (`onPathCells` or cell-size-proportional threshold + `bundle.slope`/`exclusion`); rebind `onPathCells` on `selectedCandidateId` change; bind `[R]` Respawn on `window`; exit pointer lock on block; expose DOM test buttons on BOTH WebGL & fallback views; check `canvas.getContext('webgl2') || canvas.getContext('webgl')` BEFORE `new THREE.WebGLRenderer(...)` (avoiding `console.error` / wrong `onError` in jsdom).
   - Translate all HUD/Wrist/Debrief/POI strings to English using `ui_captions.json` + PR #2 `licences.json`.
   - Add `{ type: 'mission/reset' }` in `src/state/store.ts` (NOT in `INVALIDATING_ACTIONS`) calling `clearRoutes(s)` + clearing `start`/`destination`/`viewMode = '2d'`, and cancel in-flight worker on Return to Start Menu.
   - Scope `.gitattributes` to `tests/**/*.json text eol=lf` and `e2e/**/*.json text eol=lf`, and normalize `\r\n -> \n` on golden reads.
