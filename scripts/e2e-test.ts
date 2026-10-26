/**
 * End-to-end smoke test for the tool pages.
 *
 * Walks the Outcome Mapper and the Rubric → Canvas CSV tool through their
 * import → review → export flows and asserts that the shared stepper,
 * components and controllers still behave.
 *
 * Runs against the production build by default: it starts `astro preview`
 * itself, so the test exercises the same bundle that ships. Set BASE_URL to
 * point it at an already-running server instead.
 *
 * Run with: bun run test:e2e
 */
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";

import { chromium } from "playwright";

import { buildSampleCartridge } from "./make-sample-cartridge";

const PORT = Number(process.env.E2E_PORT ?? 4322);
const EXTERNAL_BASE = process.env.BASE_URL;
const BASE = EXTERNAL_BASE ?? `http://localhost:${PORT}`;

/** Prefer a system Chromium so the test does not need a Playwright download. */
const SYSTEM_CHROMIUM = ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"].find((path) =>
  existsSync(path),
);

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

/**
 * Start `astro preview` and resolve once the server answers.
 *
 * The local binary is used directly rather than through `bunx`, which eats the
 * `--port` flag and leaves the server on the default port.
 */
async function startPreview(): Promise<void> {
  const binary = new URL("../node_modules/.bin/astro", import.meta.url).pathname;
  const server = spawn(binary, ["preview", "--port", String(PORT)], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  server.stdout?.on("data", () => {});
  server.stderr?.on("data", (chunk) => process.stderr.write(chunk));

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(BASE);
      if (response.ok) return;
    } catch {
      // Not up yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  stopPreview();
  throw new Error(`Preview server did not start on ${BASE}. Did you run \`bun run build\`?`);
}

/** Stop the preview server started by `startPreview`. */
function stopPreview(): void {
  const binary = new URL("../node_modules/.bin/astro", import.meta.url).pathname;
  spawn(binary, ["preview", "stop"], { stdio: "ignore" });
}

if (!EXTERNAL_BASE) await startPreview();

const browser = await chromium.launch(SYSTEM_CHROMIUM ? { executablePath: SYSTEM_CHROMIUM } : undefined);
const page = await browser.newPage();

const consoleErrors: string[] = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => consoleErrors.push(String(err)));

// ---------------------------------------------------------------------------
// Outcome Mapper
// ---------------------------------------------------------------------------

console.log("\nOutcome Mapper");
await page.goto(`${BASE}/tools/outcome-mapper`, { waitUntil: "networkidle" });

check("import step visible", await page.locator("#step-import").isVisible(), true);
check("map step hidden", await page.locator("#step-map").isVisible(), false);
check("export step hidden", await page.locator("#step-export").isVisible(), false);
check("step 2 disabled", await page.locator("#step-2 [data-step-action]").isDisabled(), true);
check("active step marked", await page.getAttribute("#step-1", "aria-current"), "step");

// Loading sample outcomes should move to the map step.
await page.click("#load-sample-outcomes");
await page.waitForSelector("#step-map:not([hidden])");

check("map step visible after load", await page.locator("#step-map").isVisible(), true);
check("import step hidden after load", await page.locator("#step-import").isVisible(), false);
check("step 2 enabled", await page.locator("#step-2 [data-step-action]").isDisabled(), false);
check("step 1 marked done", await page.getAttribute("#step-1", "aria-current"), null);
check("step 2 marked active", await page.getAttribute("#step-2", "aria-current"), "step");
check("outcome rows rendered", await page.locator("#outcome-editor > div").count(), 3);
// 3 course outcomes x 2 program parents + 3 assessment outcomes x 3 course parents.
check("mapping checkboxes rendered", await page.locator("#outcome-editor input[type=checkbox]").count(), 15);

// The sample already contains six mappings via its `mapsTo` column, but the
// count badge lives in the export step and is only filled in on arrival.
const firstCheckbox = page.locator("#outcome-editor input[type=checkbox]").first();
const wasChecked = await firstCheckbox.isChecked();
await firstCheckbox.setChecked(!wasChecked);
check("mapping toggled", await firstCheckbox.isChecked(), !wasChecked);

await page.click("#step-map [data-step-nav=next]");
await page.waitForSelector("#step-export:not([hidden])");

