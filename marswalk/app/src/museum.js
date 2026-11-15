// Open-air exhibition behind the habitat: every NASA spacecraft sent to Mars, at 1:1 scale, each with a panel on its mission.
// Surface vehicles stand in the front row, orbiters on poles in the back row. NASA 3D Resources models (compressed for the headset)
// are loaded only when the astronaut first comes near; missions with no NASA model get a simplified model built from primitives.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { Panel, rrect, text, wrap } from './ui.js';
import { lang } from './i18n.js';
import { CRAFT, LOST, SUITS } from './museum-data.js';
const L = o => (typeof o === 'string' ? o : o[lang.cur] ?? o.it);
const NM = c => (lang.cur === 'en' && c.name_en) || c.name, YR = c => (lang.cur === 'en' && c.years_en) || c.years;
const ROW_Z = { surface: 21, orbit: 44 }, GAP = 3.2, POLE = 1.3;
// footprint widths (m) used for the layout; models are scaled to their real size first
const WIDTH = { mariner4: 6.9, mariner67: 5.8, mariner9: 6.9, vikingorb: 9.8, viking: 3.8, pathfinder: 3.4, mgs: 12, odyssey: 8.2, spirit: 2.4, opportunity: 2.4, mro: 13.6, phoenix: 5.6, curiosity: 3.3, maven: 11.4, insight: 6.1, perseverance: 3.1, ingenuity: 1.6 };
const M = {}; const mat = (k, c, e = {}) => M[k] || (M[k] = new THREE.MeshLambertMaterial({ color: c, ...e }));
const gold = () => mat('gold', 0xc9a24a), white = () => mat('white', 0xd9d9d6), solar = () => mat('solar', 0x1c2a52, { side: THREE.DoubleSide }), grey = () => mat('grey', 0x8a8f96), dark = () => mat('dark', 0x2a2a2c), foil = () => mat('foil', 0xb8b2a6);

