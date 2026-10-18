/**
 * TabPlayer: plays a TabData through the GuitarSynth, with a metronome, and reports
 * the playhead / beat so the UI can follow along.
 *
 * Time model
 * ----------
 * Everything lives on a grid of **beats** (quarter notes): `bpm` is the quarter-note
 * tempo. Each tab column is worth `column.units` notes of the chosen **note value**
 * (quarter = 1 note per beat, eighth = 2, sixteenth = 4). So a scale played "in
 * eighths at 90" moves two columns per click.
 *
 * Clicks and notes are one event stream ordered by beat position, converted to
 * audio-clock time through a single cursor. That keeps them locked together, and a
 * tempo change simply applies to every event not yet scheduled.
 *
 * Scheduling uses the standard Web Audio look-ahead pattern: a JS timer wakes up
 * every few milliseconds and schedules everything that starts within the next ~120 ms
 * on the audio clock, which is sample-accurate no matter how busy the main thread is.
 *
 * Framework-agnostic: `useTabPlayer()` wraps it for React.
 */

import { TabData, FlatColumn, flattenTab, tabNoteMidi } from "../tab";
import { STRUM_SPACING, PluckParams } from "./synth";
import { ClickKind } from "./click";

export type PlayerState = "stopped" | "playing" | "paused";

/** Rhythmic value of one tab note: 4 = quarter, 8 = eighth, 16 = sixteenth. */
export type NoteValue = 4 | 8 | 16;
export const NOTE_VALUES: NoteValue[] = [4, 8, 16];

/** "beat" clicks every quarter note; "subdivided" also ticks at the note value. */
export type ClickMode = "off" | "beat" | "subdivided";

export interface BeatInfo {
  /** 1-based beat within the bar. */
  beat: number;
  /** 0-based bar count since the start (or since the loop restarted). */
  bar: number;
  /** True during the count-in bar before the notes begin. */
  countIn: boolean;
}

export interface TabPlayerCallbacks {
  /** Index of the column that is sounding now (null when nothing is highlighted). */
  onPosition?: (index: number | null) => void;
  onState?: (state: PlayerState) => void;
  /** A beat has just started (used for the visual metronome). null when playback stops. */
  onBeat?: (info: BeatInfo | null) => void;
}

export interface TabPlayerOptions {
  bpm?: number;
  loop?: boolean;
  noteValue?: NoteValue;
  click?: ClickMode;
  countIn?: boolean;
  /** Seconds between strings in a strummed column. */
  strumSpacing?: number;
}

/** The part of GuitarSynth the player needs (kept small so tests can use a fake). */
export interface PlayerSynth {
  /** Make sure audio is allowed / running. */
  ensure(): Promise<unknown>;
  /** Audio-clock time in seconds. */
  readonly now: number;
  pluck(midi: number, when: number, params?: PluckParams): void;
  click(kind: ClickKind, when: number): void;
  muteAll(when?: number): void;
}

export const MIN_BPM = 40;
export const MAX_BPM = 300;
export const BEATS_PER_BAR = 4;

const LOOKAHEAD_SECONDS = 0.12;
const TICK_MS = 25;
const START_DELAY = 0.06;
const EPS = 1e-9;

type Event =
  | { kind: "column"; pos: number; index: number }
  | { kind: "beat"; pos: number; info: BeatInfo }
  | { kind: "sub"; pos: number }
  | { kind: "end"; pos: number };

export class TabPlayer {
  private synth: PlayerSynth;
  private callbacks: TabPlayerCallbacks;
  private tab: TabData | null = null;
  private columns: FlatColumn[] = [];
  /** Cumulative units before each column (length = columns + 1). */
  private cumulativeUnits: number[] = [0];
  private channel: string;

  private bpm = 100;
  private loop = false;
  private noteValue: NoteValue = 4;
  private clickMode: ClickMode = "off";
  private countIn = true;
  private strumSpacing = STRUM_SPACING;

  private state: PlayerState = "stopped";
  /** Column the playhead sits on (the column that would play next / is playing now). */
  private position = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  /* Scheduler cursor: the beat position / audio time of the last scheduled event. */
  private cursorPos = 0;
  private cursorTime = 0;
  private nextColumnIndex = 0;
  private nextColumnPos = 0;
  private nextBeat = 0;
  private nextSubPos = 0;
  private barOrigin = 0;
  private countInEnd = -Infinity;
  private endPos: number | null = null;
  private endTime = Infinity;
  /** True once the end marker has been scheduled: nothing more to plan. */
  private ended = false;
  /** Events scheduled but not yet reached by the clock, for UI updates. */
  private pending: { time: number; event: Event }[] = [];
  private reportedPosition: number | null = null;

