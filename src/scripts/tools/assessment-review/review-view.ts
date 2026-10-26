/**
 * The review screen: the tabs, the tables, and the detail pane.
 *
 * Every view reads from the same review model, and so does the prep file.
 * What the reviewer sees and what the reviewer exports cannot disagree.
 */
import { badge as badgeClasses } from "@/components/starwind/badge/variants";
import { tableCell, tableRow } from "@/components/starwind/table/variants";

import { byId, esc, escAttr } from "@/scripts/lib/dom";

import { describeQuiz, QUIZ_SETTINGS } from "@/lib/tools/assessment-review/checks/quizzes";
import { usageLabel } from "@/lib/tools/assessment-review/checks/legacy";
import { FAMILY_LABELS, PRIORITIES } from "@/lib/tools/assessment-review/findings";
import { points as formatPoints } from "@/lib/tools/assessment-review/findings";
import { ASSESSMENT_KIND_LABELS, type Assessment, type AssessmentReview } from "@/lib/tools/assessment-review/model";
import { naturalCompare } from "@/lib/utils";

import { priorityOf, REVIEW_TABS, state } from "./state";

/** Draw the tab strip. */
export function renderTabs(): void {
  const container = byId("review-tabs-list");
  container.innerHTML = "";

  for (const tab of REVIEW_TABS) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.tab = tab.id;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(state.tab === tab.id));
    button.className = `rounded px-2.5 py-1 text-sm transition-colors ${
      state.tab === tab.id ? "bg-background font-medium text-foreground" : "text-muted-foreground hover:bg-muted"
    }`;
    button.textContent = tab.label;
    button.addEventListener("click", () => {
      state.tab = tab.id;
      renderTabs();
      renderPanel();
    });
    container.appendChild(button);
  }
}

/** The assessments that pass the current filters. */
export function matchingAssessments(): Assessment[] {
  const review = state.review;
  if (!review) return [];

  const query = state.search.trim().toLowerCase();

  return review.assessments
    .filter((assessment) => {
      if (state.kindFilter !== "all" && assessment.kind !== state.kindFilter) return false;

      if (state.usageFilter !== "all") {
        const usage = review.usage.byId.get(assessment.id)?.state ?? "unclear";
        if (usage !== state.usageFilter) return false;
      }

      if (state.groupFilter !== "all" && assessment.groupId !== state.groupFilter) return false;

      if (query === "") return true;

      const rubric = review.rubrics.find((entry) => entry.rubric.id === assessment.rubricId)?.rubric;
      const haystacks = [
        assessment.title,
        assessment.moduleTitle ?? "",
        assessment.groupTitle ?? "",
        assessment.instructions,
        rubric?.title ?? "",
      ];

      return haystacks.some((text) => text.toLowerCase().includes(query));
    })
    .sort((a, b) => {
      const module = naturalCompare(a.moduleTitle ?? "", b.moduleTitle ?? "");
      if (module !== 0) return module;
      return naturalCompare(a.title, b.title);
    });
}

/** Draw the panel for the current tab. */
export function renderPanel(): void {
  const panel = byId("review-panel");

  switch (state.tab) {
    case "overview":
      panel.innerHTML = renderOverview();
      break;
    case "modules":
      panel.innerHTML = renderModules();
      break;
    case "assessments":
      panel.innerHTML = renderAssessments();
      break;
    case "quizzes":
      panel.innerHTML = renderQuizzes();
      break;
    case "rubrics":
      panel.innerHTML = renderRubrics();
      break;
    case "gradebook":
      panel.innerHTML = renderGradebook();
      break;
    case "flags":
      panel.innerHTML = renderFlags();
      break;
  }

  wireDetail();
}

