"use client";

import React, { useMemo } from "react";
import { TabData, TabMeasure, NoteRole, tabStringLabels } from "@/utils/tab";

/* ------------------------------------------------------------------ */
/* Shared colour palette for note roles (also used by the other views) */
/* ------------------------------------------------------------------ */

export const ROLE_COLORS: Record<NoteRole, string> = {
  root: "#c2552e",    // rust
  third: "#4f8a4c",   // sage
  fifth: "#3f7ba6",   // lake
  seventh: "#8a5a9e", // plum
  scale: "#3a2a1e",   // ink
  blue: "#1f8a8a",    // teal
  other: "#62483a",   // bark
};

export const ROLE_LABELS: Record<NoteRole, string> = {
  root: "Root",
  third: "3rd",
  fifth: "5th",
  seventh: "7th",
  scale: "Scale tone",
  blue: "Blue note",
  other: "Other",
};

const PAPER = "#fffdf8";
const LINE = "#b39a7a";
const BAR = "#7a5f45";
const INK = "#3a2a1e";
const MUTED = "#957a5c";
const PLAYHEAD = "#f9e1a6"; // honey-200
const PLAYHEAD_EDGE = "#d49a2c"; // honey-500

/* ------------------------------------------------------------------ */
/* Layout constants                                                    */
/* ------------------------------------------------------------------ */

const STRING_GAP = 18;
const LEFT_GUTTER = 70;
const RIGHT_PAD = 18;
const MEASURE_PAD = 12;
const LABEL_ROW = 22;
const FINGER_ROW = 24;
const SYSTEM_PAD_TOP = 16;
const SYSTEM_PAD_BOTTOM = 14;
const SYSTEM_GAP = 12;
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const SANS = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

export interface TablatureProps {
  tab: TabData;
  /** How many measures to fit on one line before wrapping. */
  measuresPerLine?: number;
  /** Draw suggested fingers under single-note columns. */
  showFingering?: boolean;
  /**
   * Column to highlight as "now playing" (flat index across all measures, as produced
   * by `flattenTab`). null / undefined hides the playhead.
   */
  activeColumn?: number | null;
  /** Called with the flat column index when a column is clicked (e.g. to hear it / seek). */
  onColumnClick?: (index: number) => void;
  className?: string;
}

interface SystemLayout {
  measures: TabMeasure[];
  hasLabels: boolean;
}

