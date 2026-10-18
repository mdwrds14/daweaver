import { test } from "node:test";
import assert from "node:assert/strict";
import { renderPluck, midiToFrequency, estimateFrequency, defaultDecaySeconds } from "../audio/pluck";
import { renderClick, CLICK_SPECS } from "../audio/click";
import { TabPlayer, PlayerSynth, PlayerState, BeatInfo, MAX_BPM } from "../audio/player";
import { TabData, flattenTab, countColumns, tabNoteMidi } from "../tab";
import { TUNINGS } from "../tunings";
import { buildScalePosition, scalePositionToTab } from "../scaleTab";

/* ------------------------------------------------------------------ */
/* Plucked-string synthesis                                            */
/* ------------------------------------------------------------------ */

test("midi to frequency", () => {
  assert.equal(midiToFrequency(69), 440);
  assert.ok(Math.abs(midiToFrequency(40) - 82.407) < 0.01); // low E
  assert.ok(Math.abs(midiToFrequency(30) - 46.249) < 0.01); // 8-string low F#
});

test("rendered plucks are in tune across the whole range (8-string low F# to the 24th fret)", () => {
  for (const sampleRate of [44100, 48000]) {
    for (const midi of [30, 35, 40, 47, 52, 59, 64, 76, 88]) {
      const f = midiToFrequency(midi);
      const samples = renderPluck(sampleRate, f, 1.0, { seed: 7 });
      const cents = 1200 * Math.log2(estimateFrequency(samples, sampleRate) / f);
      assert.ok(Math.abs(cents) < 3, `midi ${midi} @ ${sampleRate}: off by ${cents.toFixed(2)} cents`);
    }
  }
});

test("rendered plucks are finite, normalised, start with a transient and die away", () => {
  const sampleRate = 44100;
  const samples = renderPluck(sampleRate, midiToFrequency(52), 2.5, { seed: 3 });
  assert.equal(samples.length, Math.floor(2.5 * sampleRate));
  let peak = 0;
  for (const v of samples) {
    assert.ok(Number.isFinite(v));
    peak = Math.max(peak, Math.abs(v));
  }
  assert.ok(Math.abs(peak - 0.9) < 1e-4, `peak ${peak}`);
  const rms = (from: number, to: number) => {
    let sum = 0;
    for (let i = from; i < to; i++) sum += samples[i] * samples[i];
    return Math.sqrt(sum / (to - from));
  };
  const attack = rms(0, sampleRate * 0.05);
  const middle = rms(sampleRate * 1.0, sampleRate * 1.05);
  const tail = rms(samples.length - sampleRate * 0.05, samples.length);
  assert.ok(attack > middle && middle > tail, `envelope decays: ${attack} > ${middle} > ${tail}`);
  assert.ok(tail < 0.01, "fades out to silence");
  assert.equal(samples[0], 0, "fade-in starts at zero (no click)");
});

test("seeded renders are repeatable and low notes ring longer than high ones", () => {
  const a = renderPluck(44100, 110, 0.2, { seed: 42 });
  const b = renderPluck(44100, 110, 0.2, { seed: 42 });
  assert.deepEqual(Array.from(a), Array.from(b));
  assert.ok(defaultDecaySeconds(41) > defaultDecaySeconds(330));
  assert.ok(defaultDecaySeconds(330) > defaultDecaySeconds(1000));
});

test("metronome clicks are short, normalised to their level and silent at the end", () => {
  for (const kind of ["bar", "beat", "sub"] as const) {
    const spec = CLICK_SPECS[kind];
    const samples = renderClick(44100, spec);
    assert.equal(samples.length, Math.floor(spec.seconds * 44100));
    let peak = 0;
    for (const v of samples) {
      assert.ok(Number.isFinite(v));
      peak = Math.max(peak, Math.abs(v));
    }
    assert.ok(Math.abs(peak - spec.level) < 1e-4, `${kind} peak ${peak}`);
    assert.equal(Math.abs(samples[samples.length - 1]), 0);
  }
  assert.ok(CLICK_SPECS.bar.level > CLICK_SPECS.beat.level && CLICK_SPECS.beat.level > CLICK_SPECS.sub.level, "accent > beat > subdivision");
});

/* ------------------------------------------------------------------ */
/* Tab helpers                                                         */
/* ------------------------------------------------------------------ */

const tab: TabData = {
  tuning: TUNINGS.standard.notes,
  measures: [
    { columns: [{ notes: [{ string: 0, fret: 0 }] }, { notes: [{ string: 0, fret: 3 }], duration: 0.5 }] },
    { columns: [{ notes: [{ string: 0, fret: 2 }, { string: 1, fret: 2 }, { string: 2, fret: 0 }], label: "A5", duration: 2 }] },
  ],
};

