# MARS PATHFINDER — Five-Person Task File

This file assigns five complete areas of ownership. Read [project-plan.md](project-plan.md) first: it defines the product, research, architecture, contracts, source register, assumptions, gates, and completion criteria shared by everyone.

Ayush owns algorithms and Dhani owns UI, as requested. The remaining three roles are open for the other teammates to choose later. Their labels identify responsibilities, not names or seniority. Each person has an equal planning envelope of 16 focused hours: approximately ten for construction, three for integration, two for verification, and one for handoff and presentation. Rebalance optional scope when actual effort differs.

Each person receives one continuous assignment below. There are no nested tasks, ticket numbers, or internal task subdivisions. Paragraphs explain the full responsibility so each teammate can create their own separate implementation plan. The source Markdown is deliberately wrapped for reading and later annotation; the line count applies to each complete ownership section, not to this introduction.

Scientific facts and external references are maintained in the project plan's source register. Numeric budgets and profile values in these briefs are project decisions unless explicitly described as source metadata. No brief claims that data processing, software construction, or validation has already happened.

## Ayush — Algorithms, Route Modeling, and Explainable Results

Your assignment is to make the route planner intellectually and numerically trustworthy. You own the computation that turns a documented terrain grid and two selected positions into a reproducible route, measurable tradeoffs, and an explanation the rest of the application can display without inventing its own interpretation.

The intended result is a functioning TypeScript routing module running inside a browser worker. Python is useful for exploration or independent numerical checks, but the agreed production path is browser execution. This keeps the public demonstration usable without a separate routing server or external API credentials.

Your responsibility is substantial but bounded. You do not own downloading the entire Mars archive, designing the interface, generating the terrain mesh, or deploying the site. You do own making the algorithm's needs precise enough that those other components can connect to it correctly.

Start from the shared region and route schemas. Read every coordinate field before writing the search loop. Confirm that the grid is north-up, row-major, and indexed at cell centers, with local east and north measured in meters. An elegant algorithm on misinterpreted coordinates would produce a convincing but invalid demonstration.

Work with the data owner on one accepted numerical grid. Establish dimensions, cell spacing, elevation units, validity conventions, slope definition, roughness definition, quality classes, and source identifiers. Reject a bundle with an incompatible schema or mismatched array lengths before searching it.

Treat the region version as part of every calculation. A path is meaningful only relative to the exact grid, preprocessing choices, and policy configuration that generated it. Include these identifiers in results, cache keys, test artifacts, and exported briefings.

Build against the shared synthetic fixture while the real crop is being prepared. That fixture should be small enough to inspect by hand and contain deliberate terrain and quality differences. It is a development instrument, not a substitute for the real-data release scenario.

Normalize endpoint selection at the algorithm boundary. Preserve the original requested point, determine the containing cell, and return the accepted cell-center position. If a point is outside the region or inside invalid terrain, explain that condition rather than searching silently for a more convenient destination.

Handle a start and destination inside the same valid cell deliberately. Return a zero-length or explicitly cell-scale route with consistent metrics. Do not divide by zero when computing exposure percentages or create an artificial detour merely to provide more than one path vertex.

Use eight-neighbor movement for the first release. Compute cardinal and diagonal lengths from actual cell dimensions so the implementation also works on a rectangular test grid. Do not assume that every source will always produce exactly five-meter square cells.

Prevent diagonal corner cutting. A diagonal transition must not pass between blocked orthogonal neighbors, even when both diagonal endpoints appear valid. Explain this rule in the model notes because it changes connectivity and is easy to miss in an otherwise correct implementation.

Check admissibility before calculating preferences. Outside-region cells, missing essential elevation, unsupported derivative neighborhoods, explicit exclusions, and exceeded profile limits are not merely expensive terrain. They are unavailable under the current model and must never enter an accepted path.

Keep physical exclusions and evidence limitations distinguishable. A blocked cell can mean the terrain exceeded a modeled limit, or it can mean the data cannot support assessment. Preserve reason codes so Dhani can explain the difference instead of rendering every exclusion as the same red danger zone.

Implement the educational EVA profile from the plan as an explicit versioned configuration. Its initial slope and grade limits are assumptions for a demonstration. They are not NASA requirements or validated physiological limits, and the exported explanation must not imply otherwise.

Use terrain slope and along-edge grade as separate inputs. Terrain slope describes the local surface neighborhood; grade describes the rise along the chosen transition. A route crossing a hillside can have low along-route grade while still occupying steep terrain.

Accept roughness only with a known definition and normalization scale. The data owner should supply a detrended elevation proxy with a stated neighborhood size. Do not reinterpret it as boulder density, regolith strength, or a probability that a person or rover will become stuck.

Preserve unknown observation quality as its own state. Missing confidence documentation does not justify labeling all terrain good. Finite elevation establishes that a value exists; it does not establish that its reconstruction accuracy has been quantified.

Apply the documented quality mapping through one configuration object. Store original source categories separately from your penalty values. That separation makes it possible to change a modeling assumption without losing the scientific meaning of the original confidence product.

Implement the three route policies defined in the plan: shortest feasible, terrain-aware, and uncertainty-aware. All three obey the same baseline exclusions. Their weights differ, but the application must not compare an unconstrained shortcut against a constrained route and call the difference a fair safety improvement.

Use a positive distance base in the cost function. Add nonnegative normalized slope, roughness, and quality penalties. Keep the units of the resulting optimization score explicit: it is a weighted cost, not a distance measurement or a survival probability.

The initial weights are a starting model, not a final scientific result. Test sensitivity using a small controlled range and document how routes respond. Avoid repeatedly changing coefficients until a particular screenshot looks impressive without preserving the rationale for the choice.

Make the uncertainty preference distinct from strict quality exclusion. Preference adds a cost for lower or unknown quality; strict mode removes cells outside the documented acceptable set. A strict request can legitimately produce no path even when preference mode succeeds.

If the accepted dataset has no documented quality classes, do not fake strict confidence support. Coordinate with the data owner and UI owner on whether strict mode is unavailable or returns an explicit unassessable result. The user must understand the missing evidence.

Use A* with a binary heap and indexed arrays for scores and predecessors. The grid is small enough that a straightforward, well-tested implementation is preferable to a complex navigation framework. Prioritize correctness, bounded memory, and inspectable behavior.

Use a straight-line horizontal-distance heuristic for the baseline implementation. Because accepted edge costs are at least their horizontal lengths, it provides a lower bound. Keep this justification close to the code so later additions do not accidentally invalidate the search guarantee.

Do not add negative science rewards to the traversal cost. Science determines the chosen destination and the interpretation of a stop. A negative reward for passing a location can create cycles or invalidate assumptions that make the search correct.

Use deterministic neighbor ordering and tie breaking. Identical inputs should produce identical paths within the same implementation version. Determinism makes route comparisons, debugging, demonstrations, and exported evidence easier to trust.

Ignore stale heap entries and update predecessor records only when the candidate score improves according to the chosen numeric tolerance. Return the goal when the search reaches the correct termination condition, not simply the first time the goal is encountered as a neighbor.

Build a small Dijkstra reference path for tests. Compare total optimal cost on synthetic grids, allowing different geometries when several equal-cost solutions exist. Comparing exact vertex lists alone would incorrectly reject valid ties and miss some score errors.

Keep predecessor reconstruction bounded. Detect missing or cyclic predecessor chains and return a data or internal error rather than hanging the worker. A route reconstruction failure should never result in a partial line presented as a complete path.

Return structured outcomes for invalid input, no path, cancellation, timeout, and data failure. These are different situations with different recovery actions. A destination behind an excluded ridge is not the same problem as a corrupted binary asset.

Set a work or time bound for each request. A timeout is not proof that no path exists. Make that distinction visible in the result so the interface can offer retry or a smaller problem rather than declaring the terrain unreachable.

Design cancellation with the worker execution model in mind. A long synchronous loop cannot process a queued cancel message until it yields. Use cooperative chunks or worker termination/recreation, and verify that new requests do not wait behind obsolete work indefinitely.

Echo the request ID in every message. The application may issue a new destination while an old calculation is running. Your protocol should make it straightforward for the integration layer to discard obsolete results and associate progress with the correct request.

Keep progress reporting lightweight. Report a meaningful state or occasional explored-node count rather than sending a message for every expanded cell. The UI needs responsiveness and confidence that work is happening, not a flood of internal diagnostics.

Handle worker startup and bundle transfer explicitly. Typed-array buffers can be transferred, but transfer may detach them from the sender. Agree with the integration owner about ownership and copies so the map or 3D viewer does not unexpectedly lose access to shared data.

Reuse loaded immutable terrain across requests. Reset per-search arrays carefully, or use generation markers if justified by measurements. Do not introduce a complex cache before the basic solve time has been measured on the actual demonstration laptop.

Compute common metrics from the authoritative cell path. Horizontal distance is the sum of planar edge lengths. Sampled surface distance includes elevation differences. Keep both available internally and agree with Dhani which one is the primary displayed distance.

Compute ascent and descent separately from successive elevations. Preserve the resolution and processing context because accumulated elevation change can be sensitive to noise and sampling. Do not market a finely printed ascent value as more accurate than the underlying data.

Compute maximum terrain slope and maximum absolute edge grade as separate fields. Use unambiguous names and units in the schema. If an interface label says steepest segment, clarify whether it refers to route grade or the neighborhood slope beneath it.

Build the elevation profile against cumulative route distance. A profile plotted against vertex index misrepresents diagonal edges and any later nonuniform sampling. Include the mapping from profile samples to route positions so the UI and 3D scene can highlight the same place.

