"""Export the processed AOI (package/v0.1.0, made by process.py) into contract-v1 region bundles
(INTERFACE.md §1-2, src/contracts/manifest.ts) under public/bundles/<bundleId>/.

Run from scripts/data:  python export_bundle.py   then  npm run validate-bundle -- public/bundles/<bundleId>
Bundles: jezero-west-hirise-v0.1.0 (1 m, primary) and jezero-west-ctx20m-v0.1.0 (20 m COARSE fallback).

Local frame: east_m = (x_eqc - x_west) * cos(lat_c), north_m = y_eqc - y_south  (ground metres; origin = SW outer corner).
Equirectangular (lat_ts=0) stretches E-W distances by 1/cos(lat); cos(lat_c) converts projected to ground metres.
"""
import json, math, os, hashlib, shutil, datetime
import numpy as np

PKG = "package/v0.1.0"
OUT_ROOT = os.path.join("..", "..", "public", "bundles")
SCHEMA, SCHEMA_VERSION = "mars-pathfinder/region-bundle", "1.0"
G = json.load(open(f"{PKG}/grid.json")); M = json.load(open(f"{PKG}/manifest.json"))
POIS = json.load(open("pois.json"))
COS = G["ground_scale"]["cos_lat_center"]; R = G["crs"]["radius_m"]; DEG = math.pi / 180 * R
TODAY = datetime.date.today().isoformat()
sha = lambda b: hashlib.sha256(b).hexdigest()

VERT = ("Metres as distributed in the USGS Mars 2020 TRN DTMs (file names 'MOLAtopography_DeltaGeoid'); empirically equal to JPL rover "
        "'elev_geoid' (median diff -0.006 m over 62 waypoints) -> areoid-referenced (MOLA-style). USGS XML text mentions the IAU 2000 sphere; "
        "exact datum wording is a producer ambiguity. Negative values are normal (Jezero floor ~ -2.5 km).")
LIC = json.load(open("licences.json"))["entries"]  # licence register, verified on official pages (see licences.json "checked")
def rights(k):
    e = LIC[k]; v = {True: "verified", "partial": "partially verified (general policy only)", False: "unverified"}[e["verified"]]
    lic = e["licence"].rstrip(); lic += "" if lic.endswith(".") else "."
    return f"{lic} Credit: {e['credit_line']}. [{v} {json.load(open('licences.json'))['checked']}: {e['urls'][0]}]"
def cite(k): return LIC[k].get("citation", "")
AUTH = "Fergason, Galuszka, Hare, Mayer, Redding - USGS Astrogeology Science Center"
SOURCES = {
 "usgs-m2020-hirise-dtm": dict(id="usgs-m2020-hirise-dtm", mission="Mars Reconnaissance Orbiter", instrument="HiRISE",
   title="Mars 2020 Terrain Relative Navigation HiRISE DTM Mosaic (JEZ_hirise_soc_006, 1 m)",
   creator=AUTH, url="https://doi.org/10.5066/P9REJ9JN", version="soc_006 (published 2020-07-24)", rights=rights("hirise_dtm_mosaic_1m"),
   usedFor="Elevation samples (copied 1:1), slope and roughness derivation"),
 "usgs-m2020-hirise-ortho": dict(id="usgs-m2020-hirise-ortho", mission="Mars Reconnaissance Orbiter", instrument="HiRISE",
   title="Mars 2020 Terrain Relative Navigation HiRISE Orthorectified Image Mosaic (JEZ_hirise_soc_006_orthoMosaic_25cm)", creator=AUTH + "; HiRISE: NASA/JPL/University of Arizona",
   url="https://doi.org/10.5066/P9QJDP48", version="soc_006", rights=rights("hirise_orthomosaic_25cm"),
   usedFor="Optional display texture (downsampled 4000->2048 px)"),
 "usgs-m2020-ctx-dtm": dict(id="usgs-m2020-ctx-dtm", mission="Mars Reconnaissance Orbiter", instrument="CTX",
   title="Mars 2020 Terrain Relative Navigation CTX DTM Mosaic (JEZ_ctx_B_soc_008, 20 m)", creator=AUTH + "; CTX: NASA/JPL-Caltech/MSSS",
   url="https://doi.org/10.5066/P906QQT8", version="soc_008 (published 2020-07-24)", rights=rights("ctx_dtm_mosaic_20m"), usedFor="Coarse fallback elevation; consistency check of HiRISE"),
 "usgs-m2020-ctx-ortho": dict(id="usgs-m2020-ctx-ortho", mission="Mars Reconnaissance Orbiter", instrument="CTX", title="Mars 2020 Terrain Relative Navigation Context Camera Orthorectified Image Mosaic (6 m)",
   creator=AUTH + "; CTX: NASA/JPL-Caltech/MSSS", url="https://doi.org/10.5066/P9GV1ND3", version="soc_008", rights=rights("ctx_orthomosaic_6m"), usedFor="Optional display texture of the coarse fallback"),
 "jpl-m20-waypoints": dict(id="jpl-m20-waypoints", mission="Mars 2020", instrument="Rover localization (MMGIS)", title="M20_waypoints.json (NASA/JPL Mars 2020 rover waypoints, sol 2022 release)",
   creator="NASA/JPL-Caltech", url="https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json", version="M20_waypoints_sol2022_all", rights=rights("jpl_m20_waypoints"),
   usedFor="Positions of science stops (rover positions where Mastcam-Z 360° panoramas were taken)"),
 "mastcam-z-360": dict(id="mastcam-z-360", mission="Mars 2020", instrument="Mastcam-Z", title="Mastcam-Z 360° Panorama Collection (Mastcam-Z team, ASU)",
   creator="NASA/JPL-Caltech/ASU/MSSS; " + cite("mastcam_z_360_panoramas"), url="https://mastcamz.asu.edu/mastcam-zs-360-panorama-collection/", version="list as of sol 1889 (2026-06-13)",
   rights=rights("mastcam_z_360_panoramas"), usedFor="Panorama IDs and credit named in the science-stop purpose text (images are not bundled)"),
}

