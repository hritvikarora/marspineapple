/**
 * Request Controls Feature Entry. OWNER: Dhani (TASK-006).
 * Registers the route calculation and cancellation controls into 'request-controls' slot.
 */
import type { FeatureModule } from '../../shared/types';
import { RequestControls } from './RequestControls';

export default {
  id: 'request-controls',
  slot: 'request-controls',
  Component: RequestControls,
} satisfies FeatureModule<'request-controls'>;
