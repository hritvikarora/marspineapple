/**
 * Map Markers Feature Entry. OWNER: Dhani (UI-017).
 * Registers waypoint, outpost, start, and destination marker rendering into 'map-markers' slot.
 */
import type { FeatureModule } from '../../shared/types';
import { MapMarkers } from './MapMarkers';

export default {
  id: 'map-markers',
  slot: 'map-markers',
  Component: MapMarkers,
} satisfies FeatureModule<'map-markers'>;
