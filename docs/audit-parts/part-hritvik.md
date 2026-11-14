# Role C (Hritvik Arora) Audit — Integration Shell, Contracts, State, Worker, Simulation, Audit & E2E

**Scope:** Root `marspineapple` integration architecture owned by **Role C** (per [OWNERS.md](../../OWNERS.md) and [INTERFACE.md](../../INTERFACE.md)), audited prior to any integration edits.

---

## 1. Role C's Goal & Architecture

Role C owns the end-to-end integration spine connecting Role A's region bundles, Ayush's routing solver, Role B's lazy 3D terrain view, and Dhani's UI shell without letting any module couple directly to another's internals:

```text
public/bundles/<id>/manifest.json + .f32/.u8 rasters
  │  src/app/bundleSelection.ts (selectBundle)
  │  src/data/loadBundle.ts (loadAndValidateBundle -> immutable GridBundle)
  ▼
src/state/store.ts (AppState reducer, invalidation rules, selectSelection)
  │  src/state/useRouteRunner.ts (requestRoute / cancelRoute)
  ▼
src/worker/client.ts (RouteWorkerClient: buffer copy/transfer, stale guard, timeout/restart)
  │  src/contracts/worker-protocol.ts (MainToWorker / WorkerToMain)
  ▼
src/worker/routing.worker.ts -> src/worker/handler.ts -> src/routing/index.ts (solveRoute)
  │
  ▼
Consumers via selectSelection(state):
  - 2D Map / Profile / Briefing (src/ui/*)
  - 3D Slot (src/app/TerrainSlot.tsx -> lazy src/terrain3d/TerrainView.tsx)
  - Deterministic Export (src/export/serialize.ts)
```

---

## 2. Actual Deliverables Inventory

### 2.1 Contracts (`src/contracts/`)
- [`geometry.ts`](../../src/contracts/geometry.ts): Frozen v1 planar coordinates (`LocalPoint { east_m, north_m }`, `LocalPoint3`, `CellRef { row, col, index }`, `Extent`). Grid is north-up, row-major (row 0 = north, col 0 = west), cell-centre sampled; forbids `x`/`y`/`lat`/`lng` in shared contracts.
- [`grid.ts`](../../src/contracts/grid.ts): Canonical coordinate helpers (`cellIndex`, `cellRef`, `cellCenter`, `pointToCell`, `toSceneXYZ`). Points on the east or south outer edges return `null` from `pointToCell`. `toSceneXYZ` maps `(east_m, north_m, elevation_m)` -> `[east_m, elevation_m, -north_m]`.
- [`manifest.ts`](../../src/contracts/manifest.ts): `SUPPORTED_SCHEMA = 'mars-pathfinder/region-bundle'`, `SUPPORTED_SCHEMA_MAJOR = 1`, `REQUIRED_LAYERS` (`elevation`, `slope`, `roughness`, `quality`, `exclusion`), `QUALITY` (`0` NO_ELEVATION, `1` GOOD, `2` LOW, `3` UNKNOWN), `EXCLUSION` (`0` NONE, `1` MISSING_ELEVATION, `2` UNSUPPORTED_DERIVATIVE, `3` OUTSIDE_EXTENT, `4` MANUAL), `RegionManifest`, `PointOfInterest`, `DisplayAssetDescriptor`, `SourceRecord`, `bytesPerElement`.
- [`bundle.ts`](../../src/contracts/bundle.ts): Immutable main-thread `GridBundle` and structured-clone `GridBundleTransfer` (`ArrayBuffer` copies).
- [`route.ts`](../../src/contracts/route.ts): `ROUTE_POLICIES` (`'shortest-feasible' | 'terrain-aware' | 'uncertainty-aware'`), `RouteRequest`, `EndpointResolution`, `RouteMetrics`, `QualityInterval`, `ElevationProfile`, `RouteLeg`, `RouteCandidate` (`missionStatus: 'one-way' | 'round-trip-complete' | 'round-trip-incomplete'`), discriminated `RouteResponse` (`progress | success | no-path | invalid-input | cancelled | timeout | data-error`), `isFinal`.
- [`worker-protocol.ts`](../../src/contracts/worker-protocol.ts): `MainToWorker` (`load-bundle | route | cancel`) and `WorkerToMain` (`ready | bundle-loaded | bundle-error | route-response`).
- [`release.ts`](../../src/contracts/release.ts) & [`index.ts`](../../src/contracts/index.ts): `ReleaseId` and `formatReleaseId` (`app <appVersion> · bundle <bundleVersion> · model <modelVersion>`).

