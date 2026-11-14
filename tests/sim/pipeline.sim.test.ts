/**
 * Whole-pipeline simulation per scenario: served files -> loadAndValidateBundle -> RouteWorkerClient
 * (real handler + engine) -> store reducer -> selectSelection -> deterministic export.
 * Export determinism is checked for every scenario; golden files pin a small subset.
 * Update goldens after an intentional engine/export change:  npm run sim:update-golden
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RouteSuccess } from '../../src/contracts';
import { loadAndValidateBundle } from '../../src/data/loadBundle';
import { exportFileName, serializeRouteExport } from '../../src/export/serialize';
import { MODEL_VERSION } from '../../src/routing';
import { ALL_POLICIES, SCENARIO_IDS, buildScenario, simFetch, type SimCase } from '../../src/sim';
import { createInitialState, reducer, selectSelection, type AppState } from '../../src/state/store';
import { RouteWorkerClient } from '../../src/worker/client';
import { FakeWorker } from '../helpers';
import { usingDefaultEngine } from './engineUnderTest';

const GOLDEN_DIR = join(__dirname, 'golden');
const GOLDEN: [string, string][] = [
  ['ridge-gap', 'straight-across'],
  ['quality-patchwork', 'across-band'],
  ['degenerate-endpoints', 'start-equals-goal'],
  ['strip-column', 'end-to-end'],
];
const PIPELINE_IDS = SCENARIO_IDS.filter((id) => id !== 'large-512');

/** One full, fresh session. Returns every candidate's export, in candidate order. */
async function session(id: string, pick: (cases: SimCase[]) => SimCase) {
  const s = await buildScenario(id);
  const c = pick(s.cases);
  const bundle = await loadAndValidateBundle(s.manifestUrl, { fetchImpl: simFetch([s]) });
  let st: AppState = createInitialState(MODEL_VERSION);
  const dispatch = (a: Parameters<typeof reducer>[1]) => (st = reducer(st, a));
  dispatch({ type: 'region/loaded', bundle });
  dispatch({ type: 'mission/setStart', endpoint: { point: c.start, poiId: null } });
  dispatch({ type: 'mission/setDestination', endpoint: { point: c.destination, poiId: null } });
  dispatch({ type: 'mission/setPolicies', policies: c.policies ?? ALL_POLICIES });
  dispatch({ type: 'mission/setStrictQuality', value: c.strictQuality ?? false });
  dispatch({ type: 'mission/setRoundTrip', value: c.roundTrip ?? false });
  const client = new RouteWorkerClient({ createWorker: () => new FakeWorker() });
  await client.loadBundle(bundle);
  const requestId = `session-${Math.random().toString(36).slice(2)}`; // differs per session on purpose
  dispatch({ type: 'route/requested', requestId });
  const m = st.currentMission;
  const res = await client.route({
    requestId, bundleVersion: bundle.bundleVersion, modelVersion: m.modelVersion, start: m.start!.point, destination: m.destination!.point,
    policies: m.policies, strictQuality: m.strictQuality, roundTrip: m.roundTrip,
  }, (r) => dispatch({ type: 'route/update', response: r })).done;
  client.dispose();
  expect(res.status, `${id}/${c.id}`).toBe('success');
  const out: { candidateId: string; file: string; json: string }[] = [];
  for (const cand of st.routeCandidates) {
    dispatch({ type: 'route/select', candidateId: cand.candidateId });
    const sel = selectSelection(st);
    expect(sel.candidateId).toBe(cand.candidateId);
    const release = { appVersion: '0.0.0-sim', bundleVersion: bundle.bundleVersion, modelVersion: MODEL_VERSION };
    out.push({
      candidateId: cand.candidateId,
      file: exportFileName(release, sel.candidateId),
      json: serializeRouteExport({ release, manifest: bundle.manifest, mission: st.currentMission, response: st.routeRun.kind === 'finished' ? (st.routeRun.response as RouteSuccess) : (null as never), selectedCandidateId: sel.candidateId }),
    });
  }
  return { s, c, out };
}

const firstSuccess = (cases: SimCase[]) => cases.find((k) => k.expect.status === 'success' || k.expect.status === 'oracle')!;

describe('whole pipeline per scenario', () => {
  it.each(PIPELINE_IDS)('%s: two independent sessions export byte-identical files for every candidate', async (id) => {
    const a = await session(id, firstSuccess);
    const b = await session(id, firstSuccess);
    expect(a.out.length).toBeGreaterThan(0);
    expect(b.out.map((x) => x.json)).toEqual(a.out.map((x) => x.json));
    for (const e of a.out) {
      const parsed = JSON.parse(e.json);
      expect(parsed.selectedCandidateId).toBe(e.candidateId);
      expect(parsed.release.bundleVersion).toBe(a.s.bundle.bundleVersion);
      expect(parsed.region.synthetic).toBe(true);
      expect(e.json).not.toMatch(/session-|requestId|computeMs|sim\.local|https?:\/\//);
      expect(e.file).toBe(`mars-pathfinder_${a.s.bundle.bundleVersion}_${MODEL_VERSION}_${e.candidateId}.json`);
    }
  });
});

describe.runIf(usingDefaultEngine)('golden exports (placeholder engine; regenerate when the solver changes)', () => {
  it.each(GOLDEN)('%s / %s matches tests/sim/golden', async (id, caseId) => {
    const { out } = await session(id, (cases) => cases.find((k) => k.id === caseId)!);
    const file = join(GOLDEN_DIR, `${id}__${caseId}.json`);
    const json = out[0]!.json;
    if (process.env.UPDATE_GOLDEN || !existsSync(file)) {
      mkdirSync(GOLDEN_DIR, { recursive: true });
      writeFileSync(file, json);
      if (!process.env.UPDATE_GOLDEN) throw new Error(`golden ${file} was missing and has been written; re-run`);
    }
    expect(json).toBe(readFileSync(file, 'utf8'));
  });
});
