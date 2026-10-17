/**
 * Client-side controller for the rubric → Canvas CSV converter.
 * All state lives in memory; nothing is persisted or transmitted.
 */
import { toast } from "@starwind-ui/runtime/toast";

import arrowDown from "@tabler/icons/outline/arrow-down.svg?raw";
import arrowUp from "@tabler/icons/outline/arrow-up.svg?raw";
import alertTriangle from "@tabler/icons/outline/alert-triangle.svg?raw";
import plus from "@tabler/icons/outline/plus.svg?raw";
import trash from "@tabler/icons/outline/trash.svg?raw";
import x from "@tabler/icons/outline/x.svg?raw";

import { alert as alertClasses, alertDescription, alertTitle } from "@/components/starwind/alert/variants";
import { badge as badgeClasses } from "@/components/starwind/badge/variants";
import { button as buttonClasses } from "@/components/starwind/button/variants";
import { input as inputClasses } from "@/components/starwind/input/variants";
import { table as tableClasses, tableBody, tableCell, tableHead, tableHeader, tableRow } from "@/components/starwind/table/variants";
import { textarea as textareaClasses } from "@/components/starwind/textarea/variants";

import { formatPoints, toCanvasCsv } from "@/lib/rubric/canvas-csv";
import { PRESET_DESCRIPTIONS, applyPoints, presetPercentages, recomputeAll, totalPoints } from "@/lib/rubric/points";
import { DEFAULT_SETTINGS, type ExtractedTable, type Rubric, type RubricSettings } from "@/lib/rubric/types";
import { extractTablesFromDocx } from "@/lib/parse/docx";
import { extractHtmlTables } from "@/lib/parse/html";
import { parseTextTable } from "@/lib/parse/text";
import { tableToRubric } from "@/lib/parse/table-to-rubric";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface AppState {
  rubric: Rubric;
  settings: RubricSettings;
  /** Global rating-level names, shared by every criterion. */
  ratingNames: string[];
  warnings: string[];
  usedHeader: boolean;
  step: 1 | 2 | 3;
  csv: string;
  fileName: string;
  pendingTables: ExtractedTable[];
  pendingName?: string;
}

