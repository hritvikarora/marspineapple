# MASTER HANDOFF BRIEF FOR GROK 4.7 COORDINATOR (`merge/integration`)

**Chat Session ID:** `d653baa2-fcb0-4e56-b34f-9bfeba83fab0`  
**Workspace:** `c:\Users\Ayush\Documents\ChatGPT\mars`  
**Target Branch:** `merge/integration` (CRITICAL: Do **NOT** push to `main`!)  
**Reason for Handoff:** The Gemini Hydrogen quota reached 0% mid-Wave-2. You (`grok-4.7-high`) are now taking over as the **Lead Coordinator & Exam Checker** to finish the remaining Wave 2 Batch B, Wave 2 Batch C, and Wave 3 tasks using parallel **Grok 4.7 sub-agents** via the Cursor CLI (`agent -p --trust --yolo --model "grok-4.7-high"`).

---

## PART 1: EVERYTHING ALREADY COMPLETED — DO NOT RE-DO OR OVERWRITE!

The following phases, merges, audits, plans, debates, and production TypeScript modules are **already completed and verified** in the working tree on `merge/integration`. **Do NOT recreate, revert, or rewrite these completed files from scratch:**

### 1.1 Git Merges & Vendored Repositories (100% DONE)
1. **Gabriele's 3D Marswalk (`Gabryg07/mars-eva-vr` commit `e92df74`):**
   - Vendored under `marswalk/` (`marswalk/app/src/{main,terrain,sky,player,mission,pois,hud,info,arm,helmet,ui}.js`).
   - 24.53 MB Jezero Delta clipmap dataset copied into `public/sites/jezero-delta/` (`site.json`, `inner_h.bin`, `mid_h.bin`, `outer_h.bin`, `inner_ortho_*.jpg`, `inner_slope.png`, `minerals.png`, `thermal.png`, `photos/*.jpg`).
2. **Irene's (Role A) PR #2 (`origin/pr-2`, commit `1d43b30`):**
   - Merged cleanly into `merge/integration`.
   - Updated `public/bundles/jezero-west-ctx20m-v0.1.0/manifest.json`, `public/bundles/jezero-west-hirise-v0.1.0/manifest.json`, `scripts/data/licences.json`, `scripts/data/sources.json`, `scripts/data/pois.json`, `scripts/data/texts/ui_captions.json`.
3. **Dhani's UI Foundation & 10 Slot Features (`origin/dhani/ui-integrated`, commit `55d1565`):**
   - Selectively checked out into the working tree (preserving `tests/sim/`, `tests/realdata.test.ts`, `algorithm/`, `marswalk/`):
     - `AGENTS.md`, `INTEGRATION.md`, `TASKS.md`, `TASK_STATUS.md`, `handoffs/TASK-001..011.md`
     - `src/ui/shared/**` (`Slot.tsx`, `registry.ts`, `types.ts`, `FeatureHarness.tsx`, `foundation.test.tsx`, `tokens.css`, `primitives/*`)
     - `src/ui/features/{assumptions,destinations,endpoints,layer-controls,map-chrome,map-markers,map-rasters,map-routes,mission-context,request-controls}/**`
     - `src/ui/App.tsx`, `src/ui/MapCanvas.tsx`, `src/ui/app.css`
   - Verified `npx vitest run tests/app.smoke.test.tsx tests/selectionSync.test.tsx src/ui/`: **13/13 test files, 122/122 tests passing**.

### 1.2 Audits, Architecture Plans & Debate Logs (100% DONE)
- `docs/audit-parts/part-{ayush,irene,gabriele,hritvik,dhani}.md` — Complete code audits of all 5 teammates' work.
- `docs/MERGE_FINDINGS.md` — Complete 5-member status matrix, 6 architectural conflicts resolved, standalone baseline results, PR #2 + Dhani UI reconciliation.
- `docs/MERGE_PLAN.md` — Complete file-by-file merge blueprint + **Section 5 ("Authoritative Post-Debate Refinements & PR #2 / `dhani/ui-integrated` Overrides")**.
- `docs/DEBATE_LOGS.md` — Coordinator Rounds 1–3 Grok 4.7 debates.
- `docs/debate-parts/debate-{coord-bridge,sfx-audio,vr-terrain,eng-solver}.md` — Completed Wave 2 Batch A Pass 1 + Pass 2 Exam-Checker logs.
- `docs/debate-parts/pass1-{vr-player-mission,vr-hud-panels,ui-start-menu,ui-map-canvas}.md` — **Already-completed Pass 1 Grok 4.7 architecture critiques for Batch B!** Your Batch B sub-agents should read these directly instead of re-running Pass 1!

