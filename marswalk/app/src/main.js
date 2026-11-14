import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { Terrain } from './terrain.js';
import { makeSky, HORIZON } from './sky.js';
import { Player } from './player.js';
import { Mission } from './mission.js';
import { Hud } from './hud.js';
import { Pois } from './pois.js';
import { Wrist, Credits, Debrief } from './info.js';
import { Helmet } from './helmet.js';
import { ArmDisplay } from './arm.js';

const Q = new URLSearchParams(location.search);
const SITE = Q.get('site') || 'jezero-delta';
const base = `${import.meta.env.BASE_URL}sites/${SITE}/`;
const $ = id => document.getElementById(id);
const bar = $('bar').firstElementChild, msg = $('msg');
let done = 0, total = 1; const tick = (t) => { done++; bar.style.width = (100 * done / total).toFixed(0) + '%'; if (t) msg.textContent = t; };

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight);
renderer.xr.enabled = true; renderer.xr.setReferenceSpaceType('local-floor'); renderer.xr.setFoveation(1);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = HORIZON.clone();
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.25, 60000);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
async function bitmap(url) { return createImageBitmap(await (await fetch(url)).blob(), { colorSpaceConversion: 'none' }); }
function grayTex(w, h, mips) {   // single-channel texture: a quarter of the memory of RGBA, which matters on a headset
  // allocated through a render target so three.js reserves storage (and mip levels) without needing pixel data up front
  const rt = new THREE.WebGLRenderTarget(w, h, { format: THREE.RedFormat, type: THREE.UnsignedByteType, depthBuffer: false, generateMipmaps: mips,
    minFilter: mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter, magFilter: THREE.LinearFilter, anisotropy: mips ? maxAniso : 1, colorSpace: THREE.NoColorSpace });
  renderer.initRenderTarget(rt); return rt.texture;
}
// Loads T x T image tiles straight into one GPU texture (never holds the whole mosaic decoded in memory).
async function grayMosaic(urls, T, mips = true) {
  const gl = renderer.getContext(); let tex = null, px = 0;
  await Promise.all(urls.map(async (url, i) => {
    const bmp = await bitmap(url); if (!tex) { px = bmp.width; tex = grayTex(px * T, bmp.height * T, mips); }
    gl.bindTexture(gl.TEXTURE_2D, renderer.properties.get(tex).__webglTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, (i % T) * px, Math.floor(i / T) * bmp.height, gl.RED, gl.UNSIGNED_BYTE, bmp); bmp.close?.(); renderer.resetState(); tick();
  }));
  if (mips) { gl.bindTexture(gl.TEXTURE_2D, renderer.properties.get(tex).__webglTexture); gl.generateMipmap(gl.TEXTURE_2D); renderer.resetState(); }
  return tex;
}
async function colorTex(url) { const t = new THREE.Texture(await bitmap(url)); t.flipY = false; t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = false; t.minFilter = t.magFilter = THREE.LinearFilter; t.needsUpdate = true; tick(); return t; }
async function heights(ring) {
  const u = new Uint16Array(await (await fetch(base + ring.name + '_h.bin')).arrayBuffer()); const f = new Float32Array(u.length);
  for (let i = 0; i < u.length; i++) f[i] = ring.hmin + u[i] * ring.hscale; tick(); return f;
}

const app = window.app = { renderer, scene, camera, layer: 0, rings: [], stats: {} };
const shared = app.shared = { uCam: { value: new THREE.Vector3() }, uFog: { value: HORIZON.clone() }, uFogDist: { value: 26000 }, uLayer: { value: 0 }, uOpacity: { value: 1 },
  uSlopeLimits: { value: new THREE.Vector3(10, 20, 30) }, uElevRange: { value: new THREE.Vector2(0, 1) }, uTime: { value: 0 },
  uOverlay: { value: null }, uOverlayOn: { value: 0 }, uOverlayHalf: { value: 1 }, uNav: { value: null }, uRouteOn: { value: 1 }, uTrackOn: { value: 0 } };
const world = app.world = new THREE.Group(); scene.add(world);
const sky = makeSky(); scene.add(sky);

