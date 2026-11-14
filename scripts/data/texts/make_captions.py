"""Generate ui_captions.json + ui_captions.md (next to this script) from verified project files.

Works in both layouts:
  - team repo:   scripts/data/texts/make_captions.py  (data root = scripts/data, bundle = public/bundles/...)
  - data repo:   texts/make_captions.py               (data root = repo root, package/v0.1.0)
Inputs: <data root>/pois.json, plus terrain values at each stop from the HiRISE bundle
(public/bundles/jezero-west-hirise-v0.1.0) if present, else <data root>/package/v0.1.0/destinations.json.
Override the bundle location with MARS_BUNDLE_DIR.
"""
import json, math, os
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent
DATA = HERE.parent
BUNDLE_ID = "jezero-west-hirise-v0.1.0"
cands = [os.environ.get("MARS_BUNDLE_DIR"), DATA.parent.parent / "public" / "bundles" / BUNDLE_ID,
         Path("/workspace/marspineapple/public/bundles") / BUNDLE_ID]
BUNDLE = next((Path(c) for c in cands if c and (Path(c) / "manifest.json").exists()), None)
P = {p["id"]: p for p in json.load(open(DATA / "pois.json"))["pois"]}

# local frame of the bundle (see manifest crs.localOriginInSource): SW outer corner of the core AOI
R, X0, Y0, COS_LATC = 3396190.0, 4587569.0, 1093474.0, 0.9485670310210961  # processing_log.json cos_lat_center
def local_pos(loc):  # same formula as scripts/data/export_bundle.py
    x, y = loc["eqc_x_m"], loc["eqc_y_m"]
    return {"east_m": round((x - X0) * COS_LATC, 3), "north_m": round(y - Y0, 3)}

