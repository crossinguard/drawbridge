/**
 * What is part of the course, and what is left over.
 *
 * Courses accumulate: old rubrics, copied assignments, unused groups,
 * unpublished drafts. None of it affects learners, but all of it confuses a
 * reviewer and hides real problems. This module sorts the course into three
 * states — in use, probably legacy, unclear — and always says why.
 */
import type { CourseItem, CourseExport, Rubric } from "@/lib/canvas/types";

import { naturalCompare } from "@/lib/utils";

import { rubricSignature, type ModuleRef } from "@/lib/tools/assessment-review/model";

/** How a piece of content seems to be used. */
export type UsageState = "in-use" | "probably-legacy" | "unclear";

/** The human-readable names for the states. */
export const USAGE_STATE_LABELS: Record<UsageState, string> = {
  "in-use": "In use",
  "probably-legacy": "Probably legacy",
  unclear: "Unclear",
};

/** What kind of thing is being classified. */
export type UsageKind = "assessment" | "discussion" | "page" | "rubric" | "group" | "module";

/** One piece of content, and what seems to be happening to it. */
export interface UsageClassification {
  /** The course item's identifier, or the rubric or group's identifier. */
  id: string;
  kind: UsageKind;
  title: string;
  state: UsageState;
  /** The signals that led to the classification. */
  reasons: string[];
  /** The module the item sits in, when it is in one. */
  moduleTitle?: string;
  /** The assessment the classification is about, when there is one. */
  assessmentId?: string;
}

/** The state of every classified thing in the course. */
export interface UsageMap {
  /** Every classified item, keyed by identifier. */
  byId: Map<string, UsageClassification>;
  /** The patterns the course's titles follow. */
  patterns: string[];
}

/** What the usage classification needs to know about the course. */
export interface UsageInput {
  course: CourseExport;
  /** The graded items, with the state of their own classification. */
  assessments: { id: string; item: CourseItem; inModule: boolean; moduleRefs: ModuleRef[] }[];
  /** The rubrics, with the items that attach them. */
  rubrics: { rubric: Rubric; attachedTo: string[] }[];
  /** The identifiers other items link to. */
  references: Map<string, string[]>;
}

/** The score at or above which something counts as in use. */
const IN_USE_SCORE = 2;
/** The score at or below which something counts as probably legacy. */
const LEGACY_SCORE = -1;

/** Classify everything in the course. */
export function classifyUsage(input: UsageInput): UsageMap {
  const patterns = coursePatterns(input.course);

  const byId = new Map<string, UsageClassification>();

  // The assessments first: the rubrics are judged against them.
  const assessmentState = new Map<string, UsageState>();

  for (const assessment of input.assessments) {
    const signals = assessSignals(assessment.item, patterns, input);
    const state = stateOf(signalScore(signals));

    assessmentState.set(assessment.id, state);

    byId.set(assessment.id, {
      id: assessment.id,
      kind: "assessment",
      title: assessment.item.title,
      state,
      reasons: signals,
      moduleTitle: assessment.item.moduleTitle,
      assessmentId: assessment.id,
    });
  }

  for (const entry of input.rubrics) {
    const signals: string[] = [];

    const attached = entry.attachedTo.filter((id) => assessmentState.get(id) === "in-use");
    const attachedToSomething = entry.attachedTo.length > 0;

    if (attached.length > 0) signals.push(`Attached to ${attached.length} item(s) that are in use`);
    if (attachedToSomething && attached.length === 0) {
      signals.push(`Attached to ${entry.attachedTo.length} item(s), none of which are in use`);
    }
    if (!attachedToSomething) signals.push("No attachment found in the export");

    if (matchesPattern(entry.rubric.title, patterns)) signals.push("The title follows the course's naming pattern");
    if (hasCopySuffix(entry.rubric.title)) signals.push("The title looks like a copy of another rubric");

    const duplicates = input.rubrics.filter(
      (other) => other.rubric.id !== entry.rubric.id && rubricSignature(other.rubric) === rubricSignature(entry.rubric),
    );
    if (duplicates.length > 0) {
      signals.push(`Identical criteria and levels to ${duplicates.length} other rubric(s)`);
    }

    byId.set(entry.rubric.id, {
      id: entry.rubric.id,
      kind: "rubric",
      title: entry.rubric.title,
      state: stateOf(rubricScore(signals)),
      reasons: signals,
    });
  }

  classifyGroups(input, byId, assessmentState);
  classifyModules(input, byId);
  classifyPages(input, byId, patterns);

  return { byId, patterns };
}

