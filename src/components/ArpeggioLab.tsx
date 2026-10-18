"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Tuning } from "@/utils/tunings";
import {
  SCALES,
  getDiatonicChords,
  midiToPitchClass,
  pcToName,
  preferFlats,
  intervalFromRoot,
  chordDegreeLabel,
  scaleDegreeLabel,
  intervalNameForLabel,
  spellScaleTone,
  DiatonicChord,
} from "@/utils/theoryEngine";
import { rootBoxPosition, POSITION_SPAN } from "@/utils/scaleTab";
import { arpeggioScaleKeys, buildArpeggioPosition, arpeggioToTab, progressionToTab, keyPitchClasses, PROGRESSIONS } from "@/utils/arpeggio";
import { tabToAscii } from "@/utils/tab";
import { getGuitarSynth } from "@/utils/audio/synth";
import { useTabPlayer } from "@/hooks/useTabPlayer";
import Tablature, { ROLE_COLORS } from "./Tablature";
import TabPlayer from "./TabPlayer";
import Fretboard, { FingerBadgeKey } from "./Fretboard";
import RootPicker from "./RootPicker";
import { Chip, StepHeading, Panel, Toggle, Legend, Segmented, GhostButton } from "./ui";

type Selection = { kind: "chord"; degree: number } | { kind: "progression"; key: string };

const KEY_FLAVOURS: { keys: string[]; label: string }[] = [
  { keys: ["major", "minor"], label: "Start here" },
  { keys: ["harmonicMinor", "melodicMinor"], label: "Minor colours" },
  { keys: ["dorian", "phrygian", "lydian", "mixolydian", "locrian"], label: "Modes" },
  { keys: Object.keys(SCALES).filter((k) => SCALES[k].category === "Exotic"), label: "Exotic" },
];

function roleForChordInterval(interval: number) {
  switch (interval) {
    case 0: return "root" as const;
    case 3: case 4: return "third" as const;
    case 6: case 7: case 8: return "fifth" as const;
    case 9: case 10: case 11: return "seventh" as const;
    default: return "other" as const;
  }
}

