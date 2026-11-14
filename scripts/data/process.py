"""Build the browser data package package/v<version>/ from raw/ inputs. Deterministic; parameters below + config.json.
Run: python process.py   (after acquire.py). Then: python package/v0.1.0/validate.py"""
import json, os, sys, math, hashlib, datetime, shutil, platform
import numpy as np, rasterio, pyproj, scipy, PIL
from rasterio.windows import from_bounds
from rasterio.warp import reproject, Resampling
from PIL import Image
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
sys.path.insert(0, "src"); from terrain import horn_slope_deg, plane_residual_rms

VERSION = "0.1.0"; FORMAT = "jezero-pkg/1"
C = json.load(open("config.json")); R = C["mars_radius_m"]; DEG = math.pi / 180 * R
CORE = dict(left=4587569.0, bottom=1093474.0, right=4588569.0, top=1094474.0)   # approved AOI (Eqc metres)
MARGIN = 250.0
ROUGH_WIN_HI = 5      # cells (5 x 5 m projected = 4.74 m E-W x 5 m N-S ground)
ROUGH_WIN_CTX = 3     # cells (60 x 60 m projected = 56.9 m x 60 m ground)
MANUAL_EXCLUSIONS = []  # list of {"x0","y0","x1","y1","reason"} in Eqc metres; none applied in v0.1.0
TEX_SIZE = 2048
F_MISSING, F_NEIGH_SLOPE, F_NEIGH_ROUGH, F_OUTSIDE, F_MANUAL = 1, 2, 4, 8, 16
RAW = dict(hi_dtm="raw/hirise/hirise_dtm_1m_candidate_aoi_buffered.tif", hi_ortho="raw/hirise/hirise_ortho_25cm_candidate_aoi_buffered.tif",
           ctx_dtm="raw/ctx/JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0.tif",
           ctx_ortho="raw/ctx/JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0.tif")
OUT = f"package/v{VERSION}"
sha = lambda p: hashlib.sha256(open(p, "rb").read()).hexdigest()
lat_c = ((CORE["bottom"] + CORE["top"]) / 2) / DEG
COS = math.cos(math.radians(lat_c))
cos_n, cos_s = math.cos(math.radians(CORE["top"] / DEG)), math.cos(math.radians(CORE["bottom"] / DEG))
log = dict(package_version=VERSION, created_utc=datetime.datetime.now(datetime.timezone.utc).isoformat(), steps=[],
           software=dict(python=platform.python_version(), numpy=np.__version__, rasterio=rasterio.__version__, gdal=rasterio.__gdal_version__,
                         pyproj=pyproj.__version__, proj=pyproj.proj_version_str, scipy=scipy.__version__, pillow=PIL.__version__),
           inputs={k: dict(path=v, sha256=sha(v)) for k, v in RAW.items()})
step = lambda s, **kw: log["steps"].append(dict(step=s, **kw))
if os.path.exists(OUT): shutil.rmtree(OUT)
for d in ("arrays", "fallback_ctx20m", "textures", "overlays", "validation"): os.makedirs(f"{OUT}/{d}", exist_ok=True)

def read_nan(path, bounds=None):
    with rasterio.open(path) as s:
        w = from_bounds(*bounds, transform=s.transform).round_offsets().round_lengths() if bounds else None
        a = s.read(1, window=w).astype(np.float64); nd = s.nodata
        tr = s.window_transform(w) if w else s.transform; crs = s.crs
    invalid = ~np.isfinite(a) | (a == nd) | (a < -1e30)          # NoData sentinel only; negative elevations are VALID
    a[invalid] = np.nan
    return a, tr, crs