Measure low-quality and unknown-quality exposure by length rather than by counting cells. Use the agreed conservative edge classification and account for diagonals. Return both meters and percentages, with sensible values for a zero-length result.

Provide quality intervals along the route so the interface can annotate specific segments. A total percentage alone cannot explain where an observation gap occurs. Keep the representation compact enough that a long route does not produce unnecessarily large messages.

Keep raw optimization costs in the technical details, not as a universal comparative score. The three policies use different weightings, so their cost values are not directly ranked against one another. Common terrain, distance, and quality metrics are the meaningful comparison.

Deduplicate identical cell paths and attach all policies that generated them. It is acceptable for the same route to be shortest, terrain-aware, and uncertainty-aware. The result should explain equivalence rather than returning three visually offset copies.

Do not guarantee that a change in one weight will always change geometry. Sometimes the existing route remains optimal. Your tests should assert correct costs and selected optima on controlled fixtures, not require every slider movement to produce a new line.

If quality is uniform across the real region, report that limitation. A separate synthetic example can demonstrate how quality preference works, but production results must remain tied to actual available evidence. Never inject random uncertainty patches into NASA data to improve the pitch.

Generate explanations from computed facts and stable templates. Examples include a longer distance with less low-quality exposure or the same geometry under all policies. Do not require an LLM to infer why the search chose a path when the necessary metrics are already known.

Avoid unsupported causal claims. A route with lower weighted terrain cost is not necessarily lower in every individual metric. Use precise comparisons, such as reduced maximum slope or fewer meters of unknown quality, only when the result values support them.

Support an explicitly requested return journey as a second leg. The initial symmetric model may yield the reversed outbound path, but compute or validate it under the declared policy. Preserve the representation so directional costs can be introduced later without misleading mission totals.

Do not treat a failed return route as a successful complete mission. Return the outbound result with a clear incomplete-mission state if useful, and let the UI explain the limitation. A one-way solution must not imply that the astronaut can return.

If timing is included, calculate it only from declared speed and stop-duration assumptions. The simple estimate belongs in the simulator context. You do not own or invent an oxygen, energy, fatigue, radiation, or thermal survival model for this release.

Keep geometric smoothing outside the authoritative solver. A display line can be simplified only while preserving its relationship to the original path, and shortcuts must not cross exclusions. The safest baseline is to render the cell-center polyline faithfully.

Specify how profile and route sampling behave around missing data. Accepted paths should not contain invalid elevations; if that invariant fails, treat it as a data error. Interpolating through a hole to make a chart look continuous would conceal a broken assumption.

Write hand-computable tests for a flat grid, a barrier with one opening, a diagonal trap, a disconnected region, and a same-cell request. These establish search behavior independently of the complex real terrain and help catch coordinate or neighbor mistakes quickly.

Add a low-quality shortcut fixture where the tradeoff is known. Verify that increasing the quality preference changes the optimum at the expected cost relationship. Also test uniform quality and confirm that an identical route is a valid, explainable result.

Test strict quality mode separately from preference mode. Include a case where strict exclusion disconnects the goal and a case where a documented acceptable corridor exists. This catches the common mistake of implementing both controls as the same weight adjustment.

Test negative elevations, invalid values, rectangular cells, and endpoints near each outer boundary. These cases expose assumptions that a visually pleasant example may not reveal. Keep fixture dimensions and expected units visible in test names or explanatory comments.

Verify request validation and version mismatch handling. A worker must not process a request against whichever dataset happens to be loaded if the request names another version. Reproducibility depends on rejecting that mismatch rather than guessing the intended bundle.

Measure realistic performance after correctness checks pass. Record grid size, number of valid cells, policy count, machine/browser, median solve time, and worst observed time across representative requests. Label these measurements as prototype performance, not general planetary-routing benchmarks.

Work with the data owner to inspect the first real routes. If every destination fails, investigate units, NoData propagation, thresholds, and crop connectivity before relaxing constraints. A widespread failure may be a preprocessing error rather than genuinely impossible terrain.

Work with Dhani on wording and error recovery. Provide a small example of every response state and explain which controls affect admissibility versus preference. This prevents the UI from turning a nuanced model into an unexplained red or green badge.

Work with the 3D owner on the authoritative geometry contract. Confirm that path coordinates correspond to the same cell centers and elevation reference used by the mesh. You should not need to modify numerical routes to compensate for a rendering-axis bug.

Work with the integration owner on request lifecycle, worker imports, public asset paths, and build behavior. A solver that works only in a local unit test is not your final deliverable. It must execute inside the released application with the accepted region bundle.

Keep your source ownership concentrated in the routing module and its focused tests. Propose shared contract changes through the integration owner. Do not independently edit UI state shape, rewrite the data manifest, or introduce a second coordinate utility elsewhere.

Preserve a model note explaining the objective, exclusions, heuristic reasoning, normalization constants, quality mapping, and known limitations. This note should be understandable to a teammate who has never studied A*. It becomes the basis for the algorithm slide and judge questions.

Provide one reproducible example request and its result from the final real dataset. Include model version, bundle version, accepted endpoints, route metrics, and computation environment. This gives the team a stable reference when comparing a deployment against the release candidate.

Provide a compact synthetic demonstration of the uncertainty concept only if needed. Its interface and filename must clearly state that it is synthetic. The explanation should distinguish demonstrating an algorithmic behavior from establishing a real Martian hazard.

At the first integration gate, deliver one working route through the worker using the shared fixture. At the real-data gate, deliver one valid route on the accepted bundle. At the complete-journey gate, expose all policies, metrics, errors, and version fields needed by the other owners.

Use the agreed effort envelope to protect completion. Advanced any-angle search, multiobjective Pareto fronts, dynamic replanning, multi-stop optimization, and machine-learning terrain classification are future work unless the core release is already complete and the team explicitly chooses an extension.

Your final handoff includes the production solver, worker protocol, focused tests, measured performance, model explanation, example request/result, and any unresolved limitation. State which cases were tested and which assumptions remain unvalidated.

Prepare a short explanation for the presentation: the engine minimizes a declared cost over a constrained terrain grid, and different policies reveal different tradeoffs. It does not prove that a person can safely traverse the real surface. That distinction makes the project more credible rather than less ambitious.

You are finished when the released application can calculate and explain real-data routes reproducibly, reject unsupported requests honestly, and supply consistent results to the map, 3D view, and briefing. The other owners should not need to reverse-engineer your implementation to understand what a result means.

## Dhani — Interface, Layered Map, and Mission Workflow

Your assignment is to make the scientific and algorithmic work understandable through one coherent browser experience. You own the mission workflow, layered map, route comparison, evidence presentation, and printable briefing. The product should feel usable immediately, without requiring someone to explain the controls before the demonstration can begin.

Build the interface around the user's decision: choose a science destination, understand the available terrain evidence, compare routes, inspect the selected route, and save the mission briefing. Every prominent control should support that sequence. Decorative mission-control styling must not obscure the actual planning work.

The selected stack is React and TypeScript in the shared Vite application. Use the shared contracts and application state boundaries established with the integration owner. You are not expected to build the route engine, process scientific rasters, or maintain a separate 3D implementation.

Own the interface as a complete experience rather than a collection of isolated screens. A successful handoff means the user can move from the initial state to a result and understand what happened. A polished map screenshot with disconnected controls does not satisfy your assignment.

Begin with the shared synthetic fixture and example route responses. That allows you to build loading, selection, comparison, and failure states while the data owner prepares the real region. Keep fixture labeling visible during development and remove synthetic production defaults before release.

Create a compact visual system covering typography, spacing, panel hierarchy, control sizes, focus rings, borders, and color roles. Prefer a restrained interface that lets terrain imagery and route evidence carry the visual interest. Avoid dense decorative dashboards with unexplained gauges.

The first screen should establish the project name, selected region, science objective, and simulation status. It should make the next action obvious. Do not use a large introductory marketing section that forces judges to scroll before they can see or use the map.

Use a map-centered desktop layout with mission controls beside it and a concise result area. The evidence panel can collapse when space is limited. Preserve enough map area that users can distinguish route geometry instead of seeing only a small viewport surrounded by cards.

Design the empty state as a useful beginning. Show the fictional outpost and available destinations, explain how to select a target, and identify the dataset being loaded. An empty route panel should describe what will appear there rather than display invented placeholder metrics.

Mark the outpost as fictional. Its role is to give the expedition a clear starting point; it is not evidence of a real installation on Mars. Keep that distinction understandable without making the whole application look like a warning document.

Build the 2D map with the agreed local-coordinate adapter. Leaflet receives local meter positions through that adapter, not raw Earth latitude/longitude values. Do not implement a separate distance calculator based on map library defaults.

Use the region manifest to establish extent, image bounds, scale, and dataset labels. The image and route layers must share the same local coordinate frame. A route that appears slightly shifted should trigger a coordinate investigation rather than a manual CSS or pixel offset.

Provide a visible usable-region boundary. Outside that boundary, the interface should communicate that detailed planning data is unavailable. Users should not assume that empty space beyond the crop is flat, safe, or part of the analyzed terrain.

Add an orientation indicator and an explicit meter scale appropriate to the local coordinate system. Validate their behavior during zooming. A familiar-looking scale bar that silently uses Earth calculations would undermine the distances shown elsewhere in the application.

Expose imagery, elevation shading, modeled slope, observation quality, science points, and route overlays. Every layer needs a plain-language title, a legend when relevant, and a source/resolution explanation. Layer controls must not become an unexplained list of instrument acronyms.

Keep layer visibility separate from route policy. Hiding the slope overlay does not remove slope constraints from the engine. If users can change a routing assumption, put that control in the mission settings and clearly indicate that it triggers a new calculation.

