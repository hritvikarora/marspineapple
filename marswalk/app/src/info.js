// Wrist panel (legend of the active data layer, weather, controls) and the "data and sources" board.
// Everything shown here is read from the site file, so a new site brings its own credits.
import * as THREE from 'three';
import { Panel, rrect, text, wrap, fmtHM, fmtDist } from './ui.js';
import { lmstStr } from './mission.js';
import { T, P, num } from './i18n.js';

export class Wrist {
  constructor(app) {
    this.app = app; this.panel = new Panel(0.26, 0.17, 2600, { depthTest: true }); const m = this.panel.mesh; m.visible = false;
    m.position.set(0, 0.1, 0.03); m.rotation.x = -0.85; this.dom = document.getElementById('legend'); this.draw();
  }
  attach() { const h = this.app.player.hands.left, m = this.panel.mesh; if (h && m.parent !== h) { h.add(m); m.visible = true; } else if (!h && m.parent) { m.parent.remove(m); m.visible = false; } }
  draw() {
    const { app } = this, L = app.LAYERS[app.layer], w = app.site.weather, track = app.shared.uTrackOn.value > 0.5;
    this.panel.draw((c, W, H) => {
      rrect(c, 3, 3, W - 6, H - 6, 22); c.fillStyle = 'rgba(14,9,6,0.88)'; c.fill(); c.lineWidth = 3; c.strokeStyle = 'rgba(255,170,110,0.8)'; c.stroke();
      text(c, 'LIVELLO DATI', 26, 42, 20, '#ffb37a', 600); text(c, `${app.layer + 1}/${app.LAYERS.length}`, W - 26, 42, 20, '#d9c4b2', 500, 'right');
      text(c, L.name, 26, 86, 38, '#fff', 700); text(c, L.src, 26, 116, 20, '#d9c4b2');
      let y = 152; for (const [col, label] of L.legend) { if (!label) continue; c.fillStyle = col; rrect(c, 26, y - 18, 34, 22, 5); c.fill(); text(c, label, 72, y, 23, '#fff'); y += 30; }
      if (!L.legend.length) { y = wrap(c, 'Linea azzurra: percorso sicuro. Fasci di luce: tappe.' + (track ? ' Linea bianca: traccia reale di Perseverance.' : ''), 26, y, W - 52, 23, 30, '#fff'); }
      else { if (L.note) y = wrap(c, L.note, 26, y + 2, W - 52, 21, 27, '#d9c4b2'); if (track) text(c, 'Linea bianca: traccia reale di Perseverance', 26, y, 21, '#fff'); }
      const by = H - 78; c.fillStyle = 'rgba(255,255,255,0.14)'; c.fillRect(22, by - 30, W - 44, 2);
      if (w) text(c, `Meteo MEDA sol ${w.sol}: ${Math.round(w.min_temp)} / ${Math.round(w.max_temp)} °C · ${Math.round(w.pressure)} Pa`, 26, by, 21, '#7fe0ff', 600);
      text(c, 'A livello · B traccia rover · X fonti dei dati · Y ricomincia', 26, by + 32, 20, '#d9c4b2'); text(c, 'grilletto dx vista dall\'alto · stick dx teletrasporto', 26, by + 58, 20, '#d9c4b2');
    });
    if (this.dom) this.dom.innerHTML = `<b>${L.name}</b><small>${L.src}</small>` + L.legend.filter(l => l[1]).map(([c, t]) => `<span><i style="background:${c}"></i>${t}</span>`).join('') +
      (track ? `<span><i style="background:#fff"></i>${T('traccia reale di Perseverance')}</span>` : '') + `<span><i style="background:#33e6ff"></i>${T('percorso sicuro')}</span>`;
  }
}

