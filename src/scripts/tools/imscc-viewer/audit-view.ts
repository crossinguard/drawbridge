/**
 * The audit step: the QA findings for the opened course.
 *
 * Every finding lists the items it is about, so a reviewer can jump straight
 * from the report to the content that raised it.
 */
import { badge as badgeClasses } from "@/components/starwind/badge/variants";

import { byId, esc, escAttr } from "@/scripts/lib/dom";

import { FINDING_CATEGORIES, sortFindings, type Finding, type FindingSeverity } from "@/lib/tools/imscc-viewer/audit";
import type { AppState } from "./state";

/** The badge variant for each severity. */
const SEVERITY_VARIANT: Record<FindingSeverity, "error" | "warning" | "info"> = {
  error: "error",
  warning: "warning",
  info: "info",
};

/** The label for each severity. */
const SEVERITY_LABEL: Record<FindingSeverity, string> = {
  error: "Needs attention",
  warning: "Check this",
  info: "For information",
};

/** Draw the audit report. */
export function renderAudit(state: AppState): void {
  const course = state.course;
  const container = byId("audit-findings");
  const empty = byId("audit-empty");
  container.innerHTML = "";

  if (!course) {
    empty.hidden = false;
    empty.textContent = "Open a course export first.";
    return;
  }

  renderStats(state);

  if (state.findings.length === 0) {
    empty.hidden = false;
    empty.textContent = "Nothing to report — every check passed.";
    return;
  }

  empty.hidden = true;

  // The most serious findings come first within each category.
  const sorted = sortFindings(state.findings);

  for (const category of FINDING_CATEGORIES) {
    const findings = sorted.filter((finding) => finding.category === category.id);
    if (findings.length === 0) continue;

    const section = document.createElement("section");
    section.className = "grid gap-3";

    const heading = document.createElement("h3");
    heading.className = "flex items-center gap-2 text-sm font-medium";
    heading.innerHTML = `
      <span>${esc(category.label)}</span>
      <span class="${badgeClasses({ variant: "secondary", size: "sm" })}">${findings.length}</span>
    `;
    section.appendChild(heading);

    for (const finding of findings) {
      section.appendChild(renderFinding(state, finding));
    }

    container.appendChild(section);
  }
}

/** Draw one finding. */
function renderFinding(state: AppState, finding: Finding): HTMLElement {
  const card = document.createElement("article");
  card.className = "grid gap-2 rounded-lg border border-border p-4";

  const title = document.createElement("div");
  title.className = "flex flex-wrap items-center gap-2";
  title.innerHTML = `
    <span class="${badgeClasses({ variant: SEVERITY_VARIANT[finding.severity], size: "sm" })}">${esc(SEVERITY_LABEL[finding.severity])}</span>
    <span class="text-sm font-medium">${esc(finding.title)}</span>
  `;
  card.appendChild(title);

  const detail = document.createElement("p");
  detail.className = "text-sm text-muted-foreground";
  detail.textContent = finding.detail;
  card.appendChild(detail);

  if (finding.notes.length > 0) {
    const notes = document.createElement("ul");
    notes.className = "grid gap-1 text-xs text-muted-foreground";
    notes.innerHTML = finding.notes.map((note) => `<li class="break-words">${esc(note)}</li>`).join("");
    card.appendChild(notes);
  }

  const titles = finding.itemIds
    .map(
      (id) =>
        state.course?.items.find((item) => item.id === id)?.title ??
        state.course?.orphans.find((item) => item.id === id)?.title,
    )
    .filter((title): title is string => Boolean(title));

  if (titles.length > 0) {
    const items = document.createElement("div");
    items.className = "grid gap-1";
    items.innerHTML = `
      <span class="text-xs font-medium text-muted-foreground">Affected items (${titles.length})</span>
      <div class="flex flex-wrap gap-1.5">
        ${titles
          .map(
            (title, index) => `
              <button type="button" class="${badgeClasses({ variant: "outline", size: "sm" })} max-w-full truncate hover:bg-muted" data-canvas-finding-item="${escAttr(finding.itemIds[index] ?? "")}">
                ${esc(title)}
              </button>
            `,
          )
          .join("")}
      </div>
    `;
    items.querySelectorAll<HTMLButtonElement>("[data-canvas-finding-item]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.canvasFindingItem;
        if (!id) return;
        window.dispatchEvent(new CustomEvent("canvas:select-item", { detail: { id } }));
      });
    });
    card.appendChild(items);
  }

  return card;
}

/** Draw the counts along the top of the report. */
function renderStats(state: AppState): void {
  const course = state.course;
  if (!course) return;

  const items = course.items;
  const counts: [string, number][] = [
    ["Modules", course.modules.length],
    ["Items", items.length],
    ["Published", items.filter((item) => item.state === "active").length],
    ["Unpublished", items.filter((item) => item.state === "unpublished").length],
    ["Outside modules", course.orphans.length],
    ["Files", course.files.length],
    ["Findings", state.findings.length],
  ];

  const container = byId("audit-stats");
  container.innerHTML = counts
    .map(
      ([label, value]) => `
        <span class="flex items-center gap-1.5">
          <span>${esc(label)}</span>
          <span class="${badgeClasses({ variant: "secondary", size: "sm" })}">${value}</span>
        </span>
      `,
    )
    .join("");
}
