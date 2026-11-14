# Audit Part — Dhani Sharma (UI Owner, `src/ui/*`)

**Scope:** Read-only audit of `src/ui/*`, UI tests, `scripts/data/texts/ui_captions.*`, and Dhani's specification in `algorithm/docs/team-tasks.md` against both the original brief and Step 4 full-loop requirements.

---

## 1. Git History & Authorship State

Checked across all local and remote branches (`merge/integration` @ `448c806`, `origin/main` @ `c28d295`, `codex/routing-base` @ `1a4bbf9`, `codex/routing-t02-*` through `codex/routing-t40-assembly-benchmark`, `remotes/gabryg07/main`):

- **Commits by Dhani Sharma (`dhanisharmadev`):** **0** (`git shortlog -sn --all`: `Ayush` 81, `Role C (integration)` 24, `Claude` 9, `Irene Plemic` 2, `Ayush Gahtori` 1; `git log --all --author="dhani" -i` and `--grep="dhani" -i` return empty).
- **Commits touching `src/ui/*` (`git log --all --stat -- src/ui`):** All 4 commits were authored by `Role C (integration)` on 2026-11-14 as minimal integration scaffolding:
  - `048fcf6` — `feat(app): minimal app shell, 3D placeholder, smoke tests, README` (`App.tsx`, `MapCanvas.tsx`, `app.css`)
  - `08def03` — `feat(ui): wire selection/hover sync to map, profile, 3D props and briefing; synthetic production banner` (added `Briefing.tsx`, `ElevationProfile.tsx`, updated `App.tsx`, `MapCanvas.tsx`, `app.css`)
  - `efa98c2` — `app: optional display-asset check (synthetic texture), stable data-testids, route-status data-status` (`App.tsx`)
  - `091c930` — `ui(map): scale by metres and draw rasters via one ImageData` (`MapCanvas.tsx`)
- `OWNERS.md` confirms `src/ui/` belongs to **Dhani** and explicitly notes `App.tsx`/`MapCanvas.tsx` are minimal stubs.

---

## 2. Current State of `src/ui/*`

All five files in `src/ui/` are functional, minimal, unstyled (or bare-CSS) placeholders wired to `useAppState()`, `useRouteRunner()`, and `useRegionLoader()`:

