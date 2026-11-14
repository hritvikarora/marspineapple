"""Build pois.json from NASA/JPL rover waypoints (M20_waypoints.json), MEDA ATS summaries and curated metadata."""
import json, math
LICDOC=json.load(open("licences.json")); LIC=LICDOC["entries"]  # licence register (checked online)
W=[x['properties'] for x in json.load(open('poi_sources/M20_waypoints.json'))['features']]
M={**json.load(open('poi_sources/meda/meda_ats_summary.json')), **json.load(open('poi_sources/meda/meda_ats_summary_pano_sols.json'))}
D=math.pi/180*3396190; core=[4587569,1093474,4588569,1094474]
MMGIS="https://mars.nasa.gov/mmgis-maps/M20/"
MZ="https://mastcamz.asu.edu/mastcam-zs-360-panorama-collection/"
def wp(s): c=[p for p in W if p['sol']<=s]; return c[-1] if c else W[0]
def meda(s):
    m=M.get(str(s))
    if not m or 'error' in m or not m.get('n'): return {"sol":s,"available":False,"note":"no CAL_ATS file for this sol in PDS (404)" if m else "not checked"}
    return {"sol":s,"available":True,"product":"MEDA CAL_ATS (PDS4, NMSU Atmospheres Node)","url":m['url'],
            "air_temp_min_C":m['min_C'],"air_temp_max_C":m['max_C'],"method":"mean of ATS_LOCAL_TEMP1..3 per record; min/max over the sol's recorded samples only (MEDA does not record 24 h continuously)","n_records":m['n']}
