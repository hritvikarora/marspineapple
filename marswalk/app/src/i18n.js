// Two languages, one source: the Italian text is the key, English comes from the table below.
// T`testo ${valore}` and T('testo') both work; anything missing from the table falls back to Italian.
let saved = null; try { saved = localStorage.getItem('marswalk-lang'); } catch (e) { /* private mode */ }
export const lang = { cur: new URLSearchParams(location.search).get('lang') || saved || 'it' };
export function setLang(l) { lang.cur = l; try { localStorage.setItem('marswalk-lang', l); } catch (e) { /* ignore */ } document.documentElement.lang = l; }
export function T(s, ...v) {
  const key = typeof s === 'string' ? s : s.join('{}'); let out = lang.cur === 'en' ? (EN[key] ?? key) : key, i = 0;
  return v.length ? out.replace(/\{(\d*)\}/g, (m, n) => v[n === '' ? i++ : +n]) : out;
}
export const P = (o, k) => (lang.cur === 'en' && o[k + '_en']) || o[k];                       // translated field of a data object
export const num = (v, d) => { const s = d == null ? String(v) : (+v).toFixed(d); return lang.cur === 'en' ? s : s.replace('.', ','); };

const EN = {
  // HUD
  'AGEVOLE': 'EASY', 'IMPEGNATIVA': 'DEMANDING', 'CRITICA': 'CRITICAL', 'VIETATA': 'FORBIDDEN',
  'ORA LOCALE (LMST)': 'LOCAL TIME (LMST)', 'luce {}': 'daylight {}', 'OSSIGENO': 'OXYGEN', 'autonomia {}': 'endurance {}', 'rientro {}': 'way back {}', 'RADIAZIONI': 'RADIATION',
  'percorsi {} · salita {} m': 'walked {} · climb {} m', 'USCITA COMPLETATA': 'EVA COMPLETE', 'PROSSIMA TAPPA': 'NEXT STOP', 'IN ATTESA': 'STANDING BY', 'tappa {} di {}': 'stop {} of {}',
  'Sei rientrato alla base.': 'You are back at base.', 'Scegli le impostazioni': 'Choose your settings', 'e avvia la missione.': 'and start the mission.',
  'OSSIGENO: RIENTRA ALLA BASE': 'OXYGEN: RETURN TO BASE', 'TRAMONTO VICINO: RIENTRA ALLA BASE': 'SUNSET NEAR: RETURN TO BASE',
  'pendenza {}° {}': 'slope {}° {}', ' · andatura {}%': ' · pace {}%', 'livello: {}': 'layer: {}',
  // layers
  'Immagine satellitare': 'Satellite image', 'MRO HiRISE, 25 cm/pixel': 'MRO HiRISE, 25 cm/pixel', 'Pendenze e ostacoli': 'Slopes and obstacles', 'Derivata dal modello HiRISE a 1 m': 'Derived from the 1 m HiRISE terrain model',
  'sotto 10°: agevole': 'under 10°: easy', '10–20°: impegnativa': '10–20°: demanding', '20–30°: critica': '20–30°: critical', 'oltre 30°: vietata': 'over 30°: forbidden',
  'Topografia': 'Topography', 'Modello HiRISE agganciato a MOLA, isoipse ogni 5 m': 'HiRISE model tied to MOLA, contours every 5 m', 'più basso': 'lowest', 'più alto': 'highest',
  'Geologia: minerali': 'Geology: minerals', 'Spettrometro MRO CRISM, 18 m/pixel': 'MRO CRISM spectrometer, 18 m/pixel', 'Dove campionare: le argille e i carbonati si formano in acqua.': 'Where to sample: clays and carbonates form in water.',
  'olivina': 'olivine', 'argille di ferro e magnesio': 'iron-magnesium clays', 'carbonati': 'carbonates',
  'Temperatura: infrarosso': 'Temperature: infrared', 'Mars Odyssey THEMIS notturno, 100 m/pixel': 'Mars Odyssey THEMIS night-time, 100 m/pixel', 'caldo di notte: roccia compatta': 'warm at night: solid rock', 'intermedio': 'intermediate',
  'freddo di notte: sabbia e polvere': 'cold at night: sand and dust', 'Dove si cammina bene: la sabbia sciolta rallenta e affatica.': 'Where walking is easy: loose sand slows you down and tires you.',
  'traccia reale di Perseverance': 'real Perseverance track', 'percorso sicuro': 'safe route',
  // boot and help
  'Costruzione del terreno…': 'Building the terrain…', 'Caricamento dei dati orbitali…': 'Loading orbital data…', 'Errore: ': 'Error: ',
  "Prova generale di un'uscita a piedi su Marte: terreno e immagini reali delle missioni NASA, cratere Jezero.": 'Dress rehearsal of a walk on Mars: real terrain and images from NASA missions, Jezero crater.',
  '<b>PC</b>: clic sul menu per scegliere, poi clic per catturare il mouse · <b>WASD</b> cammina · <b>Shift</b> veloce · <b>L</b> livello dati · <b>I</b> display sul braccio · <b>M</b> vista dall\'alto · <b>T</b> traccia del rover · <b>C</b> fonti dei dati · <b>G</b> prendi il globo, <b>+</b>/<b>−</b> scala · <b>R</b> ricomincia<br><b>Quest</b>: stick sinistro cammina (grilletto laterale = veloce) · stick destro avanti = teletrasporto, lati = gira · <b>grilletto</b> sceglie nel menu · <b>grilletto destro</b> vista dall\'alto · <b>grilletto laterale destro</b> display sul braccio · <b>grilletti laterali</b> sul globo: prendi, con due mani ridimensiona · <b>A</b> livello dati · <b>B</b> traccia del rover · <b>X</b> fonti dei dati · <b>Y</b> ricomincia':
    '<b>PC</b>: click the menu to choose, then click to capture the mouse · <b>WASD</b> walk · <b>Shift</b> fast · <b>L</b> data layer · <b>I</b> arm display · <b>M</b> overhead view · <b>T</b> rover track · <b>C</b> data sources · <b>G</b> grab the globe, <b>+</b>/<b>−</b> scale · <b>R</b> restart<br><b>Quest</b>: left stick walks (grip = fast) · right stick forward = teleport, sideways = turn · <b>trigger</b> selects in the menu · <b>right trigger</b> overhead view · <b>right grip</b> arm display · <b>grips</b> on the globe: grab, two hands to resize · <b>A</b> data layer · <b>B</b> rover track · <b>X</b> data sources · <b>Y</b> restart',
  // POI cards
  'Foto reale: Perseverance, {}, sol {}': 'Real photo: Perseverance, {}, sol {}', 'Aria nel sol {} (MEDA): da {} a {} °C': 'Air on sol {} (MEDA): {} to {} °C',
  'Prossimo tratto verso {}: {}, salita {} m, pendenza massima {}°': 'Next leg to {}: {}, climb {} m, max slope {}°', 'Foto reali di Perseverance da questo punto': 'Real Perseverance photos from this spot',
  // credits
  'Dati e fonti': 'Data and sources', 'Premi di nuovo X (o C sulla tastiera) per chiudere': 'Press X again (or C on the keyboard) to close',
  'Immagine': 'Imagery', 'Ortomosaico MRO HiRISE 25 cm/pixel e CTX 6 m/pixel (mosaici «Mars 2020 Terrain Relative Navigation», USGS Astrogeology)': 'MRO HiRISE 25 cm/pixel and CTX 6 m/pixel orthomosaics ("Mars 2020 Terrain Relative Navigation" mosaics, USGS Astrogeology)',
  'Modello del terreno HiRISE 1 m e CTX 20 m; pendenze e quote calcolate da questi (doi:10.5066/P9REJ9JN e 10.5066/P906QQT8)': 'HiRISE 1 m and CTX 20 m terrain models; slopes and elevations computed from them (doi:10.5066/P9REJ9JN and 10.5066/P906QQT8)',
  '. Verifica: su {} posizioni del rover lo scarto in quota è {} ± {} m': '. Check: over {} rover positions the elevation offset is {} ± {} m',
  'Posizioni sol per sol e traccia di Perseverance (localizzazione ufficiale Mars 2020); foto dalle immagini raw di Mastcam-Z, Navcam e Hazcam; temperature per sol alle tappe dai file MEDA del PDS; modello 3D del rover: NASA/JPL-Caltech, semplificato per il visore': 'Sol-by-sol positions and track of Perseverance (official Mars 2020 localisation); photos from Mastcam-Z, Navcam and Hazcam raw images; per-sol temperatures at the stops from MEDA files on the PDS; rover 3D model: NASA/JPL-Caltech, simplified for the headset',
  'Minerali': 'Minerals', "Spettrometro CRISM di MRO, osservazione FRT00005C5E a 18 m/pixel: indici di olivina, argille e carbonati (Viviano-Beck et al. 2014). Riallineato all'immagine CTX per correlazione: corretto uno scarto di {} m": 'MRO CRISM spectrometer, observation FRT00005C5E at 18 m/pixel: olivine, clay and carbonate indices (Viviano-Beck et al. 2014). Co-registered to the CTX image by correlation: a {} m offset was corrected',
  'Infrarosso': 'Infrared', 'Mosaico notturno THEMIS di Mars Odyssey, 100 m/pixel: quanto il suolo trattiene il calore, cioè roccia compatta oppure sabbia': 'Mars Odyssey THEMIS night-time mosaic, 100 m/pixel: how well the ground holds heat, i.e. solid rock or sand',
  'Meteo': 'Weather', 'Stazione MEDA di Perseverance, sol {}: da {} a {} °C, {} Pa, tramonto alle {}': 'Perseverance MEDA station, sol {}: {} to {} °C, {} Pa, sunset at {}', 'Stazione MEDA di Perseverance': 'Perseverance MEDA station',
  'Radiazioni': 'Radiation', "{} mSv al giorno in superficie, misurati da Curiosity RAD nel cratere Gale (Hassler et al., Science 2014): valore di riferimento, a Jezero non c'è un rivelatore": '{} mSv per day at the surface, measured by Curiosity RAD in Gale crater (Hassler et al., Science 2014): a reference value, there is no detector at Jezero',
  'RECUPERO CAMPIONI': 'SAMPLE RECOVERY', 'SOLO DATI': 'DATA ONLY', "Missione: esci dall'airlock, segui la linea azzurra e rientra nella base. Recupero campioni: recupera le 10 provette lasciate da Perseverance a Three Forks. Solo dati: sala con cartine, foto e documentazione.": 'Mission: leave the airlock, follow the cyan line and come back to the base. Sample recovery: recover the 10 tubes Perseverance left at Three Forks. Data only: room with maps, photos and documentation.',
  'Suoni': 'Sounds', 'SUONI DI MARTE': 'MARS SOUNDS', 'muto': 'muted', 'Vento registrato dal microfono SuperCam di Perseverance ai sol 4, 685, 690 e 697 (PDS, mars2020_supercam, audio calibrato), solo filtrato e livellato': 'Wind recorded by the SuperCam microphone on Perseverance on sols 4, 685, 690 and 697 (PDS, mars2020_supercam, calibrated audio), only filtered and levelled',
  'Globo': 'Globe', 'Mosaico globale a colori Viking MDIM 2.1 (NASA Mars Trek, USGS Astrogeology)': 'Viking MDIM 2.1 global colour mosaic (NASA Mars Trek, USGS Astrogeology)',
  'Modello': 'Model', 'Passo: funzione di Tobler scalata a {} m/s in piano. Ossigeno: lavoro metabolico con tuta ({} kg, gravità {} m/s²), riserva del {}%. Limiti di pendenza {}°. Parametri modificabili nel file del sito.': 'Pace: Tobler function scaled to {} m/s on flat ground. Oxygen: metabolic work in a suit ({} kg, gravity {} m/s²), {}% reserve. Slope limits {}°. Parameters editable in the site file.',
  'Squadra': 'Team',
  // debrief
  'agevole': 'easy', 'impegnativa': 'demanding', 'critica': 'critical', 'oltre il limite della tuta': 'beyond the suit limit',
  'Durata': 'Duration', '{}, rientro alle {} ora locale': '{}, back at {} local time', 'Strada': 'Distance', '{} a piedi, {} m di salita': '{} on foot, {} m of climb',
  'Ossigeno': 'Oxygen', 'usato il {}% della bombola, riserva del {}% {}': '{}% of the tank used, {}% reserve {}', 'rispettata': 'kept', 'intaccata': 'breached',
  '{} µSv, come {} giorni di fondo naturale sulla Terra': '{} µSv, like {} days of natural background on Earth', 'Pendenza': 'Slope', 'massima affrontata {}°: {}': 'steepest walked {}°: {}',
  'Luce': 'Daylight', '{} al tramonto': '{} to sunset', 'rientro dopo il tramonto': 'returned after sunset', 'Uscita completata': 'EVA complete', '{} tappe su {} · rientro alla base': '{} of {} stops · back inside the base',
  'Premi Y (R sulla tastiera) per ricominciare · X per i dati e le fonti': 'Press Y (R on the keyboard) to restart · X for data and sources',
  // arm display
  'grilletto laterale': 'grip button', 'o tasto I per aprire': 'or I key to open', 'ZONA': 'AREA', 'Cratere Jezero, fronte del delta': 'Jezero crater, delta front', 'Latitudine': 'Latitude', 'Longitudine': 'Longitude',
  'Quota (MOLA)': 'Elevation (MOLA)', 'Dalla base': 'From base', 'METEO · MEDA SOL {}': 'WEATHER · MEDA SOL {}', 'Temperatura': 'Temperature', 'Pressione': 'Pressure', 'Alba e tramonto': 'Sunrise and sunset',
  'LIVELLO DATI': 'DATA LAYER', 'TAPPE': 'STOPS', 'Rientro': 'Return', "A livello dati · B traccia rover · X fonti · Y ricomincia · grilletto dx vista dall'alto · grilletto laterale dx chiude": 'A data layer · B rover track · X sources · Y restart · right trigger overhead view · right grip closes',
  'Dati: NASA/JPL-Caltech/University of Arizona/USGS': 'Data: NASA/JPL-Caltech/University of Arizona/USGS',
  // habitat
  'Cabina 101 kPa · 21 °C': 'Cabin 101 kPa · 21 °C', 'Tuta: pronta': 'Suit: ready', 'Airlock: libero': 'Airlock: clear', 'Airlock: chiuso': 'Airlock: closed', '{} tappe · {}': '{} stops · {}', 'Rientro prima del tramonto': 'Back before sunset',
  'Riserva O₂ {}%': 'O₂ reserve {}%', 'Segui la linea azzurra': 'Follow the cyan line',
  // menu
  "Prova generale di un'uscita a piedi su Marte": 'Dress rehearsal of a walk on Mars', 'LINGUA': 'LANGUAGE', 'CASCO': 'HELMET', 'ROVER COMPAGNO': 'COMPANION ROVER', 'ANDATURA': 'WALKING PACE', 'sì': 'on', 'no': 'off',
  'SOLO DATI: SALA RICERCA': 'DATA ONLY: RESEARCH ROOM', 'SALA DATI': 'RESEARCH ROOM', 'Nessuna missione attiva.': 'No mission running.', 'Y: torna al menu': 'Y: back to the menu',
  "Missione: esci dall'airlock, segui la linea azzurra e rientra nella base. Solo dati: entri nella sala con cartine, foto e documentazione per la ricerca.": 'Mission: leave through the airlock, follow the cyan line and come back inside the base. Data only: walk into the room with maps, photos and documentation for research.',
  'realistica': 'realistic', 'rapida': 'quick', 'INIZIA LA MISSIONE': 'START THE MISSION', 'Punta e premi il grilletto · al PC clic del mouse o Invio': 'Point and pull the trigger · on PC click or press Enter',
  'A sinistra: il globo di Marte. Prendilo con il grilletto laterale, con due mani lo ingrandisci.': 'On your left: the Mars globe. Grab it with the grip button, use both hands to resize it.',
  'Esci dall\'airlock, segui la linea azzurra e rientra nella base per completare la missione.': 'Leave through the airlock, follow the cyan line and come back inside the base to complete the mission.',
  // globe
  'Marte · scala 1:{} milioni': 'Mars · scale 1:{} million', 'Cratere Jezero': 'Jezero crater',
};
