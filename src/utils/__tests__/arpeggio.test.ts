import { test } from "node:test";
import assert from "node:assert/strict";
import { getDiatonicChords, romanNumeral, isHeptatonic, getChordNotes, getScaleNotes, isSymmetricalScale, SCALES, UNUSUAL_CHORD } from "../theoryEngine";
import { TUNINGS } from "../tunings";
import { buildArpeggioPosition, arpeggioToTab, arpeggioRun, bouncePattern, upAndDown, progressionToTab, arpeggioScaleKeys, PROGRESSIONS } from "../arpeggio";
import { buildScalePosition } from "../scaleTab";
import { flattenTab, tabToAscii } from "../tab";

test("the new chord types spell correctly", () => {
  assert.deepEqual(getChordNotes(11, "min7b5"), ["B", "D", "F", "A"]);
  assert.deepEqual(getChordNotes(8, "dim7"), ["G#", "B", "D", "F"]);
  assert.deepEqual(getChordNotes(9, "minMaj7"), ["A", "C", "E", "G#"]);
  assert.deepEqual(getChordNotes(0, "augMaj7"), ["C", "E", "G#", "B"]);
});

test("harmonising a key gives the textbook chords and numerals", () => {
  const cMajor = getDiatonicChords(0, "major");
  assert.deepEqual(cMajor.map((c) => c.symbol), ["C", "Dm", "Em", "F", "G", "Am", "Bdim"]);
  assert.deepEqual(cMajor.map((c) => c.numeral), ["I", "ii", "iii", "IV", "V", "vi", "vii°"]);
  assert.deepEqual(cMajor[4].noteNames, ["G", "B", "D"]);

  const cMajor7 = getDiatonicChords(0, "major", true);
  assert.deepEqual(cMajor7.map((c) => c.symbol), ["Cmaj7", "Dm7", "Em7", "Fmaj7", "G7", "Am7", "Bm7b5"]);
  assert.deepEqual(cMajor7.map((c) => c.numeral), ["Imaj7", "ii7", "iii7", "IVmaj7", "V7", "vi7", "viiø7"]);

  // Spelling follows the key: F major has Bb, not A#.
  assert.deepEqual(getDiatonicChords(5, "major").map((c) => c.symbol), ["F", "Gm", "Am", "Bb", "C", "Dm", "Edim"]);

  const aMinor = getDiatonicChords(9, "minor");
  assert.deepEqual(aMinor.map((c) => c.numeral), ["i", "ii°", "III", "iv", "v", "VI", "VII"]);

  // Harmonic minor: the raised 7th gives a major V (E7) and a diminished 7th on vii.
  const aHarm = getDiatonicChords(9, "harmonicMinor", true);
  assert.deepEqual(aHarm.map((c) => c.symbol), ["Am(maj7)", "Bm7b5", "Cmaj7#5", "Dm7", "E7", "Fmaj7", "G#dim7"]);
  assert.equal(aHarm[6].numeral, "vii°7");
  assert.equal(aHarm[2].numeral, "III+maj7");

  const aMel = getDiatonicChords(9, "melodicMinor");
  assert.deepEqual(aMel.map((c) => c.symbol), ["Am", "Bm", "Caug", "D", "E", "F#dim", "G#dim"]);

  // Modes.
  assert.deepEqual(getDiatonicChords(2, "dorian").map((c) => c.symbol), ["Dm", "Em", "F", "G", "Am", "Bdim", "C"]);
  assert.equal(getDiatonicChords(7, "mixolydian", true)[0].symbol, "G7");

  assert.equal(romanNumeral(4, "dom7"), "V7");
  assert.equal(romanNumeral(1, "min7b5"), "iiø7");
});

test("only seven-note scales can be harmonised", () => {
  for (const k of Object.keys(SCALES)) {
    const expected = SCALES[k].intervals.length === 7;
    assert.equal(isHeptatonic(k), expected, k);
    assert.equal(getDiatonicChords(0, k).length, expected ? 7 : 0, k);
  }
  assert.ok(arpeggioScaleKeys().includes("major") && !arpeggioScaleKeys().includes("minorPentatonic"));
});

