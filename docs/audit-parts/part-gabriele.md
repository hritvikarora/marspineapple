# Audit Part: Gabriele (Role B / `Gabryg07`) — Marswalk 3D/WebXR Demo

**Scope:** `marswalk/` standalone 3D/WebXR Mars EVA simulator (vendored in commit `448c806` from `Gabryg07/mars-eva-vr`), compared against root `marspineapple` integration contracts (`src/terrain3d/TerrainView.tsx`, `src/app/TerrainSlot.tsx`, `src/contracts/grid.ts`, `src/contracts/route.ts`, `src/contracts/bundle.ts`).

---

## 1. Standalone Build & Test Verification

### Vite Production Build (`marswalk/app/`)
Executed `cd marswalk/app && npm run build` (Vite `8.3.8`, `target: 'es2022'`, `base: './'`):
- **Status:** Clean exit code `0`, `18 modules transformed`, built in `385 ms`.
- **Note:** Vite prints a non-fatal CJS/ESM config loader warning for `marswalk/app/vite.config.js` because `marswalk/app/package.json` lacks `"type": "module"`.
- **Exact Bundle Output Sizes:**
  - `dist/index.html`: `1.97 kB` (`1,972` bytes) │ `gzip: 1.00 kB`
  - `dist/assets/index-I8xrJ1Cd.js`: `581.05 kB` (`581,056` bytes) │ `gzip: 151.02 kB`
- **Static Site Assets (`dist/sites/jezero-delta/`):** `33` files totaling `24,528,605` bytes (`24.53 MB`):
  - Heightfields (`inner_h.bin`, `mid_h.bin`, `outer_h.bin`): `5,126,402` + `1,623,602` + `1,039,682` = `7,789,686` bytes
  - Orthomosaics (`inner_ortho_0_0..3_3.jpg` [16 tiles], `mid_ortho_0_0.jpg`, `outer_ortho_0_0.jpg`): `5,478,940` + `4,523,504` + `3,296,160` = `13,298,604` bytes
  - Slope maps (`inner_slope.png`, `mid_slope.png`, `outer_slope.png`): `818,208` + `344,644` + `207,566` = `1,370,418` bytes
  - Navigation distance field (`inner_nav.png`): `122,295` bytes
  - Overlays (`minerals.png`, `thermal.png`): `392,295` + `463,604` = `855,899` bytes
  - `site.json`: `195,686` bytes
  - `photos/*.jpg` (5 Perseverance Mastcam-Z / Navcam photos): `845,827` bytes
- **Total `marswalk/app/dist/` size:** `35` files, `25,111,633` bytes (`25.11 MB` / `23.95 MiB`).

### Checks in `marswalk/test/`
- `marswalk/app/package.json` `"test"` is the placeholder `"echo \"Error: no test specified\" && exit 1"`.
- `marswalk/test/` contains 3 standalone Playwright scripts (no `package.json` or `node_modules` inside `marswalk/test/`):
  - `probe.js`: Launches headless Chromium with SwiftShader WebGL and injects `iwer` (`node_modules/iwer/build/iwer.min.js`) emulating `IWER.metaQuest2`, connects to `http://localhost:5173/`, verifies `VRButton`, `navigator.xr.isSessionSupported('immersive-vr')`, `requestSession`, and `app.player.hands`.
  - `shot.js`: Captures screenshots against `http://localhost:5173/` with query parameters (`?x=..&z=..&yaw=..&pitch=..&layer=..`) and logs `app.stats`, `app.frame`, and rig position.
  - `xr.js`: Drives an emulated Quest 2 (`IWER.metaQuest2`, stereo enabled) through VR entry, left-thumbstick walk, right-thumbstick snap turn, ballistic teleport aim, and teleport execution, asserting zero console/page errors.
- **Execution status:** Not runnable standalone inside `marswalk/test/` as-is because `iwer` is not installed (`marswalk/test/node_modules`, `marswalk/app/node_modules/iwer`, and root `node_modules/iwer` are absent, although `playwright` exists in root `node_modules`) and the scripts target a running Vite dev server on `http://localhost:5173/`.

