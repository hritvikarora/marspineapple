// Display on the astronaut's right forearm: closed it is a small tile, opened it becomes a dashboard with a live map,
// position, surface readings, weather and the list of stops.
import * as THREE from 'three';
import { Panel, rrect, text, fmtDist } from './ui.js';
import { T, num } from './i18n.js';
const R2D = 180 / Math.PI;
export class ArmDisplay {
  constructor(app, base) {
    this.app = app; this.open = false; this.acc = 1;
    this.panel = new Panel(0.39, 0.26, 1200 / 0.39, { depthTest: false }); this.panel.mesh.renderOrder = 210;
    this.tile = new Panel(0.09, 0.05, 360 / 0.09, { depthTest: false }); this.tile.mesh.renderOrder = 210;
    this.drawTile = () => this.tile.draw((c, W, H) => { rrect(c, 3, 3, W - 6, H - 6, 22); c.fillStyle = 'rgba(14,9,6,0.9)'; c.fill(); c.lineWidth = 4; c.strokeStyle = '#7fe0ff'; c.stroke();
      text(c, 'DISPLAY', W / 2, 84, 54, '#7fe0ff', 700, 'center'); text(c, T('grilletto laterale'), W / 2, 136, 30, '#d9c4b2', 500, 'center'); text(c, T('o tasto I per aprire'), W / 2, 172, 30, '#d9c4b2', 500, 'center'); }); this.drawTile();
    this.root = new THREE.Group(); this.root.add(this.panel.mesh, this.tile.mesh); this.panel.mesh.visible = false;
    const s = app.site, mid = s.rings.find(r => r.name === 'mid'), H = s.rings[0].half; this.H = H;
    // map background: the orbital image of the walking area, cropped once from the context mosaic
    const im = new Image(); im.onload = () => { const cv = document.createElement('canvas'); cv.width = cv.height = 560; const k = im.width / (2 * mid.half);
      cv.getContext('2d').drawImage(im, (mid.half - H) * k, (mid.half - H) * k, 2 * H * k, 2 * H * k, 0, 0, 560, 560); this.bg = cv; this.acc = 1; }; im.src = `${base}mid_ortho_0_0.jpg`;
  }
  toggle() { this.open = !this.open; this.panel.mesh.visible = this.open; this.tile.mesh.visible = !this.open; this.acc = 1; }
  place() {
    const { app } = this, xr = app.renderer.xr.isPresenting, hand = app.player.hands.right, parent = xr ? hand : app.camera;
    if (!parent) { this.root.visible = false; return; } this.root.visible = true;
    if (this.root.parent !== parent) { parent.add(this.root);
      if (xr) { this.root.position.set(0, 0.03, 0.09); this.root.rotation.set(-0.9, 0, 0); this.root.scale.setScalar(1); this.panel.mesh.position.set(0, 0.15, 0); this.tile.mesh.position.set(0, 0.03, 0); }
      else { this.root.position.set(0.55, 0.14, -1.0); this.root.rotation.set(0, -0.25, 0); this.root.scale.setScalar(2.1); this.panel.mesh.position.set(0, 0, 0); this.tile.mesh.position.set(0.12, -0.2, 0); } }
  }
  update(dt) {
    this.place(); if (!this.open || !this.root.visible) return; this.acc += dt; if (this.acc < 0.4) return; this.acc = 0;
    const { app, H } = this, s = app.site, m = app.mission, pos = app.player.head(), yaw = app.player.headYaw(), x = pos.x, y = -pos.z, g = app.ground(pos.x, pos.z);
    const lat = s.lat0 + y / s.radius * R2D, lon = s.lon0 + x / (s.radius * Math.cos(s.lat0 / R2D)) * R2D, elev = g == null ? null : g + app.h0, slope = app.slope(pos.x, pos.z), w = s.weather, L = app.LAYERS[app.layer];
    
    this.panel.draw((c, W, Hh) => {
      rrect(c, 4, 4, W - 8, Hh - 8, 30); c.fillStyle = 'rgba(12,8,6,0.94)'; c.fill(); c.lineWidth = 4; c.strokeStyle = '#7fe0ff'; c.stroke();
      // --- map
      const mx = 30, my = 30, ms = 560, k = ms / (2 * H), X = v => mx + (v + H) * k, Y = v => my + (H - v) * k;
      c.save(); rrect(c, mx, my, ms, ms, 16); c.clip(); if (this.bg) { c.filter = 'sepia(0.7) saturate(1.6) brightness(0.85)'; c.drawImage(this.bg, mx, my); c.filter = 'none'; } else { c.fillStyle = '#3a2418'; c.fillRect(mx, my, ms, ms); }
      c.lineJoin = 'round'; c.lineWidth = 5; c.strokeStyle = '#33e6ff'; for (const leg of s.route) { c.beginPath(); leg.forEach(([px, py], i) => i ? c.lineTo(X(px), Y(py)) : c.moveTo(X(px), Y(py))); c.stroke(); }
      const tgt = m.target; for (const p of s.pois) { const done = m.visited.has(p.id); c.beginPath(); c.arc(X(p.x), Y(p.y), tgt && tgt.id === p.id ? 13 : 9, 0, 7); c.fillStyle = p.kind === 'base' ? '#ffd166' : done ? '#5be08a' : '#fff'; c.fill(); c.lineWidth = 3; c.strokeStyle = '#0c0806'; c.stroke();
        text(c, p.name, X(p.x) + 14, Y(p.y) - 10, 20, '#fff', 700); }
      c.translate(Math.min(mx + ms - 12, Math.max(mx + 12, X(x))), Math.min(my + ms - 12, Math.max(my + 12, Y(y)))); c.rotate(-yaw); c.beginPath(); c.moveTo(0, -20); c.lineTo(13, 14); c.lineTo(0, 6); c.lineTo(-13, 14); c.closePath(); c.fillStyle = '#ff5a3c'; c.fill(); c.lineWidth = 3; c.strokeStyle = '#fff'; c.stroke(); c.restore();
      text(c, 'N', mx + ms - 30, my + 34, 24, '#fff', 700); c.fillStyle = '#fff'; c.fillRect(mx + 16, my + ms - 22, 200 * k, 4); text(c, '200 m', mx + 16, my + ms - 30, 18, '#fff', 600);
      // --- readings
      const rx = 620; let ry = 60; const head = t => { text(c, t, rx, ry, 20, '#ffb37a', 700); ry += 36; }, row = (a, b, col = '#fff') => { text(c, a, rx, ry, 23, '#d9c4b2'); text(c, b, W - 34, ry, 25, col, 600, 'right'); ry += 33; };
      head(T('ZONA')); text(c, T('Cratere Jezero, fronte del delta'), rx, ry, 25, '#fff', 700); ry += 40;
      row(T('Latitudine'), `${num(lat, 5)}° N`); row(T('Longitudine'), `${num(lon, 5)}° E`); if (elev != null) row(T('Quota (MOLA)'), `${Math.round(elev)} m`);
      const lim = s.mission.slopeLimitsDeg, kk = slope < lim[0] ? 0 : slope < lim[1] ? 1 : slope < lim[2] ? 2 : 3; row(T('Pendenza'), `${Math.round(slope)}°`, ['#35d07f', '#f6d21f', '#ff8a1e', '#ff3b3b'][kk]);
      row(T('Dalla base'), fmtDist(Math.hypot(x - m.base.x, y - m.base.y))); ry += 14;
      if (w) { head(T`METEO · MEDA SOL ${w.sol}`); row(T('Temperatura'), `${Math.round(w.min_temp)} / ${Math.round(w.max_temp)} °C`); row(T('Pressione'), `${Math.round(w.pressure)} Pa`); row(T('Alba e tramonto'), `${String(w.sunrise).slice(0, 5)} – ${String(w.sunset).slice(0, 5)}`); ry += 14; }
      head(T('LIVELLO DATI')); text(c, L.name, rx, ry, 25, '#fff', 700); ry += 32; let lx = rx; for (const [col, label] of L.legend) { if (!label) continue; const short = label.split(':')[0]; c.fillStyle = col; rrect(c, lx, ry - 17, 22, 20, 4); c.fill(); lx += 28 + text(c, short, lx + 28, ry, 19, '#fff') + 16; if (lx > W - 150) { lx = rx; ry += 28; } }
      // --- stops
      const by = 640; c.fillStyle = 'rgba(255,255,255,0.14)'; c.fillRect(30, by - 26, W - 60, 2); let sx = 34; text(c, T('TAPPE'), sx, by + 14, 20, '#ffb37a', 700); sx += 96;
      m.order.slice(1).forEach((id, i) => { const p = m.pois[id], done = m.leg > i + 1, cur = !m.done && m.leg === i + 1; sx += text(c, `${done ? '✓' : cur ? '▶' : '○'} ${i === m.order.length - 2 ? T('Rientro') : p.name}`, sx, by + 14, 21, done ? '#5be08a' : cur ? '#7fe0ff' : '#d9c4b2', cur ? 700 : 500) + 22; });
      text(c, T("A livello dati · B traccia rover · X fonti · Y ricomincia · grilletto dx vista dall'alto · grilletto laterale dx chiude"), 34, by + 62, 19, '#d9c4b2');
      text(c, T('Dati: NASA/JPL-Caltech/University of Arizona/USGS'), 34, by + 94, 17, '#8a7a6c');
    });
  }
}
