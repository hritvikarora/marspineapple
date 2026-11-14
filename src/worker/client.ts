/**
 * Typed routing-worker client. The UI never touches postMessage. OWNER: Role C.
 *
 * Guarantees:
 *  - One active request at a time. A new `route()` supersedes the old one (old handle resolves
 *    `cancelled`), and any late message whose requestId OR bundleVersion differs from the active
 *    request is DROPPED (counted in `staleDropped`).
 *  - Cancel and timeout TERMINATE the worker and transparently restart it (re-sending the bundle),
 *    because a synchronous search loop cannot read a queued cancel message.
 *  - Buffer ownership: the main thread's GridBundle typed arrays are NEVER transferred. We post
 *    `slice()` copies and transfer the copies, so map/3D keep valid (non-detached) buffers.
 */
import type {
  GridBundle,
  GridBundleTransfer,
  MainToWorker,
  RouteFinalResponse,
  RouteRequest,
  RouteResponse,
  WorkerToMain,
} from '../contracts';

export interface WorkerLike {
  postMessage(msg: MainToWorker, transfer?: Transferable[]): void;
  terminate(): void;
  onmessage: ((ev: MessageEvent<WorkerToMain>) => void) | null;
  onerror: ((ev: ErrorEvent) => void) | null;
}

export interface RouteWorkerClientOptions {
  createWorker?: () => WorkerLike;
  /** Hard client-side timeout per request (ms). Default 20000. */
  timeoutMs?: number;
}

export interface RouteHandle {
  requestId: string;
  /** Resolves exactly once with the final state of this request (including local cancel/timeout). */
  done: Promise<RouteFinalResponse>;
  cancel(): void;
}

interface Active {
  request: RouteRequest;
  resolve: (r: RouteFinalResponse) => void;
  onUpdate?: (r: RouteResponse) => void;
  timer: ReturnType<typeof setTimeout>;
}

