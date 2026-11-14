# UI captions – Role A (for Dhani)

English first (UI language of the team repo), Italian below each. Source: `ui_captions.json`.

## Layers
| layer | EN name / units | EN legend | IT nome / unità | IT legenda |
|---|---|---|---|---|
| elevation | Elevation (m) | Height in metres relative to the Mars reference surface (areoid). Negative values are normal: the Jezero floor is about 2.5 km below the reference. | Quota (m) | Altezza in metri rispetto alla superficie di riferimento di Marte (areoide). I valori negativi sono normali: il fondo di Jezero è circa 2,5 km sotto il riferimento. |
| slope | Slope (°) | Terrain slope in degrees from the HiRISE 1 m terrain model. 0° = flat. In this area 48% of cells are under 5° and 3% are 25° or steeper. The current map hatches cells steeper than 25°. | Pendenza (°) | Pendenza del terreno in gradi dal modello HiRISE a 1 m. 0° = piano. In quest'area il 48% delle celle è sotto 5° e il 3% è a 25° o più. La mappa attuale tratteggia le celle oltre 25°. |
| roughness | Roughness (m) | How much the ground departs from a flat plane over about 5 m (RMS, metres). Not a rock or hazard map. | Rugosità (m) | Quanto il terreno si discosta da un piano su circa 5 m (RMS, metri). Non è una mappa di rocce o pericoli. |
| quality | Data quality (class) | Unknown (3) everywhere: the source publishes no per-pixel quality. 0 = no elevation. | Qualità del dato (classe) | Sconosciuta (3) ovunque: la fonte non pubblica una qualità per pixel. 0 = nessuna quota. |
| exclusion | Excluded cells (code) | Cells the data cannot support: 1 missing elevation, 2 slope/roughness not computable, 3 outside data, 4 manual. None in this version. Slope limits are set by the route model, not here. | Celle escluse (codice) | Celle che i dati non supportano: 1 quota mancante, 2 pendenza/rugosità non calcolabili, 3 fuori dai dati, 4 manuale. Nessuna in questa versione. I limiti di pendenza sono nel modello di percorso, non qui. |
| texture | Orbital image () | HiRISE grayscale image (USGS orthomosaic), about 0.5 m per pixel as displayed. For context only. | Immagine orbitale () | Immagine HiRISE in scala di grigi (ortomosaico USGS), circa 0,5 m per pixel come mostrata. Solo contesto. |

## Sources & credits
- Terrain: USGS Astrogeology HiRISE 1 m DTM mosaic for Mars 2020 (Fergason et al. 2020, doi:10.5066/P9REJ9JN).
- Image: HiRISE orthomosaic, USGS Astrogeology; HiRISE NASA/JPL-Caltech/UArizona.
- Coarse fallback: USGS CTX 20 m DTM mosaic (doi:10.5066/P906QQT8); CTX NASA/JPL-Caltech/MSSS.
- Science stops: NASA/JPL Mars 2020 rover waypoints. Panoramas: NASA/JPL-Caltech/ASU/MSSS. Temperatures: MEDA, NASA PDS Atmospheres Node.

**Credits line:** Data: NASA/JPL-Caltech/UArizona (HiRISE), NASA/JPL-Caltech/MSSS (CTX), USGS Astrogeology, NASA/JPL-Caltech/ASU/MSSS (Mastcam-Z).

- Terreno: mosaico DTM HiRISE 1 m di USGS Astrogeology per Mars 2020 (Fergason et al. 2020, doi:10.5066/P9REJ9JN).
- Immagine: ortomosaico HiRISE, USGS Astrogeology; HiRISE NASA/JPL-Caltech/UArizona.
- Riserva grossolana: mosaico DTM CTX 20 m di USGS (doi:10.5066/P906QQT8); CTX NASA/JPL-Caltech/MSSS.
- Tappe scientifiche: waypoint del rover Mars 2020 NASA/JPL. Panorami: NASA/JPL-Caltech/ASU/MSSS. Temperature: MEDA, NASA PDS Atmospheres Node.

**Riga crediti:** Dati: NASA/JPL-Caltech/UArizona (HiRISE), NASA/JPL-Caltech/MSSS (CTX), USGS Astrogeology, NASA/JPL-Caltech/ASU/MSSS (Mastcam-Z).

