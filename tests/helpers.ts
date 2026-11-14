import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { MainToWorker, WorkerToMain } from '../src/contracts';
import { createWorkerHandler } from '../src/worker/handler';
import type { WorkerLike } from '../src/worker/client';

// vitest provides __dirname for test files (also under jsdom, where import.meta.url is not file:).
export const PUBLIC_DIR = join(__dirname, '..', 'public');
export const FIXTURE_MANIFEST = 'http://test.local/bundles/synthetic-v0/manifest.json';

type Override = (url: string) => Response | undefined | Promise<Response | undefined>;

/** fetch() that serves files from public/ for any http(s) URL. */
export function fileFetch(override?: Override): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    const o = await override?.(url);
    if (o) return o;
    const path = new URL(url).pathname;
    try {
      const buf = await readFile(join(PUBLIC_DIR, decodeURIComponent(path)));
      return new Response(new Uint8Array(buf), { status: 200 });
    } catch {
      return new Response('not found', { status: 404 });
    }
  }) as typeof fetch;
}

/**
 * In-process stand-in for the real Worker: same handler, async delivery, structured cloning.
 * `delayMs` simulates a slow worker; `silent` never answers route requests (timeout tests).
 */
export class FakeWorker implements WorkerLike {
  onmessage: ((ev: MessageEvent<WorkerToMain>) => void) | null = null;
  onerror: ((ev: ErrorEvent) => void) | null = null;
  terminated = false;
  received: MainToWorker[] = [];
  private handle: (m: MainToWorker) => void;
  constructor(private opts: { delayMs?: number; silent?: boolean } = {}) {
    this.handle = createWorkerHandler((m) => {
      setTimeout(() => {
        if (!this.terminated) this.onmessage?.({ data: structuredClone(m) } as MessageEvent<WorkerToMain>);
      }, this.opts.delayMs ?? 0);
    });
  }
  postMessage(msg: MainToWorker, transfer?: Transferable[]): void {
    const cloned = structuredClone(msg, { transfer: transfer as Transferable[] | undefined });
    this.received.push(cloned);
    if (this.opts.silent && cloned.type === 'route') return;
    setTimeout(() => !this.terminated && this.handle(cloned), 0);
  }
  terminate(): void {
    this.terminated = true;
  }
}
