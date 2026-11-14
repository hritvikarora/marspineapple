The design soft-locks the walker, then gives Respawn nothing to correct. `checkCorridorSafety` already applies cell slope, exclusion, and corridor distance. The extra `slopeDegAtSceneXZ` test, the gated demo step, and a single nearest-point progress value fight that function and the round-trip rules.

## 1. The gate cannot be recovered from

`checkCorridorSafety` returns `isOffPath: false` when `activePath.length === 0`, on purpose, so an empty route does not trap the player. Slope is applied only after that early return, and only to `bundle.slope[cell]`.

The proposed predicate is `safety.isOffPath || (finite(slopeDeg) && slopeDeg > 20)`. That second term still runs when the path is empty. A 21° cell, or an outer-ring slope outside the bundle, rejects the step, calls `exitPointerLock`, and stores `nearestSafePoint: null` (the empty-path result). `[R]` then has no target. Pointer lock is already gone, so there is no walk back.

With a live path the same predicate still cannot be walked out of. Spawn at Point A, a `selectedCandidateId` change, or a bundle swap can leave the feet outside the new corridor. Every proposed cell is also outside, so every step is discarded. The only exit is `respawnToSafePoint()`. `nearestSafePoint` is the closest polyline sample, including when the reason is `excluded-cell` or `steep-slope`. It is not a cell that passed the gate. If that sample’s height is `NaN`, or the cell still fails, Respawn plants you on another blocked pose.

`stepOffPathForDemo` is listed inside the same pre-step gate. A rejected demo step never leaves the corridor, so the off-path alert and Respawn have no reachable state. §5 and the 2.5D fallback both require an off-path pose and a Respawn from it. The demo step and Respawn have to bypass the gate. Normal walking should reject only a safe-to-unsafe transition. A pose that is already unsafe has to keep moving toward `nearestSafePoint`, or all locomotion stays latched until Respawn.

Rejecting the whole `(dx, dz)` also freezes legal slides along the boundary. Holding W+D into the corridor edge cancels the along-path component too.

Count `offPathCount` only on a user attempt that newly becomes blocked. Do not count the frame a rebind moves the corridor out from under the player, and do not count a demo step. A rising-edge boolean chatters if the feet sit on a cell boundary; require a short time or distance hysteresis. Clear `blocked` when the current cell passes. After a rejected step the feet are still in a legal cell, so the alert text has to say the step was refused. `distance_m` should be `deviation_m`. When the external slope test is the only failure, `safety.reason` is still `null`, and the HUD has no cause to show.

## 2. Slope is being applied twice, and the two slopes are not the same

`CorridorCheckOptions` is exactly `{ maxCorridorDeviation_m, maxSlope_deg, routeBundleVersion }`. There is no `terrainSlopeDeg` because the function already reads `bundle.slope[index]` and compares it with `maxSlope_deg` (default `DEFAULT_MAX_SLOPE_DEG`, 20). Passing `maxSlope_deg: 20` is the default.

`slopeDegAtSceneXZ` is a second sampler: unexaggerated, from `bundle.slope` inside the bundle and from outer-ring rasters outside it, or `NaN`. Inside the bundle it can still disagree at a cell the polyline waiver would have allowed. Outside it, with no route, it blocks where the corridor function would not. It can also refuse the destination cell, so `checkArrivalAtDestination` never goes true.

Use `safety.isOffPath` and `safety.reason` as the only gate. Show `safety.cellSlope_deg` as the slope that caused `steep-slope`. Keep `slopeDegAtSceneXZ` as a display sample, and keep it out of the predicate.

`sceneXYZToLocal` throws `RangeError` when `verticalExaggeration` is `0` or non-finite. Calling it from the walk loop with `terrain.verticalExaggeration` kills the frame loop the moment exaggeration is cleared. Horizontal conversion does not use exaggeration:

`east_m = x + origin.east_m`, `north_m = origin.north_m - z`.

Use that for the gate. Call `sceneXYZToLocal` only for elevation, and only when exaggeration is finite and non-zero. Do not hardcode `(586.81, 470.15)`. `terrain.origin` is the frame; `localToVr2` is gone and the Jezero offset is legal only for `isJezeroHiriseBundle`.

## 3. Exaggeration, gravity, and NaN do not share a Y axis

`heightAtSceneXZ` returns scene Y: `(elevation - h0) * verticalExaggeration`. `slopeDegAtSceneXZ` is physical degrees. `h0` is defined to match `origin.elevation_m`.