## Short limitations
- 1 m terrain grid: individual boulders are not resolved. / Griglia del terreno a 1 m: i singoli massi non sono visibili.
- No per-pixel data quality is published; strict quality mode is off. / Non esiste una qualità per pixel pubblicata; la modalità qualità rigorosa è disattivata.
- Science-stop positions are where the rover stood, not the exact rock. / Le tappe scientifiche indicano dove stava il rover, non la roccia esatta.
- Temperatures are for one Martian day and season, not permanent values. / Le temperature valgono per un giorno marziano e una stagione, non sono fisse.
- Weather, radiation, dust and communications are not modelled. / Meteo, radiazioni, polvere e comunicazioni non sono modellati.
- Routes are a terrain demonstration, not mission-certified paths. / I percorsi sono una dimostrazione sul terreno, non percorsi certificati per una missione.

## Coarse mode label
- EN: COARSE 20 m terrain (CTX) — regional demonstration only, not for astronaut-scale navigation.
- IT: Terreno GROSSOLANO 20 m (CTX) — solo dimostrazione regionale, non per la navigazione di astronauti.

## Destinations inside the area (P3–P5)
### P3 – Delta front – Skinner Ridge / Wildcat Ridge (Hawksbill Gap ascent)
Local position: east 610.687 m, north 656.7 m · lon 77.405925 E, lat 18.458647 N

**Caption (EN):** Delta front scarp where Perseverance climbed through Hawksbill Gap and cored layered sedimentary rocks at Skinner Ridge and Wildcat Ridge.

**Observation:** Steep layered scarp of the delta front with fine-grained layered sedimentary rocks. Cores: Swift Run and Skyland (Skinner Ridge, sols 490/495), Hazeltop and Bearwallow (Wildcat Ridge, sols 509/516).

**Interpretation:** The Wildcat Ridge rock is interpreted as fine-grained mudstone/sandstone deposited as a lake dried, with sulfates; an instrument on the rover (SHERLOC) detected organic-molecule signals (NASA/JPL, Sept 2022). This is not evidence of life.

**Proposed exploration:** Proposed VR stop: stand at the rover position and look at the layered scarp; compare with the flat floor at Three Forks (P5).

**Briefing (EN):** Steep layered scarp of the delta front with fine-grained layered sedimentary rocks. Cores: Swift Run and Skyland (Skinner Ridge, sols 490/495), Hazeltop and Bearwallow (Wildcat Ridge, sols 509/516). Interpretation: The Wildcat Ridge rock is interpreted as fine-grained mudstone/sandstone deposited as a lake dried, with sulfates; an instrument on the rover (SHERLOC) detected organic-molecule signals (NASA/JPL, Sept 2022). This is not evidence of life. Here the 1 m terrain model gives elevation -2523.2 m and slope 7.9°. On sol 484 MEDA measured air temperatures from -71.8 °C to -20.5 °C. Position: rover location where the 360° panorama was taken; the named rock may be metres to tens of metres away.

**Didascalia (IT):** Scarpata del fronte del delta dove Perseverance è salito per Hawksbill Gap e ha carotato rocce sedimentarie stratificate a Skinner Ridge e Wildcat Ridge.

**Osservazione:** Scarpata ripida e stratificata del fronte del delta, con rocce sedimentarie a grana fine. Carote: Swift Run e Skyland (Skinner Ridge, sol 490/495), Hazeltop e Bearwallow (Wildcat Ridge, sol 509/516).

**Interpretazione:** La roccia di Wildcat Ridge è interpretata come fango/sabbia fine depositati mentre un lago si prosciugava, con solfati; lo strumento SHERLOC ha rilevato segnali di molecole organiche (NASA/JPL, sett. 2022). Non è una prova di vita.

**Esplorazione proposta:** Proposta di tappa VR: stare nella posizione del rover e osservare la scarpata stratificata; confrontare con la pianura di Three Forks (P5).

**Briefing (IT):** Scarpata ripida e stratificata del fronte del delta, con rocce sedimentarie a grana fine. Carote: Swift Run e Skyland (Skinner Ridge, sol 490/495), Hazeltop e Bearwallow (Wildcat Ridge, sol 509/516). Interpretazione: La roccia di Wildcat Ridge è interpretata come fango/sabbia fine depositati mentre un lago si prosciugava, con solfati; lo strumento SHERLOC ha rilevato segnali di molecole organiche (NASA/JPL, sett. 2022). Non è una prova di vita. Qui il modello del terreno a 1 m dà quota -2523.2 m e pendenza 7.9°. Nel sol 484 MEDA ha misurato temperature dell'aria da -71.8 °C a -20.5 °C. Posizione: dove stava il rover quando ha scattato il panorama 360°; la roccia nominata può essere a metri o decine di metri.

