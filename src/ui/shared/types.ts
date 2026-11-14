/**
 * Shared UI Foundation types. OWNER: Dhani (UI Role).
 * Re-exports canonical contracts and defines strongly-typed modular feature slots.
 */
import type { ComponentType, Dispatch, ReactNode } from 'react';
import type {
  CellRef,
  CoordinateReference,
  DisplayAssetDescriptor,
  EndpointResolution,
  ElevationProfile,
  Extent,
  GridBundle,
  GridSpec,
  LocalPoint,
  LocalPoint3,
  PointOfInterest,
  PolicyWeights,
  QualityCode,
  ExclusionCode,
  RasterLayerDescriptor,
  RasterLayerId,
  RegionManifest,
  ReleaseId,
  RouteCandidate,
  RouteLeg,
  RouteMetrics,
  RoutePolicyId,
  RouteRequest,
  RouteResponse,
  RouteFinalResponse,
} from '../../contracts';
import type {
  Action,
  DisplayState,
  MissionEndpoint,
  MissionInputs,
  RouteRunState,
  SelectionView,
  Terrain3dStatus,
  ViewMode,
} from '../../state/store';

export type {
  CellRef,
  CoordinateReference,
  DisplayAssetDescriptor,
  EndpointResolution,
  ElevationProfile,
  Extent,
  GridBundle,
  GridSpec,
  LocalPoint,
  LocalPoint3,
  PointOfInterest,
  PolicyWeights,
  QualityCode,
  ExclusionCode,
  RasterLayerDescriptor,
  RasterLayerId,
  RegionManifest,
  ReleaseId,
  RouteCandidate,
  RouteLeg,
  RouteMetrics,
  RoutePolicyId,
  RouteRequest,
  RouteResponse,
  RouteFinalResponse,
};

export { EXCLUSION, QUALITY, ROUTE_POLICIES } from '../../contracts';
export { cellCenter, cellIndex, cellRef, pointToCell, toSceneXYZ } from '../../contracts';

export const ALL_FEATURE_SLOTS = [
  'mission-context',
  'destinations',
  'endpoints',
  'assumptions',
  'request-controls',
  'map-chrome',
  'map-rasters',
  'layer-controls',
  'map-markers',
  'map-routes',
  'comparison',
  'profile',
  'mission-evidence',
  'result-state',
  'terrain-host',
  'media',
  'sources',
  'briefing',
  'json-export',
  'point-inspector',
] as const;

export type FeatureSlot = (typeof ALL_FEATURE_SLOTS)[number];

export interface CanvasDrawHelpers {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  pxPerCell: number;
  scaleX: number;
  scaleY: number;
  toPx: (p: LocalPoint) => [number, number];
  fromPx: (px: number, py: number) => LocalPoint;
}

export type CustomCanvasLayer = (helpers: CanvasDrawHelpers) => void;
export type RegisterCanvasLayer = (draw: CustomCanvasLayer) => () => void;

/* --- Strongly-Typed Slot Props Map --- */

export interface MissionContextSlotProps {
  manifest: RegionManifest;
  release: ReleaseId;
  production: boolean;
}

export interface DestinationsSlotProps {
  pois: PointOfInterest[];
  mission: MissionInputs;
  setEndpoint: (which: 'start' | 'destination', point: LocalPoint | null, poiId: string | null) => void;
}

export interface EndpointsSlotProps {
  pickMode: 'start' | 'destination';
  setPickMode: (mode: 'start' | 'destination') => void;
  start: MissionEndpoint | null;
  destination: MissionEndpoint | null;
  grid: GridSpec;
  setEndpoint: (which: 'start' | 'destination', point: LocalPoint | null, poiId: string | null) => void;
}

export interface AssumptionsSlotProps {
  mission: MissionInputs;
  strictQualitySupported: boolean;
  dispatch: Dispatch<Action>;
}

export interface RequestControlsSlotProps {
  requestRoute: () => void;
  cancelRoute: () => void;
  canRequest: boolean;
  canReason?: string;
  isRunning: boolean;
  candidateCount: number;
}

