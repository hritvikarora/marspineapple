# Architectural Debate — `vr-terrain`

Files owned:
- `src/terrain3d/marswalkTypes.ts`
- `src/terrain3d/marswalkTerrain.ts`
- `src/terrain3d/marswalkSky.ts`
- `src/terrain3d/marswalkPois.ts`

## Pass 1 — Pre-Implementation Architecture Review (`grok-4.7-high`)

### Proposed Decision

1. **Types & `coordBridge` Reuse (`marswalkTypes.ts`)**:
   - Re-export `SceneOrigin` and `UnifiedPoi` from `./coordBridge` (`import type` / `export type`), use `import type * as THREE from 'three'` so importing `marswalkTypes` never pulls Three.js into UI bundles, and define a structural `RouteRejectedPathInput` compatible with `RejectedPathOption` (`src/routing/searchTrace.ts` built in parallel).
   - Define `TerrainRingSpec`, `SitePoiRaw`, `MarswalkSiteData`, `OverlayLayerId = 'ortho' | 'slope' | 'minerals' | 'thermal'`, `MarswalkTerrainHandle`, `MarswalkPoisHandle`, and `MarswalkSkyHandle`.

2. **Single Ground Truth Heightfield & Performance (`marswalkTerrain.ts`)**:
   - Ground `heightAtSceneXZ(x, z)` inside bundle extent on full-resolution bilinear `bundle.elevation` (`sampleElevationBilinear`), and `slopeDegAtSceneXZ(x, z)` on physical un-exaggerated `bundle.slope`.
   - Proposed a decimated procedural mesh (~360x360) for `createProceduralTerrainFromBundle` and shader-based `uVertExag` scaling for `setVerticalExaggeration`.
   - Questioned how to unify bundle elevation with Jezero outer `.bin` rings cleanly without edge cliffs, Z-fighting, or `NO_ELEVATION` interpolation errors.

3. **NASA Clipmap Textures & `shiftM: [-180, 204]`**:
   - Fetch `'./sites/jezero-delta/site.json'` cleanly via `loadMarswalkSiteJson(signal)`.
   - Preserve `marswalk/pipeline/build_site.py`'s already-baked `shiftM: [-180, 204]` in `minerals.png` (keep `shiftM` purely as credit provenance metadata, never re-applied to runtime UVs or route math).
   - Keep `inner_nav.png` disabled (`uRouteOn = 0`, `uTrackOn = 0`, never fetched).
   - Verify Three.js r187 `flipY = false`, UV V-axis orientation with north-up assets and `z = -(north - origin.north)`, grayscale slope decode without `renderer` dependency, and `ShaderMaterial` tone mapping / color space encoding.

4. **Route & Rejected Overlays (`createRouteOverlaysGroup`)**:
   - Render `outbound` and `returnLeg` (`roundTrip` when `returnLeg !== null`) in solid blue without horizontal offset tricks, dimmed blue-slate meshes with `userData.candidateId` for raycast clicks, `LineDashedMaterial` + `computeLineDistances()` for `rejectedPaths` (`userData.rejectedId`), and guard `< 2`-point paths.

5. **Sky (`marswalkSky.ts`), POIs (`marswalkPois.ts`), Abort & Disposal**:
   - Port `marswalk/app/src/sky.js` (`MARS_HORIZON_COLOR`, `MARS_ZENITH_COLOR`, `makeMarsSky(scene)`) with camera-tracking `updatePosition` and idempotent `dispose`.
   - Render Point A (`Start` cyan/green), Point B (`Destination` amber/gold), and `UnifiedPoi[]` keyed strictly by `id` so `threeforks` and `poi-p5` stay distinct (~41.5 m apart), all English captions, `./sites/jezero-delta/photos/...` relative paths, jsdom-safe `getContext('2d') === null` fallback, zero `console.*`, `AbortSignal` checks after every async step, and full GPU resource disposal.

### Grok's Critique & Counter-suggestions (Pass 1)

Grok challenged the proposed design in 5 concrete areas:

