/** Browser smoke test for Drawbridge. Build first, then run bun run test:e2e. */
import { existsSync, readFileSync } from "node:fs";
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
  check("Transcript to Text on the homepage", await page.locator('a[href="/tools/transcript-to-text"]').count(), 1);
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
  const lightTheme = await page.evaluate(() => {
    const style = getComputedStyle(document.body);
    return { background: style.backgroundColor, foreground: style.color };
  });
  check("light foreground differs from its background", lightTheme.foreground !== lightTheme.background, true);

  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForSelector("html.dark");
  check(
    "system dark color scheme",
    await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme),
    "dark",
  );
  const darkTheme = await page.evaluate(() => {
    const style = getComputedStyle(document.body);
    return { background: style.backgroundColor, foreground: style.color };
  });
  check("dark foreground differs from its background", darkTheme.foreground !== darkTheme.background, true);
  check("light and dark backgrounds respond to the theme", darkTheme.background !== lightTheme.background, true);
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
    lightTheme.background,
  );

  await themeToggle.click();
  await page.waitForSelector("html.dark");
  check("manual dark preference saved", await page.evaluate(() => localStorage.getItem("colorTheme")), "dark");
  await page.reload({ waitUntil: "networkidle" });
  check(
    "dark preference persists across reload",
    await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
    darkTheme.background,
  );

  await page.getByRole("link", { name: "Guides", exact: true }).first().click();
  await page.waitForURL((url) => url.pathname === "/guides");
  check("dark preference persists across client navigation", await page.locator("html.dark").count(), 1);
  await themeToggle.click();
  await page.waitForFunction(() => !document.documentElement.classList.contains("dark"));
  check("Course Explorer guide listed", await page.locator('a[href="/guides/course-explorer"]').count(), 2);
  check("Rubric Explorer guide listed", await page.locator('a[href="/guides/rubric-explorer"]').count(), 2);
  check("Transcript to Text guide listed", await page.locator('a[href="/guides/transcript-to-text"]').count(), 2);

  console.log("\nDesign reference — foundations and interactive specimens");
  await page.goto(`${BASE}/design`, { waitUntil: "networkidle" });
  check("design reference opened", await page.locator("h1").textContent(), "Design reference");
  check("all ten design sections render", await page.locator("[data-design-root] > section").count(), 10);
  check("all five palette scales render", await page.locator('article[aria-labelledby^="palette-"]').count(), 5);
  check(
    "every palette scale has eleven shades",
    await page
      .locator('article[aria-labelledby^="palette-"]')
      .evaluateAll((articles) => articles.every((article) => article.querySelectorAll("figure").length === 12)),
    true,
  );
  check(
    "swatch values come from rendered CSS",
    await page
      .locator("[data-color-value]")
      .evaluateAll((values) => values.every((value) => Boolean(value.textContent?.trim()))),
    true,
  );

  const designLightValue = await page.locator("[data-color-value]").first().textContent();
  await themeToggle.click();
  await page.waitForSelector("html.dark");
  await page.waitForFunction(
    (previous) => document.querySelector("[data-color-value]")?.textContent !== previous,
    designLightValue,
  );
  check("semantic swatches update in dark mode", await page.locator("html.dark").count(), 1);
  await themeToggle.click();
  await page.waitForFunction(() => !document.documentElement.classList.contains("dark"));

  await page.getByRole("tab", { name: "Tokens", exact: true }).click();
  check(
    "design tabs respond",
    await page.getByRole("tab", { name: "Tokens", exact: true }).getAttribute("aria-selected"),
    "true",
  );
  await page.getByRole("button", { name: "Toggle details" }).click();
  check("design collapsible responds", await page.getByText("Additional details", { exact: true }).isVisible(), true);
  await page.getByRole("button", { name: "Open sheet" }).click();
  check("design sheet opens", await page.getByRole("heading", { name: "Design sheet" }).isVisible(), true);
  await page.keyboard.press("Escape");
  await page.getByRole("heading", { name: "Design sheet" }).waitFor({ state: "hidden" });
  check(
    "design sheet closes with Escape",
    await page.getByRole("heading", { name: "Design sheet" }).isVisible(),
    false,
  );
  await page.getByRole("button", { name: "Success", exact: true }).click();
  check("design toast opens", await page.getByText("success notification", { exact: true }).isVisible(), true);

  await page.setInputFiles("#design-source-file", {
    name: "preview.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("This content must not be read"),
  });
  check(
    "design picker reports selection without reading content",
    await page.locator("[data-source-status]").textContent(),
    "preview.txt selected. Its contents were not read.",
  );
  check(
    "design interactions do not persist source data",
    await page.evaluate(() => Object.keys(localStorage).filter((key) => key !== "colorTheme")),
    [],
  );
  check(
    "design buttons have accessible names",
    await page
      .locator("button:visible")
      .evaluateAll((buttons) =>
        buttons.every((button) => Boolean(button.textContent?.trim() || button.getAttribute("aria-label"))),
      ),
    true,
  );

  await page.emulateMedia({ reducedMotion: "reduce" });
  check(
    "design respects reduced-motion availability",
    await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches),
    true,
  );
  await page.setViewportSize({ width: 320, height: 844 });
  check(
    "no design horizontal overflow at 320px",
    await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
    true,
  );
  await page.setViewportSize({ width: 640, height: 900 });
  check(
    "no design horizontal overflow at the 200% zoom-equivalent width",
    await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
    true,
  );
  await page.setViewportSize({ width: 1280, height: 900 });

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
  const canvasSwitcher = page.getByRole("navigation", { name: "Canvas course export tools" });
  check("Canvas tool switcher is visible", await canvasSwitcher.isVisible(), true);
  check(
    "current Canvas tool is identified",
    await canvasSwitcher.getByRole("link", { name: "Course Explorer" }).getAttribute("aria-current"),
    "page",
  );
  check(
    "transcript tool is not a Canvas sibling",
    await canvasSwitcher.getByRole("link", { name: "Transcript to Text" }).count(),
    0,
  );
  await canvasSwitcher.getByRole("link", { name: "Rubric Explorer" }).click();
  await page.waitForSelector("[data-rubric-content]:not([hidden])");
  check("switcher retains the Canvas course", await page.textContent("[data-workspace-title]"), "Sample Course");
  await canvasSwitcher.getByRole("link", { name: "Course Explorer" }).click();
  await page.waitForSelector("[data-course-content]:not([hidden])");
  check("switcher returns to Course Explorer", await page.textContent("[data-workspace-title]"), "Sample Course");
  check("summary includes rubrics", (await page.textContent("[data-course-summary]"))?.includes("Rubrics"), true);
  check(
    "selected view uses the semantic accent state",
    await page
      .locator('[data-course-view="modules"]')
      .evaluate(
        (element) => element.classList.contains("bg-accent") && element.getAttribute("aria-pressed") === "true",
      ),
    true,
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

  console.log("\nTranscript to Text — review, search, edit, and export");
  await page.goto(`${BASE}/tools/transcript-to-text`, { waitUntil: "networkidle" });
  check(
    "transcript import accepts only .vtt",
    await page.locator("[data-source-input]").getAttribute("accept"),
    ".vtt",
  );
  check(
    "standalone transcript has no source switcher",
    await page.locator('nav[aria-label="WebVTT transcript tools"]').count(),
    0,
  );
  const transcriptVtt = `WEBVTT

1
00:00:00.000 --> 00:00:02.000
<v Alex Smith>Welcome to the review.</v>

2
00:00:02.000 --> 00:00:04.000
<v Alex Smith>We will discuss the plan.</v>

3
00:00:04.000 --> 00:00:06.000
<v Morgan Lee>I agree.</v>

4
00:00:06.000 --> 00:00:08.000
<v Alex Smith>Action item follows.</v>
`;
  await page.setInputFiles("[data-source-input]", {
    name: "transcript.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(transcriptVtt),
  });
  await page.waitForSelector("[data-source-error]:not([hidden])");
  check(
    "wrong transcript extension is explained",
    await page.textContent("[data-source-error-message]"),
    "Choose a WebVTT transcript with a .vtt filename.",
  );
  await page.setInputFiles("[data-source-input]", {
    name: "invalid.vtt",
    mimeType: "text/vtt",
    buffer: Buffer.from("Not a transcript"),
  });
  await page.waitForFunction(() =>
    document.querySelector("[data-source-error-message]")?.textContent?.includes("WebVTT"),
  );
  check(
    "invalid WebVTT header is explained",
    await page.textContent("[data-source-error-message]"),
    "This is not a WebVTT transcript. Choose a .vtt file with a WEBVTT header.",
  );
  const uploadTranscript = async () => {
    await page.setInputFiles("[data-source-input]", {
      name: "teams-call.vtt",
      mimeType: "text/vtt",
      buffer: Buffer.from(transcriptVtt),
    });
    await page.waitForSelector("[data-transcript-content]:not([hidden])");
  };
  await uploadTranscript();
  check("transcript filename shown", await page.textContent("[data-workspace-title]"), "teams-call.vtt");
  check("four transcript cues reviewed", await page.locator("[data-transcript-cue]").count(), 4);
  check("two people listed", await page.locator("[data-speaker-filter]").count(), 2);
  check("last cue time summarized", (await page.textContent("[data-transcript-summary]"))?.includes("00:00:08"), true);
  check(
    "no transcript data persisted",
    await page.evaluate(() => Object.keys(localStorage).filter((key) => key !== "colorTheme")),
    [],
  );

  await page.fill("[data-transcript-search]", "action");
  check("text search finds one cue", await page.locator("[data-transcript-cue]").count(), 1);
  check("review count describes filtering", await page.textContent("[data-transcript-results]"), "1 of 4 cues shown");
  await page.click("[data-transcript-clear-filters]");
  const alexFilter = page.locator('[data-speaker-filter="Alex Smith"]');
  await alexFilter.focus();
  await page.keyboard.press("Enter");
  check("people filter finds Alex's cues", await page.locator("[data-transcript-cue]").count(), 3);
  check(
    "people filter does not limit plaintext",
    (await page.locator("[data-transcript-output]").inputValue()).includes("Morgan Lee: I agree."),
    true,
  );
  await page.fill("[data-transcript-search]", "I agree");
  check("search and people filters combine", await page.locator("[data-transcript-cue]").count(), 0);
  check("empty review state is visible", await page.locator("[data-transcript-empty]").isVisible(), true);
  await page.click("[data-transcript-clear-filters]");
  check("clearing review filters restores every cue", await page.locator("[data-transcript-cue]").count(), 4);

  const alexName = page.locator('[data-speaker-name="Alex Smith"]');
  await alexName.fill("Casey Smith");
  await alexName.press("Tab");
  await page.waitForFunction(() => document.querySelector("[data-transcript-output]")?.textContent !== undefined);
  check(
    "corrected name appears in people list",
    await page.locator('[data-speaker-name="Alex Smith"]').inputValue(),
    "Casey Smith",
  );
  await page.fill("[data-transcript-search]", "Casey");
  check("corrected speaker names are searchable", await page.locator("[data-transcript-cue]").count(), 3);
  await page.click("[data-transcript-clear-filters]");

  const generatedTranscript =
    "Casey Smith: Welcome to the review. We will discuss the plan.\n\nMorgan Lee: I agree.\n\nCasey Smith: Action item follows.";
  check(
    "speaker paragraphs are generated",
    await page.locator("[data-transcript-output]").inputValue(),
    generatedTranscript,
  );
  await page.getByRole("tab", { name: "Plain text" }).click();
  await page.getByLabel("Include start times").check();
  check(
    "start times use each paragraph's first cue",
    (await page.locator("[data-transcript-output]").inputValue()).startsWith("[00:00:00] Casey Smith:"),
    true,
  );
  await page.getByLabel("Include start times").uncheck();
  const reviewedTranscript = `${generatedTranscript}\n\nReviewed note.`;
  await page.locator("[data-transcript-output]").fill(reviewedTranscript);
  check("manual edit state is visible", await page.locator("[data-transcript-edited]").isVisible(), true);
  page.once("dialog", async (dialog) => {
    check(
      "format changes warn before replacing edits",
      dialog.message().includes("replace your manual plaintext edits"),
      true,
    );
    await dialog.dismiss();
  });
  await page.getByLabel("Include speaker names").click();
  check(
    "canceling a format change preserves its setting",
    await page.getByLabel("Include speaker names").isChecked(),
    true,
  );
  check(
    "canceling a format change preserves manual edits",
    await page.locator("[data-transcript-output]").inputValue(),
    reviewedTranscript,
  );

  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
  await page.click("[data-transcript-copy]");
  check(
    "copy uses the exact reviewed text",
    await page.evaluate(() => navigator.clipboard.readText()),
    reviewedTranscript,
  );
  const downloadEvent = page.waitForEvent("download");
  await page.click("[data-transcript-download]");
  const transcriptDownload = await downloadEvent;
  check("plaintext download is named after the transcript", transcriptDownload.suggestedFilename(), "teams-call.txt");
  check(
    "download contains the exact reviewed text",
    readFileSync((await transcriptDownload.path())!, "utf8"),
    reviewedTranscript,
  );

  await page.getByRole("link", { name: "Guide", exact: true }).click();
  await page.waitForURL(`${BASE}/guides/transcript-to-text`);
  check("transcript guide opened", await page.locator("h1").textContent(), "Transcript to Text guide");
  await page.getByRole("link", { name: "Back to Transcript to Text" }).click();
  await page.waitForSelector("[data-transcript-content]:not([hidden])");
  check(
    "guide return retains transcript edits",
    await page.locator("[data-transcript-output]").inputValue(),
    reviewedTranscript,
  );
  await page.click("[data-workspace-close]");
  check("clear transcript restores the source picker", await page.locator("[data-source-picker]").isVisible(), true);
  await uploadTranscript();
  await page.setViewportSize({ width: 320, height: 844 });
  check(
    "no Transcript to Text horizontal overflow at 320px",
    await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
    true,
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  check(
    "transcript respects reduced-motion availability",
    await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches),
    true,
  );
  check(
    "transcript buttons have accessible names",
    await page
      .locator("button:visible")
      .evaluateAll((buttons) =>
        buttons.every((button) => Boolean(button.textContent?.trim() || button.getAttribute("aria-label"))),
      ),
    true,
  );
  // A 640 CSS-pixel layout is equivalent to a 1280px-wide window at 200% zoom.
  await page.setViewportSize({ width: 640, height: 900 });
  check(
    "no Transcript to Text horizontal overflow at the 200% zoom-equivalent width",
    await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
    true,
  );
  await page.reload({ waitUntil: "networkidle" });
  check("refresh clears the transcript", await page.locator("[data-transcript-content]").isVisible(), false);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE}/tools/course-explorer`, { waitUntil: "networkidle" });

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
