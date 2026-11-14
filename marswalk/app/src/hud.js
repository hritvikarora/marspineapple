// Helmet HUD: the "survival" readout an astronaut would glance at during the walk.
import * as THREE from 'three';
import { Panel, rrect, text, fmtHM, fmtDist } from './ui.js';
import { lmstStr } from './mission.js';
const CLASS = [['AGEVOLE', '#35d07f'], ['IMPEGNATIVA', '#f6d21f'], ['CRITICA', '#ff8a1e'], ['VIETATA', '#ff3b3b']];
export class Hud {
  constructor(app) {
    this.app = app; this.panel = new Panel(1.0, 0.3, 1024); this.acc = 1; const m = this.panel.mesh;
    m.position.set(0, -0.36, -1.25); m.rotation.x = -0.27; m.renderOrder = 200; app.camera.add(m);
  }
  update(dt) {
    this.acc += dt; if (this.acc < 0.2) return; this.acc = 0;
    const { mission, player, site } = this.app, pos = player.head(), st = mission.state(pos), lim = site.mission.slopeLimitsDeg;
    const slope = this.app.slope(pos.x, pos.z), k = slope < lim[0] ? 0 : slope < lim[1] ? 1 : slope < lim[2] ? 2 : 3, tgt = mission.target;
    this.panel.draw((c, W, H) => {
      rrect(c, 4, 4, W - 8, H - 8, 26); c.fillStyle = 'rgba(14,9,6,0.62)'; c.fill(); c.lineWidth = 3; c.strokeStyle = st.alert ? '#ff3b3b' : 'rgba(255,170,110,0.75)'; c.stroke();
      // clock
      text(c, 'ORA LOCALE (LMST)', 30, 46, 20, '#ffb37a', 600); text(c, lmstStr(st.lmst), 28, 118, 74, '#fff', 700);
      text(c, `EVA ${fmtHM(mission.t)}`, 30, 158, 26, '#fff', 600); text(c, `luce ${fmtHM(st.daylight)}`, 30, 190, 22, '#d9c4b2');
      // oxygen + dose
      const x = 300, bw = 330; text(c, 'OSSIGENO', x, 46, 20, '#ffb37a', 600); text(c, `${Math.round(st.o2Frac * 100)}%`, x + bw, 46, 26, '#fff', 700, 'right');
      rrect(c, x, 58, bw, 26, 8); c.fillStyle = 'rgba(255,255,255,0.16)'; c.fill();
      rrect(c, x, 58, Math.max(10, bw * st.o2Frac), 26, 8); c.fillStyle = st.margin < 1800 ? '#ff3b3b' : st.margin < 5400 ? '#f6d21f' : '#35d07f'; c.fill();
      text(c, `autonomia ${fmtHM(st.autonomy)}`, x, 116, 22, '#fff'); text(c, `rientro ${fmtHM(st.backTime)}`, x + bw, 116, 22, '#d9c4b2', 400, 'right');
      text(c, 'RADIAZIONI', x, 158, 20, '#ffb37a', 600); text(c, `${mission.dose.toFixed(1).replace('.', ',')} µSv`, x + bw, 160, 26, '#fff', 700, 'right');
      text(c, `percorsi ${fmtDist(mission.dist)} · salita ${Math.round(mission.climb)} m`, x, 190, 22, '#d9c4b2');
      // next stop
      const tx = 680; text(c, mission.done ? 'USCITA COMPLETATA' : 'PROSSIMA TAPPA', tx, 46, 20, '#ffb37a', 600);
      if (tgt) { const dx = tgt.x - pos.x, dz = -tgt.y - pos.z, d = Math.hypot(dx, dz), rel = Math.atan2(dx, -dz) + player.headYaw();
        text(c, tgt.name, tx, 96, 40, '#fff', 700); text(c, fmtDist(d), tx, 150, 46, '#7fe0ff', 700);
        c.save(); c.translate(W - 82, 140); c.rotate(rel); c.beginPath(); c.moveTo(0, -44); c.lineTo(30, 30); c.lineTo(0, 14); c.lineTo(-30, 30); c.closePath(); c.fillStyle = '#7fe0ff'; c.fill(); c.restore();
        text(c, `tappa ${mission.leg} di ${mission.order.length - 1}`, tx, 190, 22, '#d9c4b2');
      } else text(c, 'Sei rientrato alla base.', tx, 96, 28, '#fff', 600);
      // bottom strip
      const y = H - 28; c.fillStyle = 'rgba(255,255,255,0.14)'; c.fillRect(24, y - 38, W - 48, 2);
      if (st.alert) { text(c, '⚠ ' + st.alert, W / 2, y, 30, '#ff5a5a', 700, 'center'); }
      else { c.fillStyle = CLASS[k][1]; c.beginPath(); c.arc(40, y - 10, 11, 0, 7); c.fill(); text(c, `pendenza ${slope.toFixed(0)}° ${CLASS[k][0]}`, 62, y, 26, '#fff', 600);
        text(c, `livello: ${this.app.LAYERS[this.app.layer].name}`, W - 30, y, 24, '#d9c4b2', 400, 'right'); }
    });
  }
}