Allow independent opacity for an analytical overlay when it helps users compare it with imagery. Keep defaults readable and avoid stacking several opaque heatmaps. The user should be able to identify which layer explains a visible pattern.

Display missing coverage distinctly from valid low values. A transparent hole, patterned region, or explicit unavailable style is better than coloring missing elevation as the lowest terrain. The legend must explain the distinction between no data and a measured value.

Make quality categories understandable. Good documented quality, low documented quality, unknown quality, and invalid elevation require different labels. Do not compress them into a single confidence percentage when the data owner has not supplied a calibrated probability.

Use a persistent but compact educational-simulation label. Pair specific limitations with the relevant result: terrain resolution beside the profile, unknown quality beside exposure, and assumed speed beside time. This is more useful than placing all scientific qualifications in an obscure footer.

Provide preset science destinations as the primary accessible selection mechanism. Each destination should have a concise purpose and a source-backed explanation. A preset can be a proposed observation stop without pretending that its nickname is an official geographic feature.

Support free endpoint selection inside the accepted region as a secondary interaction. Make selection mode explicit so users know whether a click sets the start, sets the destination, or inspects terrain. Avoid changing mission endpoints accidentally during normal map exploration.

Show the requested position and accepted cell center when the distinction matters. If the algorithm maps a click to its containing cell, explain the effective planning resolution. Do not silently move an invalid endpoint to a distant place that changes the user's mission.

Handle outside-region and invalid-cell clicks immediately with an actionable message. Preserve the user's previous valid mission until they intentionally replace it. A failed click should not erase a good route or cause unrelated controls to reset.

Offer a non-pointer way to choose endpoints through presets and accessible form controls. Map-only interactions exclude keyboard users and make live demonstrations fragile. All essential calculations should be possible without precise dragging or hover behavior.

Present the science objective before the route request. A mission is more meaningful when the user knows why the destination matters. Keep the description short enough for the planning view, with additional evidence available on demand.

Use one clear primary action to calculate or update routes. Its label should reflect the current state. Disable it when required data or endpoints are missing, and explain what is needed rather than leaving the button mysteriously inactive.

Distinguish preference for better-observed terrain from strict quality exclusion. The first changes costs; the second may remove all assessable paths. The wording and control treatment should make that difference understandable before a user encounters a no-path result.

If strict quality mode is unsupported by the chosen dataset, explain why it is unavailable. Do not show an apparently functional switch that the engine ignores. The interface should accurately reflect the capabilities of the current bundle and model version.

Expose advanced assumptions only where useful. The default user should not need to tune several coefficients to obtain a route. A details panel can show profile limits and weights for transparency without making a scientific parameter editor the main experience.

When inputs change, mark existing results as stale. You may preserve the old route as a labeled comparison while a new calculation runs, but the visual hierarchy must prevent it from being mistaken for the current answer.

Coordinate request lifecycle with the integration owner. The UI should show loading, allow cancellation where supported, and accept only the current request's result. Rapid destination changes must not cause an old route to replace a newer one.

Design progress feedback without implying false precision. A short calculating state is sufficient for fast requests. If the engine reports explored nodes, translate that into unobtrusive activity feedback rather than an invented completion percentage.

Show up to three distinct route candidates with consistent policy names. If several policies yield the same geometry, group them or label their equivalence. Three offset colored lines representing one path would be misleading even if they look easier to compare.

Use route labels and line styles in addition to color. Terrain imagery can contain similar hues, and some users cannot distinguish the chosen palette. A selected route needs a clear outline or emphasis that remains visible over bright and dark areas.

Keep route selection consistent across the map, comparison panel, profile, briefing, and 3D view. Selecting a candidate in one place should update the others through shared state. Do not maintain independent selected-route variables in each component.

Display common physical and evidence metrics for comparison. Distance, ascent, maximum slope, route grade, low-quality exposure, and unknown-quality exposure are understandable tradeoffs. Raw weighted costs from different policies should not become a universal score or podium ranking.

Use concise comparative language grounded in returned values. A candidate may be longer but cross fewer meters of unknown quality. Avoid calling it safest unless the product explicitly qualifies the claim, and prefer the clearer phrase lower modeled terrain cost where appropriate.

Format numbers according to the source resolution and user decision. The backend may retain precise floats, but the interface rarely needs many decimal places. Keep exact values in exported JSON and make visible rounding consistent across cards, charts, and reports.

Build the elevation profile with cumulative route distance on the horizontal axis and height on the vertical axis. Include units and the vertical-reference explanation in details. Do not imply that a profile's visual exaggeration is the actual slope a person would see.

Use profile selection or hover to highlight the corresponding route location, with a keyboard-accessible equivalent where practical. The same position can be sent to the 3D viewer. This is a valuable connection between numerical evidence and spatial understanding.

Represent gaps or unsupported data honestly. A valid route should not contain missing elevation, but if the response indicates an error, display it rather than drawing a smooth chart through the gap. Chart aesthetics cannot override the result's validity.

Present no-path outcomes as informative results. Explain whether the destination is disconnected under terrain limits, strict quality removes available corridors, or the endpoint itself is unsupported. Offer relevant actions such as selecting another destination or reviewing the current policy.

Do not encourage users to remove constraints simply to obtain a line. A relaxed model can be an explicit experiment, but the interface must show that the assumptions changed. Preserve the previous configuration in the comparison context when useful.

Differentiate a timeout from no path. A bounded computation that stopped early has not proven that the destination is unreachable. Likewise, a failed asset download is a data problem and should prompt retry, not a conclusion about terrain.

Handle a successful outbound leg with an unavailable return leg explicitly. Show the mission as incomplete for a round-trip request. Do not total only the outward journey and present it under a heading that implies return capability.

If estimated time is included, show the assumed speed and stop duration. Avoid oxygen or survival gauges because the project does not implement those models. A simple, qualified time estimate is more useful than a visually impressive fabricated resource panel.

Integrate the 3D owner's component as another view of the same selected region and route. You own the surrounding control placement and accessible alternative; the 3D owner owns terrain geometry, cameras, and rendering. Agree on props and events rather than editing each other's internals.

Keep the 2D experience usable while the 3D bundle loads. The user should not lose the route or mission settings when opening the terrain view. A separate loading state and retry action are preferable to a full application reset.

If WebGL is unavailable, provide the map, profile, and briefing as the functional alternative. Report the missing 3D capability accurately. Do not block all mission planning because an optional device feature or rendering context fails.

For fixed viewpoints and panoramas, display the content type clearly. A reconstructed view and a real rover image have different evidential meaning. The media panel should show location context, source, and any approximation rather than letting users infer exact correspondence.

Do not display a Quest entry button merely because VR exists in the plan. Show it only when the feature has been implemented and capability detection supports it. A disabled explanation is acceptable; a prominent dead control distracts from the working product.

Build the mission briefing from the shared result object. Include mission purpose, source/version identifiers, endpoints, selected policy, route metrics, quality limitations, timing assumptions if used, and return-leg status. The report should be a readable record of the decision.

Make the printable view useful on ordinary paper or browser PDF output. Avoid dark full-page backgrounds, clipped maps, fixed-height panels, and controls that print over content. Include a compact route image or clear textual fallback when image export is unavailable.

The JSON download is a reproducibility artifact, not a screenshot export. Work with the integration owner on the serializer and filename. The UI should explain what the file contains and retain the exact model and dataset versions.

A download failure must preserve the mission. Show a clear retry option and avoid a success toast before the browser has actually received a valid artifact. Test the report flow with long warnings and missing optional media, not only the ideal scenario.

Design the source drawer around meaningful questions: which mission supplied this, what is its resolution, what processing occurred, and what does it support? Keep raw identifiers available in details but translate them into readable labels in the main workflow.

Credit NASA instruments, product creators, and distributors correctly. Do not reduce a USGS or Caltech derivative to an unqualified NASA image label. The data owner supplies verified attribution; your responsibility is to present it where users can find it.

Use semantic buttons, headings, form labels, and dialog behavior. Keyboard focus should remain visible and move predictably when panels open or close. An evidence drawer should not trap a user or send focus behind an overlay.

Keep text contrast and route contrast readable against the map. Test both bright and dark terrain regions. Do not rely on a single screenshot from the most favorable part of the imagery to judge whether the interface is legible.

Respect reduced-motion preferences. Camera transitions, panel motion, and route playback should be optional or restrained. Frequently repeated interactions should respond quickly without waiting for decorative animations to finish.

At small widths, prioritize the mission, map, and selected result. Use stacked panels or a controlled bottom sheet instead of shrinking every desktop column. The route list and evidence should remain reachable without overlapping the primary map controls.

Support long destination names and translated scientific terminology in layout testing, even if the release language is English. Text should wrap without hiding units or pushing controls offscreen. Avoid fixed widths based only on the shortest example labels.

Keep errors close to the relevant control while maintaining an overall status region for screen readers. A toast alone can disappear before the user understands what failed. Important data limitations belong in the persistent result view.

Test the complete flow with the real bundle as soon as it becomes available. The imagery colors, endpoint spacing, and profile ranges may differ significantly from the fixture. Adjust presentation without changing the underlying measurements or inventing more dramatic terrain.

Verify map interactions after resizing, switching views, and reopening panels. Some map libraries need a size refresh when their container changes. A blank or offset map after returning from 3D is a real integration defect, not merely a visual detail.

Check that changing only layer visibility does not invalidate a route, while changing endpoints or policy does. These state distinctions help the interface feel reliable and prevent unnecessary worker calculations during simple exploration.

Use focused interaction tests for mission selection, route selection, error recovery, stale-result labels, and export controls. Leave numerical optimality to Ayush's tests. Your evidence should establish that users see and control the correct result.

