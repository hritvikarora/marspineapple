/**
 * Map Rasters Feature Entry. OWNER: Dhani (TASK-008).
 * Registers registered raster terrain layer rendering into 'map-rasters' slot.
 */
import type { FeatureModule } from '../../shared/types';
import { MapRasters } from './MapRasters';

export default {
  id: 'map-rasters',
  slot: 'map-rasters',
  Component: MapRasters,
} satisfies FeatureModule<'map-rasters'>;
