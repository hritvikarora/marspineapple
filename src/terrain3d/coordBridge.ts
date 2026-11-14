/**
 * Pure TypeScript coordinate, POI, elevation, corridor-safety, and arrival helpers
 * bridging the Mars Pathfinder local meter frame and the 3D terrain scene.
 *
 * STRICT INVARIANT: ZERO `three` imports so UI components (`StartMenuModal`, `MapCanvas`,
 * `PathfindingVizPanel`) and pure unit tests never pull Three.js into the main entry chunk.
 */

import type {
  GridBundle,
  GridSpec,
  LocalPoint,
  LocalPoint3,
  PointOfInterest,
  RegionManifest,
} from '../contracts';
import { EXCLUSION, pointToCell, toSceneXYZ } from '../contracts';

/**
 * Empirical georeference origin mapping the `jezero-west-hirise-v0.1.0` local meter frame
 * to the Marswalk orthographic VR frame (`lon0 = 77.4055`, `lat0 = 18.4555`):
 * `x_vr = east_m - 586.81`, `y_vr = north_m - 470.15`.
 *
 * NOTE: Valid ONLY for `jezero-west-hirise-v0.1.0` with localOriginInSource `(4587569.0, 1093474.0)`.
 * CRISM texture registration `shiftM: [-180, 204]` MUST NEVER be applied here.
 */
export const JEZERO_VR_OFFSET = {
  eastOrigin_m: 586.81,
  northOrigin_m: 470.15,
} as const;

const HIRISE_BUNDLE_ID = 'jezero-west-hirise-v0.1.0';
const HIRISE_SOURCE_ORIGIN = { x: 4587569.0, y: 1093474.0 } as const;
const HIRISE_CELL_EAST_M = 0.9485670310210961;
const HIRISE_CELL_NORTH_M = 1.0;
const HIRISE_EXTENT_EAST_M = 948.5670310210961;
const HIRISE_EXTENT_NORTH_M = 1000.0;

/** Default EVA terrain slope limit in degrees (matches `EVA_LIMITS.maxTerrainSlope_deg`). */
export const DEFAULT_MAX_SLOPE_DEG = 20;

/** Minimum bundle fields needed to resolve the VR / 3D scene origin frame. */
export type CoordBundleRef = Pick<GridBundle, 'bundleVersion'> & {
  manifest: Pick<RegionManifest, 'bundleId' | 'crs' | 'grid'>;
};

export interface VrPoint2 {
  x_vr: number;
  y_vr: number;
}

export interface VrPoint3 {
  x: number;
  y: number;
  z: number;
}

export interface SceneOrigin {
  east_m: number;
  north_m: number;
  elevation_m: number;
}

export interface UnifiedPoi {
  id: string;
  /** Matching manifest POI id if present in `manifest.pointsOfInterest` (`'poi-p3' | 'poi-p4' | 'poi-p5'`). */
  manifestPoiId: string | null;
  /** Matching `site.json` POI id (`'base' | 'threeforks' | 'nukshak' | 'yori' | 'wildcat' | 'rockytop'`). */
  marswalkPoiId: string | null;
  name: string;
  shortLabel: string;
  kind: 'base' | 'science' | 'sample-depot' | 'outpost' | 'test';
  sol: number | null;
  position: LocalPoint;
  vr: VrPoint2;
  elev_m: number | null;
  summary: string;
  photoUrl: string | null;
  medaTempC?: { min: number; max: number; sol: number };
}

export interface NearestPathSample {
  /** Start vertex index of the nearest polyline segment (`0 .. Math.max(0, path.length - 2)`). */
  segmentIndex: number;
  /** Nearest vertex index along `path` (`t < 0.5 ? segmentIndex : segmentIndex + 1`). */
  nearestVertexIndex: number;
  /** Normalized parameter `0..1` along segment `[segmentIndex, segmentIndex + 1]`. */
  t: number;
  /** Exact projected point along polyline segment or vertex `0` for single-point paths. */
  closestPoint: LocalPoint3;
  /** Horizontal distance in meters from `position` to the active path centerline. */
  horizontalDistance_m: number;
  /** Cumulative horizontal progress ratio `0..1` along route from start to destination. */
  progressFraction: number;
}

export interface DottedProximityHit {
  rejectedId: string;
  label: string;
  reason: string;
  distance_m: number;
  closestPoint: LocalPoint3;
}

