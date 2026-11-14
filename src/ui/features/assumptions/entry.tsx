/**
 * Mission Assumptions Feature Entry. OWNER: Dhani (TASK-005).
 * Registers the assumptions controls into the 'assumptions' slot.
 */
import type { FeatureModule } from '../../shared/types';
import { Assumptions } from './Assumptions';

export default {
  id: 'assumptions',
  slot: 'assumptions',
  Component: Assumptions,
} satisfies FeatureModule<'assumptions'>;