/** The overview: the counts, and what the review found. */
function renderOverview(): string {
  const review = state.review;
  if (!review) return "";

  const counts = new Map<string, number>();
  for (const finding of state.findings) {
    counts.set(finding.family, (counts.get(finding.family) ?? 0) + 1);
  }

  const high = state.findings.filter((finding) => priorityOf(finding) === "high");
  const needsReview = state.findings.filter((finding) => finding.needsReview);

  return `
    <div class="grid gap-6 p-4 sm:p-6">
      <div class="grid gap-3">
        <h3 class="text-sm font-medium">The course</h3>
        <dl class="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          ${statRows(review)}
        </dl>
      </div>

      <div class="grid gap-3">
        <h3 class="text-sm font-medium">What the review found</h3>
        <div class="flex flex-wrap gap-2">
          ${FAMILY_ORDER.map((family) => {
            const count = counts.get(family) ?? 0;
            if (count === 0) return "";
            return `<span class="${badgeClasses({ variant: "secondary", size: "sm" })}">${esc(FAMILY_LABELS[family])}: ${count}</span>`;
          }).join("")}
        </div>
      </div>

      <div class="grid gap-3">
        <h3 class="text-sm font-medium">Needing a decision (${needsReview.length})</h3>
        ${needsReview.length === 0 ? `<p class="text-sm text-muted-foreground">Nothing was marked as needing a decision. The gaps in the export still stand.</p>` : ""}
        <ul class="grid gap-2">
          ${needsReview
            .slice(0, 12)
            .map(
              (finding) => `
                <li class="rounded-md border border-border p-3 text-sm">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="${badgeClasses({ variant: priorityVariant(finding), size: "sm" })}">${esc(priorityOf(finding))}</span>
                    <span class="${badgeClasses({ variant: "outline", size: "sm" })}">${esc(finding.check)}</span>
                  </div>
                  <p class="mt-1">${esc(finding.statement)}</p>
                </li>
              `,
            )
            .join("")}
        </ul>
        ${needsReview.length > 12 ? `<p class="text-xs text-muted-foreground">And ${needsReview.length - 12} more, in the Findings tab.</p>` : ""}
      </div>

      ${high.length > 0 ? "" : ""}
    </div>
  `;
}

/** The families, in the order they are shown. */
const FAMILY_ORDER = ["scoring", "legacy", "quizzes", "rubrics", "naming"] as const;

/** The course's facts, as a two-column list. */
function statRows(review: AssessmentReview): string {
  const rows: [string, string][] = [
    ["Course", review.course.meta.title],
    ["Code", review.course.meta.code || "not in export"],
    ["Modules", String(review.course.modules.length)],
    ["Graded items", String(review.assessments.length)],
    ["Quizzes", String(review.assessments.filter((a) => a.kind === "quiz").length)],
    ["Rubrics", String(review.rubrics.length)],
    ["Item banks", String(review.itemBanks.length)],
    [
      "Weighted by",
      review.weighting === "percent" ? "percentage" : review.weighting === "points" ? "points" : "not recorded",
    ],
  ];

  return rows
    .map(
      ([label, value]) => `
        <div class="flex justify-between gap-3 border-b border-border/60 py-1">
          <dt class="text-muted-foreground">${esc(label)}</dt>
          <dd class="text-right">${esc(value)}</dd>
        </div>
      `,
    )
    .join("");
}

/** The modules and what is in them. */
function renderModules(): string {
  const review = state.review;
  if (!review) return "";

  const visible = new Set(matchingAssessments().map((assessment) => assessment.id));

  const sections = review.course.modules
    .map((module) => {
      const items = module.items
        .map((moduleItem) => {
          const assessment = review.assessments.find((entry) => entry.item.itemId === moduleItem.id);
          const shown = !assessment || visible.has(assessment.id);

          const parts: string[] = [moduleItem.contentType];
          if (assessment) {
            parts.push(`${formatPoints(assessment.pointsPossible)} points`);
            if (assessment.groupTitle) parts.push(assessment.groupTitle);
            if (assessment.rubricId) parts.push("has a rubric");
          }

          return `<li class="flex flex-wrap items-center gap-2 py-1 ${shown ? "" : "hidden"}">
            <span class="min-w-0 truncate">${esc(moduleItem.title)}</span>
            <span class="text-xs text-muted-foreground">${esc(parts.join(" · "))}</span>
            ${moduleItem.state === "active" ? "" : `<span class="${badgeClasses({ variant: "warning", size: "sm" })}">${esc(moduleItem.state)}</span>`}
          </li>`;
        })
        .join("");

      return `<section class="grid gap-1">
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-sm font-medium">${esc(module.title)}</span>
          <span class="${badgeClasses({ variant: "secondary", size: "sm" })}">${module.items.length}</span>
          ${module.state === "active" ? "" : `<span class="${badgeClasses({ variant: "warning", size: "sm" })}">${esc(module.state)}</span>`}
        </div>
        <ul class="grid gap-0.5 border-l border-border/70 pl-3 ml-1">${items}</ul>
      </section>`;
    })
    .join("");

  return `<div class="grid gap-4 p-4 sm:p-6">${sections}</div>`;
}