The original teleport arc compares `y - 0.5 * 3.71 * t²` with ground Y. That ground was unexaggerated. Against exaggerated `heightAtSceneXZ`, the landing point moves whenever exaggeration is not 1. Run the ballistic intersection in physical meters and multiply the drawn arc by exaggeration, or use `g_scene = 3.71 * verticalExaggeration` for the visual arc only. `NaN` ground must count as a miss. `y <= NaN` is false, so the arc never lands and the marker stays live.

`height ?? lastY` does not replace `NaN`. Only `Number.isFinite` does. A non-finite sample has to keep the last finite rig Y. Falling back to `0` drops the rig to the datum.

Ground the rig (feet) on `heightAtSceneXZ`. Keep the eye at a fixed local `EYE_HEIGHT` (the original camera is at local `y = 1.7`). Writing scene height into `camera.position.y` puts the eyes in the mesh. Feeding the eye’s world Y through `sceneXYZToLocal` reports elevation high by `1.7 / exaggeration`.

Physical elevation for the arm is `origin.elevation_m + heightAtSceneXZ(x, z) / verticalExaggeration`. Scene Y labeled as meters is wrong as soon as exaggeration changes.

`setVerticalExaggeration` on the player must not cache a second copy. Sample `terrain.verticalExaggeration` after `terrain.setVerticalExaggeration`, then `syncGroundY()`, then move POI beacons and rebake crumb Y. The inverse order leaves the feet on the old surface for a frame. `syncGroundY` during a zero exaggeration has to no-op rather than throw.

Tobler time has the same unit bug if it ports `mission.js` `move()`: `dh` taken from `heightAtSceneXZ` is already exaggerated, so grade, speed, and climb scale with the slider. Grade has to come from `cellSlope_deg` or from scene-ΔY divided by exaggeration. Do not add an edge-grade test on raw scene ΔY. At exaggeration above 1, short steps on ordinary relief fail a 20° grade test the solver never used. The corridor helper’s own comment says it is weaker than the solver’s `|dz| / length <= tan(20°)` check. The player gate should stay on that helper.

## 4. Round trip, stale routes, and arrival

`setRouteContext` is described as rebinding `selectedCandidateId`, `activePathCells`, and `roundTrip`. The gate also needs the polyline, and the mission needs `returnLeg`. Those can update on different frames.

`routeBundleVersion` mismatch ignores `activePathCells` and still applies deviation against whatever polyline you passed. A path from the previous bundle becomes a ghost corridor and soft-locks free roam. On bundle mismatch, pass an empty path so the helper takes the non-blocking early return. Clear that path on `mission/reset` as well.

When `roundTrip` is on and `returnLeg` is non-empty, the walkable cell set is the union of both legs. Gating on outbound only makes the walk back `corridor-deviation`. An empty array is not a usable return leg: treat it like `null`. AGENTS.md forbids a finished round-trip time when the return leg is missing. The snapshot needs an explicit return state (`absent`, `unavailable`, `active`) because `arrivedAtDestination` cannot mean both “reached B” and “mission complete”.

`findNearestPointOnPath(...).progressFraction` is the nearest point on one polyline. On a there-and-back route the outbound and return legs share the same corridor, so the nearest sample jumps between legs and progress runs backward. Track the leg in a small state machine: outbound until arrival at B, then the return leg toward A. Concatenate only for drawing. Reset that machine when `selectedCandidateId` changes. Do not reset visited POIs and `startedAtMs` on a round-trip toggle alone. Do clear visited ids on a bundle change so `setVisited` is not handed ids from the previous site.

Arrival has to use the store destination in local meters, with `defaultArrivalRadiusForGrid`, and it has to be latched. Checking Point B every frame clears `arrivedAtDestination` as soon as the return leg leaves the radius, so the debrief flickers. On the return leg the target is A. A null or non-finite destination must stay `arrived: false` without displaying `Infinity`.

`startedAtMs = Date.now()` is wall time. Tobler time is `distance / v(grade)`. Integrate elapsed time from accepted horizontal displacement and physical grade. A teleport must not be one frame of enormous speed. Standing still, a rejected step, and a hidden tab must not advance EVA time. Level-ground speed has to equal the stated `0.7 m/s`. The original `speed()` divisor uses `exp(-k * offset)` rather than the level-ground absolute value, so `v(0)` is not `flatSpeed` when `toblerOffset` is `-0.05`. Remaining time should sample grade along the remaining leg. The current cell’s slope applied to the whole remainder is a different number, and it should be labeled that way if you show it.

