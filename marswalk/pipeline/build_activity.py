"""Perseverance day by day, for the research-room calendar.
- position of the rover for every sol with an end-of-drive localization (NASA/JPL-Caltech M20 waypoints, whole mission)
- per-sol counts of images from the instruments that reveal an activity (raw image feed): sampling, close-up science, laser, sky
usage: build_activity.py <M20_waypoints.json> <site.json> <out.json>"""
import sys, json, math, urllib.request, collections
from concurrent.futures import ThreadPoolExecutor
WP, SITE, OUT = sys.argv[1:4]; s = json.load(open(SITE)); R, lon0, lat0 = s['radius'], s['lon0'], s['lat0']
def local(lon, lat):   # same orthographic frame as the terrain
    p0, l0, p, l = map(math.radians, (lat0, lon0, lat, lon))
    return R * math.cos(p) * math.sin(l - l0), R * (math.cos(p0) * math.sin(p) - math.sin(p0) * math.cos(p) * math.cos(l - l0))
wp = {}
for f in json.load(open(WP))['features']:
    q = f['properties']; x, y = local(q['lon'], q['lat'])
    wp[q['sol']] = [q['sol'], round(x, 1), round(y, 1), round(q['elev_geoid'], 1), round(q['dist_total_m'])]   # last localization of the sol wins
API = "https://mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020&feedtype=json&ver=1.2&num=100&page={p}&order=sol+desc&search={c}"
INSTR = {'CACHECAM': 'cache', 'SHERLOC_WATSON': 'watson', 'PIXL_MCC': 'pixl', 'SUPERCAM_RMI': 'rmi', 'SKYCAM': 'sky', 'MCZ_LEFT': None}
def page(a):
    c, p = a
    for k in range(4):
        try: return c, [i['sol'] for i in json.load(urllib.request.urlopen(API.format(p=p, c=c), timeout=60))['images']]
        except Exception: pass
    print('fail', c, p); return c, []
