/**
 * Cinematic landing scene (three.js, lazy-loaded). OWNER: Dhani (UI).
 * Act 1: Mars from orbit, Jezero crater marked. Act 2: dive to the delta front, the real CTX 20 m relief draped
 * with the HiRISE orthoimage. Act 3: A and B drop, the real A* search (src/routing, eva-astar-1.0.0) expands
 * frame by frame, the route draws itself. Act 4: the camera drops to boot height along the route.
 * Everything is driven by setProgress(p) (scroll position in screens) plus a short time-based intro.
 */
import * as THREE from 'three';
import type { GridBundle, RouteCandidate, SearchTraceFrame } from '../../contracts';

export interface LandingData {
  bundle: GridBundle;
  candidate: RouteCandidate | null;
  frames: SearchTraceFrame[];
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const seg = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const JEZERO = { lat: 18.45, lon: 77.4 };

export class LandingScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(40, 1, 0.01, 2000);
  private globe = new THREE.Group();
  private mars: THREE.Mesh;
  private marker: THREE.Mesh;
  private terrain = new THREE.Group();
  private terrainMat: THREE.MeshStandardMaterial;
  private cells: THREE.InstancedMesh | null = null;
  private cellOrder: number[] = [];
  private route: THREE.Mesh | null = null;
  private routeCount = 0;
  private pins: THREE.Group[] = [];
  private routePts: THREE.Vector3[] = [];
  private progress = 0;
  private start = performance.now();
  private raf = 0;
  private reduced: boolean;
  private disposed = false;