---

## 2. Complete Feature Inventory (What Gabriele Built)

Gabriele built a full standalone WebXR/Desktop planetary EVA simulator far beyond fixed 3D viewpoints:

### A. GPU Geometry Clipmap & Streaming Terrain Engine (`terrain.js`, `main.js`)
- **3-Ring Orbital Dataset (`site.json`):**
  - `inner`: ±800 m (`1.6 × 1.6 km`), `1 m/px` (`1601×1601` height samples), 25 cm/px HiRISE orthomosaic split into `4×4` (`1600×1600`) tiles, `max slope 71.65°`.
  - `mid`: ±3,600 m (`7.2 × 7.2 km`), `8 m/px` (`901×901` height samples), HiRISE orthomosaic (`4096×4096`), `max slope 56.61°`.
  - `outer`: ±14,400 m (`28.8 × 28.8 km`), `40 m/px` (`721×721` height samples), CTX 6 m/px orthomosaic (`4096×4096`), `max slope 35.37°`.
- **GPU Clipmap (`Terrain`):**
  - `levels = 9` nested square clipmap levels (`N = 64` cells per quadrant by default, overridable via `?n=&levels=`), with inner-footprint cutout (`uHole`) in the fragment shader and concentric ring geometry (`quadrantGeometry(N, hole, q)`).
  - View-cone quadrant culling (`cosHalf = 0.2` in VR, `0.35` on desktop).
  - Vertex shader (`VERT`) performs bilinear `texelFetch` displacement from 1-texel-padded `Float32` `DataTexture` heightmaps (`uH0`, `uH1`, `uH2`) relative to `uHRef = h0`.
  - Fragment shader (`FRAG`) selects ring ortho via `textureGrad` (preventing mip seam artifacts), blends procedural 2-octave surface grain at `4–40 m` distance (`uDetail`) so 25 cm orbital pixels remain crisp underfoot, and applies exponential horizon fog (`uFogDist = 26000`).
- **Headset Texture Memory Optimization (`main.js`):**
  - `grayTex` allocates single-channel `THREE.RedFormat` / `UnsignedByteType` textures via `WebGLRenderTarget` (1/4 VRAM of RGBA) and streams `T×T` tiles directly into GPU memory via `gl.texSubImage2D` (`grayMosaic`), never holding full decoded mosaics on CPU.
- **CPU Physics/Sampling (`Heightfield`):**
  - Bilinear `height(x, z)` and central-difference `slopeDeg(x, z, e)` used for ground clamping, ballistic teleport intersection, POI vertical placement, and EVA metabolic accounting.

### B. 5 Switchable NASA Data Layers + Navigation Overlays (`main.js`, `terrain.js`, `site.json`)
Switchable via `L` / `1`–`5` keys on desktop or `A` button on right Quest controller:
1. **Layer 0 — `Immagine satellitare`**: MRO HiRISE 25 cm/px + CTX 6 m/px mapped through a custom Martian butterscotch/ochre `mars(g)` curve (`pow(g, 0.9)`).
2. **Layer 1 — `Pendenze e ostacoli`**: HiRISE 1 m / mid / outer slope maps (`*_slope.png`, 0.5°/step) shaded against `slopeLimitsDeg: [10, 20, 30]` (`<10°` green `#1abf59`, `10–20°` yellow `#fad926`, `20–30°` orange `#ff800d`, `>30°` red `#f2141a`).
3. **Layer 2 — `Topografia`**: Turbo elevation colormap across `inner` min/max elevation (`uElevRange`) plus screen-space `fwidth`-antialiased 5 m contour lines fading over `300–900 m`.
4. **Layer 3 — `Geologia: minerali`**: MRO CRISM MTRDR (`FRT00005C5E`, 18 m/px, `minerals.png`, `half = 3600 m`) co-registered to CTX (`shiftM: [-180, 204]` m = ~272 m shift; reflectance correlation improved from `0.01` to `0.62`), showing `OLINDEX3` (olivine, red), `D2300` (Fe/Mg clays, green), and `MIN2295_2480` (carbonates, blue).
5. **Layer 4 — `Temperatura: infrarosso`**: Mars Odyssey THEMIS night IR global mosaic (100 m/px, `thermal.png`, `half = 14400 m`), dark violet (cold sand/dust) to pale yellow (warm compact rock).
- **Ground Distance-Field Overlays (`inner_nav.png`):**
  - Red channel: distance (0–25.5 m, 0.1 m/DN) to planned EVA route (`uRouteOn = 1` by default; glowing cyan line `vec3(0.2, 0.9, 1.0)`).
  - Green channel: distance to Perseverance's real rover traverse (`uTrackOn` toggled via `T` or right `B` button; white line).