// data layers the astronaut can switch between
app.LAYERS = [
  { name: 'Immagine satellitare', src: 'MRO HiRISE, 25 cm/pixel', legend: [] },
  { name: 'Pendenze e ostacoli', src: 'Derivata dal modello HiRISE a 1 m', legend: [['#1abf59', 'sotto 10°: agevole'], ['#fad926', '10–20°: impegnativa'], ['#ff800d', '20–30°: critica'], ['#f2141a', 'oltre 30°: vietata']] },
  { name: 'Topografia', src: 'Modello HiRISE agganciato a MOLA, isoipse ogni 5 m', legend: [['#30123b', 'più basso'], ['#28bbec', ''], ['#a2fc3c', ''], ['#fb8022', ''], ['#7a0403', 'più alto']] },
];
app.setLayer = i => { app.layer = (i + app.LAYERS.length) % app.LAYERS.length; shared.uLayer.value = app.layer; const o = app.LAYERS[app.layer].overlay;
  shared.uOverlayOn.value = o ? 1 : 0; if (o) { shared.uOverlay.value = o.tex; shared.uOverlayHalf.value = o.half; } app.onLayer?.(); };
// colour overlays from other instruments (kept un-premultiplied: alpha says where the instrument has a signal)
async function overlayTex(url) { const bmp = await createImageBitmap(await (await fetch(url)).blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const t = new THREE.Texture(bmp); t.flipY = false; t.premultiplyAlpha = false; t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = false; t.minFilter = t.magFilter = THREE.LinearFilter; t.needsUpdate = true; return t; }
app.toggleTrack = () => { shared.uTrackOn.value = shared.uTrackOn.value ? 0 : 1; app.onLayer?.(); };

async function boot() {
  const site = app.site = await (await fetch(base + 'site.json')).json();
  total = site.rings.reduce((a, r) => a + 2 + r.orthoTiles * r.orthoTiles, 0) + 1;
  const [nav, ...loaded] = await Promise.all([colorTex(base + 'inner_nav.png'), ...site.rings.map(async ring => {
    const T = ring.orthoTiles, urls = []; for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) urls.push(`${base}${ring.name}_ortho_${x}_${y}.jpg`);
    const [h, slope, ortho] = await Promise.all([heights(ring), grayMosaic([`${base}${ring.name}_slope.png`], 1, false), grayMosaic(urls, T)]); return { ring, heights: h, slope, ortho };
  })]);
  const ov = site.overlays || {};
  if (ov.minerals) app.LAYERS.push({ name: 'Geologia: minerali', src: 'Spettrometro MRO CRISM, 18 m/pixel', overlay: { tex: await overlayTex(base + ov.minerals.file), half: ov.minerals.half },
    legend: ov.minerals.channels.map(c => [c.color, c.label]), note: 'Dove campionare: le argille e i carbonati si formano in acqua.' });
  if (ov.thermal) app.LAYERS.push({ name: 'Temperatura: infrarosso', src: 'Mars Odyssey THEMIS notturno, 100 m/pixel', overlay: { tex: await overlayTex(base + ov.thermal.file), half: ov.thermal.half },
    legend: [['#fffabe', 'caldo di notte: roccia compatta'], ['#e1503c', 'intermedio'], ['#2a0f55', 'freddo di notte: sabbia e polvere']], note: 'Dove si cammina bene: la sabbia sciolta rallenta e affatica.' });
  msg.textContent = 'Costruzione del terreno…'; shared.uNav.value = nav;
  const inner = loaded[0]; const n = inner.ring.n; const h0 = app.h0 = inner.heights[(n >> 1) * n + (n >> 1)];
  let lo = Infinity, hi = -Infinity; for (let i = 0; i < inner.heights.length; i += 7) { const v = inner.heights[i]; if (v < lo) lo = v; if (v > hi) hi = v; } shared.uElevRange.value.set(lo, hi);
  if (site.mission) shared.uSlopeLimits.value.fromArray(site.mission.slopeLimitsDeg);
  const terrain = app.terrain = new Terrain(loaded, h0, shared, { N: +(Q.get('n') ?? 64), levels: +(Q.get('levels') ?? 9) }); world.add(terrain.group); app.rings = terrain.fields.map((field, i) => ({ field, ring: loaded[i].ring }));
  // world y of the surface at (x,z): finest ring that covers the point
  app.ground = (x, z) => { for (const r of app.rings) if (r.field.contains(x, z)) return r.field.height(x, z) - h0; return null; };
  app.slope = (x, z) => { for (const r of app.rings) if (r.field.contains(x, z, r.ring.res * 2)) return r.field.slopeDeg(x, z, r.ring.res); return 0; };
  const player = app.player = new Player(renderer, camera, scene, app.ground, renderer.domElement);
  const lim = site.rings[1].half - 30; player.canStandAt = (x, z) => Math.abs(x) < lim && Math.abs(z) < lim;
  const mission = app.mission = new Mission(site, app.ground);
  const b = mission.base, t1 = mission.target, startYaw = Math.atan2(-(t1.x - b.x), t1.y - b.y);
  player.placeAt(+(Q.get('x') ?? b.x + 4), +(Q.get('z') ?? -b.y + 4), +(Q.get('yaw') ?? startYaw)); player.pitch = +(Q.get('pitch') ?? 0);
  player.onMove = (a, c) => mission.move(a, c);
  const pois = app.pois = new Pois(app, base); world.add(pois.group);
  const hud = app.hud = new Hud(app);
  const wrist = app.wrist = new Wrist(app), credits = app.credits = new Credits(app), debrief = app.debrief = new Debrief(app), helmet = app.helmet = new Helmet(app), arm = app.arm = new ArmDisplay(app, base); app.onLayer = () => { wrist.draw(); arm.acc = 1; };
  app.setLayer(+(Q.get('layer') ?? 0)); if (Q.get('track')) app.toggleTrack();
  app.reset = () => { if (player.lift) player.toggleOverview(); mission.reset(); player.placeAt(b.x + 4, -b.y + 4, startYaw); };
  // controls: A/B on the right controller, X/Y on the left; same actions on the keyboard
  player.onButton = (hand, i) => { if (hand === 'right' && i === 0) player.toggleOverview(); else if (hand === 'right' && i === 1) arm.toggle(); else if (i === 0 || i === 1) return; else if (hand === 'right' && i === 4) app.setLayer(app.layer + 1); else if (hand === 'right' && i === 5) app.toggleTrack(); else if (hand === 'left' && i === 5) app.reset(); else if (hand === 'left' && i === 4) credits.toggle(); };
  addEventListener('keydown', e => { const m = /^Digit([1-9])$/.exec(e.code); if (m && +m[1] <= app.LAYERS.length) app.setLayer(+m[1] - 1);
    if (e.code === 'KeyL') app.setLayer(app.layer + 1); if (e.code === 'KeyT') app.toggleTrack(); if (e.code === 'KeyR') app.reset(); if (e.code === 'KeyH') hud.panel.mesh.visible = !hud.panel.mesh.visible; if (e.code === 'KeyC') credits.toggle(); if (e.code === 'KeyM') player.toggleOverview(); if (e.code === 'KeyI') arm.toggle(); if (e.code === 'KeyV') helmet.off = !helmet.off; });
  const vr = VRButton.createButton(renderer, { optionalFeatures: ['local-floor', 'bounded-floor'] }); document.body.appendChild(vr);
  $('help').innerHTML = '<b>PC</b>: clic per catturare il mouse · <b>WASD</b> cammina · <b>Shift</b> veloce · <b>L</b> livello dati · <b>I</b> display sul braccio · <b>M</b> vista dall\'alto · <b>T</b> traccia del rover · <b>C</b> fonti dei dati · <b>R</b> ricomincia<br><b>Quest</b>: stick sinistro cammina (grilletto laterale = veloce) · stick destro avanti = teletrasporto, lati = gira · <b>grilletto destro</b> vista dall\'alto · <b>grilletto laterale destro</b> display sul braccio · <b>A</b> livello dati · <b>B</b> traccia del rover · <b>X</b> fonti dei dati · <b>Y</b> ricomincia';
  $('boot').style.opacity = 0; setTimeout(() => $('boot').remove(), 700);
  const clock = new THREE.Clock(), dir = new THREE.Vector3(), cam = new THREE.Vector3(); let fpsT = 0, fpsN = 0;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1); shared.uTime.value += dt;
    player.update(dt); mission.idle(dt);
    camera.updateMatrixWorld(); camera.getWorldPosition(cam); shared.uCam.value.copy(cam); sky.position.copy(cam); camera.getWorldDirection(dir);
    if (!player.lift) mission.check(cam); pois.update(cam); hud.update(dt); debrief.update(); helmet.update(); arm.update(dt);
    const tris = terrain.update(cam, dir, renderer.xr.isPresenting ? 0.2 : 0.35, app.baseRes || 1);
    renderer.render(scene, camera);
    fpsN++; fpsT += dt; if (fpsT > 1) { app.stats = { fps: Math.round(fpsN / fpsT), tris, calls: renderer.info.render.calls }; fpsN = 0; fpsT = 0; }
    app.frame = (app.frame || 0) + 1;
  });
}
boot().catch(e => { console.error(e); msg.textContent = 'Errore: ' + e.message; });
