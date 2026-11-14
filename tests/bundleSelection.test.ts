import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { manifestUrlFor, selectBundle, type BundleIndex } from '../src/app/bundleSelection';
import { PUBLIC_DIR, fileFetch } from './helpers';

const json = (o: unknown) => fileFetch((u) => (u.endsWith('index.json') ? new Response(JSON.stringify(o)) : undefined));

describe('bundle selection', () => {
  it('uses index.json dev entry outside production and release entry in production', async () => {
    const f = json({ release: 'jezero-v1', dev: 'synthetic-v0', bundles: [] });
    expect(await selectBundle({ production: false, override: {}, fetchImpl: f })).toMatchObject({ manifestUrl: 'bundles/synthetic-v0/manifest.json', source: 'index-dev' });
    expect(await selectBundle({ production: true, override: {}, fetchImpl: f })).toMatchObject({ manifestUrl: 'bundles/jezero-v1/manifest.json', source: 'index-release' });
  });
  it('the committed index.json: production serves the real HiRISE bundle, dev/tests the synthetic fixture', async () => {
    expect((await selectBundle({ production: true, override: {}, fetchImpl: fileFetch() })).bundleId).toBe('jezero-west-hirise-v0.1.0');
    expect((await selectBundle({ production: false, override: {}, fetchImpl: fileFetch() })).bundleId).toBe('synthetic-v0');
  });
  it('every bundle listed in index.json exists and its synthetic flag matches its manifest; release is not synthetic', async () => {
    const idx = JSON.parse(readFileSync(join(PUBLIC_DIR, 'bundles', 'index.json'), 'utf8')) as BundleIndex;
    for (const b of idx.bundles) {
      const m = JSON.parse(readFileSync(join(PUBLIC_DIR, manifestUrlFor(b.id)), 'utf8')) as { bundleId: string; synthetic: boolean };
      expect(m.synthetic, b.id).toBe(b.synthetic);
    }
    expect(idx.bundles.find((b) => b.id === idx.release)?.synthetic).toBe(false);
    expect(idx.bundles.map((b) => b.id)).toContain(idx.dev);
  });
  it('env overrides win: VITE_BUNDLE_MANIFEST > VITE_BUNDLE', async () => {
    const f = json({});
    expect(await selectBundle({ override: { manifestUrl: 'x/m.json', bundleId: 'a' }, fetchImpl: f })).toMatchObject({ manifestUrl: 'x/m.json', source: 'env-manifest' });
    expect(await selectBundle({ override: { bundleId: 'jezero-v2' }, fetchImpl: f })).toMatchObject({ manifestUrl: manifestUrlFor('jezero-v2'), source: 'env-bundle' });
  });
  it('rejects unsafe ids and missing/invalid index with typed errors', async () => {
    await expect(selectBundle({ override: { bundleId: '../etc' } })).rejects.toMatchObject({ stage: 'schema' });
    await expect(selectBundle({ production: true, override: {}, fetchImpl: json({ dev: 'synthetic-v0' }) })).rejects.toMatchObject({ stage: 'schema' });
    await expect(selectBundle({ override: {}, fetchImpl: fileFetch((u) => (u.endsWith('index.json') ? new Response('', { status: 404 }) : undefined)) })).rejects.toMatchObject({ stage: 'fetch-manifest' });
  });
});
