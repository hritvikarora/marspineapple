# Mars Pathfinder — Pre-Merge Findings & Integration Architecture (`merge/integration`)

**Baseline commit audited:** `448c806` (`merge/integration`)  
**Audit inputs:** [part-irene.md](audit-parts/part-irene.md), [part-gabriele.md](audit-parts/part-gabriele.md), [part-hritvik.md](audit-parts/part-hritvik.md), [part-ayush.md](audit-parts/part-ayush.md), [part-dhani.md](audit-parts/part-dhani.md), [OWNERS.md](../OWNERS.md), [INTERFACE.md](../INTERFACE.md), [algorithm/docs/team-tasks.md](../algorithm/docs/team-tasks.md), [algorithm/docs/project-plan.md](../algorithm/docs/project-plan.md), [docs/SIMULATION-FOR-AYUSH.md](SIMULATION-FOR-AYUSH.md), [docs/RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md), [docs/DEMO-SCRIPT.md](DEMO-SCRIPT.md), [marswalk/README.md](../marswalk/README.md), and direct read-only checks on `HEAD`.

---

## 1. Team Component Inventory Table

| Team Member | Role & Original Task | Status | Key Files & Folders | Interfaces & Dependencies |
| --- | --- | --- | --- | --- |
| **Irene Plemic** | **Role A — Data, GIS & Scientific Evidence:** Produce validated real Mars region bundle (`~1 km²` HiRISE 1 m + coarse CTX 20 m fallback) in north-up cell-center meter grid, reproducible Python pipeline, science stops (POIs), and bilingual captions/jury evidence. | **Done** *(built; captions/context POIs unconsumed by UI)* | `scripts/data/` (`acquire.py`, `process.py`, `make_validation.py`, `make_pois.py`, `export_bundle.py`, `src/terrain.py`, `tests/test_terrain.py`, `pois.json`, `sources.json`, `config.json`, `requirements.lock`, `versions.txt`), `scripts/data/poi_sources/` (`M20_waypoints.json`, `meda/`), `scripts/data/texts/` (`ui_captions.json`/`.md`, `data_chain_jury.md`, `limitations.md`, `quality_interpretation.md`, `make_captions.py`), `public/bundles/jezero-west-hirise-v0.1.0/`, `public/bundles/jezero-west-ctx20m-v0.1.0/`, `public/bundles/index.json` | Emits `mars-pathfinder/region-bundle` `v1.0` (`manifest.json`, `.f32`/`.u8`, display textures) verified by `scripts/validate-bundle.mjs`. Python pipeline depends on `requirements.lock` (`rasterio`, `numpy`, `pyproj`, `scipy`, `pytest`; `raw/*.tif`, `package/`, `.venv/` gitignored). `ui_captions.json` has zero consumers in `src/`. |
| **Gabriele (`Gabryg07`)** | **Role B — 3D / WebXR Terrain Walkthrough (`marswalk/`):** Implement lazy 3D / optional WebXR planetary EVA viewer over Jezero terrain (`TerrainViewProps` plug-in for root app). | **Partial** *(rich standalone app; not integrated into `src/`)* | `marswalk/app/` (`src/main.js`, `terrain.js`, `player.js`, `mission.js`, `pois.js`, `helmet.js`, `hud.js`, `arm.js`, `info.js`, `sky.js`, `package.json`, `vite.config.js`), `marswalk/pipeline/` (`fetch*.py`, `build_site.py`), `marswalk/test/` (`probe.js`, `shot.js`, `xr.js`), `public/sites/jezero-delta/` (`site.json`, `inner/mid/outer` heightfields, orthos, slopes, `inner_nav.png`, `minerals.png`, `thermal.png`, `photos/*.jpg`), root stub [src/terrain3d/TerrainView.tsx](../src/terrain3d/TerrainView.tsx) | Standalone Vite + `three@^0.187.0` (`window.app`, full-screen canvas, hardcoded `/sites/jezero-delta/site.json`). Root expects Role B behind `src/app/TerrainSlot.tsx` via `TerrainViewProps` (`bundle`, `candidates`, `selectedCandidateId`, `highlightPathIndex`, `verticalExaggeration`, `camera`, `onSelectCandidate`, `onError`). |
| **Hritvik Arora** | **Role C — Root Platform, Contracts, Worker, Export, Sim, Audit & E2E:** Own frozen contracts (`src/contracts/`), bundle loader, state store, worker lifecycle, deterministic JSON export, simulation/fuzz harness, CI audit budgets, and Playwright E2E suite. | **Done** *(spine complete; still points to `placeholderEngine.ts`)* | `src/contracts/` (`geometry.ts`, `grid.ts`, `manifest.ts`, `bundle.ts`, `route.ts`, `worker-protocol.ts`, `release.ts`), `src/data/loadBundle.ts`, `src/app/` (`bundleSelection.ts`, `useRegionLoader.ts`, `TerrainSlot.tsx`, `webgl.ts`, `tiles.ts`, `optionalAssets.ts`), `src/state/` (`store.ts`, `useRouteRunner.ts`), `src/worker/` (`client.ts`, `handler.ts`, `routing.worker.ts`), `src/export/serialize.ts`, `src/routing/placeholderEngine.ts`, `src/sim/`, `scripts/` (`audit.mjs`, `validate-bundle.mjs`, `sim/run-sim.ts`, `make-fixture.mjs`, `make-examples.ts`), `tests/`, `e2e/` | Defines frozen v1 schemas (`RouteRequest`, `RouteResponse`, `GridBundle`, `MainToWorker` / `WorkerToMain`), `RouteWorkerClient`, `SIM_ENGINE`, `scripts/audit.mjs` budgets, and Playwright `data-testid` / `consoleGuard` contracts. |
| **Ayush** | **Routing Algorithm Deliverable (`algorithm/`):** Implement deterministic TypeScript 8-neighbor A* EVA router over north-up cell grids with Horn slope, plane-fit roughness, no-corner-cutting, 3 policies, deduplication, round-trip leg, explanations, Dijkstra oracle, and benchmark. | **Partial** *(complete & verified in `algorithm/`; not wired to root)* | `algorithm/src/contracts/routing.ts`, `algorithm/src/coordinates/grid.ts`, `algorithm/src/routing/` (`index.ts`, `engine.ts`, `astar.ts`, `dijkstra.ts`, `pathAudit.ts`, `profiles.ts`, `edgeCost.ts`, `cellAdmissibility.ts`, `edgeAdmissibility.ts`, `hornSlope.ts`, `roughness.ts`, `elevationSupport.ts`, `components.ts`, `binaryHeap.ts`, `workspace.ts`, `deduplicate.ts`, `returnLeg.ts`, `draping3d.ts`, `explanations.ts`, `mutex.ts`, `route.worker.ts`, `routeClient.ts`, `marspineappleAdapter.ts`), `algorithm/tests/fixtures/` (`F01`–`F12`), `algorithm/tests/routing/` (`t01`–`t40`), `algorithm/docs/*.md` | Exposes two interfaces: (1) standalone `RoutingEngine` / `RoutePlannerClient` (`eastM`/`northM`, `0=ACCEPTABLE..3=INVALID`); (2) root-compatible `marspineappleAdapter.ts` (`solveRoute`, `MODEL_VERSION = 'eva-astar-1.0.0'`). Root `src/routing/index.ts` still imports `placeholderEngine.ts`. |
| **Dhani Sharma** | **Role D / UI (`src/ui/*`):** Build the interactive 2D/3D web mission interface, candidate comparison, elevation profile with quality intervals, briefing/print layout, science evidence drawer, and user controls wired to Role C state. | **Missing** *(0 Dhani commits; minimal Role C stubs only)* | `src/ui/` ([App.tsx](../src/ui/App.tsx), [MapCanvas.tsx](../src/ui/MapCanvas.tsx), [ElevationProfile.tsx](../src/ui/ElevationProfile.tsx), [Briefing.tsx](../src/ui/Briefing.tsx), [app.css](../src/ui/app.css)), `tests/app.smoke.test.tsx`, `tests/selectionSync.test.tsx` | Consumes `useAppState()`, `useRouteRunner()`, `selectSelection()`, `ROUTE_POLICIES`, `TerrainSlot`, `serializeRouteExport`. Must preserve E2E/unit `data-testid` and accessible-label contracts (`e2e/fixtures.ts`). |

---

## 2. Per-Member Deep Audit

### 2.1 Irene Plemic (Role A — Data, GIS, and Scientific Evidence)

