# Demo video — shot list and narration

Owner: **Role C** (assembly), footage reviewed by the team. Record from the **live** site
(https://hritvikarora.github.io/marspineapple/) in a fresh browser window, 1920×1080, browser zoom 100 %, no bookmarks
bar, notifications off. Narrate in plain language; never claim anything the app does not show.

> **Length conflict — check before recording.** This script is the requested 2–3 minute walkthrough. The Role C plan
> reports a **30 s maximum** for the official 2026 video (target 25–28 s) or a seven-slide deck option. Confirm the
> current rule on the official submission form (RELEASE-CHECKLIST §7) and use the **25–28 s cut** at the end if the
> limit is real. The long version is still useful for a Milan live presentation or the repo.

State at time of writing: route model `placeholder-astar-0.2.0`, 3D view is a placeholder. **If Ayush's solver, Dhani's
UI or Role B's 3D view land before recording, re-check every number and label below against the live build.**
Numbers below are from the HiRISE bundle, one-way, all three policies.

## Before you press record

- [ ] Live header reads `app 0.1.0 · bundle jezero-west-hirise-v0.1.0 · model …` (update if the model changed).
- [ ] Do one dry run of P3 → P4 so the bundle (≈10 MB) is cached; then reload so the page starts clean.
- [ ] Layers: elevation + route + poi on; slope off (switch it on during shot 4).
- [ ] Have a text editor ready to show the exported JSON (shot 7) and the README credits section (shot 8).

## 2–3 minute version (≈ 2:30)

| # | Time | On screen (real UI) | Narration outline |
|---|---|---|---|
| 1 | 0:00–0:15 | Live page loads; hover over the header release line, then the map with the N arrow and 50 m scale bar. | Mars traverse planning has to trade distance against steep and uncertain ground. MARS PATHFINDER is a browser tool that plans routes on real orbital elevation data of the Jezero crater delta front, explored by Perseverance. Educational simulation, not a safety tool. |
| 2 | 0:15–0:35 | **Start** select → *Delta front – Skinner Ridge / Wildcat Ridge (Hawksbill Gap ascent)* (P3). **Destination** → *Delta front base – Enchanted Lake / Amalik / Hidden Harbor* (P4). Point at the S and D markers. | Science stops are placed at Perseverance's own waypoints. The terrain is a 1-metre HiRISE elevation model from the USGS — a million cells, about a square kilometre. |
| 3 | 0:35–0:55 | Policies: all three ticked. Click **Calculate routes**; the result appears in about a second. Cyan = selected, white = alternative. | The route search runs in a background worker in the browser — no server. We ask three questions at once: what's the shortest feasible route, what's the gentlest, and what avoids uncertain data. |
| 4 | 0:55–1:25 | **Result** list: shortest-feasible 569.6 m, max slope 19.3°, max grade 18.9°; terrain-aware + uncertainty-aware: same 569.6 m, max slope 17.3°, max grade 13.5°. Tick **slope** in Layers to show why. | Same length, but the terrain-aware route keeps the steepest step under 14 degrees instead of 19. Here two policies gave the identical path, and the app says so instead of pretending they differ. |
| 5 | 1:25–1:45 | Drag **Inspect position along route** under the elevation profile; the yellow marker moves on the map and the briefing follows. | The elevation profile, the map and the briefing are always about the same route and the same point. |
| 6 | 1:45–2:00 | Point to *unknown quality 100 %* in the metrics and the disabled **Strict quality** checkbox. | Honesty about data: this elevation model has no per-pixel quality map, so every metre is marked unknown and strict mode is switched off rather than faked. |
| 7 | 2:00–2:15 | Tick **Round trip**, recalculate. Then **Export JSON**; open the file and scroll to the `release` block. | Round trips are checked too. Every result exports as a reproducible file stamped with the app, data and model versions. |
| 8 | 2:15–2:35 | Show the README *Data sources and credits* table (or the in-app source list if Dhani adds one). End card: live URL + repo URL. | Data: USGS HiRISE and CTX elevation mosaics built for Mars 2020 landing navigation, HiRISE imagery, and NASA/JPL rover waypoints. Limits: demo slope limits, placeholder solver, metre-scale rocks not modelled. Try it at the link. |

**Optional shot (only if Role B's 3D view is integrated and passes its checks):** after shot 5, switch the view to
**3D**, show the same cyan route draped on the terrain with the hover marker aligned, then back to **2D** (≈ 15 s; trim
shot 7 to compensate). Do **not** show the current placeholder panel as a 3D feature.

**Alternative pairs if P3 → P4 changes:** P4 → *Three Forks Sample Depot* (P5): 461.6 m, both routes ≈ 14.5° max
slope — use as an "honest equality" example. P3 → P5: 369.7 m, 21.2° vs 20.1° max slope.

## 25–28 second cut (if the 30 s limit is confirmed)

Matches plan 5.2: science target → policy comparison / honest equality → data-quality evidence → (3D alignment if
ready) → credits. Captions instead of narration if voice-over doesn't fit.

| # | Time | On screen | Caption / voice |
|---|---|---|---|
| 1 | 0–4 s | P3 and P4 selected on the Jezero HiRISE map. | "Route planning on real Mars terrain — Jezero delta, 1 m HiRISE elevation." |
| 2 | 4–10 s | Click **Calculate routes**; route appears. | "Three policies, computed in your browser." |
| 3 | 10–17 s | Zoom on the result list: 19.3° vs 17.3° slope, same 569.6 m. | "Same distance, gentler slope — and identical routes are shown as identical." |
| 4 | 17–22 s | Scrub the profile slider; marker moves on map. Point at *unknown quality 100 %*. | "No per-pixel quality in this dataset — so we say unknown." |
| 5 | 22–27 s | Credits table + live URL. | "Data: USGS / HiRISE / CTX, NASA/JPL waypoints. hritvikarora.github.io/marspineapple" |

## After recording

- [ ] Watch the final export end to end; check every on-screen number matches the live build.
- [ ] Keep the raw capture and a backup take in the team drive; upload the final where the form requires.
- [ ] Add the video link to RELEASE-CHECKLIST §8 and the submission form.
