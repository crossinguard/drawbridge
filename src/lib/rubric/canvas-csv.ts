import type { Rubric } from "./types";

const HEADER_BASE = ["Rubric Name", "Criteria Name", "Criteria Description", "Criteria Enable Range"];

/** Escape one CSV field per RFC 4180. */
export function escapeCsv(value: string): string {
  const s = value ?? "";
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Format points without float noise: 2 -> "2", 2.5 -> "2.5", 2.25 -> "2.25". */
export function formatPoints(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const rounded = Math.round(n * 100) / 100;
  return String(Number.isInteger(rounded) ? rounded : parseFloat(rounded.toFixed(2)));
}

/**
 * Serialize a rubric into the Canvas rubric import CSV format.
 *
 * Shape (per scripts/fixtures/import_rubric_template.csv):
 * - One row per criterion; ratings flatten into repeating
 *   `Rating Name, Rating Description, Rating Points` triplets.
 * - Header contains as many triplets as the widest criterion; rows may be
 *   ragged (fewer triplets) when a criterion has fewer ratings.
 * - Criteria Enable Range is always "false" (fixed points per rating).
 */
export function toCanvasCsv(rubric: Rubric): string {
  const maxRatings = rubric.criteria.reduce((max, c) => Math.max(max, c.ratings.length), 0);
  const header = [...HEADER_BASE];
  for (let i = 0; i < maxRatings; i++) header.push("Rating Name", "Rating Description", "Rating Points");

  const lines = [header.map(escapeCsv).join(",")];

  for (const criterion of rubric.criteria) {
    const row = [rubric.name, criterion.name, criterion.description, "false"];
    for (const rating of criterion.ratings) {
      row.push(rating.name, rating.description, formatPoints(rating.points));
    }
    lines.push(row.map(escapeCsv).join(","));
  }

  return lines.join("\r\n") + "\r\n";
}
