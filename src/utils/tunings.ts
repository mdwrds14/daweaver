import { noteToMidi, getNoteName } from "./theoryEngine";

export type TuningCategory = "Standard" | "Drop" | "Open" | "Other";

export interface Tuning {
  name: string;
  description: string;
  category: TuningCategory;
  /**
   * Open-string pitches from lowest pitch (6th string) to highest pitch (1st string).
   * Include the octave number ("E2") so the engine knows the exact pitch of each string.
   * Six entries make a regular guitar; seven or eight make an extended-range guitar.
   */
  notes: string[];
}

/** String counts the app supports (6 = regular guitar, 7 and 8 = extended range). */
export const STRING_COUNTS = [6, 7, 8] as const;
export type StringCount = (typeof STRING_COUNTS)[number];
export const MIN_STRINGS: StringCount = 6;
export const MAX_STRINGS: StringCount = 8;

/**
 * To add a tuning, add one entry here. Everything else (tab, scales, chord voicings,
 * fretboard map, audio) is generated from the pitches automatically. The number of
 * notes decides how many strings the guitar has (6, 7 or 8).
 */
export const TUNINGS: Record<string, Tuning> = {
  standard: {
    name: "Standard",
    category: "Standard",
    description:
      "The traditional tuning (E A D G B E). Notice how shapes shift when you get to the B string!",
    notes: ["E2", "A2", "D3", "G3", "B3", "E4"],
  },
  halfStepDown: {
    name: "Eb Standard",
    category: "Standard",
    description:
      "Everything a half step down (Eb Ab Db Gb Bb Eb). Same shapes as standard, slightly looser strings and a darker tone. Hendrix, SRV, Guns N' Roses.",
    notes: ["Eb2", "Ab2", "Db3", "Gb3", "Bb3", "Eb4"],
  },
  dStandard: {
    name: "D Standard",
    category: "Standard",
    description:
      "A whole step down (D G C F A D). Shapes are identical to standard, but everything sounds a tone lower and heavier.",
    notes: ["D2", "G2", "C3", "F3", "A3", "D4"],
  },
  dropD: {
    name: "Drop D",
    category: "Drop",
    description:
      "Lowers the 6th string to D. Power chords can now be played with just one flat finger.",
    notes: ["D2", "A2", "D3", "G3", "B3", "E4"],
  },
  dropC: {
    name: "Drop C",
    category: "Drop",
    description:
      "D Standard with the low string dropped to C (C G C F A D). Big, heavy and low: the modern metal workhorse.",
    notes: ["C2", "G2", "C3", "F3", "A3", "D4"],
  },
  doubleDropD: {
    name: "Double Drop D",
    category: "Drop",
    description:
      "Both E strings dropped to D (D A D G B D). Keeps familiar shapes on the middle strings with a drone on the outside. Neil Young's favourite.",
    notes: ["D2", "A2", "D3", "G3", "B3", "D4"],
  },
  dadgad: {
    name: "DADGAD",
    category: "Open",
    description:
      "A popular folk and Celtic tuning. Strumming it open creates a rich, suspended D chord.",
    notes: ["D2", "A2", "D3", "G3", "A3", "D4"],
  },
  openD: {
    name: "Open D",
    category: "Open",
    description:
      "D A D F# A D: the open strings ring a D major chord. Barre any fret for a major chord; perfect for slide.",
    notes: ["D2", "A2", "D3", "F#3", "A3", "D4"],
  },
  openG: {
    name: "Open G",
    category: "Open",
    description:
      "D G D G B D: open strings give a G major chord. Keith Richards' signature (he even removes the low string).",
    notes: ["D2", "G2", "D3", "G3", "B3", "D4"],
  },
  openE: {
    name: "Open E",
    category: "Open",
    description:
      "E B E G# B E: Open D shapes, a whole step higher and with more tension. Classic for blues slide (Duane Allman).",
    notes: ["E2", "B2", "E3", "G#3", "B3", "E4"],
  },
  openA: {
    name: "Open A",
    category: "Open",
    description:
      "E A E A C# E: Open G shapes raised a whole step. Bright and ringing.",
    notes: ["E2", "A2", "E3", "A3", "C#4", "E4"],
  },
  openC: {
    name: "Open C",
    category: "Open",
    description:
      "C G C G C E: deep, piano-like C major. Lots of octaves, great for fingerstyle and drones.",
    notes: ["C2", "G2", "C3", "G3", "C4", "E4"],
  },
  allFourths: {
    name: "All Fourths",
    category: "Other",
    description:
      "E A D G C F: every string is a perfect 4th apart, so scale and chord shapes are identical on every string pair.",
    notes: ["E2", "A2", "D3", "G3", "C4", "F4"],
  },

  /* ---------------- 7-string ---------------- */
  bStandard7: {
    name: "B Standard",
    category: "Standard",
    description:
      "B E A D G B E: standard tuning plus a low B a 4th below the E. All your 6-string shapes still work; the 7th string adds a deep bass register (Korn, Dream Theater).",
    notes: ["B1", "E2", "A2", "D3", "G3", "B3", "E4"],
  },
  aStandard7: {
    name: "A Standard",
    category: "Standard",
    description:
      "A D G C F A D: B Standard a whole step down for a darker, heavier voice with the same shapes.",
    notes: ["A1", "D2", "G2", "C3", "F3", "A3", "D4"],
  },
  dropA7: {
    name: "Drop A",
    category: "Drop",
    description:
      "A E A D G B E: B Standard with the low string dropped to A. One-finger power chords on the lowest three strings, with the top six still in standard.",
    notes: ["A1", "E2", "A2", "D3", "G3", "B3", "E4"],
  },
  dropG7: {
    name: "Drop G",
    category: "Drop",
    description:
      "G D G C F A D: Drop A a whole step lower. Very low and very heavy: the modern deathcore / djent register.",
    notes: ["G1", "D2", "G2", "C3", "F3", "A3", "D4"],
  },
  russianOpenG7: {
    name: "Russian Open G",
    category: "Open",
    description:
      "D G B D G B D: the classic Russian seven-string tuning, built entirely from a G major chord. Barre any fret for a major chord.",
    notes: ["D2", "G2", "B2", "D3", "G3", "B3", "D4"],
  },

  /* ---------------- 8-string ---------------- */
  fSharpStandard8: {
    name: "F# Standard",
    category: "Standard",
    description:
      "F# B E A D G B E: two extra strings, each a 4th below the last. The low F# sits in bass-guitar territory (Meshuggah, Animals as Leaders).",
    notes: ["F#1", "B1", "E2", "A2", "D3", "G3", "B3", "E4"],
  },
  eStandard8: {
    name: "E Standard",
    category: "Standard",
    description:
      "E A D G C F A D: F# Standard a whole step down. The lowest string matches a bass guitar's low E; the tuning is all perfect 4ths.",
    notes: ["E1", "A1", "D2", "G2", "C3", "F3", "A3", "D4"],
  },
  dropE8: {
    name: "Drop E",
    category: "Drop",
    description:
      "E B E A D G B E: F# Standard with the lowest string dropped to E, for one-finger power chords a full octave below a standard guitar.",
    notes: ["E1", "B1", "E2", "A2", "D3", "G3", "B3", "E4"],
  },
  dropD8: {
    name: "Drop D",
    category: "Drop",
    description:
      "D A D G C F A D: E Standard (8) with the low string dropped to D. Bottom-of-the-earth riffs in the same shapes as a 6-string Drop D.",
    notes: ["D1", "A1", "D2", "G2", "C3", "F3", "A3", "D4"],
  },
};