export type CorridorOffPathReason = 'corridor-deviation' | 'steep-slope' | 'excluded-cell';

/**
 * Result of pre-step corridor safety evaluation at a proposed position.
 *
 * Note: This is a pre-step cell-level predicate (`exclusion === 0`, `slope <= maxSlope_deg`,
 * and horizontal distance to `activePath`), which is weaker than the routing solver's
 * full inter-cell edge-grade constraint (`|dz| / len <= tan(20 deg)`).
 */
export interface CorridorCheckResult {
  isOffPath: boolean;
  reason: CorridorOffPathReason | null;
  deviation_m: number;
  cellSlope_deg: number | null;
  nearestSafePoint: LocalPoint3 | null;
  nearestPathIndex: number;
}

export interface CorridorCheckOptions {
  maxCorridorDeviation_m?: number;
  maxSlope_deg?: number;
  /** Optional route bundleVersion; if provided and mismatched, `activePathCells` is ignored. */
  routeBundleVersion?: string;
}

export interface ArrivalStatus {
  arrived: boolean;
  distanceToDestination_m: number;
}

/**
 * Returns `true` ONLY when `bundle` matches the exact `jezero-west-hirise-v0.1.0`
 * georeference frame (`localOriginInSource`, extent, and cell spacing) where `JEZERO_VR_OFFSET`
 * `(586.81, 470.15)` holds. Coarse CTX (`jezero-west-ctx20m-v0.1.0`), `synthetic-v0`, and
 * shifted rebuilds return `false` and fall back to bundle midpoint centering.
 */
export function isJezeroHiriseBundle(bundle: CoordBundleRef): boolean {
  const { manifest } = bundle;
  if (manifest.bundleId !== HIRISE_BUNDLE_ID) {
    return false;
  }

  const origin = manifest.crs.localOriginInSource;
  if (
    origin === null ||
    Math.abs(origin.x - HIRISE_SOURCE_ORIGIN.x) > 1e-3 ||
    Math.abs(origin.y - HIRISE_SOURCE_ORIGIN.y) > 1e-3
  ) {
    return false;
  }

  const { extent, cellSizeEast_m, cellSizeNorth_m } = manifest.grid;
  if (
    Math.abs(extent.west_m) > 1e-6 ||
    Math.abs(extent.south_m) > 1e-6 ||
    Math.abs(extent.east_m - HIRISE_EXTENT_EAST_M) > 1e-2 ||
    Math.abs(extent.north_m - HIRISE_EXTENT_NORTH_M) > 1e-2
  ) {
    return false;
  }

  if (
    Math.abs(cellSizeEast_m - HIRISE_CELL_EAST_M) > 1e-3 ||
    Math.abs(cellSizeNorth_m - HIRISE_CELL_NORTH_M) > 1e-3
  ) {
    return false;
  }

  return true;
}

/**
 * Canonical horizontal VR/3D origin `(east_m, north_m)` for `bundle`:
 * `(586.81, 470.15)` on verified `jezero-west-hirise-v0.1.0`, or the bundle extent midpoint
 * on all other bundles (`ctx20m`, `synthetic-v0`, unit test grids).
 */
export function frameForBundle(bundle: CoordBundleRef): LocalPoint {
  if (isJezeroHiriseBundle(bundle)) {
    return {
      east_m: JEZERO_VR_OFFSET.eastOrigin_m,
      north_m: JEZERO_VR_OFFSET.northOrigin_m,
    };
  }
  const { extent } = bundle.manifest.grid;
  return {
    east_m: (extent.west_m + extent.east_m) * 0.5,
    north_m: (extent.south_m + extent.north_m) * 0.5,
  };
}

export function localToVr2ForBundle(point: LocalPoint, bundle: CoordBundleRef): VrPoint2 {
  const origin = frameForBundle(bundle);
  return {
    x_vr: point.east_m - origin.east_m,
    y_vr: point.north_m - origin.north_m,
  };
}

export function vr2ToLocalForBundle(vr: VrPoint2, bundle: CoordBundleRef): LocalPoint {
  const origin = frameForBundle(bundle);
  return {
    east_m: vr.x_vr + origin.east_m,
    north_m: vr.y_vr + origin.north_m,
  };
}

