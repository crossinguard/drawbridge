/**
 * The QA audit: what a reviewer would otherwise have to click through to find.
 *
 * Every check reads only from the parsed course, so the findings are the same
 * whether the export arrived as an archive or as a folder.
 */
import { bankSelections, summariseQuestions } from "@/lib/canvas/quiz";
import type { ProcessedContent } from "@/lib/canvas/content";
import type { CourseExport, CourseItem } from "@/lib/canvas/types";

/** How serious a finding is. */
export type FindingSeverity = "info" | "warning" | "error";

/** A group of related findings. */
export interface FindingCategory {
  id: string;
  label: string;
}

/** The finding categories, in the order they are shown. */
export const FINDING_CATEGORIES: readonly FindingCategory[] = [
  { id: "structure", label: "Structure" },
  { id: "publish-state", label: "Publish state" },
  { id: "content", label: "Content" },
  { id: "links", label: "Links & references" },
  { id: "grading", label: "Grading & submissions" },
  { id: "quizzes", label: "Quizzes" },
  { id: "settings", label: "Course settings" },
];

/** One thing worth looking at. */
export interface Finding {
  id: string;
  category: string;
  title: string;
  severity: FindingSeverity;
  /** A sentence explaining the finding. */
  detail: string;
  /** The items this finding is about, so the reviewer can jump to them. */
  itemIds: string[];
  /** Extra lines: URLs, setting values, counts. */
  notes: string[];
}

/** What the audit reads. */
export interface AuditInput {
  course: CourseExport;
  /** Processed body content, keyed by item id. */
  content: Map<string, ProcessedContent>;
}

/** Body text shorter than this is treated as an empty assignment. */
const EMPTY_BODY_LIMIT = 40;

/** Find everything a reviewer would want to know. */
export function auditCourse({ course, content }: AuditInput): Finding[] {
  const findings: Finding[] = [];

  findings.push(...auditStructure(course));
  findings.push(...auditPublishState(course));
  findings.push(...auditContent(course, content));
  findings.push(...auditLinks(course, content));
  findings.push(...auditGrading(course));
  findings.push(...auditQuizzes(course));
  findings.push(...auditSettings(course));

  return findings;
}

/** Every piece of content, whether or not a module points at it. */
function allItems(course: CourseExport): CourseItem[] {
  return [...course.items, ...course.orphans];
}

/** Content that is missing, orphaned, or pointing nowhere. */
function auditStructure(course: CourseExport): Finding[] {
  const findings: Finding[] = [];

  const unresolved = course.items.filter((item) => item.unresolved && item.moduleId);
  if (unresolved.length > 0) {
    findings.push({
      id: "unresolved-items",
      category: "structure",
      title: `${unresolved.length} module item${unresolved.length === 1 ? " points" : "s point"} at content that is not in the export`,
      severity: "error",
      detail:
        "These items appear in a module, but the cartridge manifest has nothing for them. They will not be part of the imported course.",
      itemIds: unresolved.map((item) => item.id),
      notes: unresolved.map((item) => `${item.title} — ${item.moduleTitle ?? ""}`.trim()),
    });
  }

  const orphans = course.orphans.filter((item) => item.kind !== "file");
  if (orphans.length > 0) {
    const byKind = countBy(orphans, (item) => item.kind);
    findings.push({
      id: "orphaned-content",
      category: "structure",
      title: `${orphans.length} piece${orphans.length === 1 ? "" : "s"} of content are not in any module`,
      severity: "info",
      detail:
        "They are in the export, so they exist in Canvas, but no module points at them. They are invisible to students unless the course's home page links to them.",
      itemIds: orphans.map((item) => item.id),
      notes: Object.entries(byKind).map(([kind, count]) => `${count} ${kind}`),
    });
  }

  const emptyModules = course.modules.filter((module) => module.items.length === 0);
  if (emptyModules.length > 0) {
    findings.push({
      id: "empty-modules",
      category: "structure",
      title: `${emptyModules.length} module${emptyModules.length === 1 ? " has" : "s have"} no items`,
      severity: "info",
      detail: "An empty module shows up in the module list but leads nowhere.",
      itemIds: [],
      notes: emptyModules.map((module) => module.title),
    });
  }

  const hiddenFiles = course.files.filter((file) => file.hidden);
  if (hiddenFiles.length > 0) {
    findings.push({
      id: "hidden-files",
      category: "structure",
      title: `${hiddenFiles.length} file${hiddenFiles.length === 1 ? " is" : "s are"} marked hidden in Canvas`,
      severity: "info",
      detail: "Hidden files are not listed in the course files, but they are still part of the export.",
      itemIds: [],
      notes: hiddenFiles.slice(0, 10).map((file) => file.displayName),
    });
  }

  return findings;
}

