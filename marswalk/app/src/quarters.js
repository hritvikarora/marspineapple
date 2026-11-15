// Crew quarters: a fourth module behind the base (local +z), joined by a short corridor. Bed with storage, desk with a
// live status screen, locker, a tool wall with repair kit, and an algae photobioreactor that helps make oxygen.
// Scenario elements (not NASA hardware), sized and described realistically; static parts are merged per material.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { R, H, DOOR_W, DOOR_H, R3, ZC } from './habitat.js';
import { hullTex, domeTex, innerTex, ceilTex } from './base-deco.js';
import { Panel, rrect, text, wrap } from './ui.js';
import { lang } from './i18n.js';
const L = o => (typeof o === 'string' ? o : o[lang.cur] ?? o.it);

export class Quarters {
  constructor(app, hab) {
    this.app = app; this.hab = hab; const g = hab.group, parts = new Map(), boxes = [];
    const lam = c => new THREE.MeshLambertMaterial({ color: c }), bas = (c, o = {}) => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide, ...o });
    const M = { frame: lam(0xd5d9de), dark: lam(0x3b4047), mid: lam(0x7d858d), soft: lam(0x5b7290), sheet: lam(0xe9edf2), wood: lam(0x8a7c6c), orange: lam(0xe0782a), red: lam(0xb8322a), yellow: lam(0xe8b923), steel: lam(0xb4bcc6), led: bas(0x3df0ff), warm: bas(0xfff1d6), grow: bas(0xff5ad8) };
    // geometry in the cabin's own frame (origin at its centre on the floor, door towards -z), collected per material
    const put = (m, geo, x, y, z, ry = 0) => { geo.rotateY(ry); geo.translate(x, y, ZC + z); if (geo.index) geo = geo.toNonIndexed(); geo.deleteAttribute('uv'); (parts.get(m) || parts.set(m, []).get(m)).push(geo); };
    const box = (m, w, h, d, x, y, z, ry = 0) => put(m, new THREE.BoxGeometry(w, h, d), x, y, z, ry), cyl = (m, r, h, x, y, z, seg = 12) => put(m, new THREE.CylinderGeometry(r, r, h, seg), x, y, z);
    const block = (x, z, w, d) => boxes.push([x - w / 2, x + w / 2, z - d / 2, z + d / 2]);
    // shell: corridor, walls, dome, floor (same build as the other modules)
    const add = (geo, mat, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); g.add(o); return o; };
    const z0 = R - 0.25, z1 = ZC - R3 + 0.3, zm = (z0 + z1) / 2, Lc = z1 - z0, grey = bas(0xcfd4d8), shell = bas(0xc8bcae);
    for (const sx of [-1, 1]) { add(new THREE.PlaneGeometry(Lc, DOOR_H).rotateY(Math.PI / 2), grey, sx * DOOR_W / 2, DOOR_H / 2, zm); add(new THREE.PlaneGeometry(Lc, DOOR_H + 0.15).rotateY(Math.PI / 2), shell, sx * (DOOR_W / 2 + 0.12), DOOR_H / 2 + 0.07, zm); }
    add(new THREE.PlaneGeometry(DOOR_W, Lc).rotateX(Math.PI / 2), grey, 0, DOOR_H, zm); add(new THREE.PlaneGeometry(DOOR_W + 0.24, Lc).rotateX(Math.PI / 2), shell, 0, DOOR_H + 0.15, zm); add(new THREE.PlaneGeometry(DOOR_W, Lc).rotateX(-Math.PI / 2), bas(0x555b62), 0, 0.004, zm);
    const a = Math.asin(DOOR_W / 2 / R3), t0 = Math.PI + a, tl = 2 * Math.PI - 2 * a;
    add(new THREE.CylinderGeometry(R3 + 0.06, R3 + 0.06, H, 40, 1, true, t0, tl), new THREE.MeshBasicMaterial({ map: hullTex(1) }), 0, H / 2, ZC);
    add(new THREE.CylinderGeometry(R3, R3, H, 40, 1, true, t0, tl), new THREE.MeshBasicMaterial({ map: innerTex(), side: THREE.BackSide }), 0, H / 2, ZC);
    add(new THREE.CylinderGeometry(R3 + 0.03, R3 + 0.03, H - DOOR_H, 6, 1, true, Math.PI - a, 2 * a), bas(0xbfb2a2), 0, DOOR_H + (H - DOOR_H) / 2, ZC);
    add(new THREE.SphereGeometry(R3 + 0.06, 40, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ map: domeTex() }), 0, H, ZC).scale.y = 0.42;
    add(new THREE.SphereGeometry(R3, 40, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ map: ceilTex(), side: THREE.BackSide }), 0, H, ZC).scale.y = 0.4;
    add(new THREE.CircleGeometry(R3 * 0.3, 32).rotateX(Math.PI / 2), bas(0xfff1d6), 0, H + R3 * 0.4 * 0.93, ZC);
    const fl = document.createElement('canvas'); fl.width = fl.height = 512; { const c = fl.getContext('2d'); c.fillStyle = '#5a5f66'; c.fillRect(0, 0, 512, 512); for (let i = 0; i < 16; i++) { c.fillStyle = i % 2 ? '#62676e' : '#565b62'; c.fillRect(0, i * 32, 512, 32); } }
    const ft = new THREE.CanvasTexture(fl); ft.colorSpace = THREE.SRGBColorSpace; add(new THREE.CircleGeometry(R3, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: ft }), 0, 0.005, ZC);
    add(new THREE.CylinderGeometry(R3 + 0.25, R3 + 0.4, 1.6, 40, 1, true), bas(0x6b5a4c), 0, -0.8, ZC);
    // bed (right side): frame with drawers, mattress, pillow, blanket, headboard with a reading light
    { const x = 2.55, z = 1.0; box(M.frame, 1.0, 0.4, 2.05, x, 0.2, z); for (const k of [-0.5, 0.5]) box(M.dark, 0.02, 0.18, 0.8, x - 0.51, 0.2, z + k);
      box(M.sheet, 0.92, 0.16, 1.95, x, 0.48, z); box(M.soft, 0.94, 0.06, 1.25, x, 0.58, z - 0.3); box(M.sheet, 0.6, 0.1, 0.35, x, 0.6, z + 0.72);
      box(M.mid, 1.0, 0.9, 0.08, x, 0.85, z + 1.06); box(M.warm, 0.6, 0.04, 0.03, x, 1.2, z + 1.01); block(x, z, 1.05, 2.15); }
    // desk (left side) with a cabinet, keyboard, and a chair
    { const x = -2.95, z = 0.4; box(M.frame, 0.7, 0.05, 1.5, x, 0.76, z); box(M.mid, 0.66, 0.72, 0.5, x, 0.37, z - 0.48); box(M.dark, 0.04, 0.72, 0.04, x + 0.3, 0.37, z + 0.68);
      box(M.dark, 0.18, 0.02, 0.5, x + 0.12, 0.79, z); box(M.dark, 0.05, 0.35, 0.05, x - 0.22, 0.95, z);
      const cx = x + 0.75; cyl(M.dark, 0.03, 0.42, cx, 0.21, z, 8); cyl(M.dark, 0.26, 0.03, cx, 0.03, z, 10); box(M.soft, 0.46, 0.07, 0.46, cx, 0.46, z); box(M.soft, 0.06, 0.55, 0.44, cx + 0.22, 0.78, z);
      block(x, z, 0.75, 1.55); block(cx, z, 0.5, 0.5); }
    // tall locker by the door, left
    { const x = -2.5, z = -2.35, ry = -0.9; box(M.frame, 0.9, 2.0, 0.55, x, 1.0, z, ry); block(x, z, 0.9, 0.9); }
    // tool wall (back left): pegboard with tools, a wheeled tool cart and a suit repair case
    { const ang = Math.PI * 2 - 0.75, r = R3 - 0.06, x = Math.sin(ang) * r, z = Math.cos(ang) * r, ry = ang + Math.PI;
      const pb = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.0), new THREE.MeshLambertMaterial({ map: pegTex() })); pb.position.set(x, 1.45, ZC + z); pb.rotation.y = ry; g.add(pb);
      const tg = new THREE.Group(); tg.position.set(x, 1.45, ZC + z); tg.rotation.y = ry; g.add(tg); const tool = (m, geo, tx, ty) => { const o = new THREE.Mesh(geo, m); o.position.set(tx, ty, 0.03); tg.add(o); return o; };
      for (let i = 0; i < 3; i++) { tool(M.steel, new THREE.BoxGeometry(0.025, 0.22 + i * 0.04, 0.012), -0.6 + i * 0.07, 0.12); tool(M.steel, new THREE.TorusGeometry(0.022, 0.008, 6, 12), -0.6 + i * 0.07, 0.25 + i * 0.02); }   // wrenches
      for (let i = 0; i < 4; i++) { tool(i % 2 ? M.red : M.yellow, new THREE.CylinderGeometry(0.014, 0.014, 0.1, 8), -0.3 + i * 0.06, 0.28); tool(M.steel, new THREE.CylinderGeometry(0.004, 0.004, 0.12, 6), -0.3 + i * 0.06, 0.17); }   // screwdrivers
      tool(M.orange, new THREE.BoxGeometry(0.2, 0.08, 0.06), 0.15, 0.25); tool(M.dark, new THREE.BoxGeometry(0.06, 0.14, 0.05), 0.12, 0.15); tool(M.steel, new THREE.CylinderGeometry(0.01, 0.01, 0.08, 6).rotateZ(Math.PI / 2), 0.29, 0.25);   // cordless drill
      tool(M.yellow, new THREE.BoxGeometry(0.1, 0.16, 0.04), 0.45, 0.22); tool(M.dark, new THREE.BoxGeometry(0.07, 0.05, 0.045), 0.45, 0.25);   // multimeter
      tool(M.dark, new THREE.TorusGeometry(0.06, 0.02, 8, 16), 0.6, 0.2);   // tape
      tool(M.red, new THREE.BoxGeometry(0.5, 0.22, 0.1), 0.25, -0.28); tool(M.frame, new THREE.BoxGeometry(0.3, 0.06, 0.102), 0.25, -0.28);   // suit repair kit
      const cx = Math.sin(ang) * (r - 0.7), cz = Math.cos(ang) * (r - 0.7); box(M.red, 0.7, 0.75, 0.45, cx, 0.45, cz, ry); box(M.dark, 0.72, 0.03, 0.47, cx, 0.84, cz, ry); for (const k of [0.25, 0.45, 0.65]) box(M.dark, 0.66, 0.01, 0.01, cx + Math.cos(ry) * 0.0, k, cz, ry);
      for (const [ox, oz] of [[-0.3, -0.18], [0.3, -0.18], [-0.3, 0.18], [0.3, 0.18]]) cyl(M.dark, 0.04, 0.05, cx + Math.cos(ry) * ox + Math.sin(ry) * oz, 0.04, cz - Math.sin(ry) * ox + Math.cos(ry) * oz, 8);
      box(M.orange, 0.4, 0.14, 0.22, cx, 0.93, cz, ry); block(cx, cz, 0.8, 0.8); }
    // algae photobioreactor (back wall): eight lit tubes of Chlorella between manifolds, grow lights, control screen
    { const x0 = 0.55, z = 3.1, n = 8, sp = 0.2, tubeM = new THREE.MeshLambertMaterial({ color: 0x3fae3a, emissive: 0x1d5a18, transparent: true, opacity: 0.85 });
      box(M.frame, 1.9, 0.12, 0.5, x0, 0.06, z); box(M.frame, 1.9, 0.1, 0.5, x0, 2.0, z); for (const k of [-0.95, 0.95]) box(M.mid, 0.06, 2.0, 0.5, x0 + k, 1.0, z);
      const tubes = []; for (let i = 0; i < n; i++) { const tx = x0 - (n - 1) * sp / 2 + i * sp; tubes.push(new THREE.CylinderGeometry(0.065, 0.065, 1.7, 14).translate(tx, 1.03, ZC + z)); put(M.steel, new THREE.CylinderGeometry(0.075, 0.075, 0.06, 14), tx, 0.15, z); put(M.steel, new THREE.CylinderGeometry(0.075, 0.075, 0.06, 14), tx, 1.9, z); }
      g.add(new THREE.Mesh(mergeGeometries(tubes), tubeM)); this.tubeM = tubeM;
      box(M.grow, 1.8, 0.04, 0.04, x0, 1.95, z - 0.2); box(M.grow, 1.8, 0.04, 0.04, x0, 0.25, z - 0.2); box(M.steel, 1.9, 0.05, 0.05, x0, 1.97, z + 0.2); box(M.steel, 1.9, 0.05, 0.05, x0, 0.12, z + 0.2);
      // bubbles rising in the tubes (air enriched with CO2 is pumped in at the bottom)
      const bub = new THREE.InstancedMesh(new THREE.SphereGeometry(0.012, 6, 4), new THREE.MeshBasicMaterial({ color: 0xd8ffd0, transparent: true, opacity: 0.7 }), n * 6); g.add(bub); this.bub = { m: bub, n, x0, z: ZC + z, sp, t: 0, ph: Array.from({ length: n * 6 }, () => Math.random()) };
      block(x0, z, 2.0, 0.6);
      const sc = this.pbrScreen = new Panel(0.5, 0.32, 600, { depthTest: true }); sc.mesh.position.set(x0 - 1.25, 1.35, ZC + z - 0.05); sc.mesh.rotation.y = Math.PI; g.add(sc.mesh); box(M.dark, 0.06, 1.3, 0.06, x0 - 1.25, 0.65, z); }
    // desk screen with live readings, and the info panel by the door
    { const sc = this.deskScreen = new Panel(0.62, 0.38, 600, { depthTest: true }); sc.mesh.position.set(-3.17, 1.2, ZC + 0.4); sc.mesh.rotation.y = Math.PI / 2; g.add(sc.mesh); }
    { const ang = Math.PI - 0.95, r = R3 - 0.08, ip = this.info = new Panel(1.3, 1.2, 560, { depthTest: true }); ip.mesh.position.set(Math.sin(ang) * r, 1.5, ZC + Math.cos(ang) * r); ip.mesh.rotation.y = ang + Math.PI; g.add(ip.mesh); }
    // sign over the corridor, on the base side
    { const sg = this.sign = new Panel(1.5, 0.34, 400, { depthTest: true }); sg.mesh.position.set(0, DOOR_H + 0.24, R - 0.12); sg.mesh.rotation.y = Math.PI; g.add(sg.mesh); }
    for (const [m, list] of parts) g.add(new THREE.Mesh(mergeGeometries(list.map(q => { if (!q.attributes.normal) q.computeVertexNormals(); return q; })), m));
    hab.cabinBlock = (x, z) => !boxes.some(([x0, x1, z0, z1]) => x > x0 - 0.25 && x < x1 + 0.25 && z > z0 - 0.25 && z < z1 + 0.25);
    this.t = 0; this.redraw();
  }
  redraw() {
    this.sign.draw((c, W, Hh) => { rrect(c, 2, 2, W - 4, Hh - 4, 16); c.fillStyle = '#1b1714'; c.fill(); text(c, L({ it: 'CABINA EQUIPAGGIO →', en: 'CREW QUARTERS →' }), W / 2, Hh * 0.68, 56, '#9cff8a', 700, 'center'); });
    this.info.draw((c, W, Hh) => { rrect(c, 4, 4, W - 8, Hh - 8, 22); c.fillStyle = 'rgba(14,10,8,0.95)'; c.fill(); c.lineWidth = 5; c.strokeStyle = '#9cff8a'; c.stroke();
      text(c, L({ it: 'CABINA DELL\'EQUIPAGGIO', en: 'CREW QUARTERS' }), 28, 54, 32, '#9cff8a', 700);
      let y = wrap(c, L({ it: 'Qui l\'astronauta dorme, lavora e ripara l\'attrezzatura.', en: 'Here the astronaut sleeps, works and repairs equipment.' }), 28, 100, W - 56, 22, 30, '#f2e9e1');
      y = wrap(c, L({ it: 'Ossigeno. Una persona consuma circa 0,84 kg di O₂ al giorno. Il fotobioreattore (8 tubi, circa 50 litri di microalghe Chlorella) ne produce solo qualche decina di grammi: serve come scorta biologica e per studiare i sistemi rigenerativi come il progetto MELiSSA dell\'ESA. La parte principale verrebbe dall\'elettrolisi dell\'acqua e dalla CO₂ dell\'aria, come ha dimostrato MOXIE su Perseverance (122 g di O₂ in 16 prove).', en: 'Oxygen. A person uses about 0.84 kg of O₂ a day. The photobioreactor (8 tubes, about 50 litres of Chlorella microalgae) makes only a few tens of grams: it is a biological reserve and a test of regenerative systems like ESA\'s MELiSSA project. Most would come from water electrolysis and from atmospheric CO₂, as MOXIE showed on Perseverance (122 g of O₂ in 16 runs).' }), 28, y + 12, W - 56, 20, 27, '#d9c4b2');
      wrap(c, L({ it: 'Attrezzi: chiavi, cacciaviti, trapano a batteria, multimetro, nastro e il kit di riparazione della tuta. Su Marte la polvere fine rovina guarnizioni e cuscinetti: la manutenzione è lavoro quotidiano.', en: 'Tools: wrenches, screwdrivers, cordless drill, multimeter, tape and the suit repair kit. On Mars fine dust wears out seals and bearings: maintenance is daily work.' }), 28, y + 10, W - 56, 20, 27, '#d9c4b2'); });
    this.drawScreens();
  }
  drawScreens() {
    const app = this.app, st = app.mission?.state ? app.mission.state(app.player.head()) : null, solar = app.deco?.solarKWh;
    this.deskScreen.draw((c, W, Hh) => { c.fillStyle = '#0c1418'; c.fillRect(0, 0, W, Hh); c.strokeStyle = '#7fe0ff'; c.lineWidth = 6; c.strokeRect(4, 4, W - 8, Hh - 8);
      text(c, L({ it: 'STATO DELLA BASE', en: 'BASE STATUS' }), 22, 46, 26, '#7fe0ff', 700);
      const rows = [[L({ it: 'Cabina', en: 'Cabin' }), '101 kPa · 21 °C'], ['O₂ / CO₂', '21 % / 0,04 %'], [L({ it: 'Energia solare', en: 'Solar power' }), solar ? L({ it: `~${solar} kWh/sol`, en: `~${solar} kWh/sol` }) : '—'], [L({ it: 'Tuta', en: 'Suit' }), st ? `O₂ ${Math.round(st.o2Frac * 100)}%` : '—']];
      rows.forEach(([k, v], i) => { text(c, k, 22, 96 + i * 40, 22, '#d9c4b2', 500); text(c, v, W - 22, 96 + i * 40, 22, '#fff', 700, 'right'); }); });
    this.pbrScreen.draw((c, W, Hh) => { c.fillStyle = '#0b140c'; c.fillRect(0, 0, W, Hh); c.strokeStyle = '#9cff8a'; c.lineWidth = 6; c.strokeRect(4, 4, W - 8, Hh - 8);
      text(c, L({ it: 'FOTOBIOREATTORE', en: 'PHOTOBIOREACTOR' }), 20, 44, 24, '#9cff8a', 700);
      const rows = [['Chlorella vulgaris', '~50 L'], [L({ it: 'Luce', en: 'Light' }), 'LED 16 h/sol'], [L({ it: 'Temperatura', en: 'Temperature' }), '28 °C'], [L({ it: 'O₂ prodotto', en: 'O₂ produced' }), `~${(25 + 3 * Math.sin(this.t / 30)).toFixed(0)} g/sol`]];
      rows.forEach(([k, v], i) => { text(c, k, 20, 90 + i * 36, 20, '#d9c4b2', 500); text(c, v, W - 20, 90 + i * 36, 20, '#fff', 700, 'right'); }); });
  }
  update(dt) {
    this.t += dt; const b = this.bub, d = new THREE.Object3D(); if (!b) return;
    for (let i = 0; i < b.n * 6; i++) { const k = Math.floor(i / 6), ph = (b.ph[i] + this.t * (0.12 + 0.03 * (i % 3))) % 1; d.position.set(b.x0 - (b.n - 1) * b.sp / 2 + k * b.sp + Math.sin(i * 7 + this.t) * 0.03, 0.2 + ph * 1.65, b.z + Math.cos(i * 5) * 0.03); d.updateMatrix(); b.m.setMatrixAt(i, d.matrix); }
    b.m.instanceMatrix.needsUpdate = true;
    if ((this._s = (this._s || 0) + dt) > 2) { this._s = 0; this.drawScreens(); }
  }
}
// pegboard: grey board with a grid of holes and tool outlines
function pegTex() { const c = document.createElement('canvas'); c.width = 512; c.height = 340; const x = c.getContext('2d'); x.fillStyle = '#8d949c'; x.fillRect(0, 0, 512, 340); x.fillStyle = '#5c636b'; for (let i = 8; i < 512; i += 16) for (let j = 8; j < 340; j += 16) { x.beginPath(); x.arc(i, j, 2.5, 0, Math.PI * 2); x.fill(); } x.strokeStyle = '#2b3036'; x.lineWidth = 8; x.strokeRect(0, 0, 512, 340); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
