/**
 * TASK-004 Entry Point. OWNER: Dhani (UI Role).
 * Provides the endpoints feature module for automatic discovery.
 */
import type { FeatureModule } from '../../shared/types';
import { EndpointsFeature } from './EndpointsFeature';

export default {
  id: 'endpoints',
  slot: 'endpoints',
  Component: EndpointsFeature,
} satisfies FeatureModule<'endpoints'>;
