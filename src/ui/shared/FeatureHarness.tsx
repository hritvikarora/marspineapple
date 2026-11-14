/**
 * Feature Test Harness. OWNER: Dhani.
 * Allows mounting any single feature module in isolation or inside the real App shell
 * with the other 19 leaves absent.
 */
import { useEffect, type ReactNode } from 'react';
import { EXPECTED_MODEL_VERSION } from '../../config';
import type { GridBundle } from '../../contracts';
import { AppStateProvider } from '../../state/AppStateProvider';
import { useAppState } from '../../state/context';
import { App, type AppDeps } from '../App';
import type { FeatureModule, FeatureRegistryMap, FeatureSlot, SlotPropsMap } from './types';

function BundleInitializer({ bundle }: { bundle?: GridBundle }) {
  const { state, dispatch } = useAppState();
  useEffect(() => {
    if (bundle && state.loadedRegion.status !== 'ready') {
      dispatch({ type: 'region/loaded', bundle });
    }
  }, [bundle, dispatch, state.loadedRegion.status]);
  return null;
}

export interface FeatureHarnessProps<S extends FeatureSlot = FeatureSlot> {
  feature?: FeatureModule<S>;
  slot?: S;
  props?: SlotPropsMap[S];
  children?: ReactNode;
  /** When true, mounts the full App shell with this feature registered into its target slot */
  mountInApp?: boolean;
  appDeps?: AppDeps;
  initialBundle?: GridBundle;
}

export function FeatureHarness<S extends FeatureSlot = FeatureSlot>({
  feature,
  slot,
  props,
  children,
  mountInApp = false,
  appDeps = {},
  initialBundle,
}: FeatureHarnessProps<S>) {
  const Component = feature?.Component;
  const effectiveSlot = (slot ?? feature?.slot) as S | undefined;
  const features: FeatureRegistryMap | undefined =
    feature && effectiveSlot
      ? ({ [effectiveSlot]: feature } as FeatureRegistryMap)
      : undefined;

  const safeWorkerOptions = {
    createWorker: () => {
      let msgHandler: ((ev: MessageEvent) => void) | null = null;
      return {
        get onmessage() {
          return msgHandler;
        },
        set onmessage(fn: ((ev: MessageEvent) => void) | null) {
          msgHandler = fn;
        },
        onerror: null,
        terminate: () => {},
        postMessage: (msg: { type: string; bundle?: { bundleVersion: string } }) => {
          if (msg.type === 'load-bundle' && msg.bundle) {
            const version = msg.bundle.bundleVersion;
            setTimeout(() => {
              msgHandler?.({
                data: { type: 'bundle-loaded', bundleVersion: version },
              } as MessageEvent);
            }, 0);
          }
        },
      };
    },
  };

  const mergedDeps: AppDeps = {
    workerOptions: safeWorkerOptions,
    skipRegionLoader: Boolean(initialBundle),
    ...appDeps,
    features: { ...appDeps.features, ...features },
  };

  return (
    <AppStateProvider modelVersion={EXPECTED_MODEL_VERSION}>
      <BundleInitializer bundle={initialBundle} />
      <div className="feature-harness" data-testid="feature-harness">
        {mountInApp ? (
          <App deps={mergedDeps} />
        ) : (
          children ?? (Component ? <Component {...(props ?? ({} as SlotPropsMap[S]))} /> : null)
        )}
      </div>
    </AppStateProvider>
  );
}