# ---------- HiRISE 1 m (primary) ----------
zb, trb, CRS = read_nan(RAW["hi_dtm"])
off = int(round(MARGIN))                    # 1 m cells
assert abs(trb.c + off - CORE["left"]) < 1e-6 and abs(trb.f - off - CORE["top"]) < 1e-6 and zb.shape == (1500, 1500)
H, W = 1000, 1000
sl_b = horn_slope_deg(zb, COS * trb.a, -trb.e)
ro_b = plane_residual_rms(zb, COS * trb.a, -trb.e, ROUGH_WIN_HI)
crop = (slice(off, off + H), slice(off, off + W))
z, slope, rough = zb[crop], sl_b[crop], ro_b[crop]
valid = np.isfinite(z)
flags = np.zeros((H, W), np.uint8)
flags[~valid] |= F_MISSING
flags[valid & ~np.isfinite(slope)] |= F_NEIGH_SLOPE
flags[valid & ~np.isfinite(rough)] |= F_NEIGH_ROUGH
for m in MANUAL_EXCLUSIONS: pass     # none in v0.1.0 (code reserved)
step("hirise_core", source="hirise_dtm_mosaic_1m", resampling="none (native 1 m samples copied)", core_bounds=CORE, margin_m=MARGIN,
     slope="Horn (1981) 3x3, computed on buffered 1500x1500 then cropped", roughness=f"RMS residual of LSQ plane, {ROUGH_WIN_HI}x{ROUGH_WIN_HI} cells",
     dx_ground_m=COS * trb.a, dy_ground_m=-trb.e, cos_lat_center=COS, cos_lat_north_edge=cos_n, cos_lat_south_edge=cos_s)

# independent consistency layer: CTX DTM bilinear onto HiRISE grid
core_tr = rasterio.transform.from_origin(CORE["left"], CORE["top"], 1.0, 1.0)
ctx_on_hi = np.full((H, W), np.nan)
with rasterio.open(RAW["ctx_dtm"]) as s:
    reproject(rasterio.band(s, 1), ctx_on_hi, dst_transform=core_tr, dst_crs=CRS, resampling=Resampling.bilinear, src_nodata=s.nodata, dst_nodata=np.nan)
ctx_on_hi[ctx_on_hi < -1e30] = np.nan
cons = (ctx_on_hi - z).astype(np.float32)
step("consistency_layer", what="CTX20m (bilinear to 1 m) minus HiRISE; inter-product agreement, NOT an error map")

# ---------- CTX 20 m fallback, native grid ----------
with rasterio.open(RAW["ctx_dtm"]) as s:
    ct = s.transform
c0 = math.floor((CORE["left"] - ct.c) / ct.a); c1 = math.ceil((CORE["right"] - ct.c) / ct.a)
r0 = math.floor((ct.f - CORE["top"]) / -ct.e); r1 = math.ceil((ct.f - CORE["bottom"]) / -ct.e)
pad = 3
with rasterio.open(RAW["ctx_dtm"]) as s:
    zc_b = s.read(1, window=rasterio.windows.Window(c0 - pad, r0 - pad, c1 - c0 + 2 * pad, r1 - r0 + 2 * pad)).astype(np.float64)
    zc_b[(zc_b == s.nodata) | (zc_b < -1e30) | ~np.isfinite(zc_b)] = np.nan
ctx_tr = rasterio.transform.Affine(ct.a, 0, ct.c + c0 * ct.a, 0, ct.e, ct.f + r0 * ct.e)
slc_b = horn_slope_deg(zc_b, COS * ct.a, -ct.e); roc_b = plane_residual_rms(zc_b, COS * ct.a, -ct.e, ROUGH_WIN_CTX)
cc = (slice(pad, -pad), slice(pad, -pad))
zc, slc, roc = zc_b[cc], slc_b[cc], roc_b[cc]; vc = np.isfinite(zc)
fc = np.zeros(zc.shape, np.uint8); fc[~vc] |= F_MISSING; fc[vc & ~np.isfinite(slc)] |= F_NEIGH_SLOPE; fc[vc & ~np.isfinite(roc)] |= F_NEIGH_ROUGH
ctx_bounds = dict(left=ctx_tr.c, top=ctx_tr.f, right=ctx_tr.c + zc.shape[1] * ct.a, bottom=ctx_tr.f + zc.shape[0] * ct.e)
step("ctx_fallback", source="ctx_dtm_mosaic_20m", resampling="none (native 20 m cells covering the core AOI, snapped outward)", shape=list(zc.shape), bounds=ctx_bounds,
     roughness=f"RMS residual of LSQ plane, {ROUGH_WIN_CTX}x{ROUGH_WIN_CTX} cells (~57x60 m) - NOT comparable to the 1 m roughness")

