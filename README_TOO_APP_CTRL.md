# Guitar Tuning & Theory Lab

A Next.js + Tailwind CSS v4 web app that teaches beginner guitarists the basics of
different tunings, scales, chords and arpeggios, visually, as tablature — and
audibly, with a built-in tab player and metronome.

Pick a tuning (6, 7 or 8 strings) and everything (tab, scale fingerings, chord shapes,
fretboard map, playback) is recalculated for that tuning from the actual pitches of the
open strings.

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # engine tests (scales, spelling, voicings, keys/arpeggios, tab export, synth, player, 7/8-string)
npm run build    # production build
```

## What's in the box

| Area | File(s) | Notes |
| --- | --- | --- |
| Tablature renderer | `src/components/Tablature.tsx` | SVG tab: one line per string (6–8), string names, TAB clef, bar lines, root highlighting, optional fingering row, wraps into systems. Playhead band + click-to-hear columns. |
| Chord diagrams | `src/components/ChordDiagram.tsx` | Classic chord box with finger numbers, barre bar, open/muted markers, base-fret label. |
| Fretboard map | `src/components/Fretboard.tsx` | Props-driven note map (nut, fret markers, position shading, per-note colours/badges). "Now sounding" ring while the tab plays; click a note to hear it. |
| Scales view | `src/components/ScaleLab.tsx` | Root + scale + hand position → tab, facts, fretboard map, "copy as text tab". |
| Chords view | `src/components/ChordLab.tsx` | Root + chord type → ranked voicings (diagrams + tab), fretboard map, chord chart for all 12 roots. |
| Arpeggios view | `src/components/ArpeggioLab.tsx` | Key (root + scale) → the chords of the key (triads / 7ths, roman numerals) → one chord's arpeggio or a whole progression as tab, with the fretboard following the chord being played. |
| Arpeggio engine | `src/utils/arpeggio.ts` | Arpeggio positions (chord tones under the hand), bounce patterns, progression presets, `progressionToTab()`. |
| Theory engine | `src/utils/theoryEngine.ts` | Pitch classes / MIDI, scale & chord formulas, sharp/flat spelling by key, `getDiatonicChords()` (harmonising any 7-note scale in 3rds). |
| Scale fingering | `src/utils/scaleTab.ts` | Builds a one-position scale run from real pitches (works in any tuning). |
| Chord voicings | `src/utils/chordVoicings.ts` | Searches every playable shape in a tuning, checks finger/barre feasibility, ranks by beginner-friendliness. |
| Tab model + ASCII | `src/utils/tab.ts` | `TabData` types, `tabToAscii()` for the standard text-tab format, `flattenTab()` for playback. |
| Tunings | `src/utils/tunings.ts` | Data only; add an entry and the whole app picks it up. 6-, 7- and 8-string tunings. |
| Tuning picker | `src/components/TuningSelector.tsx` | String-count chips (6 / 7 / 8), tunings for that count, clickable "tuning pegs" that sound each open string. |
| Plucked-string synth | `src/utils/audio/pluck.ts` | Pure DSP (extended Karplus-Strong): renders one plucked note as samples. No browser APIs, unit-tested. |
| Metronome click | `src/utils/audio/click.ts` | Pure DSP for the bar / beat / subdivision clicks. |
| Guitar instrument | `src/utils/audio/synth.ts` | `GuitarSynth`: Web Audio wrapper. Lazy AudioContext, cached note buffers, tone/body/compressor chain, per-string note stopping, strums. |
| Tab player | `src/utils/audio/player.ts` | `TabPlayer`: look-ahead scheduler that plays a `TabData` (play / pause / stop / seek / loop / tempo / note value / click / count-in) and reports the playhead and beat. Framework-free. |
| Player hook + UI | `src/hooks/useTabPlayer.ts`, `src/components/TabPlayer.tsx` | React binding and the transport bar (play, stop, tempo, loop, volume, note value, click, count-in, beat dots, position readout). |

## Hearing the tab (live player)

Every tab view has a transport bar. Press play and the tab is performed with a
synthesised plucked-string guitar while a golden cursor moves through the columns;
the matching note (or chord shape) lights up on the fretboard at the same time.

* **Play / pause / stop**, **tempo** (40–300 bpm, quarter notes), **loop**, **volume**.
* **Play as ♩ / ♪ / ♬** — what each tab note is worth: one, two or four notes per
  click. "Sixteenths at 90" is exactly what a teacher would ask for.
* **Click** — a metronome: *Off*, *Beat* (a click on every quarter note, accented on
  beat 1 of a 4-beat bar) or *Subdivided* (beat clicks plus a softer tick on every
  note value). With the click on, a **count-in bar** plays first so you can come in
  on the downbeat; four dots next to the readout flash with the beat (rust during
  the count-in, honey while playing). A **click volume** slider (with a mute button)
  sets how loud the metronome is relative to the guitar: 70 % is about level with it,
  100 % sits clearly on top for noisy rooms.
* **Click any column** of the tab to hear it and park the playhead there; play then
  starts from that column. Clicking a chord card, a chord-chart entry, a note on the
  fretboard, or a tuning peg sounds it too.
* Changing the root / scale / tuning / click *while playing* keeps playing with the
  new settings; changing the note value re-plans from the current note.
* Timing: each column lasts `column.duration` note values (default 1). Scale runs
  default to eighth notes at 90 bpm with the click on; chord voicings ring for two
  quarter notes at 80 bpm. Columns with several notes are strummed low-to-high
  (18 ms between strings). A loop restarts on the next beat so the downbeat always
  lands on the start of the tab.

How it is built (no audio files, no dependencies):

* `pluck.ts` is an extended Karplus-Strong model: a delay line one period long with a
  two-point low-pass in the feedback loop, excited by a burst of noise. A fractional
  delay keeps every note within a cent of pitch at any sample rate, a pick-position
  comb filter gives the plucked timbre, and the loop loss sets the ring time (longer
  on low strings). Rendering a note takes a few milliseconds; notes are cached per pitch.
* `synth.ts` plays those buffers through a lowpass "tone" filter, a low-mid "body"
  resonance, a little presence, and a compressor so an 8-string strum stays clean.
  Plucking a string that is still ringing fades the old note out, like the real thing.
* `click.ts` renders the metronome sounds (two decaying sine partials with a tiny
  noise transient; downbeat high and bright, beats lower, subdivisions softer). Clicks
  bypass the guitar's tone chain and compressor so they stay crisp and never duck the notes.
* `player.ts` uses the usual Web Audio look-ahead scheduler (timer every 25 ms,
  schedule ~120 ms ahead on the audio clock), so timing is sample-accurate even when
  React is busy. Notes and clicks are one event stream ordered by *beat position*
  and converted to time through a single cursor, so they can never drift apart and a
  tempo change applies to both at once. The AudioContext is created on the first
  click, as browsers require.

Playback is available wherever Web Audio is (every modern browser); the transport bar
explains itself if it is not.

## Arpeggios in a key

The **Arpeggios** tab ties scales and chords together. Pick a key (root + flavour:
major, natural / harmonic / melodic minor, or a mode) and the app harmonises the
scale: every degree gets its chord, as triads or 7th chords, with roman numerals
(`I ii iii IV V vi vii°`, `Imaj7 ii7 … V7 … viiø7`; harmonic minor gives `V7` and
`vii°7`, melodic minor `ii` and `viø7`). Click a chord to hear it and see its
arpeggio — the chord tones under your hand in the chosen position, as a run with
fingering — or pick a **progression** (1–4–5, 1–5–6–4, 2–5–1, Andalusian 1–7–6–5,
12-bar blues, "every chord"…) and the tab arpeggiates through it, one measure per
chord, bouncing up and down to fill 4, 8 or 16 notes per chord — or "All", the whole
run up and back down. "Root to root" means the lowest root to the *highest* root
under the hand: one octave in most 6-string positions, two or three on a 7- or
8-string (Drop E open position gives E1 → E4). While it plays, the
fretboard and the chord cards follow the chord under the playhead, with the rest of
the scale shown as hollow notes so you can see how the arpeggio sits inside the key.

Under the hood `getDiatonicChords()` stacks thirds on the scale and matches each
stack against `CHORDS` (four qualities were added for this: half-diminished,
diminished 7th, minor-major 7th and augmented-major 7th, so the common scales
harmonise completely). Exotic scales can stack into chords with no everyday name
(Hungarian minor's II is D F# Ab, a "major b5"); those degrees are kept and named
by their intervals — `II(3 b5)`, `D(3 b5)` — so progressions never have holes.
Five-, six- and eight-note scales cannot be harmonised in thirds and stay out of
the arpeggio lab. Note names are spelled by the key, not the chord, so the V
of F major reads C E G Bb. Arpeggio positions reuse the scale engine
(`buildPositionRun` in `scaleTab.ts`) so the fingering logic is identical.

## Extended-range guitars (7 and 8 strings)

The first step of the tuning picker chooses the string count. Tunings are grouped by
how many notes they have, so the engine never needs to know what "a guitar" is:

| Strings | Tunings | Notes |
| --- | --- | --- |
| 6 | Standard, Eb, D, Drop D/C, Double Drop D, DADGAD, Open D/G/E/A/C, All Fourths | |
| 7 | B Standard, A Standard, Drop A, Drop G, Russian Open G | low string a 4th below E (B1) |
| 8 | F# Standard, E Standard, Drop E, Drop D | two extra strings (F#1, B1); the low F# is below a bass guitar's A |

Everything is string-count agnostic: scale runs start on the lowest string, chord
voicings are searched across all strings (the "E-shape" power chord lands on the new
low string: `0 2 2 x x x x x`), tab and diagrams grow a line per string, the ASCII
export right-aligns the labels (`F#|`), and the synth reaches the low F# (46 Hz).
"Semitones from standard" on the tuning pegs compares against the standard tuning
with the *same* string count (`STANDARD_TUNING_KEY`).