/** The graded items, as a table. */
function renderAssessments(): string {
  const review = state.review;
  if (!review) return "";

  const items = matchingAssessments();

  const rows = items
    .map((assessment) => {
      const usage = review.usage.byId.get(assessment.id)?.state ?? "unclear";
      const rubric = review.rubrics.find((entry) => entry.rubric.id === assessment.rubricId)?.rubric;
      const findings = state.findings.filter((finding) => finding.affected.includes(assessment.id));

      return `<tr class="${tableRow()} cursor-pointer" data-item="${escAttr(assessment.id)}">
        <td class="${tableCell()} max-w-72 truncate font-medium">${esc(assessment.title)}</td>
        <td class="${tableCell()}">${esc(ASSESSMENT_KIND_LABELS[assessment.kind])}</td>
        <td class="${tableCell()} max-w-56 truncate">${esc(assessment.moduleTitle ?? "—")}</td>
        <td class="${tableCell()} max-w-48 truncate">${esc(assessment.groupTitle ?? "—")}</td>
        <td class="${tableCell()} text-right">${esc(formatPoints(assessment.pointsPossible))}</td>
        <td class="${tableCell()} max-w-56 truncate">${esc(rubric?.title ?? "—")}</td>
        <td class="${tableCell()}">${esc(usageLabel(usage))}</td>
        <td class="${tableCell()} text-right">${findings.length}</td>
      </tr>`;
    })
    .join("");

  return `
    <div class="grid gap-3 p-4 sm:p-6">
      <p class="text-sm text-muted-foreground">${items.length} of ${review.assessments.length} graded items shown.</p>
      <div class="overflow-auto rounded-lg border border-border">
        <table class="w-full min-w-176 text-sm">
          <thead class="[&_tr]:border-b">
            <tr class="hover:bg-muted/50 border-b transition-colors">
              <th class="${tableCell()} text-left font-medium">Assessment</th>
              <th class="${tableCell()} text-left font-medium">Type</th>
              <th class="${tableCell()} text-left font-medium">Module</th>
              <th class="${tableCell()} text-left font-medium">Group</th>
              <th class="${tableCell()} text-right font-medium">Points</th>
              <th class="${tableCell()} text-left font-medium">Rubric</th>
              <th class="${tableCell()} text-left font-medium">Usage</th>
              <th class="${tableCell()} text-right font-medium">Findings</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div id="review-detail" class="min-h-64 rounded-lg border border-border"></div>
    </div>
  `;
}

