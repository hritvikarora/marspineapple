// Start menu on the habitat wall: language and comfort settings, then "start the mission" opens the airlock.
// In the headset you point a controller and pull the trigger; on a PC you click (or press Enter to start).
import * as THREE from 'three';
import { Panel, rrect, text, wrap } from './ui.js';
import { T, lang } from './i18n.js';
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), q1 = new THREE.Quaternion();
export class Menu {
  constructor(app, parent) {
    this.app = app; this.open = true; this.hover = null; this.mouse = new THREE.Vector2(); this.ray = new THREE.Raycaster(); this.set = { helmet: true, rover: true, quick: false };
    this.panel = new Panel(1.9, 1.45, 1216 / 1.9, { depthTest: true }); const m = this.panel.mesh; m.position.set(0, 1.5, -1.9); m.renderOrder = 120; parent.add(m);
    this.dot = new THREE.Mesh(new THREE.CircleGeometry(0.012, 16), new THREE.MeshBasicMaterial({ color: 0x7fe0ff, depthTest: false })); this.dot.renderOrder = 121; this.dot.visible = false; m.add(this.dot);
    const row = (y, key, opts) => opts.map((o, i) => ({ x: 520 + i * 320, y, w: 296, h: 76, key, ...o }));
    this.buttons = [
      ...row(196, 'lang', [{ label: () => 'Italiano', on: () => lang.cur === 'it', act: () => app.setLang('it') }, { label: () => 'English', on: () => lang.cur === 'en', act: () => app.setLang('en') }]),
      ...row(294, 'helmet', [{ label: () => T('sì'), on: () => this.set.helmet, act: () => this.apply({ helmet: true }) }, { label: () => T('no'), on: () => !this.set.helmet, act: () => this.apply({ helmet: false }) }]),
      ...row(392, 'rover', [{ label: () => T('sì'), on: () => this.set.rover, act: () => this.apply({ rover: true }) }, { label: () => T('no'), on: () => !this.set.rover, act: () => this.apply({ rover: false }) }]),
      ...row(490, 'quick', [{ label: () => T('realistica'), on: () => !this.set.quick, act: () => this.apply({ quick: false }) }, { label: () => T('rapida'), on: () => this.set.quick, act: () => this.apply({ quick: true }) }]),
      { x: 520, y: 588, w: 616, h: 76, key: 'vol', slider: true, label: () => '', on: () => false, act: () => this.setVol((this.hx - 520) / 616) },
      { x: 58, y: 698, w: 356, h: 96, key: 'start', primary: true, label: () => T('INIZIA LA MISSIONE'), on: () => false, act: () => app.start() },
      { x: 430, y: 698, w: 356, h: 96, key: 'game', primary: true, game: true, label: () => T('RECUPERO CAMPIONI'), on: () => false, act: () => app.startGame() },
      { x: 802, y: 698, w: 356, h: 96, key: 'data', primary: true, alt: true, label: () => T('SOLO DATI'), on: () => false, act: () => app.explore() },
    ];
    try { const v = parseFloat(localStorage.getItem('marswalk.vol')); if (v >= 0 && v <= 1) this.set.vol = v; } catch (e) { }
    this.set.vol ??= 0.6; app.ambience?.setVolume(this.set.vol); this.draw();
  }
  // volume of the Mars wind recordings: click or point anywhere on the bar
  setVol(v) { v = Math.round(Math.max(0, Math.min(1, v)) * 20) / 20; this.set.vol = v; this.app.ambience?.setVolume(v); try { localStorage.setItem('marswalk.vol', v); } catch (e) { } this.draw(); }
  apply(s) { Object.assign(this.set, s); const a = this.app; if (a.helmet) a.helmet.off = !this.set.helmet; if (a.rover) a.rover.off = !this.set.rover; a.player.walkSpeed = this.set.quick ? 3.0 : 1.6; this.draw(); }
  show(on) { this.open = on; this.panel.mesh.visible = on; if (this.app.hud) this.app.hud.panel.mesh.visible = !on;   // the helmet readout would cover the buttons
    this.hover = null; this.dot.visible = false; if (on) this.draw(); }
  draw() {
    this.panel.draw((c, W, H) => {
      rrect(c, 4, 4, W - 8, H - 8, 30); c.fillStyle = 'rgba(14,9,6,0.94)'; c.fill(); c.lineWidth = 4; c.strokeStyle = '#ffb37a'; c.stroke();
      text(c, 'MARSWALK', 56, 96, 64, '#fff', 700); text(c, T("Prova generale di un'uscita a piedi su Marte"), 58, 138, 25, '#d9c4b2');
      text(c, 'NASA Space Apps 2026', W - 56, 96, 22, '#ffb37a', 600, 'right');
      for (const [y, k] of [[196, 'LINGUA'], [294, 'CASCO'], [392, 'ROVER COMPAGNO'], [490, 'ANDATURA'], [588, 'SUONI DI MARTE']]) text(c, T(k), 58, y + 48, 26, '#ffb37a', 700);
      for (const b of this.buttons) { const on = b.on(), hov = this.hover === b; if (b.slider) { const v = this.set.vol, cy = b.y + b.h / 2; rrect(c, b.x, cy - 9, b.w - 120, 18, 9); c.fillStyle = 'rgba(255,255,255,0.15)'; c.fill(); rrect(c, b.x, cy - 9, Math.max(18, (b.w - 120) * v), 18, 9); c.fillStyle = '#7fe0ff'; c.fill();
          c.beginPath(); c.arc(b.x + (b.w - 120) * v, cy, hov ? 24 : 20, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); text(c, v ? Math.round(v * 100) + '%' : T('muto'), b.x + b.w, cy + 11, 30, '#fff', 700, 'right'); continue; }
        rrect(c, b.x, b.y, b.w, b.h, 18);
        c.fillStyle = b.game ? (hov ? '#ffe39a' : '#ffd166') : b.alt ? (hov ? '#b3efff' : '#7fe0ff') : b.primary ? (hov ? '#ffb37a' : '#ff9a52') : on ? '#7fe0ff' : hov ? 'rgba(127,224,255,0.3)' : 'rgba(255,255,255,0.1)'; c.fill(); if (hov) { c.lineWidth = 4; c.strokeStyle = '#fff'; c.stroke(); }
        text(c, b.label(), b.x + b.w / 2, b.y + b.h / 2 + (b.primary ? 10 : 11), b.primary ? 26 : 30, b.primary || on ? '#1a0f0a' : '#fff', 700, 'center'); }
      let y = wrap(c, T("Missione: esci dall'airlock, segui la linea azzurra e rientra nella base. Recupero campioni: recupera le 10 provette lasciate da Perseverance a Three Forks. Solo dati: sala con cartine, foto e documentazione.") + ' ' + T('A sinistra: il globo di Marte. Prendilo con il grilletto laterale, con due mani lo ingrandisci.'), 58, 840, W - 116, 22, 29, '#fff');
      text(c, T('Punta e premi il grilletto · al PC clic del mouse o Invio'), W / 2, H - 26, 20, '#d9c4b2', 400, 'center');
    });
  }
  _cast(origin, dir) {   // -> { b, d, uv } for a ray in world space
    this.ray.set(origin, dir); const h = this.ray.intersectObject(this.panel.mesh, false)[0]; if (!h || h.distance > 8) return null;
    const px = h.uv.x * this.panel.canvas.width, py = (1 - h.uv.y) * this.panel.canvas.height;
    this.hx = px; return { b: this.buttons.find(b => px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) || null, d: h.distance, p: h.point };
  }
  update() {
    if (!this.open) return; const { app } = this, xr = app.renderer.xr.isPresenting; let best = null;
    if (xr) { for (const hand of ['right', 'left']) { const c = app.player.hands[hand]; if (!c) continue; c.getWorldPosition(v1); c.getWorldQuaternion(q1); const h = this._cast(v1, v2.set(0, 0, -1).applyQuaternion(q1));
        const line = c.getObjectByName('ray'); if (line) line.scale.z = h ? h.d : 0.25; if (h && (!best || h.b && !best.b)) best = h; } }
    else { if (document.pointerLockElement) this.mouse.set(0, 0); this.ray.setFromCamera(this.mouse, app.camera); best = this._cast(this.ray.ray.origin.clone(), this.ray.ray.direction.clone()); }
    this.dot.visible = !!best; if (best) { this.panel.mesh.worldToLocal(v1.copy(best.p)); this.dot.position.set(v1.x, v1.y, 0.004); }
    const b = best ? best.b : null; if (b !== this.hover) { this.hover = b; this.draw(); }
  }
  click() { if (!this.open || !this.hover) return false; this.hover.act(); return true; }
  close() { for (const hand of ['right', 'left']) { const l = this.app.player.hands[hand]?.getObjectByName('ray'); if (l) l.scale.z = 0.25; } this.show(false); }
}
