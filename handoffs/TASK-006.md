# TASK-006 handoff
Status: REVIEW
Foundation revision: 17fbf7191017058d82bc896084941f79719cb1d8 (tag: ui-foundation-v1)
Branch/commit: task/TASK-006-request-controls (implementation commit 2f443c0)
Changed paths:
  - src/ui/features/request-controls/entry.tsx
  - src/ui/features/request-controls/RequestControls.tsx
  - src/ui/features/request-controls/request-controls.css
  - src/ui/features/request-controls/RequestControls.test.tsx
  - handoffs/TASK-006.md
Entry/slot: `src/ui/features/request-controls/entry.tsx` targeting slot `'request-controls'`.

Behavior delivered:
1. Primary Calculate Trigger & Smoke-Test Hook:
   - Implements main action button with mandatory smoke test hook `data-testid="calculate"`.
   - Dynamic label: "Calculate Traverse" (0 candidates), "Recalculate Traverse" (>0 candidates), or "Calculating..." (while solving).
   - Properly disabled when `!canRequest || isRunning` with accessible tooltip/title explaining reason.
2. Responsive Request Cancellation:
   - When calculation is active (`isRunning: true`), surfaces a prominent Cancel button (`data-testid="cancel-request"`).
   - Calling Cancel triggers `cancelRoute()` immediately to abort solver worker execution.
3. Accessible Progress Indication:
   - Includes live progress alert (`role="status"`, `aria-live="polite"`, `data-testid="solving-progress"`) with visual spinner.
   - Accurately conveys solving state without misleading completion estimates.

Scenarios checked:
- Valid FeatureModule contract and entry discovery.
- Calculate button renders with `data-testid="calculate"`.
- Clicking calculate invokes `requestRoute`.
- Disabled state and reason display when `canRequest` is false.
- Cancel button visibility and cancellation invocation during calculation.
- Dynamic button text for initial vs recalculate states.
- Strict isolation check and diff check against `ui-foundation-v1`.

Commands and results:
- `npm run typecheck`: PASS (0 errors, strict TypeScript mode)
- `npm run lint`: PASS (0 errors, 0 warnings)
- `npm test -- src/ui/features/request-controls`: PASS (7 tests passed)
- `node src/ui/scripts/check-isolation.mjs --task=TASK-006`: PASS (`[PASS] request-controls is strictly isolated`)
- `node src/ui/scripts/check-isolation.mjs --task=TASK-006 --diff --base=ui-foundation-v1`: PASS (`✓ Ownership diff verified for TASK-006: touched files strictly allowed`)
- `npm run build`: PASS (Production build succeeded in 196ms)

Review evidence:
- Unit & integration tests in `src/ui/features/request-controls/RequestControls.test.tsx`.

External limitations:
- Solver execution time depends on Ayush's solver engine.

Contract change requests:
- None.
