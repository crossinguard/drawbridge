/**
 * The browse step: the module outline, the flat inventory table, and the
 * detail pane.
 *
 * The outline mirrors how Canvas is arranged, so a reviewer who knows the
 * course can find their way around. The table is the same course flattened
 * into one list, which is what makes it possible to see everything without
 * clicking through it.
 */
import { badge as badgeClasses } from "@/components/starwind/badge/variants";
import { tableCell, tableRow } from "@/components/starwind/table/variants";

import { byId, esc, escAttr } from "@/scripts/lib/dom";

import type { ContentLink } from "@/lib/canvas/content";
import {
  bankSelections,
  describeQuestionCount,
  describeQuestionSource,
  describeSelection,
  summariseQuestions,
} from "@/lib/canvas/quiz";
import { KIND_LABELS, type CourseItem } from "@/lib/canvas/types";
import type { AppState } from "./state";

/** Object URLs handed to images, so they can be released later. */
let objectUrls: string[] = [];

/** Release the object URLs of the images that are on screen now. */
export function releaseImages(): void {
  for (const url of objectUrls) URL.revokeObjectURL(url);
  objectUrls = [];
}

/** The items that pass the current search and filters. */
export function matchingItems(state: AppState): CourseItem[] {
  const course = state.course;
  if (!course) return [];

  const query = state.search.trim().toLowerCase();

  return course.items.filter((item) => {
    if (state.typeFilter !== "all" && item.kind !== state.typeFilter) return false;
    if (state.stateFilter === "active" && item.state !== "active") return false;
    if (state.stateFilter === "unpublished" && item.state !== "unpublished") return false;
    if (query === "") return true;

    const haystacks = [item.title, item.moduleTitle ?? "", item.url ?? "", state.content.get(item.id)?.text ?? ""];
    return haystacks.some((text) => text.toLowerCase().includes(query));
  });
}

/** Draw the outline and the table for the current filters. */
export function renderBrowse(state: AppState): void {
  const items = matchingItems(state);
  renderOutline(state, items);
  renderTable(state, items);

  byId("browse-count").textContent = String(items.length);
  byId("browse-total").textContent = String(state.course?.items.length ?? 0);

  const empty = byId("browse-empty");
  empty.hidden = items.length > 0;
}

/** Draw the module tree. */
function renderOutline(state: AppState, items: CourseItem[]): void {
  const course = state.course;
  const container = byId("browse-outline");
  container.innerHTML = "";
  if (!course) return;

  const visible = new Set(items.map((item) => item.id));

  for (const module of course.modules) {
    const moduleItems = course.items.filter((item) => item.moduleId === module.id);
    const shown = moduleItems.filter((item) => visible.has(item.id));
    if (items.length > 0 && shown.length === 0) continue;

    const section = document.createElement("section");
    section.className = "grid min-w-0 gap-1";

    const heading = document.createElement("div");
    heading.className = "flex min-w-0 items-center gap-2 px-2 py-1.5";
    heading.innerHTML = `
      <span class="min-w-0 truncate text-sm font-medium">${esc(module.title)}</span>
      <span class="${badgeClasses({ variant: "secondary", size: "sm" })} shrink-0">${moduleItems.length}</span>
      ${
        module.state === "unpublished"
          ? `<span class="${badgeClasses({ variant: "warning", size: "sm" })} shrink-0">Unpublished</span>`
          : ""
      }
    `;
    section.appendChild(heading);

    const list = document.createElement("ul");
    list.className = "grid min-w-0 gap-0.5 border-l border-border/70 pl-2 ml-3";

    for (const item of moduleItems) {
      if (!visible.has(item.id)) continue;

      const entry = document.createElement("li");
      entry.className = "min-w-0";
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.item = item.id;
      button.className = itemButtonClasses(item, state.selectedId === item.id);
      button.innerHTML = `
        <span class="min-w-0 truncate">${esc(item.title)}</span>
        ${
          item.state === "unpublished"
            ? `<span class="${badgeClasses({ variant: "warning", size: "sm" })} shrink-0">Unpublished</span>`
            : ""
        }
        ${item.unresolved ? `<span class="${badgeClasses({ variant: "error", size: "sm" })} shrink-0">Missing</span>` : ""}
      `;
      button.addEventListener("click", () => {
        state.selectedId = item.id;
        renderBrowse(state);
        renderDetail(state);
      });

      if ((item.indent ?? 0) > 0) button.classList.add("pl-4");
      entry.appendChild(button);
      list.appendChild(entry);
    }

    section.appendChild(list);
    container.appendChild(section);
  }

  // Content that is in the export but not in any module.
  const orphans = (state.course?.orphans ?? []).filter((item) => item.kind !== "file");
  if (orphans.length > 0 && (state.search === "" || items.length > 0)) {
    const section = document.createElement("section");
    section.className = "grid gap-1";
    section.innerHTML = `
      <div class="flex items-center gap-2 px-2 py-1.5">
        <span class="truncate text-sm font-medium">Not in any module</span>
        <span class="${badgeClasses({ variant: "secondary", size: "sm" })}">${orphans.length}</span>
      </div>
    `;

    const list = document.createElement("ul");
    list.className = "grid min-w-0 gap-0.5 border-l border-border/70 pl-2 ml-3";

    for (const item of orphans) {
      const entry = document.createElement("li");
      entry.className = "min-w-0";
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.item = item.id;
      button.className = itemButtonClasses(item, state.selectedId === item.id);
      button.innerHTML = `<span class="min-w-0 truncate">${esc(item.title)}</span>`;
      button.addEventListener("click", () => {
        state.selectedId = item.id;
        renderBrowse(state);
        renderDetail(state);
      });
      entry.appendChild(button);
      list.appendChild(entry);
    }

    section.appendChild(list);
    container.appendChild(section);
  }
}