const state: AppState = {
  rubric: { name: "Untitled Rubric", criteria: [] },
  settings: { ...DEFAULT_SETTINGS, customPercentages: [] },
  ratingNames: [],
  warnings: [],
  usedHeader: false,
  step: 1,
  csv: "",
  fileName: "rubric.csv",
  pendingTables: [],
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function $<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

/** Inline an SVG icon with a size class. */
function icon(raw: string, cls = "size-4"): string {
  return raw.replace("<svg", `<svg class="${cls}" aria-hidden="true"`);
}

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escAttr(text: string): string {
  return esc(text).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "rubric";
}

function parseNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Step navigation
// ---------------------------------------------------------------------------

function goToStep(step: 1 | 2 | 3): void {
  state.step = step;
  const sections: Record<number, string> = { 1: "step-import", 2: "step-review", 3: "step-export" };
  for (const [n, id] of Object.entries(sections)) {
    $(id).hidden = Number(n) !== step;
  }
  renderStepper();
  if (step === 3) renderCsv();
}

function renderStepper(): void {
  for (let n = 1; n <= 3; n++) {
    const li = $(`step-${n}`);
    const badge = li.querySelector("[data-step-badge]") as HTMLElement;
    const label = li.querySelector("[data-step-label]") as HTMLElement;
    const active = state.step === n;
    const done = state.step > n;
    badge.className =
      "flex size-6 items-center justify-center rounded-full text-xs font-medium " +
      (active
        ? "bg-foreground text-background"
        : done
          ? "bg-success text-success-foreground"
          : "border border-input text-muted-foreground");
    label.className = active ? "font-medium text-foreground" : "text-muted-foreground";
    if (active) li.setAttribute("aria-current", "step");
    else li.removeAttribute("aria-current");
  }
}

// ---------------------------------------------------------------------------
// Import step
// ---------------------------------------------------------------------------

async function handleDocxFile(file: File): Promise<void> {
  if (!/\.docx$/i.test(file.name)) {
    toast.error("Not a Word document", { description: "Please choose a .docx file (older .doc files are not supported)." });
    return;
  }
  const id = toast.loading("Reading document…");
  try {
    const tables = await extractTablesFromDocx(file);
    toast.dismiss(id);
    handleTables(tables, file.name.replace(/\.docx$/i, ""));
  } catch (err) {
    toast.dismiss(id);
    toast.error("Could not read the document", { description: String(err) });
  }
}

function handleTables(tables: ExtractedTable[], defaultName?: string): void {
  if (tables.length === 0) {
    toast.error("No tables found", { description: "The document or paste did not contain any tables." });
    return;
  }
  if (tables.length === 1) {
    buildDraft(tables[0], defaultName);
    return;
  }
  state.pendingTables = tables;
  state.pendingName = defaultName;
  renderPicker(tables);
}

function renderPicker(tables: ExtractedTable[]): void {
  const picker = $("table-picker");
  const items = tables
    .map((table, i) => {
      const firstRow = table.rows[0] ?? [];
      const preview = firstRow
        .slice(0, 4)
        .map((cell) => `<span class="text-muted-foreground rounded-md border px-1.5 py-0.5 text-xs">${esc(cell.slice(0, 24))}</span>`)
        .join(" ");
      return `
        <button type="button" class="${buttonClasses({ variant: "outline" })} h-auto flex-col items-start gap-1.5 py-3 text-left" data-action="pick-table" data-index="${i}">
          <span class="flex items-center gap-2">
            <span class="font-medium">Table ${i + 1}</span>
            <span class="text-muted-foreground text-xs">${table.rows.length} rows × ${table.rows[0]?.length ?? 0} cols</span>
          </span>
          <span class="flex flex-wrap gap-1">${preview}</span>
        </button>`;
    })
    .join("");
  picker.innerHTML = `
    <p class="text-foreground text-sm font-medium">${tables.length} tables found — choose the rubric table</p>
    <div class="grid gap-2">${items}</div>`;
}

function onRichPaste(event: ClipboardEvent): void {
  const html = event.clipboardData?.getData("text/html");
  if (!html) return;
  const tables = extractHtmlTables(html);
  if (tables.length === 0) return; // fall back to plain-text handling
  event.preventDefault();
  handleTables(tables);
}

function parsePastedText(): void {
  const text = ($("paste-input") as HTMLTextAreaElement).value;
  const rows = parseTextTable(text);
  if (rows.length === 0 || rows.every((row) => row.length < 2)) {
    toast.error("No table found", {
      description: "Paste a table first — straight from Word, as markdown, or as tab-separated text.",
    });
    return;
  }
  handleTables([{ rows, source: "pasted" }]);
}

// ---------------------------------------------------------------------------
// Draft building
// ---------------------------------------------------------------------------

function buildDraft(table: ExtractedTable, defaultName?: string): void {
  const draft = tableToRubric(table, { defaultName, settings: state.settings });
  state.rubric = draft.rubric;
  state.warnings = draft.warnings;
  state.usedHeader = draft.usedHeader;
  const first = state.rubric.criteria[0];
  state.ratingNames = first ? first.ratings.map((r) => r.name) : [];

  renderWarnings();
  renderSettings();
  renderGrid();
  updateTotals();

  const nameInput = $("rubric-name") as HTMLInputElement;
  nameInput.value = state.rubric.name;

  $("table-picker").innerHTML = "";
  goToStep(2);
  toast.success(`Parsed ${state.rubric.criteria.length} criteria`, {
    description: "Review the rubric below and fix anything that looks off.",
  });
}

function renderWarnings(): void {
  const container = $("parse-warnings");
  if (state.warnings.length === 0) {
    container.innerHTML = "";
    return;
  }
  const items = state.warnings.map((w) => `<li>${esc(w)}</li>`).join("");
  container.innerHTML = `
    <div class="${alertClasses({ variant: "warning" })}" role="alert">
      <h5 class="${alertTitle()}">${icon(alertTriangle, "size-5")} Parsing notes</h5>
      <p class="${alertDescription()}"><ul class="grid gap-1 pl-4 text-sm list-disc">${items}</ul></p>
    </div>`;
}

// ---------------------------------------------------------------------------
// Review step: settings
// ---------------------------------------------------------------------------

function renderSettings(): void {
  const container = $("levels-settings");
  const showPct = state.settings.preset === "custom";
  const levels = state.ratingNames.length;

  if (levels === 0) {
    container.innerHTML =
      '<p class="text-muted-foreground text-sm">No rating levels yet — import a table or add levels manually.</p>';
  } else {
    container.innerHTML = state.ratingNames
      .map((name, i) => {
        const pct = showPct
          ? `<div class="flex items-center gap-1.5">
               <input type="number" min="0" max="100" step="any" inputmode="decimal"
                 class="${inputClasses({ size: "sm" })} w-20" data-field="rating-pct"
                 value="${state.settings.customPercentages[i] ?? 0}"
                 aria-label="Rating level ${i + 1} percentage of max points" />
               <span class="text-muted-foreground text-xs">% of max</span>
             </div>`
          : "";
        return `
        <div class="grid gap-1.5" data-level="${i}">
          <div class="flex items-center justify-between gap-2">
            <span class="${badgeClasses({ variant: "secondary", size: "sm" })}">Level ${i + 1}</span>
            <button type="button" class="${buttonClasses({ variant: "ghost", size: "icon-sm" })}" data-action="remove-level"
              aria-label="Remove rating level ${i + 1}">${icon(x, "size-4")}</button>
          </div>
          <input class="${inputClasses({ size: "sm" })}" data-field="rating-name" value="${escAttr(name)}"
            aria-label="Rating level ${i + 1} name" />
          ${pct}
        </div>`;
      })
      .join("");
  }

  ($("preset-select") as HTMLSelectElement).value = state.settings.preset;
  const roundingSelect = $("rounding-select") as HTMLSelectElement;
  roundingSelect.value = state.settings.rounding;
  roundingSelect.disabled = state.settings.preset === "manual";
  $("preset-hint").textContent = PRESET_DESCRIPTIONS[state.settings.preset];
}

function onPresetChange(value: string): void {
  const preset = value as RubricSettings["preset"];
  state.settings.preset = preset;
  if (preset === "custom" && state.settings.customPercentages.length !== state.ratingNames.length) {
    state.settings.customPercentages = presetPercentages("even", state.ratingNames.length, []);
  }
  recomputeAll(state.rubric, state.settings);
  renderSettings();
  renderGrid();
  updateTotals();
}

function addLevel(): void {
  const name = `Rating ${state.ratingNames.length + 1}`;
  state.ratingNames.push(name);
  for (const criterion of state.rubric.criteria) {
    criterion.ratings.push({ name, description: "", points: 0, manual: false });
    applyPoints(criterion, state.settings);
  }
  renderSettings();
  renderGrid();
}

function removeLevel(index: number): void {
  if (state.ratingNames.length <= 1) {
    toast.warning("A rubric needs at least one rating level.");
    return;
  }
  state.ratingNames.splice(index, 1);
  for (const criterion of state.rubric.criteria) criterion.ratings.splice(index, 1);
  if (state.settings.preset === "custom") state.settings.customPercentages.splice(index, 1);
  renderSettings();
  renderGrid();
  updateTotals();
}

function resetPoints(): void {
  recomputeAll(state.rubric, state.settings, true);
  renderGrid();
  updateTotals();
  toast.success("Points reset to the selected preset.");
}

// ---------------------------------------------------------------------------
// Review step: criteria grid
// ---------------------------------------------------------------------------

function renderGrid(): void {
  const container = $("criteria-grid");

  if (state.rubric.criteria.length === 0) {
    container.innerHTML =
      '<p class="text-muted-foreground text-sm">No criteria yet — add one below, or go back and import a table.</p>';
    return;
  }

  const head = `
    <thead class="${tableHeader()}">
      <tr class="${tableRow()}">
        <th class="${tableHead()} w-52">Criterion</th>
        <th class="${tableHead()}">Max pts</th>
        ${state.ratingNames
          .map(
            (name, i) =>
              `<th class="${tableHead()} min-w-56" data-rating-col="${i}">${esc(name || `Rating ${i + 1}`)}</th>`,
          )
          .join("")}
        <th class="${tableHead()} text-right">Row</th>
      </tr>
    </thead>`;

  const body = state.rubric.criteria
    .map(
      (criterion, i) => `
      <tr class="${tableRow()}" data-criterion="${i}">
        <td class="${tableCell()} align-top">
          <div class="grid w-52 gap-1">
            <input class="${inputClasses({ size: "sm" })}" data-field="criterion-name"
              value="${escAttr(criterion.name)}" aria-label="Criterion ${i + 1} name" />
            <textarea class="${textareaClasses({ size: "sm" })}" rows="2" data-field="criterion-description"
              placeholder="Description (optional)" aria-label="Criterion ${i + 1} description">${esc(criterion.description)}</textarea>
          </div>
        </td>
        <td class="${tableCell()} align-top">
          <input type="number" min="0" step="any" inputmode="decimal" class="${inputClasses({ size: "sm" })} w-20"
            data-field="criterion-max" value="${formatPoints(criterion.maxPoints)}"
            aria-label="Criterion ${i + 1} max points" />
        </td>
        ${criterion.ratings
          .map((rating, j) => {
            const manual = rating.manual ? 'data-manual="true" title="Manually set"' : 'title="Auto-computed"';
            return `
          <td class="${tableCell()} align-top">
            <div class="grid w-56 gap-1">
              <textarea class="${textareaClasses({ size: "sm" })}" rows="3" data-field="rating-description" data-rating="${j}"
                placeholder="Description" aria-label="Rating ${j + 1} description for criterion ${i + 1}">${esc(rating.description)}</textarea>
              <input type="number" step="any" inputmode="decimal"
                class="${inputClasses({ size: "sm" })} data-manual:border-primary data-manual:text-primary data-manual:font-medium w-20"
                data-field="rating-points" data-rating="${j}" value="${formatPoints(rating.points)}" ${manual}
                aria-label="Rating ${j + 1} points for criterion ${i + 1}" />
            </div>
          </td>`;
          })
          .join("")}
        <td class="${tableCell()} align-top text-right">
          <div class="inline-flex gap-1">
            <button type="button" class="${buttonClasses({ variant: "ghost", size: "icon-sm" })}" data-action="criterion-up"
              aria-label="Move criterion ${i + 1} up" ${i === 0 ? "disabled" : ""}>${icon(arrowUp)}</button>
            <button type="button" class="${buttonClasses({ variant: "ghost", size: "icon-sm" })}" data-action="criterion-down"
              aria-label="Move criterion ${i + 1} down" ${i === state.rubric.criteria.length - 1 ? "disabled" : ""}>${icon(arrowDown)}</button>
            <button type="button" class="${buttonClasses({ variant: "ghost", size: "icon-sm" })} hover:text-error" data-action="criterion-delete"
              aria-label="Delete criterion ${i + 1}">${icon(trash)}</button>
          </div>
        </td>
      </tr>`
    )
    .join("");

  container.innerHTML = `
    <div class="relative w-full overflow-x-auto">
      <table class="${tableClasses()}">${head}<tbody class="${tableBody()}">${body}</tbody></table>
    </div>`;
}

/** Update a row's auto-computed points inputs without re-rendering (keeps focus). */
function updateRowPoints(tr: HTMLElement, criterion: Rubric["criteria"][number]): void {
  tr.querySelectorAll<HTMLInputElement>('input[data-field="rating-points"]').forEach((input) => {
    const j = Number(input.dataset.rating);
    const rating = criterion.ratings[j];
    if (rating && !rating.manual) {
      input.value = formatPoints(rating.points);
      input.removeAttribute("data-manual");
      input.title = "Auto-computed";
    }
  });
}

function addCriterion(): void {
  const name = `Criterion ${state.rubric.criteria.length + 1}`;
  const criterion = {
    name,
    description: "",
    maxPoints: 1,
    ratings: state.ratingNames.map((ratingName) => ({ name: ratingName, description: "", points: 0, manual: false })),
  };
  applyPoints(criterion, state.settings);
  state.rubric.criteria.push(criterion);
  renderGrid();
  updateTotals();
}

function onGridInput(event: Event): void {
  const target = event.target as HTMLInputElement | HTMLTextAreaElement;
  const field = target.dataset.field;
  if (!field) return;
  const tr = target.closest<HTMLElement>("tr[data-criterion]");
  if (!tr) return;
  const i = Number(tr.dataset.criterion);
  const criterion = state.rubric.criteria[i];
  if (!criterion) return;

  switch (field) {
    case "criterion-name":
      criterion.name = target.value;
      break;
    case "criterion-description":
      criterion.description = target.value;
      break;
    case "criterion-max": {
      const v = parseNumber(target.value);
      if (v === null) return; // keep last valid value while typing
      criterion.maxPoints = Math.max(0, v);
      applyPoints(criterion, state.settings);
      updateRowPoints(tr, criterion);
      updateTotals();
      break;
    }
    case "rating-description": {
      const rating = criterion.ratings[Number(target.dataset.rating)];
      if (rating) rating.description = target.value;
      break;
    }
    case "rating-points": {
      const rating = criterion.ratings[Number(target.dataset.rating)];
      if (!rating) return;
      rating.manual = true;
      target.setAttribute("data-manual", "true");
      target.title = "Manually set";
      const v = parseNumber(target.value);
      if (v !== null) rating.points = v;
      break;
    }
  }
}

function onGridChange(event: Event): void {
  const target = event.target as HTMLInputElement;
  const field = target.dataset.field;
  if (field !== "criterion-max" && field !== "rating-points") return;
  const tr = target.closest<HTMLElement>("tr[data-criterion]");
  if (!tr) return;
  const criterion = state.rubric.criteria[Number(tr.dataset.criterion)];
  if (!criterion) return;

  if (field === "criterion-max") {
    if (target.value.trim() === "") target.value = "0";
    target.value = formatPoints(criterion.maxPoints);
  } else {
    const rating = criterion.ratings[Number(target.dataset.rating)];
    if (!rating) return;
    if (target.value.trim() === "") rating.points = 0;
    target.value = formatPoints(rating.points);
  }
}

function onGridClick(event: Event): void {
  const btn = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]");
  if (!btn) return;
  const tr = btn.closest<HTMLElement>("tr[data-criterion]");
  if (!tr) return;
  const i = Number(tr.dataset.criterion);

  switch (btn.dataset.action) {
    case "criterion-up":
      if (i > 0) {
        [state.rubric.criteria[i - 1], state.rubric.criteria[i]] = [state.rubric.criteria[i], state.rubric.criteria[i - 1]];
        renderGrid();
      }
      break;
    case "criterion-down":
      if (i < state.rubric.criteria.length - 1) {
        [state.rubric.criteria[i + 1], state.rubric.criteria[i]] = [state.rubric.criteria[i], state.rubric.criteria[i + 1]];
        renderGrid();
      }
      break;
    case "criterion-delete":
      state.rubric.criteria.splice(i, 1);
      renderGrid();
      updateTotals();
      break;
  }
}

