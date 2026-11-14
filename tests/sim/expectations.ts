/** Oracle-based expectations shared by the scenario and fuzz tests. */
import { QUALITY, type GridBundle, type RouteFinalResponse, type RouteRequest } from '../../src/contracts';
import { bundleCellOf, dataValid, isFlat, referenceShortest } from '../../src/sim';

const EPS = 1e-6;

/**
 * Solver-independent expectations for a request. Returns violations.
 *  - Invalid endpoints/policies => the matching invalid-input reason (or, on non-flat terrain, an
 *    endpoint the solver's own limits reject).
 *  - Flat terrain: success iff connected under the strictest admissible reading, no-path iff
 *    disconnected under the most permissive one.
 *  - Any terrain: disconnected at the data level => never success.
 *  - Flat terrain: shortest-feasible length is between the corner-cutting lower bound and the
 *    no-corner-cutting 8-neighbour optimum.
 */
export function checkExpectations(b: GridBundle, req: RouteRequest, res: RouteFinalResponse): string[] {
  const v: string[] = [];
  const flat = isFlat(b);
  const bad = (msg: string) => v.push(`${msg} (got ${res.status}${'reason' in res ? `/${res.reason}` : ''}${'field' in res ? `/${res.field}` : ''})`);
  // On non-flat terrain the solver's own limits (e.g. max slope) may reject an earlier endpoint first.
  // Strict mode may also reject a LOW-quality start (the acceptable set is solver policy).
  const solverRejectedEarlier = (field: 'start' | 'destination') =>
    field === 'destination' && res.status === 'invalid-input' && res.field === 'start' &&
    ((!flat && res.reason === 'endpoint-excluded') ||
      (req.strictQuality && res.reason === 'endpoint-quality-excluded' && s !== null && b.quality[s] !== QUALITY.GOOD));
  if (!req.policies.length) {
    if (res.status !== 'invalid-input' || res.reason !== 'no-policies') bad('expected invalid-input/no-policies');
    return v;
  }
  if (req.strictQuality && !b.manifest.strictQualitySupported) {
    if (res.status !== 'invalid-input' || res.reason !== 'strict-quality-unsupported') bad('expected strict-quality-unsupported');
    return v;
  }
  const s = bundleCellOf(b, req.start), d = bundleCellOf(b, req.destination);
  for (const [field, cell] of [['start', s], ['destination', d]] as const) {
    if (cell === null) {
      if (res.status !== 'invalid-input' || res.reason !== 'endpoint-outside-region' || res.field !== field) bad(`expected endpoint-outside-region/${field}`);
      return v;
    }
  }
  for (const [field, cell] of [['start', s!], ['destination', d!]] as const) {
    if (solverRejectedEarlier(field)) return v;
    if (!dataValid(b, cell)) {
      if (res.status !== 'invalid-input' || res.reason !== 'endpoint-excluded' || res.field !== field) bad(`expected endpoint-excluded/${field}`);
      return v;
    }
    if (req.strictQuality && b.quality[cell] === QUALITY.UNKNOWN) {
      if (!flat && res.status === 'invalid-input' && res.reason === 'endpoint-excluded' && res.field === field) return v; // solver limit hit first
      if (res.status !== 'invalid-input' || res.reason !== 'endpoint-quality-excluded' || res.field !== field) bad(`expected endpoint-quality-excluded/${field}`);
      return v;
    }
  }
  if (res.status === 'invalid-input') {
    const solverLimit = !flat && res.reason === 'endpoint-excluded';
    const strictLow = req.strictQuality && res.reason === 'endpoint-quality-excluded';
    if (!solverLimit && !strictLow) bad('unexpected invalid-input for valid endpoints');
    return v;
  }
  const strictLo = req.strictQuality ? 'good-only' : 'off';
  const strictHi = req.strictQuality ? 'not-unknown' : 'off';
  const lowerOk = (i: number) => dataValid(b, i, strictLo);
  const upperOk = (i: number) => dataValid(b, i, strictHi);
  const upperCut = referenceShortest(b, s!, d!, upperOk, true);
  if (!Number.isFinite(upperCut) && res.status === 'success') bad('data-level disconnected but solver found a route');
  if (flat) {
    const lowerNoCut = referenceShortest(b, s!, d!, lowerOk, false);
    if (Number.isFinite(lowerNoCut) && res.status !== 'success') bad(`flat + connected (oracle ${lowerNoCut.toFixed(1)} m) but no success`);
    if (!Number.isFinite(upperCut) && res.status !== 'no-path') bad('flat + disconnected but not no-path');
    if (res.status === 'no-path' && req.strictQuality) {
      const anyQuality = referenceShortest(b, s!, d!, (i) => dataValid(b, i), false);
      if (Number.isFinite(anyQuality) && res.reason !== 'strict-quality-disconnects') bad('expected reason strict-quality-disconnects');
    }
    if (res.status === 'success') {
      for (const c of res.candidates) {
        if (!c.policies.includes('shortest-feasible')) continue;
        const hd = c.outbound.metrics.horizontalDistance_m;
        if (hd < upperCut - EPS) v.push(`${c.candidateId}: ${hd} m is shorter than the corner-cutting lower bound ${upperCut}`);
        if (Number.isFinite(lowerNoCut) && hd > lowerNoCut + EPS) v.push(`${c.candidateId}: shortest-feasible ${hd} m is longer than the 8-neighbour optimum ${lowerNoCut}`);
      }
    }
  }
  return v;
}

/** On flat terrain, uncertainty-aware must not cross more unknown-quality metres than shortest-feasible. */
export function uncertaintyNoWorse(res: RouteFinalResponse): string[] {
  if (res.status !== 'success') return [];
  const pick = (p: string) => res.candidates.find((c) => c.policies.includes(p as never));
  const sf = pick('shortest-feasible'), ua = pick('uncertainty-aware');
  if (!sf || !ua) return [];
  const a = ua.outbound.metrics.unknownQualityLength_m, b = sf.outbound.metrics.unknownQualityLength_m;
  return a > b + EPS ? [`uncertainty-aware crosses ${a} m unknown vs shortest-feasible ${b} m`] : [];
}
