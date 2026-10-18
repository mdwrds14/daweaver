import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pitchClassOf, noteToMidi, getNoteAtFret, getScaleNotes, getChordNotes,
  getChordSymbol, getMajorChordNotes, preferFlats, midiToName,
} from "../theoryEngine";
import { TUNINGS, tuningMidi } from "../tunings";
import { buildScalePosition, scalePositionToTab, rootBoxPosition } from "../scaleTab";
import { findChordVoicings, assignFingers, voicingToString } from "../chordVoicings";
import { tabToAscii } from "../tab";

test("note parsing handles sharps, flats and octaves", () => {
  assert.equal(pitchClassOf("C"), 0);
  assert.equal(pitchClassOf("F#3"), 6);
  assert.equal(pitchClassOf("Gb"), 6);
  assert.equal(pitchClassOf("Bb2"), 10);
  assert.equal(noteToMidi("E2"), 40);
  assert.equal(noteToMidi("C4"), 60);
  assert.equal(midiToName(66), "F#4");
  assert.equal(getNoteAtFret("E2", 5), "A");
  assert.equal(getNoteAtFret("B", 1), "C");
});

test("scales are spelled with the right accidentals", () => {
  assert.deepEqual(getScaleNotes(0, "major"), ["C", "D", "E", "F", "G", "A", "B"]);
  assert.deepEqual(getScaleNotes(5, "major"), ["F", "G", "A", "Bb", "C", "D", "E"]);
  assert.deepEqual(getScaleNotes(2, "minor"), ["D", "E", "F", "G", "A", "Bb", "C"]);
  assert.deepEqual(getScaleNotes(9, "minorPentatonic"), ["A", "C", "D", "E", "G"]);
  assert.deepEqual(getScaleNotes(9, "blues"), ["A", "C", "D", "Eb", "E", "G"]); // blue note always spelled as a b5
  assert.deepEqual(getScaleNotes(7, "mixolydian"), ["G", "A", "B", "C", "D", "E", "F"]);
  assert.deepEqual(getScaleNotes(0, "lydian"), ["C", "D", "E", "F#", "G", "A", "B"]);
  assert.deepEqual(getScaleNotes(9, "harmonicMinor"), ["A", "B", "C", "D", "E", "F", "G#"]);
  assert.deepEqual(getScaleNotes(11, "locrian"), ["B", "C", "D", "E", "F", "G", "A"]);
  assert.equal(preferFlats(2, "dorian"), false); // D dorian = C major
  assert.equal(preferFlats(7, "dorian"), true);  // G dorian = F major
});

test("chords: notes, symbols and legacy helper", () => {
  assert.deepEqual(getChordNotes(9, "minor"), ["A", "C", "E"]);
  assert.deepEqual(getChordNotes(10, "major"), ["Bb", "D", "F"]);
  assert.deepEqual(getChordNotes(7, "dom7"), ["G", "B", "D", "F"]);
  assert.deepEqual(getChordNotes(0, "dom7"), ["C", "E", "G", "Bb"]); // 7th spelled by letter, not A#
  assert.deepEqual(getChordNotes(0, "dim"), ["C", "Eb", "Gb"]);
  assert.deepEqual(getChordNotes(0, "aug"), ["C", "E", "G#"]);
  assert.deepEqual(getChordNotes(4, "dom7"), ["E", "G#", "B", "D"]);
  assert.deepEqual(getChordNotes(11, "dim"), ["B", "D", "F"]);
  assert.deepEqual(getChordNotes(6, "minor"), ["F#", "A", "C#"]);
  assert.deepEqual(getChordNotes(3, "min7"), ["Eb", "Gb", "Bb", "Db"]);
  assert.equal(getChordSymbol(3, "min7"), "Ebm7");
  assert.equal(getChordSymbol(1, "minor"), "C#m");
  assert.equal(getChordSymbol(6, "major"), "F#");
  assert.equal(getChordSymbol(1, "major"), "Db");
  assert.equal(getChordSymbol(10, "dom7"), "Bb7");
  assert.deepEqual(getMajorChordNotes("D"), ["D", "F#", "A"]);
});

test("every tuning has 6-8 strings in ascending pitch order with octaves", () => {
  for (const [key, tuning] of Object.entries(TUNINGS)) {
    const midi = tuningMidi(tuning);
    assert.ok(midi.length >= 6 && midi.length <= 8, `${key}: ${midi.length} strings`);
    for (let i = 1; i < midi.length; i++) {
      assert.ok(midi[i] > midi[i - 1], `${key}: string ${i} should be higher than string ${i - 1}`);
    }
    assert.ok(tuning.notes.every((n) => /\d/.test(n)), `${key}: notes need octave numbers`);
  }
});

