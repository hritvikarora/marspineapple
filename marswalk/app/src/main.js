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
import { Habitat } from './habitat.js';
import { ArmDisplay } from './arm.js';
import { Rover } from './rover.js';
import { Menu } from './menu.js';
import { Globe } from './globe.js';
import { ResearchRoom } from './research.js';
import { Museum } from './museum.js';
import { Heli } from './heli.js';
import { Ambience } from './ambience.js';
import { GlobeRoom } from './globe-room.js';
import { BaseDeco } from './base-deco.js';
import { SampleGame } from './game.js';
import { Quarters } from './quarters.js';
import { T, lang, setLang } from './i18n.js';
import { readPlannerRoute, applyPlannerRoute, plannerNavTexture } from './planner-route.js';
import { RoutePlanner } from './route-planner.js';
import { Directions } from './directions.js';

const Q = new URLSearchParams(location.search);
const SITE = Q.get('site') || 'jezero-delta';
// VITE_SITES_ROOT: inside the team site the walk shares the planner's dist/sites (no duplicate 26 MB copy)
const SITES_ROOT = import.meta.env.VITE_SITES_ROOT || `${import.meta.env.BASE_URL}sites/`;
const base = `${SITES_ROOT}${SITE}/`;
const $ = id => document.getElementById(id);
const bar = $('bar').firstElementChild, msg = $('msg');
document.documentElement.lang = lang.cur; $('tag').textContent = T("Prova generale di un'uscita a piedi su Marte: terreno e immagini reali delle missioni NASA, cratere Jezero."); msg.textContent = T('Caricamento dei dati orbitali…');
let done = 0, total = 1; const tick = (t) => { done++; bar.style.width = (100 * done / total).toFixed(0) + '%'; if (t) msg.textContent = t; };

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight);
renderer.xr.enabled = true; renderer.xr.setReferenceSpaceType('local-floor'); renderer.xr.setFoveation(1);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = HORIZON.clone();
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 60000);
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
const overlays = {};
app.buildLayers = () => { const ov = app.site?.overlays || {}; app.LAYERS = [
  { name: T('Immagine satellitare'), src: T('MRO HiRISE, 25 cm/pixel'), legend: [] },
  { name: T('Pendenze e ostacoli'), src: T('Derivata dal modello HiRISE a 1 m'), legend: [['#1abf59', T('sotto 10°: agevole')], ['#fad926', T('10–20°: impegnativa')], ['#ff800d', T('20–30°: critica')], ['#f2141a', T('oltre 30°: vietata')]] },
  { name: T('Topografia'), src: T('Modello HiRISE agganciato a MOLA, isoipse ogni 5 m'), legend: [['#30123b', T('più basso')], ['#28bbec', ''], ['#a2fc3c', ''], ['#fb8022', ''], ['#7a0403', T('più alto')]] },
  ...(overlays.minerals ? [{ name: T('Geologia: minerali'), src: T('Spettrometro MRO CRISM, 18 m/pixel'), overlay: overlays.minerals, legend: ov.minerals.channels.map(c => [c.color, T(c.label)]), note: T('Dove campionare: le argille e i carbonati si formano in acqua.') }] : []),
  ...(overlays.thermal ? [{ name: T('Temperatura: infrarosso'), src: T('Mars Odyssey THEMIS notturno, 100 m/pixel'), overlay: overlays.thermal,
    legend: [['#fffabe', T('caldo di notte: roccia compatta')], ['#e1503c', T('intermedio')], ['#2a0f55', T('freddo di notte: sabbia e polvere')]], note: T('Dove si cammina bene: la sabbia sciolta rallenta e affatica.') }] : []),
]; };
app.setLayer = i => { app.layer = (i + app.LAYERS.length) % app.LAYERS.length; shared.uLayer.value = app.layer; const o = app.LAYERS[app.layer].overlay;
  shared.uOverlayOn.value = o ? 1 : 0; if (o) { shared.uOverlay.value = o.tex; shared.uOverlayHalf.value = o.half; } app.onLayer?.(); };
