import { describe, expect, it } from 'vitest';
import type {
  RegionRoutingBundle,
  RouteRequest,
  RouteResponse,
} from '../../src/contracts/routing.js';
import {
  RoutePlannerClient,
  type ClientEnginePort,
  type ClientWorkerInboundMessage,
  type ClientWorkerOutboundMessage,
  type WorkerLike,
} from '../../src/routing/routeClient.js';

function makeBundle(): RegionRoutingBundle {
  return {
    regionId: 'test-region',
    datasetVersion: 'v1',
    gridWidth: 2,
    gridHeight: 2,
    cellSpacingEastM: 10,
    cellSpacingNorthM: 10,
    noDataSentinel: -9999,
    roughnessScaleM: 0.5,
    qualityMappingVersion: '1.0',
    elevationM: new Float32Array([0, 1, 2, 3]),
    terrainSlopeDeg: new Float32Array([0, 0, 0, 0]),
    roughnessNormalized: new Float32Array([0, 0, 0, 0]),
    qualityCode: new Uint8Array([0, 0, 0, 0]),
  };
}

function makeRequest(requestId: string): RouteRequest {
  return {
    requestId,
    regionId: 'test-region',
    datasetVersion: 'v1',
    start: { eastM: 5, northM: 15 },
    destination: { eastM: 15, northM: 5 },
    policies: ['shortest'],
    qualityMode: 'prefer',
  };
}

function makeNoPathResponse(requestId: string): RouteResponse {
  return {
    status: 'no_path',
    requestId,
    regionId: 'test-region',
    datasetVersion: 'v1',
    normalizedStart: {
      requestedEastM: 5,
      requestedNorthM: 15,
      col: 0,
      row: 0,
      cellIndex: 0,
      cellCenterEastM: 5,
      cellCenterNorthM: 15,
    },
    normalizedDestination: {
      requestedEastM: 15,
      requestedNorthM: 5,
      col: 1,
      row: 1,
      cellIndex: 3,
      cellCenterEastM: 15,
      cellCenterNorthM: 5,
    },
    reasonCode: 'SEARCH_EXHAUSTED',
    message: 'Done',
    solveTimeMs: 1,
  };
}

describe('T30: RoutePlannerClient', () => {
  it('leaves bundle.elevationM.byteLength > 0 on the caller side (never passes transfer list)', async () => {
    const postedCalls: Array<{ msg: ClientWorkerInboundMessage; transfer?: unknown[] }> = [];

    const mockWorker: WorkerLike = {
      onmessage: null,
      postMessage(msg, transfer) {
        postedCalls.push({ msg, transfer });
        if (msg.type === 'LOAD_BUNDLE') {
          queueMicrotask(() => {
            mockWorker.onmessage?.({
              data: { type: 'BUNDLE_LOADED', requestId: msg.requestId, ok: true },
            });
          });
        }
      },
    };

    const client = new RoutePlannerClient({ workerFactory: () => mockWorker });
    const bundle = makeBundle();
    const res = await client.loadBundle(bundle);

    expect(res.ok).toBe(true);
    expect(bundle.elevationM.byteLength).toBeGreaterThan(0);
    expect(postedCalls).toHaveLength(1);
    expect(postedCalls[0].transfer).toBeUndefined();
  });

  it('automatically sends CANCEL_REQUEST and resolves older promise as cancelled when two rapid planRoute calls are made (worker mode)', async () => {
    const postedMessages: ClientWorkerInboundMessage[] = [];
    const mockWorker: WorkerLike = {
      onmessage: null,
      postMessage(msg) {
        postedMessages.push(msg);
        if (msg.type === 'PLAN_ROUTE' && msg.request.requestId === 'req-2') {
          queueMicrotask(() => {
            const outbound: ClientWorkerOutboundMessage = {
              type: 'ROUTE_RESULT',
              requestId: 'req-2',
              response: makeNoPathResponse('req-2'),
            };
            mockWorker.onmessage?.({ data: outbound });
          });
        }
      },
    };

    const client = new RoutePlannerClient({ workerFactory: () => mockWorker });
    const p1 = client.planRoute(makeRequest('req-1'));
    const p2 = client.planRoute(makeRequest('req-2'));

    const [r1, r2] = await Promise.all([p1, p2]);

    expect(r1.status).toBe('cancelled');
    expect(r1.requestId).toBe('req-1');
    expect(r2.status).toBe('no_path');
    expect(r2.requestId).toBe('req-2');

    expect(postedMessages.map((m) => m.type)).toEqual([
      'PLAN_ROUTE',
      'CANCEL_REQUEST',
      'PLAN_ROUTE',
    ]);
    expect(postedMessages[1]).toEqual({ type: 'CANCEL_REQUEST', requestId: 'req-1' });
  });

  it('works in headless in-process mode and supports superseding cancellation', async () => {
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let firstStartedResolve!: () => void;
    const firstStarted = new Promise<void>((resolve) => {
      firstStartedResolve = resolve;
    });

    const engine: ClientEnginePort = {
      loadBundle: () => ({ ok: true }),
      planRoutes: async (req, hooks) => {
        if (req.requestId === 'inproc-1') {
          firstStartedResolve();
          await firstGate;
          if (hooks.isCancelled()) {
            return { status: 'cancelled', requestId: req.requestId, message: 'Cancelled' };
          }
        }
        return makeNoPathResponse(req.requestId);
      },
    };

    const client = new RoutePlannerClient({ engine });
    const bundle = makeBundle();
    const loadRes = await client.loadBundle(bundle);
    expect(loadRes.ok).toBe(true);
    expect(bundle.elevationM.byteLength).toBeGreaterThan(0);

    const p1 = client.planRoute(makeRequest('inproc-1'));
    await firstStarted;
    const p2 = client.planRoute(makeRequest('inproc-2'));
    releaseFirst();

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.status).toBe('cancelled');
    expect(r2.status).toBe('no_path');
  });
});
