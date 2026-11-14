# Codici di qualità ed esclusione / Quality and exclusion codes — come deve comportarsi l'app

Riferimenti: `INTERFACE.md` (contract v1, sez. layer e decisioni aperte 1, 4, 7), manifest `jezero-west-hirise-v0.1.0`, `src/routing/placeholderEngine.ts`, `validation_report.json`.

## Italiano

### Qualità (`quality.u8`)
| Codice | Significato (contratto) | Presente in v0.1.0? | Comportamento dell'app |
|---|---|---|---|
| 0 | nessuna quota | No (0 celle; 100% celle valide) | Cella non percorribile; mostrare in nero/grigio. |
| 1 | qualità buona documentata | **No** — la fonte non la fornisce | — |
| 2 | qualità bassa documentata | **No** — la fonte non la fornisce | — |
| 3 | sconosciuta | **Sì, tutte le 1 000 000 celle** | Percorribile. Mostrare come "qualità non pubblicata dalla fonte", non come "dato cattivo". |

Perché tutto è 3: il mosaico DTM USGS non pubblica un indice di qualità per pixel, solo statistiche globali (HiRISE↔CTX ~0,4 m verticale; ortoimmagini co-registrate < 3 m al 99° percentile). Abbiamo scelto di **non inventare** una qualità per cella. La differenza CTX − HiRISE calcolata in `package/v0.1.0` è un controllo di coerenza tra prodotti, **non** una mappa di errore, e non è stata usata per la qualità.

### Esclusione (`exclusion.u8`)
| Codice | Significato | Celle in v0.1.0 | Comportamento |
|---|---|---|---|
| 0 | nessuna | 1 000 000 | normale |
| 1 | quota mancante | 0 | mai percorribile |
| 2 | derivata non calcolabile (finestra pendenza 3×3 o rugosità 5×5 incompleta) | 0 (calcolate con margine di 250 m e poi ritagliate) | mai percorribile |
| 3 | fuori dall'estensione della fonte | 0 | mai percorribile |
| 4 | manuale (documentata) | 0 — nessuna applicata | mai percorribile |

**I limiti di pendenza non sono nel layer di esclusione**: appartengono al profilo del modello di percorso (Ayush). Oggi il profilo segnaposto esclude celle con pendenza > 25° (≈ 3,2% dell'area ha pendenza ≥ 25°) e archi con grado > 20°.

### Cosa deve fare l'app (proposta da confermare con Dhani e Ayush)
1. **Modalità qualità rigorosa: disattivata** (contratto: `strictQualitySupported: false` → controllo disabilitato e, se richiesta, risposta `invalid-input / strict-quality-unsupported`). Tooltip suggerito: *"Not available: the source publishes no per-pixel quality."* / *"Non disponibile: la fonte non pubblica una qualità per pixel."*
2. **Metriche**: ogni percorso avrà `unknownQualityPct = 100` e `lowQualityLength_m = 0`. Mostrarlo con una nota fissa, non come allarme: *"Quality unknown along the whole route (no per-pixel quality in source data)."*
3. **Politica "uncertainty-aware"**: con qualità uniforme, la penalità di qualità è uguale ovunque e quindi non cambia la scelta del percorso; la differenza con le altre politiche viene solo dai pesi di pendenza/rugosità. Da dire in giuria/UI per non far credere che il percorso "eviti l'incertezza".
4. **Layer qualità sulla mappa**: oggi colorerebbe tutta l'area di viola (codice 3). Proposta: mostrare il layer spento di default e la legenda di `ui_captions`.
5. **Layer esclusione**: vuoto in v0.1.0; lasciarlo disponibile perché versioni future (o il fallback) potrebbero avere celle escluse.
6. **Endpoint**: un punto di partenza/arrivo su una cella esclusa → `invalid-input / endpoint-excluded` (contratto).
7. **Fallback CTX**: stessa codifica (tutte 3, nessuna esclusione); aggiungere sempre l'etichetta modalità grossolana.

### Da segnalare ad Ayush (osservazione, non modifica)
La normalizzazione della rugosità nel profilo segnaposto è `roughnessNorm_m: 1`, mentre nei nostri dati la rugosità è mediana 0,019 m e p99 0,117 m: con questi valori la rugosità pesa pochissimo sul costo. Decisione sua.

## English

### Quality
| Code | Meaning | In v0.1.0? | App behaviour |
|---|---|---|---|
| 0 | no elevation | No (0 cells) | not traversable |
| 1 | documented good | **No** — not provided by source | — |
| 2 | documented low | **No** — not provided by source | — |
| 3 | unknown | **Yes, all 1,000,000 cells** | traversable; label "quality not published by source", not "bad data" |

Why: the USGS DTM mosaic publishes only global statistics, no per-pixel quality; we did not invent one. The CTX−HiRISE difference is an inter-product consistency check, not an error map.

### Exclusion
| Code | Meaning | Cells | Behaviour |
|---|---|---|---|
| 0 | none | 1,000,000 | normal |
| 1 | missing elevation | 0 | never traversable |
| 2 | unsupported derivative (3×3 slope / 5×5 roughness window incomplete) | 0 (computed with 250 m margin, then cropped) | never traversable |
| 3 | outside source extent | 0 | never traversable |
| 4 | manual (documented) | 0 | never traversable |

Slope limits are **not** baked into exclusion; they belong to the route-model profile (placeholder: > 25° slope excluded, ≈ 3.2% of area; edge grade > 20°).

### App behaviour (proposal for Dhani + Ayush)
1. Strict quality mode disabled (`strictQualitySupported: false` → disabled control; `strict-quality-unsupported` if requested).
2. Every route shows `unknownQualityPct = 100`: show a fixed note, not a warning.
3. "Uncertainty-aware" policy: uniform quality ⇒ the quality penalty does not change route choice; differences come only from slope/roughness weights.
4. Quality overlay off by default (it would tint everything code 3).
5. Keep exclusion overlay available (empty in v0.1.0).
6. Endpoint on excluded cell → `invalid-input / endpoint-excluded`.
7. CTX fallback: same coding, always with the coarse-mode label.

Note for Ayush: placeholder `roughnessNorm_m: 1` vs our roughness median 0.019 m / p99 0.117 m ⇒ roughness has almost no effect on cost. His call.
