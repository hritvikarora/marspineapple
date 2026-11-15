// Demo game "Operazione deposito": recover the ten sample tubes Perseverance left on the ground at the Three Forks depot
// and bring them back to the base, as a rehearsal for Mars Sample Return. Each tube lies where the rover stood on the sol
// it was dropped (official localized waypoints; the tube falls under the rover, so the true spot is within about a metre).
// A scanner on the readout points to the nearest tube and beeps faster as you get close; hold the trigger to pick it up
// (the hold is the seal check). The carrier takes 5 tubes, so the player plans two trips; tubes count once they are inside
// the base, in the return canister. Score: time for all 10 (stars), with distance walked and suit oxygen as in the mission.
import * as THREE from 'three';
import { Panel, rrect, text, wrap } from './ui.js';
import { lang } from './i18n.js';
const L = o => (typeof o === 'string' ? o : o[lang.cur] ?? o.it);
const PICK = 1.6, HOLD = 1.5, GLOW = 12, CAP = 5;   // CAP: slots in the astronaut's sample carrier, so the job takes two trips
// what is inside each depot tube (the depot holds one of each pair the rover collected, plus the atmosphere and witness tubes)
const CONTENT = {
  'Malay': { it: 'roccia ignea del fondo del cratere', en: 'igneous rock from the crater floor' },
  'Mageik': { it: 'roccia sedimentaria fine, affioramento Amalik', en: 'fine-grained sedimentary rock, Amalik outcrop' },
  'Crosswind Lake': { it: 'regolite (sabbia e polvere della superficie)', en: 'regolith (surface sand and dust)' },
  'Roubion': { it: 'atmosfera marziana: il primo tentativo di carotaggio, la roccia si sbriciolò', en: 'Martian air: the first coring attempt, the rock crumbled' },
  'Coulettes': { it: 'roccia ignea ricca di olivina, Séítah', en: 'olivine-rich igneous rock, Séítah' },
  'Montdenier': { it: 'roccia ignea del fondo del cratere, affioramento Rochette', en: 'igneous rock from the crater floor, Rochette outcrop' },
  'Bearwallow': { it: 'roccia fangosa di Wildcat Ridge, adatta a conservare tracce di vita', en: 'Wildcat Ridge mudstone, good at preserving traces of life' },
  'Skyland': { it: 'arenaria di Skinner Ridge, fronte del delta', en: 'Skinner Ridge sandstone, delta front' },
  'Atsah': { it: 'roccia ignea del fondo del cratere', en: 'igneous rock from the crater floor' },
  'Amalik Witness': { it: 'provetta testimone: controlla la contaminazione portata da Terra', en: 'witness tube: checks for contamination brought from Earth' },
};
const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export class SampleGame {
  constructor(app, root) {
    this.app = app; this.active = false; this.tubes = []; this.g = new THREE.Group(); this.g.visible = false; app.world.add(this.g);
    const body = new THREE.MeshLambertMaterial({ color: 0xe8e6e0, emissive: 0x222222 }), cap = new THREE.MeshLambertMaterial({ color: 0x4a4f57 }), ringM = new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
    this.panel = new Panel(1.2, 0.42, 520, { depthTest: false }); const m = this.panel.mesh; m.renderOrder = 201; m.visible = false; app.camera.add(m);
    this.card = new Panel(1.3, 0.62, 520, { depthTest: true }); this.card.mesh.visible = false; app.world.add(this.card.mesh);
    this.brief = new Panel(1.7, 1.42, 560, { depthTest: true }); this.brief.mesh.visible = false; app.world.add(this.brief.mesh);
    fetch(`${root}research/activity.json`).then(r => r.json()).then(d => {
      const w = d.waypoints, at = sol => { let k = 0; for (let i = 0; i < w.length; i++) if (w[i][0] <= sol) k = i; return w[k]; };
      d.depot.forEach(([name, sol], i) => {
        const p = at(sol), x = p[1] + Math.sin(i * 2.4) * 0.5, z = -p[2] + Math.cos(i * 2.4) * 0.5, gy = app.ground(x, z) ?? 0, t = new THREE.Group(); t.position.set(x, gy + 0.025, z); t.rotation.y = i * 1.3; this.g.add(t);
        const tb = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.15, 12).rotateZ(Math.PI / 2), body); t.add(tb); const cp = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.035, 12).rotateZ(Math.PI / 2), cap); cp.position.x = 0.09; t.add(cp);
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.34, 32).rotateX(-Math.PI / 2), ringM.clone()); ring.position.y = 0.01; t.add(ring);
        this.tubes.push({ name, sol, x, z, g: t, ring, st: 'ground' });
      });
      // a gold beacon over the depot so the player knows where to head first
      const cx = this.tubes.reduce((a, t) => a + t.x, 0) / this.tubes.length, cz = this.tubes.reduce((a, t) => a + t.z, 0) / this.tubes.length, gy = app.ground(cx, cz) ?? 0;
      this.beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 90, 10, 1, true).translate(0, 45, 0), new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide })); this.beacon.position.set(cx, gy, cz); this.g.add(this.beacon); this.depot = [cx, cz];
    }).catch(e => console.warn('game', e));
    this.held = {}; this.trig = {}; this.by = 0;
    // sample belt: 5 holders on the astronaut's waist; tubes go in by hand
    const dark = new THREE.MeshLambertMaterial({ color: 0x2b2f35 }), strapM = new THREE.MeshLambertMaterial({ color: 0x4a4038 }), cupGeo = new THREE.CylinderGeometry(0.03, 0.026, 0.11, 14, 1, true), glowM = () => new THREE.MeshBasicMaterial({ color: 0x59ff9a, transparent: true, opacity: 0.0, depthWrite: false });
    const mkSlot = (parent, x, y, z) => { const o = new THREE.Group(); o.position.set(x, y, z); parent.add(o); const cup = new THREE.Mesh(cupGeo, dark); cup.material = dark; o.add(cup); const ring = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.007, 6, 18).rotateX(Math.PI / 2), glowM()); ring.position.y = 0.058; o.add(ring); return { o, ring, tube: null }; };
    this.belt = new THREE.Group(); this.belt.visible = false; app.world.add(this.belt);
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.02, 6, 48).rotateX(Math.PI / 2), strapM); this.belt.add(strap);
    this.bslots = [-0.8, -0.4, 0, 0.4, 0.8].map(a => mkSlot(this.belt, Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3));
    // return canister on the main workbench inside the base: 10 holders in two rows
    const hab = app.habitat, wa = 0.9, wr = 4.2 - 0.6; this.rack = new THREE.Group(); this.rack.position.set(Math.sin(wa) * wr, 0.96, Math.cos(wa) * wr); this.rack.rotation.y = wa; this.rack.visible = false; hab.group.add(this.rack);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.06, 0.3), new THREE.MeshLambertMaterial({ color: 0xc9cdd2 })); base.position.y = 0.03; this.rack.add(base);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.012, 0.3), new THREE.MeshBasicMaterial({ color: 0xffd166 })); lid.position.y = 0.062; this.rack.add(lid);
    this.rslots = []; for (let j = 0; j < 2; j++) for (let i = 0; i < 5; i++) this.rslots.push(mkSlot(this.rack, -0.32 + i * 0.16, 0.12, -0.07 + j * 0.14));
    this.rlabel = new Panel(0.86, 0.16, 500, { depthTest: true }); this.rlabel.mesh.position.set(0, 0.3, 0.16); this.rlabel.mesh.rotation.y = Math.PI; this.rack.add(this.rlabel.mesh);
    this.rlabel.draw((c, W, H) => { rrect(c, 2, 2, W - 4, H - 4, 14); c.fillStyle = 'rgba(14,10,8,0.92)'; c.fill(); c.lineWidth = 3; c.strokeStyle = '#ffd166'; c.stroke(); text(c, L({ it: 'CONTENITORE DI RIENTRO · 10 PROVETTE', en: 'RETURN CANISTER · 10 TUBES' }), W / 2, H / 2 + 8, 26, '#ffd166', 700, 'center'); });
    addEventListener('keydown', e => { if (e.code === 'KeyE' && !e.repeat && this.active && !app.renderer.xr.isPresenting) this.pcAction(); });
  }
  begin() {
    if (!this.tubes.length) return; this.active = true; this.done = false; this.t = 0; this.walk = 0; this.hold = 0; this.home = false; this.last = null; this.out = false; this.prev = null; this.g.visible = true; this.panel.mesh.visible = true; this.belt.visible = this.rack.visible = true; this.held = {}; for (const sl of [...this.bslots, ...this.rslots]) sl.tube = null;
    for (const t of this.tubes) { t.st = 'ground'; t.seen = false; this.g.add(t.g); t.g.position.set(t.x, (this.app.ground(t.x, t.z) ?? 0) + 0.025, t.z); t.g.rotation.set(0, 0, 0); t.g.visible = true; } if (this.app.pois) this.app.pois.group.visible = false; this.toast(L({ it: 'Esci dall\'airlock e segui il raggio dorato', en: 'Leave through the airlock and follow the gold beam' }), 8);
    const app = this.app, h = app.player.head(), a = app.player.headYaw(), ux = -Math.sin(a), uz = -Math.cos(a), bm = this.brief.mesh; bm.position.set(h.x + ux * 2.3, h.y + 0.2, h.z + uz * 2.3); bm.rotation.set(0, Math.atan2(-ux, -uz), 0); bm.visible = true; this.drawBrief(false);
  }
  end() { this.active = false; this.g.visible = false; this.belt.visible = this.rack.visible = false; for (const t of this.tubes) if (t.st === 'hand') this.g.add(t.g); this.panel.mesh.visible = false; this.card.mesh.visible = false; this.brief.mesh.visible = false; if (this.app.pois) this.app.pois.group.visible = true; }
  get carried() { return this.tubes.filter(t => t.st === 'belt' || t.st === 'hand').length; }
  get inBelt() { return this.bslots.filter(s => s.tube).length; }
  get stored() { return this.tubes.filter(t => t.st === 'stored').length; }
  get count() { return this.tubes.filter(t => t.st !== 'ground').length; }
  nearest(h) { let best = null, bd = Infinity; for (const t of this.tubes) { if (t.st !== 'ground') continue; const d = Math.hypot(t.x - h.x, t.z - h.z); if (d < bd) { bd = d; best = t; } } return best ? { t: best, d: bd } : null; }
  // the trigger is ours only when a tube is within reach (otherwise it keeps its usual job)
  // VR: the trigger is ours when that hand holds a tube or is next to a tube / holder. PC: a click does the next step (pick up, then stow)
  press(hand) {
    if (!this.active || this.done) return false; if (!this.app.renderer.xr.isPresenting) return this.pcAction();
    return ['left', 'right'].some(k => this.held[k] || this.target(k));
  }
  handPos(k) { const c = this.app.player.hands[k]; return c ? c.getWorldPosition(new THREE.Vector3()) : null; }
  slotPos(sl) { return sl.o.getWorldPosition(new THREE.Vector3()); }
  freeNear(list, p, r) { let best = null, bd = r; for (const sl of list) if (!sl.tube) { const d = this.slotPos(sl).distanceTo(p); if (d < bd) { bd = d; best = sl; } } return best; }
  // what an empty hand would grab: a tube on the ground (reach down to it) or a tube in the belt
  target(k) {
    const p = this.handPos(k); if (!p || this.held[k]) return null;
    for (const sl of this.bslots) if (sl.tube && this.slotPos(sl).distanceTo(p) < 0.13) return { t: sl.tube, sl };
    if (this.inBelt + (this.held.left ? 1 : 0) + (this.held.right ? 1 : 0) >= CAP) return null;
    let best = null, bd = 0.32; for (const t of this.tubes) if (t.st === 'ground') { const q = t.g.position, d = Math.hypot(q.x - p.x, q.z - p.z); if (d < bd && p.y - q.y < 0.8) { bd = d; best = t; } } return best ? { t: best } : null;
  }
  grab(t, k, sl) {
    if (sl) sl.tube = null; t.st = 'hand'; this.held[k] = t; t.ring.visible = false;
    const par = k === 'pc' ? this.app.camera : this.app.player.hands[k]; par.add(t.g); t.g.visible = true;
    if (k === 'pc') { t.g.position.set(0.2, -0.2, -0.5); t.g.rotation.set(0.3, 0.5, 0.2); } else { t.g.position.set(0, -0.04, -0.06); t.g.rotation.set(0, Math.PI / 2, 0); }
    this.beep(740, 0.08, 0.15); if (sl) return;
    this.toast(L({ it: 'Sigillo integro. Ora riponila in uno slot della cintura', en: 'Seal intact. Now put it in a belt holder' }), 4);
  }
  stow(t, sl, kind) {
    for (const k in this.held) if (this.held[k] === t) delete this.held[k];
    sl.tube = t; t.st = kind; sl.o.add(t.g); t.g.position.set(0, 0.035, 0); t.g.rotation.set(0, 0, Math.PI / 2); t.ring.visible = false;
    if (kind === 'belt') { this.beep(880, 0.1, 0.2); if (!t.seen) { t.seen = true; this.collect(t); } else this.toast(L({ it: `Nella cintura (${this.inBelt}/${CAP})`, en: `In the belt (${this.inBelt}/${CAP})` }), 3); }
    else { this.beep(990, 0.15, 0.2); setTimeout(() => this.beep(1320, 0.15, 0.2), 120); if (this.stored === 10) this.finish(); else this.toast(L({ it: `${this.stored} provette nel contenitore di rientro: ne mancano ${10 - this.stored}`, en: `${this.stored} tubes in the return canister: ${10 - this.stored} to go` }), 5); }
  }
  drop(t, k) {   // let go away from any holder: it falls to the ground (indoors it goes back to the belt so it is never lost)
    const p = k === 'pc' ? this.app.player.head() : this.handPos(k), h = this.app.player.head();
    if (this.app.habitat.indoors(h.x, h.z)) { const sl = this.bslots.find(s => !s.tube); if (sl) return this.stow(t, sl, 'belt'); const r = this.rslots.find(s => !s.tube); if (r) return this.stow(t, r, 'stored'); }
    delete this.held[k]; t.st = 'ground'; this.g.add(t.g); t.x = p.x; t.z = p.z; t.g.position.set(p.x, (this.app.ground(p.x, p.z) ?? 0) + 0.025, p.z); t.g.rotation.set(0, 0, 0);
    this.toast(L({ it: 'Provetta caduta a terra: raccoglila di nuovo', en: 'Tube dropped: pick it up again' }), 3);
  }
  nearRack() { const h = this.app.player.head(), p = this.rack.getWorldPosition(new THREE.Vector3()); return Math.hypot(p.x - h.x, p.z - h.z) < 1.8; }
  // PC fallback: one press picks up, the next one stows (belt outside, canister at the workbench)
  pcAction() {
    if (!this.active || this.done) return false; const t = this.held.pc, h = this.app.player.head();
    if (t) { const r = this.nearRack() && this.rslots.find(s => !s.tube), b = this.bslots.find(s => !s.tube); if (r) this.stow(t, r, 'stored'); else if (b) this.stow(t, b, 'belt'); return true; }
    if (this.nearRack()) { const sl = this.bslots.find(s => s.tube); if (sl) { this.grab(sl.tube, 'pc', sl); return true; } }
    const n = this.nearest(h); if (n && n.d < PICK && this.inBelt < CAP) { this.grab(n.t, 'pc'); return true; }
    return false;
  }
  toast(msg, s = 3) { this.msg = msg; this.msgT = s; }
  beep(f, d = 0.07, v = 0.15) { const ctx = this.app.ambience?.ctx; if (!ctx) return; const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime; o.frequency.value = f; o.type = 'sine'; g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d); o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + d + 0.02); }
  update(dt) {
    if (!this.active) return; const app = this.app, h = app.player.head(); if (app.hud) app.hud.panel.mesh.visible = false;
    const xr = app.renderer.xr.isPresenting, m = this.panel.mesh; if (xr) { m.scale.setScalar(0.42); m.position.set(-0.3, -0.33, -0.95); m.rotation.set(-0.45, 0.32, 0); } else { m.scale.setScalar(0.7); m.position.set(0.5, 0.3, -1.25); m.rotation.set(0, -0.2, 0); }
    if (!app.habitat.indoors(h.x, h.z)) this.out = true;   // the clock starts at the airlock, so reading the briefing is free
    if (!this.done && this.out) { this.t += dt; if (this.prev) this.walk += Math.hypot(h.x - this.prev.x, h.z - this.prev.z); } this.prev = { x: h.x, z: h.z };
    const n = this.nearest(h);
    for (const t of this.tubes) if (t.st === 'ground') { const d = Math.hypot(t.x - h.x, t.z - h.z); t.ring.visible = d < GLOW; t.ring.material.opacity = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(this.t * 5)); t.ring.material.color.setHex(n && t === n.t && n.d < PICK ? (this.carried < CAP ? 0x59ff9a : 0xff5050) : 0xffd166); }
    if (this.brief.mesh.visible && !app.habitat.indoors(h.x, h.z) && !this.done) this.brief.mesh.visible = false;
    if (this.beacon) this.beacon.visible = this.count === 0 && !this.done;
    // scanner beeps: faster and higher when close
    if (n && n.d < 40 && !this.done) { this.bT = (this.bT || 0) - dt; if (this.bT <= 0) { this.beep(n.d < PICK ? 1320 : 660 + (40 - n.d) * 12); this.bT = Math.max(0.12, n.d / 18); } }
    // pick up: hold the trigger (E or mouse on a PC) within reach
    const full = this.inBelt >= CAP; if (n && n.d < PICK && full && !this.done && !(this.msgT > 0)) this.toast(L({ it: 'Cintura piena: porta le provette al contenitore sul banco della base', en: 'Belt full: take the tubes to the canister on the base workbench' }), 4);
    // the belt follows the waist, turning with the body (smoothed head yaw)
    { let d = app.player.headYaw() - this.by; d = Math.atan2(Math.sin(d), Math.cos(d)); this.by += d * Math.min(1, dt * (Math.abs(d) > 0.6 ? 4 : 1)); this.belt.position.set(h.x, h.y - (xr ? 0.62 : 0.78), h.z); this.belt.rotation.y = this.by; }
    // VR hands: trigger grabs, letting go over a holder stows the tube
    if (xr && !this.done) for (const k of ['left', 'right']) { const on = !!app.player._pad(k)?.trigger, was = this.trig[k]; this.trig[k] = on; const p = this.handPos(k); if (!p) continue;
      if (on && !was && !this.held[k]) { const g = this.target(k); if (g) this.grab(g.t, k, g.sl); }
      else if (!on && was && this.held[k]) { const t = this.held[k], r = this.freeNear(this.rslots, p, 0.14), b = this.freeNear(this.bslots, p, 0.14); if (r) this.stow(t, r, 'stored'); else if (b) this.stow(t, b, 'belt'); else this.drop(t, k); } }
    // holders light up green where a held tube can go
    { const hp = ['left', 'right'].filter(k => this.held[k]).map(k => this.handPos(k)).filter(Boolean), pc = this.held.pc, nr = pc && this.nearRack();
      for (const sl of this.bslots) sl.ring.material.opacity = !sl.tube && (pc && !nr || hp.some(p => this.slotPos(sl).distanceTo(p) < 0.25)) ? 0.9 : sl.tube ? 0 : 0.25;
      for (const sl of this.rslots) sl.ring.material.opacity = !sl.tube && (nr || hp.some(p => this.slotPos(sl).distanceTo(p) < 0.3)) ? 0.9 : sl.tube ? 0 : (this.carried ? 0.3 : 0); }
    if (this.msgT > 0) this.msgT -= dt; if (this.cardT > 0 && (this.cardT -= dt) <= 0) this.card.mesh.visible = false;
    if ((this._a = (this._a || 0) + dt) > 0.15 || this.hold > 0) { this._a = 0; this.draw(n, h); }
  }
  collect(t) {
    setTimeout(() => this.beep(1320, 0.18, 0.2), 120); this.last = t;
    const c = this.tubes.filter(u => u.seen).length; this.toast(this.inBelt >= CAP || c === 10 ? L({ it: 'Cintura piena: porta le provette al contenitore sul banco della base', en: 'Belt full: take the tubes to the canister on the base workbench' }) : L({ it: `Provetta nella cintura (${this.inBelt}/${CAP})`, en: `Tube in the belt (${this.inBelt}/${CAP})` }), 4);
    const app = this.app, h = app.player.head(), a = app.player.headYaw() - 0.35, ux = -Math.sin(a), uz = -Math.cos(a), cm = this.card.mesh; cm.position.set(h.x + ux * 1.6, h.y - 0.1, h.z + uz * 1.6); cm.rotation.set(0, Math.atan2(-ux, -uz), 0); cm.visible = true; this.cardT = 7;
    this.card.draw((cv, W, H) => { rrect(cv, 4, 4, W - 8, H - 8, 22); cv.fillStyle = 'rgba(14,10,8,0.95)'; cv.fill(); cv.lineWidth = 5; cv.strokeStyle = '#ffd166'; cv.stroke();
      text(cv, L({ it: `PROVETTA ${c} DI 10`, en: `TUBE ${c} OF 10` }), 28, 50, 22, '#ffd166', 700); text(cv, L({ it: `lasciata al sol ${t.sol}`, en: `dropped on sol ${t.sol}` }), W - 28, 50, 20, '#d9c4b2', 500, 'right');
      text(cv, `«${t.name}»`, 28, 108, 44, '#fff', 700); wrap(cv, L(CONTENT[t.name] || { it: '', en: '' }), 28, 158, W - 56, 26, 34, '#f2e9e1');
      text(cv, L({ it: 'Deposito di Three Forks · posizione del rover in quel sol', en: 'Three Forks depot · rover position on that sol' }), 28, H - 26, 17, '#a8988a', 400); });
  }
  finish() {
    this.done = true; const stars = this.t < 720 ? 3 : this.t < 1080 ? 2 : 1; this.stars = stars; this.beep(660, 0.2); setTimeout(() => this.beep(990, 0.3), 200);
    this.toast(L({ it: 'Missione compiuta! Y (R sulla tastiera) per tornare al menu', en: 'Mission accomplished! Y (R on the keyboard) for the menu' }), 999);
    const app = this.app, h = app.player.head(), a = app.player.headYaw(), ux = -Math.sin(a), uz = -Math.cos(a), bm = this.brief.mesh; bm.position.set(h.x + ux * 2.3, h.y + 0.2, h.z + uz * 2.3); bm.rotation.set(0, Math.atan2(-ux, -uz), 0); bm.visible = true; this.drawBrief(true);
  }
  drawBrief(end) {
    const g = this, para = (c, s, y, W, sz = 24, col = '#f2e9e1') => s.split('\n').reduce((yy, line) => wrap(c, line, 34, yy, W - 68, sz, sz * 1.32, col), y);
    this.brief.draw((c, W, H) => { rrect(c, 4, 4, W - 8, H - 8, 26); c.fillStyle = 'rgba(14,10,8,0.95)'; c.fill(); c.lineWidth = 5; c.strokeStyle = '#ffd166'; c.stroke();
      text(c, L(end ? { it: 'MISSIONE COMPIUTA', en: 'MISSION ACCOMPLISHED' } : { it: 'OPERAZIONE DEPOSITO', en: 'OPERATION DEPOT' }), 34, 62, 38, '#ffd166', 700);
      let y = 108;
      if (!end) {
        y = para(c, L({ it: 'Tra dicembre 2022 e gennaio 2023 Perseverance ha lasciato 10 provette sigillate sul terreno di Three Forks, a 150 m da qui: rocce, sabbia, aria marziana e una provetta testimone. È la copia di riserva dei campioni da riportare sulla Terra.', en: 'Between December 2022 and January 2023 Perseverance left 10 sealed tubes on the ground at Three Forks, 150 m from here: rocks, sand, Martian air and a witness tube. They are the backup set of the samples meant to come back to Earth.' }), y, W);
        y = para(c, L({ it: 'Il tuo compito: recuperarle tutte e metterle nel contenitore di rientro sul banco della base.', en: 'Your job: recover all of them and put them in the return canister on the base workbench.' }), y + 10, W, 26, '#fff');
        y = para(c, L({ it: '• Il raggio dorato segna il deposito. Lo scanner sul visore indica la provetta più vicina e suona più veloce quando ti avvicini.\n• Chinati e afferra la provetta col grilletto, poi lasciala sopra uno slot della cintura (al PC: E per raccoglierla, E di nuovo per riporla).\n• La cintura ha 5 posti: servono due viaggi. Le provette contano solo quando le metti a mano nel contenitore di rientro sul banco della base.\n• Le pendenze ti rallentano e la tuta consuma ossigeno come nella missione vera.', en: '• The gold beam marks the depot. The scanner on your visor points to the nearest tube and beeps faster as you get closer.\n• Bend down and grab the tube with the trigger, then let go over a belt holder (on PC: E to pick it up, E again to stow it).\n• The belt holds 5: it takes two trips. Tubes only count once you place them by hand in the return canister on the base workbench.\n• Slopes slow you down and the suit uses oxygen as in the real mission.' }), y + 12, W, 22, '#d9c4b2');
        para(c, L({ it: 'Obiettivo: tutte e 10 in meno di 12 minuti per 3 stelle. Esci dall\'airlock per cominciare.', en: 'Target: all 10 in under 12 minutes for 3 stars. Leave through the airlock to begin.' }), y + 12, W, 24, '#ffd166');
      } else {
        text(c, '★'.repeat(g.stars) + '☆'.repeat(3 - g.stars), 34, y + 20, 56, '#ffd166', 700);
        y = para(c, L({ it: `10 provette recuperate in ${fmt(g.t)}, ${Math.round(g.walk)} m percorsi a piedi.`, en: `10 tubes recovered in ${fmt(g.t)}, ${Math.round(g.walk)} m on foot.` }), y + 64, W, 28, '#fff');
        y = para(c, L({ it: 'Nella realtà questo lavoro toccherà a una missione robotica di rientro dei campioni, il cui progetto è ancora in discussione. Un astronauta lo farebbe in un pomeriggio: è uno dei motivi per cui si studiano le missioni umane su Marte.', en: 'In reality this job falls to a robotic sample return mission, whose design is still being debated. An astronaut could do it in an afternoon: one of the reasons human missions to Mars are being studied.' }), y + 14, W, 22, '#d9c4b2');
        para(c, L({ it: '3 stelle: sotto 12 min · 2 stelle: sotto 18 min · 1 stella: completata. Y (R) per il menu.', en: '3 stars: under 12 min · 2 stars: under 18 min · 1 star: completed. Y (R) for the menu.' }), y + 16, W, 20, '#a8988a');
      }
    });
  }
  draw(n, h) {
    const app = this.app; this.panel.draw((c, W, H) => {
      rrect(c, 4, 4, W - 8, H - 8, 24); c.fillStyle = 'rgba(14,10,8,0.82)'; c.fill(); c.lineWidth = 4; c.strokeStyle = '#ffd166'; c.stroke();
      text(c, L({ it: 'OPERAZIONE DEPOSITO', en: 'OPERATION DEPOT' }), 26, 44, 22, '#ffd166', 700); text(c, fmt(this.t), W - 26, 44, 26, '#fff', 700, 'right');
      // ten tube slots
      for (let i = 0; i < 10; i++) { const x = 26 + i * 40; rrect(c, x, 64, 32, 56, 8); c.fillStyle = i < this.stored ? '#ffd166' : i < this.count ? '#7fe0ff' : 'rgba(255,255,255,0.12)'; c.fill(); }
      text(c, `${this.stored}/10`, 436, 92, 32, '#fff', 700); text(c, L({ it: `cintura ${this.inBelt}/${CAP}`, en: `belt ${this.inBelt}/${CAP}` }), 436, 118, 18, '#7fe0ff', 600);
      const st = app.mission.state(h); text(c, `O₂ ${Math.round(st.o2Frac * 100)}%`, W - 120, 44, 22, st.o2Frac > 0.3 ? '#59ff9a' : '#ff5050', 700, 'right');
      if (this.done) { text(c, this.count === 10 ? '★'.repeat(this.stars) + '☆'.repeat(3 - this.stars) : L({ it: 'consegna parziale', en: 'partial delivery' }), W - 26, 104, 34, '#ffd166', 700, 'right');
        text(c, L({ it: `${this.count} provette in ${fmt(this.t)} · ${Math.round(this.walk)} m a piedi`, en: `${this.count} tubes in ${fmt(this.t)} · ${Math.round(this.walk)} m walked` }), 26, 160, 24, '#f2e9e1', 600); }
      else if (n) { // scanner: arrow towards the nearest tube, relative to where the head points
        const dx = n.t.x - h.x, dz = n.t.z - h.z, ang = Math.atan2(-dx, -dz) - app.player.headYaw(), cx = W - 50, cy = 96;
        c.save(); c.translate(cx, cy); c.rotate(-ang); c.fillStyle = n.d < PICK ? '#59ff9a' : '#7fe0ff'; c.beginPath(); c.moveTo(0, -26); c.lineTo(17, 18); c.lineTo(0, 9); c.lineTo(-17, 18); c.closePath(); c.fill(); c.restore();
        text(c, this.held.pc || this.held.left || this.held.right ? (this.nearRack() ? L({ it: 'Mettila nel contenitore (E / grilletto)', en: 'Place it in the canister (E / trigger)' }) : L({ it: 'Riponila nella cintura (E / grilletto)', en: 'Stow it in the belt (E / trigger)' })) : this.inBelt >= CAP || (this.carried && this.nearRack()) ? L({ it: this.nearRack() ? 'Metti le provette nel contenitore' : 'Cintura piena: vai al banco della base', en: this.nearRack() ? 'Put the tubes in the canister' : 'Belt full: go to the base workbench' }) : n.d < PICK ? L({ it: 'Afferra la provetta (grilletto / E)', en: 'Grab the tube (trigger / E)' }) : L({ it: `Provetta più vicina: ${n.d < 1000 ? Math.round(n.d) + ' m' : (n.d / 1000).toFixed(1) + ' km'}`, en: `Nearest tube: ${n.d < 1000 ? Math.round(n.d) + ' m' : (n.d / 1000).toFixed(1) + ' km'}` }), 26, 160, 24, n.d < PICK ? '#59ff9a' : '#f2e9e1', 600);
        if (this.hold > 0) { rrect(c, 26, 176, (W - 52) * Math.min(1, this.hold / HOLD), 10, 5); c.fillStyle = '#59ff9a'; c.fill(); } }
      else { text(c, L(this.nearRack() ? { it: 'Metti le provette nel contenitore', en: 'Put the tubes in the canister' } : { it: 'Porta le provette al contenitore sul banco della base', en: 'Take the tubes to the canister on the base workbench' }), 26, 160, 24, '#59ff9a', 600); }
      if (this.msgT > 0 && this.msg) text(c, this.msg, 26, 200, 20, '#ffd166', 600);
    });
  }
}
