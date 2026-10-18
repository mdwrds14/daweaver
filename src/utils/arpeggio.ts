/**
 * Arpeggios in a key.
 *
 * An arpeggio is a chord played one note at a time. Here they come from the key:
 * pick a scale, harmonise it (`getDiatonicChords`), and every degree's chord can be
 * played as an arpeggio in a hand position, or strung together as a progression.
 * Like the scale runs, everything is built from real pitches, so it works in any
 * tuning and on 6, 7 or 8 strings.
 */

import { Tuning } from "./tunings";
import { DiatonicChord, intervalFromRoot, chordDegreeLabel, spellScaleTone, getScalePitchClasses, getDiatonicChords, SCALES } from "./theoryEngine";
import { buildPositionRun, ScalePosition, ScalePositionNote, POSITION_SPAN, scalePositionToTab } from "./scaleTab";
import { TabData, TabColumn, TabMeasure, NoteRole } from "./tab";

/**
 * Scales that harmonise completely into standard chords: seven notes, and every
 * degree's triad *and* 7th chord is something in CHORDS. (Double Harmonic, Hungarian
 * Minor and Persian stack into things like "major b5" on some degrees, so they stay
 * in the Scales view only.)
 */
export function arpeggioScaleKeys(): string[] {
  return Object.keys(SCALES).filter(
    (k) => SCALES[k].intervals.length === 7 && getDiatonicChords(0, k, false).length === 7 && getDiatonicChords(0, k, true).length === 7,
  );
}

function roleForChordInterval(interval: number): NoteRole {
  switch (interval) {
    case 0: return "root";
    case 3: case 4: return "third";
    case 6: case 7: case 8: return "fifth";
    case 9: case 10: case 11: return "seventh";
    default: return "other";
  }
}

/**
 * Every tone of `chord` inside a hand position, plus the ascending run through them.
 * Note names follow the key's spelling (so the V of F major reads C E G Bb).
 */
export function buildArpeggioPosition(
  tuning: Tuning,
  keyRootPc: number,
  scaleKey: string,
  chord: DiatonicChord,
  position: number,
  span: number = POSITION_SPAN,
): ScalePosition {
  return buildPositionRun(tuning, position, span, (pc) => {
    if (!chord.pcs.includes(pc)) return null;
    const interval = intervalFromRoot(chord.rootPc, pc);
    return {
      degree: chordDegreeLabel(chord.chordKey, interval),
      role: roleForChordInterval(interval),
      noteName: spellScaleTone(keyRootPc, scaleKey, intervalFromRoot(keyRootPc, pc)),
    };
  });
}

/* ------------------------------------------------------------------ */
/* Progressions                                                        */
/* ------------------------------------------------------------------ */

export interface Progression {
  key: string;
  /** Short name shown on the chip ("1 – 5 – 6 – 4"). */
  name: string;
  /** 0-based scale degrees, in order. */
  degrees: number[];
  description: string;
  /** Which key flavour it is most at home in (purely a hint for the UI). */
  feel: "major" | "minor" | "any";
}

/**
 * Common progressions, written as scale degrees so they work in any key and scale:
 * in C major 1–5–6–4 is C G Am F; in A minor the same degrees give Am Em F Dm.
 */
export const PROGRESSIONS: Progression[] = [
  { key: "145", name: "1 – 4 – 5", degrees: [0, 3, 4], description: "The three-chord song: folk, blues, rock 'n' roll.", feel: "major" },
  { key: "1564", name: "1 – 5 – 6 – 4", degrees: [0, 4, 5, 3], description: "The four-chord pop progression (Let It Be, Don't Stop Believin').", feel: "major" },
  { key: "1645", name: "1 – 6 – 4 – 5", degrees: [0, 5, 3, 4], description: "The 50s doo-wop changes (Stand By Me).", feel: "major" },
  { key: "6415", name: "6 – 4 – 1 – 5", degrees: [5, 3, 0, 4], description: "The same four chords starting on the minor vi: moodier pop.", feel: "major" },
  { key: "251", name: "2 – 5 – 1", degrees: [1, 4, 0], description: "The jazz cadence. Try it with 7th chords.", feel: "major" },
  { key: "1765", name: "1 – 7 – 6 – 5", degrees: [0, 6, 5, 4], description: "The Andalusian cadence in a minor key (flamenco, Hit the Road Jack).", feel: "minor" },
  { key: "1637", name: "1 – 6 – 3 – 7", degrees: [0, 5, 2, 6], description: "Minor-key pop and rock (i – VI – III – VII).", feel: "minor" },
  { key: "1467", name: "1 – 4 – 6 – 7", degrees: [0, 3, 5, 6], description: "A brooding minor loop (i – iv – VI – VII).", feel: "minor" },
  {
    key: "blues12",
    name: "12-bar blues",
    degrees: [0, 0, 0, 0, 3, 3, 0, 0, 4, 3, 0, 4],
    description: "Twelve bars of 1, 4 and 5. Use 7th chords for the real blues sound.",
    feel: "any",
  },
  { key: "all", name: "Every chord", degrees: [0, 1, 2, 3, 4, 5, 6], description: "Walk up the key one chord at a time: hear how each degree sounds.", feel: "any" },
];

