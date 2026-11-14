/// <reference lib="webworker" />
/** Routing Web Worker entry. Loaded via `new Worker(new URL(...), { type: 'module' })` in client.ts. */
import type { MainToWorker, WorkerToMain } from '../contracts';
import { createWorkerHandler } from './handler';

interface WorkerScope {
  postMessage(m: WorkerToMain): void;
  onmessage: ((ev: MessageEvent<MainToWorker>) => void) | null;
}
const scope = globalThis as unknown as WorkerScope;
const handle = createWorkerHandler((m) => scope.postMessage(m));
scope.onmessage = (ev) => handle(ev.data);
