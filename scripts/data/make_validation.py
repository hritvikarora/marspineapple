"""Validation evidence for package/v0.1.0 -> package/v0.1.0/validation/{validation_report.json, *.png}."""
import json, math, subprocess, sys, numpy as np, rasterio
from rasterio.env import Env
from rasterio.warp import reproject, Resampling
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
OUT = "package/v0.1.0"; G = json.load(open(f"{OUT}/grid.json")); M = json.load(open(f"{OUT}/manifest.json"))
H, W = G["primary"]["shape"]; B = G["primary"]["bounds_m"]
ld = lambda rel: np.fromfile(f"{OUT}/{rel}", dtype="<f4" if rel.endswith("f32") else "u1").reshape(M["files"][rel]["shape"])
z, sl, ro, vm, fl, cons = (ld(f"arrays/{n}") for n in ["elevation_m.f32", "slope_deg.f32", "roughness_m.f32", "valid_mask.u8", "exclusion_flags.u8", "ctx_minus_hirise_m.f32"])
rep = {}
# 1. test points vs ORIGINAL distributor file (remote, independent of raw/ window)
url = "/vsicurl/https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/HiRISE/JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40.tif"
with Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR"), rasterio.open(url) as s:
    vals = [float(v[0]) for v in s.sample([(t["x_m"], t["y_m"]) for t in G["test_points"]])]
rep["test_points_vs_distributor_file"] = [dict(name=t["name"], row=t["row"], col=t["col"], package=float(z[t["row"], t["col"]]), distributor=v, diff=float(z[t["row"], t["col"]]) - v) for t, v in zip(G["test_points"], vals)]
rep["test_points_max_abs_diff_m"] = max(abs(r["diff"]) for r in rep["test_points_vs_distributor_file"])
# 2. landmarks: JPL rover elevation vs package
D = json.load(open(f"{OUT}/destinations.json"))["destinations"]
rep["landmarks_jpl_vs_package"] = [dict(id=d["id"], row=d["row"], col=d["col"], jpl_elev_geoid=d["jpl_elev_geoid_m"], package=d["package_elevation_m"], diff_m=d["elev_diff_jpl_minus_package_m"]) for d in D]
# 3. horizontal alignment: phase correlation
def phase_shift(a, b):
    a = (a - a.mean()) * np.hanning(a.shape[0])[:, None] * np.hanning(a.shape[1]); b = (b - b.mean()) * np.hanning(b.shape[0])[:, None] * np.hanning(b.shape[1])
    Fa, Fb = np.fft.fft2(a), np.fft.fft2(b); r = Fa * np.conj(Fb); r /= np.abs(r) + 1e-12; c = np.fft.ifft2(r).real
    i, j = np.unravel_index(np.argmax(c), c.shape)
    def sub(cm, cc, cp): d = cm - 2 * cc + cp; return 0.0 if d == 0 else 0.5 * (cm - cp) / d
    di = i + sub(c[i - 1, j], c[i, j], c[(i + 1) % c.shape[0], j]); dj = j + sub(c[i, j - 1], c[i, j], c[i, (j + 1) % c.shape[1]])
    if di > c.shape[0] / 2: di -= c.shape[0]
    if dj > c.shape[1] / 2: dj -= c.shape[1]
    return float(di), float(dj), float(c.max())
