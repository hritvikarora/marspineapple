"""Turn fetched rasters (work/*.npy) into web assets for one site. Usage: build_site.py sites/<id>.json
Everything site-specific lives in the site json: point it at other coordinates/data and the same app runs there."""
import sys, json, math, os, numpy as np
from PIL import Image
from scipy import ndimage
Image.MAX_IMAGE_PIXELS=None
HERE=os.path.dirname(os.path.abspath(__file__)); W=os.environ.get('MARS_WORK','/home/user/mars/work')+'/'; RAW=os.environ.get('MARS_RAW','/home/user/mars/raw')+'/'
cfg=json.load(open(sys.argv[1])); OUT=os.path.join(HERE,'..','app','public','sites',cfg['id'])+'/'; os.makedirs(OUT,exist_ok=True)
FAST='--fast' in sys.argv   # skip re-encoding the image mosaics
R=cfg['radius_m']; lon0,lat0=cfg['lon0'],cfg['lat0']
def to_local(lon,lat):
    # orthographic projection about the site centre (true-scale metres, x east, y north)
    lam=math.radians(lon-lon0); phi=math.radians(lat); p0=math.radians(lat0)
    return (R*math.cos(phi)*math.sin(lam), R*(math.cos(p0)*math.sin(phi)-math.sin(p0)*math.cos(phi)*math.cos(lam)))
def fill(a):
    bad=~np.isfinite(a)|(a<-1e6)
    if bad.any():
        idx=ndimage.distance_transform_edt(bad,return_distances=False,return_indices=True); a=a[tuple(idx)]
    return a.astype(np.float32)
rings=[]; dems={}; orthos={}
for r in cfg['rings']:
    dems[r['name']]=fill(np.load(W+r['name']+'_dtm.npy')); orthos[r['name']]=np.load(W+r['name']+'_ortho.npy')
# --- tone-match outer rings to the inner one so the three orbital mosaics read as one surface
def sub(a,half_big,half_small):
    n=a.shape[0]; k=int(round(n*half_small/half_big/2)); c=n//2; return a[c-k:c+k,c-k:c+k]
def stats(a):
    v=a[a>0].astype(np.float32); return float(v.mean()),float(v.std())
names=[r['name'] for r in cfg['rings']]; halves={r['name']:r['half'] for r in cfg['rings']}
f32={names[0]:orthos[names[0]].astype(np.float32)}
for prev,cur in zip(names,names[1:]):
    m0,s0=stats(sub(f32[prev],halves[prev],halves[prev])) ; m1,s1=stats(sub(orthos[cur],halves[cur],halves[prev]))
    g=s0/max(s1,1e-3); f32[cur]=np.clip((orthos[cur].astype(np.float32)-m1)*g+m0,1,255)
    print('tone',cur,'gain',round(g,2),'offset',round(m0-m1*g,1))
for r in cfg['rings']:
    nme=r['name']; d=dems[nme]; n=d.shape[0]
    hmin=float(d.min()); hmax=float(d.max()); scale=(hmax-hmin)/65535.0
    q=np.round((d-hmin)/scale).astype('<u2'); q.tofile(OUT+f'{nme}_h.bin')
    # slope in degrees (0.5 deg steps in a byte)
    gy,gx=np.gradient(d,r['res']); slope=np.degrees(np.arctan(np.hypot(gx,gy)))
    Image.fromarray(np.clip(slope*2,0,255).astype(np.uint8)).save(OUT+f'{nme}_slope.png',optimize=True)
    np.save(W+f'{nme}_slope.npy',slope.astype(np.float32))
    o=f32[nme]; T=r['orthoTiles']; px=r['orthoPx']
    for ty in range(T):
        for tx in range(T):
            s=o.shape[0]//T; t=o[ty*s:(ty+1)*s,tx*s:(tx+1)*s]
            im=Image.fromarray(np.clip(t,0,255).astype(np.uint8))
            if im.size[0]!=px: im=im.resize((px,px),Image.LANCZOS)
            if not FAST: im.save(OUT+f'{nme}_ortho_{tx}_{ty}.jpg',quality=88,optimize=True)
    rings.append(dict(name=nme,half=r['half'],res=r['res'],n=n,tile=r['tile'],lods=r['lods'],lodDist=r['lodDist'],hmin=hmin,hscale=scale,
                      orthoTiles=T,slopeMax=float(slope.max())))
    if nme=='inner': inner_slope=slope
    print(nme,n,round(hmin,1),round(hmax,1),'slope p50/p95',np.percentile(slope,[50,95]).round(1))
# --- rover ground truth: Perseverance waypoints + traverse (NASA/JPL-Caltech MMGIS feed)
inner=dems['inner']; H=halves['inner']
def hgt(x,y):
    c=min(max(int(round(x+H)),0),inner.shape[1]-1); rr=min(max(int(round(H-y)),0),inner.shape[0]-1); return float(inner[rr,c])
