"""Reproducible acquisition: full download of small CTX products, windowed (HTTP range) extracts of large products.
Outputs go to raw/ (never edited afterwards). Writes raw/CHECKSUMS.sha256 and raw/acquisition_log.json."""
import json, hashlib, os, subprocess, datetime, numpy as np, rasterio
from rasterio.windows import from_bounds, Window
from rasterio.env import Env
C = json.load(open("config.json")); R = C["mars_radius_m"]; D = np.pi/180*R
log = {"run_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(), "items": []}
CTX = "https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/CTX/"
def dl(url, out):
    if not os.path.exists(out): subprocess.run(["curl","-sSf","-o",out,url], check=True)
    log["items"].append({"type":"full_download","url":url,"file":out})
os.makedirs("raw/ctx",exist_ok=True)
for f in ["JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0.tif","JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0.xml",
          "JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0.tif","JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0.xml"]:
    dl(CTX+f, "raw/ctx/"+f)
def extract(url, bounds, out):
    """Windowed read via /vsicurl/ (no resampling, whole source pixels, original values/dtype/nodata kept)."""
    with Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", GDAL_HTTP_MULTIRANGE="YES", GDAL_HTTP_MERGE_CONSECUTIVE_RANGES="YES"):
        with rasterio.open("/vsicurl/"+url) as s:
            w = from_bounds(*bounds, transform=s.transform).round_offsets().round_lengths()
            a = s.read(1, window=w); prof = s.profile.copy()
            prof.update(width=a.shape[1], height=a.shape[0], transform=s.window_transform(w), compress="deflate", tiled=False, blockxsize=None, blockysize=None)
            for k in ("blockxsize","blockysize"): prof.pop(k, None)
            with rasterio.open(out, "w", **prof) as d: d.write(a, 1)
    log["items"].append({"type":"windowed_extract","url":url,"file":out,"window_col_row_w_h":[int(w.col_off),int(w.row_off),int(w.width),int(w.height)],"requested_bounds":bounds})
os.makedirs("raw/hrsc_mola",exist_ok=True); os.makedirs("raw/hirise",exist_ok=True)
lo0,la0,lo1,la1 = C["hrsc_mola_window_lonlat"]
extract(C["hrsc_mola_url"], [lo0,la0,lo1,la1], "raw/hrsc_mola/hrsc_mola_blend200m_v2_jezero_window.tif")
cx, cy = round(C["aoi_center_lonlat"][0]*D), round(C["aoi_center_lonlat"][1]*D)
h = C["aoi_core_size_m"]/2 + C["aoi_buffer_m"]
bb = [cx-h, cy-h, cx+h, cy+h]
extract(C["hirise_dtm_url"], bb, "raw/hirise/hirise_dtm_1m_candidate_aoi_buffered.tif")
extract(C["hirise_ortho_url"], bb, "raw/hirise/hirise_ortho_25cm_candidate_aoi_buffered.tif")
with open("raw/CHECKSUMS.sha256","w") as f:
    for root,_,files in os.walk("raw"):
        for n in sorted(files):
            p=os.path.join(root,n)
            if n in ("CHECKSUMS.sha256","acquisition_log.json"): continue
            f.write(hashlib.sha256(open(p,"rb").read()).hexdigest()+"  "+p+"\n")
log["aoi_buffered_bounds_eqc_m"]=bb
json.dump(log, open("raw/acquisition_log.json","w"), indent=1)
print(json.dumps(log, indent=1))
