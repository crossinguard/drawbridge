/**
 * Parser checks for the Canvas course export viewer (run with: bun run test:canvas).
 *
 * The sample export lives in `reference/canvas/course/`, which is git-ignored — it
 * is a local fixture, not part of the repository. When it is not there the
 * test says so and exits successfully, so it never breaks a clean checkout.
 *
 * The export is read through the same code the browser uses: the `.imscc` is
 * opened with JSZip and parsed by the shared Canvas parser.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { JSDOM } from "jsdom";

// Provide a browser-like global before importing the parse pipeline.
const dom = new JSDOM("<!doctype html><html><body></body></html>");
(globalThis as Record<string, unknown>).DOMParser = dom.window.DOMParser;

const { openCartridge } = await import("../src/lib/canvas/store");
const { parseCourseExport } = await import("../src/lib/canvas/parse");

const SAMPLE_DIR = new URL("../reference/canvas/course/", import.meta.url).pathname;
const SAMPLE_FILE = join(SAMPLE_DIR, "AP_Calculus_AB.imscc");

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

/** Read an export from the reference folder. */
async function readExport(file: string) {
  const path = join(SAMPLE_DIR, file);
  const store = await openCartridge(new File([new Uint8Array(readFileSync(path))], file));
  return parseCourseExport(store, { sourceName: file });
}

if (!existsSync(SAMPLE_FILE)) {
  console.log("No Canvas sample export found in reference/canvas/course — skipping the parser checks.");
  process.exit(0);
}

// ---------------------------------------------------------------------------
// The archive should describe the course
// ---------------------------------------------------------------------------

console.log("\nCanvas course export — .imscc archive");

const fromZip = await readExport("AP_Calculus_AB.imscc");
const course = fromZip.export;

check("course title", course.meta.title, "Calc AB Sandbox");
check("course code", course.meta.code, "Calc");
check("root account", course.meta.accountName, "Charlotte Mecklenburg Schools");
check("canvas domain", course.meta.domain, "cms.instructure.com");
ok("cartridge id present", course.meta.cartridgeId.length > 0);
check("export date", course.meta.exportedAt, "2026-07-28");
check("module count", course.modules.length, 15);
check("module item count", course.items.length, 95);
check("assignment count", course.items.filter((item) => item.kind === "assignment").length, 72);
check("quiz count", course.items.filter((item) => item.kind === "quiz").length, 1);
check("page count", course.items.filter((item) => item.kind === "page").length, 8);
check("discussion count", course.items.filter((item) => item.kind === "discussion").length, 2);
check("external link count", course.items.filter((item) => item.kind === "external-url").length, 11);
check("external tool count", course.items.filter((item) => item.kind === "external-tool").length, 1);
check("file count", course.files.length, 81);
check("assignment group count", course.assignmentGroups.length, 10);

// Every module item should resolve to a resource.
const unresolved = course.items.filter((item) => item.unresolved);
check(
  "unresolved module items",
  unresolved.map((item) => item.title),
  ["AP Calculus e-Textbook"],
);
check(
  "unresolved reason",
  unresolved[0]?.unresolvedReason,
  "This item has no matching entry in the cartridge manifest.",
);

// Publish state.
check(
  "unpublished modules",
  course.modules.filter((module) => module.state === "unpublished").map((module) => module.title),
  [
    "Teaching Resources",
    "Unit 3: Rules of Differentiation",
    "Unit 4: Contextual Applications of Differentiation",
    "Unit 5: Analytic Applications of Differentiation",
    "Unit 6: Integration and Accumulated Change",
    "Unit 7: Differential Equations",
    "Unit 8: Applications of Integration",
    "AP Exam Prep",
    "End-Of-Year Assignments",
    "Emergency Lesson Plans",
    "e-Textbook & WebAssign",
  ],
);
check(
  "published modules",
  course.modules.filter((module) => module.state === "active").map((module) => module.title),
  ["AP Precalculus Review", "How to Study Mathematics", "Unit 1: Limits and Continuity", "Unit 2: Differentiation"],
);

