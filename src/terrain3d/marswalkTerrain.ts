import * as THREE from 'three';
import type { GridBundle, LocalPoint3, RouteCandidate } from '../contracts';
import { EXCLUSION, QUALITY, pointToCell } from '../contracts';
import {
  JEZERO_VR_OFFSET,
  frameForBundle,
  isJezeroHiriseBundle,
  localToSceneXYZ,
  sampleElevationBilinear,
} from './coordBridge';
import type {
  MarswalkSiteData,
  MarswalkTerrainHandle,
  OverlayLayerId,
  RouteRejectedPathInput,
  SceneOrigin,
  TerrainRingName,
  TerrainRingSpec,
} from './marswalkTypes';

const JEZERO_SITE_BASE_URL = './sites/jezero-delta/';
const SITE_JSON_URL = `${JEZERO_SITE_BASE_URL}site.json`;
const INVALID_ELEV_SENTINEL = -999999.0;
const SKIRT_BLEND_M = 8.0;
const MIN_EXAGGERATION = 0.25;
const MAX_EXAGGERATION = 10.0;
const ROUTE_LIFT_SELECTED_OUTBOUND = 0.35;
const ROUTE_LIFT_SELECTED_RETURN = 0.51;
const ROUTE_LIFT_ALTERNATIVE = 0.26;
const ROUTE_LIFT_REJECTED = 0.42;

const MARS_FOG_LINEAR = new THREE.Color(0.80, 0.63, 0.47);

export interface JezeroTerrainOptions {
  verticalExaggeration?: number;
  signal?: AbortSignal;
  renderer?: THREE.WebGLRenderer;
  skipAsyncTextures?: boolean;
}

export interface ProceduralTerrainOptions {
  verticalExaggeration?: number;
  origin?: Partial<SceneOrigin>;
  originElev_m?: number;
}

export interface RouteOverlaysGroup extends THREE.Group {
  setVerticalExaggeration(exaggeration: number): void;
  dispose(): void;
}

interface CpuSlopeGrid {
  readonly ring: TerrainRingSpec;
  readonly bytes: Uint8Array;
  readonly width: number;
  readonly height: number;
}

interface ClipmapResources {
  readonly meshes: THREE.Mesh[];
  readonly geometries: THREE.BufferGeometry[];
  readonly materials: THREE.ShaderMaterial[];
  readonly textures: THREE.Texture[];
  readonly layers: Array<{
    readonly level: number;
    readonly scale: number;
    readonly center: THREE.Vector2;
    readonly hole: THREE.Vector4;
    readonly uniforms: Record<string, THREE.IUniform<unknown>>;
  }>;
  readonly ringFields: Heightfield[];
  readonly slopeGrids: CpuSlopeGrid[];
  readonly prevCx: Float64Array;
  readonly prevCz: Float64Array;
  readonly prevHalf: Float64Array;
  readonly renderer?: THREE.WebGLRenderer;
}

/** Regular square heightfield used strictly outside bundle extent when Jezero rings load. */
export class Heightfield {
  readonly n: number;
  readonly res: number;
  readonly half: number;
  readonly data: Float32Array;

  constructor(ring: Pick<TerrainRingSpec, 'n' | 'res' | 'half'>, data: Float32Array) {
    this.n = ring.n;
    this.res = ring.res;
    this.half = ring.half;
    this.data = data;
  }

  contains(xVr: number, zVr: number, margin = 0): boolean {
    const h = this.half - margin;
    return Math.abs(xVr) <= h && Math.abs(zVr) <= h;
  }

  height(xVr: number, zVr: number): number {
    if (!this.contains(xVr, zVr)) {
      return Number.NaN;
    }
    const n = this.n;
    const d = this.data;
    const c = Math.min(Math.max((xVr + this.half) / this.res, 0), n - 1.001);
    const r = Math.min(Math.max((zVr + this.half) / this.res, 0), n - 1.001);
    const c0 = c | 0;
    const r0 = r | 0;
    const fc = c - c0;
    const fr = r - r0;
    const i = r0 * n + c0;
    const a = d[i] ?? Number.NaN;
    const b = d[i + 1] ?? a;
    const cVal = d[i + n] ?? a;
    const dVal = d[i + n + 1] ?? a;
    return (a * (1 - fc) + b * fc) * (1 - fr) + (cVal * (1 - fc) + dVal * fc) * fr;
  }

  slopeDeg(xVr: number, zVr: number, eps = 1): number {
    const hx1 = this.height(xVr + eps, zVr);
    const hx0 = this.height(xVr - eps, zVr);
    const hz1 = this.height(xVr, zVr + eps);
    const hz0 = this.height(xVr, zVr - eps);
    if (
      !Number.isFinite(hx1) ||
      !Number.isFinite(hx0) ||
      !Number.isFinite(hz1) ||
      !Number.isFinite(hz0)
    ) {
      return Number.NaN;
    }
    const dx = (hx1 - hx0) / (2 * eps);
    const dz = (hz1 - hz0) / (2 * eps);
    return (Math.atan(Math.hypot(dx, dz)) * 180) / Math.PI;
  }
}

function clampExaggeration(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return 1;
  }
  return Math.min(MAX_EXAGGERATION, Math.max(MIN_EXAGGERATION, value));
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Terrain asset operation aborted', 'AbortError');
  }
}

function createAbortError(): Error {
  return new DOMException('Terrain asset operation aborted', 'AbortError');
}

