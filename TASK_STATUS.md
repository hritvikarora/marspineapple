# Martian Pineapple — task progress tracker

Updated: 14 November 2026. Source audit completed on branch `dhani/ui-planning` at commit `7480107`.
Baseline established: `OWNERS.md` and `INTERFACE.md` govern team ownership and contracts.
UI role (Dhani) scope is restricted to `src/ui/**`, reusing Role C's existing contracts, state store, worker client, bundle loader, export serializer, and 3D slot.

Coordinator: Dhani (coordinator). Foundation owner: Dhani (UI foundation within `src/ui/**`).
Frozen foundation revision: `ui-foundation-v1` (implementation at `f74b45a4934a067d989068c7a10587e7e586794b`; user-approved demo acceptance).
Shared repository: `martian-pineapple-team` at `7480107`.
Current UI specification: 21 tasks (TASK-001 foundation + 20 independent leaf features).

## Status definitions and transition rules

| Status | Meaning | Transition condition |
| --- | --- | --- |
| TODO | Task has not started | Owner assigned and task authorized; leaves also require foundation DONE. |
| IN_PROGRESS | Assigned owner is actively implementing | Change to REVIEW when deliverables/checks are ready, or BLOCKED with a concrete reason. |
| BLOCKED | An explicit prerequisite/contract/tool issue prevents completion | Record the issue/owner in the task handoff; return to IN_PROGRESS after resolution. |
| REVIEW | Implementation submitted with evidence | Reviewer accepts to DONE or returns to IN_PROGRESS/BLOCKED with findings. |
| DONE | Reviewer accepted all task acceptance criteria and Definition of Done | Reopen only with recorded regression or a new foundation contract version. |

TASK-001 is DONE under user-approved local demo acceptance. All 20 leaves (TASK-002 through TASK-021) can now branch from `ui-foundation-v1` concurrently. The coordinator alone updates this shared file from agents' task-specific handoffs.

## Task tracker

| ID | Title | Dependency | Status | Owner | Evidence / blocking note |
| --- | --- | --- | --- | --- | --- |
| TASK-001 | Reconcile and deliver working UI foundation in `src/ui/**` | None | DONE | Dhani | User-approved for local demo development. Implementation verified at `f74b45a4934a067d989068c7a10587e7e586794b`. Automated single-leaf disposable worktree execution and physical device/screen-reader testing deferred as non-blocking for demo; explicit Git diff and import review required during leaf reviews. |
| TASK-002 | Mission context and initial guidance (`src/ui/features/mission-context`) | TASK-001 only | TODO | — | `handoffs/TASK-002.md` not yet created. |
| TASK-003 | Science destination selector (`src/ui/features/destinations`) | TASK-001 only | REVIEW | Dhani | Implementation verified; all tests pass; submitted for review in `handoffs/TASK-003.md`. |
| TASK-004 | Endpoint forms and selection modes (`src/ui/features/endpoints`) | TASK-001 only | TODO | — | `handoffs/TASK-004.md` not yet created. |
| TASK-005 | Supported mission assumptions (`src/ui/features/assumptions`) | TASK-001 only | REVIEW | Dhani | Implementation verified; all tests pass; submitted for review in `handoffs/TASK-005.md`. |
| TASK-006 | Calculate, cancel and request feedback (`src/ui/features/request-controls`) | TASK-001 only | TODO | — | `handoffs/TASK-006.md` not yet created. |
| TASK-007 | Map boundary, orientation and meter scale (`src/ui/features/map-chrome`) | TASK-001 only | TODO | — | `handoffs/TASK-007.md` not yet created. |
| TASK-008 | Registered terrain raster layers (`src/ui/features/map-rasters`) | TASK-001 only | TODO | — | `handoffs/TASK-008.md` not yet created. |
| TASK-009 | Layer controls and legends (`src/ui/features/layer-controls`) | TASK-001 only | TODO | — | `handoffs/TASK-009.md` not yet created. |
| TASK-010 | Mission and science map markers (`src/ui/features/map-markers`) | TASK-001 only | TODO | — | `handoffs/TASK-010.md` not yet created. |
| TASK-011 | Candidate route map overlays (`src/ui/features/map-routes`) | TASK-001 only | TODO | — | `handoffs/TASK-011.md` not yet created. |
| TASK-012 | Route comparison and selection (`src/ui/features/comparison`) | TASK-001 only | TODO | — | `handoffs/TASK-012.md` not yet created. |
| TASK-013 | Linked elevation profile (`src/ui/features/profile`) | TASK-001 only | TODO | — | `handoffs/TASK-013.md` not yet created. |
| TASK-014 | Selected mission evidence and completeness (`src/ui/features/mission-evidence`) | TASK-001 only | TODO | — | `handoffs/TASK-014.md` not yet created. |
| TASK-015 | Planning failures and recovery guidance (`src/ui/features/result-state`) | TASK-001 only | TODO | — | `handoffs/TASK-015.md` not yet created. |
| TASK-016 | External 3D view host and fallback (`src/ui/features/terrain-host`) | TASK-001 only | TODO | — | `handoffs/TASK-016.md` not yet created. |
| TASK-017 | Fixed-viewpoint and panorama media panel (`src/ui/features/media`) | TASK-001 only | TODO | — | `handoffs/TASK-017.md` not yet created. External blocker: `RegionManifest` currently lacks rover telemetry/panorama orientation schemas. |
| TASK-018 | Provenance and source drawer (`src/ui/features/sources`) | TASK-001 only | TODO | — | `handoffs/TASK-018.md` not yet created. External limitation: `SourceRecord` schema lacks resolution/processing fields. |
| TASK-019 | Printable mission briefing (`src/ui/features/briefing`) | TASK-001 only | TODO | — | `handoffs/TASK-019.md` not yet created. |
| TASK-020 | Reproducibility JSON download (`src/ui/features/json-export`) | TASK-001 only | TODO | — | `handoffs/TASK-020.md` not yet created. |
| TASK-021 | Point terrain evidence inspector (`src/ui/features/point-inspector`) | TASK-001 only | TODO | — | `handoffs/TASK-021.md` not yet created. |

