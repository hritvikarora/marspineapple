# Debate Log — `sfx-audio` (`src/ui/soundEffects.ts`)

Date: 2026-11-14  
Branch: `merge/integration`  
Model Challenged Against: `grok-4.7-high` (Cursor CLI `agent -p --trust --mode ask`)

---

## Proposed Decision

Design `src/ui/soundEffects.ts` as a self-contained, zero-asset Web Audio API synthesizer exposing:
- `SfxKind = 'click' | 'search-tick' | 'route-complete' | 'off-path' | 'respawn' | 'arrive' | 'poi'`
- `SoundController` (`isMuted`, `setMuted`, `toggleMute`, `play`, `dispose`)
- `createSoundController(initialMuted?: boolean): SoundController`
- `playSfxOnce(kind: SfxKind, muted?: boolean, pitchFactor?: number): void`

Initial design:
1. Lazy `AudioContext` (`window.AudioContext ?? window.webkitAudioContext`) creation on first unmuted `play()` wrapped in `try/catch`, caching unavailability/errors.
2. When `ctx.state === 'suspended'`, call `ctx.resume().catch(() => undefined)` without throwing or logging to `console.*`.
3. Throttle `search-tick` (`>= 45 ms`) and `off-path` (`>= 200 ms`).
4. Synthesize distinct Mars telemetry envelopes (`click`, `search-tick`, `route-complete`, `off-path`, `respawn`, `arrive`, `poi`) using oscillators and `GainNode` ramps (`>= 0.0001`), disconnecting nodes in `onended` and closing the `AudioContext` in `dispose()`.

---

## Grok's Critique & Counter-suggestions

`grok-4.7-high` challenged several subtle Web Audio, Playwright, React Strict Mode, and TypeScript edge cases:

1. **Autoplay Intervention Warnings & Permanent-Failure Caching:**
   - Playwright `consoleGuard` fails on `console.error` and `pageerror` (e.g., an uncaught `resume()` `NotAllowedError` rejection), while Chromium logs an autoplay intervention warning if `new AudioContext()` or `resume()` is called before user activation.
   - Do **not** cache a temporary autoplay block as permanent "no audio". Only treat missing `window`/`AudioContext` or `NotSupportedError`/`SecurityError` as permanent no-op.
   - Check `navigator.userActivation?.hasBeenActive` before constructing or resuming `AudioContext`.
   - Call `resume()`/create synchronously inside `setMuted(false)` / `toggleMute()` when unmuting so iOS Safari accepts the gesture call stack, and deduplicate in-flight `resume()` promises so 60 Hz callers don't spam `resume()`.

2. **Suspended Playback Handling:**
   - While `resume()` is in flight (`ctx.state === 'suspended' || 'interrupted'`), neither drop the sound silently nor stack oscillators on a frozen `currentTime` (which blasts all queued sounds simultaneously upon resume).
   - Keep a single latest pending cue slot while `resume()` is pending; flush at most that one cue if still alive, unmuted, and `state === 'running'` when `resume()` settles; clear the slot on rejection or mute/dispose.

3. **Hardware `AudioContext` Cap & React Strict Mode:**
   - Browsers cap hardware `AudioContext` instances (~6), and `close()` frees slots asynchronously. Calling `create + close` per `playSfxOnce` or closing a shared context on React Strict Mode dev cleanup risks hitting the cap or killing the remount's context.
   - Share **one module-level `AudioContext`** across controllers and `playSfxOnce`, recreate only if `state === 'closed'`, and have `dispose()` stop/disconnect only that controller's active nodes and listeners (idempotently) without closing the shared context.
   - Ensure `playSfxOnce(..., muted=true)` does not mutate shared mute state.

4. **Throttle, Pitch Clamping & No-Throw Guarantee:**
   - Use leading-edge timestamp checks (`performance.now?.() ?? Date.now()`) with initial stamps at `-Infinity` (never `0`, since early `performance.now()` can be `< 45 ms`), advancing the stamp only when a voice actually starts.
   - Keep `off-path` total duration (`< 200 ms`) shorter than its `200 ms` throttle so consecutive buzzes never overlap.
   - Clamp `pitchFactor` (`Number.isFinite` into `[0.5, 2]`) and apply it only to `search-tick` so chords aren't accidentally transposed.
   - Wrap all public methods in `noexcept` guards so no Web Audio `RangeError`/`InvalidStateError` can escape into React handlers and trigger `pageerror`/`console.error`.

