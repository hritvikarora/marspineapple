"""Fetch CRISM summary parameters (MRO, map-projected targeted product MTRDR) for a site and resample them to the local frame.
Only the bands we need are downloaded, with HTTP range requests on the band-sequential cube.
usage: fetch_crism.py <lon0> <lat0> <half_m> <res_m> <out.npz> [obs_dir] [stem]"""
import sys, re, math, numpy as np, requests
from scipy import ndimage
BASE = "https://pds-geosciences.wustl.edu/mro/mro-m-crism-5-rdr-mptargeted-v1/mrocr_4001/mtrdr/"
BANDS = ["R770", "OLINDEX3", "LCPINDEX2", "BD1900_2", "D2300", "MIN2295_2480", "BD2500_2"]
R_MARS = 3396190.0

def label(url):
    s = requests.get(url, timeout=60).text.replace("\r", "")
    num = lambda k: float(re.search(k + r"\s*=\s*([-0-9.]+)", s).group(1))
    names = re.findall(r'"([^"]+)"', re.search(r"BAND_NAME\s*=\s*\((.*?)\)", s, re.S).group(1))
    return dict(lines=int(num(r"\n\s*LINES")), samples=int(num("LINE_SAMPLES")), names=names, scale=num("MAP_SCALE") * 1000, R=num("A_AXIS_RADIUS") * 1000,
                latc=num("CENTER_LATITUDE"), lonc=num("CENTER_LONGITUDE"), L0=num("LINE_PROJECTION_OFFSET"), S0=num("SAMPLE_PROJECTION_OFFSET"))

def band(url, lab, name):
    i = lab["names"].index(name); n = lab["lines"] * lab["samples"] * 4
    r = requests.get(url, headers={"Range": f"bytes={i * n}-{(i + 1) * n - 1}"}, timeout=300); r.raise_for_status()
    a = np.frombuffer(r.content, "<f4").reshape(lab["lines"], lab["samples"]).copy(); a[a > 60000] = np.nan; return a

def local_to_lonlat(x, y, lon0, lat0):   # inverse orthographic projection (same local frame as fetch.py)
    p0 = math.radians(lat0); rho = np.hypot(x, y); c = np.arcsin(np.clip(rho / R_MARS, 0, 1)); rho = np.where(rho == 0, 1e-9, rho)
    lat = np.arcsin(np.cos(c) * math.sin(p0) + y * np.sin(c) * math.cos(p0) / rho)
    lon = math.radians(lon0) + np.arctan2(x * np.sin(c), rho * math.cos(p0) * np.cos(c) - y * math.sin(p0) * np.sin(c))
    return np.degrees(lon), np.degrees(lat)

def resample(a, lab, lon0, lat0, half, res, shift=(0.0, 0.0)):
    """a on the CRISM grid -> [n,n] local grid (row 0 = north). shift = (east, north) correction in metres applied to the CRISM data."""
    n = int(round(2 * half / res)); xs = -half + (np.arange(n) + 0.5) * res; ys = half - (np.arange(n) + 0.5) * res
    X, Y = np.meshgrid(xs - shift[0], ys - shift[1]); lon, lat = local_to_lonlat(X, Y, lon0, lat0)
    col = lab["R"] * math.cos(math.radians(lab["latc"])) * np.radians(lon - lab["lonc"]) / lab["scale"] + lab["S0"] - 1
    row = lab["L0"] - lab["R"] * np.radians(lat) / lab["scale"] - 1
    ok = np.isfinite(a); v = ndimage.map_coordinates(np.where(ok, a, 0), [row, col], order=1, mode="constant", cval=0)
    w = ndimage.map_coordinates(ok.astype(np.float32), [row, col], order=1, mode="constant", cval=0)
    return np.where(w > 0.6, v / np.maximum(w, 1e-6), np.nan).astype(np.float32)

if __name__ == "__main__":
    lon0, lat0, half, res, out = float(sys.argv[1]), float(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4]), sys.argv[5]
    obs = sys.argv[6] if len(sys.argv) > 6 else "2007/2007_139/frt00005c5e/"; stem = sys.argv[7] if len(sys.argv) > 7 else "frt00005c5e_07_sr166j_mtr3"
    lab = label(BASE + obs + stem + ".lbl"); print(lab["lines"], lab["samples"], lab["scale"], "m/px")
    raw = {b: band(BASE + obs + stem + ".img", lab, b) for b in BANDS}
    np.savez_compressed(out, lab=np.array([lab["lines"], lab["samples"], lab["scale"], lab["R"], lab["latc"], lonc := lab["lonc"], lab["L0"], lab["S0"]]), **{"raw_" + b: raw[b] for b in BANDS},
                        **{b: resample(raw[b], lab, lon0, lat0, half, res) for b in BANDS})
    for b in BANDS: print(b, np.nanpercentile(raw[b], [2, 50, 98, 99.9]).round(4))