/** What is published and what is not. */
function auditPublishState(course: CourseExport): Finding[] {
  const findings: Finding[] = [];

  const unpublishedModules = course.modules.filter((module) => module.state === "unpublished");
  if (unpublishedModules.length > 0) {
    findings.push({
      id: "unpublished-modules",
      category: "publish-state",
      title: `${unpublishedModules.length} of ${course.modules.length} modules are unpublished`,
      severity: "warning",
      detail: "Students cannot see these modules. Check whether that is deliberate.",
      itemIds: [],
      notes: unpublishedModules.map((module) => module.title),
    });
  }

  const unpublishedItems = course.items.filter((item) => item.state === "unpublished");
  if (unpublishedItems.length > 0) {
    const byModule = countBy(unpublishedItems, (item) => item.moduleTitle ?? "Unassigned");
    findings.push({
      id: "unpublished-items",
      category: "publish-state",
      title: `${unpublishedItems.length} of ${course.items.length} module items are unpublished`,
      severity: "warning",
      detail: "These items are listed in a module but are not published, so students cannot open them.",
      itemIds: unpublishedItems.map((item) => item.id),
      notes: Object.entries(byModule)
        .sort((a, b) => b[1] - a[1])
        .map(([module, count]) => `${count} in ${module}`),
    });
  }

  const lockedModules = course.modules.filter((module) => module.state === "locked");
  if (lockedModules.length > 0) {
    findings.push({
      id: "locked-modules",
      category: "publish-state",
      title: `${lockedModules.length} module${lockedModules.length === 1 ? " is" : "s are"} locked`,
      severity: "info",
      detail: "Locked modules cannot be changed until they are unlocked.",
      itemIds: [],
      notes: lockedModules.map((module) => module.title),
    });
  }

  return findings;
}

/** Pages and assignments with nothing in them. */
function auditContent(course: CourseExport, content: Map<string, ProcessedContent>): Finding[] {
  const findings: Finding[] = [];

  const empty: { item: CourseItem; length: number }[] = [];

  for (const item of [...course.items, ...course.orphans]) {
    if (item.kind === "file" || item.kind === "external-url" || item.kind === "external-tool") continue;
    if (!item.bodyPath) continue;

    const text = content.get(item.id)?.text ?? "";
    if (text.length < EMPTY_BODY_LIMIT) empty.push({ item, length: text.length });
  }

  if (empty.length > 0) {
    findings.push({
      id: "empty-content",
      category: "content",
      title: `${empty.length} item${empty.length === 1 ? " has" : "s have"} almost no content`,
      severity: "warning",
      detail: `The body of these items is under ${EMPTY_BODY_LIMIT} characters once the HTML is stripped. They may be placeholders that were never filled in.`,
      itemIds: empty.map((entry) => entry.item.id),
      notes: empty.map((entry) => `${entry.item.title} (${entry.length} characters)`),
    });
  }

  const pages = allItems(course).filter((item) => item.kind === "page");
  const frontPages = pages.filter((item) => item.page?.frontPage);
  if (pages.length > 0 && frontPages.length === 0) {
    findings.push({
      id: "no-front-page",
      category: "content",
      title: "No page is marked as the course front page",
      severity: "warning",
      detail: "The front page is what students see first when they open the course.",
      itemIds: [],
      notes: [],
    });
  }

  return findings;
}

