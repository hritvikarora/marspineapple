/**
 * Region bundle manifest (what Role A publishes in public/bundles/<bundle>/manifest.json).
 * OWNER: Role C (contract) / Role A (content).
 */
import type { Extent, LocalPoint } from './geometry';

/** Major schema the app understands. A different major is rejected at load time. */
export const SUPPORTED_SCHEMA = 'mars-pathfinder/region-bundle';
export const SUPPORTED_SCHEMA_MAJOR = 1;

export type RasterDType = 'float32' | 'uint8';

/** Required analytical layers. Optional display assets live in `displayAssets`. */
export type RasterLayerId = 'elevation' | 'slope' | 'roughness' | 'quality' | 'exclusion';
export const REQUIRED_LAYERS: readonly RasterLayerId[] = ['elevation', 'slope', 'roughness', 'quality', 'exclusion'];

export interface RasterLayerDescriptor {
  /** File name relative to the manifest URL. No absolute or local filesystem paths. */
  file: string;
  dtype: RasterDType;
  /** Always little-endian. */
  byteOrder: 'little-endian';
  /** Physical unit, e.g. "m", "deg", or "class-code" for categorical rasters. */
  units: string;
  /** Must equal width * height * bytesPerElement(dtype). */
  byteLength: number;
  /** Lowercase hex SHA-256 of the raw file bytes. */
  sha256: string;
  /** How missing values are encoded: "NaN" for float layers, or an integer sentinel for categorical. */
  nodata: 'NaN' | number | null;
  /** Human-readable definition (method, neighbourhood size, etc.). */
  definition: string;
}

/** Quality class codes stored in the `quality` raster (uint8). */
export const QUALITY = {
  NO_ELEVATION: 0,
  GOOD: 1,
  LOW: 2,
  UNKNOWN: 3,
} as const;
export type QualityCode = (typeof QUALITY)[keyof typeof QUALITY];

export interface QualityClassDescriptor {
  code: QualityCode;
  key: 'no-elevation' | 'good' | 'low' | 'unknown';
  label: string;
  /** Original source categories mapped into this class (kept for traceability). */
  sourceCategories: string[];
}

/** Exclusion reason codes stored in the `exclusion` raster (uint8). 0 = admissible by data. */
export const EXCLUSION = {
  NONE: 0,
  MISSING_ELEVATION: 1,
  UNSUPPORTED_DERIVATIVE: 2,
  OUTSIDE_EXTENT: 3,
  MANUAL: 4,
} as const;
export type ExclusionCode = (typeof EXCLUSION)[keyof typeof EXCLUSION];

export interface GridSpec {
  /** Number of columns (west -> east). */
  width: number;
  /** Number of rows (north -> south). */
  height: number;
  cellSizeEast_m: number;
  cellSizeNorth_m: number;
  extent: Extent;
  orientation: 'north-up';
  order: 'row-major';
  sampleConvention: 'cell-center';
}

export interface CoordinateReference {
  /** e.g. "Mars 2000 sphere, equirectangular, clon=77.4E" or "synthetic-local". */
  description: string;
  body: 'Mars' | 'synthetic';
  /** Source CRS WKT / PROJ string if real data; null for synthetic. */
  sourceCrs: string | null;
  /** Local frame origin (east_m=0, north_m=0) expressed in source CRS units, if real. */
  localOriginInSource: { x: number; y: number; units: string } | null;
  verticalReference: string;
  horizontalUnits: 'm';
  verticalUnits: 'm';
}

export interface SourceRecord {
  id: string;
  mission: string;
  instrument: string;
  title: string;
  creator: string;
  url: string;
  version: string;
  rights: string;
  /** What the app visibly uses it for. A bibliography entry is not integration. */
  usedFor: string;
}

export interface PointOfInterest {
  id: string;
  name: string;
  kind: 'outpost' | 'science-stop' | 'context' | 'test';
  position: LocalPoint;
  purpose: string;
  /** true only if `name` is an officially recognised feature name verified by Role A. */
  officialName: boolean;
  /** Horizontal positional confidence (metres), if known. */
  positionalUncertainty_m: number | null;
  sourceIds: string[];
  synthetic: boolean;
}

export interface DisplayAssetDescriptor {
  id: string;
  file: string;
  kind: 'image' | 'panorama' | 'texture';
  /** Optional assets may fail without breaking routing. */
  optional: boolean;
  byteLength: number;
  sha256: string;
  /** Extent the image covers, same local frame as the grid. */
  extent: Extent | null;
  sourceIds: string[];
}

export interface RegionManifest {
  schema: typeof SUPPORTED_SCHEMA;
  /** semver-ish "1.0"; only the major is compatibility-checked. */
  schemaVersion: string;
  bundleId: string;
  /** Changes whenever ANY analytical byte changes. Echoed in every request/response/export. */
  bundleVersion: string;
  /** Version of the processed dataset/preprocessing run. */
  datasetVersion: string;
  synthetic: boolean;
  title: string;
  description: string;
  /** Calendar (Earth) date the bundle was produced, ISO yyyy-mm-dd. Not a Mars sol. */
  createdDate: string;
  crs: CoordinateReference;
  grid: GridSpec;
  layers: Record<RasterLayerId, RasterLayerDescriptor>;
  qualityClasses: QualityClassDescriptor[];
  /** false if the data has no documented quality classes -> strict mode unavailable. */
  strictQualitySupported: boolean;
  pointsOfInterest: PointOfInterest[];
  displayAssets: DisplayAssetDescriptor[];
  sources: SourceRecord[];
  limitations: string[];
  processing: { script: string; parameters: Record<string, string | number | boolean> };
}

export function bytesPerElement(dtype: RasterDType): number {
  return dtype === 'float32' ? 4 : 1;
}