// colour overlays from other instruments (kept un-premultiplied: alpha says where the instrument has a signal)
async function overlayTex(url) { const bmp = await createImageBitmap(await (await fetch(url)).blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const t = new THREE.Texture(bmp); t.flipY = false; t.premultiplyAlpha = false; t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = false; t.minFilter = t.magFilter = THREE.LinearFilter; t.needsUpdate = true; return t; }
app.toggleTrack = () => { shared.uTrackOn.value = shared.uTrackOn.value ? 0 : 1; app.onLayer?.(); };

async function boot() {
  const site = app.site = await (await fetch(base + 'site.json')).json();
  app.siteStops = site.pois.slice(); const plan = readPlannerRoute(Q); if (plan) applyPlannerRoute(site, plan);   // route chosen in MARS PATHFINDER
  total = site.rings.reduce((a, r) => a + 2 + r.orthoTiles * r.orthoTiles, 0) + 1;
  const [nav, ...loaded] = await Promise.all([colorTex(base + 'inner_nav.png'), ...site.rings.map(async ring => {
    const T = ring.orthoTiles, urls = []; for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) urls.push(`${base}${ring.name}_ortho_${x}_${y}.jpg`);
    const [h, slope, ortho] = await Promise.all([heights(ring), grayMosaic([`${base}${ring.name}_slope.png`], 1, false), grayMosaic(urls, T)]); return { ring, heights: h, slope, ortho };
  })]);
  const ov = site.overlays || {};
  if (ov.minerals) overlays.minerals = { tex: await overlayTex(base + ov.minerals.file), half: ov.minerals.half };
  if (ov.thermal) overlays.thermal = { tex: await overlayTex(base + ov.thermal.file), half: ov.thermal.half };
  app.buildLayers();
  msg.textContent = T('Costruzione del terreno…'); shared.uNav.value = plan ? await plannerNavTexture(base + 'inner_nav.png', site, THREE).catch(e => (console.warn('planner nav', e), nav)) : nav;
  const inner = loaded[0]; const n = inner.ring.n; const h0 = app.h0 = inner.heights[(n >> 1) * n + (n >> 1)];
  let lo = Infinity, hi = -Infinity; for (let i = 0; i < inner.heights.length; i += 7) { const v = inner.heights[i]; if (v < lo) lo = v; if (v > hi) hi = v; } shared.uElevRange.value.set(lo, hi);
  if (site.mission) shared.uSlopeLimits.value.fromArray(site.mission.slopeLimitsDeg);
  const terrain = app.terrain = new Terrain(loaded, h0, shared, { N: +(Q.get('n') ?? 64), levels: +(Q.get('levels') ?? 9) }); world.add(terrain.group); app.rings = terrain.fields.map((field, i) => ({ field, ring: loaded[i].ring }));
  // world y of the surface at (x,z): finest ring that covers the point
  app.ground = (x, z) => { for (const r of app.rings) if (r.field.contains(x, z)) return r.field.height(x, z) - h0; return null; };
  app.slope = (x, z) => { for (const r of app.rings) if (r.field.contains(x, z, r.ring.res * 2)) return r.field.slopeDeg(x, z, r.ring.res); return 0; };
  const bp = site.pois.find(p => p.kind === 'base'), fp = site.pois.find(p => p.id === site.legs[0].to), hab = app.habitat = new Habitat(app, bp.x, -bp.y, Math.atan2(-(fp.x - bp.x), fp.y - bp.y));
  app.siteId = SITE; const room = app.room = new ResearchRoom(app, hab, import.meta.env.BASE_URL); const museum = app.museum = new Museum(app, hab, import.meta.env.BASE_URL); const heli = app.heli = new Heli(app, import.meta.env.BASE_URL); const amb = app.ambience = new Ambience(import.meta.env.BASE_URL); const groom = app.globeRoom = new GlobeRoom(app, hab, import.meta.env.BASE_URL); const deco = app.deco = new BaseDeco(app, hab); const game = app.game = new SampleGame(app, import.meta.env.BASE_URL); const quarters = app.quarters = new Quarters(app, hab);
  for (const ev of ['pointerdown', 'keydown', 'touchend']) addEventListener(ev, () => amb.start(), true);   // audio may only start after a gesture
  app.walkGround = (x, z) => hab.groundY(x, z) ?? app.ground(x, z);
  const player = app.player = new Player(renderer, camera, scene, app.walkGround, renderer.domElement);
  const lim = site.rings[1].half - 30; player.canStandAt = (x, z) => Math.abs(x) < lim && Math.abs(z) < lim && hab.canPass(x, z) && museum.canPass(x, z) && deco.canPass(x, z) && (app.started || hab.indoors(x, z));   // the airlock stays shut until the mission starts
  const mission = app.mission = new Mission(site, app.ground);
  const b = mission.base, t1 = mission.target, startYaw = Math.atan2(-(t1.x - b.x), t1.y - b.y);
  const [sx, sz] = hab.startPos(), flat = site.mission.walk.flatSpeed, sl = site.mission.slopeLimitsDeg;
  // rough ground slows the astronaut down (same slope law as the mission model); slopes beyond the suit limit cannot be teleported onto
  player.speedFactor = (x, z) => hab.groundY(x, z) != null ? 1 : Math.max(0.12, Math.min(1, mission.speed(Math.tan(app.slope(x, z) * Math.PI / 180)) / flat));
  player.canTeleportTo = (x, z) => app.started ? hab.groundY(x, z) != null || app.slope(x, z) < sl[2] : hab.indoors(x, z);
  player.placeAt(+(Q.get('x') ?? sx), +(Q.get('z') ?? sz), +(Q.get('yaw') ?? startYaw)); player.pitch = +(Q.get('pitch') ?? 0);
  player.onMove = (a, c) => { if (app.started) mission.move(a, c); };
  const pois = app.pois = new Pois(app, base); world.add(pois.group);
  const hud = app.hud = new Hud(app);
  const wrist = app.wrist = new Wrist(app), credits = app.credits = new Credits(app), debrief = app.debrief = new Debrief(app), helmet = app.helmet = new Helmet(app), arm = app.arm = new ArmDisplay(app, base); app.onLayer = () => { wrist.draw(); arm.acc = 1; };
  const [rx, rz] = hab.world(4.5, -9.5), rover = app.rover = new Rover(app, `${import.meta.env.BASE_URL}perseverance.glb`, rx, rz, hab.yaw + 2.4);
  const menu = app.menu = new Menu(app, hab.group), [gx, gz] = hab.world(hab.side * 1.55, -0.9), globe = app.globe = new Globe(app, `${import.meta.env.BASE_URL}mars_globe.jpg`, gx, hab.floorY + 1.2, gz);
  hud.panel.mesh.visible = false;
  app.scene = scene; const planner = app.planner = new RoutePlanner(app, hab), dirs = app.directions = new Directions(app);
  const helpText = () => { $('help').innerHTML = T('<b>PC</b>: clic sul menu per scegliere, poi clic per catturare il mouse · <b>WASD</b> cammina · <b>Shift</b> veloce · <b>L</b> livello dati · <b>I</b> display sul braccio · <b>M</b> vista dall\'alto · <b>T</b> traccia del rover · <b>C</b> fonti dei dati · <b>G</b> prendi il globo, <b>+</b>/<b>−</b> scala · <b>R</b> ricomincia<br><b>Quest</b>: stick sinistro cammina (grilletto laterale = veloce) · stick destro avanti = teletrasporto, lati = gira · <b>grilletto</b> sceglie nel menu · <b>grilletto destro</b> vista dall\'alto · <b>grilletto laterale destro</b> display sul braccio · <b>grilletti laterali</b> sul globo: prendi, con due mani ridimensiona · <b>A</b> livello dati · <b>B</b> traccia del rover · <b>X</b> fonti dei dati · <b>Y</b> ricomincia'); };
  // language switch: every panel is redrawn from the same data
  app.setLang = l => { setLang(l); app.buildLayers(); app.setLayer(app.layer); pois.redraw(); room.redraw(); museum.redraw(); heli.draw(); heli.drawTag(); groom.redraw(); deco.redraw(); quarters.redraw(); credits.draw(); debrief.shown = false; arm.drawTile(); hab.redraw(); menu.draw(); globe.label(); globe.drawNames(true); helpText(); hud.acc = 1; };
  app.start = () => { if (app.started) return; app.started = true; app.dataMode = false; menu.close(); hab.redraw(); };
  // data only: no mission clock, the airlock stays shut, the astronaut walks straight into the research room
  app.explore = () => { app.dataMode = true; menu.close(); const [x, z] = hab.roomPos(); player.placeAt(x, z, hab.roomYaw()); };
  app.setLayer(+(Q.get('layer') ?? 0)); if (Q.get('track')) app.toggleTrack();
  app.startGame = () => { app.start(); game.begin(); };
  app.reset = () => { game.end(); if (player.lift) player.toggleOverview(); mission.reset(); player.placeAt(sx, sz, startYaw); app.started = false; app.dataMode = false; menu.show(true); globe.reset(); hab.redraw(); };
  // controls: A/B on the right controller, X/Y on the left; same actions on the keyboard
  player.onButton = (hand, i) => { if (i === 0 && planner.click()) return; if (i === 0 && menu.open) { menu.click(); return; } if (i === 0 && game.press()) return; if (i === 0 && room.click()) return; if (i === 0 && heli.near()) { heli.play(); return; } if (i === 1 && globe.busy(hand)) return; if (hand === 'right' && i === 0) player.toggleOverview(); else if (hand === 'right' && i === 1) arm.toggle(); else if (i === 0 || i === 1) return; else if (hand === 'right' && i === 4) app.setLayer(app.layer + 1); else if (hand === 'right' && i === 5) app.toggleTrack(); else if (hand === 'left' && i === 5) app.reset(); else if (hand === 'left' && i === 4) credits.toggle(); };
  addEventListener('keydown', e => { const m = /^Digit([1-9])$/.exec(e.code); if (m && +m[1] <= app.LAYERS.length) app.setLayer(+m[1] - 1);
    if (e.code === 'KeyP' && heli.near(6)) heli.play(); if (e.code === 'KeyL') app.setLayer(app.layer + 1); if (e.code === 'KeyT') app.toggleTrack(); if (e.code === 'KeyR') app.reset(); if (e.code === 'KeyH') hud.panel.mesh.visible = !hud.panel.mesh.visible; if (e.code === 'KeyC') credits.toggle(); if (e.code === 'KeyM') player.toggleOverview(); if (e.code === 'KeyI') arm.toggle(); if (e.code === 'KeyV') helmet.off = !helmet.off; if (e.code === 'Enter' && menu.open) app.start(); });
  renderer.domElement.addEventListener('mousemove', e => menu.mouse.set(e.clientX / innerWidth * 2 - 1, 1 - e.clientY / innerHeight * 2));
  player.onClick = () => !renderer.xr.isPresenting && (planner.click() || (menu.open ? menu.click() : false) || game.press() || room.click() || (heli.near() && (heli.play(), true)));   // a click on a menu button is not a request to capture the mouse
  const vr = VRButton.createButton(renderer, { optionalFeatures: ['local-floor', 'bounded-floor'] }); document.body.appendChild(vr);
  helpText(); if (Q.get('data')) app.explore(); else if (Q.get('start') || Q.get('x') || (plan && Q.get('go'))) app.start();
  $('boot').style.opacity = 0; setTimeout(() => $('boot').remove(), 700);
  const clock = new THREE.Clock(), dir = new THREE.Vector3(), cam = new THREE.Vector3(); let fpsT = 0, fpsN = 0;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1); shared.uTime.value += dt;
    menu.update(); planner.update(); dirs.update(dt); player.update(dt); if (app.started) mission.idle(dt);
    camera.updateMatrixWorld(); camera.getWorldPosition(cam); shared.uCam.value.copy(cam); sky.position.copy(cam); camera.getWorldDirection(dir);
    if (!player.lift && app.started && !game.active) mission.check(cam); pois.update(cam); hud.update(dt); debrief.update(); helmet.update(); arm.update(dt); hab.update(dt, cam); rover.update(dt, cam); globe.update(dt, cam); room.update(dt, cam); museum.update(dt, cam); heli.update(dt, cam); groom.update(dt); deco.update(dt); game.update(dt); quarters.update(dt); amb.update(dt, !hab.indoors(cam.x, cam.z));
    const tris = terrain.update(cam, dir, renderer.xr.isPresenting ? 0.2 : 0.35, app.baseRes || 1);
    renderer.render(scene, camera);
    fpsN++; fpsT += dt; if (fpsT > 1) { app.stats = { fps: Math.round(fpsN / fpsT), tris, calls: renderer.info.render.calls }; fpsN = 0; fpsT = 0; }
    app.frame = (app.frame || 0) + 1;
  });
}
boot().catch(e => { console.error(e); msg.textContent = T('Errore: ') + e.message; });
