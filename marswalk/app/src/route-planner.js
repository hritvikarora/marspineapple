// "Google Maps for Mars" inside the base: a map panel next to the start menu where you pick a start and a
// destination (controller trigger in the headset, mouse click on a PC). The route is computed by the team's
// A* engine (MARS PATHFINDER, src/routing, eva-astar-1.0.0) on the same real HiRISE 1 m bundle the website
// uses; "AVVIA NAVIGAZIONE" reloads the walk with that route and turn-by-turn directions.
import * as THREE from 'three';
import { Panel, rrect, text, wrap, fmtDist } from './ui.js';
import { T, lang } from './i18n.js';
import { loadAndValidateBundle } from '../../../src/data/loadBundle';
import { solveRoute, MODEL_VERSION } from '../../../src/routing';
import { computeSearchTraceAndCompare } from '../../../src/routing/searchTrace';
import { buildMarswalkPayload, marswalkFrameFor, storeMarswalkPayload } from '../../../src/ui/marswalkHandoff';

const BUNDLE = '../bundles/jezero-west-hirise-v0.1.0/manifest.json';
const L = o => (lang.cur === 'en' ? o.en : o.it);
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), q1 = new THREE.Quaternion();
const MAP = { x: 30, y: 120, s: 760 };

export class RoutePlanner {
  constructor(app, hab) {
    this.app = app; this.hover = null; this.mouse = new THREE.Vector2(); this.ray = new THREE.Raycaster();
    this.mode = 'start'; this.start = null; this.dest = null; this.roundTrip = false; this.result = null; this.status = 'idle'; this.msg = '';
    this.panel = new Panel(1.6, 1.3, 1200 / 1.6, { depthTest: true }); const m = this.panel.mesh; m.renderOrder = 120;
    const ang = Math.atan2(-0.9, 1.55), rw = 3.8, lx = hab.side * Math.cos(ang) * rw, lz = Math.sin(ang) * rw, [px, pz] = hab.world(lx, lz); m.position.set(px, hab.floorY + 1.6, pz); m.rotation.y = hab.yaw + Math.atan2(-lx, -lz); app.scene.add(m);   // flush on the wall of the main room, right behind the Mars globe, facing the room's centre
    this.dot = new THREE.Mesh(new THREE.CircleGeometry(0.012, 16), new THREE.MeshBasicMaterial({ color: 0x7fe0ff, depthTest: false })); this.dot.renderOrder = 121; this.dot.visible = false; m.add(this.dot);
    const bx = 820, bw = 350;
    this.buttons = [
      { x: bx, y: 120, w: 170, h: 70, label: () => L({ it: 'PARTENZA', en: 'START' }), on: () => this.mode === 'start', act: () => { this.mode = 'start'; } },
      { x: bx + 180, y: 120, w: 170, h: 70, label: () => L({ it: 'ARRIVO', en: 'DESTINATION' }), on: () => this.mode === 'dest', act: () => { this.mode = 'dest'; } },
      { x: bx, y: 205, w: bw, h: 64, label: () => L({ it: 'Andata e ritorno: ', en: 'Round trip: ' }) + (this.roundTrip ? T('sì') : T('no')), on: () => this.roundTrip, act: () => { this.roundTrip = !this.roundTrip; this.result = null; } },
      { x: bx, y: 285, w: bw, h: 84, primary: true, label: () => L({ it: 'CALCOLA PERCORSO (A*)', en: 'COMPUTE ROUTE (A*)' }), on: () => false, act: () => this.compute() },
      { x: bx, y: 385, w: bw, h: 84, primary: true, alt: true, label: () => L({ it: 'AVVIA NAVIGAZIONE', en: 'START NAVIGATION' }), on: () => false, act: () => this.go(), off: () => !this.result },
      { map: true, x: MAP.x, y: MAP.y, w: MAP.s, h: MAP.s, label: () => '', on: () => false, act: () => this.pick() },
    ];
    this.img = new Image(); this.img.onload = () => this.draw(); this.img.src = '../bundles/jezero-west-hirise-v0.1.0/texture-hirise-2048.jpg';
    this.bundleP = null; this.draw();
    // load the terrain up front so the first click on the map answers at once and the stops appear on the map
    setTimeout(() => this.bundle().then(b => { this._b = b; this.draw(); }, e => console.warn('planner bundle', e)), 1500);
  }
  async bundle() { return (this.bundleP ??= loadAndValidateBundle(BUNDLE, { timeoutMs: 60000 })); }
  // map pixel <-> planner local metres (bundle extent 948.57 m E x 1000 m N, north up)
  ext() { return this._b ? this._b.manifest.grid.extent : { east_m: 948.567, north_m: 1000 }; }
  toPx(p) { const e = this.ext(); return [MAP.x + p.east_m / e.east_m * MAP.s, MAP.y + (1 - p.north_m / e.north_m) * MAP.s]; }
  stops() {   // Marswalk stops shown on the map, in planner metres
    if (!this._b) return []; const f = marswalkFrameFor(this._b); if (!f) return [];
    return (this.app.siteStops || this.app.site.pois).map(p => ({ name: p.name, base: p.kind === 'base', p: f.fromMarswalk(p.x, p.y) }));
  }
  async pick() {
    const hx = this.hx, hy = this.hy;   // where the user clicked, before the (possibly slow) bundle load
    if (!this._b) { this.msg = L({ it: 'Caricamento del terreno HiRISE…', en: 'Loading HiRISE terrain…' }); this.draw(); }
    const b = await this.bundle().catch(() => null); if (!b) { this.msg = L({ it: 'Dati del terreno non disponibili.', en: 'Terrain data unavailable.' }); this.draw(); return; }
    this._b = b; const e = this.ext();
    let p = { east_m: (hx - MAP.x) / MAP.s * e.east_m, north_m: (1 - (hy - MAP.y) / MAP.s) * e.north_m }, name = L({ it: 'Punto scelto', en: 'Picked point' });
    for (const s of this.stops()) { const [sx, sy] = this.toPx(s.p); if (Math.hypot(sx - hx, sy - hy) < 22) { p = s.p; name = s.name; } }
    const pt = { p, name }; if (this.mode === 'start') { this.start = pt; this.mode = 'dest'; } else this.dest = pt;
    this.result = null; this.anim = null; this.status = 'idle'; this.msg = ''; this.draw();
  }
  async compute() {
    if (!this.start || !this.dest) { this.msg = L({ it: 'Scegli partenza e arrivo sulla mappa.', en: 'Pick a start and a destination on the map.' }); this.draw(); return; }
    this.anim = null; this.status = 'running'; this.msg = L({ it: 'Calcolo del percorso…', en: 'Computing the route…' }); this.draw();
    await new Promise(r => setTimeout(r, 30));
    try {
      const b = this._b = await this.bundle();
      const req = { requestId: 'vr-' + Date.now(), bundleVersion: b.bundleVersion, modelVersion: MODEL_VERSION, start: this.start.p, destination: this.dest.p,
        policies: ['terrain-aware'], strictQuality: false, roundTrip: this.roundTrip }, res = solveRoute(b, req);
      if (res.status === 'success' && res.candidates[0]) { this.result = res.candidates[0]; this.status = 'ok'; const m = this.result.outbound.metrics;
        this.startAnim(b, res, req);
        this.msg = L({ it: `${fmtDist(m.horizontalDistance_m)} · salita ${Math.round(m.ascent_m)} m · pendenza max ${Math.round(m.maxTerrainSlope_deg)}°`, en: `${fmtDist(m.horizontalDistance_m)} · climb ${Math.round(m.ascent_m)} m · max slope ${Math.round(m.maxTerrainSlope_deg)}°` });
        if (this.roundTrip && !this.result.returnLeg) this.msg += L({ it: ' · ritorno non trovato', en: ' · no return leg found' });
      } else { this.result = null; this.status = 'fail';
        this.msg = res.status === 'no-path' ? L({ it: 'Nessun percorso entro i limiti di pendenza della tuta.', en: 'No route within the suit slope limits.' })
          : res.status === 'invalid-input' ? L({ it: 'Punto non valido (fuori area o terreno escluso).', en: 'Invalid point (outside the area or excluded terrain).' })
          : `${res.status}${res.message ? ': ' + res.message : ''}`; }
    } catch (e) { this.status = 'fail'; this.msg = String(e?.message || e); }
    this.draw();
  }
  // A* replay on the map: explored cells spread out batch by batch (orange), the open frontier glows (yellow),
  // then the final route draws in from A to B. Frames come from the engine's own search trace.
  startAnim(b, res, req) {
    let frames = [];
    try { frames = computeSearchTraceAndCompare(b, req, res.candidates, this.result.candidateId, { maxFrames: 90, maxDijkstraNodes: 0 }).frames; } catch (e) { console.warn('search trace', e); }
    const g = b.manifest.grid, ov = document.createElement('canvas'); ov.width = g.width; ov.height = g.height;
    this.anim = { frames, i: 0, ov, ctx: ov.getContext('2d'), W: g.width, front: [], explored: 0, path: 0, t: 0 };
  }
  stepAnim(dt) {
    const a = this.anim; if (!a) return false; a.t += dt; if (a.t < 1 / 30) return false; a.t = 0;
    if (a.i < a.frames.length) { const f = a.frames[a.i++]; a.ctx.fillStyle = 'rgba(255,154,82,0.55)';
      for (const k of f.closedCells) a.ctx.fillRect(k % a.W, (k / a.W) | 0, 1, 1);
      a.front = f.frontierCells; a.explored = f.exploredCount; }
    else if (a.path < 1) { a.front = []; a.path = Math.min(1, a.path + 0.05); }
    else { a.done = true; }
    return true;
  }
  go() {
    if (!this.result || !this._b) return;
    const payload = buildMarswalkPayload(this._b, this.result, { start: this.start.name, destination: this.dest.name }, MODEL_VERSION);
    if (!payload) { this.msg = L({ it: 'Percorso fuori dall\'area dettagliata.', en: 'Route outside the detailed area.' }); this.draw(); return; }
    storeMarswalkPayload(payload);
    const q = new URLSearchParams(location.search); q.set('planner', '1'); q.set('go', '1'); q.set('lang', lang.cur);
    location.search = q.toString();
  }
  draw() {
    this.panel.draw((c, W, H) => {
      rrect(c, 4, 4, W - 8, H - 8, 30); c.fillStyle = 'rgba(14,9,6,0.94)'; c.fill(); c.lineWidth = 4; c.strokeStyle = '#7fe0ff'; c.stroke();
      text(c, L({ it: 'NAVIGATORE EVA', en: 'EVA NAVIGATOR' }), 30, 72, 46, '#fff', 700);
      text(c, L({ it: 'Percorso A* di MARS PATHFINDER su HiRISE 1 m', en: 'MARS PATHFINDER A* route on HiRISE 1 m' }), 32, 104, 22, '#d9c4b2');
      if (this.img.complete && this.img.naturalWidth) c.drawImage(this.img, MAP.x, MAP.y, MAP.s, MAP.s); else { c.fillStyle = '#3a2418'; c.fillRect(MAP.x, MAP.y, MAP.s, MAP.s); }
      c.lineWidth = 2; c.strokeStyle = '#fff'; c.strokeRect(MAP.x, MAP.y, MAP.s, MAP.s);
      const line = (leg, col, dash) => { if (!leg) return; c.save(); c.setLineDash(dash); c.lineWidth = 6; c.strokeStyle = col; c.beginPath(); leg.path.forEach((p, i) => { const [x, y] = this.toPx(p); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke(); c.restore(); };
      const a = this.anim;
      if (a) { c.save(); c.imageSmoothingEnabled = false; c.drawImage(a.ov, MAP.x, MAP.y, MAP.s, MAP.s); c.fillStyle = '#ffe14d'; const k = MAP.s / a.W;
        for (const i of a.front) c.fillRect(MAP.x + (i % a.W) * k - 2, MAP.y + ((i / a.W) | 0) * k - 2, 4, 4); c.restore();
        rrect(c, MAP.x + 10, MAP.y + 10, 400, 44, 10); c.fillStyle = 'rgba(0,0,0,0.65)'; c.fill();
        text(c, a.path > 0 ? L({ it: 'A* ha trovato il percorso migliore', en: 'A* found the best route' }) : L({ it: `A* esplora il terreno… ${a.explored.toLocaleString()} celle`, en: `A* exploring… ${a.explored.toLocaleString()} cells` }), MAP.x + 22, MAP.y + 40, 21, '#ffe14d', 700); }
      if (this.result && (!a || a.path > 0)) { const frac = a ? a.path : 1, cut = leg => leg && { path: leg.path.slice(0, Math.max(2, Math.ceil(leg.path.length * frac))) };
        if (frac >= 1) line(this.result.returnLeg, '#ffd166', [14, 10]); line(cut(this.result.outbound), '#33e6ff', []); }
      for (const s of this.stops()) { const [x, y] = this.toPx(s.p); c.beginPath(); c.arc(x, y, 9, 0, 7); c.fillStyle = s.base ? '#ffd166' : '#fff'; c.fill(); c.lineWidth = 3; c.strokeStyle = '#0c0806'; c.stroke(); text(c, s.name, x + 13, y + 7, 19, '#fff', 600); }
      const pin = (pt, col, l) => { if (!pt || !this._b) return; const [x, y] = this.toPx(pt.p); c.beginPath(); c.arc(x, y, 18, 0, 7); c.fillStyle = col; c.fill(); c.lineWidth = 3; c.strokeStyle = '#000'; c.stroke(); text(c, l, x, y + 8, 22, '#000', 800, 'center'); };
      pin(this.start, '#5be08a', 'A'); pin(this.dest, '#ff6b5b', 'B');
      text(c, '100 m', MAP.x + 14, MAP.y + MAP.s - 24, 18, '#fff', 700); c.fillStyle = '#fff'; c.fillRect(MAP.x + 14, MAP.y + MAP.s - 16, MAP.s * 100 / 948.567, 5);
      for (const b of this.buttons) { if (b.map) continue; const hov = this.hover === b, off = b.off?.(), on = b.on();
        rrect(c, b.x, b.y, b.w, b.h, 16); c.fillStyle = off ? 'rgba(255,255,255,0.08)' : b.alt ? (hov ? '#b3efff' : '#7fe0ff') : b.primary ? (hov ? '#ffb37a' : '#ff9a52') : on ? '#7fe0ff' : hov ? 'rgba(127,224,255,0.3)' : 'rgba(255,255,255,0.1)'; c.fill();
        if (hov && !off) { c.lineWidth = 4; c.strokeStyle = '#fff'; c.stroke(); }
        text(c, b.label(), b.x + b.w / 2, b.y + b.h / 2 + 9, b.primary ? 25 : 24, off ? '#8a7a70' : b.primary || on ? '#1a0f0a' : '#fff', 700, 'center'); }
      let y = 520; const row = (k, v) => { text(c, k, 820, y, 20, '#ffb37a', 700); y = wrap(c, v, 820, y + 28, 350, 23, 28, '#fff', 500) + 8; };
      row(L({ it: 'A · PARTENZA', en: 'A · START' }), this.start ? this.start.name : '—');
      row(L({ it: 'B · ARRIVO', en: 'B · DESTINATION' }), this.dest ? this.dest.name : '—');
      if (this.msg) y = wrap(c, this.msg, 820, y + 6, 350, 23, 28, this.status === 'fail' ? '#ff8a7a' : '#7fe0ff', 600) + 8;
      wrap(c, L({ it: 'Punta la mappa: il primo punto è la partenza, il secondo l\'arrivo. Vicino a una tappa il punto si aggancia alla tappa.', en: 'Point at the map: the first point is the start, the second the destination. Near a stop the point snaps to it.' }), 820, Math.max(y + 10, 800), 350, 19, 25, '#d9c4b2', 400);
      text(c, L({ it: 'Simulazione educativa, non una valutazione di sicurezza', en: 'Educational simulation, not a safety assessment' }), W / 2, H - 22, 18, '#d9c4b2', 400, 'center');
    });
  }
  _cast(origin, dir) {
    this.ray.set(origin, dir); const h = this.ray.intersectObject(this.panel.mesh, false)[0]; if (!h || h.distance > 8) return null;
    const px = h.uv.x * this.panel.canvas.width, py = (1 - h.uv.y) * this.panel.canvas.height; this.hx = px; this.hy = py;
    return { b: this.buttons.find(b => px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h && !b.off?.()) || null, d: h.distance, p: h.point };
  }
  update(dt = 0.016) {
    const { app } = this; if (!this.panel.mesh.visible) return; if (this.anim && !this.anim.done && this.stepAnim(dt)) this.draw(); const xr = app.renderer.xr.isPresenting; let best = null;
    if (xr) { for (const hand of ['right', 'left']) { const c = app.player.hands[hand]; if (!c) continue; c.getWorldPosition(v1); c.getWorldQuaternion(q1); const h = this._cast(v1, v2.set(0, 0, -1).applyQuaternion(q1));
        if (h && (!best || h.b && !best.b)) best = h; } }
    else { if (document.pointerLockElement) this.mouse.set(0, 0); else this.mouse.copy(app.menu?.mouse ?? this.mouse); this.ray.setFromCamera(this.mouse, app.camera); best = this._cast(this.ray.ray.origin.clone(), this.ray.ray.direction.clone()); }
    this.dot.visible = !!best; if (best) { this.panel.mesh.worldToLocal(v1.copy(best.p)); this.dot.position.set(v1.x, v1.y, 0.004); }
    const b = best ? best.b : null; if (b !== this.hover) { this.hover = b; this.draw(); }
  }
  click() { if (!this.hover) return false; this.hover.act(); this.draw(); return true; }
}
