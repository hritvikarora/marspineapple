import type {
  RegionRoutingBundle,
  RouteRequest,
  RouteResponse,
} from '../contracts/routing.js';

export type ClientWorkerInboundMessage =
  | { type: 'LOAD_BUNDLE'; requestId: string; bundle: RegionRoutingBundle }
  | { type: 'PLAN_ROUTE'; request: RouteRequest }
  | { type: 'CANCEL_REQUEST'; requestId: string };

export type ClientWorkerOutboundMessage =
  | { type: 'BUNDLE_LOADED'; requestId: string; ok: boolean; error?: RouteResponse }
  | { type: 'ROUTE_RESULT'; requestId: string; response: RouteResponse };

export interface WorkerLike {
  postMessage(message: ClientWorkerInboundMessage, transfer?: unknown[]): void;
  onmessage: ((event: { data: ClientWorkerOutboundMessage }) => void) | null;
  onerror?: ((event: unknown) => void) | null;
  terminate?: () => void;
}

export interface ClientEnginePort {
  loadBundle(b: RegionRoutingBundle): { ok: boolean; error?: RouteResponse };
  planRoutes(
    req: RouteRequest,
    hooks: { isCancelled: () => boolean; isTimedOut: () => boolean }
  ): Promise<RouteResponse> | RouteResponse;
}

export type RoutePlannerClientOptions = {
  workerFactory?: () => WorkerLike;
  engine?: ClientEnginePort;
};

type PendingLoad = {
  resolve: (res: { ok: boolean; error?: RouteResponse }) => void;
  reject: (err: unknown) => void;
};

type PendingRoute = {
  requestId: string;
  resolve: (res: RouteResponse) => void;
};

/**
 * Promise-based client for route planning over a Web Worker or an in-process
 * headless engine adapter. Never detaches caller ArrayBuffers on loadBundle,
 * and automatically cancels superseded in-flight planRoute requests.
 */
export class RoutePlannerClient {
  private readonly worker: WorkerLike | null = null;
  private readonly engine: ClientEnginePort | null = null;
  private readonly pendingLoads = new Map<string, PendingLoad>();
  private readonly pendingRoutes = new Map<string, PendingRoute>();
  private activeRouteRequestId: string | null = null;
  private loadSeq = 0;

  // In-process serialization state (used when workerFactory is omitted)
  private inProcessEpoch = 0;
  private inProcessQueue: Promise<void> = Promise.resolve();

  constructor(options: RoutePlannerClientOptions = {}) {
    if (options.workerFactory) {
      this.worker = options.workerFactory();
      this.worker.onmessage = (event) => this.handleWorkerMessage(event.data);
      this.worker.onerror = (err) => this.handleWorkerError(err);
    } else if (options.engine) {
      this.engine = options.engine;
    } else {
      throw new Error(
        'RoutePlannerClient requires either workerFactory or an in-process engine adapter.'
      );
    }
  }

  private handleWorkerMessage(msg: ClientWorkerOutboundMessage): void {
    if (msg.type === 'BUNDLE_LOADED') {
      const pending = this.pendingLoads.get(msg.requestId);
      if (pending) {
        this.pendingLoads.delete(msg.requestId);
        pending.resolve({
          ok: msg.ok,
          ...(msg.error ? { error: msg.error } : {}),
        });
      }
      return;
    }

    if (msg.type === 'ROUTE_RESULT') {
      const pending = this.pendingRoutes.get(msg.requestId);
      if (pending) {
        this.pendingRoutes.delete(msg.requestId);
        if (this.activeRouteRequestId === msg.requestId) {
          this.activeRouteRequestId = null;
        }
        pending.resolve(msg.response);
      }
    }
  }

