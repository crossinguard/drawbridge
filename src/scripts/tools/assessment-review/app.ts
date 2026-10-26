/**
 * Client-side controller for the Canvas Assessment Review.
 *
 * All state lives in memory; nothing is persisted or transmitted.
 */
import JSZip from "jszip";
import { toast } from "@starwind-ui/runtime/toast";

import { renderAlertList } from "@/scripts/lib/alerts";
import { byId, esc, escAttr } from "@/scripts/lib/dom";
import { copyToClipboard, download } from "@/scripts/lib/io";
import { createStepper } from "@/scripts/lib/stepper";

import { openCartridge } from "@/lib/canvas/store";
import { parseCourseExport } from "@/lib/canvas/parse";
import type { CourseExport } from "@/lib/canvas/types";

import { runChecks, suggestGroups } from "@/lib/tools/assessment-review/checks/index";
import { applyGroupOverrides } from "@/lib/tools/assessment-review/checks/quizzes";
import { buildReview } from "@/lib/tools/assessment-review/model";
import { buildBundle, type Bundle } from "@/lib/tools/assessment-review/bundle";
import { settingsFromJson, type ReviewSettings } from "@/lib/tools/assessment-review/settings";

import { matchingAssessments, onQuizMoved, renderDetail, renderPanel, renderTabs } from "./review-view";
import { resetState, state } from "./state";

// ---------------------------------------------------------------------------
// Step navigation
// ---------------------------------------------------------------------------

/**
 * The stepper drives the open → review → export flow.
 *
 * Nothing past the first step is reachable until a course has been loaded.
 */
const stepper = createStepper({
  canReach: (index) => index === 0 || state.review !== null,
  onEnter: (index) => {
    if (index === 1) {
      renderTabs();
      renderPanel();
      renderDetail();
      renderSettings();
    }
    if (index === 2) renderExport();
  },
});

// ---------------------------------------------------------------------------
// Opening a course
// ---------------------------------------------------------------------------

const fileInput = byId<HTMLInputElement>("file-input");
const dropZone = byId("drop-zone");

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) void loadArchive(file);
  fileInput.value = "";
});

byId("choose-file").addEventListener("click", () => fileInput.click());

dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("border-primary", "bg-primary/5");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("border-primary", "bg-primary/5");
});

dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("border-primary", "bg-primary/5");
  void handleDrop(event);
});

/** Open whatever was dropped onto the drop zone. */
async function handleDrop(event: DragEvent): Promise<void> {
  const dropped = Array.from(event.dataTransfer?.files ?? []);
  const archive = dropped.find((file) => /\.(imscc|zip)$/i.test(file.name));

  if (!archive) {
    toast.error("Nothing usable was dropped", {
      description: "Drop a .imscc or .zip file — the course export itself.",
    });
    return;
  }

  await loadArchive(archive);
}

/** Read a course out of a ZIP archive. */
async function loadArchive(file: File): Promise<void> {
  const status = byId("open-status");
  const summary = byId("open-summary");
  const errors = byId("open-errors");

  errors.innerHTML = "";
  summary.hidden = true;
  status.textContent = "Reading the course export…";

  try {
    const store = await openCartridge(file);
    const { export: course, content } = await parseCourseExport(store, { sourceName: file.name });

    resetState();
    state.store = store;
    state.course = course;
    state.content = content;

    const review = buildReview(course, content);
    const groups = suggestGroups(review, state.settings);
    const result = runChecks(review, groups, state.settings);

    state.review = review;
    state.groups = groups;
    state.families = result.families;
    state.findings = result.findings;
    state.candidates = result.candidates;
    state.stats = result.stats;

    renderSummary(course, review);
    fillGroupFilter();
    renderStats();
    renderSettings();
    renderAlertList(byId("open-warnings"), {
      variant: "warning",
      title: "Notes about this export",
      items: course.warnings,
    });

    // The next step is reachable now that a course is loaded.
    stepper.refresh();

    status.textContent = "";
    toast.success(`Loaded ${course.meta.title}`, {
      description: `${review.assessments.length} graded items · ${result.findings.length} findings`,
    });
  } catch (error) {
    status.textContent = "";
    renderAlertList(errors, {
      variant: "error",
      title: "That could not be opened as a Canvas course export",
      items: [error instanceof Error ? error.message : String(error)],
    });
    toast.error("The course export could not be opened");
  }
}

