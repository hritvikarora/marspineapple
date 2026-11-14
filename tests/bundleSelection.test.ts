import { describe, expect, it } from 'vitest';
import { manifestUrlFor, selectBundle } from '../src/app/bundleSelection';
import { fileFetch } from './helpers';

const json = (o: unknown) => fileFetch((u) => (u.endsWith('index.json') ? new Response(JSON.stringify(o)) : undefined));

describe('bundle selection', () => {
  it('uses index.json dev entry outside production and release entry in production', async () => {
    const f = json({ release: 'jezero-v1', dev: 'synthetic-v0', bundles: [] });
    expect(await selectBundle({ production: false, override: {}, fetchImpl: f })).toMatchObject({ manifestUrl: 'bundles/synthetic-v0/manifest.json', source: 'index-dev' });
    expect(await selectBundle({ production: true, override: {}, fetchImpl: f })).toMatchObject({ manifestUrl: 'bundles/jezero-v1/manifest.json', source: 'index-release' });
  });
  it('the committed index.json resolves to the synthetic fixture (until Role A delivers)', async () => {
    const s = await selectBundle({ production: true, override: {}, fetchImpl: fileFetch() });
    expect(s.bundleId).toBe('synthetic-v0');
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