counts = collections.defaultdict(lambda: collections.Counter())
jobs = []
for c, k in INSTR.items():
    if not k: continue
    n = json.load(urllib.request.urlopen(API.format(p=0, c=c).replace('num=100', 'num=1'), timeout=60))['total_results']; jobs += [(c, p) for p in range((n + 99) // 100)]
with ThreadPoolExecutor(10) as ex:
    for c, sols in ex.map(page, jobs):
        for sol in sols: counts[sol][INSTR[c]] += 1
act = {str(sol): dict(c) for sol, c in sorted(counts.items())}
json.dump({'landingUTC': '2021-02-18T20:55:00Z', 'solSeconds': 88775.244, 'waypoints': [wp[k] for k in sorted(wp)], 'activity': act,
           'source': 'NASA/JPL-Caltech: Mars 2020 waypoints (MMGIS) e feed delle immagini raw'}, open(OUT, 'w'), separators=(',', ':'))
print(len(wp), 'waypoints', len(act), 'sols with activity')

# ---- extra data for the research room (appended): Ingenuity flights, MEDA samples, sample register, downloadable files
import csv, os, datetime
d = json.load(open(OUT)); RAW = os.path.dirname(WP)
heli = [[f['properties']['Sol'], f['properties']['Flight']] for f in json.load(open(RAW + '/m20heli.json'))['features'] if f['properties'].get('Flight')]
d['heli'] = heli
# MEDA: air temperature from the calibrated ATS files (PDS) for the sols the team extracted, plus the NASA weather bulletin
meda = {}
for f in sys.argv[4:]:
    for sol, v in json.load(open(f)).items():
        if 'min_C' in v: meda[int(sol)] = [int(sol), v['min_C'], v['max_C'], None]
for v in json.load(open(RAW + '/weather.json'))['sols']:
    try: meda[int(v['sol'])] = [int(v['sol']), float(v['min_temp']), float(v['max_temp']), float(v['pressure'])]
    except ValueError: pass
d['meda'] = [meda[k] for k in sorted(meda)]
# samples taken in this area. Collection sols are the sols with CacheCam images of the tube (raw image feed);
# depot sols from the Analyst's Notebook (WUSTL), "Three Forks Depot"
d['samples'] = [
  dict(name='Swift Run', sol=490, rock={'it': 'arenaria', 'en': 'sandstone'}, outcrop='Skinner Ridge'),
  dict(name='Skyland', sol=495, rock={'it': 'arenaria', 'en': 'sandstone'}, outcrop='Skinner Ridge', depot=680),
  dict(name='Hazeltop', sol=509, rock={'it': 'roccia fangosa', 'en': 'mudstone'}, outcrop='Wildcat Ridge'),
  dict(name='Bearwallow', sol=516, rock={'it': 'roccia fangosa', 'en': 'mudstone'}, outcrop='Wildcat Ridge', depot=675),
  dict(name='Shuyak', sol=575, rock={'it': 'roccia sedimentaria fine', 'en': 'fine-grained sedimentary rock'}, outcrop='Amalik'),
  dict(name='Mageik', sol=579, rock={'it': 'roccia sedimentaria fine', 'en': 'fine-grained sedimentary rock'}, outcrop='Amalik', depot=655)]
d['depot'] = [['Malay', 653], ['Mageik', 655], ['Crosswind Lake', 661], ['Roubion', 666], ['Coulettes', 668], ['Montdenier', 672], ['Bearwallow', 675], ['Skyland', 680], ['Atsah', 682], ['Amalik Witness', 690]]
json.dump(d, open(OUT, 'w'), separators=(',', ':'))
# downloadable files next to activity.json
od = os.path.dirname(OUT); L0 = datetime.datetime(2021, 2, 18, 20, 55)
def lonlat(x, y):
    p0 = math.radians(lat0); rho = math.hypot(x, y) or 1e-9; c = math.asin(min(1, rho / R))
    lat = math.asin(math.cos(c) * math.sin(p0) + y * math.sin(c) * math.cos(p0) / rho)
    lon = math.radians(lon0) + math.atan2(x * math.sin(c), rho * math.cos(p0) * math.cos(c) - y * math.sin(p0) * math.sin(c))
    return round(math.degrees(lon), 6), round(math.degrees(lat), 6)
with open(od + '/perseverance_sols.csv', 'w', newline='') as f:
    w = csv.writer(f); w.writerow(['sol', 'earth_date_utc', 'lon_deg_e', 'lat_deg_n', 'elev_m_mola', 'odometry_m'])
    for sol, x, y, e, odo in d['waypoints']: w.writerow([sol, (L0 + datetime.timedelta(seconds=(sol - 0.16) * 88775.244)).strftime('%Y-%m-%d'), *lonlat(x, y), e, odo])
gj = dict(type='FeatureCollection', features=[dict(type='Feature', properties=dict(leg=i + 1, frm=l['frm'], to=l['to'], length_m=round(l['length']), climb_m=round(l['climb']), max_slope_deg=round(l['maxSlope'], 1)),
          geometry=dict(type='LineString', coordinates=[list(lonlat(x, y)) for x, y in seg])) for i, (l, seg) in enumerate(zip(s['legs'], s['route']))])
gj['features'] += [dict(type='Feature', properties=dict(id=p['id'], name=p['name'], kind=p['kind'], elev_m=p.get('elev')), geometry=dict(type='Point', coordinates=list(lonlat(p['x'], p['y'])))) for p in s['pois']]
json.dump(gj, open(od + '/eva_route.geojson', 'w'))
with open(od + '/eva_stops.csv', 'w', newline='') as f:
    w = csv.writer(f); w.writerow(['id', 'name', 'lon_deg_e', 'lat_deg_n', 'elev_m_mola', 'rover_sol'])
    for p in s['pois']: w.writerow([p['id'], p['name'], *lonlat(p['x'], p['y']), p.get('elev'), p.get('sol')])
print('heli', len(heli), 'meda', len(d['meda']), 'files written')
