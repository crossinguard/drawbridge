import type { Mapping, Outcome, OutcomeLevel, ParsedInput } from "./types";
import { OUTCOME_LEVELS } from "./types";

/**
 * Parse CSV/TSV text into outcomes and optional mappings.
 *
 * Supported shapes:
 * - level, id, text
 * - level, id, text, mapsTo
 *
 * Column names are case-insensitive. Whitespace is trimmed. Blank rows are ignored.
 * The `mapsTo` column contains comma-separated parent outcome IDs.
 */
export function parseOutcomes(input: string): ParsedInput {
  const lines = input.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length === 0) {
    return { outcomes: [], mappings: [], warnings: [] };
  }

  const delimiter = detectDelimiter(lines[0]);
  const headers = splitRow(lines[0], delimiter).map(normalizeHeader);
  const rows = lines.slice(1).map((line) => splitRow(line, delimiter));

  const levelIdx = headers.indexOf("level");
  const idIdx = headers.indexOf("id");
  const textIdx = headers.indexOf("text");
  const mapsToIdx = headers.indexOf("mapsto");

  const warnings: string[] = [];
  const outcomes: Outcome[] = [];
  const mappings: Mapping[] = [];
  const seenIds = new Set<string>();

  if (levelIdx === -1 || idIdx === -1 || textIdx === -1) {
    warnings.push(
      "Could not find required columns: level, id, text. Please check the header row."
    );
    return { outcomes: [], mappings: [], warnings };
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const levelRaw = row[levelIdx]?.trim() ?? "";
    const id = row[idIdx]?.trim() ?? "";
    const text = row[textIdx]?.trim() ?? "";

    if (!id && !text) continue;
    if (!id) {
      warnings.push(`Row ${i + 2}: missing id, skipped.`);
      continue;
    }
    if (!text) {
      warnings.push(`Row ${i + 2}: missing text, skipped.`);
      continue;
    }

    const level = normalizeLevel(levelRaw);
    if (!level) {
      warnings.push(
        `Row ${i + 2}: unknown level "${levelRaw}". Use program, course, or assessment.`
      );
      continue;
    }

    if (seenIds.has(id)) {
      warnings.push(`Row ${i + 2}: duplicate id "${id}", skipped.`);
      continue;
    }
    seenIds.add(id);

    outcomes.push({ id, level, text });

    if (mapsToIdx !== -1) {
      const mapsTo = row[mapsToIdx]?.trim() ?? "";
      if (mapsTo) {
        mapsTo
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .forEach((parentId) => {
            mappings.push({ childId: id, parentId });
          });
      }
    }
  }

  return { outcomes, mappings, warnings };
}

function detectDelimiter(headerRow: string): string {
  const commas = headerRow.split(",").length - 1;
  const tabs = headerRow.split("\t").length - 1;
  return tabs > commas ? "\t" : ",";
}

function splitRow(line: string, delimiter: string): string[] {
  if (delimiter === "\t") return line.split("\t");

  const result: string[] = [];
  let current = "";
  let insideQuotes = false;

  for (const char of line) {
    if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === "," && !insideQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);

  return result.map((cell) => cell.trim().replace(/^"|"$/g, ""));
}

function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeLevel(value: string): OutcomeLevel | null {
  const normalized = value.toLowerCase().trim();
  const match = OUTCOME_LEVELS.find((level) => level === normalized || normalized.startsWith(level.slice(0, 4)));
  return match ?? null;
}
