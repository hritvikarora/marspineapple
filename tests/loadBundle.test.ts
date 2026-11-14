import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BundleLoadError, loadAndValidateBundle } from '../src/data/loadBundle';
import { FIXTURE_MANIFEST, PUBLIC_DIR, fileFetch } from './helpers';

const manifestText = readFileSync(join(PUBLIC_DIR, 'bundles/synthetic-v0/manifest.json'), 'utf8');
const withManifest = (mut: (m: Record<string, any>) => void) => // eslint-disable-line @typescript-eslint/no-explicit-any
  fileFetch((url) => {
    if (!url.endsWith('manifest.json')) return undefined;
    const m = JSON.parse(manifestText);
    mut(m);
    return new Response(JSON.stringify(m));
  });

async function stageOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    expect(e).toBeInstanceOf(BundleLoadError);
    return (e as BundleLoadError).stage;
  }
}

describe('loadAndValidateBundle', () => {
  it('loads the synthetic fixture and verifies hashes', async () => {
    const b = await loadAndValidateBundle(FIXTURE_MANIFEST, { fetchImpl: fileFetch() });
    expect(b.bundleVersion).toBe('synthetic-v0.1.0');
    expect(b.manifest.synthetic).toBe(true);
    expect(b.elevation.length).toBe(20 * 12);
    expect(b.hashesVerified).toBe(true);
    // recognisable corners (see scripts/make-fixture.mjs)
    expect(b.elevation[0]).toBe(-2600); // NW
    expect(b.elevation[19]).toBe(-2581); // NE
    expect(b.elevation[11 * 20]).toBe(-2605.5); // SW
  });

  it.each([
    ['fetch-manifest', fileFetch((u) => (u.endsWith('manifest.json') ? new Response('', { status: 404 }) : undefined))],
    ['parse-manifest', fileFetch((u) => (u.endsWith('manifest.json') ? new Response('{nope') : undefined))],
    ['schema', withManifest((m) => delete m.layers.slope)],
    ['schema', withManifest((m) => (m.grid.orientation = 'south-up'))],
    ['schema', withManifest((m) => (m.layers.elevation.file = '/home/me/elev.f32'))],
    ['version', withManifest((m) => (m.schemaVersion = '2.0'))],
    ['fetch-raster', fileFetch((u) => (u.endsWith('slope.f32') ? new Response('', { status: 404 }) : undefined))],
    ['byte-length', withManifest((m) => (m.layers.quality.byteLength = 999))],
    ['dimensions', withManifest((m) => { m.grid.width = 10; m.grid.extent.east_m = 100; })],
    ['hash', withManifest((m) => (m.layers.exclusion.sha256 = '0'.repeat(64)))],
  ])('fails with stage %s', async (stage, f) => {
    expect(await stageOf(loadAndValidateBundle(FIXTURE_MANIFEST, { fetchImpl: f }))).toBe(stage);
  });

  it('reports network errors as fetch-raster with the layer name', async () => {
    const f = fileFetch((u) => {
      if (u.endsWith('roughness.f32')) throw new Error('offline');
      return undefined;
    });
    await expect(loadAndValidateBundle(FIXTURE_MANIFEST, { fetchImpl: f })).rejects.toMatchObject({ stage: 'fetch-raster', layer: 'roughness' });
  });
});
