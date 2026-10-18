"use client";

import React, { useMemo, useState } from "react";
import { Tuning } from "@/utils/tunings";
import {
  SCALES,
  getScaleNotes,
  getScaleDegrees,
  getScaleSteps,
  getScalePitchClasses,
  midiToPitchClass,
  pcToName,
  preferFlats,
  intervalFromRoot,
  scaleDegreeLabel,
  intervalNameForLabel,
  spellScaleTone,
} from "@/utils/theoryEngine";
import { buildScalePosition, scalePositionToTab, rootBoxPosition, POSITION_SPAN } from "@/utils/scaleTab";
import { tabToAscii } from "@/utils/tab";
import { getGuitarSynth } from "@/utils/audio/synth";
import { useTabPlayer } from "@/hooks/useTabPlayer";
import Tablature, { ROLE_COLORS } from "./Tablature";
import TabPlayer from "./TabPlayer";
import Fretboard, { FingerBadgeKey } from "./Fretboard";
import RootPicker from "./RootPicker";
import { Chip, StepHeading, Panel, Toggle, Legend, Segmented, GhostButton } from "./ui";

const SCALE_CATEGORIES: { key: "Essential" | "Modes" | "Other" | "Exotic"; label: string }[] = [
  { key: "Essential", label: "Start here" },
  { key: "Modes", label: "Modes" },
  { key: "Other", label: "More" },
  { key: "Exotic", label: "Exotic" },
];

