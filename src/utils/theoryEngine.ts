/**
 * Core music-theory engine.
 *
 * Everything here is tuning-agnostic and works on two representations:
 *   - pitch classes  (0–11, where C = 0)  -> "which note name"
 *   - MIDI numbers   (C4 = 60)            -> "which exact pitch"
 *
 * Note names can be written with or without an octave ("F#", "F#3", "Bb2").
 */

// The 12 semitones in western music theory (sharp spelling)
export const CHROMATIC_SCALE = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
];

// The same 12 semitones, spelled with flats
export const CHROMATIC_FLATS = [
  "C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B",
];

const NATURAL_PC: Record<string, number> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
};

export const INTERVAL_LABELS = [
  "1", "b2", "2", "b3", "3", "4", "b5", "5", "b6", "6", "b7", "7",
];

export const INTERVAL_NAMES = [
  "Root", "Minor 2nd", "Major 2nd", "Minor 3rd", "Major 3rd", "Perfect 4th",
  "Tritone", "Perfect 5th", "Minor 6th", "Major 6th", "Minor 7th", "Major 7th",
];

const LABEL_NAMES: Record<string, string> = {
  "1": "Root", "b2": "Minor 2nd", "2": "Major 2nd", "b3": "Minor 3rd", "3": "Major 3rd",
  "4": "Perfect 4th", "#4": "Augmented 4th", "b5": "Flat 5th", "5": "Perfect 5th",
  "#5": "Augmented 5th", "b6": "Minor 6th", "6": "Major 6th", "b7": "Minor 7th", "7": "Major 7th",
};

/** Full interval name for a degree label ("#4" -> "Augmented 4th"). */
export function intervalNameForLabel(label: string): string {
  return LABEL_NAMES[label] ?? label;
}

/* ------------------------------------------------------------------ */
/* Parsing & naming                                                    */
/* ------------------------------------------------------------------ */

/**
 * Strips away octave numbers (e.g., "E2" or "D4") to get just the note letter.
 */
export function getNoteName(pitchString: string): string {
  return pitchString.replace(/[0-9]/g, "").trim();
}

/** "F#" | "Gb" | "F#3" -> 6. Returns -1 for unknown input. */
export function pitchClassOf(note: string): number {
  const name = getNoteName(note);
  if (!name) return -1;
  const letter = name[0].toUpperCase();
  const base = NATURAL_PC[letter];
  if (base === undefined) return -1;
  let pc = base;
  for (const acc of name.slice(1)) {
    if (acc === "#") pc += 1;
    else if (acc === "b") pc -= 1;
    else return -1;
  }
  return ((pc % 12) + 12) % 12;
}

/** "E2" -> 40, "C4" -> 60. Notes without an octave are treated as octave 4. */
export function noteToMidi(note: string): number {
  const pc = pitchClassOf(note);
  if (pc === -1) return -1;
  const octaveMatch = note.match(/-?\d+/);
  const octave = octaveMatch ? parseInt(octaveMatch[0], 10) : 4;
  return (octave + 1) * 12 + pc;
}

export function midiToPitchClass(midi: number): number {
  return ((midi % 12) + 12) % 12;
}

export function midiToOctave(midi: number): number {
  return Math.floor(midi / 12) - 1;
}

/** Pitch class -> note name, optionally spelled with flats. */
export function pcToName(pc: number, useFlats = false): string {
  const idx = ((pc % 12) + 12) % 12;
  return useFlats ? CHROMATIC_FLATS[idx] : CHROMATIC_SCALE[idx];
}

/** MIDI -> "F#3" style name. */
export function midiToName(midi: number, useFlats = false): string {
  return `${pcToName(midiToPitchClass(midi), useFlats)}${midiToOctave(midi)}`;
}