### C. Desktop & WebXR Quest Locomotion (`player.js`, `main.js`)
- **Desktop Controls:**
  - Click canvas for Pointer Lock mouse look (`yaw`, `pitch` clamped `±1.5 rad`).
  - `WASD` / Arrow keys walk (`walkSpeed = 1.3 m/s`), `Shift` fast move (`fastSpeed = 14 m/s`, or `120 / 400 m/s` in overview).
  - `M`: 600 m vertical Overview Lift (`toggleOverview`) to inspect the whole delta and return to the exact saved ground coordinate.
  - `L` / `1`–`5`: switch data layer; `T`: toggle rover track; `I`: toggle forearm dashboard; `H`: toggle helmet HUD; `C`: toggle Credits; `V`: toggle Helmet visor (when in XR); `R`: reset mission.
  - URL query parameters (`main.js`): `?site=`, `?x=`, `?z=`, `?yaw=`, `?pitch=`, `?layer=`, `?track=`, `?n=`, `?levels=`.
- **WebXR (Meta Quest 2, `local-floor`, foveation `1`):**
  - Left thumbstick: smooth directional walk; Left grip: fast speed.
  - Right thumbstick left/right: 30° (`π/6`) latched snap turn.
  - Right thumbstick forward (`Rr.y < -0.6`): ballistic teleport arc under Martian gravity (`MARS_G = 3.71 m/s²`, 48 segments, 8-iteration binary search ground hit, cyan valid / red out-of-bounds marker).
  - Controller ray + tip indicators on both hands.
  - Buttons: Right trigger (`0`) overview, Right grip (`1`) forearm display, `A` (`right 4`) next layer, `B` (`right 5`) rover track, `X` (`left 4`) credits, `Y` (`left 5`) reset.
- **Standable Bounds:** `canStandAt` restricts player inside `rings[1].half - 30` (`±3570 m`).

### D. Physical Mission, Metabolism, O2, Radiation & Weather (`mission.js`, `jezero-delta.json`)
- **Tobler Rescaled Walking Speed:** `flatSpeed = 0.7 m/s`, `toblerK = 3.5`, `toblerOffset = 0.05` integrated in 2 m sub-steps over actual terrain elevation differences (`move(a, b)`).
- **Metabolic & O2 Model:** `150 W` basal (`idle(dt)`), `200 J/m` flat walking, vertical work `massKg (260 kg) * gravity (3.71 m/s²) * v * max(sinUp, 0) / efficiency (0.25)`; `0.6 kg` O2 tank (`20.1 kJ/L`, `1.429 g/L`, `20%` reserve fraction).
- **Radiation Model:** Curiosity RAD reference `0.64 mSv/day` (`SOL_S = 88,775 s`) accumulated continuously.
- **LMST Clock & Sunset:** Starts at `10:00` LMST; computes remaining daylight against Perseverance MEDA `sunset` (`17:13:51` on sol 1133) and estimates return time using `1.3×` straight-line distance to base at `flatSpeed`.
- **Return Alerts:** Triggers `OSSIGENO: RIENTRA ALLA BASE` when `(autonomy - reserve) < backTime`, or `TRAMONTO VICINO: RIENTRA ALLA BASE` when `daylight < backTime + 1800`.
- **Progress Accounting:** Advances `leg` when within `9 m` of current target POI, tracks `dist`, `climb`, `peakSlope`, `visited`, and `done`.

