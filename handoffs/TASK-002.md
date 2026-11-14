# TASK-002 handoff
Status: REVIEW
Foundation revision: 17fbf7191017058d82bc896084941f79719cb1d8 (tag: ui-foundation-v1)
Branch/commit: task/TASK-002-mission-context
Changed paths:
  - src/ui/features/mission-context/entry.tsx
  - src/ui/features/mission-context/MissionContext.tsx
  - src/ui/features/mission-context/nextAction.ts
  - src/ui/features/mission-context/mission-context.css
  - src/ui/features/mission-context/MissionContext.test.tsx
  - handoffs/TASK-002.md
Entry/slot: `src/ui/features/mission-context/entry.tsx` targeting slot `'mission-context'`.

Behavior delivered:
1. Region Title and Educational Simulation Disclaimer:
   - Displays region title and description clearly from `manifest`.
   - Prominently displays the required educational simulation disclaimer (`role="note"`, `data-testid="mission-context-simulation-disclaimer"`): clarifies that the planner models theoretical rover traversability for educational inquiry and is not an operational navigation tool or life-support/safety assessment.
2. Synthetic Test Fixture and Production Warning:
   - When `manifest.synthetic` is true, displays a distinct "Synthetic Fixture" badge and callout warning (`data-testid="mission-context-synthetic-warning"`): explains that the terrain grid is artificial test data for development and algorithm verification, not real Mars planetary observations.
   - When `production` is true and `manifest.synthetic` is true, surfaces an alert (`data-testid="mission-context-production-warning"`).
   - If `manifest.synthetic` is false, synthetic fixture warnings are suppressed.
3. Fictional Outpost Context:
   - Identifies and explicitly labels mission start points and outposts as fictional constructs (`data-testid="mission-context-fictional-outpost"`).
   - Lists outposts from `manifest.pointsOfInterest` (filtered to `kind: 'outpost'`) with their stated educational purpose.
4. Dynamic Next Action and 5-Step Planning Workflow:
   - Dynamically evaluates application state via `useAppState()` to display the immediate next planning action (`data-testid="mission-context-next-step"`):
     - Step 1 (Start unset): "Choose Mission Start Location"
     - Step 2 (Destination unset): "Select Science Destination"
     - Step 3 (Policies empty): "Select Routing Policies"
     - Step 4 (Ready / Idle): "Calculate Traverse"
     - Step 4 (Solving): "Solving Traverse... (explored N nodes)"
     - Step 5 (Finished success): "Review Candidate Routes"
     - Step 4 (Stale inputs): "Update Traverse (Inputs Changed)"
     - Step 4 (No-path / Timeout / Invalid): Actionable failure recovery guidance.
   - Accessible workflow progress tracker (`<ol className="workflow-progress-list">`) showing active and completed steps.
5. Collapsible Region & Terrain Details:
   - `<details className="mission-region-details">` containing structured technical specifications: grid width/height, cell resolution (e.g. 10m x 10m), planar meter extent bounds (`east_m`, `north_m`), vertical datum, dataset release version, and documented limitations.
6. Text Wrapping and Responsive Styling:
   - Scoped styles in `src/ui/features/mission-context/mission-context.css` using shared design tokens.
   - Explicit `overflow-wrap: break-word`, `word-break: break-word`, and `hyphens: auto` preventing horizontal overflow on both 1440x900 desktop and 390x844 mobile viewports, even with 300+ character continuous unbroken titles or descriptions.
7. Graceful Degradation & Resilience:
   - Renders safely with null or missing manifest without throwing errors.
   - Safe fallback when rendered outside `AppStateProvider`.

Scenarios checked:
- Feature entry discovery and slot registration validation (`check-isolation.mjs`).
- Region title and educational simulation disclaimer rendering (`MissionContext.test.tsx`).
- Synthetic fixture badge and disclaimer rendering when synthetic=true; absence when synthetic=false.
- Production alert rendering when production=true and synthetic=true.
- Fictional outpost labeling with and without explicit outpost POIs.
- Dynamic next action calculation across all 8 mission lifecycles (start missing, destination missing, policies missing, ready to calculate, running, completed, stale, no-path/timeout/invalid-input).
- Long unbroken string text wrapping (desktop 1440x900 and mobile 390x844).
- Collapsible region details table and limitations disclosure.
- Isolation mounting in `FeatureHarness` directly and via `mountInApp` with all other 19 leaf features absent.
- Full application smoke journey and store synchronization regression testing (`tests/app.smoke.test.tsx`, `tests/selectionSync.test.tsx`, `tests/terrain3d.test.tsx`).

Commands and results:
- `npm run typecheck`: Passed with 0 errors (`tsc -b --noEmit`).
- `npm run lint`: Passed with 0 warnings and 0 errors (`eslint .`).
- `npm test -- src/ui/features/mission-context`: Passed (1 test file, 22 tests passed).
- `npm test`: Passed (13 test files, 116 tests passed).
- `npm run build`: Passed with 0 errors (built in ~500ms; bundle budgets within limits).
- `npm run audit`: Passed (Content and asset budget audit passed; raw JS 267.5 KB, gz 82.6 KB).
- `node src/ui/scripts/check-isolation.mjs --task=TASK-002`: Passed (`[PASS] mission-context is strictly isolated`).
- `node src/ui/scripts/check-isolation.mjs --task=TASK-002 --diff --base=ui-foundation-v1`: Passed (`✓ Ownership diff verified for TASK-002: touched files strictly allowed`).
- `npm run smoke`: Unrun due to missing Chrome binary in host environment (`No Chrome/Chromium found; set CHROME_PATH.`).

Review evidence:
- Automated component and integration test suite (`src/ui/features/mission-context/MissionContext.test.tsx`) validates responsive behavior, accessible elements, and DOM output.
- Playwright/Puppeteer browser screenshots (`scripts/smoke-preview.mjs`, `capture-viewports.mjs`) could not run because no Chrome or Chromium binary is installed in this test container/sandbox.

External limitations:
- Region data is currently synthetic fixture (`synthetic-v0`) pending real Mars observational bundles from Role A.
- Solver engine is Ayush's placeholder solver pending complete route worker engine.
- Chrome/Chromium browser binary unavailable in current execution container; automated browser screenshot generation deferred.

Contract change requests:
- None. Frozen contracts in `src/contracts/` and `src/state/` were completely sufficient.
