"use client";

import React, { useId } from "react";
import { Tuning, tuningMidi } from "@/utils/tunings";
import { NoteRole, tabStringLabels } from "@/utils/tab";
import { ROLE_COLORS } from "./Tablature";
import { WoodDefs, stringColor, stringWidth } from "./wood";

const SANS = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const MARKER_FRETS = [3, 5, 7, 9, 15, 17, 19, 21];
const DOUBLE_MARKER_FRETS = [12, 24];

export interface FretboardHighlight {
  role: NoteRole;
  label: string;
  /** Dimmed rendering for "context" notes (e.g. scale tones outside the current position). */
  faint?: boolean;
  /** Small badge in the corner of the note, e.g. a finger number. */
  badge?: string | number;
  /** Tooltip text; defaults to the label. */
  title?: string;
}

export interface FretboardProps {
  tuning: Tuning;
  /** Highest fret to draw. */
  fretCount?: number;
  /** Decide how (and whether) to draw the note at a given string / fret. */
  getHighlight: (stringIndex: number, fret: number, midi: number) => FretboardHighlight | null;
  /** Shade a fret range, e.g. the current hand position. */
  positionWindow?: { from: number; to: number } | null;
  /** Strings to draw as muted (×) at the nut. */
  mutedStrings?: number[];
  /** Notes that are sounding right now (from the tab player): drawn with a pulsing ring. */
  activeNotes?: { string: number; fret: number }[];
  /** Changes whenever a new note starts, so a repeated note pulses again. */
  activeKey?: string | number;
  /** Called when a highlighted note is clicked (e.g. to hear it). */
  onNoteClick?: (stringIndex: number, fret: number, midi: number) => void;
  className?: string;
}

const FINGER_NAMES = ["open", "index", "middle", "ring", "pinky"];

/**
 * Small inline key explaining the black finger bubble drawn on highlighted notes.
 * Pass a real note from the current diagram (label + finger + role) so the example
 * matches what is drawn on the neck.
 */
export function FingerBadgeKey({
  example,
}: {
  example: { label: string; finger: number; role?: NoteRole; noteName?: string } | null;
}) {
  const color = ROLE_COLORS[example?.role ?? "root"];
  const isRoot = (example?.role ?? "root") === "root";
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl bg-cream-200 border border-bark-100 px-3 py-2 text-xs text-bark-700">
      {example && (
        <svg width="34" height="30" viewBox="0 0 34 30" aria-hidden="true" style={{ display: "block" }}>
          <circle cx="14" cy="17" r="11.5" fill={isRoot ? color : "#fffdf8"} stroke={isRoot ? "#fff4e3" : color} strokeWidth="2" />
          <text x="14" y="17.5" textAnchor="middle" dominantBaseline="central" fontSize={example.label.length > 1 ? 9.5 : 11} fontWeight="800" fill={isRoot ? "#fffdf8" : color} fontFamily={SANS}>
            {example.label}
          </text>
          <circle cx="24" cy="7" r="6" fill="#3a2a1e" stroke="#fffdf8" strokeWidth="1" />
          <text x="24" y="7.5" textAnchor="middle" dominantBaseline="central" fontSize="7.5" fontWeight="800" fill="#fffdf8" fontFamily={SANS}>
            {example.finger}
          </text>
        </svg>
      )}
      <span>
        <span className="font-bold text-bark-900">The small black bubble is the finger to use</span>{" "}
        (1 index · 2 middle · 3 ring · 4 pinky).
        {example && (
          <>
            {" "}Here, {example.noteName ?? example.label} is played with finger {example.finger} ({FINGER_NAMES[example.finger] ?? ""}).
          </>
        )}
        {" "}Open strings have no bubble; × on the left means skip that string.
      </span>
    </div>
  );
}

const LABEL_W = 30;
const NUT_W = 52;
const FRET_W = 52;
const STRING_GAP = 27;
const PAD_TOP = 18;
const PAD_BOTTOM = 30;