/** The classes for one row of the outline. */
function itemButtonClasses(item: CourseItem, selected: boolean): string {
  const base = "flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors";
  if (selected) return `${base} bg-primary/10 text-foreground font-medium`;
  if (item.state === "unpublished") return `${base} text-muted-foreground hover:bg-muted`;
  return `${base} hover:bg-muted`;
}

/** Draw the flat inventory table. */
function renderTable(state: AppState, items: CourseItem[]): void {
  const body = byId("browse-table-body");
  body.innerHTML = "";

  for (const item of items) {
    const processed = state.content.get(item.id);
    const row = document.createElement("tr");
    row.dataset.item = item.id;
    row.className = `${tableRow()} cursor-pointer ${state.selectedId === item.id ? "bg-muted" : ""}`;

    const points = item.assignment?.pointsPossible ?? item.quiz?.pointsPossible;

    row.innerHTML = `
      <td class="${tableCell()} max-w-[22rem] truncate font-medium">${esc(item.title)}</td>
      <td class="${tableCell()}">${esc(KIND_LABELS[item.kind])}</td>
      <td class="${tableCell()}">${stateBadge(state, item)}</td>
      <td class="${tableCell()} max-w-[14rem] truncate">${esc(item.moduleTitle ?? "—")}</td>
      <td class="${tableCell()} text-right">${points === undefined ? "—" : esc(String(points))}</td>
      <td class="${tableCell()} text-right">${processed?.text.length ?? 0}</td>
      <td class="${tableCell()} text-right">${processed?.links.length ?? 0}</td>
    `;

    row.addEventListener("click", () => {
      state.selectedId = item.id;
      renderBrowse(state);
      renderDetail(state);
      scrollDetailIntoView();
    });

    body.appendChild(row);
  }
}

/**
 * Bring the detail pane into view.
 *
 * In the table view the detail sits below a long table, so choosing a row
 * would otherwise leave the reader looking at the wrong place.
 */