test("C major arpeggio in open position is C E G C E G, fingered like the scale", () => {
  const chords = getDiatonicChords(0, "major");
  const pos = buildArpeggioPosition(TUNINGS.standard, 0, "major", chords[0], 0);
  assert.deepEqual(pos.run.map((n) => n.noteName), ["E", "G", "C", "E", "G", "C", "E", "G"]);
  assert.deepEqual(pos.run.map((n) => n.degree), ["3", "5", "1", "3", "5", "1", "3", "5"]);
  assert.deepEqual(pos.run.map((n) => n.role), ["third", "fifth", "root", "third", "fifth", "root", "third", "fifth"]);
  // Arpeggio notes are a subset of the scale position, at the same frets.
  const scalePos = buildScalePosition(TUNINGS.standard, 0, "major", 0);
  for (const n of pos.run) assert.ok(scalePos.run.some((s) => s.string === n.string && s.fret === n.fret), `${n.noteName} is in the scale run`);

  const tab = arpeggioToTab(TUNINGS.standard, pos, chords[0], { range: "octave", descend: true });
  const notes = flattenTab(tab).map((c) => c.notes[0]);
  assert.deepEqual(notes.map((n) => `${n.string}:${n.fret}`), ["1:3", "2:2", "3:0", "4:1", "3:0", "2:2", "1:3"]);
  assert.equal(tab.measures[0].columns[0].label, "I C");
  assert.equal(arpeggioRun(pos, "octave").length, 4);
  assert.equal(arpeggioRun(pos, "full").length, 6);
});

test("root to root spans every octave under the hand: three on an 8-string Drop E", () => {
  const e = getDiatonicChords(4, "major")[0];
  const pos = buildArpeggioPosition(TUNINGS.dropE8, 4, "major", e, 0);
  const run = arpeggioRun(pos, "octave");
  assert.equal(run[0].midi, 28, "starts on the low E1");
  assert.equal(run[run.length - 1].midi, 64, "ends on the highest root, E4");
  assert.deepEqual(run.map((n) => n.noteName), ["E", "G#", "B", "E", "G#", "B", "E", "G#", "B", "E"]);
  assert.equal(run.filter((n) => n.role === "root").length, 4);
  // "full" carries on past the last root to the top of the position.
  assert.ok(arpeggioRun(pos, "full").length > run.length);

  // Same on a 6-string: two roots two octaves apart in the open position.
  const six = arpeggioRun(buildArpeggioPosition(TUNINGS.standard, 4, "major", e, 0), "octave");
  assert.equal(six[0].midi, 40);
  assert.equal(six[six.length - 1].midi, 64);

  // In a progression, "all" notes per chord plays the whole span up and back down.
  const { tab } = progressionToTab(TUNINGS.dropE8, 4, "major", [e], 0, { notesPerChord: "all", range: "octave" });
  const notes = flattenTab(tab).map((c) => c.notes[0]);
  assert.equal(notes.length, run.length * 2 - 1);
  assert.equal(notes[0].string, 0);
  assert.equal(notes[notes.length - 1].string, 0, "comes back down to the low E");
  // With a fixed count the bounce still starts from the lowest root and climbs through the octaves.
  const eight = flattenTab(progressionToTab(TUNINGS.dropE8, 4, "major", [e], 0, { notesPerChord: 8 }).tab).map((c) => c.notes[0]);
  assert.deepEqual(eight.map((n) => n.string), run.slice(0, 8).map((n) => n.string));
});

test("bounce pattern goes up and back down without repeating the turnaround notes", () => {
  assert.deepEqual(upAndDown(["C", "E", "G", "C'"]), ["C", "E", "G", "C'", "G", "E", "C"]);
  assert.deepEqual(upAndDown(["C"]), ["C"]);
  assert.deepEqual(bouncePattern(["C", "E", "G", "C'"], 8), ["C", "E", "G", "C'", "G", "E", "C", "E"]);
  assert.deepEqual(bouncePattern(["C", "E", "G", "C'"], 4), ["C", "E", "G", "C'"]);
  assert.deepEqual(bouncePattern(["C"], 3), ["C", "C", "C"]);
  assert.deepEqual(bouncePattern([], 3), []);
});

test("a progression becomes one measure per chord with labels, in any key, tuning and string count", () => {
  const chords = getDiatonicChords(0, "major");
  const { tab, steps } = progressionToTab(TUNINGS.standard, 0, "major", [0, 4, 5, 3].map((d) => chords[d]), 0, { notesPerChord: 8 });
  assert.equal(tab.measures.length, 4);
  assert.deepEqual(tab.measures.map((m) => m.columns.length), [8, 8, 8, 8]);
  assert.deepEqual(tab.measures.map((m) => m.columns[0].label), ["I C", "V G", "vi Am", "IV F"]);
  assert.deepEqual(steps.map((s) => s.firstColumn), [0, 8, 16, 24]);
  // Every note of each measure belongs to that measure's chord.
  tab.measures.forEach((m, i) => {
    for (const c of m.columns) {
      const midi = c.notes[0].fret + [40, 45, 50, 55, 59, 64][c.notes[0].string];
      assert.ok(steps[i].chord.pcs.includes(midi % 12), `${steps[i].chord.symbol} contains note`);
    }
  });
  const ascii = tabToAscii(tab);
  assert.ok(ascii.includes("vi Am"));

  // 8-string Drop E, harmonic minor, 7th chords, up the neck.
  const sev = getDiatonicChords(4, "harmonicMinor", true);
  const p = PROGRESSIONS.find((x) => x.key === "1765")!;
  const out = progressionToTab(TUNINGS.dropE8, 4, "harmonicMinor", p.degrees.map((d) => sev[d]), 5, { notesPerChord: 4, range: "full" });
  assert.equal(out.tab.tuning.length, 8);
  assert.deepEqual(out.tab.measures.map((m) => m.columns.length), [4, 4, 4, 4]);
  assert.ok(out.tab.measures.every((m) => m.columns.every((c) => c.notes[0].fret >= 5 && c.notes[0].fret <= 9)), "stays in the hand position");
  for (const prog of PROGRESSIONS) assert.ok(prog.degrees.every((d) => d >= 0 && d < 7), prog.key);
});

