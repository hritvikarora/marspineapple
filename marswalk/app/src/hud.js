// Helmet HUD: the "survival" readout an astronaut would glance at during the walk.
import * as THREE from 'three';
import { Panel, rrect, text, fmtHM, fmtDist } from './ui.js';
import { lmstStr } from './mission.js';
import { T, num } from './i18n.js';
const CLASS = [['AGEVOLE', '#35d07f'], ['IMPEGNATIVA', '#f6d21f'], ['CRITICA', '#ff8a1e'], ['VIETATA', '#ff3b3b']];
export class Hud {
  constructor(app) {
    this.app = app; this.panel = new Panel(1.0, 0.3, 1024); this.acc = 1; const m = this.panel.mesh;
    m.position.set(0, -0.36, -1.25); m.rotation.x = -0.27; m.renderOrder = 200; app.camera.add(m);
  }
  update(dt) {
    const xr = this.app.renderer.xr.isPresenting, m = this.panel.mesh; if (xr !== this._xr) { this._xr = xr;   // in the headset: a small readout low on the left, out of the way
      if (xr) { m.scale.setScalar(0.42); m.position.set(-0.3, -0.33, -0.95); m.rotation.set(-0.45, 0.32, 0); } else { m.scale.setScalar(1); m.position.set(0, -0.36, -1.25); m.rotation.set(-0.27, 0, 0); } }
    this.acc += dt; if (this.acc < 0.2) return; this.acc = 0;
    const { mission, player, site } = this.app, pos = player.head(), st = mission.state(pos), lim = site.mission.slopeLimitsDeg;
    const slope = this.app.habitat.indoors(pos.x, pos.z) ? 0 : this.app.slope(pos.x, pos.z), k = slope < lim[0] ? 0 : slope < lim[1] ? 1 : slope < lim[2] ? 2 : 3, tgt = mission.target;
    this.panel.draw((c, W, H) => {
      rrect(c, 4, 4, W - 8, H - 8, 26); c.fillStyle = 'rgba(14,9,6,0.62)'; c.fill(); c.lineWidth = 3; c.strokeStyle = st.alert ? '#ff3b3b' : 'rgba(255,170,110,0.75)'; c.stroke();
      // clock
      text(c, T('ORA LOCALE (LMST)'), 30, 46, 20, '#ffb37a', 600); text(c, lmstStr(st.lmst), 28, 118, 74, '#fff', 700);
      text(c, `EVA ${fmtHM(mission.t)}`, 30, 158, 26, '#fff', 600); text(c, T`luce ${fmtHM(st.daylight)}`, 30, 190, 22, '#d9c4b2');
      // oxygen + dose
      const x = 300, bw = 330; text(c, T('OSSIGENO'), x, 46, 20, '#ffb37a', 600); text(c, `${Math.round(st.o2Frac * 100)}%`, x + bw, 46, 26, '#fff', 700, 'right');
      rrect(c, x, 58, bw, 26, 8); c.fillStyle = 'rgba(255,255,255,0.16)'; c.fill();
      rrect(c, x, 58, Math.max(10, bw * st.o2Frac), 26, 8); c.fillStyle = st.margin < 1800 ? '#ff3b3b' : st.margin < 5400 ? '#f6d21f' : '#35d07f'; c.fill();
      text(c, T`autonomia ${fmtHM(st.autonomy)}`, x, 116, 22, '#fff'); text(c, T`rientro ${fmtHM(st.backTime)}`, x + bw, 116, 22, '#d9c4b2', 400, 'right');
      text(c, T('RADIAZIONI'), x, 158, 20, '#ffb37a', 600); text(c, `${num(mission.dose, 1)} µSv`, x + bw, 160, 26, '#fff', 700, 'right');
      text(c, T`percorsi ${fmtDist(mission.dist)} · salita ${Math.round(mission.climb)} m`, x, 190, 22, '#d9c4b2');
      // next stop
      const tx = 680; text(c, T(mission.done ? 'USCITA COMPLETATA' : this.app.started ? 'PROSSIMA TAPPA' : this.app.dataMode ? 'SALA DATI' : 'IN ATTESA'), tx, 46, 20, '#ffb37a', 600);
      if (!this.app.started && this.app.dataMode) { text(c, T('Nessuna missione attiva.'), tx, 96, 28, '#fff', 600); text(c, T('Y: torna al menu'), tx, 132, 28, '#d9c4b2', 600); }
      else if (!this.app.started) { text(c, T('Scegli le impostazioni'), tx, 96, 28, '#fff', 600); text(c, T('e avvia la missione.'), tx, 132, 28, '#fff', 600); }
      else if (tgt) { const dx = tgt.x - pos.x, dz = -tgt.y - pos.z, d = Math.hypot(dx, dz), rel = Math.atan2(dx, -dz) + player.headYaw();
        text(c, tgt.name, tx, 96, 40, '#fff', 700); text(c, fmtDist(d), tx, 150, 46, '#7fe0ff', 700);
        c.save(); c.translate(W - 82, 140); c.rotate(rel); c.beginPath(); c.moveTo(0, -44); c.lineTo(30, 30); c.lineTo(0, 14); c.lineTo(-30, 30); c.closePath(); c.fillStyle = '#7fe0ff'; c.fill(); c.restore();
        text(c, T`tappa ${mission.leg} di ${mission.order.length - 1}`, tx, 190, 22, '#d9c4b2');
      } else text(c, T('Sei rientrato alla base.'), tx, 96, 28, '#fff', 600);
      // bottom strip
      const y = H - 28; c.fillStyle = 'rgba(255,255,255,0.14)'; c.fillRect(24, y - 38, W - 48, 2);
      if (st.alert) { text(c, '⚠ ' + T(st.alert), W / 2, y, 30, '#ff5a5a', 700, 'center'); }
      else { c.fillStyle = CLASS[k][1]; c.beginPath(); c.arc(40, y - 10, 11, 0, 7); c.fill(); text(c, T`pendenza ${slope.toFixed(0)}° ${T(CLASS[k][0])}` + (player.pace < 0.95 ? T` · andatura ${Math.round(player.pace * 100)}%` : ''), 62, y, 26, '#fff', 600);
        text(c, T`livello: ${this.app.LAYERS[this.app.layer].name}`, W - 30, y, 24, '#d9c4b2', 400, 'right'); }
    });
  }
}