### 2.2 Data Loading & App Composition (`src/data/`, `src/app/`, `src/config.ts`, `src/main.tsx`)
- [`loadBundle.ts`](../../src/data/loadBundle.ts): `loadAndValidateBundle` validates HTTP fetch, JSON parse, schema/major version (`checkSchemaVersion`), manifest structure & extent/dimensions consistency (`validateManifestShape`), required relative layer filenames, per-layer byte length, grid dimensions, and SubtleCrypto SHA-256 (`hashesVerified` falls back to `false` if `crypto.subtle` is absent). Fails loudly with stage-typed `BundleLoadError` (`fetch-manifest | parse-manifest | version | schema | fetch-raster | byte-length | dimensions | hash`).
- [`bundleSelection.ts`](../../src/app/bundleSelection.ts): Precedence `VITE_BUNDLE_MANIFEST` > `VITE_BUNDLE` > `public/bundles/index.json` (`release` in production builds, `dev` otherwise). Currently `public/bundles/index.json` points `release` to `jezero-west-hirise-v0.1.0` and `dev` to `synthetic-v0`.
- [`useRegionLoader.ts`](../../src/app/useRegionLoader.ts): Selects and loads the region bundle on mount, dispatching `region/loading`, `region/loaded`, or `region/failed`.
- [`TerrainSlot.tsx`](../../src/app/TerrainSlot.tsx), [`terrainLoader.ts`](../../src/app/terrainLoader.ts), [`webgl.ts`](../../src/app/webgl.ts), [`ErrorBoundary.tsx`](../../src/app/ErrorBoundary.tsx): Probes WebGL (`detectWebGL`, immediately releasing probe context), lazy-loads `src/terrain3d/TerrainView.tsx` behind `Suspense` + `ErrorBoundary`, supports retry (`Retry 3D`) except on `webgl-unavailable`, and degrades cleanly to `[data-testid="terrain-fallback"]` with `data-kind` (`webgl-unavailable | context-lost | render-error | load-error | terrain-data | texture`) while keeping 2D map, profile, and briefing functional.
- [`tiles.ts`](../../src/app/tiles.ts) & [`ContextImageryStatus.tsx`](../../src/app/ContextImageryStatus.tsx): Optional NASA Trek WMTS adapter (`VITE_TILES=trek`, off by default), `4000 ms` timeout, offline/error tolerant, never blocks bundle load or routing.
- [`optionalAssets.ts`](../../src/app/optionalAssets.ts) & [`OptionalAssetsStatus.tsx`](../../src/app/OptionalAssetsStatus.tsx): Background reachability + `byteLength` check (`8000 ms` timeout) for `manifest.displayAssets`; missing/corrupt textures never block routing.
- [`config.ts`](../../src/config.ts) & [`main.tsx`](../../src/main.tsx): Exposes `APP_VERSION`, `EXPECTED_MODEL_VERSION` (from `src/routing`), `IS_PRODUCTION_BUILD`, `BUNDLE_OVERRIDE`, `ROUTE_TIMEOUT_MS` (default `20000`, `VITE_ROUTE_TIMEOUT_MS` valid `100..120000`), and `TILE_CONFIG`.