/**
 * Converts local `(east_m, north_m, elevation_m)` to Three.js scene `{ x, y, z }`
 * using `toSceneXYZ` from `src/contracts/grid.ts` shifted by `origin`.
 */
export function localToSceneXYZ(
  point: LocalPoint3,
  origin: SceneOrigin,
  verticalExaggeration = 1,
): VrPoint3 {
  if (!Number.isFinite(verticalExaggeration) || verticalExaggeration === 0) {
    throw new RangeError('verticalExaggeration must be a finite non-zero number');
  }
  const [x, y, z] = toSceneXYZ(
    {
      east_m: point.east_m - origin.east_m,
      north_m: point.north_m - origin.north_m,
    },
    (point.elevation_m - origin.elevation_m) * verticalExaggeration,
  );
  return { x, y, z };
}

/** Convenience wrapper binding the horizontal origin to `frameForBundle(bundle)`. */
export function localToSceneXYZForBundle(
  point: LocalPoint3,
  bundle: CoordBundleRef,
  originElevation_m: number,
  verticalExaggeration = 1,
): VrPoint3 {
  const horizOrigin = frameForBundle(bundle);
  return localToSceneXYZ(
    point,
    {
      east_m: horizOrigin.east_m,
      north_m: horizOrigin.north_m,
      elevation_m: originElevation_m,
    },
    verticalExaggeration,
  );
}

/** Inverse of `localToSceneXYZ`. Rejects zero or non-finite `verticalExaggeration`. */
export function sceneXYZToLocal(
  scene: VrPoint3,
  origin: SceneOrigin,
  verticalExaggeration = 1,
): LocalPoint3 {
  if (!Number.isFinite(verticalExaggeration) || verticalExaggeration === 0) {
    throw new RangeError('verticalExaggeration must be a finite non-zero number');
  }
  return {
    east_m: scene.x + origin.east_m,
    north_m: origin.north_m - scene.z,
    elevation_m: scene.y / verticalExaggeration + origin.elevation_m,
  };
}

/**
 * Cell-size-proportional corridor deviation threshold:
 * `Math.max(6, Math.max(dx_m, dy_m) * 1.5)` (~6 m on 1 m HiRISE, 15 m on 10 m synthetic,
 * 30 m on 20 m CTX).
 */
export function defaultCorridorThresholdForGrid(
  grid: Pick<GridSpec, 'cellSizeEast_m' | 'cellSizeNorth_m'>,
): number {
  const dx = Number.isFinite(grid.cellSizeEast_m) && grid.cellSizeEast_m > 0 ? grid.cellSizeEast_m : 0;
  const dy = Number.isFinite(grid.cellSizeNorth_m) && grid.cellSizeNorth_m > 0 ? grid.cellSizeNorth_m : 0;
  return Math.max(6, Math.max(dx, dy) * 1.5);
}

/**
 * Cell-size-aware destination arrival radius (`8 m` floor on small cells, scaled above half
 * a cell diagonal on coarse grids like 20 m CTX so cell-center route endpoints trigger arrival).
 */
export function defaultArrivalRadiusForGrid(
  grid: Pick<GridSpec, 'cellSizeEast_m' | 'cellSizeNorth_m'>,
): number {
  const dx = Number.isFinite(grid.cellSizeEast_m) && grid.cellSizeEast_m > 0 ? grid.cellSizeEast_m : 0;
  const dy = Number.isFinite(grid.cellSizeNorth_m) && grid.cellSizeNorth_m > 0 ? grid.cellSizeNorth_m : 0;
  if (dx === 0 && dy === 0) {
    return 8;
  }
  return Math.max(8, 0.5 * Math.hypot(dx, dy) + 0.5);
}

/**
 * Bilinear elevation sampling in cell-center index space.
 *
 * Returns `null` when `point` is outside `spec` (via `pointToCell`), when `elevation` length
 * does not match `width * height`, or when the containing cell itself is non-finite (`NaN`),
 * so `NO_DATA` holes are never interpolated over from neighbors. Edge strips where `fc`/`fr`
 * lie within `[-0.5, 0)` or `(N - 1, N - 0.5]` drop out-of-bounds corners and renormalize
 * across valid in-bounds corners without clamping coordinates to cell centers.
 */