export class Museum {
  constructor(app, hab, root) {
    this.app = app; this.hab = hab; this.root = root; this.loaded = false; this.items = []; this.g = new THREE.Group(); app.world.add(this.g); this.g.visible = false;
    for (const row of ['surface', 'orbit']) {
      const list = CRAFT.filter(c => c.row === row), total = list.reduce((s, c) => s + WIDTH[c.id], 0) + GAP * (list.length - 1); let x = -total / 2;
      for (const c of list) { const w = WIDTH[c.id]; this.items.push(this.place(c, x + w / 2, ROW_Z[row], w)); x += w + GAP; }
    }
    // closing panel on the lost missions, at the end of the back row
    const last = this.items[this.items.length - 1]; this.lost = this.sign(last.lx + WIDTH[last.c.id] / 2 + 4, ROW_Z.orbit - 3, 1.6, 1.45, (c, W, H) => this.drawLost(c, W, H));
    this.suit();
    this.selfie(165.8, 126.5);   // Three Forks selfie (PIA25681), at the rover's position on sol 684
    // wayfinding at the foot of the airlock ramp
    this.way = this.sign(-hab.side * 2.6, -9.8, 1.3, 0.62, (c, W, H) => this.drawWay(c, W, H), 0);
    const [cx, cz] = hab.world(0, (ROW_Z.surface + ROW_Z.orbit) / 2); this.cx = cx; this.cz = cz;
    if (new URLSearchParams(location.search).get('museum')) this.load();
  }
  // one exhibit: a group facing the habitat, a model slot and a panel in front of it
  place(c, lx, lz, w) {
    const { app, hab } = this, [x, z] = hab.world(lx, lz), g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = hab.yaw + Math.PI; this.g.add(g);
    let gy = Infinity; for (const [ox, oz] of [[0, 0], [w / 3, 0], [-w / 3, 0], [0, w / 4], [0, -w / 4]]) { const [sx, sz] = hab.world(lx + ox, lz + oz), h = app.ground(sx, sz); if (h != null) gy = Math.min(gy, h); }
    g.position.y = gy === Infinity ? 0 : gy;
    const it = { c, lx, lz, x, z, w, g, r: c.row === 'orbit' ? 0.5 : Math.max(0.6, w * 0.32) };
    if (c.row === 'orbit') { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, POLE + 0.2, 10), grey()); pole.position.y = (POLE + 0.2) / 2 - 0.1; const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 0.12, 20), dark()); foot.position.y = 0.04; g.add(pole, foot); }
    // orbiters stand high, so their panel goes in front; surface vehicles get it beside them, angled towards the visitor
    if (c.row === 'orbit') it.panel = this.sign(lx, lz - Math.min(w, 9) / 2 - 1.6, 1.5, 1.04, (cv, W, H) => this.drawPanel(cv, W, H, c), Math.PI, true);
    else { it.panel = this.sign(lx - w / 2 - 0.55, lz - 1.2, 1.5, 1.04, (cv, W, H) => this.drawPanel(cv, W, H, c), Math.PI - 0.45, true); }
    if (c.model.startsWith('proc:')) { this.add(it, PROC[c.model.slice(5)]()); }
    return it;
  }
  sign(lx, lz, w, h, fn, rot = Math.PI, post = true) {
    const { app, hab } = this, [x, z] = hab.world(lx, lz), gy = app.ground(x, z) ?? 0, p = new Panel(w, h, 520, { depthTest: true }), m = p.mesh; m.renderOrder = 10;
    m.position.set(x, gy + 0.55 + h / 2, z); m.rotation.y = hab.yaw + rot; this.g.add(m); m.material.depthWrite = true; m.material.transparent = false;
    if (post) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.6, 0.08), dark()); s.position.set(x, gy + 0.28, z); this.g.add(s); }
    const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), dark()); back.position.copy(m.position); back.rotation.y = m.rotation.y + Math.PI; back.translateZ(0.01); this.g.add(back);
    const sg = { p, fn, lx, lz, r: 0.35, x, z }; sg.draw = () => p.draw(fn); sg.draw(); (this.signs ||= []).push(sg); return sg;
  }
  add(it, obj) { obj.position.y += it.c.row === 'orbit' ? POLE : 0; it.g.add(obj); it.model = obj; }
  load() {
    if (this.loaded) return; this.loaded = true; const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder), cache = {};
    for (const it of this.items) { const f = it.c.model; if (f.startsWith('proc:')) continue;
      (cache[f] ||= new Promise((ok, ko) => loader.load(`${this.root}models/${f}`, ok, undefined, ko))).then(gltf => {
        const s = gltf.scene.clone(true); s.traverse(o => { if (!o.isMesh) return; if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals();
          const m = o.material; o.material = new THREE.MeshLambertMaterial({ map: m.map || null, color: m.color, side: m.side, transparent: m.transparent, opacity: m.opacity, alphaTest: m.alphaTest, vertexColors: !!o.geometry.attributes.color }); });
        const b = new THREE.Box3().setFromObject(s), sz = b.getSize(new THREE.Vector3()), k = it.c.size / (it.c.fit === 'y' ? sz.y : Math.max(sz.x, sz.y, sz.z));
        const wrapG = new THREE.Group(); s.scale.setScalar(k); const c = b.getCenter(new THREE.Vector3()); s.position.set(-c.x * k, -b.min.y * k, -c.z * k); wrapG.add(s); this.add(it, wrapG);
      }).catch(e => console.warn('museum model', f, e)); }
  }
  // two spacesuits on stands inside the habitat, on the side away from the research room, each with a low reading desk in front
  suit() {
    const { hab } = this, S = -hab.side; this.suitPos = []; this.suitPanels = [];
    for (const d of SUITS) {
      const g = new THREE.Group(); g.position.set(S * 3.3 * Math.sin(d.a), 0, 3.3 * Math.cos(d.a)); g.rotation.y = Math.atan2(-g.position.x, -g.position.z) + Math.PI; hab.group.add(g);
      g.add(cyl(0.38, 0.42, 0.08, dark(), 0, 0.04, 0, 24));
      // reading desk: low and tilted, so it never hides the suit behind it
      const p = new Panel(1.0, 1.3, 560, { depthTest: true }), m = p.mesh; m.renderOrder = 10; m.material.transparent = false; m.material.depthWrite = true; m.scale.setScalar(0.62);
      const dx = S * 2.3 * Math.sin(d.a), dz = 2.3 * Math.cos(d.a), yaw = Math.atan2(dx, dz) + Math.PI; m.position.set(dx, 0.92, dz); m.rotation.set(-0.85, yaw, 0, 'YXZ'); hab.group.add(m);
      const post = cyl(0.03, 0.03, 0.7, dark(), dx, 0.35, dz, 8); hab.group.add(post);
      const pn = { p, draw: () => p.draw((c, W, H) => this.drawSuit(c, W, H, d)) }; pn.draw(); this.suitPanels.push(pn);
      this.suitPos.push([...hab.world(g.position.x, g.position.z), 0.5], [...hab.world(dx, dz), 0.3]);
      new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(`${this.root}models/${d.model}`, gltf => { const s = gltf.scene; s.traverse(o => { if (o.isMesh) { if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals(); const mm = o.material; o.material = new THREE.MeshLambertMaterial({ map: mm.map || null, color: mm.color }); } });
        const b = new THREE.Box3().setFromObject(s), sz = b.getSize(new THREE.Vector3()), k = d.height / sz.y, c = b.getCenter(new THREE.Vector3()); s.scale.setScalar(k); s.position.set(-c.x * k, 0.08 - b.min.y * k, -c.z * k); if (d.turn) s.rotation.y = d.turn; g.add(s); }, undefined, e => console.warn('suit', e));
    }
  }
  drawSuit(c, W, H, d) {
    rrect(c, 4, 4, W - 8, H - 8, 22); c.fillStyle = 'rgba(14,10,8,0.96)'; c.fill(); c.lineWidth = 5; c.strokeStyle = d.color; c.stroke();
    text(c, L(d.kicker), 26, 46, 20, d.color, 700); text(c, d.years, W - 26, 46, 20, d.color, 700, 'right');
    let y = wrap(c, d.name, 26, 92, W - 52, 34, 40, '#fff', 700); y = wrap(c, L(d.text), 26, y + 8, W - 52, 21, 28, '#f2e9e1');
    wrap(c, L(d.note), 26, y + 14, W - 52, 19, 25, '#d9c4b2'); text(c, L({ it: 'Modello 3D NASA (NASA 3D Resources)', en: 'NASA 3D model (NASA 3D Resources)' }), 26, H - 20, 16, '#a8988a', 400);
  }
  selfie(x, z) {   // a photo stand on the very spot where Perseverance took its Three Forks selfie
    const { app, hab } = this, gy = app.ground(x, z) ?? 0, p = new Panel(1.6, 1.2, 500, { depthTest: true }), m = p.mesh; m.renderOrder = 10; m.material.transparent = false; m.material.depthWrite = true;
    m.position.set(x, gy + 1.35, z); m.rotation.y = Math.atan2(hab.cx - x, hab.cz - z); app.world.add(m);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.8, 0.08), dark()); post.position.set(x, gy + 0.4, z); app.world.add(post);
    const im = new Image(); const draw = () => p.draw((c, W, H) => { rrect(c, 4, 4, W - 8, H - 8, 20); c.fillStyle = 'rgba(14,10,8,0.96)'; c.fill(); c.lineWidth = 4; c.strokeStyle = '#ffffff'; c.stroke();
      if (im.complete && im.naturalWidth) c.drawImage(im, 20, 20, W - 40, (W - 40) * im.height / im.width);
      text(c, L({ it: 'Qui Perseverance si è fatto un selfie', en: 'Perseverance took a selfie right here' }), 22, H - 92, 30, '#fff', 700);
      text(c, L({ it: 'Three Forks, sol 684 (22 gennaio 2023): accanto al deposito di campioni', en: 'Three Forks, sol 684 (22 January 2023): next to the sample depot' }), 22, H - 56, 21, '#d9c4b2', 500);
      text(c, 'NASA/JPL-Caltech/MSSS · PIA25681', 22, H - 24, 17, '#a8988a', 400); });
    im.onload = draw; im.src = `${this.root}research/selfies/three_forks.jpg`; draw(); this.selfieDraw = draw; this.selfiePos = [x, z];
  }
  canPass(x, z) { for (const [sx, sz, r] of this.suitPos) if (Math.hypot(x - sx, z - sz) < r) return false; if (!this.g.visible) return true; for (const it of this.items) if (Math.hypot(x - it.x, z - it.z) < it.r) return false; for (const s of this.signs) if (Math.hypot(x - s.x, z - s.z) < s.r) return false; return true; }
  update(dt, cam) { const d = Math.hypot(cam.x - this.cx, cam.z - this.cz); this.g.visible = d < 420; if (!this.loaded && this.app.started && d < 160) this.load(); }
  redraw() { for (const s of this.signs) s.draw(); this.suitPanels.forEach(p => p.draw()); this.selfieDraw?.(); }
  drawPanel(c, W, H, cr) {
    const orbit = cr.row === 'orbit', col = orbit ? '#7fe0ff' : '#ffb37a';
    rrect(c, 4, 4, W - 8, H - 8, 22); c.fillStyle = 'rgba(14,10,8,0.96)'; c.fill(); c.lineWidth = 5; c.strokeStyle = col; c.stroke();
    c.fillStyle = col; rrect(c, 4, 4, W - 8, 46, 22); c.fill(); c.fillRect(4, 30, W - 8, 20);
    text(c, `NASA · ${L(cr.kind).toUpperCase()}`, 26, 37, 22, '#1a0f0a', 700); text(c, YR(cr), W - 26, 37, 22, '#1a0f0a', 700, 'right');
    text(c, NM(cr), 26, 104, 44, '#fff', 700); text(c, L(cr.dims), 26, 142, 22, col, 600);
    wrap(c, L(cr.text), 26, 186, W - 52, 23, 31, '#f2e9e1');
    text(c, cr.model.startsWith('proc:') ? L({ it: 'Modello semplificato in scala 1:1 (nessun modello 3D NASA disponibile)', en: 'Simplified 1:1 model (no NASA 3D model available)' }) : L({ it: 'Modello 3D NASA (NASA 3D Resources) in scala 1:1', en: 'NASA 3D model (NASA 3D Resources) at 1:1 scale' }), 26, H - 22, 17, '#a8988a', 400);
  }
  drawLost(c, W, H) {
    rrect(c, 4, 4, W - 8, H - 8, 22); c.fillStyle = 'rgba(14,10,8,0.96)'; c.fill(); c.lineWidth = 5; c.strokeStyle = '#d9c4b2'; c.stroke();
    text(c, L(LOST.title), 28, 66, 40, '#fff', 700); let y = 116;
    for (const s of LOST.items) { c.fillStyle = '#ffb37a'; c.beginPath(); c.arc(36, y - 8, 6, 0, 7); c.fill(); y = wrap(c, L(s), 54, y, W - 84, 24, 31, '#f2e9e1') + 14; }
    wrap(c, L(LOST.note), 28, y + 12, W - 56, 22, 29, '#d9c4b2');
  }
  drawWay(c, W, H) {
    rrect(c, 4, 4, W - 8, H - 8, 20); c.fillStyle = 'rgba(14,10,8,0.95)'; c.fill(); c.lineWidth = 4; c.strokeStyle = '#7fe0ff'; c.stroke();
    text(c, L({ it: 'MOSTRA: LA NASA SU MARTE', en: 'EXHIBITION: NASA AT MARS' }), 26, 62, 32, '#7fe0ff', 700);
    wrap(c, L({ it: 'Tutti i veicoli e gli orbiter della NASA in scala 1:1, dal 1964 a oggi. Sono dietro la base, a 20 m: gira intorno alla cupola.', en: 'Every NASA rover, lander and orbiter at 1:1 scale, from 1964 to today. They are behind the habitat, 20 m away: walk around the dome.' }), 26, 108, W - 52, 23, 30, '#fff');
  }
}

