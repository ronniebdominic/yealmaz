// Lightweight, optional interaction feedback — haptics + a tiny synth
// sound layer. Both degrade to a no-op where unsupported and NEVER block
// a business action. Sound is off by default and user-controllable
// (see soundEnabled / setSoundEnabled); haptics follow the OS.

const SOUND_KEY = 'ya_sound_on';

export function soundEnabled() {
  try { return localStorage.getItem(SOUND_KEY) === '1'; } catch { return false; }
}
export function setSoundEnabled(on) {
  try { localStorage.setItem(SOUND_KEY, on ? '1' : '0'); } catch { /* private mode — ignore */ }
}

// ── Haptics ────────────────────────────────────────────────────────
const VIBE = { light: 8, medium: 16, success: [12, 40, 18], warning: [20, 60, 20], error: [30, 40, 30] };
export function haptic(kind = 'light') {
  try { navigator.vibrate?.(VIBE[kind] ?? VIBE.light); } catch { /* unsupported — ignore */ }
}

// ── Sound — a few short WebAudio blips, no asset files ──────────────
let ctx;
function audio() {
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = AC ? new AC() : null;
  } catch { ctx = null; }
  return ctx;
}

// kind → [ {f, t0, dur, type, gain} … ]
const TONES = {
  success: [{ f: 660, t0: 0, dur: 0.09 }, { f: 990, t0: 0.08, dur: 0.13 }],
  submit:  [{ f: 520, t0: 0, dur: 0.08 }, { f: 720, t0: 0.07, dur: 0.10 }],
  alert:   [{ f: 880, t0: 0, dur: 0.10 }, { f: 880, t0: 0.16, dur: 0.10 }],
  error:   [{ f: 300, t0: 0, dur: 0.12 }, { f: 220, t0: 0.10, dur: 0.16 }],
};

export function playSound(kind = 'success') {
  if (!soundEnabled()) return;
  const ac = audio();
  if (!ac) return;
  try {
    if (ac.state === 'suspended') ac.resume();
    const now = ac.currentTime;
    (TONES[kind] || TONES.success).forEach(({ f, t0, dur, type = 'sine', gain = 0.05 }) => {
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(f, now + t0);
      g.gain.setValueAtTime(0, now + t0);
      g.gain.linearRampToValueAtTime(gain, now + t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + t0 + dur);
      osc.connect(g).connect(ac.destination);
      osc.start(now + t0);
      osc.stop(now + t0 + dur + 0.02);
    });
  } catch { /* audio blocked — ignore */ }
}

// Fire both, in the intensity that matches the event.
export function feedback(kind) {
  if (kind === 'success') { haptic('success'); playSound('success'); }
  else if (kind === 'submit') { haptic('medium'); playSound('submit'); }
  else if (kind === 'alert') { haptic('warning'); playSound('alert'); }
  else if (kind === 'error') { haptic('error'); playSound('error'); }
  else haptic('light');
}