Sprint at the original `14 m/s` with an uncapped `dt` steps several HiRISE cells in one frame and can cross an excluded cell between two legal samples. Cap `dt` and subdivide the step to a fraction of `cellSize`. The endpoint-only test is what §5 asks for, and it is also how tunneling happens.

## 5. Coordinate frames on Respawn, POIs, and the arm

`nearestSafePoint` is a `LocalPoint3`. `placeAt` has to go through `localToSceneXYZ(..., terrain.origin, exaggeration)` and then replace Y with finite `heightAtSceneXZ`. Writing `east_m` into `rig.position.x` on Jezero offsets the player by about 587 m. Convert at Respawn time, not at block time, so a later exaggeration change does not replay a stale scene Y.

Match the original `placeAt`: shift the rig so the head/feet XZ land on the target. In XR the head is not the rig origin. Gate the same XZ you pass to `heightAtSceneXZ`. Collision on the rig while the headset is offset leaves the head outside the corridor.

`findNearestPoi(sceneX, sceneZ, maxDistance_m)` takes scene meters. Passing `east_m` / `north_m` misses by the frame origin. The original `pos.z + poi.y` formula is the VR `y → -z` mapping and will double-apply if you also use `sceneXYZToLocal`.

Call `setVisited` only when membership changes, and only while the handle is non-null. `TerrainView` can dispose POIs before `resetMission`. A mission that calls `findNearestPoi` on a disposed handle, or that marks visited with no `maxDistance_m`, will flag the nearest site POI at spawn even when it is hundreds of meters away. The original proximity was 9 m. Keep mission progress in plain data (`UnifiedPoi[]` plus a distance), and let the view push `setVisited`, so a headless fallback can run the same rules.

`getSnapshot().nearbyRejected` should be `DottedProximityHit | null` (`rejectedId`, `label`, `reason`, `distance_m`, `closestPoint`). `{ hit, label, reason }` drops the id and the distance the dotted-path tooltip needs. Default proximity is 18 m. On 20 m CTX that is less than one cell, so a person standing on a rejected path gets `null`. Pass `defaultCorridorThresholdForGrid` there. Clear `nearbyRejected` and `nearbyPoi` when the helper returns `null`. Leaving the last object in place keeps a stale warning after you walk away.

Shared-prefix rejected routes fire this hit while you are still inside the legal corridor. That snapshot field is a proximity warning. It must not set `blocked`.

## 6. Listeners, pointer lock, and jsdom

§3.4C requires `dispose()` to remove `keydown`, `keyup`, `pointerdown`, `pointermove`, `pointerup`, `wheel`, and `pointerlockchange`. The original `player.js` registers anonymous `click`, `mousemove`, `keydown`, and `keyup` listeners, plus XR `connected`, `disconnected`, `sessionstart`, and `sessionend`. Those anonymous functions cannot be removed. A second mount of the view stacks another set, and yaw and `[R]` fire twice.

`[R]` and `[I]` need `{ capture: true }` handlers with stored refs, removed in `dispose`. Ignore `event.repeat`, modifier keys, and targets that are `input`, `textarea`, `select`, or `contentEditable`. `Ctrl+R` and `Meta+R` have to reach the browser. Respawn on key-repeat teleports every repeat interval.

Exit pointer lock once per blocked latch, not on every animation frame while W is held. `exitPointerLock()` returns a promise that rejects without a user gesture; catch it. `pointerlockchange` and `blur` / `visibilitychange` have to clear `keys`. Otherwise alt-tab while W is down keeps integrating, hits the corridor, and exits lock.

Click-to-lock has to bind the canvas, not the wrapper that also holds the §5 Respawn / off-path buttons and the fallback slider. A click on those controls must not request pointer lock.

`MarswalkPlayer`’s constructor in `player.js` calls `renderer.xr.getController` and builds the arc and marker immediately. The jsdom fallback and the unit tests need `moveRelativeStep`, `stepOffPathForDemo`, and `respawnToSafePoint` without a live `WebGLRenderer`. Put the corridor decision in a pure function the fallback can call. Construct the rig, the arc, and the XR session only after `TerrainView` already has a real WebGL context.

