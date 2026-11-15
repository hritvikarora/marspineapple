// Turn-by-turn directions ("Google Maps for Mars") along the route chosen in the EVA navigator / MARS PATHFINDER.
// Each leg's polyline is simplified (Douglas-Peucker, 4 m) and every bend sharper than 30° becomes a manoeuvre.
import { Panel, rrect, text, fmtDist } from './ui.js';
import { lang } from './i18n.js';
const L = o => (lang.cur === 'en' ? o.en : o.it);
const DIRS = { it: ['nord', 'nord-est', 'est', 'sud-est', 'sud', 'sud-ovest', 'ovest', 'nord-ovest'], en: ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'] };
const compass = (dx, dy) => (lang.cur === 'en' ? DIRS.en : DIRS.it)[Math.round(((Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360) / 45) % 8];

function simplify(pts, tol) {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1; const st = [[0, pts.length - 1]];
  while (st.length) { const [a, b] = st.pop(); const [ax, ay] = pts[a], [bx, by] = pts[b], L2 = Math.hypot(bx - ax, by - ay) || 1e-9; let md = 0, mi = -1;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / L2; if (d > md) { md = d; mi = i; } }
    if (md > tol) { keep[mi] = 1; st.push([a, mi], [mi, b]); } }
  return pts.filter((_, i) => keep[i]);
}

export class Directions {
  constructor(app) {
    this.app = app; this.acc = 1; const site = app.site;
    this.on = !!site.plannerRoute;
    this.legs = site.route.map(pts => { const s = simplify(pts, 4), cum = [0]; for (let i = 1; i < s.length; i++) cum.push(cum[i - 1] + Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1])); return { s, cum }; });
    this.panel = new Panel(0.9, 0.17, 1024); const m = this.panel.mesh; m.position.set(-0.62, 0.36, -1.25); m.scale.setScalar(0.5); m.rotation.x = 0.12; m.renderOrder = 200; m.visible = false; app.camera.add(m);
  }
  // returns { text, sub, dist } for the astronaut at (x, y) (east, north) on leg index li
  guide(li, x, y) {
    const leg = this.legs[li], m = this.app.mission, tgt = m.target; if (!leg || !tgt) return null; const { s, cum } = leg;
    let best = { d: Infinity, i: 0, t: 0 };
    for (let i = 1; i < s.length; i++) { const [ax, ay] = s[i - 1], [bx, by] = s[i], vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy || 1e-9, t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / L2));
      const d = Math.hypot(ax + vx * t - x, ay + vy * t - y); if (d < best.d) best = { d, i, t }; }
    const along = cum[best.i - 1] + (cum[best.i] - cum[best.i - 1]) * best.t, total = cum[cum.length - 1];
    const planned = this.app.site.legs[li]?.planned;
    let turn = null;
    for (let k = best.i; k < s.length - 1; k++) {
      const [ax, ay] = s[k - 1], [bx, by] = s[k], [cx, cy] = s[k + 1];
      const a1 = Math.atan2(bx - ax, by - ay), a2 = Math.atan2(cx - bx, cy - by); let da = (a2 - a1) * 180 / Math.PI; da = ((da + 540) % 360) - 180;
      if (Math.abs(da) > 30) { turn = { k, da, dir: compass(cx - bx, cy - by) }; break; }
    }
    const segDir = compass(s[best.i][0] - s[best.i - 1][0], s[best.i][1] - s[best.i - 1][1]);
    const off = best.d > 15 ? L({ it: `Sei a ${Math.round(best.d)} m dal percorso: torna sulla linea azzurra`, en: `You are ${Math.round(best.d)} m off the route: walk back to the blue line` }) : null;
    if (turn) { const dist = cum[turn.k] - along, side = turn.da > 0 ? L({ it: 'destra', en: 'right' }) : L({ it: 'sinistra', en: 'left' }), sharp = Math.abs(turn.da) > 100 ? L({ it: ' stretta', en: ' sharply' }) : '';
      return { dist, arrow: off ? '!' : turn.da > 0 ? '↱' : '↰', text: off ?? L({ it: `Tra ${fmtDist(dist)} gira a ${side}${sharp}`, en: `In ${fmtDist(dist)}, turn ${side}${sharp}` }),
        sub: L({ it: `Segui la linea azzurra · ${tgt.name} tra ${fmtDist(total - along)}`, en: `Follow the blue line · ${tgt.name} in ${fmtDist(total - along)}` }), off: !!off }; }
    const dist = total - along;
    return { dist, arrow: off ? '!' : '↑', text: off ?? L({ it: `Vai dritto per ${fmtDist(dist)}`, en: `Go straight for ${fmtDist(dist)}` }), sub: planned ? L({ it: `Segui la linea azzurra fino a ${tgt.name}`, en: `Follow the blue line to ${tgt.name}` }) : L({ it: `Cammina verso ${tgt.name} (${segDir}): lì inizia la linea azzurra`, en: `Walk ${segDir} to ${tgt.name}: the blue line starts there` }), off: !!off };
  }
  update(dt) {
    const { app } = this, m = this.panel.mesh, show = this.on && app.started && !app.mission.done && !app.habitat.indoors(app.player.head().x, app.player.head().z);
    m.visible = show; if (!show) return;
    const xr = app.renderer.xr.isPresenting; if (xr !== this._xr) { this._xr = xr; if (xr) { m.scale.setScalar(0.3); m.position.set(-0.3, -0.28, -0.95); m.rotation.x = -0.35; } else { m.scale.setScalar(0.5); m.position.set(-0.62, 0.36, -1.25); m.rotation.x = 0.12; } }
    this.acc += dt; if (this.acc < 0.25) return; this.acc = 0;
    const p = app.player.head(), g = this.guide(app.mission.leg - 1, p.x, -p.z); if (!g) return;
    this.panel.draw((c, W, H) => {
      rrect(c, 4, 4, W - 8, H - 8, 22); c.fillStyle = g.off ? 'rgba(90,14,10,0.85)' : 'rgba(8,40,48,0.85)'; c.fill(); c.lineWidth = 3; c.strokeStyle = g.off ? '#ff6b5b' : '#7fe0ff'; c.stroke();
      text(c, g.arrow, 70, 120, 110, '#fff', 800, 'center');
      text(c, g.text, 140, 76, g.text.length > 34 ? 32 : 42, '#fff', 700); text(c, g.sub, 142, 130, 28, g.off ? '#ffb3a8' : '#bfefff', 500);
    });
  }
}
