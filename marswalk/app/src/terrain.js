// Terrain rendered from real orbital elevation models (HiRISE 1 m, HiRISE 8 m, CTX 40 m rings).
// Geometry clipmap: a handful of nested square grids follow the viewer, each twice as coarse as the one inside it.
// Vertices are displaced on the GPU from the height textures, so the whole 29 km scene costs ~10 draw calls —
// which is what makes it run on a standalone headset.
import * as THREE from 'three';

export class Heightfield {
  constructor(ring, data) { this.n = ring.n; this.res = ring.res; this.half = ring.half; this.data = data; }
  contains(x, z, margin = 0) { const h = this.half - margin; return Math.abs(x) <= h && Math.abs(z) <= h; }
  // bilinear height (metres above the areoid) at world x (east), z (south)
  height(x, z) {
    const n = this.n, d = this.data;
    let c = (x + this.half) / this.res, r = (z + this.half) / this.res;
    c = Math.min(Math.max(c, 0), n - 1.001); r = Math.min(Math.max(r, 0), n - 1.001);
    const c0 = c | 0, r0 = r | 0, fc = c - c0, fr = r - r0, i = r0 * n + c0;
    return (d[i] * (1 - fc) + d[i + 1] * fc) * (1 - fr) + (d[i + n] * (1 - fc) + d[i + n + 1] * fc) * fr;
  }
  slopeDeg(x, z, e = 1) {
    const dx = (this.height(x + e, z) - this.height(x - e, z)) / (2 * e), dz = (this.height(x, z + e) - this.height(x, z - e)) / (2 * e);
    return Math.atan(Math.hypot(dx, dz)) * 180 / Math.PI;
  }
}

const COMMON = /* glsl */`
precision highp float; precision highp sampler2D;
uniform vec3 uRing0, uRing1, uRing2;   // per data ring: half extent (m), resolution (m), samples per side
`;
const VERT = COMMON + /* glsl */`
uniform sampler2D uH0, uH1, uH2;
uniform vec2 uCenter; uniform float uScale, uHRef;
varying vec3 vPos; varying float vH;
float bil(sampler2D t, vec3 R, vec2 p) {
  vec2 g = clamp((p + R.x) / R.y, vec2(0.0), vec2(R.z - 1.0));
  ivec2 i = min(ivec2(floor(g)), ivec2(int(R.z) - 2)); vec2 f = g - vec2(i);
  float a = texelFetch(t, i, 0).r, b = texelFetch(t, i + ivec2(1, 0), 0).r, c = texelFetch(t, i + ivec2(0, 1), 0).r, d = texelFetch(t, i + ivec2(1, 1), 0).r;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float heightAt(vec2 p) {
  float m = max(abs(p.x), abs(p.y));
  if (m <= uRing0.x) return bil(uH0, uRing0, p);
  if (m <= uRing1.x) return bil(uH1, uRing1, p);
  return bil(uH2, uRing2, p);
}
void main() {
  vec2 p = uCenter + position.xz * uScale;
  float h = heightAt(p); vH = h;
  vPos = vec3(p.x, h - uHRef, p.y);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(vPos, 1.0);
}`;

