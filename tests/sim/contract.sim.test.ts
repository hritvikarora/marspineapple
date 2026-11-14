/**
 * Contract/property tests for generated bundles: every scenario and random terrain must load through
 * the production loader; targeted corruptions must fail at the right, named stage.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { EXCLUSION, QUALITY } from '../../src/contracts';
import { BundleLoadError, loadAndValidateBundle } from '../../src/data/loadBundle';
import {
  FUZZ_FAMILIES,
  SCENARIO_IDS,
  buildRandomTerrain,
  buildScenario,
  simFetch,
  type ScenarioInstance,
  type SimBundle,
} from '../../src/sim';

const enc = new TextEncoder();
let scenarios: ScenarioInstance[];
beforeAll(async () => {
  scenarios = await Promise.all(SCENARIO_IDS.map((id) => buildScenario(id)));
});

async function loadErr(b: SimBundle, override: Parameters<typeof simFetch>[1]): Promise<BundleLoadError> {
  try {
    await loadAndValidateBundle(b.manifestUrl, { fetchImpl: simFetch([b], override) });
  } catch (e) {
    expect(e).toBeInstanceOf(BundleLoadError);
    return e as BundleLoadError;
  }
  throw new Error('expected the bundle to be rejected');
}

function withManifest(b: SimBundle, edit: (m: Record<string, unknown>) => void): Parameters<typeof simFetch>[1] {
  const m = JSON.parse(new TextDecoder().decode(b.files['manifest.json'])) as Record<string, unknown>;
  edit(m);
  return (url) => (url === b.manifestUrl ? new Response(enc.encode(JSON.stringify(m))) : undefined);
}

describe('generated bundles pass the production loader', () => {
  it.each(SCENARIO_IDS)('%s loads with verified hashes and identical layers', async (id) => {
    const s = scenarios.find((x) => x.id === id)!;
    const loaded = await loadAndValidateBundle(s.manifestUrl, { fetchImpl: simFetch([s]) });
    expect(loaded.hashesVerified).toBe(true);
    expect(loaded.bundleVersion).toBe(s.bundle.bundleVersion);
    expect(loaded.manifest.synthetic).toBe(true);
    for (const k of ['elevation', 'slope', 'roughness', 'quality', 'exclusion'] as const) {
      expect(Buffer.from(loaded[k].buffer).equals(Buffer.from(s.bundle[k].buffer)), k).toBe(true);
    }
  });

  it('30 random terrains (all fuzz families) load and satisfy the layer encoding rules', async () => {
    for (let k = 0; k < 30; k++) {
      const seed = 9000 + k;
      const t = await buildRandomTerrain(seed, FUZZ_FAMILIES[k % 3]!);
      const b = await loadAndValidateBundle(t.manifestUrl, { fetchImpl: simFetch([t]) }).catch((e: Error) => {
        throw new Error(`seed ${seed}: ${e.message}`);
      });
      for (let i = 0; i < b.width * b.height; i++) {
        const z = b.elevation[i]!;
        if (!Number.isFinite(z)) {
          expect(b.quality[i], `seed ${seed} cell ${i}`).toBe(QUALITY.NO_ELEVATION);
          expect(b.exclusion[i], `seed ${seed} cell ${i}`).toBe(EXCLUSION.MISSING_ELEVATION);
        } else if (!Number.isFinite(b.slope[i]!) || !Number.isFinite(b.roughness[i]!)) {
          expect(b.exclusion[i], `seed ${seed} cell ${i}`).not.toBe(EXCLUSION.NONE);
        }
      }
    }
  });

  it('generation is deterministic: same id + seed => byte-identical files; another seed => another version', async () => {
    for (const id of ['noisy-rough', 'missing-holes', 'excluded-cells']) {
      const a = await buildScenario(id), b = await buildScenario(id);
      for (const [name, bytes] of Object.entries(a.files)) expect(Buffer.from(bytes).equals(Buffer.from(b.files[name]!)), `${id}/${name}`).toBe(true);
      const c = await buildScenario(id, 424242);
      expect(c.bundle.bundleVersion).not.toBe(a.bundle.bundleVersion);
      expect(c.bundle.manifest.layers.elevation.sha256 === a.bundle.manifest.layers.elevation.sha256 && id !== 'excluded-cells').toBe(false);
    }
  });
});

describe('analytic terrain facts', () => {
  it('slope-plane: derived slope equals the analytic 12 deg everywhere, roughness ~0', () => {
    const s = scenarios.find((x) => x.id === 'slope-plane')!;
    for (let i = 0; i < s.bundle.slope.length; i++) {
      expect(s.bundle.slope[i]!).toBeCloseTo(s.facts.slopeDeg!, 2);
      expect(s.bundle.roughness[i]!).toBeLessThan(0.01);
    }
  });

  it('flat scenarios have zero slope and roughness on every valid cell', () => {
    for (const s of scenarios.filter((x) => x.tags.includes('flat'))) {
      for (let i = 0; i < s.bundle.slope.length; i++) {
        if (s.bundle.exclusion[i] !== EXCLUSION.NONE) continue;
        expect(s.bundle.slope[i], s.id).toBe(0);
        expect(s.bundle.roughness[i], s.id).toBe(0);
      }
    }
  });

  it('missing-holes: NaN cells are exclusion 1 / quality 0 and their 3x3 halo is exclusion 2', () => {
    const s = scenarios.find((x) => x.id === 'missing-holes')!;
    const { width: W, height: H } = s.bundle;
    let holes = 0;
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      const i = r * W + c;
      if (Number.isFinite(s.bundle.elevation[i]!)) continue;
      holes++;
      expect(s.bundle.exclusion[i]).toBe(EXCLUSION.MISSING_ELEVATION);
      expect(s.bundle.quality[i]).toBe(QUALITY.NO_ELEVATION);
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= H || cc >= W) continue;
        expect([EXCLUSION.MISSING_ELEVATION, EXCLUSION.UNSUPPORTED_DERIVATIVE]).toContain(s.bundle.exclusion[rr * W + cc]);
      }
    }
    expect(holes).toBeGreaterThan(20);
  });

  it('noisy-rough really is rough: some cells exceed 25 deg slope and roughness varies', () => {
    const s = scenarios.find((x) => x.id === 'noisy-rough')!;
    const steep = Array.from(s.bundle.slope).filter((v) => v > 25).length / s.bundle.slope.length;
    expect(steep).toBeGreaterThan(0.01);
    expect(Math.max(...Array.from(s.bundle.roughness))).toBeGreaterThan(0.2);
  });

  it('degenerate strips derive finite slope/roughness (no NaN from a missing axis)', () => {
    for (const id of ['strip-row', 'strip-column']) {
      const s = scenarios.find((x) => x.id === id)!;
      expect(Array.from(s.bundle.slope).every(Number.isFinite), id).toBe(true);
      expect(Array.from(s.bundle.exclusion).every((e) => e === 0), id).toBe(true);
    }
  });
});

describe('corrupted bundles fail at the right named stage', () => {
  let s: ScenarioInstance;
  beforeAll(() => {
    s = scenarios.find((x) => x.id === 'ridge-gap')!;
  });
  const dir = () => s.manifestUrl.replace('manifest.json', '');

  it('truncated raster -> byte-length (layer named)', async () => {
    const e = await loadErr(s, (url, body) => (url === dir() + 'slope.f32' ? new Response(body!.slice(0, body!.length - 4)) : undefined));
    expect([e.stage, e.layer]).toEqual(['byte-length', 'slope']);
  });

  it('wrong dimensions (manifest grid disagrees with raster sizes) -> dimensions', async () => {
    const e = await loadErr(s, withManifest(s, (m) => {
      const g = m.grid as { width: number; cellSizeEast_m: number; extent: { east_m: number } };
      g.width -= 1;
      g.extent.east_m = g.width * g.cellSizeEast_m;
    }));
    expect(e.stage).toBe('dimensions');
  });

  it('inconsistent extent -> schema', async () => {
    const e = await loadErr(s, withManifest(s, (m) => { (m.grid as { extent: { east_m: number } }).extent.east_m += 7; }));
    expect(e.stage).toBe('schema');
    expect(e.message).toMatch(/extent width/);
  });

  it('bad hash (one flipped byte, same length) -> hash (layer named)', async () => {
    const e = await loadErr(s, (url, body) => {
      if (url !== dir() + 'quality.u8') return undefined;
      const b = body!.slice();
      b[3] = b[3]! ^ 0xff;
      return new Response(b);
    });
    expect([e.stage, e.layer]).toEqual(['hash', 'quality']);
  });

  it('wrong schema version -> version', async () => {
    const e = await loadErr(s, withManifest(s, (m) => { m.schemaVersion = '2.0'; }));
    expect(e.stage).toBe('version');
  });

  it('wrong schema id -> version', async () => {
    const e = await loadErr(s, withManifest(s, (m) => { m.schema = 'someone-else/bundle'; }));
    expect(e.stage).toBe('version');
  });

  it('missing layer / wrong dtype / absolute file path -> schema', async () => {
    for (const edit of [
      (m: Record<string, unknown>) => { delete (m.layers as Record<string, unknown>).roughness; },
      (m: Record<string, unknown>) => { (m.layers as Record<string, { dtype: string }>).quality!.dtype = 'float32'; },
      (m: Record<string, unknown>) => { (m.layers as Record<string, { file: string }>).elevation!.file = '/etc/passwd'; },
    ]) {
      expect((await loadErr(s, withManifest(s, edit))).stage).toBe('schema');
    }
  });

  it('manifest 404 -> fetch-manifest; invalid JSON -> parse-manifest; raster 404 -> fetch-raster', async () => {
    expect((await loadErr(s, (url) => (url === s.manifestUrl ? new Response('gone', { status: 404 }) : undefined))).stage).toBe('fetch-manifest');
    expect((await loadErr(s, (url) => (url === s.manifestUrl ? new Response('{"schema":') : undefined))).stage).toBe('parse-manifest');
    const e = await loadErr(s, (url) => (url === dir() + 'exclusion.u8' ? new Response('nope', { status: 404 }) : undefined));
    expect([e.stage, e.layer]).toEqual(['fetch-raster', 'exclusion']);
  });
});
