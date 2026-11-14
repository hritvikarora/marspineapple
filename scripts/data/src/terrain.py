"""Terrain derivative functions shared by process.py and tests (pure NumPy/SciPy).

Conventions
- Arrays are north-up, row-major: row 0 = northernmost row, col 0 = westernmost column.
- dx_ground, dy_ground = GROUND spacing in metres between adjacent cell centres.
  For the Equirectangular (lat_ts=0) grid used here, dx_ground = cell_size_x * cos(lat), dy_ground = cell_size_y.
- Invalid elevation = NaN. Any derivative whose stencil touches a NaN is NaN.
"""
import numpy as np
from scipy import ndimage

def horn_slope_deg(z, dx_ground, dy_ground):
    """Slope (degrees) by Horn (1981) 3x3 weighted finite differences. Edge cells (no full stencil) -> NaN."""
    z = np.asarray(z, dtype=np.float64)
    out = np.full(z.shape, np.nan)
    a, b, c = z[:-2, :-2], z[:-2, 1:-1], z[:-2, 2:]
    d, f = z[1:-1, :-2], z[1:-1, 2:]
    g, h, i = z[2:, :-2], z[2:, 1:-1], z[2:, 2:]
    dzdx = ((c + 2 * f + i) - (a + 2 * d + g)) / (8.0 * dx_ground)   # east positive
    dzdy = ((a + 2 * b + c) - (g + 2 * h + i)) / (8.0 * dy_ground)   # north positive (row 0 = north)
    out[1:-1, 1:-1] = np.degrees(np.arctan(np.hypot(dzdx, dzdy)))
    out[~np.isfinite(z)] = np.nan                            # centre cell not in Horn stencil: mask explicitly
    return out

def plane_residual_rms(z, dx_ground, dy_ground, win):
    """Roughness: RMS of residuals after least-squares plane fit z = a + b*u + c*v in a win x win cell window
    (u, v = ground-metre offsets from window centre). RMS = sqrt(SSR / n), n = win*win. win must be odd.
    Windows touching NaN or the array edge -> NaN."""
    assert win % 2 == 1
    z = np.asarray(z, dtype=np.float64)
    bad = ~np.isfinite(z)
    z0 = np.where(bad, 0.0, z - np.nanmean(z))           # remove constant for numerical stability
    r = win // 2
    vv, uu = np.mgrid[-r:r + 1, -r:r + 1]
    u = uu * dx_ground                                   # east offset (m)
    v = -vv * dy_ground                                  # north offset (m), rows increase southwards
    n = win * win
    Suu, Svv = (u ** 2).sum(), (v ** 2).sum()
    k1 = np.ones((win, win))
    S = ndimage.correlate(z0, k1, mode="constant")
    S2 = ndimage.correlate(z0 ** 2, k1, mode="constant")
    Su = ndimage.correlate(z0, u, mode="constant")
    Sv = ndimage.correlate(z0, v, mode="constant")
    ssr = S2 - S ** 2 / n - Su ** 2 / Suu - Sv ** 2 / Svv
    rms = np.sqrt(np.clip(ssr, 0, None) / n)
    badw = ndimage.correlate(bad.astype(np.float64), k1, mode="constant", cval=1.0) > 0
    rms[badw] = np.nan
    return rms