5. **Envelope Ramps & Node Teardown:**
   - Initialize `GainNode.gain` to the non-zero floor (`0.0001`) *before* connecting `osc -> gain -> masterGain` and before `exponentialRampToValueAtTime` (otherwise `GainNode` defaults to `1` and pops, or throws if `<= 0`).
   - Use a shared `t0 = ctx.currentTime` across chord notes, disconnect nodes safely inside `osc.onended`, and in `dispose()` clear `onended`, call `osc.stop(Math.max(now, scheduledStart))` so staggered future notes don't throw `InvalidStateError`, and disconnect the controller's master gain.
   - Keep per-voice peak gains modest (`~0.045–0.075`) through a controller master gain (`0.5`) and enforce a small polyphony cap.
   - Never touch `window`/`AudioContext` at module import time (Node Vitest safety).

---

## Final Refined Decision

Adopt all architectural refinements into `src/ui/soundEffects.ts`:
1. **Zero Top-Level Browser Reads & Strict Types:** No `window`, `document`, `navigator`, or `AudioContext` access at module evaluation time; zero `any`; zero `console.*`; compliant with `strict` and `noUncheckedIndexedAccess`.
2. **Single Shared `AudioContext` Lifecycle:**
   - Lazily resolve `window.AudioContext ?? window.webkitAudioContext` inside `try/catch`; cache permanent unavailability only when missing or constructor throws `NotSupportedError`/`SecurityError`.
   - Gate creation and `resume()` on `navigator.userActivation?.hasBeenActive !== false` (when `userActivation` is present) so Chromium never emits autoplay warnings on pre-gesture calls.
   - Recreate if `ctx.state === 'closed'`. Deduplicate concurrent `resume()` calls via a single shared in-flight promise.
   - `setMuted(false)` and `toggleMute()` (to unmuted) eagerly warm/resume the context inside the click handler stack; `setMuted(true)` immediately zeroes the controller's `GainNode` and stops its active voices.
3. **Single-Slot Pending Cue During Resume:** Overwrite a single pending cue while `resume()` is settling; play at most that single cue once `ctx.state === 'running'` if still alive and unmuted; clear on rejection, mute, or `dispose()`.
4. **Leading-Edge Throttles & Clamped Pitch:** `-Infinity` initial stamps; `>= 45 ms` throttle on `search-tick` (pitch-clamped `[0.5, 2]`), `>= 200 ms` throttle on `off-path` (160 ms double low buzz); advance stamps only on actual voice scheduling.
5. **Safe Envelopes & Idempotent `dispose()`:** Set `gain = 0.0001` before wiring, connect `osc -> gain -> controllerMaster -> ctx.destination`, enforce polyphony cap (`24`), clean up in `osc.onended`, and in `dispose()` stop active voices at `Math.max(ctx.currentTime, voice.startTime)`, disconnect controller master + listeners, and never throw.
6. **`playSfxOnce`:** Delegates to a lazily created unmuted internal controller sharing the single `AudioContext`, returning early when `muted === true` without affecting global state.


---

## Pass 2 Exam-Checker Audit & Applied Fixes (`grok-4.7-high`)

`grok-4.7-high` audited the written `src/ui/soundEffects.ts` (`task-817`):
- **Passed cleanly:** headless/jsdom missing `AudioContext`, Safari `webkitAudioContext`, absent/`false` `navigator.userActivation`, suspended context resume slot, `dispose()` safety, zero `console.*`, zero `any`, `noUncheckedIndexedAccess`.
- **Concrete defects caught & fixed immediately:**
  1. A throwing `window.AudioContext` getter escaped `getAudioContextCtor()` (called outside `try/catch` in `installGestureListeners`) — wrapped `getAudioContextCtor()` in `try/catch` returning `null`.
  2. `scheduleCue()` left a started voice in `activeVoices` if `osc.start`/`osc.stop` threw after `activeVoices.add(voice)` — hoisted `let voice: ActiveVoice | null = null` and deleted + stopped `voice` via `stopSingleVoice(voice, ctx)` in `catch`.
