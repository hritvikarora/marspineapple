// Outdoor background sound: four real recordings of the Martian wind made by the SuperCam microphone on Perseverance
// (NASA PDS, mars2020_supercam, data_calibrated_audio, "atm" passive recordings). They play one after another in a loop,
// crossfaded, only when the astronaut is outside the habitat. Processing for playback: 18 Hz-4 kHz band, loudness levelled.
// Most of the wind energy is below 100 Hz, so on small speakers it is a low rumble: that is what it really sounds like.
const CLIPS = ['mars_sol0004', 'mars_sol0685', 'mars_sol0690', 'mars_sol0697'], FADE = 3;

export class Ambience {
  constructor(root) { this.root = root; this.on = false; this.i = 0; this.buf = []; this.out = 0; this.vol = 0.6; }
  setVolume(v) { this.vol = v; }   // 0..1, from the start menu
  // browsers start audio only after a gesture: call this from a click, key or the VR button
  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ctx = this.ctx = new AC(); this.master = ctx.createGain(); this.master.gain.value = 0; this.master.connect(ctx.destination);
    this.load(0).then(() => this.next()); CLIPS.forEach((_, i) => i && this.load(i));
  }
  load(i) { return this.buf[i] ??= fetch(`${this.root}sounds/${CLIPS[i]}.mp3`).then(r => r.arrayBuffer()).then(a => this.ctx.decodeAudioData(a)).catch(e => (console.warn('ambience', e), null)); }
  async next() {
    const b = await this.load(this.i); this.i = (this.i + 1) % CLIPS.length; if (!b) return void setTimeout(() => this.next(), 1000);
    const ctx = this.ctx, src = ctx.createBufferSource(), g = ctx.createGain(), t = ctx.currentTime, d = b.duration;
    src.buffer = b; src.connect(g); g.connect(this.master);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + FADE); g.gain.setValueAtTime(1, t + d - FADE); g.gain.linearRampToValueAtTime(0, t + d);
    src.start(t); setTimeout(() => this.next(), (d - FADE) * 1000);   // the next clip fades in while this one fades out
  }
  // outside: fade the master up; inside the habitat: fade it down
  update(dt, outside) {
    if (!this.ctx) return; const target = outside ? this.vol * 0.8 : 0; this.out += (target - this.out) * Math.min(1, dt * 1.5);
    this.master.gain.setTargetAtTime(this.out, this.ctx.currentTime, 0.05);
  }
}