const FRAG = COMMON + /* glsl */`
uniform sampler2D uO0, uO1, uO2, uS0, uS1, uS2, uOverlay, uNav;
uniform vec4 uHole;               // finer level footprint (cx, cz, half) — this level is not drawn there
uniform float uFogDist, uDetail, uOpacity, uOverlayHalf, uOverlayOn, uRouteOn, uTrackOn, uTime;
uniform int uLayer;               // 0 image, 1 slope/hazard, 2 elevation, 3+ overlay texture
uniform vec3 uCam, uFog, uSlopeLimits;
uniform vec2 uElevRange;
varying vec3 vPos; varying float vH;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
vec3 mars(float g){ g = pow(clamp(g, 0.0, 1.0), 0.9); return mix(vec3(0.16, 0.085, 0.055), vec3(1.0, 0.76, 0.56), g); }
vec3 turbo(float t){ t = clamp(t, 0.0, 1.0);
  return clamp(vec3(0.1357 + t*(4.5974 - t*(42.3277 - t*(130.5887 - t*(150.5666 - t*58.1375)))),
                    0.0914 + t*(2.1856 + t*(4.8052 - t*(14.0195 - t*(4.2109 + t*2.7747)))),
                    0.1067 + t*(12.5925 - t*(60.1097 - t*(109.0745 - t*(88.5066 - t*26.8183))))), 0.0, 1.0); }
void main() {
  vec2 p = vPos.xz;
  if (max(abs(p.x - uHole.x), abs(p.y - uHole.y)) < uHole.z) discard;
  float m = max(abs(p.x), abs(p.y));
  vec2 dx = dFdx(p), dy = dFdy(p);
  float g, s;
  if (m < uRing0.x) { vec2 uv = (p + uRing0.x) / (2.0 * uRing0.x); g = textureGrad(uO0, uv, dx / (2.0 * uRing0.x), dy / (2.0 * uRing0.x)).r;
    if (uLayer == 1) s = textureLod(uS0, (p + uRing0.x + 0.5 * uRing0.y) / (uRing0.z * uRing0.y), 0.0).r; }
  else if (m < uRing1.x) { vec2 uv = (p + uRing1.x) / (2.0 * uRing1.x); g = textureGrad(uO1, uv, dx / (2.0 * uRing1.x), dy / (2.0 * uRing1.x)).r;
    if (uLayer == 1) s = textureLod(uS1, (p + uRing1.x + 0.5 * uRing1.y) / (uRing1.z * uRing1.y), 0.0).r; }
  else { vec2 uv = clamp((p + uRing2.x) / (2.0 * uRing2.x), 0.0, 1.0); g = textureGrad(uO2, uv, dx / (2.0 * uRing2.x), dy / (2.0 * uRing2.x)).r;
    if (uLayer == 1) s = textureLod(uS2, clamp((p + uRing2.x + 0.5 * uRing2.y) / (uRing2.z * uRing2.y), 0.0, 1.0), 0.0).r; }
  float dist = distance(vPos, uCam);
  // close-range procedural grain so the 25 cm/pixel orbital image does not turn to mush at your feet (cosmetic, not data)
  float near = uDetail * (1.0 - smoothstep(4.0, 40.0, dist));
  if (near > 0.0) { float d = noise(p * 9.0) * 0.6 + noise(p * 37.0) * 0.4; g *= 1.0 + (d - 0.5) * 0.35 * near; }
  vec3 col = mars(g);
  float shade = 0.45 + 0.75 * g;
  if (uLayer == 1) {
    s *= 127.5;
    vec3 c = s < uSlopeLimits.x ? vec3(0.10, 0.75, 0.35) : s < uSlopeLimits.y ? vec3(0.98, 0.85, 0.15) : s < uSlopeLimits.z ? vec3(1.0, 0.5, 0.05) : vec3(0.95, 0.08, 0.1);
    col = mix(col, c * shade, 0.62);
  } else if (uLayer == 2) {
    col = mix(col, turbo((vH - uElevRange.x) / (uElevRange.y - uElevRange.x)) * shade, 0.6);
    float e = vH / 5.0; float line = 1.0 - smoothstep(0.0, 1.5, abs(fract(e - 0.5) - 0.5) / fwidth(e));
    col = mix(col, vec3(0.05), line * 0.7 * (1.0 - smoothstep(300.0, 900.0, dist)));
  } else if (uLayer >= 3 && uOverlayOn > 0.5 && m < uOverlayHalf) {
    vec4 o = textureLod(uOverlay, (p + uOverlayHalf) / (2.0 * uOverlayHalf), 0.0);
    col = mix(col, o.rgb * shade, o.a * 0.7);
  }
  // planned EVA route and the rover's real track, drawn from a distance-field texture so they hug the ground at any detail level
  if (m < uRing0.x && (uRouteOn > 0.5 || uTrackOn > 0.5)) {
    vec3 nav = textureLod(uNav, (p + uRing0.x + 0.5 * uRing0.y) / (uRing0.z * uRing0.y), 0.0).rgb * 25.5;
    float wd = 0.35 + dist * 0.004;
    if (uTrackOn > 0.5) col = mix(col, vec3(1.0), (1.0 - smoothstep(wd * 0.5, wd * 0.5 + 0.25, nav.g)) * 0.75);
    if (uRouteOn > 0.5) { float core = 1.0 - smoothstep(wd, wd + 0.3, nav.r); col = mix(col, vec3(0.2, 0.9, 1.0), core * 0.9); col += vec3(0.1, 0.45, 0.5) * exp(-nav.r * 0.9) * 0.35; }
  }
  col = mix(col, uFog, 1.0 - exp(-dist / uFogDist));
  gl_FragColor = vec4(col, uOpacity);
}`;

// one quadrant (x>=0,z>=0 rotated by q) of a square grid of half-size N cells, optionally with a square hole of half-size H
function quadrantGeometry(N, H, q) {
  const pos = [], idx = [], id = new Map();
  const rot = (i, j) => q === 0 ? [i, j] : q === 1 ? [-j, i] : q === 2 ? [-i, -j] : [j, -i];
  const v = (i, j) => { const k = i * (N + 1) + j; let n = id.get(k); if (n === undefined) { n = pos.length / 3; const [x, z] = rot(i, j); pos.push(x, 0, z); id.set(k, n); } return n; };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    if (i < H && j < H) continue;
    const a = v(i, j), b = v(i + 1, j), c = v(i, j + 1), d = v(i + 1, j + 1); idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  return g;
}

