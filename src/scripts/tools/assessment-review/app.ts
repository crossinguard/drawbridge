/**
 * Client-side controller for the Canvas Assessment Review.
 *
 * All state lives in memory; nothing is persisted or transmitted.
 */
import { toast } from "@starwind-ui/runtime/toast";

import { renderAlertList } from "@/scripts/lib/alerts";
import { byId, esc, slugify } from "@/scripts/lib/dom";
import { copyToClipboard, download } from "@/scripts/lib/io";
import { createStepper } from "@/scripts/lib/stepper";

import { openCartridge } from "@/lib/canvas/store";
import { parseCourseExport } from "@/lib/canvas/parse";
import type { CourseExport } from "@/lib/canvas/types";

import { runChecks, suggestGroups } from "@/lib/tools/assessment-review/checks/index";
import { buildReview } from "@/lib/tools/assessment-review/model";
import { applyGroupOverrides, toPrepFile } from "@/lib/tools/assessment-review/prep-file";

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
    const groups = suggestGroups(review);
    const { findings } = runChecks(review, groups, state.rules);

    state.review = review;
    state.groups = groups;
    state.findings = findings;

    renderSummary(course, review);
    fillGroupFilter();
    renderStats();
    renderAlertList(byId("open-warnings"), {
      variant: "warning",
      title: "Notes about this export",
      items: course.warnings,
    });

    // The next step is reachable now that a course is loaded.
    stepper.refresh();

    status.textContent = "";
    toast.success(`Loaded ${course.meta.title}`, {
      description: `${review.assessments.length} graded items · ${findings.length} findings`,
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
    <span>${needsReview} needing a decision</span>
  `;
}

/** Run the checks again, after the reviewer changed something. */
function rerun(): void {
  const review = state.review;
  if (!review) return;

  const groups = applyGroupOverrides(state.groups, state.overrides);
  const { findings } = runChecks(review, groups, state.rules);

  state.groups = groups;
  state.findings = findings;
  renderStats();
}

// ---------------------------------------------------------------------------
// Exporting
// ---------------------------------------------------------------------------

/** Build the prep file for the course that is open. */
function buildPrepFile(): string {
  const review = state.review;
  if (!review) return "";

  return toPrepFile({
    review,
    findings: state.findings,
    groups: state.groups,
    rules: state.rules,
    overrides: state.overrides,
    sourceName: review.course.meta.sourceName,
    includeEveryAssessment: byId<HTMLInputElement>("every-assessment").checked,
  });
}

/** Show what the export will contain. */
function renderExport(): void {
  const container = byId("export-preview");
  const stats = byId("export-stats");

  if (!state.review) {
    container.innerHTML = "";
    stats.textContent = "";
    return;
  }

  const prep = buildPrepFile();
  const lines = prep.split("\n");

  stats.innerHTML = `
    <span>${lines.length} lines</span>
    <span aria-hidden="true">·</span>
    <span>${Math.max(1, Math.round(prep.length / 1024))} KB</span>
    <span aria-hidden="true">·</span>
    <span>${state.findings.length} findings</span>
    <span aria-hidden="true">·</span>
    <span>${state.findings.filter((finding) => finding.needsReview).length} needing a decision</span>
  `;

  const preview = lines.slice(0, 100).join("\n");
  const tail = lines.length > 140 ? lines.slice(-40).join("\n") : "";
  const gap = tail === "" ? "" : `\n\n… ${lines.length - 140} lines in between …\n\n`;

  container.innerHTML = `
    <div class="grid gap-2 p-4">
      <p class="text-xs text-muted-foreground">
        The first ${Math.min(100, lines.length)} and last ${tail === "" ? 0 : 40} of ${lines.length} lines. The whole file is
        downloaded.
      </p>
      <pre class="max-h-96 overflow-auto rounded-md bg-muted/40 p-3 text-xs whitespace-pre-wrap">${esc(preview + gap + tail)}</pre>
    </div>
  `;
}

byId<HTMLInputElement>("every-assessment").addEventListener("change", () => {
  renderExport();
});

byId("download-prep").addEventListener("click", () => {
  if (!state.review) return;

  const title = state.review.course.meta.title;
  const name = slugify(title, "canvas-course");

  download(buildPrepFile(), `${name}-assessment-review.md`, "text/markdown;charset=utf-8");
});

byId("copy-prep").addEventListener("click", () => {
  if (!state.review) return;
  void copyToClipboard(buildPrepFile(), "The review");
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

renderTabs();

onQuizMoved(() => {
  rerun();
  renderPanel();
  renderDetail();
});
