import { Tuning, tuningMidi } from "./tunings";
import {
  CHORDS,
  getChordPitchClasses,
  midiToPitchClass,
  spellChordTone,
  intervalFromRoot,
} from "./theoryEngine";
import { NoteRole, TabColumn, TabData, TabNote } from "./tab";

export interface Barre {
  fret: number;
  /** Lowest string index covered (the barre always extends to the highest string). */
  fromString: number;
  toString: number;
}

export interface ChordVoicing {
  /** Fret per string, lowest string first. null = muted / not played. */
  frets: (number | null)[];
  /** Finger per string (1 = index ... 4 = pinky). 0 = open, null = muted. */
  fingers: (number | null)[];
  barre: Barre | null;
  /** Lowest fretted fret (0 when the chord only uses open strings). */
  baseFret: number;
  /** Note name per string. */
  noteNames: (string | null)[];
  /** Interval role per string, for colouring. */
  roles: (NoteRole | null)[];
  /** Interval (semitones from the root) of the lowest sounding string. */
  bassInterval: number;
  /** Beginner-friendliness; higher is easier. */
  score: number;
  /** Human readable tags like "Open chord", "Barre", "Inversion". */
  tags: string[];
}

export interface VoicingOptions {
  /** Highest fret to consider. */
  maxFret?: number;
  /** Max distance between the lowest and highest fretted fret. 3 = a 4-fret box. */
  maxSpan?: number;
  maxResults?: number;
  /** Require the root to be the bass note. */
  rootInBass?: boolean;
}

function roleForInterval(interval: number): NoteRole {
  switch (interval) {
    case 0: return "root";
    case 3: case 4: case 2: case 5: return "third"; // 3rds and their sus replacements
    case 6: case 7: case 8: return "fifth";
    case 10: case 11: return "seventh";
    default: return "other";
  }
}

/**
 * Assign fingers to an ordered list of fretted notes (sorted by fret, then string).
 * Prefers "finger = distance from the index finger" (so 3-5-5 becomes 1-3-4), and falls
 * back to plain sequential fingers when that would run out of fingers.
 */
function fingersInOrder(
  ordered: { fret: number; string: number }[],
  minFret: number,
  firstFinger: number,
): Map<number, number> | null {
  const byDistance = new Map<number, number>();
  let prev = firstFinger - 1;
  let overflow = false;
  for (const n of ordered) {
    const f = Math.max(prev + 1, n.fret - minFret + 1);
    if (f > 4) { overflow = true; break; }
    byDistance.set(n.string, f);
    prev = f;
  }
  if (!overflow) return byDistance;

  if (ordered.length > 4 - (firstFinger - 1)) return null;
  const sequential = new Map<number, number>();
  ordered.forEach((n, i) => sequential.set(n.string, firstFinger + i));
  return sequential;
}

/**
 * Work out which finger presses which string. Returns null when the shape is not
 * physically playable with four fingers (with at most one barre at the lowest fret).
 */
