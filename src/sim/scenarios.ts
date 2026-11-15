/**
 * Deterministic simulation scenarios (synthetic terrains + route cases). OWNER: Role C.
 * Dev/test only: nothing in the app imports src/sim, so it never reaches dist/ (the audit checks
 * for SIM_MARKER). Every generator is seeded; same id + seed => byte-identical bundle.
 */
import { EXCLUSION, QUALITY, type InvalidInputReason, type LocalPoint, type NoPathReason, type RoutePolicyId } from '../contracts';
import { buildSimBundle, type SimBundle, type TerrainSpec } from './bundle';
import { fbm, mulberry32, randInt } from './rng';

export const ALL_POLICIES: RoutePolicyId[] = ['shortest-feasible', 'terrain-aware', 'uncertainty-aware'];

export type CaseExpectation =
  | { status: 'success'; zeroLength?: boolean }
  | { status: 'no-path'; reason?: NoPathReason }
  | { status: 'invalid-input'; reason: InvalidInputReason; field?: string | null }
  /** Flat terrain: success iff the (8-neighbour, no-corner-cutting) connectivity oracle says connected. */
  | { status: 'oracle' };

export interface SimCase {
  id: string;
  start: LocalPoint;
  destination: LocalPoint;
  policies?: RoutePolicyId[];
  strictQuality?: boolean;
  roundTrip?: boolean;
  expect: CaseExpectation;
  /** Every successful outbound path must include at least one of these cell indices. */
  mustPassThroughAnyOf?: number[];
}

export interface ScenarioInstance extends SimBundle {
  id: string;
  description: string;
  /** Tags drive which property tests apply: flat (slope/roughness 0 => exact oracles), quality, perf, degenerate, analytic-slope. */
  tags: string[];
  cases: SimCase[];
  /** Scenario-specific analytic facts the tests check. */
  facts: Record<string, number>;
}

interface Def {
  id: string;
  description: string;
  tags: string[];
  defaultSeed: number;
  make(seed: number): { spec: Omit<TerrainSpec, 'id' | 'seed' | 'description'>; cases: (g: Geo) => SimCase[]; facts?: Record<string, number> };
}

/** Grid geometry helpers for writing cases in row/col. */
export class Geo {
  constructor(readonly width: number, readonly height: number, readonly de: number, readonly dn: number) {}
  at(r: number, c: number): LocalPoint {
    return { east_m: (c + 0.5) * this.de, north_m: this.height * this.dn - (r + 0.5) * this.dn };
  }
  idx(r: number, c: number): number { return r * this.width + c; }
}

function grid(width: number, height: number, de: number, dn = de) {
  const N = width * height;
  return {
    width, height, cellSizeEast_m: de, cellSizeNorth_m: dn, N,
    elevation: new Float32Array(N), quality: new Uint8Array(N).fill(QUALITY.GOOD), exclusion: new Uint8Array(N),
    geo: new Geo(width, height, de, dn),
  };
}

const ok = (id: string, start: LocalPoint, destination: LocalPoint, extra: Partial<SimCase> = {}): SimCase =>
  ({ id, start, destination, expect: { status: 'success' }, ...extra });