## Adding a tuning

Add one entry to `TUNINGS` in `src/utils/tunings.ts`. Notes go from the lowest
string to the highest and **must include the octave number** so the engine knows
the real pitch of each string. The number of notes is the number of strings (6, 7 or 8):

```ts
openDm: {
  name: "Open Dm",
  category: "Open",            // "Standard" | "Drop" | "Open" | "Other"
  description: "D A D F A D — a minor-flavoured open tuning.",
  notes: ["D2", "A2", "D3", "F3", "A3", "D4"],
},
```

Flats and sharps are both understood (`"Eb2"`, `"F#3"`). Anything else (scale
runs, chord shapes, fretboard map, tab labels, playback) is derived automatically.
A 7- or 8-string tuning is simply an entry with 7 or 8 notes; it appears under the
matching string-count chip.

Adding scales or chord types works the same way: add an entry to `SCALES` or
`CHORDS` in `src/utils/theoryEngine.ts` (intervals in semitones from the root).
Scales have a `category` (`Essential`, `Modes`, `Other`, `Exotic`), optional degree
`labels` when the defaults would spell a note wrong (`#4` in lydian), and a
`relativeMajorOffset` that decides sharps vs flats. The built-in exotics are Phrygian
Dominant, Lydian Dominant, Altered, Double Harmonic, Hungarian Minor, Neapolitan
Minor, Whole Tone, Diminished (half–whole) and Hirajoshi. Symmetrical scales (whole
tone, diminished) are spelled plainly rather than one letter per degree.

