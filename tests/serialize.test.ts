import { beforeAll, describe, expect, it } from 'vitest';
import type { GridBundle, RouteSuccess } from '../src/contracts';
import { loadAndValidateBundle } from '../src/data/loadBundle';
import { exportFileName, serializeRouteExport, stableStringify, type ExportInput } from '../src/export/serialize';
import { MODEL_VERSION, solveRoute } from '../src/routing';
import { createInitialState } from '../src/state/store';
import { FIXTURE_MANIFEST, fileFetch } from './helpers';

let bundle: GridBundle;
beforeAll(async () => {
  bundle = await loadAndValidateBundle(FIXTURE_MANIFEST, { fetchImpl: fileFetch() });
});

function input(): ExportInput {
  const p = (id: string) => bundle.manifest.pointsOfInterest.find((x) => x.id === id)!.position;
  const mission = { ...createInitialState(MODEL_VERSION).currentMission, start: { point: p('syn-outpost'), poiId: 'syn-outpost' }, destination: { point: p('syn-east-bench'), poiId: 'syn-east-bench' } };
  const response = solveRoute(bundle, {
    requestId: 'export-1', bundleVersion: bundle.bundleVersion, modelVersion: MODEL_VERSION,
    start: mission.start.point, destination: mission.destination.point, policies: mission.policies, strictQuality: false, roundTrip: false,
  }, { now: () => 0 }) as RouteSuccess;
  return { release: { appVersion: '0.1.0', bundleVersion: bundle.bundleVersion, modelVersion: MODEL_VERSION }, manifest: bundle.manifest, mission, response, selectedCandidateId: 'c0' };
}

describe('deterministic export', () => {
  it('is byte-identical across runs', () => {
    const a = serializeRouteExport(input());
    const b = serializeRouteExport(input());
    expect(a).toBe(b);
    expect(a.endsWith('\n')).toBe(true);
    const parsed = JSON.parse(a);
    expect(parsed.release).toEqual({ appVersion: '0.1.0', bundleVersion: 'synthetic-v0.1.0', modelVersion: MODEL_VERSION });
    expect(parsed.endpoints.start.accepted).toBeDefined();
    expect(parsed.limitations.length).toBeGreaterThan(0);
    expect(a).not.toMatch(/exportedAt/);
  });
  it('sorts keys regardless of insertion order and nulls non-finite numbers', () => {
    expect(stableStringify({ b: 1, a: { d: Number.NaN, c: [3, { z: 1, y: 2 }] } })).toBe(stableStringify({ a: { c: [3, { y: 2, z: 1 }], d: Number.NaN }, b: 1 }));
    expect(JSON.parse(stableStringify({ x: Infinity })).x).toBeNull();
  });
  it('contains no local paths or URLs, and rejects them', () => {
    const json = serializeRouteExport(input());
    expect(json).not.toMatch(/\/home\/|file:|http/);
    const bad = input();
    bad.manifest = { ...bad.manifest, title: 'see /home/me/data' };
    expect(() => serializeRouteExport(bad)).toThrow(/local filesystem path/);
  });
  it('produces a stable, safe filename', () => {
    expect(exportFileName({ appVersion: '0.1.0', bundleVersion: 'synthetic-v0.1.0', modelVersion: 'm/1' }, 'c0')).toBe('mars-pathfinder_synthetic-v0.1.0_m_1_c0.json');
  });
});