/** The "home" tuning for each string count: used as the default and as the reference for "semitones from standard". */
export const STANDARD_TUNING_KEY: Record<StringCount, string> = {
  6: "standard",
  7: "bStandard7",
  8: "fSharpStandard8",
};

export function stringCountOf(tuning: Tuning): number {
  return tuning.notes.length;
}

/** Tuning keys that have the given number of strings, in declaration order. */
export function tuningKeysForStrings(count: number): string[] {
  return Object.keys(TUNINGS).filter((k) => TUNINGS[k].notes.length === count);
}

/** The reference ("standard") tuning with the same number of strings as `tuning`. */
export function standardTuningFor(tuning: Tuning): Tuning {
  const key = STANDARD_TUNING_KEY[stringCountOf(tuning) as StringCount];
  return TUNINGS[key] ?? TUNINGS.standard;
}

export const TUNING_CATEGORIES: TuningCategory[] = ["Standard", "Drop", "Open", "Other"];

/** Open-string MIDI numbers, lowest string first. */
export function tuningMidi(tuning: Tuning): number[] {
  return tuning.notes.map((n) => noteToMidi(n));
}

/** "E A D G B E" style label (lowest string first). */
export function tuningLabel(tuning: Tuning): string {
  return tuning.notes.map(getNoteName).join(" ");
}
