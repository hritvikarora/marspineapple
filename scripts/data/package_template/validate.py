#!/usr/bin/env python3
"""Validate this data package. Usage: python validate.py [package_dir]   (needs only Python 3 + NumPy)
Exit code 0 = OK, 1 = problems found. Checks: supported format version, every manifest file present,
byte length, sha256, array length = prod(shape)*itemsize, dtype/units declared, value ranges, NaN<->valid_mask,
grid.json required fields, test-point values, destinations inside grid."""
import sys, os, json, hashlib
import numpy as np
SUPPORTED = {"jezero-pkg/1"}
d = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))
errs, warns = [], []
def err(m): errs.append(m)
try: M = json.load(open(os.path.join(d, "manifest.json")))
except Exception as e: print("FAIL: cannot read manifest.json:", e); sys.exit(1)
if M.get("format") not in SUPPORTED: err(f"unsupported package format {M.get('format')!r}; supported {sorted(SUPPORTED)}")
for k in ("package_version", "mode", "files"):
    if k not in M: err(f"manifest missing '{k}'")
RANGES = {"elevation_m": (-9000, 22000), "slope_deg": (0, 90), "roughness_m": (0, 1000), "ctx_minus_hirise_m": (-1000, 1000)}
arrays = {}
for rel, f in M.get("files", {}).items():
    p = os.path.join(d, rel)
    if not os.path.isfile(p): err(f"missing file: {rel}"); continue
    b = os.path.getsize(p)
    if b != f.get("bytes"): err(f"{rel}: size {b} != manifest {f.get('bytes')}")
    if hashlib.sha256(open(p, "rb").read()).hexdigest() != f.get("sha256"): err(f"{rel}: sha256 mismatch")
    if f.get("kind") == "array":
        for k in ("dtype", "shape", "units", "byte_order"):
            if k not in f: err(f"{rel}: metadata missing '{k}'")
        dt = {"float32": "<f4", "uint8": "u1"}.get(f.get("dtype"))
        if dt is None: err(f"{rel}: unsupported dtype {f.get('dtype')}"); continue
        n = int(np.prod(f["shape"])) * np.dtype(dt).itemsize
        if b != n: err(f"{rel}: length {b} B != shape {f['shape']} x {np.dtype(dt).itemsize} B = {n} B"); continue
        a = np.fromfile(p, dtype=dt).reshape(f["shape"]); arrays[rel] = a
        key = os.path.basename(rel).split(".")[0]
        if key in RANGES and np.isfinite(a).any():
            lo, hi = RANGES[key]
            if np.nanmin(a) < lo or np.nanmax(a) > hi: err(f"{rel}: values outside plausible range [{lo},{hi}]")
        if dt == "u1" and key == "valid_mask" and not set(np.unique(a)) <= {0, 1}: err(f"{rel}: mask values not in {{0,1}}")
for pre in ("arrays/", "fallback_ctx20m/"):
    e, v = arrays.get(pre + "elevation_m.f32"), arrays.get(pre + "valid_mask.u8")
    if e is not None and v is not None and not np.array_equal(np.isfinite(e), v == 1): err(f"{pre}: NaN pattern of elevation != valid_mask")
    fl = arrays.get(pre + "exclusion_flags.u8")
    if fl is not None and v is not None and not np.array_equal((fl & 1) == 1, v == 0): err(f"{pre}: exclusion flag 1 != (valid_mask==0)")
try:
    G = json.load(open(os.path.join(d, "grid.json")))
    for k in ("crs", "vertical", "primary", "ground_scale", "test_points", "mesh_contract"):
        if k not in G: err(f"grid.json missing '{k}'")
    if G["primary"]["shape"] != M["files"]["arrays/elevation_m.f32"]["shape"]: err("grid.json shape != elevation array shape")
    e = arrays.get("arrays/elevation_m.f32")
    for t in G["test_points"]:
        if e is not None and abs(float(e[t["row"], t["col"]]) - t["elevation_m"]) > 1e-3: err(f"test point {t['name']}: array value != grid.json")
except Exception as ex: err(f"grid.json problem: {ex}")
try:
    for x in json.load(open(os.path.join(d, "destinations.json")))["destinations"]:
        H, W = G["primary"]["shape"]
        if not (0 <= x["row"] < H and 0 <= x["col"] < W): err(f"destination {x['id']} outside grid")
except Exception as ex: err(f"destinations.json problem: {ex}")
print(f"package {M.get('package_version')} format {M.get('format')} mode {M.get('mode')}: {len(M.get('files', {}))} files checked")
for m in errs: print("FAIL:", m)
print("OK" if not errs else f"{len(errs)} problem(s)"); sys.exit(1 if errs else 0)