## Foundation and external-input readiness

| Gate / input | Current evidence | Required before |
| --- | --- | --- |
| Actual source audit | Audited on branch `dhani/ui-planning` (`7480107`); Node 26 / npm 11; React 19 + TypeScript + Vite | Foundation freeze |
| Frozen UI contracts and external adapter seams | Contracts frozen in `src/contracts/` and `INTERFACE.md`; UI boundary reconciled in TASKS.md | Foundation freeze |
| Working UI shell/map/store/harness | Implemented and verified in TASK-001; user-approved for demo development; automated disposable-tree isolation and physical accessibility deferred | Any leaf implementation (UNBLOCKED for demo) |
| Leaf isolation & ownership automation | Static dependency, diff, and import rules implemented in `check-isolation.mjs`; automated disposable-tree runner deferred. Required: explicit Git diff and import review on every leaf | Leaf integration / hardening |
| Physical accessibility & screen readers | Automated a11y, visible focus, ARIA, and touch target checks pass; physical hardware and screen reader verification deferred | Release readiness |
| Existing integration test compliance | All smoke test hooks (`data-testid`, ARIA labels) mapped and preserved | Foundation freeze |
| Real region bundle, sources and versions | Not yet supplied by Role A (`synthetic-v0` fixture in use) | Real-data acceptance / release |
| Real route worker/service | Ayush's placeholder solver active in `src/routing/` | Real-route acceptance / release |
| External 3D terrain renderer | Role B's stub active in `src/terrain3d/`; WebGL probe and error fallback work | 3D feature completion |
| Supplied fixed-viewpoint / panorama assets | Schema limited in `RegionManifest.displayAssets`; assets not yet supplied by Role A | TASK-017 completion |
| Full assembled workflow acceptance | Evaluated via existing `tests/app.smoke.test.tsx` and `scripts/smoke-preview.mjs` | Release readiness |

## Change log

| Date | Change | Result |
| --- | --- | --- |
| 2026-11-14 | Initial planning files created | 21 TODO; 0 IN_PROGRESS; 0 BLOCKED; 0 REVIEW; 0 DONE. |
| 2026-11-14 | Reconciled planning files with actual repository: aligned with `OWNERS.md` and `INTERFACE.md`, restricted UI scope to `src/ui/**`, retained Canvas map, mapped existing contracts/reducer, updated verification scripts to use existing package commands | 21 TODO; 0 IN_PROGRESS; 0 BLOCKED; 0 REVIEW; 0 DONE. |
| 2026-11-14 | TASK-001 accepted for local demo development by user; isolation-tooling and physical accessibility verification gaps recorded as deferred work; explicit Git diff and import reviews required during leaf reviews; tagged ui-foundation-v1 | 1 DONE; 20 TODO; leaves unblocked for parallel development. |

When changing a status, record the actual owner, revision and evidence link. Do not infer completion from file existence, fixtures, a screenshot or another agent's statement alone. If a contract amendment reopens TASK-001, record the revised base and revalidation needs before allowing further leaf work.
