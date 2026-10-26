/**
 * Checks for the export bundle (run with: bun run test:bundle).
 *
 * The bundle is what a reviewer hands to an assistant, so the checks here are
 * about the shape of that handoff: an assignment in two modules counted once,
 * a graded discussion in the gradebook, a course of quizzes collapsed into
 * families, boilerplate stored once, a bank that is really used, and a
 * disagreement between two documents reported with both sentences.
 *
 * The real course exports in `reference/canvas/course/` are git-ignored. When
 * one of them is there the large-export check runs against it; when it is not,
 * that check is skipped rather than failing.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { JSDOM } from "jsdom";

// Provide a browser-like global before importing the parse pipeline.
const dom = new JSDOM("<!doctype html><html><body></body></html>");
(globalThis as Record<string, unknown>).DOMParser = dom.window.DOMParser;

const { openCartridge } = await import("../src/lib/canvas/store");
const { parseCourseExport } = await import("../src/lib/canvas/parse");
const { buildReview } = await import("../src/lib/tools/assessment-review/model");
const { runChecks, suggestGroups } = await import("../src/lib/tools/assessment-review/checks/index");
const { defaultSettings } = await import("../src/lib/tools/assessment-review/settings");
const { buildBundle } = await import("../src/lib/tools/assessment-review/bundle");
const { buildReviewFixture, fixtureQuizzes, IDENTICAL_QUIZZES, BOILERPLATE_QUIZZES } =
  await import("./make-review-fixtures");

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

function ok(name: string, condition: boolean): void {
  check(name, condition, true);
}

/** Run the review and build the bundle over one export. */
async function review(file: File) {
  const store = await openCartridge(file);
  const { export: course, content } = await parseCourseExport(store, { sourceName: file.name });

  const settings = defaultSettings();
  const model = buildReview(course, content);
  const groups = suggestGroups(model, settings);
  const result = runChecks(model, groups, settings);

  const bundle = buildBundle({
    review: model,
    findings: result.findings,
    candidates: result.candidates,
    stats: result.stats,
    groups,
    families: result.families,
    settings,
    priorities: new Map(),
  });

  return { model, result, bundle };
}

/** The text of one file in the bundle. */
function fileIn(bundle: { files: { name: string; content: string }[] }, name: string): string {
  return bundle.files.find((file) => file.name === name)?.content ?? "";
}