export function assignFingers(frets: (number | null)[]): { fingers: (number | null)[]; barre: Barre | null } | null {
  const fretted = frets
    .map((f, s) => ({ fret: f as number, string: s }))
    .filter((n) => n.fret !== null && n.fret > 0);

  const fingers: (number | null)[] = frets.map((f) => (f === null ? null : f === 0 ? 0 : null));

  if (fretted.length === 0) return { fingers, barre: null };

  const minFret = Math.min(...fretted.map((n) => n.fret));
  const atMin = fretted.filter((n) => n.fret === minFret).sort((a, b) => a.string - b.string);

  // Can the index finger lie flat across every string from the lowest min-fret string upward?
  let barreFeasible = false;
  if (atMin.length >= 2) {
    const fromString = atMin[0].string;
    barreFeasible = true;
    for (let s = fromString; s < frets.length; s++) {
      const f = frets[s];
      if (f === null || f < minFret) { barreFeasible = false; break; }
    }
  }
  // A barre is natural when two neighbouring strings share the lowest fret.
  const adjacentAtMin = atMin.some((n, i) => i > 0 && n.string === atMin[i - 1].string + 1);
  const needsBarre = fretted.length > 4;
  // Barre when we must, when neighbouring strings share the lowest fret, or when the
  // alternative would tie up all four fingers (e.g. the "small F": x x 3 2 1 1).
  const useBarre = barreFeasible && (needsBarre || adjacentAtMin || fretted.length === 4);

  if (!useBarre) {
    if (needsBarre) return null;
    const ordered = [...fretted].sort((a, b) => a.fret - b.fret || a.string - b.string);
    const assigned = fingersInOrder(ordered, minFret, 1);
    if (!assigned) return null;
    assigned.forEach((finger, string) => { fingers[string] = finger; });
    return { fingers, barre: null };
  }

  for (const n of atMin) fingers[n.string] = 1;
  const rest = fretted
    .filter((n) => n.fret > minFret)
    .sort((a, b) => a.fret - b.fret || a.string - b.string);
  const assigned = fingersInOrder(rest, minFret, 2);
  if (!assigned) return null;
  assigned.forEach((finger, string) => { fingers[string] = finger; });
  return {
    fingers,
    barre: { fret: minFret, fromString: atMin[0].string, toString: frets.length - 1 },
  };
}

/** Convex penalty for the fret span: a 4-fret stretch is much harder than a 2-fret one. */
const SPAN_PENALTY = [0, 0.5, 1.5, 4.5];

function scoreVoicing(
  frets: (number | null)[],
  fingers: (number | null)[],
  barre: Barre | null,
  bassInterval: number,
  coveredCount: number,
  powerChord = false,
  unisons = 0,
): number {
  const sounding = frets.filter((f) => f !== null) as number[];
  const fretted = sounding.filter((f) => f > 0);
  const open = sounding.filter((f) => f === 0).length;
  const baseFret = fretted.length ? Math.min(...fretted) : 0;
  const span = fretted.length ? Math.max(...fretted) - baseFret : 0;
  const fingerCount = new Set(fingers.filter((f) => f !== null && f > 0)).size;

  // Muted strings: at the bass end they are normal; in the middle they are awkward to strum.
  let lowMutes = 0, innerMutes = 0, highMutes = 0;
  const firstSounding = frets.findIndex((f) => f !== null);
  const lastSounding = frets.length - 1 - [...frets].reverse().findIndex((f) => f !== null);
  frets.forEach((f, s) => {
    if (f !== null) return;
    if (s < firstSounding) lowMutes++;
    else if (s > lastSounding) highMutes++;
    else innerMutes++;
  });

  // An open string squeezed between two fretted neighbours is hard to keep ringing
  // once those fingers are up at the 3rd fret or beyond (they tend to arch over and mute it).
  let awkwardOpens = 0;
  frets.forEach((f, s) => {
    if (f !== 0 || s === 0 || s === frets.length - 1) return;
    const below = frets[s - 1], above = frets[s + 1];
    if (below !== null && above !== null && below > 0 && above > 0 && Math.max(below, above) >= 3) {
      awkwardOpens++;
    }
  });

  // Fuller voicings sound better; going from 3 to 4 strings matters most.
  const STRING_BONUS = [0, 0, 4, 6, 9.5, 11.5, 13.5, 15.5, 17.5];
  let score = 0;
  if (powerChord) {
    // Power chords are tight two- or three-string shapes on the bass strings: extra
    // strings only muddy them, and the unplayed trebles are simply not strummed.
    score += STRING_BONUS[Math.min(sounding.length, 3)];
    score -= Math.max(0, sounding.length - 3) * 2;
    score -= firstSounding * 2.0;
    // Root-5th-octave is the shape; two strings on the same pitch is not.
    score -= unisons * 4;
  } else {
    score += STRING_BONUS[Math.min(sounding.length, STRING_BONUS.length - 1)];
  }
  score += open * 1.5;
  score -= baseFret * 1.2;
  score -= fingerCount * 1.5;
  score -= SPAN_PENALTY[Math.min(span, SPAN_PENALTY.length - 1)];
  score -= barre ? 2 + 0.5 * (barre.toString - barre.fromString + 1) : 0;
  // A barre combined with a 4-fret stretch is a real contortion.
  score -= barre && span >= 3 ? 4 : 0;
  // Beginners learn chords in root position; a 5th in the bass is the mildest inversion.
  score += bassInterval === 0 ? 5 : bassInterval === 7 ? -3 : -6;
  score -= lowMutes * 0.5 + highMutes * (powerChord ? 0.5 : 8) + innerMutes * 14;
  score -= awkwardOpens * 6.5;
  score += coveredCount;
  // Tie-breaker: prefer shapes that sit lower on the neck overall.
  score -= fretted.reduce((a, b) => a + b, 0) * 0.05;
  return score;
}