1. **Heightfield Continuity & Missing-Data Return Contract**:
   - Returning `0` or clamping forever at the bundle rectangle edge creates a cliff against the 114 m inner-ring relief (`~3.6 m` drift after just 10 m at 20°). Inside the bundle, `heightAtSceneXZ` must return `(sampleElevationBilinear - datum) * verticalExaggeration` or `NaN` on `NO_ELEVATION` holes; strictly outside the bundle rectangle, fall back to loaded Jezero `.bin` `Heightfield` rings (`inner -> mid -> outer`), otherwise `NaN` (never `0` or absolute `-2500`).
   - Same for `slopeDegAtSceneXZ`: return `bundle.slope[cellIdx]` inside bundle bounds (never geometric exaggerated normals!), decoded ring slope (`byte * 0.5`) outside bundle bounds when loaded, otherwise `NaN`.
   - `datum` (`origin.elevation_m` / `h0`) must be identical on CPU and GPU shader (`uHRef`).

2. **One Unified Shader Heightfield Instead of Decimated/Competing Meshes**:
   - A centered `PlaneGeometry` or coarse 4 m procedural mesh clips feet/routes on HiRISE slopes and misplaces non-midpoint origins (`(586.81, 470.15)` vs bundle midpoint `(474.28, 500)`).
   - Instead: for `createProceduralTerrainFromBundle`, compute exact corner/cell coordinates via `(east - origin.east_m, -(north - origin.north_m))` (full 1:1 grid when `width * height <= 262144`, capped grid otherwise) with `uVertExag` + bounding-sphere refresh. When Jezero clipmap attaches, render ONE unified `N=64` clipmap hierarchy that samples a `RedFormat`/`FloatType`/`NearestFilter` copy of `bundle.elevation` (non-finite cells replaced by sentinel `< -1e5` only in the GPU copy) inside the bundle rectangle using exact cell spacing (`fc = (east - west) / cellEast - 0.5`, `fr = (northExtent - north) / cellNorth - 0.5` — never `(p + half)/res` which shifts/scales by ~5% because `cellEast = 0.948567 m`), blends over an ~8 m skirt at the bundle perimeter into `inner_h`/`mid_h`/`outer_h`, and uses `uVertExag` on the GPU. Remove/dispose the procedural child mesh once clipmap succeeds so there is zero Z-fighting.

3. **Three.js r187 Texture Flip Sign, Color Pipeline, & `shiftM`**:
   - **Critical UV sign correction**: With `flipY = false` on north-up `ortho` / `slope` / `minerals` / `thermal` assets, `v = 0` is **North**. Because scene `z = -(north - origin.north)`, `p.y = zVr` has North negative and South positive, so `u = (xVr + half) / (2 * half)` and `v = (zVr + half) / (2 * half)` (negating `zVr` would flip north–south!).
   - **`shiftM: [-180, 204]`**: Confirmed baked into `minerals.png` pixels during `build_site.py`. Do NOT re-apply to UVs; expose strictly in provenance metadata/credit strings, and anchor Jezero clipmaps strictly when Jezero VR alignment applies (`isJezeroHiriseBundle(bundle)` or shifted into Jezero VR frame).
   - **Three.js r187 shader output & data textures**: Set `toneMapped = false` on terrain and sky `ShaderMaterial`s and terminate fragment shaders with `#include <colorspace_fragment>` so display colors match without ACES crush or double encoding. Keep `ortho`, `minerals`, `thermal`, `slope`, and float height textures at `NoColorSpace`; convert grayscale `slope.png` bitmaps safely to single-channel `Uint8Array` `RedFormat`/`UnsignedByteType` `DataTexture` (skipping `renderer.getContext()` dependency and guarding WebGL/DOM availability cleanly). Keep POI `CanvasTexture`s at `flipY = true`.

4. **Route Ribbons, Return Leg Stacking, & Sub-cell Drape**:
   - Selected `outbound` solid `#38bdf8` (`+0.35` scene m) and `returnLeg` solid `#6366f1` (`+0.50` scene m vertically, **zero horizontal offset**, only when `returnLeg !== null`).
   - Non-selected candidates use translucent `#64748b` ribbon meshes (`userData.candidateId`, `depthWrite: false`) instead of 1 px `LineBasicMaterial` so `Raycaster` clicks work reliably; subdivide long segments (> ~4 m on coarse grids) when draping onto `heightAtSceneXZ`; guard `path.length < 2`; `rejectedPaths` use `LineDashedMaterial` + explicit `computeLineDistances()` + `userData.rejectedId` (plus invisible pick ribbon with `userData.rejectedId`).

