/**
 * GuitarSynth: a small Web Audio instrument that plays plucked-string notes.
 *
 * - Notes are rendered with the Karplus-Strong model in `pluck.ts` and cached per pitch,
 *   so no audio files are needed.
 * - Every note goes through a tone filter, a "body" resonance and a compressor, so a
 *   full 8-string strum stays clean instead of clipping.
 * - Notes are tracked per string: plucking a string that is still ringing stops the
 *   previous note, exactly like a real guitar string.
 *
 * The AudioContext is created lazily (browsers only allow audio after a user gesture),
 * so it is safe to import this file on the server; just never call `ensure()` there.
 */

import { renderPluck, midiToFrequency, defaultDecaySeconds } from "./pluck";
import { renderClick, CLICK_SPECS, ClickKind } from "./click";

export type { ClickKind } from "./click";

export interface PluckParams {
  /** 0–1 loudness of this pluck. Default 1. */
  velocity?: number;
  /** Which string is plucked (0 = lowest). Lets the synth stop the note already ringing on it. */
  stringIndex?: number;
  /** Lets the same string on different instruments/tabs be kept apart. */
  channel?: string;
}

export interface StrumNote {
  midi: number;
  stringIndex?: number;
}

interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
  startTime: number;
  /** Gain the note plays at (its velocity), used as the anchor when fading it out. */
  level: number;
}

/** Space between the strings of a strum, in seconds. */
export const STRUM_SPACING = 0.018;

const MUTE_RELEASE = 0.02;
/** Click bus gain at 100 %: the click skips the compressor, so this stays well clear of clipping. */
const CLICK_GAIN = 1.5;

