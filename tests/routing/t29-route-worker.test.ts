import { describe, expect, it } from 'vitest';
import type {
  RegionRoutingBundle,
  RouteRequest,
  RouteResponse,
} from '../../src/contracts/routing.js';
import {
  createWorkerMessageHandler,
  type WorkerEnginePort,
  type WorkerOutboundMessage,
} from '../../src/routing/route.worker.js';

function makeDummyBundle(): RegionRoutingBundle {
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
    elevationM: new Float32Array(4),
    terrainSlopeDeg: new Float32Array(4),
    roughnessNormalized: new Float32Array(4),
    qualityCode: new Uint8Array(4),
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

describe('T29: createWorkerMessageHandler', () => {
  it('handles LOAD_BUNDLE, PLAN_ROUTE, and CANCEL_REQUEST message flow', async () => {
    const outbound: WorkerOutboundMessage[] = [];
    const engine: WorkerEnginePort = {
      loadBundle: () => ({ ok: true }),
      planRoutes: (req, hooks) => {
        if (hooks.isCancelled()) {
          return { status: 'cancelled', requestId: req.requestId, message: 'Cancelled' };
        }
        return {
          status: 'no_path',
          requestId: req.requestId,
          regionId: req.regionId,
          datasetVersion: req.datasetVersion,
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
          reasonCode: 'DISCONNECTED_COMPONENTS',
          message: 'No path',
          solveTimeMs: 1,
        };
      },
    };

    const handler = createWorkerMessageHandler(engine, (msg) => outbound.push(msg));

    await handler({ type: 'LOAD_BUNDLE', requestId: 'load-1', bundle: makeDummyBundle() });
    await handler({ type: 'PLAN_ROUTE', request: makeRequest('req-1') });

    expect(outbound).toHaveLength(2);
    expect(outbound[0]).toEqual({ type: 'BUNDLE_LOADED', requestId: 'load-1', ok: true });
    expect(outbound[1].type).toBe('ROUTE_RESULT');
    if (outbound[1].type === 'ROUTE_RESULT') {
      expect(outbound[1].requestId).toBe('req-1');
      expect(outbound[1].response.status).toBe('no_path');
    }
  });

  it('serializes overlapping PLAN_ROUTE messages during a yielded search and cancels the superseded request', async () => {
    const outbound: WorkerOutboundMessage[] = [];
    let activeCount = 0;
    let maxConcurrent = 0;
    let releaseFirstYield!: () => void;
    const firstYieldGate = new Promise<void>((resolve) => {
      releaseFirstYield = resolve;
    });
    let firstStartedResolve!: () => void;
    const firstStarted = new Promise<void>((resolve) => {
      firstStartedResolve = resolve;
    });

    const engine: WorkerEnginePort = {
      loadBundle: () => ({ ok: true }),
      planRoutes: async (req, hooks): Promise<RouteResponse> => {
        activeCount++;
        maxConcurrent = Math.max(maxConcurrent, activeCount);
        try {
          if (req.requestId === 'req-1') {
            firstStartedResolve();
            await firstYieldGate;
            if (hooks.isCancelled()) {
              return { status: 'cancelled', requestId: req.requestId, message: 'Superseded' };
            }
          }
          return {
            status: 'no_path',
            requestId: req.requestId,
            regionId: req.regionId,
            datasetVersion: req.datasetVersion,
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
            message: 'Completed',
            solveTimeMs: 2,
          };
        } finally {
          activeCount--;
        }
      },
    };

    const handler = createWorkerMessageHandler(engine, (msg) => outbound.push(msg));

    const p1 = handler({ type: 'PLAN_ROUTE', request: makeRequest('req-1') });
    await firstStarted;

    // Supersede req-1 while it is suspended on firstYieldGate
    const p2 = handler({ type: 'PLAN_ROUTE', request: makeRequest('req-2') });

    // Release req-1 so it can observe isCancelled() and exit before req-2 starts
    releaseFirstYield();
    await Promise.all([p1, p2]);

    expect(maxConcurrent).toBe(1);
    expect(outbound).toHaveLength(2);
    expect(outbound[0]).toEqual({
      type: 'ROUTE_RESULT',
      requestId: 'req-1',
      response: { status: 'cancelled', requestId: 'req-1', message: 'Superseded' },
    });
    expect(outbound[1].type).toBe('ROUTE_RESULT');
    if (outbound[1].type === 'ROUTE_RESULT') {
      expect(outbound[1].requestId).toBe('req-2');
      expect(outbound[1].response.status).toBe('no_path');
    }
  });

  it('cancels an active yielded request via CANCEL_REQUEST', async () => {
    const outbound: WorkerOutboundMessage[] = [];
    let releaseYield!: () => void;
    const yieldGate = new Promise<void>((resolve) => {
      releaseYield = resolve;
    });
    let startedResolve!: () => void;
    const started = new Promise<void>((resolve) => {
      startedResolve = resolve;
    });

    const engine: WorkerEnginePort = {
      loadBundle: () => ({ ok: true }),
      planRoutes: async (req, hooks): Promise<RouteResponse> => {
        startedResolve();
        await yieldGate;
        if (hooks.isCancelled()) {
          return { status: 'cancelled', requestId: req.requestId, message: 'Cancelled by client' };
        }
        return {
          status: 'no_path',
          requestId: req.requestId,
          regionId: req.regionId,
          datasetVersion: req.datasetVersion,
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
          message: 'Completed',
          solveTimeMs: 1,
        };
      },
    };

    const handler = createWorkerMessageHandler(engine, (msg) => outbound.push(msg));
    const p = handler({ type: 'PLAN_ROUTE', request: makeRequest('req-cancel') });
    await started;

    await handler({ type: 'CANCEL_REQUEST', requestId: 'req-cancel' });
    releaseYield();
    await p;

    expect(outbound).toHaveLength(1);
    expect(outbound[0]).toEqual({
      type: 'ROUTE_RESULT',
      requestId: 'req-cancel',
      response: { status: 'cancelled', requestId: 'req-cancel', message: 'Cancelled by client' },
    });
  });
});
