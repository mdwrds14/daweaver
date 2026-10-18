"use client";

import React, { useState } from "react";
import { TUNINGS } from "@/utils/tunings";
import TuningSelector from "./TuningSelector";
import ScaleLab from "./ScaleLab";
import ChordLab from "./ChordLab";
import ArpeggioLab from "./ArpeggioLab";

type Mode = "scales" | "chords" | "arpeggios";

export default function GuitarLab() {
  const [tuningKey, setTuningKey] = useState<string>("standard");
  const [mode, setMode] = useState<Mode>("scales");
  const tuning = TUNINGS[tuningKey] ?? TUNINGS.standard;

  return (
    <div className="max-w-7xl mx-auto flex flex-col gap-5">
      {/* Wooden header */}
      <header className="wood rounded-2xl shadow-card text-cream-50 px-6 py-5 sm:px-8 sm:py-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl leading-tight">Guitar Tuning &amp; Theory Lab</h1>
          <p className="text-sm text-cream-300/90 mt-1 max-w-xl">
            Pick a tuning (6, 7 or 8 strings), then see scales, chords and arpeggios as easy-to-read tab and press play to hear them. Everything is worked out for the tuning you choose.
          </p>
        </div>
        <nav className="inline-flex rounded-full bg-black/25 p-1 self-start sm:self-auto shadow-inset" aria-label="What to explore">
          {(
            [
              { key: "scales", label: "Scales" },
              { key: "chords", label: "Chords" },
              { key: "arpeggios", label: "Arpeggios" },
            ] as { key: Mode; label: string }[]
          ).map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMode(m.key)}
              aria-pressed={mode === m.key}
              className={`cursor-pointer px-5 py-2 text-sm font-bold rounded-full transition-colors ${
                mode === m.key ? "bg-honey-400 text-bark-900 shadow-chip" : "text-cream-200 hover:text-white"
              }`}
            >
              {m.label}
            </button>
          ))}
        </nav>
      </header>

      <TuningSelector value={tuningKey} onChange={setTuningKey} />

      {mode === "scales" ? <ScaleLab tuning={tuning} /> : mode === "chords" ? <ChordLab tuning={tuning} /> : <ArpeggioLab tuning={tuning} />}

      <footer className="px-2 pb-4 text-xs text-bark-400">
        How to read tab: the top line is the thinnest (highest) string, numbers are frets, 0 is an open string, × means don&apos;t play that string.
        Sound is synthesised in your browser (a plucked-string model), so nothing needs to be downloaded.
      </footer>
    </div>
  );
}