  constructor(private canvas: HTMLCanvasElement, opts: { reducedMotion: boolean; globeTexture: string; terrainTexture: string }) {
    this.reduced = opts.reducedMotion;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene.background = new THREE.Color(0x040208);

    // stars
    const n = 4000, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, t = Math.random() * Math.PI * 2, r = 300 + Math.random() * 400, s = Math.sqrt(1 - u * u);
      pos.set([r * s * Math.cos(t), r * u, r * s * Math.sin(t)], i * 3);
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xfff1e0, size: 1.1, sizeAttenuation: false, transparent: true, opacity: 0.85 })));

    // lights
    const sun = new THREE.DirectionalLight(0xfff0dd, 3.2); sun.position.set(-4, 2, 3); this.scene.add(sun);
    this.scene.add(new THREE.AmbientLight(0x553322, 0.35));

    // Mars + atmosphere rim + Jezero marker
    const tex = new THREE.TextureLoader().load(opts.globeTexture, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; });
    this.mars = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 96), new THREE.MeshStandardMaterial({ map: tex, color: 0xffffff, roughness: 1, metalness: 0 }));
    this.globe.add(this.mars);
    const rim = new THREE.Mesh(
      new THREE.SphereGeometry(1.035, 96, 64),
      new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
        vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
        fragmentShader: 'varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 3.0); gl_FragColor = vec4(1.0, 0.55, 0.3, 1.0) * f * 1.4; }',
      }),
    );
    this.globe.add(rim);
    const phi = THREE.MathUtils.degToRad(90 - JEZERO.lat), theta = THREE.MathUtils.degToRad(JEZERO.lon + 180);
    const mp = new THREE.Vector3().setFromSphericalCoords(1.002, phi, theta);
    // three's SphereGeometry maps u=0 at -x: longitude lon sits at theta = lon + 180 deg around +y measured from +z
    this.marker = new THREE.Mesh(new THREE.RingGeometry(0.018, 0.026, 48), new THREE.MeshBasicMaterial({ color: 0x7fe0ff, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    this.marker.position.copy(mp); this.marker.lookAt(mp.clone().multiplyScalar(2));
    this.globe.add(this.marker);
    this.scene.add(this.globe);

    // terrain stage (filled by setData)
    const ttex = new THREE.TextureLoader().load(opts.terrainTexture, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; });
    this.terrainMat = new THREE.MeshStandardMaterial({ map: ttex, roughness: 0.95, metalness: 0, transparent: true, opacity: 0 });
    this.terrain.position.set(0, -200, 0); // parked far away until act 2
    this.scene.add(this.terrain);

    this.resize();
    window.addEventListener('resize', this.resize);
    const loop = () => { if (this.disposed) return; this.frame(); this.raf = requestAnimationFrame(loop); };
    loop();
  }

  setData(d: LandingData) {
    const g = d.bundle.manifest.grid, W = g.width, H = g.height, el = d.bundle.elevation;
    let lo = Infinity, hi = -Infinity;
    for (const v of el) if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    const sx = 2, sz = 2 * (g.extent.north_m / g.extent.east_m), vz = (hi - lo) / g.extent.east_m * 2 * 2.2; // 2.2x vertical exaggeration
    const geo = new THREE.PlaneGeometry(sx, sz, W - 1, H - 1); geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position as THREE.BufferAttribute;
    const height = (r: number, c: number) => { const v = el[r * W + c]; return Number.isFinite(v) ? ((v! - lo) / (hi - lo || 1)) * vz : 0; };
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) p.setY(r * W + c, height(r, c));
    geo.computeVertexNormals();
    this.terrain.add(new THREE.Mesh(geo, this.terrainMat));
    const toXYZ = (e: number, n: number, lift = 0.012) => {
      const c = Math.min(W - 1, Math.max(0, Math.round(e / g.cellSizeEast_m - 0.5))), r = Math.min(H - 1, Math.max(0, Math.round(H - 1 - (n / g.cellSizeNorth_m - 0.5))));
      return new THREE.Vector3((e / g.extent.east_m - 0.5) * sx, height(r, c) + lift, (0.5 - n / g.extent.north_m) * sz);
    };
    const cellXYZ = (i: number) => { const r = Math.floor(i / W), c = i % W; return toXYZ((c + 0.5) * g.cellSizeEast_m, (H - 1 - r + 0.5) * g.cellSizeNorth_m, 0.02); };

    // A* closed cells, in the order the search closed them
    const seen = new Set<number>();
    for (const f of d.frames) for (const i of f.closedCells) if (!seen.has(i)) { seen.add(i); this.cellOrder.push(i); }
    if (this.cellOrder.length) {
      const cw = sx / W * 0.86;
      const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(cw, cw).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffb37a, transparent: true, opacity: 0.55, depthWrite: false }), this.cellOrder.length);
      const m4 = new THREE.Matrix4();
      this.cellOrder.forEach((i, k) => { m4.makeTranslation(cellXYZ(i)); im.setMatrixAt(k, m4); });
      im.count = 0; im.frustumCulled = false; this.cells = im; this.terrain.add(im);
    }
    // route tube
    const cand = d.candidate;
    if (cand && cand.outbound.path.length > 1) {
      this.routePts = cand.outbound.path.map((q) => toXYZ(q.east_m, q.north_m, 0.02));
      const curve = new THREE.CatmullRomCurve3(this.routePts);
      const tg = new THREE.TubeGeometry(curve, Math.max(64, this.routePts.length * 3), 0.009, 8, false);
      this.routeCount = tg.index ? tg.index.count : 0;
      tg.setDrawRange(0, 0);
      this.route = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ color: 0x33e6ff }));
      this.terrain.add(this.route);
      const pin = (v: THREE.Vector3, color: number) => {
        const gp = new THREE.Group();
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.16, 8), new THREE.MeshBasicMaterial({ color }));
        stem.position.y = 0.08;
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.022, 24, 16), new THREE.MeshBasicMaterial({ color }));
        head.position.y = 0.17;
        gp.add(stem, head); gp.position.copy(v); gp.visible = false; this.terrain.add(gp); return gp;
      };
      this.pins = [pin(this.routePts[0]!, 0x5be08a), pin(this.routePts[this.routePts.length - 1]!, 0xff6b5b)];
    }
  }

  setProgress(p: number) { this.progress = p; }

  private resize = () => {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  };

  private frame() {
    const t = (performance.now() - this.start) / 1000, p = this.progress, mobile = this.camera.aspect < 0.9;
    const intro = this.reduced ? 1 : ease(clamp01(t / 3.2));
    // ---- act 1: globe
    const dive = ease(seg(p, 0.55, 1.45));
    const inGlobe = p < 1.5;
    this.globe.visible = inGlobe;
    if (inGlobe) {
      // spin so that Jezero faces the camera as the dive begins
      const spinIdle = this.reduced ? 0 : t * 0.05;
      const face = -THREE.MathUtils.degToRad(JEZERO.lon + 180) + Math.PI / 2;
      this.globe.rotation.y = THREE.MathUtils.lerp(face - 1.1 + spinIdle * (1 - dive), face, ease(seg(p, 0.2, 0.9)));
      this.globe.rotation.x = THREE.MathUtils.lerp(0.25, THREE.MathUtils.degToRad(JEZERO.lat), dive);
      const dist = THREE.MathUtils.lerp(THREE.MathUtils.lerp(14, mobile ? 4.4 : 3.3, intro), 1.12, dive);
      const offX = (mobile ? 0 : 0.9) * (1 - dive) * intro;
      this.camera.position.set(-offX, 0.1 * (1 - dive), dist);
      this.camera.lookAt(-offX * 0.0 + (mobile ? 0 : 0.0), 0, 0);
      this.globe.position.set(mobile ? 0 : 0.95 * (1 - dive), mobile ? 0.55 * (1 - dive) : 0, 0);
      (this.marker.material as THREE.MeshBasicMaterial).opacity = 0.55 + 0.45 * Math.sin(t * 3);
      this.marker.scale.setScalar(1 + 0.25 * Math.sin(t * 3) + 2 * dive);
    }
    // ---- acts 2-4: terrain
    const inTerrain = p >= 1.5;
    this.terrain.position.y = inTerrain ? 0 : -200;
    if (inTerrain) {
      this.terrainMat.opacity = ease(seg(p, 1.5, 1.9));
      const orbit = this.reduced ? 0 : t * 0.03;
      const walk = ease(seg(p, 4.4, 5.3));
      let eye = new THREE.Vector3(Math.sin(0.6 + orbit) * 2.6, THREE.MathUtils.lerp(2.4, 1.5, ease(seg(p, 1.5, 2.6))), Math.cos(0.6 + orbit) * 2.6);
      let target = new THREE.Vector3(mobile ? 0 : -0.75, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.6 + orbit);
      if (mobile) eye.multiplyScalar(1.35);
      if (walk > 0 && this.routePts.length > 1) {
        const k = Math.floor(walk * 0.85 * (this.routePts.length - 1)), a = this.routePts[k]!, b = this.routePts[Math.min(this.routePts.length - 1, k + 6)]!;
        const ground = a.clone().add(new THREE.Vector3(0, 0.035, 0)), look = b.clone().add(new THREE.Vector3(0, 0.03, 0));
        eye = eye.lerp(ground, walk); target = target.lerp(look, walk);
      }
      this.camera.position.copy(eye); this.camera.lookAt(target);
      const drop = ease(seg(p, 2.05, 2.5));
      this.pins.forEach((g, i) => { const d = clamp01(drop * 1.6 - i * 0.6); g.visible = d > 0; g.scale.setScalar(Math.max(0.001, d)); g.position.y = this.routePts[i === 0 ? 0 : this.routePts.length - 1]!.y + (1 - d) * 0.4; });
      if (this.cells) this.cells.count = Math.floor(this.cellOrder.length * ease(seg(p, 2.5, 3.35)));
      if (this.cells) (this.cells.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - seg(p, 3.6, 4.2) * 0.7);
      if (this.route) this.route.geometry.setDrawRange(0, Math.floor(this.routeCount * ease(seg(p, 3.25, 3.85)) / 3) * 3);
    }
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.disposed = true; cancelAnimationFrame(this.raf); window.removeEventListener('resize', this.resize);
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => { (x as THREE.MeshStandardMaterial).map?.dispose(); x.dispose(); });
    });
    this.renderer.dispose();
  }
}
