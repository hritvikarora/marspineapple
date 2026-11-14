# MARS PATHFINDER — Interface Note (contract v1, DRAFT for the Initial Contract Gate)

Owner: **Role C (integration)**. Source of truth = TypeScript in `src/contracts/`. This note explains
it with examples. Propose changes to Role C; every change updates the types, this note, the examples in
`docs/examples/`, the fixture and all consumers in one commit.

## 1. Coordinates (frozen)

| Rule | Value |
|---|---|
| Frame | Local planar metres: `east_m` (+east), `north_m` (+north). **No `x`/`y`/`lat`/`lng` in shared contracts.** |
| Grid | north-up, row-major. **Row 0 = north edge, col 0 = west edge.** `index = row * width + col` |
| Samples | cell **centres**: `east_m = extent.west_m + (col+0.5)*cellSizeEast_m`, `north_m = extent.north_m - (row+0.5)*cellSizeNorth_m` |
| Cells | may be rectangular (`cellSizeEast_m` ≠ `cellSizeNorth_m`). Never assume 5 m or square. |
| Extent | outer cell *edges*. A point exactly on the east/south edge is outside. |
| Elevation | metres vs `crs.verticalReference`. **Negative values are valid.** Missing = `NaN`. |
| 3D (Role B) | `X = east_m`, `Y = elevation_m`, `Z = -north_m` (`toSceneXYZ`). Display origin shifts and vertical exaggeration are visual only. |
| Helpers | `cellCenter`, `pointToCell`, `cellIndex`, `cellRef`, `toSceneXYZ` in `src/contracts/grid.ts`. Use them; don't write your own. |

## 2. Region bundle (`public/bundles/<bundleId>/`)

`manifest.json` (`RegionManifest`) + one raw little-endian binary file per layer:

| Layer | dtype | units | missing | meaning |
|---|---|---|---|---|
| `elevation` | float32 | m | NaN | sampled height |
| `slope` | float32 | deg | NaN = unsupported neighbourhood | terrain slope (method in `definition`) |
| `roughness` | float32 | m | NaN | detrended residual proxy (neighbourhood in `definition`) |
| `quality` | uint8 | class-code | 0 | `0` no elevation, `1` documented good, `2` documented low, `3` unknown |
| `exclusion` | uint8 | class-code | – | `0` none, `1` missing elevation, `2` unsupported derivative, `3` outside extent, `4` manual (documented) |

Every layer descriptor carries `file` (plain relative name), `dtype`, `byteOrder`, `units`, `byteLength`,
`sha256`, `nodata`, `definition`. Slope **limits** are NOT baked into `exclusion`; they belong to the
route model profile (Ayush). Original source quality categories are kept in `qualityClasses[].sourceCategories`.
`strictQualitySupported: false` ⇒ the UI must disable strict mode and the worker returns
`invalid-input / strict-quality-unsupported`.

Load-time validation (`loadAndValidateBundle`) fails with a typed `BundleLoadError.stage`:
`fetch-manifest | parse-manifest | version | schema | fetch-raster | byte-length | dimensions | hash`.
`hash` is checked with SubtleCrypto SHA-256 when available (`https` or `localhost`); otherwise
`hashesVerified: false`. Offline CLI: `npm run validate-bundle -- public/bundles/<dir>`.

See `public/bundles/synthetic-v0/manifest.json` for a complete example and `INSPECT.txt` for the arrays.

## 3. Versions and the release identifier

* `bundleVersion` — changes whenever **any** analytical byte changes. Echoed in every request, response and export.
* `modelVersion` — solver + profile + default weights. The worker rejects a request for another model (`model-mismatch`).
* `appVersion` — `package.json` version.
* Release id shown in the header and embedded in exports: `app <appVersion> · bundle <bundleVersion> · model <modelVersion>`.
* Manifest `schemaVersion` major must be `1` (else load fails at stage `version`).

## 4. RouteRequest (`docs/examples/route-request.json`)

```json
{
  "requestId": "req-1-abc123",
  "bundleVersion": "synthetic-v0.1.0",
  "modelVersion": "placeholder-astar-0.1.0",
  "start": { "east_m": 25, "north_m": 65 },
  "destination": { "east_m": 175, "north_m": 65 },
  "policies": ["shortest-feasible", "uncertainty-aware"],
  "strictQuality": false,
  "roundTrip": false
}
```

Optional: `weightOverrides: { "<policy>": { "slope": n, "roughness": n, "quality": n } }`, `timeoutMs`.
Policies: `shortest-feasible | terrain-aware | uncertainty-aware`; all share the same baseline exclusions.
`strictQuality` = **exclusion** of non-acceptable quality cells (distinct from the uncertainty-aware *preference*).

## 5. RouteResponse — discriminated on `status`

Every message carries `requestId`, `bundleVersion`, `modelVersion`.