- **Original Goal** ([algorithm/docs/team-tasks.md](../algorithm/docs/team-tasks.md#L313-L459)): Produce one compact, contract-validated real Mars region bundle (`~1 km²` in western Jezero crater) plus a coarse fallback bundle, derived cleanly from USGS/NASA products via a reproducible Python pipeline (`rasterio`, `numpy`, GDAL) with raw binaries outside git/`public/`, explicit `cos(lat)` ground scaling, halo-buffered derivatives, honest quality/exclusion codes, at least two verified science destinations inside extent, multi-mission context (Perseverance waypoints, Mastcam-Z panoramas, MEDA), bilingual layer captions, limitations, and a 6-step data-chain narrative for judges.
- **What Was Actually Built**:
  - **Primary Bundle (`public/bundles/jezero-west-hirise-v0.1.0/`):** `1000 × 1000` grid over Western Jezero delta front (`lon 77.395064–77.411934° E`, `lat 18.447568–18.464438° N`; Equirectangular source `x: 4587569.0–4588569.0 m`, `y: 1093474.0–1094474.0 m`). Native 1:1 USGS Mars 2020 TRN HiRISE 1 m DTM (`JEZ_hirise_soc_006`, `doi:10.5066/P9REJ9JN`) with zero interpolation (`-2551.18 m` to `-2457.14 m`, `0` non-finite cells). Ground spacing corrected by `cos(18.456°) = 0.9485670310210961` (`0.948567 m E × 1.0 m N`; extent `948.567 m × 1000.0 m`). Includes `2048×2048` HiRISE orthomosaic JPEG (`833,772 B`), 3 in-area POIs (`poi-p3`, `poi-p4`, `poi-p5`), and SHA-256 hashes in `manifest.json`.
  - **Pipeline & Validation (`scripts/data/`):** `acquire.py` (uses `/vsicurl/` HTTP range windows for HiRISE & HRSC-MOLA plus full CTX download), `process.py`, `src/terrain.py` (`horn_slope_deg`, `plane_residual_rms`), `export_bundle.py`, `make_validation.py` (verifies 7 test points vs remote TIFF + phase-correlates orthos + CTX-vs-HiRISE offset), `tests/test_terrain.py` (5 pytest cases), `raw/CHECKSUMS.sha256` (23 files), and `raw/acquisition_log.json`.
  - **`public/bundles/index.json`:** Updated `"release"` to `"jezero-west-hirise-v0.1.0"` while keeping `"dev": "synthetic-v0"`.
- **Undocumented Extra Features Built**:
  - **Coarse Fallback Bundle (`public/bundles/jezero-west-ctx20m-v0.1.0/`):** `51 × 51` native USGS CTX 20 m DTM (`JEZ_ctx_B_soc_008`, `doi:10.5066/P906QQT8`) snapped outward to whole cells (`18.97134062042192 m E × 20.0 m N`, `967.54 m × 1020.0 m`, `~68.4 KB` raw), complete with 3-cell halo-buffered Horn slope (`0.15°–27.57°`), 3×3 roughness (`0.02–2.01 m`), and `texture-ctx.jpg` (`20,786 B`).
  - **250 m Halo-Buffered Derivative Crop:** `process.py` fetches a `1500 × 1500` (`+250 m`) window around the `1000 × 1000` core before computing Horn slope (`0.00°–71.08°`) and 5×5 plane-fit RMS roughness (`0.00–0.81 m`), preventing border `NaN`s.
  - **Cached PDS4 MEDA `CAL_ATS` Temperature Dataset (`scripts/data/poi_sources/meda/`):** `meda_summary.py`, `meda_ats_summary.json`, and `meda_ats_summary_pano_sols.json` bound to `M20_waypoints.json` (sol 2022) and ASU Mastcam-Z 360° panorama metadata for 9 POIs (`P1`–`P8` + `P9_optional`) in `scripts/data/pois.json`.
  - **Comprehensive Bilingual UI & Jury Evidence Kit (`scripts/data/texts/`):**
    - `ui_captions.json` (377 lines) & `ui_captions.md`: EN/IT names, units, legends for all 6 layers, NASA/USGS/JPL/ASU/MSSS credits, 6 concise limitations, coarse-mode disclaimer, P3–P5 scientific cards (`observation`, `interpretation`, `proposed`, `terrain_here`, `air_temperature`, Mastcam-Z `panoramas`, `briefing`), and 6 out-of-area `context_sites` (`P1`, `P2`, `P6`–`P9_optional`).
    - `data_chain_jury.md` (6-step IT/EN provenance chain + 13 jury Q&As), `limitations.md` (12 verified limitations + app impacts), `quality_interpretation.md` (flagged roughness normalization issue), and `POI_RIASSUNTO.md`.
- **Integration Gaps**:
  1. `ui_captions.json`, `pois.json`, `context_sites`, and MEDA temperatures are never imported by `src/`.
  2. Uniform `quality = 3` (`unknown`) across all `1,000,000` HiRISE and `2,601` CTX cells with `strictQualitySupported: false` leaves quality-aware discrimination inactive on real Mars data.
  3. `public/bundles/` ships only a grayscale orbital texture per bundle (no local panorama photos or mineral/thermal overlays; external JPL Navcam autopano URLs noted as returning HTTP 403 in `pois.json`).
  4. `scripts/data/quality_interpretation.md` flags that `roughnessNorm_m = 1` m is mismatched against HiRISE 5×5 roughness (`median 0.019 m`, `p99 0.117 m`, `max 0.81 m`).
  5. Host checkout omits `.venv/`, `raw/*.tif`, and `package/`, and lacks `pytest`/`scipy` on the host Python interpreter.

---

### 2.2 Gabriele (`Gabryg07`, Role B — 3D / WebXR Marswalk)

- **Original Goal** ([OWNERS.md](../OWNERS.md), [algorithm/docs/project-plan.md](../algorithm/docs/project-plan.md), [INTERFACE.md](../INTERFACE.md)): Implement `src/terrain3d/TerrainView.tsx` consuming `TerrainViewProps` (`bundle`, `candidates`, `selectedCandidateId`, `highlightPathIndex`, `verticalExaggeration`, `camera`, `onSelectCandidate`, `onError`), lazy-loaded inside `TerrainSlot.tsx` so `three` does not bloat initial JS.
- **What Was Actually Built**: Gabriele built a complete, standalone WebXR + Desktop planetary EVA simulator under `marswalk/` (`marswalk/app/`, `marswalk/pipeline/`, `marswalk/test/`), vendored into the repo in commit `448c806` alongside `public/sites/jezero-delta/`. Currently `src/terrain3d/TerrainView.tsx` remains Role C's 41-line stub and `marswalk/app/` runs independently of React.
- **Undocumented Extra Features Built (Entire `marswalk/` Subsystem)**:
  - **GPU Geometry Clipmap & VRAM Tile Streaming (`marswalk/app/src/terrain.js`, `main.js`):**
    - 3 nested DEM rings in `site.json`: `inner` (`±800 m`, `1 m/px`, `1601×1601`, 16 `4×4` 25 cm HiRISE tiles, max slope `71.65°`), `mid` (`±3,600 m`, `8 m/px`, `901×901`, `4096×4096` HiRISE, max `56.61°`), and `outer` (`±14,400 m`, `40 m/px`, `721×721`, `4096×4096` CTX 6 m, max `35.37°`).
    - 9 nested clipmap levels (`N = 64` cells/quadrant default, URL `?n=&levels=`), `uHole` inner cutout, view-cone quadrant culling (`cosHalf = 0.2` VR / `0.35` desktop), vertex `texelFetch` displacement from 1-texel-padded `Float32` `DataTexture`s relative to `uHRef = h0`, fragment `textureGrad` selection + procedural 2-octave `4–40 m` micro-grain + `26,000 m` exponential fog.
    - Single-channel `THREE.RedFormat` / `UnsignedByteType` render-target textures streamed directly via `gl.texSubImage2D` (`grayMosaic`), cutting VRAM 4× vs RGBA for Quest 2 headsets.
    - CPU `Heightfield` class providing bilinear `height(x, z)` and central-difference `slopeDeg(x, z, e)` for locomotion, teleport ray-marching, and metabolic calculations.
  - **5 Switchable NASA Layers + Pre-Baked Distance Fields (`main.js`, `terrain.js`, `site.json`):**
    - Keys `L` / `1`–`5` or Quest right `A`: (1) `Immagine satellitare` (25 cm HiRISE / 6 m CTX + Martian ochre `mars(g)` tone curve), (2) `Pendenze e ostacoli` (`<10°` green `#1abf59`, `10–20°` yellow `#fad926`, `20–30°` orange `#ff800d`, `>30°` red `#f2141a`), (3) `Topografia` (Turbo ramp + `fwidth`-antialiased `5 m` contour lines fading `300–900 m`), (4) `Geologia: minerali` (MRO CRISM `FRT00005C5E`, `18 m/px`, `minerals.png`, `half = 3600 m`, RGB = olivine/Fe-Mg clays/carbonates, co-registered to CTX via `shiftM: [-180, 204]` m = `~272 m` lift improving correlation from `0.01` to `0.62`), (5) `Temperatura: infrarosso` (Mars Odyssey THEMIS night IR `100 m/px`, `thermal.png`, `half = 14400 m`).
    - `inner_nav.png` encodes distance fields (0–25.5 m, 0.1 m/DN): red channel = planned route (`uRouteOn`), green channel = Perseverance rover traverse (`uTrackOn`, toggled via `T` / right `B`).
  - **Desktop & Meta Quest 2 WebXR Locomotion (`player.js`, `main.js`):**
    - Desktop: Pointer Lock mouse look, `WASD`/Arrows (`1.3 m/s`, `Shift` `14 m/s`), `M` 600 m Overview Lift, `L`/`1`–`5` layers, `T` rover track, `I` forearm panel, `H` HUD, `C` Credits, `V` visor, `R` reset, plus deep-link query params (`?site=&x=&z=&yaw=&pitch=&layer=&track=&n=&levels=`).
    - WebXR (`local-floor`, `foveation = 1`): left stick smooth walk + grip boost; right stick `±30°` (`π/6`) snap turn; right stick forward ballistic teleport under `MARS_G = 3.71 m/s²` (48 segments, 8-step binary intersection); controller rays; button bindings for overview/display/layer/track/credits/reset.
  - **Physical EVA Survival Simulation (`mission.js`, `site.json`):**
    - Tobler rescaled speed (`flatSpeed = 0.7 m/s`, `toblerK = 3.5`, `toblerOffset = 0.05`) integrated over 2 m terrain sub-steps.
    - Metabolic O2 budget: `150 W` basal + `200 J/m` flat + `260 kg * 3.71 * v * max(sinUp, 0) / 0.25`, `0.6 kg` O2 (`20.1 kJ/L`, `1.429 g/L`, `20%` reserve).
    - Curiosity RAD reference dose (`0.64 mSv/day`, `SOL_S = 88,775 s`), LMST clock starting `10:00` vs MEDA sol 1133 sunset (`17:13:51`), return warnings (`OSSIGENO: RIENTRA ALLA BASE` / `TRAMONTO VICINO: RIENTRA ALLA BASE`).
  - **Diegetic XR/Desktop UI (`helmet.js`, `hud.js`, `arm.js`, `info.js`, `pois.js`, `sky.js`):**
    - Annular WebXR helmet visor (`renderOrder = 300`) with zero center overdraw and 5 additive dynamic sun glints (`renderOrder = 301`).
    - 5 Hz camera-locked helmet HUD (`1.0×0.3 m`) with LMST/O2/RAD/next-stop compass/slope hazard strip.
    - Right forearm collapsible `DISPLAY` -> `0.39×0.26 m` dashboard with `560×560` sepia orbital minimap, `200 m` scale bar, live heading arrow, lat/lon, MEDA weather, layer swatches, and stop checklist.
    - Left wrist legend (`0.26×0.17 m`, mirrored in DOM `#legend`), `2.6×2.3 m` Credits popup (citing `132` waypoint georef check: `-0.0068 ± 0.067 m`), `2.2×1.45 m` auto-opening Debrief popup on return to Base, custom butterscotch `ShaderMaterial` sky, and 6 POI `90 m` light beacons with auto-opening (`<11 m`) rover-photo info cards.
  - **Offline Data Pipeline & Headless WebXR Tests (`marswalk/pipeline/`, `marswalk/test/`):**
    - Python scripts (`fetch.py`, `fetch_crism.py`, `fetch_photos.py`, `photo_sheet.py`, `fetch_all.sh`, `build_site.py`) computing a 2 m `skimage.graph.route_through_array` route and `inner_nav.png`.
    - Playwright scripts (`probe.js`, `shot.js`, `xr.js`) driving emulated Quest 2 via `iwer` (`IWER.metaQuest2`).
- **Integration Gaps**:
  1. **Not wrapped in `TerrainView.tsx`:** Boots imperatively onto `document.body` (`window.app`), ignores `TerrainViewProps` (`bundle`, `candidates`, `selectedCandidateId`, `highlightPathIndex`, `verticalExaggeration`, `onSelectCandidate`, `onError`), lacks arbitrary-bundle fallback (`synthetic-v0`, `ctx20m`), and has no React unmount `dispose()` cleanup.
  2. **Pre-baked Route Only:** Draws the EVA path solely from static red distance-field `inner_nav.png` — cannot render dynamic A* `RouteCandidate` blue paths, dotted rejected candidates with explanations, or `highlightPathIndex` hover sync.
  3. **Italian-Only Copy:** HTML (`lang="it"`), HUD, hazard levels (`AGEVOLE/IMPEGNATIVA/CRITICA/VIETATA`), forearm, credits, debrief, POIs, and `site.json` descriptions are hardcoded in Italian.
  4. **Missing Off-Path Warning & Respawn:** `mission.js` tracks sequential `< 9 m` POI arrival and O2/sunset only — no perpendicular distance-to-route check, no center-screen `X` off-path warning, and no localized `Respawn` to route (only `R`/`Y` reset to Base).
  5. **Error & Logging Contract Mismatch:** `main.js:124` calls `console.error(e)` instead of calling `onError({ kind, message })` or handling `webglcontextlost`; missing `data-testid="terrain-view"`, `data-selected-candidate`, `data-hover-index`.

---

### 2.3 Hritvik Arora (Role C — Root Integration Platform, Contracts, State, Worker, Sim, Audit & E2E)

- **Original Goal** ([OWNERS.md](../OWNERS.md), [INTERFACE.md](../INTERFACE.md)): Provide the typed, browser-safe, zero-leak integration spine uniting Role A bundles, Ayush's worker-based routing engine, Role B's lazy 3D viewer, and Dhani's React UI, enforced via deterministic invariants, oracle fuzzing, build gzip/content budgets, and Playwright E2E checks.
- **What Was Actually Built**:
  - **Frozen v1 Contracts (`src/contracts/`):** `geometry.ts` (`LocalPoint { east_m, north_m }`, `LocalPoint3`, `CellRef`, `Extent`), `grid.ts` (`cellIndex`, `cellRef`, `cellCenter`, `pointToCell`, `toSceneXYZ`), `manifest.ts` (`mars-pathfinder/region-bundle` `v1.0`, `QUALITY` `0..3`, `EXCLUSION` `0..4`), `bundle.ts` (`GridBundle`, `GridBundleTransfer`), `route.ts` (`ROUTE_POLICIES`, `RouteRequest`, `RouteCandidate`, `RouteResponse`, `isFinal`), `worker-protocol.ts` (`MainToWorker`, `WorkerToMain`), `release.ts` (`formatReleaseId`).
  - **Validation, State & Worker Plumbing:**
    - [src/data/loadBundle.ts](../src/data/loadBundle.ts): `loadAndValidateBundle` checking HTTP status, JSON schema/major version, dimensions/byte lengths, and SubtleCrypto SHA-256 (`BundleLoadError` stages).
    - [src/app/bundleSelection.ts](../src/app/bundleSelection.ts) & `useRegionLoader.ts`: Precedence `VITE_BUNDLE_MANIFEST` > `VITE_BUNDLE` > `public/bundles/index.json` (`release` vs `dev`).
    - [src/app/TerrainSlot.tsx](../src/app/TerrainSlot.tsx), `webgl.ts`, `terrainLoader.ts`, `ErrorBoundary.tsx`: Probes/releases WebGL, lazy-loads `TerrainView.tsx` outside initial JS chunk, catches errors into `[data-testid="terrain-fallback"]` with `data-kind` and `Retry 3D`.
    - [src/state/store.ts](../src/state/store.ts) & `useRouteRunner.ts`: Pure reducer with `INVALIDATING_ACTIONS`, `selectSelection`, `selectCanRequestRoute`, and two-layer stale guard (`RouteWorkerClient` + reducer checking `requestId` & `bundleVersion`).
    - [src/worker/client.ts](../src/worker/client.ts), `handler.ts`, `routing.worker.ts`: Copies typed arrays via `.slice()` (`bundleToTransfer`), enforces `timeoutMs` (`20000 ms` default), terminates & restarts worker on cancel/timeout/supersede, and catches `onerror` -> `data-error`.
    - [src/export/serialize.ts](../src/export/serialize.ts): Deterministic `mars-pathfinder/route-export@1` formatter (`stableStringify`, sorted keys, `NaN`/`Infinity` -> `null`, `\n` line endings, `requestId`/timestamps omitted, `assertNoLocalPaths`).
- **Undocumented / Extra Infrastructure Built**:
  - **Pluggable Verification & Simulation Harness (`src/sim/`, `tests/sim/`, `scripts/sim/run-sim.ts`):** Deterministic `mulberry32` + `fbm` terrain synthesizer (`SIM_MARKER = 'mars-pathfinder/sim@1'`), 15 deterministic scenarios (`38` CLI cases incl. `large-512`), 3 seeded fuzz families (`flat-obstacles`, `flat-quality`, `noisy`, preserving regression seed `20261608`), Dijkstra `referenceShortest` oracle (`src/sim/oracle.ts`), solver-independent `checkLeg`/`checkResponse` (`src/sim/invariants.ts`), and `SIM_ENGINE` swap support (`docs/SIMULATION-FOR-AYUSH.md`).
  - **Optional Imagery & Asset Probes (`src/app/tiles.ts`, `optionalAssets.ts`):** Timeout-bounded (`4000 ms` Trek WMTS when `VITE_TILES=trek`; `8000 ms` `displayAssets` verification) non-blocking status components (`imagery-status`, `optional-assets-status`).
  - **Strict Audit & Release Gate (`scripts/audit.mjs`):** Level-9 gzip budget checks (`entryJsGz: 150 KB`, `totalJsGz: 450 KB`, `workerJsGz: 50 KB`, `cssGz: 30 KB`, `bundleDirGz: 15 MB`, `totalDistRaw: 60 MB`), 13 forbidden-pattern scans (`console.log/debug/info/trace`, `debugger`, local paths, tokens/keys, `mars-pathfinder/sim@1`, source maps, `.env`), and `--release` synthetic rejection.
  - **17 Root Vitest Suites + 3 Playwright E2E Projects (`playwright.config.ts`, `e2e/`):** Configured across `:4280` (`release`), `:4281` (`variant`), and `:4282` (`synthetic`) under `/marspineapple/` with `consoleGuard`.
  - **Placeholder UI & Engine Stand-ins:** Authored all 4 commits in `src/ui/*` plus `src/routing/placeholderEngine.ts` (`placeholder-astar-0.2.0`) so CI, unit tests, and E2E pass prior to teammate integration.
- **Integration Gaps**:
  1. `src/routing/index.ts` still re-exports `placeholderEngine.ts` (`placeholder-astar-0.2.0`), not Ayush's engine.
  2. `src/contracts/route.ts` `RouteProgress` (`{ phase, exploredNodes }`) and `RouteResponse` lack wavefront trace frames, runtime Dijkstra comparison stats, and rejected-branch explanations required by Step 4 UX.
  3. 4 golden assertions in `tests/sim/pipeline.sim.test.ts` fail on Windows because `git` checks out `tests/sim/golden/*.json` (and `e2e/golden/*.json`) with CRLF while `serializeRouteExport` emits LF (`\n`).
  4. Root E2E fixtures (`e2e/fixtures.ts`, `tests/appHelpers.tsx`) assume immediate mount of planner controls (`start-preset`, `destination-preset`, `calculate`, `map-canvas`) and zero external HTTP requests / `console.error`s (`consoleGuard`).
  5. Total `dist/` raw size grew from `~14.5 MB` to `37.91 MB` after `448c806` vendored `public/sites/jezero-delta/`, leaving `22.09 MB` raw headroom under the `60.00 MB` budget.

---

### 2.4 Ayush (Routing Algorithm Deliverable — `algorithm/`)

- **Original Goal** ([algorithm/docs/team-tasks.md](../algorithm/docs/team-tasks.md), [project-plan.md](../algorithm/docs/project-plan.md), [INTERFACE.md](../INTERFACE.md), [SIMULATION-FOR-AYUSH.md](SIMULATION-FOR-AYUSH.md)): Deliver a deterministic TypeScript Web-Worker 8-neighbor A* solver supporting rectangular grids (`dx !== dy`), Horn slope & plane-fit roughness, strict admissibility & diagonal no-corner-cutting, 3 policies, path deduplication, round-trip return legs, truthful quality/uniformity handling, factual templates, Dijkstra parity verification, and root `solveRoute` integration.
- **What Was Actually Built**: All deliverables live in standalone sub-package `algorithm/` (`mars-pathfinder-routing@0.1.0`), cleanly modularized across `T01`–`T40`:
  - **Contracts & Grid:** `algorithm/src/contracts/routing.ts` (`QUALITY_CODE`, `SOURCE_FOM_CODE`, `RegionRoutingBundle`, `RouteRequest`, `RouteResponse`, `RouteCandidate`, etc.); `algorithm/src/coordinates/grid.ts` (`rowColToIndex`, `indexToRowCol`, `cellCenterToLocalMeters`, `localMetersToGridPoint`, `stepPlanarDistanceM`).
  - **Terrain & Admissibility:** `bundleValidator.ts`, `profiles.ts` (`educational-eva-v1`, `conservative-15deg`, `relaxed-25deg`), `qualityMapping.ts`, `elevationSupport.ts`, `hornSlope.ts`, `roughness.ts`, `cellAdmissibility.ts` (7-priority exclusion checks incl. `INTERPOLATED` before same-cell shortcut `F05B`), `endpoints.ts`, `edgeAdmissibility.ts` (symmetric & directional uphill/downhill grade + diagonal corner cut check).
  - **Search & Post-Processing:** `effectiveWeights.ts`, `edgeCost.ts`, `workspace.ts` ($O(1)$ generation-stamped `SolverWorkspace`), `binaryHeap.ts` (strict 4-tuple total order `fScore`, `gScore`, `crossScore`, `cellIndex`), `components.ts` (lazy $O(N)$ connected-component labeling + 8-bit `adjMask`), `astar.ts`, `dijkstra.ts`, `pathAudit.ts`, `metricsDistance.ts`, `metricsElevation.ts`, `metricsQuality.ts`, `draping3d.ts`, `deduplicate.ts`, `returnLeg.ts`, `explanations.ts`.
  - **Runtime & Root Adapter:** `mutex.ts`, `engine.ts` (`RoutingEngine`), `route.worker.ts`, `routeClient.ts`, `index.ts` (T40 factories), and `marspineappleAdapter.ts` (`MODEL_VERSION = 'eva-astar-1.0.0'`, `solveRoute`, quality maps `[3, 0, 2, 1]` / `[1, 3, 2, 0]`).
  - **Tests & Docs:** `algorithm/tests/fixtures/` (`F01`–`F12`), 40 Vitest files (`t01`–`t40`, `157` tests), and 11 architecture/verification docs in `algorithm/docs/`.
- **Undocumented / Extra Features Built**:
  - **Dual Interface Layers:** Built both an independent full-featured `RoutingEngine` / `RoutePlannerClient` stack AND the `marspineappleAdapter.ts` bridge to root contracts.
  - **3 Selectable Constraint Profiles:** Beyond `educational-eva-v1` (`20°/20°`, `0.5 m`), added `conservative-15deg` and `relaxed-25deg` plus directional uphill/downhill slope checks (`isProfileDirectionallySymmetric`).
  - **Connected-Component Pre-Filter & Bitmask:** `components.ts` computes connected basins + `adjMask` in $O(N)$ for $O(1)$ unreachable rejection (used by `RoutingEngine` in T40).
  - **Async Cooperative Yielding & Mutex:** `mutex.ts` (`AsyncWorkspaceMutex`, `createYieldChannel`, `createUnifiedDeadline`) prevents concurrent solver workspace corruption.
  - **3D Saddle-Quad Draped Polyline:** `draping3d.ts` (`buildDraped3DRoutePolyline`) subdivides saddle quads to eliminate mesh clipping in 3D rendering.
- **Integration Gaps**:
  1. **Isolated from Root App:** `algorithm/` is not imported by root `src/routing/index.ts`.
  2. **Duplicated Logic Inside `marspineappleAdapter.ts`:** Rather than delegating to `RoutingEngine`, `marspineappleAdapter.ts` reimplements `runAStar`/metrics/explanations — omitting `components.ts` $O(1)$ unreachable check, cooperative yields, `candidateG === gScore[v]` collinearity tie-break, `lowQualityLength_m` delta wording, `draped3DPolyline`, and profile selection (`educational-eva-v1` hardcoded), and holding an unguarded singleton `sharedWorkspace`.
  3. **Core Contract Mismatch:** `algorithm/src/contracts/routing.ts` uses `eastM`/`northM`, `0=ACCEPTABLE..3=INVALID`, `invalid_input`/`no_path`, and `LOAD_BUNDLE`/`PLAN_ROUTE` (incompatible with root `src/contracts/`).
  4. **Outer-Edge Clamping Divergence:** `algorithm/src/coordinates/grid.ts` (`localMetersToGridPoint`) clamps exact east/south borders into valid cells instead of rejecting them like `src/contracts/grid.ts` (`pointToCell`) and `marspineappleAdapter.ts`.
  5. **Quality Penalty / Diagonal Corner Semantics Mismatch vs Root:** Ranks `LOW (1.0) > UNKNOWN (0.75)` and evaluates diagonal quality across all 4 corner cells (`edgeCost.ts`, `metricsQuality.ts`, `marspineappleAdapter.ts`) vs placeholder's `UNKNOWN (1.0) > LOW (0.5)` and 2-endpoint `worseQuality`.
  6. **No Search Wavefront Trace or Runtime Dijkstra Comparison:** `solveDijkstra` is test-only; neither `RoutingEngine` nor `marspineappleAdapter.ts` streams explored/frontier cells or returns rejected branches with reasons.

---

### 2.5 Dhani Sharma (Role D — Interactive UI, `src/ui/*`)

- **Original Goal** ([algorithm/docs/team-tasks.md](../algorithm/docs/team-tasks.md#L159-L311)): Build the clean, responsive English-first interactive mission planner UI in `src/ui/` — with readable map overlays (`texture` + layers + opacity + legends), usable-region framing, clicked-vs-snapped endpoint feedback, failure-safe controls, candidate comparison cards with policy deduplication/explanations, elevation profile with quality intervals, science destination & NASA/USGS source drawers, and a complete printable mission briefing.
- **What Was Actually Built**:
  - **Authorship State:** **0 git commits** by Dhani Sharma across all local/remote branches.
  - **Existing Code (`src/ui/`):** 5 functional placeholder files authored across 4 commits by `Role C (integration)` (`App.tsx` 250 lines, `MapCanvas.tsx` 139 lines, `ElevationProfile.tsx` 69 lines, `Briefing.tsx` 48 lines, `app.css` 20 lines) providing minimal preset selects, map click picking, raster `ImageData` rendering (no zoom/pan/texture), candidate radio selection, hover range slider, `TerrainSlot` toggle, JSON export trigger, and minimal `@media print` hiding.
- **Undocumented Extra Features Built**: None (zero Dhani commits; placeholder UI built strictly to satisfy Role C's integration/E2E smoke harness).
- **Integration Gaps**:
  1. **Vs Original Task Brief (`algorithm/docs/team-tasks.md`):** Missing responsive layout, keyboard `focus-visible` hierarchy, zoom/pan + zoom-valid scale bar, orbital imagery (`texture`) underlay & layer opacity sliders, legends/units, usable-boundary mask, distinct `EXCLUSION` 1–4 rendering, `EndpointResolution.requested` vs `.accepted`, duplicate-geometry policy grouping, `ElevationProfile` `qualityIntervals` + `returnLeg` view, science context/MEDA/panoramas (`ui_captions.json`), inline limitations, print route thumbnail, and empty-state guidance.
  2. **Vs Step 4 End-to-End Interactive Loop:** Missing Start Menu, guided Point A / Point B selection flow, Animated Pathfinding Visualizer + "See its thinking" + Algorithm Comparator, Walkthrough HUD overlays (center-screen `X` off-path warning, `Respawn` button, rejected-path explanation cards), Point B Arrival Summary, and Return to Start Menu.

---

## 3. Standalone Verification Baseline (Pre-Merge)

All checks below were observed directly on branch `merge/integration` (`HEAD` `448c806`) prior to any merge edits.

### 3.1 Component Commands & Observed Results

| Component / Check | Command | Exit Code | Exact Result Summary |
| --- | --- | --- | --- |
| **Algorithm (`algorithm/`) Typecheck** | `cd algorithm; npm run typecheck` (`tsc --noEmit`) | `0` | Passed with `0` errors. |
| **Algorithm (`algorithm/`) Tests + T40 Benchmark** | `cd algorithm; npm test` (`vitest run`) | `0` | `40 passed (40)` test files, `157 passed (157)` tests in `6.62s` (`part-ayush.md` run: `6.78s`). Includes `t40` `solveRoute` adapter suite and `200×200` synthetic benchmark (`20 × 3-policy` queries, see T40 JSON metrics below). |
| **Marswalk (`marswalk/app/`) Production Build** | `cd marswalk/app; npm run build` (`vite build`) | `0` | Vite `8.3.8`, `18 modules transformed` in `385 ms` (`part-gabriele.md`; non-fatal CJS/ESM warning on `vite.config.js`). Output `marswalk/app/dist/`: `35` files totaling `25,111,633 B` (`25.11 MB` / `23.95 MiB`), including `index.html` (`1,972 B`), `assets/index-I8xrJ1Cd.js` (`581,056 B` / `151.02 kB` gz), and `33` files under `dist/sites/jezero-delta/` (`24,528,605 B`). |
| **Marswalk (`marswalk/app/` & `marswalk/test/`) Tests** | `npm test` in `marswalk/app/` & Playwright scripts in `marswalk/test/` | `N/A` (`1` stub) | `marswalk/app/package.json` `"test"` is an error stub (`exit 1`). `marswalk/test/` (`probe.js`, `shot.js`, `xr.js`) has no `package.json`/`node_modules`, requires missing `iwer` (`IWER.metaQuest2`), and expects a live dev server on `http://localhost:5173/`. |
| **Bundle Validation — HiRISE 1 m** | `npm run validate-bundle -- public/bundles/jezero-west-hirise-v0.1.0` | `0` | `VALID` (`real`): `1000×1000 @ 0.9485670310210961×1 m`; `elevation -2551.18..-2457.14 (0/1000000 non-finite)`; `slope 0.00..71.08`; `roughness 0.00..0.81`; `quality {"3":1000000}`; `exclusion {"0":1000000}`. |
| **Bundle Validation — CTX 20 m** | `npm run validate-bundle -- public/bundles/jezero-west-ctx20m-v0.1.0` | `0` | `VALID` (`real`): `51×51 @ 18.97134062042192×20 m`; `elevation -2556.17..-2459.99 (0/2601 non-finite)`; `slope 0.15..27.57`; `roughness 0.02..2.01`; `quality {"3":2601}`; `exclusion {"0":2601}`. |
| **Bundle Validation — Synthetic Fixture** | `npm run validate-bundle -- public/bundles/synthetic-v0` | `0` | `VALID` (`SYNTHETIC`): `20×12 @ 10×10 m`; `elevation -2605.50..-2545.00 (4/240 non-finite)`; `slope 2.86..70.76 (10/240)`; `roughness 0.00..18.86 (12/240)`; `quality {"0":4,"1":204,"2":8,"3":24}`; `exclusion {"0":227,"1":4,"2":8,"4":1}`. |
| **Root Typecheck** | `npm run typecheck` (`tsc -b --noEmit`) | `0` | Passed with `0` errors (`strict`, `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`). |
| **Root Lint** | `npm run lint` (`eslint .`) | `0` | Passed with `0` errors / `0` warnings (`no-explicit-any` error, `react-hooks`, `react-refresh`). |
| **Root Sim CLI** | `npm run sim` (`tsx scripts/sim/run-sim.ts`) | `0` | `Engine: src/routing (placeholder-astar-0.2.0)`; `38 cases, 0 invariant violation(s).` (`large-512` `512×512` 3-policy corner-to-corner solved in `347.7 ms`; `part-hritvik.md` run: `233.3 ms`). |
| **Root Production Build** | `npm run build` (`tsc -b && vite build`) | `0` | Built `dist/` cleanly (`49 modules` in `283 ms` per `part-hritvik.md`): `index-rl14xfx2.js` (`262,482 B`), `routing.worker-BZeNQwEi.js` (`9,946 B`), `index-BVtLs3r-.css` (`1,148 B`), `TerrainView-Bpcs11IN.js` (`611 B`). |
| **Root Audit & Release Audit** | `npm run audit` and `npm run audit:release` (`node scripts/audit.mjs [--release]`) | `0` | Both exited `0` (`AUDIT PASS`). Scanned `15` text files for `13` patterns; verified release bundle `"jezero-west-hirise-v0.1.0"` (`synthetic=false`). |
| **Root Unit & Sim Test Suite** | `npm test` (`vitest run`) | **`1`** | **`16 passed \| 1 failed (17)` files; `152 passed \| 4 failed (156)` tests** (`Duration 9.01s`). Only failures: `tests/sim/pipeline.sim.test.ts` → `golden exports` (`4` tests). HiRISE real-data routing (`tests/realdata.test.ts`): `P3↔P4 3565 ms`, `P4↔P5 1640 ms`, `P3↔P5 969 ms`; `engine.sim.test.ts` `large-512`: `450 ms`. |
| **UI Smoke Subset** | `npx vitest run tests/app.smoke.test.tsx tests/selectionSync.test.tsx` | `0` | `2 passed (2)` files, `8 passed (8)` tests (`part-dhani.md`; also passed inside full `npm test` run). |
| **Python GIS Tests (`scripts/data/`)** | `python -m pytest -q tests` inside `scripts/data` | **`1`** | Host Python `3.12.10` (`numpy 2.5.1` only): `No module named pytest`; importing `src/terrain.py` hits `ModuleNotFoundError: No module named 'scipy'`. Gitignored `.venv/`, `raw/*.tif`, `package/` are absent, so `package/v0.1.0/validate.py` could not run on host. |

### 3.2 Exact Algorithm T40 Benchmark & Audit Budget Measurements

**Algorithm T40 `200×200` (40,000-cell) Synthetic Benchmark (`merge/integration` run, Node `v24.16.0`, `win32/x64`):**
- `gridCells`: `40000`, `componentCount`: `2`
- `bundleLoadMs`: `2.014`, `componentInitMs`: `276.613`, `coldFirstQueryMs`: `299.357`
- `medianSolveMs`: `34.676`, `p95SolveMs`: `291.841`, `worstSolveMs`: `373.849`, `threeWaySplitObserved`: `5`
- `categoryMediansMs`: `short: 9.327`, `diagonal: 209.764`, `three_way_split: 50.147`, `unreachable_basin: 6.645` *(in `part-ayush.md`'s earlier run: `median 34.24`, `p95 258.062`, `worst 336.04`)*.

**Root `npm run audit` Level-9 Gzip & Size Headroom (`HEAD` `448c806`):**

| Metric | Measured Raw | Measured Gzip | `scripts/audit.mjs` Budget | Remaining Headroom |
| --- | --- | --- | --- | --- |
| `entryJsGz` (initial JS) | `256.3 KB` | `79.7 KB` gz | `150.0 KB` gz | **`70.3 KB` gz** |
| `totalJsGz` (all JS + worker + lazy) | `266.6 KB` | `84.1 KB` gz | `450.0 KB` gz | **`365.9 KB` gz** |
| `workerJsGz` (`routing.worker`) | `9.7 KB` | `4.0 KB` gz | `50.0 KB` gz | **`46.0 KB` gz** |
| `cssGz` | `1.1 KB` | `0.5 KB` gz | `30.0 KB` gz | **`29.5 KB` gz** |
| `jezero-west-hirise-v0.1.0` | `14.16 MB` | `10.30 MB` gz | `15.00 MB` gz | **`4.70 MB` gz** |
| `jezero-west-ctx20m-v0.1.0` | `68.4 KB` | `51.0 KB` gz | `15.00 MB` gz | **`14.95 MB` gz** |
| `synthetic-v0` | `30.1 KB` | `5.1 KB` gz | `15.00 MB` gz | **`14.99 MB` gz** |
| `totalDistRaw` (entire `dist/`) | **`37.91 MB` raw** | `—` | **`60.00 MB` raw** | **`22.09 MB` raw** |

### 3.3 Root Cause of the 4 `tests/sim/pipeline.sim.test.ts` Failures on Windows

Inspected via `git ls-files --eol tests/sim/golden e2e/golden`:
- All 5 golden JSON files (`e2e/golden/export-outpost-eastbench-c2.json`, `tests/sim/golden/degenerate-endpoints__start-equals-goal.json`, `quality-patchwork__across-band.json`, `ridge-gap__straight-across.json`, `strip-column__end-to-end.json`) are stored with **LF** in the git index (`i/lf`), but Windows git `autocrlf` checked them out with **CRLF** in the working tree (`w/crlf`).
- [src/export/serialize.ts](../src/export/serialize.ts) emits `\n` (LF), while [tests/sim/pipeline.sim.test.ts](../tests/sim/pipeline.sim.test.ts) asserts strict equality against `readFileSync(file, 'utf8')`, failing purely on `'\n'` vs `'\r\n'` (`e2e/` golden comparisons face the same Windows CRLF hazard unless normalized).

---

## 4. Conflicts, Overlaps & Data Mismatches

### 4.1 Coordinate Frames & Outer-Edge Clamping

1. **Horizontal & Vertical Transform (`marswalk` Orthographic vs `jezero-west-hirise-v0.1.0` Equirectangular):**
   - **Role A HiRISE Bundle:** USGS Equirectangular (`lat_ts=0`, `cos(18.456°) = 0.9485670310210961`), SW corner `(x = 4587569.0, y = 1093474.0)`, local meter extent `[0, 948.567] × [0, 1000.0]` m, north-up cell centers.
   - **Role B `marswalk` (`public/sites/jezero-delta/site.json`):** Local orthographic centered at `(lon0 = 77.4055° E, lat0 = 18.4555° N, R = 3396190 m)`, Three.js axes `X = x_vr` (East), `Y = elevation_m - h0` (vertical relative to `inner` center reference `h0`), `Z = -y_vr` (South; North is `-Z`).
   - **Empirically Verified Alignment (across JPL Sols 502, 565, 686):**
     - `east_m = x_vr + 586.81` &nbsp;/&nbsp; `x_vr = east_m - 586.81`
     - `north_m = y_vr + 470.15` &nbsp;/&nbsp; `y_vr = north_m - 470.15`
     - Analytical origin conversion gives `(586.78, 470.18)` (~1–3 cm orthographic-vs-equirectangular projection drift over 1 km).
     - `Y = elevation_m - h0` and `Z = -(north_m - 470.15)` align directly with root [src/contracts/grid.ts](../src/contracts/grid.ts) `toSceneXYZ` (`[east_m, elevation_m, -north_m]`) modulo the constant horizontal/vertical origin shift.
     - The entire HiRISE bundle maps to `x_vr ∈ [-586.81, +361.76]`, `y_vr ∈ [-470.15, +529.85]`, fitting strictly inside `marswalk`'s `inner` `±800 m` 1 m ring.
2. **Grid Outer-Edge Boundary Clamping Conflict:**
   - [src/contracts/grid.ts](../src/contracts/grid.ts) (`pointToCell`), [INTERFACE.md](../INTERFACE.md) §1, and [algorithm/src/routing/marspineappleAdapter.ts](../algorithm/src/routing/marspineappleAdapter.ts) (`pointToMarsCell`) reject points on the exact east (`E = west_m + width*dx`) and south (`N = north_m - height*dy`) outer edges as `null` / invalid, and support non-zero `extent.west_m`/`north_m`.
   - [algorithm/src/coordinates/grid.ts](../algorithm/src/coordinates/grid.ts) (`localMetersToGridPoint`) assumes `[0, width*dx] × [0, height*dy]` and **clamps** exact east (`E = maxEastM`) and south (`N = 0`) edges into `width - 1` and `height - 1`.

### 4.2 Routing Engine Disconnection & Behavioral Divergences

| Dimension | Root `placeholderEngine.ts` + `src/sim/` | Ayush `algorithm/` (`RoutingEngine` & `marspineappleAdapter.ts`) | Merge Impact / Conflict |
| --- | --- | --- | --- |
| **Wiring Status** | Active in [src/routing/index.ts](../src/routing/index.ts) (`'placeholder-astar-0.2.0'`) | Disconnected (`'eva-astar-1.0.0'` only in `algorithm/`) | Root app, worker, `sim`, `e2e` still run placeholder math. |
| **Max Terrain Slope** | `25°` | `20.0°` (`educational-eva-v1`) | HiRISE `20°–25°` slopes will be pruned once switched; routes & lengths change. |
| **Roughness Norm** | `roughnessNorm_m = 1` m | `roughnessScaleM = 0.5` m | HiRISE 5×5 roughness (`p99 = 0.117 m`, median `0.019 m`) still under-weights roughness unless calibrated (0.5 m gives ~2× vs placeholder, still small on most cells). |
| **Policy Weights** | `(0/0/0, 1/1/0, 0.5/0.5/2)` | `NOMINAL_POLICY_WEIGHTS` `(0/0/0, 2/1/0, 2/1/2)` | Candidate paths & `weightedCost` differ across terrain & uncertainty policies. |
| **Quality Penalty Ranking** | `LOW = 0.5`, `UNKNOWN = 1.0` (`UNKNOWN` penalized MORE than `LOW`) | `UNKNOWN = 0.75`, `LOW = 1.0` (`LOW` penalized MORE than `UNKNOWN`) | **High-risk invariant conflict:** [tests/sim/expectations.ts](../tests/sim/expectations.ts) `uncertaintyNoWorse` asserts `ua.unknownQualityLength_m <= sf.unknownQualityLength_m + 1e-6`. Penalizing `LOW` (1.0) above `UNKNOWN` (0.75) lets `uncertainty-aware` prefer `UNKNOWN` over `LOW`, risking `uncertaintyNoWorse` failures on mixed-quality fuzz terrains. |
| **Diagonal Quality Rule** | 2-endpoint `worseQuality(u, v)` (`GOOD < LOW < UNKNOWN < NO_ELEVATION`) in both cost & `qualityIntervals` | 4-corner `getCornerAwareStepQuality(u, v, w1, w2)` (max penalty across all 4 cells) | `src/sim/invariants.ts` checks internal `qualityIntervals` consistency on `outbound`, while `uncertaintyNoWorse` + `flat-quality` fuzzing check `unknownQualityLength_m`; corner-aware A* vs 2-endpoint metric accounting (or vice versa) must match across both cost and metrics. |
| **Adapter vs Core Divergence** | N/A | `marspineappleAdapter.ts` duplicates logic instead of calling `RoutingEngine` (`engine.ts`) | Adapter misses $O(1)$ `components.ts` basin check, cooperative yields, `candidateG === gScore[v]` tie-break, `lowQualityLength_m` wording, and uses unguarded `sharedWorkspace`. |
| **Golden & E2E Locks** | Pins `'placeholder-astar-0.2.0'`, golden exports, `e2e/journey.spec.ts`, `e2e/release.spec.ts` | `MODEL_VERSION = 'eva-astar-1.0.0'` | Switching `src/routing/index.ts` invalidates the 4 `tests/sim/golden/*.json`, `e2e/golden/export-outpost-eastbench-c2.json`, `docs/examples/*.json`, and any hardcoded model/metric E2E assertions. |

### 4.3 Data Quality Uniformity & Strict Mode

- Both `jezero-west-hirise-v0.1.0` (`1,000,000` cells) and `jezero-west-ctx20m-v0.1.0` (`2,601` cells) carry uniform `quality = 3` (`unknown`), `exclusion = 0` (`none`), and `strictQualitySupported: false` because USGS DTMs provide global accuracy stats rather than per-pixel confidence maps.
- Consequently, on real Mars bundles: (a) **Strict quality** must remain disabled with clear user explanation, (b) `uncertainty-aware` reduces to `terrain-aware` (`gamma_eff = 0` under Ayush's uniform-quality override, avoiding fake quality differentiation), and (c) candidate deduplication collapses them into a single candidate group whose label/UI must explicitly communicate why quality policies collapsed.

### 4.4 POI, Asset & Text/Language Mismatches

1. **Three Divergent POI Sets:**
   - `public/bundles/jezero-west-hirise-v0.1.0/manifest.json`: **3** selectable POIs (`poi-p3` Skinner Ridge / Wildcat Ridge, `poi-p4` Enchanted Lake / Amalik / Hidden Harbor, `poi-p5` Three Forks Sample Depot).
   - `scripts/data/pois.json` & `ui_captions.json`: **9** POIs — those same 3 in-area stops (`P3`–`P5`) plus **6** out-of-area `context_sites` (`P1`, `P2`, `P6`–`P9_optional`).
   - `public/sites/jezero-delta/site.json`: **6** POIs all inside the HiRISE extent: `base` (synthetic), `threeforks`, `nukshak`, `yori`, `wildcat`, `rockytop`.
   - **Specific Coordinate/Metadata Conflict:** `site.json` `threeforks` uses JPL sol 663 (`(144.97, -162.07)` → HiRISE `(731.75, 308.11)`), which is **~41.5 m** from Role A's `poi-p5` sol 686/690 Depot #2 (`(752.498, 344.0)`). Meanwhile `nukshak` (`~0.05 m`) and `wildcat` (`~0.03 m`) align cleanly, and `base`/`yori`/`rockytop` are absent from `pois.json` and `manifest.json`.
2. **Visual & Overlay Asset Mismatch:** `public/sites/jezero-delta/` already provides local rover `photos/*.jpg`, `minerals.png` (CRISM), `thermal.png` (THEMIS), and `inner`/`mid`/`outer` elevation/ortho/slope pyramids (`24.53 MB` raw), whereas `public/bundles/` provides single-resolution `.f32`/`.u8` rasters + 1 grayscale texture and links externally to ASU panoramas (which fail offline/`e2e/release.spec.ts` zero-external-request rules and some JPL 403s).
3. **Three-Way Language Split:**
   - `scripts/data/texts/ui_captions.json` is bilingual **EN/IT** and **completely unimported** by `src/`.
   - `marswalk/` UI, telemetry labels, hazard classes, HUD, credits, debrief, POI cards, and `site.json` copy are **hardcoded Italian**.
   - Root `src/`, `manifest.json`, and tests are **English** (plus `e2e/` asserts English labels such as `'start preset'`, `'destination preset'`, `'Strict quality'`, `'Round trip'`, `'Retry 3D'`, `'Export JSON'`).

### 4.5 Missing End-to-End UX Loop & Platform/Budget Constraints

Comparing the current codebase against the required full interactive loop exposes 5 cross-cutting feature & contract gaps:

1. **Start Menu & Loop State:** `src/state/store.ts` has no loop phase state (`start-menu | select | visualizer | walkthrough | arrival`), and `App.tsx` opens directly into the single-screen planner (and existing `tests/` + `e2e/` require planner `data-testid`s to be immediately reachable unless Start Menu supports a dismissible/non-blocking flow or coordinated test update).
2. **Guided Point A & B Selection:** Presets + map clicks exist minimally, but lack guided step-by-step A→B flow, science cards from `ui_captions.json`, `requested` vs `accepted` snapped-cell display, clickable/visible context sites, and usable-region/exclusion error explanations.
3. **Animated Pathfinding Visualizer + "See its thinking" + Algorithm Comparator:** `RouteProgress` (`src/contracts/route.ts`) only reports `{ phase, exploredNodes }`; neither `placeholderEngine.ts` nor `algorithm/` records open/closed frontier playback snapshots (`explored/frontier` cells over steps) or runs A* vs Dijkstra side-by-side at runtime with explored-node / runtime / optimality comparisons.
4. **3D Walkthrough Enhancements (`marswalk` inside `TerrainView`):** Requires dynamic `RouteCandidate` rendering (solid blue selected path + dotted rejected/alternative candidate branches with clickable/hoverable rejection explanations), player pose tracking perpendicular distance to the active polyline, center-screen **`X`** cross off-path warning when straying beyond tolerance, localized **Respawn** back to nearest/last valid point on the planned route, full English translation, and clean unmount/WebGL disposal.
5. **Point B Arrival Summary & Return to Start Menu:** No arrival trigger in 3D or summary screen combining real EVA traversal metrics, science destination interpretation/MEDA/local photos, export/print briefing, and clean Reset / Return to Start Menu.

**Platform Guardrails to Preserve During Integration:**
- **Bundle Size (`scripts/audit.mjs`):** `entryJsGz ≤ 150 KB` (`70.3 KB` headroom — `three` MUST stay inside lazy `TerrainView` chunk!), `totalJsGz ≤ 450 KB` (`365.9 KB` headroom — shared between Ayush solver + Role B 3D + UI), `workerJsGz ≤ 50 KB` (`46.0 KB` headroom), `totalDistRaw ≤ 60.00 MB` (`22.09 MB` headroom — **do NOT duplicate `24.53 MB` `sites/jezero-delta` twice inside `public/`!**).
- **Content & Offline Guards (`scripts/audit.mjs` + `e2e/fixtures.ts` + `e2e/release.spec.ts`):** Zero `console.log/debug/info/trace` in `dist/` (porting `marswalk/app/src/main.js` must convert `console.error` to `onError(...)` so Playwright `consoleGuard` stays green), zero external network calls in release offline runs, and strict TypeScript/ESLint compliance (`no-explicit-any`, `noUnusedLocals`, `noUncheckedIndexedAccess`).

---

## 5. Recommended Integration & Improvement Architecture

### Phase A — Contract, Coordinate & Line-Ending Alignment
1. **Normalize Golden Line Endings First:** Fix CRLF/LF comparison in [tests/sim/pipeline.sim.test.ts](../tests/sim/pipeline.sim.test.ts) (normalize `.replace(/\r\n/g, '\n')` when reading golden files) and add `.gitattributes` forcing `text eol=lf` on `tests/sim/golden/*.json` and `e2e/golden/*.json` so Windows builds stay deterministic with `serializeRouteExport` (`\n`).
2. **Unify Coordinate Transform Helper (`src/terrain3d/marswalkCoords.ts`):** Encapsulate the verified transforms `(east_m = x_vr + 586.81, north_m = y_vr + 470.15, Y = elev - h0)` and keep root [src/contracts/grid.ts](../src/contracts/grid.ts) (`pointToCell` strict half-open `[0, L)` outer edge rejection) as the single source of truth; deprecate `localMetersToGridPoint`'s inclusive east/south clamping in `algorithm/src/coordinates/grid.ts` (or guard behind explicit opt-in) so boundary tests cannot diverge.
3. **Resolve Quality & Roughness Rules Cleanly Before Wiring:**
   - Decide explicitly with Role A / Ayush / Role C whether diagonal quality checks use 2-endpoint `worseQuality` or 4-corner `max(u, v, w1, w2)` **and make edge cost + `buildLeg` (`qualityIntervals`, `unknownQualityLength_m`) use the exact same rule**.
   - Reconcile `QUALITY_PENALTY_BY_CODE` (`LOW` vs `UNKNOWN` ordering) against [tests/sim/expectations.ts](../tests/sim/expectations.ts) `uncertaintyNoWorse`: if `UNKNOWN` penalty remains `< LOW`, update `uncertaintyNoWorse` / specification intentionally rather than silently regressing `fuzzy` seed `20261608`; alternatively set `UNKNOWN >= LOW` (`1.0` vs `0.5` or `1.0` vs `0.85`) so `uncertainty-aware` strictly minimizes unknown-quality distance under uncertainty.
   - Adopt Ayush's `maxTerrainSlopeDeg = 20°` and verify `roughnessScaleM` against Role A's HiRISE note (`p99 = 0.117 m` — either keep `0.5 m` documented or calibrate explicitly for `educational-eva-v1`).

### Phase B — Routing Engine & Diagnostic Extensions (`src/routing/` + `algorithm/` + Worker)
1. **Refactor `algorithm/src/routing/marspineappleAdapter.ts` to Delegate Core Primitives:** Instead of maintaining a forked A* loop, share `RoutingEngine` primitives cleanly (`computeConnectedComponentsAndAdjMask` $O(1)$ unreachable check, exact `astar.ts` 4-tuple tie-breaking, `explanations.ts` formatting, explicit per-request `SolverWorkspace` rather than an unguarded module singleton), while implementing `src/contracts/route.ts`'s `solveRoute(grid, req, hooks)`.
2. **Switch [src/routing/index.ts](../src/routing/index.ts) to Ayush's Adapter:** Replace `placeholderEngine.ts` re-exports (`MODEL_VERSION` becomes `'eva-astar-1.0.0'`), keep `workerJsGz` under `50 KB` gz (`46 KB` headroom), and regenerate golden outputs/examples (`npm run sim:update-golden`, `npm run examples`, `npm run e2e:update-golden`) intentionally in a single reviewed commit.
3. **Add Opt-In Search Trace & Comparator Mode (`RouteRequest` / `RouteResponse` Extensions):**
   - Keep default worker routing fast (`trace?: boolean`, `compareAlgorithms?: boolean`) so normal solves, `npm run sim`, and T40 benchmarks stay allocation-free (`~35 ms`).
   - When `trace: true` is requested by the UI visualizer, record compressed downsampled wavefront snapshots (`closedCells`, `frontierCells`, step metrics, best `g/h/f` samples) delivered on completion (or throttled `RouteProgress`) plus alternative/rejected policy attempts (e.g., rejected steeper shortcut, blocked gap, or non-selected policy branch with crisp reason strings) for the "See its thinking" panel and 3D dotted rejected-path overlays.
   - Expose `compareAlgorithms: true` running `solveAStar` vs `solveDijkstra` sequentially inside the worker (`A*` vs `Dijkstra` `exploredNodes`, `solveTimeMs`, path parity) for the **Algorithm Comparator** card.

### Phase C — Unified Bundles, Bilingual Captions & Site Assets
1. **Consume `scripts/data/texts/ui_captions.json` Directly in `src/`:** Convert or import `ui_captions.json` as a typed bundle/locale module supplying English (and optional IT toggle) layer legends, source citations, limitations, coarse CTX disclaimers, and P3–P5 observation/interpretation/MEDA cards without inflating raw `dist/` assets.
2. **Reconcile POIs & Offline Photos Within the `60 MB` Budget:** Keep `public/bundles/jezero-west-hirise-v0.1.0` (`14.16 MB`) as the canonical routing grid (`poi-p3`, `poi-p4`, `poi-p5`), enrich metadata cleanly from `site.json` (`yori`, `rockytop`, CRISM `minerals.png`, THEMIS `thermal.png`, local `photos/*.jpg` — documenting/aligning the `threeforks` sol 663 vs `poi-p5` sol 686 `41.5 m` waypoint distinction), and **avoid copying duplicate high-res assets twice** so `totalDistRaw` stays safely under `60.00 MB` (currently `37.91 MB`, with only `marswalk/app/dist/` excluded from root `dist/`). Remove external runtime photo fetches so `e2e/release.spec.ts` offline guarantees hold.

### Phase D — Lazy 3D Marswalk Component (`src/terrain3d/TerrainView.tsx` + Scene Modules)
1. **Refactor `marswalk/app/src/` into `src/terrain3d/` TypeScript Modules:**
   - Keep `TerrainView.tsx` exclusively behind `src/app/TerrainSlot.tsx`'s `lazyTerrain` boundary so initial `entryJsGz` stays around `~80 KB` (`< 150 KB` budget) and non-WebGL browsers degrade cleanly to `[data-testid="terrain-fallback"]`.
   - Wrap the clipmap terrain, 5 NASA layers (translated to English), sky dome, player/WebXR controller, and scene objects inside a lifecycle-managed controller class exposing `mount(container, initialProps)`, `update(nextProps)`, and `dispose()` (releasing WebGLRenderer, textures, clipmap buffers, `setAnimationLoop`, pointer-lock, and window listeners).
   - Route WebGL init/load/context-lost errors to `props.onError({ kind, message })` instead of calling `console.error` (preserving E2E `consoleGuard`).
2. **Add Dynamic Routing Overlays, Off-Path Warning & Respawn:**
   - Render `selectedCandidate` (`outbound.path` + optional `returnLeg.path`) draped onto terrain height (`elevation_m + offset` using `draping3d.ts` or clipmap height query) as a **solid blue 3D ribbon/line** replacing static `inner_nav.png` route reliance.
   - Render non-selected / rejected branches as **dotted/dashed 3D lines** (`THREE.LineDashedMaterial` or instanced segments) clickable/hoverable to surface rejection/tradeoff explanations.
   - Continuously compute player ground distance to the active solid blue polyline during walkthrough: when distance exceeds safety corridor tolerance (e.g., `> 12–15 m` or entering hazard slope `> 20°`), emit an off-path callback to React/XR HUD displaying the **center-screen `X` cross warning** and **Respawn** action snapping player pose cleanly back to the nearest valid path vertex (and when entering Point B radius, trigger Point B arrival).

### Phase E — Full End-to-End UX Loop (`src/state/` + `src/ui/`) Preserving Test Contracts
1. **Extend [src/state/store.ts](../src/state/store.ts) Without Breaking Invalidations:** Add non-invalidating UI loop state (`screen: 'start' | 'plan' | 'visualize' | 'walkthrough' | 'arrival'`, `visualizerPlayback`, `offPathState`, `language: 'en' | 'it'`) cleanly separated from `INVALIDATING_ACTIONS` (`mission/*`, `region/*`).
2. **Implement the 6-Stage Guided Experience with E2E Compatibility:**
   - **Start Menu -> Point A/B Selector:** Provide an immediate Start Menu for humans while keeping E2E/unit compatibility (either via `?mode=planner` / `autoSkipStart` default in non-interactive fixture helpers OR updating `openApp()`/`renderRoutedApp()` in coordination with Role C while preserving every `data-testid` in `e2e/fixtures.ts`: `release-id`, `start-preset`, `destination-preset`, `calculate`, `map-canvas`, `profile`, `briefing`, `terrain-view`, `terrain-fallback`, `candidate-*`, `export-json`, `route-status`, `stale`, etc.).
   - **2D Map & "See its thinking":** Add pan/zoom, orbital `texture` underlay + layer opacity sliders, layer legends from `ui_captions.json`, requested-vs-accepted markers, animated A* wavefront player (respecting `prefers-reduced-motion`), A* vs Dijkstra Comparator summary, and `ElevationProfile` with `qualityIntervals` + `returnLeg`.
   - **3D Walkthrough Overlay & Arrival Flow:** Render accessible DOM overlays above `TerrainView` for center-screen **`X`** off-path indicator, **`Respawn`** button, active layer/rejected-path legend cards, **Point B Arrival Summary** (metrics + science observation/interpretation + MEDA + export/print briefing), and **Return to Start Menu** action.
3. **Final Verification Gate After Integration:** Pass `npm run typecheck`, `npm run lint`, `npm test` (`0` failures after CRLF fix + golden update), `cd algorithm && npm test`, `npm run sim`, `npm run build`, `npm run audit:release`, and `npx playwright test` across `release`, `variant`, and `synthetic` projects.

---

## 6. Post-Audit Discovery: Role A PR #2 (`origin/pr-2`) & Dhani's `origin/dhani/ui-integrated` (`55d1565`)

After initial Wave 1A/1B audits against `origin/main` (`c28d295`), two critical remote refs were fetched and inspected:

1. **Role A PR #2 (`origin/pr-2`, commit `1d43b30`):**
   - Verified licences, credits, and DOIs across `public/bundles/jezero-west-hirise-v0.1.0/manifest.json`, `public/bundles/jezero-west-ctx20m-v0.1.0/manifest.json`, `scripts/data/licences.json`, `scripts/data/sources.json`, `scripts/data/pois.json`, `scripts/data/texts/ui_captions.json`, and Python generator scripts (12 files; metadata only, analytical bytes and `bundleVersion` unchanged).
   - **Merged cleanly into `merge/integration`**.

2. **Dhani's Real UI Branch (`origin/dhani/ui-integrated`, commit `55d1565`, branched from earlier commit `7480107`):**
   - Dhani and subworkers completed **11 of 21 UI tasks** (`TASK-001` through `TASK-011` marked `DONE` / `REVIEW` in `TASK_STATUS.md`) across `src/ui/shared/`, `src/ui/features/{assumptions,destinations,endpoints,layer-controls,map-chrome,map-markers,map-rasters,map-routes,mission-context,request-controls}/`, `src/ui/App.tsx`, `src/ui/MapCanvas.tsx`, and `src/ui/app.css`.
   - **Tasks `TASK-012` through `TASK-021`** (comparison panel, elevation profile, mission evidence, failure guidance, 3D host, media, sources drawer, printable briefing, JSON export, point inspector) remain `TODO`, with `App.tsx` providing basic fallbacks.
   - **Integration Conflicts Found on Bringing Dhani's UI into `merge/integration`:**
     - **Stale Base Deletion Risk:** Because `dhani/ui-integrated` branched from `7480107`, a full git merge would delete Role C's later `tests/sim/`, `tests/realdata.test.ts`, and `4dfb88f` E2E/testid hardening; therefore only Dhani's UI files (`src/ui/**`, `TASK*.md`, `INTEGRATION.md`, `AGENTS.md`, `handoffs/`) were checked out selectively onto `merge/integration`.
     - **4 Missing `manifestUrl` Fixture Errors:** 4 of Dhani's test files (`endpoints.test.tsx`, `MapRasters.test.tsx`, `MissionContext.test.tsx`, `foundation.test.tsx`) construct mock `GridBundle` objects missing `manifestUrl: string` (added after `7480107`).
     - **`data-testid` & Status Regressions vs `4dfb88f`:** Dhani's `App.tsx` omits `OptionalAssetsStatus` (`optional-assets-status`), `data-testid="${which}-preset"`, `data-testid="cancel-route"`, `data-testid="view-2d/3d"`, `data-status` attribute on `route-status`, `data-testid="route-message"`, `data-testid="candidate-*"`, and `data-testid="export-json"`; likewise `Destinations.tsx` uses `start-preset-dropdown` instead of `start-preset` and `RequestControls.tsx` uses `cancel-request` instead of `cancel-route`.
   - **Test Result Observed After Selective Checkout:** All **13 UI/smoke test files (122/122 tests)** passed in Vitest (`6.97s`), while `npm run typecheck` failed solely on those 4 `manifestUrl` test fixtures.
