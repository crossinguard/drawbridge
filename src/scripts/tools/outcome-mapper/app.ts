/**
 * Client-side controller for the Outcome Mapper.
 * All state lives in memory; nothing is persisted or transmitted.
 */
import { toast } from "@starwind-ui/runtime/toast";

import { badge as badgeClasses } from "@/components/starwind/badge/variants";

import { renderAlertList } from "@/scripts/lib/alerts";
import { byId, esc, escAttr, slugify } from "@/scripts/lib/dom";
import { copyToClipboard, download } from "@/scripts/lib/io";
import { createStepper } from "@/scripts/lib/stepper";

import { parseOutcomes } from "@/lib/tools/outcome-mapper/parse";
import { exportAlignments, exportOutcomes, groupByLevel, parentLevel } from "@/lib/tools/outcome-mapper/export";
import type { Mapping, Outcome } from "@/lib/tools/outcome-mapper/types";
import { OUTCOME_LEVELS } from "@/lib/tools/outcome-mapper/types";
import { steps } from "@/lib/tools/outcome-mapper/steps";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface AppState {
  outcomes: Outcome[];
  mappings: Mapping[];
}

const state: AppState = {
  outcomes: [],
  mappings: [],
};

// ---------------------------------------------------------------------------
// Step navigation
// ---------------------------------------------------------------------------

/**
 * The stepper drives the import → map → export flow.
 *
 * Only the first step is reachable until outcomes have been loaded.
 */
const stepper = createStepper({
  canReach: (index) => index === 0 || state.outcomes.length > 0,
  onEnter: (index) => {
    if (index === steps.length - 1) renderExport();
  },
});

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
  const input = byId<HTMLTextAreaElement>("outcome-input");
  input.value = SAMPLE_OUTCOMES;
  handleParse();
  toast.success("Sample outcomes loaded", { description: "Adjust the mappings or replace them with your own." });
}

function handleParse(): void {
  const input = byId<HTMLTextAreaElement>("outcome-input").value;
  const { outcomes, mappings, warnings } = parseOutcomes(input);

  state.outcomes = outcomes;
  state.mappings = mappings;

  renderWarnings(warnings);

  if (outcomes.length === 0) {
    toast.error("No outcomes could be loaded. Check the input format.");
    return;
  }

  renderMapEditor();
  stepper.goTo(1);
}

function renderWarnings(warnings: string[]): void {
  renderAlertList(byId("import-warnings"), {
    variant: "warning",
    title: "Import notes",
    items: warnings,
  });
}

// ---------------------------------------------------------------------------
// Map editor
// ---------------------------------------------------------------------------

function renderMapEditor(): void {
  const grouped = groupByLevel(state.outcomes);
  const summary = byId("outcome-summary");
  summary.innerHTML = OUTCOME_LEVELS.map(
    (level) => `<span class="${badgeClasses({ variant: "secondary" })}">${level}: ${grouped[level].length}</span>`,
  ).join("");

  const editor = byId("outcome-editor");
  editor.innerHTML = "";

  for (const level of OUTCOME_LEVELS) {
    const outcomes = grouped[level];
    if (outcomes.length === 0) continue;

    const parentLvl = parentLevel(level);
    const parents = parentLvl ? grouped[parentLvl] : [];

    const section = document.createElement("div");
    section.className = "grid gap-3";

    const heading = document.createElement("h3");
    heading.className = "text-sm font-medium text-foreground capitalize";
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
          const checked = state.mappings.some((m) => m.childId === outcome.id && m.parentId === parent.id);
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
        note.className = "text-xs text-muted-foreground";
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
  byId("export-preview").textContent = alignments;
  byId("alignment-count").textContent = String(state.mappings.length);
}

// ---------------------------------------------------------------------------
// Event bindings
// ---------------------------------------------------------------------------

byId("parse-outcomes").addEventListener("click", handleParse);
byId("load-sample-outcomes").addEventListener("click", loadSampleOutcomes);
byId("copy-export").addEventListener(
  "click",
  () => void copyToClipboard(exportAlignments(state.outcomes, state.mappings), "Alignment table"),
);
byId("download-alignments").addEventListener("click", () =>
  download(exportAlignments(state.outcomes, state.mappings), "outcome-alignments.csv"),
);
byId("download-outcomes").addEventListener("click", () =>
  download(exportOutcomes(state.outcomes, state.mappings), "outcomes.csv"),
);