Work with the integration owner on end-to-end checks rather than creating a separate disconnected test application. Provide stable accessible labels for the important controls. Tests should interact with the product the same way a user would.

Keep your implementation concentrated in mission, map, comparison, and briefing presentation components. Shared contracts and application composition belong to the integration owner. Coordinate necessary changes so each contributor can merge without repeatedly overwriting the same files.

Protect the effort envelope by omitting optional polish before compromising the core journey. A theme switcher, elaborate onboarding, custom cursor, cinematic introduction, and numerous decorative statistics are lower priority than clear map selection and honest result states.

At the first integration gate, deliver the mission shell and map using the fixture. At the complete-journey gate, accept real worker results and connect route selection to the profile and 3D component. Before release, complete the report and all important failure states.

Provide screenshots or a short recording of the main workflow, narrow layout, no-path state, and evidence panel. These are review evidence, not substitutes for the running application. Note the tested viewport and browser so others can reproduce layout issues.

Prepare the visual portion of the short demo with the integration owner. The sequence should reveal the product's decision-making clearly, without requiring fast reading of dense text. Make sure the route and quality difference being shown actually exists in the released scenario.

Your final handoff includes the usable UI, shared visual styles, map adapters, interaction checks, print treatment, and a concise explanation of remaining limitations. State any unsupported device behavior instead of leaving it to be discovered during judging.

You are finished when a new user can complete the whole planning journey, understand why the results differ or coincide, and inspect their evidence without developer assistance. The interface should make the team's scientific care visible through ordinary use.

## Open Role A — Data, GIS, and Scientific Evidence

Your assignment is to give the entire project a defensible geographic and scientific foundation. You own the selected Mars region, source acquisition, preprocessing, spatial alignment, validity and quality information, science destinations, and the evidence connecting browser assets to original observations.

This role is open for one of the three unassigned teammates to choose. It has the same core effort envelope as algorithms, UI, 3D, and integration. You are not being asked to download every available Mars dataset or become responsible for all scientific questions about human exploration.

The central deliverable is one compact, validated, versioned region bundle that the route engine, map, and terrain renderer can all consume. A collection of links or a beautiful screenshot is not enough. Other owners need actual numerical arrays, image assets, metadata, and clear limitations.

Start with western Jezero as the search area and the dataset candidates in the project plan. The region choice is conditional on overlapping usable data. Do not commit the team to a famous landmark before confirming that the elevation, imagery, and relevant science context can support it.

The target is approximately one square kilometer on a fine grid, not an exact preselected bounding box. Inspect the available footprints and choose a manageable rectangle with connected terrain and meaningful destinations. Record the final bounds rather than leaving every component to infer them independently.

Acquire the dependable coarse fallback early while evaluating finer products. The point is to ensure that a real-data implementation can proceed if a large download or difficult archive blocks the preferred option. A fallback should be ready to use, not merely mentioned in a document.

Treat advertised resolution, file size, and coverage as candidate metadata until the actual asset is inspected. Published catalog descriptions can contain formatting mistakes or incomplete details. The raster header and accompanying documentation must establish what the pipeline actually receives.

Keep acquisition status explicit: located, accessible, downloaded, inspected, processed, and validated are different states. Report which state each candidate has reached. This prevents the rest of the team from assuming that a discovered URL means the data is already ready for routing.

Avoid spending the entire first session searching for the ideal product. The plan gives the data viability gate roughly two hours. If fine-resolution processing is not practical by that point, publish the coarse decision and let the application integrate against an honest lower-resolution bundle.

Use Python with Rasterio, NumPy, and GDAL or equivalent established tools. Pin or record the versions used. You may inspect data in a GIS application, but the final processing choices should be reproducible through a script or clearly recorded configuration.

Keep raw archives outside the browser asset directory and outside ordinary source control. Download once where practical and share the processed crop. Five teammates repeatedly fetching gigabytes wastes the scarce network capacity identified in the original discussion.

Inspect whether a source supports useful remote windows before relying on them. A remote ZIP, a non-tiled TIFF, or a server without byte-range support can still require a large transfer. Do not promise a tiny download merely because the processing library has a window parameter.

Record each source's mission, instrument, product creator, distributor, title, URL or DOI, version, publication date, and applicable rights. Separate acquisition dates from publication dates where available. A single generic NASA credit loses important information about derivative products.

Preserve the source file's checksum after download. If the archive contains several rasters, identify exactly which files supply elevation, imagery, and quality. Similar filenames can represent different processing versions or reference systems and must not be mixed accidentally.

Read the full coordinate reference definition. Capture planetary body, radius or ellipsoid, projection parameters, latitude type, longitude direction/domain, horizontal units, vertical reference, and affine transform. A label such as equirectangular or Mars alone is not enough to establish compatibility.

The research found differences between candidate Mars reference definitions. Reconcile them through an explicit transformation and validation procedure. Do not suppress a planetary-body mismatch warning and assume that the output will be correct because the images look approximately aligned.

Pay attention to longitude conventions. Positive-east and positive-west values, and zero-to-360 versus negative-180-to-180 domains, can place the same numeric coordinate in different locations. Normalize only through a documented conversion and preserve the original metadata for traceability.

Distinguish planetocentric from planetographic latitude. Do not treat them as interchangeable without checking the chosen body model and source documentation. The final runtime bundle can use local meters, but its relationship to source coordinates must still be defined correctly.

Inspect the vertical reference and units separately from horizontal coordinates. Some products may encode heights relative to different reference surfaces. A simple vertical offset for rendering does not resolve a scientific datum mismatch between elevation sources.

Choose one canonical projected grid for the release. Normalize source data into that grid during preprocessing. The browser should not perform a chain of ad hoc planetary transformations each time a user selects a point.

Publish the outer bounds, origin, width, height, cell spacing, and cell-center convention. The normalized grid is north-up and row-major, with the first row at the north edge. Confirm that the imagery and numeric arrays use the same orientation.

Create a small coordinate fixture with recognizable corner values and at least one interior reference point. Share it with the UI, 3D, and integration owners before the full dataset arrives. This catches mirrored axes and half-cell shifts with very little debugging effort.

When choosing the crop, include a halo large enough for slope and roughness neighborhoods. Compute derivatives with that supporting context, then trim to the delivered extent. Otherwise, the crop boundary can create false slopes or invalid strips that change route connectivity.

Keep native resolution, analytical grid spacing, and display texture resolution as separate metadata. A fine image over a coarse DEM does not improve elevation accuracy. Users should be able to see what scale supports each numerical conclusion.

Use a five-meter analytical grid only if the selected elevation source supports that sampling choice. If the fallback elevation is coarser, retain its honest spacing or use a coarser grid. Interpolating it to more pixels is a display or numerical convenience, not new information.

Define the resampling method for each field. Elevation may use an appropriate continuous interpolation or aggregation method. Validity masks, confidence categories, and exclusion labels require categorical or conservative treatment rather than ordinary averaging.

Inspect the effect of downsampling on small hazards and missing regions. A mean elevation alone can erase a sharp feature. Consider retaining conservative maximum slope or invalid-coverage information when aggregating finer data, and document the rule used.

Do not claim that a coarse grid captures every boulder, crack, or patch of loose material. The route model represents sampled terrain and selected evidence. Its limitations should be clear enough that the presentation does not drift into footstep-level navigation claims.

Handle NoData before calculating derivatives. Missing values must not enter slope calculations as zero or as extreme negative heights. Preserve a valid-data mask through reprojection, resampling, derivative computation, and serialization.

Negative Martian elevations are valid observations. Distinguish them from the source's NoData sentinel and from nonfinite values. A simplistic rule that rejects all negative heights would remove much of a legitimate region.

Calculate terrain slope with an explicitly documented method and physical scale. Record whether it comes from finite differences, a local fit, or a selected GDAL operation. Confirm that horizontal and vertical units make the resulting angle meaningful.

Validate the slope implementation on a synthetic plane of known inclination. This is a direct scientific check, not an elaborate test suite. It can reveal unit scaling, axis orientation, and edge-treatment errors before those errors become route decisions.

Define roughness as a specific topographic proxy, preferably residual variation after removing a local plane. State the neighborhood in meters and the aggregation statistic. Avoid an undefined field named hazard that combines unrelated quantities without explanation.

Separate analytical roughness from visual texture. Dark patches or strong contrast in imagery do not automatically indicate rough terrain. If no defensible roughness calculation can be completed, tell Ayush to disable the contribution rather than populate it with arbitrary values.

Read confidence documentation before mapping any codes. A confidence raster may express interpolation status, matching quality, or processing categories rather than a probability. Preserve original codes and record the interpretation table used by the application.

Keep documented acceptable quality, documented low quality, unknown quality, and invalid elevation distinct. Those states support different behavior in routing and different explanations in the UI. A single generic uncertainty number should not erase their origin.

If only coverage or nominal resolution is available, publish a clearly labeled quality proxy. Describe exactly what it measures and what it does not. Never present a proxy as a calibrated chance of finding an obstacle or completing the expedition.

Do not create artificial spatial variation to make Blindspot mode look more compelling. If the accepted crop has uniform documented quality, say so. The team can demonstrate the algorithm separately on a synthetic fixture while being honest about the real region.

Use conservative propagation rules near missing elevation and unreliable derivatives. A cell can have a finite height but insufficient neighboring data for a trustworthy slope. Record that distinction so the engine can exclude it for a stated reason.

Publish exclusion reasons as meaningful codes. Examples include missing elevation, unsupported derivative neighborhood, outside accepted extent, and manually documented exclusion. Slope thresholds remain part of Ayush's versioned profile rather than being hidden permanently in a raster without explanation.