/** Where the content points. */
function auditLinks(course: CourseExport, content: Map<string, ProcessedContent>): Finding[] {
  const findings: Finding[] = [];

  const externalByHost = new Map<string, { count: number; urls: Set<string>; itemIds: Set<string> }>();
  const apiReferences = new Set<string>();
  const externalImageItems = new Set<string>();
  let apiCount = 0;
  let externalImageCount = 0;

  for (const item of [...course.items, ...course.orphans]) {
    const processed = content.get(item.id);
    if (!processed) continue;

    apiCount += processed.apiReferenceCount;
    if (processed.apiReferenceCount > 0) apiReferences.add(item.id);

    for (const link of processed.links) {
      if (link.kind === "external") {
        const host = link.host ?? "unknown";
        const entry = externalByHost.get(host) ?? { count: 0, urls: new Set<string>(), itemIds: new Set<string>() };
        entry.count++;
        entry.urls.add(link.href);
        entry.itemIds.add(item.id);
        externalByHost.set(host, entry);
      }

      // Images that live outside the cartridge are dropped when the content is
      // shown, because loading them would make a request to a third party.
      if (link.isImage && link.kind !== "internal-file") {
        externalImageCount++;
        externalImageItems.add(item.id);
      }
    }
  }

  if (externalByHost.size > 0) {
    const hosts = Array.from(externalByHost.entries()).sort((a, b) => b[1].count - a[1].count);
    const total = hosts.reduce((sum, [, entry]) => sum + entry.count, 0);

    findings.push({
      id: "external-links",
      category: "links",
      title: `${total} link${total === 1 ? "" : "s"} point outside the course`,
      severity: "info",
      detail: "These are the places where the course depends on something that is not part of the export.",
      itemIds: Array.from(new Set(hosts.flatMap(([, entry]) => Array.from(entry.itemIds)))),
      notes: hosts.map(([host, entry]) => `${entry.count} × ${host}`),
    });
  }

  if (apiCount > 0) {
    findings.push({
      id: "canvas-api-references",
      category: "links",
      title: `${apiCount} reference${apiCount === 1 ? "" : "s"} to the source Canvas instance remain in the content`,
      severity: "info",
      detail:
        "Canvas records the address of its own API on many elements. They are removed when the content is shown here, and they do not work in an imported course either.",
      itemIds: Array.from(apiReferences),
      notes: [],
    });
  }

  if (externalImageCount > 0) {
    findings.push({
      id: "external-images",
      category: "links",
      title: `${externalImageCount} image${externalImageCount === 1 ? " is" : "s are"} hosted outside the export`,
      severity: "warning",
      detail:
        "Images that are not part of the export are not shown here, because showing them would send a request to another site. They will also be missing in an offline copy of the course.",
      itemIds: Array.from(externalImageItems),
      notes: [],
    });
  }

  return findings;
}

/** How the course is graded. */
function auditGrading(course: CourseExport): Finding[] {
  const findings: Finding[] = [];

  const zeroWeight = course.assignmentGroups.filter((group) => group.weight === 0);
  if (course.assignmentGroups.length > 0 && zeroWeight.length === course.assignmentGroups.length) {
    findings.push({
      id: "zero-weight-groups",
      category: "grading",
      title: `All ${course.assignmentGroups.length} assignment groups are weighted 0%`,
      severity: "warning",
      detail:
        "No assignment group contributes to the final grade. The course may be using points instead of weights, which is worth confirming.",
      itemIds: [],
      notes: course.assignmentGroups.map((group) => `${group.title}: ${group.weight}%`),
    });
  } else if (zeroWeight.length > 0) {
    findings.push({
      id: "some-zero-weight-groups",
      category: "grading",
      title: `${zeroWeight.length} assignment group${zeroWeight.length === 1 ? " is" : "s are"} weighted 0%`,
      severity: "info",
      detail: "These groups do not contribute to the final grade.",
      itemIds: [],
      notes: zeroWeight.map((group) => group.title),
    });
  }

  const withoutDueDate = allItems(course).filter(
    (item) => item.kind === "assignment" && item.assignment && !item.assignment.dueAt,
  );
  if (withoutDueDate.length > 0) {
    findings.push({
      id: "assignments-without-due-date",
      category: "grading",
      title: `${withoutDueDate.length} assignment${withoutDueDate.length === 1 ? " has" : "s have"} no due date`,
      severity: "info",
      detail: "An assignment without a due date stays open until the end of the course.",
      itemIds: withoutDueDate.map((item) => item.id),
      notes: [],
    });
  }

  const omitted = allItems(course).filter((item) => item.assignment?.omitFromFinalGrade);
  if (omitted.length > 0) {
    findings.push({
      id: "omitted-from-final-grade",
      category: "grading",
      title: `${omitted.length} assignment${omitted.length === 1 ? " is" : "s are"} excluded from the final grade`,
      severity: "info",
      detail: "These assignments are still given, but they do not count towards the final grade.",
      itemIds: omitted.map((item) => item.id),
      notes: omitted.map((item) => item.title),
    });
  }

  const withoutPoints = allItems(course).filter(
    (item) => item.kind === "assignment" && item.assignment && !item.assignment.pointsPossible,
  );
  if (withoutPoints.length > 0) {
    findings.push({
      id: "assignments-without-points",
      category: "grading",
      title: `${withoutPoints.length} assignment${withoutPoints.length === 1 ? " has" : "s have"} no point value`,
      severity: "info",
      detail: "An assignment with no points does not affect the grade.",
      itemIds: withoutPoints.map((item) => item.id),
      notes: withoutPoints.map((item) => item.title),
    });
  }

  return findings;
}

