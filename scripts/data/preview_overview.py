import rasterio, numpy as np, matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from rasterio.enums import Resampling
R=3396190.0; d=np.pi/180*R
with rasterio.open("raw/ctx/JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0.tif") as o:
    img=o.read(1,out_shape=(o.height//4,o.width//4),resampling=Resampling.average); b=o.bounds
fig,ax=plt.subplots(figsize=(12,11))
ax.imshow(img,cmap="gray",extent=[b.left/d,b.right/d,b.bottom/d,b.top/d],vmin=np.percentile(img[img>0],1),vmax=np.percentile(img[img>0],99))
hx=[4577366/d,4598766/d]; hy=[1085130/d,1106618/d]
ax.plot([hx[0],hx[1],hx[1],hx[0],hx[0]],[hy[0],hy[0],hy[1],hy[1],hy[0]],'c-',label='HiRISE DTM mosaic extent')
ax.grid(color='y',alpha=.4); ax.set_xticks(np.arange(77.15,77.71,0.05)); ax.set_yticks(np.arange(18.2,18.75,0.05))
ax.set_xlabel("lon E (deg, planetocentric)"); ax.set_ylabel("lat N"); ax.legend()
plt.savefig("previews/overview_ctx_ortho.png",dpi=80,bbox_inches="tight")
