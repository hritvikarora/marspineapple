"""Images for the research room: global maps from NASA Mars Trek (WMTS tiles) and close-up maps of the site from our own layers.
usage: build_research.py <site.json dir> <out dir>"""
import sys, json, io, math, urllib.request
from concurrent.futures import ThreadPoolExecutor
from PIL import Image, ImageDraw
SITE, OUT = sys.argv[1].rstrip('/'), sys.argv[2].rstrip('/')
T = "https://trek.nasa.gov/tiles/Mars/EQ/{n}/1.0.0/default/default028mm/{z}/{r}/{c}.{e}"
s = json.load(open(SITE + '/site.json')); LON, LAT = s['lon0'], s['lat0']
def tiles(n, e, z, rows, cols):
    def g(rc): r, c = rc; return rc, Image.open(io.BytesIO(urllib.request.urlopen(T.format(n=n, z=z, r=r, c=c, e=e), timeout=90).read())).convert('RGBA')
    m = Image.new('RGBA', (len(cols) * 256, len(rows) * 256), (20, 12, 9, 255))
    with ThreadPoolExecutor(12) as ex:
        for (r, c), t in ex.map(g, [(r, c) for r in rows for c in cols]): m.alpha_composite(t, ((c - cols[0]) * 256, (r - rows[0]) * 256))
    return m.convert('RGB')
def mark(im, x, y, r=16):
    d = ImageDraw.Draw(im); d.ellipse((x - r - 3, y - r - 3, x + r + 3, y + r + 3), outline=(255, 255, 255), width=3); d.ellipse((x - r, y - r, x + r, y + r), outline=(51, 230, 255), width=4); d.ellipse((x - 3, y - 3, x + 3, y + 3), fill=(51, 230, 255))
GLOBAL = {'mola': ('Mars_MGS_MOLA_ClrShade_merge_global_463m', 'jpg', 2), 'viking': ('Mars_Viking_MDIM21_ClrMosaic_global_232m', 'jpg', 2), 'themisday': ('THEMIS_DayIR_ControlledMosaics_100m_v2_oct2018', 'png', 2),
          'inertia': ('TES_Thermal_Inertia', 'png', 1), 'clay': ('TES_Glass_Clay', 'png', 1), 'rough': ('mola_roughness', 'png', 1)}
for k, (n, e, z) in GLOBAL.items():
    im = tiles(n, e, z, range(2 ** z), range(2 ** (z + 1))).resize((1024, 512), Image.LANCZOS); mark(im, (LON + 180) / 360 * 1024, (90 - LAT) / 180 * 512); im.save(f'{OUT}/{k}.jpg', quality=84); print(k)
# regional context: Isidis basin and Jezero, MOLA colour hillshade at zoom 5 (5.625 degrees per tile)
z, d = 5, 180 / 32; c0, r0 = int((LON + 180) / d), int((90 - LAT) / d); cols, rows = range(c0 - 2, c0 + 2), range(r0 - 1, r0 + 2)
im = tiles(GLOBAL['mola'][0], 'jpg', z, rows, cols); mark(im, ((LON + 180) / d - cols[0]) * 256, ((90 - LAT) / d - rows[0]) * 256, 26)
im.resize((1024, 768), Image.LANCZOS).save(f'{OUT}/isidis.jpg', quality=84); print('isidis', cols[0] * d - 180, rows[0] * d)
# site close-ups from our layers (local frame, row 0 = north)
mid = next(r for r in s['rings'] if r['name'] == 'mid'); outer = next(r for r in s['rings'] if r['name'] == 'outer'); H = 3600
def route(im, half, w=4):
    d = ImageDraw.Draw(im); P = lambda x, y: ((x + half) / (2 * half) * im.width, (half - y) / (2 * half) * im.height)
    for leg in s['route']: d.line([P(x, y) for x, y in leg], fill=(51, 230, 255), width=w)
    for p in s['pois']: x, y = P(p['x'], p['y']); d.ellipse((x - 7, y - 7, x + 7, y + 7), fill=(255, 209, 102) if p['kind'] == 'base' else (255, 255, 255), outline=(0, 0, 0), width=2)