/** The quizzes, as a table with their settings. */
function renderQuizzes(): string {
  const review = state.review;
  if (!review) return "";

  const quizzes = matchingAssessments().filter((assessment) => assessment.kind === "quiz");

  const rows = quizzes
    .map((assessment) => {
      const described = describeQuiz(assessment);
      const group = state.groups.find((entry) => entry.quizzes.some((quiz) => quiz.id === assessment.id));

      return `<tr class="${tableRow()} cursor-pointer" data-item="${escAttr(assessment.id)}">
        <td class="${tableCell()} max-w-80 truncate font-medium">${esc(assessment.title)}</td>
        <td class="${tableCell()}">${esc(described.engine)}</td>
        <td class="${tableCell()}">${esc(described.source)}</td>
        <td class="${tableCell()} text-right">${esc(described.questions)}</td>
        <td class="${tableCell()} text-right">${esc(described.banks)}</td>
        <td class="${tableCell()} text-right">${esc(formatPoints(assessment.pointsPossible))}</td>
        <td class="${tableCell()} max-w-56 truncate">${esc(group?.title ?? "—")}</td>
      </tr>`;
    })
    .join("");

  const families = state.families
    .map(
      (family) => `
        <section class="grid gap-1 rounded-md border border-border p-3">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-sm font-medium">${esc(family.groupTitle)}</span>
            <span class="${badgeClasses({ variant: "secondary", size: "sm" })}">${family.members.length}</span>
            <span class="text-xs text-muted-foreground">${esc(family.id)}</span>
          </div>
          <p class="text-xs text-muted-foreground">
            ${esc(family.settings.map((setting) => `${setting.label}: ${setting.value}`).join(", "))}
          </p>
          <ul class="grid gap-0.5 text-xs">
            ${family.members.map((member) => `<li class="truncate">${esc(member.title)}</li>`).join("")}
          </ul>
          ${
            family.exceptions.length > 0
              ? `<p class="text-xs text-muted-foreground">Differs: ${esc(
                  family.exceptions
                    .map((exception) => `${exception.title} (${exception.setting}: ${exception.value})`)
                    .join("; "),
                )}</p>`
              : ""
          }
        </section>
      `,
    )
    .join("");

  const groups = state.groups
    .map(
      (group) => `
        <section class="grid gap-2">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-sm font-medium">${esc(group.title)}</span>
            <span class="${badgeClasses({ variant: "secondary", size: "sm" })}">${group.quizzes.length}</span>
            <span class="text-xs text-muted-foreground">${esc(group.reason)}</span>
          </div>
          <div class="overflow-auto rounded-lg border border-border">
            <table class="w-full min-w-176 text-sm">
              <thead class="[&_tr]:border-b">
                <tr class="hover:bg-muted/50 border-b transition-colors">
                  <th class="${tableCell()} text-left font-medium">Quiz</th>
                  ${QUIZ_SETTINGS.map((setting) => `<th class="${tableCell()} text-left font-medium whitespace-nowrap">${esc(setting.label)}</th>`).join("")}
                  <th class="${tableCell()} text-left font-medium">Group</th>
                </tr>
              </thead>
              <tbody>
                ${group.quizzes
                  .map((quiz) => {
                    const cells = QUIZ_SETTINGS.map((setting) => {
                      const value = quiz.quiz ? setting.read(quiz.quiz) : undefined;
                      return `<td class="${tableCell()} whitespace-nowrap">${esc(value ?? "not in export")}</td>`;
                    });

                    const options = state.groups
                      .map(
                        (entry) =>
                          `<option value="${escAttr(entry.id)}" ${entry.id === group.id ? "selected" : ""}>${esc(entry.title)}</option>`,
                      )
                      .join("");

                    return `<tr class="${tableRow()}">
                      <td class="${tableCell()} max-w-72 truncate cursor-pointer" data-item="${escAttr(quiz.id)}">${esc(quiz.title)}</td>
                      ${cells.join("")}
                      <td class="${tableCell()}">
                        <select class="rounded-md border border-border bg-background px-2 py-1 text-xs" data-move="${escAttr(quiz.id)}">${options}</select>
                      </td>
                    </tr>`;
                  })
                  .join("")}
              </tbody>
            </table>
          </div>
        </section>
      `,
    )
    .join("");

  return `
    <div class="grid gap-4 p-4 sm:p-6">
      <p class="text-sm text-muted-foreground">${quizzes.length} quiz(zes) shown.</p>
      <div class="overflow-auto rounded-lg border border-border">
        <table class="w-full min-w-176 text-sm">
          <thead class="[&_tr]:border-b">
            <tr class="hover:bg-muted/50 border-b transition-colors">
              <th class="${tableCell()} text-left font-medium">Quiz</th>
              <th class="${tableCell()} text-left font-medium">Engine</th>
              <th class="${tableCell()} text-left font-medium">Questions from</th>
              <th class="${tableCell()} text-right font-medium">Questions</th>
              <th class="${tableCell()} text-right font-medium">Banks</th>
              <th class="${tableCell()} text-right font-medium">Points</th>
              <th class="${tableCell()} text-left font-medium">Group</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <h3 class="text-sm font-medium">Families</h3>
      <p class="text-xs text-muted-foreground">
        Quizzes that are set up the same way. The export writes one row per family.
      </p>
      <div class="grid gap-3">${families}</div>
      <h3 class="text-sm font-medium">Comparison groups</h3>
      <div class="grid gap-6">${groups}</div>
      <div id="review-detail" class="min-h-64 rounded-lg border border-border"></div>
    </div>
  `;
}