/** Label for a root, showing both spellings on accidentals ("C#/Db"). */
export function enharmonicLabel(pc: number): string {
  const sharp = pcToName(pc, false);
  const flat = pcToName(pc, true);
  return sharp === flat ? sharp : `${sharp}/${flat}`;
}

/** Letter steps above the root for each interval (b3 and 3 are both a "third", etc.). */
const LETTER_OFFSET = [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6];
const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];

/**
 * Spell the note `interval` semitones above a root, using proper interval letters:
 * the 7th of C7 is Bb (not A#), the b5 of Cdim is Gb, the #5 of Caug is G#.
 * `rootName` decides how the root itself is spelled ("C#" vs "Db").
 * Falls back to a plain enharmonic name if a double accidental would be needed.
 */
export function spellInterval(rootName: string, interval: number, label?: string): string {
  const rootPc = pitchClassOf(rootName);
  if (rootPc === -1) return "";
  const semis = ((interval % 12) + 12) % 12;
  const rootLetterIndex = LETTERS.indexOf(rootName[0].toUpperCase());
  const labelDegree = label ? parseInt(label.replace(/[^0-9]/g, ""), 10) : NaN;
  const letterOffset = Number.isFinite(labelDegree) ? labelDegree - 1 : LETTER_OFFSET[semis];
  const letter = LETTERS[(rootLetterIndex + letterOffset) % 7];
  const targetPc = (rootPc + semis) % 12;
  let accidental = targetPc - NATURAL_PC[letter];
  if (accidental > 6) accidental -= 12;
  if (accidental < -6) accidental += 12;
  if (Math.abs(accidental) > 1) return pcToName(targetPc, accidental < 0);
  return letter + (accidental === 1 ? "#" : accidental === -1 ? "b" : "");
}

/**
 * Calculates the resulting note when moving up a certain number of frets (semitones).
 */
export function getNoteAtFret(openStringNote: string, fret: number, useFlats = false): string {
  const pc = pitchClassOf(openStringNote);
  if (pc === -1) return getNoteName(openStringNote); // Fallback safety
  return pcToName(pc + fret, useFlats);
}

/* ------------------------------------------------------------------ */
/* Scales                                                              */
/* ------------------------------------------------------------------ */

export interface ScaleDefinition {
  name: string;
  /** Semitone offsets from the root, ascending, starting at 0. */
  intervals: number[];
  /** Degree labels when the defaults ("b5", "b6") are wrong for this scale, e.g. "#4" in lydian. */
  labels?: string[];
  category: "Essential" | "Modes" | "Other" | "Exotic";
  description: string;
  /**
   * Offset (in semitones) from this scale's root to the root of its parent
   * major key. Used to choose sharp or flat spelling (e.g. D minor -> F major -> flats).
   */
  relativeMajorOffset: number;
}

