// Original procedural audio. Music and SFX are synthesized with the Web Audio API;
// nothing is sampled from copyrighted tracks. Starts on the first user gesture.
const MUTE_KEY = 'fangcity.mute';

let actx = null;
let master = null;
let musicGain = null;
let sfxGain = null;
let started = false;
let muted = (typeof localStorage !== 'undefined' && localStorage.getItem(MUTE_KEY) === '1');
let musicTimer = 0;
let musicOn = false;

function ctx() {
  if (!actx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    actx = new AC();
    master = actx.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(actx.destination);
    musicGain = actx.createGain(); musicGain.gain.value = 0.22; musicGain.connect(master);
    sfxGain = actx.createGain(); sfxGain.gain.value = 0.7; sfxGain.connect(master);
  }
  return actx;
}

export function isMuted() { return muted; }
export function isStarted() { return started; }

export function setMuted(m) {
  muted = !!m;
  try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch {}
  if (master) {
    const c = ctx();
    master.gain.cancelScheduledValues(c.currentTime);
    master.gain.setTargetAtTime(muted ? 0 : 1, c.currentTime, 0.05);
  }
  if (!muted && started) startMusic();
}

export function toggleMute() { setMuted(!muted); return muted; }

export async function unlock() {
  const c = ctx();
  if (!c) return false;
  if (c.state === 'suspended') {
    try { await c.resume(); } catch { return false; }
  }
  if (!started) {
    started = true;
    if (!muted) startMusic();
  }
  return true;
}

function env(node, t, a = 0.01, d = 0.15, peak = 0.3, end = 0.0001) {
  const g = node.gain || node;
  g.cancelScheduledValues(t);
  g.setValueAtTime(0.0001, t);
  g.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
  g.exponentialRampToValueAtTime(end, t + a + d);
}

function osc(type, freq, t, dur, peak, dest, atk = 0.008, slide) {
  const c = ctx(); if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
  env(g, t, atk, dur, peak);
  o.connect(g); g.connect(dest || sfxGain);
  o.start(t); o.stop(t + dur + 0.05);
}

