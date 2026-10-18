/**
 * Plucked-string synthesis (extended Karplus-Strong).
 *
 * Pure number crunching: no Web Audio or DOM here, so it can be unit-tested in Node.
 * `renderPluck()` returns the waveform of one plucked note as a Float32Array of samples;
 * the synth wraps that in an AudioBuffer.
 *
 * How it works, in one paragraph: a guitar string is modelled as a short delay line
 * (one period of the note long) with a gentle low-pass filter in the feedback path.
 * Filling the line with a burst of noise is the "pluck"; every trip round the loop the
 * low-pass filter rounds off the sound a little, so the bright attack mellows into a
 * warm sustained tone exactly like a real string. The fractional delay keeps the note in
 * tune at any sample rate, the pick-position comb filter gives the hollow "plucked near
 * the bridge" flavour, and the loss factor sets how long the note rings.
 */

export interface PluckOptions {
  /** 0 = very dark / muted pick, 1 = bright attack. Default 0.7. */
  brightness?: number;
  /** Where along the string it is plucked (0 = bridge, 0.5 = middle). Default 0.13. */
  pickPosition?: number;
  /** Roughly how long the note takes to die away (seconds). Default depends on pitch. */
  decaySeconds?: number;
  /** Deterministic noise seed; random when omitted. */
  seed?: number;
}

/** Default ring time: low strings ring longer than high ones. */
export function defaultDecaySeconds(frequency: number): number {
  // ~4.5 s at 40 Hz (8-string low F#) down to ~1.8 s at 660 Hz.
  const t = 4.5 - 2.7 * Math.min(1, Math.max(0, Math.log2(frequency / 40) / 4));
  return Math.max(1.2, t);
}

/** Small deterministic PRNG (mulberry32) so tests are repeatable. */
function makeRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Renders one plucked note.
 *
 * @param sampleRate  Samples per second (e.g. 44100).
 * @param frequency   Fundamental in Hz.
 * @param seconds     Length of the rendered clip. The tail is faded to zero so it can be cut anywhere.
 */
export function renderPluck(sampleRate: number, frequency: number, seconds: number, options: PluckOptions = {}): Float32Array {
  const brightness = clamp(options.brightness ?? 0.7, 0, 1);
  const pickPosition = clamp(options.pickPosition ?? 0.13, 0.02, 0.5);
  const decaySeconds = options.decaySeconds ?? defaultDecaySeconds(frequency);
  const random = options.seed !== undefined ? makeRandom(options.seed) : Math.random;

  const length = Math.max(1, Math.floor(seconds * sampleRate));
  const out = new Float32Array(length);

  // Loop length in samples. The two-point averaging filter in the feedback path adds
  // half a sample of delay, so the delay line itself is half a sample shorter.
  const period = sampleRate / frequency;
  const delay = Math.max(2, period - 0.5);
  const delayInt = Math.floor(delay);
  const delayFrac = delay - delayInt;

  /* ---- Excitation: one period of filtered noise ---- */
  const exciteLength = Math.ceil(period);
  const excite = new Float32Array(exciteLength);
  // One-pole low-pass on the noise: darker for a soft pick, brighter for a hard one.
  const lpCoefficient = 0.15 + 0.85 * brightness;
  let lp = 0;
  for (let i = 0; i < exciteLength; i++) {
    const white = random() * 2 - 1;
    lp += lpCoefficient * (white - lp);
    excite[i] = lp;
  }
  // Pick-position comb filter: subtracting a delayed copy removes the harmonics that
  // have a node where the string is plucked.
  const pickDelay = Math.max(1, Math.round(pickPosition * period));
  for (let i = exciteLength - 1; i >= pickDelay; i--) excite[i] -= excite[i - pickDelay];
  // Remove DC so the string does not sit off-centre.
  let mean = 0;
  for (let i = 0; i < exciteLength; i++) mean += excite[i];
  mean /= exciteLength;
  for (let i = 0; i < exciteLength; i++) excite[i] -= mean;

  /* ---- Loss per trip round the loop, so the fundamental decays to -60 dB in `decaySeconds` ---- */
  const tripsToDecay = (decaySeconds * sampleRate) / period;
  const loss = Math.pow(0.001, 1 / Math.max(1, tripsToDecay));

  /* ---- The string loop ---- */
  const lineLength = delayInt + 3;
  const line = new Float32Array(lineLength);
  let write = 0;

  // Read the delay line `d` samples behind the write head, with linear interpolation.
  const readBack = (d: number): number => {
    const di = Math.floor(d);
    const f = d - di;
    const i0 = (write - di + lineLength * 2) % lineLength;
    const i1 = (i0 - 1 + lineLength) % lineLength;
    return line[i0] * (1 - f) + line[i1] * f;
  };

  for (let n = 0; n < length; n++) {
    const yN = readBack(delayInt + delayFrac);
    const yN1 = readBack(delayInt + delayFrac + 1);
    const feedback = loss * 0.5 * (yN + yN1);
    const sample = (n < exciteLength ? excite[n] : 0) + feedback;
    line[write] = sample;
    out[n] = sample;
    write = (write + 1) % lineLength;
  }

  /* ---- Tidy up: peak-normalise, soft fade-in to avoid a click, fade-out at the tail ---- */
  let peak = 0;
  for (let n = 0; n < length; n++) peak = Math.max(peak, Math.abs(out[n]));
  const gain = peak > 0 ? 0.9 / peak : 1;
  const fadeIn = Math.min(length, Math.round(sampleRate * 0.0015));
  const fadeOut = Math.min(length, Math.round(sampleRate * 0.05));
  for (let n = 0; n < length; n++) {
    let g = gain;
    if (n < fadeIn) g *= n / fadeIn;
    if (n >= length - fadeOut) g *= (length - 1 - n) / Math.max(1, fadeOut - 1);
    out[n] *= g;
  }
  return out;
}

/** MIDI note number -> frequency in Hz (A4 = 440). */
export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Estimates the fundamental of a rendered clip by autocorrelation (used in tests and
 * handy for debugging tuning). Returns Hz.
 */
export function estimateFrequency(samples: Float32Array, sampleRate: number, minHz = 30, maxHz = 1500): number {
  const start = Math.min(samples.length, Math.floor(sampleRate * 0.1)); // skip the noisy attack
  const windowSize = Math.min(samples.length - start, Math.floor(sampleRate * 0.2));
  const minLag = Math.floor(sampleRate / maxHz);
  const maxLag = Math.min(windowSize - 1, Math.ceil(sampleRate / minHz));
  let bestLag = minLag;
  let best = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i < windowSize - lag; i++) sum += samples[start + i] * samples[start + i + lag];
    if (sum > best) {
      best = sum;
      bestLag = lag;
    }
  }
  // Refine with a parabolic fit around the best lag for sub-sample accuracy.
  const corr = (lag: number) => {
    let sum = 0;
    for (let i = 0; i < windowSize - lag; i++) sum += samples[start + i] * samples[start + i + lag];
    return sum;
  };
  if (bestLag > minLag && bestLag < maxLag) {
    const a = corr(bestLag - 1), b = corr(bestLag), c = corr(bestLag + 1);
    const denom = a - 2 * b + c;
    if (denom !== 0) bestLag += (0.5 * (a - c)) / denom;
  }
  return sampleRate / bestLag;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