  private static counter = 0;

  constructor(synth: PlayerSynth, callbacks: TabPlayerCallbacks = {}, options: TabPlayerOptions = {}) {
    this.synth = synth;
    this.callbacks = callbacks;
    this.channel = `tab${TabPlayer.counter++}`;
    if (options.bpm !== undefined) this.setBpm(options.bpm);
    if (options.loop !== undefined) this.loop = options.loop;
    if (options.noteValue !== undefined) this.noteValue = options.noteValue;
    if (options.click !== undefined) this.clickMode = options.click;
    if (options.countIn !== undefined) this.countIn = options.countIn;
    if (options.strumSpacing !== undefined) this.strumSpacing = options.strumSpacing;
  }

  /* ------------------------------------------------------------------ */
  /* Getters                                                             */
  /* ------------------------------------------------------------------ */

  getState(): PlayerState {
    return this.state;
  }

  getBpm(): number {
    return this.bpm;
  }

  getLoop(): boolean {
    return this.loop;
  }

  getNoteValue(): NoteValue {
    return this.noteValue;
  }

  getClick(): ClickMode {
    return this.clickMode;
  }

  getCountIn(): boolean {
    return this.countIn;
  }

  /** Column index the playhead is on. */
  getPosition(): number {
    return this.position;
  }

  getColumns(): FlatColumn[] {
    return this.columns;
  }

  /** Notes per beat for the current note value (1, 2 or 4). */
  notesPerBeat(): number {
    return this.noteValue / 4;
  }

  /** Total length of the tab in beats at the current note value. */
  getBeats(): number {
    return this.cumulativeUnits[this.columns.length] / this.notesPerBeat();
  }

  /** Total length of the tab at the current tempo, in seconds. */
  getDuration(): number {
    return this.getBeats() * this.secondsPerBeat();
  }

  /** Beat position at which a column starts. */
  columnPosition(index: number): number {
    return this.cumulativeUnits[Math.min(Math.max(0, index), this.columns.length)] / this.notesPerBeat();
  }

  /* ------------------------------------------------------------------ */
  /* Settings                                                            */
  /* ------------------------------------------------------------------ */

  /**
   * Swap the tab being played. Playback carries on (from the same column, clamped)
   * so tweaking the scale or tuning while listening feels live.
   */
  setTab(tab: TabData): void {
    this.tab = tab;
    this.columns = flattenTab(tab);
    this.cumulativeUnits = [0];
    for (const c of this.columns) this.cumulativeUnits.push(this.cumulativeUnits[this.cumulativeUnits.length - 1] + c.units);
    const clamped = Math.min(this.position, Math.max(0, this.columns.length - 1));
    if (this.state === "playing") {
      this.restartFrom(clamped, false);
    } else {
      this.position = clamped;
      if (this.columns.length === 0) this.stop();
      else if (this.state === "paused") this.report(this.position);
    }
  }