Avoid manual terrain edits unless they are necessary, justified, and recorded. If an obvious processing artifact must be masked, preserve its location and reason. Do not smooth away a suspicious ridge simply because it prevents a desired route.

Produce imagery assets that align with the accepted numerical grid. Downsample for browser performance while preserving the mapping from texture pixels to local coordinates. A pretty texture with a different crop origin is worse than a modest-resolution image that is correctly registered.

Generate analytical overlays with transparent NoData and explicit legends. Keep the numeric arrays separate from their colorized images. The route engine must consume measurements or derived values, not attempt to decode elevation from a rendered heatmap.

Do not treat Trek WMTS tiles as a source of numerical elevation unless a separate documented numeric service has actually been selected. The researched WMTS interface supplies image tiles. It is useful for discovery and context, but a shaded-relief picture is not a DEM.

Prepare a compact browser bundle with the manifest and approved assets. Include byte lengths, hashes, units, array types, dimensions, and source IDs. The integration owner should be able to validate it automatically without opening a GIS program.

Keep filenames and bundle versions stable within a release. Any changed analytical data produces a new dataset version. This prevents cached images from one crop from appearing beside elevation arrays from another.

Provide a machine-readable processing record. Include the source paths, selected bounds, CRS transformation, resampling, derivative parameters, quality mapping, and output checksums. It should be possible for another teammate to reproduce the bundle without guessing what happened in an interactive session.

Inspect at least the corners, center, several recognizable landmarks, and a route corridor for alignment. Use numeric checks and visual comparison together. A global correlation or a single screenshot is insufficient to catch local offsets and orientation mistakes.

Check dimensions and finite values across every array. Confirm that all masks align exactly with the elevation grid. Summarize valid-cell fraction and the presence of low or unknown quality so the team knows what behavior the dataset can support.

Check elevation ranges against source metadata and recognizable terrain context. Unexpected orders of magnitude may indicate units or decoding problems. Do not rely only on an automatically stretched color map, which can make almost any numeric range look plausible.

Inspect slope and roughness distributions without using them to manufacture a desired route. Their purpose is to detect artifacts and understand the crop. Record the reasoning for normalization scales passed to Ayush so those scales remain stable between requests.

Choose at least two scientifically meaningful selectable destinations inside the usable region. A destination needs a valid local position, a clear observation purpose, supporting source references, and a note about positional confidence. A descriptive title alone is not sufficient evidence.

Distinguish a proposed observation stop from an officially named feature. It is acceptable to label a point Delta-facing viewpoint as a team-defined stop. It is not acceptable to attach an official geological name to an approximate coordinate without checking its location.

Keep the mission objective focused on visible geological context, such as comparing landforms associated with sediment deposition. Avoid claiming that an orbital image identifies a particular mineral or proves biological activity unless the selected evidence genuinely supports that claim.

Do not move a scientific feature to fit the routing crop. If a known feature lies outside the usable area, show it as context or select another objective. The region and story must agree geographically, even when that makes the presentation less dramatic.

Ensure the project meaningfully integrates more than one NASA mission. CTX and HiRISE belong to the same orbiter, so they do not by themselves meet a multiple-mission story. Coordinate a visible Perseverance science or surface-imagery contribution with the 3D owner.

Use MOLA or other broad-scale context only at its proper resolution if it is actually included. Do not list a mission in the submission solely because it appears somewhere in the bibliography. The source manifest should identify the visible application contribution for every claimed mission.

Provide short, verified science captions for the UI and a slightly fuller explanation for the briefing. Keep observations, interpretations, and proposed exploration activities distinct. This lets Dhani present the science clearly without becoming responsible for checking every planetary claim.

Work with the 3D owner to verify any panorama's capture location and relationship to the selected region. A panorama can be useful contextual media even when it is not inside the route crop. The application must label that relationship instead of implying an exact view from the clicked point.

Preserve media and dataset credits supplied by the source. Check third-party notices and derivative-product citations. Do not assume that a NASA-hosted page automatically grants unrestricted use of every embedded photograph, illustration, or logo.

Keep the project explanation within the evidence actually used. You are not expected to build live weather, radiation, or communications models. Record these as unmodeled mission considerations rather than gathering unrelated datasets that the application cannot integrate responsibly.

Review the first real routes with Ayush. Investigate unexpected walls, suspicious shortcuts, and excessive exclusions by checking the data and coordinate contract. Do not immediately change thresholds to hide a processing defect.

Supply Dhani with layer names, units, legends, source descriptions, and limitation text. The UI should not have to invent the meaning of a quality color or infer whether a slope value is degrees or percent. Provide concise copy as part of the bundle handoff.

Supply the 3D owner with the height grid, texture mapping, bounds, vertical reference, and invalid-cell behavior. Agree on whether mesh vertices represent the delivered sample centers or an explicitly derived surface. The renderer must not invent a different terrain footprint.

Supply the integration owner with a validation command and a minimal known-good bundle. That command should fail clearly for missing assets, wrong lengths, invalid metadata, and incompatible versions. It should not require access to your private download directory.

Keep the final processed assets within the agreed browser budget where practical. If the texture dominates the download, reduce display resolution before reducing analytical honesty. Report the tradeoff so the team understands what visual detail was sacrificed and what numerical data remains unchanged.

Provide an honest coarse-mode label if the fallback is used. The application can still demonstrate terrain-aware regional planning and shared 3D reconstruction. It must not describe interpolated coarse terrain as high-resolution astronaut navigation.

Use a small set of focused verification artifacts: metadata inspection, plane-slope check, alignment evidence, validity summary, and source manifest. The purpose is to establish the scientific chain efficiently, not to create a large bureaucratic report that nobody can review before the deadline.

At the data gate, deliver an explicit fine-or-coarse decision and the first real numerical crop. At the integration gate, deliver aligned imagery and complete metadata. Before release, finalize science destinations, quality semantics, credits, and reproducibility information.

Protect your effort envelope by postponing additional regions, multiple projection systems in the browser, detailed geologic digitization, mineral classification, and new stereo reconstruction. The project needs one credible region more than a catalog of partially processed Mars products.

Prepare a concise explanation of the data chain for judges: original observation, published elevation product, selected crop, derived attributes, route calculation, and visualization. Explain which parts are measured, derived, assumed, or unavailable.

Your final handoff includes the accepted bundle, preprocessing script/configuration, source register, science-point records, quality interpretation, validation evidence, and known limitations. Another teammate should be able to locate the original product and explain how the displayed terrain was produced.

You are finished when every important terrain value and science claim in the released application can be traced to a source or a clearly labeled modeling choice. The route engine, map, and 3D renderer should all operate on the same spatially consistent foundation.

## Open Role B — 3D Terrain and Exploration

Your assignment is to turn the accepted elevation data and selected route into an understandable desktop 3D exploration experience. You own terrain rendering, spatial registration, camera interaction, route inspection, fixed viewpoints, and the provenance of any surface media you introduce.

This role is open for one of the remaining teammates to choose. Its core commitment is comparable to the other four roles. Quest support and additional viewpoints are optional extensions, not an expectation that you build a complete VR game within the same effort budget.

The central deliverable is a Three.js terrain component that accepts the same region bundle and route result used by the 2D map. It must show real sampled terrain and the actual selected path. An unrelated Mars landscape or manually drawn route does not satisfy the assignment.

Use the shared React and TypeScript application rather than starting a separate Unity or Unreal project. A separate engine would add another asset pipeline, coordinate system, deployment path, and integration burden. The agreed web renderer is sufficient for the bounded terrain and optional fixed viewpoint.

Begin with the shared synthetic coordinate fixture. Give its corners distinct elevations or colors so orientation mistakes are obvious. Build the mesh and route overlay against that fixture before trying to debug a large real terrain that is harder to interpret by eye.

Read the grid contract carefully. Rows run from north to south, columns from west to east, and samples represent cell centers. Local positions are east and north in meters. The scene adapter maps east to X, elevation to Y, and north to negative Z.

Use the shared coordinate utilities where possible. Do not create a second subtly different transformation inside the renderer. A disagreement about half-cell offsets or axis signs must be resolved at the contract level, not hidden by manually shifting the mesh until it looks plausible.

Keep the terrain near the scene origin for numerical stability. Subtract the declared local and vertical display origins while preserving the original values in the data model. A visual origin shift must never alter the route's measured elevations or geographic references.

Agree with the data owner about the mesh footprint. If vertices represent cell-center samples, the outermost centers lie inside the raster's outer bounds. Handle that half-cell difference explicitly when aligning the texture and any boundary outline.

Generate an indexed BufferGeometry from the accepted height samples. Reuse vertices where appropriate and calculate normals for readable lighting. The implementation should be simple enough that another teammate can inspect the relationship between a grid index and a scene position.

Preserve holes in the terrain where essential elevation is invalid. Do not stretch triangles across missing cells or fill gaps with a flat plane that appears measured. A transparent or visibly unavailable region is a more truthful representation of absent information.

Check triangle construction around invalid corners. A quad containing an unsupported sample may need to be omitted or handled under an agreed conservative rule. Document that choice so the visual surface does not imply traversability that the route engine correctly refuses.

Keep the mesh resolution appropriate to the accepted grid and performance budget. More triangles do not create more scientific information. If display decimation is necessary, retain the analytical grid for route placement and make the visual approximation clear in the implementation notes.

Do not apply arbitrary smoothing to make the terrain look cinematic. Smoothing can remove ridges and alter the apparent reason for a detour. If any rendering-only smoothing is introduced, it must be labeled and must not change the route engine's source data.

Align the image texture through the shared bounds and affine convention. Verify horizontal and vertical orientation with recognizable landmarks and the synthetic fixture. Texture flips are easy to miss on unfamiliar terrain and can make a scientifically correct heightmap visually false.