export const SCALES: Record<string, ScaleDefinition> = {
  major: {
    name: "Major (Ionian)",
    intervals: [0, 2, 4, 5, 7, 9, 11],
    category: "Essential",
    description: "The happy, bright foundation of western music. Formula: W W H W W W H.",
    relativeMajorOffset: 0,
  },
  minor: {
    name: "Natural Minor (Aeolian)",
    intervals: [0, 2, 3, 5, 7, 8, 10],
    category: "Essential",
    description: "The sad, moody counterpart of major. Same notes as the major scale starting a minor 3rd up.",
    relativeMajorOffset: 3,
  },
  majorPentatonic: {
    name: "Major Pentatonic",
    intervals: [0, 2, 4, 7, 9],
    category: "Essential",
    description: "Five notes, no half-steps: impossible to sound wrong. Country, folk and pop leads.",
    relativeMajorOffset: 0,
  },
  minorPentatonic: {
    name: "Minor Pentatonic",
    intervals: [0, 3, 5, 7, 10],
    category: "Essential",
    description: "The first scale most guitarists learn: the backbone of rock and blues soloing.",
    relativeMajorOffset: 3,
  },
  blues: {
    name: "Blues",
    intervals: [0, 3, 5, 6, 7, 10],
    category: "Essential",
    description: "Minor pentatonic plus the gritty 'blue note' (b5) for extra attitude.",
    relativeMajorOffset: 3,
  },
  harmonicMinor: {
    name: "Harmonic Minor",
    intervals: [0, 2, 3, 5, 7, 8, 11],
    category: "Other",
    description: "Natural minor with a raised 7th; the exotic, classical / neo-classical sound.",
    relativeMajorOffset: 3,
  },
  melodicMinor: {
    name: "Melodic Minor",
    intervals: [0, 2, 3, 5, 7, 9, 11],
    category: "Other",
    description: "Minor with a raised 6th and 7th; a smooth, jazzy minor sound.",
    relativeMajorOffset: 3,
  },
  dorian: {
    name: "Dorian",
    intervals: [0, 2, 3, 5, 7, 9, 10],
    category: "Modes",
    description: "Minor with a natural 6th. Funky and soulful (think 'So What', 'Oye Como Va').",
    relativeMajorOffset: 10,
  },
  phrygian: {
    name: "Phrygian",
    intervals: [0, 1, 3, 5, 7, 8, 10],
    category: "Modes",
    description: "Minor with a flat 2nd. Dark, Spanish / flamenco flavour.",
    relativeMajorOffset: 8,
  },
  lydian: {
    name: "Lydian",
    intervals: [0, 2, 4, 6, 7, 9, 11],
    labels: ["1", "2", "3", "#4", "5", "6", "7"],
    category: "Modes",
    description: "Major with a raised 4th. Dreamy and floating (film scores, Vai, Satriani).",
    relativeMajorOffset: 5,
  },
  mixolydian: {
    name: "Mixolydian",
    intervals: [0, 2, 4, 5, 7, 9, 10],
    category: "Modes",
    description: "Major with a flat 7th. The sound of dominant chords, blues-rock and jam bands.",
    relativeMajorOffset: 7,
  },
  locrian: {
    name: "Locrian",
    intervals: [0, 1, 3, 5, 6, 8, 10],
    category: "Modes",
    description: "Minor with a flat 2nd and flat 5th. Unstable and tense; rarely used as a key.",
    relativeMajorOffset: 1,
  },
  /* ---------------- Exotic ---------------- */
  phrygianDominant: {
    name: "Phrygian Dominant",
    intervals: [0, 1, 4, 5, 7, 8, 10],
    labels: ["1", "b2", "3", "4", "5", "b6", "b7"],
    category: "Exotic",
    description: "Phrygian with a major 3rd (the 5th mode of harmonic minor). Flamenco, klezmer, metal; the sound of 'Hava Nagila' and 'Misirlou'.",
    relativeMajorOffset: 8,
  },
  lydianDominant: {
    name: "Lydian Dominant",
    intervals: [0, 2, 4, 6, 7, 9, 10],
    labels: ["1", "2", "3", "#4", "5", "6", "b7"],
    category: "Exotic",
    description: "Lydian with a flat 7th (the 4th mode of melodic minor). Bright and cheeky, made for dominant 7th chords: 'The Simpsons' theme.",
    relativeMajorOffset: 10,
  },
  altered: {
    name: "Altered",
    intervals: [0, 1, 3, 4, 6, 8, 10],
    labels: ["1", "b2", "#2", "3", "b5", "b6", "b7"],
    category: "Exotic",
    description: "Every tension at once: b9, #9, b5, #5 (the 7th mode of melodic minor). The jazz player's scale for a V7 that really wants to resolve.",
    // Spelled like the major key a half step up (C altered reads Db Eb E Gb Ab Bb).
    relativeMajorOffset: 1,
  },
  doubleHarmonic: {
    name: "Double Harmonic",
    intervals: [0, 1, 4, 5, 7, 8, 11],
    labels: ["1", "b2", "3", "4", "5", "b6", "7"],
    category: "Exotic",
    description: "Two augmented 2nds (b2–3 and b6–7): the Byzantine / Arabic 'Hijaz Kar' major scale. Dick Dale surf, film-score exotica.",
    relativeMajorOffset: 0,
  },
  hungarianMinor: {
    name: "Hungarian Minor",
    intervals: [0, 2, 3, 6, 7, 8, 11],
    labels: ["1", "2", "b3", "#4", "5", "b6", "7"],
    category: "Exotic",
    description: "Harmonic minor with a raised 4th: the 'Gypsy minor' scale. Dramatic, Eastern European, very Liszt.",
    relativeMajorOffset: 3,
  },
  neapolitanMinor: {
    name: "Neapolitan Minor",
    intervals: [0, 1, 3, 5, 7, 8, 11],
    labels: ["1", "b2", "b3", "4", "5", "b6", "7"],
    category: "Exotic",
    description: "Harmonic minor with a flat 2nd. Dark and theatrical; the b2 pulls hard back to the root.",
    relativeMajorOffset: 3,
  },
  wholeTone: {
    name: "Whole Tone",
    intervals: [0, 2, 4, 6, 8, 10],
    labels: ["1", "2", "3", "#4", "#5", "b7"],
    category: "Exotic",
    description: "Six notes, all whole steps, no home: dreamy, floating, a little unsettling. Debussy, and every 'dream sequence' in film.",
    relativeMajorOffset: 0,
  },
  diminished: {
    name: "Diminished (half–whole)",
    intervals: [0, 1, 3, 4, 6, 7, 9, 10],
    labels: ["1", "b2", "#2", "3", "#4", "5", "6", "b7"],
    category: "Exotic",
    description: "Eight notes alternating half and whole steps. Symmetrical, so it repeats every three frets; jazz players use it over dominant 7th chords.",
    relativeMajorOffset: 0,
  },
  hirajoshi: {
    name: "Hirajoshi",
    intervals: [0, 2, 3, 7, 8],
    labels: ["1", "2", "b3", "5", "b6"],
    category: "Exotic",
    description: "A Japanese pentatonic (koto tuning): minor with a b6 instead of the 4th and 7th. Sparse, serene, unmistakably East Asian.",
    relativeMajorOffset: 3,
  },
  chromatic: {
    name: "Chromatic",
    intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    category: "Other",
    description: "Every note. Great as a warm-up and for learning the fretboard.",
    relativeMajorOffset: 0,
  },
};

