/**
 * Modular Slot renderer with per-slot error boundary. OWNER: Dhani.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import type { FeatureModule, FeatureSlot } from './types';
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

export interface SlotProps<P extends Record<string, unknown> = Record<string, unknown>> {
  name: FeatureSlot;
  fallback?: ReactNode;
  props?: P;
  features?: Partial<Record<FeatureSlot, FeatureModule>>;
}

export function Slot<P extends Record<string, unknown> = Record<string, unknown>>({
  name,
  fallback = null,
  props,
  features,
}: SlotProps<P>) {
  const activeFeatures = features ?? getDiscoveredFeatures();
  const feature = activeFeatures[name];

  if (!feature) {
    return <>{fallback}</>;
  }

  const FeatureComponent = feature.Component;

  return (
    <SlotErrorBoundary slot={name} fallback={fallback}>
      <FeatureComponent {...(props as P)} />
    </SlotErrorBoundary>
  );
}