5. **Async Abort, POI Separation, & Disposal**:
   - Build clipmap textures off-scene and attach to `handle.group` only after all awaits succeed; check `signal?.aborted` and internal `disposed` state between every async step (`fetch`, `arrayBuffer`, `createImageBitmap`, `Image.onload`); close `ImageBitmap` immediately after upload; track and dispose every `BufferGeometry`, `Material`, `ShaderMaterial`, and `Texture` on abort or `.dispose()`.
   - Key POIs strictly by `id` (`threeforks` distinct from `poi-p5`), ignore `site.pois` Italian text, keep shared POI beacon geometry tracked and disposed cleanly, and move the sky sphere (`updatePosition(cameraPos)`) with the camera so outer 14 km rings never clip outside the 1000 m sky dome.

### Adopted Refinements Before Implementation

All five sets of Grok Pass 1 refinements were adopted cleanly into the implementation design below prior to Pass 2 exam checking.

---

## Pass 2 — Exam Checker Review on Written Code (`grok-4.7-high`)

### Adversarial Audit Findings

Auditing the actual written `marswalkTypes.ts`, `marswalkSky.ts`, `marswalkTerrain.ts`, and `marswalkPois.ts` caught 11 concrete issues (10 verified code bugs + 1 Three.js r187 `ShaderMaterial` clarification):

1. **Clipmap GLSL ES 3.00 vs Three.js r187 `ShaderMaterial` + Safe Compile Swap**:
   - Grok flagged ES 3.00 calls (`out`, `texelFetch`, `textureLod`, `textureGrad`) and premature procedural-mesh disposal inside `installClipmap`.
   - Direct verification against `node_modules/three/build/three.module.js` (v0.187.0) showed Three r187 unconditionally compiles `ShaderMaterial` with `#version 300 es` and ONLY injects `#define varying out/in` + `layout(location = 0) out highp vec4 pc_fragColor; #define gl_FragColor pc_fragColor` when `glslVersion` is default (omitted); setting `glslVersion: THREE.GLSL3` would disable `gl_FragColor` and break `#include <colorspace_fragment>`. Keeping default `glslVersion` enables ES 3.00 cleanly, while changing `uniform ivec2 uBundleDim` to `uniform vec2 uBundleDim` aligns GLSL uniform types with `THREE.Vector2`. Additionally, `installClipmap` now runs `renderer.compile` on a temporary `Scene` + `PerspectiveCamera` when `options.renderer` is supplied BEFORE removing/disposing `proceduralMesh`.

2. **Bundle `NO_ELEVATION` Holes**:
   - Previously `CLIPMAP_VERT` fell back to `hRing` when `sampleBundleBilinear` failed inside the bundle rectangle, making the GPU surface disagree with CPU `heightAtSceneXZ` (`NaN`).
   - Fixed: `CLIPMAP_FRAG` now executes `discard;` whenever `vBundleMissing > 0.5`, keeping `NO_ELEVATION` holes empty on GPU and `NaN` on CPU.

3. **Outer 8 m Skirt Sync & Clipmap Outer Boundary Discard**:
   - Previously `heightAtSceneXZ` jumped directly to raw ring height outside the bundle while the vertex shader smoothly interpolated over `SKIRT_BLEND_M = 8` m, and fragments past `outerRing.half` clamped indefinitely.
   - Fixed: `heightAtSceneXZ` mirrors the exact `smoothstep(0, 8, dOut)` blend across `[0, 8)` m outside the bundle edge, `CLIPMAP_FRAG` executes `discard;` when `max(abs(p.x), abs(p.y)) > uRing2.x`, and clipmap level count scales dynamically (`nHalf * (1 << (levels - 1)) >= outerRing.half`).