test("C major open position in standard tuning is the textbook run", () => {
  const pos = buildScalePosition(TUNINGS.standard, 0, "major", 0);
  const tab = scalePositionToTab(TUNINGS.standard, pos, { range: "octave" });
  const notes = tab.measures.flatMap((m) => m.columns.map((c) => c.notes[0]));
  const shape = notes.map((n) => `${n.string}:${n.fret}`);
  assert.deepEqual(shape, ["1:3", "2:0", "2:2", "2:3", "3:0", "3:2", "4:0", "4:1"]);
  assert.equal(notes[0].role, "root");
  assert.equal(notes[notes.length - 1].role, "root");
  assert.deepEqual(notes.map((n) => n.noteName), ["C", "D", "E", "F", "G", "A", "B", "C"]);
});

test("A minor pentatonic box sits at the 5th fret with 1-3 / 1-4 fingering", () => {
  const position = rootBoxPosition(TUNINGS.standard, 9);
  assert.equal(position, 4);
  const pos = buildScalePosition(TUNINGS.standard, 9, "minorPentatonic", position);
  const tab = scalePositionToTab(TUNINGS.standard, pos, { range: "full" });
  const notes = tab.measures.flatMap((m) => m.columns.map((c) => c.notes[0]));
  assert.deepEqual(
    notes.map((n) => n.fret),
    [5, 8, 5, 7, 5, 7, 5, 7, 5, 8, 5, 8],
  );
  assert.deepEqual(notes.map((n) => n.finger), [1, 4, 1, 3, 1, 3, 1, 3, 1, 4, 1, 4]);
});

test("scale runs always ascend in pitch, in every tuning", () => {
  for (const tuning of Object.values(TUNINGS)) {
    for (const scale of ["major", "minor", "minorPentatonic", "blues", "dorian"]) {
      for (let root = 0; root < 12; root++) {
        for (const position of [0, 3, rootBoxPosition(tuning, root)]) {
          const pos = buildScalePosition(tuning, root, scale, position);
          for (let i = 1; i < pos.run.length; i++) {
            assert.ok(pos.run[i].midi > pos.run[i - 1].midi, `${tuning.name} ${scale} root ${root}`);
            assert.ok(pos.run[i].string >= pos.run[i - 1].string, "strings never go backwards");
          }
          // Every pitch available in the window is used exactly once.
          const unique = new Set(pos.available.map((n) => n.midi));
          assert.equal(pos.run.length, unique.size, `${tuning.name} ${scale} root ${root} pos ${position}`);
        }
      }
    }
  }
});

test("DADGAD D major run uses correct pitches despite the G-A whole-step string pair", () => {
  const pos = buildScalePosition(TUNINGS.dadgad, 2, "major", 0);
  const names = pos.run.map((n) => n.noteName);
  // The low G (D string, fret 5) is outside the open-position window, so the first
  // octave skips it; the second octave is complete.
  assert.deepEqual(names, ["D", "E", "F#", "A", "B", "C#", "D", "E", "F#", "G", "A", "B", "C#", "D", "E", "F#"]);
  // A3 is available on both the G string (fret 2) and the open A string: use the open string.
  const a3 = pos.run.find((n) => n.midi === 57)!;
  assert.deepEqual([a3.string, a3.fret], [4, 0]);
});

test("finger assignment matches textbook open-chord fingerings", () => {
  const x = null;
  assert.deepEqual(assignFingers([0, 2, 2, 1, 0, 0])!.fingers, [0, 2, 3, 1, 0, 0]); // E
  assert.deepEqual(assignFingers([x, 3, 2, 0, 1, 0])!.fingers, [x, 3, 2, 0, 1, 0]); // C
  assert.deepEqual(assignFingers([3, 2, 0, 0, 0, 3])!.fingers, [2, 1, 0, 0, 0, 3]); // G
  assert.deepEqual(assignFingers([x, x, 0, 2, 3, 2])!.fingers, [x, x, 0, 1, 3, 2]); // D
  assert.deepEqual(assignFingers([x, 0, 2, 2, 2, 0])!.fingers, [x, 0, 1, 2, 3, 0]); // A
  assert.deepEqual(assignFingers([x, 0, 2, 2, 1, 0])!.fingers, [x, 0, 2, 3, 1, 0]); // Am
  assert.deepEqual(assignFingers([3, 5, 5, x, x, x])!.fingers, [1, 3, 4, x, x, x]); // G5
  const f = assignFingers([1, 3, 3, 2, 1, 1])!; // F barre
  assert.deepEqual(f.fingers, [1, 3, 4, 2, 1, 1]);
  assert.deepEqual(f.barre, { fret: 1, fromString: 0, toString: 5 });
  const bm = assignFingers([x, 2, 4, 4, 3, 2])!; // Bm barre
  assert.deepEqual(bm.fingers, [x, 1, 3, 4, 2, 1]);
  assert.equal(bm.barre!.fromString, 1);
  assert.equal(assignFingers([1, 3, 3, 2, 1, 4]), null); // needs 5 fingers
  assert.deepEqual(assignFingers([x, 0, 4, 4, 4, 0])!.fingers, [x, 0, 1, 2, 3, 0]); // falls back to sequential fingers
});