Use a texture size that fits ordinary browser memory. Coordinate with the data owner on a display-specific image export rather than loading a multi-gigabyte scientific raster. Texture quality is a visual tradeoff, while the analytical grid remains independently documented.

Provide a fallback material if the image texture fails to load. Elevation-based shading can still reveal the terrain structure, but the interface should report that imagery is unavailable. Do not substitute an unrelated stock Mars texture without an explicit illustrative label.

Keep lighting stable and purposeful. Its role is to reveal shape, not simulate a scientifically calculated sun position unless that model is actually implemented. Describe generic scene lighting as visualization lighting and avoid time-of-day claims based on it.

Use true vertical scale by default. If a vertical-exaggeration control is useful, display its factor persistently and provide a clear reset to one. The same exaggeration must apply consistently to terrain and route display, while numerical metrics remain unchanged.

Do not let a camera angle or exaggerated terrain imply that a numerical slope threshold has been exceeded when it has not. The interface can explain that visual perspective changes perception. The authoritative slope and grade values come from Ayush's result and the accepted grid.

Render the selected route from the authoritative local coordinates. Do not recalculate A*, infer a path from the terrain mesh, or draw a visually convenient shortcut. One route result should drive both the map and the scene.

Use a small documented vertical display offset to prevent z-fighting. Keep it separate from the route's scientific elevation. A route hovering slightly for visibility is acceptable; exporting that offset as an actual height measurement is not.

Ensure that the route remains visible against bright and dark terrain. Coordinate line colors, outlines, and selection treatment with Dhani. Do not invent a separate route palette that makes the same candidate appear to be a different policy in 3D.

Show start and destination markers with a clear visual hierarchy. The fictional outpost can be a modest symbolic marker or simple model, but it must remain distinguishable from measured features. Avoid large decorative assets that obscure terrain or create scale confusion.

Keep alternative route overlays optional and readable. Showing all candidates at once can help comparison, but the selected path should remain obvious. If policies share identical geometry, display their shared identity rather than offsetting copies into different apparent corridors.

Provide orbit, zoom, and reset controls suitable for the bounded region. Choose sensible camera limits so users cannot easily lose the terrain or move far below the surface. A reset action is essential for a reliable live demonstration.

Fit the initial camera to the accepted region bounds, not hard-coded assumptions about a one-kilometer square. The fallback dataset may use a larger extent or a different aspect ratio. The component should remain usable without rewriting its camera constants.

Preserve useful camera state when changing route selection. A user inspecting a ridge should not be thrown back to the initial view every time they select another candidate. Dataset changes, however, should reset or validate the camera against the new region.

Coordinate camera transitions with reduced-motion preferences. Instant or short transitions are sufficient for frequent interactions. A long cinematic flight can make route comparison slower and can cause discomfort without adding scientific understanding.

Keep the scene responsive during route calculation and asset loading. The route worker and renderer should not compete through unnecessary main-thread work. Avoid rebuilding the entire terrain geometry when only the selected route or inspection cursor changes.

Respond to container resizing and display-density changes. Cap device pixel ratio if needed to meet the performance budget. A high-resolution laptop screen should not silently multiply rendering work until the application becomes unusable.

Pause or reduce rendering when the 3D view is hidden and nothing is changing. An idle scene should not consume the same resources as active orbiting. Use an approach compatible with any later WebXR animation loop rather than layering competing loops.

Dispose of geometry, materials, textures, controls, and event listeners when the component unmounts or changes datasets. Repeatedly opening and closing the view must not accumulate GPU resources. Test this lifecycle as part of your own verification.

Handle WebGL context loss and initialization failure gracefully. Report the failure to the surrounding UI and allow the map and briefing to continue working. Your component should not crash the entire mission state because a rendering device is unavailable.

Provide a clear loading state and a bounded retry path. Distinguish terrain-data failure from optional texture failure. The user may still inspect a numerical height surface when imagery fails, but a scene without valid elevation should not appear to be a measured reconstruction.

Implement inspection of a selected route position through the shared event contract. A profile sample or map location can highlight the corresponding scene point. The goal is to connect the numerical explanation to the terrain feature, not merely provide a separate decorative viewer.

If raycasting is used for scene selection, convert the result back through the shared coordinate adapter. Report whether the point lies on valid reconstructed terrain. Do not use a collision with an illustrative prop as a scientific route endpoint.

Keep scene selection and mission endpoint selection distinct. Clicking terrain to inspect a location should not unexpectedly change the destination. Coordinate with Dhani on explicit modes and clear feedback so the interaction remains predictable.

Route playback is a visualization of progress along the computed path. Parameterize it by cumulative distance or an explicitly chosen playback speed. It must not imply actual astronaut dynamics, rover autonomy, or a validated travel-time prediction.

Provide pause, resume, restart, and a static alternative if playback is included. Never make animation the only way to inspect a route. Reduced-motion users and a presenter under time pressure should be able to jump directly to a relevant location.

Do not add collision physics, wheel suspension, suit movement, or free driving to the core scope. Those features create a different simulation problem. A simple marker moving along the accepted path preserves the team's rover idea without implying capabilities the project does not have.

Build one fixed terrain viewpoint only after the desktop overview and route alignment work. Choose a valid, meaningful location with the data owner. The viewpoint should help users inspect a feature or route tradeoff, rather than exist solely because immersive viewing was discussed.

A ground-level camera height is a display assumption. Label the view as a reconstruction and keep the camera above valid terrain. Do not claim that the reconstructed scene resolves every nearby rock, crack, or surface material at human scale.

Avoid unrestricted first-person movement in the core release. It creates collision, boundary, and comfort problems that are unnecessary for a fixed viewpoint. A small set of clearly labeled inspection positions is enough to demonstrate spatial understanding.

If you add a panorama, verify its source, mission, instrument or camera, capture location, and date or sol where documented. Preserve the credit line and product identifier. The image's relationship to the selected route must be explicit.

Check whether the media is a full equirectangular sphere, a cylindrical panorama, a partial mosaic, or an ordinary photograph. Do not wrap a partial image into a fabricated 360-degree environment. Use the appropriate viewer or show it as a contextual image.

Keep real imagery separate from reconstructed terrain. A panorama is an observation from a particular camera location; the mesh is an elevation-derived visualization. Switching between them should make the change in evidence type visible to the user.

If the image was captured outside the selected crop, label it as regional context. Do not place it at a convenient route stop or imply that it is what an astronaut would see from the fictional outpost. Geographic honesty takes priority over a seamless transition effect.

Do not create an AI-generated Mars surface image and present it as observational evidence. If illustrative artwork is used anywhere, it needs a clear label and should not influence route decisions. The core terrain and science story should remain supported by real data.

Coordinate media loading with the browser asset budget. Panoramas can be large and should load on demand. The initial map and route calculation should not wait for optional immersive media to download.

Respect the actual media terms and attribution requirements. NASA-hosted assets can include third-party credits. The data owner handles terrain-product provenance, while you handle the surface media and illustrative models you introduce.

Use simple original geometry for the outpost or astronaut marker when possible. If an external model is used, record its license and source. Avoid adding a large asset library merely to make the scene look more like a game.

Quest support is a stretch feature gated on the complete desktop journey. Do not begin headset-specific work while terrain orientation, route placement, or ordinary browser interaction remains unresolved. The core deliverable must remain useful without owning a headset.

If the team chooses to attempt WebXR, use capability detection and a deliberate user action to enter. Test the deployed HTTPS page on the actual headset and browser. A successful desktop build does not establish immersive compatibility.

Start with one stationary viewpoint and head rotation. This limits motion discomfort and avoids the need for locomotion design. Teleportation between additional validated points is optional only after entry, exit, scale, and rendering behavior are reliable.

Keep immersive scale consistent with meters. A terrain scaled down for a desktop overview must not accidentally become a miniature world when the user enters a ground-level headset view. Document the scene scale and camera/reference-space handling.

Provide a predictable exit and restore desktop controls afterward. Test entering and leaving more than once. The application should preserve the mission and selected route instead of requiring a reload after an XR session ends.

Treat denied permission, unsupported devices, and lost sessions as normal outcomes. The interface should explain them briefly and retain the desktop alternative. Do not leave a spinning entry state or a button that appears successful when no session was created.

Do not add joystick locomotion, hand interactions, or six viewpoints merely to fulfill an early brainstorming number. The original discussion offered those as possibilities. One stable, correctly labeled viewpoint is a better stretch result than many unverified locations.

Measure scene performance on the demonstration laptop. Record geometry size, texture size, pixel-ratio cap, browser, and approximate frame rate during orbiting. The planned thirty-frame-per-second target is an engineering goal, not a claim until measured.

Check memory behavior over repeated opening, route changes, and dataset reloads. Watch for detached buffers, retained textures, and duplicate animation loops. These problems often appear only after a few interactions and can derail a live demo.

Verify spatial registration with numeric fixtures and visual landmarks. Check all corners, the center, at least one known high/low point, and several route vertices. A visually plausible single camera view cannot prove that axes and origins are correct.

Compare a selected path point's local coordinates and elevation against the map and profile. Allow only the documented rendering offset or display exaggeration. Unexpected differences should be fixed in adapters, not explained away as an artistic choice.

Test NoData holes and region edges explicitly. A route should not appear to cross a hole due to line interpolation or terrain decimation. If the authoritative path is valid but the display mesh is coarse, preserve enough sampling to show its relationship honestly.

Test the coarse-data fallback with its actual extent and spacing. The scene should still communicate large terrain structure without implying fine surface detail. Avoid adding procedural rocks to conceal the lower resolution, because that would blur measured and invented information.