export class Credits {
  constructor(app) {
    this.app = app; this.panel = new Panel(2.6, 2.3, 1280 / 2.6, { depthTest: false }); this.panel.mesh.visible = false; this.panel.mesh.renderOrder = 150; app.scene.add(this.panel.mesh);
    this.draw();
  }
  draw() {
    const app = this.app, s = app.site, m = s.mission, w = s.weather, g = s.georefCheck, rows = [
      
      [T('Immagine'), T('Ortomosaico MRO HiRISE 25 cm/pixel e CTX 6 m/pixel (mosaici «Mars 2020 Terrain Relative Navigation», USGS Astrogeology)'), 'NASA/JPL-Caltech/University of Arizona/MSSS/USGS'],
      [T('Topografia'), T('Modello del terreno HiRISE 1 m e CTX 20 m; pendenze e quote calcolate da questi (doi:10.5066/P9REJ9JN e 10.5066/P906QQT8)') + (g ? T`. Verifica: su ${g.n} posizioni del rover lo scarto in quota è ${num(Math.abs(g.meanDz), 2)} ± ${num(g.stdDz, 2)} m` : ''), 'NASA/JPL-Caltech/University of Arizona/USGS'],
      ['Rover', T('Posizioni sol per sol e traccia di Perseverance (localizzazione ufficiale Mars 2020); foto dalle immagini raw di Mastcam-Z, Navcam e Hazcam; temperature per sol alle tappe dai file MEDA del PDS; modello 3D del rover: NASA/JPL-Caltech, semplificato per il visore'), 'NASA/JPL-Caltech/ASU'],
      ...(s.overlays?.minerals ? [[T('Minerali'), T`Spettrometro CRISM di MRO, osservazione FRT00005C5E a 18 m/pixel: indici di olivina, argille e carbonati (Viviano-Beck et al. 2014). Riallineato all'immagine CTX per correlazione: corretto uno scarto di ${Math.round(Math.hypot(...(s.overlays.minerals.shiftM || [0, 0])))} m`, 'NASA/JPL-Caltech/JHUAPL']] : []),
      ...(s.overlays?.thermal ? [[T('Infrarosso'), T('Mosaico notturno THEMIS di Mars Odyssey, 100 m/pixel: quanto il suolo trattiene il calore, cioè roccia compatta oppure sabbia'), 'NASA/JPL-Caltech/Arizona State University']] : []),
      [T('Meteo'), w ? T`Stazione MEDA di Perseverance, sol ${w.sol}: da ${Math.round(w.min_temp)} a ${Math.round(w.max_temp)} °C, ${Math.round(w.pressure)} Pa, tramonto alle ${String(w.sunset).slice(0, 5)}` : T('Stazione MEDA di Perseverance'), 'NASA/JPL-Caltech/CAB (CSIC-INTA)'],
      [T('Radiazioni'), T`${num(m.radiation.mSvPerDay)} mSv al giorno in superficie, misurati da Curiosity RAD nel cratere Gale (Hassler et al., Science 2014): valore di riferimento, a Jezero non c'è un rivelatore`, 'NASA/JPL-Caltech/SwRI'],
      [T('Suoni'), T('Vento registrato dal microfono SuperCam di Perseverance ai sol 4, 685, 690 e 697 (PDS, mars2020_supercam, audio calibrato), solo filtrato e livellato'), 'NASA/JPL-Caltech/LANL/CNES/IRAP'],
      [T('Globo'), T('Mosaico globale a colori Viking MDIM 2.1 (NASA Mars Trek, USGS Astrogeology)'), 'NASA/JPL-Caltech/USGS'],
      [T('Modello'), T`Passo: funzione di Tobler scalata a ${num(m.walk.flatSpeed)} m/s in piano. Ossigeno: lavoro metabolico con tuta (${m.metabolic.massKg} kg, gravità ${num(m.gravity)} m/s²), riserva del ${Math.round(m.oxygen.reserveFraction * 100)}%. Limiti di pendenza ${m.slopeLimitsDeg.join('°, ')}°. Parametri modificabili nel file del sito.`, T('Squadra')],
    ];
    this.panel.draw((c, W, H) => {
      rrect(c, 4, 4, W - 8, H - 8, 30); c.fillStyle = 'rgba(14,9,6,0.94)'; c.fill(); c.lineWidth = 4; c.strokeStyle = '#ffb37a'; c.stroke();
      text(c, T('Dati e fonti'), 44, 76, 46, '#fff', 700); text(c, P(s, 'name'), W - 44, 76, 24, '#d9c4b2', 500, 'right');
      let y = 124; for (const [k, t, cr] of rows) { text(c, k.toUpperCase(), 44, y, 20, '#ffb37a', 700); const y2 = wrap(c, t, 230, y, W - 274, 22, 28, '#fff'); text(c, cr, 230, y2 - 3, 18, '#7fe0ff'); y = y2 + 30; }
      text(c, T('Premi di nuovo X (o C sulla tastiera) per chiudere'), W / 2, H - 34, 21, '#d9c4b2', 400, 'center');
    });
  }
  toggle() {
    const m = this.panel.mesh; m.visible = !m.visible; this.app.hud.panel.mesh.visible = !m.visible; if (!m.visible) return;
    const p = this.app.player, h = p.head(), a = p.headYaw(), ux = -Math.sin(a), uz = -Math.cos(a), r = 2.3;
    m.position.set(h.x + ux * r, h.y + 0.05, h.z + uz * r); m.rotation.set(0, Math.atan2(-ux, -uz), 0);
  }
}

