/**
 * Cinematic landing scene (three.js, lazy-loaded). OWNER: Dhani (UI).
 * All textures, orbital mosaics, terrain meshes, and shader programs are preloaded
 * and warmed on the GPU BEFORE the intro zoom-in begins, eliminating Windows frame drops.
 * Camera view-offset keeps Mars & 3D terrain cleanly in the right 58% of desktop screens
 * so chapter copy sits unobstructed on deep space black to the left.
 */
import * as THREE from 'three';
import type { GridBundle, RouteCandidate, SearchTraceFrame } from '../../contracts';

export interface LandingData {
  bundle: GridBundle;
  candidate: RouteCandidate | null;
  frames: SearchTraceFrame[];
}

export interface LandingSceneAssets {
  globeImg: HTMLImageElement | null;
  jezeroOrthoImg: HTMLImageElement | null;
  terrainImg: HTMLImageElement | null;
}

export interface LandingSceneOpts {
  reducedMotion: boolean;
  assets: LandingSceneAssets;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const seg = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutQuint = (t: number) => 1 - Math.pow(1 - t, 5);
const JEZERO = { lat: 18.4555, lon: 77.4055 };

export function preloadImage(url: string, timeoutMs = 15000): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    const finish = (result: HTMLImageElement | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      img.onload = null;
      img.onerror = null;
      resolve(result);
    };
    const timer = window.setTimeout(() => finish(null), timeoutMs);
    img.decoding = 'async';
    img.onload = () => {
      if (typeof img.decode === 'function') {
        img.decode().then(() => finish(img), () => finish(img));
      } else {
        finish(img);
      }
    };
    img.onerror = () => finish(null);
    img.src = url;
  });
}

function createProceduralMarsTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d');
  if (ctx) {
    const g = ctx.createLinearGradient(0, 0, 512, 256);
    g.addColorStop(0, '#5a2b1d');
    g.addColorStop(0.5, '#9d4f32');
    g.addColorStop(1, '#3d1c14');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 256);
    ctx.fillStyle = 'rgba(40, 18, 12, 0.38)';
    for (let i = 0; i < 48; i++) {
      const x = ((i * 97) % 512);
      const y = ((i * 53) % 256);
      ctx.beginPath();
      ctx.arc(x, y, 6 + (i % 18), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createRadialAlphaTexture(): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.28, size / 2, size / 2, size * 0.495);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.58, '#efefef');
    g.addColorStop(0.84, '#686868');
    g.addColorStop(1, '#000000');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

function textureFromImage(
  img: HTMLImageElement | null,
  anisotropy: number,
  fallback?: () => THREE.Texture,
): THREE.Texture {
  if (!img) {
    return fallback ? fallback() : createProceduralMarsTexture();
  }
  const tex = new THREE.Texture(img);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = Math.min(8, anisotropy);
  tex.needsUpdate = true;
  return tex;
}