export default function Tablature({
  tab,
  measuresPerLine = 2,
  showFingering = true,
  activeColumn = null,
  onColumnClick,
  className = "",
}: TablatureProps) {
  const stringCount = tab.tuning.length;
  const labels = useMemo(() => tabStringLabels(tab.tuning), [tab.tuning]);
  const clickable = !!onColumnClick;

  // Flat index of the first column of each measure, so the playhead can be matched up.
  const measureOffsets = useMemo(() => {
    const offsets: number[] = [];
    let n = 0;
    for (const m of tab.measures) {
      offsets.push(n);
      n += m.columns.length;
    }
    return offsets;
  }, [tab.measures]);

  // Column width adapts to two-digit frets. A measure must also be wide enough for its
  // longest label; labels wider than one column simply run on to the right.
  const maxFret = Math.max(0, ...tab.measures.flatMap((m) => m.columns.flatMap((c) => c.notes.map((n) => n.fret))));
  const maxLabel = Math.max(0, ...tab.measures.flatMap((m) => m.columns.map((c) => (c.label ? c.label.length : 0))));
  const maxColumns = Math.max(1, ...tab.measures.map((m) => m.columns.length));
  const labelWidth = (label: string) => label.length * 6.6 + 10;
  const baseColWidth = maxFret >= 10 ? 38 : 34;
  const measureWidth = Math.max(MEASURE_PAD * 2 + maxColumns * baseColWidth, labelWidth("x".repeat(maxLabel)) + MEASURE_PAD * 2);
  const colWidth = (measureWidth - MEASURE_PAD * 2) / maxColumns;

  const systems: SystemLayout[] = useMemo(() => {
    const out: SystemLayout[] = [];
    for (let i = 0; i < tab.measures.length; i += measuresPerLine) {
      const measures = tab.measures.slice(i, i + measuresPerLine);
      out.push({ measures, hasLabels: measures.some((m) => m.columns.some((c) => !!c.label)) });
    }
    if (out.length === 0) out.push({ measures: [{ columns: [] }], hasLabels: false });
    return out;
  }, [tab.measures, measuresPerLine]);

  const anyFingering = showFingering && tab.measures.some((m) => m.columns.some((c) => c.notes.length === 1 && c.notes[0].finger !== undefined));

  const linesHeight = (stringCount - 1) * STRING_GAP;
  const systemHeight = (s: SystemLayout) =>
    SYSTEM_PAD_TOP + (s.hasLabels ? LABEL_ROW : 0) + linesHeight + (anyFingering ? FINGER_ROW : 0) + SYSTEM_PAD_BOTTOM;

  const width = LEFT_GUTTER + RIGHT_PAD + Math.max(...systems.map((s) => s.measures.length * measureWidth));
  const height = systems.reduce((a, s) => a + systemHeight(s), 0) + SYSTEM_GAP * (systems.length - 1);

  let cursorY = 0;

  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role={clickable ? "group" : "img"}
      aria-label={tab.title ? `Tablature: ${tab.title}` : "Guitar tablature"}
      style={{ display: "block" }}
    >
      <rect x={0} y={0} width={width} height={height} rx={10} fill={PAPER} />

      {systems.map((system, systemIndex) => {
        const top = cursorY;
        cursorY += systemHeight(system) + SYSTEM_GAP;
        const linesTop = top + SYSTEM_PAD_TOP + (system.hasLabels ? LABEL_ROW : 0);
        const lineY = (stringIndex: number) => linesTop + (stringCount - 1 - stringIndex) * STRING_GAP;
        const systemWidth = system.measures.length * measureWidth;
        const isLast = systemIndex === systems.length - 1;

        // Where the playhead sits, if it is on this system.
        const bandTop = linesTop - (system.hasLabels ? LABEL_ROW - 2 : 10);
        const bandBottom = linesTop + linesHeight + (anyFingering ? FINGER_ROW - 2 : 10);
        let playheadX: number | null = null;
        if (activeColumn !== null && activeColumn >= 0) {
          for (let mi = 0; mi < system.measures.length; mi++) {
            const ci = activeColumn - measureOffsets[systemIndex * measuresPerLine + mi];
            if (ci >= 0 && ci < system.measures[mi].columns.length) {
              playheadX = LEFT_GUTTER + mi * measureWidth + MEASURE_PAD + ci * colWidth + 1;
              break;
            }
          }
        }

        return (
          <g key={systemIndex}>
            {/* Playhead: drawn under the strings so the lines stay visible */}
            {playheadX !== null && (
              <rect x={playheadX} y={bandTop} width={colWidth - 2} height={bandBottom - bandTop} rx={6} fill={PLAYHEAD} stroke={PLAYHEAD_EDGE} strokeWidth={1.2} />
            )}

            {/* String lines */}
            {Array.from({ length: stringCount }).map((_, s) => (
              <line key={s} x1={LEFT_GUTTER} x2={LEFT_GUTTER + systemWidth} y1={lineY(s)} y2={lineY(s)} stroke={LINE} strokeWidth={1} />
            ))}

            {/* String names */}
            {labels.map((label, s) => (
              <text key={s} x={24} y={lineY(s)} textAnchor="end" dominantBaseline="central" fontSize={12} fontWeight={700} fill={s === stringCount - 1 ? INK : MUTED} fontFamily={SANS}>
                {label}
              </text>
            ))}

            {/* TAB clef */}
            {["T", "A", "B"].map((letter, i) => (
              <text
                key={letter}
                x={48}
                y={linesTop + linesHeight * (0.17 + i * 0.33)}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={15}
                fontWeight={700}
                fill={BAR}
                fontFamily="Georgia, serif"
              >
                {letter}
              </text>
            ))}

            {/* Opening bar line */}
            <line x1={LEFT_GUTTER} x2={LEFT_GUTTER} y1={lineY(stringCount - 1)} y2={lineY(0)} stroke={BAR} strokeWidth={1.2} />

            {system.measures.map((measure, mi) => {
              const mx = LEFT_GUTTER + mi * measureWidth;
              const lastMeasure = isLast && mi === system.measures.length - 1;
              const measureIndex = systemIndex * measuresPerLine + mi;
              return (
                <g key={mi}>
                  {measure.columns.map((column, ci) => {
                    const cx = mx + MEASURE_PAD + ci * colWidth + colWidth / 2;
                    const single = column.notes.length === 1 ? column.notes[0] : null;
                    const flatIndex = measureOffsets[measureIndex] + ci;
                    const active = activeColumn !== null && activeColumn === flatIndex;
                    const handleClick = onColumnClick ? () => onColumnClick(flatIndex) : undefined;
                    return (
                      <g
                        key={ci}
                        onClick={handleClick}
                        onKeyDown={
                          handleClick
                            ? (e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  handleClick();
                                }
                              }
                            : undefined
                        }
                        tabIndex={clickable ? 0 : undefined}
                        role={clickable ? "button" : undefined}
                        aria-label={clickable ? `Play ${column.label ?? `column ${flatIndex + 1}`}` : undefined}
                        aria-pressed={clickable ? active : undefined}
                        style={clickable ? { cursor: "pointer", outline: "none" } : undefined}
                        className={clickable ? "tab-column" : undefined}
                      >
                        {/* Hit area, so clicks between the digits count too */}
                        {clickable && (
                          <rect x={cx - colWidth / 2 + 1} y={bandTop} width={colWidth - 2} height={bandBottom - bandTop} rx={6} fill="transparent" className="tab-column-hit" />
                        )}
                        {column.label &&
                          (labelWidth(column.label) <= colWidth ? (
                            <text x={cx} y={linesTop - 13} textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700} fill={BAR} fontFamily={SANS}>
                              {column.label}
                            </text>
                          ) : (
                            <text x={cx - colWidth / 2 + 3} y={linesTop - 13} textAnchor="start" dominantBaseline="central" fontSize={11} fontWeight={700} fill={BAR} fontFamily={SANS}>
                              {column.label}
                            </text>
                          ))}
                        {column.notes.map((note) => {
                          const y = lineY(note.string);
                          const text = String(note.fret);
                          const w = text.length * 8 + 8;
                          const role: NoteRole = note.role ?? "other";
                          const color = ROLE_COLORS[role];
                          const isRoot = role === "root";
                          return (
                            <g key={note.string}>
                              <title>
                                {`${note.noteName ?? ""} — string ${stringCount - note.string}, fret ${note.fret}` +
                                  (note.finger !== undefined ? ` (finger ${note.finger === 0 ? "open" : note.finger})` : "")}
                              </title>
                              {/* Knock-out so the string line does not strike through the digit */}
                              <rect
                                x={cx - w / 2}
                                y={y - 8}
                                width={w}
                                height={16}
                                rx={isRoot ? 8 : 3}
                                fill={isRoot ? "#fbe4da" : active ? PLAYHEAD : PAPER}
                                stroke={isRoot ? color : "none"}
                                strokeWidth={isRoot ? 1.2 : 0}
                              />
                              <text x={cx} y={y + 0.5} textAnchor="middle" dominantBaseline="central" fontSize={13} fontWeight={700} fill={color} fontFamily={MONO}>
                                {text}
                              </text>
                            </g>
                          );
                        })}
                        {anyFingering && single && single.finger !== undefined && (
                          <text x={cx} y={linesTop + linesHeight + 17} textAnchor="middle" dominantBaseline="central" fontSize={10} fill={MUTED} fontFamily={SANS}>
                            {single.finger}
                          </text>
                        )}
                      </g>
                    );
                  })}

                  {/* Bar line at the end of the measure (double bar at the very end) */}
                  {lastMeasure ? (
                    <>
                      <line x1={mx + measureWidth - 5} x2={mx + measureWidth - 5} y1={lineY(stringCount - 1)} y2={lineY(0)} stroke={BAR} strokeWidth={1.2} />
                      <line x1={mx + measureWidth - 1} x2={mx + measureWidth - 1} y1={lineY(stringCount - 1)} y2={lineY(0)} stroke={BAR} strokeWidth={3.5} />
                    </>
                  ) : (
                    <line x1={mx + measureWidth} x2={mx + measureWidth} y1={lineY(stringCount - 1)} y2={lineY(0)} stroke={BAR} strokeWidth={1.2} />
                  )}
                </g>
              );
            })}

            {/* Fingering row caption */}
            {anyFingering && (
              <text x={LEFT_GUTTER - 8} y={linesTop + linesHeight + 17} textAnchor="end" dominantBaseline="central" fontSize={9} fill={MUTED} fontFamily={SANS} letterSpacing={0.5}>
                finger
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