function computeFallbackElevationDatum(bundle: GridBundle, east_m: number, north_m: number): number {
  const sample = sampleElevationBilinear(bundle.manifest.grid, bundle.elevation, {
    east_m,
    north_m,
  });
  if (sample !== null && Number.isFinite(sample)) {
    return sample;
  }
  const elev = bundle.elevation;
  let sum = 0;
  let count = 0;
  const stride = Math.max(1, Math.floor(elev.length / 4096));
  for (let i = 0; i < elev.length; i += stride) {
    const val = elev[i];
    if (val !== undefined && Number.isFinite(val)) {
      sum += val;
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}

/**
 * Resolves the unified horizontal and vertical datum (`origin` + `h0`) for `bundle`,
 * matching `coordBridge.frameForBundle` (`(586.81, 470.15)` on verified HiRISE, extent midpoint otherwise).
 */
export function resolveTerrainOrigin(
  bundle: GridBundle,
  originOverride?: Partial<SceneOrigin>,
): SceneOrigin {
  const defaultFrame = frameForBundle(bundle);
  const east_m =
    originOverride?.east_m !== undefined && Number.isFinite(originOverride.east_m)
      ? originOverride.east_m
      : defaultFrame.east_m;
  const north_m =
    originOverride?.north_m !== undefined && Number.isFinite(originOverride.north_m)
      ? originOverride.north_m
      : defaultFrame.north_m;
  const elevation_m =
    originOverride?.elevation_m !== undefined && Number.isFinite(originOverride.elevation_m)
      ? originOverride.elevation_m
      : computeFallbackElevationDatum(bundle, east_m, north_m);

  return { east_m, north_m, elevation_m };
}

function layerToInt(layer: OverlayLayerId): number {
  switch (layer) {
    case 'ortho':
      return 0;
    case 'slope':
      return 1;
    case 'minerals':
      return 3;
    case 'thermal':
      return 4;
  }
}

function sampleBundleCellPoint(
  bundle: GridBundle,
  east_m: number,
  north_m: number,
): { cellIdx: number; elev_m: number | null } {
  const { grid, extent } = { grid: bundle.manifest.grid, extent: bundle.manifest.grid.extent };
  const inClosed =
    east_m >= extent.west_m - 1e-6 &&
    east_m <= extent.east_m + 1e-6 &&
    north_m >= extent.south_m - 1e-6 &&
    north_m <= extent.north_m + 1e-6;
  if (!inClosed) {
    return { cellIdx: -1, elev_m: null };
  }

  // Nudge only exact closed boundary lines into the open half-interval `[west, east) x (south, north]`.
  const safeEast = Math.min(Math.max(east_m, extent.west_m), extent.east_m - 1e-5);
  const safeNorth = Math.max(Math.min(north_m, extent.north_m), extent.south_m + 1e-5);
  const cell = pointToCell(grid, { east_m: safeEast, north_m: safeNorth });
  if (cell === null) {
    return { cellIdx: -1, elev_m: null };
  }
  const elev = sampleElevationBilinear(grid, bundle.elevation, {
    east_m: safeEast,
    north_m: safeNorth,
  });
  return { cellIdx: cell.index, elev_m: elev };
}

function sampleSlopeGridDeg(grid: CpuSlopeGrid, xVr: number, zVr: number): number {
  const { ring, bytes, width, height } = grid;
  if (Math.abs(xVr) > ring.half || Math.abs(zVr) > ring.half || width < 1 || height < 1) {
    return Number.NaN;
  }
  const u = (xVr + ring.half) / (2 * ring.half);
  const v = (zVr + ring.half) / (2 * ring.half);
  const col = Math.min(width - 1, Math.max(0, Math.round(u * (width - 1))));
  const row = Math.min(height - 1, Math.max(0, Math.round(v * (height - 1))));
  const byte = bytes[row * width + col];
  if (byte === undefined) {
    return Number.NaN;
  }
  const deg = byte * 0.5;
  return ring.slopeMax !== undefined ? Math.min(ring.slopeMax, deg) : deg;
}

/** Recursively disposes every `BufferGeometry`, `Material`, and texture uniform inside `root`. */
export function disposeObject3DTree(root: THREE.Object3D): void {
  const disposedGeometries = new Set<THREE.BufferGeometry>();
  const disposedMaterials = new Set<THREE.Material>();
  const disposedTextures = new Set<THREE.Texture>();

  const disposeMaterial = (material: THREE.Material): void => {
    if (disposedMaterials.has(material)) {
      return;
    }
    disposedMaterials.add(material);
    const matRecord = material as unknown as Record<string, unknown>;
    for (const val of Object.values(matRecord)) {
      if (val instanceof THREE.Texture && !disposedTextures.has(val)) {
        disposedTextures.add(val);
        val.dispose();
      }
    }
    if ('uniforms' in material) {
      const uniforms = (material as THREE.ShaderMaterial).uniforms;
      for (const uniform of Object.values(uniforms)) {
        if (uniform.value instanceof THREE.Texture && !disposedTextures.has(uniform.value)) {
          disposedTextures.add(uniform.value);
          uniform.value.dispose();
        }
      }
    }
    material.dispose();
  };

  root.traverse((obj) => {
    const maybeMesh = obj as THREE.Mesh | THREE.Line | THREE.Sprite;
    if ('geometry' in maybeMesh && maybeMesh.geometry instanceof THREE.BufferGeometry) {
      if (!disposedGeometries.has(maybeMesh.geometry)) {
        disposedGeometries.add(maybeMesh.geometry);
        maybeMesh.geometry.dispose();
      }
    }
    if ('material' in maybeMesh && maybeMesh.material) {
      if (Array.isArray(maybeMesh.material)) {
        for (const mat of maybeMesh.material) {
          disposeMaterial(mat);
        }
      } else {
        disposeMaterial(maybeMesh.material);
      }
    }
  });
}

const PROCEDURAL_VERT = /* glsl */ `
attribute float aBaseY;
attribute float aSlopeDeg;
attribute float aValid;
attribute float aExcluded;
uniform float uVertExag;
varying float vBaseY;
varying float vSlopeDeg;
varying float vValid;
varying float vExcluded;
varying vec3 vPos;

void main() {
  vec3 pos = vec3(position.x, aBaseY * uVertExag, position.z);
  vBaseY = aBaseY;
  vSlopeDeg = aSlopeDeg;
  vValid = aValid;
  vExcluded = aExcluded;
  vPos = pos;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

const PROCEDURAL_FRAG = /* glsl */ `
uniform int uLayer;
uniform float uMinElev;
uniform float uMaxElev;
varying float vBaseY;
varying float vSlopeDeg;
varying float vValid;
varying float vExcluded;
varying vec3 vPos;

vec3 turbo(float t) {
  t = clamp(t, 0.0, 1.0);
  return clamp(vec3(
    0.1357 + t * (4.5974 - t * (42.3277 - t * (130.5887 - t * (150.5666 - t * 58.1375)))),
    0.0914 + t * (2.1856 - t * (-4.8052 + t * (14.0195 + t * (4.2109 - t * 2.7747)))),
    0.1067 + t * (12.5925 - t * (60.1097 - t * (109.0745 - t * (88.5066 - t * 26.8183))))
  ), 0.0, 1.0);
}

void main() {
  if (vValid < 0.5) {
    discard;
  }
  float span = max(uMaxElev - uMinElev, 1.0);
  float tElev = clamp((vBaseY - uMinElev) / span, 0.0, 1.0);
  vec3 sandy = mix(vec3(0.32, 0.21, 0.14), vec3(0.84, 0.62, 0.44), pow(tElev, 0.85));
  vec3 admissibleTint = mix(sandy, vec3(0.18, 0.56, 0.34), 0.16);
  vec3 col = admissibleTint;

  if (uLayer == 0) {
    if (vExcluded > 0.5) {
      float stripe = step(0.5, fract((vPos.x + vPos.z) * 0.28));
      col = mix(sandy, vec3(0.82, 0.18, 0.16), 0.45 + 0.25 * stripe);
    } else if (vSlopeDeg > 20.0) {
      float stripe = step(0.5, fract((vPos.x - vPos.z) * 0.25));
      col = mix(sandy, vec3(0.92, 0.34, 0.14), 0.38 + 0.24 * stripe);
    }
  } else if (uLayer == 1) {
    if (vSlopeDeg < 0.0) {
      col = mix(sandy, vec3(0.45, 0.42, 0.40), 0.65);
    } else {
      float s = vSlopeDeg;
      vec3 hz = s < 10.0 ? vec3(0.10, 0.75, 0.35)
              : s < 20.0 ? vec3(0.98, 0.85, 0.15)
              : s < 30.0 ? vec3(1.00, 0.50, 0.05)
              : vec3(0.95, 0.08, 0.10);
      col = mix(sandy, hz, 0.65);
    }
  } else if (uLayer == 3) {
    col = mix(sandy, vec3(0.35, 0.68, 0.56), 0.30);
  } else if (uLayer == 4) {
    col = mix(sandy, turbo(tElev), 0.55);
  }

  float contourStep = 5.0;
  float cFrac = vBaseY / contourStep;
  float lineDist = abs(fract(cFrac - 0.5) - 0.5) / max(fwidth(cFrac), 1e-4);
  float contour = 1.0 - smoothstep(0.0, 1.4, lineDist);
  col = mix(col, vec3(0.08, 0.05, 0.04), contour * 0.28);

  float dist = length(vPos);
  col = mix(col, vec3(0.80, 0.63, 0.47), 1.0 - exp(-dist / 9000.0));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

/**
 * Synchronously builds a procedural 3D terrain handle grounded on `bundle.elevation`
 * with physical un-exaggerated `bundle.slope` queries and zero external network fetches.
 */
export function createProceduralTerrainFromBundle(
  bundle: GridBundle,
  options?: ProceduralTerrainOptions,
): MarswalkTerrainHandle {
  const resolvedOrigin = resolveTerrainOrigin(bundle, {
    ...options?.origin,
    elevation_m: options?.originElev_m ?? options?.origin?.elevation_m,
  });

  let verticalExaggeration = clampExaggeration(options?.verticalExaggeration);
  let activeLayer: OverlayLayerId = 'ortho';
  let disposed = false;
  let clipmapResources: ClipmapResources | null = null;
  let clipmapAbort: AbortController | null = null;

  const { grid } = bundle.manifest;
  const { extent, width, height } = grid;

  const totalCells = width * height;
  const segEast =
    totalCells <= 262144 ? Math.max(1, width - 1) : Math.min(360, Math.max(1, width - 1));
  const segNorth =
    totalCells <= 262144 ? Math.max(1, height - 1) : Math.min(360, Math.max(1, height - 1));
  const cols = segEast + 1;
  const rows = segNorth + 1;
  const vertCount = cols * rows;

  const positions = new Float32Array(vertCount * 3);
  const baseY = new Float32Array(vertCount);
  const slopeAttr = new Float32Array(vertCount);
  const validAttr = new Float32Array(vertCount);
  const excludedAttr = new Float32Array(vertCount);

  let minBaseY = Infinity;
  let maxBaseY = -Infinity;

  const eastSpan = Math.max(1e-4, extent.east_m - extent.west_m - 2e-4);
  const northSpan = Math.max(1e-4, extent.north_m - extent.south_m - 2e-4);
  const stepCellC = Math.max(1, Math.floor((width - 1) / segEast));
  const stepCellR = Math.max(1, Math.floor((height - 1) / segNorth));

  for (let r = 0; r < rows; r++) {
    const north = extent.north_m - 1e-4 - (r / segNorth) * northSpan;
    for (let c = 0; c < cols; c++) {
      const east = extent.west_m + 1e-4 + (c / segEast) * eastSpan;
      const idx = r * cols + c;
      const cell = pointToCell(grid, { east_m: east, north_m: north });
      const elev = sampleElevationBilinear(grid, bundle.elevation, { east_m: east, north_m: north });
      const rawSlope = cell !== null ? bundle.slope[cell.index] : undefined;
      const qual = cell !== null ? bundle.quality[cell.index] : undefined;
      const excl = cell !== null ? bundle.exclusion[cell.index] : undefined;

      let neighborhoodValid =
        cell !== null &&
        qual !== undefined &&
        qual !== QUALITY.NO_ELEVATION &&
        excl !== undefined &&
        excl !== EXCLUSION.MISSING_ELEVATION &&
        elev !== null &&
        Number.isFinite(elev);

      if (neighborhoodValid && cell !== null && (stepCellC > 1 || stepCellR > 1)) {
        const rMax = Math.min(height - 1, cell.row + stepCellR - 1);
        const cMax = Math.min(width - 1, cell.col + stepCellC - 1);
        for (let rr = cell.row; rr <= rMax && neighborhoodValid; rr++) {
          for (let cc = cell.col; cc <= cMax; cc++) {
            const cIdx = rr * width + cc;
            const cElev = bundle.elevation[cIdx];
            const cQual = bundle.quality[cIdx];
            const cExcl = bundle.exclusion[cIdx];
            if (
              cElev === undefined ||
              !Number.isFinite(cElev) ||
              cQual === undefined ||
              cQual === QUALITY.NO_ELEVATION ||
              cExcl === undefined ||
              cExcl === EXCLUSION.MISSING_ELEVATION
            ) {
              neighborhoodValid = false;
              break;
            }
          }
        }
      }

      const relElev = neighborhoodValid && elev !== null ? elev - resolvedOrigin.elevation_m : 0;
      const { x: sx, z: sz } = localToSceneXYZ(
        { east_m: east, north_m: north, elevation_m: resolvedOrigin.elevation_m },
        resolvedOrigin,
        1,
      );

      positions[idx * 3] = sx;
      positions[idx * 3 + 1] = 0;
      positions[idx * 3 + 2] = sz;
      baseY[idx] = relElev;
      slopeAttr[idx] = rawSlope !== undefined && Number.isFinite(rawSlope) ? rawSlope : -1;
      validAttr[idx] = neighborhoodValid ? 1 : 0;
      excludedAttr[idx] =
        excl === EXCLUSION.UNSUPPORTED_DERIVATIVE ||
        excl === EXCLUSION.OUTSIDE_EXTENT ||
        excl === EXCLUSION.MANUAL
          ? 1
          : 0;

      if (neighborhoodValid) {
        if (relElev < minBaseY) minBaseY = relElev;
        if (relElev > maxBaseY) maxBaseY = relElev;
      }
    }
  }

  if (!Number.isFinite(minBaseY) || !Number.isFinite(maxBaseY)) {
    minBaseY = -20;
    maxBaseY = 20;
  }

  const indices: number[] = [];
  for (let r = 0; r < segNorth; r++) {
    for (let c = 0; c < segEast; c++) {
      const a = r * cols + c;
      const b = a + 1;
      const cIdx = a + cols;
      const d = cIdx + 1;
      if (
        validAttr[a] === 1 &&
        validAttr[b] === 1 &&
        validAttr[cIdx] === 1 &&
        validAttr[d] === 1
      ) {
        indices.push(a, cIdx, b, b, cIdx, d);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aBaseY', new THREE.BufferAttribute(baseY, 1));
  geometry.setAttribute('aSlopeDeg', new THREE.BufferAttribute(slopeAttr, 1));
  geometry.setAttribute('aValid', new THREE.BufferAttribute(validAttr, 1));
  geometry.setAttribute('aExcluded', new THREE.BufferAttribute(excludedAttr, 1));
  geometry.setIndex(
    vertCount > 65535
      ? new THREE.Uint32BufferAttribute(indices, 1)
      : new THREE.Uint16BufferAttribute(indices, 1),
  );
  geometry.computeBoundingSphere();

  const material = new THREE.ShaderMaterial({
    vertexShader: PROCEDURAL_VERT,
    fragmentShader: PROCEDURAL_FRAG,
    side: THREE.DoubleSide,
    toneMapped: false,
    uniforms: {
      uVertExag: { value: verticalExaggeration },
      uLayer: { value: layerToInt(activeLayer) },
      uMinElev: { value: minBaseY },
      uMaxElev: { value: maxBaseY },
    },
  });

  const proceduralMesh = new THREE.Mesh(geometry, material);
  proceduralMesh.name = 'procedural-terrain-bundle';
  proceduralMesh.frustumCulled = false;

  const group = new THREE.Group();
  group.name = 'marswalk-terrain-group';
  group.add(proceduralMesh);

  const halfEast = Math.max(
    Math.abs(extent.west_m - resolvedOrigin.east_m),
    Math.abs(extent.east_m - resolvedOrigin.east_m),
  );
  const halfNorth = Math.max(
    Math.abs(extent.south_m - resolvedOrigin.north_m),
    Math.abs(extent.north_m - resolvedOrigin.north_m),
  );

  const handle: MarswalkTerrainHandle = {
    group,
    h0: resolvedOrigin.elevation_m,
    maxHalf: Math.max(halfEast, halfNorth),
    isProceduralFallback: true,
    origin: resolvedOrigin,
    get verticalExaggeration(): number {
      return verticalExaggeration;
    },
    heightAtSceneXZ(x: number, z: number): number {
      const east_m = x + resolvedOrigin.east_m;
      const north_m = resolvedOrigin.north_m - z;
      const { cellIdx, elev_m } = sampleBundleCellPoint(bundle, east_m, north_m);
      if (cellIdx >= 0) {
        if (elev_m === null || !Number.isFinite(elev_m)) {
          return Number.NaN;
        }
        return (elev_m - resolvedOrigin.elevation_m) * verticalExaggeration;
      }

      if (clipmapResources !== null) {
        const xVr = east_m - JEZERO_VR_OFFSET.eastOrigin_m;
        const zVr = -(north_m - JEZERO_VR_OFFSET.northOrigin_m);
        let ringElev = Number.NaN;
        for (const field of clipmapResources.ringFields) {
          if (field.contains(xVr, zVr)) {
            const candidate = field.height(xVr, zVr);
            if (Number.isFinite(candidate)) {
              ringElev = candidate;
              break;
            }
          }
        }
        if (Number.isFinite(ringElev)) {
          const dxOut = Math.max(Math.max(extent.west_m - east_m, east_m - extent.east_m), 0);
          const dyOut = Math.max(Math.max(extent.south_m - north_m, north_m - extent.north_m), 0);
          const dOut = Math.max(dxOut, dyOut);
          let finalElev = ringElev;
          if (dOut > 0 && dOut < SKIRT_BLEND_M) {
            const edgeEast = Math.min(Math.max(east_m, extent.west_m + 1e-4), extent.east_m - 1e-4);
            const edgeNorth = Math.min(
              Math.max(north_m, extent.south_m + 1e-4),
              extent.north_m - 1e-4,
            );
            const edgeElev = sampleElevationBilinear(grid, bundle.elevation, {
              east_m: edgeEast,
              north_m: edgeNorth,
            });
            if (edgeElev !== null && Number.isFinite(edgeElev)) {
              const t = dOut / SKIRT_BLEND_M;
              const smooth = t * t * (3 - 2 * t);
              finalElev = edgeElev + (ringElev - edgeElev) * smooth;
            }
          }
          return (finalElev - resolvedOrigin.elevation_m) * verticalExaggeration;
        }
      }

      return Number.NaN;
    },
    slopeDegAtSceneXZ(x: number, z: number): number {
      const east_m = x + resolvedOrigin.east_m;
      const north_m = resolvedOrigin.north_m - z;
      const { cellIdx } = sampleBundleCellPoint(bundle, east_m, north_m);
      if (cellIdx >= 0) {
        const rawSlope = bundle.slope[cellIdx];
        return rawSlope !== undefined && Number.isFinite(rawSlope) ? rawSlope : Number.NaN;
      }

      if (clipmapResources !== null) {
        const xVr = east_m - JEZERO_VR_OFFSET.eastOrigin_m;
        const zVr = -(north_m - JEZERO_VR_OFFSET.northOrigin_m);
        for (const gridSpec of clipmapResources.slopeGrids) {
          const deg = sampleSlopeGridDeg(gridSpec, xVr, zVr);
          if (Number.isFinite(deg)) {
            return deg;
          }
        }
        for (const field of clipmapResources.ringFields) {
          if (field.contains(xVr, zVr)) {
            const deg = field.slopeDeg(xVr, zVr);
            if (Number.isFinite(deg)) {
              return deg;
            }
          }
        }
      }

      return Number.NaN;
    },
    setLayer(layer: OverlayLayerId): void {
      activeLayer = layer;
      if (disposed) {
        return;
      }
      const layerUniform = material.uniforms.uLayer;
      if (layerUniform) {
        layerUniform.value = layerToInt(layer);
      }
      if (clipmapResources !== null) {
        for (const entry of clipmapResources.layers) {
          updateClipmapLayerUniforms(entry.uniforms, layer, clipmapResources.textures);
        }
      }
    },
    setVerticalExaggeration(exaggeration: number): void {
      verticalExaggeration = clampExaggeration(exaggeration);
      if (disposed) {
        return;
      }
      const exagUniform = material.uniforms.uVertExag;
      if (exagUniform) {
        exagUniform.value = verticalExaggeration;
      }
      if (clipmapResources !== null) {
        for (const entry of clipmapResources.layers) {
          const u = entry.uniforms.uVertExag;
          if (u) {
            u.value = verticalExaggeration;
          }
        }
      }
    },
    updateLod(cameraX: number, cameraZ: number): void {
      if (disposed || clipmapResources === null) {
        return;
      }
      const { prevCx, prevCz, prevHalf, layers } = clipmapResources;
      for (let i = 0; i < layers.length; i++) {
        const entry = layers[i]!;
        const snap = 2 * entry.scale;
        const cx = Math.round(cameraX / snap) * snap;
        const cz = Math.round(cameraZ / snap) * snap;
        entry.center.set(cx, cz);
        const holeU = entry.uniforms.uHole;
        if (holeU) {
          if (i > 0) {
            (holeU.value as THREE.Vector4).set(
              prevCx[i - 1] ?? 0,
              prevCz[i - 1] ?? 0,
              (prevHalf[i - 1] ?? 0) - entry.scale * 0.75,
              0,
            );
          } else {
            (holeU.value as THREE.Vector4).set(0, 0, -1, 0);
          }
        }
        prevCx[i] = cx;
        prevCz[i] = cz;
        prevHalf[i] = 64 * entry.scale;
      }
    },
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      clipmapAbort?.abort();
      clipmapAbort = null;
      if (clipmapResources !== null) {
        disposeClipmapResources(clipmapResources);
        clipmapResources = null;
      }
      group.parent?.remove(group);
      disposeObject3DTree(group);
    },
  };

  // Expose private attachment hooks via WeakMap so external APIs remain strictly typed.
  INTERNAL_STATE.set(handle, {
    isDisposed: () => disposed,
    getActiveLayer: () => activeLayer,
    getExaggeration: () => verticalExaggeration,
    registerAbortController: (ctrl: AbortController) => {
      clipmapAbort?.abort();
      clipmapAbort = ctrl;
    },
    installClipmap: (next: ClipmapResources, maxHalf: number) => {
      if (disposed) {
        disposeClipmapResources(next);
        return;
      }
      if (next.renderer) {
        const testScene = new THREE.Scene();
        const testCam = new THREE.PerspectiveCamera(60, 1, 0.5, 50000);
        try {
          for (const mesh of next.meshes) {
            testScene.add(mesh);
          }
          next.renderer.compile(testScene, testCam);
        } catch {
          for (const mesh of next.meshes) {
            testScene.remove(mesh);
          }
          disposeClipmapResources(next);
          return;
        }
        for (const mesh of next.meshes) {
          testScene.remove(mesh);
        }
      }
      if (clipmapResources !== null) {
        disposeClipmapResources(clipmapResources);
      }
      clipmapResources = next;
      if (proceduralMesh.parent === group) {
        group.remove(proceduralMesh);
      }
      geometry.dispose();
      material.dispose();
      for (const mesh of next.meshes) {
        group.add(mesh);
      }
      for (const entry of next.layers) {
        updateClipmapLayerUniforms(entry.uniforms, activeLayer, next.textures);
        const uEx = entry.uniforms.uVertExag;
        if (uEx) {
          uEx.value = verticalExaggeration;
        }
      }
      handle.isProceduralFallback = false;
      handle.maxHalf = maxHalf;
      handle.updateLod(0, 0);
    },
  });

  return handle;
}

interface InternalTerrainHook {
  isDisposed(): boolean;
  getActiveLayer(): OverlayLayerId;
  getExaggeration(): number;
  registerAbortController(ctrl: AbortController): void;
  installClipmap(next: ClipmapResources, maxHalf: number): void;
}

const INTERNAL_STATE = new WeakMap<MarswalkTerrainHandle, InternalTerrainHook>();

function disposeClipmapResources(res: ClipmapResources): void {
  for (const m of res.meshes) {
    m.parent?.remove(m);
  }
  for (const g of res.geometries) {
    g.dispose();
  }
  for (const mat of res.materials) {
    mat.dispose();
  }
  for (const tex of res.textures) {
    tex.dispose();
  }
}

function updateClipmapLayerUniforms(
  uniforms: Record<string, THREE.IUniform<unknown>>,
  layer: OverlayLayerId,
  textures: readonly THREE.Texture[],
): void {
  const uLayer = uniforms.uLayer;
  if (uLayer) {
    uLayer.value = layerToInt(layer);
  }
  const uOverlayOn = uniforms.uOverlayOn;
  const uOverlay = uniforms.uOverlay;
  const uOverlayHalf = uniforms.uOverlayHalf;
  const mineralsTex = textures[6] ?? null;
  const thermalTex = textures[7] ?? null;
  const mineralsHalf = uniforms.uMineralsHalf?.value;
  const thermalHalf = uniforms.uThermalHalf?.value;

  if (layer === 'minerals' && mineralsTex !== null) {
    if (uOverlay) uOverlay.value = mineralsTex;
    if (uOverlayHalf && typeof mineralsHalf === 'number') uOverlayHalf.value = mineralsHalf;
    if (uOverlayOn) uOverlayOn.value = 1;
  } else if (layer === 'thermal' && thermalTex !== null) {
    if (uOverlay) uOverlay.value = thermalTex;
    if (uOverlayHalf && typeof thermalHalf === 'number') uOverlayHalf.value = thermalHalf;
    if (uOverlayOn) uOverlayOn.value = 1;
  } else if (uOverlayOn) {
    uOverlayOn.value = 0;
  }
}

/** Fetches and validates `'./sites/jezero-delta/site.json'` with `AbortSignal` support. */
export async function loadMarswalkSiteJson(signal?: AbortSignal): Promise<MarswalkSiteData> {
  throwIfAborted(signal);
  const response = await fetch(SITE_JSON_URL, { signal });
  throwIfAborted(signal);
  if (!response.ok) {
    throw new Error(`Failed to load ${SITE_JSON_URL}: HTTP ${response.status}`);
  }
  const raw: unknown = await response.json();
  throwIfAborted(signal);
  if (typeof raw !== 'object' || raw === null || !Array.isArray((raw as MarswalkSiteData).rings)) {
    throw new Error(`Invalid site manifest schema in ${SITE_JSON_URL}`);
  }
  return raw as MarswalkSiteData;
}

function canUseWebgl2Clipmaps(renderer?: THREE.WebGLRenderer): boolean {
  if (renderer !== undefined) {
    return renderer.capabilities.isWebGL2 === true;
  }
  if (typeof document === 'undefined') {
    return false;
  }
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2');
  if (!gl) {
    return false;
  }
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return true;
}

function getRingSpec(site: MarswalkSiteData, name: TerrainRingName): TerrainRingSpec | undefined {
  return site.rings.find((ring) => ring.name === name);
}

async function fetchBinaryRingHeightfield(
  ring: TerrainRingSpec,
  signal: AbortSignal,
): Promise<Heightfield> {
  throwIfAborted(signal);
  const url = `${JEZERO_SITE_BASE_URL}${ring.name}_h.bin`;
  const resp = await fetch(url, { signal });
  throwIfAborted(signal);
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${resp.status}`);
  }
  const buf = await resp.arrayBuffer();
  throwIfAborted(signal);
  const expectedCount = ring.n * ring.n;
  const raw = new Uint16Array(buf);
  if (raw.length < expectedCount) {
    throw new Error(`Truncated ring DEM ${url}: got ${raw.length} samples, expected ${expectedCount}`);
  }
  const heights = new Float32Array(expectedCount);
  const hmin = ring.hmin;
  const hscale = ring.hscale;
  for (let i = 0; i < expectedCount; i++) {
    heights[i] = hmin + (raw[i] ?? 0) * hscale;
  }
  return new Heightfield(ring, heights);
}

async function decodeImageFromUrl(
  url: string,
  signal: AbortSignal,
): Promise<{ width: number; height: number; drawToCanvas: (ctx: CanvasRenderingContext2D, dx: number, dy: number, dw: number, dh: number) => void; release: () => void }> {
  throwIfAborted(signal);
  const resp = await fetch(url, { signal });
  throwIfAborted(signal);
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${resp.status}`);
  }
  const blob = await resp.blob();
  throwIfAborted(signal);

  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob);
    if (signal.aborted) {
      bitmap.close();
      throw createAbortError();
    }
    return {
      width: bitmap.width,
      height: bitmap.height,
      drawToCanvas(ctx, dx, dy, dw, dh) {
        ctx.drawImage(bitmap, dx, dy, dw, dh);
      },
      release() {
        bitmap.close();
      },
    };
  }

  const objectUrl = URL.createObjectURL(blob);
  const img = new Image();
  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      img.onload = null;
      img.onerror = null;
      signal.removeEventListener('abort', onAbort);
      URL.revokeObjectURL(objectUrl);
    };
    const onAbort = (): void => {
      cleanup();
      img.src = '';
      reject(createAbortError());
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
    img.onload = () => {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.removeEventListener('abort', onAbort);
      img.onload = null;
      img.onerror = null;
      resolve({
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
        drawToCanvas(ctx, dx, dy, dw, dh) {
          ctx.drawImage(img, dx, dy, dw, dh);
        },
        release() {
          img.src = '';
          URL.revokeObjectURL(objectUrl);
        },
      });
    };
    img.onerror = () => {
      cleanup();
      reject(new Error(`Failed to decode image ${url}`));
    };
    img.src = objectUrl;
  });
}

