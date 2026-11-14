# TASK-004 handoff
Status: REVIEW
Foundation revision: 17fbf7191017058d82bc896084941f79719cb1d8 (tag: ui-foundation-v1)
Branch/commit: task/TASK-004-endpoints
Changed paths:
  - src/ui/features/endpoints/entry.tsx
  - src/ui/features/endpoints/EndpointsFeature.tsx
  - src/ui/features/endpoints/CoordinateForm.tsx
  - src/ui/features/endpoints/PickModeToggle.tsx
  - src/ui/features/endpoints/validation.ts
  - src/ui/features/endpoints/endpoints.module.css
  - src/ui/features/endpoints/endpoints.test.tsx
  - src/ui/features/endpoints/capture.mjs
  - src/ui/features/endpoints/screenshots/task-004-desktop-1440x900.png
  - src/ui/features/endpoints/screenshots/task-004-mobile-390x844.png
  - handoffs/TASK-004.md
Entry/slot: Fixed public entry `src/ui/features/endpoints/entry.tsx` registered into slot `endpoints`.

Behavior delivered:
1. Start and Destination coordinate forms:
   - Dedicated cards for Start (S) and Destination (D) endpoints accepting local planar meter coordinates (`east_m`, `north_m`).
   - Accessible numeric text inputs with `inputMode="decimal"`, helper text with valid extent intervals, and clear labels.
   - Enter-key submission and button submission with immediate validation.
2. Selection mode toggle (Map click target):
   - Semantic `<fieldset>` with radio buttons (`pickMode: 'start' | 'destination'`) and card action buttons ("Set as Map Target").
   - Distinct visual badges for Start (green 'S') and Destination (coral 'D') matching Canvas map markers.
   - Active map target badge on the currently selected endpoint card.
3. Honest cell-resolution and center-snapping feedback:
   - Displays requested coordinates vs accepted discrete cell center coordinates.
   - Displays cell grid coordinates: Row, Col, and flat cell index.
   - Calculates distance offset from cell center; shows "Aligned with cell center (0.00 m offset)" or offset distance.
   - Provides "Snap to Cell Center" button to automatically align coordinates with the grid cell center.
   - Explains scientific reality honestly: traversal solver evaluates terrain metrics at discrete raster cell centers.
4. Robust extent validation and graceful rejection:
   - Validates input against `GridSpec.extent` using `pointToCell` coordinate adapter.
   - Specific diagnostic messages for out-of-bounds coordinates (west, east, south, north).
   - Properly accounts for outer boundary edge exclusion (east and south outer edges are excluded per contract).
   - Graceful rejection: invalid inputs display clear, persistent, accessible error messages (`role="alert"`, `aria-invalid="true"`) without modifying endpoints or clearing prior valid state.
5. Quick actions & management:
   - "⇄ Swap Start & Destination" button to invert endpoints without retyping.
   - "Clear" button to unset an individual endpoint.
   - Preset indicator badge when an endpoint originated from a POI (`syn-outpost`, `syn-east-bench`).
6. Regional grid extent summary:
   - Shows grid dimensions, extent boundaries, and cell resolution.
7. Accessibility & responsive design:
   - 44px minimum touch targets on all interactive controls.
   - High-contrast text matching design tokens.
   - Verified at 1440×900 desktop and 390×844 mobile viewports.

Scenarios checked:
- Initial rendering in empty state (both endpoints unset).
- Pick mode toggle switching between Start and Destination via radio controls and card buttons.
- Valid coordinate input and submission for Start and Destination.
- Keyboard accessibility: Enter-key form submission.
- Empty coordinate input rejection with clear error message.
- Non-numeric input rejection.
- Out-of-bounds coordinate rejection for west, east, south, and north limits.
- Outer boundary edge exclusion validation.
- Preservation of previous valid endpoints upon invalid input submission.
- Snapped cell-center feedback computation (requested vs accepted vs offset).
- "Snap to Cell Center" action alignment.
- Preset badge display and clearing.
- Endpoint swapping action.
- Single feature isolation inside FeatureHarness (`feature={entry}`).
- Full App shell integration and slot replacement without regressions (`mountInApp={true}`).
- End-to-end regression testing across all 13 test files in the project.

Commands and results:
- `npm run typecheck`: PASS (0 errors across entire repository)
- `npm run lint`: PASS (0 errors, 0 warnings across entire repository)
- `npm test -- src/ui/features/endpoints`: PASS (22 passed tests)
- `node src/ui/scripts/check-isolation.mjs --task=TASK-004`: PASS (strictly isolated, no sibling imports, valid slot)
- `npm test`: PASS (13 test files, 116 passed tests)
- `npm run build`: PASS (built in 1.01s; production bundle initial entry gzip 86.49 KB within 150 KB budget)
- `npm run audit`: PASS (all gzip asset budgets satisfied)
- `node src/ui/features/endpoints/capture.mjs`: PASS (captured desktop 1440×900 and mobile 390×844 screenshots)
- Unrun checks: Physical mobile hardware and physical screen-reader devices (simulated via Playwright and Testing Library accessibility assertions).

Review evidence:
- Desktop (1440×900): `src/ui/features/endpoints/screenshots/task-004-desktop-1440x900.png`
- Mobile (390×844): `src/ui/features/endpoints/screenshots/task-004-mobile-390x844.png`

External limitations:
- Grid extent and cell sizes are determined by Role A's loaded region bundle (`synthetic-v0` during demo phase).
- Traversal routing solver (Ayush's placeholder engine) operates on cell centers; endpoints are resolved to containing cells.

Contract change requests:
- None. Implementation strictly adheres to existing contracts in `src/contracts/` and `src/ui/shared/`.