/** The signals for one assessment. */
function assessSignals(item: CourseItem, patterns: string[], input: UsageInput): string[] {
  const signals: string[] = [];

  const placement = input.assessments.find((assessment) => assessment.id === item.id);
  const moduleRefs = placement?.moduleRefs ?? [];

  if (moduleRefs.length > 0) {
    const published = moduleRefs.filter((ref) => ref.moduleState === "active");
    if (published.length > 0) {
      signals.push(
        moduleRefs.length > 1
          ? `In ${published.length} published module${published.length === 1 ? "" : "s"}`
          : "In a published module",
      );
    } else {
      signals.push(
        moduleRefs.length > 1
          ? `In ${moduleRefs.length} unpublished module${moduleRefs.length === 1 ? "" : "s"}`
          : "In an unpublished module",
      );
    }
  } else {
    signals.push("No module points at it");
  }

  if (item.assignment?.dueAt || item.quiz?.dueAt || item.discussion?.dueAt) {
    signals.push("Has a due date");
  }

  const groupId = item.assignment?.groupId ?? item.quiz?.groupId ?? item.discussion?.groupId;
  if (groupId) {
    const group = input.course.assignmentGroups.find((entry) => entry.id === groupId);
    if (group && group.weight > 0) signals.push(`Belongs to the weighted group "${group.title}"`);
  }

  if (item.assignment?.rubricId || item.quiz?.rubricId || item.discussion?.rubricId) {
    signals.push("A rubric is attached to it");
  }

  if (matchesPattern(item.title, patterns)) signals.push("The title follows the course's naming pattern");
  if (hasCopySuffix(item.title)) signals.push("The title looks like a copy of another item");

  const referenced = input.references.get(item.id) ?? [];
  if (referenced.length > 0) signals.push(`Linked to from ${referenced.length} other item(s)`);

  return signals;
}

/** The signals for a rubric, turned into a score. */
function rubricScore(signals: string[]): number {
  let score = 0;
  for (const signal of signals) {
    if (signal.startsWith("Attached to") && signal.includes("in use")) score += 3;
    else if (signal.startsWith("Attached to")) score += 0;
    else if (signal.startsWith("No attachment")) score -= 2;
    else if (signal.startsWith("Identical")) score -= 1;
    else if (signal.startsWith("The title follows")) score += 1;
  }
  return score;
}

/** The groups in the course. */
function classifyGroups(
  input: UsageInput,
  byId: Map<string, UsageClassification>,
  states: Map<string, UsageState>,
): void {
  for (const group of input.course.assignmentGroups) {
    const signals: string[] = [];

    const members = input.assessments.filter((assessment) => {
      const item = assessment.item;
      const id = item.assignment?.groupId ?? item.quiz?.groupId ?? item.discussion?.groupId;
      return id === group.id;
    });

    const inUse = members.filter((member) => states.get(member.id) === "in-use");

    if (inUse.length > 0) signals.push(`${inUse.length} of its items are in use`);
    if (members.length === 0) signals.push("No items in the group");
    if (group.weight > 0 && members.length === 0) signals.push("The group has a weight but nothing in it");
    if (group.weight === 0 && members.length === 0) signals.push("The group has no weight and nothing in it");

    let score = 0;
    if (inUse.length > 0) score += 3;
    if (members.length === 0) score -= 2;
    if (group.weight > 0 && members.length === 0) score -= 1;

    byId.set(group.id, {
      id: group.id,
      kind: "group",
      title: group.title,
      state: stateOf(score),
      reasons: signals,
    });
  }
}

/** The modules in the course. */
function classifyModules(input: UsageInput, byId: Map<string, UsageClassification>): void {
  for (const module of input.course.modules) {
    const signals: string[] = [];

    if (module.state === "active") signals.push("The module is published");
    else signals.push("The module is unpublished");
    if (module.items.length === 0) signals.push("The module has no items");

    let score = module.state === "active" ? 2 : 0;
    if (module.items.length === 0) score -= 2;

    byId.set(module.id, {
      id: module.id,
      kind: "module",
      title: module.title,
      state: stateOf(score),
      reasons: signals,
    });
  }
}