test("voicing finder rediscovers the textbook open chords in standard tuning", () => {
  const best = (root: number, chord: string) => voicingToString(findChordVoicings(TUNINGS.standard, root, chord)[0]);
  assert.equal(best(0, "major"), "x 3 2 0 1 0");
  assert.equal(best(7, "major"), "3 2 0 0 0 3");
  assert.equal(best(2, "major"), "x x 0 2 3 2");
  assert.equal(best(9, "major"), "x 0 2 2 2 0");
  assert.equal(best(4, "major"), "0 2 2 1 0 0");
  assert.equal(best(9, "minor"), "x 0 2 2 1 0");
  assert.equal(best(4, "minor"), "0 2 2 0 0 0");
  assert.equal(best(2, "minor"), "x x 0 2 3 1");
  assert.equal(best(7, "dom7"), "3 2 0 0 0 1");
  assert.equal(best(0, "maj7"), "x 3 2 0 0 0");
  assert.equal(best(9, "min7"), "x 0 2 0 1 0");
  assert.equal(best(9, "sus4"), "x 0 0 2 3 0");
  assert.equal(best(0, "dom7"), "x 3 2 3 1 0");
  assert.equal(best(2, "dom7"), "x x 0 2 1 2");
  assert.equal(best(11, "dom7"), "x 2 1 2 0 2");
  // Power chords are the tight two/three-string shapes on the bass strings.
  assert.equal(best(4, "power"), "0 2 2 x x x");
  assert.equal(best(9, "power"), "x 0 2 2 x x");
  assert.equal(best(7, "power"), "3 5 5 x x x");
  assert.equal(best(0, "power"), "x 3 5 5 x x");
  assert.equal(best(2, "power"), "x x 0 2 3 x");
  assert.equal(best(5, "power"), "1 3 3 x x x");
  // Chords without an open shape come out as the standard barre forms.
  assert.equal(best(10, "major"), "x 1 3 3 3 1");
  assert.equal(best(11, "major"), "x 2 4 4 4 2");
  assert.equal(best(11, "minor"), "x 2 4 4 3 2");
  assert.equal(best(6, "minor"), "2 4 4 2 2 2");
  // F has no open shape: the results include the full barre and the "small F".
  const f = findChordVoicings(TUNINGS.standard, 5, "major").map(voicingToString);
  assert.ok(f.includes("1 3 3 2 1 1"), f.join(" / "));
  assert.ok(f.includes("x x 3 2 1 1"), f.join(" / "));
});

test("voicings adapt to the tuning", () => {
  const top = (t: string, root: number, chord: string) => voicingToString(findChordVoicings(TUNINGS[t], root, chord)[0]);
  assert.equal(top("dropD", 2, "major"), "0 0 0 2 3 2");
  assert.equal(top("dropD", 2, "power"), "0 0 0 x x x");
  assert.equal(top("dadgad", 2, "major"), "0 0 4 2 0 0");
  assert.equal(top("openD", 2, "major"), "0 0 0 0 0 0");
  assert.equal(top("openC", 0, "major"), "0 0 0 0 0 0");
  // Open G: the lowest string is the 5th, so the best root-position shape skips it.
  assert.equal(top("openG", 7, "major"), "x 0 0 0 0 0");
});

test("every voicing is playable and contains the required chord tones", () => {
  for (const tuning of Object.values(TUNINGS)) {
    for (const chord of ["major", "minor", "dom7", "power", "sus2"]) {
      for (let root = 0; root < 12; root++) {
        const voicings = findChordVoicings(tuning, root, chord);
        assert.ok(voicings.length > 0, `${tuning.name} ${getChordSymbol(root, chord)} has voicings`);
        for (const v of voicings) {
          const fretted = v.frets.filter((f) => f !== null && f > 0) as number[];
          if (fretted.length) assert.ok(Math.max(...fretted) - Math.min(...fretted) <= 3, "span");
          const usedFingers = new Set(v.fingers.filter((f) => f !== null && f > 0));
          assert.ok(usedFingers.size <= 4, "max four fingers");
          assert.ok(v.roles.includes("root"), "root present");
          // No muted string sandwiched between sounding strings in the top result.
          if (v === voicings[0]) {
            const first = v.frets.findIndex((f) => f !== null);
            const last = v.frets.length - 1 - [...v.frets].reverse().findIndex((f) => f !== null);
            for (let s = first; s <= last; s++) assert.notEqual(v.frets[s], null, `${tuning.name} ${getChordSymbol(root, chord)}: inner mute in ${voicingToString(v)}`);
          }
          if (chord !== "power") assert.ok(v.roles.includes("third"), "3rd (or sus note) present");
        }
      }
    }
  }
});

test("ASCII tab export lines up columns", () => {
  const pos = buildScalePosition(TUNINGS.standard, 0, "major", 0);
  const tab = scalePositionToTab(TUNINGS.standard, pos, { range: "octave" });
  const ascii = tabToAscii(tab);
  const lines = ascii.split("\n");
  assert.equal(lines.length, 6);
  assert.ok(lines[0].startsWith("e|"));
  assert.ok(lines[5].startsWith("E|"));
  assert.ok(lines[4].startsWith("A|-3--"), lines[4]);
  assert.ok(lines.every((l) => l.length === lines[0].length), "all lines equal length");
});
