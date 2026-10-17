/**
 * Serializer + parser sanity checks, run with: bun ./scripts/verify-serializer.ts
 * Validates output shape against src/assets/reference/import_rubric_template.csv.
 */
import { readFileSync } from "node:fs";

import { formatPoints, toCanvasCsv } from "../src/lib/rubric/canvas-csv";
import { computePoints, presetPercentages, recomputeAll } from "../src/lib/rubric/points";
import { DEFAULT_SETTINGS, type Rubric } from "../src/lib/rubric/types";
import { parseTextTable } from "../src/lib/parse/text";
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

// 1) Round-trip against the Canvas reference template.
const reference = readFileSync(
  new URL("../src/assets/reference/import_rubric_template.csv", import.meta.url),
  "utf8",
);

const referenceRubric: Rubric = {
  name: "Rubric 1",
  criteria: [
    {
      name: "Criteria 1",
      description: "Criteria 1 Description",
      maxPoints: 2,
      ratings: [
        { name: "Rating 1", description: "Rating 1 Description", points: 2, manual: false },
        { name: "Rating 2", description: "Rating 2 Description", points: 1, manual: false },
        { name: "Rating 3", description: "Rating 3 Description", points: 0, manual: false },
      ],
    },
    {
      name: "Criteria 2",
      description: "Criteria 2 Description",
      maxPoints: 1,
      ratings: [
        { name: "Criteria 2 Rating 1", description: "Rating Description", points: 1, manual: false },
        { name: "Criteria 2 Rating 2", description: "Rating 2 Description", points: 1, manual: false },
      ],
    },
  ],
};

const normalize = (csv: string) => csv.replace(/\r\n/g, "\n").trim();
check("serializer matches reference template", normalize(toCanvasCsv(referenceRubric)), normalize(reference));

// 2) CSV escaping.
const escapingRubric: Rubric = {
  name: 'My "Rubric", v2',
  criteria: [
    {
      name: "Criterion, with comma",
      description: 'Says "hello"',
      maxPoints: 3,
      ratings: [{ name: "Full credit", description: "All, of it", points: 3, manual: false }],
    },
  ],
};
const escapingCsv = toCanvasCsv(escapingRubric);
check(
  "quotes and commas are escaped",
  escapingCsv.split(/\r?\n/)[1],
  '"My ""Rubric"", v2","Criterion, with comma","Says ""hello""",false,Full credit,"All, of it",3',
);

// 3) Points engine.
check("full-half-zero percentages (4 levels)", presetPercentages("full-half-zero", 4, []), [100, 50, 0, 0]);
check("full-half-zero percentages (2 levels)", presetPercentages("full-half-zero", 2, []), [100, 50]);
check(
  "even percentages (4 levels)",
  presetPercentages("even", 4, []).map((p) => Math.round(p * 100) / 100),
  [100, Math.round((100 * 2) / 3 * 100) / 100, Math.round((100 / 3) * 100) / 100, 0],
);
check("half rounds up (5 pts)", computePoints(5, 50, "up"), 3);
check("half rounds up (2 pts)", computePoints(2, 50, "up"), 1);
check("formatPoints trims float noise", formatPoints(2.5), "2.5");
check("formatPoints keeps integers clean", formatPoints(4), "4");

// 4) Markdown table parse → rubric.
const markdown = [
  "| Criterion Name | Points | Rating A | Rating B | Rating C | Rating D |",
  "| -------------- | ------ | -------- | -------- | -------- | -------- |",
  "| Thesis | 5 | Clear, focused thesis | Vague thesis | Missing | Missing |",
  "| Evidence | 4 | Strong evidence | Some evidence | Little evidence | None |",
].join("\n");

const rows = parseTextTable(markdown);
check("markdown rows parsed", rows.length, 3);
const draft = tableToRubric({ rows }, { defaultName: "Essay rubric", settings: DEFAULT_SETTINGS });
check("header detected", draft.usedHeader, true);
check("rating names from headers", draft.rubric.criteria[0]?.ratings.map((r) => r.name), [
  "Rating A",
  "Rating B",
  "Rating C",
  "Rating D",
]);
check("default points (5 pts, round up)", draft.rubric.criteria[0]?.ratings.map((r) => r.points), [5, 3, 0, 0]);
check("default points (4 pts, round up)", draft.rubric.criteria[1]?.ratings.map((r) => r.points), [4, 2, 0, 0]);
check("rubric name from defaultName", draft.rubric.name, "Essay rubric");

// 5) Ragged rows: trailing empty rating cells are trimmed per criterion.
const ragged = [
  ["Criterion Name", "Points", "Rating A", "Rating B", "Rating C"],
  ["Style", "2", "Great", "", ""],
];
const raggedDraft = tableToRubric({ rows: ragged }, { settings: DEFAULT_SETTINGS });
check("trailing empty ratings trimmed", raggedDraft.rubric.criteria[0]?.ratings.length, 1);

// 6) TSV parse.
const tsv = "Criterion Name\tPoints\tRating A\tRating B\nEvidence\t3\tStrong\tWeak";
const tsvRows = parseTextTable(tsv);
check("tsv rows parsed", tsvRows[1], ["Evidence", "3", "Strong", "Weak"]);

// 7) Recompute points after removing a rating level (regression guard for the UI bug).
const levelRemovalRubric: Rubric = {
  name: "Level removal test",
  criteria: [
    {
      name: "C",
      description: "",
      maxPoints: 5,
      ratings: [
        { name: "A", description: "", points: 0, manual: false },
        { name: "B", description: "", points: 0, manual: false },
        { name: "C", description: "", points: 0, manual: false },
        { name: "D", description: "", points: 0, manual: false },
      ],
    },
  ],
};
recomputeAll(levelRemovalRubric, { preset: "even", rounding: "up", customPercentages: [] });
check("even points before level removal", levelRemovalRubric.criteria[0]?.ratings.map((r) => r.points), [5, 4, 2, 0]);
levelRemovalRubric.criteria[0]?.ratings.pop();
recomputeAll(levelRemovalRubric, { preset: "even", rounding: "up", customPercentages: [] });
check("even points after level removal", levelRemovalRubric.criteria[0]?.ratings.map((r) => r.points), [5, 3, 0]);

// 8) Custom percentages grow/shrink with rating levels.
const customRubric: Rubric = {
  name: "Custom pct test",
  criteria: [
    {
      name: "C",
      description: "",
      maxPoints: 10,
      ratings: [
        { name: "A", description: "", points: 0, manual: false },
        { name: "B", description: "", points: 0, manual: false },
      ],
    },
  ],
};
recomputeAll(customRubric, { preset: "custom", rounding: "exact", customPercentages: [100, 50] });
check("custom percentages initial", customRubric.criteria[0]?.ratings.map((r) => r.points), [10, 5]);
customRubric.criteria[0]?.ratings.push({ name: "C", description: "", points: 0, manual: false });
recomputeAll(customRubric, { preset: "custom", rounding: "exact", customPercentages: [100, 50, 25] });
check("custom percentages after adding level", customRubric.criteria[0]?.ratings.map((r) => r.points), [10, 5, 2.5]);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll checks passed.");