function onLevelsInput(event: Event): void {
  const target = event.target as HTMLInputElement;
  const field = target.dataset.field;
  if (!field) return;
  const wrapper = target.closest<HTMLElement>("[data-level]");
  if (!wrapper) return;
  const i = Number(wrapper.dataset.level);

  if (field === "rating-name") {
    state.ratingNames[i] = target.value;
    for (const criterion of state.rubric.criteria) {
      if (criterion.ratings[i]) criterion.ratings[i].name = target.value;
    }
    renderGrid(); // refresh column headers
  } else if (field === "rating-pct") {
    const v = parseNumber(target.value);
    if (v === null) return;
    state.settings.customPercentages[i] = Math.min(100, Math.max(0, v));
    recomputeAll(state.rubric, state.settings);
    renderGrid();
    updateTotals();
  }
}

function updateTotals(): void {
  $("total-badge").textContent = formatPoints(totalPoints(state.rubric));
  $("count-badge").textContent = String(state.rubric.criteria.length);
}

// ---------------------------------------------------------------------------
// Export step
// ---------------------------------------------------------------------------

function toExport(): void {
  if (state.rubric.criteria.length === 0) {
    toast.warning("Nothing to export", { description: "Add at least one criterion first." });
    return;
  }
  if (state.ratingNames.length === 0) {
    toast.warning("No rating levels", { description: "Add at least one rating level first." });
    return;
  }
  goToStep(3);
}