// A known assignment.
const limits = course.items.find((item) => item.title === "1.1 Understanding Limits");
ok("assignment found", Boolean(limits));
check("assignment points", limits?.assignment?.pointsPossible, 100);
check("assignment group", limits?.assignment?.groupTitle, "Quarter 1");
check("assignment submission types", limits?.assignment?.submissionTypes, ["none"]);
ok("assignment has a body", Boolean(limits?.bodyPath));

// A known quiz.
const hunt = course.items.find((item) => item.title === "Canvas Scavenger Hunt");
ok("quiz found", Boolean(hunt));
check("quiz points", hunt?.quiz?.pointsPossible, 100);
check("quiz attempts", hunt?.quiz?.allowedAttempts, -1);
check("quiz questions", hunt?.quiz?.questionCount, 13);
ok("quiz question types recorded", Object.keys(hunt?.quiz?.questionTypes ?? {}).length > 0);

// A known external link.
const pacing = course.items.find((item) => item.title === "Calc AB Pacing Guide w/ CED Reference");
ok("external link found", Boolean(pacing));
ok("external link has a url", (pacing?.url ?? "").startsWith("https://docs.google.com/spreadsheets/"));

// Orphans: pages and assessments that no module points at.
const orphanKinds = course.orphans.reduce<Record<string, number>>((counts, item) => {
  counts[item.kind] = (counts[item.kind] ?? 0) + 1;
  return counts;
}, {});
ok("orphans were found", course.orphans.length > 0);
ok("orphaned pages found", (orphanKinds.page ?? 0) > 0);
ok("orphaned quizzes found", (orphanKinds.quiz ?? 0) > 0);

// The processed content should carry the page text and the rewritten links.
const home = course.orphans.find((item) => item.title === "Home");
ok("front page is an orphan", Boolean(home));
const homeContent = home ? fromZip.content.get(home.id) : undefined;
ok("front page text extracted", (homeContent?.text.length ?? 0) > 100);
ok("front page links collected", (homeContent?.links.length ?? 0) > 0);
ok(
  "internal page links are recognised",
  (homeContent?.links ?? []).some((link) => link.kind === "internal-page"),
);
ok(
  "canvas course links are recognised",
  (homeContent?.links ?? []).some((link) => link.kind === "canvas-course"),
);
ok("canvas api references are counted", (homeContent?.apiReferenceCount ?? 0) > 0);
ok("scripts are stripped", !(homeContent?.html ?? "").includes("<script"));
ok("canvas api attributes are stripped", !(homeContent?.html ?? "").includes("data-api-endpoint"));

// A wiki page that is in a module.
const study = course.items.find((item) => item.title === "How to Study Mathematics");
const studyContent = study ? fromZip.content.get(study.id) : undefined;
ok("wiki page text extracted", (studyContent?.text.length ?? 0) > 100);

// One of the export's files declares its XML namespace with two URIs, which
// browsers refuse to parse. It should be repaired and reported.
ok(
  "the repaired file was reported",
  course.warnings.some((warning) => warning.includes("assessment_meta.xml")),
);
const { hasBrokenNamespace, parseXml: parseXmlDirect } = await import("../src/lib/canvas/xml");
const broken = `<?xml version="1.0"?>
<quiz xmlns="http://canvas.instructure.com/xsd/cccv1p0" xmlns:xsi="http://canvas.instructure.com/xsd/cccv1p0 https://canvas.instructure.com/xsd/cccv1p0.xsd" identifier="x">
  <title>Broken</title>
</quiz>`;
check("broken namespace detected", hasBrokenNamespace(broken), true);
check("broken namespace repaired", parseXmlDirect(broken, "broken.xml").documentElement.localName, "quiz");

// ---------------------------------------------------------------------------
// Quizzes, item banks and rubrics
// ---------------------------------------------------------------------------

