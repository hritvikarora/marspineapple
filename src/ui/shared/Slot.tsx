/**
 * Modular Slot renderer with per-slot error boundary. OWNER: Dhani.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import type { FeatureModule, FeatureRegistryMap, FeatureSlot, SlotPropsMap } from './types';
import { getDiscoveredFeatures } from './registry';

interface SlotErrorBoundaryProps {
  slot: FeatureSlot;
  children: ReactNode;
  fallback?: ReactNode;
}

interface SlotErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class SlotErrorBoundary extends Component<SlotErrorBoundaryProps, SlotErrorBoundaryState> {
  override state: SlotErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): SlotErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[SlotErrorBoundary] Error in slot "${this.props.slot}":`, error, errorInfo);
  }

  override render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div role="alert" className="slot-error error">
            Error loading feature in slot <code>{this.props.slot}</code>: {this.state.error?.message}
          </div>
        )
      );
    }
    return this.props.children;
  }
}

export interface SlotProps<S extends FeatureSlot> {
  name: S;
  props?: SlotPropsMap[S];
  fallback?: ReactNode;
  features?: FeatureRegistryMap;
}

export function Slot<S extends FeatureSlot>({
  name,
  props,
  fallback = null,
  features,
}: SlotProps<S>) {
  const activeFeatures = features ?? getDiscoveredFeatures();
  const feature = activeFeatures[name] as FeatureModule<S> | undefined;

  if (!feature) {
    return <>{fallback}</>;
  }

  const FeatureComponent = feature.Component;
  const featureProps = (props ?? {}) as SlotPropsMap[S];

  return (
    <SlotErrorBoundary slot={name} fallback={fallback}>
      <FeatureComponent {...featureProps} />
    </SlotErrorBoundary>
  );
}
