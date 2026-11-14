# Release checklist — MARS PATHFINDER

Owner of this document: **Role C** (integration). Update it as items are verified.
Release candidate: commit `cc3a19a` · app `0.1.0` · bundle `jezero-west-hirise-v0.1.0` · model `placeholder-astar-0.2.0`.
Live URL: https://hritvikarora.github.io/marspineapple/ · Repo: https://github.com/hritvikarora/marspineapple

**Deadline.** The official 2026 overview reports the submission window closing on **15 Nov 2026, 23:59 local time**.
The **Milan local event** presentation/judging cutoff is **not verified** (see §7). Treat the earlier time as binding.

Legend: `[x]` verified (with evidence and date) · `[ ]` open (owner in **bold**). Times are Europe/Rome.

---

## 1. Build, quality gate and audit (re-run on the final commit)

Commands, from a clean clone:

```bash
npm ci
npm run typecheck && npm run lint && npm test && npm run sim
npm run build && npm run audit && npm run audit:release
npm run build:e2e && npm run e2e
cd dist && python3 -m http.server 8080   # in another shell: npm run smoke -- http://localhost:8080/
```

- [x] Typecheck, lint, 156/156 vitest tests (includes the simulation suite and real-data tests), `npm run sim`
      (38 cases, 0 invariant violations) — CI run **43603537638** on `cc3a19a`, 14 Nov 15:13.
- [x] `npm run build` + `npm run audit` + `npm run audit:release` pass. Gzip: entry JS 79.5 KB / 150 KB budget,
      all JS 83.9 KB / 450 KB, worker 4.0 KB, CSS 0.5 KB; HiRISE bundle 10.30 MB gz / 15 MB; total dist 14.5 MB raw / 60 MB.
      No console calls, secrets, local paths or source maps in `dist/` — CI run 43603537638.
- [x] Browser e2e 21/21 (real-data release build, synthetic journey with golden export, 12 failure modes) — CI run 43603537638.
- [x] Headless smoke against `dist/` served under `/marspineapple/` by a plain static server (`python3 -m http.server`),
      i.e. the offline/local package path works — CI run 43603537638.
- [ ] Re-run the full command block above on the **final** commit after the last merge (Ayush's solver, Dhani's UI,
      Role B's 3D) and update the evidence here — **Role C**.
- [ ] Local offline package (plan 4.3): in a *fresh* shell on a second machine, `npm ci && npm run build`, serve `dist/`
      with `python3 -m http.server`, route P3 → P4 with Wi-Fi off — **Role C** with one teammate.

## 2. Data bundle integrity

- [x] `npm run validate-bundle -- public/bundles/jezero-west-hirise-v0.1.0` and `…/jezero-west-ctx20m-v0.1.0`: VALID
      (14 Nov, merge `ff3431e`); loader verifies SHA-256 of every layer in `tests/realdata.test.ts` (commit `cc3a19a`).
- [x] **Live** bundle hashes: all five HiRISE layers and the texture downloaded from the Pages URL match the manifest
      byte lengths and SHA-256 (checked 14 Nov 15:45).
- [x] Production serves the real bundle: `public/bundles/index.json` `release = jezero-west-hirise-v0.1.0`,
      `dev = synthetic-v0` (commit `7e36634`); no synthetic badge/banner in the production build (e2e `release.spec.ts`).
- [ ] Role A confirms the data note is final (source DOIs, `verticalReference` wording, POI positional caveats) and that
      no further bundle version is coming; if one is, re-run §1–§3 — **Role A (Irene Plemic)**.

## 3. Live site checks (fresh browser profile)

- [x] Loads with no auth wall, worker starts, header shows
      `app 0.1.0 · bundle jezero-west-hirise-v0.1.0 · model placeholder-astar-0.2.0`; route P3 → P4 succeeds (842 ms);
      no console errors or failed requests — headless Chrome with a fresh profile, 14 Nov 15:15 and 15:45.
- [x] **No-WebGL fallback** on the live site: 3D degrades to the 2D map with "3D view unavailable", map/profile/briefing
      stay in sync — `npm run smoke:no-webgl` against the live URL, 14 Nov 15:45.
- [ ] Manual check on a real laptop in an **incognito** window (Chrome) and on one other browser (Firefox or Safari):
      P3 → P4, P4 → P5, P3 → P5, 3D toggle, export JSON, print preview. Note browser + version here — **Role C**.
- [ ] Cold-start walkthrough by a teammate who has not seen the app, no narration (plan 4.2); log confusing states and
      fix or document them — **Dhani** (UI) with **Role C**.

## 4. Content review (plan 4.2)

- [x] Units shown on all metrics (`m`, `°`, `%` with "of horizontal distance" as denominator) — briefing text asserted in e2e.
- [x] No synthetic fixture labels in production defaults (synthetic strings in the bundle are only shown when a
      synthetic manifest is loaded; production loads HiRISE) — checked in `dist/` 14 Nov.
- [ ] No time estimates are shown (none in v1 metrics, INTERFACE §9 item 9). If added, show the assumed speed — **Ayush** / **Dhani**.
- [ ] Credits match **only integrated** data: HiRISE DTM, HiRISE orthomosaic (texture), CTX DTM (+ CTX ortho for the fallback
      texture), JPL rover waypoints (POI positions). POI descriptions mention Mastcam-Z panoramas, which are **not** integrated —
      reword or integrate. NASA Trek is credited only if tiles are enabled. Same list in README, in-app, submission text —
      **Role C** + **Role A (Irene Plemic)**.
- [ ] In-app source/credit display: the UI currently shows the manifest *limitations* in the briefing but no source list —
      **Dhani**.
- [ ] Calendar dates vs Mars sols clearly distinguished wherever both appear (POI text uses sols; manifest `createdDate`
      is an Earth date) — **Dhani** + **Role A (Irene Plemic)**.

## 5. Contracts and team sign-off

- [ ] INTERFACE.md §9 open decisions signed off (quality/exclusion codes, primary distance, grade unit, edge quality rule,
      raster format, round trip, strict-unsupported, cancellation, timing estimates, bundle selection, display assets).
      Record who agreed and when next to each item — **Role C** collects; **Ayush**, **Dhani**, **Role A**, **Role B** sign.
- [ ] Ayush's solver replaces `src/routing/placeholderEngine.ts`, bumps `MODEL_VERSION`, passes `npm run sim:test`
      (see docs/SIMULATION-FOR-AYUSH.md); then `npm run sim:update-golden`, `npm run examples`, `npm run e2e:update-golden` — **Ayush**.
- [ ] EVA limits (placeholder 25° max terrain slope, 20° max edge grade) replaced or confirmed against project-plan.md — **Ayush**.
- [ ] Role B's 3D terrain replaces the placeholder in `src/terrain3d/` (lazy chunk, keeps `data-testid="terrain-view"`
      and the props); audit budgets still pass — **Role B**.