export function sampleElevationBilinear(
  spec: GridSpec,
  elevation: Float32Array,
  point: LocalPoint,
): number | null {
  const totalCells = spec.width * spec.height;
  if (elevation.length !== totalCells || spec.width <= 0 || spec.height <= 0) {
    return null;
  }

  const containingCell = pointToCell(spec, point);
  if (containingCell === null) {
    return null;
  }

  const containingVal = elevation[containingCell.index];
  if (containingVal === undefined || !Number.isFinite(containingVal)) {
    return null;
  }

  const fc = (point.east_m - spec.extent.west_m) / spec.cellSizeEast_m - 0.5;
  const fr = (spec.extent.north_m - point.north_m) / spec.cellSizeNorth_m - 0.5;

  const c0 = Math.floor(fc);
  const r0 = Math.floor(fr);
  const tx = fc - c0;
  const ty = fr - r0;

  let weightedSum = 0;
  let weightSum = 0;

  const corners: ReadonlyArray<readonly [number, number, number]> = [
    [r0, c0, (1 - ty) * (1 - tx)],
    [r0, c0 + 1, (1 - ty) * tx],
    [r0 + 1, c0, ty * (1 - tx)],
    [r0 + 1, c0 + 1, ty * tx],
  ];

  for (const [r, c, w] of corners) {
    if (r < 0 || r >= spec.height || c < 0 || c >= spec.width || w <= 0) {
      continue;
    }
    const val = elevation[r * spec.width + c];
    if (val === undefined || !Number.isFinite(val)) {
      continue;
    }
    weightedSum += val * w;
    weightSum += w;
  }

  if (weightSum <= 0) {
    return null;
  }
  return weightedSum / weightSum;
}

interface JezeroPoiMetadata {
  id: string;
  manifestPoiId: string | null;
  marswalkPoiId: string | null;
  name: string;
  shortLabel: string;
  kind: UnifiedPoi['kind'];
  sol: number | null;
  fallbackPosition: LocalPoint;
  summary: string;
  photoUrl: string | null;
  medaTempC?: { min: number; max: number; sol: number };
}

/**
 * Authoritative English metadata for the 7 Jezero HiRISE / Marswalk POIs.
 * Explicitly pairs `wildcat` <-> `poi-p3` and `nukshak` <-> `poi-p4`, while keeping
 * `poi-p5` (sol 686/690 Sample Depot) and `threeforks` (sol 663 traverse stop, 41.5 m SW)
 * strictly distinct.
 */
