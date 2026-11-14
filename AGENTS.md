# Martian Pineapple — shared agent instructions

You are operating in the context of a wider project called Martian Pineapple. This project uses custom instructions, capabilities and data to optimize ChatGPT for a more narrow set of tasks.

## Current authorization and scope

The user requested planning files only. **Do not implement TASK-001 or any other task until implementation is requested.** Editing planning files does not start the implementation phase.

When implementation is authorized, follow TASKS.md. The available assignment covers the browser UI for a Mars educational mission planner in the team's shared React/TypeScript/Vite application. Route engine, scientific data preparation and 3D renderer internals belong to external owners. Do not invent their requirements or add authentication, databases, oxygen/resource models, deployment or VR locomotion.

The team ownership baseline is established in OWNERS.md and INTERFACE.md:
- **Role C (Integration)** owns shared contracts (`src/contracts/`), app state store (`src/state/`), bundle loading (`src/data/`), worker client/protocol (`src/worker/`), composition/3D slot (`src/app/`), export serialization (`src/export/`), integration tests (`tests/`), scripts, and root configuration (`package.json`, `vite.config.ts`, `tsconfig*.json`, `eslint.config.js`).
- **Ayush** owns routing solver algorithms (`src/routing/`).
- **Role B** owns the 3D renderer component (`src/terrain3d/`).
- **Role A** owns regional raster bundle production (`public/bundles/`).
- **Dhani (UI role)** owns the user interface under `src/ui/**`.

All UI implementation work must remain strictly inside `src/ui/**`. Reuse existing contracts, reducer, worker client, bundle loader, export serializer and 3D slot without duplicating or replacing them.

## Dependency and foundation gate

1. TASK-001 is the only prerequisite. No leaf may start until its executable foundation within `src/ui/**` is DONE and the `ui-foundation-v1` commit/tag is recorded in TASK_STATUS.md.
2. TASK-002–021 must be independently implementable and testable from that foundation with the other 19 leaves absent. No sibling imports, handoff dependencies, shared-file edits or waiting for another leaf.
3. Read your complete task, TASKS.md C1–C6, the ownership matrix and INTEGRATION.md. Work against the frozen contracts in `src/contracts/` and `INTERFACE.md`. Do not reinterpret a missing API by inventing a local substitute for shared state or scientific calculations.
4. If a shared contract or root configuration change is needed, report the concrete blocker in your handoff and mark your submitted status BLOCKED for Role C resolution; do not patch shared files outside `src/ui/**` from a UI branch.
5. Fixtures establish independent UI acceptance. They do not establish scientific validity or real-provider release readiness. Record external limitations distinctly.

## Ownership and branch rules

- Work on `task/TASK-XXX-<slug>` from the recorded foundation commit in an isolated checkout/worktree when Git is available. Do not create a second Git repository inside an existing one.
- A leaf may create/modify only `src/ui/features/<assigned-slug>/**` and `handoffs/TASK-XXX.md`, including co-located tests/styles/review evidence. The exact mapping is in TASKS.md.
- TASK-001 foundation owner creates/modifies only foundation files inside `src/ui/**` (outside leaf feature folders) and `handoffs/TASK-001.md`.
- Do not edit package manifests, lockfiles, app composition outside `src/ui/**`, shared contracts, root configs or files owned by Role C, Ayush, or Role B. Root configs belong to Role C. The coordinator owns the tracker and plan updates.
- Do not install additional packages from a leaf or foundation. Use existing dependencies (React 19, Vite, Vitest) and the existing Canvas map. Do not add Leaflet or other dependencies.
- Add your own fixed `entry.tsx` default export `{id,slot,Component}` under `src/ui/features/<assigned-slug>/entry.tsx`. Registration is automatic. Do not edit a central feature list or add sibling imports/barrels.
- Do not overwrite another contributor's changes, run destructive Git operations, or merge unrelated work. Handoffs contain your changed paths and base revision.

## Code and component conventions

- TypeScript strict mode; typed props/actions/services; avoid `any`, unchecked non-null assertions and mutation of shared inputs. Treat manifest/result objects as immutable.
- Import foundation public hooks/types/selectors through `src/ui/shared/**` or Role C's public modules (`src/contracts/index.ts`, `src/state/store.ts`, `src/state/context.ts`, `src/state/useRouteRunner.ts`). Internal leaf implementation files are private.
- Use the shared application store (`useAppState()`) for endpoints, assumptions, result, selected candidate, profile/map/3D focus, layers and request lifecycle. Only ephemeral form text/loading/disclosure state may be local.
- UI controls dispatch shared actions (`mission/setStart`, `mission/setDestination`, `mission/setPolicies`, `mission/setStrictQuality`, `mission/setRoundTrip`, `route/select`, `view/setMode`, `view/setLayer`, `view/hover`, etc.). Engine results/metrics are consumed, not recomputed or guessed.
- Components must handle initial, loading, empty, current, stale, partial, error and unavailable states relevant to their task. Rejected inputs and optional media/render failures preserve useful mission state.
- Keep the existing Canvas 2D map in `src/ui/MapCanvas.tsx`. Use the shared coordinate helpers (`cellCenter`, `pointToCell`) from `src/contracts/grid.ts`.
- Scope CSS with modules or scoped selectors. Use shared tokens/primitives and formatting. No global resets or arbitrary route offsets in feature code.
- Clean up every feature-owned canvas layer/draw callback, listener, timer, object URL and asynchronous callback. Superseded callbacks cannot apply stale data.
- **Preserve existing smoke-test hooks**: Retain all `data-testid` and ARIA attributes used by `tests/app.smoke.test.tsx`, `tests/selectionSync.test.tsx`, `tests/terrain3d.test.tsx`, and `scripts/smoke-preview.mjs` (`release-id`, `synthetic-badge`, `synthetic-production-warning`, `bundle-error`, `calculate`, `route-status`, `map-canvas`, `profile`, `briefing`, `terrain-view`, `stale`).