### 2.3 State & Worker Plumbing (`src/state/`, `src/worker/`)
- [`store.ts`](../../src/state/store.ts): Pure `reducer`, `createInitialState`, `selectSelectedCandidate`, `selectSelection`, `selectCanRequestRoute`, `buildRouteRequest`.
- [`AppStateProvider.tsx`](../../src/state/AppStateProvider.tsx) & [`context.ts`](../../src/state/context.ts): React context provider for `{ state, dispatch }`.
- [`useRouteRunner.ts`](../../src/state/useRouteRunner.ts): Instantiates `RouteWorkerClient`, reloads bundle into worker when `loadedRegion` changes, exposes `requestRoute` / `cancelRoute`, and cancels in-flight worker work if `state.activeRequestId` is cleared by an invalidating action.
- [`client.ts`](../../src/worker/client.ts): `RouteWorkerClient` manages a single active request, copies `GridBundle` arrays via `.slice()` (`bundleToTransfer`) so main-thread typed arrays are never detached, enforces client timeout (`timeoutMs`, default `20000 ms`), terminates and restarts the worker on `cancel` / `timeout` / `supersede` (re-sending the bundle), handles worker `onerror` -> `data-error` (`worker-crash`), and drops stale messages (`staleDropped++`).
- [`handler.ts`](../../src/worker/handler.ts) & [`routing.worker.ts`](../../src/worker/routing.worker.ts): Worker-side handler calling `solveRoute(grid, req, { shouldStop, onProgress })` from `src/routing` (`placeholderEngine.ts` currently exports `PLACEHOLDER_MODEL_VERSION = 'placeholder-astar-0.2.0'`).

