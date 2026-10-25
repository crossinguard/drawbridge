/**
 * Parse pasted plain text into a table grid.
 * Supports markdown-style pipe tables and tab-separated values
 * (what Word puts on the clipboard as plain text).
 */
export function parseTextTable(text: string): string[][] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\u00a0/g, " "))
    .filter((line) => line.trim() !== "");

  if (lines.length === 0) return [];

  const hasPipe = lines.some((line) => line.includes("|"));
  if (hasPipe) {
    const rows = lines.map(pipeRow).filter((row) => !isSeparatorRow(row));
    // Ignore rows that are single empty cells (trailing pipes, etc.)
    return rows.filter((row) => row.some((cell) => cell !== ""));
  }

  const hasTab = lines.some((line) => line.includes("\t"));
  if (hasTab) {
    return lines.map((line) => line.split("\t").map((cell) => cell.trim().replace(/\s+/g, " ")));
  }

  // No recognizable delimiter: treat each line as a single cell.
  return lines.map((line) => [line.trim()]);
}

function pipeRow(line: string): string[] {
  let l = line.trim();
  if (l.startsWith("|")) l = l.slice(1);
  if (l.endsWith("|") && !l.endsWith("\\|")) l = l.slice(0, -1);
  return l.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, "|").replace(/\s+/g, " "));
}

function isSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every((cell) => /^:?-{2,}:?$/.test(cell.trim()));
}
