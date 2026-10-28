/** Canvas parser and shared-model checks. Run with: bun run test:canvas. */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { buildSampleCartridge } from "./make-sample-cartridge";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
(globalThis as Record<string, unknown>).DOMParser = dom.window.DOMParser;

const { openCartridge } = await import("../src/lib/canvas/store");
const { parseCourseExport } = await import("../src/lib/canvas/parse");
const { buildCanvasCourseModel, entitiesOutsideModules } = await import("../src/lib/canvas/model");
const { filterCourseEntities, getCourseSummary } = await import("../src/lib/canvas/selectors/course");
const { getEntityDetailRows } = await import("../src/lib/canvas/selectors/details");
const { buildRubricIndex, compareRubrics, filterRubricEntries, rubricContentSignature } =
  await import("../src/lib/canvas/selectors/rubrics");
const { processContent } = await import("../src/lib/canvas/content");
const { hasBrokenNamespace, parseXml } = await import("../src/lib/canvas/xml");

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

async function readExport(path: string) {
  const store = await openCartridge(new File([new Uint8Array(readFileSync(path))], path));
  return parseCourseExport(store, { sourceName: path });
}

// A generated cartridge always runs, including in a clean checkout with no
// private reference exports.
console.log("\nSynthetic Canvas course");
const sampleBytes = await buildSampleCartridge();
const sampleStore = await openCartridge(new File([new Uint8Array(sampleBytes)], "sample.imscc"));
const sample = await parseCourseExport(sampleStore, { sourceName: "sample.imscc" });

check("course title", sample.export.meta.title, "Sample Course");
check("module count", sample.export.modules.length, 1);
check("module item count", sample.export.items.length, 3);
check("rubric count", sample.export.rubrics.length, 4);
check("item bank count", sample.export.itemBanks.length, 1);
check("quiz count", sample.export.items.filter((item) => item.kind === "quiz").length, 2);
check(
  "home page is outside modules",
  sample.export.orphans.map((item) => item.title),
  ["Home"],
);
check("bank item count", sample.export.itemBanks[0]?.itemCount, 5);
check("first quiz bank draw", sample.export.items.find((item) => item.id === "g_quiz_1")?.quiz?.drawnCount, 5);
check(
  "second quiz selection points",
  sample.export.items.find((item) => item.id === "g_quiz_2")?.quiz?.selectionPoints,
  10,
);

const assignment = sample.export.items.find((item) => item.id === "g_assignment_1");
ok(
  "assignment body was read",
  sample.content.get("g_assignment_1")?.text.includes("Complete the sample assignment") ?? false,
);

// A repeated module placement must remain one entity in the shared model.
if (assignment) {
  sample.export.items.push({
    ...assignment,
    moduleId: "g_module_2",
    moduleTitle: "Unit 2",
    itemId: "g_module_item_copy",
  });
}
const model = buildCanvasCourseModel(sample);
const normalizedAssignment = model.entitiesById.get("g_assignment_1");
check("unique assignment entity", model.entities.filter((entity) => entity.id === "g_assignment_1").length, 1);
check("both placements retained", normalizedAssignment?.placements.length, 2);
check("summary counts", getCourseSummary(model), {
  modules: 1,
  pages: 1,
  assignments: 1,
  quizzes: 2,
  discussions: 0,
  files: 0,
  rubrics: 4,
});
check(
  "outside-module selector",
  entitiesOutsideModules(model).map((entity) => entity.title),
  ["Home"],
);
check("quiz filter", filterCourseEntities(model, { kind: "quiz" }).length, 2);
check(
  "body search",
  filterCourseEntities(model, { search: "complete sentences" }).map((entity) => entity.id),
  ["g_assignment_1"],
);
ok(
  "detail rows include the rubric",
  getEntityDetailRows(model, normalizedAssignment!).some(
    (row) => row.label === "Rubric" && row.value === "Sample Rubric",
  ),
);