ortho = Image.open(f'{SITE}/mid_ortho_0_0.jpg').convert('RGB').resize((1024, 1024), Image.LANCZOS)
o = ortho.copy(); route(o, mid['half']); o.save(f'{OUT}/site_ortho.jpg', quality=84)
sl = Image.open(f'{SITE}/mid_slope.png').convert('L').resize((1024, 1024), Image.BILINEAR); smax = mid['slopeMax']; lim = s['mission']['slopeLimitsDeg']
cols_ = [(26, 191, 89), (250, 217, 38), (255, 128, 13), (242, 20, 26)]
lut = [cols_[0 if v * smax / 255 < lim[0] else 1 if v * smax / 255 < lim[1] else 2 if v * smax / 255 < lim[2] else 3] for v in range(256)]
sc = Image.new('RGB', sl.size); sc.putdata([lut[v] for v in sl.getdata()]); sc = Image.blend(ortho, sc, 0.55); route(sc, mid['half']); sc.save(f'{OUT}/site_slope.jpg', quality=84)
mn = Image.open(f'{SITE}/minerals.png').convert('RGBA').resize((1024, 1024), Image.BILINEAR); m2 = Image.eval(ortho, lambda v: int(v * 0.7)).convert('RGBA'); m2.alpha_composite(mn); m2 = m2.convert('RGB'); route(m2, H); m2.save(f'{OUT}/site_minerals.jpg', quality=84)
oo = Image.open(f'{SITE}/outer_ortho_0_0.jpg').convert('RGB').resize((1024, 1024), Image.LANCZOS); th = Image.open(f'{SITE}/thermal.png').convert('RGBA').resize((1024, 1024), Image.BILINEAR)
t2 = Image.eval(oo, lambda v: int(v * 0.6)).convert('RGBA'); t2.alpha_composite(th); t2 = t2.convert('RGB'); route(t2, outer['half'], 3); t2.save(f'{OUT}/site_thermal.jpg', quality=84); print('site maps')
# same night-IR layer cut to the 7.2 km of the tabletop model, so its route line is as thin as on the other layers
thc = Image.open(f'{SITE}/thermal.png').convert('RGBA'); w = thc.width; a = int(w * (1 - H / outer['half']) / 2); thc = thc.crop((a, a, w - a, w - a)).resize((1024, 1024), Image.BILINEAR)
t3 = Image.eval(ortho, lambda v: int(v * 0.6)).convert('RGBA'); t3.alpha_composite(thc); t3 = t3.convert('RGB'); route(t3, H); t3.save(f'{OUT}/model_thermal.jpg', quality=84); print('model thermal')
# background for the calendar: CTX context mosaic cropped to the whole Perseverance traverse (local frame, metres)
BB = (-11600, 4400, -3400, 3800)   # xmin, xmax, ymin, ymax
O = Image.open(f'{SITE}/outer_ortho_0_0.jpg').convert('L'); h = outer['half']; k = O.width / (2 * h)
cr = O.crop((int((BB[0] + h) * k), int((h - BB[3]) * k), int((BB[1] + h) * k), int((h - BB[2]) * k))).resize((1600, int(1600 * (BB[3] - BB[2]) / (BB[1] - BB[0]))), Image.LANCZOS)
Image.merge('RGB', [cr.point(lambda v: int(v * 0.95)), cr.point(lambda v: int(v * 0.78)), cr.point(lambda v: int(v * 0.62))]).save(f'{OUT}/traverse_map.jpg', quality=84)
json.dump({'bbox': BB}, open(f'{OUT}/traverse_map.json', 'w')); print('traverse map', cr.size)