test("flattenTab numbers columns across measures and fills in beats", () => {
  const flat = flattenTab(tab);
  assert.equal(countColumns(tab), 3);
  assert.deepEqual(flat.map((c) => [c.index, c.measure, c.column, c.units]), [[0, 0, 0, 1], [1, 0, 1, 0.5], [2, 1, 0, 2]]);
  assert.equal(flat[2].label, "A5");
  assert.equal(tabNoteMidi(tab.tuning, { string: 0, fret: 3 }), 43); // G2
  assert.equal(tabNoteMidi(TUNINGS.fSharpStandard8.notes, { string: 0, fret: 0 }), 30); // F#1
});

/* ------------------------------------------------------------------ */
/* Player / scheduler                                                  */
/* ------------------------------------------------------------------ */

interface Pluck { midi: number; when: number; stringIndex?: number }
interface Click { kind: string; when: number }

/** Fake synth with a real-time clock, so the scheduler can be exercised in Node. */
function fakeSynth() {
  const t0 = Date.now();
  const plucks: Pluck[] = [];
  const clicks: Click[] = [];
  let mutes = 0;
  const synth: PlayerSynth = {
    async ensure() {},
    get now() {
      return (Date.now() - t0) / 1000;
    },
    pluck(midi, when, params) {
      plucks.push({ midi, when, stringIndex: params?.stringIndex });
    },
    click(kind, when) {
      clicks.push({ kind, when });
    },
    muteAll() {
      mutes++;
    },
  };
  return { synth, plucks, clicks, mutes: () => mutes };
}

const near = (a: number, b: number, msg?: string) => assert.ok(Math.abs(a - b) < 1e-6, `${msg ?? ""} expected ${b}, got ${a}`);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("player schedules every column in order at the right tempo, then stops", async () => {
  const { synth, plucks } = fakeSynth();
  const positions: (number | null)[] = [];
  const states: PlayerState[] = [];
  const player = new TabPlayer(synth, { onPosition: (p) => positions.push(p), onState: (s) => states.push(s) }, { bpm: 240 });
  player.setTab(tab);
  assert.equal(player.getDuration(), 3.5 * 0.25);

  await player.play();
  assert.equal(player.getState(), "playing");
  await sleep(1300);

  assert.equal(player.getState(), "stopped");
  // Columns 0, 1 and the three strummed notes of column 2.
  assert.deepEqual(plucks.map((p) => p.midi), [40, 43, 42, 47, 50]);
  const spb = 60 / 240;
  near(plucks[1].when - plucks[0].when, spb, "second column one beat later");
  near(plucks[2].when - plucks[1].when, spb * 0.5, "half-beat column");
  assert.ok(plucks[3].when > plucks[2].when && plucks[4].when > plucks[3].when, "strum is staggered low to high");
  assert.deepEqual(plucks.map((p) => p.stringIndex), [0, 0, 0, 1, 2]);
  assert.deepEqual(positions, [0, 1, 2, null]);
  assert.deepEqual(states, ["playing", "stopped"]);
  player.dispose();
});

/** Four single notes, one unit each. */
const fourNotes: TabData = {
  tuning: TUNINGS.standard.notes,
  measures: [{ columns: [0, 2, 3, 5].map((fret) => ({ notes: [{ string: 0, fret }] })) }],
};

test("note value sets how many tab notes fit in one click", async () => {
  for (const [noteValue, perBeat] of [[4, 1], [8, 2], [16, 4]] as const) {
    const { synth, plucks, clicks } = fakeSynth();
    const player = new TabPlayer(synth, {}, { bpm: 240, noteValue, click: "beat", countIn: false });
    player.setTab(fourNotes);
    near(player.getBeats(), 4 / perBeat, `${noteValue}: beats`);
    await player.play();
    await sleep(1300);
    assert.equal(player.getState(), "stopped");
    const spb = 60 / 240;
    assert.equal(plucks.length, 4);
    for (let i = 1; i < 4; i++) near(plucks[i].when - plucks[i - 1].when, spb / perBeat, `${noteValue}: note spacing`);
    // One click per beat while the tab lasts, the first one accented, and the first note on the first click.
    assert.equal(clicks.length, 4 / perBeat, `${noteValue}: click count`);
    assert.equal(clicks[0].kind, "bar");
    near(clicks[0].when, plucks[0].when, `${noteValue}: click and note together`);
    for (let i = 1; i < clicks.length; i++) {
      near(clicks[i].when - clicks[i - 1].when, spb, `${noteValue}: click spacing`);
      assert.equal(clicks[i].kind, "beat");
    }
    player.dispose();
  }
});

test("subdivided click ticks softly between beats at the note value", async () => {
  const { synth, plucks, clicks } = fakeSynth();
  const player = new TabPlayer(synth, {}, { bpm: 240, noteValue: 16, click: "subdivided", countIn: false });
  player.setTab(fourNotes); // one beat of sixteenths
  await player.play();
  await sleep(800);
  assert.deepEqual(clicks.map((c) => c.kind), ["bar", "sub", "sub", "sub"]);
  clicks.forEach((c, i) => near(c.when, plucks[i].when, "every note has a tick"));
  player.dispose();
});