console.log("\nRubric relationships and comparison");
const rubricIndex = buildRubricIndex(model);
check("rubric entries", rubricIndex.entries.length, 4);
check(
  "exact copies ignore titles and generated IDs",
  rubricIndex.exactCopyGroups.map((group) => group.rubrics.map((rubric) => rubric.id)),
  [["g_rubric_1", "g_rubric_2"]],
);
check(
  "same-name variations have distinct content",
  rubricIndex.sameNameGroups.map((group) => ({
    title: group.title,
    ids: group.rubrics.map((rubric) => rubric.id),
    versions: group.versions,
  })),
  [{ title: "Sample Rubric", ids: ["g_rubric_1", "g_rubric_4"], versions: 2 }],
);
check(
  "linked activity is unique and keeps its grading role",
  rubricIndex.entriesById.get("g_rubric_1")?.activities.map((activity) => ({
    id: activity.entity.id,
    usedForGrading: activity.usedForGrading,
  })),
  [{ id: "g_assignment_1", usedForGrading: true }],
);
check("unlinked rubric copy", rubricIndex.entriesById.get("g_rubric_3")?.activities.length, 0);
check("criteria points", rubricIndex.entriesById.get("g_rubric_1")?.criteriaPoints, 30);
check(
  "copy filter",
  filterRubricEntries(rubricIndex, { kind: "copies" })
    .map((entry) => entry.rubric.id)
    .sort(),
  ["g_rubric_1", "g_rubric_2"],
);
check(
  "variation filter",
  filterRubricEntries(rubricIndex, { kind: "variations" })
    .map((entry) => entry.rubric.id)
    .sort(),
  ["g_rubric_1", "g_rubric_4"],
);
check(
  "rubric content search",
  filterRubricEntries(rubricIndex, { search: "Organization" }).map((entry) => entry.rubric.id),
  ["g_rubric_4"],
);

const rubricOne = model.export.rubrics.find((rubric) => rubric.id === "g_rubric_1")!;
const rubricCopy = model.export.rubrics.find((rubric) => rubric.id === "g_rubric_2")!;
const rubricVariation = model.export.rubrics.find((rubric) => rubric.id === "g_rubric_4")!;
check("copy comparison", compareRubrics(rubricOne, rubricCopy).sameContent, true);
check("variation comparison", compareRubrics(rubricOne, rubricVariation).differentCriteria, 1);
check("variation criterion position", compareRubrics(rubricOne, rubricVariation).criteria[1]?.status, "different");

const changedIds = structuredClone(rubricOne);
changedIds.id = "generated-copy";
changedIds.criteria.forEach((criterion, criterionIndex) => {
  criterion.id = `criterion-${criterionIndex}`;
  criterion.ratings.forEach((rating, ratingIndex) => {
    rating.id = `rating-${criterionIndex}-${ratingIndex}`;
  });
});
ok(
  "generated IDs do not change the signature",
  rubricContentSignature(changedIds) === rubricContentSignature(rubricOne),
);
const changedDescription = structuredClone(rubricOne);
changedDescription.criteria[0].ratings[0].longDescription += " Changed.";
ok(
  "long descriptions change the signature",
  rubricContentSignature(changedDescription) !== rubricContentSignature(rubricOne),
);

const selectiveModel = buildCanvasCourseModel({
  ...sample,
  export: { ...sample.export, items: [], orphans: [], modules: [] },
});
const selectiveRubrics = buildRubricIndex(selectiveModel);
ok(
  "rubric-only exports have no linked activities in this export",
  selectiveRubrics.entries.every((entry) => entry.activities.length === 0),
);

console.log("\nXML repair and content safety");
const broken = `<?xml version="1.0"?>
<quiz xmlns="http://canvas.instructure.com/xsd/cccv1p0" xmlns:xsi="http://canvas.instructure.com/xsd/cccv1p0 https://canvas.instructure.com/xsd/cccv1p0.xsd" identifier="x"><title>Broken</title></quiz>`;
check("broken namespace detected", hasBrokenNamespace(broken), true);
check("broken namespace repaired", parseXml(broken, "broken.xml").documentElement.localName, "quiz");

const nasty = processContent(
  `<p onclick="steal()">Hello</p><script>alert(1)</script><a href="javascript:alert(1)">bad</a><img src="https://tracker.example/pixel.gif" alt="tracker"><iframe src="https://evil.example"></iframe><div style="position:fixed">overlay</div>`,
  "canvas.example.edu",
);
ok("script removed", !nasty.html.includes("<script"));
ok("event handler removed", !nasty.html.includes("onclick"));
ok("javascript URL removed", !nasty.html.includes("javascript:"));
ok("iframe removed", !nasty.html.includes("<iframe"));
ok(
  "iframe becomes a deliberate external link",
  nasty.html.includes('href="https://evil.example"') && nasty.html.includes("Open embedded content on evil.example"),
);
ok("inline style removed", !nasty.html.includes("style="));
ok("external image not embedded", !nasty.html.includes("tracker.example"));
ok(
  "external image reported",
  nasty.links.some((link) => link.isImage && link.href.includes("tracker.example")),
);