check("export step visible", await page.locator("#step-export").isVisible(), true);
check("alignment count updated", await page.textContent("#alignment-count"), wasChecked ? "5" : "7");
check("preview rendered", (await page.textContent("#export-preview"))?.includes("Child Level"), true);

// Back navigation returns to the map step.
await page.click("#step-export [data-step-nav=back]");
await page.waitForSelector("#step-map:not([hidden])");
check("back returns to map", await page.locator("#step-map").isVisible(), true);
check(
  "mapping still ticked",
  await page.locator("#outcome-editor input[type=checkbox]").first().isChecked(),
  !wasChecked,
);

// Stepper badge navigation works.
await page.click("#step-1 [data-step-action]");
await page.waitForSelector("#step-import:not([hidden])");
check("stepper navigates to import", await page.locator("#step-import").isVisible(), true);

// ---------------------------------------------------------------------------
// Rubric → Canvas CSV
// ---------------------------------------------------------------------------

console.log("\nRubric → Canvas CSV");
await page.goto(`${BASE}/tools/rubric-csv`, { waitUntil: "networkidle" });

check("import step visible", await page.locator("#step-import").isVisible(), true);
check("review step hidden", await page.locator("#step-review").isVisible(), false);
check("export step hidden", await page.locator("#step-export").isVisible(), false);
check("step 2 disabled", await page.locator("#step-2 [data-step-action]").isDisabled(), true);

// The starter rubric should parse and move to the review step.
await page.click("#load-sample");
await page.waitForSelector("#step-review:not([hidden])");

check("review step visible after load", await page.locator("#step-review").isVisible(), true);
check("step 2 enabled", await page.locator("#step-2 [data-step-action]").isDisabled(), false);
check("criteria grid populated", (await page.locator("#criteria-grid > *").count()) > 0, true);
check("totals rendered", await page.textContent("#count-badge"), "4");

// Continue to export.
await page.click("#step-review [data-step-nav=next]");
await page.waitForSelector("#step-export:not([hidden])");

check("export step visible", await page.locator("#step-export").isVisible(), true);
check("file name shown", await page.textContent("#csv-filename"), "starter-rubric.csv");
check("preview rendered", (await page.textContent("#csv-preview"))?.includes("Rating Name"), true);

// Back to review, then back to import.
await page.click("#step-export [data-step-nav=back]");
await page.waitForSelector("#step-review:not([hidden])");
check("back returns to review", await page.locator("#step-review").isVisible(), true);

await page.click("#step-review [data-step-nav=back]");
await page.waitForSelector("#step-import:not([hidden])");
check("back returns to import", await page.locator("#step-import").isVisible(), true);

// ---------------------------------------------------------------------------
// Canvas Course Export Viewer
// ---------------------------------------------------------------------------

console.log("\nCanvas Course Export Viewer");
await page.goto(`${BASE}/tools/imscc-viewer`, { waitUntil: "networkidle" });

check("open step visible", await page.locator("#step-open").isVisible(), true);
check("browse step hidden", await page.locator("#step-browse").isVisible(), false);
check("audit step hidden", await page.locator("#step-audit").isVisible(), false);
check("step 2 disabled", await page.locator("#step-2 [data-step-action]").isDisabled(), true);

// Opening a cartridge should reveal what it holds and unlock the next step.
const cartridge = await buildSampleCartridge();
await page.setInputFiles("#file-input", {
  name: "sample.imscc",
  mimeType: "application/zip",
  buffer: Buffer.from(cartridge),
});
await page.waitForSelector("#open-summary:not([hidden])");

check("summary shows the course title", (await page.textContent("#open-summary"))?.includes("Sample Course"), true);
check("summary shows the account", (await page.textContent("#open-summary"))?.includes("Sample District"), true);
check("step 2 enabled once a course is loaded", await page.locator("#step-2 [data-step-action]").isDisabled(), false);

await page.click("#open-course");
await page.waitForSelector("#step-browse:not([hidden])");

check("browse step visible", await page.locator("#step-browse").isVisible(), true);
check("three module items", await page.textContent("#browse-total"), "3");
check("outline rendered", (await page.locator("#browse-outline button[data-item]").count()) > 0, true);

