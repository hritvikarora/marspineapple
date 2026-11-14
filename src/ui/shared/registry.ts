/**
 * Feature Module Discovery and Registry. OWNER: Dhani.
 * Discovers feature entries matching `src/ui/features/<slug>/entry.tsx`.
 * Validates modules and rejects duplicate slot registrations.
 */
import type { AnyFeatureModule, FeatureRegistryMap, FeatureSlot } from './types';

export function validateFeatureList(
  modules: readonly AnyFeatureModule[],
): FeatureRegistryMap {
  const map: FeatureRegistryMap = {};
  for (const mod of modules) {
    if (mod && mod.slot && mod.Component) {
      const slot = mod.slot as FeatureSlot;
      if (map[slot]) {
        throw new Error(
          `[FeatureRegistry] Duplicate slot assignment detected: both "${map[slot]?.id}" and "${mod.id}" target slot "${slot}". Duplicate slots are forbidden.`,
        );
      }
      (map as Record<FeatureSlot, unknown>)[slot] = mod;
    }
  }
  return map;
}

export function discoverFeatures(): FeatureRegistryMap {
  try {
    const modules = import.meta.glob<{ default: AnyFeatureModule }>('../features/*/entry.tsx', {
      eager: true,
    });

    const list: AnyFeatureModule[] = [];
    for (const path in modules) {
      const mod = modules[path]?.default;
      if (mod) {
        list.push(mod);
      }
    }
    return validateFeatureList(list);
  } catch (err) {
    if (err instanceof Error && err.message.includes('Duplicate slot assignment')) {
      throw err;
    }
    // If glob matching fails or no features exist, return empty map
    return {};
  }
}

let cachedFeatures: FeatureRegistryMap | null = null;

export function getDiscoveredFeatures(): FeatureRegistryMap {
  if (!cachedFeatures) {
    cachedFeatures = discoverFeatures();
  }
  return cachedFeatures;
}

export function resetFeatureRegistryCache(): void {
  cachedFeatures = null;
}