const JEZERO_HIRISE_POIS: readonly JezeroPoiMetadata[] = [
  {
    id: 'poi-p3',
    manifestPoiId: 'poi-p3',
    marswalkPoiId: 'wildcat',
    name: 'Delta front – Skinner Ridge / Wildcat Ridge (Hawksbill Gap ascent)',
    shortLabel: 'Wildcat / Skinner Ridge',
    kind: 'science',
    sol: 502,
    fallbackPosition: { east_m: 610.687, north_m: 656.7 },
    summary:
      'Delta front scarp where Perseverance climbed through Hawksbill Gap and cored layered sedimentary rocks at Skinner Ridge (Swift Run, Skyland; sols 490/495) and Wildcat Ridge (Hazeltop, Bearwallow; sols 509/516). Fine-grained mudstone/sandstone deposited as a lake dried, with sulfates and SHERLOC organic-molecule signals (NASA/JPL, Sept 2022; not evidence of life).',
    photoUrl: './sites/jezero-delta/photos/wildcat.jpg',
    medaTempC: { min: -71.8, max: -20.5, sol: 484 },
  },
  {
    id: 'poi-p4',
    manifestPoiId: 'poi-p4',
    marswalkPoiId: 'nukshak',
    name: 'Delta front base – Enchanted Lake / Cape Nukshak',
    shortLabel: 'Enchanted Lake / Nukshak',
    kind: 'science',
    sol: 565,
    fallbackPosition: { east_m: 358.558, north_m: 187.2 },
    summary:
      'Base of the western delta front: bright, thinly layered rocks with the delta cliffs behind and sand in between. Cores Shuyak and Mageik (Amalik, sols 575/619) and Kukaklek (Hidden Harbor, sol 631); regolith samples Atmo Mountain and Crosswind Lake (sols 634/639). Interpreted as basal delta-front sediments laid down in standing water.',
    photoUrl: './sites/jezero-delta/photos/nukshak.jpg',
    medaTempC: { min: -87.3, max: -23.6, sol: 565 },
  },
  {
    id: 'poi-p5',
    manifestPoiId: 'poi-p5',
    marswalkPoiId: null,
    name: 'Three Forks Sample Depot (sol 686/690)',
    shortLabel: 'Three Forks Depot (sol 686)',
    kind: 'sample-depot',
    sol: 690,
    fallbackPosition: { east_m: 752.498, north_m: 344.0 },
    summary:
      'Flat, sandy plain on the crater floor at the foot of the delta front where Perseverance deposited ten sealed sample tubes on the surface (Dec 2022–Jan 2023). Position corresponds to JPL rover waypoint sol 686 site 32 drive 1184 (Mastcam-Z 360° #23 and #24).',
    photoUrl: null,
    medaTempC: { min: -84.4, max: -16.8, sol: 690 },
  },
  {
    id: 'threeforks',
    manifestPoiId: null,
    marswalkPoiId: 'threeforks',
    name: 'Three Forks traverse stop (sol 663)',
    shortLabel: 'Three Forks (sol 663)',
    kind: 'science',
    sol: 663,
    fallbackPosition: {
      east_m: JEZERO_VR_OFFSET.eastOrigin_m + 144.97,
      north_m: JEZERO_VR_OFFSET.northOrigin_m - 162.07,
    },
    summary:
      'Crater-floor traverse stop on sol 663, about 41.5 m southwest of the sol 686/690 Three Forks depot waypoint (poi-p5). The ten sealed sample tubes were left at that depot, not at this stop.',
    photoUrl: './sites/jezero-delta/photos/threeforks.jpg',
  },
  {
    id: 'base',
    manifestPoiId: null,
    marswalkPoiId: 'base',
    name: 'Jezero EVA Outpost (Fictional Scenario Base)',
    shortLabel: 'EVA Base (Fictional)',
    kind: 'base',
    sol: 409,
    fallbackPosition: {
      east_m: JEZERO_VR_OFFSET.eastOrigin_m + 276.58,
      north_m: JEZERO_VR_OFFSET.northOrigin_m - 92.1,
    },
    summary:
      'Fictional EVA simulation staging base near the sol 409 rover traverse. Used as the educational mission start/return point; this outpost location is a simulation scenario choice, not a NASA facility.',
    photoUrl: null,
  },
  {
    id: 'yori',
    manifestPoiId: null,
    marswalkPoiId: 'yori',
    name: 'Yori Pass',
    shortLabel: 'Yori Pass',
    kind: 'science',
    sol: 609,
    fallbackPosition: {
      east_m: JEZERO_VR_OFFSET.eastOrigin_m - 356.83,
      north_m: JEZERO_VR_OFFSET.northOrigin_m - 110.01,
    },
    summary:
      'Fine-grained sandstone outcrop at the foot of the delta studied by Perseverance in late 2022 (sol 609). Rocks deposited in calm water are among the best environments for preserving organic molecules.',
    photoUrl: './sites/jezero-delta/photos/yori.jpg',
  },
  {
    id: 'rockytop',
    manifestPoiId: null,
    marswalkPoiId: 'rockytop',
    name: 'Rocky Top',
    shortLabel: 'Rocky Top',
    kind: 'science',
    sol: 709,
    fallbackPosition: {
      east_m: JEZERO_VR_OFFSET.eastOrigin_m - 144.25,
      north_m: JEZERO_VR_OFFSET.northOrigin_m + 365.79,
    },
    summary:
      'High point along the delta-front climb (~50 m above the crater floor base). From here Perseverance began its upper-fan campaign, imaging the layered delta strata from above (sol 709).',
    photoUrl: './sites/jezero-delta/photos/rockytop.jpg',
  },
];

function mapManifestKindToUnified(kind: PointOfInterest['kind']): UnifiedPoi['kind'] {
  switch (kind) {
    case 'outpost':
      return 'outpost';
    case 'test':
      return 'test';
    case 'science-stop':
    case 'context':
    default:
      return 'science';
  }
}

/**
 * Returns the 7 unified POIs on verified `jezero-west-hirise-v0.1.0` (preserving distinct
 * `threeforks` vs `poi-p5` IDs, English captions, `./sites/jezero-delta/photos/...` URLs,
 * and sampled elevation), or maps `bundle.manifest.pointsOfInterest` cleanly for all other
 * bundles (`ctx20m`, `synthetic-v0`, unit test fixtures).
 */