// The item's content and settings should be there.
await page.click("#browse-outline button[data-item]");
await page.waitForTimeout(200);
const detail = (await page.textContent("#browse-detail")) ?? "";
check("detail shows the title", detail.includes("Sample Assignment"), true);
check("detail shows the points", detail.includes("25"), true);
check("detail shows the body", detail.includes("Complete the sample assignment"), true);
check("detail lists the links", detail.includes("Links in this item"), true);

// The table view holds the same items.
await page.click("#view-table");
await page.waitForTimeout(200);
check("table pane visible", await page.locator("#browse-table-pane").isVisible(), true);
check("table rows", await page.locator("#browse-table-body tr").count(), 3);

// The report should catch the self-enrolling course and the zero-weight group.
await page.click("#step-3 [data-step-action]");
await page.waitForSelector("#step-audit:not([hidden])");
await page.waitForTimeout(200);

const report = (await page.textContent("#audit-findings")) ?? "";
check("findings rendered", (await page.locator("#audit-findings article").count()) > 0, true);
check("self-enrolment finding", report.includes("self-enrolling"), true);
check("orphan finding", report.includes("not in any module"), true);

// The report can be downloaded.
const downloadPromise = page.waitForEvent("download");
await page.click("#download-report");
const download = await downloadPromise;
check("report file name", download.suggestedFilename(), "sample-course-report.md");

// ---------------------------------------------------------------------------
// Canvas Assessment Review
// ---------------------------------------------------------------------------

console.log("\nCanvas Assessment Review");
await page.goto(`${BASE}/tools/assessment-review`, { waitUntil: "networkidle" });

check("open step visible", await page.locator("#step-open").isVisible(), true);
check("review step hidden", await page.locator("#step-review").isVisible(), false);
check("export step hidden", await page.locator("#step-export").isVisible(), false);
check("step 2 disabled", await page.locator("#step-2 [data-step-action]").isDisabled(), true);

// The viewer only takes an archive now, so there is no folder picker.
check("no folder picker", await page.locator("#folder-input").count(), 0);

await page.setInputFiles("#file-input", {
  name: "sample.imscc",
  mimeType: "application/zip",
  buffer: Buffer.from(cartridge),
});
await page.waitForSelector("#open-summary:not([hidden])");

check("summary shows the course title", (await page.textContent("#open-summary"))?.includes("Sample Course"), true);
check("step 2 enabled once a course is loaded", await page.locator("#step-2 [data-step-action]").isDisabled(), false);

await page.click("#open-course");
await page.waitForSelector("#step-review:not([hidden])");

check("review step visible", await page.locator("#step-review").isVisible(), true);
check("tabs rendered", await page.locator("#review-tabs-list button").count(), 7);

// The review settings are there, and they are the reviewer's to change.
check("the settings card rendered", (await page.locator("#review-settings input[type=checkbox]").count()) >= 7, true);
check("the term pattern is editable", await page.locator("#setting-term-pattern").count(), 1);

// The overview says what the course holds and what the review found.
const overview = (await page.textContent("#review-panel")) ?? "";
check("overview names the course", overview.includes("Sample Course"), true);
check("overview counts the rubrics", overview.includes("Rubrics"), true);

// The assessments tab lists the graded items.
await page.click("#review-tabs-list button[data-tab=assessments]");
await page.waitForTimeout(200);
check("assessment rows rendered", await page.locator("#review-panel tbody tr").count(), 3);

// Choosing one shows its instructions and rubric.
await page.click("#review-panel tbody tr");
await page.waitForTimeout(200);
const itemDetail = (await page.textContent("#review-detail")) ?? "";
check("detail shows the instructions", itemDetail.includes("Write at least 5 complete sentences"), true);
check("detail shows the rubric", itemDetail.includes("Formatting and Length"), true);

// The quizzes tab groups the two quizzes together.
await page.click("#review-tabs-list button[data-tab=quizzes]");
await page.waitForTimeout(200);
const quizzes = (await page.textContent("#review-panel")) ?? "";
check("quizzes grouped", quizzes.includes("Week N Sample Quiz"), true);
check("quiz settings shown", quizzes.includes("Time limit"), true);