const internal = processContent(
  `<a href="$WIKI_REFERENCE$/pages/g123">page</a><img src="$IMS-CC-FILEBASE$/icons/book.png" alt="book">`,
);
ok("wiki link rewritten", internal.html.includes('data-canvas-target="page:g123"'));
ok("file image rewritten", internal.html.includes('data-canvas-image="web_resources/icons/book.png"'));
check("file image collected", internal.images[0]?.path, "web_resources/icons/book.png");

const objects = processContent(`
  <a href="$CANVAS_OBJECT_REFERENCE$/assignments/g123">Assignment</a>
  <a href="$CANVAS_OBJECT_REFERENCE$/quizzes/g456">Quiz</a>
  <a href="$CANVAS_OBJECT_REFERENCE$/discussion_topics/g789">Discussion</a>
  <a href="$CANVAS_OBJECT_REFERENCE$/modules/g_module">Module</a>
  <a href="#gaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa">Object anchor</a>
  <a href="#ordinary">Ordinary anchor</a>
`);
check(
  "object references become internal targets",
  ["object:g123", "object:g456", "object:g789", "module:g_module", "candidate:gaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"].map(
    (target) => objects.html.includes(`data-canvas-target="${target}"`),
  ),
  [true, true, true, true, true],
);
ok(
  "ordinary anchors are preserved",
  objects.html.includes('href="#ordinary"') && !objects.html.includes("candidate:ordinary"),
);

const equation = processContent(
  `<img class="equation_image" data-equation-content="\\frac{1}{2} &lt; 1" src="https://canvas.example.edu/equation.png" alt="LaTeX: fallback">`,
);
ok(
  "equation image becomes accessible text",
  equation.html.includes('role="math"') && equation.html.includes("\\frac{1}{2} &lt; 1"),
);
ok(
  "equation does not load its remote image",
  !equation.html.includes("<img") && !equation.html.includes("canvas.example.edu"),
);

// Private exports provide additional regression coverage when available, but
// are never required by the app or by clean-checkout tests.
const SAMPLE_DIR = new URL("../reference/canvas/course/", import.meta.url).pathname;
const AP_FILE = join(SAMPLE_DIR, "AP_Calculus_AB.imscc");
if (existsSync(AP_FILE)) {
  console.log("\nPrivate reference export — AP Calculus");
  const { export: course } = await readExport(AP_FILE);
  check("course title", course.meta.title, "Calc AB Sandbox");
  check("module count", course.modules.length, 15);
  check("module item count", course.items.length, 95);
  check("file count", course.files.length, 81);
  const formulas = course.orphans.find((item) => item.title === "Formulas Quiz");
  check("formulas question count", formulas?.quiz?.questionCount, 50);
  check("selection points take precedence", formulas?.quiz?.selectionPoints, 100);
  check("no unreadable files", course.unreadable.length, 0);
}

const ENG_FILE = join(SAMPLE_DIR, "eng120-master-2027-1-english-composition-i-export.imscc");
if (existsSync(ENG_FILE)) {
  console.log("\nPrivate reference export — ENG120");
  const { export: course } = await readExport(ENG_FILE);
  const quizzes = [...course.items, ...course.orphans].filter((item) => item.kind === "quiz");
  check("rubric count", course.rubrics.length, 40);
  check("quiz count", quizzes.length, 30);
  check("item banks are not quizzes", course.itemBanks.length, 64);
  ok(
    "every rubric reference resolves",
    [...course.items, ...course.orphans]
      .filter((item) => item.assignment?.rubricId)
      .every((item) => course.rubrics.some((rubric) => rubric.id === item.assignment?.rubricId)),
  );
}

if (failures > 0) {
  console.error(`\n${failures} Canvas check(s) failed.`);
  process.exit(1);
}
console.log("\nAll Canvas checks passed.");