console.log("\nQuizzes, item banks and rubrics");

// The formulas quiz is in the export but no module points at it.
const formulas = course.orphans.find((item) => item.title === "Formulas Quiz");
ok("the formulas quiz was found", Boolean(formulas));
ok("the formulas quiz has settings", Boolean(formulas?.quiz?.settingsSource));
check("the formulas quiz is a classic quiz", formulas?.quiz?.engine, "classic");
check("the formulas quiz keeps its own questions", formulas?.quiz?.contentSource, "items");
check("the formulas quiz has 50 questions", formulas?.quiz?.questionCount, 50);

// Canvas records what a selection is worth separately from the points on the
// questions themselves. The selection is the figure that applies.
check("the formulas quiz records one selection", formulas?.quiz?.selections.length, 1);
check("the selection takes 50 questions", formulas?.quiz?.selections[0]?.count, 50);
check("the selection is worth 2 points each", formulas?.quiz?.selections[0]?.pointsPerItem, 2);
check("the selection adds up to the quiz's points", formulas?.quiz?.selectionPoints, formulas?.quiz?.pointsPossible);

// The item bank in this export is not used by any quiz.
check("one item bank was found", course.itemBanks.length, 1);
check("the item bank has a title", course.itemBanks[0]?.title, "Unfiled Questions");
ok("the item bank holds items", (course.itemBanks[0]?.itemCount ?? 0) > 0);
check("no quiz draws from it", course.itemBanks[0]?.usedBy.length, 0);

// This export has no rubrics.
check("no rubrics were found", course.rubrics.length, 0);

// Every file the parser read is recorded, and nothing failed.
ok("files were read", course.filesRead.length > 0);
check("no file failed to parse", course.unreadable.length, 0);

// ---------------------------------------------------------------------------
// Sanitising
// ---------------------------------------------------------------------------

console.log("\nContent sanitising");

const { processContent } = await import("../src/lib/canvas/content");

const nasty = processContent(
  `<p onclick="steal()">Hello</p>
   <script>alert(1)</script>
   <a href="javascript:alert(1)">bad</a>
   <a href="https://example.com/x" target="_blank">good</a>
   <img src="https://tracker.example/pixel.gif" alt="tracker">
   <iframe src="https://evil.example"></iframe>
   <div style="position:fixed;inset:0">overlay</div>`,
  "cms.instructure.com",
);

ok("script removed", !nasty.html.includes("<script"));
ok("event handler removed", !nasty.html.includes("onclick"));
ok("javascript url removed", !nasty.html.includes("javascript:"));
ok("iframe removed", !nasty.html.includes("<iframe"));
ok("inline style removed", !nasty.html.includes("style="));
ok("external image not embedded", !nasty.html.includes("tracker.example/pixel.gif"));
ok(
  "external image reported",
  nasty.links.some((link) => link.href.includes("tracker.example/pixel.gif")),
);
ok("external link kept", nasty.html.includes("https://example.com/x"));
ok("text kept", nasty.text.includes("Hello"));

const internal = processContent(
  `<a href="$WIKI_REFERENCE$/pages/g123">page</a><img src="$IMS-CC-FILEBASE$/icons/book.png" alt="book">`,
);
ok("wiki link rewritten", internal.html.includes('data-canvas-target="page:g123"'));
ok("file image rewritten", internal.html.includes('data-canvas-image="web_resources/icons/book.png"'));
ok(
  "file image collected",
  internal.images.some((image) => image.path === "web_resources/icons/book.png"),
);

// ---------------------------------------------------------------------------
// Live course exports
// ---------------------------------------------------------------------------

const ENG120 = "eng120-master-2027-1-english-composition-i-export.imscc";
const PN126 = "pn126-master-2027-1-concepts-of-practical-nursing-health-promotion-export.imscc";