def ld(rel):
    f = M["files"][rel]; return np.fromfile(f"{PKG}/{rel}", dtype="<f4" if f["dtype"] == "float32" else "u1").reshape(f["shape"])

def map_exclusion(bits):
    """Our bit flags -> contract enum. Precedence: missing(1) > outside(3) > manual(4) > unsupported derivative(2)."""
    out = np.zeros(bits.shape, np.uint8)
    out[(bits & (2 | 4)) > 0] = 2
    out[(bits & 16) > 0] = 4
    out[(bits & 8) > 0] = 3
    out[(bits & 1) > 0] = 1
    return out

def build(bundle_id, title, description, prefix, cell_e_proj, cell_n, bounds_m, rough_def, slope_def, coarse, texture, tex_source, src_ids, roughness_win):
    out = os.path.join(OUT_ROOT, bundle_id)
    if os.path.exists(out): shutil.rmtree(out)
    os.makedirs(out)
    z, sl, ro, vm, fl = (ld(f"{prefix}/{n}") for n in ("elevation_m.f32", "slope_deg.f32", "roughness_m.f32", "valid_mask.u8", "exclusion_flags.u8"))
    H, W = z.shape
    quality = np.where(vm == 1, 3, 0).astype(np.uint8)          # no per-pixel quality published -> 3 unknown
    excl = map_exclusion(fl)
    ce = cell_e_proj * COS
    extent = dict(west_m=0.0, east_m=W * ce, south_m=0.0, north_m=H * cell_n)
    layers = {}
    def put(lid, arr, dtype, units, nodata, definition, fname):
        b = np.ascontiguousarray(arr, dtype=np.dtype(dtype).newbyteorder("<")).tobytes()
        open(os.path.join(out, fname), "wb").write(b)
        layers[lid] = dict(file=fname, dtype="float32" if dtype == np.float32 else "uint8", byteOrder="little-endian", units=units,
                           byteLength=len(b), sha256=sha(b), nodata=nodata, definition=definition)
    put("elevation", z, np.float32, "m", "NaN", f"Native {'CTX 20 m' if coarse else 'HiRISE 1 m'} DTM samples copied 1:1 (no resampling) at cell centres; NaN = source NoData. Vertical reference: see crs.verticalReference.", "elevation.f32")
    put("slope", sl, np.float32, "deg", "NaN", slope_def, "slope.f32")
    put("roughness", ro, np.float32, "m", "NaN", rough_def, "roughness.f32")
    put("quality", quality, np.uint8, "class-code", 0, "0 no elevation; 3 unknown for every valid cell. The USGS DTM mosaic publishes NO per-pixel quality/figure-of-merit layer, only global statistics (see limitations); no per-pixel quality was invented. Codes 1/2 unused.", "quality.u8")
    put("exclusion", excl, np.uint8, "class-code", None, "0 none, 1 missing elevation, 2 unsupported derivative (3x3 slope or roughness window incomplete), 3 outside source extent, 4 manual (none applied in this version). Slope limits are NOT baked in (route model profile).", "exclusion.u8")
    # POIs inside extent (science destinations)
    pois = []
    for p in POIS["pois"]:
        x, y = p["location"]["eqc_x_m"], p["location"]["eqc_y_m"]
        e, n = (x - bounds_m["left"]) * COS, y - bounds_m["bottom"]
        if extent["west_m"] <= e < extent["east_m"] and extent["south_m"] < n <= extent["north_m"]:
            w = p["location"]["waypoint"]
            pois.append(dict(id=f"poi-{p['id'].lower()}", name=p["name"], kind="science-stop", position=dict(east_m=round(e, 3), north_m=round(n, 3)),
                purpose=(f"{p['geologic_unit']}. {p['sample_or_event']}. VR stop: Mastcam-Z 360° panoramas {', '.join(q['id'] for q in p['panoramas'])} (credit NASA/JPL-Caltech/ASU/MSSS). "
                         f"Position = JPL rover waypoint sol {w['sol']} site {w['site']} drive {w['drive']} (where the panorama was taken); the named outcrop may be metres to tens of metres away."),
                officialName=False, positionalUncertainty_m=None, sourceIds=["jpl-m20-waypoints", "mastcam-z-360"], synthetic=False))
    assets = []
    if texture:
        tb = open(texture[0], "rb").read(); fn = os.path.basename(texture[1]); open(os.path.join(out, fn), "wb").write(tb)
        assets.append(dict(id=f"{bundle_id}-texture", file=fn, kind="texture", optional=True, byteLength=len(tb), sha256=sha(tb), extent=extent, sourceIds=[tex_source]))
    lim = [
        "Equirectangular source (lat_ts=0): projected E-W metres were converted to ground metres with cos(lat_c)=%.6f; cells are %.5f m (E) x %.1f m (N)." % (COS, ce, cell_n),
        "No per-pixel quality layer exists in the USGS DTM mosaic: all valid cells are quality 3 (unknown); strict quality mode is not supported.",
        "Producer statistics: HiRISE orthoimages co-registered < 3 m (99th pct); HiRISE vs CTX median vertical offset ~0.4 m (CTX above).",
        "Vertical reference wording is ambiguous in USGS metadata (IAU sphere vs MOLA areoid); values match JPL areoid elevations within cm at science stops.",
        "Science-stop names are informal Mars 2020 team names, not IAU-approved names.",
    ]
    if coarse:
        lim[:0] = ["COARSE 20 m FALLBACK: suitable for regional demonstration only, NOT for astronaut-scale navigation. Short steep slopes are smoothed away.",
                   "CTX DTM may be horizontally offset up to ~1 cell (~10-15 m) relative to HiRISE in this area (validation grid search best shift ~8 m W, 12 m N, weak minimum).",
                   "Extent snapped outward to whole native CTX cells; it is ~6 m wider/20 m taller than the HiRISE bundle and NOT the same local origin."]
    else:
        lim.append("Roughness is a detrended residual at %d x %d cells; it is not a rock-size or hazard map." % (roughness_win, roughness_win))
    man = dict(schema=SCHEMA, schemaVersion=SCHEMA_VERSION, bundleId=bundle_id, bundleVersion=bundle_id,
        datasetVersion=("usgs-m2020-trn-ctx-soc008" if coarse else "usgs-m2020-trn-hirise-soc006") + "_role-a-proc-0.1.0", synthetic=False,
        title=title, description=description, createdDate=TODAY,
        crs=dict(description=f"Mars 2000 sphere (R={R:.0f} m), Equirectangular lat_ts=0 lon_0=0 (USGS Mars2020 TRN grid); local frame = ground metres from SW corner, east scaled by cos({math.degrees(math.acos(COS)):.3f}°)",
                 body="Mars", sourceCrs=G["crs"]["wkt"], localOriginInSource=dict(x=bounds_m["left"], y=bounds_m["bottom"], units="m (source Equirectangular x/y of the SW outer corner; east_m = (x - x0)*cos(lat_c), north_m = y - y0)"),
                 verticalReference=VERT, horizontalUnits="m", verticalUnits="m"),
        grid=dict(width=W, height=H, cellSizeEast_m=ce, cellSizeNorth_m=float(cell_n), extent=extent, orientation="north-up", order="row-major", sampleConvention="cell-center"),
        layers=layers,
        qualityClasses=[dict(code=0, key="no-elevation", label="No elevation", sourceCategories=["source NoData (-3.4028226550889045e38)"]),
                        dict(code=1, key="good", label="Documented good quality", sourceCategories=[]),
                        dict(code=2, key="low", label="Documented low quality", sourceCategories=[]),
                        dict(code=3, key="unknown", label="Unknown quality (no per-pixel quality published)", sourceCategories=["USGS DTM mosaic valid sample without per-pixel figure-of-merit"])],
        strictQualitySupported=False, pointsOfInterest=pois, displayAssets=assets, sources=[SOURCES[s] for s in src_ids], limitations=lim,
        processing=dict(script="scripts/data/process.py + scripts/data/export_bundle.py", parameters=dict(
            aoi_x_west_m=bounds_m["left"], aoi_x_east_m=bounds_m["right"], aoi_y_south_m=bounds_m["bottom"], aoi_y_north_m=bounds_m["top"],
            lon_west_e=round(bounds_m["left"] / DEG, 6), lon_east_e=round(bounds_m["right"] / DEG, 6), lat_south_n=round(bounds_m["bottom"] / DEG, 6), lat_north_n=round(bounds_m["top"] / DEG, 6),
            cos_lat_center=COS, slope_method="Horn 1981 3x3", roughness_window_cells=roughness_win, margin_m=250, resampling="none", package_version=M["package_version"])))
    json.dump(man, open(os.path.join(out, "manifest.json"), "w"), indent=2, ensure_ascii=False); open(os.path.join(out, "manifest.json"), "a").write("\n")
    # human-readable inspection file (like synthetic-v0/INSPECT.txt)
    with open(os.path.join(out, "INSPECT.txt"), "w") as f:
        f.write(f"{bundle_id} ({W}x{H}, row 0 = north, cell {ce:.5f} m E x {cell_n} m N, ground metres)\n")
        for name, a in (("elevation m", z), ("slope deg", sl), ("roughness m", ro)):
            v = a[np.isfinite(a)]; f.write(f"{name:12s} min {v.min():.3f} p50 {np.median(v):.3f} max {v.max():.3f} non-finite {a.size - v.size}\n")
        f.write(f"quality codes {dict(zip(*[x.tolist() for x in np.unique(quality, return_counts=True)]))}\nexclusion codes {dict(zip(*[x.tolist() for x in np.unique(excl, return_counts=True)]))}\n")
        for r, c in ((0, 0), (0, W - 1), (H - 1, 0), (H - 1, W - 1), (H // 2, W // 2)):
            f.write(f"cell r{r} c{c}: east_m {(c + .5) * ce:.3f} north_m {(H - r - .5) * cell_n:.3f} elev {z[r, c]:.3f} slope {sl[r, c]:.2f}\n")
        for p in pois: f.write(f"{p['id']}: east_m {p['position']['east_m']} north_m {p['position']['north_m']}\n")
    print(bundle_id, W, H, round(ce, 6), "POIs", [p["id"] for p in pois])
    return man

P, Fb = G["primary"], G["fallback_ctx20m"]
build("jezero-west-hirise-v0.1.0", "Jezero crater – western delta front (HiRISE 1 m)",
      "~0.95 km² of the western Jezero delta front (Hawksbill Gap / Enchanted Lake / Three Forks), Mars. Native USGS HiRISE 1 m DTM samples with Horn slope and plane-residual roughness. Real Mars data.",
      "arrays", 1.0, 1.0, P["bounds_m"],
      "RMS residual after least-squares plane fit over 5x5 cells (4.74 m E x 5 m N ground); NaN where the window is incomplete.",
      "Horn (1981) 3x3 finite differences on ground spacing (dx = 0.94857 m, dy = 1 m), computed on a 250 m margin then cropped; degrees, 0 = flat.",
      False, (f"{PKG}/textures/hirise_ortho_2048.jpg", "texture-hirise-2048.jpg"), "usgs-m2020-hirise-ortho",
      ["usgs-m2020-hirise-dtm", "usgs-m2020-hirise-ortho", "usgs-m2020-ctx-dtm", "jpl-m20-waypoints", "mastcam-z-360"], 5)
build("jezero-west-ctx20m-v0.1.0", "Jezero crater – western delta front (CTX 20 m COARSE fallback)",
      "COARSE FALLBACK. Same area at native USGS CTX 20 m posts (51x51). Use only if the HiRISE bundle cannot be used; label as coarse 20 m in the UI. Real Mars data.",
      "fallback_ctx20m", 20.0, 20.0, dict(left=Fb["bounds_m"]["left"], right=Fb["bounds_m"]["right"], bottom=Fb["bounds_m"]["bottom"], top=Fb["bounds_m"]["top"]),
      "RMS residual after least-squares plane fit over 3x3 cells (~57 m E x 60 m N ground); NOT comparable to 1 m roughness.",
      "Horn (1981) 3x3 on 20 m posts (dx = 18.97 m ground, dy = 20 m), computed with a 3-cell margin then cropped; degrees. Smooths slopes shorter than ~60 m.",
      True, (f"{PKG}/fallback_ctx20m/ctx_ortho_texture.jpg", "texture-ctx.jpg"), "usgs-m2020-ctx-ortho",
      ["usgs-m2020-ctx-dtm", "usgs-m2020-ctx-ortho", "jpl-m20-waypoints", "mastcam-z-360"], 3)
