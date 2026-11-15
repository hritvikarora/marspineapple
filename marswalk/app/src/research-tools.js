// Research room tools: the sol-by-sol calendar of Perseverance, the queryable terrain model, and the data boards
// (sample register, route profile, MEDA weather, data catalogue). Data: research/activity.json (pipeline/build_activity.py).
import * as THREE from 'three';
import { Panel, rrect, text, wrap, fmtDist } from './ui.js';
import { lang, num } from './i18n.js';
const L = o => (typeof o === 'string' ? o : o[lang.cur] ?? o.it);
const SOL_S = 88775.244, LANDING = Date.UTC(2021, 1, 18, 20, 55), BBOX = [-11600, 4400, -3400, 3800];   // calendar map extent, local metres (same as build_research.py)
const R2D = 180 / Math.PI;
export const solDate = sol => new Date(LANDING + (sol - 0.16) * SOL_S * 1000);   // middle of the sol; checked against image timestamps
const fmtDate = (d, long = true) => d.toLocaleDateString(lang.cur === 'en' ? 'en-GB' : 'it-IT', { day: 'numeric', month: long ? 'long' : 'short', year: 'numeric', timeZone: 'UTC' });
function lonlat(site, x, y) {   // inverse of the local orthographic frame
  const R = site.radius, p0 = site.lat0 / R2D, rho = Math.hypot(x, y) || 1e-9, c = Math.asin(Math.min(1, rho / R));
  const lat = Math.asin(Math.cos(c) * Math.sin(p0) + y * Math.sin(c) * Math.cos(p0) / rho), lon = site.lon0 / R2D + Math.atan2(x * Math.sin(c), rho * Math.cos(p0) * Math.cos(c) - y * Math.sin(p0) * Math.sin(c));
  return [lon * R2D, lat * R2D];
}
// Perseverance selfies (NASA/JPL-Caltech/MSSS): the sol comes from the release date; the place is the rover's localized position on that sol
export const SELFIES = [
  { id: 'three_forks', name: 'Three Forks', sol: 684, date: { it: '22 gennaio 2023', en: '22 January 2023' }, note: { it: 'al deposito dei campioni, sulla nostra rotta (tappa Three Forks)', en: 'at the sample depot, on our route (Three Forks stop)' } },
  { id: 'cheyava_falls', name: 'Cheyava Falls', sol: 1217, date: { it: '23 luglio 2024', en: '23 July 2024' }, note: { it: 'Neretva Vallis, margine nord della valle del fiume', en: 'Neretva Vallis, northern edge of the river valley' } },
  { id: 'witch_hazel_hill', name: 'Witch Hazel Hill', sol: 1501, date: { it: '10 maggio 2025', en: '10 May 2025' }, note: { it: 'sul bordo del cratere Jezero', en: 'on the rim of Jezero crater' } },
  { id: 'lac_de_charmes', name: 'Lac de Charmes', sol: 1797, date: { it: '11 marzo 2026', en: '11 March 2026' }, note: { it: 'oltre il bordo occidentale, affioramento Arathusa', en: 'beyond the western rim, Arathusa outcrop' } },
];
const SLOPE_COL = ['#35d07f', '#f6d21f', '#ff8a1e', '#ff3b3b'];

