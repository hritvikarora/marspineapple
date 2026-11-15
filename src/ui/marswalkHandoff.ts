/**
 * Hand-off from the 2D planner to the Marswalk VR walk (built into `marswalk-vr/`).
 * OWNER: Dhani (UI). Pure functions + one localStorage write; no contract changes.
 *
 * Frames:
 *  - Planner (this app): local planar metres from the bundle's SW corner. Source CRS is the USGS Mars 2020
 *    TRN Equirectangular (Mars 2000 sphere, R = 3396190 m): east_m = (x - x0)·cos(lat_c), north_m = y - y0.
 *  - Marswalk: orthographic projection centred on the site centre (lon0, lat0) of
 *    marswalk/app/public/sites/jezero-delta/site.json; x = east, y = north (metres).
 *  Checked on the six Marswalk stops: the converted points sample the planner's HiRISE DEM within 0.07 m of
 *  the elevation Marswalk stores for them.
 */
import type { GridBundle, LocalPoint, RouteCandidate } from '../contracts';

export const MARSWALK_STORAGE_KEY = 'marswalk:planner-route';
export const MARSWALK_URL = 'marswalk-vr/index.html?planner=1&go=1';

/** Builds the Marswalk VR launch URL for a computed route, spawning at Start facing the path. */
export function buildMarswalkLaunchUrl(
  lang: 'en' | 'it',
  payload: MarswalkPayload | null,
  storedInLocalStorage: boolean,
): string {
  const params = new URLSearchParams({
    planner: '1',
    go: '1',
    lang,
  });
  const base = `marswalk-vr/index.html?${params.toString()}`;
  if (storedInLocalStorage || !payload) return base;
  return `${base}#${MARSWALK_STORAGE_KEY}=${encodeURIComponent(JSON.stringify(payload))}`;
}

const R = 3396190;
/** Marswalk site centre (site.json lon0/lat0), degrees. */
const MW_LON0 = (77.4055 * Math.PI) / 180;
const MW_LAT0 = (18.4555 * Math.PI) / 180;
/** Half-size of Marswalk's detailed (1 m HiRISE) ring: routes must stay inside it. */
const MW_INNER_HALF_M = 800;

export interface MarswalkFrame {
  toMarswalk(p: LocalPoint): [number, number];
  /** Inverse of toMarswalk (orthographic -> equirectangular local metres). */
  fromMarswalk(x: number, y: number): LocalPoint;
}

/** Returns null when the bundle is not on the Mars 2020 TRN grid (e.g. the synthetic fixture). */
export function marswalkFrameFor(bundle: GridBundle): MarswalkFrame | null {
  const m = bundle.manifest;
  const o = m.crs.localOriginInSource;
  if (m.synthetic || !o || !m.crs.sourceCrs?.includes('Equirectangular')) return null;
  const latC = (o.y + (m.grid.extent.south_m + m.grid.extent.north_m) / 2) / R;
  const cosC = Math.cos(latC);
  return {
    toMarswalk(p) {
      const lam = (o.x + p.east_m / cosC) / R;
      const phi = (o.y + p.north_m) / R;
      const d = lam - MW_LON0;
      const x = R * Math.cos(phi) * Math.sin(d);
      const y = R * (Math.cos(MW_LAT0) * Math.sin(phi) - Math.sin(MW_LAT0) * Math.cos(phi) * Math.cos(d));
      return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
    },
    fromMarswalk(x, y) {
      const rho = Math.hypot(x, y);
      const c = Math.asin(rho / R);
      const phi = rho === 0 ? MW_LAT0 : Math.asin(Math.cos(c) * Math.sin(MW_LAT0) + (y * Math.sin(c) * Math.cos(MW_LAT0)) / rho);
      const lam = MW_LON0 + Math.atan2(x * Math.sin(c), rho * Math.cos(MW_LAT0) * Math.cos(c) - y * Math.sin(MW_LAT0) * Math.sin(c));
      return { east_m: (lam * R - o.x) * cosC, north_m: phi * R - o.y };
    },
  };
}

export interface MarswalkLegPayload {
  points: [number, number][];
  length_m: number;
  ascent_m: number;
  maxSlope_deg: number;
}

export interface MarswalkPayload {
  schema: 'marswalk/planner-route@1';
  createdAt: string;
  bundleId: string;
  modelVersion: string;
  policies: string[];
  start: { name: string; x: number; y: number };
  destination: { name: string; x: number; y: number };
  outbound: MarswalkLegPayload;
  /** null when no return leg was planned or it failed (never synthesised from the outbound). */
  returnLeg: MarswalkLegPayload | null;
}

function legPayload(frame: MarswalkFrame, leg: RouteCandidate['outbound']): MarswalkLegPayload {
  const pts: [number, number][] = [];
  let last: [number, number] | null = null;
  leg.path.forEach((p, i) => {
    const q = frame.toMarswalk(p);
    // keep ~1 point every 2 m plus the last one; the walk interpolates between them
    if (!last || i === leg.path.length - 1 || Math.hypot(q[0] - last[0], q[1] - last[1]) >= 2) {
      pts.push(q);
      last = q;
    }
  });
  return {
    points: pts,
    length_m: Math.round(leg.metrics.horizontalDistance_m),
    ascent_m: Math.round(leg.metrics.ascent_m * 10) / 10,
    maxSlope_deg: Math.round(leg.metrics.maxTerrainSlope_deg * 10) / 10,
  };
}

export function buildMarswalkPayload(
  bundle: GridBundle,
  candidate: RouteCandidate,
  names: { start: string; destination: string },
  modelVersion: string,
): MarswalkPayload | null {
  const frame = marswalkFrameFor(bundle);
  if (!frame || candidate.outbound.path.length < 2) return null;
  const outbound = legPayload(frame, candidate.outbound);
  const inside = outbound.points.every(([x, y]) => Math.abs(x) < MW_INNER_HALF_M && Math.abs(y) < MW_INNER_HALF_M);
  if (!inside) return null;
  const a = outbound.points[0];
  const b = outbound.points[outbound.points.length - 1];
  if (!a || !b) return null;
  return {
    schema: 'marswalk/planner-route@1',
    createdAt: new Date().toISOString(),
    bundleId: bundle.manifest.bundleId,
    modelVersion,
    policies: [...candidate.policies],
    start: { name: names.start, x: a[0], y: a[1] },
    destination: { name: names.destination, x: b[0], y: b[1] },
    outbound,
    returnLeg: candidate.returnLeg ? legPayload(frame, candidate.returnLeg) : null,
  };
}

/** Stores the payload for the walk (same origin) and returns true on success. */
export function storeMarswalkPayload(payload: MarswalkPayload): boolean {
  try {
    localStorage.setItem(MARSWALK_STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}
