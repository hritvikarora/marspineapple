/**
 * `npm run sim` — runs every simulation scenario through the engine under test and prints a summary.
 *   npm run sim                      # all scenarios, default seeds
 *   npm run sim -- --json out.json   # also write machine-readable results
 *   SIM_ENGINE=path/to/engine.ts npm run sim   # compare another solver (exports solveRoute + MODEL_VERSION)
 * OWNER: Role C. Dev-only (not part of the app build).
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MODEL_VERSION, solveRoute } from '../../src/routing';
import {
  ALL_POLICIES,
  SCENARIO_IDS,
  buildScenario,
  checkResponse,
  engineFromModule,
  type EngineModule,
  type RouteEngine,
} from '../../src/sim';
import type { RouteRequest } from '../../src/contracts';

async function loadEngine(): Promise<RouteEngine> {
  const p = process.env.SIM_ENGINE;
  if (!p) return engineFromModule('src/routing', { solveRoute, MODEL_VERSION });
  return engineFromModule(p, (await import(pathToFileURL(resolve(p)).href)) as EngineModule);
}

const fmt = (n: number, d = 0) => (Number.isFinite(n) ? n.toFixed(d) : '-');

async function main() {
  const engine = await loadEngine();
  const jsonIdx = process.argv.indexOf('--json');
  const rows: string[][] = [];
  const out: unknown[] = [];
  let violations = 0;
  for (const id of SCENARIO_IDS) {
    const t0 = performance.now();
    const s = await buildScenario(id);
    const buildMs = performance.now() - t0;
    for (const c of s.cases) {
      const req: RouteRequest = {
        requestId: `sim-${id}-${c.id}`, bundleVersion: s.bundle.bundleVersion, modelVersion: engine.modelVersion,
        start: c.start, destination: c.destination, policies: c.policies ?? ALL_POLICIES,
        strictQuality: c.strictQuality ?? false, roundTrip: c.roundTrip ?? false,
      };
      const t1 = performance.now();
      const res = engine.solve(s.bundle, req);
      const ms = performance.now() - t1;
      const v = checkResponse(s.bundle, req, res, engine.modelVersion);
      violations += v.length;
      const cands = res.status === 'success' ? res.candidates : [];
      const status = res.status === 'no-path' ? `no-path (${res.reason})` : res.status === 'invalid-input' ? `invalid (${res.reason})` : res.status;
      rows.push([
        id, `${s.bundle.width}x${s.bundle.height}`, c.id + (c.strictQuality ? ' [strict]' : '') + (c.roundTrip ? ' [rt]' : ''),
        status, String(cands.length),
        cands.map((k) => fmt(k.outbound.metrics.horizontalDistance_m)).join(' / ') || '-',
        cands.map((k) => fmt(k.outbound.metrics.unknownQualityLength_m)).join(' / ') || '-',
        fmt(ms, 1), v.length ? `✗ ${v.length}` : '✓',
      ]);
      out.push({ scenario: id, case: c.id, status: res.status, buildMs, solveMs: ms, violations: v, candidates: cands.map((k) => ({ id: k.candidateId, policies: k.policies, metrics: k.outbound.metrics })) });
      if (v.length) for (const x of v.slice(0, 5)) console.error(`  ${id}/${c.id}: ${x}`);
    }
  }
  const head = ['scenario', 'grid', 'case', 'status', 'cands', 'horizontal m (c0/c1/..)', 'unknown-quality m', 'solve ms', 'invariants'];
  const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]!.length)));
  const line = (r: string[]) => r.map((x, i) => x.padEnd(w[i]!)).join('  ');
  console.log(`Engine: ${engine.name} (${engine.modelVersion})\n`);
  console.log(line(head));
  console.log(w.map((n) => '-'.repeat(n)).join('  '));
  for (const r of rows) console.log(line(r));
  console.log(`\n${rows.length} cases, ${violations} invariant violation(s).`);
  if (jsonIdx > 0 && process.argv[jsonIdx + 1]) writeFileSync(process.argv[jsonIdx + 1]!, JSON.stringify(out, null, 2) + '\n');
  if (violations) process.exitCode = 1;
}

void main();
