/**
 * Inspectable app configuration. OWNER: Role C. Anything that changes data selection or model
 * behaviour belongs here (and in the release record), not scattered across components.
 * All VITE_* values are PUBLIC (baked into the static build). The app needs no secrets.
 */
import { MODEL_VERSION } from './routing';

declare const __APP_VERSION__: string;

export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0-test';

/** Expected route model version (must match the worker's). */
export const EXPECTED_MODEL_VERSION = MODEL_VERSION;

type Env = Record<string, string | boolean | undefined>;
const env: Env = (import.meta.env ?? {}) as Env;
const str = (k: string): string | undefined => {
  const v = env[k];
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
};

/** True in `vite build` output. */
export const IS_PRODUCTION_BUILD: boolean = env.PROD === true;

/**
 * Bundle selection (see README "Swapping in the real bundle"). Precedence:
 *   1. VITE_BUNDLE_MANIFEST  – explicit relative/absolute manifest URL
 *   2. VITE_BUNDLE           – bundle id => bundles/<id>/manifest.json
 *   3. public/bundles/index.json – `release` (production build) or `dev` (dev server / tests)
 */
export const BUNDLE_OVERRIDE = {
  manifestUrl: str('VITE_BUNDLE_MANIFEST'),
  bundleId: str('VITE_BUNDLE'),
};
export const BUNDLE_INDEX_URL = 'bundles/index.json';

/** Client-side hard timeout for a route request (ms). */
export const ROUTE_TIMEOUT_MS = 20000;

/**
 * Optional external context imagery (NASA Trek WMTS). OFF by default; routing never waits on it.
 * Enable with VITE_TILES=trek. The template uses {z}/{y}/{x} (WMTS TileMatrix/TileRow/TileCol).
 */
export const TILE_CONFIG = {
  enabled: str('VITE_TILES') === 'trek',
  name: 'NASA Mars Trek — Viking MDIM 2.1 colour mosaic (232 m/px)',
  urlTemplate:
    str('VITE_TILES_URL') ??
    'https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm/{z}/{y}/{x}.jpg',
  timeoutMs: 4000,
  attribution: 'NASA/JPL-Caltech, USGS — via NASA Mars Trek',
};
export type TileConfig = typeof TILE_CONFIG;
