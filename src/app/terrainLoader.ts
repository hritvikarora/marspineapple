import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { TerrainViewProps } from '../terrain3d/TerrainView';

export type TerrainModule = { default: ComponentType<TerrainViewProps> };
export type TerrainLoader = () => Promise<TerrainModule>;

/** Role B's chunk is only fetched when the 3D view is first opened. */
export const defaultTerrainLoader: TerrainLoader = () => import('../terrain3d/TerrainView');

const cache = new Map<number, WeakMap<TerrainLoader, LazyExoticComponent<ComponentType<TerrainViewProps>>>>();

/**
 * Stable React.lazy component per (loader, attempt). Same identity on every render (so state is
 * kept); a "Retry 3D" bumps `attempt` to get a fresh import after a chunk-load failure.
 */
export function lazyTerrain(load: TerrainLoader, attempt: number) {
  let m = cache.get(attempt);
  if (!m) cache.set(attempt, (m = new WeakMap()));
  let c = m.get(load);
  if (!c) {
    c = lazy(load);
    m.set(load, c);
  }
  return c;
}
