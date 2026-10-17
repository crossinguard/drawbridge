import type { Mapping, Outcome, OutcomeLevel } from "./types";
import { OUTCOME_LEVELS } from "./types";

/**
 * Export outcomes and mappings as a CSV alignment table.
 *
 * Columns: child level, child id, child text, parent level, parent id, parent text
 */
export function exportAlignments(outcomes: Outcome[], mappings: Mapping[]): string {
  const outcomeMap = new Map(outcomes.map((o) => [o.id, o]));
  const rows: string[] = ["Child Level,Child ID,Child Text,Parent Level,Parent ID,Parent Text"];

  for (const mapping of mappings) {
    const child = outcomeMap.get(mapping.childId);
    const parent = outcomeMap.get(mapping.parentId);
    if (!child || !parent) continue;
    rows.push(
      [
        escapeCsv(child.level),
        escapeCsv(child.id),
        escapeCsv(child.text),
        escapeCsv(parent.level),
        escapeCsv(parent.id),
        escapeCsv(parent.text),
      ].join(",")
    );
  }

  return rows.join("\n");
}

/**
 * Export outcomes back to the simple level/id/text format, appending mapsTo when mappings exist.
 */
export function exportOutcomes(outcomes: Outcome[], mappings: Mapping[]): string {
  const parentsByChild = new Map<string, string[]>();
  for (const { childId, parentId } of mappings) {
    if (!parentsByChild.has(childId)) parentsByChild.set(childId, []);
    parentsByChild.get(childId)!.push(parentId);
  }

  const rows: string[] = ["level,id,text,mapsTo"];
  for (const outcome of outcomes) {
    const mapsTo = parentsByChild.get(outcome.id)?.join(",") ?? "";
    rows.push(
      [escapeCsv(outcome.level), escapeCsv(outcome.id), escapeCsv(outcome.text), escapeCsv(mapsTo)].join(",")
    );
  }

  return rows.join("\n");
}

function escapeCsv(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n") || value.includes("\r")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function groupByLevel(outcomes: Outcome[]): Record<OutcomeLevel, Outcome[]> {
  const grouped: Record<OutcomeLevel, Outcome[]> = {
    program: [],
    course: [],
    assessment: [],
  };
  for (const outcome of outcomes) {
    grouped[outcome.level].push(outcome);
  }
  return grouped;
}

/**
 * Return the level immediately above the given level, or null if there is none.
 */
export function parentLevel(level: OutcomeLevel): OutcomeLevel | null {
  const index = OUTCOME_LEVELS.indexOf(level);
  return index > 0 ? OUTCOME_LEVELS[index - 1] : null;
}