  private handleWorkerError(err: unknown): void {
    for (const [id, pending] of this.pendingLoads) {
      this.pendingLoads.delete(id);
      pending.reject(err);
    }
    for (const [id, pending] of this.pendingRoutes) {
      this.pendingRoutes.delete(id);
      pending.resolve({
        status: 'cancelled',
        requestId: id,
        message: 'Worker encountered an error.',
      });
    }
    this.activeRouteRequestId = null;
  }

  private supersedeActiveRoute(): void {
    if (this.activeRouteRequestId === null) return;
    const prevId = this.activeRouteRequestId;
    this.activeRouteRequestId = null;

    if (this.worker) {
      this.worker.postMessage({ type: 'CANCEL_REQUEST', requestId: prevId });
    } else {
      this.inProcessEpoch++;
    }

    const prevPending = this.pendingRoutes.get(prevId);
    if (prevPending) {
      this.pendingRoutes.delete(prevId);
      prevPending.resolve({
        status: 'cancelled',
        requestId: prevId,
        message: 'Superseded by a newer route request.',
      });
    }
  }

  public loadBundle(
    bundle: RegionRoutingBundle
  ): Promise<{ ok: boolean; error?: RouteResponse }> {
    const requestId = `load-${++this.loadSeq}`;

    if (this.worker) {
      return new Promise((resolve, reject) => {
        this.pendingLoads.set(requestId, { resolve, reject });
        // Critical: Do NOT pass a transfer list so caller ArrayBuffers are never detached.
        this.worker!.postMessage({ type: 'LOAD_BUNDLE', requestId, bundle });
      });
    }

    const engine = this.engine!;
    this.inProcessEpoch++;
    const run = this.inProcessQueue.then(() => engine.loadBundle(bundle));
    this.inProcessQueue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  public planRoute(request: RouteRequest): Promise<RouteResponse> {
    this.supersedeActiveRoute();
    this.activeRouteRequestId = request.requestId;

    if (this.worker) {
      return new Promise((resolve) => {
        this.pendingRoutes.set(request.requestId, {
          requestId: request.requestId,
          resolve,
        });
        this.worker!.postMessage({ type: 'PLAN_ROUTE', request });
      });
    }

    const engine = this.engine!;
    const myEpoch = ++this.inProcessEpoch;
    const isCancelled = () => this.inProcessEpoch !== myEpoch;
    const deadline =
      request.timeoutMs !== undefined && Number.isFinite(request.timeoutMs)
        ? performance.now() + request.timeoutMs
        : Number.POSITIVE_INFINITY;
    const isTimedOut = () => performance.now() >= deadline;

    return new Promise((resolve) => {
      this.pendingRoutes.set(request.requestId, {
        requestId: request.requestId,
        resolve,
      });

      const run = this.inProcessQueue.then(async () => {
        if (isCancelled()) {
          return;
        }
        const response = await engine.planRoutes(request, { isCancelled, isTimedOut });
        const pending = this.pendingRoutes.get(request.requestId);
        if (pending) {
          this.pendingRoutes.delete(request.requestId);
          if (this.activeRouteRequestId === request.requestId) {
            this.activeRouteRequestId = null;
          }
          pending.resolve(response);
        }
      });

      this.inProcessQueue = run.then(
        () => undefined,
        () => undefined
      );
    });
  }

  public cancel(requestId?: string): void {
    const targetId = requestId ?? this.activeRouteRequestId;
    if (!targetId) return;

    if (this.activeRouteRequestId === targetId) {
      this.activeRouteRequestId = null;
    }

    if (this.worker) {
      this.worker.postMessage({ type: 'CANCEL_REQUEST', requestId: targetId });
    } else {
      this.inProcessEpoch++;
    }

    const pending = this.pendingRoutes.get(targetId);
    if (pending) {
      this.pendingRoutes.delete(targetId);
      pending.resolve({
        status: 'cancelled',
        requestId: targetId,
        message: 'Cancelled by client.',
      });
    }
  }

  public dispose(): void {
    this.supersedeActiveRoute();
    this.worker?.terminate?.();
  }
}