export class LandingScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.01, 2000);
  private globe = new THREE.Group();
  private mars: THREE.Mesh;
  private jezeroPatchMat: THREE.MeshStandardMaterial | null = null;
  private marker: THREE.Mesh;
  private markerOuter: THREE.Mesh;
  private terrain = new THREE.Group();
  private terrainMat: THREE.MeshStandardMaterial;
  private cells: THREE.InstancedMesh | null = null;
  private cellOrder: number[] = [];
  private cellDisplayFrac = 0;
  private route: THREE.Mesh | null = null;
  private routeCount = 0;
  private routeDisplayFrac = 0;
  private pins: THREE.Group[] = [];
  private routePts: THREE.Vector3[] = [];
  private progress = 0;
  private start = performance.now();
  private lastFrameMs = performance.now();
  private introPaused = true;
  private hidden = false;
  private raf = 0;
  private reduced: boolean;
  private disposed = false;
  private width = 1280;
  private height = 720;
  private tempEye = new THREE.Vector3();
  private tempTarget = new THREE.Vector3();

  constructor(private canvas: HTMLCanvasElement, opts: LandingSceneOpts) {
    this.reduced = opts.reducedMotion;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.scene.background = new THREE.Color(0x040208);

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy?.() ?? 4;

    // Starfield (lighter count keeps Windows ANGLE fillrate smooth)
    const n = 2200;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1;
      const t = Math.random() * Math.PI * 2;
      const r = 280 + Math.random() * 420;
      const s = Math.sqrt(1 - u * u);
      pos.set([r * s * Math.cos(t), r * u, r * s * Math.sin(t)], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.scene.add(
      new THREE.Points(
        sg,
        new THREE.PointsMaterial({
          color: 0xfff3e6,
          size: 1.15,
          sizeAttenuation: false,
          transparent: true,
          opacity: 0.85,
        }),
      ),
    );

    // Sun + warm bounce light
    const sun = new THREE.DirectionalLight(0xfff1de, 3.15);
    sun.position.set(-4.2, 2.1, 3.4);
    this.scene.add(sun);
    this.scene.add(new THREE.AmbientLight(0x633a28, 0.42));

    // Mars globe + bump shading for crisp orbital crater relief
    const globeTex = textureFromImage(opts.assets.globeImg, maxAniso, createProceduralMarsTexture);
    this.mars = new THREE.Mesh(
      new THREE.SphereGeometry(1, 96, 64),
      new THREE.MeshStandardMaterial({
        map: globeTex,
        bumpMap: globeTex,
        bumpScale: 0.012,
        color: 0xffffff,
        roughness: 0.92,
        metalness: 0.02,
      }),
    );
    this.globe.add(this.mars);

    // Atmosphere Fresnel rim
    const rim = new THREE.Mesh(
      new THREE.SphereGeometry(1.032, 72, 48),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        vertexShader:
          'varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
        fragmentShader:
          'varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 3.2); gl_FragColor = vec4(1.0, 0.56, 0.32, 1.0) * f * 1.35; }',
      }),
    );
    this.globe.add(rim);

    // Three's SphereGeometry maps u=0 at -x: longitude lon sits at theta = lon + 180 deg around +y from +z
    const phi = THREE.MathUtils.degToRad(90 - JEZERO.lat);
    const theta = THREE.MathUtils.degToRad(JEZERO.lon + 180);
    const mp = new THREE.Vector3().setFromSphericalCoords(1.0018, phi, theta);
    const radialAlpha = createRadialAlphaTexture();

    // High-resolution Jezero orbital mosaic patch overlaid on the globe during zoom
    if (opts.assets.jezeroOrthoImg) {
      const patchTex = textureFromImage(opts.assets.jezeroOrthoImg, maxAniso);
      // Cover ~215% more angular swath (~0.92 rad vs 0.29 rad) so high-res orbital terrain fills the visible globe slice.
      const patchGeo = new THREE.SphereGeometry(
        1.0015,
        64,
        64,
        theta - 0.46,
        0.92,
        phi - 0.46,
        0.92,
      );
      this.jezeroPatchMat = new THREE.MeshStandardMaterial({
        map: patchTex,
        alphaMap: radialAlpha,
        color: 0xd9a88c,
        roughness: 0.94,
        metalness: 0,
        transparent: true,
        opacity: 0,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      });
      this.globe.add(new THREE.Mesh(patchGeo, this.jezeroPatchMat));
    } else {
      radialAlpha.dispose();
    }

    // Jezero targeting rings (subtle outer reticle + sharp inner beacon)
    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.015, 0.022, 48),
      new THREE.MeshBasicMaterial({
        color: 0x33e6ff,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.marker.position.copy(mp);
    this.marker.lookAt(mp.clone().multiplyScalar(2));
    this.globe.add(this.marker);

    this.markerOuter = new THREE.Mesh(
      new THREE.RingGeometry(0.032, 0.036, 48),
      new THREE.MeshBasicMaterial({
        color: 0xffb37a,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.markerOuter.position.copy(mp.clone().multiplyScalar(1.0005));
    this.markerOuter.lookAt(mp.clone().multiplyScalar(2));
    this.globe.add(this.markerOuter);

    this.scene.add(this.globe);

    // Terrain stage (populated via setData with real CTX 20 m elevation + HiRISE orthophoto)
    const ttex = textureFromImage(opts.assets.terrainImg ?? opts.assets.jezeroOrthoImg, maxAniso);
    this.terrainMat = new THREE.MeshStandardMaterial({
      map: ttex,
      roughness: 0.92,
      metalness: 0.02,
      transparent: true,
      opacity: 0,
    });
    this.terrain.position.set(0, -200, 0);
    this.scene.add(this.terrain);

    this.resize();
    window.addEventListener('resize', this.resize);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  private onVisibility = () => {
    this.hidden = document.hidden;
    if (!this.hidden && !this.disposed && !this.introPaused && this.raf === 0) {
      this.startLoop();
    }
  };

  setData(d: LandingData) {
    const g = d.bundle.manifest.grid;
    const W = g.width;
    const H = g.height;
    const el = d.bundle.elevation;
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of el) {
      if (Number.isFinite(v)) {
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
    }
    const sx = 2;
    const sz = 2 * (g.extent.north_m / g.extent.east_m);
    const vz = ((hi - lo) / g.extent.east_m) * 2 * 2.25;
    const geo = new THREE.PlaneGeometry(sx, sz, W - 1, H - 1);
    geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position as THREE.BufferAttribute;
    const height = (r: number, c: number) => {
      const v = el[r * W + c];
      return Number.isFinite(v) ? ((v! - lo) / (hi - lo || 1)) * vz : 0;
    };
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        p.setY(r * W + c, height(r, c));
      }
    }
    geo.computeVertexNormals();
    this.terrain.add(new THREE.Mesh(geo, this.terrainMat));

    const toXYZ = (e: number, n: number, lift = 0.012) => {
      const c = Math.min(W - 1, Math.max(0, Math.round(e / g.cellSizeEast_m - 0.5)));
      const r = Math.min(H - 1, Math.max(0, Math.round(H - 1 - (n / g.cellSizeNorth_m - 0.5))));
      return new THREE.Vector3(
        (e / g.extent.east_m - 0.5) * sx,
        height(r, c) + lift,
        (0.5 - n / g.extent.north_m) * sz,
      );
    };

    // Closed cells from real A* trace
    const seen = new Set<number>();
    for (const f of d.frames) {
      for (const i of f.closedCells) {
        if (!seen.has(i)) {
          seen.add(i);
          this.cellOrder.push(i);
        }
      }
    }
    if (this.cellOrder.length) {
      const cw = (sx / Math.max(1, W - 1)) * 0.76;
      const nrmAttr = geo.attributes.normal as THREE.BufferAttribute;
      const im = new THREE.InstancedMesh(
        new THREE.PlaneGeometry(cw, cw).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({
          color: 0xff9b54,
          transparent: true,
          opacity: 0.58,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
        }),
        this.cellOrder.length,
      );
      const m4 = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const up = new THREE.Vector3(0, 1, 0);
      const scale = new THREE.Vector3(1, 1, 1);
      const pos = new THREE.Vector3();
      const nrm = new THREE.Vector3();
      this.cellOrder.forEach((i, k) => {
        const r = Math.min(H - 1, Math.max(0, Math.floor(i / W)));
        const c = Math.min(W - 1, Math.max(0, i % W));
        const vIdx = r * W + c;
        pos.fromBufferAttribute(p, vIdx);
        nrm.fromBufferAttribute(nrmAttr, vIdx).normalize();
        // Hug local hillside normal cleanly so squares never hover in black space above ridges.
        pos.addScaledVector(nrm, 0.0022);
        q.setFromUnitVectors(up, nrm);
        m4.compose(pos, q, scale);
        im.setMatrixAt(k, m4);
      });
      im.instanceMatrix.needsUpdate = true;
      im.count = 0;
      im.frustumCulled = false;
      this.cells = im;
      this.terrain.add(im);
    }

    const cand = d.candidate;
    if (cand && cand.outbound.path.length > 1) {
      this.routePts = cand.outbound.path.map((q) => toXYZ(q.east_m, q.north_m, 0.02));
      const curve = new THREE.CatmullRomCurve3(this.routePts);
      const tg = new THREE.TubeGeometry(curve, Math.max(64, this.routePts.length * 3), 0.01, 8, false);
      this.routeCount = tg.index ? tg.index.count : 0;
      tg.setDrawRange(0, 0);
      this.route = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ color: 0x33e6ff }));
      this.terrain.add(this.route);

      const pin = (v: THREE.Vector3, color: number) => {
        const gp = new THREE.Group();
        const stem = new THREE.Mesh(
          new THREE.CylinderGeometry(0.004, 0.004, 0.16, 8),
          new THREE.MeshBasicMaterial({ color }),
        );
        stem.position.y = 0.08;
        const head = new THREE.Mesh(
          new THREE.SphereGeometry(0.024, 20, 14),
          new THREE.MeshBasicMaterial({ color }),
        );
        head.position.y = 0.17;
        gp.add(stem, head);
        gp.position.copy(v);
        gp.visible = false;
        this.terrain.add(gp);
        return gp;
      };
      this.pins = [pin(this.routePts[0]!, 0x5be08a), pin(this.routePts[this.routePts.length - 1]!, 0xff6b5b)];
    }
  }

  /** Pre-compile WebGL shaders and render warmup frames before lifting the curtain. */
  warmup() {
    if (this.disposed) return;
    this.globe.visible = true;
    this.terrain.position.y = 0;
    this.terrainMat.opacity = 1;
    this.pins.forEach((g) => {
      g.visible = true;
    });
    if (this.cells) this.cells.count = Math.min(16, this.cellOrder.length);
    if (this.route) this.route.geometry.setDrawRange(0, Math.min(60, this.routeCount));
    this.renderer.compile(this.scene, this.camera);
    this.renderer.render(this.scene, this.camera);
    // Reset to clean chapter 0 state
    this.terrain.position.y = -200;
    this.terrainMat.opacity = 0;
    this.pins.forEach((g) => {
      g.visible = false;
    });
    if (this.cells) this.cells.count = 0;
    if (this.route) this.route.geometry.setDrawRange(0, 0);
  }

  /** Start the smooth GPU-warmed animation loop and reset intro timestamp cleanly. */
  begin() {
    if (this.disposed) return;
    this.introPaused = false;
    this.start = performance.now();
    this.frame();
    this.startLoop();
  }

  private startLoop() {
    if (this.raf || this.disposed) return;
    const loop = () => {
      if (this.disposed || this.hidden) {
        this.raf = 0;
        return;
      }
      this.frame();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  setProgress(p: number) {
    this.progress = p;
  }

  private applyCameraFraming(mobile: boolean, walk: number) {
    const w = this.width;
    const h = this.height;
    if (mobile) {
      // Push globe/terrain slightly upward so lower dark card has clean separation
      const offY = Math.round(h * 0.14 * (1 - walk * 0.7));
      this.camera.setViewOffset(w, h, 0, offY, w, h);
    } else {
      // Shift view window left => renders Mars/Terrain centered cleanly in right ~55% of screen
      const offX = -Math.round(w * 0.285 * (1 - walk * 0.92));
      this.camera.setViewOffset(w, h, offX, 0, w, h);
    }
  }

  private resize = () => {
    this.width = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    this.height = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
  };

  private frame() {
    const t = this.introPaused ? 0 : (performance.now() - this.start) / 1000;
    const p = this.progress;
    const mobile = this.width < 960;
    const intro = this.reduced ? 1 : easeOutQuint(clamp01(t / 2.2));

    // ---- Act 1 & 2: Globe + high-res Jezero orbital patch
    const dive = ease(seg(p, 0.48, 1.42));
    const inGlobe = p < 1.5;
    const walk = ease(seg(p, 4.4, 5.25));
    const nowMs = performance.now();
    const dt = Math.min(0.05, Math.max(0.001, (nowMs - this.lastFrameMs) / 1000));
    this.lastFrameMs = nowMs;
    const damp = this.reduced ? 1 : 1 - Math.exp(-9 * dt);

    this.applyCameraFraming(mobile, walk);

    this.globe.visible = inGlobe;
    if (inGlobe) {
      const spinIdle = this.reduced ? 0 : t * 0.045;
      const face = -THREE.MathUtils.degToRad(JEZERO.lon + 180) + Math.PI / 2;
      this.globe.rotation.y = THREE.MathUtils.lerp(
        face - 0.95 + spinIdle * (1 - dive),
        face,
        ease(seg(p, 0.18, 0.92)),
      );
      this.globe.rotation.x = THREE.MathUtils.lerp(0.22, THREE.MathUtils.degToRad(JEZERO.lat), dive);

      const dist = THREE.MathUtils.lerp(
        THREE.MathUtils.lerp(8.2, mobile ? 3.85 : 3.45, intro),
        mobile ? 2.12 : 1.78,
        dive,
      );
      this.camera.position.set(0, 0.06 * (1 - dive), dist);
      this.camera.lookAt(0, 0, 0);
      this.globe.position.set(0, 0, 0);

      if (this.jezeroPatchMat) {
        this.jezeroPatchMat.opacity = ease(seg(p, 0.42, 1.05));
      }
      const pulse = 1 + 0.18 * Math.sin(t * 3);
      (this.marker.material as THREE.MeshBasicMaterial).opacity = 0.65 + 0.35 * Math.sin(t * 3);
      this.marker.scale.setScalar(pulse * THREE.MathUtils.lerp(1, 0.58, dive));
      (this.markerOuter.material as THREE.MeshBasicMaterial).opacity = 0.48 * (1 - dive * 0.65);
      this.markerOuter.scale.setScalar((1 + 0.25 * Math.cos(t * 2.2)) * THREE.MathUtils.lerp(1, 0.5, dive));
    }

    // ---- Acts 3-6: Terrain + A* trace + FPV walk
    const inTerrain = p >= 1.5;
    this.terrain.position.y = inTerrain ? 0 : -200;
    if (inTerrain) {
      this.terrainMat.opacity = ease(seg(p, 1.5, 1.88));
      const orbit = this.reduced ? 0 : t * 0.03;
      const elevLerp = ease(seg(p, 1.5, 2.5));
      const radius = mobile ? 3.15 : 2.65;
      this.tempEye.set(
        Math.sin(0.62 + orbit) * radius,
        THREE.MathUtils.lerp(2.25, 1.48, elevLerp),
        Math.cos(0.62 + orbit) * radius,
      );
      this.tempTarget.set(0, 0.04, 0);

      if (walk > 0 && this.routePts.length > 1) {
        const k = Math.floor(walk * 0.85 * (this.routePts.length - 1));
        const a = this.routePts[k]!;
        const b = this.routePts[Math.min(this.routePts.length - 1, k + 6)]!;
        const ground = new THREE.Vector3(a.x, a.y + 0.036, a.z);
        const look = new THREE.Vector3(b.x, b.y + 0.028, b.z);
        this.tempEye.lerp(ground, walk);
        this.tempTarget.lerp(look, walk);
      }

      this.camera.position.copy(this.tempEye);
      this.camera.lookAt(this.tempTarget);

      const drop = ease(seg(p, 2.02, 2.52));
      this.pins.forEach((g, i) => {
        const d = clamp01(drop * 1.6 - i * 0.55);
        g.visible = d > 0;
        g.scale.setScalar(Math.max(0.001, d));
        const anchorY = this.routePts[i === 0 ? 0 : this.routePts.length - 1]!.y;
        g.position.y = anchorY + (1 - d) * 0.36;
      });

      if (this.cells) {
        const targetCells = ease(seg(p, 2.08, 2.98));
        this.cellDisplayFrac += (targetCells - this.cellDisplayFrac) * damp;
        this.cells.count = Math.floor(this.cellOrder.length * this.cellDisplayFrac);
        const fadeEvidence = seg(p, 3.65, 4.1) * 0.35;
        const fadeWalk = seg(p, 4.15, 4.65) * 0.65;
        const cellOpacity = 0.58 * Math.max(0, 1 - fadeEvidence - fadeWalk);
        (this.cells.material as THREE.MeshBasicMaterial).opacity = cellOpacity;
        this.cells.visible = this.cells.count > 0 && cellOpacity > 0.01;
      }
      if (this.route) {
        const targetRoute = ease(seg(p, 3.15, 3.85));
        this.routeDisplayFrac += (targetRoute - this.routeDisplayFrac) * damp;
        this.route.geometry.setDrawRange(0, Math.floor((this.routeCount * this.routeDisplayFrac) / 3) * 3);
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => {
        const std = x as THREE.MeshStandardMaterial;
        std.map?.dispose();
        std.bumpMap?.dispose();
        std.alphaMap?.dispose();
        x.dispose();
      });
    });
    this.renderer.dispose();
  }
}
