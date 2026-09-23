// Sound effects, synthesized on the fly with the Web Audio API instead of
// shipped as audio files — this app runs entirely locally with no cloud
// dependency (see README), so there's no good source for licensed sound
// assets to bundle. A few oscillators is plenty for a short spin whoosh and
// a handful of win-fanfare tiers, and it keeps the repo dependency- and
// asset-free.

let ctx = null;
function getContext() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  // Browsers suspend a freshly-created context until a user gesture; every
  // call site here is triggered by a click (Spin, or the spin-complete
  // transition that follows one), so resuming is always safe.
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// A single tone with a percussive volume envelope (quick attack, exponential
// decay) — the basic building block every effect below is made of.
function tone(startTime, { freq, duration, type = 'sine', peakGain = 0.2, glideTo = null }) {
  const audio = getContext();
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, startTime + duration);
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(peakGain, startTime + Math.min(0.015, duration / 4));
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  osc.connect(gain).connect(audio.destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.02);
}

// A quick rising whoosh plus a scatter of "wheel ticking past a peg" clicks
// — played the instant a spin starts, so there's an immediate audible cue
// before the multi-second reel animation settles.
export function playSpinSound() {
  const audio = getContext();
  const now = audio.currentTime;

  tone(now, { freq: 180, duration: 0.5, type: 'sawtooth', peakGain: 0.1, glideTo: 720 });

  const tickCount = 14;
  for (let i = 0; i < tickCount; i++) {
    // Ticks start close together and spread out, like a wheel losing speed
    // (quadratic spacing spans roughly 0-0.6s across the full tick count).
    const t = now + 0.0035 * i * i;
    tone(t, { freq: 900, duration: 0.03, type: 'square', peakGain: 0.06 });
  }
}

// Three fanfare tiers, keyed off what a prize cost — pricier prizes get a
// longer, richer, more "ta-da" sting; cheap/no-cost prizes get a light
// two-note chime so the sound itself carries a sense of the occasion.
const FANFARES = {
  low: (now) => {
    tone(now, { freq: 523.25, duration: 0.18, type: 'triangle', peakGain: 0.18 }); // C5
    tone(now + 0.12, { freq: 783.99, duration: 0.28, type: 'triangle', peakGain: 0.2 }); // G5
  },
  medium: (now) => {
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    notes.forEach((freq, i) => {
      tone(now + i * 0.11, { freq, duration: 0.22, type: 'triangle', peakGain: 0.2 });
    });
    // a little chord swell under the last note for extra brightness
    tone(now + 0.33, { freq: 1318.51, duration: 0.4, type: 'sine', peakGain: 0.12 }); // E6
  },
  high: (now) => {
    const run = [523.25, 659.25, 783.99, 1046.5, 1318.51, 1568.0]; // C5..G6
    run.forEach((freq, i) => {
      tone(now + i * 0.09, { freq, duration: 0.2, type: 'sawtooth', peakGain: 0.16 });
    });
    // triumphant sustained chord to land on
    const chordAt = now + run.length * 0.09;
    [1046.5, 1318.51, 1568.0, 2093.0].forEach((freq) => {
      tone(chordAt, { freq, duration: 0.9, type: 'triangle', peakGain: 0.14 });
    });
  },
};

// Same thresholds the Prize Picker's Cost field feeds into — kept in one
// place so the sound tier always matches whatever the organizer typed in.
export function fanfareTierForCost(cost) {
  const c = Number(cost) || 0;
  if (c >= 500) return 'high';
  if (c >= 150) return 'medium';
  return 'low';
}

export function playWinFanfare(cost) {
  const audio = getContext();
  FANFARES[fanfareTierForCost(cost)](audio.currentTime);
}
