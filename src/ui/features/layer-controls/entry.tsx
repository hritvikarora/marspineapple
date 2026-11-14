/**
 * Layer Controls Feature Entry. OWNER: Dhani (TASK-009).
 * Registers the layer visibility/opacity controls and legends into 'layer-controls' slot.
 */
import type { FeatureModule } from '../../shared/types';
import { LayerControls } from './LayerControls';

export default {
  id: 'layer-controls',
  slot: 'layer-controls',
  Component: LayerControls,
} satisfies FeatureModule<'layer-controls'>;
