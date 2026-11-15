// Ingenuity's flight 42 (sol 697, 5 February 2023), replayed where it happened: from its take-off spot near Wildcat Ridge
// to its landing spot near Rocky Top. End points, altitude (10 m), top speed (5.5 m/s) and duration (137.2 s) are the official
// values of NASA's Ingenuity flight log; the path in between is drawn as a straight line, because only the end points are published.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { Panel, rrect, text, wrap } from './ui.js';
import { lang } from './i18n.js';
const L = o => o[lang.cur] ?? o.it;
const R = 3396190, START = [77.40709567, 18.45903198], END = [77.40378107, 18.4617056], ALT = 10, VMAX = 5.5, DUR = 137.2, DIST = 257.3, COL = 0xc77dff;

export class Heli {
  constructor(app, root) {
    this.app = app; this.t = -1; const s = app.site, k = Math.PI / 180 * R, c = Math.cos(s.lat0 * Math.PI / 180);
    const loc = ([lo, la]) => [(lo - s.lon0) * k * c, -(la - s.lat0) * k];   // world x (east), z (south)
    [this.x0, this.z0] = loc(START); [this.x1, this.z1] = loc(END); this.g0 = app.ground(this.x0, this.z0) ?? 0; this.g1 = app.ground(this.x1, this.z1) ?? 0;
    const g = this.g = new THREE.Group(); app.world.add(g); this.body = new THREE.Group(); g.add(this.body); this.place(0);
    // beacon at the take-off spot, violet so it does not look like a mission stop
    const bm = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 90, 10, 1, true).translate(0, 45, 0), new THREE.MeshBasicMaterial({ color: COL, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }));
    bm.position.set(this.x0, this.g0, this.z0); app.world.add(bm); this.beacon = bm;
    // name tag over the beacon, like the mission stops
    const tag = this.tag = new Panel(4, 1, 128, { depthTest: true }); tag.mesh.rotation.order = 'YXZ'; tag.mesh.position.set(this.x0, this.g0 + 7, this.z0); app.world.add(tag.mesh); this.drawTag();
    // landing spot marker and the flight line
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.0, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: COL, side: THREE.DoubleSide })); ring.position.set(this.x1, this.g1 + 0.05, this.z1); app.world.add(ring);
    // control panel 3 m from the take-off spot, facing it
    const dx = this.x1 - this.x0, dz = this.z1 - this.z0, d = Math.hypot(dx, dz), px = this.x0 - dx / d * 3 + dz / d * 2, pz = this.z0 - dz / d * 3 - dx / d * 2, pg = app.ground(px, pz) ?? this.g0;
    const p = this.panel = new Panel(1.3, 0.9, 520, { depthTest: true }), m = p.mesh; m.renderOrder = 10; m.material.transparent = false; m.material.depthWrite = true;
    m.position.set(px, pg + 1.25, pz); m.rotation.y = Math.atan2(this.x0 - px, this.z0 - pz) + Math.PI; app.world.add(m); this.pp = [px, pz];
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.8, 0.08), new THREE.MeshLambertMaterial({ color: 0x2a2a2c })); post.position.set(px, pg + 0.4, pz); app.world.add(post);
    this.draw();
    new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(`${root}models/ingenuity.glb`, gl => { const sc = gl.scene; sc.traverse(o => { if (o.isMesh) { const mm = o.material; o.material = new THREE.MeshLambertMaterial({ map: mm.map || null, color: mm.color, side: mm.side }); } });
      const b = new THREE.Box3().setFromObject(sc), z = b.getSize(new THREE.Vector3()), kk = 1.2 / Math.max(z.x, z.z); sc.scale.setScalar(kk); sc.position.y = -b.min.y * kk; this.body.add(sc); this.rotor = sc.getObjectByName('rotors_01'); }, undefined, e => console.warn('heli', e));
  }
  near(r = 3.5) { const h = this.app.player.head(); return Math.hypot(h.x - this.pp[0], h.z - this.pp[1]) < r; }
  play() { this.t = 0; this.draw(); }
  // flight profile: climb 15 s, cruise, descend 15 s; along-track speed limited to the logged maximum
  state(t) { const up = 15, dn = 15, cr = DUR - up - dn, f = t < up ? 0 : t > DUR - dn ? 1 : Math.min(1, (t - up) / cr), h = t < up ? ALT * t / up : t > DUR - dn ? ALT * Math.max(0, DUR - t) / dn : ALT; return { f: f * f * (3 - 2 * f), h }; }
  place(t) { const { f, h } = this.state(Math.max(0, t)), x = this.x0 + (this.x1 - this.x0) * f, z = this.z0 + (this.z1 - this.z0) * f, g = this.app.ground(x, z) ?? this.g0; this.g.position.set(x, g + h, z); this.g.rotation.y = Math.atan2(this.x1 - this.x0, this.z1 - this.z0); this.h = h; this.dist = f * DIST; }
  drawTag() { this.tag.draw((c, W, H) => { rrect(c, 2, 2, W - 4, H - 4, 30); c.fillStyle = 'rgba(14,9,6,0.72)'; c.fill(); text(c, L({ it: 'Volo 42 di Ingenuity', en: 'Ingenuity flight 42' }), W / 2, H * 0.68, 60, '#e2c2ff', 700, 'center'); }); }
  update(dt, cam) {
    const dx = this.x0 - cam.x, dz = this.z0 - cam.z, d = Math.hypot(dx, dz); this.beacon.scale.set(Math.max(1, d / 120), 1, Math.max(1, d / 120));
    const d3 = Math.hypot(d, cam.y - this.g0), ts = Math.max(1, d3 / 28), tm = this.tag.mesh; tm.scale.setScalar(ts); tm.position.y = this.g0 + 5 + 2.2 * ts; tm.rotation.set(0, Math.atan2(-dx, -dz), 0); tm.visible = d3 > 14; if (this.app.player.lift) this.app.camera.getWorldQuaternion(tm.quaternion);
    if (this.t < 0) return; this.t += dt; if (this.rotor) this.rotor.rotation.y += dt * 45;
    if (this.t >= DUR) { this.place(DUR); this.t = -1; this.done = true; this.draw(); return; } this.place(this.t); if ((this._a = (this._a || 0) + dt) > 0.5) { this._a = 0; this.draw(); }
  }
  draw() {
    const run = this.t >= 0;
    this.panel.draw((c, W, H) => { rrect(c, 4, 4, W - 8, H - 8, 22); c.fillStyle = 'rgba(14,10,8,0.96)'; c.fill(); c.lineWidth = 5; c.strokeStyle = '#c77dff'; c.stroke();
      text(c, L({ it: 'INGENUITY · VOLO 42', en: 'INGENUITY · FLIGHT 42' }), 26, 52, 30, '#c77dff', 700); text(c, L({ it: 'sol 697 · 5 febbraio 2023', en: 'sol 697 · 5 February 2023' }), W - 26, 52, 20, '#d9c4b2', 500, 'right');
      wrap(c, L({ it: `Da qui l'elicottero è decollato ed è atterrato ${Math.round(DIST)} m più avanti, vicino a Rocky Top (anello viola). Quota 10 m, velocità massima 5,5 m/s, durata 137 s: dati ufficiali del registro dei voli NASA. Il tragitto tra i due punti è disegnato in linea retta.`, en: `The helicopter took off here and landed ${Math.round(DIST)} m away, near Rocky Top (violet ring). Altitude 10 m, top speed 5.5 m/s, 137 s: official NASA flight log values. The path between the two points is drawn as a straight line.` }), 26, 100, W - 52, 21, 28, '#f2e9e1');
      const bx = 26, by = H - 140, bw = W - 52, bh = 74; rrect(c, bx, by, bw, bh, 18); c.fillStyle = run ? 'rgba(199,125,255,0.25)' : '#c77dff'; c.fill();
      text(c, run ? L({ it: `${Math.round(this.t)} s · quota ${this.h.toFixed(1)} m · ${Math.round(this.dist)} m percorsi`, en: `${Math.round(this.t)} s · alt ${this.h.toFixed(1)} m · ${Math.round(this.dist)} m flown` }) : (this.done ? L({ it: '▶  RIVEDI IL VOLO', en: '▶  REPLAY THE FLIGHT' }) : L({ it: '▶  AVVIA IL VOLO', en: '▶  START THE FLIGHT' })), W / 2, by + 48, 32, run ? '#fff' : '#1a0f0a', 700, 'center');
      text(c, L({ it: 'Avvicinati e premi il grilletto · al PC clic o tasto P', en: 'Come close and pull the trigger · on PC click or P' }), W / 2, H - 30, 18, '#a8988a', 400, 'center'); });
  }
}