export function getUnifiedPoisForBundle(bundle: GridBundle): UnifiedPoi[] {
  const { grid, pointsOfInterest } = bundle.manifest;

  if (!isJezeroHiriseBundle(bundle)) {
    return pointsOfInterest.map((poi) => ({
      id: poi.id,
      manifestPoiId: poi.id,
      marswalkPoiId: null,
      name: poi.name,
      shortLabel: poi.name,
      kind: mapManifestKindToUnified(poi.kind),
      sol: null,
      position: { ...poi.position },
      vr: localToVr2ForBundle(poi.position, bundle),
      elev_m: sampleElevationBilinear(grid, bundle.elevation, poi.position),
      summary: poi.purpose,
      photoUrl: null,
    }));
  }

  const manifestById = new Map<string, PointOfInterest>();
  for (const poi of pointsOfInterest) {
    manifestById.set(poi.id, poi);
  }

  return JEZERO_HIRISE_POIS.map((meta) => {
    const manifestPoi = meta.manifestPoiId !== null ? manifestById.get(meta.manifestPoiId) : undefined;
    const position: LocalPoint = manifestPoi
      ? { east_m: manifestPoi.position.east_m, north_m: manifestPoi.position.north_m }
      : { ...meta.fallbackPosition };

    const result: UnifiedPoi = {
      id: meta.id,
      manifestPoiId: meta.manifestPoiId,
      marswalkPoiId: meta.marswalkPoiId,
      name: manifestPoi ? manifestPoi.name : meta.name,
      shortLabel: meta.shortLabel,
      kind: meta.kind,
      sol: meta.sol,
      position,
      vr: localToVr2ForBundle(position, bundle),
      elev_m: sampleElevationBilinear(grid, bundle.elevation, position),
      summary: meta.summary,
      photoUrl: meta.photoUrl,
    };

    if (meta.medaTempC !== undefined) {
      result.medaTempC = { ...meta.medaTempC };
    }

    return result;
  });
}

function interpolateElevation(a: LocalPoint3, b: LocalPoint3, t: number): number {
  const aFinite = Number.isFinite(a.elevation_m);
  const bFinite = Number.isFinite(b.elevation_m);
  if (aFinite && bFinite) {
    return a.elevation_m + t * (b.elevation_m - a.elevation_m);
  }
  if (aFinite) {
    return a.elevation_m;
  }
  if (bFinite) {
    return b.elevation_m;
  }
  return Number.NaN;
}

/**
 * Projects `position` horizontally onto the nearest segment of `path`.
 * Returns `null` when `path` is empty or `position` is non-finite.
 */
export function findNearestPointOnPath(
  position: LocalPoint,
  path: readonly LocalPoint3[],
): NearestPathSample | null {
  if (!Number.isFinite(position.east_m) || !Number.isFinite(position.north_m) || path.length === 0) {
    return null;
  }

  if (path.length === 1) {
    const p0 = path[0];
    if (!p0 || !Number.isFinite(p0.east_m) || !Number.isFinite(p0.north_m)) {
      return null;
    }
    return {
      segmentIndex: 0,
      nearestVertexIndex: 0,
      t: 0,
      closestPoint: { ...p0 },
      horizontalDistance_m: Math.hypot(position.east_m - p0.east_m, position.north_m - p0.north_m),
      progressFraction: 0,
    };
  }

  let bestDistSq = Number.POSITIVE_INFINITY;
  let bestSegmentIndex = 0;
  let bestT = 0;
  let bestPoint: LocalPoint3 | null = null;
  let bestCumulativeDist = 0;
  let cumulativeDist = 0;

  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    if (
      !a ||
      !b ||
      !Number.isFinite(a.east_m) ||
      !Number.isFinite(a.north_m) ||
      !Number.isFinite(b.east_m) ||
      !Number.isFinite(b.north_m)
    ) {
      continue;
    }

    const dx = b.east_m - a.east_m;
    const dy = b.north_m - a.north_m;
    const lenSq = dx * dx + dy * dy;
    const segLen = Math.sqrt(lenSq);

    let t = 0;
    let projEast = a.east_m;
    let projNorth = a.north_m;

    if (lenSq > 0) {
      const rawT =
        ((position.east_m - a.east_m) * dx + (position.north_m - a.north_m) * dy) / lenSq;
      t = Math.max(0, Math.min(1, rawT));
      projEast = a.east_m + t * dx;
      projNorth = a.north_m + t * dy;
    }

    const dEast = position.east_m - projEast;
    const dNorth = position.north_m - projNorth;
    const distSq = dEast * dEast + dNorth * dNorth;

    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      bestSegmentIndex = i;
      bestT = t;
      bestPoint = {
        east_m: projEast,
        north_m: projNorth,
        elevation_m: interpolateElevation(a, b, t),
      };
      bestCumulativeDist = cumulativeDist + t * segLen;
    }

    cumulativeDist += segLen;
  }

  if (bestPoint === null) {
    return null;
  }

  return {
    segmentIndex: bestSegmentIndex,
    nearestVertexIndex: bestT < 0.5 ? bestSegmentIndex : bestSegmentIndex + 1,
    t: bestT,
    closestPoint: bestPoint,
    horizontalDistance_m: Math.sqrt(bestDistSq),
    progressFraction: cumulativeDist > 0 ? Math.min(1, Math.max(0, bestCumulativeDist / cumulativeDist)) : 0,
  };
}

