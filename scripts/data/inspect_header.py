"""Print raster header facts for local paths or /vsicurl/ URLs. Usage: python inspect_header.py <path_or_url>..."""
import sys, json, rasterio
from rasterio.env import Env
for p in sys.argv[1:]:
    with Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif"):
        with rasterio.open(p) as ds:
            t = ds.tags(); it = ds.tags(ns="IMAGE_STRUCTURE")
            print(json.dumps(dict(path=p, driver=ds.driver, width=ds.width, height=ds.height, count=ds.count,
              dtypes=ds.dtypes, nodata=ds.nodata, res=ds.res, transform=list(ds.transform)[:6], bounds=list(ds.bounds),
              block_shapes=ds.block_shapes, overviews=ds.overviews(1), compression=str(ds.compression), interleave=str(ds.interleaving),
              image_structure=it, tags=t, units=ds.units, scales=ds.scales, offsets=ds.offsets), indent=1, default=str))
            print("WKT:\n", __import__("pyproj").CRS.from_wkt(ds.crs.to_wkt()).to_wkt(pretty=True))
