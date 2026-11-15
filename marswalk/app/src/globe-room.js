// Mission room: a third module of the base, opposite the research room. A big Mars globe turns slowly in the middle;
// every NASA lander and rover stands on it at its real landing site (latitude and longitude from the missions' published
// landing coordinates), and the orbiters circle it on their real orbit inclinations. Distances above the surface are not
// to scale (the real orbits would almost touch the globe). Pictures: renders of the same NASA 3D models as the exhibition.
import * as THREE from 'three';
import { hullTex, domeTex } from './base-deco.js';
import { R, H, DOOR_W, DOOR_H, TUN2, R2, XC } from './habitat.js';
import { Panel, rrect, text, wrap } from './ui.js';
import { lang } from './i18n.js';
import { PATHS } from './globe-paths.js';
const L = o => (typeof o === 'string' ? o : o[lang.cur] ?? o.it);
const GR = 1.5, GY = 2.05, RAIL = 2.4, SPIN = 2 * Math.PI / 75, ACC = '#ffb36b', KX = 40, RM = 3389.5;   // KX: traverses drawn 40 times larger, or they would be a few millimetres long
// landers: landing site, planetocentric latitude and east longitude (degrees); h: stalk height, so close sites do not overlap
export const LANDERS = [
  { id: 'viking', name: 'Viking 1', year: 1976, lat: 22.27, lon: -47.95, h: 0.22 },
  { id: 'viking', name: 'Viking 2', year: 1976, lat: 47.64, lon: -134.29, h: 0.22 },
  { id: 'pathfinder', name: 'Pathfinder', year: 1997, lat: 19.13, lon: -33.22, h: 0.62 },
  { id: 'spirit', name: 'Spirit', year: 2004, lat: -14.57, lon: 175.47, h: 0.25, col: 0x9cff8a },
  { id: 'opportunity', name: 'Opportunity', year: 2004, lat: -1.95, lon: -5.53, h: 0.25, col: 0x7fe0ff },
  { id: 'phoenix', name: 'Phoenix', year: 2008, lat: 68.22, lon: -125.75, h: 0.55 },
  { id: 'curiosity', name: 'Curiosity', year: 2012, lat: -4.59, lon: 137.44, h: 0.22, col: 0xffd166 },
  { id: 'insight', name: 'InSight', year: 2018, lat: 4.5, lon: 135.62, h: 0.62 },
  { id: 'perseverance', name: 'Perseverance', year: 2021, lat: 18.44, lon: 77.45, h: 0.22, col: 0xff7a59 },
  { id: 'ingenuity', name: 'Ingenuity', year: 2021, lat: 18.44, lon: 77.45, h: 0.62, col: 0xd29bff },
];
// orbiters: real inclination (degrees); r: drawn orbit radius (m, not to scale); T: seconds per turn in the room
export const ORBITERS = [
  { id: 'mariner9', name: 'Mariner 9', year: '1971', inc: 64.4, r: 2.2, T: 70, node: 20 },
  { id: 'vikingorb', name: 'Viking Orbiter', name_en: 'Viking Orbiters', year: '1976', inc: 39.3, r: 2.1, T: 64, node: 200 },
  { id: 'mgs', name: 'Mars Global Surveyor', year: '1997', inc: 92.9, r: 1.85, T: 42, node: 0 },
  { id: 'odyssey', name: '2001 Mars Odyssey', year: '2001', inc: 93.1, r: 1.95, T: 46, node: 60 },
  { id: 'mro', name: 'Mars Reconnaissance Orbiter', year: '2006', inc: 92.6, r: 1.75, T: 38, node: 120 },
  { id: 'maven', name: 'MAVEN', year: '2014', inc: 75, r: 2.0, T: 55, node: 290, ecc: 0.25 },
];
// flybys: they passed Mars once, so they cross the room on a straight line
export const FLYBYS = [
  { id: 'mariner4', name: 'Mariner 4', year: '1965', d: 2.25, T: 40, yaw: 30, y: 0.5 },
  { id: 'mariner67', name: 'Mariner 6 e 7', name_en: 'Mariner 6 and 7', year: '1969', d: 2.2, T: 46, yaw: 150, y: -0.4 },
];
// a flat strip lying on the globe along a list of unit normals
function ribbon(ns, w, col) {
  const pos = [], idx = [], t = new THREE.Vector3(), sd = new THREE.Vector3();
  ns.forEach((n, i) => { const a = ns[Math.max(0, i - 1)], b = ns[Math.min(ns.length - 1, i + 1)]; t.subVectors(b, a); sd.crossVectors(n, t).normalize().multiplyScalar(w / 2); if (!isFinite(sd.x)) sd.set(0, 0, 0);
    const p = n.clone().multiplyScalar(GR + 0.003); pos.push(p.x + sd.x, p.y + sd.y, p.z + sd.z, p.x - sd.x, p.y - sd.y, p.z - sd.z); if (i) { const j = 2 * i; idx.push(j - 2, j - 1, j, j - 1, j + 1, j); } });
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx);
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }));
}
// night sky for the dome: stars spread evenly over the half sphere, a faint Milky Way band, a few coloured stars
function skyTex() {
  const W = 4096, H = 2048, c = document.createElement('canvas'); c.width = W; c.height = H / 2; const x = c.getContext('2d'); x.fillStyle = '#03040a'; x.fillRect(0, 0, W, H / 2);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, yOf = th => th / Math.PI * H;   // only the top half of the sphere is used, so the canvas holds just that
  for (let i = 0; i < 420; i++) { const u = rnd(), th = 0.35 + rnd() * 1.1, yy = yOf(th) + Math.sin(u * Math.PI * 2) * 120, xx = u * W, sx = 1 / Math.max(0.2, Math.sin(th)), rr = 40 + rnd() * 70;   // Milky Way: soft glow along a wavy band
    const g = x.createRadialGradient(0, 0, 0, 0, 0, rr); g.addColorStop(0, 'rgba(150,160,215,0.06)'); g.addColorStop(1, 'rgba(150,160,215,0)'); x.save(); x.translate(xx, yy); x.scale(sx, 1); x.fillStyle = g; x.fillRect(-rr, -rr, 2 * rr, 2 * rr); x.restore(); }
  for (let i = 0; i < 6000; i++) { const th = Math.acos(1 - rnd()), yy = yOf(th), xx = rnd() * W, m = rnd() ** 4, r = 0.5 + m * 1.8, sx = 1 / Math.max(0.12, Math.sin(th)), hue = rnd(), al = 0.25 + m * 0.75;
    x.fillStyle = hue < 0.07 ? `rgba(255,200,160,${al})` : hue < 0.14 ? `rgba(180,205,255,${al})` : `rgba(255,255,255,${al})`; x.beginPath(); x.ellipse(xx, yy, r * sx, r, 0, 0, Math.PI * 2); x.fill();
    if (m > 0.6) { const g = x.createRadialGradient(xx, yy, 0, xx, yy, r * 4); g.addColorStop(0, 'rgba(255,255,255,0.25)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(xx - r * 4 * sx, yy - r * 4, r * 8 * sx, r * 8); } }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.repeat.y = 2; t.offset.y = -1; return t;
}
const NM = c => (lang.cur === 'en' && c.name_en) || c.name;
const normal = (la, lo) => { la *= Math.PI / 180; lo *= Math.PI / 180; return new THREE.Vector3(Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo)); };

export class GlobeRoom {
  constructor(app, hab, root) {
    this.app = app; this.hab = hab; this.root = root; this.labels = []; const s = -hab.side, g = hab.group, col = c => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide });
    const add = (par, geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); par.add(o); return o; };
    // corridor from the base wall to the room wall (same as the research room's, on the other side)
    const u0 = R - 0.25, u1 = XC - R2 + 0.3, um = s * (u0 + u1) / 2, Lc = u1 - u0, grey = col(0xcfd4d8), shell = col(0xc8bcae);
    for (const z of [-DOOR_W / 2, DOOR_W / 2]) add(g, new THREE.PlaneGeometry(Lc, DOOR_H), grey, um, DOOR_H / 2, z);
    for (const z of [-DOOR_W / 2 - 0.12, DOOR_W / 2 + 0.12]) add(g, new THREE.PlaneGeometry(Lc, DOOR_H + 0.15), shell, um, DOOR_H / 2 + 0.07, z);
    add(g, new THREE.PlaneGeometry(Lc, DOOR_W).rotateX(Math.PI / 2), grey, um, DOOR_H, 0); add(g, new THREE.PlaneGeometry(Lc, DOOR_W + 0.24).rotateX(Math.PI / 2), shell, um, DOOR_H + 0.15, 0);
    add(g, new THREE.PlaneGeometry(Lc, DOOR_W).rotateX(-Math.PI / 2), col(0x555b62), um, 0.004, 0);
    const sign = this.sign = new Panel(1.5, 0.34, 400); sign.mesh.material.depthTest = true; sign.mesh.position.set(s * (R - 0.12), DOOR_H + 0.24, 0); sign.mesh.rotation.y = -s * Math.PI / 2; g.add(sign.mesh);
    // the room
    const rg = this.rg = new THREE.Group(); rg.position.set(s * XC, 0, 0); rg.rotation.y = s * Math.PI / 2; g.add(rg); const HH = H + 0.9;
    const a = Math.asin(DOOR_W / 2 / R2), wallT = (() => { const c = document.createElement('canvas'); c.width = 1024; c.height = 256; const x = c.getContext('2d'), gr = x.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#15161c'); gr.addColorStop(1, '#0b0c10'); x.fillStyle = gr; x.fillRect(0, 0, 1024, 256);
      x.fillStyle = 'rgba(255,255,255,0.5)'; for (let i = 0; i < 160; i++) { x.globalAlpha = Math.random() * 0.8; x.fillRect(Math.random() * 1024, Math.random() * 190, 1.5, 1.5); } x.globalAlpha = 1; x.fillStyle = ACC; x.fillRect(0, 205, 1024, 4);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.repeat.x = 2; return t; })();
    add(rg, new THREE.CylinderGeometry(R2 + 0.06, R2 + 0.06, HH, 56, 1, true, Math.PI + a, 2 * Math.PI - 2 * a), new THREE.MeshBasicMaterial({ map: hullTex(2) }), 0, HH / 2);
    add(rg, new THREE.CylinderGeometry(R2, R2, HH, 56, 1, true, Math.PI + a, 2 * Math.PI - 2 * a), new THREE.MeshBasicMaterial({ map: wallT, side: THREE.BackSide }), 0, HH / 2);
    add(rg, new THREE.CylinderGeometry(R2 + 0.03, R2 + 0.03, HH - DOOR_H, 6, 1, true, Math.PI - a, 2 * a), col(0xbfb2a2), 0, DOOR_H + (HH - DOOR_H) / 2);
    const dome = add(rg, new THREE.SphereGeometry(R2 + 0.06, 48, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ map: domeTex() }), 0, HH); dome.scale.y = 0.34;
    const ceil = add(rg, new THREE.SphereGeometry(R2, 64, 24, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ map: skyTex(), side: THREE.BackSide }), 0, HH); ceil.scale.y = 0.32;
    add(rg, new THREE.CircleGeometry(R2, 56).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x24262c }), 0, 0.005);
    add(rg, new THREE.RingGeometry(RAIL + 0.15, RAIL + 0.3, 64).rotateX(-Math.PI / 2), col(0x3a3d45), 0, 0.008);
    add(rg, new THREE.CylinderGeometry(R2 + 0.25, R2 + 0.4, 3.2, 56, 1, true), col(0x6b5a4c), 0, -1.6);
    // railing and pedestal
    const metal = new THREE.MeshLambertMaterial({ color: 0x9aa3ad });
    add(rg, new THREE.TorusGeometry(RAIL, 0.03, 8, 96).rotateX(Math.PI / 2), metal, 0, 1.0); add(rg, new THREE.TorusGeometry(RAIL, 0.02, 6, 96).rotateX(Math.PI / 2), metal, 0, 0.55);
    for (let i = 0; i < 16; i++) { const t = i / 16 * Math.PI * 2; add(rg, new THREE.CylinderGeometry(0.025, 0.025, 1.0, 6), metal, Math.sin(t) * RAIL, 0.5, Math.cos(t) * RAIL); }
    add(rg, new THREE.CylinderGeometry(0.35, 0.6, GY - GR + 0.1, 24), new THREE.MeshLambertMaterial({ color: 0x3a3d45 }), 0, (GY - GR + 0.1) / 2);
    // the globe and its landers (children of the spinning group)
    const spin = this.spin = new THREE.Group(); spin.position.y = GY; rg.add(spin);
    const tex = new THREE.TextureLoader().load(`${root}mars_globe.jpg`); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    add(spin, new THREE.SphereGeometry(GR, 96, 64), new THREE.MeshBasicMaterial({ map: tex }));
    const stalkM = new THREE.MeshBasicMaterial({ color: 0xffffff }), dotM = new THREE.MeshBasicMaterial({ color: 0x33e6ff });
    for (const l of LANDERS) {
      const n = normal(l.lat, l.lon), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
      const st = add(spin, new THREE.CylinderGeometry(0.006, 0.006, l.h, 5).translate(0, l.h / 2, 0), stalkM); st.position.copy(n).multiplyScalar(GR); st.quaternion.copy(q);
      const dot = add(spin, new THREE.CircleGeometry(0.025, 16).rotateX(-Math.PI / 2), dotM); dot.position.copy(n).multiplyScalar(GR + 0.004); dot.quaternion.copy(q);
      const sp = this.label(l, 0.42); sp.position.copy(n).multiplyScalar(GR + l.h + 0.2); spin.add(sp);
      const tr = PATHS[l.id]; if (tr) { const [la0, lo0] = tr.origin || [l.lat, l.lon], c = Math.cos(la0 * Math.PI / 180), k = KX / RM * 180 / Math.PI;
        spin.add(ribbon(tr.pts.map(([nn, ee]) => normal(la0 + nn * k, lo0 + ee * k / c)), l.id === 'ingenuity' ? 0.008 : 0.014, l.col)); }
    }
    // orbiters: each orbit is a tilted ring that does not turn with the planet
    this.moving = [];
    for (const o of ORBITERS) {
      const og = new THREE.Group(); og.position.y = GY; og.rotation.set(0, o.node * Math.PI / 180, 0); const tilt = new THREE.Group(); tilt.rotation.x = o.inc * Math.PI / 180; og.add(tilt); rg.add(og);
      const e = o.ecc || 0, pts = []; for (let i = 0; i <= 128; i++) { const t = i / 128 * Math.PI * 2, rr = o.r * (1 - e * e) / (1 + e * Math.cos(t)); pts.push(new THREE.Vector3(Math.cos(t) * rr, 0, Math.sin(t) * rr)); }
      tilt.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xffd9a8, transparent: true, opacity: 0.35 })));
      const sp = this.label(o, 0.34); tilt.add(sp); this.moving.push({ o, sp, e, t: Math.random() * Math.PI * 2 });
    }
    for (const f of FLYBYS) {
      const fg = new THREE.Group(); fg.position.y = GY + f.y; fg.rotation.y = f.yaw * Math.PI / 180; rg.add(fg);
      fg.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-1.3, 0, f.d), new THREE.Vector3(1.3, 0, f.d)]), new THREE.LineDashedMaterial({ color: 0xffd9a8, transparent: true, opacity: 0.35, dashSize: 0.06, gapSize: 0.05 })).computeLineDistances());
      const sp = this.label(f, 0.34); fg.add(sp); this.moving.push({ f, sp, t: Math.random() });
    }
    // explanation panel on the wall, left of the entrance
    const ip = this.info = new Panel(1.5, 1.1, 560, { depthTest: true }), pa = Math.PI + 0.75; ip.mesh.position.set(Math.sin(pa) * (R2 - 0.1), 1.6, Math.cos(pa) * (R2 - 0.1)); ip.mesh.rotation.y = pa + Math.PI; ip.mesh.material.depthWrite = true; rg.add(ip.mesh);
    this.redraw();
  }
  // a camera-facing picture of the spacecraft with its name and year
  label(c, size) {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 320; const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false })); sp.scale.set(size, size * 1.25, 1); sp.renderOrder = 5;
    const im = new Image(), draw = () => { const x = cv.getContext('2d'); x.clearRect(0, 0, 256, 320); x.fillStyle = 'rgba(10,10,14,0.55)'; x.beginPath(); x.arc(128, 118, 112, 0, Math.PI * 2); x.fill();
      if (im.complete && im.naturalWidth) x.drawImage(im, 28, 18, 200, 200);
      rrect(x, 4, 238, 248, 78, 18); x.fillStyle = 'rgba(14,9,6,0.85)'; x.fill(); text(x, NM(c), 128, 274, NM(c).length > 16 ? 22 : 30, '#fff', 700, 'center'); text(x, String(c.year), 128, 304, 22, ACC, 600, 'center'); t.needsUpdate = true; };
    im.onload = draw; im.src = `${this.root}globe-room/${c.id}.png`; draw(); this.labels.push(draw); return sp;
  }
  redraw() {
    this.labels.forEach(d => d());
    this.sign.draw((c, W, Hh) => { rrect(c, 2, 2, W - 4, Hh - 4, 16); c.fillStyle = '#1b1714'; c.fill(); text(c, L({ it: 'SALA MISSIONI →', en: 'MISSION ROOM →' }), W / 2, Hh * 0.68, 64, ACC, 700, 'center'); });
    this.info.draw((c, W, Hh) => { rrect(c, 4, 4, W - 8, Hh - 8, 22); c.fillStyle = 'rgba(14,10,8,0.96)'; c.fill(); c.lineWidth = 5; c.strokeStyle = ACC; c.stroke();
      text(c, L({ it: 'LE MISSIONI NASA SU MARTE', en: 'NASA MISSIONS TO MARS' }), 30, 62, 36, ACC, 700);
      let y = wrap(c, L({ it: `Sul globo, ogni lander e rover sta nel punto esatto in cui è atterrato (${LANDERS.length} veicoli, dal 1976 a oggi). Le sonde in orbita girano attorno al pianeta con l'inclinazione reale della loro orbita; le linee tratteggiate sono i sorvoli di Mariner 4, 6 e 7.`, en: `On the globe every lander and rover stands exactly where it landed (${LANDERS.length} vehicles, from 1976 to today). The orbiters circle the planet at their real orbit inclination; the dashed lines are the Mariner 4, 6 and 7 flybys.` }), 30, 112, W - 60, 23, 31, '#f2e9e1');
      y = wrap(c, L({ it: 'Le quote non sono in scala: in proporzione al globo, la maggior parte delle orbite passerebbe a pochi centimetri dalla superficie. Le linee colorate a terra sono i percorsi reali dei rover (Spirit, Opportunity, Curiosity, Perseverance) e i voli di Ingenuity, ingranditi 40 volte: in scala sarebbero lunghi pochi millimetri. Il globo fa un giro ogni 75 secondi.', en: 'Heights are not to scale: in proportion to the globe, most orbits would pass a few centimetres above the surface. The coloured lines on the ground are the real rover traverses (Spirit, Opportunity, Curiosity, Perseverance) and Ingenuity\'s flights, enlarged 40 times: to scale they would be a few millimetres long. The globe turns once every 75 seconds.' }), 30, y + 12, W - 60, 20, 27, '#d9c4b2');
      text(c, L({ it: 'Mappa Viking MDIM 2.1 (NASA/USGS) · percorsi: PDS e mappe NASA MMGIS · immagini dai modelli 3D NASA', en: 'Viking MDIM 2.1 map (NASA/USGS) · traverses: PDS and NASA MMGIS maps · pictures from NASA 3D models' }), 30, Hh - 28, 16, '#a8988a', 400); });
  }
  update(dt) {
    this.spin.rotation.y += dt * SPIN;
    for (const m of this.moving) {
      if (m.o) { m.t += dt * 2 * Math.PI / m.o.T; const rr = m.o.r * (1 - m.e * m.e) / (1 + m.e * Math.cos(m.t)); m.sp.position.set(Math.cos(m.t) * rr, 0, Math.sin(m.t) * rr); }
      else { m.t = (m.t + dt / m.f.T) % 1; const x = -1.3 + 2.6 * m.t; m.sp.position.set(x, 0, m.f.d); m.sp.material.opacity = Math.min(1, (1 - Math.abs(x) / 1.3) * 4); }
    }
  }
}
