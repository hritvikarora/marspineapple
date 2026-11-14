# Catena dei dati per la giuria / Data chain for the jury — Ruolo A (Irene)

Area: fronte occidentale del delta di Jezero, 949 m × 1000 m al suolo, centro ≈ 77,4035° E, 18,456° N. Bundle: `jezero-west-hirise-v0.1.0`.

## Italiano — la catena in 6 passi

| Passo | Cosa è **misurato** | Cosa è **derivato** | **Ipotesi di modello** | **Non disponibile** |
|---|---|---|---|---|
| 1. Osservazione originale | Immagini dall'orbita: camera HiRISE (~25 cm/pixel) e CTX (~6 m/pixel) sul Mars Reconnaissance Orbiter (NASA). Per le tappe: posizioni del rover Perseverance (JPL), panorami 360° Mastcam-Z, temperatura dell'aria MEDA. | — | — | Nessuna misura diretta di quota dal suolo nell'area; nessuna misura del suolo (durezza, sabbia profonda). |
| 2. Prodotto di quota pubblicato | — | USGS Astrogeology ha ricavato modelli del terreno (DTM) da coppie di immagini stereo: HiRISE 1 m (doi:10.5066/P9REJ9JN) e CTX 20 m (doi:10.5066/P906QQT8), creati per l'atterraggio di Mars 2020. | Fotogrammetria stereo del produttore; quote riferite all'areoide (verificato con le quote JPL, vedi limiti). | Qualità per pixel (il produttore dà solo statistiche globali: HiRISE↔CTX ~0,4 m). |
| 3. Ritaglio scelto | Abbiamo copiato i valori HiRISE **1:1, senza ricampionamento**: 1000 × 1000 celle. Controllo: 7 punti test identici al file originale (differenza 0,000 m). | Conversione in metri al suolo (fattore 0,9486 in direzione E-O per la proiezione). | Area scelta per coprire le tappe P3, P4, P5 sul fronte del delta. | Le altre tappe (P1, P2, P6–P9) sono fuori area. |
| 4. Attributi derivati | — | Pendenza (metodo di Horn, 3×3 celle, gradi), rugosità (scarto da un piano su 5×5 celle, metri), codici di qualità ed esclusione. Testati su superfici sintetiche note. | Il terreno tra i punti della griglia è liscio; la rugosità a 5 m rappresenta l'irregolarità locale. | Massi e ostacoli sotto il metro; qualità per cella (tutto "sconosciuto"). |
| 5. Calcolo del percorso (Ayush) | — | Percorsi su griglia con tre politiche (più breve fattibile, attento al terreno, attento all'incertezza) e metriche (distanza, salita, pendenza massima). | Profilo **dimostrativo** non validato: pendenza max 25°, grado max 20°, pesi provvisori. | Meteo, polvere, radiazioni, luce, comunicazioni, tempi e consumi EVA, meccanica del suolo. |
| 6. Visualizzazione (Dhani, vista 3D) | — | Mappa 2D, vista 3D del terreno con immagine HiRISE (2048 px, ~0,49 m/px), schede delle tappe con panorami e temperatura. | L'immagine è in scala di grigi, solo contesto; esagerazione verticale eventuale da dichiarare. | Colore reale; aspetto da vicino del suolo (lo danno solo i panorami del rover). |

**Frase per riassumere:** *"Ogni numero sulla mappa risale a un prodotto NASA/USGS citato; dove il dato non esiste (qualità per pixel, massi, meteo) lo diciamo invece di inventarlo."*

### Domande probabili della giuria e risposte (italiano semplice, per Irene)

**1. Da dove vengono i dati?**
Dalle foto scattate dall'orbita dalla sonda NASA Mars Reconnaissance Orbiter. L'USGS (il servizio geologico americano) le ha trasformate in mappe dell'altezza del terreno, preparate proprio per l'atterraggio di Perseverance. Sono pubbliche e le citiamo con il loro DOI.

**2. Quanto sono precise?**
Ogni cella è circa 1 metro. Abbiamo controllato che i nostri numeri siano identici al file originale (differenza zero in 7 punti di prova). E alle tre tappe le nostre altezze coincidono con quelle che la NASA ha registrato per il rover entro 5 centimetri.

**3. Perché le altezze sono negative (−2500 m)?**
Su Marte non c'è il mare: le altezze si misurano rispetto a una superficie di riferimento. Il fondo del cratere Jezero è circa 2,5 km sotto questa superficie, quindi i numeri sono negativi. È normale.

**4. Si vedono i sassi? Un astronauta inciamperebbe?**
No, non si vedono sassi più piccoli di circa un metro. Per questo diciamo che i percorsi sono una dimostrazione sul terreno, non un percorso sicuro garantito.

**5. Cosa vuol dire "qualità sconosciuta" su tutta la mappa?**
Chi ha fatto la mappa non dice quanto è affidabile ogni singolo punto, dice solo quanto è precisa in media. Invece di inventare un voto per ogni punto, scriviamo onestamente "sconosciuta".

**6. Il percorso è sicuro per una missione vera?**
No. Il calcolo usa solo la forma del terreno con limiti di pendenza di prova. Non considera meteo, polvere, radiazioni, comunicazioni o la durezza del suolo.

**7. Perché proprio questa zona?**
Perché Perseverance ci è passato davvero: ha preso campioni di roccia a Skinner Ridge e Wildcat Ridge, ha studiato la base del delta e ha lasciato dieci tubi di campioni a Three Forks. Possiamo quindi unire mappe dall'orbita e foto dal suolo.

**8. La temperatura mostrata è quella di quel posto?**
È la temperatura dell'aria misurata dal rover in un giorno marziano preciso (un "sol"), in quella stagione. Cambia molto tra giorno e notte (es. da −84 °C a −17 °C a Three Forks nel sol 690).

**9. Il pin indica esattamente la roccia?**
Indica dove stava il rover quando ha scattato il panorama. La roccia può essere a qualche metro o anche a decine di metri.

**10. Cosa sono osservazione e interpretazione?**
L'osservazione è quello che si vede (es. "rocce chiare a strati sottili"). L'interpretazione è cosa pensano gli scienziati che significhi (es. "fango depositato in un lago"). Le teniamo separate, e citiamo l'articolo scientifico.

**11. Avete trovato vita?**
No. A Wildcat Ridge la NASA ha rilevato segnali di molecole organiche, ma questo non è una prova di vita. Cheyava Falls (fuori dalla nostra area) è una "possibile biofirma" che va confermata in laboratorio sulla Terra.

**12. Se manca HiRISE cosa succede?**
C'è una versione più grossolana (celle da 20 m, dalla camera CTX). L'app la segnala chiaramente come "solo dimostrazione regionale".

**13. Si può rifare tutto?**
Sì. Gli script in `scripts/data/` riscaricano i dati e rifanno tutti i passaggi; ogni file ha un'impronta (SHA-256) che si può controllare.

## English — the chain in 6 steps

| Step | **Measured** | **Derived** | **Model assumption** | **Unavailable** |
|---|---|---|---|---|
| 1. Original observation | Orbital images: HiRISE (~25 cm/px) and CTX (~6 m/px) on NASA's Mars Reconnaissance Orbiter. For stops: JPL rover positions, Mastcam-Z 360° panoramas, MEDA air temperature. | — | — | No ground-based elevation measurement in the area; no soil properties. |
| 2. Published elevation product | — | USGS Astrogeology stereo DTMs: HiRISE 1 m (doi:10.5066/P9REJ9JN), CTX 20 m (doi:10.5066/P906QQT8), made for Mars 2020 landing. | Producer stereo photogrammetry; heights areoid-referenced (checked against JPL). | Per-pixel quality (global stats only: HiRISE↔CTX ~0.4 m). |
| 3. Selected crop | HiRISE values copied **1:1, no resampling**, 1000 × 1000 cells; 7 test points identical to source (0.000 m). | Ground-metre conversion (E-W factor 0.9486). | Area chosen to cover P3–P5. | P1, P2, P6–P9 outside. |
| 4. Derived attributes | — | Horn slope (3×3, deg), roughness (plane-fit residual RMS, 5×5, m), quality/exclusion codes; tested on synthetic planes. | Smooth terrain between samples; 5 m roughness = local irregularity. | Sub-metre obstacles; per-cell quality (all "unknown"). |
| 5. Route computation (Ayush) | — | Grid routes, three policies, metrics. | **Demo** profile, unvalidated: max slope 25°, max grade 20°, provisional weights. | Weather, dust, radiation, light, comms, EVA timing/consumables, soil mechanics. |
| 6. Visualization (Dhani, 3D) | — | 2D map, 3D terrain with HiRISE texture (2048 px, ~0.49 m/px), stop cards with panoramas and temperature. | Grayscale context image; declare any vertical exaggeration. | True colour; close-up ground appearance (only rover panoramas). |

**One-liner:** *"Every number on the map traces back to a cited NASA/USGS product; where data does not exist (per-pixel quality, boulders, weather) we say so instead of inventing it."*