// End-of-EVA debrief: what the walk cost in time, oxygen and dose, shown when the astronaut is back at base.
export class Debrief {
  constructor(app) { this.app = app; this.panel = new Panel(2.2, 1.45, 1024 / 2.2, { depthTest: false }); this.panel.mesh.visible = false; this.panel.mesh.renderOrder = 140; app.scene.add(this.panel.mesh); this.shown = false; }
  update() {
    const { mission, player } = this.app, m = this.panel.mesh;
    if (!mission.done) { if (this.shown) { this.shown = false; m.visible = false; } return; }
    if (this.shown) return; this.shown = true;
    const p = mission.p, st = mission.state(player.head()), used = 1 - st.o2Frac, lim = p.slopeLimitsDeg, k = mission.peakSlope < lim[0] ? 0 : mission.peakSlope < lim[1] ? 1 : mission.peakSlope < lim[2] ? 2 : 3;
    const cls = [[T('agevole'), '#35d07f'], [T('impegnativa'), '#f6d21f'], [T('critica'), '#ff8a1e'], [T('oltre il limite della tuta'), '#ff3b3b']][k], reserveOk = st.o2Frac >= p.oxygen.reserveFraction;
    const earthDays = mission.dose / (2400 / 365.25);
    const rows = [[T('Durata'), T`${fmtHM(mission.t)}, rientro alle ${lmstStr(st.lmst)} ora locale`, '#fff'], [T('Strada'), T`${fmtDist(mission.dist)} a piedi, ${Math.round(mission.climb)} m di salita`, '#fff'],
      [T('Ossigeno'), T`usato il ${Math.round(used * 100)}% della bombola, riserva del ${Math.round(p.oxygen.reserveFraction * 100)}% ${T(reserveOk ? 'rispettata' : 'intaccata')}`, reserveOk ? '#35d07f' : '#ff5a5a'],
      [T('Radiazioni'), T`${num(mission.dose, 1)} µSv, come ${num(earthDays, 1)} giorni di fondo naturale sulla Terra`, '#fff'], [T('Pendenza'), T`massima affrontata ${Math.round(mission.peakSlope)}°: ${cls[0]}`, cls[1]],
      [T('Luce'), st.daylight > 0 ? T`${fmtHM(st.daylight)} al tramonto` : T('rientro dopo il tramonto'), st.daylight > 1800 ? '#fff' : '#ff5a5a']];
    this.panel.draw((c, W, H) => {
      rrect(c, 4, 4, W - 8, H - 8, 30); c.fillStyle = 'rgba(14,9,6,0.93)'; c.fill(); c.lineWidth = 4; c.strokeStyle = '#5be08a'; c.stroke();
      text(c, T('Uscita completata'), 44, 82, 50, '#fff', 700); text(c, T`${Math.min(mission.visited.size - 1, mission.order.length - 2)} tappe su ${mission.order.length - 2} · rientro alla base`, 44, 124, 26, '#5be08a', 600);
      let y = 196; for (const [k2, t, col] of rows) { text(c, k2.toUpperCase(), 44, y, 22, '#ffb37a', 700); text(c, t, 230, y, 29, col, 500); y += 62; }
      text(c, T('Premi Y (R sulla tastiera) per ricominciare · X per i dati e le fonti'), W / 2, H - 36, 22, '#d9c4b2', 400, 'center');
    });
    const h = player.head(), a = player.headYaw(), ux = -Math.sin(a), uz = -Math.cos(a), r = 2.5; m.position.set(h.x + ux * r, h.y + 0.4, h.z + uz * r); m.rotation.set(0, Math.atan2(-ux, -uz), 0); m.visible = true;
  }
}