/** Show what was found in the export. */
function renderSummary(course: CourseExport, review: ReturnType<typeof buildReview>): void {
  const container = byId("open-summary");
  const rows: [string, string][] = [];

  if (course.meta.code) rows.push(["Course code", course.meta.code]);
  if (course.meta.accountName) rows.push(["Account", course.meta.accountName]);
  if (course.meta.domain) rows.push(["Exported from", course.meta.domain]);
  if (course.meta.exportedAt) rows.push(["Exported", course.meta.exportedAt]);
  rows.push(["Source", course.meta.sourceName]);
  rows.push(["Graded items", String(review.assessments.length)]);
  rows.push(["Quizzes", String(review.assessments.filter((a) => a.kind === "quiz").length)]);
  rows.push(["Rubrics", String(review.rubrics.length)]);
  rows.push(["Findings", String(state.findings.length)]);

  container.innerHTML = `
    <div class="grid gap-3">
      <div class="grid gap-1">
        <span class="text-sm font-medium">${esc(course.meta.title)}</span>
        <span class="text-xs text-muted-foreground">Ready to review.</span>
      </div>
      <dl class="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        ${rows
          .map(
            ([label, value]) => `
              <div class="flex justify-between gap-3 border-b border-border/60 py-1">
                <dt class="text-muted-foreground">${esc(label)}</dt>
                <dd class="text-right">${esc(value)}</dd>
              </div>
            `,
          )
          .join("")}
      </dl>
      <div>
        <button type="button" id="open-course" class="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
          Review the course
        </button>
      </div>
    </div>
  `;

  container.hidden = false;
  byId("open-course").addEventListener("click", () => stepper.goTo(1));
}

// ---------------------------------------------------------------------------
// Reviewing
// ---------------------------------------------------------------------------

byId<HTMLInputElement>("search-input").addEventListener("input", (event) => {
  state.search = (event.target as HTMLInputElement).value;
  renderPanel();
});

byId<HTMLSelectElement>("kind-filter").addEventListener("change", (event) => {
  state.kindFilter = (event.target as HTMLSelectElement).value as typeof state.kindFilter;
  renderPanel();
});

byId<HTMLSelectElement>("usage-filter").addEventListener("change", (event) => {
  state.usageFilter = (event.target as HTMLSelectElement).value as typeof state.usageFilter;
  renderPanel();
});

byId<HTMLSelectElement>("group-filter").addEventListener("change", (event) => {
  state.groupFilter = (event.target as HTMLSelectElement).value;
  renderPanel();
});

/** Fill the group filter with the course's assignment groups. */
function fillGroupFilter(): void {
  const select = byId<HTMLSelectElement>("group-filter");
  const review = state.review;
  if (!review) return;

  const current = state.groupFilter;
  select.innerHTML = `<option value="all">All groups</option>`;

  for (const group of review.groups) {
    const option = document.createElement("option");
    option.value = group.id;
    option.textContent = group.title;
    select.appendChild(option);
  }

  select.value = current;
}

/** Show how much is on screen. */
function renderStats(): void {
  const stats = byId("review-stats");
  const review = state.review;
  if (!review) {
    stats.innerHTML = "";
    return;
  }

  const shown = matchingAssessments().length;
  const needsReview = state.findings.filter((finding) => finding.needsReview).length;

  stats.innerHTML = `
    <span>${shown} of ${review.assessments.length} graded items shown</span>
    <span aria-hidden="true">·</span>
    <span>${state.findings.length} findings</span>
    <span aria-hidden="true">·</span>
    <span>${state.candidates.length} candidates</span>
    <span aria-hidden="true">·</span>
    <span>${needsReview} needing a decision</span>
  `;
}

/** Run the checks again, after the reviewer changed something. */
function rerun(): void {
  const review = state.review;
  if (!review) return;

  const groups = applyGroupOverrides(state.groups, state.overrides);
  const result = runChecks(review, groups, state.settings);

  state.groups = groups;
  state.families = result.families;
  state.findings = result.findings;
  state.candidates = result.candidates;
  state.stats = result.stats;
  renderStats();
}

// ---------------------------------------------------------------------------
// The settings
// ---------------------------------------------------------------------------