export interface MapChromeSlotProps {
  grid: GridSpec;
  crs: CoordinateReference;
  registerLayer: RegisterCanvasLayer;
}

export interface MapRastersSlotProps {
  bundle: GridBundle;
  layers: DisplayState['layers'];
  registerLayer: RegisterCanvasLayer;
}

export interface LayerControlsSlotProps {
  layers: DisplayState['layers'];
  dispatch: Dispatch<Action>;
}

export interface MapMarkersSlotProps {
  pois: PointOfInterest[];
  start: LocalPoint | null;
  destination: LocalPoint | null;
  poiLayerVisible: boolean;
  onPick: (p: LocalPoint) => void;
  registerLayer: RegisterCanvasLayer;
}

export interface MapRoutesSlotProps {
  candidates: RouteCandidate[];
  selectedCandidateId: string | null;
  stale: boolean;
  hover: { pathIndex: number; distance_m: number; point: LocalPoint3 } | null;
  routeLayerVisible: boolean;
  registerLayer: RegisterCanvasLayer;
}

export interface ComparisonSlotProps {
  candidates: RouteCandidate[];
  selectedCandidateId: string | null;
  dispatch: Dispatch<Action>;
}

export interface ProfileSlotProps {
  selection: SelectionView;
  onHover: (pathIndex: number | null) => void;
}

export interface MissionEvidenceSlotProps {
  selection: SelectionView;
  manifest: RegionManifest;
}

export interface ResultStateSlotProps {
  run: RouteRunState;
  isStale: boolean;
}

export interface TerrainHostSlotProps {
  viewMode: ViewMode;
  bundle: GridBundle;
  candidates: RouteCandidate[];
  selection: SelectionView;
  camera: unknown;
  terrain3dStatus: Terrain3dStatus;
  onCameraChange: (camera: unknown) => void;
  onSelectCandidate: (candidateId: string) => void;
  onStatusChange: (status: Terrain3dStatus) => void;
  fallback: ReactNode;
}

export interface MediaSlotProps {
  displayAssets: DisplayAssetDescriptor[];
}

export interface SourcesSlotProps {
  sources: RegionManifest['sources'];
  limitations: string[];
}

export interface BriefingSlotProps {
  selection: SelectionView;
  release: ReleaseId;
  manifest: RegionManifest;
  mission: MissionInputs;
}

export interface JsonExportSlotProps {
  onExport: () => void;
  canExport: boolean;
}

export interface PointInspectorSlotProps {
  bundle: GridBundle;
  layers: DisplayState['layers'];
}

export interface SlotPropsMap {
  'mission-context': MissionContextSlotProps;
  'destinations': DestinationsSlotProps;
  'endpoints': EndpointsSlotProps;
  'assumptions': AssumptionsSlotProps;
  'request-controls': RequestControlsSlotProps;
  'map-chrome': MapChromeSlotProps;
  'map-rasters': MapRastersSlotProps;
  'layer-controls': LayerControlsSlotProps;
  'map-markers': MapMarkersSlotProps;
  'map-routes': MapRoutesSlotProps;
  'comparison': ComparisonSlotProps;
  'profile': ProfileSlotProps;
  'mission-evidence': MissionEvidenceSlotProps;
  'result-state': ResultStateSlotProps;
  'terrain-host': TerrainHostSlotProps;
  'media': MediaSlotProps;
  'sources': SourcesSlotProps;
  'briefing': BriefingSlotProps;
  'json-export': JsonExportSlotProps;
  'point-inspector': PointInspectorSlotProps;
}

export interface FeatureModule<S extends FeatureSlot = FeatureSlot> {
  id: string;
  slot: S;
  Component: ComponentType<SlotPropsMap[S]>;
}

export type AnyFeatureModule = { [S in FeatureSlot]: FeatureModule<S> }[FeatureSlot];
export type FeatureRegistryMap = { [S in FeatureSlot]?: FeatureModule<S> };