// ---------------------------------------------------------------- calendar
export class Calendar {
  constructor(room, base) {
    this.room = room; this.app = room.app; this.sol = 663; this.playing = false; this.acc = 0; this.hov = null; this.data = null; this.dirty = true;
    this.pnl = new Panel(3.2, 1.36, 600, { depthTest: true });
    const im = new Image(); im.onload = () => { this.map = im; this.draw(); }; im.src = base + 'traverse_map.jpg';
    const ic = new Image(); ic.onload = () => { this.icon = ic; this.draw(); }; ic.src = base + 'rover_icon.png';
    this.selfImg = {}; for (const sf of SELFIES) { const si = new Image(); si.onload = () => { this.selfImg[sf.id] = si; this.draw(); }; si.src = base + 'selfies/' + sf.id + '.jpg'; }
    fetch(base + 'activity.json').then(r => r.json()).then(d => { this.data = d; this.wps = d.waypoints; this.max = Math.max(this.wps[this.wps.length - 1][0], ...Object.keys(d.activity).map(Number));
      this.samples = Object.fromEntries(d.samples.map(s => [s.sol, s])); this.depot = Object.fromEntries(d.depot.map(([n, s]) => [s, n])); this.heli = Object.fromEntries(d.heli.map(([s, f]) => [s, f]));
      room.data = d; room.onData?.(); this.draw(); }).catch(e => console.warn('activity', e));
  }
  wpAt(sol) { const w = this.wps; let lo = 0, hi = w.length - 1; if (sol < w[0][0]) return null; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (w[m][0] <= sol) lo = m; else hi = m - 1; } return lo; }
  step(n) { this.set(this.sol + n); }
  set(s) { if (!this.data) return; const v = Math.max(0, Math.min(this.max, Math.round(s))); if (v === this.sol) return; this.sol = v; this.draw(); this.room.plastico?.setRover(this.position()); }
  position() { const i = this.wpAt(this.sol); return i == null ? null : this.wps[i]; }
  update(dt) { if (!this.playing) return; this.acc += dt; if (this.acc < 0.12) return; const n = Math.round(this.acc * 25); this.acc = 0; if (this.sol + n >= this.max) this.playing = false; this.set(this.sol + n); }
  // layout in canvas pixels
  get layout() { const map = [30, 100, 1150, 518], tl = [60, 676, 1860, 676], btn = []; const labels = ['−100', '−10', '−1', 'play', '+1', '+10', '+100'], vals = [-100, -10, -1, 0, 10 / 10, 10, 100];
    labels.forEach((l, i) => btn.push({ id: l, v: vals[i], x: 60 + i * 192, y: 718, w: 176, h: 76 })); return { map, tl, btn }; }
  px(h) { return [h.uv.x * this.pnl.canvas.width, (1 - h.uv.y) * this.pnl.canvas.height]; }
  hit(h) { const [x, y] = this.px(h), { tl, btn } = this.layout; const b = btn.find(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h); if (b) return b.id;
    if (y > tl[1] - 26 && y < tl[1] + 26 && x >= tl[0] - 10 && x <= tl[2] + 10) return 'tl:' + (x - tl[0]) / (tl[2] - tl[0]); return null; }
  hover(h) { const id = this.hit(h), k = id && id.startsWith('tl:') ? 'tl' : id; if (k !== this.hov) { this.hov = k; this.draw(); } }
  click(h) { const id = this.hit(h); if (!id || !this.data) return; if (id.startsWith('tl:')) { this.playing = false; this.set(+id.slice(3) * this.max); return; }
    if (id === 'play') { this.playing = !this.playing; if (this.playing && this.sol >= this.max) this.set(0); this.draw(); return; } this.playing = false; this.step(this.layout.btn.find(b => b.id === id).v); }
  describe(sol) {
    const d = this.data, out = [], a = d.activity[sol] || {}, i = this.wpAt(sol), w = i == null ? null : this.wps[i];
    if (w && w[0] === sol) { const prev = i > 0 ? this.wps[i - 1][4] : 0, dd = w[4] - prev; out.push([dd > 1 ? L({ it: `Guida: ${fmtDist(dd)} percorsi in questo sol`, en: `Drive: ${fmtDist(dd)} covered this sol` }) : L({ it: 'Localizzazione a fine guida', en: 'End-of-drive localization' }), '#7fe0ff']); }
    else if (w) out.push([L({ it: `Fermo: ultima guida nel sol ${w[0]}`, en: `Parked: last drive on sol ${w[0]}` }), '#d9c4b2']);
    for (const sf of SELFIES) if (Math.abs(sf.sol - sol) <= 2) out.push([L({ it: `Selfie «${sf.name}» (${L(sf.date)}): ${L(sf.note)}`, en: `"${sf.name}" selfie (${L(sf.date)}): ${L(sf.note)}` }), '#ffffff']);
    const sm = this.samples[sol]; if (sm) out.push([L({ it: `Prelievo del campione «${sm.name}» (${L(sm.rock)}, ${sm.outcrop})`, en: `Core sample "${sm.name}" collected (${L(sm.rock)}, ${sm.outcrop})` }), '#ffd166']);
    const dp = this.depot[sol]; if (dp) out.push([L({ it: `Provetta «${dp}» posata nel deposito di Three Forks`, en: `Tube "${dp}" dropped at the Three Forks depot` }), '#ffd166']);
    const hf = this.heli[sol]; if (hf) out.push([L({ it: `Ingenuity: volo ${hf}`, en: `Ingenuity: flight ${hf}` }), '#c9a7ff']);
    if (a.cache && !sm && !dp) out.push([L({ it: `Lavoro sulle provette (CacheCam, ${a.cache} immagini)`, en: `Sample tube handling (CacheCam, ${a.cache} images)` }), '#ffd166']);
    if (a.watson) out.push([L({ it: `Analisi da vicino col braccio robotico (WATSON, ${a.watson} immagini)`, en: `Close-up work with the robotic arm (WATSON, ${a.watson} images)` }), '#fff']);
    if (a.pixl) out.push([L({ it: `Chimica delle rocce con PIXL (${a.pixl} immagini)`, en: `Rock chemistry with PIXL (${a.pixl} images)` }), '#fff']);
    if (a.rmi) out.push([L({ it: `Analisi laser a distanza con SuperCam (${a.rmi} immagini)`, en: `Remote laser analysis with SuperCam (${a.rmi} images)` }), '#fff']);
    if (a.sky) out.push([L({ it: 'Osservazione del cielo e dell\'atmosfera (SkyCam)', en: 'Sky and atmosphere observation (SkyCam)' }), '#fff']);
    if (out.length < 2 && !Object.keys(a).length) out.push([L({ it: 'Nessuna immagine scientifica in questo sol (guida, comunicazioni o pausa)', en: 'No science images this sol (driving, communications or rest)' }), '#8a7a6c']);
    return out;
  }
  draw() {
    const room = this.room, site = this.app.site;
    this.pnl.draw((c, W, Hh) => {
      room.frame(c, W, Hh, '#c9a7ff'); room.band(c, W, '#c9a7ff', L({ it: 'CALENDARIO DI PERSEVERANCE', en: 'PERSEVERANCE CALENDAR' }));
      text(c, L({ it: 'Ricostruisci il percorso del rover, sol per sol', en: 'Rebuild the rover\'s path, sol by sol' }), 30, 86, 30, '#fff', 700);
      const { map, tl, btn } = this.layout, [mx, my, mw, mh] = map, X = x => mx + (x - BBOX[0]) / (BBOX[1] - BBOX[0]) * mw, Y = y => my + (BBOX[3] - y) / (BBOX[3] - BBOX[2]) * mh;
      c.save(); rrect(c, mx, my, mw, mh, 14); c.clip(); if (this.map) c.drawImage(this.map, mx, my, mw, mh); else { c.fillStyle = '#2a1a12'; c.fillRect(mx, my, mw, mh); }
      const inner = site.rings[0].half; c.strokeStyle = 'rgba(255,179,122,0.9)'; c.lineWidth = 2; c.strokeRect(X(-inner), Y(inner), X(inner) - X(-inner), Y(-inner) - Y(inner)); text(c, L({ it: 'zona dell\'uscita', en: 'EVA area' }), X(-inner), Y(inner) - 8, 18, '#ffb37a', 600);
      if (this.data) {
        const w = this.wps, cur = this.wpAt(this.sol) ?? -1; c.lineJoin = 'round';
        c.lineWidth = 3; c.strokeStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); w.forEach((p, i) => i ? c.lineTo(X(p[1]), Y(p[2])) : c.moveTo(X(p[1]), Y(p[2]))); c.stroke();
        if (cur >= 0) { c.lineWidth = 5; c.strokeStyle = '#33e6ff'; c.beginPath(); for (let i = 0; i <= cur; i++) i ? c.lineTo(X(w[i][1]), Y(w[i][2])) : c.moveTo(X(w[i][1]), Y(w[i][2])); c.stroke(); }
        for (const s of this.data.samples) { const k = this.wpAt(s.sol); if (k == null) continue; c.fillStyle = s.sol <= this.sol ? '#ffd166' : 'rgba(255,209,102,0.35)'; c.beginPath(); c.arc(X(w[k][1]), Y(w[k][2]), 7, 0, 7); c.fill(); }
        c.fillStyle = '#fff'; c.beginPath(); c.arc(X(w[0][1]), Y(w[0][2]), 7, 0, 7); c.fill(); text(c, L({ it: 'atterraggio', en: 'landing' }), X(w[0][1]) + 10, Y(w[0][2]) + 22, 18, '#fff', 600);
        for (const sf of SELFIES) { const k = this.wpAt(sf.sol), im = this.selfImg[sf.id]; if (k == null) continue; const x = X(w[k][1]), y = Y(w[k][2]), on = sf.sol <= this.sol, tw = 64, th = 40;   // selfie thumbnails where they were taken
          c.globalAlpha = on ? 1 : 0.5; const bx = x + 26, by = y + 22; c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, y); c.lineTo(bx, by); c.stroke(); c.fillStyle = '#fff'; c.beginPath(); c.arc(x, y, 4, 0, 7); c.fill(); c.fillRect(bx - 3, by - 3, tw + 6, th + 6); if (im) c.drawImage(im, bx, by, tw, th); c.globalAlpha = 1; }   // offset down-right, so the rover icon never hides it
        if (cur >= 0) { const p = w[cur], x = X(p[1]), y = Y(p[2]);   // the rover itself marks where it is
          if (this.icon) { const ih = 54, iw = ih * this.icon.width / this.icon.height; c.fillStyle = 'rgba(51,230,255,0.35)'; c.beginPath(); c.ellipse(x, y, iw * 0.45, 9, 0, 0, 7); c.fill(); c.drawImage(this.icon, x - iw / 2, y - ih + 6, iw, ih); }
          else { c.fillStyle = '#ff5a3c'; c.beginPath(); c.arc(x, y, 12, 0, 7); c.fill(); } }
      }
      c.restore(); const k1 = mw / (BBOX[1] - BBOX[0]) * 2000; c.fillStyle = '#fff'; c.fillRect(mx + 20, my + mh - 22, k1, 5); text(c, '2 km', mx + 20, my + mh - 30, 18, '#fff', 700); text(c, 'N ↑', mx + mw - 60, my + 32, 22, '#fff', 700);
      // right column: the selected sol
      const rx = 1215; let ry = 150;
      text(c, `Sol ${this.sol}`, rx, ry, 64, '#fff', 700); text(c, fmtDate(solDate(this.sol)), rx + 300, ry, 30, '#c9a7ff', 600); ry += 48;
      if (this.data) { const p = this.position();
        if (p) { const [lo, la] = lonlat(site, p[1], p[2]); text(c, `${num(la, 4)}° N · ${num(lo, 4)}° E · ${L({ it: 'quota', en: 'elevation' })} ${Math.round(p[3])} m`, rx, ry, 23, '#d9c4b2'); ry += 32;
          text(c, L({ it: `Strada percorsa dall'atterraggio: ${num((p[4] / 1000).toFixed(2))} km`, en: `Distance driven since landing: ${(p[4] / 1000).toFixed(2)} km` }), rx, ry, 23, '#d9c4b2'); ry += 46; }
        else { text(c, L({ it: 'Prima della prima localizzazione', en: 'Before the first localization' }), rx, ry, 23, '#d9c4b2'); ry += 46; }
        text(c, L({ it: 'ATTIVITÀ DEL SOL', en: 'ACTIVITY OF THE SOL' }), rx, ry, 20, '#c9a7ff', 700); ry += 34;
        for (const [t, col] of this.describe(this.sol).slice(0, 7)) { c.fillStyle = col; c.fillRect(rx, ry - 14, 8, 8); ry = wrap(c, t, rx + 20, ry, W - rx - 50, 22, 28, col) + 6; }
        text(c, L({ it: 'Attività ricostruite dalle immagini raw scattate nel sol.', en: 'Activities reconstructed from the raw images taken that sol.' }), rx, 600, 17, '#8a7a6c'); }
      else text(c, L({ it: 'Caricamento dei dati…', en: 'Loading data…' }), rx, ry, 24, '#d9c4b2');
      // timeline with sample marks, and the buttons
      const max = this.max || 2000, TX = s => tl[0] + s / max * (tl[2] - tl[0]);
      c.fillStyle = this.hov === 'tl' ? 'rgba(201,167,255,0.5)' : 'rgba(255,255,255,0.2)'; rrect(c, tl[0], tl[1] - 6, tl[2] - tl[0], 12, 6); c.fill();
      c.fillStyle = '#c9a7ff'; rrect(c, tl[0], tl[1] - 6, Math.max(12, TX(this.sol) - tl[0]), 12, 6); c.fill();
      for (let s = 0; s <= max; s += 250) { c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(TX(s), tl[1] + 10, 2, 10); text(c, String(s), TX(s), tl[1] + 38, 16, '#8a7a6c', 500, 'center'); }
      if (this.data) for (const s of this.data.samples) { c.fillStyle = '#ffd166'; c.fillRect(TX(s.sol) - 2, tl[1] - 18, 4, 12); }
      c.fillStyle = '#fff'; c.beginPath(); c.arc(TX(this.sol), tl[1], 13, 0, 7); c.fill();
      for (const b of btn) { const hov = this.hov === b.id; rrect(c, b.x, b.y, b.w, b.h, 16); c.fillStyle = b.id === 'play' ? (hov ? '#e2d3ff' : '#c9a7ff') : hov ? 'rgba(201,167,255,0.45)' : 'rgba(255,255,255,0.12)'; c.fill();
        text(c, b.id === 'play' ? (this.playing ? '❚❚' : '▶') + ' ' + L({ it: this.playing ? 'pausa' : 'riproduci', en: this.playing ? 'pause' : 'play' }) : b.id + ' sol', b.x + b.w / 2, b.y + 50, 28, b.id === 'play' ? '#1a0f0a' : '#fff', 700, 'center'); }
      text(c, L({ it: 'Punta e premi il grilletto: pulsanti o linea del tempo · al PC anche [ e ]', en: 'Point and pull the trigger: buttons or timeline · on PC also [ and ]' }), 1440, 768, 19, '#d9c4b2', 500);
      text(c, 'NASA/JPL-Caltech · Mars 2020 waypoints, raw images, Ingenuity flight log · WUSTL Analyst\'s Notebook', 30, Hh - 14, 16, '#8a7a6c');
    });
  }
}

