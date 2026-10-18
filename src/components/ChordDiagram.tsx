"use client";

import React, { useId } from "react";
import { ChordVoicing } from "@/utils/chordVoicings";
import { tabStringLabels } from "@/utils/tab";
import { ROLE_COLORS } from "./Tablature";
import { WoodDefs, stringColor, stringWidth } from "./wood";

const SANS = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

export interface ChordDiagramProps {
  voicing: ChordVoicing;
  /** Open-string names, lowest string first. */
  tuning: string[];
  /**
   * Width in px of a six-string diagram; everything scales with it. Seven- and
   * eight-string diagrams grow wider so the strings keep the same spacing.
   */
  width?: number;
  showNoteNames?: boolean;
}

/** Actual rendered width of a diagram for a given string count. */
export function chordDiagramWidth(strings: number, width = 130): number {
  const padX = 24 * (width / 130);
  const gap = (width - padX * 2) / 5;
  return Math.round(width + Math.max(0, strings - 6) * gap);
}

export default function ChordDiagram({ voicing, tuning, width: baseWidth = 130, showNoteNames = true }: ChordDiagramProps) {
  const id = useId().replace(/:/g, "");
  const strings = tuning.length;
  const labels = tabStringLabels(tuning);
  const width = chordDiagramWidth(strings, baseWidth);

  const fretted = voicing.frets.filter((f) => f !== null && f > 0) as number[];
  const minFret = fretted.length ? Math.min(...fretted) : 1;
  const maxFret = fretted.length ? Math.max(...fretted) : 1;
  // Show the nut when the shape lives in the first frets; otherwise start at the base fret.
  const startFret = maxFret <= 4 ? 1 : minFret;
  const fretRows = Math.max(4, maxFret - startFret + 1);

  const scale = baseWidth / 130;
  const padX = 24 * scale;
  const padTop = 32 * scale;
  const stringGap = (width - padX * 2) / (strings - 1);
  const fretGap = 24 * scale;
  const gridHeight = fretRows * fretGap;
  const padBottom = (showNoteNames ? 32 : 14) * scale;
  const height = padTop + gridHeight + padBottom;
  const dotR = 8.5 * scale;
  const boardPad = 6 * scale;

  const sx = (s: number) => padX + s * stringGap;
  const fy = (fret: number) => padTop + (fret - startFret + 0.5) * fretGap;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Chord diagram: ${voicing.frets.map((f) => (f === null ? "x" : f)).join(" ")}`}
      style={{ fontFamily: SANS, display: "block" }}
    >
      <WoodDefs prefix={id} tone="maple" />

      {/* Board */}
      <rect x={sx(0) - boardPad} y={padTop} width={sx(strings - 1) - sx(0) + boardPad * 2} height={gridHeight} rx={2 * scale} fill={`url(#${id}-wood)`} />
      <rect x={sx(0) - boardPad} y={padTop} width={sx(strings - 1) - sx(0) + boardPad * 2} height={gridHeight} rx={2 * scale} filter={`url(#${id}-grain)`} opacity={0.55} />

      {/* Nut or base-fret marker */}
      {startFret === 1 ? (
        <rect x={sx(0) - boardPad} y={padTop - 4 * scale} width={sx(strings - 1) - sx(0) + boardPad * 2} height={5 * scale} rx={1} fill="#f3ead8" stroke="#c9b89a" strokeWidth={0.8 * scale} />
      ) : (
        <text x={sx(0) - boardPad - 4 * scale} y={fy(startFret)} textAnchor="end" dominantBaseline="central" fontSize={9 * scale} fontWeight={700} fill="#7a5f45">
          {startFret}fr
        </text>
      )}

      {/* Frets */}
      {Array.from({ length: fretRows }).map((_, i) => (
        <rect key={i} x={sx(0) - boardPad} y={padTop + (i + 1) * fretGap - 1.2 * scale} width={sx(strings - 1) - sx(0) + boardPad * 2} height={2.4 * scale} fill={`url(#${id}-fretv)`} />
      ))}

      {/* Strings (thicker towards the bass) */}
      {Array.from({ length: strings }).map((_, s) => (
        <line key={s} x1={sx(s)} x2={sx(s)} y1={padTop} y2={padTop + gridHeight} stroke={stringColor(s, strings)} strokeWidth={stringWidth(s, strings, 1, 0.3) * scale} />
      ))}

      {/* Open / muted markers */}
      {voicing.frets.map((f, s) => {
        const y = padTop - 14 * scale;
        if (f === null) {
          return (
            <text key={s} x={sx(s)} y={y} textAnchor="middle" dominantBaseline="central" fontSize={12 * scale} fontWeight={700} fill="#b39a7a">
              ×
            </text>
          );
        }
        if (f === 0) {
          return <circle key={s} cx={sx(s)} cy={y} r={4.5 * scale} fill="#fffdf8" stroke={ROLE_COLORS[voicing.roles[s] ?? "other"]} strokeWidth={1.8 * scale} />;
        }
        return null;
      })}

      {/* Barre */}
      {voicing.barre && (
        <rect
          x={sx(voicing.barre.fromString) - dotR * 1.35}
          y={fy(voicing.barre.fret) - dotR * 1.15}
          width={sx(voicing.barre.toString) - sx(voicing.barre.fromString) + dotR * 2.7}
          height={dotR * 2.3}
          rx={dotR * 1.15}
          fill="#3a2a1e"
          opacity={0.85}
        />
      )}

      {/* Fretted notes */}
      {voicing.frets.map((f, s) => {
        if (f === null || f === 0) return null;
        const role = voicing.roles[s] ?? "other";
        const finger = voicing.fingers[s];
        return (
          <g key={s}>
            <title>{`${voicing.noteNames[s]} — fret ${f}${finger ? `, finger ${finger}` : ""}`}</title>
            <circle cx={sx(s)} cy={fy(f)} r={dotR} fill={ROLE_COLORS[role]} stroke="#fffdf8" strokeWidth={1.5 * scale} filter={`url(#${id}-shadow)`} />
            <text x={sx(s)} y={fy(f) + 0.5} textAnchor="middle" dominantBaseline="central" fontSize={10 * scale} fontWeight={800} fill="#fffdf8">
              {finger ?? ""}
            </text>
          </g>
        );
      })}

      {/* Note names / string labels */}
      {showNoteNames &&
        voicing.frets.map((f, s) => (
          <text key={s} x={sx(s)} y={padTop + gridHeight + 12 * scale} textAnchor="middle" dominantBaseline="central" fontSize={9 * scale} fontWeight={700} fill={f === null ? "#b39a7a" : ROLE_COLORS[voicing.roles[s] ?? "other"]}>
            {f === null ? "–" : voicing.noteNames[s]}
          </text>
        ))}
      {showNoteNames &&
        labels.map((label, s) => (
          <text key={s} x={sx(s)} y={padTop + gridHeight + 24 * scale} textAnchor="middle" dominantBaseline="central" fontSize={8 * scale} fill="#957a5c">
            {label}
          </text>
        ))}
    </svg>
  );
}