const DEFS: Def[] = [
  {
    id: 'flat-plain', description: '64x64 flat plain, 5 m cells: shortest path length must equal the octile distance.',
    tags: ['flat'], defaultSeed: 1,
    make() {
      const g = grid(64, 64, 5);
      g.elevation.fill(-2500);
      return {
        spec: { ...g, title: 'flat plain' },
        cases: (geo) => [
          ok('diagonal', geo.at(0, 0), geo.at(63, 63)),
          ok('off-axis-round-trip', geo.at(10, 5), geo.at(40, 50), { roundTrip: true }),
          ok('same-cell', geo.at(20, 20), { east_m: geo.at(20, 20).east_m + 1.2, north_m: geo.at(20, 20).north_m - 2 }, { expect: { status: 'success', zeroLength: true } }),
        ],
      };
    },
  },
  {
    id: 'slope-plane', description: '48x48 uniform plane tilted 12 deg towards azimuth 60 deg (east of north), 10 m cells: analytic slope check.',
    tags: ['analytic-slope'], defaultSeed: 1,
    make() {
      const g = grid(48, 48, 10);
      const slopeDeg = 12, theta = Math.PI / 6; // gradient direction: 30 deg north of east
      const k = Math.tan((slopeDeg * Math.PI) / 180);
      for (let r = 0; r < g.height; r++) for (let c = 0; c < g.width; c++) {
        const p = g.geo.at(r, c);
        g.elevation[g.geo.idx(r, c)] = -1500 + k * (Math.cos(theta) * p.east_m + Math.sin(theta) * p.north_m);
      }
      return {
        spec: { ...g, title: 'uniform slope plane', parameters: { slopeDeg } },
        facts: { slopeDeg },
        cases: (geo) => [
          ok('uphill-round-trip', geo.at(44, 3), geo.at(5, 44), { roundTrip: true }),
          ok('contour', geo.at(10, 10), geo.at(30, 20)),
        ],
      };
    },
  },
  {
    id: 'ridge-gap', description: '40x30, 10 m cells: 50 m wall along column 20 with one gap (rows 13-15); every route must use the gap.',
    tags: [], defaultSeed: 1,
    make() {
      const g = grid(40, 30, 10);
      for (let r = 0; r < g.height; r++) for (let c = 0; c < g.width; c++) {
        g.elevation[g.geo.idx(r, c)] = -2000 + 0.2 * c + (c === 20 && (r < 13 || r > 15) ? 50 : 0);
      }
      const gap = [13, 14, 15].map((r) => g.geo.idx(r, 20));
      return {
        spec: { ...g, title: 'ridge with gap' },
        cases: (geo) => [
          ok('straight-across', geo.at(14, 3), geo.at(14, 36), { mustPassThroughAnyOf: gap }),
          ok('north-to-south', geo.at(2, 3), geo.at(27, 36), { mustPassThroughAnyOf: gap, roundTrip: true }),
        ],
      };
    },
  },
  {
    id: 'maze', description: '41x41 flat maze, 5 m cells: four excluded walls with alternating openings force a serpentine corridor.',
    tags: ['flat'], defaultSeed: 1,
    make() {
      const g = grid(41, 41, 5);
      g.elevation.fill(-2300);
      const walls: [number, 'north' | 'south'][] = [[8, 'south'], [16, 'north'], [24, 'south'], [32, 'north']];
      for (const [c, open] of walls) for (let r = 0; r < g.height; r++) {
        const isOpen = open === 'north' ? r <= 2 : r >= g.height - 3;
        if (!isOpen) g.exclusion[g.geo.idx(r, c)] = EXCLUSION.MANUAL;
      }
      return {
        spec: { ...g, title: 'maze' },
        // Lower bound: the path must reach each opening; straight-line through all 4 openings ~ 4 * 36 rows * 5 m.
        facts: { minHorizontal_m: 4 * 30 * 5 },
        cases: (geo) => [ok('serpentine', geo.at(20, 2), geo.at(20, 38))],
      };
    },
  },
  {
    id: 'crater-basin', description: '50x50, 10 m cells: crater with an 80 m steep rim; the floor is unreachable from outside (no-path).',
    tags: [], defaultSeed: 1,
    make() {
      const g = grid(50, 50, 10);
      for (let r = 0; r < g.height; r++) for (let c = 0; c < g.width; c++) {
        const d = Math.hypot(r - 25, c - 25);
        g.elevation[g.geo.idx(r, c)] = -3000 + (d >= 11 && d <= 14 ? 80 : d < 11 ? -30 : 0);
      }
      return {
        spec: { ...g, title: 'crater basin' },
        cases: (geo) => [
          { id: 'outside-to-floor', start: geo.at(2, 2), destination: geo.at(25, 25), expect: { status: 'no-path', reason: 'disconnected-under-limits' } },
          { id: 'floor-to-outside-round-trip', start: geo.at(25, 25), destination: geo.at(47, 47), roundTrip: true, expect: { status: 'no-path', reason: 'disconnected-under-limits' } },
          ok('around-the-rim', geo.at(2, 2), geo.at(47, 47)),
          ok('across-the-floor', geo.at(22, 22), geo.at(28, 27), { roundTrip: true }),
        ],
      };
    },
  },
  {
    id: 'noisy-rough', description: '96x96, 10 m cells: seeded fractal value noise (steep and rough patches).',
    tags: [], defaultSeed: 7,
    make(seed) {
      const g = grid(96, 96, 10);
      for (let r = 0; r < g.height; r++) for (let c = 0; c < g.width; c++) {
        const p = g.geo.at(r, c);
        g.elevation[g.geo.idx(r, c)] = -2200 + 70 * fbm(seed, p.east_m / 300, p.north_m / 300, 5, 2, 0.45);
      }
      return {
        spec: { ...g, title: 'noisy rough terrain', parameters: { amplitude_m: 70, wavelength_m: 300 } },
        cases: (geo) => [
          // Feasible under eva-astar-1.0.0's EVA slope/grade limits (the long cases below are disconnected under them).
          { id: 'inner-diagonal', start: geo.at(10, 10), destination: geo.at(30, 30), expect: { status: 'success' } },
          { id: 'west-east', start: geo.at(45, 10), destination: geo.at(45, 50), expect: { status: 'success' } },
          { id: 'corner-to-corner', start: geo.at(3, 3), destination: geo.at(92, 92), roundTrip: true, expect: { status: 'oracle' } },
          { id: 'mid-span', start: geo.at(80, 10), destination: geo.at(15, 70), expect: { status: 'oracle' } },
        ],
      };
    },
  },
  {
    id: 'quality-patchwork', description: '60x40 flat, 10 m cells: 200 m unknown-quality band with a good-quality bridge to the north.',
    tags: ['flat', 'quality'], defaultSeed: 1,
    make() {
      const g = grid(60, 40, 10);
      g.elevation.fill(-2100);
      for (let r = 0; r < g.height; r++) for (let c = 20; c <= 39; c++) if (r < 2 || r > 4) g.quality[g.geo.idx(r, c)] = QUALITY.UNKNOWN;
      for (let r = 34; r < 40; r++) for (let c = 2; c <= 10; c++) g.quality[g.geo.idx(r, c)] = QUALITY.LOW;
      return {
        spec: { ...g, title: 'quality patchwork' },
        cases: (geo) => [
          ok('across-band', geo.at(30, 5), geo.at(30, 54)),
          ok('across-band-strict', geo.at(30, 5), geo.at(30, 54), { strictQuality: true }),
        ],
      };
    },
  },
  {
    id: 'quality-wall', description: '30x20 flat: unknown-quality band spanning the full height; strict mode disconnects.',
    tags: ['flat', 'quality'], defaultSeed: 1,
    make() {
      const g = grid(30, 20, 10);
      g.elevation.fill(-2100);
      for (let r = 0; r < g.height; r++) for (let c = 12; c <= 17; c++) g.quality[g.geo.idx(r, c)] = QUALITY.UNKNOWN;
      return {
        spec: { ...g, title: 'quality wall' },
        cases: (geo) => [
          ok('non-strict', geo.at(10, 2), geo.at(10, 27)),
          { id: 'strict', start: geo.at(10, 2), destination: geo.at(10, 27), strictQuality: true, expect: { status: 'no-path', reason: 'strict-quality-disconnects' } },
        ],
      };
    },
  },
  {
    id: 'missing-holes', description: '60x60 gentle ramp, 10 m cells: seeded NaN elevation holes (exclusion 1) with derivative halos (exclusion 2).',
    tags: [], defaultSeed: 11,
    make(seed) {
      const g = grid(60, 60, 10);
      const rand = mulberry32(seed);
      for (let r = 0; r < g.height; r++) for (let c = 0; c < g.width; c++) g.elevation[g.geo.idx(r, c)] = -2400 + 0.05 * c * 10;
      const keep = [[2, 2], [57, 57], [2, 57], [57, 2]];
      for (let h = 0; h < 14; h++) {
        const cr = randInt(rand, 5, 54), cc = randInt(rand, 5, 54), rad = 1.5 + rand() * 2.5;
        if (keep.some(([r, c]) => Math.hypot(r! - cr, c! - cc) < rad + 3)) continue;
        for (let r = 0; r < g.height; r++) for (let c = 0; c < g.width; c++) if (Math.hypot(r - cr, c - cc) <= rad) g.elevation[g.geo.idx(r, c)] = NaN;
      }
      return {
        spec: { ...g, title: 'missing-elevation holes' },
        cases: (geo) => [
          ok('diagonal', geo.at(2, 2), geo.at(57, 57), { roundTrip: true }),
          ok('anti-diagonal', geo.at(2, 57), geo.at(57, 2)),
        ],
      };
    },
  },
  {
    id: 'excluded-cells', description: '60x60 flat, 10 m cells: 28% seeded manual exclusions (connectivity decided by an oracle).',
    tags: ['flat'], defaultSeed: 5,
    make(seed) {
      const g = grid(60, 60, 10);
      g.elevation.fill(-2600);
      const rand = mulberry32(seed);
      for (let i = 0; i < g.N; i++) if (rand() < 0.28) g.exclusion[i] = EXCLUSION.MANUAL;
      for (const [r, c] of [[1, 1], [58, 58], [1, 58], [58, 1]] as const) g.exclusion[g.geo.idx(r, c)] = 0;
      return {
        spec: { ...g, title: 'random exclusions' },
        cases: (geo) => [
          { id: 'diagonal', start: geo.at(1, 1), destination: geo.at(58, 58), expect: { status: 'oracle' } },
          { id: 'anti-diagonal', start: geo.at(1, 58), destination: geo.at(58, 1), roundTrip: true, expect: { status: 'oracle' } },
        ],
      };
    },
  },
  {
    id: 'large-512', description: '512x512 (262k cells), 10 m cells, gentle seeded noise: performance budget.',
    tags: ['perf'], defaultSeed: 3,
    make(seed) {
      const g = grid(512, 512, 10);
      for (let r = 0; r < g.height; r++) for (let c = 0; c < g.width; c++) {
        const p = g.geo.at(r, c);
        g.elevation[g.geo.idx(r, c)] = -2000 + 40 * fbm(seed, p.east_m / 800, p.north_m / 800, 4, 2, 0.4);
      }
      return {
        spec: { ...g, title: 'large grid' },
        cases: (geo) => [{ id: 'corner-to-corner', start: geo.at(8, 8), destination: geo.at(503, 503), expect: { status: 'oracle' } }],
      };
    },
  },
  {
    id: 'strip-row', description: '200x1 strip (1 row), 2 m cells: degenerate grid height.',
    tags: ['degenerate'], defaultSeed: 1,
    make() {
      const g = grid(200, 1, 2);
      for (let c = 0; c < 200; c++) g.elevation[c] = -1000 + 0.1 * c;
      return { spec: { ...g, title: '1-row strip' }, cases: (geo) => [ok('end-to-end', geo.at(0, 0), geo.at(0, 199), { roundTrip: true })] };
    },
  },
  {
    id: 'strip-column', description: '1x150 strip (1 column), 4 m north x 3 m east cells: degenerate grid width, anisotropic cells.',
    tags: ['degenerate'], defaultSeed: 1,
    make() {
      const g = grid(1, 150, 3, 4);
      for (let r = 0; r < 150; r++) g.elevation[r] = -1000 - 0.2 * r;
      return { spec: { ...g, title: '1-column strip' }, cases: (geo) => [ok('end-to-end', geo.at(149, 0), geo.at(0, 0))] };
    },
  },
  {
    id: 'degenerate-endpoints', description: '10x10 flat, 10 m cells: start==goal, endpoints on every border, outside, NaN, excluded, strict-unknown.',
    tags: ['flat', 'degenerate'], defaultSeed: 1,
    make() {
      const g = grid(10, 10, 10);
      g.elevation.fill(-1800);
      g.exclusion[g.geo.idx(5, 5)] = EXCLUSION.MANUAL;
      g.quality[g.geo.idx(2, 7)] = QUALITY.UNKNOWN;
      return {
        spec: { ...g, title: 'degenerate endpoints' },
        cases: (geo) => [
          ok('start-equals-goal', geo.at(3, 3), geo.at(3, 3), { roundTrip: true, expect: { status: 'success', zeroLength: true } }),
          ok('west-and-north-edges-are-inside', { east_m: 0, north_m: 55 }, { east_m: 45, north_m: 100 }),
          ok('corner-to-corner-round-trip', geo.at(0, 0), geo.at(9, 9), { roundTrip: true }),
          { id: 'east-edge-is-outside', start: geo.at(4, 4), destination: { east_m: 100, north_m: 50 }, expect: { status: 'invalid-input', reason: 'endpoint-outside-region', field: 'destination' } },
          { id: 'south-edge-is-outside', start: { east_m: 50, north_m: 0 }, destination: geo.at(4, 4), expect: { status: 'invalid-input', reason: 'endpoint-outside-region', field: 'start' } },
          { id: 'far-outside', start: { east_m: -5, north_m: 50 }, destination: geo.at(4, 4), expect: { status: 'invalid-input', reason: 'endpoint-outside-region', field: 'start' } },
          { id: 'nan-coordinate', start: geo.at(4, 4), destination: { east_m: NaN, north_m: 10 }, expect: { status: 'invalid-input', reason: 'endpoint-outside-region', field: 'destination' } },
          { id: 'excluded-destination', start: geo.at(0, 0), destination: geo.at(5, 5), expect: { status: 'invalid-input', reason: 'endpoint-excluded', field: 'destination' } },
          { id: 'strict-unknown-destination', start: geo.at(0, 0), destination: geo.at(2, 7), strictQuality: true, expect: { status: 'invalid-input', reason: 'endpoint-quality-excluded', field: 'destination' } },
          ok('non-strict-unknown-destination', geo.at(0, 0), geo.at(2, 7)),
          { id: 'no-policies', start: geo.at(0, 0), destination: geo.at(9, 9), policies: [], expect: { status: 'invalid-input', reason: 'no-policies', field: 'policies' } },
        ],
      };
    },
  },
  {
    id: 'no-quality-classes', description: '8x8 flat bundle without documented quality classes: strict mode must be refused.',
    tags: ['flat', 'degenerate'], defaultSeed: 1,
    make() {
      const g = grid(8, 8, 10);
      g.elevation.fill(-1700);
      return {
        spec: { ...g, title: 'no quality classes', strictQualitySupported: false },
        cases: (geo) => [
          ok('non-strict', geo.at(0, 0), geo.at(7, 7)),
          { id: 'strict-refused', start: geo.at(0, 0), destination: geo.at(7, 7), strictQuality: true, expect: { status: 'invalid-input', reason: 'strict-quality-unsupported', field: 'strictQuality' } },
        ],
      };
    },
  },
];