# ---------- textures ----------
with rasterio.open(RAW["hi_ortho"]) as s:
    ow = from_bounds(CORE["left"], CORE["bottom"], CORE["right"], CORE["top"], transform=s.transform).round_offsets().round_lengths()
    o = s.read(1, window=ow); otr = s.window_transform(ow)
assert o.shape == (4000, 4000) and abs(otr.c - CORE["left"]) < 1e-6 and abs(otr.f - CORE["top"]) < 1e-6
o_nod = (o == 0)
tex = Image.fromarray(o).resize((TEX_SIZE, TEX_SIZE), Image.BOX)
tex.save(f"{OUT}/textures/hirise_ortho_{TEX_SIZE}.jpg", quality=90)
with rasterio.open(RAW["ctx_ortho"]) as s:
    cw = from_bounds(ctx_bounds["left"], ctx_bounds["bottom"], ctx_bounds["right"], ctx_bounds["top"], transform=s.transform)
    co = s.read(1, window=cw.round_offsets().round_lengths(), out_shape=(zc.shape[0] * 10, zc.shape[1] * 10), resampling=Resampling.bilinear)
Image.fromarray(co).save(f"{OUT}/fallback_ctx20m/ctx_ortho_texture.jpg", quality=90)
step("textures", hirise=f"25 cm ortho crop 4000x4000 (exact core bounds, same producer grid origin as DTM) box-downsampled to {TEX_SIZE}x{TEX_SIZE} (~0.49 m/px projected); ortho nodata pixels in crop: {int(o_nod.sum())}",
     ctx="6 m CTX ortho crop over CTX fallback bounds, bilinear to 10 px per 20 m cell (display only)")

# ---------- overlays + legends ----------
def overlay(a, cmap, vmin, vmax, path):
    rgba = (matplotlib.colormaps[cmap]((np.clip(a, vmin, vmax) - vmin) / (vmax - vmin)) * 255).astype(np.uint8)
    rgba[..., 3] = np.where(np.isfinite(a), 255, 0); Image.fromarray(rgba).save(path)
def legend(cmap, vmin, vmax, label, path, ticks=None):
    fig, ax = plt.subplots(figsize=(4, 0.8)); fig.subplots_adjust(bottom=0.5)
    cb = matplotlib.colorbar.ColorbarBase(ax, cmap=matplotlib.colormaps[cmap], norm=matplotlib.colors.Normalize(vmin, vmax), orientation="horizontal", ticks=ticks)
    cb.set_label(label); fig.savefig(path, dpi=100, transparent=True); plt.close(fig)
overlay(slope, "magma", 0, 35, f"{OUT}/overlays/slope_deg.png"); legend("magma", 0, 35, "Slope (degrees), ≥35 saturated", f"{OUT}/overlays/legend_slope_deg.png", [0, 5, 10, 15, 20, 25, 30, 35])
overlay(rough, "viridis", 0, 0.5, f"{OUT}/overlays/roughness_m.png"); legend("viridis", 0, 0.5, "Roughness RMS (m), 5 m window, ≥0.5 saturated", f"{OUT}/overlays/legend_roughness_m.png")
ex = np.zeros((H, W, 4), np.uint8); ex[flags > 0] = (255, 0, 0, 160); Image.fromarray(ex).save(f"{OUT}/overlays/exclusion.png")
overlay(slc, "magma", 0, 35, f"{OUT}/fallback_ctx20m/overlay_slope_deg.png")