/** Scales that repeat their pattern inside the octave (whole tone, diminished): no letter-per-degree spelling. */
export function isSymmetricalScale(scaleKey: string): boolean {
  const scale = SCALES[scaleKey];
  if (!scale) return false;
  const n = scale.intervals.length;
  if (n === 7 || n === 5) return false;
  for (const shift of [2, 3, 4, 6]) {
    const shifted = new Set(scale.intervals.map((i) => (i + shift) % 12));
    if (scale.intervals.every((i) => shifted.has(i))) return true;
  }
  return false;
}

/** Major keys that are conventionally written with flats. */
const FLAT_MAJOR_KEYS = new Set([5, 10, 3, 8, 1]); // F, Bb, Eb, Ab, Db

/** Roots that are usually written as flats when the key itself could go either way (Db Eb Ab Bb). */
const FLAT_LEANING_ROOTS = new Set([1, 3, 8, 10]);

/** Should a key with this root / scale use flat spellings? */
export function preferFlats(rootPc: number, scaleKey: string): boolean {
  const scale = SCALES[scaleKey];
  const offset = scale ? scale.relativeMajorOffset : 0;
  const relativeMajor = (((rootPc + offset) % 12) + 12) % 12;
  // F# / Gb major is the one key that is common both ways: follow the root's usual name
  // (Bb phrygian, not A# phrygian; F# lydian dominant, not Gb).
  if (relativeMajor === 6) return FLAT_LEANING_ROOTS.has(((rootPc % 12) + 12) % 12);
  return FLAT_MAJOR_KEYS.has(relativeMajor);
}