export class GuitarSynth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private input: AudioNode | null = null;
  private clickBus: GainNode | null = null;
  private buffers = new Map<number, AudioBuffer>();
  private clickBuffers = new Map<ClickKind, AudioBuffer>();
  private clickVolume = 0.7;
  private voices = new Set<Voice>();
  /** Scheduled clicks, so stopping the player also cancels clicks queued in the look-ahead. */
  private clicks = new Set<AudioBufferSourceNode>();
  /** Voice currently ringing on each string, keyed by "channel:string". */
  private ringing = new Map<string, Voice>();
  private volume = 0.8;

  /** True when the browser can play audio at all. */
  static isSupported(): boolean {
    return typeof window !== "undefined" && !!(window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  }

  /** The context, if it has been created already. */
  get context(): AudioContext | null {
    return this.ctx;
  }

  /** Current audio-clock time (0 when there is no context yet). */
  get now(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  /**
   * Creates (and resumes) the AudioContext. Call this from a click / key handler the
   * first time: browsers block audio that was not started by a user gesture.
   */
  async ensure(): Promise<AudioContext> {
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.buildChain(this.ctx);
    }
    if (this.ctx.state !== "running") {
      try {
        await this.ctx.resume();
      } catch {
        /* will retry on the next gesture */
      }
    }
    return this.ctx;
  }

  private buildChain(ctx: AudioContext) {
    // Tone: roll off the fizz above the guitar's natural range.
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 5200;
    tone.Q.value = 0.6;

    // Body: a touch of low-mid warmth like a guitar body resonance.
    const body = ctx.createBiquadFilter();
    body.type = "peaking";
    body.frequency.value = 190;
    body.Q.value = 1.1;
    body.gain.value = 3;

    // Presence: a little sparkle so plucks cut through small speakers.
    const presence = ctx.createBiquadFilter();
    presence.type = "peaking";
    presence.frequency.value = 2400;
    presence.Q.value = 0.8;
    presence.gain.value = 2;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.knee.value = 12;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;

    const master = ctx.createGain();
    master.gain.value = this.volume * 0.5;

    tone.connect(body);
    body.connect(presence);
    presence.connect(compressor);
    compressor.connect(master);
    master.connect(ctx.destination);

    // The metronome skips the guitar's tone chain and compressor so it stays crisp
    // and never ducks the notes.
    const clickBus = ctx.createGain();
    clickBus.gain.value = this.clickVolume * CLICK_GAIN;
    clickBus.connect(master);

    this.input = tone;
    this.master = master;
    this.clickBus = clickBus;
  }

  /** Master volume, 0–1. */
  setVolume(v: number) {
    this.volume = Math.min(1, Math.max(0, v));
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.volume * 0.5, this.ctx.currentTime, 0.02);
    }
  }

  getVolume(): number {
    return this.volume;
  }

  /** Metronome level, 0–1. Around 0.7 matches the guitar; 1 sits clearly above it for noisy rooms. */
  setClickVolume(v: number) {
    this.clickVolume = Math.min(1, Math.max(0, v));
    if (this.clickBus && this.ctx) this.clickBus.gain.setTargetAtTime(this.clickVolume * CLICK_GAIN, this.ctx.currentTime, 0.02);
  }

  getClickVolume(): number {
    return this.clickVolume;
  }

  /** Plays a metronome click at audio-clock time `when`. Requires `ensure()` to have run. */
  click(kind: ClickKind, when: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.clickBus) return;
    let buffer = this.clickBuffers.get(kind);
    if (!buffer) {
      const samples = renderClick(ctx.sampleRate, CLICK_SPECS[kind]);
      buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
      buffer.getChannelData(0).set(samples);
      this.clickBuffers.set(kind, buffer);
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.clickBus);
    this.clicks.add(source);
    source.onended = () => {
      source.disconnect();
      this.clicks.delete(source);
    };
    source.start(Math.max(when, ctx.currentTime));
  }

  private bufferFor(midi: number): AudioBuffer {
    const ctx = this.ctx!;
    let buffer = this.buffers.get(midi);
    if (!buffer) {
      const frequency = midiToFrequency(midi);
      const seconds = Math.min(5, defaultDecaySeconds(frequency) + 0.4);
      const samples = renderPluck(ctx.sampleRate, frequency, seconds, {
        // Low strings are plucked a bit softer / darker than the trebles, like a real pick.
        brightness: midi < 45 ? 0.55 : midi < 60 ? 0.65 : 0.75,
      });
      buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
      buffer.getChannelData(0).set(samples);
      this.buffers.set(midi, buffer);
    }
    return buffer;
  }

  /**
   * Plays one note at audio-clock time `when` (use `synth.now` for "immediately").
   * Requires `ensure()` to have been called at least once.
   */
  pluck(midi: number, when: number, params: PluckParams = {}): void {
    const ctx = this.ctx;
    if (!ctx || !this.input) return;
    const velocity = Math.min(1, Math.max(0, params.velocity ?? 1));
    const startTime = Math.max(when, ctx.currentTime);

    const source = ctx.createBufferSource();
    source.buffer = this.bufferFor(Math.round(midi));
    const gain = ctx.createGain();
    // Velocity curve: quiet plucks are noticeably quieter, loud ones do not get harsh.
    const level = 0.25 + 0.75 * velocity * velocity;
    gain.gain.setValueAtTime(level, 0);
    source.connect(gain);
    gain.connect(this.input);

    const voice: Voice = { source, gain, startTime, level };
    this.voices.add(voice);
    source.onended = () => {
      this.voices.delete(voice);
      source.disconnect();
      gain.disconnect();
    };

    if (params.stringIndex !== undefined) {
      const key = `${params.channel ?? ""}:${params.stringIndex}`;
      const previous = this.ringing.get(key);
      if (previous && previous !== voice) this.release(previous, startTime);
      this.ringing.set(key, voice);
    }
    source.start(startTime);
  }

  /** Strums several notes low-to-high with a small delay between strings. */
  strum(notes: StrumNote[], when: number = this.now, params: Omit<PluckParams, "stringIndex"> & { spacing?: number; direction?: "down" | "up" } = {}): void {
    const spacing = params.spacing ?? STRUM_SPACING;
    const ordered = [...notes].sort((a, b) => (a.stringIndex ?? a.midi) - (b.stringIndex ?? b.midi));
    if (params.direction === "up") ordered.reverse();
    ordered.forEach((note, i) => {
      this.pluck(note.midi, when + i * spacing, { velocity: params.velocity, stringIndex: note.stringIndex, channel: params.channel });
    });
  }

  /** Convenience: play one note right now (after making sure audio is allowed). */
  async playNote(midi: number, params: PluckParams = {}): Promise<void> {
    await this.ensure();
    this.pluck(midi, this.now, params);
  }

  /** Convenience: strum right now. */
  async playStrum(notes: StrumNote[], params: Parameters<GuitarSynth["strum"]>[2] = {}): Promise<void> {
    await this.ensure();
    this.strum(notes, this.now, params);
  }

  /** Gently stops the note ringing on a string at time `when`. */
  muteString(stringIndex: number, when: number = this.now, channel = ""): void {
    const key = `${channel}:${stringIndex}`;
    const voice = this.ringing.get(key);
    if (voice) {
      this.release(voice, when);
      this.ringing.delete(key);
    }
  }

  /** Stops every note and click (scheduled ones included) with a short fade so nothing pops. */
  muteAll(when: number = this.now): void {
    for (const voice of this.voices) this.release(voice, when);
    this.ringing.clear();
    const t = Math.max(when, this.now);
    for (const source of this.clicks) {
      try {
        source.stop(t);
      } catch {
        /* already stopped */
      }
    }
    this.clicks.clear();
  }

  private release(voice: Voice, when: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = Math.max(when, ctx.currentTime);
    const g = voice.gain.gain;
    try {
      g.cancelScheduledValues(t);
      // Anchor at the note's level, then fade. A note that has not started yet simply
      // starts at zero gain, i.e. silently.
      g.setValueAtTime(Math.min(voice.level, g.value), t);
      g.linearRampToValueAtTime(0, t + MUTE_RELEASE);
      voice.source.stop(t + MUTE_RELEASE + 0.005);
    } catch {
      /* already stopped */
    }
  }

  /** Releases the audio context. The synth can be used again afterwards (a new context is created). */
  async dispose(): Promise<void> {
    this.muteAll();
    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
    this.input = null;
    this.buffers.clear();
    this.clickBuffers.clear();
    this.clickBus = null;
    this.voices.clear();
    this.clicks.clear();
    this.ringing.clear();
    if (ctx) {
      try {
        await ctx.close();
      } catch {
        /* ignore */
      }
    }
  }
}

let shared: GuitarSynth | null = null;

/** One synth (and one AudioContext) for the whole app. */
export function getGuitarSynth(): GuitarSynth {
  if (!shared) shared = new GuitarSynth();
  return shared;
}