| status | ends request | key fields | UI meaning |
|---|---|---|---|
| `progress` | no | `phase`, `exploredNodes` | activity only; no fake percentage |
| `success` | yes | `start`, `destination` (`EndpointResolution`), `candidates[]`, `computeMs` | show candidates |
| `no-path` | yes | `reason: disconnected-under-limits \| strict-quality-disconnects \| unknown`, `message`, endpoints | informative result, not an error |
| `invalid-input` | yes | `reason`, `field`, `message` | fix input (outside region, excluded endpoint, version mismatch…) |
| `cancelled` | yes | – | user/app cancelled or superseded |
| `timeout` | yes | `limitMs`, `message` | **not** proof that no path exists; offer retry |
| `data-error` | yes | `stage: bundle \| reconstruction \| worker-crash \| internal`, `message` | broken data/engine |

`EndpointResolution = { requested, cell: {row,col,index}, accepted }` — `accepted` is the cell centre actually used.

`RouteCandidate = { candidateId, policies[], outbound: RouteLeg, returnLeg: RouteLeg|null, missionStatus, explanation[] }`.
Identical cell paths are **deduplicated**; `policies` lists every policy that produced it.
`missionStatus`: `one-way | round-trip-complete | round-trip-incomplete` (outbound OK, return failed — never present as complete).

`RouteLeg = { cells[], path[{east_m,north_m,elevation_m}], metrics, qualityIntervals[], profile, weightedCost }`.

`RouteMetrics` (units in the name): `horizontalDistance_m` (primary displayed distance — to confirm with Dhani),
`surfaceDistance_m`, `ascent_m`, `descent_m`, `maxTerrainSlope_deg` (neighbourhood slope under the path),
`maxAbsEdgeGrade_deg` (rise along an edge), `lowQualityLength_m`, `lowQualityPct`, `unknownQualityLength_m`,
`unknownQualityPct` (percentages: **denominator = horizontalDistance_m**, 0 for zero-length), `cellCount`.
Edge quality = the worse of its two cells (conservative). `weightedCost.value` is **not comparable across policies**.

### success (abridged from `docs/examples/route-response.success.json`)

```json
{
  "status": "success",
  "requestId": "req-1-abc123",
  "bundleVersion": "synthetic-v0.1.0",
  "modelVersion": "placeholder-astar-0.1.0",
  "computeMs": 0,
  "start": { "requested": { "east_m": 25, "north_m": 65 }, "cell": { "row": 5, "col": 2, "index": 102 }, "accepted": { "east_m": 25, "north_m": 65 } },
  "destination": { "requested": { "east_m": 175, "north_m": 65 }, "cell": { "row": 5, "col": 17, "index": 117 }, "accepted": { "east_m": 175, "north_m": 65 } },
  "candidates": [
    {
      "candidateId": "c0",
      "policies": ["shortest-feasible"],
      "missionStatus": "one-way",
      "returnLeg": null,
      "explanation": ["Placeholder solver: limits and weights are unvalidated demo values."],
      "outbound": {
        "cells": [102, 103, 104, 105, 86, 67, 48, 49, 50, 51, 52, 73, 94, 95, 96, 117],
        "path": [{ "east_m": 25, "north_m": 65, "elevation_m": -2600.5 }, "… one vertex per cell …"],
        "metrics": {
          "horizontalDistance_m": 174.85, "surfaceDistance_m": 175.57, "ascent_m": 15, "descent_m": 0,
          "maxTerrainSlope_deg": 8.05, "maxAbsEdgeGrade_deg": 6.05,
          "lowQualityLength_m": 0, "lowQualityPct": 0, "unknownQualityLength_m": 82.43, "unknownQualityPct": 47.14,
          "cellCount": 16
        },
        "qualityIntervals": [{ "fromDistance_m": 0, "toDistance_m": 58.28, "quality": 1 }, { "fromDistance_m": 58.28, "toDistance_m": 140.71, "quality": 3 }, { "fromDistance_m": 140.71, "toDistance_m": 174.85, "quality": 1 }],
        "profile": { "distance_m": [0, 10, "…"], "elevation_m": [-2600.5, -2599.5, "…"], "pathIndex": [0, 1, "…"] },
        "weightedCost": { "value": 174.85, "units": "weighted-cost" }
      }
    },
    { "candidateId": "c1", "policies": ["uncertainty-aware"], "…": "206.57 m, 0 m unknown quality" }
  ]
}
```

### no-path (`docs/examples/route-response.no-path.json`)

