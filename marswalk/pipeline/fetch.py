"""Fetch source windows (HiRISE / CTX DTM + ortho) reprojected to a local true-scale frame.
Local frame: orthographic projection centred on the site -> x east, y north in real metres."""
import sys, json, time, numpy as np, rasterio
from rasterio.vrt import WarpedVRT
from rasterio.crs import CRS
from rasterio.transform import from_origin
from rasterio.enums import Resampling
B="/vsicurl/https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/"
SRC={
 "hirise_dtm":B+"HiRISE/JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40.tif",
 "hirise_ortho":B+"HiRISE/JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first.tif",
 "ctx_dtm":B+"CTX/JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0.tif",
 "ctx_ortho":B+"CTX/JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0.tif",
 # global THEMIS infrared mosaics (Mars Odyssey), 100 m/pixel
 "themis_night":B.replace("mars2020_trn/","")+"Mars_MO_THEMIS-IR-Night_mosaic_60N60S_100m_v14.tif",
 "themis_day":B.replace("mars2020_trn/","")+"Mars_MO_THEMIS-IR-Day_mosaic_global_100m_v12.tif",
}
ENV=dict(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR",CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif",VSI_CACHE="TRUE",VSI_CACHE_SIZE="1000000000",
         CPL_VSIL_CURL_CHUNK_SIZE="10485760",CPL_VSIL_CURL_CACHE_SIZE="3000000000",GDAL_CACHEMAX=3000,GDAL_HTTP_MAX_RETRY="5",GDAL_HTTP_RETRY_DELAY="1")
def local_crs(lon0,lat0): return CRS.from_proj4(f"+proj=ortho +lat_0={lat0} +lon_0={lon0} +x_0=0 +y_0=0 +R=3396190 +units=m +no_defs")
def fetch(src,lon0,lat0,half,res,resampling=Resampling.bilinear,vertex=False):
    """returns array [n,n], row 0 = north. vertex=False: n=2*half/res pixels covering [-half,half].
    vertex=True: n=2*half/res+1 samples centred exactly on the grid nodes -half..half (for height grids)."""
    if vertex: n=int(round(2*half/res))+1; tr=from_origin(-half-res/2,half+res/2,res,res)
    else: n=int(round(2*half/res)); tr=from_origin(-half,half,res,res)
    with rasterio.Env(**ENV):
        with rasterio.open(SRC[src]) as d:
            with WarpedVRT(d,crs=local_crs(lon0,lat0),transform=tr,width=n,height=n,resampling=resampling) as v:
                return v.read(1)
if __name__=="__main__":
    src,lon0,lat0,half,res,out=sys.argv[1],float(sys.argv[2]),float(sys.argv[3]),float(sys.argv[4]),float(sys.argv[5]),sys.argv[6]
    t=time.time(); a=fetch(src,lon0,lat0,half,res,(Resampling.cubic if res<=1 or 'themis' in src else Resampling.average),vertex=('dtm' in src))
    np.save(out,a); print(src,a.shape,a.dtype,float(np.nanmin(a)),float(np.nanmax(a)),round(time.time()-t,1),'s')