# ---------- write arrays ----------
files = {}
def wbin(rel, arr, dtype, units, desc, source_ids, nodata=None):
    a = np.ascontiguousarray(arr.astype(dtype)).astype(np.dtype(dtype).newbyteorder("<"))
    p = f"{OUT}/{rel}"; a.tofile(p)
    fin = np.isfinite(a) if a.dtype.kind == "f" else np.ones(a.shape, bool)
    files[rel] = dict(kind="array", dtype=("float32" if dtype == np.float32 else "uint8"), byte_order="little", shape=list(a.shape), order="row-major, row 0 = north",
                      units=units, description=desc, nodata=nodata, source_ids=source_ids, bytes=os.path.getsize(p), sha256=sha(p),
                      finite_count=int(fin.sum()), min=float(np.nanmin(a)) if fin.any() else None, max=float(np.nanmax(a)) if fin.any() else None)
HI = ["hirise_dtm_mosaic_1m"]
wbin("arrays/elevation_m.f32", z, np.float32, "m (areoid-referenced, see grid.json)", "Elevation, native HiRISE DTM samples (cell centres)", HI, "NaN")
wbin("arrays/valid_mask.u8", valid, np.uint8, "1=valid elevation, 0=NoData", "Validity mask (source NoData only; negative values are valid)", HI)
wbin("arrays/slope_deg.f32", slope, np.float32, "degrees (0=flat, 90=vertical)", "Slope, Horn 3x3, ground spacing with cos(lat) E-W factor", HI, "NaN")
wbin("arrays/roughness_m.f32", rough, np.float32, "m (RMS)", f"RMS residual after LSQ plane fit in {ROUGH_WIN_HI}x{ROUGH_WIN_HI} cells (4.74 m E-W x 5 m N-S ground)", HI, "NaN")
wbin("arrays/exclusion_flags.u8", flags, np.uint8, "bit flags", "1 missing elevation | 2 insufficient 3x3 neighbourhood (slope) | 4 insufficient 5x5 neighbourhood (roughness) | 8 outside source extent | 16 manual exclusion; 0 = usable", HI)
wbin("arrays/ctx_minus_hirise_m.f32", cons, np.float32, "m", "Inter-product consistency: CTX 20 m (bilinear) minus HiRISE. Not an error estimate.", HI + ["ctx_dtm_mosaic_20m"], "NaN")
CX = ["ctx_dtm_mosaic_20m"]
wbin("fallback_ctx20m/elevation_m.f32", zc, np.float32, "m", "CTX DTM native 20 m samples (COARSE FALLBACK)", CX, "NaN")
wbin("fallback_ctx20m/valid_mask.u8", vc, np.uint8, "1/0", "Validity mask", CX)
wbin("fallback_ctx20m/slope_deg.f32", slc, np.float32, "degrees", "Slope Horn 3x3 on 20 m cells (smooths short slopes)", CX, "NaN")
wbin("fallback_ctx20m/roughness_m.f32", roc, np.float32, "m (RMS)", "RMS plane residual 3x3 cells (~57x60 m)", CX, "NaN")
wbin("fallback_ctx20m/exclusion_flags.u8", fc, np.uint8, "bit flags", "same codes as primary", CX)

# ---------- grid / CRS + test points ----------
geod = pyproj.CRS.from_wkt(CRS.to_wkt()).geodetic_crs
tf = pyproj.Transformer.from_crs(pyproj.CRS.from_wkt(CRS.to_wkt()), geod, always_xy=True)
def cell_point(name, row, col):
    x = CORE["left"] + (col + 0.5); y = CORE["top"] - (row + 0.5); lon, lat = tf.transform(x, y)
    return dict(name=name, row=row, col=col, x_m=x, y_m=y, lon_e=round(lon, 8), lat_n=round(lat, 8), elevation_m=float(np.float32(z[row, col])),
                slope_deg=float(np.float32(slope[row, col])))
tp = [cell_point(n, r, c) for n, r, c in [("NW corner cell", 0, 0), ("NE corner cell", 0, W - 1), ("SW corner cell", H - 1, 0), ("SE corner cell", H - 1, W - 1),
                                          ("centre cell", 500, 500), ("interior A", 123, 789), ("interior B", 876, 234)]]