function noiseBurst(t, dur, peak, hp, lp, dest) {
  const c = ctx(); if (!c) return;
  const n = c.createBufferSource();
  const len = Math.max(1, Math.ceil(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  n.buffer = buf;
  const g = c.createGain();
  env(g, t, 0.004, dur, peak, 0.0001);
  let node = n;
  if (hp) { const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; node.connect(f); node = f; }
  if (lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; node.connect(f); node = f; }
  node.connect(g); g.connect(dest || sfxGain);
  n.start(t); n.stop(t + dur + 0.05);
}

const SFX = {
  tap() {
    const t = ctx().currentTime;
    osc('square', 920, t, 0.035, 0.07, sfxGain, 0.002);
    osc('square', 1380, t + 0.012, 0.025, 0.04, sfxGain, 0.002);
  },
  collect() {
    const t = ctx().currentTime;
    osc('sine', 660, t, 0.09, 0.16, sfxGain, 0.004);
    osc('sine', 880, t + 0.06, 0.1, 0.14, sfxGain, 0.004);
    osc('sine', 1320, t + 0.12, 0.14, 0.12, sfxGain, 0.004);
  },
  build() {
    const t = ctx().currentTime;
    noiseBurst(t, 0.06, 0.2, 400, 1800);
    osc('triangle', 140, t, 0.12, 0.16, sfxGain, 0.002, 80);
    noiseBurst(t + 0.11, 0.05, 0.14, 600, 2000);
  },
  clear() {
    const t = ctx().currentTime;
    noiseBurst(t, 0.08, 0.18, 200, 1200);
    osc('sawtooth', 90, t, 0.16, 0.12, sfxGain, 0.002, 50);
  },
  shoot() { SFX.rifle(); },
  rifle() {
    const t = ctx().currentTime;
    noiseBurst(t, 0.07, 0.34, 1400, 7000);
    osc('square', 260, t, 0.05, 0.12, sfxGain, 0.001, 90);
    noiseBurst(t + 0.015, 0.10, 0.14, 400, 2200);
  },
  pistol() {
    const t = ctx().currentTime;
    noiseBurst(t, 0.045, 0.30, 1800, 8000);
    osc('square', 420, t, 0.032, 0.10, sfxGain, 0.001, 150);
  },
  shotgun() {
    const t = ctx().currentTime;
    noiseBurst(t, 0.14, 0.42, 350, 4500);
    osc('sawtooth', 110, t, 0.08, 0.16, sfxGain, 0.001, 48);
    noiseBurst(t + 0.03, 0.10, 0.22, 600, 2800);
  },
  melee() {
    const t = ctx().currentTime;
    noiseBurst(t, 0.06, 0.18, 200, 1800);
    osc('triangle', 280, t, 0.08, 0.12, sfxGain, 0.001, 90);
  },
  explosion() {
    const t = ctx().currentTime;
    noiseBurst(t, 0.38, 0.48, 40, 900);
    osc('sine', 70, t, 0.30, 0.32, sfxGain, 0.002, 28);
    noiseBurst(t + 0.04, 0.22, 0.22, 180, 2000);
  },
  footstep() {
    const t = ctx().currentTime;
    noiseBurst(t, 0.05, 0.08, 70, 650);
    osc('sine', 85, t, 0.055, 0.035, sfxGain, 0.006, 55);
  },
  hit() {
    const t = ctx().currentTime;
    osc('triangle', 150, t, 0.1, 0.22, sfxGain, 0.001, 65);
    noiseBurst(t, 0.08, 0.20, 180, 1100);
  },
  move() {
    const t = ctx().currentTime;
    noiseBurst(t, 0.08, 0.08, 300, 1400);
    osc('sine', 240, t, 0.1, 0.05, sfxGain, 0.01, 180);
  },
  overwatch() {
    const t = ctx().currentTime;
    osc('sine', 740, t, 0.12, 0.1, sfxGain, 0.005);
    osc('sine', 1110, t + 0.08, 0.14, 0.08, sfxGain, 0.005);
  },
  win() {
    const t = ctx().currentTime;
    [523, 659, 784, 1046].forEach((f, i) => osc('triangle', f, t + i * 0.11, 0.28, 0.14, sfxGain, 0.01));
  },
  lose() {
    const t = ctx().currentTime;
    osc('triangle', 320, t, 0.35, 0.14, sfxGain, 0.01, 140);
    osc('sine', 160, t + 0.08, 0.4, 0.1, sfxGain, 0.02, 80);
  },
};

export function play(name) {
  if (muted || !started) return;
  const c = ctx();
  if (!c || c.state !== 'running') return;
  const fn = SFX[name];
  if (fn) fn();
}

const WEAPON_SFX = {
  rook: 'rifle', ash: 'rifle', lumen: 'rifle', mica: 'rifle',
  brick: 'rifle', slab: 'rifle',
  vesper: 'pistol', pact: 'pistol', pip: 'pistol', knack: 'pistol', hook: 'pistol',
  ivory: 'shotgun', marlow: 'shotgun', bruno: 'shotgun',
  nile: 'melee', rill: 'melee',
};

export function playShoot(hero) {
  play(WEAPON_SFX[hero] || 'rifle');
}

// A looping dusk groove in A minor: soft kick, hat, bass, and a sparse piano figure.
function scheduleBar(t0, bar) {
  const c = ctx(); if (!c || !musicOn) return;
  const beat = 0.5; // 120ms? 0.5s = 120 BPM eighth... 0.5s per beat = 120 BPM quarter. Use 0.46s ~ 130 BPM.
  const q = 0.46;
  const dest = musicGain;

  // kick on 1 and 3
  for (const b of [0, 2]) {
    const t = t0 + b * q;
    osc('sine', 70, t, 0.18, 0.28, dest, 0.002, 38);
    noiseBurst(t, 0.04, 0.06, 40, 200, dest);
  }
  // hats
  for (let i = 0; i < 8; i++) {
    const t = t0 + i * (q / 2);
    const peak = i % 2 === 0 ? 0.03 : 0.055;
    noiseBurst(t, 0.03, peak, 6000, 14000, dest);
  }
  // bass riff, changes every 2 bars
  const roots = [55, 55, 49, 58, 55, 55, 52, 49]; // A2, A2, G2, A#2, ...
  const root = roots[bar % roots.length];
  const bassPat = [0, 0, 7, 0, 3, 0, 7, 10];
  bassPat.forEach((st, i) => {
    if (i % 2 && (bar + i) % 5 === 0) return;
    const t = t0 + i * (q / 2);
    const f = root * Math.pow(2, st / 12);
    osc('triangle', f, t, 0.2, 0.11, dest, 0.01, f * 0.92);
    osc('sine', f / 2, t, 0.22, 0.08, dest, 0.01);
  });
  // pad chord on bar start
  const chords = [
    [220, 261.6, 329.6], // A minor-ish (A3 C4 E4)
    [196, 246.9, 293.7], // G
    [174.6, 220, 261.6], // F
    [196, 246.9, 311.1], // G add
  ];
  const ch = chords[Math.floor(bar / 2) % chords.length];
  ch.forEach((f) => osc('sine', f, t0, q * 3.6, 0.028, dest, 0.08));
  // sparse lead on bars 0, 3, 4, 7 of an 8-bar loop
  const leadBar = bar % 8;
  if (leadBar === 0 || leadBar === 3 || leadBar === 4 || leadBar === 7) {
    const notes = leadBar === 3 ? [440, 523.25, 493.88] : leadBar === 7 ? [392, 349.23] : [440, 392, 523.25, 440];
    notes.forEach((f, i) => osc('triangle', f, t0 + 0.12 + i * q * 0.7, 0.35, 0.045, dest, 0.02, f * 0.99));
  }
}

function pumpMusic() {
  if (!musicOn || muted || !actx) return;
  const c = actx;
  const q = 0.46;
  const barLen = q * 4;
  let t = musicTimer;
  // schedule a couple of bars ahead
  while (t < c.currentTime + barLen * 3) {
    const bar = Math.round(t / barLen);
    scheduleBar(t, bar);
    t += barLen;
  }
  musicTimer = t;
}

export function startMusic() {
  const c = ctx();
  if (!c || muted) return;
  if (!musicOn) {
    musicOn = true;
    musicTimer = c.currentTime + 0.05;
  }
  pumpMusic();
  if (!startMusic._iv) startMusic._iv = setInterval(pumpMusic, 700);
}

export function stopMusic() {
  musicOn = false;
  if (startMusic._iv) { clearInterval(startMusic._iv); startMusic._iv = 0; }
}

export function muteButton() {
  return `<button class="muter ${muted ? 'off' : ''}" data-act="toggleMute" title="${muted ? 'Unmute' : 'Mute'}">${muted ? '🔇' : '🔊'}</button>`;
}
