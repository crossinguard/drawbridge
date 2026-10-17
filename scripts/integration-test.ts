/**
 * Integration test for the .docx import path (run with: bun run test).
 * Builds the shared sample document (public/sample-rubric.docx, via
 * scripts/make-sample-docx.ts), then runs it through mammoth →
 * extractHtmlTables → tableToRubric, using a jsdom DOMParser to mimic the
 * browser environment.
 */
import { JSDOM } from "jsdom";

// Provide a browser-like global before importing the parse pipeline.
const dom = new JSDOM("<!doctype html><html><body></body></html>");
(globalThis as Record<string, unknown>).DOMParser = dom.window.DOMParser;

const mammoth = (await import("mammoth")).default;

import { DEFAULT_SETTINGS, type ExtractedTable } from "../src/lib/rubric/types";
import { extractHtmlTables } from "../src/lib/parse/html";
import { tableToRubric } from "../src/lib/parse/table-to-rubric";
import { buildSampleDocx } from "./make-sample-docx";

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
// mammoth → HTML → tables → rubric (sample docx: rubric table + course table)
// ---------------------------------------------------------------------------

// Node/bun builds of mammoth take `buffer`; the browser build (verified in the
// production bundle) takes `arrayBuffer`, which is what src/lib/parse/docx.ts uses.
const docxBytes = await buildSampleDocx();
const { value: html, messages } = await mammoth.convertToHtml({ buffer: Buffer.from(docxBytes) });
check("mammoth converts without errors", messages.filter((m) => m.type === "error").length, 0);
check("mammoth output contains a table", /<table[\s>]/.test(html), true);

const tables: ExtractedTable[] = extractHtmlTables(html, "sample-rubric.docx");
check("both tables extracted", tables.length, 2);
check("rubric table rows extracted", tables[0]?.rows.length, 5);
check("course info table rows", tables[1]?.rows[1], ["Semester", "Fall 2026"]);

const draft = tableToRubric(tables[0], { defaultName: "sample-rubric", settings: DEFAULT_SETTINGS });
check("header detected", draft.usedHeader, true);
check("rubric name from file name", draft.rubric.name, "sample-rubric");
check("criterion names", draft.rubric.criteria.map((c) => c.name), [
  "Thesis",
  "Evidence",
  "Organization & clarity",
  "Style & tone",
]);
check("max points parsed", draft.rubric.criteria.map((c) => c.maxPoints), [5, 4, 3, 2]);
check("rating names from header", draft.rubric.criteria[0]?.ratings.map((r) => r.name), [
  "Exemplary",
  "Proficient",
  "Developing",
  "Beginning",
]);
check("ragged rating counts (blank trailing cells dropped)", draft.rubric.criteria.map((c) => c.ratings.length), [
  4,
  4,
  3,
  2,
]);
check("points distribution (5 pts, half up)", draft.rubric.criteria[0]?.ratings.map((r) => r.points), [5, 3, 0, 0]);
check("points distribution (ragged 3 pts)", draft.rubric.criteria[2]?.ratings.map((r) => r.points), [3, 2, 0]);
check("points distribution (ragged 2 pts)", draft.rubric.criteria[3]?.ratings.map((r) => r.points), [2, 1]);
check("comma/quote description preserved", draft.rubric.criteria[1]?.ratings[0]?.description, 'Integrates relevant quotes and examples that "show, don\'t tell", and each one is tied back to the claim.');
check("descriptions are full sentences", draft.rubric.criteria[0]?.ratings[1]?.description, "States a workable claim, though parts of the essay drift away from proving it.");
check("no parse warnings for the sample", draft.warnings.length, 0);

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