### 1.3 Wave 2 Batch A Production Code (100% DONE & EXAM-CHECKED — DO NOT REWRITE)
1. **`src/contracts/route.ts` (DONE):**
   - Added pure TypeScript `SearchTraceFrame` (`{ step, policy, closedCells, frontierCells, currentBestCells, currentBestCost, exploredCount, openSize, note }`) and `SearchTraceData` (`{ exploredTotal, frames }`), plus optional `trace?: SearchTraceData` on `RouteSuccess`.
2. **`src/routing/evaEngine.ts` & `src/routing/index.ts` (DONE conceptually, 5 Pass-2 fixes still PENDING in `evaEngine.ts`):**
   - Full canonical EVA A* solver ported from `algorithm/src/routing/marspineappleAdapter.ts` (`MODEL_VERSION = 'eva-astar-1.0.0'`, `EVA_LIMITS = { maxTerrainSlope_deg: 20, maxAbsEdgeGrade_deg: 20, roughnessScale_m: 0.5 }`, `EVA_POLICY_WEIGHTS`, `worseQuality`, `qualityPenalty` keeping `UNKNOWN (1.0) > LOW (0.5) > GOOD (0.0)`, `computeEdgeCost`, `isCellAdmissible`, `solveRoute`, lazy `acquireWorkspace()`, `heap.clear()` in `finally`, `(explored.n & 511) === 0` stop polling, deterministic `RouteSuccess.trace` up to 48 frames).
   - **CRITICAL PENDING FIXES FROM `docs/debate-parts/debate-eng-solver.md` (Pass 2 stopped on quota right before editing!):** Read `docs/debate-parts/debate-eng-solver.md` and fix `src/routing/evaEngine.ts` BEFORE running `eng-trace` or updating goldens:
     1. In `hasHigherPriority` (`src/routing/evaEngine.ts:273-293`) & equal-`g` parent rewrite (`src/routing/evaEngine.ts:741-750`): align tie-breaks (`f`, `cross`, `u`) with spec/algorithm if required by golden/determinism checks.
     2. In `remapFramesForReuse`: `.slice()` `closedCells`, `frontierCells`, and `currentBestCells` so reused policy frames do not alias arrays in-process.
     3. Move trace snapshot capture AFTER successor loop pushes so the first frame includes pushed frontier neighbors rather than `open 0`.
     4. Ensure `searchTrace.ts` (`eng-trace`) enforces admissibility, diagonal corners, AND `|dz|/stepLen <= tan(20°)` before calling `computeEdgeCost`.
     5. Remove unused `MAP_MARSPINEAPPLE_QUALITY_TO_INTERNAL` / `MAP_INTERNAL_QUALITY_TO_MARSPINEAPPLE` constants so nobody accidentally re-wires them on top of contract-code penalties.
     6. Note for Wave 3 (`tests/sim/worker.sim.test.ts`): lines 76 & 132 failed against `evaEngine.ts` because synthetic fixture `noisy` (`noisy-rough`) has slope `23.6° > 20°` at `cases[1]` start (`> 20°` EVA slope limit, tuned for old placeholder `25°`).
3. **`src/terrain3d/coordBridge.ts` (100% DONE, PASS-2 FIXED, `eslint` 0, `tsc` 0 — 28.7 KB):**
   - Pure TypeScript (ZERO `three` imports).
   - Exports: `JEZERO_VR_OFFSET`, `DEFAULT_MAX_SLOPE_DEG`, `CoordBundleRef`, `VrPoint2`, `VrPoint3`, `SceneOrigin`, `UnifiedPoi`, `NearestPathSample`, `DottedProximityHit`, `CorridorOffPathReason`, `CorridorCheckResult`, `CorridorCheckOptions`, `ArrivalStatus`, `isJezeroHiriseBundle`, `frameForBundle`, `localToVr2ForBundle`, `vr2ToLocalForBundle`, `localToSceneXYZ`, `localToSceneXYZForBundle`, `sceneXYZToLocal`, `defaultCorridorThresholdForGrid`, `defaultArrivalRadiusForGrid`, `sampleElevationBilinear`, `getUnifiedPoisForBundle` (returns 7 distinct Jezero HiRISE POIs with `threeforks` sol 663 kept distinct from `poi-p5` sol 686/690 Depot 41.5 m away, English prose, `./sites/jezero-delta/photos/...`), `findNearestPointOnPath`, `findClosestRejectedPath`, `checkCorridorSafety`, `checkArrivalAtDestination`.