`moveRelativeStep(dx, dz)` has to name its frame. Scene Z is `-north`. A test that passes “5 m north” as `dz` walks south. `stepOffPathForDemo` has to move farther than `defaultCorridorThresholdForGrid` (6 m on HiRISE, 30 m on CTX) on a perpendicular to the active leg. A fixed 5 m step never leaves a CTX corridor. A fixed 40 m step on HiRISE leaves the extent and becomes `excluded-cell` with a `NaN` height. With an empty path the helper will not block, so the demo has to report that instead of pretending the alert fired.

Module-level `v1`, `v2`, and `q1` in `player.js` are shared mutable scratch. Two rigs in tests will corrupt each other’s aim and head position. Keep scratch vectors on the instance.

The crumb trail needs `frustumCulled = false` or a recomputed bounding sphere. A line built empty is culled for the rest of the session. `setDrawRange` does not retire old points; reset the cursor and the range when the candidate changes. Rebake Y on exaggeration changes. Dispose geometry and material, and remove the line from its parent. Push a crumb only after the step is accepted.

Orbit mode is still required by §3.4C (`pointerdown` / `pointermove` / `pointerup` / `wheel`), and §5 does not remove it. Overview motion has to skip the corridor gate. Gating it pins the planning camera to the route.

## 7. Mission and arm contracts that will drift

`MarswalkSiteData` in `marswalkTypes.ts` has no `mission`, `oxygen`, `weather`, `gravity`, or `startLMST`. Those fields exist only in the stale §3.4A sketch and in `mission.js`. Reading them does not typecheck. Dropping oxygen, radiation, sunset, and survival alerts matches AGENTS.md and the real type. It does not match §3.4C / §3.4D, which still tell `vr-hud-panels` to render oxygen percent and LMST, and still ask this module to export `formatLmst`. That is a cross-owner gap. Do not invent a tank mass or a sunset to satisfy the stale paragraph, and do not port the Italian strings (`OSSIGENO: RIENTRA ALLA BASE`, comma decimals, `grilletto`, `Quota (MOLA)`).

`formatLmst` has no `startLMST` source on the typed site. Leave it unimplemented until a real clock input exists.

§3.4C says the wrist shows a `CanvasTexture` produced by `marswalkInfo.ts` (`vr-hud-panels`), which already imports `marswalkMission`. Drawing position, slope, and progress inside `marswalkArm.ts` builds a second HUD. The arm should accept the wrist texture (or a draw callback) and own the mesh, the `[I]` toggle, `toggle()` / `setOpen()`, and `dispose()`. If this module imports `marswalkInfo`, the dependency arrow in §4.3 reverses.

If the arm still draws its own canvas:

- Null-guard `getContext('2d')` and then skip the draw. One reusable `CanvasTexture`; set `needsUpdate` on that object. A new texture per throttle tick leaks a WebGL texture. Clear any timer in `dispose`, and make `update` a no-op after dispose.
- Throttle from `update(dt)`, the way `arm.js` uses `acc`, so a `setInterval` cannot fire after unmount.
- Show `east_m` / `north_m` from the horizontal inverse. Scene `x,z` and reconstructed lat/lon both mislabel the frame. `georef` is optional and is not valid on `synthetic-v0` or CTX.
- Show physical elevation and `safety.cellSlope_deg`. `NaN` slope has to read as unavailable. `0°` would claim flat ground over a hole.
- Take off-path from the player’s last gate result so the wrist cannot disagree with the thing that blocked the step.
- Parent to the camera on desktop and to the right controller while `renderer.xr.isPresenting`, and reparent on `sessionstart` / `sessionend`. A camera-locked tablet in XR is carried by the head.
- Dispose geometry, material, and texture once. A shared material disposed from both the tile and the panel throws on the second call.
- `[I]` has the same listener rules as `[R]`.

`arm.js` also loads `mid_ortho_0_0.jpg` and draws Italian copy in `Image.onload`. That callback will paint a disposed texture if you navigate away mid-load, and `getContext('2d')` is null in jsdom. Leave that path out.

## What is already aligned

Keep the 5-argument `checkCorridorSafety` call (cells, then polyline, then options). The §3.3 signature in the plan is stale and will swap those arguments if someone “corrects” the call. Keep `defaultCorridorThresholdForGrid`, `defaultArrivalRadiusForGrid`, `terrain.origin`, a guarded `pointerLockElement === dom` check, English copy, and no oxygen gauge. The pre-step test is the right time. It has to be the corridor result alone, it has to allow a way back, and the demo step has to be allowed to leave the corridor so Respawn has a pose to correct.