export const SCENARIO_IDS = DEFS.map((d) => d.id);

export async function buildScenario(id: string, seed?: number): Promise<ScenarioInstance> {
  const def = DEFS.find((d) => d.id === id);
  if (!def) throw new Error(`unknown scenario ${id}`);
  const s = seed ?? def.defaultSeed;
  const { spec, cases, facts } = def.make(s);
  const built = await buildSimBundle({ ...spec, id, seed: s, description: def.description });
  const geo = new Geo(spec.width, spec.height, spec.cellSizeEast_m, spec.cellSizeNorth_m);
  return { ...built, id, description: def.description, tags: def.tags, cases: cases(geo), facts: facts ?? {} };
}

export async function buildAllScenarios(opts: { includePerf?: boolean } = {}): Promise<ScenarioInstance[]> {
  const ids = DEFS.filter((d) => opts.includePerf !== false || !d.tags.includes('perf')).map((d) => d.id);
  return Promise.all(ids.map((id) => buildScenario(id)));
}

// ---- seeded random terrains for fuzzing --------------------------------------

export type FuzzFamily = 'flat-obstacles' | 'flat-quality' | 'noisy';
export const FUZZ_FAMILIES: FuzzFamily[] = ['flat-obstacles', 'flat-quality', 'noisy'];