4. **`src/ui/soundEffects.ts` (100% DONE, PASS-2 FIXED, `eslint` 0, `tsc` 0 — 17.0 KB):**
   - Pure Web Audio synthesizer (zero external audio files, zero top-level `window` access, zero `console.*`).
   - Exports: `SfxKind`, `SoundController`, `createSoundController(initialMuted?)`, `playSfxOnce(kind, muted?, pitchFactor?)`.
5. **`src/terrain3d/marswalkTypes.ts`, `marswalkTerrain.ts`, `marswalkSky.ts`, `marswalkPois.ts` (100% DONE, PASS-2 FIXED, `eslint` 0, `tsc` 0, `vitest` 8/8 passed — ~101 KB total):**
   - `marswalkTypes.ts`: `SceneOrigin`, `UnifiedPoi`, `TerrainRingName`, `TerrainRingSpec`, `SitePoiRaw`, `MarswalkSiteData`, `OverlayLayerId`, `OVERLAY_LAYER_LABELS_EN`, `RouteRejectedPathInput`, `MarswalkTerrainHandle`, `MarswalkSkyHandle`, `MarswalkPoisHandle`.
   - `marswalkTerrain.ts`: `loadMarswalkSiteJson`, `resolveTerrainOrigin`, `createProceduralTerrainFromBundle`, `attachJezeroClipmapTextures`, `createJezeroTerrain` (`THREE.GLSL3` clipmap shader grounded on `bundle.elevation` inside bundle bounds with 8 m perimeter skirt into NASA `.bin` outer rings, `NO_ELEVATION` hole discard, `ortho`/`slope`/`minerals`/`thermal` layers, `inner_nav.png` disabled, compile-before-remove fallback), `createRouteOverlaysGroup` (`outbound` + `returnLeg` ribbons + clickable alternate candidates + `LineDashedMaterial` `rejectedPaths`), `disposeObject3DTree`.
   - `marswalkSky.ts`: `MARS_HORIZON_COLOR`, `MARS_ZENITH_COLOR`, `makeMarsSky(scene)`.
   - `marswalkPois.ts`: `createMarswalkPois(options)` rendering Point A (`Start`), Point B (`Destination`), and 7 `UnifiedPoi` beacons/cards in English with full `.dispose()`.

---

## PART 2: CRITICAL ARCHITECTURAL RULES & BENCHMARK CONSTRAINTS

Every sub-agent you spawn MUST obey these hard rules (`AGENTS.md`, `scripts/audit.mjs`, and `docs/MERGE_PLAN.md` §5):

1. **Mandatory Exam-Checker Loop on Every File:**
   - Think of Grok (`agent -p --trust --mode ask --output-format text --model "grok-4.7-high"`) as a strict **exam checker** grading written code against hard benchmarks.
   - Note: **NEVER ask any sub-agent to read `docs/PROJECT_MASTER_CONTEXT.md` (it is ~1 MB and stalls Cursor CLI!)**. Always point sub-agents ONLY to `docs/MERGE_PLAN.md` (§5) + the 2–5 specific files in their scope.
   - For the 4 Batch B modules that already have `docs/debate-parts/pass1-*.md` (`vr-player-mission`, `vr-hud-panels`, `ui-start-menu`, `ui-map-canvas`), read the existing `pass1-*.md` directly, implement the code incorporating every Pass 1 fix, then run a **Pass 2 Exam-Checker audit** against the written code, fix all findings, and write `docs/debate-parts/debate-<name>.md`.
2. **Hard Build & Bundle Ceilings (`scripts/audit.mjs`):**
   - `entryJsGz <= 150.0 KB` (currently `91.9 KB` — `58.1 KB` headroom)
   - `totalJsGz <= 450.0 KB`
   - `workerJsGz <= 50.0 KB` (currently `4.0 KB`)
   - `cssGz <= 30.0 KB` (currently `4.8 KB`)
   - `totalDistRaw <= 60.00 MB` (currently `37.98 MB`)
   - **Eager Glob Trap:** `src/ui/shared/registry.ts` runs `import.meta.glob('../features/*/entry.tsx', { eager: true })`. Therefore:
     - **NEVER** create new `src/ui/features/*/entry.tsx` files!
     - **NEVER** statically import `three`, `evaEngine.ts`, or `searchTrace.ts` from `App.tsx` or any `src/ui/features/**` file!
     - Load `StartMenuModal.tsx`, `PathfindingVizPanel.tsx`, `SeeThinkingDrawer.tsx`, and `src/routing/searchTrace.ts` via **`React.lazy` / dynamic `import()`** in `App.tsx`!