### P4 – Delta front base – Enchanted Lake / Amalik / Hidden Harbor
Local position: east 358.558 m, north 187.2 m · lon 77.40144 E, lat 18.450726 N

**Caption (EN):** Base of the delta front: bright, thinly layered rocks with the delta cliffs behind and sand in between.

**Observation:** Bright, thin-layered rocks in the foreground, delta cliffs behind, sand in between (Mastcam-Z description). Cores: Shuyak and Mageik (Amalik, sols 575/619), Kukaklek (Hidden Harbor, sol 631); regolith samples Atmo Mountain and Crosswind Lake (sols 634/639).

**Interpretation:** Interpreted as basal delta-front sediments (sandstones/mudstones) laid down in standing water (Mars 2020 delta-front team abstracts).

**Proposed exploration:** Proposed VR stop: the closest 360° view of the lowest delta layers in our area.

**Briefing (EN):** Bright, thin-layered rocks in the foreground, delta cliffs behind, sand in between (Mastcam-Z description). Cores: Shuyak and Mageik (Amalik, sols 575/619), Kukaklek (Hidden Harbor, sol 631); regolith samples Atmo Mountain and Crosswind Lake (sols 634/639). Interpretation: Interpreted as basal delta-front sediments (sandstones/mudstones) laid down in standing water (Mars 2020 delta-front team abstracts). Here the 1 m terrain model gives elevation -2526.6 m and slope 3.4°. On sol 565 MEDA measured air temperatures from -87.3 °C to -23.6 °C. Position: rover location where the 360° panorama was taken; the named rock may be metres to tens of metres away.

**Didascalia (IT):** Base del fronte del delta: rocce chiare a strati sottili, con le falesie del delta sullo sfondo e sabbia nel mezzo.

**Osservazione:** Rocce chiare a strati sottili in primo piano, falesie del delta dietro, sabbia in mezzo (descrizione Mastcam-Z). Carote: Shuyak e Mageik (Amalik, sol 575/619), Kukaklek (Hidden Harbor, sol 631); regolite Atmo Mountain e Crosswind Lake (sol 634/639).

**Interpretazione:** Interpretate come sedimenti della base del delta (arenarie/argilliti) depositati in acqua ferma (abstract del team Mars 2020).

**Esplorazione proposta:** Proposta di tappa VR: la vista 360° più vicina agli strati più bassi del delta nella nostra area.

**Briefing (IT):** Rocce chiare a strati sottili in primo piano, falesie del delta dietro, sabbia in mezzo (descrizione Mastcam-Z). Carote: Shuyak e Mageik (Amalik, sol 575/619), Kukaklek (Hidden Harbor, sol 631); regolite Atmo Mountain e Crosswind Lake (sol 634/639). Interpretazione: Interpretate come sedimenti della base del delta (arenarie/argilliti) depositati in acqua ferma (abstract del team Mars 2020). Qui il modello del terreno a 1 m dà quota -2526.6 m e pendenza 3.4°. Nel sol 565 MEDA ha misurato temperature dell'aria da -87.3 °C a -23.6 °C. Posizione: dove stava il rover quando ha scattato il panorama 360°; la roccia nominata può essere a metri o decine di metri.

### P5 – Three Forks Sample Depot
Local position: east 752.498 m, north 344.0 m · lon 77.408447 E, lat 18.453372 N

**Caption (EN):** Three Forks: the flat, sandy plain at the foot of the delta where Perseverance left ten sample tubes on the surface.

**Observation:** Flat, sandy plain in front of the delta scarp; the deposited tubes are visible in the 360° panorama (sols 690–692).

**Interpretation:** A mission landmark rather than a distinct geological unit.

**Proposed exploration:** Proposed start/briefing point: gentle terrain and a clear view of the delta front.

**Briefing (EN):** Flat, sandy plain in front of the delta scarp; the deposited tubes are visible in the 360° panorama (sols 690–692). Interpretation: A mission landmark rather than a distinct geological unit. Here the 1 m terrain model gives elevation -2545.2 m and slope 1.5°. On sol 690 MEDA measured air temperatures from -84.4 °C to -16.8 °C. Position: rover location where the 360° panorama was taken; the named rock may be metres to tens of metres away.

**Didascalia (IT):** Three Forks: la pianura sabbiosa ai piedi del delta dove Perseverance ha lasciato dieci tubi di campioni sul terreno.

**Osservazione:** Pianura sabbiosa e piatta davanti alla scarpata del delta; i tubi depositati sono visibili nel panorama 360° (sol 690–692).

**Interpretazione:** Un luogo storico della missione più che un'unità geologica distinta.

