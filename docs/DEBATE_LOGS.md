# Mars Pathfinder Merge — Grok 4.7 Architectural Debate Logs (`merge/integration`)

All architectural and per-module design decisions on branch `merge/integration` were debated against `grok-4.7-high` via Cursor CLI (`agent -p --trust --mode ask`) using aggregated context in `docs/PROJECT_MASTER_CONTEXT.md`.

---

## Coordinator Debate — Merge Architecture & Invariant Reconciliation

### Round 1 — Initial Merge Blueprint Critique
- **Proposed Decision:**
  1. Freeze `src/state/`, `src/worker/`, `src/export/`, `src/app/`, `src/contracts/`, `src/data/`, `src/sim/`, and `src/config.ts`; replace `placeholderEngine.ts` routing in `src/routing/evaEngine.ts` (`MODEL_VERSION = 'eva-astar-1.0.0'`) with `{slope:2, roughness:1, quality:3}` uncertainty weights and 2-endpoint `worseQuality`, updating Wave 3 goldens/e2e strings and normalizing CRLF reads.
  2. Add lazy UI `src/routing/searchTrace.ts` computing wavefront frames, `"See its thinking"`, algorithm comparison, and 2–4 rejected dotted paths on the main thread.
  3. Port Gabriele's `marswalk` 3-ring GPU clipmap, 5 NASA layers (`CRISM shiftM [-180,204]`), 6 POIs, and Tobler/O2/RAD telemetry via pure-TS `coordBridge.ts` `(east_m - 586.81, 470.15 - north_m)` plus procedural `GridBundle` fallback.
  4. Gate 3D walkthrough safety (`> 22m` corridor or `> 20 deg` slope or excluded cell) -> center `X` block + `[R]` Respawn -> Point B arrival (`< 8m`) -> Return to Start Menu.
  5. Build Dhani's missing UI with docked `StartMenuModal`, `PathfindingVizPanel`, `MapCanvas`, and `App.tsx`.

- **Grok's Critique & Counter-suggestions (`docs/grok-critique-round1.tmp.txt`):**
  1. **Solver Parity & Quality Inversion Risk:** Pointed out `evaEngine` cannot be a 4th scratch rewrite (must port `marspineappleAdapter.ts` control flow directly), missed `|dz|/len <= tan(20°)` edge grade gate, missed `solveRoute(null)` -> `bundle-not-loaded` and `weightOverrides`, and flagged `Date.now` / `shouldStop` polling traps (`tests/sim/worker.sim.test.ts` advances `Date.now` 1 ms/call with `timeoutMs: 3`, requiring progress before timeout at `(explored & 511) === 0`). Crucially caught quality order inversion: `placeholderEngine.ts` uses `UNKNOWN = 1.0 > LOW = 0.5`, whereas `LOW = 1.0 > UNKNOWN = 0.75` would make `uncertainty-aware` prefer `UNKNOWN` over `LOW` (evading `uncertaintyNoWorse` on `flat-quality` fuzzing). Also noted `.gitattributes` should scope `tests/**/*.json` and `e2e/**/*.json` rather than all repo JSON.
  2. **Wavefront Drift & Entry Bundle Bloat:** Warned that re-running search in `searchTrace.ts` on the UI thread diverges from worker paths, freezes 1000×1000 HiRISE, makes sampled Dijkstra `optimalCostMatch` false, and pulls `evaEngine` into `entryJsGz` unless dynamically imported. Suggested recording capped frames directly on `RouteFinalResponse` inside the worker and gating Dijkstra under a hard cell cap.
  3. **Coordinate & Safety Traps:** Caught unconditional `localToVr2` breaking synthetic/CTX frames, `threeforks` vs `poi-p5` (41 m apart > 8 m arrival radius), `CRISM shiftM` belonging only on minerals texture, `gamma_eff = 0` collapsing HiRISE policies, exaggerated mesh slope falsely triggering `> 20°`, fixed `22 m` corridor trapping HiRISE centerlines or mismatched CTX (`19 m` cells), post-move block trapping users, pointer lock swallowing click Respawn, Three `WebGLRenderer` throwing/logging `console.error` in jsdom (`selectionSync.test.tsx` + `consoleGuard`), and `site.json` containing Italian strings.
  4. **Store Reset & UI Contracts:** Caught `invalidate()` retaining candidates (`clearRoutes` was private), `MapCanvas` props losing `layers`/`stale`, print CSS needing `calculate` inside `.controls`, and E2E candidate selection by policy label when HiRISE merges policies.

### Round 2 — Counter-Argument & Verified Refinements
- **Proposed Refinement:** Port `marspineappleAdapter.ts` directly with `UNKNOWN = 1.0 > LOW = 0.5 > GOOD = 0.0` (`uncertainty-aware` `{2, 1, 3}`), uniform 2-endpoint `worseQuality(u, v)`, `|dz|/len <= tan(20°)` grade gate, `(explored.n & 511) === 0` polling, optional `RouteSuccess.trace` (`<= 48` frames), dynamic-import lazy `PathfindingVizPanel` + `searchTrace.ts` (comparison capped `<= 100k` cells), parameterized `coordBridge.ts`, `bundle.elevation` single ground heightfield, pre-step safety gating, `getContext` pre-check before `THREE.WebGLRenderer`, English captions from `ui_captions.json`, and `{ type: 'mission/reset' }` in `src/state/store.ts`.

