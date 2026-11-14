"""Contact sheet of landscape-looking Mastcam-Z frames for a sol, to choose POI photos. usage: photo_sheet.py <sol> <out.jpg>"""
import sys, json, io, urllib.request
from PIL import Image, ImageDraw
sys.argv=[sys.argv[0]]+sys.argv[1:]
from fetch_photos import images
sol=int(sys.argv[1]); out=sys.argv[2]
im=[i for i in images(sol) if i['camera']['instrument'] in('MCZ_LEFT','NAVCAM_LEFT','FRONT_HAZCAM_LEFT_A') and i['sample_type']=='Full']
def f(i):
    try: return float(i['extended']['mastEl'])
    except Exception: return -99
def az(i):
    try: return float(i['extended']['mastAz'])
    except Exception: return 0
c=[i for i in im if -40<f(i)<12 and not (40<az(i)<46 and f(i)<-45)]
seen=set(); pick=[]
for i in c:
    k=(i['camera']['instrument'],round(az(i)/6),round(f(i)/6))
    if k in seen: continue
    seen.add(k); pick.append(i)
pick=pick[:20]; W=320; cols=5; rows=(len(pick)+cols-1)//cols or 1
sheet=Image.new('RGB',(cols*W,rows*260),'black'); d=ImageDraw.Draw(sheet); ids=[]
for n,i in enumerate(pick):
    try:
        t=Image.open(io.BytesIO(urllib.request.urlopen(i['image_files']['small'],timeout=60).read())).convert('RGB'); t.thumbnail((W,240))
        sheet.paste(t,((n%cols)*W,(n//cols)*260)); d.text(((n%cols)*W+4,(n//cols)*260+242),f"{n} {i['camera']['instrument'][:3]} az{az(i):.0f} el{f(i):.0f}",fill='yellow')
    except Exception as e: print('fail',e)
    ids.append(i['imageid'])
sheet.save(out,quality=80); json.dump(ids,open(out+'.ids.json','w')); print(sol,len(im),len(c),len(pick))
