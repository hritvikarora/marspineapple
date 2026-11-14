"""List/download Perseverance raw images for given sols (NASA/JPL-Caltech public raw image feed).
usage: fetch_photos.py list <sol> [camera-prefix]      -> prints candidates (full frames, largest first)
       fetch_photos.py get <out.jpg> <imageid> <sol>   -> downloads the 1200 px JPEG"""
import sys, json, urllib.request, os
API="https://mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020&feedtype=json&num=100&page={p}&order=sol+desc&sol={s}"
def images(sol):
    cache=f"/tmp/m20_raw_{sol}.json"   # the feed returns every image of the sol in one response
    if not os.path.exists(cache): urllib.request.urlretrieve(API.format(p=0,s=sol),cache)
    return json.load(open(cache)).get('images',[])
def dim(i):
    try: w,h=i['extended']['dimension'].strip('()').split(','); return int(w)*int(h)
    except Exception: return 0
if __name__=="__main__" and sys.argv[1]=="list":
    sol=int(sys.argv[2]); cam=sys.argv[3] if len(sys.argv)>3 else 'MCZ_LEFT'
    im=[i for i in images(sol) if i['camera']['instrument'].startswith(cam) and i['sample_type']=='Full']
    im.sort(key=dim,reverse=True)
    for i in im[:int(os.environ.get('N',12))]: print(i['imageid'],i['extended']['dimension'],i['extended'].get('mastAz'),i['extended'].get('mastEl'),i['date_taken_mars'],i['image_files']['medium'])
elif __name__=="__main__":
    out,iid,sol=sys.argv[2],sys.argv[3],int(sys.argv[4])
    i=[x for x in images(sol) if x['imageid']==iid][0]
    urllib.request.urlretrieve(i['image_files']['large'],out); json.dump(dict(imageid=iid,sol=sol,camera=i['camera']['instrument'],caption=i['caption'],date=i['date_taken_utc'],credit=i['credit'],url=i['image_files']['full_res']),open(out+'.json','w')); print('saved',out)
