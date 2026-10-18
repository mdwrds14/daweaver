"use client";

import React from "react";
import { TabPlayerControls } from "@/hooks/useTabPlayer";
import { MIN_BPM, MAX_BPM, BEATS_PER_BAR, NoteValue, ClickMode, BeatInfo } from "@/utils/audio/player";
import { Toggle, Segmented } from "./ui";

const NOTE_VALUE_OPTIONS: { value: "4" | "8" | "16"; label: string; title: string }[] = [
  { value: "4", label: "♩ quarter", title: "One note per click" },
  { value: "8", label: "♪ eighth", title: "Two notes per click" },
  { value: "16", label: "♬ 16th", title: "Four notes per click" },
];

const CLICK_OPTIONS: { value: ClickMode; label: string; title: string }[] = [
  { value: "off", label: "Off", title: "No metronome" },
  { value: "beat", label: "Beat", title: "Click on every beat (quarter note), accented on 1" },
  { value: "subdivided", label: "Subdivided", title: "Beat clicks plus a softer tick on every note value" },
];

/** Four dots that light up with the beat; the downbeat is bigger. */
function BeatDots({ beat, playing }: { beat: BeatInfo | null; playing: boolean }) {
  return (
    <div className="flex items-center gap-1.5" aria-hidden="true">
      {Array.from({ length: BEATS_PER_BAR }).map((_, i) => {
        const lit = playing && beat !== null && beat.beat === i + 1;
        return (
          <span
            key={i}
            className={`rounded-full transition-all duration-75 ${i === 0 ? "w-3.5 h-3.5" : "w-2.5 h-2.5"} ${
              lit ? (beat?.countIn ? "bg-rust-500 shadow-chip scale-125" : "bg-honey-500 shadow-chip scale-125") : "bg-bark-200"
            }`}
          />
        );
      })}
    </div>
  );
}

export interface TabPlayerProps {
  player: TabPlayerControls;
  /** What one column is called in the readout: "note", "chord"... */
  unit?: string;
  className?: string;
}

function PlayIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M5 3.5v13l11-6.5z" fill="currentColor" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
      <rect x="4" y="3.5" width="4.2" height="13" rx="1" fill="currentColor" />
      <rect x="11.8" y="3.5" width="4.2" height="13" rx="1" fill="currentColor" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
      <rect x="4" y="4" width="12" height="12" rx="2" fill="currentColor" />
    </svg>
  );
}

/** Little metronome (pendulum in a wedge) for the click-volume control. */
function MetronomeIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M7 3h6l3 14H4z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M10 14L14.5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="14.5" cy="5" r="1.6" fill="currentColor" />
      {muted && <path d="M3 17L17 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />}
    </svg>
  );
}

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M3 7.5v5h3l4 3.5v-12L6 7.5z" fill="currentColor" />
      {muted ? (
        <path d="M13 7.5l4 5m0-5l-4 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
      ) : (
        <>
          <path d="M12.5 7.2a3.8 3.8 0 010 5.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
          <path d="M14.8 5a7 7 0 010 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
        </>
      )}
    </svg>
  );
}

/**
 * Transport bar for the live tab player: play / pause, stop, tempo, loop and volume,
 * plus a readout of where the playhead is.
 */
