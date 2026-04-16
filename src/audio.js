// FlipperRooms — AudioEngine (Web Audio API + MP3 files)

class AudioEngine {
  constructor() {
    this.muted = typeof window !== 'undefined' && localStorage.getItem('fr_muted') === '1';
    this.context = null;
    this.initialized = false;
    this.spinStartAudio = null;
    this.winCashAudio = null;
    this.preloadFiles();
  }

  preloadFiles() {
    try {
      this.spinStartAudio = new Audio('/sounds/spin-start.mp3');
      this.spinStartAudio.volume = 0.6;
      this.spinStartAudio.preload = 'auto';

      this.winCashAudio = new Audio('/sounds/win-cash.mp3');
      this.winCashAudio.volume = 0.7;
      this.winCashAudio.preload = 'auto';
    } catch (err) {
      console.error('Audio preload failed:', err);
    }
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

  _playFile(audioEl) {
    if (this.muted || !audioEl) return;
    try {
      audioEl.currentTime = 0;
      audioEl.play().catch(e => console.warn('Audio play blocked:', e.message));
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

    // Cash register MP3 on top
    this._playFile(this.winCashAudio);
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

  // Spin start MP3 — returns cleanup function
  playSpinDrone() {
    if (this.muted) return null;
    if (!this.spinStartAudio) return null;

    this._playFile(this.spinStartAudio);

    return () => {
      try {
        this.spinStartAudio.pause();
        this.spinStartAudio.currentTime = 0;
      } catch {}
    };
  }
}

export const audio = new AudioEngine();

// Haptics helper
export function vibrate(pattern) {
  try { if ('vibrate' in navigator) navigator.vibrate(pattern); } catch {}
}
