"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Tuning, tuningMidi } from "@/utils/tunings";
import {
  CHORDS,
  getChordNotes,
  getChordSymbol,
  getChordPitchClasses,
  midiToPitchClass,
  pcToName,
  preferFlatsForChord,
  intervalFromRoot,
  chordDegreeLabel,
  intervalNameForLabel,
  spellChordTone,
} from "@/utils/theoryEngine";
import { findChordVoicings, voicingToString, voicingsToTab, voicingMidiNotes, ChordVoicing } from "@/utils/chordVoicings";
import { tabToAscii, NoteRole } from "@/utils/tab";
import { getGuitarSynth } from "@/utils/audio/synth";
import { useTabPlayer } from "@/hooks/useTabPlayer";
import Tablature, { ROLE_COLORS } from "./Tablature";
import TabPlayer from "./TabPlayer";
import ChordDiagram from "./ChordDiagram";
import Fretboard, { FingerBadgeKey } from "./Fretboard";
import RootPicker from "./RootPicker";
import { Chip, StepHeading, Panel, Toggle, Legend, GhostButton, Segmented } from "./ui";

function roleForInterval(interval: number): NoteRole {
  switch (interval) {
    case 0: return "root";
    case 2: case 3: case 4: case 5: return "third";
    case 6: case 7: case 8: return "fifth";
    case 10: case 11: return "seventh";
    default: return "other";
  }
}

const TAG_STYLES: Record<string, string> = {
  "Open chord": "bg-sage-100 text-sage-600",
  "All open": "bg-sage-100 text-sage-600",
  Barre: "bg-plum-100 text-plum-600",
  "Movable shape": "bg-lake-100 text-lake-600",
  "Open string": "bg-honey-100 text-honey-600",
  Inversion: "bg-cream-300 text-bark-600",
};