### E. 6 Perseverance POIs with Rover Photos (`pois.js`, `site.json`)
Route order (`route` / `legs`): `base` → `threeforks` → `nukshak` → `yori` → `wildcat` → `rockytop` → `base` (total `2,177 m` across 6 legs; `README.md` rounds to `2.2 km`):
1. **Base** (sol 409, synthetic scenario base, no photo)
2. **Three Forks** (sol 663, Mastcam-Z photo + MEDA sol 690 `-84.4` to `-16.8 °C`)
3. **Cape Nukshak** (sol 565, Mastcam-Z photo + MEDA sol 565 `-87.3` to `-23.6 °C`)
4. **Yori Pass** (sol 609, Navcam photo)
5. **Wildcat Ridge** (sol 502, Mastcam-Z sol 464 photo + MEDA sol 484 `-71.8` to `-20.5 °C`)
6. **Rocky Top** (sol 709, Navcam photo)
- Each POI renders a 90 m translucent cylindrical light beacon (width scaled by distance, gold=base, cyan=pending, green=visited, higher opacity on active target), a billboarded floating name tag, and an auto-anchoring `2.4×1.5 m` info card with photo, NASA/JPL/ASU credit, description, MEDA temp, and next-leg stats (`length`, `climb`, `maxSlope`) that opens within `11 m` and hides past `24 m`.

### F. Helmet Visor, HUD, Forearm Dashboard, Wrist Legend, Credits, Debrief & Sky
- **Helmet Visor (`helmet.js`):** Visible in XR (`xr && !off`), constructed as concentric annular rings (`renderOrder = 300`, zero center overdraw) with rim shadow, padding, shell, warm seal highlight, and 5 additive curved-visor glints (`renderOrder = 301`) that shift and modulate opacity with head yaw/pitch vs the low WSW Sun.
- **Helmet HUD (`hud.js`):** Camera-locked `1.0×0.3 m` canvas panel (`renderOrder = 200`) refreshed at 5 Hz: LMST clock, EVA time, daylight remaining, O2 % bar + autonomy/return times, radiation `µSv`, distance & climb, next stop name/distance/compass arrow/leg index, and bottom strip (current slope & hazard class or return alert).
- **Right Forearm Dashboard (`arm.js`):** Mounted to right XR controller (or camera bottom-right on desktop). Collapsed `DISPLAY` prompt (`0.09×0.05 m`) toggles (`I` / right grip) into a `0.39×0.26 m` dashboard showing a live 560×560 px sepia orbital minimap (`mid_ortho_0_0.jpg` cropped to `±800 m`), 200 m scale bar, route/POI dots, live player heading arrow, lat/lon, MOLA elevation, slope, distance from base, MEDA sol 1133 weather (`-79.3 / -24.7 °C`, `778.9 Pa`, `06:18 – 17:13`), active layer swatches, and horizontal stop checklist.
- **Left Wrist Legend & DOM Legend (`info.js`, `index.html`):** Left-hand XR panel (`0.26×0.17 m`) showing active layer (`1/5..5/5`), source, color swatches, interpretation note, MEDA weather, and Quest controls; mirrors legend into top-right DOM `#legend`.
- **Credits Panel (`info.js`):** `2.6×2.3 m` world-space popup (`C` / `X`) populated from `site.json` citing HiRISE/CTX, `georefCheck` (`132` rover waypoints, mean diff `-0.0068 ± 0.067 m`), Perseverance localization/photos/MEDA, CRISM (272 m shift), THEMIS, MEDA weather, Curiosity RAD, and mission model assumptions.
- **Debrief Panel (`info.js`):** `2.2×1.45 m` green-framed summary popup auto-spawned upon returning to Base (`mission.done`): duration & arrival LMST, distance & climb, O2 used & 20% reserve status, radiation dose compared against Earth natural background days (`2400 µSv/yr`), peak slope classification, and daylight margin.
- **Sky (`sky.js`):** Custom `ShaderMaterial` sphere (`r = 1000`) with Martian butterscotch horizon-to-zenith gradient, Sun halo, and disc.
- **Python Data Pipeline (`marswalk/pipeline/`):** End-to-end scripts (`fetch.py`, `fetch_crism.py`, `fetch_photos.py`, `photo_sheet.py`, `fetch_all.sh`, `build_site.py`) downloading USGS/PDS/JPL data and computing the 2 m-grid `skimage.graph.route_through_array` least-cost path + `inner_nav.png` distance field.

