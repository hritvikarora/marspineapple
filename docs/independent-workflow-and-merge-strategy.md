# MARS PATHFINDER — Independent Development, Token Discipline & Clean Merge Strategy

This document defines how we build, verify, and integrate **Ayush's routing assignment (`src/routing/`)** without duplicating other teammates' work, while aligning on **one canonical contract location (`src/contracts/`)** and **one canonical fixture location (`tests/fixtures/`)** so Gate G0 starts with zero self-contradiction.

---

## 1. Ownership Boundaries & Gate G0 Coordination

Per [project-plan.md](project-plan.md#L179-L198) and [team-tasks.md](team-tasks.md#L141), each contributor owns a dedicated slice of the repository:

| Directory / File | Primary Owner | Our Approach (Ayush) |
| :--- | :--- | :--- |
| **`src/routing/**`** | **Ayush** | Full implementation of A* + Dijkstra solver, binary heap, admissibility/cost model, metrics, explanations, and Web Worker |
| **`src/contracts/**` & `src/coordinates/**`** | Open Role C (Integration) + Ayush Proposal | At Gate G0 (first 45 minutes), if Open Role C is not yet claimed, land the initial routing & grid schemas here directly and expose them through `src/routing/types.ts` so internal routing modules have a single import boundary |
| **`tests/fixtures/**`** | Shared Synthetic Examples | Single canonical location for the 12 hand-computable synthetic fixtures (`F01`–`F12`), including the derived inclined plane and multi-column ridge |
| **`docs/**`** | Shared Specifications | Keep all routing docs (`maths.md`, `admissibility-and-cost-model.md`, `search-and-worker-execution.md`, `metrics-and-explanations.md`, `verification-and-handoff.md`, `efficiency.md`) synchronized |
| `src/features/mission/**`, `map/**`, `briefing/**` | Dhani (UI) | Do not write UI/Leaflet/briefing components |
| `src/features/terrain/**` | Open Role B (3D) | Do not write Three.js components |
| `scripts/preprocess/**`, `public/regions/**` | Open Role A (Data/GIS) | Do not write Python/GDAL download pipelines; consume the shared bundle schema |
| `src/app/**`, `src/data/**`, `tests/e2e/**` | Open Role C (Integration) | Coordinate worker client boundary (`src/routing/index.ts`) |

---

## 2. Zero External Runtime Dependencies in `src/routing/`

Every data structure and API needed by `src/routing/` is built into standard TypeScript and browser/Node globals:
- TypedArrays: `Float32Array`, `Float64Array`, `Int32Array`, `Uint32Array`, `Uint8Array`
- Math & Timing: `Math.sqrt`, `Math.atan`, `Math.tan`, `Math.floor`, `performance.now`
- Concurrency: `Worker`, `MessageChannel`, `Promise`

Because `src/routing/` requires **zero third-party runtime npm packages**, it adds no runtime dependency churn to `package.json`.

---

## 3. Single Adapter Boundary (`src/routing/types.ts`)

All internal files inside `src/routing/` import shared contract and coordinate types through `src/routing/types.ts` (which re-exports from `src/contracts/` and `src/coordinates/`):

```text
[src/contracts/ & src/coordinates/]
                 │
                 ▼
      [src/routing/types.ts]
                 │
  ┌──────────────┼──────────────┬──────────────┐
  ▼              ▼              ▼              ▼
[admissibility] [solver.ts]  [metrics.ts]  [route.worker.ts]
```

If a field name in `src/contracts/` evolves during integration with Dhani or Open Role C, we adapt it in `src/routing/types.ts` rather than editing every internal solver file.

---

## 4. Module Layout & Headless Verification Without Browser or Live Data

By separating the pure TypeScript `RoutingEngine` from the thin Web Worker transport wrapper, we can run all unit tests and synthetic fixtures directly in Node/Vitest without spinning up a browser, Leaflet map, Three.js scene, or live NASA download:

```text
src/
├── contracts/
│   └── routing.ts            # Canonical RouteRequest, RouteResponse, RegionRoutingBundle schemas
├── coordinates/
│   └── grid.ts               # Canonical local meter <-> (row, col, index) conversions
└── routing/
    ├── index.ts              # Public entry point for UI & Integration
    ├── types.ts              # Re-exports & internal solver workspace types
    ├── profiles.ts           # 'educational-eva-v1', 15°, and 25° profile definitions
    ├── derivatives.ts        # 3x3 Horn slope & plane-fit RMS roughness (shared with fixtures)
    ├── admissibility.ts      # Cell/edge exclusions, FOM mapping, lazy component labeling
    ├── binaryHeap.ts         # Indexed binary min-heap + 4-level deterministic tie-breaker
    ├── solver.ts             # A* engine + reference Dijkstra oracle
    ├── metrics.ts            # Distances, ascent/descent, profile, RLE quality intervals
    ├── explanations.ts       # Deterministic templates covering all 5 policy grouping cases
    ├── engine.ts             # Stateful RoutingEngine (bundle validation, policy ordering)
    ├── route.worker.ts       # Thin Web Worker message wrapper (copies bundle, checks requestId)
    └── routeClient.ts        # Promise-based client with in-process fallback
tests/
├── fixtures/
│   └── routingFixtures.ts    # Canonical F01–F12 synthetic fixtures & inclined plane generator
└── routing/
    ├── routing.test.ts       # Automated verification of F01–F12 + Dijkstra oracle checks
    └── benchmark.test.ts     # Measured solve times on the current machine
```

---

## 5. Safe Git & Root Config Rules

1. **Never Delete Shared Root Files (`package.json`, `tsconfig.json`) Before Merging:**
   Deleting a temporary `package.json` on a feature branch before merging into `main` would record a file deletion in Git and delete the integration owner's `package.json`! Instead, initialize the minimal Gate G0 `package.json` and `tsconfig.json` once as the shared base commit (or branch directly from Role C's Gate G0 commit).
2. **Work on `codex/routing` and Merge at Gates:**
   Follow the gate sequence in [project-plan.md](project-plan.md#L414-L424) (`G0` contract freeze $\to$ `G2` walking skeleton on fixture $\to$ `G3` real bundle integration).
