import { badge as badgeClasses } from "@/components/starwind/badge/variants";
import type { CanvasCourseSource } from "@/lib/workspace/types";
import { KIND_LABELS } from "@/lib/canvas/types";
import type { RubricCriterion } from "@/lib/canvas/types";
import {
  buildRubricIndex,
  compareRubrics,
  filterRubricEntries,
  type CriterionComparisonStatus,
  type RubricFilterKind,
  type RubricIndex,
} from "@/lib/canvas/selectors/rubrics";
import { bindCanvasSource } from "@/scripts/canvas/source-controller";
import { esc, escAttr, within } from "@/scripts/lib/dom";
import { mountToolController } from "@/scripts/lib/lifecycle";

const pointText = (points?: number) =>
  points === undefined ? "Points not recorded" : `${points} ${points === 1 ? "point" : "points"}`;

const STATUS_META = {
  same: { label: "Same", variant: "secondary" },
  different: { label: "Different", variant: "info" },
  "left-only": { label: "Only in left", variant: "outline" },
  "right-only": { label: "Only in right", variant: "outline" },
} as const satisfies Record<CriterionComparisonStatus, { label: string; variant: "secondary" | "info" | "outline" }>;

function ratingsMarkup(criterion: RubricCriterion): string {
  if (criterion.ratings.length === 0)
    return '<p class="text-sm text-muted-foreground">No rating levels in this export.</p>';

  return criterion.ratings
    .map(
      (rating) => `
        <li class="rubric-rating">
          <div class="flex flex-wrap items-start justify-between gap-2">
            <strong>${esc(rating.description || "Untitled rating")}</strong>
            <span class="text-muted-foreground">${esc(pointText(rating.points))}</span>
          </div>
          ${rating.longDescription ? `<p class="text-muted-foreground">${esc(rating.longDescription)}</p>` : ""}
        </li>`,
    )
    .join("");
}

function criterionMarkup(criterion: RubricCriterion, index: number, compact = false): string {
  const ratings = ratingsMarkup(criterion);
  return `
    <section class="rubric-criterion">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="grid gap-1">
          <p class="text-xs font-medium text-muted-foreground">Criterion ${index + 1}</p>
          <h4 class="font-semibold wrap-break-word">${esc(criterion.description || "Untitled criterion")}</h4>
        </div>
        <span class="text-sm text-muted-foreground">${esc(pointText(criterion.points))}</span>
      </div>
      ${criterion.longDescription ? `<p class="text-sm leading-relaxed text-muted-foreground">${esc(criterion.longDescription)}</p>` : ""}
      ${criterion.useRange ? `<div><span class="${badgeClasses({ variant: "outline", size: "sm" })}">Rating ranges used</span></div>` : ""}
      ${
        compact
          ? `<details class="text-sm">
              <summary class="cursor-pointer font-medium">Show ${criterion.ratings.length} rating ${criterion.ratings.length === 1 ? "level" : "levels"}</summary>
              <ol class="rubric-ratings mt-3">${ratings}</ol>
            </details>`
          : `<div class="grid gap-2">
              <h5 class="text-sm font-semibold">Rating levels</h5>
              <ol class="rubric-ratings">${ratings}</ol>
            </div>`
      }
    </section>`;
}

