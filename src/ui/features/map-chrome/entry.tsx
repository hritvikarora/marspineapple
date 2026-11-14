/**
 * Map Chrome Feature Entry. OWNER: Dhani (TASK-007).
 * Registers boundary, orientation, and scale bar overlays into 'map-chrome' slot.
 */
import type { FeatureModule } from '../../shared/types';
import { MapChrome } from './MapChrome';

export default {
  id: 'map-chrome',
  slot: 'map-chrome',
  Component: MapChrome,
} satisfies FeatureModule<'map-chrome'>;