```json
{
  "status": "no-path",
  "requestId": "req-2-def456",
  "bundleVersion": "synthetic-v0.1.0",
  "modelVersion": "placeholder-astar-0.1.0",
  "reason": "disconnected-under-limits",
  "message": "Destination is not connected to the start under the current terrain limits.",
  "policies": ["shortest-feasible", "uncertainty-aware"],
  "start": { "requested": { "east_m": 25, "north_m": 65 }, "cell": { "row": 5, "col": 2, "index": 102 }, "accepted": { "east_m": 25, "north_m": 65 } },
  "destination": { "requested": { "east_m": 175, "north_m": 15 }, "cell": { "row": 10, "col": 17, "index": 217 }, "accepted": { "east_m": 175, "north_m": 15 } }
}
```

### errors

```json
{ "status": "invalid-input", "requestId": "req-3-ghi789", "bundleVersion": "synthetic-v0.1.0", "modelVersion": "placeholder-astar-0.1.0",
  "reason": "endpoint-quality-excluded", "field": "destination",
  "message": "destination cell is outside the acceptable quality set in strict mode." }

{ "status": "timeout", "requestId": "req-4", "bundleVersion": "synthetic-v0.1.0", "modelVersion": "placeholder-astar-0.1.0",
  "limitMs": 20000, "message": "Route calculation exceeded the time limit. This is not proof that no path exists." }

{ "status": "data-error", "requestId": "req-5", "bundleVersion": "synthetic-v0.1.0", "modelVersion": "placeholder-astar-0.1.0",
  "stage": "worker-crash", "message": "Routing worker crashed." }

{ "status": "cancelled", "requestId": "req-6", "bundleVersion": "synthetic-v0.1.0", "modelVersion": "placeholder-astar-0.1.0" }
```

`invalid-input.reason` ∈ `version-mismatch | model-mismatch | bundle-not-loaded | endpoint-outside-region |
endpoint-excluded | endpoint-quality-excluded | no-policies | strict-quality-unsupported | malformed`.

## 6. Worker lifecycle (`src/worker/client.ts`) — UI never sees `postMessage`

* Raw protocol (`src/contracts/worker-protocol.ts`): main→worker `load-bundle | route | cancel`; worker→main `ready | bundle-loaded | bundle-error | route-response`.
* **Stale guard (two layers):** the client drops any message whose `requestId` or `bundleVersion` ≠ the active request; the store reducer ignores `route/update` for anything but `activeRequestId` + loaded `bundleVersion`.
* **One active request.** A new request supersedes the old one (old resolves `cancelled`).
* **Cancel / timeout / supersede terminate and restart the worker** (re-sending the bundle), because a synchronous search loop cannot read a queued `cancel`. A solver that yields cooperatively may also honour `cancel` messages.
* **Buffer ownership:** main-thread `GridBundle` arrays are immutable and **never transferred**. The client posts `slice()` copies and transfers the copies. Map, 3D and worker can never see a detached buffer. Nobody mutates bundle arrays in place.

## 7. State invalidation (`src/state/store.ts`)

| Invalidates the route (marks `isStale`, detaches in-flight request) | Does NOT invalidate |
|---|---|
| start / destination change | layer visibility / opacity |
| policy set or weight change | camera orbit / zoom |
| strict-quality toggle | panel expansion |
| round-trip toggle | 2D / 3D toggle |
| model version / profile change | candidate selection |
| region (bundle) version change — also **clears** candidates and endpoints | |

Stale candidates are kept for labelled comparison (dashed on the map) until a new result arrives.

## 8. Export (`src/export/serialize.ts`)

`mars-pathfinder/route-export@1`: sorted keys, 2-space indent, trailing newline, `NaN/Infinity → null`, no timestamp
unless explicitly passed, no URLs or local paths (asserted). Contains release id, region/bundle identity and sources,
request settings, accepted endpoints, all candidates (metrics, path, quality intervals, cost), selected candidate,
units and limitations. Filename: `mars-pathfinder_<bundleVersion>_<modelVersion>_<candidateId>.json`.

## 9. Open decisions — need team agreement

1. **Quality codes** `0/1/2/3` and exclusion codes `0–4` (Role A + Ayush).
2. **Primary displayed distance** = `horizontalDistance_m`? (Dhani + Ayush).
3. **Grade unit**: degrees (`maxAbsEdgeGrade_deg`) vs percent (Ayush + Dhani).
4. **Edge quality rule**: worse of the two endpoint cells (Ayush).
5. **Raster format**: raw little-endian `.f32`/`.u8` per layer (Role A). No GeoTIFF in the browser.
6. **Round trip**: computed per policy as a second leg; failed return ⇒ `round-trip-incomplete` (Ayush + Dhani).
7. **Strict mode unsupported** ⇒ disabled control + `strict-quality-unsupported` (Dhani + Role A).
8. **Cancellation model**: terminate/restart (current) vs cooperative chunks (Ayush may add).
9. **Timing estimates** are not in v1 metrics; add `estimatedDuration_s` + `assumedSpeed_m_s` only if the team wants them.
10. **Display assets / textures** (`displayAssets[]`, optional, lazy-loaded) — fields to finalise with Role A + Role B.