export default function ScaleLab({ tuning }: { tuning: Tuning }) {
  const [rootPc, setRootPc] = useState(0);
  const [scaleKey, setScaleKey] = useState("major");
  const [positionMode, setPositionMode] = useState<"rootBox" | "open" | "custom">("open");
  const [customPosition, setCustomPosition] = useState(0);
  const [range, setRange] = useState<"octave" | "full">("octave");
  const [descend, setDescend] = useState(false);
  const [showFingering, setShowFingering] = useState(true);
  const [showWholeNeck, setShowWholeNeck] = useState(true);
  const [labelMode, setLabelMode] = useState<"notes" | "intervals">("notes");
  const [copied, setCopied] = useState(false);

  const position =
    positionMode === "open" ? 0 : positionMode === "rootBox" ? rootBoxPosition(tuning, rootPc) : customPosition;

  const scale = SCALES[scaleKey];
  const flats = preferFlats(rootPc, scaleKey);
  const rootName = pcToName(rootPc, flats);
  const notes = getScaleNotes(rootPc, scaleKey);
  const degrees = getScaleDegrees(scaleKey);
  const steps = getScaleSteps(scaleKey);
  const scalePcs = useMemo(() => getScalePitchClasses(rootPc, scaleKey), [rootPc, scaleKey]);

  const scalePos = useMemo(() => buildScalePosition(tuning, rootPc, scaleKey, position), [tuning, rootPc, scaleKey, position]);
  const positionLabel = scalePos.lowFret === 0 ? "open position" : `frets ${scalePos.lowFret}–${scalePos.highFret}`;
  const tab = useMemo(() => {
    const data = scalePositionToTab(tuning, scalePos, { range, descend });
    data.title = `${rootName} ${scale.name} — ${tuning.name} tuning, ${positionLabel}`;
    return data;
  }, [tuning, scalePos, range, descend, rootName, scale.name, positionLabel]);

  const noteCount = tab.measures.reduce((a, m) => a + m.columns.length, 0);

  // Live playback: scale runs default to eighth notes at 90 bpm with the click on, the classic practice setup.
  const player = useTabPlayer(tab, { defaultBpm: 90, defaultNoteValue: 8, defaultClick: "beat" });
  const activeNotes = player.position !== null ? player.columns[player.position]?.notes ?? [] : [];

  // Example for the finger key: the first root you fret when ascending (or the first fretted note).
  const fingerExample = useMemo(() => {
    const n = scalePos.run.find((x) => x.role === "root" && x.fret > 0) ?? scalePos.run.find((x) => x.fret > 0);
    if (!n || !n.finger) return null;
    return { label: labelMode === "intervals" ? n.degree : n.noteName ?? "", noteName: n.noteName, finger: n.finger, role: n.role };
  }, [scalePos, labelMode]);
  const fretCount = Math.max(12, scalePos.highFret);

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

  return (
    <div className="flex flex-col gap-5">
      {/* Choices */}
      <Panel>
        <div className="pt-5 grid grid-cols-1 xl:grid-cols-[auto_1fr] gap-x-10 gap-y-6">
          <div>
            <StepHeading step={2} title="Choose a root" hint="the note the scale is built on" />
            <RootPicker value={rootPc} onChange={setRootPc} />
          </div>
          <div>
            <StepHeading step={3} title="Choose a scale" />
            <div className="flex flex-col gap-2">
              {SCALE_CATEGORIES.map((cat) => (
                <div key={cat.key} className="flex flex-wrap items-center gap-2">
                  <span className="w-20 shrink-0 text-[11px] uppercase tracking-wider text-bark-400 font-bold">{cat.label}</span>
                  {Object.keys(SCALES)
                    .filter((k) => SCALES[k].category === cat.key)
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

        <div className="mt-6 pt-5 border-t border-bark-100 flex flex-col lg:flex-row lg:items-end gap-5">
          <div>
            <StepHeading step={4} title="Where on the neck?" hint={`a hand position is ${POSITION_SPAN + 1} frets`} />
            <div className="flex flex-wrap items-center gap-2">
              <Chip size="lg" active={positionMode === "open"} onClick={() => setPositionMode("open")} title="Frets 0–4, using the open strings">
                Open position
              </Chip>
              <Chip size="lg" active={positionMode === "rootBox"} onClick={() => setPositionMode("rootBox")} title="A box shape with the root on the lowest string">
                Root box
              </Chip>
              <div className="inline-flex items-center rounded-full border border-bark-200 bg-cream-200 overflow-hidden ml-1">
                <button type="button" onClick={() => setPosition(position - 1)} className="cursor-pointer px-3.5 py-2 text-base font-bold text-bark-700 hover:bg-cream-300" aria-label="Move position down">
                  −
                </button>
                <span className="px-3 py-2 text-sm font-semibold text-bark-800 bg-cream-50 border-x border-bark-200 tabular-nums whitespace-nowrap">
                  {scalePos.lowFret === 0 ? "open" : `fret ${scalePos.lowFret}`} → {scalePos.highFret}
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
                { value: "octave", label: "Root to root", title: "Play from the root up to the next root" },
                { value: "full", label: "Whole position", title: "Every scale note under the hand" },
              ]}
            />
            <Toggle checked={descend} onChange={setDescend} label="Up & back down" />
            <Toggle checked={showFingering} onChange={setShowFingering} label="Show fingers" />
          </div>
        </div>
      </Panel>

      {/* Tablature */}
      <Panel
        title={
          <>
            {rootName} {scale.name} <span className="text-bark-400 font-body text-base">· {positionLabel}</span>
          </>
        }
        subtitle={`${noteCount} notes · ${tuning.name} tuning · ${scale.description}`}
        actions={<GhostButton onClick={copyAscii}>{copied ? "Copied!" : "Copy as text tab"}</GhostButton>}
      >
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3 mb-4">
          <div className="flex flex-wrap gap-1.5">
            {notes.map((n, i) => {
              const interval = scale.intervals[i];
              const role = interval === 0 ? "root" : scaleKey === "blues" && interval === 6 ? "blue" : "scale";
              return (
                <div key={i} className="flex flex-col items-center w-12 rounded-xl bg-cream-200 border border-bark-100 py-1.5" title={intervalNameForLabel(degrees[i])}>
                  <span className="font-display text-lg leading-none" style={{ color: ROLE_COLORS[role] }}>{n}</span>
                  <span className="text-[10px] text-bark-400 font-bold mt-1">{degrees[i]}</span>
                </div>
              );
            })}
          </div>
          {scaleKey !== "chromatic" && (
            <p className="text-xs text-bark-500">
              Steps: <span className="text-bark-800 font-bold tracking-wider">{steps.join(" · ")}</span>
              <span className="text-bark-400"> — W whole step, H half step</span>
            </p>
          )}
        </div>
        <TabPlayer player={player} unit="note" className="mb-3" />
        <div className="overflow-x-auto rounded-xl border border-bark-100 bg-cream-50">
          <Tablature tab={tab} measuresPerLine={2} showFingering={showFingering} activeColumn={player.position} onColumnClick={player.seek} />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <Legend
            items={[
              { color: ROLE_COLORS.root, label: "Root" },
              { color: ROLE_COLORS.scale, label: "Scale tone" },
              ...(scaleKey === "blues" ? [{ color: ROLE_COLORS.blue, label: "Blue note" }] : []),
            ]}
          />
          <span className="text-xs text-bark-400">
            Press play to hear the run and follow the golden cursor · click any note to hear it
            {showFingering && <> · Fingers: 0 open · 1 index · 2 middle · 3 ring · 4 pinky</>}
          </span>
        </div>
      </Panel>

      {/* Fretboard map */}
      <Panel
        title="On the fretboard"
        subtitle={
          labelMode === "notes"
            ? "The golden area is your hand position. Notes inside it carry a black bubble with the finger to use."
            : `Each dot shows its interval from the root ${rootName} (1). The golden area is your hand position; black bubbles are the finger to use.`
        }
        actions={
          <>
            <Segmented<"notes" | "intervals">
              value={labelMode}
              onChange={setLabelMode}
              options={[
                { value: "notes", label: "Note names" },
                { value: "intervals", label: "Intervals", title: "Show each note as its distance from the root (1, b3, 5...)" },
              ]}
            />
            <Toggle checked={showWholeNeck} onChange={setShowWholeNeck} label="Whole neck" />
          </>
        }
      >
        <div className="overflow-x-auto">
          <Fretboard
            tuning={tuning}
            fretCount={fretCount}
            positionWindow={{ from: scalePos.lowFret, to: scalePos.highFret }}
            activeNotes={activeNotes}
            activeKey={player.position ?? undefined}
            onNoteClick={(s, fret, midi) => void getGuitarSynth().playNote(midi, { stringIndex: s, channel: "fretboard" })}
            getHighlight={(s, fret, midi) => {
              const pc = midiToPitchClass(midi);
              if (!scalePcs.includes(pc)) return null;
              const inWindow = fret >= scalePos.lowFret && fret <= scalePos.highFret;
              if (!inWindow && !showWholeNeck) return null;
              const interval = intervalFromRoot(rootPc, pc);
              const role = interval === 0 ? "root" : scaleKey === "blues" && interval === 6 ? "blue" : "scale";
              const avail = inWindow ? scalePos.available.find((n) => n.string === s && n.fret === fret) : undefined;
              return {
                role,
                label: labelMode === "intervals" ? scaleDegreeLabel(scaleKey, interval) : spellScaleTone(rootPc, scaleKey, interval),
                title: `${spellScaleTone(rootPc, scaleKey, interval)} · ${scaleDegreeLabel(scaleKey, interval)} (${intervalNameForLabel(scaleDegreeLabel(scaleKey, interval))})`,
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
          <Legend
            items={[
              { color: ROLE_COLORS.root, label: "Root" },
              { color: ROLE_COLORS.scale, label: "Scale tone" },
              ...(scaleKey === "blues" ? [{ color: ROLE_COLORS.blue, label: "Blue note" }] : []),
            ]}
          />
        </div>
        {labelMode === "intervals" && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {scale.intervals.map((i) => (
              <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-cream-200 border border-bark-100 text-bark-700">
                <span className="font-bold" style={{ color: ROLE_COLORS[i === 0 ? "root" : scaleKey === "blues" && i === 6 ? "blue" : "scale"] }}>{scaleDegreeLabel(scaleKey, i)}</span>
                {" "}{intervalNameForLabel(scaleDegreeLabel(scaleKey, i))} · {spellScaleTone(rootPc, scaleKey, i)}
              </span>
            ))}
          </div>
        )}
        <p className="mt-3 text-xs text-bark-400">
          {labelMode === "intervals"
            ? `Intervals stay the same in every key: learn the shape once as ${degrees.join(" · ")} and move it to any root.`
            : "Tip: use the − / + buttons above to slide the position and find the same scale elsewhere on the neck."}
          {" "}Click any note on the neck to hear it; while the tab plays, the sounding note gets a golden ring.
        </p>
      </Panel>
    </div>
  );
}