wp=[]
for f in json.load(open(''+RAW+'M20_waypoints.json'))['features']:
    p=f['properties']; x,y=to_local(p['lon'],p['lat'])
    if max(abs(x),abs(y))>halves['mid']: continue
    e=dict(sol=p['sol'],x=round(x,2),y=round(y,2),elev=round(p['elev_geoid'],2),yaw=round(p.get('yaw') or 0,1),dist=round(p.get('dist_total_m') or 0))
    im=[i for i in (p.get('images') or []) if i.get('isPanoramic') and int(i.get('columns') or 0)>0]
    if im:
        i=im[0]; e['pano']=dict(file=i['url'].split('/')[-1],w=int(i['columns']),h=int(i['rows']),azmin=float(i['azmin']),azmax=float(i['azmax']),elmin=float(i['elmin']),elmax=float(i['elmax']))
    wp.append(e)
trav=[]
for f in json.load(open(''+RAW+'M20_traverse.json'))['features']:
    seg=[]
    for c in f['geometry']['coordinates']:
        x,y=to_local(c[0],c[1])
        if max(abs(x),abs(y))<=halves['mid']:
            if not seg or math.hypot(x-seg[-1][0],y-seg[-1][1])>2.0: seg.append([round(x,1),round(y,1)])
        elif seg: trav.append(seg); seg=[]
    if seg: trav.append(seg)
# check DEM vs rover elevation (validity check of the georeferencing)
inn=[w for w in wp if max(abs(w['x']),abs(w['y']))<H-5]
dz=np.array([hgt(w['x'],w['y'])-w['elev'] for w in inn]); print('rover-vs-DEM elevation diff (m): mean',dz.mean().round(2),'std',dz.std().round(2),'n',len(dz))
# --- points of interest: positions come from the rover's own localisation at the given sol
def wp_at(sol):
    c=[w for w in wp if w['sol']==sol]; return c[-1]
pois=[]
for p in cfg.get('pois',[]):
    w=wp_at(p['sol']); q=dict(p); q.update(x=w['x'],y=w['y'],elev=round(hgt(w['x'],w['y']),2)); pois.append(q)
# --- EVA route: fastest safe path over the 1 m slope map (cost = walking time per metre, slopes above the limit are forbidden)
from skimage.graph import route_through_array
m=cfg['mission']; wk=m['walk']; lim=m['slopeLimitsDeg']
def speed(tan_s): return wk['flatSpeed']*math.exp(-wk['toblerK']*abs(tan_s+wk['toblerOffset']))/math.exp(-wk['toblerK']*wk['toblerOffset'])
ST=2; sl=ndimage.maximum_filter(inner_slope,size=3)[::ST,::ST]   # 2 m grid, worst slope within reach of each step
cost=np.vectorize(lambda d: 1.0/speed(math.tan(math.radians(d))))(np.minimum(sl,60)).astype(np.float32)
cost[sl>lim[2]]=1e4
def rc(p): return (int(round((H-p['y'])/ST)),int(round((p['x']+H)/ST)))
byid={p['id']:p for p in pois}; route=[]; legs=[]
ids=cfg.get('route',[])
for a,b in zip(ids,ids[1:]):
    path,c=route_through_array(cost,rc(byid[a]),rc(byid[b]),fully_connected=True,geometric=True)
    pts=[[cc*ST-H, H-rr*ST] for rr,cc in path]
    # smooth the staircase a little
    P=np.array(pts,dtype=np.float32); k=5; Ps=P.copy()
    for i in range(1,len(P)-1): lo=max(0,i-k); hi=min(len(P),i+k+1); Ps[i]=P[lo:hi].mean(0)
    length=float(np.hypot(*np.diff(Ps,axis=0).T).sum()); hs=[hgt(x,y) for x,y in Ps]; up=float(sum(max(0,b2-a2) for a2,b2 in zip(hs,hs[1:])))
    mx=float(max(inner_slope[min(max(int(round(H-y)),0),inner_slope.shape[0]-1),min(max(int(round(x+H)),0),inner_slope.shape[1]-1)] for x,y in Ps))
    legs.append(dict(frm=a,to=b,length=round(length),climb=round(up,1),maxSlope=round(mx,1),blocked=bool(c>=1e4)))
    route.append([[round(float(x),1),round(float(y),1)] for x,y in Ps[::2]]+[[round(float(Ps[-1][0]),1),round(float(Ps[-1][1]),1)]])
    print('leg',a,'->',b,legs[-1])