export interface ProgressionTabOptions {
  /**
   * Notes played per chord: the arpeggio bounces up and down to fill that many.
   * "all" plays the whole run up and back down, however long it is (so a three-octave
   * run on an 8-string is heard in full).
   */
  notesPerChord?: number | "all";
  /** "octave": lowest root to highest root. "full": every chord tone in the position from the lowest root. */
  range?: "octave" | "full";
}

/** One chord's share of a progression tab. */
export interface ProgressionStep {
  chord: DiatonicChord;
  position: ScalePosition;
  /** Flat column index of the chord's first note. */
  firstColumn: number;
  columns: number;
}

/**
 * The ascending run of an arpeggio position: "octave" = from the lowest root to the
 * highest root under the hand (that is one octave on a 6-string in most positions,
 * but two or three on a 7- or 8-string); "full" = from the lowest root to the top
 * of the position.
 */
export function arpeggioRun(pos: ScalePosition, range: "octave" | "full"): ScalePositionNote[] {
  let run = pos.run;
  const roots = run.map((n, i) => (n.role === "root" ? i : -1)).filter((i) => i >= 0);
  if (roots.length > 0) {
    const first = roots[0];
    const last = roots[roots.length - 1];
    run = range === "octave" && last > first ? run.slice(first, last + 1) : run.slice(first);
  }
  return run;
}

/**
 * Fills `count` notes by bouncing up and down the run (C E G C G E C E ...), the way
 * an arpeggiated accompaniment keeps going under a chord.
 */
export function bouncePattern<T>(run: T[], count: number): T[] {
  if (run.length === 0) return [];
  if (run.length === 1) return Array.from({ length: count }, () => run[0]);
  const cycle = [...run, ...run.slice(1, -1).reverse()];
  return Array.from({ length: count }, (_, i) => cycle[i % cycle.length]);
}

/** The whole run up and back down (C E G C G E C), without repeating the top note. */
export function upAndDown<T>(run: T[]): T[] {
  return run.length > 1 ? [...run, ...run.slice(0, -1).reverse()] : [...run];
}

/**
 * Arpeggiates a chord progression in one hand position: each chord becomes one
 * measure of `notesPerChord` notes, labelled with its symbol and numeral.
 */
export function progressionToTab(
  tuning: Tuning,
  keyRootPc: number,
  scaleKey: string,
  chords: DiatonicChord[],
  position: number,
  options: ProgressionTabOptions = {},
): { tab: TabData; steps: ProgressionStep[] } {
  const { notesPerChord = 8, range = "octave" } = options;
  const measures: TabMeasure[] = [];
  const steps: ProgressionStep[] = [];
  let flat = 0;
  for (const chord of chords) {
    const pos = buildArpeggioPosition(tuning, keyRootPc, scaleKey, chord, position);
    const run = arpeggioRun(pos, range);
    const notes = notesPerChord === "all" ? upAndDown(run) : bouncePattern(run, notesPerChord);
    const columns: TabColumn[] = notes.map((note, i) => ({
      notes: [note],
      label: i === 0 ? `${chord.numeral} ${chord.symbol}` : undefined,
    }));
    measures.push({ columns });
    steps.push({ chord, position: pos, firstColumn: flat, columns: columns.length });
    flat += columns.length;
  }
  return { tab: { tuning: tuning.notes, measures }, steps };
}

/** A single chord's arpeggio as tab (same options as a scale run). */
export function arpeggioToTab(
  tuning: Tuning,
  pos: ScalePosition,
  chord: DiatonicChord,
  options: { range?: "octave" | "full"; descend?: boolean; notesPerMeasure?: number } = {},
): TabData {
  const tab = scalePositionToTab(tuning, pos, options);
  const first = tab.measures[0]?.columns[0];
  if (first) first.label = `${chord.numeral} ${chord.symbol}`;
  return tab;
}

/** Pitch classes of the key, for showing scale context around an arpeggio. */
export function keyPitchClasses(keyRootPc: number, scaleKey: string): number[] {
  return getScalePitchClasses(keyRootPc, scaleKey);
}