/** Draw the settings card. */
function renderSettings(): void {
  const container = byId("review-settings");
  if (!container) return;

  const settings = state.settings;

  container.innerHTML = `
    <div class="grid gap-4">
      <p class="text-xs text-muted-foreground">
        These settings decide what the review checks and what the export carries. They are saved in the bundle's
        <code>manifest.json</code>, so a colleague can see exactly which rules produced the results.
      </p>

      <fieldset class="grid gap-2">
        <legend class="text-sm font-medium">When the instructions are silent</legend>
        ${checkbox("setting-shuffle", "Answers should be shuffled", settings.quizDefaults.shuffleAnswers)}
        ${checkbox("setting-attempts", "The number of attempts should be checked", settings.quizDefaults.reviewAttempts)}
        ${checkbox("setting-time", "The time limit should be checked", settings.quizDefaults.reviewTimeLimit)}
      </fieldset>

      <fieldset class="grid gap-2">
        <legend class="text-sm font-medium">The course's own naming patterns</legend>
        ${checkbox("setting-naming-check", "Items that do not follow the pattern are reported", settings.naming.checkTitlePatterns)}
        <div class="grid gap-1.5">
          <label class="text-sm font-medium" for="setting-naming-patterns">Extra title patterns</label>
          <textarea id="setting-naming-patterns" rows="2"
            class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="One pattern per line">${esc(settings.naming.extraPatterns.join("\n"))}</textarea>
          <p class="text-xs text-muted-foreground">
            Patterns to treat as the course's own, on top of the ones the tool reads out of the titles.
          </p>
        </div>
      </fieldset>

      <fieldset class="grid gap-2">
        <legend class="text-sm font-medium">How quizzes are grouped for comparison</legend>
        ${checkbox("setting-group-title", "By title pattern", settings.quizGrouping.byTitlePattern)}
        ${checkbox("setting-group-assignment", "By assignment group", settings.quizGrouping.byAssignmentGroup)}
        ${checkbox("setting-group-engine", "By engine and points", settings.quizGrouping.byEngineAndPoints)}
        ${checkbox("setting-group-points", "By points", settings.quizGrouping.byPoints)}
      </fieldset>

      <div class="grid gap-1.5">
        <label class="text-sm font-medium" for="setting-term-pattern">Term pattern</label>
        <input id="setting-term-pattern" type="text" value="${escAttr(settings.termPattern)}"
          class="h-9 w-full rounded-md border border-border bg-background px-3 text-sm" />
        <p class="text-xs text-muted-foreground">
          A regular expression. The term of the export is read out of the course title and code with it.
        </p>
      </div>

      <div class="grid gap-1.5">
        <label class="text-sm font-medium" for="setting-legacy-terms">Retired terms</label>
        <textarea id="setting-legacy-terms" rows="3"
          class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          placeholder="One term per line">${esc(settings.legacyTerms.join("\n"))}</textarea>
      </div>

      <div class="grid gap-1.5">
        <label class="text-sm font-medium" for="setting-vague-words">Words to look at in a rubric level</label>
        <textarea id="setting-vague-words" rows="3"
          class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          placeholder="One word per line">${esc(settings.vagueWords.join("\n"))}</textarea>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <button type="button" id="copy-settings"
          class="rounded-md border border-border px-3 py-1.5 text-sm transition-colors hover:bg-muted">
          Copy the settings as JSON
        </button>
        <button type="button" id="load-settings"
          class="rounded-md border border-border px-3 py-1.5 text-sm transition-colors hover:bg-muted">
          Load settings from JSON
        </button>
        <input type="file" id="settings-file" accept="application/json,.json" class="sr-only" />
      </div>
    </div>
  `;

  container.querySelectorAll<HTMLInputElement>("input[type=checkbox][data-setting]").forEach((input) => {
    input.addEventListener("change", () => {
      applySetting(input.dataset.setting!, input.checked);
      rerun();
      renderSettings();
      renderPanel();
    });
  });

  byId<HTMLInputElement>("setting-term-pattern").addEventListener("change", (event) => {
    state.settings.termPattern = (event.target as HTMLInputElement).value;
    rerun();
  });

  byId<HTMLTextAreaElement>("setting-naming-patterns").addEventListener("change", (event) => {
    state.settings.naming.extraPatterns = lines((event.target as HTMLTextAreaElement).value);
    rerun();
  });

  byId<HTMLTextAreaElement>("setting-legacy-terms").addEventListener("change", (event) => {
    state.settings.legacyTerms = lines((event.target as HTMLTextAreaElement).value);
    rerun();
  });

  byId<HTMLTextAreaElement>("setting-vague-words").addEventListener("change", (event) => {
    state.settings.vagueWords = lines((event.target as HTMLTextAreaElement).value);
    rerun();
  });

  byId("copy-settings").addEventListener("click", () => {
    void copyToClipboard(JSON.stringify(state.settings, null, 2), "The settings");
  });

  byId("load-settings").addEventListener("click", () => byId<HTMLInputElement>("settings-file").click());

  byId<HTMLInputElement>("settings-file").addEventListener("change", async (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    try {
      const parsed = JSON.parse(await file.text());
      state.settings = settingsFromJson(parsed);
      rerun();
      renderSettings();
      renderPanel();
      toast.success("The settings were loaded");
    } catch {
      toast.error("That file could not be read as settings");
    }

    (event.target as HTMLInputElement).value = "";
  });
}