/** The rubrics, as a table. */
function renderRubrics(): string {
  const review = state.review;
  if (!review) return "";

  const query = state.search.trim().toLowerCase();

  const rubrics = review.rubrics
    .filter((entry) => query === "" || entry.rubric.title.toLowerCase().includes(query))
    .sort((a, b) => naturalCompare(a.rubric.title, b.rubric.title));

  const rows = rubrics
    .map((entry) => {
      const attached = entry.attachedTo.map((assessment) => assessment.title).join("; ");

      return `<tr class="${tableRow()}">
        <td class="${tableCell()} max-w-96 truncate font-medium">${esc(entry.rubric.title)}</td>
        <td class="${tableCell()} text-right">${esc(formatPoints(entry.rubric.pointsPossible))}</td>
        <td class="${tableCell()} text-right">${entry.rubric.criteria.length}</td>
        <td class="${tableCell()} max-w-72 truncate">${esc(attached || "no attachment found")}</td>
        <td class="${tableCell()} text-right">${entry.duplicates.length}</td>
      </tr>`;
    })
    .join("");

  return `
    <div class="grid gap-3 p-4 sm:p-6">
      <p class="text-sm text-muted-foreground">${rubrics.length} of ${review.rubrics.length} rubrics shown.</p>
      <div class="overflow-auto rounded-lg border border-border">
        <table class="w-full min-w-176 text-sm">
          <thead class="[&_tr]:border-b">
            <tr class="hover:bg-muted/50 border-b transition-colors">
              <th class="${tableCell()} text-left font-medium">Rubric</th>
              <th class="${tableCell()} text-right font-medium">Points</th>
              <th class="${tableCell()} text-right font-medium">Criteria</th>
              <th class="${tableCell()} text-left font-medium">Attached to</th>
              <th class="${tableCell()} text-right font-medium">Copies</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}

/** The gradebook structure. */
function renderGradebook(): string {
  const review = state.review;
  if (!review) return "";

  const rows = review.groups
    .map(
      (group) => `
        <tr class="${tableRow()}">
          <td class="${tableCell()} font-medium">${esc(group.title)}</td>
          <td class="${tableCell()} text-right">${esc(formatPoints(group.weight))}%</td>
          <td class="${tableCell()} text-right">${group.assessments.length}</td>
          <td class="${tableCell()} text-right">${esc(formatPoints(group.pointsTotal))}</td>
          <td class="${tableCell()} text-right">${group.pointsShare.toFixed(1)}%</td>
          <td class="${tableCell()} max-w-96 truncate">${esc(group.assessments.map((a) => a.title).join("; ") || "—")}</td>
        </tr>
      `,
    )
    .join("");

  return `
    <div class="grid gap-3 p-4 sm:p-6">
      <p class="text-sm text-muted-foreground">
        ${
          review.weighting === "percent"
            ? "The course is weighted by percentage."
            : review.weighting === "points"
              ? "The course is weighted by points."
              : "The course has no group weights recorded."
        }
      </p>
      <div class="overflow-auto rounded-lg border border-border">
        <table class="w-full min-w-176 text-sm">
          <thead class="[&_tr]:border-b">
            <tr class="hover:bg-muted/50 border-b transition-colors">
              <th class="${tableCell()} text-left font-medium">Group</th>
              <th class="${tableCell()} text-right font-medium">Weight</th>
              <th class="${tableCell()} text-right font-medium">Items</th>
              <th class="${tableCell()} text-right font-medium">Points</th>
              <th class="${tableCell()} text-right font-medium">Share of points</th>
              <th class="${tableCell()} text-left font-medium">Items</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}