  setBpm(bpm: number): void {
    const next = Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(bpm)));
    if (next === this.bpm) return;
    this.bpm = next;
    // Events already scheduled keep their timing; everything after them uses the new tempo.
  }

  setLoop(loop: boolean): void {
    this.loop = loop;
    if (this.state === "playing" && loop && (this.endPos !== null || this.ended)) {
      // The end was already queued: carry on from the top instead of stopping.
      this.endPos = null;
      this.endTime = Infinity;
      this.ended = false;
      this.pending = this.pending.filter((p) => p.event.kind !== "end");
      this.wrapToStart();
    }
  }

  setNoteValue(value: NoteValue): void {
    if (value === this.noteValue) return;
    this.noteValue = value;
    // Column positions change, so re-plan from the current column.
    if (this.state === "playing") this.restartFrom(this.reportedPosition ?? this.position, false);
  }

  setClick(mode: ClickMode): void {
    // Takes effect at the next scheduled beat; the beat grid itself always runs.
    this.clickMode = mode;
  }

  setCountIn(countIn: boolean): void {
    this.countIn = countIn;
  }

  /* ------------------------------------------------------------------ */
  /* Transport                                                           */
  /* ------------------------------------------------------------------ */

  async play(): Promise<void> {
    if (this.state === "playing" || this.columns.length === 0) return;
    await this.synth.ensure();
    if (this.position >= this.columns.length) this.position = 0;
    this.startScheduler(this.position, this.countIn && this.clickMode !== "off");
    this.setState("playing");
  }

  pause(): void {
    if (this.state !== "playing") return;
    this.stopScheduler();
    this.synth.muteAll();
    // Resume from the column that was sounding when paused.
    this.position = this.reportedPosition ?? this.position;
    this.setState("paused");
    this.report(this.position);
    this.callbacks.onBeat?.(null);
  }

  stop(): void {
    if (this.state !== "stopped") {
      this.stopScheduler();
      this.synth.muteAll();
    }
    this.position = 0;
    this.setState("stopped");
    this.report(null);
    this.callbacks.onBeat?.(null);
  }

  async toggle(): Promise<void> {
    if (this.state === "playing") this.pause();
    else await this.play();
  }

  /** Jump to a column. While playing, playback continues from there (no count-in). */
  seek(index: number): void {
    if (this.columns.length === 0) return;
    const clamped = Math.min(Math.max(0, index), this.columns.length - 1);
    if (this.state === "playing") {
      this.restartFrom(clamped, false);
    } else {
      this.position = clamped;
      if (this.state === "stopped") this.setState("paused");
      this.report(clamped);
    }
  }

  /** Sounds a single column right now, without moving the playhead. */
  async preview(index: number): Promise<void> {
    const column = this.columns[index];
    if (!column || !this.tab) return;
    await this.synth.ensure();
    this.playColumn(column, this.synth.now);
  }

  dispose(): void {
    this.stopScheduler();
    this.synth.muteAll();
    this.callbacks = {};
  }

  /* ------------------------------------------------------------------ */
  /* Internals                                                           */
  /* ------------------------------------------------------------------ */

  private secondsPerBeat(): number {
    return 60 / this.bpm;
  }

  private setState(state: PlayerState) {
    if (this.state === state) return;
    this.state = state;
    this.callbacks.onState?.(state);
  }

  private report(index: number | null) {
    if (this.reportedPosition === index) return;
    this.reportedPosition = index;
    this.callbacks.onPosition?.(index);
  }

  private restartFrom(index: number, withCountIn: boolean) {
    this.stopScheduler();
    this.synth.muteAll();
    this.startScheduler(index, withCountIn);
  }

  /** Plans playback from a column: sets up the cursor, beat grid and optional count-in. */
  private startScheduler(fromIndex: number, withCountIn: boolean) {
    this.position = fromIndex;
    this.nextColumnIndex = fromIndex;
    this.nextColumnPos = this.columnPosition(fromIndex);
    this.barOrigin = 0;
    this.endPos = null;
    this.endTime = Infinity;
    this.ended = false;
    this.pending = [];

    if (withCountIn) {
      // One full bar of clicks before the bar that contains the first note.
      const barStart = Math.floor(this.nextColumnPos / BEATS_PER_BAR + EPS) * BEATS_PER_BAR;
      this.nextBeat = barStart - BEATS_PER_BAR;
      this.countInEnd = barStart;
      this.cursorPos = this.nextBeat;
    } else {
      this.nextBeat = Math.ceil(this.nextColumnPos - EPS);
      this.countInEnd = -Infinity;
      this.cursorPos = Math.min(this.nextColumnPos, this.nextBeat);
    }
    this.nextSubPos = this.firstSubAfter(this.cursorPos - EPS);
    this.cursorTime = this.synth.now + START_DELAY;

    this.tick();
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  private stopScheduler() {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.pending = [];
    this.endPos = null;
    this.endTime = Infinity;
  }

  /** First subdivision position (multiple of one note value) at or after `pos`. */
  private firstSubAfter(pos: number): number {
    const step = 1 / this.notesPerBeat();
    return Math.ceil(pos / step - EPS) * step;
  }

  /** After the last column: continue from the next beat boundary (keeps the downbeat on the tab's start). */
  private wrapToStart() {
    const endOfTab = this.columnPosition(this.columns.length);
    const restart = Math.ceil(endOfTab - EPS);
    this.nextColumnIndex = 0;
    this.nextColumnPos = restart;
    this.barOrigin = restart;
  }

  /** The next event in position order (columns first when tied, so the click and note coincide). */
  private nextEvent(): Event | null {
    if (this.ended) return null;
    const candidates: Event[] = [];
    if (this.nextColumnIndex < this.columns.length) {
      candidates.push({ kind: "column", pos: this.nextColumnPos, index: this.nextColumnIndex });
    } else if (this.endPos !== null) {
      candidates.push({ kind: "end", pos: this.endPos });
    }
    const beatPos = this.nextBeat;
    if (this.endPos === null || beatPos < this.endPos - EPS) {
      const countIn = beatPos < this.countInEnd - EPS;
      const origin = countIn ? this.countInEnd - BEATS_PER_BAR : this.barOrigin;
      const barBeat = (((beatPos - origin) % BEATS_PER_BAR) + BEATS_PER_BAR) % BEATS_PER_BAR;
      candidates.push({
        kind: "beat",
        pos: beatPos,
        info: { beat: Math.round(barBeat) + 1, bar: Math.floor((beatPos - this.barOrigin) / BEATS_PER_BAR + EPS), countIn },
      });
    }
    if (this.clickMode === "subdivided" && this.notesPerBeat() > 1) {
      // The subdivision stream may be stale if the click was just switched on: catch it up.
      if (this.nextSubPos < this.cursorPos - EPS) this.nextSubPos = this.firstSubAfter(this.cursorPos - EPS);
      if (this.endPos === null || this.nextSubPos < this.endPos - EPS) candidates.push({ kind: "sub", pos: this.nextSubPos });
    }
    candidates.sort((a, b) => a.pos - b.pos || order(a) - order(b));
    return candidates[0] ?? null;
  }

  private tick() {
    const now = this.synth.now;
    const spb = this.secondsPerBeat();

    // 1. Schedule everything that starts inside the look-ahead window.
    for (;;) {
      const event = this.nextEvent();
      if (!event) break;
      const time = this.cursorTime + Math.max(0, event.pos - this.cursorPos) * spb;
      if (time >= now + LOOKAHEAD_SECONDS) break;
      this.cursorPos = Math.max(this.cursorPos, event.pos);
      this.cursorTime = time;

      switch (event.kind) {
        case "column": {
          const column = this.columns[event.index];
          this.playColumn(column, time);
          this.pending.push({ time, event });
          this.nextColumnIndex++;
          this.nextColumnPos += column.units / this.notesPerBeat();
          if (this.nextColumnIndex >= this.columns.length) {
            if (this.loop) this.wrapToStart();
            else this.endPos = this.nextColumnPos;
          }
          break;
        }
        case "beat": {
          if (this.clickMode !== "off") this.synth.click(event.info.beat === 1 ? "bar" : "beat", time);
          this.pending.push({ time, event });
          this.nextBeat += 1;
          break;
        }
        case "sub": {
          // Ticks on the beat itself are handled by the beat event; only the in-between ones sound here.
          if (Math.abs(event.pos - Math.round(event.pos)) > EPS && event.pos >= this.countInEnd - EPS) {
            this.synth.click("sub", time);
          }
          this.nextSubPos = this.firstSubAfter(event.pos + EPS);
          break;
        }
        case "end": {
          this.endTime = time;
          this.endPos = null;
          this.ended = true;
          this.pending.push({ time, event });
          break;
        }
      }
    }

    // 2. Move the UI to the most recent events that have actually started sounding.
    let position: number | null = null;
    let beat: BeatInfo | null = null;
    while (this.pending.length && this.pending[0].time <= now) {
      const { event } = this.pending.shift()!;
      if (event.kind === "column") position = event.index;
      else if (event.kind === "beat") beat = event.info;
    }
    if (position !== null) {
      this.position = position;
      this.report(position);
    }
    if (beat !== null) this.callbacks.onBeat?.(beat);

    // 3. Reached the end (not looping): stop and leave the playhead off.
    if (now >= this.endTime) {
      this.stopScheduler();
      this.position = 0;
      this.setState("stopped");
      this.report(null);
      this.callbacks.onBeat?.(null);
    }
  }

  private playColumn(column: FlatColumn, when: number) {
    if (!this.tab) return;
    const tuning = this.tab.tuning;
    const notes = [...column.notes].sort((a, b) => a.string - b.string);
    const strum = notes.length > 1;
    notes.forEach((note, i) => {
      this.synth.pluck(tabNoteMidi(tuning, note), when + (strum ? i * this.strumSpacing : 0), {
        velocity: strum ? 0.85 : 0.95,
        stringIndex: note.string,
        channel: this.channel,
      });
    });
  }
}

/** Tie-break: notes before clicks before subdivisions before the end marker. */
function order(e: Event): number {
  return e.kind === "column" ? 0 : e.kind === "beat" ? 1 : e.kind === "sub" ? 2 : 3;
}
