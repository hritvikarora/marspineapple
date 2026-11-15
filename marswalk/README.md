# Marswalk — prova generale di un'uscita a piedi su Marte

Progetto per il NASA Space Apps Challenge 2026, sfida *Interplanetary Survival Guide: Martian Map*.

Un simulatore VR (Meta Quest 2, oppure PC) in cui un astronauta prova in anticipo una passeggiata scientifica sul fronte del delta del cratere Jezero. Il terreno e le immagini sono dati reali delle missioni NASA.

**Demo:** https://gabryg07.github.io/mars-eva-vr/

**Riepilogo del progetto (PDF):** [docs/Marswalk_riepilogo.pdf](docs/Marswalk_riepilogo.pdf)

## Dati NASA usati

| Dato | Missione e strumento | Fonte |
| --- | --- | --- |
| Modello del terreno a 1 m | Mars Reconnaissance Orbiter, HiRISE | USGS Astrogeology, mosaici Mars 2020 Terrain Relative Navigation |
| Immagine ottica a 25 cm | Mars Reconnaissance Orbiter, HiRISE | USGS Astrogeology, mosaici Mars 2020 TRN |
| Terreno e immagine di contesto (20 m, 6 m) | Mars Reconnaissance Orbiter, CTX | USGS Astrogeology, mosaici Mars 2020 TRN |
| Minerali (olivina, argille, carbonati) a 18 m | Mars Reconnaissance Orbiter, CRISM (osservazione FRT00005C5E) | PDS Geosciences Node, prodotti MTRDR |
| Infrarosso notturno a 100 m | Mars Odyssey, THEMIS | USGS Astrogeology, mosaico globale |
| Percorso e tappe del rover | Mars 2020 Perseverance | NASA/JPL-Caltech, mappa "Where is Perseverance" |
| Foto nei punti di interesse | Mars 2020 Perseverance, Mastcam-Z e Navcam | NASA/JPL-Caltech/ASU, immagini raw |
| Meteo (temperatura, pressione, tramonto) | Mars 2020 Perseverance, MEDA | NASA/JPL-Caltech/CAB |
| Dose di radiazione in superficie | Mars Science Laboratory Curiosity, RAD | Hassler et al., Science 2014 (valore di riferimento, cratere Gale) |

Verifiche fatte sui dati:

- sulle 132 posizioni del rover dentro l'area, la quota riportata dal rover e quella del nostro terreno differiscono in media di 1 cm (deviazione standard 7 cm);
- la mappa CRISM è stata riallineata all'immagine CTX per correlazione della riflettanza a 770 nm: corretto uno scarto di 272 m (correlazione 0,62 dopo la correzione, 0,01 prima).

## Cosa fa

- **Uscita guidata**: sei tappe reali di Perseverance (Three Forks, Cape Nukshak, Yori Pass, Wildcat Ridge, Rocky Top) con scheda e foto del rover scattata in quel punto.
- **Percorso sicuro**: cammino a costo minimo sulle pendenze HiRISE a 1 m, che evita i tratti oltre il limite della tuta (2,2 km in tutto).
- **HUD di sopravvivenza**: ora locale marziana, ossigeno e autonomia, tempo di rientro alla base, dose di radiazione, pendenza sotto i piedi, allarmi di rientro per ossigeno e tramonto.
- **Cinque livelli di dati** sovrapposti al terreno: immagine, pendenza e pericoli, quota, minerali, infrarosso notturno.
- **Vista dall'alto** per pianificare l'uscita e poi tornare nello stesso punto.
- **Dati e fonti** consultabili dentro l'esperienza.

Il modello di missione (velocità di cammino, consumo di ossigeno, limiti di pendenza) è un insieme di ipotesi dichiarate, tutte in `pipeline/sites/jezero-delta.json`.

## Struttura

- `app/` — applicazione WebXR (Three.js, Vite). `npm install && npm run dev`.
- `pipeline/` — script Python che scaricano e ritagliano i dati per un sito. Tutto ciò che dipende dal luogo sta in `pipeline/sites/<id>.json`: cambiando coordinate e sorgenti la stessa app funziona per un'altra zona.
- `test/` — prove automatiche con Chromium e un Quest 2 emulato (IWER).

## Uso dell'intelligenza artificiale

Il codice è stato scritto con l'assistenza di Claude (Anthropic). I dati sono esclusivamente dati NASA/USGS pubblici; nessun dato è stato generato con IA.