// ---------------------------------------------------------------- simplified models (real dimensions, metres)
function box(w, h, d, m, x = 0, y = 0, z = 0) { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); return o; }
function cyl(rt, rb, h, m, x = 0, y = 0, z = 0, seg = 16) { const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m); o.position.set(x, y, z); return o; }
function dish(r, depth, m) { const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new THREE.Vector2(r * t, depth * t * t)); } return new THREE.Mesh(new THREE.LatheGeometry(pts, 24), m); }
const mat2 = m => { m.side = THREE.DoubleSide; return m; };
// Mariner bus: octagonal ring with four panels in a cross
function mariner(span, panelW, height, extra) {
  const g = new THREE.Group(), busH = 0.46, y0 = 0.3; g.add(cyl(0.69, 0.69, busH, gold(), 0, y0 + busH / 2, 0, 8));
  const pl = (span - 1.38) / 2; for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2, p = box(pl, 0.03, panelW, solar()); p.position.set(Math.cos(a) * (0.69 + pl / 2), y0 + busH, Math.sin(a) * (0.69 + pl / 2)); p.rotation.y = -a; g.add(p); }
  const d = dish(0.58, 0.18, mat2(white().clone())); d.position.y = y0 + busH + 0.02; g.add(d);
  g.add(cyl(0.025, 0.025, height - y0 - busH, grey(), 0.45, y0 + busH + (height - y0 - busH) / 2, 0.2, 8));
  if (extra) extra(g, y0, busH); return g;
}
export const PROC = {
  mariner4: () => mariner(6.88, 0.9, 2.89),
  mariner67: () => mariner(5.79, 0.9, 3.35, (g, y0) => { g.add(box(0.5, 0.35, 0.5, dark(), 0, y0 - 0.15, 0)); }),
  mariner9: () => mariner(6.89, 0.9, 2.28, (g, y0, h) => { g.add(cyl(0.12, 0.35, 0.6, grey(), 0, y0 + h + 0.5, 0)); g.add(cyl(0.45, 0.45, 0.4, foil(), 0, y0 + h + 0.2, 0, 12)); }),
  vikingorb: () => { const g = new THREE.Group(), y0 = 0.2; g.add(cyl(1.2, 1.2, 0.5, gold(), 0, y0 + 0.25, 0, 8)); g.add(cyl(0.7, 0.7, 1.6, foil(), 0, y0 + 1.3, 0, 12)); g.add(cyl(0.18, 0.4, 0.7, grey(), 0, y0 + 2.45, 0));
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4, p = box(3.67, 0.04, 1.24, solar()); p.position.set(Math.cos(a) * (1.2 + 1.83), y0 + 0.5, Math.sin(a) * (1.2 + 1.83)); p.rotation.y = -a; g.add(p); }
    const d = dish(0.75, 0.22, mat2(white().clone())); d.rotation.z = Math.PI / 2; d.position.set(1.6, y0 + 0.3, 0); g.add(d); return g; },
  pathfinder: () => { const g = new THREE.Group(), tri = (s, m) => { const sh = new THREE.Shape(); sh.moveTo(0, s / Math.sqrt(3)); sh.lineTo(-s / 2, -s / (2 * Math.sqrt(3))); sh.lineTo(s / 2, -s / (2 * Math.sqrt(3))); sh.closePath(); const o = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.06, bevelEnabled: false }), m); o.rotation.x = -Math.PI / 2; return o; };
    const base = tri(0.95, gold()); base.position.y = 0.25; g.add(base);
    for (let i = 0; i < 3; i++) { const a = i * 2 * Math.PI / 3, p = tri(0.95, solar()); p.rotation.z = Math.PI; const h = new THREE.Group(); h.rotation.y = a; p.position.set(0, 0.2, -0.55); h.add(p); g.add(h);
      const bag = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), foil()); bag.scale.set(1.2, 0.45, 1); bag.position.set(Math.sin(a + Math.PI) * 1.05, 0.15, Math.cos(a + Math.PI) * 1.05); g.add(bag); }
    g.add(cyl(0.03, 0.03, 0.8, grey(), 0, 0.7, 0, 8)); g.add(box(0.18, 0.12, 0.12, white(), 0, 1.15, 0));
    // Sojourner, driving off its ramp
    const s = new THREE.Group(); s.add(box(0.48, 0.18, 0.4, gold(), 0, 0.2, 0)); s.add(box(0.63, 0.02, 0.48, solar(), 0, 0.31, 0));
    for (const x of [-0.24, 0, 0.24]) for (const z of [-0.22, 0.22]) { const w = cyl(0.065, 0.065, 0.07, grey(), x, 0.065, z, 12); w.rotation.x = Math.PI / 2; s.add(w); }
    s.position.set(1.25, 0, 0.6); s.rotation.y = 0.7; g.add(s); return g; },
  phoenix: () => { const g = new THREE.Group(), y = 0.95; g.add(cyl(0.75, 0.75, 0.22, gold(), 0, y, 0, 10));
    for (let i = 0; i < 3; i++) { const a = i * 2 * Math.PI / 3, l = cyl(0.04, 0.04, 1.1, grey(), Math.cos(a) * 0.75, y / 2, Math.sin(a) * 0.75, 6); l.rotation.z = Math.cos(a) * 0.25; l.rotation.x = -Math.sin(a) * 0.25; g.add(l); g.add(cyl(0.14, 0.14, 0.05, grey(), Math.cos(a) * 0.88, 0.03, Math.sin(a) * 0.88, 10)); }
    for (const sx of [-1, 1]) { g.add(cyl(1.05, 1.05, 0.03, solar(), sx * 1.85, y + 0.08, 0, 10)); g.add(box(0.4, 0.04, 0.1, grey(), sx * 0.92, y + 0.08, 0)); }
    g.add(cyl(0.03, 0.03, 1.1, white(), 0.35, y + 0.65, -0.3, 8)); g.add(box(0.2, 0.15, 0.15, white(), 0.35, y + 1.25, -0.3));
    const arm = box(2.35, 0.06, 0.06, white()); arm.position.set(-0.3, y + 0.15, 1.3); arm.rotation.y = -1.1; arm.rotation.z = -0.25; g.add(arm); return g; },
};