mountToolController("rubric-explorer", (root) => {
  const content = within<HTMLElement>(root, "[data-rubric-content]");
  const noRubrics = within<HTMLElement>(root, "[data-no-rubrics]");
  const library = within<HTMLElement>(root, "[data-rubric-library]");
  const context = within<HTMLElement>(root, "[data-rubric-context]");
  const summary = within<HTMLElement>(root, "[data-rubric-summary]");
  const groupsSection = within<HTMLElement>(root, "[data-rubric-groups-section]");
  const copyGroups = within<HTMLElement>(root, "[data-copy-groups]");
  const nameGroups = within<HTMLElement>(root, "[data-name-groups]");
  const browse = within<HTMLElement>(root, "[data-rubric-browse]");
  const compare = within<HTMLElement>(root, "[data-rubric-compare]");
  const search = within<HTMLInputElement>(root, "[data-rubric-search]");
  const filter = within<HTMLSelectElement>(root, "[data-rubric-filter]");
  const results = within<HTMLElement>(root, "[data-rubric-results]");
  const list = within<HTMLElement>(root, "[data-rubric-list]");
  const empty = within<HTMLElement>(root, "[data-rubric-empty]");
  const detail = within<HTMLElement>(root, "[data-rubric-detail]");
  const compareLeft = within<HTMLSelectElement>(root, "[data-compare-left]");
  const compareRight = within<HTMLSelectElement>(root, "[data-compare-right]");
  const comparisonResult = within<HTMLElement>(root, "[data-comparison-result]");

  let source: CanvasCourseSource | null = null;
  let index: RubricIndex | null = null;
  let selectedId: string | null = null;

  const scrollBehavior = () => (window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");

  const groupButton = (rubricId: string, title: string, detailText: string) => `
    <button type="button" class="record-list-item" data-rubric-id="${escAttr(rubricId)}" aria-current="${rubricId === selectedId}">
      <span class="min-w-0">
        <span class="block wrap-break-word font-medium">${esc(title)}</span>
        <span class="mt-0.5 block text-xs text-muted-foreground">${esc(detailText)}</span>
      </span>
      <span aria-hidden="true" class="shrink-0 text-muted-foreground">›</span>
    </button>`;

  const renderSummary = () => {
    if (!index) return;
    const values = [
      ["Rubrics", index.entries.length],
      ["With linked activities", index.entries.filter((entry) => entry.activities.length > 0).length],
      ["Exact-copy groups", index.exactCopyGroups.length],
      ["Same-name groups", index.sameNameGroups.length],
    ] as const;
    summary.innerHTML = values
      .map(
        ([label, value]) => `
          <div class="summary-item">
            <dt class="text-sm text-muted-foreground">${label}</dt>
            <dd class="text-2xl font-semibold">${value}</dd>
          </div>`,
      )
      .join("");
  };

  const renderGroups = () => {
    if (!index) return;
    groupsSection.hidden = index.exactCopyGroups.length === 0 && index.sameNameGroups.length === 0;

    copyGroups.innerHTML = index.exactCopyGroups.length
      ? `<section class="rubric-group">
          <div class="grid gap-1">
            <h3 class="font-semibold">Exact-content copies</h3>
            <p class="text-sm text-muted-foreground">Criteria, ratings, long descriptions, and points match. Titles and Canvas identifiers may differ.</p>
          </div>
          ${index.exactCopyGroups
            .map(
              (group, groupIndex) => `
                <div class="grid gap-2 rounded-md bg-muted/40 p-3">
                  <h4 class="text-sm font-medium">Copy group ${groupIndex + 1} · ${group.rubrics.length} rubrics</h4>
                  <div class="record-list">
                    ${group.rubrics
                      .map((rubric) =>
                        groupButton(rubric.id, rubric.title, `${rubric.criteria.length} criteria · Open rubric`),
                      )
                      .join("")}
                  </div>
                </div>`,
            )
            .join("")}
        </section>`
      : "";

    nameGroups.innerHTML = index.sameNameGroups.length
      ? `<section class="rubric-group">
          <div class="grid gap-1">
            <h3 class="font-semibold">Same-name, different content</h3>
            <p class="text-sm text-muted-foreground">These rubrics share a normalized title but have different content versions.</p>
          </div>
          ${index.sameNameGroups
            .map(
              (group) => `
                <div class="grid gap-2 rounded-md bg-muted/40 p-3">
                  <h4 class="text-sm font-medium">${esc(group.title || "Untitled rubric")} · ${group.versions} versions</h4>
                  <div class="record-list">
                    ${group.rubrics
                      .map((rubric) =>
                        groupButton(rubric.id, rubric.title, `${rubric.criteria.length} criteria · Open rubric`),
                      )
                      .join("")}
                  </div>
                </div>`,
            )
            .join("")}
        </section>`
      : "";
  };

  const renderList = () => {
    if (!index) return;
    const entries = filterRubricEntries(index, {
      search: search.value,
      kind: filter.value as RubricFilterKind,
    });

    list.innerHTML = entries
      .map((entry) => {
        const { rubric, activities, exactCopyIds, hasSameNameVariation } = entry;
        const markers = [
          exactCopyIds.length > 0 ? "Exact copy" : "",
          hasSameNameVariation ? "Name variation" : "",
        ].filter(Boolean);
        return groupButton(
          rubric.id,
          rubric.title || "Untitled rubric",
          `${rubric.criteria.length} ${rubric.criteria.length === 1 ? "criterion" : "criteria"} · ${activities.length} linked ${activities.length === 1 ? "activity" : "activities"}${markers.length ? ` · ${markers.join(" · ")}` : ""}`,
        );
      })
      .join("");

    results.textContent = `${entries.length} ${entries.length === 1 ? "rubric" : "rubrics"} shown`;
    empty.hidden = entries.length > 0;
    list.hidden = entries.length === 0;
  };

  const renderDetail = () => {
    const entry = selectedId ? index?.entriesById.get(selectedId) : undefined;
    if (!entry || !index) {
      detail.innerHTML = `
        <div class="grid gap-2 py-8 text-center">
          <h3 class="font-semibold">Choose a rubric to explore</h3>
          <p class="text-sm text-muted-foreground">Select a rubric to read its criteria, ratings, and activity links.</p>
        </div>`;
      return;
    }

    const { rubric, activities, exactCopyIds, hasSameNameVariation, criteriaPoints } = entry;
    const entriesById = index.entriesById;
    const position = index.entries.findIndex((candidate) => candidate.rubric.id === rubric.id) + 1;
    const metadata: [string, string | number | undefined][] = [
      ["Rubric points", rubric.pointsPossible],
      ["Criterion points", criteriaPoints],
      ["Criteria", rubric.criteria.length],
      ["Linked activities", activities.length],
      ["Reusable", rubric.reusable ? "Yes" : "No"],
      ["Read-only", rubric.readOnly ? "Yes" : "No"],
    ];

    detail.innerHTML = `
      <header class="grid gap-3">
        <div class="flex flex-wrap items-center gap-2">
          <span class="${badgeClasses({ variant: "outline", size: "sm" })}">Rubric ${position} of ${index.entries.length}</span>
          ${exactCopyIds.length > 0 ? `<span class="${badgeClasses({ variant: "secondary", size: "sm" })}">Exact-content copy</span>` : ""}
          ${hasSameNameVariation ? `<span class="${badgeClasses({ variant: "info", size: "sm" })}">Same-name variation</span>` : ""}
        </div>
        <h3 class="font-heading text-2xl font-semibold wrap-break-word">${esc(rubric.title || "Untitled rubric")}</h3>
      </header>

      <dl class="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        ${metadata
          .filter(([, value]) => value !== undefined)
          .map(
            ([label, value]) => `
              <div class="grid gap-0.5 border-b border-border/70 pb-2">
                <dt class="text-muted-foreground">${esc(label)}</dt>
                <dd>${esc(String(value))}</dd>
              </div>`,
          )
          .join("")}
      </dl>

      <section class="grid gap-3">
        <div class="grid gap-1">
          <h4 class="font-semibold">Linked activities</h4>
          <p class="text-sm text-muted-foreground">Activities in this export that attach this rubric.</p>
        </div>
        ${
          activities.length === 0
            ? `<div class="grid gap-1 rounded-md bg-muted/40 p-3">
                <p class="text-sm font-medium">No linked activities in this export.</p>
                <p class="text-sm text-muted-foreground">The activities may not have been included in a selective export.</p>
              </div>`
            : `<div class="record-list">
                ${activities
                  .map(
                    ({ entity, usedForGrading }) => `
                      <a class="record-list-item" href="${escAttr(`/tools/course-explorer?item=${encodeURIComponent(entity.id)}`)}">
                        <span class="min-w-0">
                          <span class="block wrap-break-word font-medium">${esc(entity.title)}</span>
                          <span class="mt-0.5 block text-xs text-muted-foreground">${esc(KIND_LABELS[entity.kind])} · ${usedForGrading ? "Used for grading" : "Attached for reference"}</span>
                        </span>
                        <span aria-hidden="true" class="shrink-0 text-muted-foreground">›</span>
                      </a>`,
                  )
                  .join("")}
              </div>`
        }
      </section>

      ${
        exactCopyIds.length > 0
          ? `<section class="grid gap-2">
              <h4 class="text-sm font-semibold">Other exact-content copies</h4>
              <div class="record-list">
                ${exactCopyIds
                  .map((id) => {
                    const copy = entriesById.get(id)!.rubric;
                    return groupButton(copy.id, copy.title, "Open this copy");
                  })
                  .join("")}
              </div>
            </section>`
          : ""
      }

      <section class="grid gap-3">
        <h4 class="font-semibold">Criteria and ratings</h4>
        ${
          rubric.criteria.length
            ? `<div class="rubric-criteria">${rubric.criteria.map((criterion, criterionIndex) => criterionMarkup(criterion, criterionIndex)).join("")}</div>`
            : '<p class="text-sm text-muted-foreground">No criteria are included in this rubric.</p>'
        }
      </section>`;
  };

  const populateComparison = () => {
    if (!index) return;
    const leftPrevious = compareLeft.value;
    const rightPrevious = compareRight.value;
    const options = index.entries
      .map(
        (entry, entryIndex) =>
          `<option value="${escAttr(entry.rubric.id)}">${entryIndex + 1}. ${esc(entry.rubric.title || "Untitled rubric")}</option>`,
      )
      .join("");
    compareLeft.innerHTML = options;
    compareRight.innerHTML = options;

    const valid = (id: string) => index!.entriesById.has(id);
    compareLeft.value = valid(leftPrevious) ? leftPrevious : (index.entries[0]?.rubric.id ?? "");
    compareRight.value =
      valid(rightPrevious) && rightPrevious !== compareLeft.value
        ? rightPrevious
        : (index.entries.find((entry) => entry.rubric.id !== compareLeft.value)?.rubric.id ?? compareLeft.value);
    compareLeft.disabled = index.entries.length < 2;
    compareRight.disabled = index.entries.length < 2;
  };

  const comparisonCell = (criterion: RubricCriterion | undefined, index: number, label: string) => `
    <div class="comparison-cell">
      <p class="text-xs font-medium text-muted-foreground">${label}</p>
      ${criterion ? criterionMarkup(criterion, index, true) : '<p class="text-muted-foreground">No criterion at this position.</p>'}
    </div>`;

  const renderComparison = () => {
    if (!index) return;
    if (index.entries.length < 2) {
      comparisonResult.innerHTML =
        '<p class="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground">At least two rubrics are needed for a comparison.</p>';
      return;
    }

    const leftEntry = index.entriesById.get(compareLeft.value);
    const rightEntry = index.entriesById.get(compareRight.value);
    if (!leftEntry || !rightEntry) return;
    if (leftEntry.rubric.id === rightEntry.rubric.id) {
      comparisonResult.innerHTML =
        '<p class="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground">Choose two different rubrics to compare.</p>';
      return;
    }

    const comparison = compareRubrics(leftEntry.rubric, rightEntry.rubric);
    const titleDifference =
      comparison.sameContent && leftEntry.rubric.title !== rightEntry.rubric.title ? " The titles differ." : "";

    comparisonResult.innerHTML = `
      <div class="grid gap-1 rounded-lg border border-border bg-muted/30 p-4">
        <h3 class="font-semibold">${comparison.sameContent ? "Same rubric content" : "Rubric content differs"}</h3>
        <p class="text-sm text-muted-foreground">
          ${
            comparison.sameContent
              ? `Criteria, ratings, long descriptions, and points match.${titleDifference}`
              : `${comparison.differentCriteria} of ${comparison.criteria.length} criterion ${comparison.criteria.length === 1 ? "position differs" : "positions differ"}.`
          }
        </p>
      </div>

      <div class="comparison-pair">
        ${[leftEntry, rightEntry]
          .map(
            (entry, entryIndex) => `
          <section class="grid gap-1 rounded-lg border border-border bg-card p-4">
            <p class="text-xs font-medium text-muted-foreground">${entryIndex === 0 ? "Left" : "Right"}</p>
            <h3 class="font-semibold wrap-break-word">${esc(entry.rubric.title || "Untitled rubric")}</h3>
            <p class="text-sm text-muted-foreground">${esc(pointText(entry.rubric.pointsPossible))} · ${entry.rubric.criteria.length} criteria</p>
          </section>`,
          )
          .join("")}
      </div>

      <div class="grid gap-3">
        ${
          comparison.criteria.length
            ? comparison.criteria
                .map((criterion) => {
                  const status = STATUS_META[criterion.status];
                  return `
                <article class="grid gap-3 rounded-lg border border-border bg-card p-4">
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <h3 class="text-sm font-semibold">Criterion position ${criterion.index + 1}</h3>
                    <span class="${badgeClasses({ variant: status.variant, size: "sm" })}">${status.label}</span>
                  </div>
                  <div class="comparison-pair">
                    ${comparisonCell(criterion.left, criterion.index, "Left")}
                    ${comparisonCell(criterion.right, criterion.index, "Right")}
                  </div>
                </article>`;
                })
                .join("")
            : '<p class="text-sm text-muted-foreground">Both rubrics have no criteria.</p>'
        }
      </div>`;
  };

  const selectRubric = (id: string, scrollOnSmallScreens = true) => {
    if (!index?.entriesById.has(id)) return;
    selectedId = id;
    renderGroups();
    renderList();
    renderDetail();

    if (scrollOnSmallScreens && window.matchMedia("(width < 64rem)").matches) {
      detail.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
    }
  };

  const setView = (next: "browse" | "compare") => {
    context.hidden = next === "compare";
    browse.hidden = next !== "browse";
    compare.hidden = next !== "compare";
    root.querySelectorAll<HTMLButtonElement>("[data-rubric-view]").forEach((button) => {
      const active = button.dataset.rubricView === next;
      button.setAttribute("aria-pressed", String(active));
      button.classList.toggle("bg-accent", active);
    });
    if (next === "compare") renderComparison();
  };

  const renderAll = () => {
    const hasRubrics = (index?.entries.length ?? 0) > 0;
    noRubrics.hidden = hasRubrics;
    library.hidden = !hasRubrics;
    if (!hasRubrics) return;

    renderSummary();
    renderGroups();
    renderList();
    renderDetail();
    renderComparison();
  };

  const onSourceChange = (opened: CanvasCourseSource | null) => {
    content.hidden = !opened;
    if (!opened) {
      source = null;
      index = null;
      selectedId = null;
      return;
    }
    if (source === opened) return;

    source = opened;
    index = buildRubricIndex(opened.model);
    const requestedRubric = new URLSearchParams(window.location.search).get("rubric");
    selectedId =
      requestedRubric && index.entriesById.has(requestedRubric)
        ? requestedRubric
        : (index.entries[0]?.rubric.id ?? null);
    search.value = "";
    filter.value = "all";
    populateComparison();
    setView("browse");
    renderAll();
  };

  search.addEventListener("input", renderList);
  filter.addEventListener("change", renderList);
  compareLeft.addEventListener("change", renderComparison);
  compareRight.addEventListener("change", renderComparison);
  root.querySelectorAll<HTMLButtonElement>("[data-rubric-view]").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.rubricView as "browse" | "compare"));
  });
  root.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-rubric-id]");
    if (button?.dataset.rubricId) selectRubric(button.dataset.rubricId);
  });

  const unbindSource = bindCanvasSource(root, onSourceChange);
  return unbindSource;
});
