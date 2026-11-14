/**
 * The engine every simulation test runs against. Default: whatever src/routing exports (placeholder
 * today, Ayush's solver once it lands). Override: SIM_ENGINE=path/to/module.ts npm test
 * (module must export `solveRoute(grid, request, hooks?)` and `MODEL_VERSION`).
 */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { RouteFinalResponse, RouteRequest } from '../../src/contracts';
import { MODEL_VERSION, solveRoute } from '../../src/routing';
import { ALL_POLICIES, engineFromModule, type EngineModule, type RouteEngine, type ScenarioInstance, type SimCase } from '../../src/sim';

export async function getEngine(): Promise<RouteEngine> {
  const p = process.env.SIM_ENGINE;
  if (!p) return engineFromModule('src/routing', { solveRoute, MODEL_VERSION });
  return engineFromModule(p, (await import(pathToFileURL(resolve(p)).href)) as EngineModule);
}

/** True when the engine under test is the shipped src/routing (golden files only apply to it). */
export const usingDefaultEngine = !process.env.SIM_ENGINE;

export function requestFor(s: Pick<ScenarioInstance, 'bundle'>, c: SimCase, engine: RouteEngine, requestId = `sim-${c.id}`): RouteRequest {
  return {
    requestId, bundleVersion: s.bundle.bundleVersion, modelVersion: engine.modelVersion,
    start: c.start, destination: c.destination, policies: c.policies ?? ALL_POLICIES,
    strictQuality: c.strictQuality ?? false, roundTrip: c.roundTrip ?? false,
  };
}

/** Drop wall-clock fields so responses can be compared for determinism. */
export function stripTiming(r: RouteFinalResponse): unknown {
  return r.status === 'success' ? { ...r, computeMs: 0 } : r;
}
