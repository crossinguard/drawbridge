/**
 * What the review finds, and how it says it.
 *
 * The rules the review applies are the same everywhere: the tool reports what
 * the export says and what differs between two layers of it. It never decides
 * that something is wrong, and every value it mentions carries the file it
 * came from.
 */

/** How much a finding matters. */
export type Priority = "high" | "medium" | "low";

/** The check families. */
export type CheckFamily =
  /** The scoring layers: items, assignments, groups. */
  | "scoring"
  /** What is in use and what is left over. */
  | "legacy"
  /** How the quizzes are set up. */
  | "quizzes"
  /** Whether the rubrics match the instructions. */
  | "rubrics"
  /** Whether the names agree. */
  | "naming";

/** The families, in the order they are shown. */
export const FAMILY_LABELS: Record<CheckFamily, string> = {
  scoring: "Scoring layers",
  legacy: "Current and legacy",
  quizzes: "Quizzes",
  rubrics: "Rubrics and instructions",
  naming: "Naming",
};

/** The priority levels, most urgent first. */
export const PRIORITIES: readonly Priority[] = ["high", "medium", "low"];

/** One value the review compared, and where it came from. */
export interface FindingValue {
  /** What the value is, e.g. "Rubric total". */
  label: string;
  /** The value itself, as it should be shown. */
  value: string;
  /** The file the value was read from. */
  source: string;
}

/** One thing worth looking at. */
export interface Finding {
  /** A stable id, so the reviewer can point at it. */
  id: string;
  /** The check that produced it, e.g. "A2". */
  check: string;
  /** The family it belongs to. */
  family: CheckFamily;
  /** A one-line statement of what differs. */
  title: string;
  /** The values compared, and where each came from. */
  values: FindingValue[];
  /** The assessments the finding is about. */
  itemIds: string[];
  /** The priority the tool suggests. */
  suggestedPriority: Priority;
  /** Why it suggests that priority. */
  priorityReason: string;
  /** Extra context: the arithmetic, the reasons, the sources. */
  notes: string[];
  /** True when the reviewer has to resolve this. */
  needsReview: boolean;
}

/**
 * The rules the review applies.
 *
 * These are institutional: what counts as an acceptable default, and which
 * terms the institution has retired. They are configurable, and they apply to
 * every course the tool is pointed at.
 */
export interface ReviewRules {
  /**
   * What to do when the instructions say nothing about a setting.
   *
   * Shuffling answers is the usual expectation; the time limit and the
   * number of attempts are usually left alone.
   */
  defaults: {
    /** Whether answers should be shuffled when the instructions are silent. */
    shuffleAnswers: boolean;
    /** Whether the time limit is reviewed when the instructions are silent. */
    reviewTimeLimit: boolean;
    /** Whether attempts are reviewed when the instructions are silent. */
    reviewAttempts: boolean;
  };
  /** Terms the institution has retired. */
  legacyTerms: string[];
  /** Words that ask the reviewer to look harder. */
  vagueWords: string[];
}

/** The rules the tool starts with. */
export const DEFAULT_RULES: ReviewRules = {
  defaults: {
    shuffleAnswers: true,
    reviewTimeLimit: false,
    reviewAttempts: false,
  },
  legacyTerms: [],
  vagueWords: [
    "good",
    "adequate",
    "appropriate",
    "as needed",
    "reasonable",
    "sufficient",
    "satisfactory",
    "some errors",
    "minor errors",
    "major errors",
    "etc",
  ],
};

/** Format a number the way a reviewer would read it. */
export function points(value: number | undefined): string {
  if (value === undefined) return "not in export";
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

/** Format a number of questions. */
export function count(value: number | undefined): string {
  if (value === undefined) return "not in export";
  return String(value);
}

/** A readable list of values. */
export function list(values: readonly string[]): string {
  if (values.length === 0) return "none";
  if (values.length === 1) return values[0];
  return `${values.slice(0, -1).join(", ")} and ${values[values.length - 1]}`;
}

/** The marker the prep file uses for anything the reviewer has to resolve. */
export const REVIEW_MARKER = "REVIEW REQUIRED";

/** Build the marker, with the reason. */
export function reviewMarker(reason: string): string {
  return `[${REVIEW_MARKER}: ${reason}]`;
}
