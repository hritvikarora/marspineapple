/**
 * Shared UI Foundation types. OWNER: Dhani (UI Role).
 * Re-exports canonical types and defines the modular feature slot contract.
 */
import type { ComponentType } from 'react';
import type {
  CellRef,
  DisplayAssetDescriptor,
  EndpointResolution,
  ElevationProfile,
  Extent,
  GridBundle,
  GridSpec,
  LocalPoint,
  LocalPoint3,
  PointOfInterest,
  QualityCode,
  ExclusionCode,
  RasterLayerDescriptor,
  RasterLayerId,
  RegionManifest,
  RouteCandidate,
  RouteLeg,
  RouteMetrics,
  RoutePolicyId,
  RouteRequest,
  RouteResponse,
  RouteFinalResponse,
} from '../../contracts';

export type {
  CellRef,
  DisplayAssetDescriptor,
  EndpointResolution,
  ElevationProfile,
  Extent,
  GridBundle,
  GridSpec,
  LocalPoint,
  LocalPoint3,
  PointOfInterest,
  QualityCode,
  ExclusionCode,
  RasterLayerDescriptor,
  RasterLayerId,
  RegionManifest,
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

export type FeatureSlot =
  | 'mission-context'
  | 'destinations'
  | 'endpoints'
  | 'assumptions'
  | 'request-controls'
  | 'map-chrome'
  | 'map-rasters'
  | 'layer-controls'
  | 'map-markers'
  | 'map-routes'
  | 'comparison'
  | 'profile'
  | 'mission-evidence'
  | 'result-state'
  | 'terrain-host'
  | 'media'
  | 'sources'
  | 'briefing'
  | 'json-export'
  | 'point-inspector';

export interface FeatureModule<P = Record<string, unknown>> {
  id: string;
  slot: FeatureSlot;
  Component: ComponentType<P>;
}