| File | Lines | Current Implementation | Missing / Stub Limitations |
| --- | --- | --- | --- |
| `src/ui/App.tsx` | 250 | Single-page shell: header (`MARS PATHFINDER`, `synthetic-badge`, `release-id`), production-synthetic alert, bundle loading/error alerts, left `.controls` panel (`start-preset` / `destination-preset` `<select>`, `pickMode` radio, `ROUTE_POLICIES` checkboxes, `Strict quality`, `Round trip`, `Calculate routes`/`Cancel`, `Layers` visibility checkboxes, `2D`/`3D` radio group), `.view` (`MapCanvas` or `TerrainSlot` -> `TerrainView`, `ElevationProfile`, `OptionalAssetsStatus`, `ContextImageryStatus`), `.results` (`route-status`, `route-message`, candidate radios + metrics + `explanation[]`, `Export JSON`, `Briefing`). | No start menu, no multi-step workflow, no opacity sliders/legends, no science captions/credits drawer, no live search visualizer, no arrival summary, no walkthrough HUD. |
| `src/ui/MapCanvas.tsx` | 139 | Plain `<canvas>` scaled uniformly in px/m (`MAX_MAP_PX = 900`, `MAX_PX_PER_CELL = 28`). Caches offscreen `ImageData` raster (`elevation` warm ramp, `quality` purple/orange/black, `exclusion` red, `slope > 25°` white tint); draws candidate polylines (selected `#00e5ff` 4px, stale `#9ab` dashed, unselected white 2px), yellow square POIs, yellow hover ring, green `S` / red `D` dots, `N ↑`, and `50 m` bar. Click converts px -> `LocalPoint`. | No zoom/pan, no Leaflet/map adapter, no orbital `texture` image display, no usable-region boundary mask, no click-validation error feedback, no opacity controls, no distinct exclusion-reason styling (`EXCLUSION` 1–4), no animated search frontier/nodes. |
| `src/ui/ElevationProfile.tsx` | 69 | Fixed `560×140` SVG `<polyline>` (`#00e5ff`) plotting `c.outbound.profile.distance_m` vs `elevation_m`, min/max labels, yellow hover `<circle>`, `onMouseMove`/`onMouseLeave`, and `<input type="range" aria-label="Inspect position along route">` synced to `selection.hover`. | No `qualityIntervals` overlay on profile, no return-leg profile tab/view, no error/gap state rendering, fixed SVG dimensions rather than responsive container sizing. |
| `src/ui/Briefing.tsx` | 48 | Renders `formatReleaseId(release)`, title/synthetic label, stale warning, selected candidate summary, 4 metric bullets (`horizontalDistance_m`/`surfaceDistance_m`, `ascent_m`/`descent_m`, `maxTerrainSlope_deg`/`maxAbsEdgeGrade_deg`, `unknownQualityLength_m`/`lowQualityLength_m`), `briefing-hover` text, and `manifest.limitations`. | No science destination details (`ui_captions.json`), no NASA/USGS source credits, no return-leg breakdown (`returnLeg` / `round-trip-incomplete`), no compact route figure/thumbnail for print, no print-optimized light layout beyond hiding controls. |
| `src/ui/app.css` | 20 | Basic dark styling (`#15110f` bg, `#eee` text), fixed `300px 1fr` CSS grid (`controls`, `view`, `results`), simple `@media print` hiding `.controls, .view, button`. | No responsive/mobile breakpoints, no focus-visible rings, no typography/spacing tokens, no panel collapse/drawer styles, no start-menu/HUD/modal styles. |

---

## 3. UI Smoke Test Verification & `data-testid` / Accessibility Constraints

### Standalone Smoke Test Run
Executed `npx vitest run tests/app.smoke.test.tsx tests/selectionSync.test.tsx`:
- **Result:** **2 test files passed (2), 8 tests passed (8)** (`tests/app.smoke.test.tsx`: 6 passed in 507 ms; `tests/selectionSync.test.tsx`: 2 passed in 1012 ms; total duration 5.17 s).

### Test Contracts Any UI Replacement Must Preserve (or Coordinate with Role C)
Across `tests/app.smoke.test.tsx`, `tests/selectionSync.test.tsx`, `tests/terrain3d.test.tsx`, `tests/appHelpers.tsx`, `e2e/fixtures.ts`, `e2e/journey.spec.ts`, `e2e/failures.spec.ts`, and `e2e/release.spec.ts`, tests directly query:

1. **`data-testid` hooks & `data-*` attributes:**
   - `release-id`, `synthetic-badge`, `synthetic-production-warning`, `bundle-error`
   - `start-preset`, `destination-preset` (`<select>` elements whose `<option>` values are POI IDs e.g. `syn-outpost`, `syn-east-bench`, `syn-sealed-basin`, `poi-p3`..`poi-p5`)
   - `calculate`, `cancel-route`, `stale`, `route-message`
   - `route-status` with `data-status` (`'idle' | 'running' | 'success' | 'no-path' | 'timeout' | 'data-error' | 'invalid-input' | 'cancelled'`)
   - `candidate-<candidateId>` (e.g. `candidate-c0`, `candidate-c1`, `candidate-c2`)
   - `map-canvas` with `data-selected-candidate` and `data-hover-index`
   - `terrain-view` with `data-selected-candidate` and `data-hover-index` (owned by `TerrainView`, passed from `App.tsx`)
   - `terrain-fallback` with `data-kind` (owned by `TerrainSlot`)
   - `profile` with `data-candidate-id` and `data-hover-index`
   - `briefing` with `data-candidate-id` and `data-hover-index`, plus `briefing-hover`
   - `export-json`
   - `imagery-status` (`data-status`) and `optional-assets-status` (`data-status`) — rendered by `ContextImageryStatus` and `OptionalAssetsStatus`

