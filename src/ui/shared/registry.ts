/**
 * Feature Module Discovery and Registry. OWNER: Dhani.
 * Discovers feature entries matching `src/ui/features/<slug>/entry.tsx`.
 */
import type { FeatureModule, FeatureSlot } from './types';

export function discoverFeatures(): Partial<Record<FeatureSlot, FeatureModule>> {
  const discovered: Partial<Record<FeatureSlot, FeatureModule>> = {};

  try {
    const modules = import.meta.glob<{ default: FeatureModule }>('../features/*/entry.tsx', {
      eager: true,
    });

    for (const path in modules) {
      const mod = modules[path]?.default;
      if (mod && mod.slot && mod.Component) {
        if (discovered[mod.slot]) {
          console.warn(`[FeatureRegistry] Duplicate slot assignment for "${mod.slot}" from ${path}. Overwriting previous entry.`);
        }
        discovered[mod.slot] = mod;
      }
    }
  } catch {
    // If glob matching fails or no features exist, return empty discovered map
  }

  return discovered;
}

let cachedFeatures: Partial<Record<FeatureSlot, FeatureModule>> | null = null;

export function getDiscoveredFeatures(): Partial<Record<FeatureSlot, FeatureModule>> {
  if (!cachedFeatures) {
    cachedFeatures = discoverFeatures();
  }
  return cachedFeatures;
}

export function resetFeatureRegistryCache(): void {
  cachedFeatures = null;
}