tr6 = rasterio.transform.from_origin(B["left"], B["top"], 6.0, 6.0); n6 = int(1000 // 6)
hi6 = np.zeros((n6, n6)); ctx6 = np.zeros((n6, n6))
with rasterio.open("raw/hirise/hirise_ortho_25cm_candidate_aoi_buffered.tif") as s:
    reproject(rasterio.band(s, 1), hi6, dst_transform=tr6, dst_crs=s.crs, resampling=Resampling.average)
with rasterio.open("raw/ctx/JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0.tif") as s:
    reproject(rasterio.band(s, 1), ctx6, dst_transform=tr6, dst_crs=s.crs, resampling=Resampling.bilinear)
di, dj, pk = phase_shift(hi6, ctx6)
rep["ortho_alignment_hirise_vs_ctx"] = dict(method="phase correlation on 6 m grid over core (HiRISE ortho area-averaged, CTX ortho bilinear)", shift_rows=di, shift_cols=dj, shift_east_m=-dj * 6, shift_north_m=di * 6, peak=pk,
                                           producer_claim="94.1% of matched HiRISE-CTX features < 6 m displacement")
from scipy import ndimage
with rasterio.open("raw/hirise/hirise_dtm_1m_candidate_aoi_buffered.tif") as s: zb = s.read(1).astype(float)
Hs = ndimage.uniform_filter(zb, 21)                       # HiRISE smoothed to ~CTX post spacing
ctx1 = cons.astype(float) + z.astype(float)               # CTX bilinear on the 1 m core grid
best = None; surf = {}
for dy in range(-40, 41, 2):
    for dx in range(-40, 41, 2):
        h = Hs[250 - dy:1250 - dy, 250 + dx:1250 + dx]    # HiRISE shifted dx east, dy north
        d = ctx1 - h; v = float(np.std(d)); surf[(dx, dy)] = v
        if best is None or v < best[0]: best = (v, dx, dy)
rep["dtm_alignment_hirise_vs_ctx"] = dict(method="grid search: std(CTX(bilinear,1 m) - HiRISE(21 m box-smoothed, shifted)) over +/-40 m, 2 m steps (projected metres)",
    best_shift_east_m=best[1], best_shift_north_m=best[2], std_at_best_m=best[0], std_at_zero_shift_m=surf[(0, 0)],
    vertical_ctx_minus_hirise_m=dict(median=float(np.nanmedian(cons)), p05=float(np.nanpercentile(cons, 5)), p95=float(np.nanpercentile(cons, 95))),
    producer_claim="median vertical offset ~0.4 m (CTX above); CTX image avg horizontal displacement 9.6 m")
rep["texture_alignment"] = "HiRISE ortho and DTM share the producer grid origin (4577366, 1106618); texture crop starts exactly at core corner (asserted in process.py); 4 ortho px per DTM cell before downsampling."
# 4. counts / ranges / distributions
def st(a):
    f = np.isfinite(a); v = a[f].astype(float)
    return dict(n=int(a.size), finite=int(f.sum()), finite_pct=100 * f.mean(), min=float(v.min()), max=float(v.max()), mean=float(v.mean()), **{f"p{q}": float(np.percentile(v, q)) for q in (1, 5, 25, 50, 75, 95, 99)})
rep["stats"] = dict(elevation_m=st(z), slope_deg=st(sl), roughness_m=st(ro), ctx_minus_hirise_m=st(cons), valid_pct=100 * float(vm.mean()),
                    exclusion_flag_counts={str(k): int((fl == k).sum()) for k in np.unique(fl)},
                    slope_area_pct={"<5": float((sl < 5).mean() * 100), "5-15": float(((sl >= 5) & (sl < 15)).mean() * 100), "15-25": float(((sl >= 15) & (sl < 25)).mean() * 100), ">=25": float((sl >= 25).mean() * 100)})
cz = np.fromfile(f"{OUT}/fallback_ctx20m/elevation_m.f32", "<f4"); cs = np.fromfile(f"{OUT}/fallback_ctx20m/slope_deg.f32", "<f4")
rep["stats"]["ctx_fallback"] = dict(elevation_m=st(cz), slope_deg=st(cs))
fig, ax = plt.subplots(1, 4, figsize=(20, 4))
ax[0].hist(z.ravel(), 100); ax[0].set_title("elevation (m)"); ax[1].hist(sl[np.isfinite(sl)], 90, range=(0, 90)); ax[1].hist(cs[np.isfinite(cs)], 90, range=(0, 90), alpha=.6, density=False); ax[1].set_title("slope deg (HiRISE 1 m; CTX 20 m overlaid)"); ax[1].set_yscale("log")
ax[2].hist(ro[np.isfinite(ro)], 100, range=(0, 1)); ax[2].set_title("roughness RMS (m), 5x5"); ax[2].set_yscale("log"); ax[3].hist(cons[np.isfinite(cons)], 100); ax[3].set_title("CTX - HiRISE (m)")
plt.savefig(f"{OUT}/validation/distributions.png", dpi=70, bbox_inches="tight")
fig, ax = plt.subplots(1, 3, figsize=(18, 6)); ext = [0, 1000, 0, 1000]
ax[0].imshow(z, cmap="terrain", extent=ext); ax[1].imshow(sl, cmap="magma", vmin=0, vmax=35, extent=ext); ax[2].imshow(cons, cmap="RdBu", vmin=-10, vmax=10, extent=ext)
for a in ax:
    for d in D: a.plot(d["col"] + .5, 1000 - d["row"] - .5, "c+", ms=12); a.annotate(d["id"], (d["col"], 1000 - d["row"]), color="c")
for a, t in zip(ax, ["elevation", "slope (deg)", "CTX - HiRISE (m)"]): a.set_title(t)
plt.savefig(f"{OUT}/validation/maps_with_destinations.png", dpi=60, bbox_inches="tight")
t = subprocess.run([sys.executable, "-m", "pytest", "-q", "tests"], capture_output=True, text=True)
rep["synthetic_plane_tests"] = dict(command="python -m pytest -q tests", returncode=t.returncode, summary=t.stdout.strip().splitlines()[-1],
                                    cases="planes 0/5/15/30/45 deg x aspects 0/45/90/200 on Eqc grid with cos(lat); max error <1e-6 deg asserted; without cos factor a 30 deg E-facing plane reads ~28.7 deg; 20 m grid; roughness=0 on plane; white-noise roughness; NaN propagation")
z30 = None
json.dump(rep, open(f"{OUT}/validation/validation_report.json", "w"), indent=1)
print(json.dumps({k: rep[k] for k in ["test_points_max_abs_diff_m", "landmarks_jpl_vs_package", "ortho_alignment_hirise_vs_ctx", "dtm_alignment_hirise_vs_ctx", "synthetic_plane_tests"]}, indent=1))
print(json.dumps({k: (v if not isinstance(v, dict) or "n" not in v else {kk: round(vv, 3) for kk, vv in v.items() if kk in ("finite_pct", "min", "p50", "p95", "max")}) for k, v in rep["stats"].items()}, indent=1, default=str))