/** The findings. */
function renderFlags(): string {
  const sections = PRIORITIES.map((priority) => {
    const findings = state.findings.filter((finding) => priorityOf(finding) === priority);
    if (findings.length === 0) return "";

    return `
      <section class="grid gap-2">
        <h3 class="text-sm font-medium">${esc(priority[0].toUpperCase() + priority.slice(1))} priority (${findings.length})</h3>
        ${findings
          .map(
            (finding) => `
              <article class="grid gap-2 rounded-lg border border-border p-3">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="${badgeClasses({ variant: priorityVariant(finding), size: "sm" })}">${esc(priorityOf(finding))}</span>
                  <span class="${badgeClasses({ variant: "outline", size: "sm" })}">${esc(finding.check)}</span>
                  <span class="text-xs text-muted-foreground">${esc(FAMILY_LABELS[finding.family])}</span>
                  <span class="text-xs text-muted-foreground">${esc(finding.confidence)} confidence</span>
                </div>
                <p class="text-sm font-medium">${esc(finding.statement)}</p>
                <dl class="grid gap-1 text-xs">
                  ${finding.values
                    .map(
                      (value) => `
                        <div class="flex flex-wrap gap-x-2">
                          <dt class="text-muted-foreground">${esc(value.label)}:</dt>
                          <dd>${esc(value.value)} <span class="text-muted-foreground">(${esc(value.source)})</span></dd>
                        </div>
                      `,
                    )
                    .join("")}
                </dl>
                ${finding.notes.length > 0 ? `<ul class="grid gap-0.5 text-xs text-muted-foreground">${finding.notes.map((note) => `<li>— ${esc(note)}</li>`).join("")}</ul>` : ""}
                <p class="text-xs text-muted-foreground">${esc(finding.priorityReason)}</p>
                <div class="flex flex-wrap items-center gap-2">
                  ${PRIORITIES.map(
                    (option) => `
                      <button type="button" class="rounded border border-border px-2 py-0.5 text-xs ${priorityOf(finding) === option ? "bg-primary text-primary-foreground" : "text-muted-foreground"}" data-priority="${esc(finding.id)}" data-value="${esc(option)}">
                        ${esc(option)}
                      </button>
                    `,
                  ).join("")}
                </div>
              </article>
            `,
          )
          .join("")}
      </section>
    `;
  }).join("");

  return `<div class="grid gap-6 p-4 sm:p-6">${sections || `<p class="text-sm text-muted-foreground">No findings.</p>`}</div>`;
}

/** The badge colour for a finding's priority. */
function priorityVariant(finding: { suggestedPriority: string }): "error" | "warning" | "secondary" {
  const priority = priorityOf(finding as never);
  if (priority === "high") return "error";
  if (priority === "medium") return "warning";
  return "secondary";
}

/** Let the reviewer change a finding's priority. */
function wireDetail(): void {
  const panel = byId("review-panel");

  panel.querySelectorAll<HTMLElement>("[data-item]").forEach((element) => {
    element.addEventListener("click", () => {
      state.selectedId = element.dataset.item ?? null;
      renderDetail();
    });
  });

  panel.querySelectorAll<HTMLButtonElement>("[data-priority]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const id = button.dataset.priority;
      const value = button.dataset.value;
      if (!id || !value) return;

      state.overrides.priorities.set(id, value as never);
      renderPanel();
    });
  });

  // The reviewer can move a quiz into a different comparison group.
  panel.querySelectorAll<HTMLSelectElement>("[data-move]").forEach((select) => {
    select.addEventListener("change", (event) => {
      event.stopPropagation();
      const quizId = select.dataset.move;
      if (!quizId) return;

      state.overrides.quizGroups.set(quizId, select.value);
      quizMoved();
    });
  });
}

/** Called when the reviewer moves a quiz between comparison groups. */
let quizMoved: () => void = () => {};

/** Let the controller know the reviewer moved a quiz. */
export function onQuizMoved(handler: () => void): void {
  quizMoved = handler;
}

