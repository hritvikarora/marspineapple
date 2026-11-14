/**
 * Science Destinations Feature Entry. OWNER: Dhani (TASK-003).
 * Registers the destinations selector into the 'destinations' slot.
 */
import type { FeatureModule } from '../../shared/types';
import { Destinations } from './Destinations';

export default {
  id: 'destinations',
  slot: 'destinations',
  Component: Destinations,
} satisfies FeatureModule<'destinations'>;
