/**
 * Worker-side message handler, independent of the Worker global so it can be unit-tested.
 * OWNER: Role C (protocol plumbing) / Ayush (what runs inside `solveRoute`).
 */
import type { GridBundleTransfer, MainToWorker, WorkerToMain } from '../contracts';
import { MODEL_VERSION, solveRoute, type RoutingGrid } from '../routing';

export function toRoutingGrid(t: GridBundleTransfer): RoutingGrid {
  return {
    manifest: t.manifest,
    bundleVersion: t.bundleVersion,
    elevation: new Float32Array(t.elevation),
    slope: new Float32Array(t.slope),
    roughness: new Float32Array(t.roughness),
    quality: new Uint8Array(t.quality),
    exclusion: new Uint8Array(t.exclusion),
  };
}

export function createWorkerHandler(post: (m: WorkerToMain) => void) {
  let grid: RoutingGrid | null = null;
  const cancelled = new Set<string>();
  post({ type: 'ready', modelVersion: MODEL_VERSION });

  return function onMessage(msg: MainToWorker): void {
    switch (msg.type) {
      case 'load-bundle': {
        try {
          const g = toRoutingGrid(msg.bundle);
          const n = g.manifest.grid.width * g.manifest.grid.height;
          for (const k of ['elevation', 'slope', 'roughness', 'quality', 'exclusion'] as const) {
            if (g[k].length !== n) throw new Error(`${k} has ${g[k].length} cells, expected ${n}`);
          }
          grid = g;
          post({ type: 'bundle-loaded', bundleVersion: g.bundleVersion });
        } catch (e) {
          grid = null;
          post({ type: 'bundle-error', bundleVersion: msg.bundle.bundleVersion, message: (e as Error).message });
        }
        return;
      }
      case 'cancel':
        // Only effective if the solver yields; the client also terminates the worker on cancel.
        cancelled.add(msg.requestId);
        return;
      case 'route': {
        const req = msg.request;
        const deadline = req.timeoutMs ? Date.now() + req.timeoutMs : Infinity;
        post({ type: 'route-response', response: { status: 'progress', phase: 'searching', exploredNodes: 0, requestId: req.requestId, bundleVersion: req.bundleVersion, modelVersion: MODEL_VERSION } });
        const response = solveRoute(grid, req, {
          shouldStop: () => (cancelled.has(req.requestId) ? 'cancelled' : Date.now() > deadline ? 'timeout' : null),
          onProgress: (n) =>
            post({ type: 'route-response', response: { status: 'progress', phase: 'searching', exploredNodes: n, requestId: req.requestId, bundleVersion: req.bundleVersion, modelVersion: MODEL_VERSION } }),
        });
        cancelled.delete(req.requestId);
        post({ type: 'route-response', response });
        return;
      }
    }
  };
}
