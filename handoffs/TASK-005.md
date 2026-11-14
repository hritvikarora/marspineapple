# TASK-005 handoff
Status: REVIEW
Foundation revision: 17fbf7191017058d82bc896084941f79719cb1d8 (tag: ui-foundation-v1)
Branch/commit: task/TASK-005-assumptions (implementation commit c60b43d)
Changed paths:
  - src/ui/features/assumptions/entry.tsx
  - src/ui/features/assumptions/Assumptions.tsx
  - src/ui/features/assumptions/assumptions.css
  - src/ui/features/assumptions/Assumptions.test.tsx
  - handoffs/TASK-005.md
Entry/slot: `src/ui/features/assumptions/entry.tsx` targeting slot `'assumptions'`.

Behavior delivered:
1. Supported Routing Policy Toggles:
   - Renders semantic checkboxes for all three supported policies: `'shortest-feasible'`, `'terrain-aware'`, and `'uncertainty-aware'`.
   - Dispatches `mission/setPolicies` with the selected subset of policies.
   - Shows actionable validation warning if all policies are deselected.
2. Strict Quality Exclusion:
   - Toggles strict data quality exclusion (`dispatch({ type: 'mission/setStrictQuality', value })`).
   - Explains that under strict mode, low-quality (2) and unknown (3) elevation cells are treated as impassable barriers rather than cost penalties.
   - Respects `strictQualitySupported` flag, gracefully disabling the checkbox and displaying an explanatory note when unsupported.
3. Round-Trip Exploration:
   - Toggles round-trip requirement (`dispatch({ type: 'mission/setRoundTrip', value })`).
   - Clearly explains that solving will require finding both an outbound path and a return traverse to the starting location.
4. Scientific Honesty & Clean Scope:
   - Strictly avoids inventing unsupported physics, oxygen models, life-support gauges, or battery level meters.
   - All input controls have min 44px touch targets and visible focus indicators.

Scenarios checked:
- Feature module registration and entry contract.
- Rendering all 3 supported policies with accurate descriptions.
- Adding and removing policies dispatches `mission/setPolicies`.
- Zero-policy warning banner.
- Strict quality toggle dispatches `mission/setStrictQuality`.
- Disabled state when `strictQualitySupported` is false.
- Round-trip toggle dispatches `mission/setRoundTrip`.
- Absence of fictitious survival/oxygen gauges.
- Strict isolation check and diff check against `ui-foundation-v1`.

Commands and results:
- `npm run typecheck`: PASS (0 errors, strict TypeScript mode)
- `npm run lint`: PASS (0 errors, 0 warnings)
- `npm test -- src/ui/features/assumptions`: PASS (9 tests passed)
- `node src/ui/scripts/check-isolation.mjs --task=TASK-005`: PASS (`[PASS] assumptions is strictly isolated`)
- `node src/ui/scripts/check-isolation.mjs --task=TASK-005 --diff --base=ui-foundation-v1`: PASS (`✓ Ownership diff verified for TASK-005: touched files strictly allowed`)
- `npm run build`: PASS (Production build succeeded in 205ms)

Review evidence:
- Unit & integration tests in `src/ui/features/assumptions/Assumptions.test.tsx`.

External limitations:
- Solver capabilities (e.g. strict quality enforcement) depend on Ayush's solver engine in `src/routing/`.

Contract change requests:
- None.
