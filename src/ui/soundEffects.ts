/**
 * Pure Web Audio API telemetry synthesizer for Mars Pathfinder UI & 3D EVA walkthrough.
 * Zero external audio assets, zero console output, and safe no-ops in headless/jsdom/Node.
 */

export type SfxKind =
  | 'click'
  | 'search-tick'
  | 'route-complete'
  | 'off-path'
  | 'respawn'
  | 'arrive'
  | 'poi';

export interface SoundController {
  isMuted(): boolean;
  setMuted(muted: boolean): void;
  toggleMute(): boolean;
  play(kind: SfxKind, pitchFactor?: number): void;
  dispose(): void;
}

type AudioContextCtor = new () => AudioContext;

interface WindowWithAudio extends Window {
  AudioContext?: AudioContextCtor;
  webkitAudioContext?: AudioContextCtor;
}

interface MaybeUserActivation {
  userActivation?: {
    readonly hasBeenActive?: boolean;
  };
}

interface ActiveVoice {
  osc: OscillatorNode;
  gain: GainNode;
  startTime: number;
  stopped: boolean;
}

interface PendingCue {
  kind: SfxKind;
  pitchFactor: number | undefined;
}

interface ToneStep {
  type: OscillatorType;
  freqHz: number;
  endFreqHz?: number;
  offsetS: number;
  durationS: number;
  peakGain: number;
}

const GAIN_FLOOR = 0.0001;
const MASTER_GAIN = 0.5;
const SEARCH_TICK_THROTTLE_MS = 45;
const OFF_PATH_THROTTLE_MS = 200;
const MIN_PITCH_FACTOR = 0.5;
const MAX_PITCH_FACTOR = 2.0;
const MAX_ACTIVE_VOICES = 24;

let sharedAudioContext: AudioContext | null = null;
let audioPermanentlyUnavailable = false;
let sharedResumePromise: Promise<boolean> | null = null;
let sharedOneShotController: SoundController | null = null;

function getNowMs(): number {
  try {
    if (typeof globalThis.performance !== 'undefined' && typeof globalThis.performance.now === 'function') {
      return globalThis.performance.now();
    }
  } catch {
    // Fall back to Date.now()
  }
  return Date.now();
}

function getAudioContextCtor(): AudioContextCtor | null {
  try {
    if (typeof window === 'undefined') {
      return null;
    }
    const win = window as WindowWithAudio;
    const ctor = win.AudioContext ?? win.webkitAudioContext;
    return typeof ctor === 'function' ? ctor : null;
  } catch {
    return null;
  }
}

function isUserActivationBlocked(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }
  const nav = navigator as MaybeUserActivation;
  if (nav.userActivation === undefined) {
    return false;
  }
  return nav.userActivation.hasBeenActive === false;
}

function isPermanentCtorError(err: unknown): boolean {
  if (typeof err === 'object' && err !== null && 'name' in err) {
    const name = String((err as { name: unknown }).name);
    return name === 'NotSupportedError' || name === 'SecurityError';
  }
  return false;
}

function getOrCreateSharedContext(): AudioContext | null {
  if (audioPermanentlyUnavailable) {
    return null;
  }
  if (sharedAudioContext !== null) {
    const state: string = sharedAudioContext.state;
    if (state !== 'closed') {
      return sharedAudioContext;
    }
    sharedAudioContext = null;
    sharedResumePromise = null;
  }

  const Ctor = getAudioContextCtor();
  if (Ctor === null) {
    audioPermanentlyUnavailable = true;
    return null;
  }

  if (isUserActivationBlocked()) {
    return null;
  }

  try {
    sharedAudioContext = new Ctor();
    return sharedAudioContext;
  } catch (err: unknown) {
    if (isPermanentCtorError(err)) {
      audioPermanentlyUnavailable = true;
    }
    sharedAudioContext = null;
    return null;
  }
}

function resumeSharedContext(ctx: AudioContext): Promise<boolean> {
  const state: string = ctx.state;
  if (state === 'running') {
    return Promise.resolve(true);
  }
  if (state === 'closed' || isUserActivationBlocked()) {
    return Promise.resolve(false);
  }
  if (sharedResumePromise !== null) {
    return sharedResumePromise;
  }

  try {
    const resumeResult = ctx.resume();
    sharedResumePromise = Promise.resolve(resumeResult)
      .then(() => {
        const nextState: string = ctx.state;
        return nextState === 'running';
      })
      .catch(() => false)
      .finally(() => {
        sharedResumePromise = null;
      });
    return sharedResumePromise;
  } catch {
    sharedResumePromise = null;
    return Promise.resolve(false);
  }
}

