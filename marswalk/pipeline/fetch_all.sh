#!/bin/bash
# centre of the site (lon lat) ; rings: inner 1.6 km, mid 7.2 km, outer 28.8 km
LON=77.4055; LAT=18.4555
cd /home/user/mars/work
python3 ../pipeline/fetch.py hirise_ortho $LON $LAT 800 0.25 inner_ortho.npy > log_inner_ortho.txt 2>&1 &
python3 ../pipeline/fetch.py hirise_dtm $LON $LAT 3600 8 mid_dtm.npy > log_mid_dtm.txt 2>&1 &
python3 ../pipeline/fetch.py ctx_dtm $LON $LAT 14400 40 outer_dtm.npy > log_outer_dtm.txt 2>&1 &
python3 ../pipeline/fetch.py ctx_ortho $LON $LAT 14400 7.03125 outer_ortho.npy > log_outer_ortho.txt 2>&1 &
wait
python3 ../pipeline/fetch.py hirise_ortho $LON $LAT 3600 1.7578125 mid_ortho.npy > log_mid_ortho.txt 2>&1
echo done > fetch_done.txt