// ---------------------------------------------------------------- terrain model
const LAYERS = [{ f: 'site_ortho.jpg', n: { it: 'Immagine', en: 'Image' } }, { f: 'site_slope.jpg', n: { it: 'Pendenze', en: 'Slopes' } }, { f: 'site_minerals.jpg', n: { it: 'Minerali', en: 'Minerals' } }, { f: 'model_thermal.jpg', n: { it: 'Infrarosso', en: 'Infrared' } }];
const MIN_COL = [[255, 70, 50, { it: 'olivina', en: 'olivine' }], [70, 230, 90, { it: 'argille Fe/Mg', en: 'Fe/Mg clays' }], [70, 140, 255, { it: 'carbonati', en: 'carbonates' }]];
export class Plastico {
  constructor(room, resBase, siteBase, cx, fy, cz, faceYaw) {
    const app = this.app = room.app; this.room = room; this.layer = 0; this.q = null; this.hov = null;
    const g = this.g = new THREE.Group(); g.position.set(cx, fy, cz); app.world.add(g); this.cx = cx; this.cz = cz;
    const half = app.site.rings[1].half, S = this.S = 1.6 / (2 * half), EX = 3, N = 140; this.half = half;
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.76, 0.84, 1.76), new THREE.MeshBasicMaterial({ color: 0x1b1714 })); box.position.y = 0.42; g.add(box);
    const rim = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.03, 1.8), new THREE.MeshBasicMaterial({ color: 0x7fe0ff })); rim.position.y = 0.84; g.add(rim);
    const geo = new THREE.PlaneGeometry(1.6, 1.6, N, N).rotateX(-Math.PI / 2), pos = geo.attributes.position, hs = new Float32Array(pos.count); let lo = Infinity;
    for (let i = 0; i < pos.count; i++) { const h = app.ground(pos.getX(i) / S, pos.getZ(i) / S) ?? 0; hs[i] = h; if (h < lo) lo = h; }
    for (let i = 0; i < pos.count; i++) pos.setY(i, 0.87 + (hs[i] - lo) * S * EX); geo.computeBoundingSphere(); this.EX = EX; this.lo = lo;
    this.tex = LAYERS.map(l => { const t = new THREE.TextureLoader().load(resBase + l.f); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; if (l.crop) { t.repeat.set(l.crop, l.crop); t.offset.set((1 - l.crop) / 2, (1 - l.crop) / 2); } return t; });
    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: this.tex[0] })); g.add(this.mesh);
    // pins: stops, samples, the queried point, the rover on the calendar's sol
    const pin = (col, h = 0.09) => { const p = new THREE.Group(), m = new THREE.MeshBasicMaterial({ color: col }); const st = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, h, 6), m); st.position.y = h / 2; const hd = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), m); hd.position.y = h; p.add(st, hd); g.add(p); return p; };
    this.place = (o, x, y) => { const z = -y; o.position.set(x * S, 0.87 + ((app.ground(x, z) ?? lo) - lo) * S * EX, z * S); };
    for (const p of app.site.pois) this.place(pin(p.kind === 'base' ? 0xffd166 : 0xffffff, 0.07), p.x, p.y);
    this.qpin = pin(0xff3b3b, 0.12); this.qpin.visible = false; this.rover = pin(0x33e6ff, 0.16); this.rover.visible = false; this.samplePins = [];
    room.onData = () => { for (const s of room.data.samples) { const i = room.cal.wpAt(s.sol); if (i == null) continue; const w = room.cal.wps[i]; if (Math.abs(w[1]) > half || Math.abs(w[2]) > half) continue; const p = pin(0xffa040, 0.1); this.place(p, w[1], w[2]); this.samplePins.push(p); }
      this.setRover(room.cal.position()); for (const b of room.boards) if (b.needsData) room.drawBoard(b); };
    // console at the table edge, facing whoever comes in from the door
    this.con = new Panel(1.5, 0.86, 600, { depthTest: true }); const m = this.con.mesh; m.rotation.order = 'YXZ'; m.rotation.set(-0.9, faceYaw, 0); m.scale.setScalar(0.6);   // a low lectern: it must not hide the model behind it
    m.position.set(Math.sin(faceYaw) * 1.22, 0.95, Math.cos(faceYaw) * 1.22); g.add(m);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.82, 10), new THREE.MeshBasicMaterial({ color: 0x555b62 })); post.position.set(Math.sin(faceYaw) * 1.28, 0.41, Math.cos(faceYaw) * 1.36); g.add(post);
    // mineral and night-IR maps, read pixel by pixel for the query
    this.px = {}; for (const [k, f, hw] of [['min', 'minerals.png', app.site.overlays?.minerals?.half], ['th', 'thermal.png', app.site.overlays?.thermal?.half]]) { if (!hw) continue; const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0); this.px[k] = { d: x.getImageData(0, 0, im.width, im.height).data, w: im.width, h: im.height, half: hw }; }; im.src = siteBase + f; }
    room.targets.push({ mesh: this.mesh, click: h => this.query(h.point) }, { mesh: m, click: h => this.conClick(h), move: h => this.conHover(h) });
    this.redraw();
  }
  sample(k, x, y) { const p = this.px[k]; if (!p) return null; const i = Math.floor((x + p.half) / (2 * p.half) * p.w), j = Math.floor((p.half - y) / (2 * p.half) * p.h); if (i < 0 || j < 0 || i >= p.w || j >= p.h) return null; const o = (j * p.w + i) * 4; return [p.d[o], p.d[o + 1], p.d[o + 2], p.d[o + 3]]; }
  query(pt) {
    const app = this.app, x = (pt.x - this.cx) / this.S, y = -(pt.z - this.cz) / this.S, z = -y, g = app.ground(x, z); if (g == null) return;
    const [lo, la] = lonlat(app.site, x, y), sl = app.slope(x, z), lim = app.site.mission.slopeLimitsDeg, k = sl < lim[0] ? 0 : sl < lim[1] ? 1 : sl < lim[2] ? 2 : 3;
    let mineral = null; const mp = this.sample('min', x, y); if (mp && mp[3] > 40) { let best = 1e9; for (const [r, gg, b, n] of MIN_COL) { const d = (mp[0] - r) ** 2 + (mp[1] - gg) ** 2 + (mp[2] - b) ** 2; if (d < best) { best = d; mineral = n; } } }
    const tp = this.sample('th', x, y), lum = tp && tp[3] > 20 ? 0.3 * tp[0] + 0.59 * tp[1] + 0.11 * tp[2] : null;
    let near = null, nd = Infinity; for (const p of app.site.pois) { const d = Math.hypot(p.x - x, p.y - y); if (d < nd) { nd = d; near = p; } }
    this.q = { x, y, lo, la, elev: g + app.h0, sl, k, mineral, lum, near, nd }; this.place(this.qpin, x, y); this.qpin.visible = true; this.redraw();
  }
  setRover(w) { if (!w || Math.abs(w[1]) > this.half || Math.abs(w[2]) > this.half) { this.rover.visible = false; return; } this.place(this.rover, w[1], w[2]); this.rover.visible = true; }
  btns() { return LAYERS.map((l, i) => ({ i, x: 24 + i * 222, y: 92, w: 206, h: 64 })); }
  conHit(h) { const x = h.uv.x * this.con.canvas.width, y = (1 - h.uv.y) * this.con.canvas.height; return this.btns().find(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h); }
  conHover(h) { const b = this.conHit(h), i = b ? b.i : null; if (i !== this.hov) { this.hov = i; this.redraw(); } }
  conClick(h) { const b = this.conHit(h); if (!b) return; this.layer = b.i; this.mesh.material.map = this.tex[b.i]; this.mesh.material.needsUpdate = true; this.redraw(); }
  update() {}
  legend(c, W, Hh, lim) {   // colour key for the layer on the model, plus the pins (always the same)
    const y0 = Hh - 112; c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(24, y0 - 34, W - 48, 2);
    text(c, L({ it: 'LEGENDA', en: 'KEY' }), 24, y0, 17, '#7fe0ff', 700); let x = 120;
    const sw = (col, lab) => { c.fillStyle = col; rrect(c, x, y0 - 16, 22, 18, 4); c.fill(); text(c, lab, x + 30, y0, 18, '#fff', 500); x += 40 + c.measureText(lab).width + 18; };
    const k = this.layer;
    if (k === 0) { text(c, L({ it: 'Immagine HiRISE/CTX in scala di grigi, senza colori aggiunti', en: 'HiRISE/CTX image in greyscale, no added colours' }), x, y0, 18, '#d9c4b2'); }
    if (k === 1) { const [a, b, d] = lim; [[`< ${a}°`, 0], [`${a}–${b}°`, 1], [`${b}–${d}°`, 2], [`> ${d}°`, 3]].forEach(([l, i]) => sw(SLOPE_COL[i], l + ' ' + L([{ it: 'agevole', en: 'easy' }, { it: 'impegnativa', en: 'demanding' }, { it: 'critica', en: 'critical' }, { it: 'vietata', en: 'no-go' }][i]))); }
    if (k === 2) { for (const [r, g, b, n] of MIN_COL) sw(`rgb(${r},${g},${b})`, L(n)); text(c, L({ it: 'scuro: nessun segnale', en: 'dark: no signal' }), x, y0, 18, '#d9c4b2'); }
    if (k === 3) { const gx = 120, gw = 400, gr = c.createLinearGradient(gx, 0, gx + gw, 0); [[0, '#0a0842'], [0.3, '#8b236f'], [0.6, '#e36238'], [1, '#fffcc3']].forEach(([o, col]) => gr.addColorStop(o, col)); c.fillStyle = gr; rrect(c, gx, y0 - 16, gw, 18, 4); c.fill();
      text(c, L({ it: 'freddo: sabbia, polvere', en: 'cold: sand, dust' }), gx, y0 + 24, 15, '#d9c4b2'); text(c, L({ it: 'caldo: roccia compatta', en: 'warm: solid rock' }), gx + gw, y0 + 24, 15, '#d9c4b2', 400, 'right'); x = gx + gw + 24; text(c, L({ it: 'THEMIS di notte: chi trattiene il calore è roccia', en: 'THEMIS at night: what holds heat is rock' }), x, y0, 17, '#d9c4b2'); }
    x = 120; const y1 = y0 + 52; text(c, L({ it: 'PUNTINE', en: 'PINS' }), 24, y1, 17, '#7fe0ff', 700);
    const dot = (col, lab) => { c.fillStyle = col; c.beginPath(); c.arc(x + 9, y1 - 6, 9, 0, 7); c.fill(); text(c, lab, x + 26, y1, 18, '#fff', 500); x += 26 + c.measureText(lab).width + 26; };
    c.fillStyle = '#33e6ff'; c.fillRect(x, y1 - 9, 26, 5); text(c, L({ it: 'percorso EVA', en: 'EVA route' }), x + 34, y1, 18, '#fff', 500); x += 34 + c.measureText(L({ it: 'percorso EVA', en: 'EVA route' })).width + 24;
    dot('#ffffff', L({ it: 'tappe', en: 'stops' })); dot('#ffd166', 'base'); dot('#ffa040', L({ it: 'campioni', en: 'samples' })); dot('#33e6ff', L({ it: 'rover nel sol', en: 'rover on sol' })); dot('#ff3b3b', L({ it: 'punto letto', en: 'queried point' }));
  }
  redraw() {
    const q = this.q, lim = this.app.site.mission.slopeLimitsDeg;
    this.con.draw((c, W, Hh) => {
      this.room.frame(c, W, Hh, '#7fe0ff'); text(c, L({ it: 'PLASTICO DEL FRONTE DEL DELTA', en: 'DELTA FRONT TERRAIN MODEL' }), 24, 52, 28, '#7fe0ff', 700);
      text(c, L({ it: `7,2 km di lato · rilievo ×${this.EX} · nord come sulla mappa`, en: `7.2 km across · relief ×${this.EX} · north as on the map` }), W - 24, 52, 15, '#d9c4b2', 500, 'right');
      for (const b of this.btns()) { const on = b.i === this.layer, hov = b.i === this.hov; rrect(c, b.x, b.y, b.w, b.h, 14); c.fillStyle = on ? '#7fe0ff' : hov ? 'rgba(127,224,255,0.35)' : 'rgba(255,255,255,0.1)'; c.fill(); text(c, L(LAYERS[b.i].n), b.x + b.w / 2, b.y + 42, 25, on ? '#1a0f0a' : '#fff', 700, 'center'); }
      this.legend(c, W, Hh, lim);
      let y = 200;
      if (!q) { y = wrap(c, L({ it: 'Punta un punto del plastico e premi il grilletto (al PC: clic) per leggere coordinate, quota, pendenza, minerali e calore notturno in quel punto.', en: 'Point at the model and pull the trigger (on PC: click) to read coordinates, elevation, slope, minerals and night-time heat at that spot.' }), 24, y, W - 48, 23, 31, '#fff'); return; }
      const row = (a, b, col = '#fff') => { text(c, a, 24, y, 22, '#d9c4b2'); text(c, b, 330, y, 24, col, 600); y += 34; };
      row(L({ it: 'Coordinate', en: 'Coordinates' }), `${num(q.la, 5)}° N · ${num(q.lo, 5)}° E`);
      row(L({ it: 'Quota (MOLA)', en: 'Elevation (MOLA)' }), `${Math.round(q.elev)} m`);
      row(L({ it: 'Pendenza', en: 'Slope' }), `${Math.round(q.sl)}° · ${L([{ it: 'agevole', en: 'easy' }, { it: 'impegnativa', en: 'demanding' }, { it: 'critica', en: 'critical' }, { it: 'oltre il limite della tuta', en: 'beyond suit limit' }][q.k])}`, SLOPE_COL[q.k]);
      row(L({ it: 'Minerali (CRISM)', en: 'Minerals (CRISM)' }), q.mineral ? L(q.mineral) : L({ it: 'nessun segnale forte', en: 'no strong signal' }));
      row(L({ it: 'Infrarosso notturno', en: 'Night-time infrared' }), q.lum == null ? '—' : q.lum > 170 ? L({ it: 'caldo: roccia compatta', en: 'warm: solid rock' }) : q.lum > 80 ? L({ it: 'intermedio', en: 'intermediate' }) : L({ it: 'freddo: sabbia o polvere', en: 'cold: sand or dust' }));
      row(L({ it: 'Tappa più vicina', en: 'Nearest stop' }), `${q.near.name} · ${fmtDist(q.nd)}`);
    });
  }
}