**Esplorazione proposta:** Proposta di punto di partenza/briefing: terreno dolce e vista chiara del fronte del delta.

**Briefing (IT):** Pianura sabbiosa e piatta davanti alla scarpata del delta; i tubi depositati sono visibili nel panorama 360° (sol 690–692). Interpretazione: Un luogo storico della missione più che un'unità geologica distinta. Qui il modello del terreno a 1 m dà quota -2545.2 m e pendenza 1.5°. Nel sol 690 MEDA ha misurato temperature dell'aria da -84.4 °C a -16.8 °C. Posizione: dove stava il rover quando ha scattato il panorama 360°; la roccia nominata può essere a metri o decine di metri.

## Context-only sites (outside the area)
### P1 – Octavia E. Butler Landing Site — *Context only — outside the mapped area / Solo contesto — fuori dall'area mappata*
**EN:** Landing site on the flat crater floor (Máaz formation): igneous rocks later altered by water (Farley et al. 2022).

Landing site on the flat crater floor (Máaz formation): igneous rocks later altered by water (Farley et al. 2022). Observation: Flat crater floor with scattered dark rocks, regolith and distant view of delta scarp and crater rim (Mastcam-Z sol 3–4). No 1 m terrain package exists here yet; the 360° panorama (Mastcam-Z 360 #1) is the main view. Air temperature on sol 15: -80.9 to -18.2 °C.

**IT:** Sito di atterraggio sul fondo piatto del cratere (formazione Máaz): rocce ignee poi alterate dall'acqua (Farley et al. 2022).

Sito di atterraggio sul fondo piatto del cratere (formazione Máaz): rocce ignee poi alterate dall'acqua (Farley et al. 2022). Fuori dall'area mappata: qui non c'è ancora il terreno a 1 m; la vista principale è il panorama 360° (Mastcam-Z 360 #1). Temperatura dell'aria nel sol 15: da -80.9 a -18.2 °C.

### P2 – South Séítah (Brac / Issole) — *Context only — outside the mapped area / Solo contesto — fuori dall'area mappata*
**EN:** Séítah: dark layered outcrops among dunes; olivine-rich rock from slowly cooled magma (Liu et al. 2022).

Séítah: dark layered outcrops among dunes; olivine-rich rock from slowly cooled magma (Liu et al. 2022). Observation: Layered, ridged dark outcrops among sand ripples/dunes; rover had to navigate dune field. No 1 m terrain package exists here yet; the 360° panorama (Mastcam-Z 360 #13 (Site 9 Drive 0, within Séítah)) is the main view. Air temperature on sol 286: -78.1 to -10.1 °C.

**IT:** Séítah: affioramenti scuri stratificati tra le dune; roccia ricca di olivina da magma raffreddato lentamente (Liu et al. 2022).

Séítah: affioramenti scuri stratificati tra le dune; roccia ricca di olivina da magma raffreddato lentamente (Liu et al. 2022). Fuori dall'area mappata: qui non c'è ancora il terreno a 1 m; la vista principale è il panorama 360° (Mastcam-Z 360 #13 (Site 9 Drive 0, within Séítah)). Temperatura dell'aria nel sol 286: da -78.1 a -10.1 °C.

### P6 – Upper fan – Belva crater / Berea — *Context only — outside the mapped area / Solo contesto — fuori dall'area mappata*
**EN:** Upper fan near Belva crater: inclined layers in the crater walls; interpreted as coarser river deposits from stronger flows than the lake deposits below (delta architecture: Mangold et al. 2021).

Upper fan near Belva crater: inclined layers in the crater walls; interpreted as coarser river deposits from stronger flows than the lake deposits below (delta architecture: Mangold et al. 2021). Observation: Elevated fan surface; Belva crater exposes inclined layers in its walls. No 1 m terrain package exists here yet; the 360° panorama (Mastcam-Z 360 #25 Belva crater...) is the main view. Air temperature on sol 749: -78.4 to -18.8 °C.

**IT:** Ventaglio superiore vicino al cratere Belva: strati inclinati nelle pareti; interpretati come depositi di fiume più grossolani, da correnti più forti dei depositi di lago sottostanti (architettura del delta: Mangold et al. 2021).

Ventaglio superiore vicino al cratere Belva: strati inclinati nelle pareti; interpretati come depositi di fiume più grossolani, da correnti più forti dei depositi di lago sottostanti (architettura del delta: Mangold et al. 2021). Fuori dall'area mappata: qui non c'è ancora il terreno a 1 m; la vista principale è il panorama 360° (Mastcam-Z 360 #25 Belva crater...). Temperatura dell'aria nel sol 749: da -78.4 a -18.8 °C.

### P7 – Margin unit – Bunsen Peak / Neretva Vallis — *Context only — outside the mapped area / Solo contesto — fuori dall'area mappata*
**EN:** Bunsen Peak in the margin unit: NASA lists the Comet Geyser core as silica-cemented carbonate; a lakeshore origin is debated.

Bunsen Peak in the margin unit: NASA lists the Comet Geyser core as silica-cemented carbonate; a lakeshore origin is debated. Observation: Raised rocky outcrop near the margin of the fan; Neretva Vallis inlet channel visible. No 1 m terrain package exists here yet; the 360° panorama (Mastcam-Z 360 #37 Bunsen Peak and Neretva Vallis) is the main view. Air temperature on sol 1074: -74.0 to -12.3 °C.

**IT:** Bunsen Peak nella margin unit: NASA classifica la carota Comet Geyser come carbonato cementato da silice; l'origine come antica riva è discussa.

Bunsen Peak nella margin unit: NASA classifica la carota Comet Geyser come carbonato cementato da silice; l'origine come antica riva è discussa. Fuori dall'area mappata: qui non c'è ancora il terreno a 1 m; la vista principale è il panorama 360° (Mastcam-Z 360 #37 Bunsen Peak and Neretva Vallis). Temperatura dell'aria nel sol 1074: da -74.0 a -12.3 °C.

### P8 – Bright Angel / Cheyava Falls (Neretva Vallis) — *Context only — outside the mapped area / Solo contesto — fuori dall'area mappata*
**EN:** Bright Angel / Cheyava Falls: light-toned rock with 'leopard spots'; a potential biosignature that needs laboratory confirmation on Earth (Hurowitz et al. 2025).

Bright Angel / Cheyava Falls: light-toned rock with 'leopard spots'; a potential biosignature that needs laboratory confirmation on Earth (Hurowitz et al. 2025). Observation: Light-toned outcrop in the river-valley; 'Cheyava Falls' rock with mm-scale light spots with dark rims ('leopard spots') and veins. No 1 m terrain package exists here yet; the 360° panorama (Mastcam-Z 360 #39 Bright Angel outcrop (Cheyava Falls ~110 m away)) is the main view. Air temperature on sol 1178: -85.7 to -17.6 °C.

**IT:** Bright Angel / Cheyava Falls: roccia chiara con 'macchie di leopardo'; possibile biofirma da confermare in laboratorio sulla Terra (Hurowitz et al. 2025).

Bright Angel / Cheyava Falls: roccia chiara con 'macchie di leopardo'; possibile biofirma da confermare in laboratorio sulla Terra (Hurowitz et al. 2025). Fuori dall'area mappata: qui non c'è ancora il terreno a 1 m; la vista principale è il panorama 360° (Mastcam-Z 360 #39 Bright Angel outcrop (Cheyava Falls ~110 m away)). Temperatura dell'aria nel sol 1178: da -85.7 a -17.6 °C.

### P9_optional – Crater rim – Witch Hazel Hill (Tablelands / Broom Point) — *Context only — outside the mapped area / Solo contesto — fuori dall'area mappata*
**EN:** Crater rim at Witch Hazel Hill, about 650 m higher than the landing site (JPL elevations): ancient crustal rocks; NASA lists the Green Gardens core as serpentinite.

Crater rim at Witch Hazel Hill, about 650 m higher than the landing site (JPL elevations): ancient crustal rocks; NASA lists the Green Gardens core as serpentinite. Observation: Rim slopes with diverse light/dark blocks; ~600 m higher than the crater floor (JPL elev_geoid ≈ −1918 m vs ≈ −2570 m at landing). No 1 m terrain package exists here yet; the 360° panorama (Mastcam-Z 360 #44 Broom Point) is the main view. Air temperature on sol 1431: -71.3 to -19.1 °C.

**IT:** Bordo del cratere a Witch Hazel Hill, circa 650 m più in alto del sito di atterraggio (quote JPL): rocce antiche della crosta; NASA classifica la carota Green Gardens come serpentinite.

Bordo del cratere a Witch Hazel Hill, circa 650 m più in alto del sito di atterraggio (quote JPL): rocce antiche della crosta; NASA classifica la carota Green Gardens come serpentinite. Fuori dall'area mappata: qui non c'è ancora il terreno a 1 m; la vista principale è il panorama 360° (Mastcam-Z 360 #44 Broom Point). Temperatura dell'aria nel sol 1431: da -71.3 a -19.1 °C.