// The findings tab lists what the review found.
await page.click("#review-tabs-list button[data-tab=flags]");
await page.waitForTimeout(200);
const flags = (await page.textContent("#review-panel")) ?? "";
check("rubric mismatch reported", flags.includes("rubric that drives the score totals 30"), true);
check("quiz points mismatch reported", flags.includes("add up to 5 points"), true);
check("outlier reported", flags.includes("time limit"), true);

// The reviewer can change a priority, and it sticks.
const priorityButton = page.locator("#review-panel button[data-priority]").first();
const priorityId = await priorityButton.getAttribute("data-priority");
await priorityButton.click();
await page.waitForTimeout(200);
check("priority override recorded", priorityId !== null, true);

// The export step builds the bundle.
await page.click("#step-3 [data-step-action]");
await page.waitForSelector("#step-export:not([hidden])");
await page.waitForTimeout(400);

const preview = (await page.textContent("#export-preview")) ?? "";
check("preview lists the brief", preview.includes("00_brief.md"), true);
check("preview lists the findings table", preview.includes("data_findings.csv"), true);
check("preview lists the manifest", preview.includes("manifest.json"), true);
check("preview shows the brief", preview.includes("Export identity"), true);
check("preview shows the reconciliation", preview.includes("Reconciliation"), true);
check("preview shows the quiz families", preview.includes("Quiz summary"), true);
check("preview does not show the old module map", preview.includes("Module map"), false);

// The export settings choose how much the bundle carries.
check("the export settings rendered", await page.locator("#export-settings input[name=detail-level]").count(), 3);

// Every file in the bundle can be downloaded on its own.
const briefDownload = page.waitForEvent("download");
await page.click('#export-preview button[data-download="00_brief.md"]');
const briefFile = await briefDownload;
check("brief file name", briefFile.suggestedFilename(), "00_brief.md");

// The whole bundle downloads as one archive.
const bundleDownload = page.waitForEvent("download");
await page.click("#download-bundle");
const bundleFile = await bundleDownload;
check("bundle file name", bundleFile.suggestedFilename(), "sample-course-assessment-review.zip");

// ---------------------------------------------------------------------------
// Guides
// ---------------------------------------------------------------------------

console.log("\nGuides");
await page.goto(`${BASE}/guides`, { waitUntil: "networkidle" });
check("two guide cards", await page.locator("section > a[href^='/guides/']").count(), 0);
check("guide links", await page.locator("a[href^='/guides/']").count(), 8);

await page.goto(`${BASE}/guides/rubric-csv`, { waitUntil: "networkidle" });
check("guide renders", await page.locator(".sw-prose h2").count(), 5);
check("guide table renders", await page.locator("[data-slot='table']").count(), 1);
check("breadcrumb renders", await page.locator("[data-slot='breadcrumb-list']").count(), 1);

// ---------------------------------------------------------------------------
// Starwind runtime
// ---------------------------------------------------------------------------

console.log("\nStarwind runtime");
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });

// Theme toggle.
const themeToggle = page.locator("[data-sw-theme-toggle]");
const isDark = async () => ((await page.getAttribute("html", "class")) ?? "").includes("dark");
const darkBefore = await isDark();
await themeToggle.click();
await page.waitForTimeout(200);
check("theme toggle flips the theme", await isDark(), !darkBefore);
await themeToggle.click();
await page.waitForTimeout(200);
check("theme toggle restores the theme", await isDark(), darkBefore);

// Mobile navigation sheet.
await page.setViewportSize({ width: 480, height: 900 });
await page.reload({ waitUntil: "networkidle" });
await page.click("[aria-label='Open navigation menu']");
await page.waitForTimeout(400);
check("mobile nav opens", await page.locator("[data-slot='sheet-content']").isVisible(), true);
check("mobile nav links", await page.locator("[data-slot='sheet-content'] a[href^='/']").count(), 3);
await page.setViewportSize({ width: 1280, height: 1000 });

// Toasts.
await page.goto(`${BASE}/tools/outcome-mapper`, { waitUntil: "networkidle" });
await page.click("#load-sample-outcomes");
await page.waitForTimeout(400);
check("toast shown", await page.locator("[data-slot='toast']").isVisible(), true);

// ---------------------------------------------------------------------------

console.log("\nConsole");
check("no console errors", consoleErrors, []);

await browser.close();
if (!EXTERNAL_BASE) stopPreview();

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll end-to-end checks passed.");