/** Random terrain for property/fuzz tests. `flat-*` families have slope = roughness = 0 (exact oracles apply). */
export async function buildRandomTerrain(seed: number, family: FuzzFamily): Promise<SimBundle & { family: FuzzFamily; geo: Geo }> {
  const rand = mulberry32(seed);
  const W = randInt(rand, 6, 40), H = randInt(rand, 6, 40);
  const de = [2, 5, 10][randInt(rand, 0, 2)]!, dn = rand() < 0.2 ? de * 2 : de;
  const g = grid(W, H, de, dn);
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    const p = g.geo.at(r, c);
    g.elevation[g.geo.idx(r, c)] = family === 'noisy' ? -2000 + 15 * de * fbm(seed, p.east_m / (8 * de), p.north_m / (8 * dn), 3) : -2000;
  }
  const blob = (apply: (i: number) => void) => {
    const cr = randInt(rand, 0, H - 1), cc = randInt(rand, 0, W - 1), rad = 0.8 + rand() * 4;
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (Math.hypot(r - cr, c - cc) <= rad) apply(g.geo.idx(r, c));
  };
  const nBlobs = randInt(rand, 0, 6);
  for (let k = 0; k < nBlobs; k++) blob((i) => (g.quality[i] = QUALITY.UNKNOWN));
  if (family !== 'flat-quality') {
    const density = rand() * 0.3;
    for (let i = 0; i < g.N; i++) if (rand() < density) g.exclusion[i] = EXCLUSION.MANUAL;
    if (family === 'noisy') {
      const holes = randInt(rand, 0, 3);
      for (let k = 0; k < holes; k++) blob((i) => (g.elevation[i] = NaN));
    } else if (rand() < 0.5) {
      for (let k = 0; k < randInt(rand, 1, 4); k++) blob((i) => (g.quality[i] = QUALITY.LOW));
    }
  }
  const built = await buildSimBundle({ ...g, id: `fuzz-${family}`, seed, title: `fuzz ${family}`, description: `Random ${family} terrain, seed ${seed}.` });
  return { ...built, family, geo: g.geo };
}
