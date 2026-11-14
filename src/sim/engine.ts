/**
 * Pluggable "engine under test" for the simulation suite. OWNER: Role C.
 *
 * Any solver that keeps the worker contract can be dropped in:
 *   solve(grid, request, hooks?) => RouteFinalResponse   (same signature the worker handler calls)
 * By default the suite tests whatever src/routing exports — so when Ayush replaces the placeholder
 * there, every invariant runs against the real solver with no test changes.
 */
import type { RouteFinalResponse, RouteRequest } from '../contracts';
import type { RoutingGrid } from '../routing';
import type { SolveHooks } from '../routing/placeholderEngine';

export interface RouteEngine {
  name: string;
  modelVersion: string;
  solve(grid: RoutingGrid, request: RouteRequest, hooks?: SolveHooks): RouteFinalResponse;
}

/** Shape a candidate module must export (`SIM_ENGINE=path/to/module.ts npm test`). */
export interface EngineModule {
  solveRoute: RouteEngine['solve'];
  MODEL_VERSION: string;
}

export function engineFromModule(name: string, m: EngineModule): RouteEngine {
  return { name, modelVersion: m.MODEL_VERSION, solve: (g, r, h) => m.solveRoute(g, r, h) };
}