/**
 * Finds playable ways to fret a chord in a given tuning, easiest first.
 */
export function findChordVoicings(
  tuning: Tuning,
  rootPc: number,
  chordKey: string,
  options: VoicingOptions = {},
): ChordVoicing[] {
  const { maxFret = 12, maxSpan = 3, maxResults = 6, rootInBass = false } = options;
  const chord = CHORDS[chordKey];
  if (!chord) return [];

  const opens = tuningMidi(tuning);
  const chordPcs = getChordPitchClasses(rootPc, chordKey);
  const required = chord.intervals.filter((i) => !chord.optional.includes(i)).map((i) => (rootPc + i) % 12);
  const minStrings = Math.max(2, Math.min(3, required.length));
  const powerChord = chord.intervals.length === 2;

  // Per-string candidate frets (plus "muted").
  const candidates: (number | null)[][] = opens.map((open) => {
    const list: (number | null)[] = [null];
    for (let f = 0; f <= maxFret; f++) {
      if (chordPcs.includes(midiToPitchClass(open + f))) list.push(f);
    }
    return list;
  });

  let results: ChordVoicing[] = [];
  const seen = new Set<string>();
  const current: (number | null)[] = new Array(opens.length).fill(null);

  const visit = (stringIndex: number, minFretted: number, maxFretted: number, innerMutes: number, maxInnerMutes: number) => {
    if (stringIndex === opens.length) {
      evaluate([...current]);
      return;
    }
    for (const f of candidates[stringIndex]) {
      let nextMin = minFretted, nextMax = maxFretted;
      if (f !== null && f > 0) {
        nextMin = Math.min(minFretted, f);
        nextMax = Math.max(maxFretted, f);
        if (nextMax - nextMin > maxSpan) continue;
      }
      // Muted strings that are not at the bass end are hard to strum around.
      let nextInner = innerMutes;
      if (f === null && current.slice(0, stringIndex).some((x) => x !== null)) {
        nextInner++;
        if (nextInner > maxInnerMutes) continue;
      }
      current[stringIndex] = f;
      visit(stringIndex + 1, nextMin, nextMax, nextInner, maxInnerMutes);
      current[stringIndex] = null;
    }
  };

  const evaluate = (frets: (number | null)[]) => {
    const soundingIdx = frets.map((f, s) => (f === null ? -1 : s)).filter((s) => s >= 0);
    if (soundingIdx.length < minStrings) return;

    const pcs = soundingIdx.map((s) => midiToPitchClass(opens[s] + (frets[s] as number)));
    for (const r of required) if (!pcs.includes(r)) return;

    const bassInterval = intervalFromRoot(rootPc, pcs[0]);
    if (rootInBass && bassInterval !== 0) return;

    const fingering = assignFingers(frets);
    if (!fingering) return;

    const key = frets.map((f) => (f === null ? "x" : f)).join(",");
    if (seen.has(key)) return;
    seen.add(key);

    const covered = new Set(pcs).size;
    const fretted = frets.filter((f) => f !== null && f > 0) as number[];
    const baseFret = fretted.length ? Math.min(...fretted) : 0;
    const midis = soundingIdx.map((s) => opens[s] + (frets[s] as number));
    const unisons = midis.length - new Set(midis).size;
    const score = scoreVoicing(frets, fingering.fingers, fingering.barre, bassInterval, covered, powerChord, unisons);

    const hasOpen = frets.some((f) => f === 0);
    const maxFretUsed = fretted.length ? Math.max(...fretted) : 0;
    const tags: string[] = [];
    if (fretted.length === 0) tags.push("All open");
    else if (fingering.barre) tags.push("Barre");
    else if (hasOpen && maxFretUsed <= 4) tags.push("Open chord");
    else if (!hasOpen) tags.push("Movable shape");
    else tags.push("Open string");
    if (bassInterval !== 0) tags.push("Inversion");

    results.push({
      frets,
      fingers: fingering.fingers,
      barre: fingering.barre,
      baseFret,
      noteNames: frets.map((f, s) => (f === null ? null : spellChordTone(rootPc, chordKey, intervalFromRoot(rootPc, midiToPitchClass(opens[s] + f))))),
      roles: frets.map((f, s) => (f === null ? null : roleForInterval(intervalFromRoot(rootPc, midiToPitchClass(opens[s] + f))))),
      bassInterval,
      score,
      tags,
    });
  };

  // Pass 1: strummable shapes only (muted strings allowed at the bass end only).
  // Power chords are the exception: "0 2 2 x x x" leaves the trebles unplayed on purpose,
  // so any number of muted strings is explored and the score sorts out the sensible ones.
  visit(0, Infinity, -Infinity, 0, powerChord ? opens.length : 0);
  results.sort((a, b) => b.score - a.score);
  const strummable = results.slice(0, maxResults);

  // Pass 2: if that is not enough, allow one muted string in the middle (fingerstyle-friendly).
  if (strummable.length < maxResults) {
    results = [];
    visit(0, Infinity, -Infinity, 0, 1);
    results.sort((a, b) => b.score - a.score);
    return [...strummable, ...results].slice(0, maxResults);
  }
  return strummable;
}