if BUNDLE:
    M = json.load(open(BUNDLE / "manifest.json"))
    BP = {q["id"]: q["position"] for q in M["pointsOfInterest"]}
    g = M["grid"]; W, H = g["width"], g["height"]
    arr = {k: np.fromfile(BUNDLE / M["layers"][k]["file"], dtype="<f4").reshape(H, W) for k in ("elevation", "slope", "roughness")}
    D = {}
    for k in ("P3", "P4", "P5"):
        pos = BP[f"poi-{k.lower()}"]
        eps = 1e-3  # positions lying on a cell edge (P4) belong to the cell east/south of it, as in package/destinations.json
        c = int((pos["east_m"] + eps) // g["cellSizeEast_m"]); r = int((g["extent"]["north_m"] - pos["north_m"] + eps) // g["cellSizeNorth_m"])
        D[k] = dict(package_elevation_m=float(arr["elevation"][r, c]), package_slope_deg=float(arr["slope"][r, c]), package_roughness_m=float(arr["roughness"][r, c]))
    BVER = M["bundleVersion"]
else:
    D = {d["id"]: d for d in json.load(open(DATA / "package" / "v0.1.0" / "destinations.json"))["destinations"]}
    BP = {f"poi-{k.lower()}": local_pos(P[k]["location"]) for k in ("P3", "P4", "P5")}
    BVER = BUNDLE_ID

def temp(p):
    t = [x for x in p["temperature"] if x.get("available")][0]
    return t["sol"], t["air_temp_min_C"], t["air_temp_max_C"]

DEST = {
 "P3": dict(en_cap="Delta front scarp where Perseverance climbed through Hawksbill Gap and cored layered sedimentary rocks at Skinner Ridge and Wildcat Ridge.",
            it_cap="Scarpata del fronte del delta dove Perseverance è salito per Hawksbill Gap e ha carotato rocce sedimentarie stratificate a Skinner Ridge e Wildcat Ridge.",
            en_obs="Steep layered scarp of the delta front with fine-grained layered sedimentary rocks. Cores: Swift Run and Skyland (Skinner Ridge, sols 490/495), Hazeltop and Bearwallow (Wildcat Ridge, sols 509/516).",
            it_obs="Scarpata ripida e stratificata del fronte del delta, con rocce sedimentarie a grana fine. Carote: Swift Run e Skyland (Skinner Ridge, sol 490/495), Hazeltop e Bearwallow (Wildcat Ridge, sol 509/516).",
            en_int="The Wildcat Ridge rock is interpreted as fine-grained mudstone/sandstone deposited as a lake dried, with sulfates; an instrument on the rover (SHERLOC) detected organic-molecule signals (NASA/JPL, Sept 2022). This is not evidence of life.",
            it_int="La roccia di Wildcat Ridge è interpretata come fango/sabbia fine depositati mentre un lago si prosciugava, con solfati; lo strumento SHERLOC ha rilevato segnali di molecole organiche (NASA/JPL, sett. 2022). Non è una prova di vita.",
            en_prop="Proposed VR stop: stand at the rover position and look at the layered scarp; compare with the flat floor at Three Forks (P5).",
            it_prop="Proposta di tappa VR: stare nella posizione del rover e osservare la scarpata stratificata; confrontare con la pianura di Three Forks (P5)."),
 "P4": dict(en_cap="Base of the delta front: bright, thinly layered rocks with the delta cliffs behind and sand in between.",
            it_cap="Base del fronte del delta: rocce chiare a strati sottili, con le falesie del delta sullo sfondo e sabbia nel mezzo.",
            en_obs="Bright, thin-layered rocks in the foreground, delta cliffs behind, sand in between (Mastcam-Z description). Cores: Shuyak and Mageik (Amalik, sols 575/619), Kukaklek (Hidden Harbor, sol 631); regolith samples Atmo Mountain and Crosswind Lake (sols 634/639).",
            it_obs="Rocce chiare a strati sottili in primo piano, falesie del delta dietro, sabbia in mezzo (descrizione Mastcam-Z). Carote: Shuyak e Mageik (Amalik, sol 575/619), Kukaklek (Hidden Harbor, sol 631); regolite Atmo Mountain e Crosswind Lake (sol 634/639).",
            en_int="Interpreted as basal delta-front sediments (sandstones/mudstones) laid down in standing water (Mars 2020 delta-front team abstracts).",
            it_int="Interpretate come sedimenti della base del delta (arenarie/argilliti) depositati in acqua ferma (abstract del team Mars 2020).",
            en_prop="Proposed VR stop: the closest 360° view of the lowest delta layers in our area.",
            it_prop="Proposta di tappa VR: la vista 360° più vicina agli strati più bassi del delta nella nostra area."),
 "P5": dict(en_cap="Three Forks: the flat, sandy plain at the foot of the delta where Perseverance left ten sample tubes on the surface.",
            it_cap="Three Forks: la pianura sabbiosa ai piedi del delta dove Perseverance ha lasciato dieci tubi di campioni sul terreno.",
            en_obs="Flat, sandy plain in front of the delta scarp; the deposited tubes are visible in the 360° panorama (sols 690–692).",
            it_obs="Pianura sabbiosa e piatta davanti alla scarpata del delta; i tubi depositati sono visibili nel panorama 360° (sol 690–692).",
            en_int="A mission landmark rather than a distinct geological unit.",
            it_int="Un luogo storico della missione più che un'unità geologica distinta.",
            en_prop="Proposed start/briefing point: gentle terrain and a clear view of the delta front.",
            it_prop="Proposta di punto di partenza/briefing: terreno dolce e vista chiara del fronte del delta."),
}
CTX = {
 "P1": ("Landing site on the flat crater floor (Máaz formation): igneous rocks later altered by water (Farley et al. 2022).", "Sito di atterraggio sul fondo piatto del cratere (formazione Máaz): rocce ignee poi alterate dall'acqua (Farley et al. 2022)."),
 "P2": ("Séítah: dark layered outcrops among dunes; olivine-rich rock from slowly cooled magma (Liu et al. 2022).", "Séítah: affioramenti scuri stratificati tra le dune; roccia ricca di olivina da magma raffreddato lentamente (Liu et al. 2022)."),
 "P6": ("Upper fan near Belva crater: inclined layers in the crater walls; interpreted as coarser river deposits from stronger flows than the lake deposits below (delta architecture: Mangold et al. 2021).", "Ventaglio superiore vicino al cratere Belva: strati inclinati nelle pareti; interpretati come depositi di fiume più grossolani, da correnti più forti dei depositi di lago sottostanti (architettura del delta: Mangold et al. 2021)."),
 "P7": ("Bunsen Peak in the margin unit: NASA lists the Comet Geyser core as silica-cemented carbonate; a lakeshore origin is debated.", "Bunsen Peak nella margin unit: NASA classifica la carota Comet Geyser come carbonato cementato da silice; l'origine come antica riva è discussa."),
 "P8": ("Bright Angel / Cheyava Falls: light-toned rock with 'leopard spots'; a potential biosignature that needs laboratory confirmation on Earth (Hurowitz et al. 2025).", "Bright Angel / Cheyava Falls: roccia chiara con 'macchie di leopardo'; possibile biofirma da confermare in laboratorio sulla Terra (Hurowitz et al. 2025)."),
 "P9_optional": ("Crater rim at Witch Hazel Hill, about 650 m higher than the landing site (JPL elevations): ancient crustal rocks; NASA lists the Green Gardens core as serpentinite.", "Bordo del cratere a Witch Hazel Hill, circa 650 m più in alto del sito di atterraggio (quote JPL): rocce antiche della crosta; NASA classifica la carota Green Gardens come serpentinite."),
}
out = dict(
 meta=dict(language_note="Team repo UI is English; Italian provided alongside. Facts from pois.json, package/v0.1.0 and bundle manifests (2026-11-14).", bundle=BVER),
 layers={
  "elevation": dict(en=dict(name="Elevation", units="m", legend="Height in metres relative to the Mars reference surface (areoid). Negative values are normal: the Jezero floor is about 2.5 km below the reference."),
                    it=dict(name="Quota", units="m", legend="Altezza in metri rispetto alla superficie di riferimento di Marte (areoide). I valori negativi sono normali: il fondo di Jezero è circa 2,5 km sotto il riferimento.")),
  "slope": dict(en=dict(name="Slope", units="°", legend="Terrain slope in degrees from the HiRISE 1 m terrain model. 0° = flat. In this area 48% of cells are under 5° and 3% are 25° or steeper. The current map hatches cells steeper than 25°."),
                it=dict(name="Pendenza", units="°", legend="Pendenza del terreno in gradi dal modello HiRISE a 1 m. 0° = piano. In quest'area il 48% delle celle è sotto 5° e il 3% è a 25° o più. La mappa attuale tratteggia le celle oltre 25°.")),
  "roughness": dict(en=dict(name="Roughness", units="m", legend="How much the ground departs from a flat plane over about 5 m (RMS, metres). Not a rock or hazard map."),
                    it=dict(name="Rugosità", units="m", legend="Quanto il terreno si discosta da un piano su circa 5 m (RMS, metri). Non è una mappa di rocce o pericoli.")),
  "quality": dict(en=dict(name="Data quality", units="class", legend="Unknown (3) everywhere: the source publishes no per-pixel quality. 0 = no elevation."),
                  it=dict(name="Qualità del dato", units="classe", legend="Sconosciuta (3) ovunque: la fonte non pubblica una qualità per pixel. 0 = nessuna quota.")),
  "exclusion": dict(en=dict(name="Excluded cells", units="code", legend="Cells the data cannot support: 1 missing elevation, 2 slope/roughness not computable, 3 outside data, 4 manual. None in this version. Slope limits are set by the route model, not here."),
                    it=dict(name="Celle escluse", units="codice", legend="Celle che i dati non supportano: 1 quota mancante, 2 pendenza/rugosità non calcolabili, 3 fuori dai dati, 4 manuale. Nessuna in questa versione. I limiti di pendenza sono nel modello di percorso, non qui.")),
  "texture": dict(en=dict(name="Orbital image", units="", legend="HiRISE grayscale image (USGS orthomosaic), about 0.5 m per pixel as displayed. For context only."),
                  it=dict(name="Immagine orbitale", units="", legend="Immagine HiRISE in scala di grigi (ortomosaico USGS), circa 0,5 m per pixel come mostrata. Solo contesto.")),
 },
 sources=dict(
  en=["Terrain: USGS Astrogeology HiRISE 1 m DTM mosaic for Mars 2020 (Fergason et al. 2020, doi:10.5066/P9REJ9JN).",
      "Image: HiRISE orthomosaic, USGS Astrogeology; HiRISE NASA/JPL-Caltech/UArizona.",
      "Coarse fallback: USGS CTX 20 m DTM mosaic (doi:10.5066/P906QQT8); CTX NASA/JPL-Caltech/MSSS.",
      "Science stops: NASA/JPL Mars 2020 rover waypoints. Panoramas: NASA/JPL-Caltech/ASU/MSSS. Temperatures: MEDA, NASA PDS Atmospheres Node."],
  it=["Terreno: mosaico DTM HiRISE 1 m di USGS Astrogeology per Mars 2020 (Fergason et al. 2020, doi:10.5066/P9REJ9JN).",
      "Immagine: ortomosaico HiRISE, USGS Astrogeology; HiRISE NASA/JPL-Caltech/UArizona.",
      "Riserva grossolana: mosaico DTM CTX 20 m di USGS (doi:10.5066/P906QQT8); CTX NASA/JPL-Caltech/MSSS.",
      "Tappe scientifiche: waypoint del rover Mars 2020 NASA/JPL. Panorami: NASA/JPL-Caltech/ASU/MSSS. Temperature: MEDA, NASA PDS Atmospheres Node."],
  credits_line_en="Data: NASA/JPL-Caltech/UArizona (HiRISE), NASA/JPL-Caltech/MSSS (CTX), USGS Astrogeology, NASA/JPL-Caltech/ASU/MSSS (Mastcam-Z).",
  credits_line_it="Dati: NASA/JPL-Caltech/UArizona (HiRISE), NASA/JPL-Caltech/MSSS (CTX), USGS Astrogeology, NASA/JPL-Caltech/ASU/MSSS (Mastcam-Z)."),
 limitations_short=dict(
  en=["1 m terrain grid: individual boulders are not resolved.", "No per-pixel data quality is published; strict quality mode is off.",
      "Science-stop positions are where the rover stood, not the exact rock.", "Temperatures are for one Martian day and season, not permanent values.",
      "Weather, radiation, dust and communications are not modelled.", "Routes are a terrain demonstration, not mission-certified paths."],
  it=["Griglia del terreno a 1 m: i singoli massi non sono visibili.", "Non esiste una qualità per pixel pubblicata; la modalità qualità rigorosa è disattivata.",
      "Le tappe scientifiche indicano dove stava il rover, non la roccia esatta.", "Le temperature valgono per un giorno marziano e una stagione, non sono fisse.",
      "Meteo, radiazioni, polvere e comunicazioni non sono modellati.", "I percorsi sono una dimostrazione sul terreno, non percorsi certificati per una missione."]),
 coarse_mode=dict(en="COARSE 20 m terrain (CTX) — regional demonstration only, not for astronaut-scale navigation.",
                  it="Terreno GROSSOLANO 20 m (CTX) — solo dimostrazione regionale, non per la navigazione di astronauti."),
 destinations=[], context_sites=[])
for k, v in DEST.items():
    p, d = P[k], D[k]; sol, tmin, tmax = temp(p)
    out["destinations"].append(dict(id=k, bundle_poi_id=f"poi-{k.lower()}", name=p["name"], in_area=True, position_local=BP[f"poi-{k.lower()}"],
        lon_e=p["location"]["lon_e"], lat_n=p["location"]["lat_n"], terrain_here=dict(elevation_m=round(d["package_elevation_m"], 1), slope_deg=round(d["package_slope_deg"], 1), roughness_m=round(d["package_roughness_m"], 3)),
        air_temperature=dict(sol=sol, min_C=tmin, max_C=tmax, note="MEDA air temperature on that sol only"),
        panoramas=[q["id"] for q in p["panoramas"]],
        en=dict(caption=v["en_cap"], observation=v["en_obs"], interpretation=v["en_int"], proposed=v["en_prop"],
                briefing=f"{v['en_obs']} Interpretation: {v['en_int']} Here the 1 m terrain model gives elevation {d['package_elevation_m']:.1f} m and slope {d['package_slope_deg']:.1f}°. On sol {sol} MEDA measured air temperatures from {tmin} °C to {tmax} °C. Position: rover location where the 360° panorama was taken; the named rock may be metres to tens of metres away."),
        it=dict(caption=v["it_cap"], observation=v["it_obs"], interpretation=v["it_int"], proposed=v["it_prop"],
                briefing=f"{v['it_obs']} Interpretazione: {v['it_int']} Qui il modello del terreno a 1 m dà quota {d['package_elevation_m']:.1f} m e pendenza {d['package_slope_deg']:.1f}°. Nel sol {sol} MEDA ha misurato temperature dell'aria da {tmin} °C a {tmax} °C. Posizione: dove stava il rover quando ha scattato il panorama 360°; la roccia nominata può essere a metri o decine di metri.")))
for k, (en, it) in CTX.items():
    p = P[k]; sol, tmin, tmax = temp(p)
    out["context_sites"].append(dict(id=k, name=p["name"], in_area=False, label_en="Context only — outside the mapped area", label_it="Solo contesto — fuori dall'area mappata",
        lon_e=p["location"]["lon_e"], lat_n=p["location"]["lat_n"], elevation_m_jpl=p["location"]["elev_geoid_m"], panoramas=[q["id"] for q in p["panoramas"]],
        en=dict(caption=en, briefing=f"{en} Observation: {p['observation']} No 1 m terrain package exists here yet; the 360° panorama ({p['panoramas'][0]['id']}) is the main view. Air temperature on sol {sol}: {tmin} to {tmax} °C."),
        it=dict(caption=it, briefing=f"{it} Fuori dall'area mappata: qui non c'è ancora il terreno a 1 m; la vista principale è il panorama 360° ({p['panoramas'][0]['id']}). Temperatura dell'aria nel sol {sol}: da {tmin} a {tmax} °C.")))
json.dump(out, open(HERE / "ui_captions.json", "w"), indent=1, ensure_ascii=False)
L = ["# UI captions – Role A (for Dhani)", "", "English first (UI language of the team repo), Italian below each. Source: `ui_captions.json`.", ""]
L += ["## Layers", "| layer | EN name / units | EN legend | IT nome / unità | IT legenda |", "|---|---|---|---|---|"]
for k, v in out["layers"].items(): L.append(f"| {k} | {v['en']['name']} ({v['en']['units']}) | {v['en']['legend']} | {v['it']['name']} ({v['it']['units']}) | {v['it']['legend']} |")
L += ["", "## Sources & credits", *[f"- {s}" for s in out["sources"]["en"]], "", f"**Credits line:** {out['sources']['credits_line_en']}", "", *[f"- {s}" for s in out["sources"]["it"]], "", f"**Riga crediti:** {out['sources']['credits_line_it']}",
      "", "## Short limitations", *[f"- {a} / {b}" for a, b in zip(out["limitations_short"]["en"], out["limitations_short"]["it"])],
      "", "## Coarse mode label", f"- EN: {out['coarse_mode']['en']}", f"- IT: {out['coarse_mode']['it']}", "", "## Destinations inside the area (P3–P5)"]
for d in out["destinations"]:
    L += [f"### {d['id']} – {d['name']}", f"Local position: east {d['position_local']['east_m']} m, north {d['position_local']['north_m']} m · lon {d['lon_e']} E, lat {d['lat_n']} N", "",
          f"**Caption (EN):** {d['en']['caption']}", "", f"**Observation:** {d['en']['observation']}", "", f"**Interpretation:** {d['en']['interpretation']}", "", f"**Proposed exploration:** {d['en']['proposed']}", "", f"**Briefing (EN):** {d['en']['briefing']}", "",
          f"**Didascalia (IT):** {d['it']['caption']}", "", f"**Osservazione:** {d['it']['observation']}", "", f"**Interpretazione:** {d['it']['interpretation']}", "", f"**Esplorazione proposta:** {d['it']['proposed']}", "", f"**Briefing (IT):** {d['it']['briefing']}", ""]
L += ["## Context-only sites (outside the area)"]
for d in out["context_sites"]:
    L += [f"### {d['id']} – {d['name']} — *{d['label_en']} / {d['label_it']}*", f"**EN:** {d['en']['caption']}", "", f"{d['en']['briefing']}", "", f"**IT:** {d['it']['caption']}", "", f"{d['it']['briefing']}", ""]
open(HERE / "ui_captions.md", "w").write("\n".join(L))
print("ok", len(out["destinations"]), len(out["context_sites"]))
