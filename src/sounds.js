// FlipperRooms — Web Audio API Sound Effects (no mp3 files needed)

let ctx;
function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function playTone(freq, duration, type = "sine", gain = 0.3, delay = 0) {
  const c = getCtx();
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
}

export function playClickSound() {
  playTone(1000, 0.05, "sine", 0.1);
}

export function playDepositSound() {
  playTone(2000, 0.15, "sine", 0.2);
  playTone(2600, 0.12, "sine", 0.15, 0.08);
}

export function playFlipSound() {
  for (let i = 0; i < 15; i++) {
    const freq = 800 - i * 40;
    const delay = i * (0.06 + i * 0.012);
    playTone(freq, 0.04, "square", 0.08, delay);
  }
}

export function playWinSound() {
  playTone(523, 0.25, "triangle", 0.3, 0);    // C5
  playTone(659, 0.25, "triangle", 0.3, 0.12);  // E5
  playTone(784, 0.4, "triangle", 0.35, 0.24);  // G5
  playTone(1047, 0.5, "triangle", 0.25, 0.4);  // C6
}

export function playLoseSound() {
  const c = getCtx();
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(196, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(131, c.currentTime + 0.4);
  g.gain.setValueAtTime(0.2, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.5);
  osc.connect(g).connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + 0.5);
}

export function playJackpotSound() {
  const notes = [523, 659, 784, 1047, 1319]; // C5 E5 G5 C6 E6
  notes.forEach((f, i) => {
    playTone(f, 0.3, "triangle", 0.3, i * 0.08);
  });
  // shimmer noise burst
  const c = getCtx();
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
}

export function playStreakSound(count) {
  const intensity = Math.min(count, 10);
  for (let i = 0; i < intensity; i++) {
    playTone(400 + i * 80, 0.15, "sawtooth", 0.05 + i * 0.02, i * 0.04);
  }
}