function renderCsv(): void {
  state.csv = toCanvasCsv(state.rubric);
  state.fileName = `${slugify(state.rubric.name)}.csv`;
  $("csv-filename").textContent = state.fileName;
  $("csv-preview").textContent = state.csv;
}

function downloadCsv(): void {
  const blob = new Blob([state.csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = state.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast.success(`Downloaded ${state.fileName}`, { description: "Import it in Canvas: Rubrics → +Rubric → import." });
}

async function copyCsv(): Promise<void> {
  try {
    await navigator.clipboard.writeText(state.csv);
    toast.success("CSV copied to clipboard");
  } catch {
    toast.error("Copy failed", { description: "Your browser blocked clipboard access — use Download instead." });
  }
}

// ---------------------------------------------------------------------------
// Event wiring
// ---------------------------------------------------------------------------

export function initApp(): void {
  // Import: file upload + drag & drop
  const dropzone = $("dropzone");
  const fileInput = $("file-input") as HTMLInputElement;
  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInput.click();
    }
  });
  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("border-primary", "bg-muted/50");
  });
  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("border-primary", "bg-muted/50");
  });
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("border-primary", "bg-muted/50");
    const file = e.dataTransfer?.files?.[0];
    if (file) void handleDocxFile(file);
  });
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file) void handleDocxFile(file);
    fileInput.value = ""; // allow re-choosing the same file
  });

  // Import: paste
  $("paste-input").addEventListener("paste", onRichPaste);
  $("parse-paste").addEventListener("click", parsePastedText);

  // Import: table picker (delegated)
  $("table-picker").addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-action="pick-table"]');
    if (!btn) return;
    const table = state.pendingTables[Number(btn.dataset.index)];
    if (table) buildDraft(table, state.pendingName);
  });

  // Review: rubric name
  $("rubric-name").addEventListener("input", (e) => {
    state.rubric.name = (e.target as HTMLInputElement).value || "Untitled Rubric";
  });

  // Review: preset + rounding
  $("preset-select").addEventListener("change", (e) => onPresetChange((e.target as HTMLSelectElement).value));
  $("rounding-select").addEventListener("change", (e) => {
    state.settings.rounding = (e.target as HTMLSelectElement).value as RubricSettings["rounding"];
    recomputeAll(state.rubric, state.settings);
    renderGrid();
    updateTotals();
  });

  // Review: rating levels (delegated)
  $("levels-settings").addEventListener("input", onLevelsInput);
  $("levels-settings").addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-action="remove-level"]');
    if (!btn) return;
    const wrapper = btn.closest<HTMLElement>("[data-level]");
    if (wrapper) removeLevel(Number(wrapper.dataset.level));
  });
  $("add-level").addEventListener("click", addLevel);
  $("reset-points").addEventListener("click", resetPoints);

  // Review: criteria grid (delegated)
  const grid = $("criteria-grid");
  grid.addEventListener("input", onGridInput);
  grid.addEventListener("change", onGridChange);
  grid.addEventListener("click", onGridClick);
  $("add-criterion").addEventListener("click", addCriterion);

  // Navigation
  $("back-to-import").addEventListener("click", () => goToStep(1));
  $("to-export").addEventListener("click", toExport);
  $("back-to-review").addEventListener("click", () => goToStep(2));

  // Export
  $("download-csv").addEventListener("click", downloadCsv);
  $("copy-csv").addEventListener("click", () => void copyCsv());
}

initApp();
