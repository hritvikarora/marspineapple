# Jezero western delta front – data package v0.1.0 (HIGH-RESOLUTION mode)

**Region:** 1000 × 1000 cells, 1 m projected spacing; ground size ≈ 948.6 m (E-W) × 1000 m (N-S) ≈ 0.95 km².
Lon 77.395064–77.411934 E, lat 18.447568–18.464438 N (planetocentric, east-positive, Mars 2000 sphere).
**Source:** USGS Mars 2020 TRN HiRISE DTM mosaic 1 m (doi:10.5066/P9REJ9JN) + HiRISE 25 cm orthomosaic. Fallback: USGS CTX DTM 20 m (doi:10.5066/P906QQT8).

## Files
| file | content |
|---|---|
| arrays/elevation_m.f32 | elevation (m), float32 LE, NaN = NoData |
| arrays/valid_mask.u8 | 1 valid / 0 NoData |
| arrays/slope_deg.f32 | slope in **degrees** (Horn 3×3, E-W spacing corrected by cos(lat)) |
| arrays/roughness_m.f32 | RMS residual (m) after plane fit in 5×5 cells |
| arrays/exclusion_flags.u8 | bit flags: 1 missing elevation, 2 no 3×3 neighbourhood, 4 no 5×5 neighbourhood, 8 outside source extent, 16 manual; 0 = usable |
| arrays/ctx_minus_hirise_m.f32 | CTX minus HiRISE (m): agreement between two products, **not** an error map |
| fallback_ctx20m/* | same layers on native CTX 20 m grid (51×51), bounds in grid.json |
| textures/hirise_ortho_2048.jpg | grayscale HiRISE image covering exactly the grid bounds (~0.49 m/px) |
| overlays/*.png | RGBA overlays (transparent = NoData) + legends |
| grid.json | CRS WKT, origin, cell-centre convention, ground scale, mesh contract, test points |
| destinations.json | science destinations P3–P5 with row/col; pois_all.json has all 9 POIs |
| manifest.json | bytes, sha256, dtype, shape, units, source ids |
| validate.py | `python validate.py` → OK / FAIL list (needs NumPy only) |
| validation/ | evidence (report JSON + plots); generated after the manifest, not hashed |

Arrays: row-major, row 0 = north, col 0 = west; value = sample at **cell centre** x = left + col + 0.5, y = top − row − 0.5.

## For the 3D lead
- One vertex per cell centre; **E-W vertex spacing = 0.94857 m, N-S = 1.0 m** (Equirectangular lat_ts=0 stretches E-W by 1/cos 18.456°). Using 1 m E-W would stretch the terrain 5.4 % and flatten E-W slopes.
- Mesh spans first-to-last cell centres; texture u = (x − left)/1000, v = (top − y)/1000. Drop triangles touching valid_mask = 0 (none in v0.1.0).
- Elevations are absolute (m, areoid-referenced like JPL rover elevations). Subtract `mesh_contract.reference_elevation_m` for local Y.

## Ready-to-use captions
- *Slope:* "Slope in degrees from the HiRISE 1 m terrain model (USGS). 0° = flat."
- *Roughness:* "Local roughness: how much the ground deviates from a flat plane over ~5 m (metres, RMS)."
- *Quality:* "Elevation from HiRISE stereo images (USGS, 1 m posts). Producer reports < 3 m horizontal registration and ~0.4 m median vertical offset vs CTX. No per-pixel confidence map is published for this mosaic."
- *Coarse mode (if fallback used):* "COARSE 20 m terrain (CTX). Not suitable for astronaut-scale navigation."
- *Credits:* "HiRISE: NASA/JPL-Caltech/UArizona; DTM/orthomosaic: USGS Astrogeology (Fergason et al. 2020). Panoramas: NASA/JPL-Caltech/ASU/MSSS."

## Quality information (what exists and what does not)
- The distributed HiRISE DTM mosaic has **no per-pixel figure-of-merit / confidence layer**; only global producer statistics (see sources.json). No synthetic per-pixel quality was invented.
- Available proxy layers: `ctx_minus_hirise_m` (inter-product agreement) and `roughness_m`; neither is an uncertainty.
- CTX fallback may be horizontally offset by up to ~1 cell (≈10–15 m) relative to HiRISE in this AOI (validation report).
