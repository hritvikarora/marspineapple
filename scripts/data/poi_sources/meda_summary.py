import urllib.request, csv, io, json, statistics
B="https://atmos.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/data_calibrated_env/"
bins=[(0,89),(90,179),(180,299),(300,419),(420,539),(540,659),(660,779),(780,899),(900,1019),(1020,1139),(1140,1259),(1260,1379),(1380,1499),(1500,1619),(1620,1739),(1740,1859)]
out={}
for s in [3,4,286,484,490,518,566,690,789,1074,1178,1438]:
    a,b=[x for x in bins if x[0]<=s<=x[1]][0]
    url=f"{B}sol_{a:04d}_{b:04d}/sol_{s:04d}/WE__{s:04d}___________CAL_ATS_________________P01.CSV"
    try:
        t=urllib.request.urlopen(url,timeout=60).read().decode()
        r=list(csv.DictReader(io.StringIO(t)))
        v=[statistics.mean(float(x[f"ATS_LOCAL_TEMP{i}"]) for i in (1,2,3)) for x in r if all(x[f"ATS_LOCAL_TEMP{i}"] not in ("","NaN") for i in (1,2,3))]
        out[s]=dict(url=url,n=len(v),ats123_mean_min_K=round(min(v),2),ats123_mean_max_K=round(max(v),2),min_C=round(min(v)-273.15,1),max_C=round(max(v)-273.15,1)) if v else dict(url=url,n=0)
    except Exception as e: out[s]=dict(url=url,error=str(e)[:80])
    print(s,out[s])
json.dump(out,open("meda_ats_summary_pano_sols.json","w"),indent=1)