test("count-in plays one accented bar of clicks before the first note, then the downbeat lands on it", async () => {
  const { synth, plucks, clicks } = fakeSynth();
  const beats: BeatInfo[] = [];
  const player = new TabPlayer(synth, { onBeat: (b) => b && beats.push(b) }, { bpm: 300, noteValue: 4, click: "beat", countIn: true });
  player.setTab(fourNotes);
  await player.play();
  await sleep(1900);
  assert.equal(player.getState(), "stopped");
  const spb = 60 / 300;
  assert.equal(clicks.length, 8, "4 count-in clicks + 4 beats");
  assert.deepEqual(clicks.map((c) => c.kind), ["bar", "beat", "beat", "beat", "bar", "beat", "beat", "beat"]);
  near(plucks[0].when, clicks[4].when, "first note on the downbeat after the count-in");
  near(clicks[4].when - clicks[0].when, 4 * spb);
  assert.deepEqual(beats.slice(0, 5).map((b) => [b.beat, b.countIn]), [[1, true], [2, true], [3, true], [4, true], [1, false]]);
  player.dispose();
});

test("turning the click on or off mid-play does not interrupt the notes", async () => {
  const { synth, plucks, clicks, mutes } = fakeSynth();
  const player = new TabPlayer(synth, {}, { bpm: 240, noteValue: 4, click: "off", countIn: true });
  player.setTab(fourNotes);
  await player.play();
  await sleep(300);
  player.setClick("beat");
  await sleep(900);
  assert.equal(mutes(), 0, "no restart");
  assert.equal(plucks.length, 4);
  assert.ok(clicks.length >= 1 && clicks.length < 4, `clicks after switching on: ${clicks.length}`);
  player.dispose();
});

test("tempo goes up to 300 bpm", () => {
  const { synth } = fakeSynth();
  const player = new TabPlayer(synth);
  player.setBpm(300);
  assert.equal(player.getBpm(), 300);
  assert.equal(MAX_BPM, 300);
  player.dispose();
});

test("looping wraps around; pause keeps the place; stop resets it", async () => {
  const { synth, plucks, clicks, mutes } = fakeSynth();
  const player = new TabPlayer(synth, {}, { bpm: 240, loop: true, click: "beat", countIn: false });
  player.setTab(tab);
  await player.play();
  await sleep(1200);
  assert.equal(player.getState(), "playing");
  assert.ok(plucks.length > 5, "kept going past the end");
  // The tab is 3.5 beats long: each loop restarts on the next beat (4), with a downbeat accent there.
  const spb = 60 / 240;
  near(plucks[5].when - plucks[0].when, 4 * spb, "second pass starts on beat 4");
  const accents = clicks.filter((c) => c.kind === "bar").map((c) => c.when);
  assert.ok(accents.length >= 2);
  near(accents[1] - accents[0], 4 * spb, "downbeat every loop");

  player.pause();
  assert.equal(player.getState(), "paused");
  assert.ok(mutes() >= 1, "pausing silences ringing notes");
  const paused = player.getPosition();
  assert.ok(paused >= 0 && paused < 3);

  player.stop();
  assert.equal(player.getState(), "stopped");
  assert.equal(player.getPosition(), 0);
  player.dispose();
});

test("seek moves the playhead and preview sounds a column without moving it", async () => {
  const { synth, plucks } = fakeSynth();
  const positions: (number | null)[] = [];
  const player = new TabPlayer(synth, { onPosition: (p) => positions.push(p) });
  player.setTab(tab);
  player.seek(2);
  assert.equal(player.getPosition(), 2);
  assert.equal(player.getState(), "paused");
  assert.deepEqual(positions, [2]);
  await player.preview(1);
  assert.deepEqual(plucks.map((p) => p.midi), [43]);
  assert.equal(player.getPosition(), 2);
  // Out-of-range seeks are clamped.
  player.seek(99);
  assert.equal(player.getPosition(), 2);
  player.seek(-5);
  assert.equal(player.getPosition(), 0);
  player.dispose();
});

test("swapping the tab while paused clamps the position; tempo is clamped to a sane range", () => {
  const { synth } = fakeSynth();
  const player = new TabPlayer(synth);
  const pos = buildScalePosition(TUNINGS.standard, 0, "major", 0);
  player.setTab(scalePositionToTab(TUNINGS.standard, pos, { range: "full" }));
  player.seek(10);
  player.setTab(tab);
  assert.equal(player.getPosition(), 2);
  player.setBpm(1000);
  assert.equal(player.getBpm(), 300);
  player.setBpm(1);
  assert.equal(player.getBpm(), 40);
  player.dispose();
});