if (existsSync(join(SAMPLE_DIR, ENG120))) {
  console.log("\nLive course export — ENG120");

  const { export: eng } = await readExport(ENG120);
  const engAll = [...eng.items, ...eng.orphans];

  check("course title", eng.meta.title, "ENG120 MASTER (2027-1) - English Composition I");
  check("module count", eng.modules.length, 18);
  check("rubrics were read", eng.rubrics.length, 40);

  // The item banks are not quizzes. They are pools of questions that the
  // quizzes draw from, and they are not in any module.
  const engQuizzes = engAll.filter((item) => item.kind === "quiz");
  check("quiz count", engQuizzes.length, 30);
  check("every quiz has settings", engQuizzes.filter((quiz) => quiz.quiz?.settingsSource).length, 30);
  check("item banks were found", eng.itemBanks.length, 64);
  ok(
    "no item bank is counted as a quiz",
    eng.itemBanks.every((bank) => !engQuizzes.some((quiz) => quiz.id === bank.id)),
  );

  // The quizzes draw their questions from banks, and the arithmetic adds up.
  const webinar = engQuizzes.find((item) => item.title === "Week 1 Webinar Quiz");
  check("the webinar quiz draws from banks", webinar?.quiz?.contentSource, "banks");
  check("the webinar quiz draws 10 questions", webinar?.quiz?.drawnCount, 10);
  check(
    "the webinar quiz's questions are worth its points",
    webinar?.quiz?.selectionPoints,
    webinar?.quiz?.pointsPossible,
  );
  ok("the webinar quiz names the banks it uses", (webinar?.quiz?.selections.length ?? 0) > 0);
  ok(
    "the banks the webinar quiz names are in the export",
    (webinar?.quiz?.selections ?? []).every((selection) => selection.bankFilePresent),
  );

  // The rubric links resolve.
  const rubricRefs = engAll.filter((item) => item.assignment?.rubricId);
  ok("assignments carry rubric references", rubricRefs.length > 0);
  const rubricIds = new Set(eng.rubrics.map((rubric) => rubric.id));
  ok(
    "every rubric reference resolves",
    rubricRefs.every((item) => rubricIds.has(item.assignment!.rubricId!)),
  );

  // Section headings are not content.
  check("section headings were recognised", engAll.filter((item) => item.kind === "heading").length, 4);
}

if (existsSync(join(SAMPLE_DIR, PN126))) {
  console.log("\nLive course export — PN126");

  const { export: pn } = await readExport(PN126);
  const pnAll = [...pn.items, ...pn.orphans];

  check("rubrics were read", pn.rubrics.length, 89);
  check("module count", pn.modules.length, 34);
  check("section headings were recognised", pnAll.filter((item) => item.kind === "heading").length, 61);

  const pnQuizzes = pnAll.filter((item) => item.kind === "quiz");
  check("quiz count", pnQuizzes.length, 24);
  check("every quiz has settings", pnQuizzes.filter((quiz) => quiz.quiz?.settingsSource).length, 24);
  check("item banks were found", pn.itemBanks.length, 1);

  // A rubric's criteria add up to the rubric's own total.
  const mismatched = pn.rubrics.filter((rubric) => {
    if (rubric.pointsPossible === undefined) return false;
    const sum = rubric.criteria.reduce((total, criterion) => total + (criterion.points ?? 0), 0);
    return Math.abs(sum - rubric.pointsPossible) > 0.001;
  });
  check(
    "every rubric's criteria add up to its total",
    mismatched.map((rubric) => rubric.title),
    [],
  );
}

// ---------------------------------------------------------------------------
// The assessment review
// ---------------------------------------------------------------------------

console.log("\nAssessment review");

const { buildReview } = await import("../src/lib/tools/assessment-review/model");
const { runChecks, suggestGroups } = await import("../src/lib/tools/assessment-review/checks/index");
const { DEFAULT_RULES } = await import("../src/lib/tools/assessment-review/findings");
const { toPrepFile } = await import("../src/lib/tools/assessment-review/prep-file");

