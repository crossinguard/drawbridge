/**
 * Parser checks for the Canvas course export viewer (run with: bun run test:canvas).
 *
 * The sample export lives in `src/assets/reference/canvas/course/`, which is git-ignored — it
 * is a local fixture, not part of the repository. When it is not there the
 * test says so and exits successfully, so it never breaks a clean checkout.
 *
 * The export is read through the same code the browser uses: the `.imscc` is
 * opened with JSZip and the extracted folder is read through the folder
 * store, so both input paths are covered.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { JSDOM } from "jsdom";

// Provide a browser-like global before importing the parse pipeline.
const dom = new JSDOM("<!doctype html><html><body></body></html>");
(globalThis as Record<string, unknown>).DOMParser = dom.window.DOMParser;

const { openCartridge } = await import("../src/lib/tools/imscc-viewer/store");
const { parseCourseExport } = await import("../src/lib/tools/imscc-viewer/parse");

const SAMPLE_DIR = new URL("../src/assets/reference/canvas/course/", import.meta.url).pathname;
const SAMPLE_FILE = join(SAMPLE_DIR, "AP_Calculus_AB.imscc");
const SAMPLE_FOLDER = join(SAMPLE_DIR, "AP_Calculus_AB");

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

/** Every file under a folder, as paths relative to it. */
function walkFolder(root: string, prefix = ""): { path: string; file: File }[] {
  const out: { path: string; file: File }[] = [];

  for (const entry of readdirSync(join(root, prefix))) {
    const relative = prefix ? `${prefix}/${entry}` : entry;
    const absolute = join(root, relative);

    if (statSync(absolute).isDirectory()) {
      out.push(...walkFolder(root, relative));
    } else {
      const bytes = new Uint8Array(readFileSync(absolute));
      out.push({ path: relative, file: new File([bytes], entry) });
    }
  }

  return out;
}

if (!existsSync(SAMPLE_FILE) || !existsSync(SAMPLE_FOLDER)) {
  console.log("No Canvas sample export found in src/assets/canvas — skipping the parser checks.");
  process.exit(0);
}

// ---------------------------------------------------------------------------
// The ZIP and the extracted folder should describe the same course
// ---------------------------------------------------------------------------

console.log("\nCanvas course export — .imscc archive");

const zipStore = await openCartridge(new File([new Uint8Array(readFileSync(SAMPLE_FILE))], "AP_Calculus_AB.imscc"));
const fromZip = await parseCourseExport(zipStore, { sourceName: "AP_Calculus_AB.imscc" });
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
const { hasBrokenNamespace, parseXml: parseXmlDirect } = await import("../src/lib/tools/imscc-viewer/xml");
const broken = `<?xml version="1.0"?>
<quiz xmlns="http://canvas.instructure.com/xsd/cccv1p0" xmlns:xsi="http://canvas.instructure.com/xsd/cccv1p0 https://canvas.instructure.com/xsd/cccv1p0.xsd" identifier="x">
  <title>Broken</title>
</quiz>`;
check("broken namespace detected", hasBrokenNamespace(broken), true);
check("broken namespace repaired", parseXmlDirect(broken, "broken.xml").documentElement.localName, "quiz");

// ---------------------------------------------------------------------------
// The extracted folder should describe the same course
// ---------------------------------------------------------------------------

console.log("\nCanvas course export — extracted folder");

const folderStore = await openCartridge(walkFolder(SAMPLE_FOLDER));
const fromFolder = await parseCourseExport(folderStore, { sourceName: "AP_Calculus_AB" });
const folderCourse = fromFolder.export;

check("folder: module count", folderCourse.modules.length, course.modules.length);
check("folder: item count", folderCourse.items.length, course.items.length);
check("folder: file count", folderCourse.files.length, course.files.length);
check("folder: course title", folderCourse.meta.title, course.meta.title);
check(
  "folder: same module titles",
  folderCourse.modules.map((module) => module.title),
  course.modules.map((module) => module.title),
);
check(
  "folder: same item titles",
  folderCourse.items.map((item) => item.title),
  course.items.map((item) => item.title),
);

// ---------------------------------------------------------------------------
// Sanitising
// ---------------------------------------------------------------------------

console.log("\nContent sanitising");

const { processContent } = await import("../src/lib/tools/imscc-viewer/content");

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

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll Canvas parser checks passed.");
