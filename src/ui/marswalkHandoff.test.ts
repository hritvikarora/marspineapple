import { describe, expect, it } from 'vitest';
import type { GridBundle, RegionManifest } from '../contracts';
import { marswalkFrameFor } from './marswalkHandoff';

import manifestJson from '../../public/bundles/jezero-west-hirise-v0.1.0/manifest.json';
import siteJson from '../../marswalk/app/public/sites/jezero-delta/site.json';

const manifest = manifestJson as unknown as RegionManifest;
const bundle = { manifest } as unknown as GridBundle;

describe('marswalk hand-off frame', () => {
  it('maps planner metres onto the Marswalk stops (site.json x/y) within 0.5 m', () => {
    const f = marswalkFrameFor(bundle)!;
    // Planner positions of P4 (Cape Nukshak) and P3 (Wildcat Ridge) vs Marswalk site.json stops
    const nukshak = f.toMarswalk({ east_m: 358.558, north_m: 187.2 });
    const wildcat = f.toMarswalk({ east_m: 610.687, north_m: 656.7 });
    const site = siteJson as unknown as { pois: { id: string; x: number; y: number }[] };
    const at = (id: string) => site.pois.find((p) => p.id === id)!;
    expect(Math.hypot(nukshak[0] - at('nukshak').x, nukshak[1] - at('nukshak').y)).toBeLessThan(0.5);
    expect(Math.hypot(wildcat[0] - at('wildcat').x, wildcat[1] - at('wildcat').y)).toBeLessThan(0.5);
  });

  it('is unavailable for synthetic bundles', () => {
    expect(marswalkFrameFor({ manifest: { ...manifest, synthetic: true } } as unknown as GridBundle)).toBeNull();
  });
});
