import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TUNINGS, STRING_COUNTS, STANDARD_TUNING_KEY, tuningMidi, tuningKeysForStrings, standardTuningFor, stringCountOf,
} from "../tunings";
import { noteToMidi, getChordSymbol } from "../theoryEngine";
import { buildScalePosition, scalePositionToTab, rootBoxPosition } from "../scaleTab";
import { findChordVoicings, voicingToString, voicingsToTab, voicingMidiNotes } from "../chordVoicings";
import { tabToAscii, tabStringLabels } from "../tab";

test("there are tunings for 6, 7 and 8 strings, each with a standard reference tuning", () => {
  for (const count of STRING_COUNTS) {
    const keys = tuningKeysForStrings(count);
    assert.ok(keys.length > 0, `${count}-string tunings exist`);
    const standardKey = STANDARD_TUNING_KEY[count];
    assert.ok(keys.includes(standardKey), `${standardKey} has ${count} strings`);
    for (const k of keys) {
      assert.equal(stringCountOf(TUNINGS[k]), count);
      assert.equal(standardTuningFor(TUNINGS[k]).notes.length, count, `${k} compares against a ${count}-string standard`);
    }
  }
});

test("7- and 8-string standards extend standard tuning downwards in 4ths", () => {
  const six = TUNINGS.standard.notes;
  assert.deepEqual(TUNINGS.bStandard7.notes.slice(1), six);
  assert.deepEqual(TUNINGS.fSharpStandard8.notes.slice(2), six);
  assert.equal(noteToMidi("E2") - noteToMidi(TUNINGS.bStandard7.notes[0]), 5);
  assert.equal(noteToMidi("B1") - noteToMidi(TUNINGS.fSharpStandard8.notes[0]), 5);
  // Drop tunings lower just the bottom string by a whole step.
  assert.deepEqual(TUNINGS.dropA7.notes.slice(1), six);
  assert.equal(noteToMidi(TUNINGS.bStandard7.notes[0]) - noteToMidi(TUNINGS.dropA7.notes[0]), 2);
  assert.equal(noteToMidi(TUNINGS.fSharpStandard8.notes[0]) - noteToMidi(TUNINGS.dropE8.notes[0]), 2);
});

test("tab labels, ASCII export and diagrams handle 7 and 8 strings", () => {
  assert.deepEqual(tabStringLabels(TUNINGS.bStandard7.notes), ["B", "E", "A", "D", "G", "B", "e"]);
  assert.deepEqual(tabStringLabels(TUNINGS.fSharpStandard8.notes), ["F#", "B", "E", "A", "D", "G", "B", "e"]);

  const pos = buildScalePosition(TUNINGS.fSharpStandard8, 6, "minorPentatonic", 0);
  const tab = scalePositionToTab(TUNINGS.fSharpStandard8, pos, { range: "full" });
  const ascii = tabToAscii(tab);
  const lines = ascii.split("\n");
  assert.equal(lines.length, 8);
  assert.ok(lines[0].startsWith(" e|"), lines[0]);
  assert.ok(lines[7].startsWith("F#|"), lines[7]);
  assert.ok(lines.every((l) => l.length === lines[0].length), "all lines equal length");
  // The run starts on the low F# string.
  assert.equal(pos.run[0].string, 0);
  assert.equal(pos.run[0].noteName, "F#");
});

test("scale runs on extended-range guitars reach below a 6-string's range", () => {
  const low = buildScalePosition(TUNINGS.fSharpStandard8, 4, "minor", 0).run[0];
  assert.ok(low.midi < noteToMidi("E2"), "8-string E minor starts below the 6-string low E");
  assert.equal(rootBoxPosition(TUNINGS.bStandard7, 11), 0); // B is the open low string
  assert.equal(rootBoxPosition(TUNINGS.dropA7, 0), 2);      // C on the low A string: fret 3 -> box at 2
});

test("chord voicings use the extra strings sensibly", () => {
  const best = (t: string, root: number, chord: string) => voicingToString(findChordVoicings(TUNINGS[t], root, chord)[0]);
  // The low B adds a bass note under the familiar E shape...
  assert.equal(best("bStandard7", 4, "major"), "x 0 2 2 1 0 0");
  // ...and a 7-string E major that uses the low B as the 5th is among the options.
  const e7 = findChordVoicings(TUNINGS.bStandard7, 4, "major").map(voicingToString);
  assert.ok(e7.includes("0 0 2 2 1 0 0"), e7.join(" / "));
  // Drop tunings: one-finger power chord across the lowest three strings.
  assert.equal(best("dropA7", 9, "power"), "0 0 0 x x x x");
  assert.equal(best("dropE8", 4, "power"), "0 0 0 x x x x x");
  // The E-shape power chord moves straight down to the new low strings.
  assert.equal(best("bStandard7", 11, "power"), "0 2 2 x x x x");
  assert.equal(best("fSharpStandard8", 6, "power"), "0 2 2 x x x x x");
  assert.equal(best("bStandard7", 0, "power"), "1 3 3 x x x x");
  // Every voicing has the right number of strings and its MIDI notes are in range.
  for (const t of ["bStandard7", "dropG7", "fSharpStandard8", "dropE8", "russianOpenG7"]) {
    for (let root = 0; root < 12; root++) {
      const voicings = findChordVoicings(TUNINGS[t], root, "major");
      assert.ok(voicings.length > 0, `${t} ${getChordSymbol(root, "major")}`);
      for (const v of voicings) {
        assert.equal(v.frets.length, TUNINGS[t].notes.length);
        const notes = voicingMidiNotes(TUNINGS[t], v);
        assert.equal(notes.length, v.frets.filter((f) => f !== null).length);
        const opens = tuningMidi(TUNINGS[t]);
        for (const n of notes) assert.equal(n.midi, opens[n.stringIndex] + (v.frets[n.stringIndex] as number));
      }
    }
  }
});

test("the voicings tab gives every chord two beats", () => {
  const voicings = findChordVoicings(TUNINGS.standard, 0, "major");
  const tab = voicingsToTab(TUNINGS.standard, voicings, "C");
  for (const m of tab.measures) for (const c of m.columns) assert.equal(c.duration, 2);
});