/**
 * Finds the closest rejected/alternative corridor within `proximityThreshold_m`
 * (defaults to `18 m`; callers on coarse grids like 20 m CTX should pass
 * `defaultCorridorThresholdForGrid(bundle.manifest.grid)`).
 */
export function findClosestRejectedPath<
  T extends { id: string; label: string; reason: string; path: readonly LocalPoint3[] },
>(
  position: LocalPoint,
  rejectedPaths: readonly T[],
  proximityThreshold_m = 18,
): DottedProximityHit | null {
  if (!Number.isFinite(proximityThreshold_m) || proximityThreshold_m < 0) {
    return null;
  }

  let bestHit: DottedProximityHit | null = null;

  for (const candidate of rejectedPaths) {
    const sample = findNearestPointOnPath(position, candidate.path);
    if (
      sample === null ||
      !Number.isFinite(sample.horizontalDistance_m) ||
      sample.horizontalDistance_m > proximityThreshold_m
    ) {
      continue;
    }
    if (bestHit === null || sample.horizontalDistance_m < bestHit.distance_m) {
      bestHit = {
        rejectedId: candidate.id,
        label: candidate.label,
        reason: candidate.reason,
        distance_m: sample.horizontalDistance_m,
        closestPoint: sample.closestPoint,
      };
    }
  }

  return bestHit;
}

function isCellInActivePath(
  activePathCells: ReadonlySet<number> | readonly number[],
  index: number,
): boolean {
  if (Array.isArray(activePathCells)) {
    return activePathCells.includes(index);
  }
  return (activePathCells as ReadonlySet<number>).has(index);
}

/**
 * Pre-step corridor safety gate at a proposed `position`.
 *
 * Checks (in strict priority order):
 * 1. If `activePath` is empty, returns non-blocking `{ isOffPath: false, reason: null, ... }`
 *    so the player is not soft-locked when no route is active.
 * 2. Cell lookup via `pointToCell`: outside extent -> `'excluded-cell'`.
 * 3. `exclusion[index] !== EXCLUSION.NONE`, non-finite elevation, or non-finite slope -> `'excluded-cell'`.
 * 4. `slope[index] > maxSlope_deg` (default `20°`) -> `'steep-slope'`.
 * 5. Membership in `activePathCells` (unless `options.routeBundleVersion` mismatches) waives
 *    only the horizontal deviation check -> `isOffPath: false`.
 * 6. Horizontal deviation to `activePath` > `maxCorridorDeviation_m`
 *    (default `defaultCorridorThresholdForGrid(bundle.manifest.grid)`) -> `'corridor-deviation'`.
 */