// ---------------------------------------------------------------- data boards
export function toolBoards(room, mk) {
  const app = room.app, site = app.site, B = (topic, colr, render, extra = {}) => ({ kind: 'tool', pnl: mk(), render: (c, W, H) => { room.frame(c, W, H, colr); room.band(c, W, colr, L(topic)); render(c, W, H); }, ...extra });
  const RES = { it: 'STRUMENTI PER LA RICERCA', en: 'RESEARCH TOOLS' };
  // sample register
  const samples = B(RES, '#ffd166', (c, W, H) => {
    text(c, L({ it: 'Registro dei campioni in quest\'area', en: 'Samples collected in this area' }), 30, 88, 32, '#fff', 700);
    const d = room.data; if (!d) { text(c, '…', 30, 140, 24, '#d9c4b2'); return; }
    const cols = [30, 230, 430, 690], hy = 136; [{ it: 'Campione', en: 'Sample' }, { it: 'Sol e data', en: 'Sol and date' }, { it: 'Roccia', en: 'Rock' }, { it: 'Deposito', en: 'Depot' }].forEach((h, i) => text(c, L(h).toUpperCase(), cols[i], hy, 18, '#ffd166', 700));
    let y = hy + 40; for (const s of d.samples) { text(c, s.name, cols[0], y, 23, '#fff', 700); text(c, s.outcrop, cols[0], y + 24, 17, '#d9c4b2');
      text(c, `sol ${s.sol}`, cols[1], y, 22, '#fff'); text(c, fmtDate(solDate(s.sol), false), cols[1], y + 24, 17, '#d9c4b2'); wrap(c, L(s.rock), cols[2], y, 240, 21, 24, '#fff');
      text(c, s.depot ? `sol ${s.depot}` : '—', cols[3], y, 22, s.depot ? '#ffd166' : '#8a7a6c'); y += 62; }
    y = wrap(c, L({ it: `Deposito di Three Forks (sol ${d.depot[0][1]}–${d.depot[d.depot.length - 1][1]}): ${d.depot.length} provette posate a terra come riserva, tra cui campioni presi altrove nel cratere: ${d.depot.map(x => x[0]).join(', ')}.`, en: `Three Forks depot (sols ${d.depot[0][1]}–${d.depot[d.depot.length - 1][1]}): ${d.depot.length} tubes left on the ground as a backup, including samples taken elsewhere in the crater: ${d.depot.map(x => x[0]).join(', ')}.` }), 30, y + 6, W - 60, 19, 25, '#fff');
    wrap(c, L({ it: 'Sol di prelievo: sol con immagini CacheCam della provetta (feed raw NASA). Sol di deposito: WUSTL Analyst\'s Notebook. I campioni sono in coppia: uno resta sul rover, il gemello è nel deposito.', en: 'Collection sol: sols with CacheCam images of the tube (NASA raw feed). Depot sol: WUSTL Analyst\'s Notebook. Samples come in pairs: one stays on the rover, its twin is in the depot.' }), 30, H - 66, W - 60, 17, 22, '#8a7a6c');
  }, { needsData: true });
  // route profile, computed from the terrain the astronaut walks on
  let prof = null; const profile = () => { if (prof) return prof; const pts = []; let dist = 0, stops = [0];
    site.route.forEach(seg => { for (let i = 1; i < seg.length; i++) { const [x0, y0] = seg[i - 1], [x1, y1] = seg[i], L0 = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(L0 / 5));
      for (let k = (i === 1 && pts.length ? 1 : 0); k <= n; k++) { const f = k / n, x = x0 + (x1 - x0) * f, y = y0 + (y1 - y0) * f; pts.push([dist + L0 * f, (app.ground(x, -y) ?? 0) + app.h0, app.slope(x, -y)]); } dist += L0; } stops.push(dist); });
    return prof = { pts, stops, dist }; };
  const route = B(RES, '#7fe0ff', (c, W, H) => {
    text(c, L({ it: 'Profilo del percorso dell\'uscita', en: 'EVA route profile' }), 30, 88, 32, '#fff', 700);
    const { pts, stops, dist } = profile(), lim = site.mission.slopeLimitsDeg, x0 = 90, x1 = W - 30, y0 = 120, y1 = 400; let lo = Infinity, hi = -Infinity; for (const p of pts) { lo = Math.min(lo, p[1]); hi = Math.max(hi, p[1]); } lo = Math.floor(lo / 10) * 10; hi = Math.ceil(hi / 10) * 10;
    const X = d => x0 + d / dist * (x1 - x0), Y = h => y1 - (h - lo) / (hi - lo) * (y1 - y0);
    c.strokeStyle = 'rgba(255,255,255,0.12)'; c.lineWidth = 1; for (let h = lo; h <= hi; h += 10) { c.beginPath(); c.moveTo(x0, Y(h)); c.lineTo(x1, Y(h)); c.stroke(); text(c, String(h), x0 - 8, Y(h) + 6, 15, '#8a7a6c', 500, 'right'); }
    for (let i = 1; i < pts.length; i++) { const p = pts[i], q = pts[i - 1], k = p[2] < lim[0] ? 0 : p[2] < lim[1] ? 1 : p[2] < lim[2] ? 2 : 3; c.fillStyle = SLOPE_COL[k]; c.globalAlpha = 0.85; c.fillRect(X(q[0]), Y(p[1]), Math.max(1, X(p[0]) - X(q[0]) + 0.5), y1 - Y(p[1])); }
    c.globalAlpha = 1; const order = [site.legs[0].frm, ...site.legs.map(l => l.to)], name = id => site.pois.find(p => p.id === id)?.name;
    stops.forEach((d, i) => { c.fillStyle = '#fff'; c.fillRect(X(d) - 1, y0, 2, y1 - y0); text(c, (i === stops.length - 1 ? L({ it: 'rientro', en: 'return' }) : name(order[i])) || '', X(d) + (i === stops.length - 1 ? -6 : 6), y0 + 18 + (i % 2) * 22, 17, '#fff', 600, i === stops.length - 1 ? 'right' : 'left'); });
    text(c, L({ it: 'quota MOLA (m) / distanza', en: 'MOLA elevation (m) / distance' }), x0, y1 + 26, 16, '#8a7a6c'); text(c, fmtDist(dist), x1, y1 + 26, 16, '#8a7a6c', 500, 'right');
    let y = 470; const cols = [30, 420, 560, 690]; [{ it: 'Tratto', en: 'Leg' }, { it: 'Lunghezza', en: 'Length' }, { it: 'Salita', en: 'Climb' }, { it: 'Pendenza max', en: 'Max slope' }].forEach((h, i) => text(c, L(h).toUpperCase(), cols[i], y, 17, '#7fe0ff', 700)); y += 30;
    site.legs.forEach(l => { const k = l.maxSlope < lim[0] ? 0 : l.maxSlope < lim[1] ? 1 : l.maxSlope < lim[2] ? 2 : 3; text(c, `${name(l.frm)} → ${name(l.to)}`, cols[0], y, 20, '#fff'); text(c, fmtDist(l.length), cols[1], y, 20, '#fff'); text(c, `+${Math.round(l.climb)} m`, cols[2], y, 20, '#fff'); text(c, `${Math.round(l.maxSlope)}°`, cols[3], y, 20, SLOPE_COL[k], 700); y += 30; });
    text(c, L({ it: 'Calcolato sul modello HiRISE 1 m lungo il percorso a costo minimo; colori = classi di pendenza.', en: 'Computed on the 1 m HiRISE model along the least-cost route; colours = slope classes.' }), 30, H - 22, 17, '#8a7a6c');
  });
  // MEDA weather
  const meda = B(RES, '#ff9a52', (c, W, H) => {
    text(c, L({ it: 'Meteo a Jezero: temperatura dell\'aria (MEDA)', en: 'Weather at Jezero: air temperature (MEDA)' }), 30, 88, 30, '#fff', 700);
    const d = room.data; if (!d) return; const m = d.meda, x0 = 90, x1 = W - 30, y0 = 120, y1 = 440, smax = 1500, X = s => x0 + s / smax * (x1 - x0), Y = t => y1 - (t + 100) / 100 * (y1 - y0);
    c.fillStyle = 'rgba(127,224,255,0.12)'; c.fillRect(X(460), y0, X(710) - X(460), y1 - y0); text(c, L({ it: 'fronte del delta', en: 'delta front' }), X(585), y0 + 20, 16, '#7fe0ff', 600, 'center');
    c.strokeStyle = 'rgba(255,255,255,0.12)'; for (let t = -100; t <= 0; t += 20) { c.beginPath(); c.moveTo(x0, Y(t)); c.lineTo(x1, Y(t)); c.stroke(); text(c, `${t}°`, x0 - 8, Y(t) + 6, 15, '#8a7a6c', 500, 'right'); }
    for (let s = 0; s <= smax; s += 250) text(c, String(s), X(s), y1 + 22, 15, '#8a7a6c', 500, 'center');
    for (const [s, lo, hi] of m) { c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 2; c.beginPath(); c.moveTo(X(s), Y(lo)); c.lineTo(X(s), Y(hi)); c.stroke(); c.fillStyle = '#7fb6ff'; c.beginPath(); c.arc(X(s), Y(lo), 6, 0, 7); c.fill(); c.fillStyle = '#ff9a52'; c.beginPath(); c.arc(X(s), Y(hi), 6, 0, 7); c.fill(); }
    const lows = m.map(v => v[1]), highs = m.map(v => v[2]), avg = a => a.reduce((x, y) => x + y, 0) / a.length, pr = m.filter(v => v[3]).map(v => v[3]);
    let y = 490; y = wrap(c, L({ it: `${m.length} sol con dati. Minime tra ${Math.round(Math.min(...lows))} e ${Math.round(Math.max(...lows))} °C (media ${Math.round(avg(lows))}), massime tra ${Math.round(Math.min(...highs))} e ${Math.round(Math.max(...highs))} °C (media ${Math.round(avg(highs))}): ogni giorno l'aria cambia di circa ${Math.round(avg(highs) - avg(lows))} °C.` + (pr.length ? ` Pressione nei sol ${m.filter(v => v[3])[0][0]}–${m.filter(v => v[3]).slice(-1)[0][0]}: circa ${Math.round(avg(pr))} Pa, meno dell'1% di quella terrestre.` : ''),
      en: `${m.length} sols with data. Lows between ${Math.round(Math.min(...lows))} and ${Math.round(Math.max(...lows))} °C (mean ${Math.round(avg(lows))}), highs between ${Math.round(Math.min(...highs))} and ${Math.round(Math.max(...highs))} °C (mean ${Math.round(avg(highs))}): the air swings by about ${Math.round(avg(highs) - avg(lows))} °C every day.` + (pr.length ? ` Pressure on sols ${m.filter(v => v[3])[0][0]}–${m.filter(v => v[3]).slice(-1)[0][0]}: about ${Math.round(avg(pr))} Pa, less than 1% of Earth's.` : '') }), 30, y, W - 60, 20, 27, '#fff');
    text(c, L({ it: 'blu: minima · arancio: massima · asse: sol', en: 'blue: low · orange: high · axis: sol' }), 30, y + 8, 17, '#d9c4b2');
    wrap(c, L({ it: 'Sensori ATS di MEDA, file calibrati del PDS (sol estratti dalla squadra) e bollettino meteo NASA Mars 2020.', en: 'MEDA ATS sensors, calibrated PDS files (sols extracted by the team) and the NASA Mars 2020 weather bulletin.' }), 30, H - 44, W - 60, 17, 22, '#8a7a6c');
  }, { needsData: true });
  // data catalogue
  const CAT = [
    ['HiRISE DTM + orto', '1 m / 25 cm', 'Mars 2020 TRN, USGS · doi:10.5066/P9REJ9JN'], ['CTX DTM + orto', '20 m / 6 m', 'Mars 2020 TRN, USGS · doi:10.5066/P906QQT8'],
    ['CRISM MTRDR', '18 m', 'FRT00005C5E · pds-geosciences.wustl.edu'], ['THEMIS IR notte', '100 m', 'Mars Odyssey, mosaico globale · ASU'],
    ['MOLA, TES, THEMIS giorno', '0,46–7,4 km', 'trek.nasa.gov/mars (WMTS)'], ['Viking MDIM 2.1', '232 m', 'trek.nasa.gov/mars'],
    ['Posizioni M20', '1 per guida', 'mars.nasa.gov · MMGIS waypoints'], ['Immagini raw', 'per sol', 'mars.nasa.gov/mars2020/multimedia/raw-images'], ['MEDA', 'per sol', 'PDS Atmospheres · bollettino NASA'],
  ];
  const cat = B(RES, '#b3ffcf', (c, W, H) => {
    text(c, L({ it: 'Catalogo dei dati usati', en: 'Data catalogue' }), 30, 88, 32, '#fff', 700); let y = 136;
    [{ it: 'Dato', en: 'Dataset' }, { it: 'Risoluzione', en: 'Resolution' }, { it: 'Prodotto e fonte', en: 'Product and source' }].forEach((h, i) => text(c, L(h).toUpperCase(), [30, 330, 500][i], y, 17, '#b3ffcf', 700)); y += 34;
    for (const [a, b, s] of CAT) { text(c, a, 30, y, 20, '#fff', 700); text(c, lang.cur === 'en' ? b.replace(',', '.') : b, 330, y, 20, '#fff'); wrap(c, s, 500, y, W - 530, 18, 22, '#d9c4b2'); y += 50; }
    wrap(c, L({ it: 'File da scaricare (al PC, angolo in basso a destra, oppure dal sito): research/eva_route.geojson, eva_stops.csv, perseverance_sols.csv, activity.json. Coordinate in gradi planetocentrici, quote riferite a MOLA.', en: 'Downloadable files (on PC, bottom-right corner, or from the website): research/eva_route.geojson, eva_stops.csv, perseverance_sols.csv, activity.json. Coordinates in planetocentric degrees, elevations referred to MOLA.' }), 30, H - 78, W - 60, 18, 24, '#b3ffcf');
  });
  return [samples, route, meda, cat];
}