function heightTexture(ring, heights) {
  // padded by one texel on the far edges: some drivers return 0 when fetching the very last row/column
  const n = ring.n, m = n + 1, pad = new Float32Array(m * m);
  for (let r = 0; r < m; r++) { const sr = Math.min(r, n - 1); pad.set(heights.subarray(sr * n, sr * n + n), r * m); pad[r * m + n] = heights[sr * n + n - 1]; }
  const t = new THREE.DataTexture(pad, m, m, THREE.RedFormat, THREE.FloatType); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t;
}

const _c = new THREE.Vector3();
export class Terrain {
  // rings: [{ring, heights, ortho, slope}] finest first; shared: uniforms shared with the rest of the app
  constructor(rings, hRef, shared, opts = {}) {
    this.N = opts.N || 64; this.levels = opts.levels || 9; this.group = new THREE.Group(); this.fields = rings.map(r => new Heightfield(r.ring, r.heights));
    this.hRef = hRef; let lo = Infinity, hi = -Infinity; for (const r of rings) { lo = Math.min(lo, r.ring.hmin); hi = Math.max(hi, r.ring.hmin + 65535 * r.ring.hscale); } this.yMin = lo - hRef; this.yMax = hi - hRef;
    const R = i => new THREE.Vector3(rings[i].ring.half, rings[i].ring.res, rings[i].ring.n);
    this.uniforms = { ...shared, uRing0: { value: R(0) }, uRing1: { value: R(1) }, uRing2: { value: R(2) }, uHRef: { value: hRef },
      uH0: { value: heightTexture(rings[0].ring, rings[0].heights) }, uH1: { value: heightTexture(rings[1].ring, rings[1].heights) }, uH2: { value: heightTexture(rings[2].ring, rings[2].heights) },
      uO0: { value: rings[0].ortho }, uO1: { value: rings[1].ortho }, uO2: { value: rings[2].ortho }, uS0: { value: rings[0].slope }, uS1: { value: rings[1].slope }, uS2: { value: rings[2].slope } };
    const N = this.N, hole = N / 2 - 2; this.lv = [];
    const full = [0, 1, 2, 3].map(q => quadrantGeometry(N, 0, q)), ring = [0, 1, 2, 3].map(q => quadrantGeometry(N, hole, q));
    for (let k = 0; k < this.levels; k++) {
      const u = { ...this.uniforms, uCenter: { value: new THREE.Vector2() }, uScale: { value: 1 }, uHole: { value: new THREE.Vector4(0, 0, -1, 0) }, uDetail: { value: k < 2 ? 1 : 0 } };
      const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: u, side: THREE.DoubleSide });
      const meshes = [0, 1, 2, 3].map(q => { const m = new THREE.Mesh(k === 0 ? full[q] : ring[q], mat); m.frustumCulled = false; m.matrixAutoUpdate = false; this.group.add(m); return m; });
      this.lv.push({ u, meshes, mat });
    }
    this.tris = [full[0].index.count / 3, ring[0].index.count / 3];
  }
  // cam, dir: eye position / view direction in terrain-local metres; base: spacing of the finest level (1 = full detail)
  update(cam, dir, cosHalf = 0.2, base = 1) {
    let tris = 0, prev = null; const N = this.N;
    for (let k = 0; k < this.levels; k++) {
      const L = this.lv[k], s = base * (1 << k), snap = 2 * s;
      const cx = Math.round(cam.x / snap) * snap, cz = Math.round(cam.z / snap) * snap;
      L.u.uCenter.value.set(cx, cz); L.u.uScale.value = s;
      if (prev) L.u.uHole.value.set(prev.cx, prev.cz, prev.half - s * 0.75, 0); else L.u.uHole.value.set(0, 0, -1, 0);
      const half = N * s;
      for (let q = 0; q < 4; q++) {   // quadrant view-cone culling
        const sx = q === 0 || q === 3 ? 1 : -1, sz = q === 0 || q === 1 ? 1 : -1; let vis = true;
        if (dir) { _c.set(cx + sx * half / 2 - cam.x, (this.yMin + this.yMax) / 2 - cam.y, cz + sz * half / 2 - cam.z); const len = _c.length(); vis = _c.dot(dir) > cosHalf * len - half * 0.75 - (this.yMax - this.yMin) / 2; }
        L.meshes[q].visible = vis; if (vis) tris += this.tris[k === 0 ? 0 : 1];
      }
      prev = { cx, cz, half };
    }
    return tris;
  }
}
