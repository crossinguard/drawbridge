import type { ExtractedTable } from "../rubric/types";

/**
 * Extract tables from an HTML string (rich paste from Word, or mammoth's
 * docx-to-HTML output) into normalized grids with spans expanded.
 */
export function extractHtmlTables(html: string, source?: string): ExtractedTable[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return Array.from(doc.querySelectorAll("table"))
    .map((table) => extractTable(table, source))
    .filter((t) => t.rows.length > 0);
}

/** Expand a DOM table (rowspan/colspan) into a rectangular grid of text. */
export function extractTable(table: Element, source?: string): ExtractedTable {
  const occupied = new Set<string>();
  const rows: string[][] = [];

  const trs = Array.from(table.querySelectorAll(":scope > tr, :scope > tbody > tr, :scope > thead > tr"));
  const rowIdxOfTbody = trs.length > 0 ? trs : Array.from(table.querySelectorAll("tr"));

  rowIdxOfTbody.forEach((tr, rowIdx) => {
    rows[rowIdx] = rows[rowIdx] ?? [];
    let col = 0;
    for (const cell of Array.from(tr.children)) {
      const tag = cell.tagName.toUpperCase();
      if (tag !== "TD" && tag !== "TH") continue;
      while (occupied.has(`${rowIdx},${col}`)) col++;
      const text = normalizeCellText(cell.textContent ?? "");
      const rowspan = clampSpan(cell.getAttribute("rowspan"));
      const colspan = clampSpan(cell.getAttribute("colspan"));
      for (let r = rowIdx; r < rowIdx + rowspan; r++) {
        for (let c = col; c < col + colspan; c++) {
          occupied.add(`${r},${c}`);
          rows[r] = rows[r] ?? [];
          if (rows[r][c] === undefined) {
            // Rowspan propagates the anchor value down (merged data cells share
            // the value); colspan fills empty so merged headers don't repeat
            // into every spanned column.
            rows[r][c] = c === col ? text : "";
          }
        }
      }
      col += colspan;
    }
  });

  // Rectangularize: fill gaps, drop fully-empty columns.
  const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
  const keep: number[] = [];
  for (let c = 0; c < width; c++) {
    const used = rows.some((r) => (r[c] ?? "").trim() !== "");
    if (used) keep.push(c);
  }
  const normalized = rows.map((r) => keep.map((c) => r[c] ?? ""));

  return { rows: normalized, source };
}

function clampSpan(value: string | null): number {
  const n = parseInt(value ?? "1", 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 50);
}

/** Single-line, whitespace-normalized cell text. */
export function normalizeCellText(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
