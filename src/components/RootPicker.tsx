"use client";

import React from "react";
import { pcToName } from "@/utils/theoryEngine";

/** Twelve root buttons; accidentals show both spellings stacked. */
export default function RootPicker({ value, onChange, tone = "rust" }: { value: number; onChange: (pc: number) => void; tone?: "rust" | "walnut" }) {
  const active = tone === "rust" ? "bg-rust-500 text-cream-50 border-rust-600 shadow-chip" : "bg-walnut-600 text-cream-50 border-walnut-700 shadow-chip";
  return (
    <div className="flex flex-wrap gap-1.5">
      {Array.from({ length: 12 }).map((_, pc) => {
        const sharp = pcToName(pc, false);
        const flat = pcToName(pc, true);
        const accidental = sharp !== flat;
        return (
          <button
            key={pc}
            type="button"
            aria-pressed={value === pc}
            onClick={() => onChange(pc)}
            className={`cursor-pointer w-12 h-12 rounded-xl border font-semibold transition-all flex flex-col items-center justify-center leading-none focus:outline-none focus-visible:ring-2 focus-visible:ring-honey-400 ${
              value === pc ? active : "bg-cream-50 text-bark-700 border-bark-200 hover:border-bark-400 hover:bg-cream-200"
            }`}
          >
            {accidental ? (
              <>
                <span className="text-[13px]">{sharp}</span>
                <span className="text-[11px] opacity-70 mt-0.5">{flat}</span>
              </>
            ) : (
              <span className="text-lg">{sharp}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
