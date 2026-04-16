// FlipperRooms — AudioEngine (Web Audio API, lazy-init after user gesture)

class AudioEngine {
  constructor() {
    this.muted = typeof window !== 'undefined' && localStorage.getItem('fr_muted') === '1';
    this.context = null;
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.context = new AC();
      this.initialized = true;
    } catch (err) {
      console.error('Audio init failed:', err);
    }
  }

  ensureRunning() {
    if (!this.initialized) this.init();
    if (this.context && this.context.state === 'suspended') {
      this.context.resume().catch(() => {});
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem('fr_muted', this.muted ? '1' : '0');
    return this.muted;
  }

  _tone(freq, duration, type = 'sine', gain = 0.3, delay = 0) {
    if (this.muted || !this.context) return;
    try {
      const c = this.context;
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      const t = c.currentTime + delay;
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + duration);
      osc.connect(g).connect(c.destination);
      osc.start(t);
      osc.stop(t + duration);
    } catch {}
  }

  playClick() {
    this.ensureRunning();
    this._tone(1000, 0.05, 'sine', 0.1);
  }

  playDeposit() {
    this.ensureRunning();
    this._tone(2000, 0.15, 'sine', 0.2);
    this._tone(2600, 0.12, 'sine', 0.15, 0.08);
  }

  playFlip() {
    this.ensureRunning();
    for (let i = 0; i < 15; i++) {
      const freq = 800 - i * 40;
      const delay = i * (0.06 + i * 0.012);
      this._tone(freq, 0.04, 'square', 0.08, delay);
    }
  }

  playWin() {
    this.ensureRunning();
    this._tone(523, 0.25, 'triangle', 0.3, 0);
    this._tone(659, 0.25, 'triangle', 0.3, 0.12);
    this._tone(784, 0.4, 'triangle', 0.35, 0.24);
    this._tone(1047, 0.5, 'triangle', 0.25, 0.4);
  }

  playLoss() {
    this.ensureRunning();
    if (!this.context) return;
    try {
      const c = this.context;
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(196, c.currentTime);
      osc.frequency.exponentialRampToValueAtTime(131, c.currentTime + 0.4);
      g.gain.setValueAtTime(0.2, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.5);
      osc.connect(g).connect(c.destination);
      osc.start();
      osc.stop(c.currentTime + 0.5);
    } catch {}
  }

  playMatchFound() {
    this.ensureRunning();
    this._tone(600, 0.12, 'sine', 0.12, 0);
    this._tone(900, 0.15, 'sine', 0.14, 0.1);
  }

  playJackpot() {
    this.ensureRunning();
    if (!this.context) return;
    try {
      const notes = [523, 659, 784, 1047, 1319];
      notes.forEach((f, i) => this._tone(f, 0.3, 'triangle', 0.3, i * 0.08));
      const c = this.context;
      const buf = c.createBuffer(1, c.sampleRate * 0.3, c.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (c.sampleRate * 0.1));
      const src = c.createBufferSource();
      src.buffer = buf;
      const g = c.createGain();
      g.gain.setValueAtTime(0.08, c.currentTime + 0.3);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.8);
      src.connect(g).connect(c.destination);
      src.start(c.currentTime + 0.3);
    } catch {}
  }

  playStreak(count) {
    this.ensureRunning();
    const intensity = Math.min(count, 10);
    for (let i = 0; i < intensity; i++) {
      this._tone(400 + i * 80, 0.15, 'sawtooth', 0.05 + i * 0.02, i * 0.04);
    }
  }

  // Sustained tension drone during coin spin — returns cleanup function
  playSpinDrone(duration = 2500) {
    if (this.muted) return null;
    this.ensureRunning();
    if (!this.context) return null;

    try {
      const c = this.context;
      const osc1 = c.createOscillator();
      const osc2 = c.createOscillator();
      const gain = c.createGain();
      const filter = c.createBiquadFilter();

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      gain.connect(c.destination);

      // Two slightly detuned freqs for beating texture
      osc1.frequency.value = 110;
      osc2.frequency.value = 116;
      osc1.type = 'sine';
      osc2.type = 'sine';

      filter.type = 'lowpass';
      filter.frequency.value = 800;
      filter.Q.value = 1;

      const durSec = duration / 1000;
      gain.gain.setValueAtTime(0, c.currentTime);
      gain.gain.linearRampToValueAtTime(0.05, c.currentTime + 0.2);
      gain.gain.linearRampToValueAtTime(0.14, c.currentTime + durSec - 0.2);
      gain.gain.linearRampToValueAtTime(0, c.currentTime + durSec);

      // Filter sweep rising for tension
      filter.frequency.setValueAtTime(400, c.currentTime);
      filter.frequency.linearRampToValueAtTime(900, c.currentTime + durSec);

      osc1.start();
      osc2.start();
      osc1.stop(c.currentTime + durSec);
      osc2.stop(c.currentTime + durSec);

      return () => {
        try {
          gain.gain.cancelScheduledValues(c.currentTime);
          gain.gain.linearRampToValueAtTime(0, c.currentTime + 0.05);
          setTimeout(() => { try { osc1.stop(); osc2.stop(); } catch {} }, 100);
        } catch {}
      };
    } catch {}
    return null;
  }

  // Subtle tick click for countdown feel
  playTickClick() {
    if (this.muted) return;
    this.ensureRunning();
    if (!this.context) return;
    try {
      const c = this.context;
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.connect(g);
      g.connect(c.destination);
      osc.frequency.value = 1200;
      osc.type = 'square';
      g.gain.setValueAtTime(0.04, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.02);
      osc.start();
      osc.stop(c.currentTime + 0.02);
    } catch {}
  }
}

export const audio = new AudioEngine();

// Haptics helper
export function vibrate(pattern) {
  try { if ('vibrate' in navigator) navigator.vibrate(pattern); } catch {}
}