test("exotic scales are spelled sensibly and harmonise without gaps", () => {
  assert.deepEqual(getScaleNotes(4, "phrygianDominant"), ["E", "F", "G#", "A", "B", "C", "D"]);
  assert.deepEqual(getScaleNotes(10, "phrygianDominant"), ["Bb", "Cb", "D", "Eb", "F", "Gb", "Ab"]);
  assert.deepEqual(getScaleNotes(0, "lydianDominant"), ["C", "D", "E", "F#", "G", "A", "Bb"]);
  assert.deepEqual(getScaleNotes(0, "doubleHarmonic"), ["C", "Db", "E", "F", "G", "Ab", "B"]);
  assert.deepEqual(getScaleNotes(0, "hungarianMinor"), ["C", "D", "Eb", "F#", "G", "Ab", "B"]);
  assert.deepEqual(getScaleNotes(0, "wholeTone"), ["C", "D", "E", "F#", "G#", "A#"]);
  assert.deepEqual(getScaleNotes(0, "hirajoshi"), ["C", "D", "Eb", "G", "Ab"]);
  assert.equal(getScaleNotes(0, "diminished").length, 8);
  assert.ok(isSymmetricalScale("wholeTone") && isSymmetricalScale("diminished") && !isSymmetricalScale("major") && !isSymmetricalScale("hirajoshi"));

  // Phrygian dominant is a mode of harmonic minor, so it has the same chords (E7 as the I chord).
  const pd = getDiatonicChords(4, "phrygianDominant", true);
  assert.equal(pd[0].symbol, "E7");
  assert.equal(pd[3].symbol, "Am(maj7)");

  // Scales whose stacked 3rds are not standard chords still get all seven degrees, named by intervals.
  for (const k of ["doubleHarmonic", "hungarianMinor", "neapolitanMinor"]) {
    for (const sevenths of [false, true]) {
      const chords = getDiatonicChords(0, k, sevenths);
      assert.equal(chords.length, 7, `${k} ${sevenths}`);
      assert.deepEqual(chords.map((c) => c.degree), [0, 1, 2, 3, 4, 5, 6]);
      for (const c of chords) {
        assert.ok(c.symbol.length > 0 && c.numeral.length > 0 && c.name.length > 0);
        assert.equal(c.pcs.length, sevenths ? 4 : 3);
      }
    }
  }
  const hm = getDiatonicChords(0, "hungarianMinor");
  assert.equal(hm[1].chordKey, UNUSUAL_CHORD);
  assert.equal(hm[1].symbol, "D(3 b5)");
  assert.equal(hm[1].numeral, "II(3 b5)");
  assert.deepEqual(hm[1].noteNames, ["D", "F#", "Ab"]);
  assert.equal(hm[4].symbol, "G");
  // Non-heptatonic exotics cannot be harmonised and stay out of the arpeggio lab.
  assert.equal(getDiatonicChords(0, "wholeTone").length, 0);
  assert.ok(!arpeggioScaleKeys().includes("diminished") && arpeggioScaleKeys().includes("hungarianMinor"));

  // Every scale produces valid, ascending runs in every tuning (including the 8-note diminished).
  for (const tuning of Object.values(TUNINGS)) {
    for (const k of Object.keys(SCALES)) {
      const pos = buildScalePosition(tuning, 7, k, 3);
      assert.ok(pos.run.length > 0, `${tuning.name} ${k}`);
      for (let i = 1; i < pos.run.length; i++) assert.ok(pos.run[i].midi > pos.run[i - 1].midi);
    }
  }
  // Progressions through an exotic key include the unusual degrees.
  const { tab } = progressionToTab(TUNINGS.standard, 0, "doubleHarmonic", [0, 4, 6].map((d) => getDiatonicChords(0, "doubleHarmonic")[d]), 0, { notesPerChord: 4 });
  assert.deepEqual(tab.measures.map((m) => m.columns[0].label), ["I C", "V(3 b5) G(3 b5)", "VII(2 b5) B(2 b5)"]);
});
