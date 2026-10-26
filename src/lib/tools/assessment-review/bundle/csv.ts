/**
 * Writing CSV.
 *
 * The export carries its data as CSV so that an assistant can query it. The
 * rules are the ordinary ones: a field that holds a comma, a quotation mark
 * or a newline is quoted, and a quotation mark inside a quoted field is
 * doubled.
 */

/** One table of the export. */
export interface Table {
  /** The file name, without the folder. */
  name: string;
  /** What the table holds, for the manifest and the brief. */
  purpose: string;
  /** The column names. */
  columns: string[];
  /** The rows, one array of cells per row. */
  rows: string[][];
}

/** Build a table. */
export function table(name: string, purpose: string, columns: string[], rows: string[][]): Table {
  return { name, purpose, columns, rows };
}

/** Write a table as CSV, with a header row. */
export function toCsv(source: Table): string {
  const lines = [source.columns.map((column) => quote(column)).join(",")];

  for (const row of source.rows) {
    lines.push(row.map((cell) => quote(cell ?? "")).join(","));
  }

  return `${lines.join("\n")}\n`;
}

/** Quote a field if it has to be quoted. */
function quote(value: string): string {
  if (value === "") return '""';

  const needsQuotes = /[",\n\r]/.test(value);
  if (!needsQuotes) return value;

  return `"${value.replace(/"/g, '""')}"`;
}
