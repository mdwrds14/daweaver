import { Tuning, tuningMidi } from "./tunings";
import {
  getScalePitchClasses,
  midiToPitchClass,
  spellScaleTone,
  intervalFromRoot,
  scaleDegreeLabel,
} from "./theoryEngine";
import { TabData, TabNote, TabColumn, columnsToMeasures, NoteRole } from "./tab";

/** Number of frets covered by one hand position (index finger + 4 frets of reach). */
export const POSITION_SPAN = 4;

export interface ScalePositionNote extends TabNote {
  midi: number;
  pc: number;
  /** Scale degree label, e.g. "b3". */
  degree: string;
}

export interface ScalePosition {
  position: number;
  lowFret: number;
  highFret: number;
  /** Every scale note inside the position window, on every string. */
  available: ScalePositionNote[];
  /** A clean ascending run through the position (one note per pitch, strings never go backwards). */
  run: ScalePositionNote[];
}

export interface ScaleTabOptions {
  /** "octave": root to highest root. "full": every note in the position from the lowest root. */
  range?: "octave" | "full";
  /** Append the same run played backwards. */
  descend?: boolean;
  notesPerMeasure?: number;
}

function roleForInterval(interval: number, scaleKey: string): NoteRole {
  if (interval === 0) return "root";
  if (scaleKey === "blues" && interval === 6) return "blue";
  return "scale";
}

/**
 * Fret of the lowest root note on the lowest string, then the "box" position
 * where that root sits under the 2nd finger (or open position if the root is open).
 */
export function rootBoxPosition(tuning: Tuning, rootPc: number): number {
  const lowOpen = midiToPitchClass(tuningMidi(tuning)[0]);
  const rootFret = (((rootPc - lowOpen) % 12) + 12) % 12;
  return Math.max(0, rootFret - 1);
}

/**
 * Collects every scale note that falls inside a hand position and derives a clean
 * ascending run.
 *
 * The run is built from actual pitches (not fret shapes), so it is correct in any
 * tuning: unique pitches in ascending order, each assigned to the lowest string that
 * has it inside the window without going back to a lower string.
 */
export function buildScalePosition(
  tuning: Tuning,
  rootPc: number,
  scaleKey: string,
  position: number,
  span: number = POSITION_SPAN,
): ScalePosition {
  const scalePcs = getScalePitchClasses(rootPc, scaleKey);
  return buildPositionRun(tuning, position, span, (pc) => {
    if (!scalePcs.includes(pc)) return null;
    const interval = intervalFromRoot(rootPc, pc);
    return {
      degree: scaleDegreeLabel(scaleKey, interval),
      role: roleForInterval(interval, scaleKey),
      noteName: spellScaleTone(rootPc, scaleKey, interval),
    };
  });
}

/** How a pitch class should appear in a position run (or null to leave it out). */
export interface PositionNoteInfo {
  degree: string;
  role: NoteRole;
  noteName: string;
}

/**
 * The generic engine behind scale and arpeggio positions: collects every wanted pitch
 * class inside the hand position on every string, then derives the ascending run.
 */
export function buildPositionRun(
  tuning: Tuning,
  position: number,
  span: number,
  describe: (pc: number) => PositionNoteInfo | null,
): ScalePosition {
  const opens = tuningMidi(tuning);
  const lowFret = Math.max(0, position);
  const highFret = lowFret + span;

  const available: ScalePositionNote[] = [];
  opens.forEach((open, stringIndex) => {
    for (let fret = lowFret; fret <= highFret; fret++) {
      const midi = open + fret;
      const pc = midiToPitchClass(midi);
      const info = describe(pc);
      if (!info) continue;
      available.push({ string: stringIndex, fret, midi, pc, ...info });
    }
  });

  // Unique pitches, ascending.
  const pitches = Array.from(new Set(available.map((n) => n.midi))).sort((a, b) => a - b);

  const run: ScalePositionNote[] = [];
  let currentString = 0;
  for (const midi of pitches) {
    // The same pitch can exist on two strings (e.g. open B = G string fret 4).
    // Prefer the lower fret: that is what position playing naturally does.
    const candidates = available
      .filter((n) => n.midi === midi && n.string >= currentString)
      .sort((a, b) => a.fret - b.fret || a.string - b.string);
    if (candidates.length === 0) continue; // not reachable without going backwards (very rare)
    const chosen = candidates[0];
    currentString = chosen.string;
    run.push(chosen);
  }

  // Fingering: the lowest fretted fret in the run sits under the index finger.
  const frettedFrets = run.filter((n) => n.fret > 0).map((n) => n.fret);
  const indexFret = frettedFrets.length ? Math.min(...frettedFrets) : 1;
  for (const note of run) {
    note.finger = note.fret === 0 ? 0 : Math.min(4, note.fret - indexFret + 1);
  }
  for (const note of available) {
    note.finger = note.fret === 0 ? 0 : Math.min(4, note.fret - indexFret + 1);
  }

  return { position: lowFret, lowFret, highFret, available, run };
}

/** Turns a scale position into tablature data ready for the <Tablature /> component. */
export function scalePositionToTab(
  tuning: Tuning,
  scalePos: ScalePosition,
  options: ScaleTabOptions = {},
): TabData {
  const { range = "octave", descend = false, notesPerMeasure = 8 } = options;

  let run = scalePos.run;
  const rootIndexes = run.map((n, i) => (n.role === "root" ? i : -1)).filter((i) => i >= 0);

  if (rootIndexes.length > 0) {
    const first = rootIndexes[0];
    const last = rootIndexes[rootIndexes.length - 1];
    if (range === "octave" && last > first) {
      run = run.slice(first, last + 1);
    } else {
      run = run.slice(first);
    }
  }

  let sequence = run;
  if (descend && run.length > 1) {
    sequence = [...run, ...[...run].reverse().slice(1)];
  }

  const columns: TabColumn[] = sequence.map((note) => ({ notes: [note] }));
  return {
    tuning: tuning.notes,
    measures: columnsToMeasures(columns, notesPerMeasure),
  };
}