/** A checkbox for one setting. */
function checkbox(id: string, label: string, checked: boolean): string {
  return `
    <label class="flex items-center gap-2 text-sm" for="${id}">
      <input type="checkbox" id="${id}" data-setting="${id}" ${checked ? "checked" : ""}
        class="size-4 rounded border-border" />
      <span>${esc(label)}</span>
    </label>
  `;
}

/** Apply one checkbox to the settings. */
function applySetting(id: string, checked: boolean): void {
  const settings = state.settings;

  switch (id) {
    case "setting-shuffle":
      settings.quizDefaults.shuffleAnswers = checked;
      break;
    case "setting-attempts":
      settings.quizDefaults.reviewAttempts = checked;
      break;
    case "setting-time":
      settings.quizDefaults.reviewTimeLimit = checked;
      break;
    case "setting-naming-check":
      settings.naming.checkTitlePatterns = checked;
      break;
    case "setting-group-title":
      settings.quizGrouping.byTitlePattern = checked;
      break;
    case "setting-group-assignment":
      settings.quizGrouping.byAssignmentGroup = checked;
      break;
    case "setting-group-engine":
      settings.quizGrouping.byEngineAndPoints = checked;
      break;
    case "setting-group-points":
      settings.quizGrouping.byPoints = checked;
      break;
  }
}

/** The non-empty lines of a textarea. */
function lines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

// ---------------------------------------------------------------------------
// Exporting
// ---------------------------------------------------------------------------

/** The bundle for the course that is open. */
function buildCurrentBundle(): Bundle | null {
  const review = state.review;
  if (!review) return null;

  return buildBundle({
    review,
    findings: state.findings,
    candidates: state.candidates,
    stats: state.stats,
    groups: state.groups,
    families: state.families,
    settings: state.settings,
    priorities: state.overrides.priorities,
  });
}

/** Show what the export will contain. */
function renderExport(): void {
  const container = byId("export-preview");
  const stats = byId("export-stats");
  const settings = byId("export-settings");

  if (!state.review) {
    container.innerHTML = "";
    stats.textContent = "";
    if (settings) settings.innerHTML = "";
    return;
  }

  renderExportSettings();

  const bundle = buildCurrentBundle();
  if (!bundle) return;

  const totalChars = bundle.files.reduce((sum, file) => sum + file.content.length, 0);
  const failures = bundle.reconciliation.failures.length;

  stats.innerHTML = `
    <span>${bundle.files.length} files</span>
    <span aria-hidden="true">·</span>
    <span>${Math.max(1, Math.round(totalChars / 1024))} KB in total</span>
    <span aria-hidden="true">·</span>
    <span>${bundle.brief.length} characters in the brief</span>
    <span aria-hidden="true">·</span>
    <span>${state.findings.length} findings</span>
    <span aria-hidden="true">·</span>
    <span>${failures === 0 ? "all reconciliation checks passed" : `${failures} reconciliation check(s) failed`}</span>
  `;

  const rows = bundle.files
    .map(
      (file) => `
        <tr class="border-b border-border/60">
          <td class="py-1.5 pr-3 align-top font-mono text-xs">${esc(file.name)}</td>
          <td class="py-1.5 pr-3 align-top text-xs text-muted-foreground">${esc(file.purpose)}</td>
          <td class="py-1.5 pr-3 align-top text-right text-xs">${file.rows === 0 ? "—" : file.rows}</td>
          <td class="py-1.5 pr-3 align-top text-right text-xs">${file.content.length.toLocaleString()}</td>
          <td class="py-1.5 align-top text-right">
            <button type="button" class="rounded border border-border px-2 py-0.5 text-xs transition-colors hover:bg-muted"
              data-download="${escAttr(file.name)}">Download</button>
          </td>
        </tr>
      `,
    )
    .join("");

  container.innerHTML = `
    <div class="grid gap-3 p-4">
      ${
        failures > 0
          ? `<div class="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs">
               <p class="font-medium">${failures} reconciliation check(s) did not pass.</p>
               <p class="text-muted-foreground">They are listed in the brief's open questions.</p>
             </div>`
          : ""
      }
      <div class="overflow-auto rounded-md border border-border">
        <table class="w-full text-sm">
          <thead class="[&_tr]:border-b">
            <tr>
              <th class="py-1.5 pr-3 text-left font-medium">File</th>
              <th class="py-1.5 pr-3 text-left font-medium">What it holds</th>
              <th class="py-1.5 pr-3 text-right font-medium">Rows</th>
              <th class="py-1.5 pr-3 text-right font-medium">Characters</th>
              <th class="py-1.5 text-right font-medium"></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="grid gap-2">
        <span class="text-xs font-medium text-muted-foreground">The brief</span>
        <pre class="max-h-96 overflow-auto rounded-md bg-muted/40 p-3 text-xs whitespace-pre-wrap">${esc(bundle.brief)}</pre>
      </div>
    </div>
  `;

  container.querySelectorAll<HTMLButtonElement>("[data-download]").forEach((button) => {
    button.addEventListener("click", () => {
      const file = bundle.files.find((entry) => entry.name === button.dataset.download);
      if (!file) return;
      download(file.content, file.name, "text/plain;charset=utf-8");
    });
  });
}