## Scientific and spatial honesty

- All UI planning coordinates/distances are local meters in the frozen frame: `east_m` (+east), `north_m` (+north). No `x`/`y`/`lat`/`lng` in shared contracts.
- Use manifest bounds/grid/cells exactly. No silent nearest-valid endpoint relocation, geographic geocoding, pixel nudges or hidden reprojection.
- Distinguish quality codes (0: NO_ELEVATION, 1: GOOD, 2: LOW, 3: UNKNOWN) and exclusion codes (0: NONE, 1: MISSING_ELEVATION, 2: UNSUPPORTED_DERIVATIVE, 3: OUTSIDE_EXTENT, 4: MANUAL). Quality is not a calibrated probability.
- Keep display-layer visibility separate from route constraints. Display changes do not recalculate or stale a route.
- Group equivalent policy geometry. Never offset lines to pretend distinct routes. Do not compare different weighted costs as a universal ranking or call a candidate safest without a supported qualification.
- Preserve policy-specific failures and round-trip completeness. Timeout is not proof of no path. An unavailable return leg cannot produce a seemingly complete round-trip total/time.
- Mark the outpost fictional and the product an educational simulation. Label fixture development data and retain `synthetic:true` in development exports. Production must not silently use synthetic defaults.
- Display supplied source/product/creator/distributor attribution accurately. Reconstructed views and rover imagery have different labels. Missing source data is a limitation to show, not a claim to invent.
- Optional time needs explicit speed/stop assumptions. No oxygen or survival gauges. No Quest button without implemented, detected support; ui-v1 supplies no such capability.

## Accessibility and responsive conventions

- Use semantic controls, associated labels, visible focus, non-color selection cues and persistent actionable errors. All essential mission operations must work without precise pointing or hover.
- Use the foundation drawer/dialog for focus handling, Escape and focus restoration. Do not write a parallel focus trap.
- Respect reduced motion. Do not rely on animation for information. Show contrast over bright and dark terrain.
- Verify at least 1440×900 and 390×844; test long names/warnings and wrapping units. Keep mission/map/selected result reachable without overlapping controls.
- Use supplied readable formatting in screen UI; JSON retains exact values. Print uses light backgrounds, flowing heights and no clipped controls.

## Verification and completion

TASK-001 must make UI verification executable before freeze using existing package scripts:

```sh
npm run typecheck
npm run lint
npm test -- src/ui/features/<slug>
npm test
npm run build
```

Any leaf isolation or ownership validation is run through UI-owned scripts (e.g. `node src/ui/scripts/check-isolation.mjs --task=TASK-XXX`) without modifying root `package.json`.

Write meaningful behavior checks for the task's risks; do not add tests merely duplicating implementation details. Test against the real foundation reducer/services/harness, with fake external inputs where appropriate. A disconnected feature demo is not acceptance evidence. If browser/runtime tools are unavailable, record the exact unrun check; never report it as passing.

Submit `handoffs/TASK-XXX.md` containing:

```md
# TASK-XXX handoff
Status: REVIEW | BLOCKED
Foundation revision: <actual full commit>
Branch/commit: <actual refs>
Changed paths: <complete list>
Entry/slot: <fixed public entry and slot>
Behavior delivered: <brief description>
Scenarios checked: <names>
Commands and results: <actual evidence; unrun checks identified>
Review evidence: <own screenshots or recordings, browser and viewport>
External limitations: <real-provider/data/device constraints>
Contract change requests: <none or concrete proposed change>
```

Allowed tracker statuses are TODO, IN_PROGRESS, BLOCKED, REVIEW, DONE. Only the coordinator edits TASK_STATUS.md; agents update their own handoffs and report status. REVIEW is a submission, not self-approved DONE. The reviewer confirms task criteria, isolation, ownership and evidence before the coordinator records DONE.

No leaf task performs release/deployment or messages other people. Integration and final acceptance follow INTEGRATION.md under the already-authorized scope; they are coordinator activities, not hidden leaf prerequisites.
