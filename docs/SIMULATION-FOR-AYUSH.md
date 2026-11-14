# Simulation suite — note for Ayush (routing owner)

The simulation tests run against **whatever `src/routing/index.ts` exports** (`solveRoute`, `MODEL_VERSION`).
When you swap the placeholder for your solver there, `npm test` runs every invariant against it with no test changes.

To try a solver module side by side without touching `src/routing`:

```bash
SIM_ENGINE=src/routing/mySolver.ts npm run sim        # summary table + invariant check
SIM_ENGINE=src/routing/mySolver.ts npm run sim:test   # full simulation tests (goldens skipped)
```

The module must export `solveRoute(grid: RoutingGrid, request: RouteRequest, hooks?: SolveHooks): RouteFinalResponse`
and `MODEL_VERSION`. `hooks.shouldStop()` / `hooks.onProgress()` are how the worker enforces cancel and the soft time budget.

**Your solver must satisfy (solver-independent, `src/sim/invariants.ts` + `tests/sim/expectations.ts`):**

- paths are 8-neighbour cell sequences from the start cell to the destination cell, no revisits, no corner cutting
  past invalid cells; only cells with exclusion 0, finite elevation/slope/roughness and quality ≠ 0;
- endpoints snap to the containing cell's centre (west/north outer edges are inside, east/south are outside);
- metrics must match the path (distance, ascent/descent, exposure lengths/percentages, quality intervals, profile);
- `weightedCost.value` ≥ straight-line distance between the accepted endpoints (cost per metre ≥ 1);
- strict mode never uses unknown-quality cells; `no-path` reason `strict-quality-disconnects` when only strictness disconnects;
- on flat terrain: success ⇔ connected, and shortest-feasible length ≤ the 8-neighbour optimum;
- uncertainty-aware never crosses more unknown-quality metres than shortest-feasible on flat good/unknown terrain
  (hint: use the same edge-quality rule in the cost as in the metrics — see INTERFACE §9 item 4);
- deterministic: identical output for identical input (except `computeMs`);
- invalid input → `invalid-input` with the documented reason/field (outside, excluded, strict-unknown, no policies,
  version/model mismatch, strict unsupported).

Your own limits may reject more endpoints/cells than the data does (e.g. a slope limit): the expectations allow that on
non-flat terrain. The 512×512 perf budget defaults to 8 s for three policies (`SIM_PERF_BUDGET_MS`); the placeholder
takes ~0.15–0.3 s. After intentional changes run `npm run sim:update-golden`, `npm run examples` and
`npm run e2e:update-golden`, and bump `MODEL_VERSION`.