export function getScalePitchClasses(rootPc: number, scaleKey: string): number[] {
  const scale = SCALES[scaleKey];
  if (!scale) return [];
  return scale.intervals.map((i) => (rootPc + i) % 12);
}

/**
 * Spell one scale tone by its interval letter from the root (so F major gets Bb,
 * A blues gets Eb for the blue note, C lydian gets F#). The root itself follows
 * the key's sharp/flat convention.
 */
export function spellScaleTone(rootPc: number, scaleKey: string, interval: number, useFlats?: boolean): string {
  const flats = useFlats ?? preferFlats(rootPc, scaleKey);
  // Symmetrical scales (chromatic, whole tone, diminished) have no one-letter-per-degree
  // logic, so they are spelled plainly.
  if (scaleKey === "chromatic" || isSymmetricalScale(scaleKey)) return pcToName(rootPc + interval, flats);
  return spellInterval(pcToName(rootPc, flats), interval, scaleDegreeLabel(scaleKey, interval));
}

/** Degree label ("b3", "#4"...) of an interval within a scale; generic label if not in the scale. */
export function scaleDegreeLabel(scaleKey: string, interval: number): string {
  const scale = SCALES[scaleKey];
  const idx = scale ? scale.intervals.indexOf(((interval % 12) + 12) % 12) : -1;
  if (scale && scale.labels && idx >= 0) return scale.labels[idx];
  return INTERVAL_LABELS[((interval % 12) + 12) % 12];
}

export function getScaleNotes(rootPc: number, scaleKey: string, useFlats?: boolean): string[] {
  const scale = SCALES[scaleKey];
  if (!scale) return [];
  return scale.intervals.map((i) => spellScaleTone(rootPc, scaleKey, i, useFlats));
}

/** Degree labels like ["1","2","b3","4","5","b6","b7"] for a scale. */
export function getScaleDegrees(scaleKey: string): string[] {
  const scale = SCALES[scaleKey];
  if (!scale) return [];
  return scale.intervals.map((i) => scaleDegreeLabel(scaleKey, i));
}

/** Step pattern like ["W","W","H",...] between consecutive scale notes. */
export function getScaleSteps(scaleKey: string): string[] {
  const scale = SCALES[scaleKey];
  if (!scale) return [];
  const ints = [...scale.intervals, 12];
  const steps: string[] = [];
  for (let i = 1; i < ints.length; i++) {
    const d = ints[i] - ints[i - 1];
    steps.push(d === 1 ? "H" : d === 2 ? "W" : d === 3 ? "W+H" : `${d}`);
  }
  return steps;
}

/* ------------------------------------------------------------------ */
/* Chords                                                              */
/* ------------------------------------------------------------------ */

export interface ChordDefinition {
  name: string;
  /** Suffix appended to the root, e.g. "m7" -> "Am7". */
  suffix: string;
  /** Semitone offsets from the root. */
  intervals: number[];
  /** Degree labels when the defaults are wrong for this chord, e.g. "#5" in augmented. */
  labels?: string[];
  /**
   * Intervals that may be left out of a voicing and still have it "count" as the chord
   * (e.g. the 5th in a 7th chord).
   */
  optional: number[];
  description: string;
}

