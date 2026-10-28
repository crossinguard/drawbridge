import { badge as badgeClasses } from "@/components/starwind/badge/variants";
import type { CanvasCourseSource } from "@/lib/workspace/types";
import type { CourseSummary } from "@/lib/canvas/selectors/course";
import {
  COURSE_SUMMARY_LABELS,
  filterCourseEntities,
  getCourseSummary,
  moduleItemMatches,
} from "@/lib/canvas/selectors/course";
import { getEntityDetailRows } from "@/lib/canvas/selectors/details";
import type { CourseEntity } from "@/lib/canvas/model";
import { KIND_LABELS, type ContentType, type PublishState } from "@/lib/canvas/types";
import { createCanvasContentView } from "@/scripts/canvas/content-view";
import { bindCanvasSource } from "@/scripts/canvas/source-controller";
import { esc, escAttr, within } from "@/scripts/lib/dom";
import { mountToolController } from "@/scripts/lib/lifecycle";

const SUMMARY_KEYS: (keyof CourseSummary)[] = [
  "modules",
  "pages",
  "assignments",
  "quizzes",
  "discussions",
  "files",
  "rubrics",
];

mountToolController("course-explorer", (root) => {
  const content = within<HTMLElement>(root, "[data-course-content]");
  const summary = within<HTMLElement>(root, "[data-course-summary]");
  const importNotes = within<HTMLDetailsElement>(root, "[data-import-notes]");
  const importNotesList = within<HTMLElement>(root, "[data-import-notes-list]");
  const search = within<HTMLInputElement>(root, "[data-course-search]");
  const typeFilter = within<HTMLSelectElement>(root, "[data-course-type-filter]");
  const moduleList = within<HTMLElement>(root, "[data-module-list]");
  const inventoryList = within<HTMLElement>(root, "[data-inventory-list]");
  const results = within<HTMLElement>(root, "[data-course-results]");
  const empty = within<HTMLElement>(root, "[data-course-empty]");
  const detail = within<HTMLElement>(root, "[data-course-detail]");

  let source: CanvasCourseSource | null = null;
  let selectedId: string | null = null;
  let navigationNote = "";
  let view: "modules" | "inventory" = "modules";
  let contentView: ReturnType<typeof createCanvasContentView> | null = null;

  const currentFilter = () => ({
    search: search.value,
    kind: typeFilter.value as ContentType | "all",
  });

  const setView = (next: "modules" | "inventory") => {
    view = next;
    moduleList.hidden = next !== "modules";
    inventoryList.hidden = next !== "inventory";
    root.querySelectorAll<HTMLButtonElement>("[data-course-view]").forEach((button) => {
      const active = button.dataset.courseView === next;
      button.setAttribute("aria-pressed", String(active));
      button.classList.toggle("bg-accent", active);
    });
    renderLists();
  };

  const scrollBehavior = () => (window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");

  const selectEntity = (id: string, scrollOnSmallScreens = true) => {
    if (!source?.model.entitiesById.has(id)) return false;
    selectedId = id;
    navigationNote = "";
    renderLists();
    renderDetail();

    if (scrollOnSmallScreens && window.matchMedia("(width < 64rem)").matches) {
      detail.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
    }
    return true;
  };

  const showMissingTarget = () => {
    navigationNote = "The linked content is not included in this export.";
    renderDetail();
    return true;
  };

  const revealModule = (id: string) => {
    if (!source?.model.export.modules.some((module) => module.id === id)) return showMissingTarget();

    search.value = "";
    typeFilter.value = "all";
    setView("modules");
    const moduleElement = Array.from(moduleList.querySelectorAll<HTMLDetailsElement>("[data-module-id]")).find(
      (candidate) => candidate.dataset.moduleId === id,
    );
    if (!moduleElement) return showMissingTarget();

    navigationNote = "";
    moduleElement.open = true;
    moduleElement.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
    return true;
  };

  const renderSummary = () => {
    if (!source) return;
    const counts = getCourseSummary(source.model);
    summary.innerHTML = SUMMARY_KEYS.map(
      (key) => `
        <div class="summary-item">
          <dt class="text-sm text-muted-foreground">${COURSE_SUMMARY_LABELS[key]}</dt>
          <dd class="text-2xl font-semibold">${counts[key]}</dd>
        </div>`,
    ).join("");

    const notes = [
      ...source.model.export.warnings,
      ...source.model.export.unreadable.map((file) => `${file.path} could not be read.`),
    ];
    importNotes.hidden = notes.length === 0;
    importNotesList.innerHTML = notes.map((note) => `<li>${esc(note)}</li>`).join("");
  };

  const itemButton = (entity: CourseEntity, title = entity.title) => `
    <button type="button" class="record-list-item" data-entity-id="${escAttr(entity.id)}" aria-current="${entity.id === selectedId}">
      <span class="min-w-0">
        <span class="block wrap-break-word font-medium">${esc(title)}</span>
        <span class="mt-0.5 block text-xs text-muted-foreground">
          ${esc(KIND_LABELS[entity.kind])}${entity.placements.length === 0 ? " · Not in a module" : ""}
        </span>
      </span>
      <span aria-hidden="true" class="shrink-0 text-muted-foreground">›</span>
    </button>`;

  const renderModules = () => {
    if (!source) return 0;
    const filter = currentFilter();
    const hasFilter = Boolean(filter.search?.trim()) || filter.kind !== "all";
    let count = 0;

    const html = source.model.export.modules
      .map((module, moduleIndex) => {
        const items = module.items.filter((item) =>
          moduleItemMatches(source!.model, item.id, item.title, item.contentType, filter),
        );
        if (items.length === 0) return "";
        count += items.length;

        const buttons = items
          .map((item) => {
            const entity = source!.model.entitiesByModuleItemId.get(item.id);
            return entity ? itemButton(entity, item.title) : "";
          })
          .join("");

        return `
          <details class="module-group" data-module-id="${escAttr(module.id)}" ${hasFilter || moduleIndex === 0 ? "open" : ""}>
            <summary>${esc(module.title)} <span class="text-xs font-normal text-muted-foreground">(${items.length})</span></summary>
            <div class="grid gap-1 p-1.5">${buttons}</div>
          </details>`;
      })
      .join("");

    moduleList.innerHTML = html;
    return count;
  };

  const renderInventory = () => {
    if (!source) return 0;
    const entities = filterCourseEntities(source.model, currentFilter());
    inventoryList.innerHTML = entities.map((entity) => itemButton(entity)).join("");
    return entities.length;
  };

  function renderLists() {
    if (!source) return;
    const moduleCount = renderModules();
    const inventoryCount = renderInventory();
    const count = view === "modules" ? moduleCount : inventoryCount;
    results.textContent = `${count} ${count === 1 ? "item" : "items"} shown`;
    empty.hidden = count > 0;
    moduleList.hidden = view !== "modules" || count === 0;
    inventoryList.hidden = view !== "inventory" || count === 0;
  }

  const stateBadge = (state: PublishState) => {
    const label = state === "active" ? "Published" : state === "locked" ? "Locked" : "Unpublished";
    const variant = state === "active" ? "success" : state === "locked" ? "secondary" : "warning";
    return `<span class="${badgeClasses({ variant, size: "sm" })}">${label}</span>`;
  };

  const safeExternalUrl = (value?: string) => {
    if (!value) return undefined;
    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:" ? url.href : undefined;
    } catch {
      return undefined;
    }
  };

  function renderDetail() {
    if (!source || !selectedId) return;
    const entity = source.model.entitiesById.get(selectedId);
    if (!entity) return;

    contentView?.destroy();
    const rows = getEntityDetailRows(source.model, entity);
    const processed = source.model.content.get(entity.id);
    const externalUrl = safeExternalUrl(entity.item.url);
    const rubricId = entity.item.assignment?.rubricId ?? entity.item.quiz?.rubricId ?? entity.item.discussion?.rubricId;
    const linkedRubric = source.model.export.rubrics.find((rubric) => rubric.id === rubricId);
    const kindBadge = `<span class="${badgeClasses({ variant: "outline", size: "sm" })}">${esc(KIND_LABELS[entity.kind])}</span>`;
    const outsideBadge =
      entity.placements.length === 0 && entity.kind !== "file"
        ? `<span class="${badgeClasses({ variant: "secondary", size: "sm" })}">Not in a module</span>`
        : "";

    detail.innerHTML = `
      <header class="grid gap-3">
        <div class="flex flex-wrap items-center gap-2">
          ${kindBadge}
          ${entity.kind === "file" ? "" : stateBadge(entity.state)}
          ${outsideBadge}
          ${entity.item.page?.frontPage ? `<span class="${badgeClasses({ variant: "info", size: "sm" })}">Front page</span>` : ""}
        </div>
        <h3 class="font-heading text-2xl font-semibold wrap-break-word">${esc(entity.title)}</h3>
      </header>

      ${navigationNote ? `<p role="status" class="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">${esc(navigationNote)}</p>` : ""}

      ${entity.item.unresolved && entity.kind !== "heading" ? `<p class="text-sm text-muted-foreground">${esc(entity.item.unresolvedReason ?? "The matching content is not included in this export.")}</p>` : ""}

      ${
        rows.length > 0
          ? `
        <dl class="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          ${rows
            .map(
              ({ label, value }) => `
            <div class="grid gap-0.5 border-b border-border/70 pb-2">
              <dt class="text-muted-foreground">${esc(label)}</dt>
              <dd class="min-w-0 wrap-break-word">${esc(value)}</dd>
            </div>`,
            )
            .join("")}
        </dl>`
          : ""
      }

      ${
        entity.placements.length > 0
          ? `
        <section class="grid gap-2">
          <h4 class="text-sm font-semibold">Appears in</h4>
          <ul class="grid gap-1 text-sm text-muted-foreground">
            ${entity.placements.map((placement) => `<li>${esc(placement.moduleTitle)}</li>`).join("")}
          </ul>
        </section>`
          : ""
      }

      ${
        linkedRubric
          ? `
        <section class="grid gap-1">
          <h4 class="text-sm font-semibold">Rubric</h4>
          <a href="${escAttr(`/tools/rubric-explorer?rubric=${encodeURIComponent(linkedRubric.id)}`)}" class="text-sm font-medium text-primary underline underline-offset-4">Open ${esc(linkedRubric.title)} in Rubric Explorer</a>
        </section>`
          : ""
      }

      ${
        externalUrl
          ? `
        <section class="grid gap-1">
          <h4 class="text-sm font-semibold">Destination</h4>
          <a href="${escAttr(externalUrl)}" target="_blank" rel="noopener noreferrer nofollow" class="break-all text-sm text-primary underline underline-offset-4">${esc(externalUrl)}</a>
        </section>`
          : ""
      }

      ${
        processed?.html
          ? `
        <section class="grid min-w-0 gap-3">
          <h4 class="text-sm font-semibold">Content</h4>
          <div data-course-body data-sw-prose data-slot="prose" class="sw-prose max-w-none text-sm"></div>
        </section>`
          : ""
      }
    `;

    const body = detail.querySelector<HTMLElement>("[data-course-body]");
    if (body && contentView) contentView.render(body, processed);
  }

  const renderWorkspace = (opened: CanvasCourseSource | null) => {
    content.hidden = !opened;

    if (!opened) {
      contentView?.destroy();
      contentView = null;
      source = null;
      selectedId = null;
      navigationNote = "";
      return;
    }

    if (source !== opened) {
      contentView?.destroy();
      source = opened;
      const requestedItem = new URLSearchParams(window.location.search).get("item");
      selectedId = requestedItem && opened.model.entitiesById.has(requestedItem) ? requestedItem : null;
      navigationNote = "";
      contentView = createCanvasContentView({
        archive: opened.archive,
        onTarget: (target) => {
          if (target.startsWith("page:")) {
            return selectEntity(target.slice("page:".length)) || showMissingTarget();
          }
          if (target.startsWith("file:")) {
            const path = target.slice("file:".length);
            const file = source?.model.entities.find((entity) => entity.item.bodyPath === path);
            return (file ? selectEntity(file.id) : false) || showMissingTarget();
          }
          if (target.startsWith("object:")) {
            return selectEntity(target.slice("object:".length)) || showMissingTarget();
          }
          if (target.startsWith("candidate:")) {
            // A matching Canvas ID is internal navigation. Otherwise preserve
            // the anchor because it may refer to ordinary course HTML.
            return selectEntity(target.slice("candidate:".length));
          }
          if (target.startsWith("module:")) {
            return revealModule(target.slice("module:".length));
          }
          if (target === "outline") {
            setView("modules");
            moduleList.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
            return true;
          }
          return false;
        },
      });
    }

    source = opened;
    renderSummary();
    renderLists();

    if (!selectedId) {
      detail.innerHTML = `
        <div class="grid gap-2 py-8 text-center">
          <h3 class="font-semibold">Choose something to explore</h3>
          <p class="text-sm text-muted-foreground">Select an item to read its content and see the details included in the export.</p>
        </div>`;
    } else {
      renderDetail();
    }
  };

  search.addEventListener("input", renderLists);
  typeFilter.addEventListener("change", renderLists);
  root.querySelectorAll<HTMLButtonElement>("[data-course-view]").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.courseView as "modules" | "inventory"));
  });
  root.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-entity-id]");
    if (button?.dataset.entityId) selectEntity(button.dataset.entityId);
  });

  const unbindSource = bindCanvasSource(root, renderWorkspace);
  return () => {
    unbindSource();
    contentView?.destroy();
  };
});