Work with Dhani on component props, loading/error events, route selection, viewpoint labels, and control placement. You own rendering internals; Dhani owns the surrounding workflow. Agree on a small interface so neither of you has to rewrite the other's work during integration.

Work with Ayush on route sampling and elevation semantics. If you need a denser line for display, derive it without changing the authoritative path or metrics. Any interpolated position must remain within the accepted route corridor and be treated as visualization geometry.

Work with the data owner on texture bounds, valid-cell masks, and science viewpoints. Ask for a reproducible crop correction if alignment is wrong. Do not create a private terrain asset that only your component uses while the map and solver use another version.

Work with the integration owner on lazy loading, build imports, asset paths, and error boundaries. The renderer must function in the deployed static build and in the local fallback package. A scene that depends on your development machine's absolute file paths is incomplete.

Keep your owned code concentrated in the terrain feature and its adapters/tests. Shared contracts and global UI styles require coordination. This avoids merge conflicts and preserves the five-person division of responsibility.

Use focused tests for coordinate transforms and geometry construction, plus manual or automated browser checks for interaction and lifecycle. Do not attempt to prove visual correctness solely with a giant screenshot snapshot. Numeric registration checks are more informative for this domain.

Capture a few useful review views: top-down alignment, oblique terrain with the selected route, a NoData boundary, and the optional viewpoint. Record the bundle version and display scale. These images should help the team review correctness, not just aesthetics.

At the early integration gate, provide a fixture-based mesh with a route overlay. At the complete-journey gate, accept the real region and shared route selection. Before release, finish lifecycle handling, performance tuning, provenance, and the desktop fallback behavior.

Protect your effort budget by prioritizing shared-coordinate correctness and readable interaction over visual effects. Atmospheric scattering, elaborate shadows, cinematic particles, procedural surface detail, and full planetary globes are future work unless the whole core application is already stable.

Prepare a short explanation for judges of how the mesh is generated from sampled elevations and how the same route appears in both views. Explain that small obstacles below the dataset's effective resolution are not reconstructed. This is the scientific value of the viewer, not just a technical implementation detail.

Your final handoff includes the integrated terrain component, coordinate/geometry checks, performance observations, media credits, optional viewpoint records, and any unsupported device behavior. State clearly whether Quest was actually tested or remains a future feature.

You are finished when the selected route and terrain are spatially consistent, easy to inspect, and honest about their resolution and evidence. The desktop experience must stand on its own, while any immersive extension adds understanding without becoming a release dependency.

## Open Role C — Integration, Verification, and Delivery

Your assignment is to connect the five ownership areas into one build that runs reliably in a public browser and can be submitted on time. You own shared application composition, contracts, build and deployment setup, integration testing, release checks, and assembly of the submission materials.

This role is open for one of the three unassigned teammates to choose. It has the same effort envelope as the other four roles. Your assignment coordinates other people's work; it does not make you the default author of every feature, every scientific claim, or every slide.

The required outcome is one coherent application where the real region bundle reaches the route worker, the same result appears on the map and in 3D, and a briefing can be produced from that result. A repository containing five independent prototypes is not integrated completion.

Start by confirming the actual repository state, event schedule, and team members. The current workspace may be newly initialized; create only the foundation the chosen plan needs. The research happened on 14 November 2026, so verify the authoritative event page and the earlier Milan local timetable before depending on the global cutoff.

The official 2026 overview reports the submission window closing at 23:59 local time on 15 November. It does not establish the Milan event's local presentation cutoff. Contacting organizers is outside this code assignment unless the team authorizes that communication; checking public information and asking a teammate who attended are ordinary preparation.

Create the minimal Vite, React, TypeScript application shell needed for other owners to integrate. Establish start, build, typecheck, lint, and focused test scripts. Keep configuration direct and familiar so the setup itself does not consume the hackathon.

Establish the expected folder boundaries described in the plan. Route code, map workflow, processing scripts, 3D rendering, and application composition should have visible ownership. Avoid building a large abstract framework for a single region and a short demonstration.

Own the canonical runtime schemas for manifest, grid arrays, coordinates, points of interest, route request, and route response. Publish examples before implementation begins. A schema without an example message is easy for each teammate to interpret differently.

Use explicit local east/north fields with meter units in shared positions. Include the coordinate reference, cell-center convention, dataset version, and route model version. Ambiguous `x`, `y`, `lat`, and `lng` fields invite silent projection errors.

Keep schema validation at asset and worker boundaries. Malformed sizes, array-length mismatches, unsupported versions, missing units, and invalid endpoint fields should produce understandable errors. Internal components can use validated typed data instead of repeatedly validating the same values.

Write a concise interface note and place it where the team can find it. Include field names, optionality, status variants, units, versioning, event ownership, and one example of success and no-path behavior. The plan defines semantics; the interface note helps implementation move quickly.

Freeze the first contract at the opening coordination gate. Make later changes only when a real integration need appears, and update every example and consumer together. Avoid five competing revisions of the same coordinate shape.

Maintain one source of truth for the loaded region, current mission, request identity, route candidates, selected candidate, and view mode. The mission UI, map, and 3D component should receive derived state through clear props or events instead of keeping shadow copies.

Define which actions invalidate route results. Endpoint changes, policy changes, quality mode, model profile, region version, and round-trip choice can require recalculation. Layer visibility, camera orbit, and report-panel expansion should not.

Handle stale asynchronous responses centrally. If a new request supersedes an old one, ignore results that do not match the current request ID and bundle version. A late worker response must never replace the route the user just asked for.

Provide a worker lifecycle boundary that hides import and message details from Dhani. Surface progress, success, no path, invalid input, cancellation, timeout, and data errors as typed states. Map or report components should not inspect raw worker messages.

Ensure the worker can load in the built deployment as well as development. Bundlers have specific worker import patterns and asset URL behavior. Test a production build early rather than discovering at the deadline that the worker filename or data path is invalid.

Coordinate immutable bundle loading with the data owner. Validate manifest and byte lengths, check hashes where practical, and report which stage failed. The application should not show an empty map when the real problem is a missing raster or incorrect public path.

Keep the synthetic fixture explicit in development and tests. Make the production configuration point to a versioned real bundle. Before release, search the interface and default settings for fixture names, fake route metrics, or sample POIs that might remain visible accidentally.

The core application should run without a hosted backend, database, authentication provider, paid tile key, or generative AI service. The user discussion explicitly favors a deterministic algorithm and mentions limited Wi-Fi. Preserve that local and static friendliness.

If NASA Trek imagery is used at runtime, understand its tile capabilities, service availability, required attribution, and CORS behavior. Provide prepared assets or a graceful fallback where feasible. The route calculation must not depend on that external service staying online.

Build a public static release first. Select a hosting platform only when it meets the application and event submission constraints. The user's idea of Vercel hosting is an option, not a requirement to connect an account or purchase a domain.

Avoid registering a domain during the hackathon unless there is a specific documented need and the account holder authorizes the purchase. A stable free hosting URL and repository can meet the project link requirement. This role should make the deployment reachable, not create unrelated expense.

Create an accessible public repository or release package as appropriate. Include setup steps, data preparation notes, source credits, model limitations, and the demo. Do not commit large raw archives, credentials, personal data, or unreviewed third-party assets.

Use relative asset paths and test the deployed base URL. Static hosting may serve an application below a project prefix. Deep links and worker URLs can fail even when the root screen loads locally.

Configure the application to display a useful message when optional remote services are offline. Add sensible request timeouts and retry actions. Do not make a remote map tile outage appear as a valid absence of terrain data.

Preserve the local demonstration path. Package the built application and required processed assets so it can be served locally with the documented command. A direct `file://` launch may block workers or module imports, so document a simple local web server command.

Agree on asset budgets with the data and 3D owners. Measure the compressed bundle and initial load. Lazy-load optional textures and media. If the real browser package is too large, reduce display-only assets before removing analytical fields required for honest routing.

Define a release identifier that includes application version, region bundle version, and route-model version. Display it in the source/evidence area and include it in exports. Reproducible reports need enough information to reconstruct which application state generated them.

Set sensible browser support for the demonstration and test the actual target browser. Use current Chromium as a practical initial target, then test Firefox or Safari only if the integration time allows. Avoid claiming universal support without evidence.

Establish a quality gate appropriate to the small project: clean production build, typecheck, lint, meaningful unit tests, and a short browser journey. The request did not ask for an elaborate test program; keep checks focused on cross-component risks and critical numerical boundaries.

Run checks after meaningful integration points rather than waiting until all five people have merged. Early failures in imports, schemas, coordinate adapters, or Vite paths are much cheaper to fix when only one feature depends on them.

Own a small end-to-end journey test that launches the application, chooses a preset mission, requests a route, selects the result, opens the terrain view, and creates or previews the briefing. It should verify visible outcomes, not internal implementation trivia.

Use a stable synthetic dataset for automated checks. The test should not download live Mars data, contact NASA Trek, require a logged-in cloud account, or depend on changing external content. Real-data review can be a separate documented manual check.

Include important failure journeys: invalid bundle, no route, worker timeout or error, missing optional texture, and stale request. A resilient interface is important for a live demo because a single unavailable asset should not crash every feature.

Coordinate acceptance evidence from each owner. Ayush supplies cost/search checks, Dhani supplies interaction evidence, the data owner supplies geospatial validation, and the 3D owner supplies alignment/performance checks. You organize these into the release record rather than duplicating their specialist tests.

Keep a concise known-limitations document updated as decisions evolve. Include spatial resolution, quality semantics, modeled exclusions, unmodeled environment factors, round-trip capability, and headset status. Use the same facts in the UI, README, and submission response.

Do not write scientific conclusions for the data owner. Review wording for consistency and request source evidence where needed. If a claim cannot be supported within the release time, downgrade it to a proposal or remove it from the submission.