export default function ArpeggioLab({ tuning }: { tuning: Tuning }) {
  const [rootPc, setRootPc] = useState(0);
  const [scaleKey, setScaleKey] = useState("major");
  const [sevenths, setSevenths] = useState(false);
  const [selection, setSelection] = useState<Selection>({ kind: "chord", degree: 0 });
  const [positionMode, setPositionMode] = useState<"rootBox" | "open" | "custom">("open");
  const [customPosition, setCustomPosition] = useState(0);
  const [range, setRange] = useState<"octave" | "full">("octave");
  const [descend, setDescend] = useState(true);
  const [notesPerChord, setNotesPerChord] = useState<"4" | "8" | "16" | "all">("8");
  const [showFingering, setShowFingering] = useState(true);
  const [showScaleTones, setShowScaleTones] = useState(true);
  const [showWholeNeck, setShowWholeNeck] = useState(false);
  const [labelMode, setLabelMode] = useState<"notes" | "intervals">("notes");
  const [copied, setCopied] = useState(false);

  const scale = SCALES[scaleKey];
  const flats = preferFlats(rootPc, scaleKey);
  const keyName = `${pcToName(rootPc, flats)} ${scale.name.replace(/ \(.*\)/, "")}`;
  const scalePcs = useMemo(() => keyPitchClasses(rootPc, scaleKey), [rootPc, scaleKey]);
  const chords = useMemo(() => getDiatonicChords(rootPc, scaleKey, sevenths), [rootPc, scaleKey, sevenths]);

  const progression = selection.kind === "progression" ? PROGRESSIONS.find((p) => p.key === selection.key) ?? PROGRESSIONS[0] : null;
  const progressionChords = useMemo(() => (progression ? progression.degrees.map((d) => chords[d]) : []), [progression, chords]);
  const selectedChord: DiatonicChord = selection.kind === "chord" ? chords[Math.min(selection.degree, chords.length - 1)] : chords[0];

  // Hand position: "root box" follows the chord root (or the key root for a progression).
  const boxRoot = selection.kind === "chord" ? selectedChord.rootPc : rootPc;
  const position = positionMode === "open" ? 0 : positionMode === "rootBox" ? rootBoxPosition(tuning, boxRoot) : customPosition;
  const lowFret = Math.max(0, position);
  const highFret = lowFret + POSITION_SPAN;
  const positionLabel = lowFret === 0 ? "open position" : `frets ${lowFret}–${highFret}`;

  const chordPos = useMemo(
    () => buildArpeggioPosition(tuning, rootPc, scaleKey, selectedChord, position),
    [tuning, rootPc, scaleKey, selectedChord, position],
  );

  const built = useMemo(() => {
    if (progression) {
      const { tab, steps } = progressionToTab(tuning, rootPc, scaleKey, progressionChords, position, {
        notesPerChord: notesPerChord === "all" ? "all" : Number(notesPerChord),
        range,
      });
      tab.title = `${progressionChords.map((c) => c.numeral).join(" – ")} in ${keyName} — arpeggios, ${tuning.name} tuning, ${positionLabel}`;
      return { tab, steps };
    }
    const tab = arpeggioToTab(tuning, chordPos, selectedChord, { range, descend });
    tab.title = `${selectedChord.symbol} arpeggio (${selectedChord.numeral} of ${keyName}) — ${tuning.name} tuning, ${positionLabel}`;
    return { tab, steps: [{ chord: selectedChord, position: chordPos, firstColumn: 0, columns: tab.measures.reduce((a, m) => a + m.columns.length, 0) }] };
  }, [progression, progressionChords, tuning, rootPc, scaleKey, position, notesPerChord, range, descend, chordPos, selectedChord, keyName, positionLabel]);
  const { tab, steps } = built;
  const noteCount = tab.measures.reduce((a, m) => a + m.columns.length, 0);

  // Live playback: arpeggios as eighth notes with the click, like a practice routine.
  const player = useTabPlayer(tab, { defaultBpm: 80, defaultNoteValue: 8, defaultClick: "beat" });
  const activeNotes = player.position !== null ? player.columns[player.position]?.notes ?? [] : [];

  // The chord under the playhead (progressions): drives the fretboard and the chord cards.
  const currentStep = useMemo(() => {
    const pos = player.position;
    if (pos === null) return steps[0];
    return [...steps].reverse().find((s) => pos >= s.firstColumn) ?? steps[0];
  }, [player.position, steps]);
  const shownChord = currentStep.chord;
  const shownPos = currentStep.position;

  // New key / chord set: keep the selection valid.
  useEffect(() => {
    if (selection.kind === "chord" && selection.degree >= chords.length) setSelection({ kind: "chord", degree: 0 });
  }, [chords.length, selection]);

  const setPosition = (p: number) => {
    setPositionMode("custom");
    setCustomPosition(Math.max(0, Math.min(20, p)));
  };

  const copyAscii = async () => {
    try {
      await navigator.clipboard.writeText(`${tab.title}\n\n${tabToAscii(tab)}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard not available */
    }
  };

  const strumChord = (chord: DiatonicChord) => {
    // Strum the chord tones of this degree, in the hand position, so you hear the chord the arpeggio outlines.
    const pos = buildArpeggioPosition(tuning, rootPc, scaleKey, chord, position);
    const run = pos.run.slice(0, sevenths ? 4 : 3);
    void getGuitarSynth().playStrum(run.map((n) => ({ midi: n.midi, stringIndex: n.string })), { channel: "preview", velocity: 0.9 });
  };

  const fingerExample = useMemo(() => {
    const n = shownPos.run.find((x) => x.role === "root" && x.fret > 0) ?? shownPos.run.find((x) => x.fret > 0);
    if (!n || !n.finger) return null;
    return { label: labelMode === "intervals" ? n.degree : n.noteName ?? "", noteName: n.noteName, finger: n.finger, role: n.role };
  }, [shownPos, labelMode]);

  const legendItems = shownChord.intervals.map((i) => ({
    color: ROLE_COLORS[roleForChordInterval(i)],
    label: `${chordDegreeLabel(shownChord.chordKey, i)} · ${intervalNameForLabel(chordDegreeLabel(shownChord.chordKey, i))}`,
  }));

  const fretCount = Math.max(12, highFret);
  // Major-ish keys (major 3rd above the root) get the major progressions, the rest the minor ones.
  const feel = scale.intervals.includes(4) && !scale.intervals.includes(3) ? "major" : "minor";

  return (
    <div className="flex flex-col gap-5">
      {/* Choices */}
      <Panel>
        <div className="pt-5 grid grid-cols-1 xl:grid-cols-[auto_1fr] gap-x-10 gap-y-6">
          <div>
            <StepHeading step={2} title="Choose a key" hint="the scale the chords are built from" />
            <RootPicker value={rootPc} onChange={setRootPc} />
          </div>
          <div>
            <StepHeading step={3} title="Key flavour" />
            <div className="flex flex-col gap-2">
              {KEY_FLAVOURS.map((group) => (
                <div key={group.label} className="flex flex-wrap items-center gap-2">
                  <span className="w-24 shrink-0 text-[11px] uppercase tracking-wider text-bark-400 font-bold">{group.label}</span>
                  {group.keys
                    .filter((k) => arpeggioScaleKeys().includes(k))
                    .map((k) => (
                      <Chip key={k} active={scaleKey === k} onClick={() => setScaleKey(k)} tone="honey" title={SCALES[k].description}>
                        {SCALES[k].name}
                      </Chip>
                    ))}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Chords of the key */}
        <div className="mt-6 pt-5 border-t border-bark-100">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <StepHeading step={4} title={`Chords in ${keyName}`} hint="pick one to arpeggiate, or a progression below" />
            <Segmented<"triads" | "sevenths">
              value={sevenths ? "sevenths" : "triads"}
              onChange={(v) => setSevenths(v === "sevenths")}
              options={[
                { value: "triads", label: "Triads", title: "Three-note chords: root, 3rd, 5th" },
                { value: "sevenths", label: "7th chords", title: "Four-note chords: root, 3rd, 5th, 7th" },
              ]}
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {chords.map((chord) => {
              const active = selection.kind === "chord" && selection.degree === chord.degree;
              const playingThis = selection.kind === "progression" && shownChord.degree === chord.degree && player.state === "playing";
              return (
                <button
                  key={chord.degree}
                  type="button"
                  onClick={() => {
                    setSelection({ kind: "chord", degree: chord.degree });
                    strumChord(chord);
                  }}
                  aria-pressed={active}
                  title={`${chord.name}: ${chord.noteNames.join(" ")} — click to hear it and see its arpeggio`}
                  className={`cursor-pointer flex flex-col items-center rounded-2xl border-2 px-2 py-2.5 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-honey-400 ${
                    active
                      ? "border-honey-400 bg-honey-100 shadow-card"
                      : playingThis
                        ? "border-honey-300 bg-honey-100/60"
                        : "border-bark-100 bg-cream-100 hover:border-bark-300 hover:bg-cream-200"
                  }`}
                >
                  <span className="font-display text-lg text-bark-800 leading-none">{chord.numeral}</span>
                  <span className="text-sm font-bold text-bark-700 mt-1">{chord.symbol}</span>
                  <span className="flex gap-1 mt-1.5">
                    {chord.noteNames.map((n, i) => (
                      <span key={i} className="text-[11px] font-bold" style={{ color: ROLE_COLORS[roleForChordInterval(chord.intervals[i])] }}>
                        {n}
                      </span>
                    ))}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="w-24 shrink-0 text-[11px] uppercase tracking-wider text-bark-400 font-bold">Progressions</span>
            {PROGRESSIONS.filter((p) => p.feel === "any" || p.feel === feel).map((p) => (
              <Chip
                key={p.key}
                active={selection.kind === "progression" && selection.key === p.key}
                onClick={() => setSelection({ kind: "progression", key: p.key })}
                tone="rust"
                title={`${p.description} Here: ${p.degrees.map((d) => chords[d]?.symbol).join(" – ")}`}
              >
                {p.name}
              </Chip>
            ))}
          </div>
        </div>

        {/* Position and shape of the run */}
        <div className="mt-6 pt-5 border-t border-bark-100 flex flex-col lg:flex-row lg:items-end gap-5">
          <div>
            <StepHeading step={5} title="Where on the neck?" hint={`a hand position is ${POSITION_SPAN + 1} frets`} />
            <div className="flex flex-wrap items-center gap-2">
              <Chip size="lg" active={positionMode === "open"} onClick={() => setPositionMode("open")} title="Frets 0–4, using the open strings">
                Open position
              </Chip>
              <Chip size="lg" active={positionMode === "rootBox"} onClick={() => setPositionMode("rootBox")} title="A box with the root on the lowest string">
                Root box
              </Chip>
              <div className="inline-flex items-center rounded-full border border-bark-200 bg-cream-200 overflow-hidden ml-1">
                <button type="button" onClick={() => setPosition(position - 1)} className="cursor-pointer px-3.5 py-2 text-base font-bold text-bark-700 hover:bg-cream-300" aria-label="Move position down">
                  −
                </button>
                <span className="px-3 py-2 text-sm font-semibold text-bark-800 bg-cream-50 border-x border-bark-200 tabular-nums whitespace-nowrap">
                  {lowFret === 0 ? "open" : `fret ${lowFret}`} → {highFret}
                </span>
                <button type="button" onClick={() => setPosition(position + 1)} className="cursor-pointer px-3.5 py-2 text-base font-bold text-bark-700 hover:bg-cream-300" aria-label="Move position up">
                  +
                </button>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3 lg:ml-auto">
            <Segmented<"octave" | "full">
              value={range}
              onChange={setRange}
              options={[
                { value: "octave", label: "Root to root", title: "From the lowest root to the highest root under your hand (several octaves on a 7- or 8-string)" },
                { value: "full", label: "Whole position", title: "Every chord tone under the hand, from the lowest root" },
              ]}
            />
            {selection.kind === "progression" ? (
              <div className="flex items-center gap-2 text-[13px] font-medium text-bark-600">
                <span>Notes per chord</span>
                <Segmented<"4" | "8" | "16" | "all">
                  value={notesPerChord}
                  onChange={setNotesPerChord}
                  options={[
                    { value: "4", label: "4", title: "Four notes per chord (half a bar of eighths)" },
                    { value: "8", label: "8", title: "Eight notes per chord (a bar of eighths)" },
                    { value: "16", label: "16", title: "Sixteen notes per chord" },
                    { value: "all", label: "All", title: "The whole run up and back down, however many octaves it spans" },
                  ]}
                />
              </div>
            ) : (
              <Toggle checked={descend} onChange={setDescend} label="Up & back down" />
            )}
            <Toggle checked={showFingering} onChange={setShowFingering} label="Show fingers" />
          </div>
        </div>
      </Panel>

      {/* Tablature */}
      <Panel
        title={
          progression ? (
            <>
              {progressionChords.map((c) => c.numeral).join(" – ")} in {keyName} <span className="text-bark-400 font-body text-base">· {positionLabel}</span>
            </>
          ) : (
            <>
              {selectedChord.symbol} arpeggio <span className="text-bark-400 font-body text-base">· {selectedChord.numeral} of {keyName} · {positionLabel}</span>
            </>
          )
        }
        subtitle={
          progression
            ? `${progression.description} ${progressionChords.map((c) => c.symbol).join(" – ")} · ${noteCount} notes, ${notesPerChord === "all" ? "the whole run up and down" : `${notesPerChord}`} per chord.`
            : `${selectedChord.name}: ${selectedChord.noteNames.join(" – ")}. ${selectedChord.description}`
        }
        actions={<GhostButton onClick={copyAscii}>{copied ? "Copied!" : "Copy as text tab"}</GhostButton>}
      >
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3 mb-4">
          <div className="flex flex-wrap gap-1.5">
            {shownChord.noteNames.map((n, i) => {
              const interval = shownChord.intervals[i];
              const label = chordDegreeLabel(shownChord.chordKey, interval);
              return (
                <div key={i} className="flex flex-col items-center w-12 rounded-xl bg-cream-200 border border-bark-100 py-1.5" title={intervalNameForLabel(label)}>
                  <span className="font-display text-lg leading-none" style={{ color: ROLE_COLORS[roleForChordInterval(interval)] }}>{n}</span>
                  <span className="text-[10px] text-bark-400 font-bold mt-1">{label}</span>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-bark-500">
            {progression ? (
              <>
                Now: <span className="font-bold text-bark-800">{shownChord.numeral} {shownChord.symbol}</span> — the chord tones above change as the progression plays.
              </>
            ) : (
              <>
                An arpeggio is the chord played one note at a time: these {shownChord.noteNames.length} notes, in order, up the neck.
              </>
            )}
          </p>
        </div>
        <TabPlayer player={player} unit="note" className="mb-3" />
        <div className="overflow-x-auto rounded-xl border border-bark-100 bg-cream-50">
          <Tablature tab={tab} measuresPerLine={progression ? 2 : 2} showFingering={showFingering} activeColumn={player.position} onColumnClick={player.seek} />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <Legend items={legendItems} />
          <span className="text-xs text-bark-400">
            Press play to hear it with the click · click any note to hear it
            {showFingering && <> · Fingers: 0 open · 1 index · 2 middle · 3 ring · 4 pinky</>}
          </span>
        </div>
      </Panel>

      {/* Fretboard map */}
      <Panel
        title="On the fretboard"
        subtitle={`${shownChord.symbol} tones${showScaleTones ? ` inside ${keyName}` : ""}. Bright notes are the arpeggio under your hand; ${showScaleTones ? "hollow grey notes are the other scale tones" : "faded notes are chord tones elsewhere"}.`}
        actions={
          <>
            <Segmented<"notes" | "intervals">
              value={labelMode}
              onChange={setLabelMode}
              options={[
                { value: "notes", label: "Note names" },
                { value: "intervals", label: "Intervals", title: "Show each note as its distance from the chord root (1, 3, 5, 7)" },
              ]}
            />
            <Toggle checked={showScaleTones} onChange={setShowScaleTones} label="Scale tones" />
            <Toggle checked={showWholeNeck} onChange={setShowWholeNeck} label="Whole neck" />
          </>
        }
      >
        <div className="overflow-x-auto">
          <Fretboard
            tuning={tuning}
            fretCount={fretCount}
            positionWindow={{ from: lowFret, to: highFret }}
            activeNotes={activeNotes}
            activeKey={player.position ?? undefined}
            onNoteClick={(s, fret, midi) => void getGuitarSynth().playNote(midi, { stringIndex: s, channel: "fretboard" })}
            getHighlight={(s, fret, midi) => {
              const pc = midiToPitchClass(midi);
              const inWindow = fret >= lowFret && fret <= highFret;
              const chordTone = shownChord.pcs.includes(pc);
              if (!chordTone) {
                if (!showScaleTones || !scalePcs.includes(pc) || (!inWindow && !showWholeNeck)) return null;
                const keyInterval = intervalFromRoot(rootPc, pc);
                return {
                  role: "scale",
                  label: labelMode === "intervals" ? scaleDegreeLabel(scaleKey, keyInterval) : spellScaleTone(rootPc, scaleKey, keyInterval),
                  title: `${spellScaleTone(rootPc, scaleKey, keyInterval)} · scale tone (${scaleDegreeLabel(scaleKey, keyInterval)} of ${keyName}), not in ${shownChord.symbol}`,
                  faint: true,
                };
              }
              if (!inWindow && !showWholeNeck) return null;
              const interval = intervalFromRoot(shownChord.rootPc, pc);
              const label = chordDegreeLabel(shownChord.chordKey, interval);
              const avail = inWindow ? shownPos.available.find((n) => n.string === s && n.fret === fret) : undefined;
              return {
                role: roleForChordInterval(interval),
                label: labelMode === "intervals" ? label : spellScaleTone(rootPc, scaleKey, intervalFromRoot(rootPc, pc)),
                title: `${spellScaleTone(rootPc, scaleKey, intervalFromRoot(rootPc, pc))} · ${label} (${intervalNameForLabel(label)}) of ${shownChord.symbol}`,
                faint: !inWindow,
                badge: showFingering && avail && avail.finger ? avail.finger : undefined,
              };
            }}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {showFingering ? (
            <FingerBadgeKey example={fingerExample} />
          ) : (
            <span className="text-xs text-bark-400">Finger numbers are hidden — turn on “Show fingers” above to see them.</span>
          )}
          <Legend items={[...legendItems, ...(showScaleTones ? [{ color: ROLE_COLORS.scale, label: "Other scale tone" }] : [])]} />
        </div>
        <p className="mt-3 text-xs text-bark-400">
          Arpeggios and scales share the same notes: the arpeggio is the scale with the “in-between” notes left out. Play the arpeggio over its chord and every note lands safely.
        </p>
      </Panel>
    </div>
  );
}
