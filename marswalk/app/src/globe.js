// A Mars globe in the habitat: real global colour mosaic (Viking MDIM 2.1 via NASA Mars Trek), Jezero marked on it.
// Grab it with a grip button, use both hands to stretch or shrink it. On a PC: G picks it up, + and − resize it.
import * as THREE from 'three';
import { Panel, rrect, text } from './ui.js';
import { T, num, lang } from './i18n.js';
import { NAMES } from './globe-names.js';
const R0 = 0.2, MARS_R = 3389500, v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
export class Globe {
  constructor(app, url, x, y, z) {
    this.app = app; this.home = new THREE.Vector3(x, y, z); const g = this.g = new THREE.Group(); g.position.copy(this.home); app.scene.add(g);
    const tex = new THREE.TextureLoader().load(url); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(R0, 48, 32), new THREE.MeshBasicMaterial({ map: tex })); g.add(this.ball);
    // Jezero: a pin and a ring at the site's real latitude and longitude
    const s = app.site, la = s.lat0 * Math.PI / 180, lo = s.lon0 * Math.PI / 180, n = new THREE.Vector3(Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo));
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.009, 0.014, 24), new THREE.MeshBasicMaterial({ color: 0x33e6ff, side: THREE.DoubleSide })); ring.position.copy(n).multiplyScalar(R0 * 1.004); ring.lookAt(n.clone().multiplyScalar(2)); this.ball.add(ring);
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.05, 6).translate(0, 0.025, 0), new THREE.MeshBasicMaterial({ color: 0x33e6ff })); pin.position.copy(n).multiplyScalar(R0); pin.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n); this.ball.add(pin);
    this.pinTag = new Panel(0.11, 0.03, 256 / 0.11, { depthTest: true }); this.pinTag.mesh.position.copy(n).multiplyScalar(R0 + 0.066); this.ball.add(this.pinTag.mesh);
    // place names on a transparent shell just above the surface; more of them appear as the globe is enlarged
    this.nc = document.createElement('canvas'); this.nc.width = 4096; this.nc.height = 2048; this.ntex = new THREE.CanvasTexture(this.nc); this.ntex.colorSpace = THREE.SRGBColorSpace; this.ntex.anisotropy = 8;
    this.names = new THREE.Mesh(new THREE.SphereGeometry(R0 * 1.004, 64, 40), new THREE.MeshBasicMaterial({ map: this.ntex, transparent: true, depthWrite: false })); this.ball.add(this.names); this.stage = 0;
    this.tag = new Panel(0.3, 0.045, 600 / 0.3, { depthTest: true }); g.add(this.tag.mesh);
    this.ball.rotation.y = -lo - Math.PI / 2 + 0.5; this.grab = {}; this.near = {}; this._g = {}; this.held = false; this.touched = false; this.two = null; this.scale = 1; this.label(); this.drawNames(true);
    addEventListener('keydown', e => { if (app.renderer.xr.isPresenting) return; if (e.code === 'KeyG') this.deskHold(!this.held); if (e.code === 'Equal' || e.code === 'NumpadAdd' || e.key === '+') this.setScale(this.scale * 1.15); if (e.code === 'Minus' || e.code === 'NumpadSubtract' || e.key === '-') this.setScale(this.scale / 1.15); });
    addEventListener('wheel', e => { if (this.held && !app.renderer.xr.isPresenting) this.setScale(this.scale * (e.deltaY < 0 ? 1.1 : 1 / 1.1)); }, { passive: true });
  }
  label() { this.pinTag.draw((c, W, H) => { rrect(c, 1, 1, W - 2, H - 2, 14); c.fillStyle = 'rgba(14,9,6,0.85)'; c.fill(); text(c, T('Cratere Jezero'), W / 2, H * 0.7, 30, '#7fe0ff', 700, 'center'); });
    this.tag.draw((c, W, H) => { rrect(c, 2, 2, W - 4, H - 4, 20); c.fillStyle = 'rgba(14,9,6,0.8)'; c.fill(); text(c, T`Marte · scala 1:${num(MARS_R / (R0 * this.scale) / 1e6, 1)} milioni`, W / 2, H * 0.68, 40, '#fff', 600, 'center'); }); }
  setScale(s) { this.scale = Math.max(0.35, Math.min(7, s)); this.ball.scale.setScalar(this.scale); this.pinTag.mesh.scale.setScalar(1 / this.scale); this.pinTag.mesh.position.setLength(R0 + 0.066 / this.scale); this.label(); this.drawNames(); }
  drawNames(force) {   // three levels of detail, each drawn with a smaller font so labels keep about the same size in the room
    const st = this.scale < 1.7 ? 1 : this.scale < 3.4 ? 2 : 3; if (st === this.stage && !force) return; this.stage = st;
    const c = this.nc.getContext('2d'), W = this.nc.width, H = this.nc.height, size = [[60], [40, 28], [28, 20, 16]][st - 1]; c.clearRect(0, 0, W, H);
    const col = { r: '#ffe2c4', m: '#ffd27a', c: '#ffffff', v: '#ffc09a', s: '#7fe0ff' };
    for (const [n, la, lo, lv, k] of NAMES) { if (lv > st) continue; const name = typeof n === 'string' ? n : n[lang.cur] ?? n.it, px = size[lv - 1], x = (lo + 180) / 360 * W, y = (90 - la) / 180 * H, sx = 1 / Math.max(0.25, Math.cos(la * Math.PI / 180));
      for (const ox of [0, -W, W]) { const X = x + ox; if (X < -600 || X > W + 600) continue; c.save(); c.translate(X, y); c.scale(sx, 1);
        const dot = k !== 'r'; if (dot) { c.fillStyle = col[k]; c.strokeStyle = 'rgba(0,0,0,0.8)'; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, Math.max(4, px * 0.18), 0, 7); c.fill(); c.stroke(); }
        c.font = `${lv === 1 ? 700 : 600} ${px}px system-ui, sans-serif`; c.textAlign = dot ? 'left' : 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
        c.lineWidth = Math.max(3, px * 0.18); c.strokeStyle = 'rgba(10,6,4,0.85)'; const tx = dot ? px * 0.4 : 0; c.strokeText(name, tx, 0); c.fillStyle = col[k]; c.fillText(name, tx, 0); c.restore(); } }
    this.ntex.needsUpdate = true; }
  deskHold(on) { const cam = this.app.camera; this.held = on; this.touched = true; if (on) { cam.add(this.g); this.g.position.set(0.0, -0.05, -0.75); this.g.rotation.set(0, 0, 0); } else { this.app.scene.attach(this.g); } }
  reset() { if (this.held) this.deskHold(false); this.app.scene.attach(this.g); this.g.position.copy(this.home); this.g.rotation.set(0, 0, 0); this.grab = {}; this.two = null; this.touched = false; this.setScale(1); }
  busy(hand) { return !!(this.near[hand] || this.grab[hand]); }
  update(dt, cam) {
    const { app, g } = this, xr = app.renderer.xr.isPresenting, hands = app.player.hands, c0 = g.getWorldPosition(v1).clone(), reach = R0 * this.scale + 0.12;
    if (xr) {
      for (const h of ['left', 'right']) { const c = hands[h], grip = !!c?.userData.src?.gamepad?.buttons[1]?.pressed; this.near[h] = !!c && c.getWorldPosition(v2).distanceTo(c0) < reach;
        if (grip && !this._g[h] && this.near[h]) { this.grab[h] = true; this.touched = true; } if (!grip) this.grab[h] = false; this._g[h] = grip; }
      const L = this.grab.left && hands.left, Rr = this.grab.right && hands.right;
      if (L && Rr) { const a = L.getWorldPosition(new THREE.Vector3()), b = Rr.getWorldPosition(new THREE.Vector3()), d = Math.max(0.05, a.distanceTo(b));
        if (!this.two) { app.scene.attach(g); this.two = { d, s: this.scale }; } g.position.copy(a).add(b).multiplyScalar(0.5); const s = this.two.s * d / this.two.d; if (Math.abs(s - this.scale) > 0.01) this.setScale(s); }
      else { this.two = null; const one = L || Rr; if (one) { if (g.parent !== one) one.attach(g); } else if (g.parent !== app.scene) app.scene.attach(g); }
    }
    if (!this.touched) this.ball.rotation.y += dt * 0.12;
    // caption under the globe, always facing the viewer
    const t = this.tag.mesh; t.position.set(0, -R0 * this.scale - 0.06, 0); g.updateMatrixWorld(true); t.lookAt(cam); this.pinTag.mesh.lookAt(cam);
  }
}
