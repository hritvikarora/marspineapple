"""Inspect acquired rasters: header facts, valid-data stats, cross-dataset vertical/horizontal sanity. Writes inspection_report.json + previews."""
import json, numpy as np, rasterio, matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from rasterio.windows import from_bounds
from rasterio.warp import reproject, Resampling
R=3396190.0; D=np.pi/180*R
files={"ctx_dtm_20m":"raw/ctx/JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0.tif",
 "ctx_ortho_6m":"raw/ctx/JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0.tif",
 "hrsc_mola_200m_window":"raw/hrsc_mola/hrsc_mola_blend200m_v2_jezero_window.tif",
 "hirise_dtm_1m_aoi":"raw/hirise/hirise_dtm_1m_candidate_aoi_buffered.tif",
 "hirise_ortho_25cm_aoi":"raw/hirise/hirise_ortho_25cm_candidate_aoi_buffered.tif"}
rep={}
def valid(a,nd):
    m=np.isfinite(a)
    if nd is not None: m&=~np.isclose(a,nd) if np.issubdtype(a.dtype,np.floating) else (a!=nd)
    if np.issubdtype(a.dtype,np.floating): m&=a>-1e30
    return m
for k,p in files.items():
    with rasterio.open(p) as s:
        a=s.read(1); m=valid(a,s.nodata); v=a[m]
        rep[k]=dict(file=p,driver=s.driver,crs_wkt=s.crs.to_wkt(),width=s.width,height=s.height,dtype=s.dtypes[0],nodata=s.nodata,
          transform=list(s.transform)[:6],res=list(s.res),bounds=list(s.bounds),area_or_point=s.tags().get("AREA_OR_POINT"),
          bounds_lonlat=None if s.crs.is_geographic else [s.bounds.left/D,s.bounds.bottom/D,s.bounds.right/D,s.bounds.top/D],
          valid_fraction=float(m.mean()),min=float(v.min()),max=float(v.max()),mean=float(v.mean()),p01=float(np.percentile(v,1)),p99=float(np.percentile(v,99)))
# cross-checks over the AOI: resample CTX and HRSC-MOLA onto the HiRISE 1 m AOI grid (bilinear), compare
with rasterio.open(files["hirise_dtm_1m_aoi"]) as h:
    H=h.read(1).astype("float64"); Hm=valid(H,h.nodata); ht=h.transform; hc=h.crs; hb=h.bounds
def onto(path):
    with rasterio.open(path) as s:
        out=np.full(H.shape,np.nan); reproject(rasterio.band(s,1),out,dst_transform=ht,dst_crs=hc,resampling=Resampling.bilinear,src_nodata=s.nodata,dst_nodata=np.nan)
    return out
for k in ("ctx_dtm_20m","hrsc_mola_200m_window"):
    o=onto(files[k]); m=Hm&np.isfinite(o)&(o>-1e30); d=(o-H)[m]
    rep[f"diff_{k}_minus_hirise_over_aoi_m"]=dict(median=float(np.median(d)),mean=float(d.mean()),std=float(d.std()),p05=float(np.percentile(d,5)),p95=float(np.percentile(d,95)))
# AOI terrain summary (simple slope, Horn not yet; central differences on 1 m grid, degrees) - indicative only
gy,gx=np.gradient(np.where(Hm,H,np.nan),1.0)
sl=np.degrees(np.arctan(np.hypot(gx,gy))); rep["hirise_aoi_slope_deg_indicative"]=dict(p50=float(np.nanpercentile(sl,50)),p90=float(np.nanpercentile(sl,90)),p99=float(np.nanpercentile(sl,99)),max=float(np.nanmax(sl)))
json.dump(rep,open("inspection_report.json","w"),indent=1)
# previews
with rasterio.open(files["hirise_ortho_25cm_aoi"]) as o: O=o.read(1)[::4,::4]
ls=matplotlib.colors.LightSource(315,45); hs=ls.hillshade(np.where(Hm,H,np.nanmean(H[Hm])),dx=1,dy=1)
fig,ax=plt.subplots(1,3,figsize=(21,7)); ext=[hb.left/D,hb.right/D,hb.bottom/D,hb.top/D]
ax[0].imshow(O,cmap="gray",extent=ext,vmin=np.percentile(O[O>0],1),vmax=np.percentile(O[O>0],99)); ax[0].set_title("HiRISE ortho 25cm (shown at 1 m)")
ax[1].imshow(hs,cmap="gray",extent=ext); ax[1].set_title("HiRISE DTM 1m hillshade")
im=ax[2].imshow(sl,cmap="magma",vmin=0,vmax=35,extent=ext); ax[2].set_title("slope deg (indicative)"); plt.colorbar(im,ax=ax[2])
pts={"Hawksbill Gap":(77.40386,18.45755),"Enchanted Lake":(77.40169,18.45046),"Three Forks":(77.40890,18.45372),"Skinner Ridge":(77.40617,18.45889),"Cape Nukshak":(77.40218,18.45311)}
c=(ext[0]+ext[1])/2; cy=(ext[2]+ext[3])/2; half=500/D
for a in ax:
    a.plot([c-half,c+half,c+half,c-half,c-half],[cy-half,cy-half,cy+half,cy+half,cy-half],'c--')
    for n,(x,y) in pts.items(): a.plot(x,y,'r+'); a.annotate(n,(x,y),color='r',fontsize=8)
plt.savefig("previews/aoi_candidate.png",dpi=70,bbox_inches="tight")
print(json.dumps({k:{kk:vv for kk,vv in v.items() if kk!="crs_wkt"} for k,v in rep.items()},indent=0))