/** Run the review over a parsed course. */
function reviewCourse(course: unknown, content: unknown, sourceName: string) {
  const model = buildReview(course as never, content as never);
  const groups = suggestGroups(model);
  const { findings } = runChecks(model, groups, DEFAULT_RULES);

  const prep = toPrepFile({
    review: model,
    findings,
    groups,
    rules: DEFAULT_RULES,
    overrides: { priorities: new Map(), quizGroups: new Map() },
    sourceName,
  });

  return { model, groups, findings, prep };
}

/** Run the review over one export in the reference folder. */
async function reviewExport(file: string) {
  const { export: course, content } = await readExport(file);
  return reviewCourse(course, content, file);
}

// The sample cartridge carries the cases a review should catch.
const { buildSampleCartridge } = await import("./make-sample-cartridge");

const sampleBytes = await buildSampleCartridge();
const sampleStore = await openCartridge(new File([new Uint8Array(sampleBytes)], "sample.imscc"));
const sampleParsed = await parseCourseExport(sampleStore, { sourceName: "sample.imscc" });
const {
  model: sampleModel,
  findings: sampleFindings,
  prep: samplePrep,
} = reviewCourse(sampleParsed.export, sampleParsed.content, "sample.imscc");

check("the sample's graded items were found", sampleModel.assessments.length, 3);
check("the sample's rubrics were found", sampleModel.rubrics.length, 3);
check("the sample's item bank was found", sampleModel.itemBanks.length, 1);

ok(
  "the rubric total mismatch was reported",
  sampleFindings.some((finding) => finding.check === "A2" && finding.title.includes("rubric totals 30")),
);
ok(
  "the quiz points mismatch was reported",
  sampleFindings.some((finding) => finding.check === "A3" && finding.title.includes("add up to 5 points, not 10")),
);
ok(
  "the duplicate rubrics were reported",
  sampleFindings.some((finding) => finding.check === "B2"),
);
ok(
  "the rubric with no attachment was reported",
  sampleFindings.some((finding) => finding.check === "B1"),
);
ok(
  "the differing quiz setting was reported",
  sampleFindings.some((finding) => finding.check === "C1" && finding.title.includes("time limit")),
);

// The prep file stands on its own.
for (const heading of [
  "Export identity",
  "About this file",
  "What was read",
  "Gradebook structure",
  "Module map",
  "Assessment summary",
  "Quizzes",
  "Quiz consistency",
  "Facts by review step",
  "Assessment details",
  "Rubric inventory",
  "Legacy and unused content",
  "Pages and discussions",
  "Not readable from this export",
  "[REVIEW REQUIRED] summary",
]) {
  ok(`the prep file has the "${heading}" section`, samplePrep.includes(`## ${heading}`));
}

ok("the prep file carries the instructions in full", samplePrep.includes("Write at least 5 complete sentences"));
ok("the prep file carries the rubric", samplePrep.includes("Formatting and Length"));
ok("the prep file names the source of each value", samplePrep.includes("course_settings/rubrics.xml"));
ok("the prep file says what is not included", samplePrep.includes("answer keys"));

if (existsSync(join(SAMPLE_DIR, ENG120))) {
  console.log("\nAssessment review — ENG120");

  const { model, findings, prep } = await reviewExport(ENG120);

  check("the graded items were found", model.assessments.length, 44);
  check("the rubrics were found", model.rubrics.length, 40);
  check("the item banks were found", model.itemBanks.length, 64);

  // The two Grammar Review quizzes draw more questions than they are worth.
  ok("both Grammar Review quizzes were reported", findings.filter((finding) => finding.check === "A3").length === 2);

  // The GE Discussion Rubric copies are reported as duplicates.
  ok(
    "the identical rubrics were grouped",
    findings.some((finding) => finding.check === "B2" && finding.title.includes("identical criteria")),
  );

  ok("the prep file was written", prep.length > 10000);
  ok("the prep file names the course", prep.includes("ENG120 MASTER (2027-1) - English Composition I"));
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll Canvas parser checks passed.");