export default function TabPlayer({ player, unit = "note", className = "" }: TabPlayerProps) {
  const {
    state, position, beat, columns, bpm, setBpm, loop, setLoop, noteValue, setNoteValue, click, setClick, countIn, setCountIn,
    volume, setVolume, clickVolume, setClickVolume, toggle, stop, supported,
  } = player;
  const total = columns.length;
  const playing = state === "playing";
  const empty = total === 0;
  const countingIn = playing && beat !== null && beat.countIn;

  if (!supported) {
    return (
      <div className={`rounded-xl border border-bark-100 bg-cream-200 px-4 py-3 text-sm text-bark-500 ${className}`}>
        Your browser does not support Web Audio, so the tab cannot be played back here.
      </div>
    );
  }

  const current = position !== null && position < total ? columns[position] : null;
  const readout = countingIn
    ? `Count-in… ${beat!.beat}`
    : current
      ? `${unit.charAt(0).toUpperCase() + unit.slice(1)} ${position! + 1} of ${total}` + (current.label ? ` · ${current.label}` : "")
      : empty
        ? "Nothing to play"
        : `${total} ${total === 1 ? unit : `${unit}s`}`;

  return (
    <div className={`flex flex-col gap-2.5 rounded-xl border border-bark-100 bg-cream-200 px-3 py-2.5 ${className}`} role="group" aria-label="Tab player">
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
      {/* Transport */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggle}
          disabled={empty}
          aria-label={playing ? "Pause" : "Play"}
          title={playing ? "Pause (keeps your place)" : "Play the tab"}
          className={`cursor-pointer inline-flex items-center justify-center w-11 h-11 rounded-full shadow-chip transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-honey-400 disabled:opacity-40 disabled:cursor-not-allowed ${
            playing ? "bg-walnut-600 text-cream-50 hover:bg-walnut-700" : "bg-honey-400 text-bark-900 hover:bg-honey-500"
          }`}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <button
          type="button"
          onClick={stop}
          disabled={state === "stopped"}
          aria-label="Stop"
          title="Stop and go back to the start"
          className="cursor-pointer inline-flex items-center justify-center w-9 h-9 rounded-full border border-bark-200 bg-cream-50 text-bark-700 hover:bg-cream-300 hover:border-bark-400 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-honey-400 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <StopIcon />
        </button>
        <div className="flex flex-col leading-tight min-w-[7.5rem]" aria-live="polite">
          <span className="text-[13px] font-semibold text-bark-800 tabular-nums">{readout}</span>
          <span className="text-[11px] text-bark-400">{playing ? (countingIn ? "get ready" : "playing") : state === "paused" ? "paused" : "ready"}</span>
        </div>
        <BeatDots beat={beat} playing={playing} />
      </div>

      {/* Tempo */}
      <div className="flex items-center gap-2 text-[13px] font-medium text-bark-600" role="group" aria-label="Tempo">
        <span className="whitespace-nowrap">
          Tempo <span className="font-bold text-bark-800 tabular-nums">{bpm}</span> <span className="text-bark-400">bpm</span>
        </span>
        <button
          type="button"
          onClick={() => setBpm(bpm - 5)}
          className="cursor-pointer w-7 h-7 rounded-full border border-bark-200 bg-cream-50 text-bark-700 hover:bg-cream-300 font-bold"
          aria-label="Slower"
        >
          −
        </button>
        <input
          type="range"
          min={MIN_BPM}
          max={MAX_BPM}
          step={1}
          value={bpm}
          onChange={(e) => setBpm(Number(e.target.value))}
          aria-label="Tempo in beats per minute"
          className="w-28 accent-honey-500 cursor-pointer"
        />
        <button
          type="button"
          onClick={() => setBpm(bpm + 5)}
          className="cursor-pointer w-7 h-7 rounded-full border border-bark-200 bg-cream-50 text-bark-700 hover:bg-cream-300 font-bold"
          aria-label="Faster"
        >
          +
        </button>
      </div>

      <Toggle checked={loop} onChange={setLoop} label="Loop" />

      {/* Volume */}
      <div className="flex items-center gap-2 text-bark-600 ml-auto" role="group" aria-label="Volume" title="Volume">
        <button
          type="button"
          onClick={() => setVolume(volume === 0 ? 0.8 : 0)}
          aria-label={volume === 0 ? "Unmute" : "Mute"}
          className="cursor-pointer text-bark-600 hover:text-bark-900"
        >
          <SpeakerIcon muted={volume === 0} />
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          aria-label="Volume"
          className="w-20 accent-walnut-600 cursor-pointer"
        />
      </div>
    </div>

    {/* Rhythm: note value + metronome */}
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-bark-100/70 pt-2.5">
      <div className="flex flex-wrap items-center gap-2 text-[13px] font-medium text-bark-600 max-w-full" role="group" aria-label="Note value">
        <span className="whitespace-nowrap" title="What each tab note is worth: the tempo counts quarter notes">
          Play as
        </span>
        <Segmented<"4" | "8" | "16"> value={String(noteValue) as "4" | "8" | "16"} onChange={(v) => setNoteValue(Number(v) as NoteValue)} options={NOTE_VALUE_OPTIONS} />
      </div>
      <div className="flex items-center gap-2 text-[13px] font-medium text-bark-600" role="group" aria-label="Metronome click">
        <span className="whitespace-nowrap">Click</span>
        <Segmented<ClickMode> value={click} onChange={setClick} options={CLICK_OPTIONS} />
      </div>
      {click !== "off" && (
        <>
          <Toggle checked={countIn} onChange={setCountIn} label="Count-in bar" />
          <div className="flex items-center gap-2 text-bark-600" role="group" aria-label="Metronome volume" title="How loud the click is, relative to the guitar">
            <button
              type="button"
              onClick={() => setClickVolume(clickVolume === 0 ? 0.7 : 0)}
              aria-label={clickVolume === 0 ? "Unmute click" : "Mute click"}
              className="cursor-pointer text-bark-600 hover:text-bark-900"
            >
              <MetronomeIcon muted={clickVolume === 0} />
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={clickVolume}
              onChange={(e) => setClickVolume(Number(e.target.value))}
              aria-label="Click volume"
              className="w-20 accent-walnut-600 cursor-pointer"
            />
            <span className="text-[11px] text-bark-400 tabular-nums w-8">{Math.round(clickVolume * 100)}%</span>
          </div>
        </>
      )}
      <span className="text-[11px] text-bark-400 ml-auto">
        {noteValue === 4 ? "1 note per click" : noteValue === 8 ? "2 notes per click" : "4 notes per click"} · accent every {BEATS_PER_BAR} beats
      </span>
    </div>
    </div>
  );
}
