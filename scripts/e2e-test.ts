/** Browser smoke test for Course Explorer. Build first, then run bun run test:e2e. */
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { buildSampleCartridge } from "./make-sample-cartridge";

const PORT = Number(process.env.E2E_PORT ?? 4322);
const EXTERNAL_BASE = process.env.BASE_URL;
const BASE = EXTERNAL_BASE ?? `http://localhost:${PORT}`;
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

async function startPreview(): Promise<void> {
  const binary = new URL("../node_modules/.bin/astro", import.meta.url).pathname;
  const server = spawn(binary, ["preview", "--port", String(PORT)], { stdio: ["ignore", "pipe", "pipe"] });
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
  throw new Error(`Preview server did not start on ${BASE}. Did you run bun run build?`);
}

function stopPreview(): void {
  const binary = new URL("../node_modules/.bin/astro", import.meta.url).pathname;
  spawn(binary, ["preview", "stop"], { stdio: "ignore" });
}

if (!EXTERNAL_BASE) await startPreview();
const browser = await chromium.launch(SYSTEM_CHROMIUM ? { executablePath: SYSTEM_CHROMIUM } : undefined);

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const consoleErrors: string[] = [];
  const externalRequests: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(String(err)));
  page.on("request", (request) => {
    if (!request.url().startsWith(BASE) && !request.url().startsWith("blob:") && !request.url().startsWith("data:")) {
      externalRequests.push(request.url());
    }
  });

  console.log("\nSite shell");
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto(BASE, { waitUntil: "networkidle" });
  const themeToggle = page.locator('[data-slot="theme-toggle"]');
  check("Course Explorer on the homepage", await page.locator('a[href="/tools/course-explorer"]').count(), 1);
  check("Rubric Explorer on the homepage", await page.locator('a[href="/tools/rubric-explorer"]').count(), 1);
  check("theme toggle visible", await themeToggle.isVisible(), true);
  check(
    "theme toggle accessible name",
    await themeToggle.getAttribute("aria-label"),
    "Switch between light and dark themes",
  );
  check(
    "light color scheme",
    await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme),
    "light",
  );
  check(
    "Gruyrecheese light background",
    await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
    "rgb(250, 244, 234)",
  );
  check(
    "Gruyrecheese light foreground",
    await page.evaluate(() => getComputedStyle(document.body).color),
    "rgb(27, 21, 9)",
  );
  check(
    "Poseidon primary links",
    await page
      .getByRole("link", { name: "Read the privacy details" })
      .evaluate((element) => getComputedStyle(element).color),
    "rgb(15, 76, 114)",
  );
  check(
    "Sea Goddess tool accents",
    await page
      .locator("#tools .bg-secondary")
      .first()
      .evaluate((element) => getComputedStyle(element).backgroundColor),
    "rgb(210, 237, 250)",
  );
  check(
    "Pompelmo source labels",
    await page
      .getByText("Canvas course export", { exact: true })
      .first()
      .evaluate((element) => getComputedStyle(element).color),
    "rgb(172, 0, 34)",
  );

  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForSelector("html.dark");
  check(
    "system dark color scheme",
    await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme),
    "dark",
  );
  check(
    "Gruyrecheese dark background",
    await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
    "rgb(27, 21, 9)",
  );
  check(
    "Gruyrecheese dark foreground",
    await page.evaluate(() => getComputedStyle(document.body).color),
    "rgb(250, 244, 234)",
  );
  check(
    "dark Poseidon primary links",
    await page
      .getByRole("link", { name: "Read the privacy details" })
      .evaluate((element) => getComputedStyle(element).color),
    "rgb(114, 192, 249)",
  );
  check(
    "dark Sea Goddess tool accents",
    await page
      .locator("#tools .bg-secondary")
      .first()
      .evaluate((element) => getComputedStyle(element).backgroundColor),
    "rgb(10, 59, 77)",
  );
  check(
    "dark Pompelmo source labels",
    await page
      .getByText("Canvas course export", { exact: true })
      .first()
      .evaluate((element) => getComputedStyle(element).color),
    "rgb(255, 149, 145)",
  );
  check("system preference remains selected", await page.evaluate(() => localStorage.getItem("colorTheme")), "system");
  check("dark toggle state", await themeToggle.getAttribute("aria-pressed"), "true");

  await themeToggle.focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => !document.documentElement.classList.contains("dark"));
  check("keyboard toggles the theme", await page.evaluate(() => localStorage.getItem("colorTheme")), "light");
  await page.reload({ waitUntil: "networkidle" });
  check(
    "saved light preference overrides the dark system theme",
    await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
    "rgb(250, 244, 234)",
  );

  await themeToggle.click();
  await page.waitForSelector("html.dark");
  check("manual dark preference saved", await page.evaluate(() => localStorage.getItem("colorTheme")), "dark");
  await page.reload({ waitUntil: "networkidle" });
  check(
    "dark preference persists across reload",
    await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
    "rgb(27, 21, 9)",
  );

  await page.getByRole("link", { name: "Guides", exact: true }).first().click();
  await page.waitForURL((url) => url.pathname === "/guides");
  check("dark preference persists across client navigation", await page.locator("html.dark").count(), 1);
  await themeToggle.click();
  await page.waitForFunction(() => !document.documentElement.classList.contains("dark"));
  check("Course Explorer guide listed", await page.locator('a[href="/guides/course-explorer"]').count(), 2);
  check("Rubric Explorer guide listed", await page.locator('a[href="/guides/rubric-explorer"]').count(), 2);

  console.log("\nCourse Explorer — import and browse");
  await page.goto(`${BASE}/tools/course-explorer`, { waitUntil: "networkidle" });
  check("source picker visible", await page.locator("[data-source-picker]").isVisible(), true);
  check("course content initially hidden", await page.locator("[data-course-content]").isVisible(), false);
  check(
    "course import accepts only .imscc",
    await page.locator("[data-source-input]").getAttribute("accept"),
    ".imscc",
  );

  const cartridge = await buildSampleCartridge();
  await page.setInputFiles("[data-source-input]", {
    name: "sample.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(cartridge),
  });
  await page.waitForSelector("[data-source-error]:not([hidden])");
  check(
    "renamed ZIP shows imscc-only guidance",
    await page.textContent("[data-source-error-message]"),
    "Choose a Canvas Common Cartridge course export with an .imscc filename.",
  );
  check("renamed ZIP does not open the course", await page.locator("[data-course-content]").isVisible(), false);

  const upload = async () => {
    await page.setInputFiles("[data-source-input]", {
      name: "sample.imscc",
      mimeType: "application/zip",
      buffer: Buffer.from(cartridge),
    });
    await page.waitForSelector("[data-course-content]:not([hidden])");
  };
  await upload();

  check("course title shown", await page.textContent("[data-workspace-title]"), "Sample Course");
  check("summary includes rubrics", (await page.textContent("[data-course-summary]"))?.includes("Rubrics"), true);
  check(
    "Butternut selected view",
    await page.locator('[data-course-view="modules"]').evaluate((element) => getComputedStyle(element).backgroundColor),
    "rgb(255, 197, 175)",
  );
  check("three module items", await page.locator("[data-module-list] [data-entity-id]").count(), 3);
  check(
    "no course data persisted",
    await page.evaluate(() => Object.keys(localStorage).filter((key) => key !== "colorTheme")),
    [],
  );

  const assignmentButton = page.locator('[data-module-list] [data-entity-id="g_assignment_1"]');
  await assignmentButton.focus();
  check(
    "module items accept keyboard focus",
    await assignmentButton.evaluate((button) => button === document.activeElement),
    true,
  );
  await page.keyboard.press("Enter");
  const assignmentDetail = (await page.textContent("[data-course-detail]")) ?? "";
  check("detail shows the assignment", assignmentDetail.includes("Sample Assignment"), true);
  check("detail shows points", assignmentDetail.includes("25"), true);
  check("detail shows the rubric", assignmentDetail.includes("Sample Rubric"), true);
  check("detail shows readable content", assignmentDetail.includes("Complete the sample assignment"), true);
  check("equation text is preserved", assignmentDetail.includes("x^2 + y^2 = z^2"), true);
  check("embed becomes an outbound link", assignmentDetail.includes("Open embedded content on youtube.com"), true);
  check("no iframe is rendered", await page.locator("[data-course-body] iframe").count(), 0);
  await page.click('[data-course-body] [data-canvas-target="module:g_module_1"]');
  check("module links reveal their module", await page.locator('[data-module-id="g_module_1"][open]').count(), 1);
  await assignmentButton.focus();
  await page.keyboard.press("Enter");
  await page.click('[data-course-body] [data-canvas-target="object:g_quiz_1"]');
  check(
    "Canvas object links open their content",
    (await page.textContent("[data-course-detail]"))?.includes("Week 1 Sample Quiz"),
    true,
  );

  await page.click('[data-course-view="inventory"]');
  check(
    "all content includes the unplaced page",
    await page.locator("[data-inventory-list] [data-entity-id]").count(),
    4,
  );
  await page.fill("[data-course-search]", "Welcome");
  check("body search finds the home page", await page.locator("[data-inventory-list] [data-entity-id]").count(), 1);
  await page.click('[data-inventory-list] [data-entity-id="g_home_page"]');
  check("home page detail opens", (await page.textContent("[data-course-detail]"))?.includes("Front page"), true);

  await page.fill("[data-course-search]", "");
  await page.selectOption("[data-course-type-filter]", "quiz");
  check("type filter finds two quizzes", await page.locator("[data-inventory-list] [data-entity-id]").count(), 2);
  await page.selectOption("[data-course-type-filter]", "all");

  console.log("\nRubric Explorer — relationships and comparison");
  await page.click('[data-course-view="modules"]');
  await assignmentButton.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("link", { name: "Open Sample Rubric in Rubric Explorer", exact: true }).click();
  await page.waitForSelector("[data-rubric-content]:not([hidden])");
  check(
    "rubric import accepts only .imscc",
    await page.locator("[data-source-input]").getAttribute("accept"),
    ".imscc",
  );
  check("rubric handoff keeps the course", await page.textContent("[data-workspace-title]"), "Sample Course");
  check(
    "requested rubric is selected",
    (await page.textContent("[data-rubric-detail]"))?.includes("Sample Rubric"),
    true,
  );
  check("rubric criteria are readable", (await page.textContent("[data-rubric-detail]"))?.includes("Mechanics"), true);
  check("rating levels are readable", (await page.textContent("[data-rubric-detail]"))?.includes("Exemplary"), true);
  check("grading role is shown", (await page.textContent("[data-rubric-detail]"))?.includes("Used for grading"), true);
  check("all four rubrics are listed", await page.locator("[data-rubric-list] [data-rubric-id]").count(), 4);
  check(
    "exact-copy group is shown",
    (await page.textContent("[data-copy-groups]"))?.includes("Sample Rubric (copy)"),
    true,
  );
  check("same-name group is shown", (await page.textContent("[data-name-groups]"))?.includes("2 versions"), true);

  await page.selectOption("[data-rubric-filter]", "variations");
  check("variation filter finds two rubrics", await page.locator("[data-rubric-list] [data-rubric-id]").count(), 2);
  await page.fill("[data-rubric-search]", "Organization");
  check("criterion search narrows the variation", await page.locator("[data-rubric-list] [data-rubric-id]").count(), 1);
  await page.locator('[data-rubric-list] [data-rubric-id="g_rubric_4"]').focus();
  await page.keyboard.press("Enter");
  check("variation detail opens", (await page.textContent("[data-rubric-detail]"))?.includes("Organization"), true);
  await page.fill("[data-rubric-search]", "");
  await page.selectOption("[data-rubric-filter]", "all");
  await page.click('[data-rubric-list] [data-rubric-id="g_rubric_3"]');
  check(
    "unlinked state is scoped to this export",
    (await page.textContent("[data-rubric-detail]"))?.includes("No linked activities in this export."),
    true,
  );

  await page.click('[data-rubric-view="compare"]');
  await page.selectOption("[data-compare-left]", "g_rubric_1");
  await page.selectOption("[data-compare-right]", "g_rubric_2");
  check(
    "exact copies compare as matching",
    (await page.textContent("[data-comparison-result]"))?.includes("Same rubric content"),
    true,
  );
  await page.selectOption("[data-compare-right]", "g_rubric_4");
  const comparisonText = (await page.textContent("[data-comparison-result]")) ?? "";
  check("variations compare as different", comparisonText.includes("Rubric content differs"), true);
  check(
    "criterion difference is identified",
    comparisonText.includes("Different") && comparisonText.includes("Organization"),
    true,
  );

  await page.click('[data-rubric-view="browse"]');
  await page.click('[data-rubric-list] [data-rubric-id="g_rubric_1"]');
  await page.click('[data-rubric-detail] a[href="/tools/course-explorer?item=g_assignment_1"]');
  await page.waitForSelector("[data-course-content]:not([hidden])");
  check(
    "activity handoff selects the assignment",
    (await page.textContent("[data-course-detail]"))?.includes("Sample Assignment"),
    true,
  );

  console.log("\nSession navigation and cleanup");
  await page.getByRole("link", { name: "Guide", exact: true }).click();
  await page.waitForURL(`${BASE}/guides/course-explorer`);
  check("guide opened", await page.locator("h1").textContent(), "Course Explorer guide");
  await page.getByRole("link", { name: "Back to Course Explorer" }).click();
  await page.waitForSelector("[data-course-content]:not([hidden])");
  check("course survives guide navigation", await page.textContent("[data-workspace-title]"), "Sample Course");

  await page.click("[data-workspace-close]");
  check("close course clears the workspace", await page.locator("[data-course-content]").isVisible(), false);
  check("source picker returns", await page.locator("[data-source-picker]").isVisible(), true);

  await upload();
  await page.reload({ waitUntil: "networkidle" });
  check("refresh clears the course", await page.locator("[data-course-content]").isVisible(), false);

  console.log("\nResponsive layout and privacy");
  await upload();
  await page.setViewportSize({ width: 320, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  check(
    "reduced-motion preference is available to the controller",
    await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches),
    true,
  );
  await page.click('[data-course-view="inventory"]');
  await page.click('[data-inventory-list] [data-entity-id="g_assignment_1"]');
  check("detail is visible at 320px", await page.locator("[data-course-detail]").isVisible(), true);
  check(
    "no Course Explorer horizontal overflow at 320px",
    await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
    true,
  );
  await page.getByRole("link", { name: "Open Sample Rubric in Rubric Explorer", exact: true }).click();
  await page.waitForSelector("[data-rubric-content]:not([hidden])");
  await page.click('[data-rubric-view="compare"]');
  check("rubric comparison is visible at 320px", await page.locator("[data-comparison-result]").isVisible(), true);
  check(
    "no Rubric Explorer horizontal overflow at 320px",
    await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
    true,
  );
  check(
    "visible buttons have accessible names",
    await page
      .locator("button:visible")
      .evaluateAll((buttons) =>
        buttons.every((button) => Boolean(button.textContent?.trim() || button.getAttribute("aria-label"))),
      ),
    true,
  );
  check("no third-party requests", externalRequests, []);
  check("no browser console errors", consoleErrors, []);

  const oldRoute = await page.request.get(`${BASE}/tools/imscc-viewer`);
  check("old viewer route removed", oldRoute.status(), 404);
} finally {
  await browser.close();
  if (!EXTERNAL_BASE) stopPreview();
}

if (failures > 0) {
  console.error(`\n${failures} browser check(s) failed.`);
  process.exit(1);
}
console.log("\nAll browser checks passed.");