/** Draw the detail pane for the selected item. */
export function renderDetail(): void {
  const container = byId("review-detail");
  if (!container) return;

  const review = state.review;
  if (!review) return;

  const assessment = review.assessments.find((entry) => entry.id === state.selectedId);

  if (!assessment) {
    container.innerHTML = `
      <div class="grid gap-2 p-6 text-center text-sm text-muted-foreground">
        <p>Choose an item to see its settings, instructions, and rubric.</p>
      </div>
    `;
    return;
  }

  const rubric = review.rubrics.find((entry) => entry.rubric.id === assessment.rubricId)?.rubric;
  const usage = review.usage.byId.get(assessment.id);
  const findings = state.findings.filter((finding) => finding.affected.includes(assessment.id));

  container.innerHTML = `
    <div class="grid gap-4 p-4 sm:p-6">
      <div class="grid gap-2">
        <h3 class="text-lg font-semibold">${esc(assessment.title)}</h3>
        <div class="flex flex-wrap items-center gap-2">
          <span class="${badgeClasses({ variant: "outline", size: "sm" })}">${esc(ASSESSMENT_KIND_LABELS[assessment.kind])}</span>
          ${assessment.moduleTitle ? `<span class="${badgeClasses({ variant: "secondary", size: "sm" })}">${esc(assessment.moduleTitle)}</span>` : ""}
          ${usage ? `<span class="${badgeClasses({ variant: "secondary", size: "sm" })}">${esc(usageLabel(usage.state))}</span>` : ""}
          <span class="${badgeClasses({ variant: "secondary", size: "sm" })}">${esc(formatPoints(assessment.pointsPossible))} points</span>
        </div>
        ${usage ? `<p class="text-xs text-muted-foreground">${esc(usage.reasons.join("; "))}</p>` : ""}
      </div>

      ${
        assessment.quiz
          ? `<div class="grid gap-1">
               <span class="text-xs font-medium text-muted-foreground">Quiz settings</span>
               <dl class="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                 ${QUIZ_SETTINGS.map((setting) => {
                   const value = setting.read(assessment.quiz!);
                   return `<div class="flex justify-between gap-3 border-b border-border/60 py-1">
                     <dt class="text-muted-foreground">${esc(setting.label)}</dt>
                     <dd class="text-right">${esc(value ?? "not in export")}</dd>
                   </div>`;
                 }).join("")}
               </dl>
             </div>`
          : ""
      }

      <div class="grid gap-1">
        <span class="text-xs font-medium text-muted-foreground">Instructions</span>
        ${
          assessment.instructions.trim() === ""
            ? `<p class="text-sm text-muted-foreground">Not in the export.</p>`
            : `<div class="max-h-96 overflow-auto rounded-md border border-border p-3 text-sm whitespace-pre-wrap">${esc(assessment.instructions)}</div>`
        }
      </div>

      ${
        rubric
          ? `<div class="grid gap-1">
               <span class="text-xs font-medium text-muted-foreground">Rubric — ${esc(rubric.title)} (${esc(formatPoints(rubric.pointsPossible))} points)</span>
               <div class="grid gap-2">
                 ${rubric.criteria
                   .map(
                     (criterion) => `
                       <div class="rounded-md border border-border p-3">
                         <p class="text-sm font-medium">${esc(criterion.description || "(unnamed criterion)")} — ${esc(formatPoints(criterion.points))} points</p>
                         ${criterion.longDescription ? `<p class="mt-1 text-xs text-muted-foreground">${esc(criterion.longDescription)}</p>` : ""}
                         <ul class="mt-2 grid gap-1 text-xs">
                           ${criterion.ratings
                             .map(
                               (rating) => `
                                 <li class="flex flex-wrap gap-x-2">
                                   <span class="font-medium">${esc(rating.description || "(unnamed level)")}</span>
                                   <span class="text-muted-foreground">${esc(formatPoints(rating.points))} points</span>
                                   ${rating.longDescription ? `<span class="w-full text-muted-foreground">${esc(rating.longDescription)}</span>` : ""}
                                 </li>
                               `,
                             )
                             .join("")}
                         </ul>
                       </div>
                     `,
                   )
                   .join("")}
               </div>
             </div>`
          : ""
      }

      ${
        findings.length > 0
          ? `<div class="grid gap-1">
               <span class="text-xs font-medium text-muted-foreground">Findings</span>
               <ul class="grid gap-2">
                 ${findings
                   .map(
                     (finding) => `
                       <li class="rounded-md border border-border p-3 text-sm">
                         <div class="flex flex-wrap items-center gap-2">
                           <span class="${badgeClasses({ variant: priorityVariant(finding), size: "sm" })}">${esc(priorityOf(finding))}</span>
                           <span class="${badgeClasses({ variant: "outline", size: "sm" })}">${esc(finding.check)}</span>
                           <span class="text-xs text-muted-foreground">${esc(finding.confidence)} confidence</span>
                         </div>
                         <p class="mt-1">${esc(finding.statement)}</p>
                         <ul class="mt-1 grid gap-0.5 text-xs text-muted-foreground">
                           ${finding.values.map((value) => `<li>${esc(value.label)}: ${esc(value.value)} <span class="opacity-70">(${esc(value.source)})</span></li>`).join("")}
                         </ul>
                       </li>
                     `,
                   )
                   .join("")}
               </ul>
             </div>`
          : ""
      }
    </div>
  `;
}