function clampPitchFactor(pitchFactor: number | undefined): number {
  if (pitchFactor === undefined || !Number.isFinite(pitchFactor)) {
    return 1;
  }
  return Math.min(MAX_PITCH_FACTOR, Math.max(MIN_PITCH_FACTOR, pitchFactor));
}

function buildToneSteps(kind: SfxKind, pitchFactor: number | undefined): readonly ToneStep[] {
  switch (kind) {
    case 'click':
      return [
        { type: 'sine', freqHz: 880, endFreqHz: 660, offsetS: 0, durationS: 0.045, peakGain: 0.07 },
      ];
    case 'search-tick': {
      const pitch = clampPitchFactor(pitchFactor);
      return [
        { type: 'triangle', freqHz: 580 * pitch, offsetS: 0, durationS: 0.028, peakGain: 0.045 },
      ];
    }
    case 'poi':
      return [
        { type: 'sine', freqHz: 740, offsetS: 0, durationS: 0.06, peakGain: 0.065 },
        { type: 'sine', freqHz: 1108.73, offsetS: 0.045, durationS: 0.105, peakGain: 0.06 },
      ];
    case 'route-complete':
      return [
        { type: 'sine', freqHz: 523.25, offsetS: 0, durationS: 0.24, peakGain: 0.065 },
        { type: 'sine', freqHz: 659.25, offsetS: 0.035, durationS: 0.24, peakGain: 0.06 },
        { type: 'triangle', freqHz: 783.99, offsetS: 0.07, durationS: 0.28, peakGain: 0.055 },
      ];
    case 'respawn':
      return [
        { type: 'sine', freqHz: 440, offsetS: 0, durationS: 0.12, peakGain: 0.065 },
        { type: 'sine', freqHz: 587.33, offsetS: 0.055, durationS: 0.13, peakGain: 0.065 },
        { type: 'sine', freqHz: 880, offsetS: 0.11, durationS: 0.16, peakGain: 0.07 },
      ];
    case 'off-path':
      // Total span 160 ms (< 200 ms throttle) so consecutive buzzes cannot overlap.
      return [
        { type: 'sawtooth', freqHz: 145, endFreqHz: 130, offsetS: 0, durationS: 0.065, peakGain: 0.06 },
        { type: 'sawtooth', freqHz: 115, endFreqHz: 98, offsetS: 0.085, durationS: 0.075, peakGain: 0.065 },
      ];
    case 'arrive':
      return [
        { type: 'sine', freqHz: 392.0, offsetS: 0, durationS: 0.34, peakGain: 0.06 },
        { type: 'sine', freqHz: 493.88, offsetS: 0.06, durationS: 0.34, peakGain: 0.06 },
        { type: 'sine', freqHz: 587.33, offsetS: 0.12, durationS: 0.36, peakGain: 0.06 },
        { type: 'triangle', freqHz: 783.99, offsetS: 0.18, durationS: 0.4, peakGain: 0.06 },
      ];
  }
}