export const CHORDS: Record<string, ChordDefinition> = {
  major: {
    name: "Major",
    suffix: "",
    intervals: [0, 4, 7],
    optional: [],
    description: "Root, major 3rd, perfect 5th. Bright and resolved.",
  },
  minor: {
    name: "Minor",
    suffix: "m",
    intervals: [0, 3, 7],
    optional: [],
    description: "Root, minor 3rd, perfect 5th. Darker, sadder.",
  },
  power: {
    name: "Power chord",
    suffix: "5",
    intervals: [0, 7],
    optional: [],
    description: "Root and 5th only: neither major nor minor. The rock staple.",
  },
  sus2: {
    name: "Suspended 2nd",
    suffix: "sus2",
    intervals: [0, 2, 7],
    optional: [],
    description: "The 3rd is replaced by the 2nd: open and airy.",
  },
  sus4: {
    name: "Suspended 4th",
    suffix: "sus4",
    intervals: [0, 5, 7],
    optional: [],
    description: "The 3rd is replaced by the 4th: tension that wants to resolve.",
  },
  dom7: {
    name: "Dominant 7th",
    suffix: "7",
    intervals: [0, 4, 7, 10],
    optional: [7],
    description: "Major triad plus a minor 7th. Bluesy, wants to resolve to the I chord.",
  },
  maj7: {
    name: "Major 7th",
    suffix: "maj7",
    intervals: [0, 4, 7, 11],
    optional: [7],
    description: "Major triad plus a major 7th. Smooth, jazzy, dreamy.",
  },
  min7: {
    name: "Minor 7th",
    suffix: "m7",
    intervals: [0, 3, 7, 10],
    optional: [7],
    description: "Minor triad plus a minor 7th. Mellow and soulful.",
  },
  dim: {
    name: "Diminished",
    suffix: "dim",
    intervals: [0, 3, 6],
    optional: [],
    description: "Root, minor 3rd, flat 5th. Tense and unstable.",
  },
  aug: {
    name: "Augmented",
    suffix: "aug",
    intervals: [0, 4, 8],
    labels: ["1", "3", "#5"],
    optional: [],
    description: "Root, major 3rd, sharp 5th. Mysterious, unresolved.",
  },
  min7b5: {
    name: "Half-diminished",
    suffix: "m7b5",
    intervals: [0, 3, 6, 10],
    optional: [],
    description: "Diminished triad plus a minor 7th (m7b5). The ii chord in a minor key; dark but smooth.",
  },
  dim7: {
    name: "Diminished 7th",
    suffix: "dim7",
    intervals: [0, 3, 6, 9],
    labels: ["1", "b3", "b5", "bb7"],
    optional: [],
    description: "Stacked minor 3rds all the way up. Maximum tension; the vii chord of harmonic minor.",
  },
  minMaj7: {
    name: "Minor-major 7th",
    suffix: "m(maj7)",
    intervals: [0, 3, 7, 11],
    optional: [7],
    description: "Minor triad with a major 7th. The haunting i chord of harmonic and melodic minor (think spy themes).",
  },
  augMaj7: {
    name: "Augmented-major 7th",
    suffix: "maj7#5",
    intervals: [0, 4, 8, 11],
    labels: ["1", "3", "#5", "7"],
    optional: [],
    description: "Augmented triad plus a major 7th. Dreamy and unstable; the III chord of harmonic and melodic minor.",
  },
};

/**
 * Chord-chart spelling conventions: Db, Eb, Ab, Bb but F# for major-type chords;
 * minor-type chords (including diminished ones, which usually sit on a sharp leading
 * tone: G#dim, C#m7b5) follow their relative major key (C#m, F#m, G#m, Bbm, Ebm).
 */
const FLAT_MAJOR_CHORD_ROOTS = new Set([1, 3, 8, 10]); // Db, Eb, Ab, Bb
const FLAT_MINOR_CHORD_ROOTS = new Set([3, 10]);       // Ebm, Bbm

export function preferFlatsForChord(rootPc: number, chordKey: string): boolean {
  const chord = CHORDS[chordKey];
  const minorFamily = chord ? chord.intervals.includes(3) : false;
  const pc = ((rootPc % 12) + 12) % 12;
  return minorFamily ? FLAT_MINOR_CHORD_ROOTS.has(pc) : FLAT_MAJOR_CHORD_ROOTS.has(pc);
}