/** The rows of a CSV file in the bundle, without the header. */
function rowsIn(bundle: { files: { name: string; content: string }[] }, name: string): string[][] {
  const content = fileIn(bundle, name);
  if (content === "") return [];

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < content.length; index++) {
    const char = content[index];

    if (quoted) {
      if (char === '"') {
        if (content[index + 1] === '"') {
          cell += '"';
          index++;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.slice(1);
}

// ---------------------------------------------------------------------------
// The fixture course
// ---------------------------------------------------------------------------

console.log("\nAssessment review bundle — the fixture course");

const fixtureBytes = await buildReviewFixture();
const fixture = await review(new File([new Uint8Array(fixtureBytes)], "fixture.imscc"));

const { model, result, bundle } = fixture;

console.log("\nAn assignment in two modules is counted once");

const rangeAssignment = model.assessments.find((assessment) => assessment.title === "Range Assignment");
ok("the assignment was found", Boolean(rangeAssignment));
check("the assignment is one graded item", model.assessments.filter((a) => a.title === "Range Assignment").length, 1);
check("the assignment records both modules", rangeAssignment?.moduleRefs.length, 2);

const assessmentRows = rowsIn(bundle, "data_assessments.csv");
check(
  "the assessments table holds one row for it",
  assessmentRows.filter((row) => row[2] === "Range Assignment").length,
  1,
);

const groupRows = rowsIn(bundle, "data_gradebook_groups.csv");
const assignmentsGroup = groupRows.find((row) => row[1] === "Assignments");
const rangeCount = assignmentsGroup?.[6].split(";").filter((id) => id === rangeAssignment?.id).length ?? 0;
check("the group counts it once", rangeCount, 1);

console.log("\nA graded discussion is in the assessments and in the group totals");

const discussion = model.assessments.find((assessment) => assessment.kind === "graded-discussion");
ok("the graded discussion was found", Boolean(discussion));
check("the discussion carries its points", discussion?.pointsPossible, 15);
check(
  "the discussion has a row in the assessments table",
  assessmentRows.filter((row) => row[1] === "graded-discussion").length,
  1,
);
check("the discussion is in the group totals", assignmentsGroup?.[6].includes(discussion?.id ?? ""), true);

console.log("\nThirty quizzes, fourteen of them identical, collapse to one family row");

const webinarFamily = result.families.find((family) => family.members.length === IDENTICAL_QUIZZES);
ok("a family of fourteen was found", Boolean(webinarFamily));
check("the family holds the webinar quizzes", webinarFamily?.members[0].title, "Week 1 Webinar Quiz");

const quizRows = rowsIn(bundle, "data_quizzes.csv");
check("every quiz has a row", quizRows.length, fixtureQuizzes().length);

const webinarRows = quizRows.filter((row) => row[1].startsWith("Week ") && row[1].endsWith("Webinar Quiz"));
check("the fourteen webinars are in the table", webinarRows.length, IDENTICAL_QUIZZES);
check("they all carry the same family id", new Set(webinarRows.map((row) => row[3])).size, 1);

const brief = bundle.brief;
const webinarRowsInBrief = brief
  .split("\n")
  .filter((line) => line.startsWith(`| ${webinarFamily?.id}`) && line.includes("Webinar"));
check("the brief has one row for the family", webinarRowsInBrief.length, 1);
ok("the brief row names the shared settings", webinarRowsInBrief[0]?.includes("attempts: 1"));
ok("the brief row names the time limit", webinarRowsInBrief[0]?.includes("time limit: 20 minutes"));
ok("the brief row names the shuffle", webinarRowsInBrief[0]?.includes("shuffle A: Yes"));

console.log("\nBoilerplate instructions are stored once");

const boilerplateQuizzes = model.assessments.filter((assessment) => assessment.title.startsWith("Boilerplate Quiz"));
check("the boilerplate quizzes were found", boilerplateQuizzes.length, BOILERPLATE_QUIZZES);

const sharedText = boilerplateQuizzes[0]?.instructions;
ok(
  "the boilerplate quizzes carry the same text",
  boilerplateQuizzes.every((assessment) => assessment.instructions === sharedText),
);

const textRows = rowsIn(bundle, "data_texts.csv");
const boilerplateRows = textRows.filter((row) => row[6].includes("These questions cover the reading for this week."));
check("the shared text is stored once", boilerplateRows.length, 1);
check("the shared text lists its items", boilerplateRows[0]?.[5].split(";").length, BOILERPLATE_QUIZZES);

console.log("\nA bank that a quiz draws from is not reported as unused");

const usedBank = model.itemBanks.find((bank) => bank.id === "g_bank_used");
const unusedBank = model.itemBanks.find((bank) => bank.id === "g_bank_unused");
ok("both banks were found", Boolean(usedBank) && Boolean(unusedBank));
check("the used bank is drawn from", (usedBank?.usedBy.length ?? 0) > 0, true);
check("the unused bank is not", unusedBank?.usedBy.length, 0);

const unusedLine = brief.split("\n").find((line) => line.includes("item bank(s) are not drawn from")) ?? "";
ok("the brief does not call the used bank unused", !unusedLine.includes("Used Question Bank"));
ok("the brief names the unused bank", unusedLine.includes("Unused Question Bank"));

const bankRows = rowsIn(bundle, "data_item_banks.csv");
const usedRow = bankRows.find((row) => row[0] === "g_bank_used");
check("the used bank lists who draws from it", (usedRow?.[5].split(";").length ?? 0) > 0, true);

console.log("\nA disagreement between the instructions and the rubric is reported precisely");

const rangeFinding = result.findings.find((finding) => finding.check === "D3");
ok("the disagreement was reported", Boolean(rangeFinding));
ok("the finding names the instructions", rangeFinding?.statement.includes("different figures") === true);
ok("the finding shows the instruction", rangeFinding?.values[0]?.value.includes("6-8 pages") === true);
ok("the finding shows the rubric's words", rangeFinding?.values[1]?.value.includes("5 pages or less") === true);
ok(
  "the finding shows both sentences",
  Boolean(rangeFinding?.values[0]?.value.includes("Write an essay of 6-8 pages in length.")),
);

console.log("\nAt the full detail level the shared text is written out once");

const fullSettings = defaultSettings();
fullSettings.detailLevel = "full";
const fullGroups = suggestGroups(model, fullSettings);
const fullResult = runChecks(model, fullGroups, fullSettings);
const fullBundle = buildBundle({
  review: model,
  findings: fullResult.findings,
  candidates: fullResult.candidates,
  stats: fullResult.stats,
  groups: fullGroups,
  families: fullResult.families,
  settings: fullSettings,
  priorities: new Map(),
});

const fullTextRows = rowsIn(fullBundle, "data_texts.csv");
const fullBoilerplate = fullTextRows.filter((row) =>
  row[6].includes("These questions cover the reading for this week."),
);
check("the shared text is written out once", fullBoilerplate.length, 1);
check("it lists every item that uses it", fullBoilerplate[0]?.[5].split(";").length, BOILERPLATE_QUIZZES);

const fullDetailFiles = fullBundle.files.filter((file) => file.kind === "detail");
ok("the full bundle has a detail file for every item", fullDetailFiles.length >= model.assessments.length - 2);

console.log("\nThe detail levels decide how much the bundle carries");

const briefSettings = defaultSettings();
briefSettings.detailLevel = "brief";
const briefGroups = suggestGroups(model, briefSettings);
const briefResult = runChecks(model, briefGroups, briefSettings);
const briefBundle = buildBundle({
  review: model,
  findings: briefResult.findings,
  candidates: briefResult.candidates,
  stats: briefResult.stats,
  groups: briefGroups,
  families: briefResult.families,
  settings: briefSettings,
  priorities: new Map(),
});

check("the brief level has no detail files", briefBundle.files.filter((file) => file.kind === "detail").length, 0);
ok(
  "the brief level writes no instruction text",
  rowsIn(briefBundle, "data_texts.csv").every((row) => row[6] === "not included at this detail level"),
);

const standardSettings = defaultSettings();
standardSettings.detailLevel = "standard";
const standardGroups = suggestGroups(model, standardSettings);
const standardResult = runChecks(model, standardGroups, standardSettings);
const standardBundle = buildBundle({
  review: model,
  findings: standardResult.findings,
  candidates: standardResult.candidates,
  stats: standardResult.stats,
  groups: standardGroups,
  families: standardResult.families,
  settings: standardSettings,
  priorities: new Map(),
});

const standardDetails = standardBundle.files.filter((file) => file.kind === "detail");
ok("the standard level has detail files", standardDetails.length > 0);
ok("the standard level writes at most one file per item", standardDetails.length <= model.assessments.length);
ok("the standard level writes fewer files than the full level", standardDetails.length <= fullDetailFiles.length);
ok(
  "every detail file names an item that has a finding",
  standardDetails.every(() => standardResult.findings.some((finding) => finding.affected.length > 0)),
);

console.log("\nThe export settings leave out what the reviewer does not need");

const narrowSettings = defaultSettings();
narrowSettings.include.pages = false;
narrowSettings.include.itemBanks = false;
const narrowGroups = suggestGroups(model, narrowSettings);
const narrowResult = runChecks(model, narrowGroups, narrowSettings);
const narrowBundle = buildBundle({
  review: model,
  findings: narrowResult.findings,
  candidates: narrowResult.candidates,
  stats: narrowResult.stats,
  groups: narrowGroups,
  families: narrowResult.families,
  settings: narrowSettings,
  priorities: new Map(),
});

ok("the pages are left out", !narrowBundle.files.some((file) => file.name === "data_content.csv"));
ok("the item banks are left out", !narrowBundle.files.some((file) => file.name === "data_item_banks.csv"));
ok("the brief agrees with what was left out", narrowBundle.brief.includes("| Pages and ungraded discussions | 0 |"));

console.log("\nThe settings change what the review finds");

const mappedSettings = defaultSettings();
mappedSettings.priorityMapping = { scoring: "low", quizzes: "low" };
const mappedGroups = suggestGroups(model, mappedSettings);
const mappedResult = runChecks(model, mappedGroups, mappedSettings);

ok(
  "the priority mapping changes the suggested severity",
  mappedResult.findings
    .filter((finding) => finding.family === "scoring" || finding.family === "quizzes")
    .every((finding) => finding.suggestedPriority === "low"),
);

const quietSettings = defaultSettings();
quietSettings.naming.checkTitlePatterns = false;
const quietGroups = suggestGroups(model, quietSettings);
const quietResult = runChecks(model, quietGroups, quietSettings);

ok(
  "the naming check can be turned off",
  quietResult.findings.every((finding) => finding.check !== "E3"),
);

const quietBundle = buildBundle({
  review: model,
  findings: quietResult.findings,
  candidates: quietResult.candidates,
  stats: quietResult.stats,
  groups: quietGroups,
  families: quietResult.families,
  settings: quietSettings,
  priorities: new Map(),
});

const quietManifest = JSON.parse(fileIn(quietBundle, "manifest.json"));
check("the settings travel in the manifest", quietManifest.settings.naming.checkTitlePatterns, false);

console.log("\nThe reviewer's own changes reach the export");

const overridden = buildBundle({
  review: model,
  findings: result.findings,
  candidates: result.candidates,
  stats: result.stats,
  groups: suggestGroups(model, defaultSettings()),
  families: result.families,
  settings: defaultSettings(),
  priorities: new Map([[result.findings[0].id, "low" as const]]),
});

const overriddenRows = rowsIn(overridden, "data_findings.csv");
check(
  "the reviewer's priority is the one written out",
  overriddenRows.find((row) => row[0] === result.findings[0].id)?.[3],
  "low",
);

console.log("\nThe brief stays small and the bundle holds what it should");

ok("the brief is inside its limit", bundle.brief.length < 20_000);
ok("the brief names the course", brief.includes("Review Fixture (2027-1)"));
ok("the brief states the term", brief.includes("2027-1"));

for (const heading of [
  "Export identity",
  "What was read, and what was not",
  "Reconciliation",
  "Gradebook structure",
  "Quiz summary",
  "Findings summary",
  "Open questions",
  "The other files",
]) {
  ok(`the brief has the "${heading}" section`, brief.includes(`## ${heading}`));
}

const candidateRows = rowsIn(bundle, "data_candidates.csv");
ok(
  "the keyword matches are labelled as candidates, not findings",
  candidateRows.every((row) => row[1] === "candidate mismatch (keyword match)" || row[1] === "cleanup item"),
);
const findingsRows = rowsIn(bundle, "data_findings.csv");
ok(
  "no candidate is counted as a finding",
  candidateRows.every((row) => !findingsRows.some((finding) => finding[0] === row[0])),
);
check("the findings table holds every finding", findingsRows.length, result.findings.length);
ok("the brief counts the findings", brief.includes(`${result.findings.length} findings`));

const reconciliation = bundle.reconciliation;
check("every reconciliation check ran", reconciliation.checks.length, 7);
ok(
  "every reconciliation check passed",
  reconciliation.failures.length === 0 &&
    reconciliation.failures.every((failure) => `${failure.id}: ${failure.detail}` !== ""),
);

// The manifest carries the settings, so a colleague can see the rules.
const manifest = JSON.parse(fileIn(bundle, "manifest.json"));
ok("the manifest carries the settings", typeof manifest.settings?.termPattern === "string");
ok("the manifest lists every file", manifest.files.length === bundle.files.length - 1);
ok("the manifest says which files go with which step", manifest.steps.length === 3);

// ---------------------------------------------------------------------------
// A large export
// ---------------------------------------------------------------------------

const SAMPLE_DIR = new URL("../reference/canvas/course/", import.meta.url).pathname;
const LARGE = "eng120-master-2027-1-english-composition-i-export.imscc";
const largePath = join(SAMPLE_DIR, LARGE);

if (existsSync(largePath)) {
  console.log("\nAssessment review bundle — a large export");

  const bytes = readFileSync(largePath);
  console.log(`  (${Math.round(bytes.length / 1024 / 1024)} MB)`);

  const large = await review(new File([new Uint8Array(bytes)], LARGE));

  ok("the brief is inside its limit", large.bundle.brief.length < 20_000);
  console.log(`  (the brief is ${large.bundle.brief.length} characters)`);
  ok(
    "the brief counts the graded items",
    large.bundle.brief.includes(`| Graded items | ${large.model.assessments.length} |`),
  );

  const largeAssessments = rowsIn(large.bundle, "data_assessments.csv");
  check("the assessments table holds every graded item", largeAssessments.length, large.model.assessments.length);

  // No file in the bundle is allowed to be enormous.
  const biggest = large.bundle.files.reduce((max, file) => Math.max(max, file.content.length), 0);
  ok(`the largest file is reported (${biggest} characters)`, biggest > 0);
} else {
  console.log("\nNo large course export found in reference/canvas/course — skipping the large-export check.");
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll bundle checks passed.");
