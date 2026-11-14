import type {
  RegionRoutingBundle,
  RouteRequest,
  RouteResponse,
} from '../contracts/routing.js';

export type WorkerInboundMessage =
  | { type: 'LOAD_BUNDLE'; requestId: string; bundle: RegionRoutingBundle }
  | { type: 'PLAN_ROUTE'; request: RouteRequest }
  | { type: 'CANCEL_REQUEST'; requestId: string };

export type WorkerOutboundMessage =
  | { type: 'BUNDLE_LOADED'; requestId: string; ok: boolean; error?: RouteResponse }
  | { type: 'ROUTE_RESULT'; requestId: string; response: RouteResponse };

export interface WorkerEnginePort {
  loadBundle(b: RegionRoutingBundle): { ok: boolean; error?: RouteResponse };
  planRoutes(
    req: RouteRequest,
    hooks: { isCancelled: () => boolean; isTimedOut: () => boolean }
  ): Promise<RouteResponse> | RouteResponse;
}

/**
 * Creates a serialized single-owner message handler for Web Worker or in-process
 * transport. Superseding LOAD_BUNDLE or PLAN_ROUTE messages increment the task
 * epoch so any yielded search exits before the next operation touches the engine.
 */
export function createWorkerMessageHandler(
  enginePort: WorkerEnginePort,
  postMessageFn: (msg: WorkerOutboundMessage) => void
): (msg: WorkerInboundMessage) => Promise<void> {
  let activeTaskEpoch = 0;
  let activeRequestId: string | null = null;
  let queueChain: Promise<void> = Promise.resolve();
  const cancelledIds = new Set<string>();

  function enqueueSerialized(
    requestId: string | null,
    task: (ctx: { readonly epoch: number; isCancelled: () => boolean }) => Promise<void> | void
  ): Promise<void> {
    const myEpoch = ++activeTaskEpoch;
    activeRequestId = requestId;
    const isCancelled = () =>
      activeTaskEpoch !== myEpoch || (requestId !== null && cancelledIds.has(requestId));

    const runPromise = queueChain.then(() => task({ epoch: myEpoch, isCancelled }));
    queueChain = runPromise.then(
      () => undefined,
      () => undefined
    );
    return runPromise;
  }

  return function handleMessage(msg: WorkerInboundMessage): Promise<void> {
    if (msg.type === 'CANCEL_REQUEST') {
      cancelledIds.add(msg.requestId);
      if (activeRequestId === msg.requestId) {
        activeTaskEpoch++;
        activeRequestId = null;
      }
      return Promise.resolve();
    }

    if (msg.type === 'LOAD_BUNDLE') {
      return enqueueSerialized(null, () => {
        const result = enginePort.loadBundle(msg.bundle);
        postMessageFn({
          type: 'BUNDLE_LOADED',
          requestId: msg.requestId,
          ok: result.ok,
          ...(result.error ? { error: result.error } : {}),
        });
      });
    }

    // msg.type === 'PLAN_ROUTE'
    const req = msg.request;
    cancelledIds.delete(req.requestId);

    return enqueueSerialized(req.requestId, async ({ isCancelled }) => {
      if (isCancelled()) {
        postMessageFn({
          type: 'ROUTE_RESULT',
          requestId: req.requestId,
          response: {
            status: 'cancelled',
            requestId: req.requestId,
            message: 'Request was cancelled or superseded before execution.',
          },
        });
        return;
      }

      const deadline =
        req.timeoutMs !== undefined && Number.isFinite(req.timeoutMs)
          ? performance.now() + req.timeoutMs
          : Number.POSITIVE_INFINITY;
      const isTimedOut = () => performance.now() >= deadline;

      const response = await enginePort.planRoutes(req, { isCancelled, isTimedOut });
      postMessageFn({
        type: 'ROUTE_RESULT',
        requestId: req.requestId,
        response,
      });
    });
  };
}
