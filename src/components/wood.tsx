"use client";

import React from "react";

/**
 * Shared SVG <defs> for the wood / metal / pearl looks.
 * Pass a unique prefix (e.g. from React.useId) so several SVGs can coexist on one page.
 */
export function WoodDefs({ prefix, tone = "rosewood" }: { prefix: string; tone?: "rosewood" | "maple" }) {
  const stops =
    tone === "rosewood"
      ? ["#6b4428", "#7d5031", "#5a3620"]
      : ["#e9cfa4", "#f1dcb8", "#dcc08f"];
  return (
    <defs>
      <linearGradient id={`${prefix}-wood`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={stops[0]} />
        <stop offset="0.5" stopColor={stops[1]} />
        <stop offset="1" stopColor={stops[2]} />
      </linearGradient>
      <filter id={`${prefix}-grain`} x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.006 0.18" numOctaves="3" seed="7" result="noise" />
        <feColorMatrix
          in="noise"
          type="matrix"
          values={
            tone === "rosewood"
              ? "0 0 0 0 0.25  0 0 0 0 0.14  0 0 0 0 0.06  1.4 0 0 0 -0.55"
              : "0 0 0 0 0.55  0 0 0 0 0.40  0 0 0 0 0.22  1.0 0 0 0 -0.55"
          }
        />
      </filter>
      <linearGradient id={`${prefix}-fret`} x1="0" x2="1" y1="0" y2="0">
        <stop offset="0" stopColor="#8f8f8f" />
        <stop offset="0.5" stopColor="#eeeeee" />
        <stop offset="1" stopColor="#7a7a7a" />
      </linearGradient>
      <linearGradient id={`${prefix}-fretv`} x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor="#8f8f8f" />
        <stop offset="0.5" stopColor="#eeeeee" />
        <stop offset="1" stopColor="#7a7a7a" />
      </linearGradient>
      <radialGradient id={`${prefix}-pearl`}>
        <stop offset="0" stopColor="#fff9ec" />
        <stop offset="1" stopColor="#d6c9ae" />
      </radialGradient>
      <filter id={`${prefix}-shadow`} x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="1" stdDeviation="1" floodColor="#2a1d14" floodOpacity="0.45" />
      </filter>
    </defs>
  );
}

/**
 * String colours: wound bass strings are bronze, plain trebles are steel.
 * A regular set has three plain strings on top; extended-range sets add wound strings below.
 */
export function stringColor(stringIndex: number, stringCount: number): string {
  const plainStrings = Math.min(3, Math.ceil(stringCount / 2));
  return stringIndex < stringCount - plainStrings ? "#d2b682" : "#e3ddd0";
}

export function stringWidth(stringIndex: number, stringCount: number, base = 1.2, step = 0.35): number {
  return base + (stringCount - 1 - stringIndex) * step;
}
