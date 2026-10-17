import { applyPoints } from "../rubric/points";
import type { ExtractedTable, Rubric, RubricDraft, RubricSettings } from "../rubric/types";
import { normalizeCellText } from "./html";

/** Cells that look like column headers for a rubric table. */
const HEADER_KEYWORDS =
  /^(criteri(?:on|a)|points?|ratings?|levels?|scores?|descriptors?|descriptions?|total|max(?:imum)?|weights?|grades?|marks?)\b/i;

const POINTS_PATTERN = /-?\d+(?:[.,]\d+)?/;

export interface TableToRubricOptions {
  /** Default rubric name (e.g. file name without extension). */
  defaultName?: string;
  /** Force first row handling; undefined = auto-detect. */
  firstRowIsHeader?: boolean;
  settings: RubricSettings;
}

/** Heuristic: a header row has at least two header-ish cells. */
export function looksLikeHeader(cells: string[]): boolean {
  return cells.filter((cell) => HEADER_KEYWORDS.test(cell.trim())).length >= 2;
}

/**
 * Find the header row: check the first two rows, since Word rubrics often
 * start with a banner/title row above the real header. Returns the row index
 * or -1 when none looks like a header.
 */
function findHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(2, rows.length); i++) {
    if (looksLikeHeader(rows[i])) return i;
  }
  return -1;
}

/** Convert a normalized table grid into a rubric draft. */
export function tableToRubric(table: ExtractedTable, opts: TableToRubricOptions): RubricDraft {
  const warnings: string[] = [];
  const rows = table.rows.map((row) => row.map(normalizeCellText)).filter((row) => row.some((cell) => cell !== ""));
  if (rows.length === 0) {
    return { rubric: emptyRubric(opts.defaultName), usedHeader: false, warnings: ["The table is empty."] };
  }

  const headerIndex =
    opts.firstRowIsHeader !== undefined
      ? opts.firstRowIsHeader
        ? 0
        : -1
      : findHeaderRow(rows);
  const usedHeader = headerIndex >= 0;
  const header = usedHeader ? rows[headerIndex] : [];
  const dataRows = rows.slice(headerIndex + 1);

  // Column 0 = criterion, column 1 = max points, columns 2+ = rating descriptions.
  const levelCount = Math.max(0, ...dataRows.map((row) => row.length - 2, 0));
  const ratingNames: string[] = [];
  for (let i = 0; i < levelCount; i++) {
    const name = (header[2 + i] ?? "").trim();
    ratingNames.push(name !== "" ? name : `Rating ${i + 1}`);
  }
  if (!usedHeader) {
    warnings.push("No header row was detected. Rating names default to \"Rating 1, 2, …\" — edit them below if needed.");
  } else if (headerIndex > 0) {
    warnings.push(`Row ${headerIndex} looks like a title/banner row and was skipped.`);
  }

  const criteria: Rubric["criteria"] = [];
  dataRows.forEach((row, idx) => {
    const rowNumber = idx + headerIndex + 2;
    const name = (row[0] ?? "").trim();
    if (name === "" && row.slice(1).every((cell) => cell.trim() === "")) return;

    const pointsRaw = (row[1] ?? "").trim();
    const match = pointsRaw.match(POINTS_PATTERN);
    let maxPoints = 1;
    if (match) {
      maxPoints = Math.max(0, parseFloat(match[0].replace(",", ".")));
    } else if (pointsRaw !== "") {
      warnings.push(`Row ${rowNumber}: could not read points from "${pointsRaw}" — defaulted to 1.`);
    } else {
      warnings.push(`Row ${rowNumber}: no points value found — defaulted to 1.`);
    }

    // Trim trailing empty rating cells per criterion (Canvas allows ragged rows).
    const descriptions = row.slice(2);
    while (descriptions.length > 0 && descriptions[descriptions.length - 1].trim() === "") descriptions.pop();

    const ratings = (descriptions.length > 0 ? descriptions : [""]).map((description, i) => ({
      name: ratingNames[i] ?? `Rating ${i + 1}`,
      description: description.trim(),
      points: 0,
      manual: false,
    }));

    if (descriptions.length === 0) {
      warnings.push(`Row ${rowNumber}: no rating descriptions found — added one empty rating.`);
    }

    criteria.push({ name, description: "", maxPoints, ratings });
  });

  if (criteria.length === 0) {
    warnings.push("No criteria rows found in the table.");
  }

  const rubric: Rubric = {
    name: opts.defaultName?.trim() || "Untitled Rubric",
    criteria,
  };
  for (const criterion of rubric.criteria) applyPoints(criterion, opts.settings);

  return { rubric, usedHeader, warnings };
}

function emptyRubric(name?: string): Rubric {
  return { name: name?.trim() || "Untitled Rubric", criteria: [] };
}