function Tag({ children }: { children: string }) {
  return <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${TAG_STYLES[children] ?? "bg-cream-300 text-bark-600"}`}>{children}</span>;
}

export default function ChordLab({ tuning }: { tuning: Tuning }) {
  const [rootPc, setRootPc] = useState(0);
  const [chordKey, setChordKey] = useState("major");
  const [selected, setSelected] = useState(0);
  const [showAllTones, setShowAllTones] = useState(true);
  const [labelMode, setLabelMode] = useState<"notes" | "intervals">("notes");
  const [copied, setCopied] = useState(false);

  const chord = CHORDS[chordKey];
  const flats = preferFlatsForChord(rootPc, chordKey);
  const symbol = getChordSymbol(rootPc, chordKey);
  const notes = getChordNotes(rootPc, chordKey);
  const chordPcs = useMemo(() => getChordPitchClasses(rootPc, chordKey), [rootPc, chordKey]);

  const voicings = useMemo(() => findChordVoicings(tuning, rootPc, chordKey, { maxResults: 6 }), [tuning, rootPc, chordKey]);
  const current: ChordVoicing | undefined = voicings[Math.min(selected, voicings.length - 1)];

  // New chord / tuning: back to the easiest shape, unless the player is mid-way through the
  // new set, in which case the card under the playhead stays selected.
  const playheadRef = useRef<number | null>(null);
  useEffect(() => {
    const pos = playheadRef.current;
    setSelected(pos !== null ? Math.min(pos, Math.max(0, voicings.length - 1)) : 0);
  }, [tuning, rootPc, chordKey, voicings.length]);

  const tab = useMemo(() => {
    const data = voicingsToTab(tuning, voicings, symbol);
    data.title = `${symbol} voicings — ${tuning.name} tuning`;
    return data;
  }, [tuning, voicings, symbol]);

  // Live playback: each voicing is strummed and rings for two quarter notes (a half note at 80 bpm).
  const player = useTabPlayer(tab, { defaultBpm: 80, defaultNoteValue: 4 });
  const playing = player.state === "playing";
  // While the player walks through the shapes, the cards / fretboard follow along.
  useEffect(() => {
    playheadRef.current = playing ? player.position : null;
    if (playing && player.position !== null) setSelected(player.position);
  }, [playing, player.position]);

  /** Strum a shape right away (used by the cards, the chart and the "Hear it" button). */
  const strum = (v: ChordVoicing | undefined) => {
    if (!v) return;
    void getGuitarSynth().playStrum(voicingMidiNotes(tuning, v), { channel: "preview", velocity: 0.9 });
  };
  const chooseVoicing = (i: number) => {
    setSelected(i);
    // Move the playhead there; when not playing, that also strums the shape.
    player.seek(i, !playing);
  };
  const stringCount = tuning.notes.length;

  // "Basic chord chart": easiest voicing of the selected chord type for all 12 roots.
  const chart = useMemo(
    () =>
      Array.from({ length: 12 }).map((_, pc) => ({
        pc,
        symbol: getChordSymbol(pc, chordKey),
        voicing: findChordVoicings(tuning, pc, chordKey, { maxResults: 1 })[0],
      })),
    [tuning, chordKey],
  );

  const copyAscii = async () => {
    try {
      await navigator.clipboard.writeText(`${tab.title}\n\n${tabToAscii(tab)}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard not available */
    }
  };

  const legendItems = chord.intervals.map((i) => ({
    color: ROLE_COLORS[roleForInterval(i)],
    label: `${chordDegreeLabel(chordKey, i)} · ${intervalNameForLabel(chordDegreeLabel(chordKey, i))}`,
  }));

  const maxFretInVoicing = current ? Math.max(0, ...(current.frets.filter((f) => f !== null) as number[])) : 0;

  // Example for the finger key: the root you fret in this shape (or its first fretted note).
  const fingerExample = useMemo(() => {
    if (!current) return null;
    const fretted = current.frets.map((f, s) => s).filter((s) => (current.frets[s] ?? 0) > 0);
    const string = fretted.find((s) => current.roles[s] === "root") ?? fretted[0];
    if (string === undefined || !current.fingers[string]) return null;
    const interval = intervalFromRoot(rootPc, midiToPitchClass(tuningMidi(tuning)[string] + (current.frets[string] as number)));
    return {
      label: labelMode === "intervals" ? chordDegreeLabel(chordKey, interval) : current.noteNames[string] ?? "",
      noteName: current.noteNames[string] ?? undefined,
      finger: current.fingers[string] as number,
      role: current.roles[string] ?? undefined,
    };
  }, [current, rootPc, chordKey, tuning, labelMode]);

  return (
    <div className="flex flex-col gap-5">
      {/* Choices */}
      <Panel>
        <div className="pt-5 grid grid-cols-1 xl:grid-cols-[auto_1fr] gap-x-10 gap-y-6">
          <div>
            <StepHeading step={2} title="Choose a root" hint="the note the chord is named after" />
            <RootPicker value={rootPc} onChange={setRootPc} />
          </div>
          <div>
            <StepHeading step={3} title="Choose a chord type" />
            <div className="flex flex-wrap gap-2">
              {Object.keys(CHORDS).map((k) => (
                <Chip key={k} active={chordKey === k} onClick={() => setChordKey(k)} tone="honey" title={CHORDS[k].description}>
                  {CHORDS[k].name} <span className="opacity-60 font-normal">{pcToName(rootPc, flats)}{CHORDS[k].suffix}</span>
                </Chip>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-5 pt-4 border-t border-bark-100 flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-2">
            <span className="font-display text-2xl text-bark-800">{symbol}</span>
            <span className="text-sm text-bark-500">{chord.name} — {chord.description}</span>
          </div>
          <div className="flex gap-1.5">
            {notes.map((n, i) => {
              const interval = chord.intervals[i];
              return (
                <div key={i} className="flex flex-col items-center w-12 rounded-xl bg-cream-200 border border-bark-100 py-1.5" title={intervalNameForLabel(chordDegreeLabel(chordKey, interval))}>
                  <span className="font-display text-lg leading-none" style={{ color: ROLE_COLORS[roleForInterval(interval)] }}>{n}</span>
                  <span className="text-[10px] text-bark-400 font-bold mt-1">{chordDegreeLabel(chordKey, interval)}</span>
                </div>
              );
            })}
          </div>
          {chord.optional.length > 0 && (
            <span className="text-xs text-bark-400">
              The {chord.optional.map((i) => intervalNameForLabel(chordDegreeLabel(chordKey, i)).toLowerCase()).join(", ")} can be left out without losing the chord&apos;s character.
            </span>
          )}
        </div>
      </Panel>

      {/* Voicing cards */}
      <Panel title={`Ways to play ${symbol}`} subtitle="Easiest first. Click a shape to hear it strummed and see it on the fretboard below.">
        {voicings.length === 0 ? (
          <p className="text-sm text-bark-500">No playable shape found within a 4-fret stretch in this tuning.</p>
        ) : (
          <div className={`grid grid-cols-2 sm:grid-cols-3 gap-3 ${stringCount > 6 ? "lg:grid-cols-4 2xl:grid-cols-6" : "lg:grid-cols-6"}`}>
            {voicings.map((v, i) => (
              <button
                key={i}
                type="button"
                onClick={() => chooseVoicing(i)}
                title="Click to hear this shape"
                aria-pressed={i === selected}
                className={`cursor-pointer group flex flex-col items-center rounded-2xl border-2 p-3 transition-all text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-honey-400 ${
                  i === selected ? "border-honey-400 bg-honey-100 shadow-card" : "border-bark-100 bg-cream-100 hover:border-bark-300 hover:bg-cream-200"
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <span className="font-display text-base text-bark-800">{i === 0 ? "Easiest" : `#${i + 1}`}</span>
                  {v.tags[0] && <Tag>{v.tags[0]}</Tag>}
                </div>
                <ChordDiagram voicing={v} tuning={tuning.notes} width={130} />
                <code className="mt-1.5 text-[13px] font-bold text-bark-700 tracking-[0.25em]">{voicingToString(v)}</code>
                {v.tags.includes("Inversion") && (
                  <span className="mt-1 text-[10px] text-bark-400">
                    bass note is the {intervalNameForLabel(chordDegreeLabel(chordKey, v.bassInterval)).toLowerCase()} ({symbol}/{spellChordTone(rootPc, chordKey, v.bassInterval)})
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        <div className="mt-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <h3 className="font-display text-lg text-bark-800">The same shapes as tablature</h3>
            <GhostButton onClick={copyAscii}>{copied ? "Copied!" : "Copy as text tab"}</GhostButton>
          </div>
          <TabPlayer player={player} unit="chord" className="mb-3" />
          <div className="overflow-x-auto rounded-xl border border-bark-100 bg-cream-50">
            <Tablature tab={tab} measuresPerLine={6} showFingering={false} activeColumn={player.position} onColumnClick={(i) => { player.seek(i); setSelected(i); }} />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <Legend items={legendItems} />
            <span className="text-xs text-bark-400">Numbers stacked in one column are strummed together · × means don&apos;t play that string · click a column to hear it</span>
          </div>
        </div>
      </Panel>

      {/* Fretboard map */}
      {current && (
        <Panel
          title="On the fretboard"
          subtitle={`Shape ${selected === 0 ? "“Easiest”" : `#${selected + 1}`} (${voicingToString(current)}). Bright notes with a black bubble are the ones you fret; faded notes are other places you could find the same chord tones.`}
          actions={
            <>
              <GhostButton onClick={() => strum(current)} title="Strum this shape">
                ♪ Hear it
              </GhostButton>
              <Segmented<"notes" | "intervals">
                value={labelMode}
                onChange={setLabelMode}
                options={[
                  { value: "notes", label: "Note names" },
                  { value: "intervals", label: "Intervals", title: "Show each note as its distance from the root (1, 3, 5, b7...)" },
                ]}
              />
              <Toggle checked={showAllTones} onChange={setShowAllTones} label="All chord tones" />
            </>
          }
        >
          <div className="overflow-x-auto">
            <Fretboard
              tuning={tuning}
              fretCount={Math.max(12, maxFretInVoicing)}
              mutedStrings={current.frets.map((f, s) => (f === null ? s : -1)).filter((s) => s >= 0)}
              activeNotes={playing && player.position === selected ? current.frets.map((f, s) => ({ string: s, fret: f ?? -1 })).filter((n) => n.fret >= 0) : []}
              activeKey={player.position ?? undefined}
              onNoteClick={(s, fret, midi) => void getGuitarSynth().playNote(midi, { stringIndex: s, channel: "fretboard" })}
              getHighlight={(s, fret, midi) => {
                const pc = midiToPitchClass(midi);
                const inVoicing = current.frets[s] === fret;
                if (!inVoicing && (!showAllTones || !chordPcs.includes(pc))) return null;
                const interval = intervalFromRoot(rootPc, pc);
                return {
                  role: roleForInterval(interval),
                  label: labelMode === "intervals" ? chordDegreeLabel(chordKey, interval) : spellChordTone(rootPc, chordKey, interval),
                  title: `${spellChordTone(rootPc, chordKey, interval)} · ${chordDegreeLabel(chordKey, interval)} (${intervalNameForLabel(chordDegreeLabel(chordKey, interval))})`,
                  faint: !inVoicing,
                  badge: inVoicing && current.fingers[s] ? current.fingers[s]! : undefined,
                };
              }}
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <FingerBadgeKey example={fingerExample} />
            <Legend items={legendItems} />
          </div>
        </Panel>
      )}

      {/* Chord chart for the tuning */}
      <Panel
        title={`${chord.name} chords in ${tuning.name} tuning`}
        subtitle="The easiest shape for every root. Click one to hear it and explore its alternatives."
      >
        <div className={`grid grid-cols-3 sm:grid-cols-4 gap-3 ${stringCount > 6 ? "lg:grid-cols-4 xl:grid-cols-6" : "lg:grid-cols-6"}`}>
          {chart.map(({ pc, symbol: sym, voicing }) => (
            <button
              key={pc}
              type="button"
              onClick={() => {
                setRootPc(pc);
                if (!playing) strum(voicing);
              }}
              title={voicing ? `Click to hear ${sym}` : undefined}
              aria-pressed={pc === rootPc}
              className={`cursor-pointer flex flex-col items-center rounded-2xl border-2 p-2 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-honey-400 ${
                pc === rootPc ? "border-honey-400 bg-honey-100 shadow-card" : "border-bark-100 bg-cream-100 hover:border-bark-300 hover:bg-cream-200"
              }`}
            >
              <span className="font-display text-base text-bark-800 mb-0.5">{sym}</span>
              {voicing ? (
                <>
                  <ChordDiagram voicing={voicing} tuning={tuning.notes} width={104} showNoteNames={false} />
                  <code className="text-[11px] font-bold text-bark-500 tracking-[0.15em] mt-1 whitespace-nowrap">{voicingToString(voicing)}</code>
                </>
              ) : (
                <span className="text-xs text-bark-400">n/a</span>
              )}
            </button>
          ))}
        </div>
        <p className="mt-4 text-xs text-bark-400">
          Dots show which finger to use (1 index · 2 middle · 3 ring · 4 pinky). A dark bar means one finger lies flat across several strings (a barre).
          Colours: <span style={{ color: ROLE_COLORS.root }} className="font-bold">root</span> · <span style={{ color: ROLE_COLORS.third }} className="font-bold">3rd</span> ·{" "}
          <span style={{ color: ROLE_COLORS.fifth }} className="font-bold">5th</span> · <span style={{ color: ROLE_COLORS.seventh }} className="font-bold">7th</span>.
        </p>
      </Panel>
    </div>
  );
}
