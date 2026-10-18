/**
 * Client-side controller for the Outcome Mapper.
 * All state lives in memory; nothing is persisted or transmitted.
 */
import { toast } from "@starwind-ui/runtime/toast";

import { badge as badgeClasses } from "@/components/starwind/badge/variants";
import { alert as alertClasses, alertDescription, alertTitle } from "@/components/starwind/alert/variants";
import check from "@tabler/icons/outline/check.svg?raw";

import { parseOutcomes } from "@/lib/tools/outcome-mapper/parse";
import { exportAlignments, exportOutcomes, groupByLevel, parentLevel } from "@/lib/tools/outcome-mapper/export";
import type { Mapping, Outcome } from "@/lib/tools/outcome-mapper/types";
import { OUTCOME_LEVELS } from "@/lib/tools/outcome-mapper/types";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface AppState {
  outcomes: Outcome[];
  mappings: Mapping[];
  step: 1 | 2 | 3;
}

const state: AppState = {
  outcomes: [],
  mappings: [],
  step: 1,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function $<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Inline an SVG icon with a size class. */
function icon(raw: string, cls = "size-4"): string {
  return raw.replace("<svg", `<svg class="${cls}" aria-hidden="true"`);
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function canReachStep(step: number): boolean {
  if (step <= 1) return true;
  if (step === 2) return state.outcomes.length > 0;
  return state.outcomes.length > 0;
}

function setStep(step: 1 | 2 | 3): void {
  if (!canReachStep(step)) return;
  state.step = step;
  const sections = ["step-import", "step-map", "step-export"];
  sections.forEach((id, idx) => {
    $(`#${id}`).hidden = step !== idx + 1;
  });

  for (let i = 1; i <= 3; i++) {
    const li = document.querySelector<HTMLElement>(`#step-${i}`);
    const btn = li?.querySelector<HTMLButtonElement>("[data-step-action]");
    const badge = document.querySelector<HTMLElement>(`#step-${i} [data-step-badge]`);
    const label = document.querySelector<HTMLElement>(`#step-${i} [data-step-label]`);
    if (!badge || !label || !btn || !li) continue;

    const done = i < step;
    const active = i === step;
    const reachable = canReachStep(i);

    badge.className =
      "flex size-6 items-center justify-center rounded-full text-xs font-medium " +
      (active
        ? "bg-primary text-primary-foreground ring-2 ring-primary/30"
        : done
          ? "bg-primary text-primary-foreground"
          : "border border-input text-muted-foreground");
    badge.innerHTML = done ? icon(check, "size-4") : String(i);

    label.className = active || done ? "font-medium text-foreground" : "text-muted-foreground";
    btn.disabled = !reachable;

    if (active) li.setAttribute("aria-current", "step");
    else li.removeAttribute("aria-current");
  }
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

const SAMPLE_OUTCOMES = `level,id,text,mapsTo
program,po1,Students communicate effectively and appropriately for varied audiences and purposes,
program,po2,Students use evidence to support reasoned conclusions and recommendations,
course,co1,Produce written work organized around a clear central claim,po1
course,co2,Support claims with credible and relevant evidence,po2
course,co3,Adapt tone and style for the intended audience,po1
assessment,ao1,Thesis or main claim is clear and arguable,co1
assessment,ao2,Body paragraphs include evidence that supports the claim,co2
assessment,ao3,Writing uses discipline-appropriate vocabulary and tone,co3`;

function loadSampleOutcomes(): void {
  const input = $("#outcome-input" as "textarea");
  input.value = SAMPLE_OUTCOMES;
  handleParse();
  toast.success("Sample outcomes loaded", { description: "Adjust the mappings or replace them with your own." });
}

function handleParse(): void {
  const input = $("#outcome-input" as "textarea").value;
  const { outcomes, mappings, warnings } = parseOutcomes(input);

  state.outcomes = outcomes;
  state.mappings = mappings;

  renderWarnings(warnings);

  if (outcomes.length === 0) {
    toast.error("No outcomes could be loaded. Check the input format.");
    return;
  }

  renderMapEditor();
  setStep(2);
}

function renderWarnings(warnings: string[]): void {
  const container = $("#import-warnings");
  container.innerHTML = "";
  if (warnings.length === 0) return;

  const alert = document.createElement("div");
  alert.className = `${alertClasses({ variant: "warning" })}`;
  alert.innerHTML = `
    <div class="grid gap-1">
      <div class="${alertTitle()}">Import notes</div>
      <div class="${alertDescription()}">
        <ul class="list-disc space-y-1 pl-5">
          ${warnings.map((w) => `<li>${esc(w)}</li>`).join("")}
        </ul>
      </div>
    </div>
  `;
  container.appendChild(alert);
}

// ---------------------------------------------------------------------------
// Map editor
// ---------------------------------------------------------------------------

function renderMapEditor(): void {
  const grouped = groupByLevel(state.outcomes);
  const summary = $("#outcome-summary");
  summary.innerHTML = OUTCOME_LEVELS.map(
    (level) => `<span class="${badgeClasses({ variant: "secondary" })}">${level}: ${grouped[level].length}</span>`
  ).join("");

  const editor = $("#outcome-editor");
  editor.innerHTML = "";

  for (const level of OUTCOME_LEVELS) {
    const outcomes = grouped[level];
    if (outcomes.length === 0) continue;

    const parentLvl = parentLevel(level);
    const parents = parentLvl ? grouped[parentLvl] : [];

    const section = document.createElement("div");
    section.className = "grid gap-3";

    const heading = document.createElement("h3");
    heading.className = "text-foreground text-sm font-medium capitalize";
    heading.textContent = `${level} outcomes`;
    section.appendChild(heading);

    const list = document.createElement("div");
    list.className = "grid gap-3";

    for (const outcome of outcomes) {
      const row = document.createElement("div");
      row.className = "rounded-lg border p-4";

      const header = document.createElement("div");
      header.className = "mb-2 flex flex-wrap items-baseline gap-2";
      header.innerHTML = `
        <code class="rounded bg-muted px-1.5 py-0.5 text-xs">${esc(outcome.id)}</code>
        <span class="text-sm">${esc(outcome.text)}</span>
      `;
      row.appendChild(header);

      if (parents.length > 0) {
        const checkboxes = document.createElement("div");
        checkboxes.className = "flex flex-wrap gap-3";
        for (const parent of parents) {
          const checked = state.mappings.some(
            (m) => m.childId === outcome.id && m.parentId === parent.id
          );
          const id = `map-${slugify(outcome.id)}-${slugify(parent.id)}`;
          const label = document.createElement("label");
          label.className = "inline-flex items-center gap-2 text-sm";
          label.innerHTML = `
            <input type="checkbox" id="${id}" data-child="${escAttr(outcome.id)}" data-parent="${escAttr(parent.id)}" ${checked ? "checked" : ""} />
            <code class="rounded bg-muted px-1 py-0.5 text-xs">${esc(parent.id)}</code>
            <span class="text-muted-foreground">${esc(parent.text)}</span>
          `;
          checkboxes.appendChild(label);
        }
        row.appendChild(checkboxes);
      } else {
        const note = document.createElement("p");
        note.className = "text-muted-foreground text-xs";
        note.textContent = "No higher-level outcomes to map to.";
        row.appendChild(note);
      }

      list.appendChild(row);
    }

    section.appendChild(list);
    editor.appendChild(section);
  }

  editor.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((checkbox) => {
    checkbox.addEventListener("change", handleMappingChange);
  });
}

function escAttr(text: string): string {
  return esc(text).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function handleMappingChange(event: Event): void {
  const checkbox = event.target as HTMLInputElement;
  const childId = checkbox.dataset.child!;
  const parentId = checkbox.dataset.parent!;

  const index = state.mappings.findIndex((m) => m.childId === childId && m.parentId === parentId);
  if (checkbox.checked && index === -1) {
    state.mappings.push({ childId, parentId });
  } else if (!checkbox.checked && index !== -1) {
    state.mappings.splice(index, 1);
  }
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

function renderExport(): void {
  const alignments = exportAlignments(state.outcomes, state.mappings);
  $("#export-preview").textContent = alignments;
  $("#alignment-count").textContent = String(state.mappings.length);
}

function download(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function copyToClipboard(text: string): void {
  navigator.clipboard
    .writeText(text)
    .then(() => toast.success("Copied to clipboard"))
    .catch(() => toast.error("Could not copy"));
}

// ---------------------------------------------------------------------------
// Event bindings
// ---------------------------------------------------------------------------

$("#parse-outcomes").addEventListener("click", handleParse);
$("#load-sample-outcomes").addEventListener("click", loadSampleOutcomes);
$("#back-to-import").addEventListener("click", () => setStep(1));
$("#to-export").addEventListener("click", () => {
  renderExport();
  setStep(3);
});
$("#back-to-map").addEventListener("click", () => setStep(2));
$("#copy-export").addEventListener("click", () => copyToClipboard(exportAlignments(state.outcomes, state.mappings)));
$("#download-alignments").addEventListener("click", () =>
  download(exportAlignments(state.outcomes, state.mappings), "outcome-alignments.csv")
);
$("#download-outcomes").addEventListener("click", () =>
  download(exportOutcomes(state.outcomes, state.mappings), "outcomes.csv")
);

document.querySelectorAll<HTMLButtonElement>("[data-step-action]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const step = Number(btn.dataset.stepAction) as 1 | 2 | 3;
    setStep(step);
  });
});

setStep(1);