# --- navigation texture (1 m): R = distance to planned route, G = distance to the rover's real track (0..25.5 m)
def dist_to(lines,reach=26.0):
    # exact distance from every 1 m node to the polylines (computed only in a window around each segment)
    n=inner_slope.shape[0]; D=np.full((n,n),reach,np.float32)
    for ln in lines:
        for (x0,y0),(x1,y1) in zip(ln,ln[1:]):
            c0=max(int(min(x0,x1)+H-reach),0); c1=min(int(max(x0,x1)+H+reach)+2,n); r0=max(int(H-max(y0,y1)-reach),0); r1=min(int(H-min(y0,y1)+reach)+2,n)
            if c0>=c1 or r0>=r1: continue
            X=np.arange(c0,c1,dtype=np.float32)[None,:]-H; Y=H-np.arange(r0,r1,dtype=np.float32)[:,None]
            dx=x1-x0; dy=y1-y0; L2=dx*dx+dy*dy
            t=np.clip(((X-x0)*dx+(Y-y0)*dy)/L2,0,1) if L2>0 else 0.0
            d=np.hypot(X-(x0+t*dx),Y-(y0+t*dy)); np.minimum(D[r0:r1,c0:c1],d,out=D[r0:r1,c0:c1])
    return np.clip(D*10,0,255).astype(np.uint8)
nav=np.zeros(inner_slope.shape+(3,),np.uint8); nav[...,0]=dist_to(route); nav[...,1]=dist_to(trav); nav[...,2]=255
Image.fromarray(nav).save(OUT+'inner_nav.png',optimize=True)
# --- overlays from other instruments (spectral and thermal), resampled to the local frame
overlays={}
for key,ov in (cfg.get('overlays') or {}).items():
    try:
        if ov['kind']=='crism':
            sys.path.insert(0,HERE); from fetch_crism import resample
            d=np.load(W+ov['file']); L=d['lab']; lab=dict(lines=int(L[0]),samples=int(L[1]),scale=L[2],R=L[3],latc=L[4],lonc=L[5],L0=L[6],S0=L[7])
            n=int(round(2*ov['half']/ov['res'])); rgb=np.zeros((n,n,3),np.float32); alpha=np.zeros((n,n),np.float32); chans=[]
            for ch in ov['channels']:
                v=resample(d['raw_'+ch['band']],lab,lon0,lat0,ov['half'],ov['res'],shift=ov.get('shiftM',(0,0)))
                valid=ndimage.binary_erosion(np.isfinite(v),iterations=4); v=ndimage.median_filter(np.where(np.isfinite(v),v,np.nanmedian(v)),3)
                lo=ch.get('lo',max(0.0,float(np.percentile(v[valid],75)))); hi=ch.get('hi',float(np.percentile(v[valid],99.7)))
                s=np.clip((v-lo)/(hi-lo),0,1); s[~valid]=0; rgb+=s[...,None]*np.array(ch['color'],np.float32); alpha=np.maximum(alpha,s)
                chans.append(dict(label=ch['label'],band=ch['band'],color='#%02x%02x%02x'%tuple(ch['color']),lo=round(lo,4),hi=round(hi,4)))
            rgb=rgb/np.maximum(rgb.max(2,keepdims=True)/255.0,1.0)
            im=np.dstack([np.clip(rgb,0,255),np.clip(alpha**0.8*255,0,255)]).astype(np.uint8)
            Image.fromarray(im,'RGBA').save(OUT+key+'.png',optimize=True)
            overlays[key]=dict(file=key+'.png',half=ov['half'],product=ov['product'],channels=chans,shiftM=ov.get('shiftM'))
        elif ov['kind']=='themis':
            v=np.load(W+ov['file']).astype(np.float32); lo,hi=np.percentile(v,[1,99]); s=np.clip((v-lo)/(hi-lo),0,1)
            stops=np.array([[0.0,20,10,70],[0.3,120,25,125],[0.6,225,80,60],[0.85,250,170,40],[1.0,255,250,190]],np.float32)   # dark violet (cold) -> pale yellow (warm)
            rgb=np.dstack([np.interp(s,stops[:,0],stops[:,i]) for i in (1,2,3)])
            im=np.dstack([rgb,np.full(s.shape,235,np.float32)]).astype(np.uint8); Image.fromarray(im,'RGBA').save(OUT+key+'.png',optimize=True)
            overlays[key]=dict(file=key+'.png',half=ov['half'],product=ov['product'])
        print('overlay',key,overlays[key])
    except Exception as e: print('overlay',key,'skipped:',e)
weather=None
try:
    ws=json.load(open(RAW+'weather.json'))['sols']; weather=ws[-1]; weather['source']='Perseverance MEDA, bollettino NASA Mars 2020 (ultimo sol disponibile)'
except Exception as e: print('no weather',e)
site=dict(id=cfg['id'],name=cfg['name'],lon0=lon0,lat0=lat0,radius=R,rings=rings,waypoints=wp,traverse=trav,pois=pois,route=route,legs=legs,overlays=overlays,mission=cfg.get('mission'),weather=weather,start=cfg.get('start'),
          georefCheck=dict(n=len(dz),meanDz=float(dz.mean()),stdDz=float(dz.std())))
json.dump(site,open(OUT+'site.json','w'),separators=(',',':'))
print('waypoints',len(wp),'traverse segs',len(trav),'pts',sum(map(len,trav)))
os.system(f'du -sh {OUT}; ls {OUT} | head -40')