3. **Zero Console / Strict TypeScript / Scientific Honesty:**
   - **Zero** `console.log`, `console.debug`, `console.info`, `console.trace` anywhere in `src/` (and avoid `console.error`/`warn` so Playwright `consoleGuard` never trips!).
   - **Zero** `any` (`@typescript-eslint/no-explicit-any: error`), `noUncheckedIndexedAccess: true`, `noUnusedLocals: true`, `noUnusedParameters: true`, `verbatimModuleSyntax: true`.
   - **100% English UI:** Never display Italian strings from `marswalk/app/src/*.js` or `site.json`. Use PR #2 `scripts/data/licences.json`, `scripts/data/sources.json`, and `scripts/data/texts/ui_captions.json`.
   - **No oxygen or survival gauges, no Quest VR buttons:** `AGENTS.md` strictly forbids oxygen/survival gauges and unverified Quest VR claims. Mark the outpost as fictional and the app as an educational simulation. Preserve `synthetic: true` badges/warnings.

---

## PART 3: REMAINING WORK — RUN IN PARALLEL WITH GROK SUB-AGENTS!

Use PowerShell background jobs (`Start-Job` or parallel processes invoking `agent -p --trust --yolo --model "grok-4.7-high" ...`) so multiple Grok sub-agents build disjoint file slices in parallel!

### PHASE A: Wave 2 Batch B (6 Disjoint Sub-Agents in Parallel)

Spawn 6 parallel Grok sub-agents with strictly disjoint file ownership:

1. **Sub-Agent 1: `eng-trace`**
   - **Owned files:** `src/routing/searchTrace.ts`, `docs/debate-parts/debate-eng-trace.md` (plus applying the 2-line array `.slice()` fix in `src/routing/evaEngine.ts` `remapFramesForReuse` and removing unused `MAP_MARSPINEAPPLE_QUALITY_TO_INTERNAL`).
   - **Requirements (`docs/MERGE_PLAN.md` §3.2 & §5):**
     - Export `AlgorithmRunStats`, `AlgorithmComparison`, `RejectionCategory`, `RejectedPathOption`, `ThinkingStep`, `SearchTraceResult`, `SearchTraceOptions`, `computeSearchTraceAndCompare`, `buildRejectedPathOptions`.
     - Import `EVA_LIMITS`, `EVA_POLICY_WEIGHTS`, `worseQuality`, `qualityPenalty`, `isCellAdmissible`, `type RoutingGrid`, `type PolicyWeights` from `./evaEngine`.
     - **CRITICAL (`debate-eng-solver.md` finding #4):** `computeEdgeCost` does NOT check cell admissibility or `|dz|/stepLen <= tan(20°)`! In `searchTrace.ts`, always enforce `admissible[v]`, diagonal corner admissibility `(admissible[c1] && admissible[c2])`, AND `|dz|/stepLen <= tan(20°)` before computing step cost!
     - Use the primary `RouteSuccess.trace` frames when available; run comparator (A* vs. Dijkstra `h=0` vs. Greedy Best-First) on a **separate local workspace** ONLY when `grid.width * grid.height <= 100_000` (selected policy only; omit optimality ratio for inadmissible Greedy Best-First; on `1000×1000` HiRISE skip live Dijkstra/Greedy re-solve and set an honest `sampledNotice` so the browser main thread never freezes!).
     - `buildRejectedPathOptions`: generate 2–3 dashed rejected alternatives (non-selected solved `RouteCandidate`s with exact metrics delta, plus a Naive Direct Straight-Line corridor draped on `grid.elevation` showing where it hits `>20°` slope / exclusion / high uncertainty, plus an unpenalized corridor when candidates collapse) with plain-language `reason` strings for 2D & 3D tooltips.
     - Generate 6 structured `ThinkingStep`s (`endpoints`, `admissibility`, `policy-eval`, `frontier-pruning`, `comparison`, `selection`) with real metrics from the active solve.

2. **Sub-Agent 2: `vr-player-mission`**
   - **Owned files:** `src/terrain3d/marswalkPlayer.ts`, `src/terrain3d/marswalkMission.ts`, `src/terrain3d/marswalkArm.ts`, `docs/debate-parts/debate-vr-player-mission.md`
   - **Read first:** `docs/debate-parts/pass1-vr-player-mission.md` (Pass 1 Grok critique already done!), `src/terrain3d/coordBridge.ts`, `src/terrain3d/marswalkTypes.ts`.
   - **Requirements:**
     - `marswalkPlayer.ts`: WASD/Arrow + Shift sprint + pointer-lock mouse look + orbital camera mode; **PRE-STEP movement gating** using `sceneXYZToLocal`, `terrain.slopeDegAtSceneXZ`, and `checkCorridorSafety(localNext, bundle, activePathCells, activePath, { maxSlope_deg: 20, maxCorridorDeviation_m: defaultCorridorThresholdForGrid(bundle.manifest.grid), routeBundleVersion: bundle.bundleVersion })`. Block step BEFORE moving if `isOffPath` or `slopeDeg > 20`; edge-trigger `offPathCount`; exit pointer lock safely on block (`document.exitPointerLock?.()`); `[R]` key on `window` + `respawnToSafePoint()`; `stepOffPathForDemo()` / `moveAlongRouteForDemo()` helpers for deterministic E2E/fallback buttons; ground feet strictly on `terrain.heightAtSceneXZ(x, z)`; crumb trail (`setTrailVisible`, `.dispose()`).
     - `marswalkMission.ts`: live progress along `outbound` (and `returnLeg` when `roundTrip` active), `findClosestRejectedPath` (passing `defaultCorridorThresholdForGrid(bundle.manifest.grid)`), `poisHandle.findNearestPoi`, `checkArrivalAtDestination` (passing `defaultArrivalRadiusForGrid(bundle.manifest.grid)`), Tobler time estimate (NO oxygen/survival gauges!), `resetMission()`.
     - `marswalkArm.ts`: wrist console mesh + reusable `CanvasTexture` (`getContext('2d')` null-guarded for jsdom), `[I]` toggle, 100% English, `.dispose()`.

3. **Sub-Agent 3: `vr-hud-panels`**
   - **Owned files:** `src/terrain3d/marswalkUi.ts`, `src/terrain3d/marswalkHud.ts`, `src/terrain3d/marswalkHelmet.ts`, `src/terrain3d/marswalkInfo.ts`, `docs/debate-parts/debate-vr-hud-panels.md`
   - **Read first:** `docs/debate-parts/pass1-vr-hud-panels.md` (Pass 1 Grok critique already done!), `src/terrain3d/marswalkTypes.ts`, `scripts/data/{licences.json,sources.json,texts/ui_captions.json}`.
   - **Requirements:**
     - 100% English prose (zero Italian strings, zero oxygen/survival gauges, no Quest VR button claims, explicit fictional outpost + educational simulation attribution).
     - `marswalkHud.ts`: DOM/canvas HUD inside container with live coordinates/elevation/slope/progress, center-screen **`✕ OFF-PATH BLOCKED`** (`data-testid="off-path-alert"`, `role="alert"`, reason + deviation + `[R] Respawn to Safe Blue Path` button `data-testid="respawn-safe-button"`), **Dotted Rejected Path Callout** (`data-testid="rejected-path-callout"` showing plain-language `reason`), **Point B Arrival Summary Modal/Card** (`data-testid="arrival-summary"` with stats + `"Return to Start Menu"` button `data-testid="return-to-start-menu"`), nearby POI story/Mastcam-Z card, and interactive demo controls bar (`Step Off-Path`, `Inspect Dotted Path`, `Respawn [R]`, `Reach Point B`, `Return to Start Menu`) that works in both WebGL and fallback mode!
     - `marswalkInfo.ts`, `marswalkHelmet.ts`, `marswalkUi.ts`: English credits/DOIs/licences from PR #2, visor frame, jsdom-safe `getContext('2d')`, complete `.dispose()`.

4. **Sub-Agent 4: `ui-start-menu`**
   - **Owned files:** `src/ui/StartMenuModal.tsx`, `docs/debate-parts/debate-ui-start-menu.md`
   - **Read first:** `docs/debate-parts/pass1-ui-start-menu.md` (Pass 1 Grok critique already done!), `src/terrain3d/coordBridge.ts`.
   - **Requirements:**
     - Pure TS/React (ZERO `three`, `evaEngine`, or `searchTrace` imports!).
     - **NON-BLOCKING DOCKED CARD (`data-testid="start-menu"`):** Renders as a compact docked mission briefing card at the top of the workspace (NEVER a full-viewport backdrop that blocks Playwright clicks on `map-canvas`, `start-preset`, `destination-preset`, or `calculate`!).
     - Point A (`data-testid="start-menu-point-a"`) and Point B (`data-testid="start-menu-point-b"`) selectors populated from `getUnifiedPoisForBundle(bundle)` (preventing `A === B`), `"Plan Route & Watch Pathfinder"` (`data-testid="start-menu-launch"`), `"Enter 3D Mars Walk"` (`data-testid="start-menu-enter-3d"`), Mute toggle (`data-testid="start-menu-mute"`), and `"Hide Quick Start"` (`data-testid="start-menu-dismiss"`).
     - Fictional outpost + educational simulation badge + `[Synthetic Fixture]` badge when `bundle.manifest.synthetic === true`.

5. **Sub-Agent 5: `ui-map-canvas`**
   - **Owned files:** `src/ui/MapCanvas.tsx`, `src/ui/features/map-routes/MapRoutes.tsx`, `src/ui/features/map-rasters/MapRasters.tsx`, `docs/debate-parts/debate-ui-map-canvas.md`
   - **Read first:** `docs/debate-parts/pass1-ui-map-canvas.md` (Pass 1 Grok critique already done!), `src/ui/MapCanvas.tsx`, `src/ui/features/map-routes/MapRoutes.tsx`, `src/ui/features/map-rasters/MapRasters.tsx`.
   - **Requirements:**
     - Fix `PX_PER_CELL = 28` HiRISE crash (`28000×28000` canvas returns `null` context!): dynamically clamp `pxPerCell = Math.max(1, Math.min(28, Math.floor(Math.min(960 / Math.max(1, grid.width), 960 / Math.max(1, grid.height)))))` (`16×16` test grid stays `28 px/cell = 448×448`; `1000×1000` HiRISE becomes `1 px/cell = 1000×1000`). Use `getBoundingClientRect()` scaling on click (`rect.width > 0 ? W / rect.width : 1`) so CSS-scaled `<canvas>` and jsdom (`rect.width === 0`) both map clicks accurately.
     - Add explicit dependency array to `MapCanvas.tsx`'s `useEffect`.
     - Cache raster rendering in `MapRasters.tsx` (and `MapCanvas.tsx` baseline fallback) using an offscreen `<canvas>` / `ImageData` pixel buffer keyed on `(bundle, layers)` so `1000×1000` HiRISE draws via a single `ctx.drawImage(...)` instead of 3,000,000 `fillRect` calls (preserving `fillRect` fallback for tiny grids `<= 20×20` or jsdom mocks without `ImageData`/`drawImage` so `MapRasters.test.tsx` and `foundation.test.tsx` pass 100%!).
     - Render optional `traceFrame?: SearchTraceFrame | null` (`closedCells`, `frontierCells`, `currentBestCells`) and `rejectedPaths?: readonly RouteRejectedPathInput[]` (dashed lines) cleanly in `MapCanvas.tsx` and `MapRoutes.tsx`.

6. **Sub-Agent 6: `ui-viz-thinking`** (runs as soon as `eng-trace` finishes `src/routing/searchTrace.ts`)
   - **Owned files:** `src/ui/PathfindingVizPanel.tsx`, `src/ui/SeeThinkingDrawer.tsx`, `docs/debate-parts/debate-ui-viz-thinking.md`
   - **Requirements (`docs/MERGE_PLAN.md` §3.7 & §5):**
     - `PathfindingVizPanel.tsx` (`data-testid="pathfinding-viz-panel"`): Play/Pause (`data-testid="viz-play-pause"`), Step Forward/Back, Speed (`1x`/`2x`/`4x`), Scrubber slider (`data-testid="viz-scrubber"`), live wavefront telemetry (`exploredCount`, `openSize`, `currentBestCost`, frame `note`), **Algorithm Comparator Table** (`data-testid="algo-comparison-table"` comparing A* vs. Dijkstra `h=0` vs. Greedy Best-First on small/medium grids, or showing `sampledNotice` cleanly on `1000×1000` HiRISE without freezing), **Rejected Paths Legend** (explaining why each dotted path was rejected), `"See Its Thinking"` button (`data-testid="open-see-thinking"`), and `"Spawn at Point A in 3D World"` primary CTA (`data-testid="viz-enter-3d"`).
     - `SeeThinkingDrawer.tsx` (`data-testid="see-thinking-drawer"`): uses Dhani's `ModalDrawer` primitive (`src/ui/shared/primitives/ModalDrawer.tsx`) or accessible drawer to present the 6 `ThinkingStep` cards (endpoints, slope/grade admissibility `<=20°`, policy weights `alpha/beta/gamma`, frontier pruning, comparator results, and why each dotted alternative was rejected).

---

### PHASE B: Wave 2 Batch C (2 Disjoint Sub-Agents in Parallel)

Once Phase A completes, spawn 2 parallel Grok sub-agents:

1. **Sub-Agent 7: `vr-view`**
   - **Owned files:** `src/terrain3d/TerrainView.tsx`, `docs/debate-parts/debate-vr-view.md`
   - **Requirements (`docs/MERGE_PLAN.md` §3.5 & §5):**
     - Preserve all 9 required `TerrainViewProps` properties (`bundle`, `candidates`, `selectedCandidateId`, `highlightPathIndex`, `verticalExaggeration`, `camera`, `onCameraChange`, `onSelectCandidate`, `onError`) + optional walkthrough props (`rejectedPaths`, `searchTrace`, `startPoint`, `destinationPoint`, `destinationLabel`, `poiCatalog`, `roundTrip`, `soundEnabled`, `onPlaySfx`, `onArriveAtDestination`, `onReturnToMenu`).
     - Always render `<div data-testid="terrain-view" data-selected-candidate={selectedCandidateId ?? ''} data-hover-index={highlightPathIndex ?? ''}>`.
     - **CRITICAL WebGL Check:** Before calling `new THREE.WebGLRenderer(...)`, probe `canvas.getContext('webgl2') || canvas.getContext('webgl')` on a temporary canvas. In jsdom / headless environments where `getContext` returns `null` (even when `detectWebGL` was mocked `ok: true` in `tests/selectionSync.test.tsx` & `tests/terrain3d.test.tsx`), do NOT call `new THREE.WebGLRenderer` and do NOT fire `onError({ kind: 'webgl-unavailable' })` — instead render the **Interactive 2.5D Fallback Walkthrough Simulator** inside `data-testid="terrain-view"`! Only fire `onError({ kind: 'context-lost', message: 'WebGL context lost' })` on an actual `'webglcontextlost'` event (`tests/terrain3d.test.tsx:68`).
     - Wire together `createProceduralTerrainFromBundle` + async `attachJezeroClipmapTextures` (when `isJezeroHiriseBundle(bundle)`), `makeMarsSky`, `createMarswalkPois`, `createRouteOverlaysGroup`, `MarswalkPlayer`, `MarswalkMission`, `MarswalkArmDisplay`, `mountMarswalkHud`, `MarswalkHelmet`, and `MarswalkInfo`.
     - Expose deterministic DOM control buttons (`data-testid="sim-step-along-route"`, `data-testid="sim-step-off-path"`, `data-testid="sim-inspect-rejected"`, `data-testid="respawn-safe-button"`, `data-testid="sim-reach-destination"`, `data-testid="return-to-start-menu"`) on **BOTH** the WebGL HUD and the Fallback Simulator so automated Playwright E2E and Vitest tests can drive the entire 3D walkthrough deterministically!

2. **Sub-Agent 8: `ui-app-shell`**
   - **Owned files:**
     - `src/state/store.ts` (add `{ type: 'mission/reset' }` — NOT in `INVALIDATING_ACTIONS` — calling `clearRoutes(s)` and resetting `start: null`, `destination: null`, `viewMode: '2d'`, `stale: false`)
     - `src/ui/App.tsx`, `src/ui/Briefing.tsx`, `src/ui/ElevationProfile.tsx`, `src/ui/app.css`
     - `src/ui/features/destinations/Destinations.tsx`, `src/ui/features/request-controls/RequestControls.tsx`, `src/ui/features/mission-context/MissionContext.tsx`, `src/ui/features/assumptions/Assumptions.tsx`, `src/ui/features/layer-controls/LayerControls.tsx`
     - `docs/debate-parts/debate-ui-app-shell.md`
   - **CRITICAL RECONCILIATION REQUIREMENTS (`docs/MERGE_PLAN.md` §5.4):**
     - **Preserve every `4dfb88f` E2E `data-testid` AND every Dhani `src/ui/features/**/*.test.tsx` assertion:**
       - In `App.tsx`: render `<OptionalAssetsStatus bundle={bundle} />` (`data-testid="imagery-status"`, `data-testid="optional-assets-status"`), keep `data-status={run.kind === 'finished' ? run.response.status : run.kind}` directly on `<p data-testid="route-status">`, keep `data-testid="route-message"`, `data-testid="candidate-${c.candidateId}"`, `data-testid="view-2d"`, `data-testid="view-3d"`, `data-testid="export-json"`, `data-testid="stale"`, `data-testid="synthetic-badge"`, `data-testid="synthetic-production-warning"`, `data-testid="release-id"`, `data-testid="bundle-error"`, `data-testid="profile"`, `data-testid="briefing"`, and keep `.controls` print CSS untouched.
       - In `Destinations.tsx`: support `data-testid="start-preset"` and `data-testid="destination-preset"` (while keeping `Destinations.test.tsx` passing — e.g. keep `aria-label`s expected by `Destinations.test.tsx` and ensure `<select data-testid="start-preset">` / `<select data-testid="destination-preset">` have placeholder `'— choose —'` and manifest POI options for `e2e/release.spec.ts`!).
       - In `RequestControls.tsx`: keep `data-testid="calculate"` and `data-testid="cancel-request"` (`RequestControls.test.tsx` asserts `cancel-request`).
       - In `Assumptions.tsx`: rebuild toggled policies in canonical `ROUTE_POLICIES` order and remove inaccurate `"OUTSIDE_EXTENT / MANUAL"` wording on strict-quality.
     - **Lazy-load new experience components in `App.tsx`:**
       - Use `React.lazy` for `StartMenuModal`, `PathfindingVizPanel`, and `SeeThinkingDrawer`, and dynamic `import('../routing/searchTrace')` when computing comparator/rejected paths so `entryJsGz` stays well below `150 KB`!
       - Wire the full repeatable user loop:
         `StartMenuModal` (docked non-blocking quick start) -> Pick Point A & Point B & click `"Plan Route & Watch Pathfinder"` -> auto-runs `calculate()` + opens `PathfindingVizPanel` (animated A* wavefront + comparator + rejected paths + `"See Its Thinking"` drawer) -> `"Spawn at Point A in 3D World"` (`view/setMode` `'3d'`) -> Walk solid blue path / inspect dotted rejected paths / get blocked by center-screen `✕` when stepping off-path + press `[R]` or click Respawn -> Reach Point B Arrival Summary -> click `"Return to Start Menu"` (cancels any in-flight worker, dispatches `mission/reset`, re-opens `StartMenuModal` in 2D view).
       - Note: Manual clicks on `[data-testid="calculate"]` must NOT auto-pop a blocking overlay so existing E2E tests (`e2e/journey.spec.ts`, `e2e/release.spec.ts`, `e2e/failures.spec.ts`) run completely unobstructed; provide an `"Animate Pathfinding & See Thinking"` button (`data-testid="open-visualizer"`) in the stage toolbar!

---

### PHASE C: Wave 3 Verification, Hard Benchmark Tests & Final Audit

Once Phase B compiles cleanly:
1. Consolidate all `docs/debate-parts/debate-*.md` into `docs/DEBATE_LOGS.md`.
2. Spawn parallel Grok sub-agents for Wave 3:
   - **`test-unit-int`:**
     - Add `manifestUrl: '/bundles/test/manifest.json'` to the 4 mock `GridBundle` fixtures in `src/ui/features/endpoints/endpoints.test.tsx:411`, `src/ui/features/map-rasters/MapRasters.test.tsx:15`, `src/ui/features/mission-context/MissionContext.test.tsx:547`, and `src/ui/shared/foundation.test.tsx:237` (or keep only outside `src/ui/features` if `check-isolation.mjs` checks git diff — verify `node src/ui/scripts/check-isolation.mjs`!).
     - Normalize `\r\n -> \n` when reading golden JSON files in `tests/sim/pipeline.sim.test.ts` and `e2e/journey.spec.ts`, and add `tests/**/*.json text eol=lf` + `e2e/**/*.json text eol=lf` to `.gitattributes`.
     - In `tests/sim/worker.sim.test.ts` lines 69–77 & 126–132: `noisy` fixture had slope `23.6° > 20°` at `cases[1]` start under the new `20°` EVA slope limit (it was generated for placeholder `25°`). Update those two worker-protocol recovery test calls to use a `<= 20°` reachable case (e.g. `maze` or `gentle`) while keeping `noisy` in contract/fuzz tests.
     - Verify `npm test` and invariant checks pass BEFORE running `npm run sim:update-golden` and `npm run examples`.
     - Write unit & integration tests: `tests/evaEngine.test.ts`, `tests/searchTrace.test.ts`, `tests/coordBridge.test.ts`, `tests/mergeIntegration.test.tsx`, `tests/sim/walkthrough.sim.test.ts` (50+ seeded randomized A/B pairs, `A=B`, off-path block + `[R]` respawn + Point B arrival cycles).
   - **`test-e2e` & `audit-verify`:**
     - Update `e2e/journey.spec.ts`, `e2e/release.spec.ts`, and `e2e/golden/export-outpost-eastbench-c2.json` for `eva-astar-1.0.0`, and add an E2E test verifying the full loop (`Start Menu -> Visualizer -> See Thinking -> 3D Walk -> Off-Path Block & [R] Respawn -> Point B Arrival -> Return to Start Menu`). Keep `e2e/failures.spec.ts` 100% green!
     - Run and verify ALL gates:
       1. `npm run typecheck`
       2. `npm run lint`
       3. `npm test`
       4. `npm run sim`
       5. `cd algorithm && npm test`
       6. `cd marswalk/app && npm run build`
       7. `npm run build`
       8. `npm run validate-bundle`
       9. `npm run audit`
       10. `npm run audit:release`
       11. `npm run build:e2e && npm run e2e`
     - Write `docs/TEST_REPORT.md` with exact measured outputs and commit cleanly on branch `merge/integration` (do NOT push to `main`).
