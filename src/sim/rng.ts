/**
 * Seeded randomness for the simulation suite. OWNER: Role C. Dev/test only (never imported by the app).
 * Deterministic across platforms: integer PRNG + float maths with no platform-specific functions.
 */

/** mulberry32: tiny, fast, good-enough 32-bit PRNG. Returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randInt(rand: () => number, lo: number, hiInclusive: number): number {
  return lo + Math.floor(rand() * (hiInclusive - lo + 1));
}

/** Integer hash of a lattice point + seed -> [0, 1). */
function lattice(seed: number, x: number, y: number): number {
  let h = (seed ^ Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Smooth value noise in [-1, 1] at (x, y) measured in lattice units. */
export function valueNoise(seed: number, x: number, y: number): number {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const tx = smooth(x - x0), ty = smooth(y - y0);
  const a = lattice(seed, x0, y0), b = lattice(seed, x0 + 1, y0);
  const c = lattice(seed, x0, y0 + 1), d = lattice(seed, x0 + 1, y0 + 1);
  const top = a + (b - a) * tx, bot = c + (d - c) * tx;
  return 2 * (top + (bot - top) * ty) - 1;
}

/** Fractal (multi-octave) value noise, roughly in [-1, 1]. */
export function fbm(seed: number, x: number, y: number, octaves = 4, lacunarity = 2, gain = 0.5): number {
  let sum = 0, amp = 1, norm = 0, f = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise(seed + o * 1013, x * f, y * f);
    norm += amp;
    amp *= gain;
    f *= lacunarity;
  }
  return sum / norm;
}
