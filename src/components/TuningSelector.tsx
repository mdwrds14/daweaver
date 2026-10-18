"use client";

import React from "react";
import {
  TUNINGS,
  TUNING_CATEGORIES,
  STRING_COUNTS,
  STANDARD_TUNING_KEY,
  StringCount,
  tuningMidi,
  tuningKeysForStrings,
  standardTuningFor,
  stringCountOf,
} from "@/utils/tunings";
import { getNoteName, midiToOctave } from "@/utils/theoryEngine";
import { getGuitarSynth } from "@/utils/audio/synth";
import { Chip, StepHeading, Panel } from "./ui";

const CATEGORY_HINTS: Record<string, string> = {
  Standard: "the familiar shapes",
  Drop: "low string lowered",
  Open: "open strings make a chord",
  Other: "experimental",
};

const STRING_COUNT_HINTS: Record<StringCount, string> = {
  6: "the regular guitar",
  7: "one extra low string (B)",
  8: "two extra low strings (F#, B) — deep metal territory",
};

export default function TuningSelector({ value, onChange }: { value: string; onChange: (key: string) => void }) {
  const tuning = TUNINGS[value] ?? TUNINGS.standard;
  const strings = stringCountOf(tuning);
  const midi = tuningMidi(tuning);
  const standard = tuningMidi(standardTuningFor(tuning));

  const chooseStringCount = (count: StringCount) => {
    if (count === strings) return;
    onChange(STANDARD_TUNING_KEY[count]);
  };

  const playOpenString = (i: number) => {
    void getGuitarSynth().playNote(midi[i], { stringIndex: i, channel: "pegs" });
  };

  const playAllOpen = () => {
    void getGuitarSynth().playStrum(
      midi.map((m, i) => ({ midi: m, stringIndex: i })),
      { channel: "pegs", spacing: 0.09, velocity: 0.9 },
    );
  };

  return (
    <Panel>
      <div className="pt-5">
        <StepHeading step={1} title="Pick a tuning" hint="everything below is recalculated for it" />
      </div>

      {/* How many strings? */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="w-24 shrink-0 text-[11px] uppercase tracking-wider text-bark-400 font-bold">Strings</span>
        {STRING_COUNTS.map((count) => (
          <Chip key={count} active={strings === count} onClick={() => chooseStringCount(count)} tone="rust" title={STRING_COUNT_HINTS[count]}>
            {count}-string
          </Chip>
        ))}
        <span className="text-xs text-bark-400 ml-1">{STRING_COUNT_HINTS[strings as StringCount]}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6">
        <div className="flex flex-col gap-2.5">
          {TUNING_CATEGORIES.map((category) => {
            const keys = tuningKeysForStrings(strings).filter((k) => TUNINGS[k].category === category);
            if (keys.length === 0) return null;
            return (
              <div key={category} className="flex flex-wrap items-center gap-2">
                <span className="w-24 shrink-0 text-[11px] uppercase tracking-wider text-bark-400 font-bold" title={CATEGORY_HINTS[category]}>
                  {category}
                </span>
                {keys.map((key) => (
                  <Chip key={key} active={value === key} onClick={() => onChange(key)} title={TUNINGS[key].notes.map(getNoteName).join(" ")}>
                    {TUNINGS[key].name}
                  </Chip>
                ))}
              </div>
            );
          })}
        </div>

        {/* Open strings as tuning pegs (click one to hear it) */}
        <div className="flex flex-col gap-2 lg:items-end">
          <div className={`flex items-end ${strings > 6 ? "gap-1 sm:gap-1.5" : "gap-1.5"}`}>
            {midi.map((m, i) => {
              const diff = m - standard[i];
              const name = getNoteName(tuning.notes[i]);
              return (
                <div key={i} className="flex flex-col items-center gap-1">
                  <span className={`text-[10px] font-bold h-3 ${diff === 0 ? "text-bark-300" : diff < 0 ? "text-lake-500" : "text-rust-500"}`}>
                    {diff === 0 ? "" : diff > 0 ? `+${diff}` : diff}
                  </span>
                  <button
                    type="button"
                    onClick={() => playOpenString(i)}
                    title={`Hear the open ${name}${midiToOctave(m)} string`}
                    aria-label={`Play open string ${strings - i}: ${name}${midiToOctave(m)}`}
                    className={`cursor-pointer ${strings > 6 ? "w-9 sm:w-11" : "w-11"} h-12 rounded-xl bg-cream-200 border border-bark-200 shadow-chip flex flex-col items-center justify-center hover:bg-honey-100 hover:border-honey-400 active:translate-y-px transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-honey-400`}
                  >
                    <span className="font-display text-lg text-bark-800 leading-none">{name}</span>
                    <span className="text-[10px] text-bark-400 leading-none mt-1">{midiToOctave(m)}</span>
                  </button>
                  <span className="text-[10px] text-bark-400">{strings - i}</span>
                </div>
              );
            })}
          </div>
          <span className="text-[11px] text-bark-400 flex items-center gap-2">
            strings {strings} → 1 · coloured numbers = semitones from {standardTuningFor(tuning).name}
            <button type="button" onClick={playAllOpen} className="cursor-pointer font-semibold text-bark-600 hover:text-bark-900 underline decoration-dotted underline-offset-2">
              ♪ strum open strings
            </button>
          </span>
        </div>
      </div>
      <p className="mt-4 text-sm text-bark-600 leading-relaxed border-t border-bark-100 pt-3">
        <span className="font-display text-base text-bark-800">{tuning.name}{strings > 6 ? ` (${strings}-string)` : ""}.</span> {tuning.description}
      </p>
    </Panel>
  );
}
