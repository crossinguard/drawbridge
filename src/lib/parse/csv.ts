import type { Criterion, Rating, Rubric } from "../rubric/types";

export const HEADER_BASE = ["Rubric Name", "Criteria Name", "Criteria Description", "Criteria Enable Range"];

/** Parse CSV text into rows per RFC 4180 (handles quoted fields and newlines). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (next === '"') {
          field += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        row.push(field);
        field = "";
      } else if (char === "\r" || char === "\n") {
        row.push(field);
        if (row.some((cell) => cell !== "")) rows.push(row);
        row = [];
        field = "";
        if (char === "\r" && next === "\n") i++;
      } else {
        field += char;
      }
    }
  }

  // Push final field/row
  row.push(field);
  if (row.some((cell) => cell !== "")) rows.push(row);

  return rows;
}

/** Convert a Canvas rubric import CSV back into a Rubric. */
export function parseCanvasCsv(text: string): Rubric {
  const rows = parseCsv(text);
  if (rows.length < 2) {
    throw new Error("CSV must have a header row and at least one criterion row.");
  }

  const header = rows[0];
  for (let i = 0; i < HEADER_BASE.length; i++) {
    if (header[i]?.trim() !== HEADER_BASE[i]) {
      throw new Error(`Unexpected header column ${i + 1}: expected "${HEADER_BASE[i]}", got "${header[i]}"`);
    }
  }

  // Header repeats "Rating Name, Rating Description, Rating Points" for the widest criterion.
  const tripletCount = Math.floor((header.length - HEADER_BASE.length) / 3);

  const rubricName = rows[1][0]?.trim() || "Untitled Rubric";
  const criteria: Criterion[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.length < HEADER_BASE.length) continue;

    const name = row[1]?.trim() || `Criterion ${r}`;
    const description = row[2] ?? "";
    const ratings: Rating[] = [];

    for (let t = 0; t < tripletCount; t++) {
      const idx = HEADER_BASE.length + t * 3;
      if (idx >= row.length) break; // ragged row
      const ratingName = row[idx]?.trim() || `Rating ${t + 1}`;
      const ratingDescription = row[idx + 1] ?? "";
      const pointsRaw = row[idx + 2] ?? "0";
      const points = parseFloat(pointsRaw.replace(",", ".")) || 0;
      if (ratingName !== "" || ratingDescription !== "" || pointsRaw !== "") {
        ratings.push({ name: ratingName, description: ratingDescription, points, manual: true });
      }
    }

    if (ratings.length === 0) {
      ratings.push({ name: "Rating 1", description: "", points: 0, manual: true });
    }

    const maxPoints = Math.max(...ratings.map((rating) => rating.points), 0);
    criteria.push({ name, description, maxPoints, ratings });
  }

  if (criteria.length === 0) {
    throw new Error("No criteria rows found in CSV.");
  }

  return { name: rubricName, criteria };
}