2. **Accessibility & text queries:**
   - `getByLabelText`: `'start preset'`, `'destination preset'`, `'slope'`, `'Round trip'`, `'2D'`, `'3D'`, `'Inspect position along route'`, `/Strict quality/`
   - `getByRole('radio', { name: /uncertainty-aware/ })` and `/feasible|aware/`
   - `getByRole('button', { name: 'Retry 3D' })`, `getByText('Export JSON')`
   - `@media print`: `briefing` remains visible while `calculate` (and `.controls`/`.view`/buttons) is hidden (`e2e/journey.spec.ts:44-47`).
   - **Important constraint for a Start Menu:** Existing unit and E2E tests expect `release-id`, `start-preset`, `destination-preset`, `calculate`, and `map-canvas` to be immediately present on initial render (`openApp()` in `e2e/fixtures.ts:40-43`, `renderRoutedApp()` in `tests/appHelpers.tsx:17-27`). Wrapping the planner behind a blocking Start Menu will break those tests unless either (a) the Start Menu is an optional/dismissible overlay or URL/prop-gated, or (b) Role C updates the test helpers/E2E specs alongside the flow change.

---

## 4. Gap Analysis vs. (a) Dhani's Original Task Brief (`algorithm/docs/team-tasks.md`, lines 159–311)

- **Already covered minimally by Role C's stubs:** local-metre 2D canvas, preset `<select>` + free map-click `pickMode`, single primary `Calculate routes` / `Cancel` button, `stale` warning on mission invalidation, 3-candidate list with metrics & `explanation[]`, shared `selectSelection` + hover sync across map/profile/3D/briefing, WebGL graceful fallback, JSON export, basic print hiding.
- **Missing vs. original brief:**
  1. **Visual system & responsive layout (lines 171–176, 283–285):** No typography scale, focus-visible styling, panel hierarchy, collapsible evidence/source drawer, or narrow-screen stacked/bottom-sheet layout; no long-label wrapping verification.
  2. **Useful empty state & fictional outpost framing (lines 177–180):** Empty state is just `'No route calculated yet.'` with no guidance on selecting a target, no dataset/outpost explanation, and no clear fictional-outpost badge.
  3. **2D Map capabilities (lines 181–198, 203–207, 227–230, 291):**
     - No pan/zoom or zoom-valid scale bar/orientation indicator (lines 187, 291).
     - No orbital imagery (`texture` display asset) underlay or layer opacity sliders (lines 189, 193).
     - No visible usable-region boundary or outside-region / invalid-cell click feedback preserving prior valid mission (lines 185, 207).
     - No requested-vs-accepted cell display (`EndpointResolution.requested` vs `.accepted`, line 205).
     - `exclusion` codes 1–4 all render identically red instead of distinguishing data limitations vs modeled limits (lines 37, 195).
     - No layer legends/units/resolutions, no route pattern/dash differentiation beyond color, and no grouping/labeling when multiple policies produce identical geometry (lines 189, 227, 229).
  4. **Science context, sources, and inline limitations (lines 199–201, 211, 261, 273–275):** Science stop purpose/observation/interpretation, panoramas, MEDA temperatures, NASA/USGS/JPL/ASU/MSSS source credits, and paired limitations are not surfaced in the UI (`ui_captions.json` is completely unused).
  5. **Result & failure completeness (lines 239–253, 265–271):** `ElevationProfile` lacks `qualityIntervals` and error/gap handling; `Briefing` omits `returnLeg` metrics and explicit `round-trip-incomplete` handling (line 251), omits print route image/fallback (line 267), and omits optional qualified time estimate (line 253, explicitly avoiding oxygen/survival gauges).

---

## 5. Gap Analysis vs. (b) User's Step 4 Full Loop Requirements

