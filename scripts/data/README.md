# scripts/data — Role A (Dati, GIS ed evidenza scientifica)

> **English:** Python pipeline that turns public USGS/NASA Mars data into the contract-v1 region bundles in
> `public/bundles/jezero-west-hirise-v0.1.0` (HiRISE 1 m, primary) and `public/bundles/jezero-west-ctx20m-v0.1.0`
> (CTX 20 m COARSE fallback). Run everything from this folder.

## Riprodurre (da `scripts/data/`)
```bash
python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.lock
python acquire.py           # scarica in raw/ (gitignored, ~80 MB) con richieste HTTP parziali; checksum in raw/CHECKSUMS.sha256
python process.py           # crea package/v0.1.0 (intermedio, gitignored): griglia, maschere, pendenza, rugosità, fallback CTX, texture
python make_validation.py   # evidenze in package/v0.1.0/validation/ (legge anche il file USGS originale via HTTP)
python -m pytest -q tests   # piani sintetici: pendenza nota, fattore cos(lat), rugosità, NaN
python package/v0.1.0/validate.py
python export_bundle.py     # scrive i bundle in ../../public/bundles/<bundleId>/
cd ../.. && npm run validate-bundle -- public/bundles/jezero-west-hirise-v0.1.0
```

## Scelte principali
- **Area:** nucleo approvato x 4587569–4588569, y 1093474–1094474 m (Equirectangular Mars 2000 sfera, lat_ts=0) = lon 77.395064–77.411934 E, lat 18.447568–18.464438 N, delta occidentale di Jezero.
- **Frame locale del contratto:** `east_m = (x − x_ovest)·cos(lat_c)`, `north_m = y − y_sud`, origine = angolo SO esterno. `cos(lat_c) = 0.948567` → celle **0.948567 m (E) × 1 m (N)** (HiRISE) e 18.97 × 20 m (CTX). La proiezione sorgente allunga l'est-ovest di 1/cos(lat): senza correzione la mesh sarebbe allungata del 5.4 %.
- **Elevazione:** campioni nativi copiati 1:1 (nessun ricampionamento), NaN = NoData sorgente; valori negativi validi.
- **Pendenza:** Horn 3×3 su spaziatura a terra, calcolata con margine di 250 m e poi ritagliata. **Rugosità:** RMS dei residui dopo piano ai minimi quadrati, 5×5 celle (CTX: 3×3).
- **Qualità:** il mosaico USGS non pubblica qualità per pixel → tutte le celle valide = `3 unknown`, `strictQualitySupported: false`.
- **Esclusione:** nostri bit → enum contratto (1 mancante, 2 derivata non supportata, 3 fuori estensione, 4 manuale). Nessuna esclusione in v0.1.0.
- **POI:** P3 Skinner/Wildcat Ridge, P4 Enchanted Lake/Amalik, P5 Three Forks Depot (posizioni rover NASA/JPL, `officialName: false`). Elenco completo con panorami e temperature: `pois.json`, `POI_RIASSUNTO.md`.

## File
`acquire.py`, `inspect_header.py`, `inspect_data.py`, `preview_overview.py`, `process.py`, `src/terrain.py`, `tests/`, `make_validation.py`,
`make_pois.py` (+ `poi_sources/`), `export_bundle.py`, `config.json`, `requirements.lock`, `versions.txt`, `sources.json`, `package_template/`.
Copia completa del lavoro (con evidenze e anteprime): repo privato `ireneplemic-cmyk/jezero-data-gis`.