---

## 3. Coordinate Frame Offset & Root Integration Contract

### Exact Coordinate Frame Offset vs `marspineapple`
Verified directly against `marswalk/app/public/sites/jezero-delta/site.json` and `public/bundles/jezero-west-hirise-v0.1.0/manifest.json`:

| Waypoint / Feature | `marswalk` (`x_vr`, `y_vr`) | `marspineapple` (`east_m`, `north_m`) | `east_m - x_vr` | `north_m - y_vr` |
| --- | --- | --- | --- | --- |
| Sol 502 (Wildcat / `poi-p3`) | `(23.89, 186.55)` | `(610.687, 656.700)` | `+586.797 m` | `+470.150 m` |
| Sol 565 (Cape Nukshak / `poi-p4`) | `(-228.27, -282.96)` | `(358.558, 187.200)` | `+586.828 m` | `+470.160 m` |
| Sol 686 (Three Forks / `poi-p5`) | `(165.68, -126.15)` | `(752.498, 344.000)` | `+586.818 m` | `+470.150 m` |

- **Conversion formula:**
  - `east_m = x_vr + 586.81` (equivalently `x_vr = east_m - 586.81`)
  - `north_m = y_vr + 470.15` (equivalently `y_vr = north_m - 470.15`)
- **Projection origin difference:** `marswalk` uses a local orthographic projection (`+proj=ortho +lat_0=18.4555 +lon_0=77.4055 +R=3396190`), whereas `marspineapple` (`jezero-west-hirise-v0.1.0`) uses USGS Equirectangular `lat_ts=0` scaled by `cos(18.456°) = 0.9485670310210961` from SW corner `(4587569.0, 1093474.0)` (analytical origin offset `(586.78 m, 470.18 m)`; ~1–3 cm local projection drift across 1 km).
- **Three.js Axis & Vertical Origin Convention:**
  - `marswalk` places scene vertices at `X = x_vr` (East), `Y = elev - h0` (vertical relative to `inner` center height `h0`), `Z = -y_vr` (South, so North is `-Z`).
  - Root `src/contracts/grid.ts` (`toSceneXYZ(p, elevation_m)`) specifies `[p.east_m, elevation_m, -p.north_m]`. Thus any `GridBundle` coordinate `(east_m, north_m, elevation_m)` maps into `marswalk`'s scene space as `(east_m - 586.81, elevation_m - h0, -(north_m - 470.15))` (and `marswalk` `player.head()` maps back to `GridBundle` local coords via `east_m = head.x + 586.81`, `north_m = -head.z + 470.15`).
  - Note: `jezero-west-hirise-v0.1.0` (`[0..948.57] × [0..1000]` m) covers `x_vr ∈ [-586.81, +361.76]`, `y_vr ∈ [-470.15, +529.85]`, which fits completely inside `marswalk`'s `inner` 1 m ring (`[-800, +800]`).

