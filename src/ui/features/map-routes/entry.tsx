/**
 * Map Routes Feature Entry. OWNER: Dhani (TASK-011).
 * Registers candidate route polylines, hover sync, and return leg rendering into 'map-routes' slot.
 */
import type { FeatureModule } from '../../shared/types';
import { MapRoutes } from './MapRoutes';

export default {
  id: 'map-routes',
  slot: 'map-routes',
  Component: MapRoutes,
} satisfies FeatureModule<'map-routes'>;