| Step 4 Stage | Current Status | Missing UI & Cross-Layer Gaps |
| --- | --- | --- |
| **1. Start Menu** | **Missing** | No title/start screen in `src/ui/*` (`App.tsx` opens straight into the planner). Requires a `viewPhase` / screen state (and coordination with existing tests expecting immediate planner mount). |
| **2. Point A / Point B Picker** | **Partial** | Presets `<select>` and `pickMode` canvas click exist, but lack a guided Point A -> Point B flow, rich science-stop cards (`P3`–`P5` + context sites `P1`, `P2`, `P6`–`P9` from `ui_captions.json`), invalid-click recovery message, and requested-vs-accepted cell indicator. |
| **3. Animated Pathfinding Visualizer + "See its thinking"** | **Missing (UI + Engine/Contract Gap)** | UI only shows `Calculating… (N cells explored)` (`App.tsx:222`). **Contract/Engine blocker:** `RouteProgress` (`src/contracts/route.ts:112-116`) only emits `{ phase, exploredNodes: number }` — neither `src/routing/placeholderEngine.ts` nor `algorithm/src/routing/` emits frontier/visited cell coordinates, step snapshots, or rejected-branch explanations during search. Live node-expansion playback and a "See its thinking" inspector require extending `RouteProgress` / `RouteCandidate` (or adding a search-trace payload) plus canvas/overlay playback controls (`respecting prefers-reduced-motion`). |
| **4. 3D Walkthrough (solid blue path, dotted rejected paths + explanation, center-screen `X` cross & `Respawn`)** | **Missing (UI + `TerrainViewProps` + Engine Gap)** | `src/terrain3d/TerrainView.tsx` is a Role B placeholder `<div>`; `src/ui/` has no walkthrough HUD. Missing: **(a) UI HUD overlay** for center-screen `X` crosshair reticle, `Respawn` button, and rejected-path explanation card/tooltip; **(b) `TerrainViewProps` extensions** for walkthrough/first-person mode, player pose/respawn trigger, and rejected-path arrays; **(c) Engine data** for rejected/alternative paths with rejection explanations (`solveRoute` currently returns only deduplicated winning `candidates`). |
| **5. Arrival at Point B Summary** | **Missing** | No arrival state/trigger or Point B arrival summary view combining traversal metrics, science-stop observation/interpretation/MEDA temp/panoramas (`ui_captions.json`), and briefing/export actions. |
| **6. Return to Start Menu** | **Missing** | No state transition or button to reset/return to the Start Menu (`src/state/store.ts` has no app-screen/loop state). |

---

## 6. Reusable Captions, Manifest Fields & State Contracts Already Present

- **`scripts/data/texts/ui_captions.json` (377 lines) & `ui_captions.md` (165 lines):** Ready-made EN/IT copy **not yet imported** anywhere in `src/`:
  - `layers` (`elevation`, `slope`, `roughness`, `quality`, `exclusion`, `texture` — `name`, `units`, `legend`)
  - `sources` (4 source bullets + `credits_line_en` / `credits_line_it`)
  - `limitations_short` (6 concise bullets)
  - `coarse_mode` (CTX 20 m disclaimer)
  - `destinations` (`P3`, `P4`, `P5` keyed by `bundle_poi_id`: `"poi-p3"`, `"poi-p4"`, `"poi-p5"`, including `terrain_here`, `air_temperature`, `panoramas`, `caption`, `observation`, `interpretation`, `proposed`, `briefing`)
  - `context_sites` (`P1`, `P2`, `P6`, `P7`, `P8`, `P9_optional`, marked `in_area: false`)
- **State & Contracts (`src/state/store.ts`, `src/contracts/route.ts`, `src/contracts/manifest.ts`):**
  - `useAppState()` / `selectSelection(state)` / `selectCanRequestRoute(state)` keep 2D, 3D, `ElevationProfile`, `Briefing`, and `serializeRouteExport` synchronized.
  - `RouteCandidate` already provides `policies`, `outbound` (`path`, `metrics`, `qualityIntervals`, `profile`), `returnLeg`, `missionStatus`, and `explanation: string[]`.
  - `RegionManifest` already provides `pointsOfInterest`, `displayAssets`, `sources`, `limitations`, `qualityClasses`, and `strictQualitySupported`.