## How the generators work

**Scale tab.** A hand position is a 5-fret window. Every scale note inside the
window is collected on every string, then a run is built from the *pitches*
(not from fret shapes): unique pitches in ascending order, each placed on the
lowest string that can reach it without the hand going backwards. This is why
DADGAD, Open G, All-Fourths, etc. get correct ascending runs instead of shifted
standard-tuning shapes. Fingers are assigned relative to the lowest fretted fret.

**Chord voicings.** For each string the options are "mute" or any fret (0–12)
that is a chord tone. A depth-first search with a 4-fret span limit enumerates
shapes; each one must contain the required chord tones, be playable with four
fingers (one index-finger barre allowed, only where it can lie flat), and is
then scored: more strings and open strings are good; high frets, many fingers,
wide stretches, barres, inversions, and open strings trapped between fingers
are bad; muted strings in the middle are only used when nothing strummable
exists. In standard tuning this reproduces the textbook open chords
(C, G, D, A, E, Am, Em, Dm, G7, C7, …) and the usual barre forms.

Power chords are scored differently: they are tight two- or three-string shapes on
the bass strings, the unplayed trebles are simply not strummed (so muted high strings
are free), extra strings and unison doublings are penalised, and a low bass is
preferred. That yields `0 2 2 x x x` (E5), `x 3 5 5 x x` (C5), `0 0 0 x x x` in Drop D,
and the same shapes on the low B / F# of a 7- or 8-string.

## Conventions

* String index 0 is always the lowest-pitched string (6th on a regular guitar, 7th/8th
  on an extended-range one); the tab draws the highest string on top and labels it in
  lowercase (`e B G D A E`, `e B G D A E B F#`).
* `TabColumn.duration` is in note values (default 1); the player turns it into beats
  with the chosen note value and into seconds with its quarter-note tempo.
* Colours: rust = root, sage green = 3rd, lake blue = 5th, plum = 7th, teal = blue note.
* Look & feel: warm "workshop" palette defined in `tailwind.config.js` (cream paper,
  walnut, honey), loaded by `src/app/global.css` through Tailwind v4's `@config`
  directive; PostCSS uses `@tailwindcss/postcss`. Wood grain, metal frets and pearl inlays are pure SVG
  (`src/components/wood.tsx`), so there are no image assets to manage.