grid = dict(format=FORMAT, crs=dict(name="Equirectangular Mars 2000 Sphere IAU (same as USGS Mars2020 TRN products)", wkt=CRS.to_wkt(),
       proj4=pyproj.CRS.from_wkt(CRS.to_wkt()).to_proj4(), body="Mars", radius_m=R, latitude_type="planetocentric", longitude_direction="positive east",
       longitude_domain="-180..180 (values here ~77.4 E)", units="metre"),
  vertical=dict(reference="Elevations as distributed by USGS (filename 'MOLAtopography_DeltaGeoid'); empirically identical to JPL rover 'elev_geoid' (median diff -0.006 m over 62 waypoints) -> areoid-referenced, MOLA-style. USGS XML text mentions the IAU sphere; treat exact datum definition as producer-documented ambiguity.", units="m", positive="up"),
  primary=dict(shape=[H, W], cell_size_projected_m=[1.0, 1.0], origin_top_left_corner_m=[CORE["left"], CORE["top"]],
       bounds_m=CORE, bounds_lonlat=dict(west=CORE["left"] / DEG, east=CORE["right"] / DEG, south=CORE["bottom"] / DEG, north=CORE["top"] / DEG),
       sample_convention="Each array value is the value AT THE CELL CENTRE. Cell (row, col) centre: x = left + col + 0.5, y = top - row - 0.5 (metres). Source GeoTIFF AREA_OR_POINT=Area; values copied 1:1, no resampling.",
       affine_gdal=[CORE["left"], 1.0, 0.0, CORE["top"], 0.0, -1.0]),
  ground_scale=dict(note="Equirectangular with lat_ts=0 stretches E-W distances by 1/cos(lat). One projected metre east-west = cos(lat) ground metres.",
       cos_lat_center=COS, cos_lat_north=cos_n, cos_lat_south=cos_s, dx_ground_m=COS, dy_ground_m=1.0,
       core_ground_size_m=[W * COS, H * 1.0], core_ground_area_km2=W * COS * H / 1e6,
       variation_across_aoi="cos(lat) changes by %.2e relative across the AOI -> constant factor used" % (abs(cos_n - cos_s) / COS)),
  mesh_contract=dict(vertices="one vertex per delivered sample at the cell centre (no derived surface)", vertex_local_coords="X_east_m = (col + 0.5 - W/2) * dx_ground_m ; Z_south_m = (row + 0.5 - H/2) * 1.0 ; Y_up_m = elevation_m - reference_elevation_m",
       reference_elevation_m=float(np.float32(np.nanmedian(z))), extent_note="mesh spans first-to-last cell centres: (W-1)*dx_ground x (H-1) m; do not extend beyond bounds_m",
       texture_uv="u = (x - left)/1000, v = (top - y)/1000 (texture covers exactly bounds_m; texel rows north->south)", invalid_cells="valid_mask==0 -> drop triangles touching the vertex"),
  test_points=tp,
  fallback_ctx20m=dict(shape=list(zc.shape), cell_size_projected_m=[ct.a, -ct.e], bounds_m=ctx_bounds, origin_top_left_corner_m=[ctx_tr.c, ctx_tr.f],
       dx_ground_m=ct.a * COS, dy_ground_m=-ct.e, note="native CTX grid (fractional origin) snapped OUTWARD to cover the core; extends slightly beyond core bounds; same CRS"))
json.dump(grid, open(f"{OUT}/grid.json", "w"), indent=1)