- [ ] Dhani's UI replaces the stubs in `src/ui/`, keeping the `data-testid`s listed in README → Testing — **Dhani**.

## 6. Repository and access

- [x] Collaborators with access (GitHub API, 14 Nov): `hritvikarora` (owner), `Gabryg07`, `AyushGahtori`,
      `ireneplemic-cmyk`, `dhanisharmadev`.
- [ ] **Repository is PRIVATE** (checked 14 Nov 15:45). Make it **public** before submission, after a last review that it
      contains no credentials, personal data or large raw archives (`scripts/data/raw/` is gitignored) — **repo owner
      (hritvikarora)** with team agreement. Note: GitHub Pages on a private repo may depend on the account plan; re-check
      the live URL right after the visibility change.
- [ ] Roster: every team member is listed on the submission form and matches the five collaborators above — **Role C** + team.
- [ ] Tag the submitted commit (e.g. `v0.1.0-submission`) and record hash, bundle version, model version, URLs and
      submission timestamp in §8 — **Role C**.

## 7. Event rules

- [ ] **Milan local deadline**: confirm the local presentation/judging cutoff from the Milan event page or a teammate who
      attended the kickoff (do not contact organisers without team approval) — **Role C** + team.
- [ ] Confirm the current 2026 rules for the demo: maximum video length (the plan reports **30 s**, so it targets
      25–28 s) or the slide-deck option, and required links — **Role C**.
- [ ] Confirm the AI-use disclosure question on the form and answer it accurately (the planner itself uses no AI) — team.

## 8. Demo and submission

- [ ] Demo video recorded from the **live** build following docs/DEMO-SCRIPT.md, within the confirmed time limit;
      raw capture + one backup take saved in the team drive — **Role C** (assembly), footage reviewed by the team.
- [ ] Submission form filled with plain-language text (problem, how NASA data flows through the app, why routes differ,
      what it cannot model), repo link, live URL, demo link; links opened from an incognito session — **Role C**, team agrees on text.
- [ ] Final release record:

| Field | Value |
|---|---|
| Commit | _tbd_ |
| App / bundle / model | 0.1.0 / jezero-west-hirise-v0.1.0 / _tbd_ |
| Live URL | https://hritvikarora.github.io/marspineapple/ |
| Repo (public) | https://github.com/hritvikarora/marspineapple |
| Demo link | _tbd_ |
| Submitted at (Europe/Rome) | _tbd_ |
