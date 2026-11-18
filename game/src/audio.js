// audio.js — every sound in SOLCOSTA is synthesized with WebAudio: no audio
// files, no network. Engine hum, sirens, gunshots, punches, chimes and a
// low synthwave music loop. Starts on the first user gesture.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicOn = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenTimer = 0;
  }

  /** Call from a click / key gesture. Safe to call repeatedly. */
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.startMusic();
    this.startEngine();
  }

  now() { return this.ctx ? this.ctx.currentTime : 0; }

  /** Short filtered noise burst: gunshots, crashes, punches. */
  noiseBurst(dur, freq, vol, type = 'lowpass') {
    if (!this.ctx) return;
    const t = this.now();
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = type; filt.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filt); filt.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur);
  }

  /** One oscillator note with an envelope. */
  tone(freq, dur, vol, type = 'sine', slideTo = null, delay = 0) {
    if (!this.ctx) return;
    const t = this.now() + delay;
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  gunshot() { this.noiseBurst(0.14, 1800, 0.5, 'bandpass'); this.tone(160, 0.1, 0.3, 'square', 60); }
  punch() { this.noiseBurst(0.09, 500, 0.4); this.tone(120, 0.08, 0.25, 'sine', 70); }
  crash() { this.noiseBurst(0.3, 900, 0.5); this.tone(90, 0.25, 0.3, 'sawtooth', 40); }
  horn() { this.tone(370, 0.28, 0.22, 'square'); this.tone(466, 0.28, 0.18, 'square'); }
  pickup() { this.tone(660, 0.12, 0.25); this.tone(880, 0.18, 0.25, 'sine', null, 0.09); }
  missionDone() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.22, 0.25, 'triangle', null, i * 0.11));
  }
  busted() { [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.3, 0.25, 'sawtooth', null, i * 0.16)); }
  click() { this.tone(1200, 0.05, 0.15, 'square'); }

  /** Police two-tone siren, called every frame while wanted > 0. */
  siren(dt, wanted) {
    if (!this.ctx || wanted <= 0) return;
    this.sirenTimer -= dt;
    if (this.sirenTimer <= 0) {
      this.sirenTimer = 0.45;
      const hi = this.sirenTimer % 0.9 < 0.45;
      this.tone(hi ? 960 : 720, 0.4, 0.05, 'sine');
    }
  }

  /** Continuous engine hum whose pitch follows speed 0..1. */
  startEngine() {
    if (!this.ctx) return;
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = 420;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.0;
    this.engineOsc.connect(filt); filt.connect(this.engineGain); this.engineGain.connect(this.master);
    this.engineOsc.start();
  }

  setEngine(speed01, driving) {
    if (!this.engineOsc) return;
    const t = this.now();
    this.engineOsc.frequency.setTargetAtTime(55 + speed01 * 165, t, 0.08);
    this.engineGain.gain.setTargetAtTime(driving ? 0.05 + speed01 * 0.05 : 0.0, t, 0.1);
  }

  /** A quiet synthwave loop: warm pad chords + a walking bassline. */
  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    const chords = [
      [110.0, 164.8, 220.0], [87.3, 130.8, 196.0],
      [98.0, 146.8, 220.0], [82.4, 123.5, 185.0],
    ];
    const bass = [55, 55, 65.4, 49];
    let bar = 0;
    const scheduleBar = () => {
      if (!this.ctx) return;
      const chord = chords[bar % 4];
      chord.forEach((f) => this.tone(f, 3.6, 0.035, 'triangle'));
      for (let i = 0; i < 8; i++) {
        this.tone(bass[bar % 4] * (i % 4 === 2 ? 1.5 : 1), 0.22, 0.06, 'sine', null, i * 0.45);
      }
      bar++;
      setTimeout(scheduleBar, 3600);
    };
    scheduleBar();
  }
}
