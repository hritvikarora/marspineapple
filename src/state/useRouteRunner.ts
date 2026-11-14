/**
 * Glue between the store and the worker client. OWNER: Role C.
 * Dhani's UI calls `requestRoute()` / `cancelRoute()` and reads state; it never sees the worker.
 */
import { useCallback, useEffect, useRef } from 'react';
import { ROUTE_TIMEOUT_MS } from '../config';
import { RouteWorkerClient, type RouteWorkerClientOptions } from '../worker/client';
import { useAppState } from './context';
import { buildRouteRequest } from './store';

let seq = 0;
export function newRequestId(): string {
  seq += 1;
  return `req-${seq}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useRouteRunner(opts?: RouteWorkerClientOptions) {
  const { state, dispatch } = useAppState();
  const clientRef = useRef<RouteWorkerClient | null>(null);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  useEffect(() => {
    const c = new RouteWorkerClient({ timeoutMs: ROUTE_TIMEOUT_MS, ...opts });
    clientRef.current = c;
    return () => c.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bundle = state.loadedRegion.status === 'ready' ? state.loadedRegion.bundle : null;
  useEffect(() => {
    if (bundle && clientRef.current) {
      clientRef.current.loadBundle(bundle).catch((e: Error) =>
        dispatch({ type: 'region/failed', error: { stage: 'schema', message: `Worker rejected bundle: ${e.message}`, url: '', layer: null } }),
      );
    }
  }, [bundle, dispatch]);

  const requestRoute = useCallback(() => {
    const c = clientRef.current;
    const id = newRequestId();
    const req = buildRouteRequest(stateRef.current, id);
    if (!c || !req) return;
    dispatch({ type: 'route/requested', requestId: id });
    c.route(req, (response) => dispatch({ type: 'route/update', response }));
  }, [dispatch]);

  const cancelRoute = useCallback(() => clientRef.current?.cancel(), []);

  // Inputs changed while running -> the store detached the request; stop the worker work too.
  useEffect(() => {
    const c = clientRef.current;
    if (c && c.activeRequestId && state.activeRequestId === null) c.cancel(c.activeRequestId);
  }, [state.activeRequestId]);

  return { requestRoute, cancelRoute };
}
