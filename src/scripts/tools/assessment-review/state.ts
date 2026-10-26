/**
 * The state of the Canvas assessment review.
 *
 * Everything lives in memory. Nothing is stored, and nothing is sent
 * anywhere.
 */
import type { ProcessedContent } from "@/lib/canvas/content";
import type { FileStore } from "@/lib/canvas/store";
import type { CourseExport } from "@/lib/canvas/types";

import type { Finding, Priority, ReviewRules } from "@/lib/tools/assessment-review/findings";
import { DEFAULT_RULES } from "@/lib/tools/assessment-review/findings";
import type { QuizComparisonGroup } from "@/lib/tools/assessment-review/checks/quizzes";
import type { AssessmentReview } from "@/lib/tools/assessment-review/model";
import type { ReviewOverrides } from "@/lib/tools/assessment-review/prep-file";

/** Which view the review step shows. */
export type ReviewTab = "overview" | "modules" | "assessments" | "quizzes" | "rubrics" | "gradebook" | "flags";

/** The tabs, in order. */
export const REVIEW_TABS: { id: ReviewTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "modules", label: "Modules" },
  { id: "assessments", label: "Assessments" },
  { id: "quizzes", label: "Quizzes" },
  { id: "rubrics", label: "Rubrics" },
  { id: "gradebook", label: "Gradebook" },
  { id: "flags", label: "Findings" },
];

/** Which kinds of assessment the review shows. */
export type KindFilter = "all" | "assignment" | "quiz" | "graded-discussion";

/** Which usage states the review shows. */
export type UsageFilter = "all" | "in-use" | "probably-legacy" | "unclear";

export interface AppState {
  /** The opened cartridge. */
  store: FileStore | null;
  /** The parsed course. */
  course: CourseExport | null;
  /** Processed body content, keyed by item id. */
  content: Map<string, ProcessedContent>;
  /** The review model. */
  review: AssessmentReview | null;
  /** The findings, most urgent first. */
  findings: Finding[];
  /** The quiz comparison groups. */
  groups: QuizComparisonGroup[];
  /** The rules the review applies. */
  rules: ReviewRules;
  /** What the reviewer changed. */
  overrides: ReviewOverrides;
  /** The current view. */
  tab: ReviewTab;
  /** The current search text. */
  search: string;
  kindFilter: KindFilter;
  usageFilter: UsageFilter;
  groupFilter: string;
  /** The item shown in the detail pane. */
  selectedId: string | null;
}

export const state: AppState = {
  store: null,
  course: null,
  content: new Map(),
  review: null,
  findings: [],
  groups: [],
  rules: { ...DEFAULT_RULES },
  overrides: { priorities: new Map(), quizGroups: new Map() },
  tab: "overview",
  search: "",
  kindFilter: "all",
  usageFilter: "all",
  groupFilter: "all",
  selectedId: null,
};

/** Clear everything, so a different course can be opened. */
export function resetState(): void {
  state.store = null;
  state.course = null;
  state.content = new Map();
  state.review = null;
  state.findings = [];
  state.groups = [];
  state.overrides = { priorities: new Map(), quizGroups: new Map() };
  state.tab = "overview";
  state.search = "";
  state.kindFilter = "all";
  state.usageFilter = "all";
  state.groupFilter = "all";
  state.selectedId = null;
}

/** The priority a finding ends up with, after the reviewer's changes. */
export function priorityOf(finding: Finding): Priority {
  return state.overrides.priorities.get(finding.id) ?? finding.suggestedPriority;
}