/** Compact "x 3 2 0 1 0" notation, lowest string first. */
export function voicingToString(v: ChordVoicing): string {
  return v.frets.map((f) => (f === null ? "x" : String(f))).join(" ");
}

/** How long each strummed chord rings in the voicings tab, in note values (2 = a half note when playing quarters). */
export const CHORD_COLUMN_BEATS = 2;

/** A single strummed column for the tab renderer. */
export function voicingToTabColumn(v: ChordVoicing, label?: string, duration: number = CHORD_COLUMN_BEATS): TabColumn {
  const notes: TabNote[] = [];
  v.frets.forEach((f, s) => {
    if (f === null) return;
    notes.push({
      string: s,
      fret: f,
      finger: v.fingers[s] ?? undefined,
      role: v.roles[s] ?? undefined,
      noteName: v.noteNames[s] ?? undefined,
    });
  });
  return { notes, label, duration };
}

/** The sounding notes of a voicing as MIDI pitches (lowest string first), for playback. */
export function voicingMidiNotes(tuning: Tuning, v: ChordVoicing): { stringIndex: number; midi: number }[] {
  const opens = tuningMidi(tuning);
  const out: { stringIndex: number; midi: number }[] = [];
  v.frets.forEach((f, s) => {
    if (f !== null) out.push({ stringIndex: s, midi: opens[s] + f });
  });
  return out;
}

/** Several voicings side by side on one tab line. */
export function voicingsToTab(tuning: Tuning, voicings: ChordVoicing[], label: string): TabData {
  return {
    tuning: tuning.notes,
    measures: voicings.map((v, i) => ({
      columns: [voicingToTabColumn(v, `${label} #${i + 1}`)],
    })),
  };
}
