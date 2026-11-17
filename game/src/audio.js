// WebAudio synth only: no audio files. Every call is guarded so a suspended
// or missing AudioContext (headless capture, autoplay policy) never throws
// or blocks the game. Sounds start after the first user gesture.

export class AudioSys {
  constructor() {
    this.ctx = null; this.master = null;
    this.engineOsc = null; this.engineGain = null;
    this.padTimer = 0; this.sirenOn = false; this.sirenOsc = null; this.sirenGain = null; this.sirenFlip = 0;
  }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return true; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      return true;
    } catch { return false; }
  }
  tone(freq, dur, type = 'sine', vol = 0.2, slideTo = null, delay = 0) {
    if (!this.ensure()) return;
    try {
      const t0 = this.ctx.currentTime + delay;
      const osc = this.ctx.createOscillator(); const g = this.ctx.createGain();
      osc.type = type; osc.frequency.setValueAtTime(freq, t0);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.connect(g); g.connect(this.master);
      osc.start(t0); osc.stop(t0 + dur + 0.02);
    } catch { /* sound is decoration */ }
  }
  noise(dur, vol = 0.25, freq = 400) {
    if (!this.ensure()) return;
    try {
      const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource(); src.buffer = buf;
      const filter = this.ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = freq;
      const g = this.ctx.createGain(); g.gain.value = vol;
      src.connect(filter); filter.connect(g); g.connect(this.master);
      src.start();
    } catch { /* ignore */ }
  }
  thud(strength = 1) { this.noise(0.16, 0.18 * strength + 0.05, 300); this.tone(70, 0.15, 'sine', 0.2 * strength, 40); }
  punch() { this.noise(0.07, 0.2, 900); }
  chime() { this.tone(880, 0.12, 'sine', 0.18); this.tone(1318, 0.2, 'sine', 0.16, null, 0.09); }
  success() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.2, null, i * 0.1)); }
  fail() { this.tone(320, 0.3, 'sawtooth', 0.14, 160); this.tone(210, 0.45, 'sawtooth', 0.12, 110, 0.22); }
  cash() { this.tone(1568, 0.08, 'square', 0.1); this.tone(2093, 0.16, 'square', 0.1, null, 0.07); }

  setEngine(on, ratio) {
    if (!this.ensure()) return;
    try {
      if (on && !this.engineOsc) {
        this.engineOsc = this.ctx.createOscillator(); this.engineGain = this.ctx.createGain();
        this.engineOsc.type = 'sawtooth'; this.engineGain.gain.value = 0.0;
        const filter = this.ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 500;
        this.engineOsc.connect(filter); filter.connect(this.engineGain); this.engineGain.connect(this.master);
        this.engineOsc.start();
      }
      if (this.engineOsc) {
        this.engineOsc.frequency.value = 55 + ratio * 130;
        this.engineGain.gain.value = on ? 0.05 + ratio * 0.05 : 0.0;
      }
    } catch { /* ignore */ }
  }
  setSiren(on) {
    if (on === this.sirenOn) return;
    this.sirenOn = on;
    if (!this.ensure()) return;
    try {
      if (on && !this.sirenOsc) {
        this.sirenOsc = this.ctx.createOscillator(); this.sirenGain = this.ctx.createGain();
        this.sirenOsc.type = 'triangle'; this.sirenGain.gain.value = 0.035;
        this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master);
        this.sirenOsc.start();
      }
      if (this.sirenGain) this.sirenGain.gain.value = on ? 0.035 : 0.0;
    } catch { /* ignore */ }
  }
  update(dt, driving, speedRatio, anyPoliceNear) {
    this.setEngine(driving, speedRatio);
    this.setSiren(anyPoliceNear);
    if (this.sirenOsc && this.sirenOn) {
      this.sirenFlip += dt;
      if (this.sirenFlip > 0.38) { this.sirenFlip = 0; this._hi = !this._hi; }
      try { this.sirenOsc.frequency.value = this._hi ? 950 : 700; } catch { /* ignore */ }
    }
    // Low synth pad loop: a soft two-note wash every few seconds.
    this.padTimer -= dt;
    if (this.padTimer <= 0 && this.ctx) {
      this.padTimer = 4.4;
      this.tone(130.8, 3.6, 'sine', 0.045);
      this.tone(196, 3.6, 'sine', 0.03, null, 0.4);
    }
  }
}
