/**
 * Feature Test Harness. OWNER: Dhani.
 * Allows mounting any single feature module in isolation with the other 19 leaves absent.
 */
import { type ReactNode } from 'react';
import { EXPECTED_MODEL_VERSION } from '../../config';
import { AppStateProvider } from '../../state/AppStateProvider';
import type { FeatureModule, FeatureSlot } from './types';

export interface FeatureHarnessProps<P extends Record<string, unknown> = Record<string, unknown>> {
  feature?: FeatureModule<P>;
  slot?: FeatureSlot;
  props?: P;
  children?: ReactNode;
}

export function FeatureHarness<P extends Record<string, unknown> = Record<string, unknown>>({
  feature,
  props,
  children,
}: FeatureHarnessProps<P>) {
  const FeatureComponent = feature?.Component;

  return (
    <AppStateProvider modelVersion={EXPECTED_MODEL_VERSION}>
      <div className="feature-harness" data-testid="feature-harness">
        {children ?? (FeatureComponent ? <FeatureComponent {...((props ?? {}) as P)} /> : null)}
      </div>
    </AppStateProvider>
  );
}
