/**
 * Client-side controller for the Canvas Course Export Viewer.
 *
 * All state lives in memory; nothing is persisted or transmitted.
 */
import { toast } from "@starwind-ui/runtime/toast";

import { renderAlertList } from "@/scripts/lib/alerts";
import { byId, esc } from "@/scripts/lib/dom";
import { copyToClipboard, download } from "@/scripts/lib/io";
import { createStepper } from "@/scripts/lib/stepper";

import { auditCourse } from "@/lib/tools/imscc-viewer/audit";
import { parseCourseExport } from "@/lib/canvas/parse";
import { toFindingsCsv, toInventoryCsv, toMarkdownReport } from "@/lib/tools/imscc-viewer/report";
import { openCartridge, type FileStore } from "@/lib/canvas/store";
import type { CourseExport } from "@/lib/canvas/types";

import { renderAudit } from "./audit-view";
import { renderBrowse, renderDetail } from "./browse";
import { resetState, state } from "./state";

// ---------------------------------------------------------------------------
// Step navigation
// ---------------------------------------------------------------------------

/**
 * The stepper drives the open → browse → audit flow.
 *
 * Nothing past the first step is reachable until a course has been loaded.
 */
const stepper = createStepper({
  canReach: (index) => index === 0 || state.course !== null,
  onEnter: (index) => {
    if (index === 1) {
      renderBrowse(state);
      renderDetail(state);
    }
    if (index === 2) renderAudit(state);
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
      description: "Drop a .imscc or .zip file — the course export itself, not a folder.",
    });
    return;
  }

  await loadArchive(archive);
}

/** Read a course out of a ZIP archive. */
async function loadArchive(file: File): Promise<void> {
  await loadCourse(() => openCartridge(file), file.name);
}

/** Open a cartridge, parse it, and show what was found. */
async function loadCourse(open: () => Promise<FileStore>, sourceName: string): Promise<void> {
  const status = byId("open-status");
  const summary = byId("open-summary");
  const errors = byId("open-errors");

  errors.innerHTML = "";
  summary.hidden = true;
  status.textContent = "Reading the course export…";

  try {
    const store = await open();
    const { export: course, content } = await parseCourseExport(store, { sourceName });

    resetState();
    state.store = store;
    state.course = course;
    state.content = content;
    state.findings = auditCourse({ course, content });

    renderSummary(course);
    renderAlertList(byId("open-warnings"), {
      variant: "warning",
      title: "Notes about this export",
      items: course.warnings,
    });

    // The next step is reachable now that a course is loaded.
    stepper.refresh();

    status.textContent = "";
    toast.success(`Loaded ${course.meta.title}`, {
      description: `${course.modules.length} modules · ${course.items.length} items`,
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
function renderSummary(course: CourseExport): void {
  const container = byId("open-summary");
  const rows: [string, string][] = [];

  if (course.meta.code) rows.push(["Course code", course.meta.code]);
  if (course.meta.accountName) rows.push(["Account", course.meta.accountName]);
  if (course.meta.domain) rows.push(["Exported from", course.meta.domain]);
  if (course.meta.exportedAt) rows.push(["Exported", course.meta.exportedAt]);
  rows.push(["Source", course.meta.sourceName]);
  rows.push(["Modules", String(course.modules.length)]);
  rows.push(["Module items", String(course.items.length)]);
  rows.push(["Outside any module", String(course.orphans.length)]);
  rows.push(["Files", String(course.files.length)]);

  container.innerHTML = `
    <div class="grid gap-3">
      <div class="grid gap-1">
        <span class="text-sm font-medium">${esc(course.meta.title)}</span>
        <span class="text-xs text-muted-foreground">Ready to browse.</span>
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
          Open course
        </button>
      </div>
    </div>
  `;

  container.hidden = false;
  byId("open-course").addEventListener("click", () => stepper.goTo(1));
}

// ---------------------------------------------------------------------------
// Browsing
// ---------------------------------------------------------------------------

byId<HTMLInputElement>("search-input").addEventListener("input", (event) => {
  state.search = (event.target as HTMLInputElement).value;
  renderBrowse(state);
});

byId<HTMLSelectElement>("type-filter").addEventListener("change", (event) => {
  state.typeFilter = (event.target as HTMLSelectElement).value as typeof state.typeFilter;
  renderBrowse(state);
});

byId<HTMLSelectElement>("state-filter").addEventListener("change", (event) => {
  state.stateFilter = (event.target as HTMLSelectElement).value as typeof state.stateFilter;
  renderBrowse(state);
});

byId("view-outline").addEventListener("click", () => {
  state.view = "outline";
  renderView();
});

byId("view-table").addEventListener("click", () => {
  state.view = "table";
  renderView();
});

/** Show the outline or the table in the left-hand pane. */
function renderView(): void {
  const outline = byId("browse-outline-pane");
  const table = byId("browse-table-pane");
  const grid = byId("browse-grid");

  outline.hidden = state.view !== "outline";
  table.hidden = state.view !== "table";

  // The table needs the whole card, so the outline and the detail share the
  // width when the outline is showing.
  grid.classList.toggle("lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]", state.view === "outline");
  grid.classList.toggle("lg:grid-cols-1", state.view === "table");

  for (const [id, active] of [
    ["view-outline", state.view === "outline"],
    ["view-table", state.view === "table"],
  ] as const) {
    const button = byId(id);
    button.setAttribute("aria-pressed", String(active));
    button.classList.toggle("bg-background", active);
    button.classList.toggle("text-foreground", active);
    button.classList.toggle("text-muted-foreground", !active);
  }
}

// A finding in the audit report can send the reviewer to an item.
window.addEventListener("canvas:select-item", (event) => {
  const detail = (event as CustomEvent<{ id: string }>).detail;
  state.selectedId = detail.id;
  stepper.goTo(1);
  renderBrowse(state);
  renderDetail(state);
});

// ---------------------------------------------------------------------------
// Exporting the report
// ---------------------------------------------------------------------------

byId("download-findings").addEventListener("click", () => {
  if (!state.course) return;
  download(toFindingsCsv(state.findings), `${fileBase()}-findings.csv`);
});

byId("download-inventory").addEventListener("click", () => {
  if (!state.course) return;
  download(toInventoryCsv(state.course, state.content), `${fileBase()}-inventory.csv`);
});

byId("download-report").addEventListener("click", () => {
  if (!state.course) return;
  download(
    toMarkdownReport(state.course, state.findings, state.content),
    `${fileBase()}-report.md`,
    "text/markdown;charset=utf-8",
  );
});

byId("copy-report").addEventListener("click", () => {
  if (!state.course) return;
  void copyToClipboard(toMarkdownReport(state.course, state.findings, state.content), "Course report");
});

/** The file name stem for the downloaded reports. */
function fileBase(): string {
  const title = state.course?.meta.title ?? "canvas-course";
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "canvas-course";
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

renderView();