export function getChordPitchClasses(rootPc: number, chordKey: string): number[] {
  const chord = CHORDS[chordKey];
  if (!chord) return [];
  return chord.intervals.map((i) => (rootPc + i) % 12);
}

/** Spell a chord tone by its interval from the root (C7 -> Bb, Cdim -> Gb, Caug -> G#). */
export function spellChordTone(rootPc: number, chordKey: string, interval: number, useFlats?: boolean): string {
  const flats = useFlats ?? preferFlatsForChord(rootPc, chordKey);
  return spellInterval(pcToName(rootPc, flats), interval, chordDegreeLabel(chordKey, interval));
}

/** Degree label ("3", "b7", "#5"...) of an interval within a chord; generic label if not in the chord. */
export function chordDegreeLabel(chordKey: string, interval: number): string {
  const chord = CHORDS[chordKey];
  const idx = chord ? chord.intervals.indexOf(((interval % 12) + 12) % 12) : -1;
  if (chord && chord.labels && idx >= 0) return chord.labels[idx];
  return INTERVAL_LABELS[((interval % 12) + 12) % 12];
}

export function getChordNotes(rootPc: number, chordKey: string, useFlats?: boolean): string[] {
  const chord = CHORDS[chordKey];
  if (!chord) return [];
  return chord.intervals.map((i) => spellChordTone(rootPc, chordKey, i, useFlats));
}

export function getChordSymbol(rootPc: number, chordKey: string, useFlats?: boolean): string {
  const chord = CHORDS[chordKey];
  const flats = useFlats ?? preferFlatsForChord(rootPc, chordKey);
  return `${pcToName(rootPc, flats)}${chord ? chord.suffix : ""}`;
}

/**
 * Returns the intervals/notes belonging to a standard Major Triad (Root, Major 3rd, Perfect 5th)
 * Major 3rd = 4 semitones up | Perfect 5th = 7 semitones up
 */
export function getMajorChordNotes(rootNote: string): string[] {
  const rootPc = pitchClassOf(rootNote);
  if (rootPc === -1) return [];
  return getChordPitchClasses(rootPc, "major").map((pc) => pcToName(pc));
}

/** Semitone distance from root (0-11) -> interval label used for colouring / legends. */
export function intervalFromRoot(rootPc: number, pc: number): number {
  return (((pc - rootPc) % 12) + 12) % 12;
}

/* ------------------------------------------------------------------ */
/* Keys: the chords that live inside a scale                           */
/* ------------------------------------------------------------------ */

/** A chord built on one degree of a scale (by stacking 3rds). */
export interface DiatonicChord {
  /** 0-based scale degree (0 = I). */
  degree: number;
  rootPc: number;
  /** Root spelled as it is in the key (Bb in F major, not A#). */
  rootName: string;
  /** Key into CHORDS ("major", "min7", "min7b5"...), or UNUSUAL_CHORD for a stack with no standard name. */
  chordKey: string;
  /** Human name ("Minor 7th", "Unusual chord") and a one-line explanation. */
  name: string;
  description: string;
  /** Chord symbol, e.g. "Dm7" (or "G(3 b5)" for an unusual stack). */
  symbol: string;
  /** Roman numeral with quality, e.g. "ii", "V7", "vii°", "IVmaj7". */
  numeral: string;
  /** Semitones from the chord root. */
  intervals: number[];
  pcs: number[];
  /** Chord tones spelled in the key, lowest first. */
  noteNames: string[];
}

/** Scales that can be harmonised in thirds (seven notes, one per letter). */
export function isHeptatonic(scaleKey: string): boolean {
  const scale = SCALES[scaleKey];
  return !!scale && scale.intervals.length === 7;
}

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];

/** chordKey of a diatonic chord whose stack of 3rds is not a standard quality. */
export const UNUSUAL_CHORD = "unusual";