P=[
 dict(id="P1",name="Octavia E. Butler Landing Site",unit="Crater floor – Máaz formation (Jezero floor)",station_sol=3,sample_or_event="Landing (sol 0); 'Sid' cores Ha'ahóni/Atsá (sols 371/377) near landing / Ch'ał outcrop",
   observation="Flat crater floor with scattered dark rocks, regolith and distant view of delta scarp and crater rim (Mastcam-Z sol 3–4).",
   interpretation="Máaz: igneous (basaltic-to-andesitic) lava-flow or volcaniclastic rocks, later aqueously altered (Farley et al. 2022, Science, doi:10.1126/science.abo2196).",
   panoramas=[{"id":"Mastcam-Z 360 #1","sols":"3, 11","url":MZ,"photojournal":"https://science.nasa.gov/photojournal/mastcam-zs-first-360-degree-panorama/ (PIA24264)"},{"id":"Mastcam-Z 360 #2 (110 mm, delta horizon)","sols":"4","url":"https://mastcamz.asu.edu/galleries/mastcam-zs-first-high-resolution-mosaic-sol-4/","photojournal":"PIA23727"}],meda_sols=[15,16]),
 dict(id="P2",name="South Séítah (Brac / Issole)",unit="Crater floor – Séítah formation",station_sol=286,sample_or_event="Cores Salette/Coulettes (Brac, sols 262/271), Robine/Malay (Issole, sols 298/337)",
   observation="Layered, ridged dark outcrops among sand ripples/dunes; rover had to navigate dune field.",
   interpretation="Séítah: olivine-rich cumulate (slow-cooled magma/thick melt sheet), stratigraphically below Máaz (Liu et al. 2022, Science, doi:10.1126/science.abo2756; Farley et al. 2022).",
   panoramas=[{"id":"Mastcam-Z 360 #13 (Site 9 Drive 0, within Séítah)","sols":"286–312","url":MZ},{"id":"Mastcam-Z 360 #12 'Village' 110 mm","sols":"214–215","url":"https://mastcamz.asu.edu/galleries/mastcam-z-360-panorama-12-village-outcrop-110-mm-mosaic-within-seitah-sols-214-215/"}],meda_sols=[286,298]),
 dict(id="P3",name="Delta front – Skinner Ridge / Wildcat Ridge (Hawksbill Gap ascent)",unit="Western delta front (lower delta sedimentary rocks)",station_sol=502,sample_or_event="Cores Swift Run/Skyland (Skinner Ridge, sols 490/495); Hazeltop/Bearwallow (Wildcat Ridge, sols 509/516)",
   observation="Steep layered scarp of the delta front; fine-grained layered sedimentary rocks.",
   interpretation="Wildcat Ridge: fine-grained mudstone/sandstone deposited as a lake dried, with sulfates; SHERLOC detected organic-molecule signals (NASA/JPL release, Sept 2022 – NOT a biosignature claim).",
   panoramas=[{"id":"Mastcam-Z 360 #19 Skinner Ridge","sols":"484–492","url":MZ},{"id":"Mastcam-Z 360 #20 Wildcat Ridge","sols":"518–534","url":MZ},{"id":"Mastcam-Z 360 #18 High-res Rockytop scarp","sols":"466–474","url":MZ}],meda_sols=[484,490,509,518]),
 dict(id="P4",name="Delta front base – Enchanted Lake / Amalik / Hidden Harbor",unit="Base of western delta front",station_sol=565,sample_or_event="Cores Shuyak/Mageik (Amalik, sols 575/619), Kukaklek (Hidden Harbor, 631); regolith Atmo Mountain/Crosswind Lake (634/639)",
   observation="Bright, thin-layered rocks in the foreground, delta cliffs in the background, sand in between (Mastcam-Z sol 425 description).",
   interpretation="Basal delta-front sediments (sandstones/mudstones) laid down in standing water; interpretation per Mars 2020 delta-front team abstracts (e.g. EPSC2022-1098, LPSC 2023 #2716).",
   panoramas=[{"id":"Mastcam-Z 360 #21 Enchanted Lake","sols":"566–586","url":MZ},{"id":"Mastcam-Z 360 #22 Hidden Harbor workspace","sols":"614–619","url":MZ},{"id":"Enchanted Lake mosaic (partial)","sols":"425","url":"https://mastcamz.asu.edu/galleries/enchanted-lake/"}],meda_sols=[565,566,575,629]),
 dict(id="P5",name="Three Forks Sample Depot",unit="Crater floor at foot of delta front",station_sol=690,sample_or_event="10 sample tubes deposited on the surface (depot, Dec 2022–Jan 2023)",
   observation="Flat, sandy plain in front of the delta scarp; deposited tubes visible in the 360° pano.",
   interpretation="Mission/engineering landmark rather than a distinct geological unit; good 'human-history' VR stop.",
   panoramas=[{"id":"Mastcam-Z 360 #24 Three Forks Depot #2 (all samples)","sols":"690–692","url":MZ},{"id":"Mastcam-Z 360 #23 Depot #1","sols":"670","url":MZ}],meda_sols=[690]),
 dict(id="P6",name="Upper fan – Belva crater / Berea",unit="Upper delta/fan deposits",station_sol=789,sample_or_event="Core Melyn (Berea, sol 749); Otis Peak (Emerald Lake, 832)",
   observation="Elevated fan surface; Belva crater exposes inclined layers in its walls.",
   interpretation="Upper fan: coarser fluvial (river) deposits incl. boulder conglomerates, recording higher-energy flows than the lake-bottom deposits below (Mangold et al. 2021, Science, doi:10.1126/science.abl4051 for delta architecture).",
   panoramas=[{"id":"Mastcam-Z 360 #25 Belva crater...","sols":"789","url":MZ}],meda_sols=[749,789]),
 dict(id="P7",name="Margin unit – Bunsen Peak / Neretva Vallis",unit="Margin unit (inner crater rim carbonate-bearing deposits)",station_sol=1074,sample_or_event="Core Comet Geyser (Bunsen Peak, sol 1088)",
   observation="Raised rocky outcrop near the margin of the fan; Neretva Vallis inlet channel visible.",
   interpretation="NASA sample record lists rock type 'silica-cemented carbonate'; margin unit carbonates possibly formed at an ancient lakeshore (interpretation, debated).",
   panoramas=[{"id":"Mastcam-Z 360 #37 Bunsen Peak and Neretva Vallis","sols":"1074–1082","url":MZ}],meda_sols=[1074,1088]),
 dict(id="P8",name="Bright Angel / Cheyava Falls (Neretva Vallis)",unit="Bright Angel formation in Neretva Vallis",station_sol=1178,sample_or_event="Core Sapphire Canyon (Cheyava Falls, sol 1215)",
   observation="Light-toned outcrop in the river-valley; 'Cheyava Falls' rock with mm-scale light spots with dark rims ('leopard spots') and veins.",
   interpretation="Fe-phosphate/sulfide reaction fronts associated with organic matter considered a 'potential biosignature' by NASA – requires lab confirmation on Earth (NASA release July 2024; peer-reviewed: Hurowitz et al. 2025, Nature, doi:10.1038/s41586-025-09413-0).",
   panoramas=[{"id":"Mastcam-Z 360 #39 Bright Angel outcrop (Cheyava Falls ~110 m away)","sols":"1178","url":"https://mastcamz.asu.edu/galleries/sol-1178-mastcam-z-360-panorama-39-bright-angel-outcrop-z63/","photojournal":"PIA26369"},{"id":"Cheyava Falls workspace mosaic","sols":"1217","url":"https://mastcamz.asu.edu/galleries/sol-1217-beaver-falls-cheyava-falls-sapphire-canyon-apollo-temple-steamboat-mountain-workspace-01-mastcam-z-mosaic/","photojournal":"PIA26401"}],meda_sols=[1178,1210,1215]),
 dict(id="P9_optional",name="Crater rim – Witch Hazel Hill (Tablelands / Broom Point)",unit="Jezero crater rim",station_sol=1438,sample_or_event="Cores Silver Mountain (1401), Green Gardens (serpentinite, 1433), Main River (1441)",
   observation="Rim slopes with diverse light/dark blocks; ~600 m higher than the crater floor (JPL elev_geoid ≈ −1918 m vs ≈ −2570 m at landing).",
   interpretation="Ancient crustal/impact-related rocks; Green Gardens listed by NASA as serpentinite (water–rock alteration).",
   panoramas=[{"id":"Mastcam-Z 360 #44 Broom Point","sols":"1438–1443","url":MZ},{"id":"Mastcam-Z 360 #41 Lookout Hill rim crest (Gigapan)","sols":"1356–1358","url":MZ}],meda_sols=[1431,1433,1438],
   caveat="Lies in the HiRISE 'CR' stereo model area which USGS flags for y-parallax quality issues."),
]
out=[]
for p in P:
    w=wp(p['station_sol']); x,y=w['lon']*D,w['lat']*D
    ins=core[0]<=x<=core[2] and core[1]<=y<=core[3]
    p2=dict(id=p['id'],name=p['name'],geologic_unit=p['unit'],
      location=dict(lon_e=round(w['lon'],6),lat_n=round(w['lat'],6),elev_geoid_m=w['elev_geoid'],eqc_x_m=round(x,1),eqc_y_m=round(y,1),
        source="NASA/JPL Mars 2020 rover localization waypoints (MMGIS M20_waypoints.json, file name 'M20_waypoints_sol2022_all')",
        source_url=MMGIS+"Layers/json/M20_waypoints.json",waypoint=dict(sol=w['sol'],site=w['site'],drive=w['drive']),
        meaning="rover position at end of the last drive on/before the panorama sol = where the 360° panorama was (approximately) taken",
        confidence="high for rover position (official JPL localization); the named outcrop/target itself may be metres to tens of metres away"),
      in_aoi_core=ins, role="inside AOI: terrain + routes + VR" if ins else "outside AOI: context-only VR stop (no 1 m terrain package yet)",
      sample_or_event=p['sample_or_event'],observation=p['observation'],interpretation=p['interpretation'],
      panoramas=p['panoramas'],panorama_credit="NASA/JPL-Caltech/ASU/MSSS",
      panorama_terms=LIC['mastcam_z_360_panoramas']['licence']+" Credit: "+LIC['mastcam_z_360_panoramas']['credit_line']+". Source: "+LIC['mastcam_z_360_panoramas']['urls'][0]+" (checked "+LICDOC['checked']+")",
      navcam_autopano=dict(url=MMGIS+[i['url'] for i in w['images']][0] if w.get('images') else None,status="listed in JPL waypoint file; HTTP 403 from our server – accessibility unverified"),
      temperature=[meda(s) for s in p['meda_sols']],
      caveat=p.get('caveat'))
    out.append(p2)
