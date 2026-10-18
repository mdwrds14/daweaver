import { getNoteName, noteToMidi } from "./theoryEngine";

/**
 * Tablature data model.
 *
 * String indexes match the tuning arrays everywhere in the app:
 *   0 = lowest-pitched string (6th string on a regular guitar, 7th / 8th on an
 *   extended-range guitar)  ...  tuning.length - 1 = highest-pitched (1st string)
 */

export type NoteRole = "root" | "third" | "fifth" | "seventh" | "scale" | "blue" | "other";

export interface TabNote {
  string: number;
  fret: number;
  /** Suggested fretting-hand finger: 0 = open, 1 = index ... 4 = pinky. */
  finger?: number;
  /** Used for colouring (root, chord tone, blue note...). */
  role?: NoteRole;
  /** Note name, for tooltips / accessibility. */
  noteName?: string;
}

/** Notes that sound at the same time (a single note, or a whole chord strum). */
export interface TabColumn {
  notes: TabNote[];
  /** Text drawn above the column, e.g. a chord name. */
  label?: string;
  /**
   * How long the column lasts when played back, in note values: 1 = one note of the
   * value chosen in the player (quarter, eighth or sixteenth), 2 = twice that, etc.
   * Defaults to 1.
   */
  duration?: number;
}

export const DEFAULT_COLUMN_UNITS = 1;

export interface TabMeasure {
  columns: TabColumn[];
}

export interface TabData {
  title?: string;
  /** Open-string names, lowest string first (same order as Tuning.notes). */
  tuning: string[];
  measures: TabMeasure[];
}

/**
 * String labels for display, lowest string first. The highest string is written in
 * lowercase (e B G D A E), the usual tab convention that also tells the two E strings apart.
 */
export function tabStringLabels(tuning: string[]): string[] {
  return tuning.map((n, i) => {
    const name = getNoteName(n);
    return i === tuning.length - 1 ? name.charAt(0).toLowerCase() + name.slice(1) : name;
  });
}

/** A column together with where it sits in the tab (used by the player and the playhead). */
export interface FlatColumn {
  /** Position in the flattened column list (0-based). */
  index: number;
  measure: number;
  column: number;
  notes: TabNote[];
  label?: string;
  /** Length in note values (see TabColumn.duration). */
  units: number;
}

/** Every column of the tab in playing order, with its position and duration. */
export function flattenTab(tab: TabData): FlatColumn[] {
  const out: FlatColumn[] = [];
  tab.measures.forEach((measure, mi) => {
    measure.columns.forEach((column, ci) => {
      const units = column.duration !== undefined && column.duration > 0 ? column.duration : DEFAULT_COLUMN_UNITS;
      out.push({ index: out.length, measure: mi, column: ci, notes: column.notes, label: column.label, units });
    });
  });
  return out;
}

/** Total number of columns in the tab. */
export function countColumns(tab: TabData): number {
  return tab.measures.reduce((a, m) => a + m.columns.length, 0);
}

/** MIDI pitch of a tab note in the given tuning (open-string names, lowest first). */
export function tabNoteMidi(tuning: string[], note: Pick<TabNote, "string" | "fret">): number {
  const open = noteToMidi(tuning[note.string] ?? tuning[0]);
  return open + note.fret;
}

/** Split a flat list of columns into measures of `perMeasure` columns. */
export function columnsToMeasures(columns: TabColumn[], perMeasure: number): TabMeasure[] {
  const measures: TabMeasure[] = [];
  for (let i = 0; i < columns.length; i += perMeasure) {
    measures.push({ columns: columns.slice(i, i + perMeasure) });
  }
  return measures;
}

/**
 * Renders the tab as classic ASCII tablature, e.g.
 *
 *   e|-----0-1-|
 *   B|---1-----|
 *   G|-2-------|
 */
export function tabToAscii(tab: TabData): string {
  const stringCount = tab.tuning.length;
  const names = tabStringLabels(tab.tuning);
  // Right-align the string labels so the lines start in the same column.
  const labelWidth = Math.max(...names.map((n) => n.length));
  const lines: string[] = Array.from({ length: stringCount }, (_, i) => {
    // Top line of the ASCII tab is the highest string, so reverse the order.
    const stringIndex = stringCount - 1 - i;
    return names[stringIndex].padStart(labelWidth) + "|";
  });

  const labelLine: string[] = [];
  let hasLabels = false;

  for (const measure of tab.measures) {
    for (const column of measure.columns) {
      // Column width adapts to 2-digit frets so vertical alignment is preserved.
      const width = Math.max(1, ...column.notes.map((n) => String(n.fret).length));
      for (let i = 0; i < stringCount; i++) {
        const stringIndex = stringCount - 1 - i;
        const note = column.notes.find((n) => n.string === stringIndex);
        const cell = note ? String(note.fret).padEnd(width, "-") : "-".repeat(width);
        lines[i] += "-" + cell + "-";
      }
      if (column.label) hasLabels = true;
      labelLine.push(column.label ? column.label.padEnd(width + 2) : " ".repeat(width + 2));
    }
    for (let i = 0; i < stringCount; i++) lines[i] += "|";
    labelLine.push(" ");
  }

  const header = hasLabels ? " ".repeat(labelWidth + 1) + labelLine.join("") + "\n" : "";
  return header + lines.join("\n");
}