async function loadOrthoMosaicTexture(
  ring: TerrainRingSpec,
  maxCanvasSide: number,
  signal: AbortSignal,
): Promise<THREE.CanvasTexture> {
  const tiles = Math.max(1, ring.orthoTiles);
  const canvas = document.createElement('canvas');
  canvas.width = maxCanvasSide;
  canvas.height = maxCanvasSide;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('2D canvas unavailable for ortho mosaic compositing');
  }
  const tilePx = maxCanvasSide / tiles;

  for (let ty = 0; ty < tiles; ty++) {
    for (let tx = 0; tx < tiles; tx++) {
      throwIfAborted(signal);
      const url = `${JEZERO_SITE_BASE_URL}${ring.name}_ortho_${tx}_${ty}.jpg`;
      const decoded = await decodeImageFromUrl(url, signal);
      try {
        throwIfAborted(signal);
        decoded.drawToCanvas(ctx, tx * tilePx, ty * tilePx, tilePx, tilePx);
      } finally {
        decoded.release();
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = false;
  tex.colorSpace = THREE.NoColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

const MAX_CLIPMAP_TEXTURE_DIM = 2048;

async function loadSlopeRedTexture(
  ring: TerrainRingSpec,
  signal: AbortSignal,
): Promise<{ texture: THREE.DataTexture; cpu: CpuSlopeGrid }> {
  const url = `${JEZERO_SITE_BASE_URL}${ring.name}_slope.png`;
  const decoded = await decodeImageFromUrl(url, signal);
  try {
    throwIfAborted(signal);
    const targetW = Math.min(decoded.width, MAX_CLIPMAP_TEXTURE_DIM);
    const targetH = Math.min(decoded.height, MAX_CLIPMAP_TEXTURE_DIM);
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('2D canvas unavailable for slope raster decode');
    }
    decoded.drawToCanvas(ctx, 0, 0, targetW, targetH);
    const imgData = ctx.getImageData(0, 0, targetW, targetH);
    const pxCount = targetW * targetH;
    const red = new Uint8Array(pxCount);
    const rgba = imgData.data;
    for (let i = 0; i < pxCount; i++) {
      red[i] = rgba[i * 4] ?? 0;
    }
    const texture = new THREE.DataTexture(
      red,
      targetW,
      targetH,
      THREE.RedFormat,
      THREE.UnsignedByteType,
    );
    texture.unpackAlignment = 1;
    texture.flipY = false;
    texture.colorSpace = THREE.NoColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;
    return {
      texture,
      cpu: { ring, bytes: red, width: targetW, height: targetH },
    };
  } finally {
    decoded.release();
  }
}

async function loadOverlayCanvasTexture(
  fileName: string,
  signal: AbortSignal,
): Promise<THREE.CanvasTexture> {
  const url = `${JEZERO_SITE_BASE_URL}${fileName}`;
  const decoded = await decodeImageFromUrl(url, signal);
  try {
    throwIfAborted(signal);
    const targetW = Math.min(decoded.width, MAX_CLIPMAP_TEXTURE_DIM);
    const targetH = Math.min(decoded.height, MAX_CLIPMAP_TEXTURE_DIM);
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('2D canvas unavailable for overlay raster decode');
    }
    decoded.drawToCanvas(ctx, 0, 0, targetW, targetH);
    const tex = new THREE.CanvasTexture(canvas);
    tex.flipY = false;
    tex.colorSpace = THREE.NoColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    return tex;
  } finally {
    decoded.release();
  }
}

function buildPaddedRingHeightTexture(ring: TerrainRingSpec, heights: Float32Array): THREE.DataTexture {
  const n = ring.n;
  const m = n + 1;
  const pad = new Float32Array(m * m);
  for (let r = 0; r < m; r++) {
    const sr = Math.min(r, n - 1);
    const srcOffset = sr * n;
    pad.set(heights.subarray(srcOffset, srcOffset + n), r * m);
    pad[r * m + n] = heights[srcOffset + n - 1] ?? ring.hmin;
  }
  const tex = new THREE.DataTexture(pad, m, m, THREE.RedFormat, THREE.FloatType);
  tex.flipY = false;
  tex.colorSpace = THREE.NoColorSpace;
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

function buildBundleFloatTexture(
  source: Float32Array,
  width: number,
  height: number,
  sentinel: number,
): THREE.DataTexture {
  const copy = new Float32Array(width * height);
  for (let i = 0; i < copy.length; i++) {
    const v = source[i];
    copy[i] = v !== undefined && Number.isFinite(v) ? v : sentinel;
  }
  const tex = new THREE.DataTexture(copy, width, height, THREE.RedFormat, THREE.FloatType);
  tex.flipY = false;
  tex.colorSpace = THREE.NoColorSpace;
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

function quadrantGeometry(nHalf: number, holeHalf: number, quadrant: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const idMap = new Map<number, number>();
  const rot = (i: number, j: number): [number, number] => {
    switch (quadrant) {
      case 0:
        return [i, j];
      case 1:
        return [-j, i];
      case 2:
        return [-i, -j];
      default:
        return [j, -i];
    }
  };
  const vert = (i: number, j: number): number => {
    const key = i * (nHalf + 1) + j;
    const existing = idMap.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const next = pos.length / 3;
    const [x, z] = rot(i, j);
    pos.push(x, 0, z);
    idMap.set(key, next);
    return next;
  };
  for (let j = 0; j < nHalf; j++) {
    for (let i = 0; i < nHalf; i++) {
      if (i < holeHalf && j < holeHalf) {
        continue;
      }
      const a = vert(i, j);
      const b = vert(i + 1, j);
      const c = vert(i, j + 1);
      const d = vert(i + 1, j + 1);
      idx.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(
    pos.length / 3 > 65535
      ? new THREE.Uint32BufferAttribute(idx, 1)
      : new THREE.Uint16BufferAttribute(idx, 1),
  );
  return geo;
}

const CLIPMAP_VERT = /* glsl */ `
precision highp float;
precision highp sampler2D;

uniform vec3 uRing0;
uniform vec3 uRing1;
uniform vec3 uRing2;
uniform sampler2D uH0;
uniform sampler2D uH1;
uniform sampler2D uH2;
uniform sampler2D uBundleElev;
uniform vec4 uBundleWSEN;
uniform vec2 uBundleCell;
uniform vec2 uBundleDim;
uniform vec2 uOriginEN;
uniform vec2 uJezeroOriginEN;
uniform vec2 uCenter;
uniform float uScale;
uniform float uHRef;
uniform float uVertExag;
uniform float uSkirtM;

varying vec3 vPos;
varying vec2 vVrPos;
varying vec2 vLocalEN;
varying float vH;
varying float vBundleMissing;

float bil(sampler2D t, vec3 R, vec2 pVr) {
  vec2 g = clamp((pVr + R.x) / R.y, vec2(0.0), vec2(R.z - 1.0));
  ivec2 i = min(ivec2(floor(g)), ivec2(int(R.z) - 2));
  vec2 f = g - vec2(i);
  float a = texelFetch(t, i, 0).r;
  float b = texelFetch(t, i + ivec2(1, 0), 0).r;
  float c = texelFetch(t, i + ivec2(0, 1), 0).r;
  float d = texelFetch(t, i + ivec2(1, 1), 0).r;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float sampleRingHeight(vec2 pVr) {
  float m = max(abs(pVr.x), abs(pVr.y));
  if (m <= uRing0.x) return bil(uH0, uRing0, pVr);
  if (m <= uRing1.x) return bil(uH1, uRing1, pVr);
  return bil(uH2, uRing2, pVr);
}

bool sampleBundleBilinear(vec2 en, out float outH) {
  float fc = (en.x - uBundleWSEN.x) / uBundleCell.x - 0.5;
  float fr = (uBundleWSEN.w - en.y) / uBundleCell.y - 0.5;
  int maxC = int(uBundleDim.x) - 1;
  int maxR = int(uBundleDim.y) - 1;
  int cHome = clamp(int(floor((en.x - uBundleWSEN.x) / uBundleCell.x)), 0, maxC);
  int rHome = clamp(int(floor((uBundleWSEN.w - en.y) / uBundleCell.y)), 0, maxR);
  float centerVal = texelFetch(uBundleElev, ivec2(cHome, rHome), 0).r;
  if (centerVal < -100000.0) {
    outH = centerVal;
    return false;
  }

  int c0 = int(floor(fc));
  int r0 = int(floor(fr));
  float wx1 = fc - float(c0);
  float wy1 = fr - float(r0);
  float wx0 = 1.0 - wx1;
  float wy0 = 1.0 - wy1;

  float total = 0.0;
  float weight = 0.0;

  for (int dr = 0; dr <= 1; dr++) {
    int rr = r0 + dr;
    if (rr < 0 || rr > maxR) continue;
    float wy = dr == 0 ? wy0 : wy1;
    for (int dc = 0; dc <= 1; dc++) {
      int cc = c0 + dc;
      if (cc < 0 || cc > maxC) continue;
      float val = texelFetch(uBundleElev, ivec2(cc, rr), 0).r;
      if (val < -100000.0) continue;
      float w = (dc == 0 ? wx0 : wx1) * wy;
      total += val * w;
      weight += w;
    }
  }

  if (weight <= 0.0) {
    outH = centerVal;
    return true;
  }
  outH = total / weight;
  return true;
}

void main() {
  vec2 pScene = uCenter + position.xz * uScale;
  vec2 en = vec2(pScene.x + uOriginEN.x, uOriginEN.y - pScene.y);
  vec2 pVr = vec2(en.x - uJezeroOriginEN.x, -(en.y - uJezeroOriginEN.y));

  float dxOut = max(max(uBundleWSEN.x - en.x, en.x - uBundleWSEN.z), 0.0);
  float dyOut = max(max(uBundleWSEN.y - en.y, en.y - uBundleWSEN.w), 0.0);
  float dOut = max(dxOut, dyOut);

  float hRing = sampleRingHeight(pVr);
  float hFinal = hRing;
  float missing = 0.0;

  if (dOut <= 0.0) {
    float hBundle = uHRef;
    if (sampleBundleBilinear(en, hBundle)) {
      hFinal = hBundle;
    } else {
      missing = 1.0;
      hFinal = uHRef;
    }
  } else if (dOut < uSkirtM) {
    vec2 edgeEN = vec2(
      clamp(en.x, uBundleWSEN.x + 1e-4, uBundleWSEN.z - 1e-4),
      clamp(en.y, uBundleWSEN.y + 1e-4, uBundleWSEN.w - 1e-4)
    );
    float hEdge = hRing;
    if (sampleBundleBilinear(edgeEN, hEdge)) {
      hFinal = mix(hEdge, hRing, smoothstep(0.0, uSkirtM, dOut));
    }
  }

  vH = hFinal;
  vVrPos = pVr;
  vLocalEN = en;
  vBundleMissing = missing;
  vPos = vec3(pScene.x, (hFinal - uHRef) * uVertExag, pScene.y);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(vPos, 1.0);
}
`;

const CLIPMAP_FRAG = /* glsl */ `
precision highp float;
precision highp sampler2D;

uniform vec3 uRing0;
uniform vec3 uRing1;
uniform vec3 uRing2;
uniform sampler2D uO0;
uniform sampler2D uO1;
uniform sampler2D uO2;
uniform sampler2D uS0;
uniform sampler2D uS1;
uniform sampler2D uS2;
uniform sampler2D uBundleSlope;
uniform vec4 uBundleWSEN;
uniform vec2 uBundleCell;
uniform vec2 uBundleDim;
uniform sampler2D uOverlay;
uniform vec4 uHole;
uniform vec3 uSlopeLimits;
uniform vec3 uFogColor;
uniform float uOverlayHalf;
uniform float uOverlayOn;
uniform float uFogDist;
uniform float uDetail;
uniform int uLayer;

varying vec3 vPos;
varying vec2 vVrPos;
varying vec2 vLocalEN;
varying float vH;
varying float vBundleMissing;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

vec3 mars(float g) {
  g = pow(clamp(g, 0.0, 1.0), 0.9);
  return mix(vec3(0.16, 0.085, 0.055), vec3(1.0, 0.76, 0.56), g);
}

void main() {
  if (vBundleMissing > 0.5) {
    discard;
  }
  if (max(abs(vPos.x - uHole.x), abs(vPos.z - uHole.y)) < uHole.z) {
    discard;
  }

  vec2 p = vVrPos;
  float m = max(abs(p.x), abs(p.y));
  if (m > uRing2.x) {
    discard;
  }
  vec2 dx = dFdx(p);
  vec2 dy = dFdy(p);
  float g = 0.5;
  float sDeg = 0.0;
  bool hasSlope = true;

  if (m < uRing0.x) {
    vec2 uv = (p + uRing0.x) / (2.0 * uRing0.x);
    g = textureGrad(uO0, uv, dx / (2.0 * uRing0.x), dy / (2.0 * uRing0.x)).r;
    if (uLayer == 1) {
      sDeg = textureLod(uS0, uv, 0.0).r * 127.5;
    }
  } else if (m < uRing1.x) {
    vec2 uv = (p + uRing1.x) / (2.0 * uRing1.x);
    g = textureGrad(uO1, uv, dx / (2.0 * uRing1.x), dy / (2.0 * uRing1.x)).r;
    if (uLayer == 1) {
      sDeg = textureLod(uS1, uv, 0.0).r * 127.5;
    }
  } else {
    vec2 uv = clamp((p + uRing2.x) / (2.0 * uRing2.x), 0.0, 1.0);
    g = textureGrad(uO2, uv, dx / (2.0 * uRing2.x), dy / (2.0 * uRing2.x)).r;
    if (uLayer == 1) {
      sDeg = textureLod(uS2, uv, 0.0).r * 127.5;
    }
  }

  // Inside the planner bundle rectangle, use exact un-exaggerated bundle slope degrees.
  if (
    uLayer == 1 &&
    vLocalEN.x >= uBundleWSEN.x &&
    vLocalEN.x < uBundleWSEN.z &&
    vLocalEN.y > uBundleWSEN.y &&
    vLocalEN.y <= uBundleWSEN.w
  ) {
    int bc = clamp(int(floor((vLocalEN.x - uBundleWSEN.x) / uBundleCell.x)), 0, int(uBundleDim.x) - 1);
    int br = clamp(int(floor((uBundleWSEN.w - vLocalEN.y) / uBundleCell.y)), 0, int(uBundleDim.y) - 1);
    float bSlope = texelFetch(uBundleSlope, ivec2(bc, br), 0).r;
    if (bSlope >= 0.0) {
      sDeg = bSlope;
    } else {
      hasSlope = false;
    }
  }

  float dist = length(vPos);
  float near = uDetail * (1.0 - smoothstep(4.0, 40.0, dist));
  if (near > 0.0) {
    float n = noise(p * 9.0) * 0.6 + noise(p * 37.0) * 0.4;
    g *= 1.0 + (n - 0.5) * 0.35 * near;
  }

  vec3 col = mars(g);
  float shade = 0.45 + 0.75 * g;

  if (uLayer == 1) {
    if (!hasSlope) {
      col = mix(col, vec3(0.45, 0.42, 0.40) * shade, 0.62);
    } else {
      vec3 c = sDeg < uSlopeLimits.x ? vec3(0.10, 0.75, 0.35)
             : sDeg < uSlopeLimits.y ? vec3(0.98, 0.85, 0.15)
             : sDeg < uSlopeLimits.z ? vec3(1.00, 0.50, 0.05)
             : vec3(0.95, 0.08, 0.10);
      col = mix(col, c * shade, 0.62);
    }
  } else if (uLayer >= 3 && uOverlayOn > 0.5 && m < uOverlayHalf) {
    // Baked north-up overlay pixels (flipY = false): north is +y local => -z scene / -p.y => v = 0.
    vec2 ovUv = (p + uOverlayHalf) / (2.0 * uOverlayHalf);
    vec4 o = textureLod(uOverlay, ovUv, 0.0);
    col = mix(col, o.rgb * shade, o.a * 0.70);
  }

  col = mix(col, uFogColor, 1.0 - exp(-dist / uFogDist));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

/**
 * Asynchronously fetches Jezero NASA HiRISE ortho tiles, physical slope rasters,
 * CRISM mineralogy (with pre-baked `shiftM` intact), THEMIS thermal overlay, and outer
 * DEM `.bin` rings (`inner_nav.png` intentionally ignored) and upgrades `handle` cleanly.
 */
export async function attachJezeroClipmapTextures(
  handle: MarswalkTerrainHandle,
  site: MarswalkSiteData,
  bundle: GridBundle,
  options?: JezeroTerrainOptions,
): Promise<void> {
  const hook = INTERNAL_STATE.get(handle);
  if (!hook || hook.isDisposed()) {
    return;
  }
  if (options?.skipAsyncTextures || !isJezeroHiriseBundle(bundle)) {
    return;
  }
  if (options?.signal?.aborted) {
    throw createAbortError();
  }
  if (typeof fetch !== 'function' || typeof document === 'undefined' || !canUseWebgl2Clipmaps(options?.renderer)) {
    return;
  }

  const innerRing = getRingSpec(site, 'inner');
  const midRing = getRingSpec(site, 'mid');
  const outerRing = getRingSpec(site, 'outer');
  if (!innerRing || !midRing || !outerRing) {
    throw new Error('site.json missing required inner/mid/outer ring specifications');
  }

  const abortController = new AbortController();
  const onParentAbort = (): void => abortController.abort();
  options?.signal?.addEventListener('abort', onParentAbort, { once: true });
  hook.registerAbortController(abortController);
  const sig = abortController.signal;

  const createdTextures: THREE.Texture[] = [];
  const createdGeometries: THREE.BufferGeometry[] = [];
  const createdMaterials: THREE.ShaderMaterial[] = [];

  try {
    const innerField = await fetchBinaryRingHeightfield(innerRing, sig);
    if (hook.isDisposed()) throw createAbortError();
    const midField = await fetchBinaryRingHeightfield(midRing, sig);
    if (hook.isDisposed()) throw createAbortError();
    const outerField = await fetchBinaryRingHeightfield(outerRing, sig);
    if (hook.isDisposed()) throw createAbortError();

    const innerOrtho = await loadOrthoMosaicTexture(innerRing, 2048, sig);
    createdTextures.push(innerOrtho);
    const midOrtho = await loadOrthoMosaicTexture(midRing, 2048, sig);
    createdTextures.push(midOrtho);
    const outerOrtho = await loadOrthoMosaicTexture(outerRing, 2048, sig);
    createdTextures.push(outerOrtho);

    const innerSlope = await loadSlopeRedTexture(innerRing, sig);
    createdTextures.push(innerSlope.texture);
    const midSlope = await loadSlopeRedTexture(midRing, sig);
    createdTextures.push(midSlope.texture);
    const outerSlope = await loadSlopeRedTexture(outerRing, sig);
    createdTextures.push(outerSlope.texture);

    const mineralsFile = site.overlays?.minerals?.file ?? 'minerals.png';
    const mineralsTex = await loadOverlayCanvasTexture(mineralsFile, sig);
    createdTextures.push(mineralsTex);

    const thermalFile = site.overlays?.thermal?.file ?? 'thermal.png';
    const thermalTex = await loadOverlayCanvasTexture(thermalFile, sig);
    createdTextures.push(thermalTex);

    const h0Tex = buildPaddedRingHeightTexture(innerRing, innerField.data);
    createdTextures.push(h0Tex);
    const h1Tex = buildPaddedRingHeightTexture(midRing, midField.data);
    createdTextures.push(h1Tex);
    const h2Tex = buildPaddedRingHeightTexture(outerRing, outerField.data);
    createdTextures.push(h2Tex);

    const { grid } = bundle.manifest;
    const bundleElevTex = buildBundleFloatTexture(
      bundle.elevation,
      grid.width,
      grid.height,
      INVALID_ELEV_SENTINEL,
    );
    createdTextures.push(bundleElevTex);

    const bundleSlopeTex = buildBundleFloatTexture(bundle.slope, grid.width, grid.height, -1.0);
    createdTextures.push(bundleSlopeTex);

    throwIfAborted(sig);
    if (hook.isDisposed()) {
      throw createAbortError();
    }

    const nHalf = 64;
    const holeHalf = nHalf / 2 - 2;
    let levels = 9;
    while (nHalf * (1 << (levels - 1)) < outerRing.half && levels < 14) {
      levels++;
    }
    const fullQuad = [0, 1, 2, 3].map((q) => quadrantGeometry(nHalf, 0, q));
    const ringQuad = [0, 1, 2, 3].map((q) => quadrantGeometry(nHalf, holeHalf, q));
    createdGeometries.push(...fullQuad, ...ringQuad);

    const mineralsHalf = site.overlays?.minerals?.half ?? 3600;
    const thermalHalf = site.overlays?.thermal?.half ?? 14400;

    // Order expected by `updateClipmapLayerUniforms`:
    // [0..2]=ortho, [3..5]=slope, [6]=minerals, [7]=thermal, [8..12]=heights/bundle.
    const orderedTextures: THREE.Texture[] = [
      innerOrtho,
      midOrtho,
      outerOrtho,
      innerSlope.texture,
      midSlope.texture,
      outerSlope.texture,
      mineralsTex,
      thermalTex,
      h0Tex,
      h1Tex,
      h2Tex,
      bundleElevTex,
      bundleSlopeTex,
    ];

    const sharedUniformValues = {
      uRing0: new THREE.Vector3(innerRing.half, innerRing.res, innerRing.n),
      uRing1: new THREE.Vector3(midRing.half, midRing.res, midRing.n),
      uRing2: new THREE.Vector3(outerRing.half, outerRing.res, outerRing.n),
      uBundleWSEN: new THREE.Vector4(
        grid.extent.west_m,
        grid.extent.south_m,
        grid.extent.east_m,
        grid.extent.north_m,
      ),
      uBundleCell: new THREE.Vector2(grid.cellSizeEast_m, grid.cellSizeNorth_m),
      uBundleDim: new THREE.Vector2(grid.width, grid.height),
      uOriginEN: new THREE.Vector2(handle.origin.east_m, handle.origin.north_m),
      uJezeroOriginEN: new THREE.Vector2(
        JEZERO_VR_OFFSET.eastOrigin_m,
        JEZERO_VR_OFFSET.northOrigin_m,
      ),
      uSlopeLimits: new THREE.Vector3(10, 20, 30),
      uFogColor: MARS_FOG_LINEAR,
    };

    const meshes: THREE.Mesh[] = [];
    const layerEntries: ClipmapResources['layers'] = [];

    for (let k = 0; k < levels; k++) {
      const scale = 1 << k;
      const center = new THREE.Vector2();
      const hole = new THREE.Vector4(0, 0, -1, 0);
      const uniforms: Record<string, THREE.IUniform<unknown>> = {
        uRing0: { value: sharedUniformValues.uRing0 },
        uRing1: { value: sharedUniformValues.uRing1 },
        uRing2: { value: sharedUniformValues.uRing2 },
        uH0: { value: h0Tex },
        uH1: { value: h1Tex },
        uH2: { value: h2Tex },
        uO0: { value: innerOrtho },
        uO1: { value: midOrtho },
        uO2: { value: outerOrtho },
        uS0: { value: innerSlope.texture },
        uS1: { value: midSlope.texture },
        uS2: { value: outerSlope.texture },
        uBundleElev: { value: bundleElevTex },
        uBundleSlope: { value: bundleSlopeTex },
        uBundleWSEN: { value: sharedUniformValues.uBundleWSEN },
        uBundleCell: { value: sharedUniformValues.uBundleCell },
        uBundleDim: { value: sharedUniformValues.uBundleDim },
        uOriginEN: { value: sharedUniformValues.uOriginEN },
        uJezeroOriginEN: { value: sharedUniformValues.uJezeroOriginEN },
        uCenter: { value: center },
        uScale: { value: scale },
        uHRef: { value: handle.h0 },
        uVertExag: { value: hook.getExaggeration() },
        uSkirtM: { value: SKIRT_BLEND_M },
        uOverlay: { value: mineralsTex },
        uHole: { value: hole },
        uSlopeLimits: { value: sharedUniformValues.uSlopeLimits },
        uFogColor: { value: sharedUniformValues.uFogColor },
        uOverlayHalf: { value: mineralsHalf },
        uMineralsHalf: { value: mineralsHalf },
        uThermalHalf: { value: thermalHalf },
        uOverlayOn: { value: 0 },
        uFogDist: { value: 9000 },
        uDetail: { value: k < 2 ? 1 : 0 },
        uLayer: { value: layerToInt(hook.getActiveLayer()) },
      };

      const mat = new THREE.ShaderMaterial({
        vertexShader: CLIPMAP_VERT,
        fragmentShader: CLIPMAP_FRAG,
        uniforms,
        side: THREE.DoubleSide,
        toneMapped: false,
      });
      createdMaterials.push(mat);

      const geos = k === 0 ? fullQuad : ringQuad;
      for (let q = 0; q < 4; q++) {
        const g = geos[q];
        if (!g) continue;
        const mesh = new THREE.Mesh(g, mat);
        mesh.name = `clipmap-L${k}-Q${q}`;
        mesh.frustumCulled = false;
        mesh.matrixAutoUpdate = false;
        meshes.push(mesh);
      }

      layerEntries.push({
        level: k,
        scale,
        center,
        hole,
        uniforms,
      });
    }

    hook.installClipmap(
      {
        meshes,
        geometries: createdGeometries,
        materials: createdMaterials,
        textures: orderedTextures,
        layers: layerEntries,
        ringFields: [innerField, midField, outerField],
        slopeGrids: [innerSlope.cpu, midSlope.cpu, outerSlope.cpu],
        prevCx: new Float64Array(levels),
        prevCz: new Float64Array(levels),
        prevHalf: new Float64Array(levels),
        renderer: options?.renderer,
      },
      outerRing.half,
    );
  } catch (err) {
    for (const tex of createdTextures) {
      tex.dispose();
    }
    for (const geo of createdGeometries) {
      geo.dispose();
    }
    for (const mat of createdMaterials) {
      mat.dispose();
    }
    throw err;
  } finally {
    options?.signal?.removeEventListener('abort', onParentAbort);
  }
}

/**
 * Creates a unified Jezero 3D terrain handle grounded on `bundle.elevation`, asynchronously
 * enriching it with NASA HiRISE clipmap textures & outer rings (`isProceduralFallback = false` on success)
 * while preserving safe procedural fallback if WebGL2/assets are unavailable and propagating aborts.
 */
export async function createJezeroTerrain(
  site: MarswalkSiteData,
  bundle: GridBundle,
  origin?: Partial<SceneOrigin>,
  options?: JezeroTerrainOptions,
): Promise<MarswalkTerrainHandle> {
  throwIfAborted(options?.signal);
  const handle = createProceduralTerrainFromBundle(bundle, {
    verticalExaggeration: options?.verticalExaggeration,
    origin,
  });

  if (options?.skipAsyncTextures || !isJezeroHiriseBundle(bundle)) {
    return handle;
  }

  try {
    await attachJezeroClipmapTextures(handle, site, bundle, options);
  } catch (err) {
    if (options?.signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
      handle.dispose();
      throw err;
    }
    // Non-abort texture/asset failure gracefully preserves the working procedural bundle surface.
  }

  return handle;
}

interface DrapedRouteSample {
  readonly pt: LocalPoint3;
  readonly sceneX: number;
  readonly baseY: number;
  readonly sceneZ: number;
  readonly liftScene_m: number;
}

interface DynamicRouteBinding {
  readonly samples: readonly DrapedRouteSample[];
  readonly kind: 'ribbon' | 'line' | 'dashed';
  readonly halfWidth_m: number;
  readonly yOffset_m: number;
  readonly geometry: THREE.BufferGeometry;
  readonly lineRef?: THREE.Line;
}

function interpolateFiniteElevation(a: number, b: number, t: number, fallback: number): number {
  const aOk = Number.isFinite(a);
  const bOk = Number.isFinite(b);
  if (aOk && bOk) return a + (b - a) * t;
  if (aOk) return a;
  if (bOk) return b;
  return fallback;
}

function sampleDrapedPoints(
  bundle: GridBundle,
  origin: SceneOrigin,
  verticalExaggeration: number,
  path: readonly LocalPoint3[],
  liftScene_m: number,
  heightAtSceneXZ?: (x: number, z: number) => number,
): DrapedRouteSample[] {
  if (path.length < 2) {
    return [];
  }
  const { grid } = bundle.manifest;
  const maxStep_m = Math.max(2, Math.min(grid.cellSizeEast_m, grid.cellSizeNorth_m, 4));
  const out: DrapedRouteSample[] = [];
  const maxSubdividedVerts = 2048;

  const evalSample = (pt: LocalPoint3): DrapedRouteSample => {
    const safeElev = Number.isFinite(pt.elevation_m) ? pt.elevation_m : origin.elevation_m;
    const { x: sx, y: rawY, z: sz } = localToSceneXYZ(
      { east_m: pt.east_m, north_m: pt.north_m, elevation_m: safeElev },
      origin,
      verticalExaggeration,
    );
    let baseElevRel = rawY / verticalExaggeration;
    if (heightAtSceneXZ) {
      const h = heightAtSceneXZ(sx, sz);
      if (Number.isFinite(h)) {
        baseElevRel = h / verticalExaggeration;
      }
    } else {
      const elev = sampleElevationBilinear(grid, bundle.elevation, pt);
      if (elev !== null && Number.isFinite(elev)) {
        baseElevRel = elev - origin.elevation_m;
      }
    }
    return {
      pt: { east_m: pt.east_m, north_m: pt.north_m, elevation_m: safeElev },
      sceneX: sx,
      baseY: baseElevRel,
      sceneZ: sz,
      liftScene_m,
    };
  };

  let appendedStart = false;
  for (let i = 0; i < path.length - 1; i++) {
    const p0 = path[i];
    const p1 = path[i + 1];
    if (!p0 || !p1) continue;
    const dist = Math.hypot(p1.east_m - p0.east_m, p1.north_m - p0.north_m);
    if (dist < 1e-4) {
      continue;
    }
    const steps =
      out.length < maxSubdividedVerts
        ? Math.min(16, Math.max(1, Math.ceil(dist / maxStep_m)))
        : 1;

    if (!appendedStart) {
      out.push(evalSample(p0));
      appendedStart = true;
    }
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      out.push(
        evalSample({
          east_m: p0.east_m + (p1.east_m - p0.east_m) * t,
          north_m: p0.north_m + (p1.north_m - p0.north_m) * t,
          elevation_m: interpolateFiniteElevation(
            p0.elevation_m,
            p1.elevation_m,
            t,
            origin.elevation_m,
          ),
        }),
      );
    }
  }
  return out;
}

function samplesToVectors(
  samples: readonly DrapedRouteSample[],
  exaggeration: number,
  extraY = 0,
): THREE.Vector3[] {
  return samples.map(
    (s) => new THREE.Vector3(s.sceneX, s.baseY * exaggeration + s.liftScene_m + extraY, s.sceneZ),
  );
}

function updateBindingExaggeration(
  binding: DynamicRouteBinding,
  exaggeration: number,
  bundle: GridBundle,
  origin: SceneOrigin,
  heightAtSceneXZ?: (x: number, z: number) => number,
): void {
  const posAttr = binding.geometry.getAttribute('position');
  if (!(posAttr instanceof THREE.BufferAttribute)) {
    return;
  }
  const { samples, kind, yOffset_m } = binding;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!;
    let baseRel = s.baseY;
    if (heightAtSceneXZ) {
      const h = heightAtSceneXZ(s.sceneX, s.sceneZ);
      if (Number.isFinite(h)) {
        baseRel = h / exaggeration;
      }
    } else {
      const elev = sampleElevationBilinear(bundle.manifest.grid, bundle.elevation, s.pt);
      if (elev !== null && Number.isFinite(elev)) {
        baseRel = elev - origin.elevation_m;
      }
    }
    const finalY = baseRel * exaggeration + s.liftScene_m + yOffset_m;
    if (kind === 'ribbon') {
      posAttr.setY(i * 2, finalY);
      posAttr.setY(i * 2 + 1, finalY);
    } else {
      posAttr.setY(i, finalY);
    }
  }
  posAttr.needsUpdate = true;
  binding.geometry.computeBoundingSphere();
  if (kind === 'dashed' && binding.lineRef) {
    binding.lineRef.computeLineDistances();
  }
}

function buildFlatRibbonGeometry(
  points: readonly THREE.Vector3[],
  halfWidth_m: number,
): THREE.BufferGeometry | null {
  if (points.length < 2) {
    return null;
  }
  const vertCount = points.length * 2;
  const pos = new Float32Array(vertCount * 3);
  const idx: number[] = [];
  let lastNx = 1;
  let lastNz = 0;

  for (let i = 0; i < points.length; i++) {
    const curr = points[i]!;
    const prev = points[Math.max(0, i - 1)]!;
    const next = points[Math.min(points.length - 1, i + 1)]!;
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const len = Math.hypot(dx, dz);
    if (len > 1e-5) {
      lastNx = -dz / len;
      lastNz = dx / len;
    }

    const base = i * 6;
    pos[base] = curr.x - lastNx * halfWidth_m;
    pos[base + 1] = curr.y;
    pos[base + 2] = curr.z - lastNz * halfWidth_m;
    pos[base + 3] = curr.x + lastNx * halfWidth_m;
    pos[base + 4] = curr.y;
    pos[base + 5] = curr.z + lastNz * halfWidth_m;

    if (i < points.length - 1) {
      const v0 = i * 2;
      idx.push(v0, v0 + 1, v0 + 2, v0 + 1, v0 + 3, v0 + 2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(
    vertCount > 65535
      ? new THREE.Uint32BufferAttribute(idx, 1)
      : new THREE.Uint16BufferAttribute(idx, 1),
  );
  geo.computeBoundingSphere();
  return geo;
}

function parseColorHex(hex: string | undefined, fallback: number): number {
  if (!hex) {
    return fallback;
  }
  const clean = hex.startsWith('#') ? hex.slice(1) : hex;
  const parsed = Number.parseInt(clean, 16);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Renders glowing solid blue selected `outbound` + `returnLeg` ribbons (no horizontal offsets),
 * clickable dimmed alternative candidates (`userData.candidateId`), and dashed `rejectedPaths`
 * (`THREE.LineDashedMaterial` + `computeLineDistances()` + `userData.rejectedId`).
 */
export function createRouteOverlaysGroup(
  bundle: GridBundle,
  origin: SceneOrigin,
  verticalExaggeration: number,
  candidates: readonly RouteCandidate[],
  selectedCandidateId: string | null,
  rejectedPaths?: readonly RouteRejectedPathInput[],
  showRejectedPaths = true,
  heightAtSceneXZ?: (x: number, z: number) => number,
): RouteOverlaysGroup {
  let exag = clampExaggeration(verticalExaggeration);
  const group = new THREE.Group() as RouteOverlaysGroup;
  group.name = 'marswalk-route-overlays';
  const bindings: DynamicRouteBinding[] = [];

  for (const candidate of candidates) {
    const isSelected = candidate.candidateId === selectedCandidateId;

    const addLegRibbon = (
      legPath: readonly LocalPoint3[],
      legKind: 'outbound' | 'returnLeg',
      colorHex: number,
      crestHex: number,
      halfWidth: number,
      lift: number,
      opacity: number,
    ): void => {
      if (legPath.length < 2) {
        return;
      }
      const samples = sampleDrapedPoints(bundle, origin, exag, legPath, lift, heightAtSceneXZ);
      if (samples.length < 2) {
        return;
      }
      const pts = samplesToVectors(samples, exag, 0);
      const ribbonGeo = buildFlatRibbonGeometry(pts, halfWidth);
      if (ribbonGeo) {
        const ribbonMat = new THREE.MeshBasicMaterial({
          color: colorHex,
          transparent: opacity < 1,
          opacity,
          depthWrite: isSelected,
          side: THREE.DoubleSide,
          toneMapped: false,
        });
        const ribbonMesh = new THREE.Mesh(ribbonGeo, ribbonMat);
        ribbonMesh.name = `route-ribbon-${candidate.candidateId}-${legKind}`;
        ribbonMesh.renderOrder = isSelected ? 4 : 2;
        ribbonMesh.userData = {
          candidateId: candidate.candidateId,
          leg: legKind,
        };
        group.add(ribbonMesh);
        bindings.push({
          samples,
          kind: 'ribbon',
          halfWidth_m: halfWidth,
          yOffset_m: 0,
          geometry: ribbonGeo,
        });
      }

      if (isSelected) {
        const linePts = samplesToVectors(samples, exag, 0.04);
        const lineGeo = new THREE.BufferGeometry().setFromPoints(linePts);
        const lineMat = new THREE.LineBasicMaterial({
          color: crestHex,
          toneMapped: false,
        });
        const crestLine = new THREE.Line(lineGeo, lineMat);
        crestLine.name = `route-crest-${candidate.candidateId}-${legKind}`;
        crestLine.renderOrder = 5;
        crestLine.userData = {
          candidateId: candidate.candidateId,
          leg: legKind,
        };
        group.add(crestLine);
        bindings.push({
          samples,
          kind: 'line',
          halfWidth_m: 0,
          yOffset_m: 0.04,
          geometry: lineGeo,
        });
      }
    };

    if (isSelected) {
      addLegRibbon(
        candidate.outbound.path,
        'outbound',
        0x38bdf8,
        0xbae6fd,
        0.58,
        ROUTE_LIFT_SELECTED_OUTBOUND,
        0.95,
      );
      if (candidate.returnLeg !== null && candidate.returnLeg.path.length >= 2) {
        addLegRibbon(
          candidate.returnLeg.path,
          'returnLeg',
          0x6366f1,
          0xc7d2fe,
          0.38,
          ROUTE_LIFT_SELECTED_RETURN,
          0.95,
        );
      }
    } else {
      addLegRibbon(
        candidate.outbound.path,
        'outbound',
        0x64748b,
        0x94a3b8,
        0.44,
        ROUTE_LIFT_ALTERNATIVE,
        0.38,
      );
      if (candidate.returnLeg !== null && candidate.returnLeg.path.length >= 2) {
        addLegRibbon(
          candidate.returnLeg.path,
          'returnLeg',
          0x64748b,
          0x94a3b8,
          0.32,
          ROUTE_LIFT_ALTERNATIVE + 0.08,
          0.34,
        );
      }
    }
  }

  if (showRejectedPaths && rejectedPaths) {
    for (const rejected of rejectedPaths) {
      if (rejected.path.length < 2) {
        continue;
      }
      const samples = sampleDrapedPoints(
        bundle,
        origin,
        exag,
        rejected.path,
        ROUTE_LIFT_REJECTED,
        heightAtSceneXZ,
      );
      if (samples.length < 2) {
        continue;
      }
      const pts = samplesToVectors(samples, exag, 0);

      const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
      const lineMat = new THREE.LineDashedMaterial({
        color: parseColorHex(rejected.colorHex, 0xf97316),
        dashSize: 2.2,
        gapSize: 1.4,
        transparent: true,
        opacity: 0.88,
        toneMapped: false,
      });
      const dashedLine = new THREE.Line(lineGeo, lineMat);
      dashedLine.computeLineDistances();
      dashedLine.name = `rejected-route-${rejected.id}`;
      dashedLine.renderOrder = 6;
      dashedLine.userData = {
        rejectedId: rejected.id,
        label: rejected.label,
        reason: rejected.reason,
      };
      group.add(dashedLine);
      bindings.push({
        samples,
        kind: 'dashed',
        halfWidth_m: 0,
        yOffset_m: 0,
        geometry: lineGeo,
        lineRef: dashedLine,
      });

      // Invisible wider ribbon collider so desktop raycasting works cleanly on 1px WebGL lines.
      const pickGeo = buildFlatRibbonGeometry(pts, 0.85);
      if (pickGeo) {
        const pickMat = new THREE.MeshBasicMaterial({
          transparent: true,
          opacity: 0,
          depthWrite: false,
          colorWrite: false,
          side: THREE.DoubleSide,
        });
        const pickMesh = new THREE.Mesh(pickGeo, pickMat);
        pickMesh.name = `rejected-pick-${rejected.id}`;
        pickMesh.userData = {
          rejectedId: rejected.id,
          label: rejected.label,
          reason: rejected.reason,
        };
        group.add(pickMesh);
        bindings.push({
          samples,
          kind: 'ribbon',
          halfWidth_m: 0.85,
          yOffset_m: 0,
          geometry: pickGeo,
        });
      }
    }
  }

  group.setVerticalExaggeration = (nextExaggeration: number): void => {
    exag = clampExaggeration(nextExaggeration);
    for (const binding of bindings) {
      updateBindingExaggeration(binding, exag, bundle, origin, heightAtSceneXZ);
    }
  };

  group.dispose = (): void => {
    bindings.length = 0;
    group.parent?.remove(group);
    disposeObject3DTree(group);
  };

  return group;
}