doc=dict(version="0.1.0",created="2026-11-14",crs_note="lon/lat planetocentric, east-positive, Mars 2000 sphere R=3396190 m; eqc_x/eqc_y = package grid CRS (Equirectangular, lat_ts=0, lon_0=0)",
  vertical_check="JPL elev_geoid vs HiRISE DTM at 62 waypoints: median difference -0.006 m (p05 -4.3, p95 +0.09) -> HiRISE DTM heights are in the same areoid-referenced system as JPL 'elev_geoid' (note: JPL localization itself uses these maps, so this is consistency, not independent proof).",
  temperature_caveat="MEDA air temperature (ATS) is measured ~1 m-scale near the rover mast/body and is season- and time-of-day dependent; it describes that sol, not a permanent property of the site. Sensor positions for ATS1..5 not yet verified in MEDA docs. Ground temperature (TIRS) exists in MEDA products but not yet extracted.",
  references_verified={"checked":"2026-11-14 via Crossref API","10.1126/science.abo2196":"Farley et al. 2022, Science – Aqueously altered igneous rocks sampled on the floor of Jezero crater, Mars","10.1126/science.abo2756":"Liu et al. 2022, Science – An olivine cumulate outcrop on the floor of Jezero crater, Mars","10.1126/science.abl4051":"Mangold et al. 2021, Science – Perseverance rover reveals an ancient delta-lake system and flood deposits at Jezero crater, Mars","10.1038/s41586-025-09413-0":"Hurowitz et al. 2025, Nature – Redox-driven mineral and organic associations in Jezero Crater, Mars"},
  licences={k:LIC[k] for k in ("jpl_m20_waypoints","mastcam_z_360_panoramas","meda_pds","papers","nasa_press_and_abstracts")},
  removed_unverified="Previous third-party landmark CSV (rab-software.de) no longer used for coordinates.",
  pois=out)
json.dump(doc,open("pois.json","w"),indent=1,ensure_ascii=False)
for p in out: print(p['id'],p['name'],p['location']['lon_e'],p['location']['lat_n'],p['location']['elev_geoid_m'],"IN" if p['in_aoi_core'] else "out",[ (t['sol'],t.get('air_temp_min_C'),t.get('air_temp_max_C')) for t in p['temperature']])
