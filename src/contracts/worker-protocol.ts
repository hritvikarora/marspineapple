/** Raw worker message protocol. Only src/worker/client.ts and the worker itself use this. */
import type { GridBundleTransfer } from './bundle';
import type { RouteRequest, RouteResponse } from './route';

export type MainToWorker =
  | { type: 'load-bundle'; bundle: GridBundleTransfer }
  | { type: 'route'; request: RouteRequest }
  | { type: 'cancel'; requestId: string };

export type WorkerToMain =
  | { type: 'ready'; modelVersion: string }
  | { type: 'bundle-loaded'; bundleVersion: string }
  | { type: 'bundle-error'; bundleVersion: string; message: string }
  | { type: 'route-response'; response: RouteResponse };
