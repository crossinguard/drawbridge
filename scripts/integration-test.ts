/**
 * Integration test for the .docx import path (run with: bun ./scripts/integration-test.ts).
 * Builds a real .docx with JSZip, then runs it through mammoth → extractHtmlTables →
 * tableToRubric, using a jsdom DOMParser to mimic the browser environment.
 */
import { JSDOM } from "jsdom";
import JSZip from "jszip";

// Provide a browser-like global before importing the parse pipeline.
const dom = new JSDOM("<!doctype html><html><body></body></html>");
(globalThis as Record<string, unknown>).DOMParser = dom.window.DOMParser;

const mammoth = (await import("mammoth")).default;

import { DEFAULT_SETTINGS, type ExtractedTable } from "../src/lib/rubric/types";
import { extractHtmlTables } from "../src/lib/parse/html";
import { tableToRubric } from "../src/lib/parse/table-to-rubric";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ok — ${name}`);
  } else {
    failures++;
    console.error(`  FAIL — ${name}\n    expected: ${e}\n    actual:   ${a}`);
  }
}

// ---------------------------------------------------------------------------
// Build a .docx containing one rubric table
// ---------------------------------------------------------------------------

const tableXml = (rows: string[][]): string => {
  const trs = rows
    .map(
      (cells) =>
        `<w:tr>${cells
          .map((text) => `<w:tc><w:tcPr/><w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p></w:tc>`)
          .join("")}</w:tr>`,
    )
    .join("");
  return `<w:tbl><w:tblPr/><w:tblGrid>${rows[0].map(() => "<w:gridCol/>").join("")}</w:tblGrid>${trs}</w:tbl>`;
};

const rubricRows = [
  ["Criterion Name", "Points", "Rating A", "Rating B", "Rating C", "Rating D"],
  ["Thesis", "5", "Clear, focused thesis", "Vague thesis", "Missing", "Missing"],
  ["Evidence", "4", "Strong evidence", "Some evidence", "Little evidence", "None"],
];

const zip = new JSZip();
zip.file(
  "[Content_Types].xml",
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
);
zip.file(
  "_rels/.rels",
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
);
zip.file(
  "word/document.xml",
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${tableXml(rubricRows)}</w:body>
</w:document>`,
);

const arrayBuffer = await zip.generateAsync({ type: "arraybuffer" });

// ---------------------------------------------------------------------------
// mammoth → HTML → tables → rubric
// ---------------------------------------------------------------------------

// Node/bun builds of mammoth take `buffer`; the browser build (verified in the
// production bundle) takes `arrayBuffer`, which is what src/lib/parse/docx.ts uses.
const { value: html, messages } = await mammoth.convertToHtml({ buffer: Buffer.from(arrayBuffer) });
check("mammoth converts without errors", messages.filter((m) => m.type === "error").length, 0);
check("mammoth output contains a table", /<table[\s>]/.test(html), true);

const tables: ExtractedTable[] = extractHtmlTables(html, "test.docx");
check("one table extracted", tables.length, 1);
check("table rows extracted", tables[0]?.rows.length, 3);

const draft = tableToRubric(tables[0], { defaultName: "test", settings: DEFAULT_SETTINGS });
check("header detected", draft.usedHeader, true);
check("rubric name from file name", draft.rubric.name, "test");
check("criterion names", draft.rubric.criteria.map((c) => c.name), ["Thesis", "Evidence"]);
check("rating names from header", draft.rubric.criteria[0]?.ratings.map((r) => r.name), [
  "Rating A",
  "Rating B",
  "Rating C",
  "Rating D",
]);
check("max points parsed", draft.rubric.criteria.map((c) => c.maxPoints), [5, 4]);
check("points distribution (5 pts)", draft.rubric.criteria[0]?.ratings.map((r) => r.points), [5, 3, 0, 0]);
check("points distribution (4 pts)", draft.rubric.criteria[1]?.ratings.map((r) => r.points), [4, 2, 0, 0]);

// ---------------------------------------------------------------------------
// Rich-paste table with merged cells (rowspan on points, colspan in header)
// ---------------------------------------------------------------------------

const pastedHtml = `<html><body>
  <table>
    <tr><th colspan="2">Rubric basics</th><th>Full credit</th><th>Half credit</th></tr>
    <tr><th>Criterion Name</th><th>Points</th><th>Rating A</th><th>Rating B</th></tr>
    <tr><td>Style</td><td rowspan="2">2</td><td>Great style</td><td>Meh</td></tr>
    <tr><td>Tone</td><td>Great tone</td><td>Meh tone</td></tr>
  </table>
</body></html>`;

const pasteTables = extractHtmlTables(pastedHtml, "pasted");
check("pasted table rows (spans expanded)", pasteTables[0]?.rows, [
  ["Rubric basics", "", "Full credit", "Half credit"],
  ["Criterion Name", "Points", "Rating A", "Rating B"],
  ["Style", "2", "Great style", "Meh"],
  ["Tone", "2", "Great tone", "Meh tone"],
]);

const pasteDraft = tableToRubric(pasteTables[0], { settings: DEFAULT_SETTINGS });
check("header detected on second row", pasteDraft.usedHeader, true);
check("merged-cell rubric criteria", pasteDraft.rubric.criteria.map((c) => c.name), ["Style", "Tone"]);
check("merged-cell max points (rowspan propagated)", pasteDraft.rubric.criteria.map((c) => c.maxPoints), [2, 2]);
check("merged-cell rating names from real header row", pasteDraft.rubric.criteria[0]?.ratings.map((r) => r.name), [
  "Rating A",
  "Rating B",
]);
check("merged-cell warnings include first-row note", pasteDraft.warnings.length, 1);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll integration checks passed.");
