/**
 * Mission Context Feature Entry. OWNER: Dhani (TASK-002).
 * Registers the mission-context feature module into the 'mission-context' slot.
 */
import type { FeatureModule } from '../../shared/types';
import { MissionContext } from './MissionContext';

export default {
  id: 'mission-context',
  slot: 'mission-context',
  Component: MissionContext,
} satisfies FeatureModule<'mission-context'>;