### How Root Expects Role B to Plug In (`TerrainView.tsx`, `TerrainSlot.tsx`, `grid.ts`)
- `src/app/TerrainSlot.tsx` handles:
  1. WebGL availability probe (`detectWebGL`),
  2. Lazy-loading (`lazyTerrain` + `<Suspense>`) so `three` stays out of the initial root JS bundle,
  3. React `<ErrorBoundary>` catching load/render errors and `onError` callbacks (`'webgl-unavailable' | 'context-lost' | 'terrain-data' | 'texture'`), degrading cleanly to the 2D fallback (`data-testid="terrain-fallback"`).
- `src/terrain3d/TerrainView.tsx` (currently a placeholder stub) defines `TerrainViewProps`:
  - `bundle: GridBundle` (immutable shared `Float32Array`/`Uint8Array` views; never mutate/transfer)
  - `candidates: RouteCandidate[]`
  - `selectedCandidateId: string | null`
  - `highlightPathIndex: number | null` (for hover sync with 2D map & elevation profile)
  - `verticalExaggeration: number`
  - `camera: unknown` / `onCameraChange?: (camera: unknown) => void`
  - `onSelectCandidate?: (candidateId: string) => void`
  - `onError?: (e: { kind: 'webgl-unavailable' | 'context-lost' | 'terrain-data' | 'texture'; message: string }) => void`
- Root `public/sites/jezero-delta/` already has a vendored copy of `marswalk`'s site assets, and root `package.json` already depends on `three@^0.187.0` and `@types/three@^0.187.0`.

---

## 4. Exact Gaps vs Target Integrated Experience

1. **Static `inner_nav.png` Route Rendering:**
   - The EVA route is pre-baked into the red channel of `inner_nav.png` offline by `build_site.py`. `marswalk` has **no dynamic path geometry renderer**. It cannot display arbitrary A* `RouteCandidate` paths (`outbound.path` / `returnLeg.path`) as a solid blue route, nor render rejected/alternative `RouteCandidate`s as dotted lines with explanations, nor highlight `highlightPathIndex` on hover.
2. **All UI Copy & Content Hardcoded in Italian:**
   - `index.html` (`lang="it"`), `main.js`, `hud.js`, `arm.js`, `info.js`, `pois.js`, `mission.js`, and `site.json` have every UI string, hazard label (`AGEVOLE/IMPEGNATIVA/CRITICA/VIETATA`), alert, control prompt, and scientific caption in Italian. Must be localized/aligned to English for the integrated app.
3. **No Pathfinding / `GridBundle` / React Integration Yet:**
   - `marswalk` is a standalone vanilla JS module (`boot()` in `main.js`) reading `site.json` directly into `window.app` and appending a full-window `<canvas>` to `document.body`.
   - It is not wrapped in `TerrainView.tsx`, does not accept `TerrainViewProps` (`bundle`, `candidates`, `selectedCandidateId`, `highlightPathIndex`, `verticalExaggeration`, `onSelectCandidate`, `onError`), does not support arbitrary `bundle` grids (such as `synthetic-v0` or `jezero-west-ctx20m-v0.1.0` when `jezero-west-hirise-v0.1.0` isn't loaded), and has no React lifecycle cleanup (`dispose()` for renderer/textures/geometries, `window` keydown/resize/mousemove listeners, `setAnimationLoop`, pointer lock exit).
4. **No Off-Path Detection, Center-Screen `X` Cross, or Respawn:**
   - `mission.js` only checks `< 9 m` proximity to the next sequential POI and triggers low-O2/sunset warnings. There is **no** distance-to-active-route check, no off-path hazard/deviation warning (`X` cross at center of screen when stepping off the planned blue route), and no "Respawn to route" action (only `R`/`Y` full mission reset to Base).
5. **Missing Error Contract & Headless/Accessibility Hooks:**
   - `marswalk` logs `boot()` errors to `console.error` and `#msg` instead of calling `onError({ kind, message })` or listening for `webglcontextlost`.
   - Canvas overlays (`hud.js`, `arm.js`, `info.js`, `pois.js`) live exclusively inside WebGL textures, so React UI controls, e2e `data-testid="terrain-view"` hooks, and point-B arrival/return-to-start-menu React state transitions are not exposed yet.
