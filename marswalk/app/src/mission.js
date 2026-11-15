// EVA accounting: every metre the astronaut covers (walking or teleporting) is converted into mission time,
// oxygen and radiation dose with a transparent physical model. All parameters come from the site file.
const SOL_S = 88775, MARS_HOUR_S = SOL_S / 24;
const hms = t => { const [h, m, s = 0] = String(t).split(':').map(Number); return h + m / 60 + s / 3600; };
export class Mission {
  constructor(site, ground) {
    this.site = site; this.p = site.mission; this.ground = ground; this.pois = Object.fromEntries(site.pois.map(p => [p.id, p])); this.order = [site.legs[0].frm, ...site.legs.map(l => l.to)];
    this.sunset = site.weather ? hms(site.weather.sunset) : 17.5; this.reset();
  }
  reset() { this.t = 0; this.dist = 0; this.climb = 0; this.o2 = this.p.oxygen.tankKg * 1000; this.dose = 0; this.leg = 1; this.visited = new Set([this.order[0]]); this.done = false; this.peakSlope = 0; this.changed = true; }
  speed(tanS) { const w = this.p.walk; return w.flatSpeed * Math.exp(-w.toblerK * Math.abs(tanS + w.toblerOffset)) / Math.exp(-w.toblerK * w.toblerOffset); }
  power(v, sinUp) { const m = this.p.metabolic; return m.baseW + m.walkJperM * v + m.massKg * this.p.gravity * v * Math.max(sinUp, 0) / m.efficiency; }
  o2Rate(P) { const o = this.p.oxygen; return P / (o.kJperLitre * 1000) * o.gPerLitre; }   // grams per second
  advance(dt, P) { this.t += dt; this.o2 = Math.max(0, this.o2 - this.o2Rate(P) * dt); this.dose += this.p.radiation.mSvPerDay * 1000 / SOL_S * dt; }
  idle(dt) { this.advance(dt, this.p.metabolic.baseW); }
  move(a, b) {   // a, b: world positions (x east, z south)
    const L = Math.hypot(b.x - a.x, b.z - a.z); if (L < 1e-4) return; const n = Math.max(1, Math.ceil(L / 2)), dl = L / n; let h0 = this.ground(a.x, a.z) ?? 0;
    for (let i = 1; i <= n; i++) { const f = i / n, h1 = this.ground(a.x + (b.x - a.x) * f, a.z + (b.z - a.z) * f) ?? h0, dh = h1 - h0, tanS = dh / dl, v = this.speed(tanS);
      this.advance(dl / v, this.power(v, tanS / Math.sqrt(1 + tanS * tanS))); this.dist += Math.hypot(dl, dh); this.peakSlope = Math.max(this.peakSlope, Math.atan(Math.abs(tanS)) * 180 / Math.PI); if (dh > 0) this.climb += dh; h0 = h1; }
  }
  get target() { return this.done ? null : this.pois[this.order[this.leg]]; }
  get base() { return this.pois[this.order[0]]; }
  // remaining planned path length from the current target back to base (m)
  check(pos) {   // call each frame with the astronaut position; returns the POI just reached, if any
    const t = this.target; if (!t) return null;
    if (Math.hypot(pos.x - t.x, pos.z + t.y) < (this.leg === this.order.length - 1 ? 3 : 9)) { this.visited.add(t.id); this.leg++; if (this.leg >= this.order.length) this.done = true; this.changed = true; return t; }
    return null;
  }
  state(pos) {
    const o = this.p.oxygen, walkP = this.power(this.p.walk.flatSpeed, 0), b = this.base;
    const o2Frac = this.o2 / (o.tankKg * 1000), autonomy = this.o2 / this.o2Rate(walkP);
    const backDist = Math.hypot(pos.x - b.x, pos.z + b.y) * 1.3, backTime = backDist / this.p.walk.flatSpeed;   // 1.3: detour factor over the straight line
    const reserve = o.reserveFraction * o.tankKg * 1000 / this.o2Rate(walkP);
    const lmst = hms(this.p.startLMST) + this.t / MARS_HOUR_S, daylight = (this.sunset - lmst) * MARS_HOUR_S;
    let alert = null;
    if (autonomy - reserve < backTime) alert = 'OSSIGENO: RIENTRA ALLA BASE'; else if (daylight < backTime + 1800) alert = 'TRAMONTO VICINO: RIENTRA ALLA BASE';
    return { o2Frac, autonomy, backTime, margin: autonomy - reserve - backTime, lmst, daylight, alert };
  }
}
export const lmstStr = h => { h = ((h % 24) + 24) % 24; return `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor(h % 1 * 60)).padStart(2, '0')}`; };
