"""Synthetic-plane validation of slope and roughness, including the Equirectangular east-west scale factor."""
import sys, os, math, numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from terrain import horn_slope_deg, plane_residual_rms

LAT = 18.456  # AOI centre latitude (deg)
COS = math.cos(math.radians(LAT))

def plane_on_eqc_grid(slope_deg, aspect_deg, n=64, cell_proj=1.0):
    """Plane with known true ground slope, sampled on a projected Eqc grid (cell_proj m) -> ground dx = cell_proj*cos(lat)."""
    rows, cols = np.mgrid[0:n, 0:n]
    e = cols * cell_proj * COS            # ground east (m)
    nn = -rows * cell_proj                # ground north (m)
    g = math.tan(math.radians(slope_deg))
    az = math.radians(aspect_deg)         # downslope direction, clockwise from north
    return -g * (e * math.sin(az) + nn * math.cos(az)) - 2500.0

def test_slope_known_planes():
    for s in (0.0, 5.0, 15.0, 30.0, 45.0):
        for a in (0.0, 45.0, 90.0, 200.0):
            z = plane_on_eqc_grid(s, a)
            sl = horn_slope_deg(z, COS, 1.0)
            assert np.nanmax(np.abs(sl - s)) < 1e-6, (s, a, np.nanmax(np.abs(sl - s)))

def test_slope_wrong_without_cos_factor():
    z = plane_on_eqc_grid(30.0, 90.0)     # east-facing 30 deg plane
    wrong = np.nanmean(horn_slope_deg(z, 1.0, 1.0))
    assert abs(wrong - 30.0) > 1.0         # ignoring cos(lat) underestimates E-W slopes (~28.7 deg)

def test_slope_20m_grid():
    z = plane_on_eqc_grid(12.0, 300.0, cell_proj=20.0)
    assert np.nanmax(np.abs(horn_slope_deg(z, 20.0 * COS, 20.0) - 12.0)) < 1e-6

def test_roughness_plane_zero_and_noise():
    z = plane_on_eqc_grid(20.0, 135.0, n=200)
    r = plane_residual_rms(z, COS, 1.0, 5)
    assert np.nanmax(r) < 1e-6
    rng = np.random.default_rng(0)
    zn = z + rng.normal(0, 0.10, z.shape)
    rn = plane_residual_rms(zn, COS, 1.0, 5)
    # expected RMS residual for white noise sigma with 3 fitted params: sigma*sqrt((n-3)/n)
    exp = 0.10 * math.sqrt(22 / 25)
    assert abs(np.nanmedian(rn) - exp) < 0.01

def test_nan_propagation():
    z = plane_on_eqc_grid(10.0, 0.0, n=20); z[10, 10] = np.nan
    assert np.isnan(horn_slope_deg(z, COS, 1.0)[9:12, 9:12]).all()
    assert np.isnan(plane_residual_rms(z, COS, 1.0, 5)[8:13, 8:13]).all()