/** How the quizzes are set up. */
function auditQuizzes(course: CourseExport): Finding[] {
  const findings: Finding[] = [];

  const quizzes = allItems(course).filter((item) => item.kind === "quiz");

  const withAccessCode = quizzes.filter((item) => item.quiz?.accessCode);
  if (withAccessCode.length > 0) {
    findings.push({
      id: "quiz-access-codes",
      category: "quizzes",
      title: `${withAccessCode.length} quiz${withAccessCode.length === 1 ? " has" : "s have"} a shared access code`,
      severity: "error",
      detail:
        "An access code is part of the quiz settings and travels with the export. Anyone holding the export file has the code, so it is no longer a secret.",
      itemIds: withAccessCode.map((item) => item.id),
      notes: withAccessCode.map((item) => item.title),
    });
  }

  // A quiz with no questions of its own may still draw them from a bank.
  const empty = quizzes.filter((item) => item.quiz && !summariseQuestions(item.quiz).hasQuestions);
  if (empty.length > 0) {
    findings.push({
      id: "quizzes-without-questions",
      category: "quizzes",
      title: `${empty.length} quiz${empty.length === 1 ? " has" : "s have"} no questions`,
      severity: "error",
      detail:
        "The quiz settings were exported, but no question content came with them — neither questions inside the quiz nor a draw from an item bank.",
      itemIds: empty.map((item) => item.id),
      notes: empty.map((item) => item.title),
    });
  }

  const drawn = quizzes.filter((item) => (item.quiz?.drawnCount ?? 0) > 0);
  if (drawn.length > 0) {
    findings.push({
      id: "quizzes-drawn-from-banks",
      category: "quizzes",
      title: `${drawn.length} quiz${drawn.length === 1 ? " draws" : " draw"} its questions from item banks`,
      severity: "info",
      detail:
        "These quizzes have no questions of their own. The export records which bank each group of questions comes from and what each question is worth, but the questions themselves live in the bank.",
      itemIds: drawn.map((item) => item.id),
      notes: drawn.map((item) => {
        const quiz = item.quiz!;
        const banks = bankSelections(quiz);
        const total = banks.reduce((sum, selection) => sum + (selection.count ?? 0), 0);
        return `${item.title} — ${total} question${total === 1 ? "" : "s"} from ${banks.length} bank${banks.length === 1 ? "" : "s"}`;
      }),
    });
  }

  const unknownCount = quizzes.filter((item) => item.quiz?.selectionCountUnknown);
  if (unknownCount.length > 0) {
    findings.push({
      id: "quizzes-with-unknown-question-count",
      category: "quizzes",
      title: `${unknownCount.length} quiz${unknownCount.length === 1 ? " does" : "s do"} not say how many questions are drawn`,
      severity: "info",
      detail:
        "The export records a draw from a bank without saying how many questions it takes, so the quiz's points cannot be worked out from the export alone.",
      itemIds: unknownCount.map((item) => item.id),
      notes: unknownCount.map((item) => item.title),
    });
  }

  const unlimited = quizzes.filter((item) => (item.quiz?.allowedAttempts ?? 0) < 0);
  if (unlimited.length > 0) {
    findings.push({
      id: "unlimited-attempts",
      category: "quizzes",
      title: `${unlimited.length} quiz${unlimited.length === 1 ? " allows" : "s allow"} unlimited attempts`,
      severity: "info",
      detail: "Students can keep retrying these quizzes.",
      itemIds: unlimited.map((item) => item.id),
      notes: unlimited.map((item) => item.title),
    });
  }

  const lockdown = quizzes.filter((item) => item.quiz?.lockdownBrowser);
  if (lockdown.length > 0) {
    findings.push({
      id: "lockdown-browser",
      category: "quizzes",
      title: `${lockdown.length} quiz${lockdown.length === 1 ? " requires" : "s require"} lockdown browser`,
      severity: "info",
      detail: "Students need the Canvas Desktop app to take these quizzes.",
      itemIds: lockdown.map((item) => item.id),
      notes: lockdown.map((item) => item.title),
    });
  }

  return findings;
}