/** Roman numeral for a chord quality: case from the 3rd, marks for dim / aug / 7ths. */
export function romanNumeral(degree: number, chordKey: string): string {
  const chord = CHORDS[chordKey];
  const base = ROMAN[((degree % 7) + 7) % 7];
  if (!chord) return base;
  const minorThird = chord.intervals.includes(3);
  const numeral = minorThird ? base.toLowerCase() : base;
  switch (chordKey) {
    case "major": case "minor": return numeral;
    case "dim": return `${numeral}°`;
    case "aug": return `${numeral}+`;
    case "dom7": case "min7": return `${numeral}7`;
    case "maj7": return `${numeral}maj7`;
    case "min7b5": return `${numeral}ø7`;
    case "dim7": return `${numeral}°7`;
    case "minMaj7": return `${numeral}(maj7)`;
    case "augMaj7": return `${numeral}+maj7`;
    default: return `${numeral}${chord.suffix}`;
  }
}

/**
 * Harmonises a seven-note scale: for every degree, stack thirds (every other scale
 * note) to get a triad or a 7th chord, and identify its quality. Works for major,
 * minor, the modes, and harmonic / melodic minor (whose odd chords - m(maj7), maj7#5,
 * dim7 - are in CHORDS too). Returns [] for pentatonic / blues / chromatic.
 */
export function getDiatonicChords(rootPc: number, scaleKey: string, sevenths = false): DiatonicChord[] {
  const scale = SCALES[scaleKey];
  if (!scale || scale.intervals.length !== 7) return [];
  const size = sevenths ? 4 : 3;
  const chords: DiatonicChord[] = [];
  for (let degree = 0; degree < 7; degree++) {
    const stackIntervals = Array.from({ length: size }, (_, k) => scale.intervals[(degree + 2 * k) % 7]);
    const chordRootInterval = stackIntervals[0];
    const intervals = stackIntervals.map((i) => (((i - chordRootInterval) % 12) + 12) % 12);
    const chordKey = Object.keys(CHORDS).find((k) => {
      const c = CHORDS[k].intervals;
      return c.length === intervals.length && c.every((v, i) => v === intervals[i]);
    });
    const chordRootPc = (rootPc + chordRootInterval) % 12;
    const rootName = spellScaleTone(rootPc, scaleKey, chordRootInterval);
    const noteNames = stackIntervals.map((i) => spellScaleTone(rootPc, scaleKey, i));
    if (chordKey) {
      chords.push({
        degree,
        rootPc: chordRootPc,
        rootName,
        chordKey,
        name: CHORDS[chordKey].name,
        description: CHORDS[chordKey].description,
        symbol: `${rootName}${CHORDS[chordKey].suffix}`,
        numeral: romanNumeral(degree, chordKey),
        intervals,
        pcs: intervals.map((i) => (chordRootPc + i) % 12),
        noteNames,
      });
    } else {
      // Exotic scales stack into chords with no everyday name (e.g. a "major b5" in
      // Hungarian minor). Name them by their intervals so nothing goes missing.
      const labels = intervals.slice(1).map((i) => INTERVAL_LABELS[i]);
      const base = ROMAN[degree];
      const numeralBase = intervals.includes(3) && !intervals.includes(4) ? base.toLowerCase() : base;
      chords.push({
        degree,
        rootPc: chordRootPc,
        rootName,
        chordKey: UNUSUAL_CHORD,
        name: "Unusual chord",
        description: `Stacking 3rds on this degree gives root, ${labels.join(", ")}: not a standard chord, and part of what makes the scale sound exotic.`,
        symbol: `${rootName}(${labels.join(" ")})`,
        numeral: `${numeralBase}(${labels.join(" ")})`,
        intervals,
        pcs: intervals.map((i) => (chordRootPc + i) % 12),
        noteNames,
      });
    }
  }
  return chords;
}
