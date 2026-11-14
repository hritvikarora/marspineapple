/**
 * Inspectable app configuration. OWNER: Role C. Anything that changes data selection or model
 * behaviour belongs here (and in the release record), not scattered across components.
 */
import { MODEL_VERSION } from './routing';

declare const __APP_VERSION__: string;

export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0-test';

/** Expected route model version (must match the worker's). */
export const EXPECTED_MODEL_VERSION = MODEL_VERSION;

/**
 * Bundle manifest URL, RELATIVE to the page (works under any sub-path).
 * Phase 3: switch default to Role A's real bundle; keep synthetic for tests/dev via VITE_BUNDLE.
 */
export const BUNDLE_MANIFEST_URL: string =
  (import.meta.env?.VITE_BUNDLE_MANIFEST as string | undefined) ?? 'bundles/synthetic-v0/manifest.json';

/** Client-side hard timeout for a route request (ms). */
export const ROUTE_TIMEOUT_MS = 20000;