/** The export settings: the detail level and what to leave out. */
function renderExportSettings(): void {
  const container = byId("export-settings");
  if (!container) return;

  const settings = state.settings;

  container.innerHTML = `
    <div class="grid gap-4">
      <fieldset class="grid gap-2">
        <legend class="text-sm font-medium">How much detail the bundle carries</legend>
        ${radio("detail-brief", "brief", settings.detailLevel === "brief")}
        <p class="text-xs text-muted-foreground">The brief and the tables only.</p>
        ${radio("detail-standard", "standard", settings.detailLevel === "standard")}
        <p class="text-xs text-muted-foreground">Adds a detail file for every item with findings.</p>
        ${radio("detail-full", "full", settings.detailLevel === "full")}
        <p class="text-xs text-muted-foreground">Adds a detail file for every item, and every instruction in full.</p>
      </fieldset>

      <fieldset class="grid gap-2">
        <legend class="text-sm font-medium">What to leave out</legend>
        ${exportCheckbox("include-pages", "Pages", settings.include.pages)}
        ${exportCheckbox("include-discussions", "Discussions that are not graded", settings.include.ungradedDiscussions)}
        ${exportCheckbox("include-legacy", "Rubrics that look like leftovers", settings.include.legacyRubrics)}
        ${exportCheckbox("include-banks", "Item banks", settings.include.itemBanks)}
      </fieldset>
    </div>
  `;

  container.querySelectorAll<HTMLInputElement>("input[data-detail]").forEach((input) => {
    input.addEventListener("change", () => {
      if (!input.checked) return;
      state.settings.detailLevel = input.dataset.detail as ReviewSettings["detailLevel"];
      renderExport();
      renderExportSettings();
    });
  });

  container.querySelectorAll<HTMLInputElement>("input[data-include]").forEach((input) => {
    input.addEventListener("change", () => {
      const key = input.dataset.include as keyof ReviewSettings["include"];
      state.settings.include[key] = input.checked;
      renderExport();
    });
  });
}

/** A radio button for the detail level. */
function radio(id: string, value: string, checked: boolean): string {
  return `
    <label class="flex items-center gap-2 text-sm" for="${id}">
      <input type="radio" name="detail-level" id="${id}" data-detail="${value}" ${checked ? "checked" : ""}
        class="size-4 border-border" />
      <span class="font-medium">${esc(value)}</span>
    </label>
  `;
}

/** A checkbox for what the export leaves out. */
function exportCheckbox(id: string, label: string, checked: boolean): string {
  return `
    <label class="flex items-center gap-2 text-sm" for="${id}">
      <input type="checkbox" id="${id}" data-include="${id}" ${checked ? "checked" : ""}
        class="size-4 rounded border-border" />
      <span>${esc(label)}</span>
    </label>
  `;
}

byId("download-bundle").addEventListener("click", () => {
  const bundle = buildCurrentBundle();
  if (!bundle) return;

  void (async () => {
    try {
      const zip = new JSZip();
      const folder = zip.folder(bundle.name);
      if (!folder) throw new Error("The archive could not be prepared.");

      for (const file of bundle.files) {
        folder.file(file.name, file.content);
      }

      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${bundle.name}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      toast.success(`The bundle was downloaded`, {
        description: `${bundle.files.length} files in ${bundle.name}.zip`,
      });
    } catch (error) {
      toast.error("The bundle could not be prepared", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  })();
});

byId("copy-brief").addEventListener("click", () => {
  const bundle = buildCurrentBundle();
  if (!bundle) return;
  void copyToClipboard(bundle.brief, "The brief");
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

renderTabs();
renderSettings();

onQuizMoved(() => {
  rerun();
  renderPanel();
  renderDetail();
});