- **Grok's Round 2 Verdict (`docs/grok-critique-round2.tmp.txt`):**
  - Confirmed 2-endpoint `worseQuality(u, v)` + `{ GOOD: 0.0, LOW: 0.5, UNKNOWN: 1.0 }` + `{2, 1, 3}` satisfies `src/sim/invariants.ts` and `quality-patchwork`, and explicitly flagged the **`MAP_MARSPINEAPPLE_QUALITY_TO_INTERNAL` (`[3, 0, 2, 1]`) footgun** (`1 = UNKNOWN`, `2 = LOW`) plus all 3 call sites (`step cost`, `buildMarsLeg`, `pathHasZeroQualityPenalty`) and fixing `weightOverrides` so explicit `override.quality` is never zeroed.
  - Confirmed `RouteSuccess.trace?` passes `checkResponse`, `serializeRouteExport` whitelist, and deterministic `stripTiming` (no timestamps/randomness/functions), while requiring `sharedWorkspace` to remain lazily allocated so `src/config.ts` -> `src/routing` tree-shakes `solveRoute` out of `entryJsGz`.
  - Refined UI comparison rules: compare only selected policy (not 3 policies + return leg) under the cell cap (or note `100k` Dijkstra hitch), never print `optimalCostMatch`/ratio for inadmissible Greedy Best-First, use cell-size-proportional corridor tolerance instead of fixed `22 m`, rebind path cell sets when `selectedCandidateId` changes, bind `[R]` on `window`, cancel in-flight worker on `mission/reset`, and check `canvas.getContext` before `new THREE.WebGLRenderer` (preventing `console.error` before catch).
  - Highlighted `tests/realdata.test.ts` (`1.25x` HiRISE straight-line ratio with `20°` limit vs placeholder `25°`) for Wave 3 verification.

### Final Coordinator Decision (Prior to Round 3 PR #2 / `dhani/ui-integrated` Check)
Adopt all Grok Round 1 + Round 2 refinements verbatim into Section 5 of `docs/MERGE_PLAN.md` and proceed with Round 3 check on the newly surfaced PR #2 (`origin/pr-2`) and `origin/dhani/ui-integrated`.

---

### Round 3 — Reconciling PR #2 (`origin/pr-2`) & Dhani's `origin/dhani/ui-integrated` (`55d1565`)
- **Proposed Decision:**
  1. Integrate `origin/pr-2` (`1d43b30` — verified licences/credits/DOIs) and selectively check out `origin/dhani/ui-integrated` (`src/ui/shared/`, `src/ui/features/`, `App.tsx`, `MapCanvas.tsx`, `app.css`), restoring `4dfb88f` `data-testid`s (`OptionalAssetsStatus`, `start-preset`, `destination-preset`, `view-2d/3d`, `route-status[data-status]`, `route-message`, `candidate-*`, `export-json`), fixing 4 mock `GridBundle` test fixtures missing `manifestUrl`, and keeping heavy new UX panels lazily loaded.
- **Grok's Round 3 Critique (`docs/grok-critique-round3.tmp.txt`):**
  1. **Critical HiRISE `28000×28000` Canvas Blank Bug & Render Loop:** Caught that `MapCanvas.tsx` uses `PX_PER_CELL = 28`, yielding a `28000×28000` (`784M` px) canvas on `1000×1000` HiRISE — `getContext('2d')` returns `null` (blank map in Chromium while CSS `max-width` passes bounding-box tests!). Furthermore, `MapCanvas`'s `useEffect` has no dependency array, so `MapRasters` would re-fill 1,000,000 rectangles every React commit (`vizFrameIndex` playback would stall the UI thread).
  2. **`import.meta.glob` Eager Registry & Cycle Risk:** Confirmed `Slot.tsx -> registry.ts` runs `import.meta.glob('../features/*/entry.tsx', { eager: true })`, bundling all 10 discovered modules into `entryJsGz` (with an internal cycle through `shared/index.ts`). Warned against adding new `entry.tsx` modules for Start Menu / Visualizer / Arrival or importing `searchTrace`/`evaEngine`/`three` from any globbed file.
  3. **`MapRoutes` Overrides Fallback & Hidden Feature DOM:** Noted `customLayers.routes` replaces baseline route drawing (so wavefront/rejected paths must draw inside `MapRoutes.tsx` AND fallback), while React DOM inside map feature slots sits in `display: none; aria-hidden`.
  4. **Exact Testid & Policy Order Collisions:** Flagged `cancel-request` (`RequestControls.test.tsx`) vs `cancel-route`, `start-preset` vs `start-preset-dropdown` (and placeholder `'— choose —'` expected by `e2e/release.spec.ts`), `Assumptions.tsx` appending policies in click order instead of `ROUTE_POLICIES` order + misstating quality codes `2/3` as `OUTSIDE_EXTENT / MANUAL`, and `route-status` needing `data-status` on the `<p>` element itself rather than an inner `<span>`.
  5. **Store Reset Reminder:** Warned NOT to place a reset action into `INVALIDATING_ACTIONS` (keep `mission/reset` as an explicit non-invalidating reset branch in `store.ts` calling `clearRoutes(s)` cleanly).
- **Final Round 3 Decision:**
  Adopt all Round 3 fixes verbatim in Section 5 of `docs/MERGE_PLAN.md`: clamp `MapCanvas` backing resolution (`<= 1000×1000`), add offscreen terrain cache + explicit effect dependencies, draw overlays inside both `MapRoutes.tsx` and `MapCanvas.tsx`, keep StartMenu/Visualizer/Arrival out of `features/*/entry.tsx` (lazy-loaded via `React.lazy`), reconcile `4dfb88f` `data-testid`s accurately across `App.tsx` and Dhani's slot components (`start-preset`, `destination-preset`, keep `cancel-request` in `RequestControls`), fix `Assumptions.tsx` order & wording, and verify `npm run audit` budgets directly from the updated baseline.

---