4. **Procedural Mesh `NO_ELEVATION` Walls, Missing Slope Handling, & Fallback Admissible/Steep Symbology**:
   - Fixed `createProceduralTerrainFromBundle` to scan underlying neighborhood cells when downsampling > 512×512 grids, guard `undefined` quality/exclusion reads strictly, **omit triangle indices** for any quad with an invalid corner (eliminating boundary cliff walls down to `Y = 0`), encode non-finite `bundle.slope` as `-1` (`hasSlope = false` neutral gray in clipmap & procedural slope view rather than falling back to `uS0`), and render subtle admissible/steep (`> 20°`) & exclusion (`UNSUPPORTED_DERIVATIVE` / `OUTSIDE_EXTENT` / `MANUAL`) stripes in procedural `ortho` mode.

5. **Zero Per-Frame Allocation in `updateLod`**:
   - Replaced per-call `new Map` + object literals in `updateLod` with pre-allocated `Float64Array` buffers (`prevCx`, `prevCz`, `prevHalf`) on `ClipmapResources`.

6. **WebGL2 Probe Context Release**:
   - `canUseWebgl2Clipmaps` now immediately invokes `gl.getExtension('WEBGL_lose_context')?.loseContext()` before returning so repeated terrain builds never exhaust browser WebGL contexts.

7. **`unpackAlignment = 1` & Slope/Overlay Canvas Cap (`<= 2048`)**:
   - Added `texture.unpackAlignment = 1` on `Uint8Array` `RedFormat` slope `DataTexture`s (`1601`, `901`, `721` are non-multiples of 4!) and capped decoded slope/overlay canvases to `<= 2048` with `CpuSlopeGrid.width/height` matching the reduced dimensions.

8. **POI Exaggeration Clamping Parity**:
   - Added matching `[0.25, 10.0]` clamping (`non-finite -> 1`) to `createMarswalkPois` and `marswalkPois.setVerticalExaggeration`.

9. **Route Ribbons Exaggeration Updates & Degenerate Guards**:
   - Added `RouteOverlaysGroup.setVerticalExaggeration(exaggeration)` updating draped vertex Y coordinates, bounding spheres, and `Line.computeLineDistances()` in place; skipped zero-length (`dist < 1e-4`) segments; and added finite-endpoint elevation blending (`interpolateFiniteElevation`) so non-finite route Z inputs cannot produce `NaN` vertices.

10. **Sky Dome Camera World Position & Far-Plane Scaling**:
    - Updated `MarswalkSkyHandle.updatePosition(cameraOrPos)` to accept `THREE.Camera | THREE.Vector3`, extract camera world position via `getWorldPosition`, and scale dome radius safely inside `[near, far]` (`far * 0.5`).

11. **Dead Uniform Cleanup**:
    - Removed unused `uElevRange` and bound `uFogColor` directly inside `CLIPMAP_FRAG`.

### Final Refined Decision

All 11 Pass 2 Exam Checker findings are implemented and verified across `src/terrain3d/marswalkTypes.ts`, `src/terrain3d/marswalkSky.ts`, `src/terrain3d/marswalkTerrain.ts`, and `src/terrain3d/marswalkPois.ts`:
- Single source-of-truth heightfield grounded on `bundle.elevation` (`coordBridge.sampleElevationBilinear`) inside bundle bounds (`NaN` on missing cells both CPU and GPU), seamlessly skirt-blended (`8` m) into optional NASA Jezero `.bin` rings outside bundle bounds up to `outerRing.half`, with physical un-exaggerated `bundle.slope` degrees (`slopeDegAtSceneXZ`).
- `inner_nav.png` completely disabled and never fetched; `shiftM: [-180, 204]` preserved solely as English credit provenance metadata (not re-applied to already-baked `minerals.png` UVs); `flipY = false` + `v = (p.y + half)/(2*half)` north-up alignment; WebGL2 `RedFormat` `unpackAlignment = 1`; capped `<= 2048` canvases.
- Solid glowing blue selected `outbound` + `returnLeg` (`roundTrip` when non-null, zero horizontal offset), clickable alternative candidates (`userData.candidateId`), dashed `rejectedPaths` (`LineDashedMaterial` + `computeLineDistances()` + `userData.rejectedId` + invisible pick collider), dynamic `setVerticalExaggeration`, distinct `threeforks` vs `poi-p5` English POIs with `./sites/jezero-delta/photos/...`, jsdom-safe canvas guards, `AbortSignal` checks, complete `.dispose()`, and zero `console.*`.