/** The course's own settings. */
function auditSettings(course: CourseExport): Finding[] {
  const findings: Finding[] = [];
  const settings = course.settings;

  const visibility: string[] = [];
  if (settings.is_public === "true") visibility.push("public");
  if (settings.is_public_to_auth_users === "true") visibility.push("visible to signed-in users");
  if (settings.self_enrollment === "true") visibility.push("self-enrolling");

  if (visibility.length > 0) {
    findings.push({
      id: "course-visibility",
      category: "settings",
      title: `The course is ${visibility.join(", ")}`,
      severity: settings.self_enrollment === "true" ? "warning" : "info",
      detail: "Check that this matches what was intended before the course is shared.",
      itemIds: [],
      notes: [],
    });
  }

  if (settings.hide_final_grade === "true") {
    findings.push({
      id: "hidden-final-grade",
      category: "settings",
      title: "The final grade is hidden from students",
      severity: "info",
      detail: "Students see their current total but not what their final grade would be.",
      itemIds: [],
      notes: [],
    });
  }

  if (settings.license && settings.license !== "private") {
    findings.push({
      id: "course-licence",
      category: "settings",
      title: `The course licence is "${settings.license}"`,
      severity: "info",
      detail: "A course licence other than private lets students see the licence and copyright terms.",
      itemIds: [],
      notes: [],
    });
  }

  if (!course.meta.imagePath) {
    findings.push({
      id: "no-course-image",
      category: "settings",
      title: "The course has no card image",
      severity: "info",
      detail: "Courses without an image show a plain tile in the Canvas dashboard and course list.",
      itemIds: [],
      notes: [],
    });
  }

  const policy = course.latePolicy;
  if (policy?.missingSubmissionDeductionEnabled || policy?.lateSubmissionDeductionEnabled) {
    const notes: string[] = [];
    if (policy.missingSubmissionDeductionEnabled) {
      notes.push(`Missing submission: −${policy.missingSubmissionDeduction}%`);
    }
    if (policy.lateSubmissionDeductionEnabled) {
      notes.push(`Late submission: −${policy.lateSubmissionDeduction}% per ${policy.lateSubmissionInterval ?? "day"}`);
    }
    if (policy.lateSubmissionMinimumPercentEnabled) {
      notes.push(`Late work still scores at least ${policy.lateSubmissionMinimumPercent}%`);
    }

    findings.push({
      id: "late-policy",
      category: "settings",
      title: "The course applies a late submission penalty",
      severity: "info",
      detail: "These are the deductions students see on every overdue assignment.",
      itemIds: [],
      notes,
    });
  }

  return findings;
}

/** Count items by a derived value. */
function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const value = key(item);
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

/** The severity of a finding, most serious first. */
export const SEVERITY_ORDER: Record<FindingSeverity, number> = { error: 0, warning: 1, info: 2 };

/** Sort findings by severity, then by category. */
export function sortFindings(findings: Finding[]): Finding[] {
  const order = FINDING_CATEGORIES.map((category) => category.id);
  return [...findings].sort((a, b) => {
    const severity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (severity !== 0) return severity;
    return order.indexOf(a.category) - order.indexOf(b.category);
  });
}