export function defaultCreateWorker(): WorkerLike {
  // Vite recognises this exact pattern and emits a hashed worker chunk with a relative URL.
  return new Worker(new URL('./routing.worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike;
}

export function bundleToTransfer(b: GridBundle): { payload: GridBundleTransfer; transfer: ArrayBuffer[] } {
  const copy = (a: Float32Array | Uint8Array): ArrayBuffer =>
    a.buffer.slice(a.byteOffset, a.byteOffset + a.byteLength) as ArrayBuffer;
  const payload: GridBundleTransfer = {
    manifest: b.manifest,
    bundleVersion: b.bundleVersion,
    width: b.width,
    height: b.height,
    elevation: copy(b.elevation),
    slope: copy(b.slope),
    roughness: copy(b.roughness),
    quality: copy(b.quality),
    exclusion: copy(b.exclusion),
  };
  return { payload, transfer: [payload.elevation, payload.slope, payload.roughness, payload.quality, payload.exclusion] };
}

export class RouteWorkerClient {
  private worker: WorkerLike | null = null;
  private bundle: GridBundle | null = null;
  private active: Active | null = null;
  private bundleWaiters: { version: string; resolve: () => void; reject: (e: Error) => void }[] = [];
  private readonly create: () => WorkerLike;
  private readonly timeoutMs: number;
  /** Number of worker messages discarded by the stale guard (for tests/diagnostics). */
  staleDropped = 0;
  workerStarts = 0;

  constructor(opts: RouteWorkerClientOptions = {}) {
    this.create = opts.createWorker ?? defaultCreateWorker;
    this.timeoutMs = opts.timeoutMs ?? 20000;
  }

  /** Sends a COPY of the bundle to the worker. Resolves when the worker confirms. */
  loadBundle(bundle: GridBundle): Promise<void> {
    this.bundle = bundle;
    if (this.active) {
      // Region change: obsolete work must not keep the worker busy.
      this.worker?.terminate();
      this.worker = null;
      this.finish({ ...this.base(this.active.request), status: 'cancelled' });
    }
    this.ensureWorker(false);
    return this.postBundle();
  }

  route(request: RouteRequest, onUpdate?: (r: RouteResponse) => void): RouteHandle {
    if (this.active) this.supersede();
    this.ensureWorker(true);
    let resolve!: (r: RouteFinalResponse) => void;
    const done = new Promise<RouteFinalResponse>((r) => (resolve = r));
    const limit = request.timeoutMs ?? this.timeoutMs;
    const timer = setTimeout(() => {
      if (this.active?.request.requestId !== request.requestId) return;
      this.restartWorker();
      this.finish({
        ...this.base(request),
        status: 'timeout',
        limitMs: limit,
        message: 'Route calculation exceeded the time limit. This is not proof that no path exists.',
      });
    }, limit);
    this.active = { request, resolve, onUpdate, timer };
    this.worker!.postMessage({ type: 'route', request });
    return { requestId: request.requestId, done, cancel: () => this.cancel(request.requestId) };
  }

  cancel(requestId?: string): void {
    const a = this.active;
    if (!a || (requestId && a.request.requestId !== requestId)) return;
    this.restartWorker();
    this.finish({ ...this.base(a.request), status: 'cancelled' });
  }

  dispose(): void {
    if (this.active) this.finish({ ...this.base(this.active.request), status: 'cancelled' });
    this.worker?.terminate();
    this.worker = null;
  }

  get activeRequestId(): string | null {
    return this.active?.request.requestId ?? null;
  }

  // ---- internals ---------------------------------------------------------

  private base(r: RouteRequest) {
    return { requestId: r.requestId, bundleVersion: r.bundleVersion, modelVersion: r.modelVersion };
  }

  /** A newer request replaces the in-flight one: restart worker so it doesn't queue behind obsolete work. */
  private supersede() {
    const a = this.active!;
    this.restartWorker();
    this.finish({ ...this.base(a.request), status: 'cancelled' });
  }

  private finish(r: RouteFinalResponse) {
    const a = this.active;
    if (!a || a.request.requestId !== r.requestId) return;
    clearTimeout(a.timer);
    this.active = null;
    a.onUpdate?.(r);
    a.resolve(r);
  }

  private ensureWorker(sendBundle: boolean) {
    if (this.worker) return;
    const w = this.create();
    this.workerStarts++;
    w.onmessage = (ev) => this.onMessage(ev.data);
    w.onerror = (ev) => {
      const a = this.active;
      this.worker?.terminate();
      this.worker = null;
      if (a) this.finish({ ...this.base(a.request), status: 'data-error', stage: 'worker-crash', message: ev.message || 'Routing worker crashed.' });
      for (const b of this.bundleWaiters.splice(0)) b.reject(new Error(ev.message || 'Routing worker crashed.'));
    };
    this.worker = w;
    if (sendBundle && this.bundle) void this.postBundle().catch(() => undefined);
  }

  private restartWorker() {
    this.worker?.terminate();
    this.worker = null;
    this.ensureWorker(true);
  }

  private postBundle(): Promise<void> {
    const b = this.bundle!;
    const { payload, transfer } = bundleToTransfer(b);
    const p = new Promise<void>((resolve, reject) => this.bundleWaiters.push({ version: b.bundleVersion, resolve, reject }));
    this.worker!.postMessage({ type: 'load-bundle', bundle: payload }, transfer);
    return p;
  }

  private onMessage(m: WorkerToMain) {
    switch (m.type) {
      case 'ready':
        return;
      case 'bundle-loaded':
      case 'bundle-error': {
        const waiters = this.bundleWaiters.filter((w) => w.version === m.bundleVersion);
        this.bundleWaiters = this.bundleWaiters.filter((w) => w.version !== m.bundleVersion);
        for (const w of waiters) {
          if (m.type === 'bundle-loaded') w.resolve();
          else w.reject(new Error(m.message));
        }
        return;
      }
      case 'route-response': {
        const r = m.response;
        const a = this.active;
        if (!a || r.requestId !== a.request.requestId || r.bundleVersion !== a.request.bundleVersion) {
          this.staleDropped++;
          return;
        }
        if (r.status === 'progress') a.onUpdate?.(r);
        else this.finish(r);
        return;
      }
    }
  }
}