# ---------- science destinations P3-P5 ----------
P = json.load(open("pois.json"))
dest = []
for p in P["pois"]:
    x, y = p["location"]["eqc_x_m"], p["location"]["eqc_y_m"]
    colf, rowf = x - CORE["left"] - 0.5, CORE["top"] - y - 0.5
    inside = 0 <= x - CORE["left"] < W and 0 <= CORE["top"] - y < H
    d = dict(id=p["id"], name=p["name"], inside_core=inside, lon_e=p["location"]["lon_e"], lat_n=p["location"]["lat_n"], x_m=x, y_m=y,
             jpl_elev_geoid_m=p["location"]["elev_geoid_m"], position_source=p["location"]["source"], waypoint=p["location"]["waypoint"],
             confidence=p["location"]["confidence"] + "; point = rover position where the 360° panorama was taken", geologic_unit=p["geologic_unit"])
    if inside:
        r, c = int(math.floor(rowf + 0.5)), int(math.floor(colf + 0.5))
        d.update(row_float=round(rowf, 2), col_float=round(colf, 2), row=r, col=c, local_ground_east_m=round((colf + 0.5) * COS, 2), local_ground_south_m=round(rowf + 0.5, 2),
                 package_elevation_m=float(np.float32(z[r, c])), package_slope_deg=float(np.float32(slope[r, c])), package_roughness_m=float(np.float32(rough[r, c])),
                 elev_diff_jpl_minus_package_m=round(p["location"]["elev_geoid_m"] - float(z[r, c]), 3),
                 panoramas=p["panoramas"], panorama_credit=p["panorama_credit"], observation=p["observation"], interpretation=p["interpretation"])
        dest.append(d)
json.dump(dict(note="Science destinations inside the core AOI. Coordinates from NASA/JPL waypoints via pois.json; full POI list (incl. context-only sites) in pois.json.", destinations=dest),
          open(f"{OUT}/destinations.json", "w"), indent=1, ensure_ascii=False)
shutil.copy("pois.json", f"{OUT}/pois_all.json")
shutil.copy("sources.json", f"{OUT}/sources.json")

# ---------- manifest ----------
for t in ("README.md", "validate.py"): shutil.copy(f"package_template/{t}", f"{OUT}/{t}")
for rel in ["grid.json", "destinations.json", "pois_all.json", "sources.json", f"textures/hirise_ortho_{TEX_SIZE}.jpg", "overlays/slope_deg.png", "overlays/legend_slope_deg.png",
            "overlays/roughness_m.png", "overlays/legend_roughness_m.png", "overlays/exclusion.png", "fallback_ctx20m/ctx_ortho_texture.jpg", "fallback_ctx20m/overlay_slope_deg.png", "README.md", "validate.py"]:
    p = f"{OUT}/{rel}"; files[rel] = dict(kind="asset", bytes=os.path.getsize(p), sha256=sha(p))
for rel in ("textures/hirise_ortho_2048.jpg",): files[rel].update(pixels=[TEX_SIZE, TEX_SIZE], covers="primary bounds_m exactly", source_ids=["hirise_orthomosaic_25cm"], downsample="box 4000->2048", credit="NASA/JPL-Caltech/UArizona; USGS Astrogeology mosaic")
files["fallback_ctx20m/ctx_ortho_texture.jpg"].update(covers="fallback bounds_m exactly", source_ids=["ctx_orthomosaic_6m"])
step("package", files=len(files))
json.dump(log, open(f"{OUT}/processing_log.json", "w"), indent=1)
pl = f"{OUT}/processing_log.json"; files["processing_log.json"] = dict(kind="asset", bytes=os.path.getsize(pl), sha256=sha(pl))
manifest = dict(format=FORMAT, package_version=VERSION, created_utc=log["created_utc"], mode="HIGH_RESOLUTION",
                mode_label="HiRISE 1 m DTM (primary). CTX 20 m fallback included and must be labelled 'coarse 20 m' if shown.",
                region="Western Jezero crater delta front, Mars", total_bytes=sum(v["bytes"] for v in files.values()), files=files)
json.dump(manifest, open(f"{OUT}/manifest.json", "w"), indent=1)
print(json.dumps(dict(total_MB=manifest["total_bytes"] / 1e6, ctx_shape=zc.shape, ctx_bounds=ctx_bounds, dest=[(d["id"], d["row"], d["col"], d["package_elevation_m"], d["elev_diff_jpl_minus_package_m"]) for d in dest]), indent=1))