/** The pages and discussions that are not graded items. */
function classifyPages(input: UsageInput, byId: Map<string, UsageClassification>, patterns: string[]): void {
  const all = [...input.course.items, ...input.course.orphans];

  for (const item of all) {
    if (item.kind !== "page" && item.kind !== "discussion") continue;
    if (byId.has(item.id)) continue;

    const signals: string[] = [];

    if (item.moduleId) {
      signals.push(item.moduleState === "active" ? "In a published module" : "In an unpublished module");
    } else {
      signals.push("No module points at it");
    }

    if (matchesPattern(item.title, patterns)) signals.push("The title follows the course's naming pattern");
    if (hasCopySuffix(item.title)) signals.push("The title looks like a copy of another item");

    const referenced = input.references.get(item.id) ?? [];
    if (referenced.length > 0) signals.push(`Linked to from ${referenced.length} other item(s)`);

    let score = 0;
    if (item.moduleId) score += item.moduleState === "active" ? 2 : 1;
    else score -= 2;
    if (referenced.length > 0) score += 1;

    byId.set(item.id, {
      id: item.id,
      kind: item.kind === "page" ? "page" : "discussion",
      title: item.title,
      state: stateOf(score),
      reasons: signals,
      moduleTitle: item.moduleTitle,
    });
  }
}

/** Turn a set of signals into a score. */
function signalScore(signals: string[]): number {
  let total = 0;

  for (const signal of signals) {
    if (/^In \d+ published module/.test(signal)) total += 2;
    else if (/^In \d+ unpublished module/.test(signal)) total += 1;
    else if (signal.startsWith("In a published module")) total += 2;
    else if (signal.startsWith("In an unpublished module")) total += 1;
    else if (signal.startsWith("No module points")) total -= 2;
    else if (signal.startsWith("Has a due date")) total += 1;
    else if (signal.startsWith("Belongs to the weighted group")) total += 1;
    else if (signal.startsWith("A rubric is attached")) total += 1;
    else if (signal.startsWith("The title follows")) total += 1;
    else if (signal.startsWith("The title looks like a copy")) total -= 1;
    else if (signal.startsWith("Linked to from")) total += 1;
  }

  return total;
}

/** The state a score means. */
function stateOf(score: number): UsageState {
  if (score >= IN_USE_SCORE) return "in-use";
  if (score <= LEGACY_SCORE) return "probably-legacy";
  return "unclear";
}

/**
 * The patterns the course's titles follow.
 *
 * A pattern is the shape of a title with its numbers replaced, up to the first
 * dash. Patterns that cover a fair share of the course are treated as the
 * course's own.
 */
export function coursePatterns(course: CourseExport): string[] {
  const counts = new Map<string, number>();

  for (const item of course.items) {
    const pattern = titlePattern(item.title);
    counts.set(pattern, (counts.get(pattern) ?? 0) + 1);
  }

  const total = course.items.length || 1;
  const threshold = Math.max(2, Math.ceil(total * 0.1));

  return [...counts.entries()]
    .filter(([, count]) => count >= threshold)
    .map(([pattern]) => pattern)
    .sort(naturalCompare);
}

/** The shape of a title, with its numbers replaced. */
export function titlePattern(title: string): string {
  const shape = title.replace(/\d+/g, "N").replace(/\s+/g, " ").trim();
  const dash = shape.indexOf(" - ");
  return (dash === -1 ? shape : shape.slice(0, dash)).toLowerCase();
}

/** True when a title follows one of the course's patterns. */
export function matchesPattern(title: string, patterns: string[]): boolean {
  if (patterns.length === 0) return false;
  const pattern = titlePattern(title);
  return patterns.includes(pattern);
}

/** True when a title carries the suffix Canvas gives a copy. */
export function hasCopySuffix(title: string): boolean {
  return /\(\s*\d+\s*\)$/.test(title) || /\bcopy\b/i.test(title);
}