### 2.4 Export (`src/export/`)
- [`serialize.ts`](../../src/export/serialize.ts): `EXPORT_FORMAT = 'mars-pathfinder/route-export@1'`. `stableStringify` recursively sorts object keys, converts `NaN`/`Infinity`/`undefined` to `null`, formats with 2-space indent + trailing `\n`, omits timestamps/session IDs (`requestId` excluded) for byte-identical determinism, and runs `assertNoLocalPaths` against `file://`, `/home/`, `/Users/`, `/tmp/`, `C:\`. `exportFileName` produces `mars-pathfinder_<bundleVersion>_<modelVersion>_<candidateId>.json`.

### 2.5 Simulation Suite (`src/sim/`, `tests/sim/`, `scripts/sim/`)
- [`bundle.ts`](../../src/sim/bundle.ts), [`derive.ts`](../../src/sim/derive.ts), [`rng.ts`](../../src/sim/rng.ts): Deterministic seeded terrain builder (`SIM_MARKER = 'mars-pathfinder/sim@1'`, `mulberry32`, `fbm`, slope/roughness derivation, in-memory `simFetch`).
- [`scenarios.ts`](../../src/sim/scenarios.ts): 15 deterministic scenarios (`flat-plain`, `slope-plane`, `ridge-gap`, `maze`, `crater-basin`, `noisy-rough`, `quality-patchwork`, `quality-wall`, `missing-holes`, `excluded-cells`, `large-512`, `strip-row`, `strip-column`, `degenerate-endpoints`, `no-quality-classes`, totalling 38 CLI cases) + 3 random fuzz families (`flat-obstacles`, `flat-quality`, `noisy`).
- [`oracle.ts`](../../src/sim/oracle.ts): Independent Dijkstra `referenceShortest` (with `cornerCut` toggle), `dataValid`, `isFlat`, and `octile`.
- [`invariants.ts`](../../src/sim/invariants.ts): Solver-independent `checkLeg` and `checkResponse`.
- [`engine.ts`](../../src/sim/engine.ts) & [`tests/sim/engineUnderTest.ts`](../../tests/sim/engineUnderTest.ts): Pluggable `SIM_ENGINE` harness (`solveRoute` + `MODEL_VERSION`).
- `tests/sim/*.sim.test.ts` + `tests/sim/golden/*.json`: Contract tests, engine scenario/determinism/perf tests, seeded fuzz tests (regression seed `20261608`), worker lifecycle interleaving tests, and whole-pipeline export determinism + golden tests.

### 2.6 Scripts, Audit & E2E (`scripts/`, `e2e/`, `tests/`)
- [`scripts/audit.mjs`](../../scripts/audit.mjs): Post-build gzip level-9 budget checker, 13-pattern content scanner, source-map/`.env` detector, and release-bundle `synthetic` check (`--release` fails if `release` bundle is synthetic).
- `scripts/make-fixture.mjs`, `scripts/validate-bundle.mjs`, `scripts/serve-static.mjs`, `scripts/smoke-preview.mjs`, `scripts/make-examples.ts`, `scripts/sim/run-sim.ts`.
- `tests/*.test.ts(x)` (12 unit/integration test files + 5 `tests/sim/*.sim.test.ts` files).
- [`playwright.config.ts`](../../playwright.config.ts) & `e2e/` (`fixtures.ts`, `journey.spec.ts`, `failures.spec.ts`, `release.spec.ts`, `golden/export-outpost-eastbench-c2.json`): 3 built projects (`release` on `:4280`, `variant` on `:4281`, `synthetic` on `:4282`) served under `/marspineapple/` using `channel: 'chrome'`.

---

## 3. Contracts, Invariants & Enforcement Rules

### 3.1 State Invalidation & Selection Sync (`src/state/store.ts`)
- **Invalidating actions** (`INVALIDATING_ACTIONS`): `mission/setStart`, `mission/setDestination`, `mission/setPolicies`, `mission/setWeights`, `mission/setStrictQuality`, `mission/setRoundTrip`, `mission/setModelVersion`, `region/loaded`, `region/loading`. These clear `activeRequestId`, reset `running` to `idle`, and mark `isStale = true` if candidates/finished results exist (`region/loaded` with a new `bundleVersion` additionally clears routes and endpoints).
- **Non-invalidating actions**: `view/setMode`, `view/setLayer`, `view/setPanel`, `view/setCamera`, `view/hover`, `view/set3dStatus`, `route/select`.
- **Two-layer stale guard**:
  1. `RouteWorkerClient` drops any `route-response` whose `requestId !== active.request.requestId` or `bundleVersion !== active.request.bundleVersion`.
  2. `reducer` drops `route/update` unless `r.requestId === s.activeRequestId` and `r.bundleVersion === s.loadedRegion.bundle.bundleVersion`.
- **Single selection view-model**: `selectSelection(state)` validates that `hover` matches `selectedCandidateId` and a valid `outbound.path` index; `route/select` clears `display.hover`.

### 3.2 Solver-Independent Invariants (`src/sim/invariants.ts` & `tests/sim/expectations.ts`)
- **`checkResponse` / `checkLeg` (`src/sim/invariants.ts`)**:
  - Echoes `requestId`, `bundleVersion`, and `modelVersion`.
  - Endpoints (`start`, `destination`) snap via `pointToCell` and `accepted` matches `cellCenter`.
  - Candidate IDs and cell paths are unique (identical `outbound.cells | returnLeg?.cells` deduplicated; no policy appears in multiple candidates).
  - Every leg: non-empty, starts at `from`, ends at `to`, no cell revisits, 8-neighbour step continuity, no diagonal corner cutting past invalid cells (`!dataValid`), `path` entries match `cellCenter` + `b.elevation[i]`, `horizontalDistance_m` equals sum of step lengths, `surfaceDistance_m >= horizontalDistance_m`, `ascent_m` / `descent_m` match steps and `ascent - descent == net elevation`, `cellCount === cells.length`, finite metrics, `weightedCost.value >= straight-line` lower bound, contiguous `qualityIntervals` summing to `hd` and matching `unknownQualityLength_m` / `lowQualityLength_m` and their percentages, and `profile.pathIndex` equals `0..n-1`.
  - Strict mode: no `QUALITY.UNKNOWN` cells visited and `unknownQualityLength_m <= 1e-6`.
  - Round-trip: `roundTrip: false` -> `returnLeg === null` & `'one-way'`; `roundTrip: true` -> `'round-trip-complete'` with `destination -> start` leg, or `'round-trip-incomplete'` with `returnLeg: null`.
- **Oracle Expectations (`tests/sim/expectations.ts`)**:
  - `checkExpectations`: verifies exact `invalid-input` reasons (`no-policies`, `strict-quality-unsupported`, `endpoint-outside-region`, `endpoint-excluded`, `endpoint-quality-excluded`), data-level disconnected never returns `success`, and on flat terrain (`isFlat`), `success` iff connected under strictest admissible reading, `no-path` iff disconnected under permissive reading, and `shortest-feasible` lies between the corner-cutting lower bound and no-corner-cutting 8-neighbour optimum.
- **The 2-Endpoint `worseQuality` Rule**:
  - **Specification (`INTERFACE.md` §5, §9.4 & `src/routing/placeholderEngine.ts` lines 95–109, 229–237)**: Every edge `(u, v)` is assigned `worseQuality(quality[u], quality[v])` using rank `GOOD (0) < LOW (1) < UNKNOWN (2) < NO_ELEVATION (3)`. Placeholder ≥ 0.2.0 uses this same conservative edge rule for **both** exposure accounting (`buildLeg`: `lowQualityLength_m`, `unknownQualityLength_m`, `qualityIntervals`) **and** the quality penalty term in A* edge cost (`edgeQualityPenalty`).
  - **Why & How Verified (`tests/sim/expectations.ts` `uncertaintyNoWorse` & `tests/sim/fuzz.sim.test.ts`)**: In placeholder `0.1.0`, averaging the two endpoint penalties caused `uncertainty-aware` to report *more* unknown-quality metres than `shortest-feasible` (caught by fuzz seed `20261608`, preserved in `REGRESSION_SEEDS = [20261608]`).
  - **Enforcement details**: `checkLeg` in `src/sim/invariants.ts` verifies internal consistency between `leg.qualityIntervals`, `unknownQualityLength_m`/`lowQualityLength_m`, and `unknownQualityPct`/`lowQualityPct`, and checks strict-mode zero unknown exposure; `uncertaintyNoWorse(res)` in `tests/sim/expectations.ts` enforces `ua.outbound.metrics.unknownQualityLength_m <= sf.outbound.metrics.unknownQualityLength_m + 1e-6` on flat quality scenarios (`quality-patchwork` and `flat-quality` fuzz family).

### 3.3 ESLint Rules (`eslint.config.js`) & Dist Audit Rules (`scripts/audit.mjs`)
- **ESLint (`eslint.config.js`)**:
  - Applies `@eslint/js` `recommended` + `typescript-eslint` `recommended` (which enforces `@typescript-eslint/no-explicit-any` as an **error**) to `**/*.{ts,tsx}`.
  - Enforces `react-hooks` recommended rules and `react-refresh/only-export-components` (`warn`, `allowConstantExport: true`).
  - Enforces `@typescript-eslint/no-unused-vars` (`error`, `argsIgnorePattern: '^_'`, `varsIgnorePattern: '^_'`).
  - Lints `scripts/**/*.mjs` and `eslint.config.js` with `js.configs.recommended` (`globals.node`); ignores `dist`, `node_modules`, `public/bundles`.
- **Audit (`scripts/audit.mjs`, post-build on `dist/`)**:
  - Rejects `console.log`/`debug`/`info`/`trace` calls (`/\bconsole\.(log|debug|info|trace)\s*\(/`), `debugger`, Vite dev overlays, local absolute paths, credential/API-key/Bearer patterns, `mars-pathfinder/sim@1` (`SIM_MARKER`), `.map` source maps, and `.env` files anywhere in `dist/`. (Note: `no console.log in dist` is enforced by `scripts/audit.mjs`, not `eslint.config.js`.)

### 3.4 Strict `data-testid` & Accessibility Contracts (`e2e/fixtures.ts`, `e2e/*.spec.ts`, `README.md`)
- **`e2e/fixtures.ts` `ids` map**:
  `release-id`, `route-status` (+ `data-status`), `route-message`, `calculate`, `start-preset`, `destination-preset`, `map-canvas` (+ `data-selected-candidate`, `data-hover-index`), `profile` (+ `data-candidate-id`, `data-hover-index`), `briefing` (+ `data-candidate-id`, `data-hover-index`), `terrain-view` (+ `data-selected-candidate`, `data-hover-index`), `terrain-fallback` (+ `data-kind`), `bundle-error`, `export-json`, `imagery-status` (+ `data-status`), `optional-assets-status` (+ `data-status`), `stale`, `synthetic-production-warning`.
- **Additional `data-testid`s / labels asserted by `e2e/*.spec.ts`, `tests/app.smoke.test.tsx`, `tests/selectionSync.test.tsx`**:
  `candidate-<id>` (e.g. `candidate-c0`), `view-2d`, `view-3d`, `synthetic-badge`, `briefing-hover`, `cancel-route` (documented in `README.md`), plus accessible labels `'Inspect position along route'`, `/Strict quality/`, `'Retry 3D'`, `'start preset'`, `'destination preset'`, `'Round trip'`, `'slope'`, `'Export JSON'`.
- **`consoleGuard` (`e2e/fixtures.ts`)**: Auto-fixture fails any E2E test on any `console.error` or `pageerror` not explicitly allow-listed for that test.

---

## 4. Standalone Verification Results (Pre-Edit Baseline)

All commands were executed on `HEAD` (`448c806`) in `c:\Users\Ayush\Documents\ChatGPT\mars` with zero workspace modifications.

| Command | Exit Code | Result Summary |
|---|---|---|
| `npm run typecheck` (`tsc -b --noEmit`) | `0` | Passed cleanly with zero type errors. |
| `npm run lint` (`eslint .`) | `0` | Passed cleanly with zero errors/warnings. |
| `npm test` (`vitest run`) | `1` | **16/17 test files passed; 152/156 tests passed; 4 failed** in `tests/sim/pipeline.sim.test.ts` (see details below). |
| `npm run sim` (`tsx scripts/sim/run-sim.ts`) | `0` | **38/38 cases passed, 0 invariant violations** (Engine: `src/routing` `placeholder-astar-0.2.0`; `large-512` 3 policies solved in `233.3 ms`). |
| `npm run build` (`tsc -b && vite build`) | `0` | Built `dist/` cleanly in `283 ms` (49 modules transformed). |
| `npm run audit` (`node scripts/audit.mjs`) | `0` | **AUDIT PASS** (15 text files scanned against 13 rules; release bundle `jezero-west-hirise-v0.1.0`, `synthetic=false`). |

### 4.1 `npm test` Detailed Breakdown
- **Passed (16 files, 152 tests):**
  - `tests/engine.test.ts` (8)
  - `tests/store.test.ts` (19)
  - `tests/client.test.ts` (6)
  - `tests/bundleSelection.test.ts` (5)
  - `tests/loadBundle.test.ts` (12)
  - `tests/serialize.test.ts` (4)
  - `tests/grid.test.ts` (3)
  - `tests/tiles.test.ts` (5)
  - `tests/app.smoke.test.tsx` (6)
  - `tests/selectionSync.test.tsx` (2)
  - `tests/terrain3d.test.tsx` (6)
  - `tests/realdata.test.ts` (9) — HiRISE P3↔P4 (`2657 ms`), P4↔P5 (`1280 ms`), P3↔P5 (`795 ms`), all within `8000 ms` budget.
  - `tests/sim/fuzz.sim.test.ts` (1 test: `31 terrains x 7 requests = 217 requests` — 115 `success`, 1 `no-path:disconnected-under-limits`, 66 `invalid:endpoint-excluded`, 22 `invalid:endpoint-outside-region`, 13 `invalid:endpoint-quality-excluded`)
  - `tests/sim/worker.sim.test.ts` (7)
  - `tests/sim/contract.sim.test.ts` (30)
  - `tests/sim/engine.sim.test.ts` (15, `large-512` 3 policies in `305 ms`)
  - `tests/sim/pipeline.sim.test.ts` — 14/18 passed (`whole pipeline per scenario` determinism across all 14 non-perf scenarios passed).
- **Failed (1 file, 4 tests) — Windows CRLF line-ending mismatch only:**
  - `tests/sim/pipeline.sim.test.ts` → `golden exports` (4 tests: `ridge-gap / straight-across`, `quality-patchwork / across-band`, `degenerate-endpoints / start-equals-goal`, `strip-column / end-to-end`):
    `AssertionError: expected '{\n ...' to be '{\r\n ...'`.
    Verified via `git ls-files --eol tests/sim/golden e2e/golden`: the git index stores LF (`i/lf`), while Windows checkout wrote CRLF (`w/crlf`) to `tests/sim/golden/*.json` (and `e2e/golden/export-outpost-eastbench-c2.json`), whereas `serializeRouteExport` emits `\n`. Content is otherwise identical; strict `toBe(readFileSync(..., 'utf8'))` fails on `\r\n` vs `\n`.

### 4.2 `npm run build` & `npm run audit` Exact Measurements & Budget Headroom

From `npm run build` (Vite reported sizes):
- `dist/index.html`: `0.48 kB` (`gzip: 0.31 kB`)
- `dist/assets/index-BVtLs3r-.css`: `1.14 kB` (`gzip: 0.53 kB`)
- `dist/assets/TerrainView-Bpcs11IN.js`: `0.61 kB` (`gzip: 0.38 kB`)
- `dist/assets/routing.worker-BZeNQwEi.js`: `9.94 kB`
- `dist/assets/index-rl14xfx2.js`: `262.48 kB` (`gzip: 82.65 kB`)

From `npm run audit` (gzip level-9 measurements vs `BUDGETS` in `scripts/audit.mjs`):

| Metric | Measured | Budget | Headroom Remaining |
|---|---|---|---|
| `entryJsGz` (entry JS initial) | `79.7 KB` gz (`256.3 KB` raw) | `150.0 KB` gz | **70.3 KB gz** (53.1% used) |
| `totalJsGz` (all JS incl. lazy + worker) | `84.1 KB` gz (`266.6 KB` raw) | `450.0 KB` gz | **365.9 KB gz** (18.7% used) |
| `workerJsGz` (routing worker) | `4.0 KB` gz (`9.7 KB` raw) | `50.0 KB` gz | **46.0 KB gz** (8.0% used) |
| `cssGz` (CSS) | `0.5 KB` gz (`1.1 KB` raw) | `30.0 KB` gz | **29.5 KB gz** (1.7% used) |
| `bundle jezero-west-ctx20m-v0.1.0` | `51.0 KB` gz (`68.4 KB` raw) | `15.00 MB` gz | **14.95 MB gz** |
| `bundle jezero-west-hirise-v0.1.0` | `10.30 MB` gz (`14.16 MB` raw) | `15.00 MB` gz | **4.70 MB gz** |
| `bundle synthetic-v0` | `5.1 KB` gz (`30.1 KB` raw) | `15.00 MB` gz | **14.99 MB gz** |
| `totalDistRaw` (total `dist/` raw) | **`37.91 MB` raw** | **`60.00 MB` raw** | **22.09 MB raw** (63.2% used) |

> **Integration Note:** `totalDistRaw` is currently `37.91 MB` (vs `~14.5 MB` previously noted in `README.md`) because `public/bundles/` now contains `jezero-west-hirise-v0.1.0` (`14.16 MB` raw), `jezero-west-ctx20m-v0.1.0` (`68.4 KB` raw), and `public/sites/jezero-delta` assets added in commit `448c806` (leaving `22.09 MB` raw headroom before hitting the `60.00 MB` total `dist/` cap). Likewise, `totalJsGz` has `365.9 KB` gz headroom for lazy `three.js` + Role B 3D code + Ayush's real routing solver + Dhani's UI.