Set up shared progress communication around the gates in the project plan. Ask each owner for a visible artifact and a blocker summary at each checkpoint. A short typed contract example or bundle preview is more useful than a vague message that a feature is almost done.

Keep the branch and merge approach lightweight. Use one shared integration branch and small feature branches if the team is comfortable with Git. If Git experience is limited, agree on one editor/owner per file and commit often. Avoid five people resolving the same project file at once.

Do not impose complex worktree or release-branch machinery on a two-day prototype. The reference project uses detailed multi-agent batch rules that fit its much larger codebase, but this team has five human owners and a short event. Borrow the clarity, not the overhead.

Resolve merge conflicts with the relevant owner. Do not accept a conflict resolution that discards the shared schema, real-data loader, or route metric behavior just to regain a clean build. Run the affected checks after every integration repair.

Keep secrets out of Vite-exposed environment variables. Values with a public client prefix are bundled into browser code. The core project should avoid secrets entirely; if a private service later becomes necessary, keep its credential on a server and reconsider scope.

Do not add an LLM dependency for route explanation. Use computed metrics and transparent templates. If AI tools were used in development, follow the official submission form's disclosure question rather than implying that the planner itself uses AI.

Prepare the project README from what is actually released. State the challenge, user story, data sources, stack, run instructions, key route behaviors, limitations, credits, and links. Do not copy speculative roadmap features into the completed-feature section.

Maintain the submission draft early. The final text should explain the user problem, how NASA data flows through the project, why the route options differ, and what the tool cannot model. Make it readable to a judge who will not inspect the code.

Verify the application link in a fresh browser session. Check no authentication gate, CORS failure, broken fonts, missing worker, or dev-only data path. Capture the released URL and bundle version for the team's final record.

Verify the repository link or downloadable package in a clean environment. A working app on your machine is not proof that the public source includes required assets or setup instructions. Ask another teammate to follow the README on a different machine if time permits.

Own the short demonstration assembly. Confirm the 2026 guidance and local event requirements. Prepare a 25–28 second video if choosing video, leaving a safety margin under the reported 30-second maximum. A slide deck can be used if the organizer's current form confirms the seven-slide option.

The demo should show the actual released workflow: science target, route calculation, a meaningful comparison or honest equality, terrain-quality evidence, 3D registration, and credits. Avoid cutting between unrelated prototypes or using footage that implies unsupported rover control.

Record a clean backup take and retain the project files. If the application is unpredictable live, a capture of the actual working build is safer than an elaborate live-only performance. Ensure the recording demonstrates the real interface and not a mockup.

Check language and names against the official requirements. The current submission response says the project should be in English and that team members need listing; verify the project form itself. Leave placeholder names out of the final submission.

Do not submit a video or project page on behalf of others without the team's agreement on its accuracy. The team has authorized creating the documents and application plan, while public submission is a separate action owned by the registered team account.

Assemble source credits visibly and consistently. Check the README, in-app source drawer, video end frame, and submission page. A citation in one place does not automatically satisfy a user who encounters the imagery somewhere else.

Capture confirmation after the team submits. Save the public project URL, demo URL, repository URL, and timestamp. A prepared draft is not a submitted project, and a publicly accessible demo link should be checked from outside the team's session.

Track local deadlines in Europe/Rome time. Berlin and Milan share the same UTC offset on the event weekend, but use the event's stated local time and verify the local venue schedule. Leave a substantial buffer for login, upload, and permission problems.

At the initial contract gate, provide the runnable shell and shared schemas. At the route integration gate, connect the worker to the real bundle. At complete journey, connect map, terrain, and briefing. At release candidate, test public and local builds and freeze features.

Protect the effort budget by removing optional account systems, databases, complex state libraries, elaborate caching, analytics, telemetry, and authentication. They do not support the core Marswalk journey and can consume the hours needed for deployment and submission.

If one owner falls behind, discuss a reduced deliverable with that owner and update the product scope visibly. Do not silently take over all remaining work or pressure another teammate to absorb unbounded tasks. A reliable smaller result is easier to explain than a nominally complete but disconnected system.

Keep a short release checklist for the team: correct region, correct bundle version, three policies or justified grouping, accessible route result, 3D selected route, source credits, limitation text, public build, local fallback, demo, submission confirmation. Check facts, not merely that controls exist.

Prepare one final architecture sketch and one data-flow explanation. Make clear that offline preprocessing creates browser assets, a deterministic worker calculates routes, and the same result feeds map, 3D, and report. This helps judges understand the project's engineering without a long technical lecture.

Use the team-task file itself as a handoff record. As teammates choose the open roles, write their actual names beside those headings and agree on a shared check-in time. The role responsibilities remain broad so each person can create their own internal task list.

Your final handoff includes a runnable public application, source repository or package, shared contracts, integration evidence, README, limitations, source-credit review, short demo, and verified submission details. Clearly report any feature omitted or any environment not tested.

You are finished when the five areas operate as one truthful demonstration and the public submission reflects the actual release. The last milestone is a verified, publicly reachable project submission, not simply a green local build.

Balance the team through explicit time checks. An owner who has not received usable input from another area should raise the dependency early, use the agreed fixture, and continue on independent work. Integration is easier when people can test against a stable example instead of waiting for a perfect final asset.

Record decisions that change scientific meaning. A crop change, coordinate transform, quality interpretation, route limit, or display exaggeration should have a short written note and a version change where applicable. Small undocumented changes can make the demo, report, and code describe different results.

Keep the application configuration inspectable. Route defaults, asset locations, region version, and optional feature flags should live in a small documented configuration. Avoid burying important project assumptions across CSS, components, worker code, and build scripts.

Do not include a stale cached route after changing dataset versions. Cache keys must include all route-affecting inputs and version identifiers. If there is not enough time to make caching reliable, calculate again; the region is intentionally small.

Review browser console output and network requests before release. Remove noisy per-cell logging, failed optional requests, development overlays, and source-map assumptions that reveal local paths. Keep actionable errors while ensuring the presentation build feels stable.

Check the project on the actual projector or screen where it will be presented if possible. Browser zoom, screen resolution, and network conditions can change map layout. Keep an offline/local copy ready, and avoid requiring a last-minute package install during the judging slot.

Confirm that all visible distances and heights include units. Confirm that percentages name their denominator and that time estimates display their assumed speed. These small checks catch common misunderstandings that can make correct calculations sound authoritative beyond their evidence.

Review route candidate order and selected styling in both map and 3D views. The currently chosen candidate should be consistent after rerendering, resizing, or exporting. A report that names one route while the map highlights another is a release blocker.

Make sure the downloadable report contains no private paths or development machine details. Public artifacts should identify the dataset and software versions, but not disclose local usernames, attachment paths, or temporary workspace structure.

Keep generated files deterministic where practical. Stable JSON ordering and normalized metadata make it easier to compare a route result after a code change. Do not spend time building a cryptographic signing scheme; checksums and versioned bundles provide adequate prototype provenance.

Use a clear date convention in the report and source manifest. Distinguish calendar date from Mars sol when both appear. The application need not simulate a Martian clock, but it should not present an Earth date as if it were a mission sol.

Check whether external links or media licenses require additional context. Include direct product links rather than search result pages. If an original resource is temporarily unavailable, preserve the citation and explain the status instead of deleting provenance.

If the official form asks for a detailed description, retain a concise plain-language answer that fits the actual field limits. The project plan is intentionally long for internal implementation; submission text should make the same decisions understandable in a few focused paragraphs.

Ask another teammate to perform a cold-start walkthrough without narration. Note every moment they cannot identify the next action or interpret an essential metric. Fix the largest blockers before adding more presentation effects.

Do a final review against the challenge itself. The application should demonstrably integrate multiple NASA mission data contributions into a layered Martian map for a science-oriented Marswalk. A generic pathfinding game with a Mars skin would fail that central test.

Do a final review of the source register against the actual bundle. Remove products that were researched but not used from the interface's list of integrated data, or clearly mark them as further-reading references. A bibliography is not the same as data integration.

Make the deployed version's initial mission deterministic for the presentation. Preset endpoints and settings should load reliably, while users can still change them. This reduces live-demo setup time without turning the only route into a hard-coded animation.

Keep a backup of the accepted processed bundle and release artifacts in the shared team space. If hosting fails, the team can still show the local build and submit a stable repository or package link. Confirm that the backup itself contains only cleared assets.

After feature freeze, assign one person to drive the application and another to narrate the route rationale. Rehearse the handoff between map, profile, and 3D. A calm explanation of one real tradeoff is more effective than trying to expose every layer in thirty seconds.

Use remaining time for a final status note that names the verified build commit, published URL, tested bundle version, demo filename, submission status, and any deferred feature. This note gives the team a single reliable reference if a last-minute question arises.

Keep the local package easy to start after handoff. Include the runtime requirement and exact command in the README. Test the command from a clean shell so it does not accidentally rely on a globally installed development tool or an environment variable set only on your account.

Review dependency versions and licenses only to the degree needed for the chosen stack. Do not replace a working package at the deadline to chase the newest release. Lock the version that was tested and record any known browser limitation.

If deployment needs an environment variable, list its purpose and whether it is public. The route engine should not need secrets. A configuration value that affects data selection or model behavior belongs in the release record so users can reproduce the result.

Ensure that an interrupted upload can be retried without creating duplicate public artifacts or invalidating a working link. Keep the already tested version reachable until the replacement is verified. The user-facing project link should never point to an unfinished build.

Reserve a short window for contingency. If one final change breaks the deployment, revert that change and submit the last known-good version. Do not sacrifice a functional project to add an optional effect minutes before the cutoff.