function scrollDetailIntoView(): void {
  byId("browse-detail").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/** The badge showing an item's publish state. */
function stateBadge(state: AppState, item: CourseItem): string {
  const label = item.state === "active" ? "Published" : item.state === "locked" ? "Locked" : "Unpublished";
  const variant = item.state === "active" ? "success" : item.state === "locked" ? "secondary" : "warning";
  void state;
  return `<span class="${badgeClasses({ variant, size: "sm" })}">${label}</span>`;
}

/** Draw the detail pane for the selected item. */
export function renderDetail(state: AppState): void {
  const container = byId("browse-detail");
  releaseImages();

  const course = state.course;
  const item =
    course?.items.find((candidate) => candidate.id === state.selectedId) ??
    course?.orphans.find((candidate) => candidate.id === state.selectedId);

  if (!course || !item) {
    container.innerHTML = `
      <div class="grid gap-2 p-6 text-center text-sm text-muted-foreground">
        <p>Pick an item from the outline or the table to see its content.</p>
      </div>
    `;
    return;
  }

  const processed = state.content.get(item.id);

  container.innerHTML = `
    <div class="grid gap-4 p-4 sm:p-6">
      <div class="grid gap-2">
        <div class="flex flex-wrap items-center gap-2">
          <span class="${badgeClasses({ variant: "outline", size: "sm" })}">${esc(KIND_LABELS[item.kind])}</span>
          ${stateBadge(state, item)}
          ${item.moduleTitle ? `<span class="${badgeClasses({ variant: "secondary", size: "sm" })}">${esc(item.moduleTitle)}</span>` : ""}
          ${item.page?.frontPage ? `<span class="${badgeClasses({ variant: "info", size: "sm" })}">Front page</span>` : ""}
        </div>
        <h3 class="text-lg font-semibold">${esc(item.title)}</h3>
        ${item.unresolved ? `<p class="text-sm text-error">${esc(item.unresolvedReason ?? "This item could not be resolved.")}</p>` : ""}
      </div>

      <div id="browse-meta"></div>

      ${
        item.url
          ? `<div class="grid gap-1">
               <span class="text-xs font-medium text-muted-foreground">Link</span>
               <a href="${escAttr(item.url)}" target="_blank" rel="noopener noreferrer nofollow" class="text-sm break-all underline underline-offset-4">${esc(item.url)}</a>
             </div>`
          : ""
      }

      <div id="browse-body" data-sw-prose data-slot="prose" class="sw-prose max-w-none text-sm"></div>

      <div id="browse-links" class="grid gap-2"></div>
    </div>
  `;

  renderMeta(state, item);
  renderLinks(state, processed?.links ?? []);

  const body = byId("browse-body");
  body.innerHTML = processed?.html ?? "";

  // Canvas' own links to other pages become jumps inside the viewer.
  body.querySelectorAll<HTMLAnchorElement>("a[data-canvas-target]").forEach((anchor) => {
    anchor.addEventListener("click", (event) => {
      event.preventDefault();
      const target = anchor.dataset.canvasTarget ?? "";
      if (target.startsWith("page:")) {
        const pageId = target.slice("page:".length);
        const page =
          state.course?.items.find((candidate) => candidate.id === pageId) ??
          state.course?.orphans.find((candidate) => candidate.id === pageId);
        if (page) {
          state.selectedId = page.id;
          renderBrowse(state);
          renderDetail(state);
        }
      } else if (target === "outline") {
        state.view = "outline";
        renderBrowse(state);
      }
    });
  });

  void resolveImages(body, state);
}

/** Draw the metadata table for the selected item. */
function renderMeta(state: AppState, item: CourseItem): void {
  const container = byId("browse-meta");
  const rows: [string, string][] = [];

  if (item.assignment) {
    const assignment = item.assignment;
    if (assignment.pointsPossible !== undefined) rows.push(["Points", String(assignment.pointsPossible)]);
    if (assignment.gradingType) rows.push(["Grading", assignment.gradingType]);
    if (assignment.submissionTypes.length > 0) rows.push(["Submission", assignment.submissionTypes.join(", ")]);
    if (assignment.groupTitle) rows.push(["Group", assignment.groupTitle]);
    if (assignment.dueAt) rows.push(["Due", assignment.dueAt]);
    if (assignment.unlockAt) rows.push(["Unlock", assignment.unlockAt]);
    if (assignment.lockAt) rows.push(["Lock", assignment.lockAt]);
    if (assignment.peerReviews) rows.push(["Peer review", `${assignment.peerReviewCount} reviews`]);
    if (assignment.omitFromFinalGrade) rows.push(["Final grade", "Excluded"]);
    if (assignment.hideInGradebook) rows.push(["Gradebook", "Hidden"]);
    if (assignment.allowedExtensions.length > 0) rows.push(["File types", assignment.allowedExtensions.join(", ")]);
  }

  if (item.quiz) {
    const quiz = item.quiz;
    const summary = summariseQuestions(quiz);
    if (quiz.pointsPossible !== undefined) rows.push(["Points", String(quiz.pointsPossible)]);
    rows.push(["Questions", describeQuestionCount(summary)]);
    rows.push(["Question source", describeQuestionSource(quiz)]);
    if (summary.points > 0) rows.push(["Points from questions", String(summary.points)]);
    if (Object.keys(quiz.questionTypes).length > 0) {
      rows.push([
        "Question types",
        Object.entries(quiz.questionTypes)
          .map(([type, count]) => `${count} ${type.replace(/_question$/, "").replace(/_/g, " ")}`)
          .join(", "),
      ]);
    }
    if (quiz.quizType) rows.push(["Type", quiz.quizType]);
    rows.push([
      "Attempts",
      quiz.allowedAttempts === undefined ? "—" : quiz.allowedAttempts < 0 ? "Unlimited" : String(quiz.allowedAttempts),
    ]);
    if (quiz.timeLimit) rows.push(["Time limit", `${quiz.timeLimit} minutes`]);
    if (quiz.scoringPolicy) rows.push(["Scoring", quiz.scoringPolicy]);
    if (quiz.dueAt) rows.push(["Due", quiz.dueAt]);
    if (quiz.lockdownBrowser) rows.push(["Lockdown browser", "Required"]);
    if (quiz.showCorrectAnswers) rows.push(["Correct answers", "Shown"]);
    if (quiz.accessCode) rows.push(["Access code", "Set — this travels with the export"]);

    const banks = bankSelections(quiz);
    if (banks.length > 0) {
      rows.push(["Item banks", banks.map((selection) => describeSelection(selection)).join("; ")]);
    }
  }

  if (item.discussion) {
    const discussion = item.discussion;
    if (discussion.discussionType) rows.push(["Type", discussion.discussionType]);
    rows.push(["Initial post", discussion.requireInitialPost ? "Required" : "Optional"]);
    if (discussion.allowRating) rows.push(["Rating", "Allowed"]);
    if (discussion.anonymousState) rows.push(["Anonymity", discussion.anonymousState.replace(/_/g, " ")]);
  }

  if (item.page) {
    if (item.page.frontPage) rows.push(["Front page", "Yes"]);
    if (item.page.editingRoles) rows.push(["Who can edit", item.page.editingRoles]);
  }

  const processed = state.content.get(item.id);
  if (processed) rows.push(["Body text", `${processed.text.length} characters`]);

  if (rows.length === 0) return;

  container.innerHTML = `
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
  `;
}

/** Draw the list of links the item contains. */
function renderLinks(state: AppState, links: ContentLink[]): void {
  const container = byId("browse-links");
  if (links.length === 0) {
    container.innerHTML = "";
    return;
  }

  const external = links.filter((link) => link.kind === "external");
  const internal = links.filter((link) => link.kind === "internal-page" || link.kind === "internal-file");
  const api = links.filter((link) => link.kind === "canvas-api");

  container.innerHTML = `
    <span class="text-xs font-medium text-muted-foreground">Links in this item</span>
    <div class="grid gap-2 text-sm">
      ${
        internal.length > 0
          ? `<div class="grid gap-1">
               <span class="text-xs text-muted-foreground">Inside the course</span>
               <ul class="grid gap-1">
                 ${internal
                   .map(
                     (link) => `
                       <li>
                         <button type="button" class="text-left underline underline-offset-4 hover:text-primary" data-canvas-link="${escAttr(link.href)}">
                           ${esc(link.label || link.href)}
                         </button>
                       </li>
                     `,
                   )
                   .join("")}
               </ul>
             </div>`
          : ""
      }
      ${
        external.length > 0
          ? `<div class="grid gap-1">
               <span class="text-xs text-muted-foreground">Outside the course (${external.length})</span>
               <ul class="grid gap-1">
                 ${external
                   .map(
                     (link) => `
                       <li class="flex flex-wrap items-baseline gap-2">
                         <a href="${escAttr(link.href)}" target="_blank" rel="noopener noreferrer nofollow" class="underline underline-offset-4 hover:text-primary break-all">${esc(link.label || link.href)}</a>
                         ${link.host ? `<span class="text-xs text-muted-foreground">${esc(link.host)}</span>` : ""}
                       </li>
                     `,
                   )
                   .join("")}
               </ul>
             </div>`
          : ""
      }
      ${
        api.length > 0
          ? `<div class="grid gap-1">
               <span class="text-xs text-muted-foreground">References to the source Canvas instance (${api.length})</span>
               <ul class="grid gap-1">
                 ${api.map((link) => `<li class="break-all text-xs text-muted-foreground">${esc(link.href)}</li>`).join("")}
               </ul>
             </div>`
          : ""
      }
    </div>
  `;

  container.querySelectorAll<HTMLButtonElement>("[data-canvas-link]").forEach((button) => {
    button.addEventListener("click", () => {
      const href = button.dataset.canvasLink ?? "";
      if (!href.startsWith("$WIKI_REFERENCE$/pages/")) return;

      const pageId = href.slice("$WIKI_REFERENCE$/pages/".length).split(/[?#]/)[0];
      const page =
        state.course?.items.find((candidate) => candidate.id === pageId) ??
        state.course?.orphans.find((candidate) => candidate.id === pageId);

      if (!page) return;
      state.selectedId = page.id;
      renderBrowse(state);
      renderDetail(state);
    });
  });
}

/** Point the images in the body at the files inside the cartridge. */
async function resolveImages(body: HTMLElement, state: AppState): Promise<void> {
  const store = state.store;
  if (!store) return;

  const images = Array.from(body.querySelectorAll<HTMLImageElement>("img[data-canvas-image]"));

  for (const image of images) {
    const path = image.dataset.canvasImage;
    if (!path) continue;

    const blob = await store.blob(path);
    if (!blob) {
      image.replaceWith(document.createTextNode(`[missing image: ${path}]`));
      continue;
    }

    const url = URL.createObjectURL(blob);
    objectUrls.push(url);
    image.src = url;
  }
}