export default function Fretboard({
  tuning,
  fretCount = 12,
  getHighlight,
  positionWindow = null,
  mutedStrings = [],
  activeNotes = [],
  activeKey,
  onNoteClick,
  className = "",
}: FretboardProps) {
  const id = useId().replace(/:/g, "");
  const opens = tuningMidi(tuning);
  const strings = opens.length;
  const labels = tabStringLabels(tuning.notes);

  const boardLeft = LABEL_W + NUT_W;
  const boardTop = PAD_TOP - 12;
  const boardHeight = (strings - 1) * STRING_GAP + 24;
  const width = boardLeft + fretCount * FRET_W + 14;
  const height = PAD_TOP + (strings - 1) * STRING_GAP + PAD_BOTTOM;

  const stringY = (s: number) => PAD_TOP + (strings - 1 - s) * STRING_GAP;
  const fretX = (fret: number) => (fret === 0 ? LABEL_W + NUT_W / 2 : boardLeft + (fret - 0.5) * FRET_W);
  const midY = PAD_TOP + ((strings - 1) * STRING_GAP) / 2;

  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role={onNoteClick ? "group" : "img"}
      aria-label={`Fretboard map in ${tuning.name} tuning`}
      style={{ display: "block", fontFamily: SANS }}
    >
      <WoodDefs prefix={id} tone="rosewood" />

      {/* Headstock side (behind the nut) */}
      <rect x={LABEL_W} y={boardTop} width={NUT_W} height={boardHeight} rx={4} fill="#e9dcc3" />

      {/* Wooden board */}
      <rect x={boardLeft} y={boardTop} width={fretCount * FRET_W} height={boardHeight} rx={3} fill={`url(#${id}-wood)`} />
      <rect x={boardLeft} y={boardTop} width={fretCount * FRET_W} height={boardHeight} rx={3} filter={`url(#${id}-grain)`} opacity={0.9} />

      {/* Position window */}
      {positionWindow && (
        <rect
          x={positionWindow.from === 0 ? LABEL_W : boardLeft + (positionWindow.from - 1) * FRET_W}
          y={boardTop}
          width={(positionWindow.from === 0 ? NUT_W : 0) + (Math.min(positionWindow.to, fretCount) - Math.max(positionWindow.from, 1) + 1) * FRET_W}
          height={boardHeight}
          rx={3}
          fill="#f2c96b"
          opacity={0.22}
        />
      )}

      {/* Pearl inlays */}
      {Array.from({ length: fretCount }).map((_, i) => {
        const fret = i + 1;
        const cx = boardLeft + (fret - 0.5) * FRET_W;
        if (DOUBLE_MARKER_FRETS.includes(fret)) {
          return (
            <g key={fret}>
              <circle cx={cx} cy={midY - STRING_GAP * 1.5} r={5} fill={`url(#${id}-pearl)`} />
              <circle cx={cx} cy={midY + STRING_GAP * 1.5} r={5} fill={`url(#${id}-pearl)`} />
            </g>
          );
        }
        if (MARKER_FRETS.includes(fret)) return <circle key={fret} cx={cx} cy={midY} r={5} fill={`url(#${id}-pearl)`} />;
        return null;
      })}

      {/* Nut */}
      <rect x={boardLeft - 5} y={boardTop} width={6} height={boardHeight} fill="#f3ead8" stroke="#c9b89a" strokeWidth={0.8} />

      {/* Frets */}
      {Array.from({ length: fretCount }).map((_, i) => (
        <rect key={i} x={boardLeft + (i + 1) * FRET_W - 2} y={boardTop} width={3.5} height={boardHeight} fill={`url(#${id}-fret)`} />
      ))}

      {/* Strings */}
      {opens.map((_, s) => (
        <g key={s}>
          <line x1={LABEL_W + 4} x2={boardLeft + fretCount * FRET_W} y1={stringY(s) + 1} y2={stringY(s) + 1} stroke="#2a1d14" strokeWidth={stringWidth(s, strings)} opacity={0.35} />
          <line x1={LABEL_W + 4} x2={boardLeft + fretCount * FRET_W} y1={stringY(s)} y2={stringY(s)} stroke={stringColor(s, strings)} strokeWidth={stringWidth(s, strings)} />
        </g>
      ))}

      {/* String labels */}
      {labels.map((label, s) => (
        <text key={s} x={LABEL_W - 8} y={stringY(s)} textAnchor="end" dominantBaseline="central" fontSize={12} fontWeight={700} fill={mutedStrings.includes(s) ? "#b39a7a" : "#4c3728"}>
          {mutedStrings.includes(s) ? "×" : label}
        </text>
      ))}

      {/* Fret numbers */}
      {Array.from({ length: fretCount + 1 }).map((_, fret) => {
        const inWindow = positionWindow && fret >= positionWindow.from && fret <= positionWindow.to;
        return (
          <text key={fret} x={fretX(fret)} y={height - 9} textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={inWindow ? 800 : 500} fill={inWindow ? "#b07a19" : "#957a5c"}>
            {fret === 0 ? "open" : fret}
          </text>
        );
      })}

      {/* Notes */}
      {opens.map((open, s) =>
        Array.from({ length: fretCount + 1 }).map((_, fret) => {
          const hl = getHighlight(s, fret, open + fret);
          if (!hl) return null;
          const cx = fretX(fret);
          const cy = stringY(s);
          const color = ROLE_COLORS[hl.role];
          const isRoot = hl.role === "root";
          const active = activeNotes.some((n) => n.string === s && n.fret === fret);
          const click = onNoteClick ? () => onNoteClick(s, fret, open + fret) : undefined;
          return (
            <g
              key={`${s}-${fret}`}
              opacity={hl.faint && !active ? 0.55 : 1}
              onClick={click}
              onKeyDown={
                click
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        click();
                      }
                    }
                  : undefined
              }
              tabIndex={click ? 0 : undefined}
              role={click ? "button" : undefined}
              aria-label={click ? `Play ${hl.title ?? hl.label}, string ${strings - s}, ${fret === 0 ? "open" : `fret ${fret}`}` : undefined}
              className={click ? "fb-note-clickable" : undefined}
              style={click ? { outline: "none" } : undefined}
            >
              <title>{`${hl.title ?? hl.label} — string ${strings - s}, ${fret === 0 ? "open" : `fret ${fret}`}${click ? " · click to hear" : ""}`}</title>
              {active && (
                <g key={`pulse-${activeKey ?? ""}`}>
                  <circle cx={cx} cy={cy} r={19} fill="none" stroke="#e6b14a" strokeWidth={3} className="fb-pulse" />
                  <circle cx={cx} cy={cy} r={15} fill="none" stroke="#e6b14a" strokeWidth={2.5} />
                </g>
              )}
              {hl.faint ? (
                <circle cx={cx} cy={cy} r={10} fill="#fffdf8" stroke={color} strokeWidth={1.5} />
              ) : (
                <circle cx={cx} cy={cy} r={11.5} fill={isRoot ? color : "#fffdf8"} stroke={isRoot ? "#fff4e3" : color} strokeWidth={2} filter={`url(#${id}-shadow)`} />
              )}
              <text x={cx} y={cy + 0.5} textAnchor="middle" dominantBaseline="central" fontSize={hl.label.length > 2 ? 8 : hl.label.length > 1 ? 9.5 : 11} fontWeight={800} fill={isRoot && !hl.faint ? "#fffdf8" : color}>
                {hl.label}
              </text>
              {hl.badge !== undefined && hl.badge !== "" && (
                <g>
                  <circle cx={cx + 10} cy={cy - 10} r={6} fill="#3a2a1e" stroke="#fffdf8" strokeWidth={1} />
                  <text x={cx + 10} y={cy - 9.5} textAnchor="middle" dominantBaseline="central" fontSize={7.5} fontWeight={800} fill="#fffdf8">
                    {hl.badge}
                  </text>
                </g>
              )}
            </g>
          );
        }),
      )}
    </svg>
  );
}
