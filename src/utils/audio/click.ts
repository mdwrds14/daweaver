/**
 * Metronome click synthesis. Pure DSP (no Web Audio), unit-tested in Node.
 *
 * A click is a very short burst: two decaying sine partials (a woodblock-like "tock")
 * with a tiny noise transient on the front so it cuts through a strummed chord.
 */

export type ClickKind = "bar" | "beat" | "sub";

export interface ClickSpec {
  /** Fundamental in Hz. */
  frequency: number;
  /** Loudness 0–1 relative to the other click kinds. */
  level: number;
  /** Length in seconds. */
  seconds: number;
}

/** Downbeat is high and bright, beats a little lower, subdivisions lower and softer. */
export const CLICK_SPECS: Record<ClickKind, ClickSpec> = {
  bar: { frequency: 1760, level: 1.0, seconds: 0.05 },
  beat: { frequency: 1320, level: 0.75, seconds: 0.04 },
  sub: { frequency: 990, level: 0.4, seconds: 0.03 },
};

/** Renders one click as samples (peak-normalised to `level`). */
export function renderClick(sampleRate: number, spec: ClickSpec): Float32Array {
  const length = Math.max(1, Math.floor(spec.seconds * sampleRate));
  const out = new Float32Array(length);
  const decay = spec.seconds / 6; // ~ -52 dB by the end
  let peak = 0;
  for (let n = 0; n < length; n++) {
    const t = n / sampleRate;
    const env = Math.exp(-t / decay);
    const tone = Math.sin(2 * Math.PI * spec.frequency * t) * 0.8 + Math.sin(2 * Math.PI * spec.frequency * 2.76 * t) * 0.25;
    const transient = (Math.random() * 2 - 1) * Math.exp(-t / 0.0008) * 0.35;
    const v = (tone + transient) * env;
    out[n] = v;
    peak = Math.max(peak, Math.abs(v));
  }
  const gain = peak > 0 ? spec.level / peak : 1;
  const fadeOut = Math.min(length, Math.round(sampleRate * 0.003));
  for (let n = 0; n < length; n++) {
    let g = gain;
    if (n >= length - fadeOut) g *= (length - 1 - n) / Math.max(1, fadeOut - 1);
    out[n] *= g;
  }
  return out;
}