export function createSoundController(initialMuted = false): SoundController {
  let muted = Boolean(initialMuted);
  let disposed = false;
  let lastSearchTickMs = -Infinity;
  let lastOffPathMs = -Infinity;
  let pendingCue: PendingCue | null = null;
  let masterGain: GainNode | null = null;
  let masterGainCtx: AudioContext | null = null;
  let gestureListenersInstalled = false;
  const activeVoices = new Set<ActiveVoice>();

  const stopSingleVoice = (voice: ActiveVoice, ctx: AudioContext | null): void => {
    activeVoices.delete(voice);
    try {
      voice.osc.onended = null;
      if (!voice.stopped) {
        voice.stopped = true;
        const now = ctx !== null ? ctx.currentTime : 0;
        voice.osc.stop(Math.max(now, voice.startTime));
      }
    } catch {
      // Ignore InvalidStateError when stopping unstarted/already-stopped nodes
    }
    try {
      voice.osc.disconnect();
    } catch {
      // Ignore disconnect errors on closed contexts
    }
    try {
      voice.gain.disconnect();
    } catch {
      // Ignore disconnect errors on closed contexts
    }
  };

  const stopAllActiveVoices = (): void => {
    const snapshot = Array.from(activeVoices);
    activeVoices.clear();
    const ctx = masterGainCtx ?? sharedAudioContext;
    for (const voice of snapshot) {
      stopSingleVoice(voice, ctx);
    }
  };

  const ensureMasterGain = (ctx: AudioContext): GainNode | null => {
    if (masterGain !== null && masterGainCtx === ctx) {
      return masterGain;
    }
    if (masterGain !== null) {
      try {
        masterGain.disconnect();
      } catch {
        // Ignore stale gain disconnect
      }
      masterGain = null;
      masterGainCtx = null;
    }
    try {
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(muted ? 0 : MASTER_GAIN, ctx.currentTime);
      gain.connect(ctx.destination);
      masterGain = gain;
      masterGainCtx = ctx;
      return gain;
    } catch {
      return null;
    }
  };

  const removeGestureListeners = (): void => {
    if (!gestureListenersInstalled || typeof window === 'undefined') {
      return;
    }
    gestureListenersInstalled = false;
    try {
      window.removeEventListener('pointerdown', onFirstGesture, true);
      window.removeEventListener('keydown', onFirstGesture, true);
    } catch {
      // Ignore listener cleanup errors
    }
  };

  const canPlayNowForThrottle = (kind: SfxKind, nowMs: number): boolean => {
    if (kind === 'search-tick') {
      return nowMs - lastSearchTickMs >= SEARCH_TICK_THROTTLE_MS;
    }
    if (kind === 'off-path') {
      return nowMs - lastOffPathMs >= OFF_PATH_THROTTLE_MS;
    }
    return true;
  };

  const recordThrottleStamp = (kind: SfxKind, nowMs: number): void => {
    if (kind === 'search-tick') {
      lastSearchTickMs = nowMs;
    } else if (kind === 'off-path') {
      lastOffPathMs = nowMs;
    }
  };

  const scheduleCue = (ctx: AudioContext, kind: SfxKind, pitchFactor: number | undefined): boolean => {
    if (disposed || muted) {
      return false;
    }
    const nowMs = getNowMs();
    if (!canPlayNowForThrottle(kind, nowMs)) {
      return false;
    }

    const master = ensureMasterGain(ctx);
    if (master === null) {
      return false;
    }

    const steps = buildToneSteps(kind, pitchFactor);
    const t0 = ctx.currentTime;
    let startedAny = false;

    for (const step of steps) {
      while (activeVoices.size >= MAX_ACTIVE_VOICES) {
        const oldest = activeVoices.values().next();
        if (oldest.done) {
          break;
        }
        stopSingleVoice(oldest.value, ctx);
      }

      let osc: OscillatorNode | null = null;
      let gain: GainNode | null = null;
      let voice: ActiveVoice | null = null;
      try {
        osc = ctx.createOscillator();
        gain = ctx.createGain();
        const startTime = t0 + step.offsetS;
        const endTime = startTime + Math.max(0.015, step.durationS);
        const attackTime = startTime + Math.min(0.008, step.durationS * 0.25);

        // Initialize to non-zero floor before wiring so GainNode never outputs full scale or throws on ramp.
        gain.gain.setValueAtTime(GAIN_FLOOR, startTime);
        gain.gain.linearRampToValueAtTime(Math.max(GAIN_FLOOR, step.peakGain), attackTime);
        gain.gain.exponentialRampToValueAtTime(GAIN_FLOOR, endTime);

        osc.type = step.type;
        osc.frequency.setValueAtTime(Math.max(20, step.freqHz), startTime);
        if (step.endFreqHz !== undefined && step.endFreqHz !== step.freqHz) {
          osc.frequency.exponentialRampToValueAtTime(Math.max(20, step.endFreqHz), endTime);
        }

        osc.connect(gain);
        gain.connect(master);

        voice = { osc, gain, startTime, stopped: false };
        activeVoices.add(voice);

        const capturedVoice = voice;
        const capturedOsc = osc;
        const capturedGain = gain;
        capturedOsc.onended = () => {
          capturedVoice.stopped = true;
          activeVoices.delete(capturedVoice);
          try {
            capturedOsc.onended = null;
            capturedOsc.disconnect();
          } catch {
            // Ignore cleanup errors
          }
          try {
            capturedGain.disconnect();
          } catch {
            // Ignore cleanup errors
          }
        };

        osc.start(startTime);
        osc.stop(endTime + 0.005);
        startedAny = true;
      } catch {
        if (voice !== null) {
          activeVoices.delete(voice);
          stopSingleVoice(voice, ctx);
        } else {
          if (osc !== null) {
            try {
              osc.onended = null;
              osc.disconnect();
            } catch {
              // Ignore
            }
          }
          if (gain !== null) {
            try {
              gain.disconnect();
            } catch {
              // Ignore
            }
          }
        }
      }
    }

    if (startedAny) {
      recordThrottleStamp(kind, nowMs);
    }
    return startedAny;
  };

  const triggerResumeAndFlush = (ctx: AudioContext): void => {
    void resumeSharedContext(ctx).then((running) => {
      if (disposed || muted || !running) {
        if (!running) {
          pendingCue = null;
        }
        return;
      }
      const next = pendingCue;
      pendingCue = null;
      const state: string = ctx.state;
      if (state === 'running') {
        removeGestureListeners();
        if (next !== null) {
          scheduleCue(ctx, next.kind, next.pitchFactor);
        }
      }
    });
  };

  function onFirstGesture(): void {
    if (disposed || muted) {
      return;
    }
    const ctx = getOrCreateSharedContext();
    if (ctx === null) {
      return;
    }
    const state: string = ctx.state;
    if (state === 'running') {
      removeGestureListeners();
      return;
    }
    if (state === 'suspended' || state === 'interrupted') {
      triggerResumeAndFlush(ctx);
    }
  }

  const installGestureListeners = (): void => {
    if (gestureListenersInstalled || disposed || typeof window === 'undefined') {
      return;
    }
    if (getAudioContextCtor() === null) {
      return;
    }
    try {
      window.addEventListener('pointerdown', onFirstGesture, { capture: true, passive: true });
      window.addEventListener('keydown', onFirstGesture, { capture: true, passive: true });
      gestureListenersInstalled = true;
    } catch {
      gestureListenersInstalled = false;
    }
  };

  installGestureListeners();

  return {
    isMuted(): boolean {
      return muted;
    },

    setMuted(nextMuted: boolean): void {
      try {
        muted = Boolean(nextMuted);
        if (disposed) {
          return;
        }
        if (muted) {
          pendingCue = null;
          if (masterGain !== null && masterGainCtx !== null) {
            try {
              const now = masterGainCtx.currentTime;
              masterGain.gain.cancelScheduledValues(now);
              masterGain.gain.setValueAtTime(0, now);
            } catch {
              // Ignore
            }
          }
          stopAllActiveVoices();
          return;
        }

        const ctx = getOrCreateSharedContext();
        if (ctx === null) {
          return;
        }
        if (masterGain !== null && masterGainCtx === ctx) {
          try {
            const now = ctx.currentTime;
            masterGain.gain.cancelScheduledValues(now);
            masterGain.gain.setValueAtTime(MASTER_GAIN, now);
          } catch {
            // Ignore
          }
        }
        const state: string = ctx.state;
        if (state === 'suspended' || state === 'interrupted') {
          triggerResumeAndFlush(ctx);
        } else if (state === 'running') {
          removeGestureListeners();
        }
      } catch {
        // Keep public API strictly non-throwing
      }
    },

    toggleMute(): boolean {
      this.setMuted(!muted);
      return muted;
    },

    play(kind: SfxKind, pitchFactor?: number): void {
      try {
        if (disposed || muted) {
          return;
        }
        const ctx = getOrCreateSharedContext();
        if (ctx === null) {
          return;
        }
        const state: string = ctx.state;
        if (state === 'running') {
          removeGestureListeners();
          scheduleCue(ctx, kind, pitchFactor);
          return;
        }
        if (state === 'suspended' || state === 'interrupted') {
          pendingCue = { kind, pitchFactor };
          triggerResumeAndFlush(ctx);
        }
      } catch {
        // Keep public API strictly non-throwing
      }
    },

    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      pendingCue = null;
      try {
        removeGestureListeners();
        stopAllActiveVoices();
        if (masterGain !== null) {
          try {
            masterGain.disconnect();
          } catch {
            // Ignore
          }
          masterGain = null;
          masterGainCtx = null;
        }
      } catch {
        // Keep dispose strictly non-throwing and idempotent
      }
    },
  };
}

export function playSfxOnce(kind: SfxKind, muted = false, pitchFactor?: number): void {
  try {
    if (muted) {
      return;
    }
    if (sharedOneShotController === null) {
      sharedOneShotController = createSoundController(false);
    }
    sharedOneShotController.play(kind, pitchFactor);
  } catch {
    // Keep public API strictly non-throwing
  }
}