export function checkCorridorSafety(
  position: LocalPoint,
  bundle: GridBundle,
  activePathCells: ReadonlySet<number> | readonly number[],
  activePath: readonly LocalPoint3[],
  options?: CorridorCheckOptions,
): CorridorCheckResult {
  const { grid } = bundle.manifest;
  const totalCells = grid.width * grid.height;
  const maxSlope_deg = options?.maxSlope_deg ?? DEFAULT_MAX_SLOPE_DEG;
  const maxCorridorDeviation_m =
    options?.maxCorridorDeviation_m ?? defaultCorridorThresholdForGrid(grid);

  const cell = pointToCell(grid, position);
  const rawSlope =
    cell !== null && cell.index < bundle.slope.length ? bundle.slope[cell.index] : undefined;
  const cellSlope_deg = rawSlope !== undefined && Number.isFinite(rawSlope) ? rawSlope : null;

  if (activePath.length === 0) {
    return {
      isOffPath: false,
      reason: null,
      deviation_m: 0,
      cellSlope_deg,
      nearestSafePoint: null,
      nearestPathIndex: -1,
    };
  }

  const nearest = findNearestPointOnPath(position, activePath);
  const nearestSafePoint = nearest !== null ? nearest.closestPoint : (activePath[0] ?? null);
  const nearestPathIndex = nearest !== null ? nearest.nearestVertexIndex : 0;
  const deviation_m = nearest !== null ? nearest.horizontalDistance_m : Number.POSITIVE_INFINITY;

  const rastersValid =
    bundle.elevation.length === totalCells &&
    bundle.slope.length === totalCells &&
    bundle.exclusion.length === totalCells;

  if (cell === null || !rastersValid) {
    return {
      isOffPath: true,
      reason: 'excluded-cell',
      deviation_m,
      cellSlope_deg,
      nearestSafePoint,
      nearestPathIndex,
    };
  }

  const excl = bundle.exclusion[cell.index];
  const elev = bundle.elevation[cell.index];
  if (
    excl === undefined ||
    excl !== EXCLUSION.NONE ||
    elev === undefined ||
    !Number.isFinite(elev) ||
    cellSlope_deg === null
  ) {
    return {
      isOffPath: true,
      reason: 'excluded-cell',
      deviation_m,
      cellSlope_deg,
      nearestSafePoint,
      nearestPathIndex,
    };
  }

  if (cellSlope_deg > maxSlope_deg) {
    return {
      isOffPath: true,
      reason: 'steep-slope',
      deviation_m,
      cellSlope_deg,
      nearestSafePoint,
      nearestPathIndex,
    };
  }

  const routeVersionMatches =
    options?.routeBundleVersion === undefined || options.routeBundleVersion === bundle.bundleVersion;
  const cellDiag_m = Math.hypot(grid.cellSizeEast_m, grid.cellSizeNorth_m);
  const onThisCell =
    Number.isFinite(deviation_m) && Number.isFinite(cellDiag_m) && deviation_m <= cellDiag_m;
  if (routeVersionMatches && onThisCell && isCellInActivePath(activePathCells, cell.index)) {
    return {
      isOffPath: false,
      reason: null,
      deviation_m,
      cellSlope_deg,
      nearestSafePoint,
      nearestPathIndex,
    };
  }

  if (!Number.isFinite(deviation_m) || deviation_m > maxCorridorDeviation_m) {
    return {
      isOffPath: true,
      reason: 'corridor-deviation',
      deviation_m,
      cellSlope_deg,
      nearestSafePoint,
      nearestPathIndex,
    };
  }

  return {
    isOffPath: false,
    reason: null,
    deviation_m,
    cellSlope_deg,
    nearestSafePoint,
    nearestPathIndex,
  };
}

/**
 * Checks whether `position` has reached `destination` within `arrivalRadius_m` (default `8 m`).
 * Callers on coarse grids like 20 m CTX should pass `defaultArrivalRadiusForGrid(grid)`.
 */
export function checkArrivalAtDestination(
  position: LocalPoint,
  destination: LocalPoint,
  arrivalRadius_m = 8,
): ArrivalStatus {
  if (
    !Number.isFinite(position.east_m) ||
    !Number.isFinite(position.north_m) ||
    !Number.isFinite(destination.east_m) ||
    !Number.isFinite(destination.north_m)
  ) {
    return {
      arrived: false,
      distanceToDestination_m: Number.POSITIVE_INFINITY,
    };
  }

  const distanceToDestination_m = Math.hypot(
    position.east_m - destination.east_m,
    position.north_m - destination.north_m,
  );
  return {
    arrived: Number.isFinite(arrivalRadius_m) && distanceToDestination_m <= arrivalRadius_m,
    distanceToDestination_m,
  };
}
