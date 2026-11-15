/**
 * Layer Controls Feature Entry.
 * Registers visibility and opacity switches into the 'layer-controls' slot.
 */
import type { FeatureModule } from '../../shared/types';
import { LayerControls } from './LayerControls';

export default {
  id: 'layer-controls',
  slot: 'layer-controls',
  Component: LayerControls,
} satisfies FeatureModule<'layer-controls'>;
