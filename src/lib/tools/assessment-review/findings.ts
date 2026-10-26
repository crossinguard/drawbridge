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

/**
 * How sure the tool is.
 *
 * A finding produced by arithmetic or by a structural rule is `high`. One
 * produced by reading a number out of a sentence is `medium`. One produced by
 * matching words is `low` — it is a candidate, not a conclusion.
 */
export type Confidence = "high" | "medium" | "low";

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

/** The confidence levels, most sure first. */
export const CONFIDENCES: readonly Confidence[] = ["high", "medium", "low"];

/**
 * What a finding is about.
 *
 * A finding has one primary object. Everything else it touches is listed in
 * `affected`, so a cause that reaches many items is written once.
 */
export type ObjectType =
  | "assessment"
  | "quiz"
  | "quiz-family"
  | "rubric"
  | "rubric-family"
  | "group"
  | "module"
  | "course"
  | "item-bank"
  | "content";

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
  /** What kind of object the finding is about. */
  objectType: ObjectType;
  /** The identifier of the object the finding is about. */
  objectId: string;
  /** The name of the object the finding is about. */
  objectName: string;
  /** A neutral statement of what differs, in one or two sentences. */
  statement: string;
  /** The values compared, and where each came from. */
  values: FindingValue[];
  /** Every object the cause touches, by id. */
  affected: string[];
  /** The priority the tool suggests. */
  suggestedPriority: Priority;
  /** Why it suggests that priority. */
  priorityReason: string;
  /** How sure the tool is. */
  confidence: Confidence;
  /** Extra context: the arithmetic, the reasons, the sources. */
  notes: string[];
  /** True when the reviewer has to resolve this. */
  needsReview: boolean;
}

/**
 * Something that is not a finding.
 *
 * A candidate is a keyword match the tool cannot stand behind. A cleanup item
 * is something it stripped out of the text before comparing, reported so that
 * the stripping is visible.
 */
export interface Candidate {
  /** A stable id, so the reviewer can point at it. */
  id: string;
  /** What kind of candidate it is. */
  kind: "candidate mismatch (keyword match)" | "cleanup item";
  /** What kind of object the candidate is about. */
  objectType: ObjectType;
  /** The identifier of the object. */
  objectId: string;
  /** The name of the object. */
  objectName: string;
  /** A neutral statement of what was noticed. */
  statement: string;
  /** The detail: the text that was matched, or the artifact that was removed. */
  detail: string;
  /** How sure the tool is. */
  confidence: Confidence;
  /** Where the text came from. */
  source: string;
  /** Every object the candidate touches, by id. */
  affected: string[];
}

/**
 * What one check looked at, and how many of them passed.
 *
 * The passes are counted rather than listed. Only the exceptions are named.
 */
export interface CheckStat {
  /** The check's id, e.g. "A3". */
  check: string;
  /** The family the check belongs to. */
  family: CheckFamily;
  /** What the check compared. */
  description: string;
  /** How many objects were compared. */
  total: number;
  /** How many agreed. */
  passed: number;
  /** How many did not. */
  failed: number;
  /** The names of the objects that did not agree. */
  exceptions: string[];
}

/** The results of a family of checks. */
export interface CheckResults {
  /** What the family found. */
  findings: Finding[];
  /** What the family could not stand behind. */
  candidates: Candidate[];
  /** How many objects each check looked at, and how many passed. */
  stats: CheckStat[];
}

/** An empty set of results. */
export function emptyResults(): CheckResults {
  return { findings: [], candidates: [], stats: [] };
}

/** What a finding needs to be built. */
export interface FindingInput {
  id: string;
  check: string;
  family: CheckFamily;
  objectType: ObjectType;
  objectId: string;
  objectName: string;
  statement: string;
  values?: FindingValue[];
  affected?: string[];
  suggestedPriority: Priority;
  priorityReason: string;
  confidence?: Confidence;
  notes?: string[];
  needsReview?: boolean;
}

/** Build a finding, filling in the parts every finding has. */
export function makeFinding(input: FindingInput): Finding {
  return {
    id: input.id,
    check: input.check,
    family: input.family,
    objectType: input.objectType,
    objectId: input.objectId,
    objectName: input.objectName,
    statement: input.statement,
    values: input.values ?? [],
    affected: input.affected ?? (input.objectId === "" ? [] : [input.objectId]),
    suggestedPriority: input.suggestedPriority,
    priorityReason: input.priorityReason,
    confidence: input.confidence ?? "high",
    notes: input.notes ?? [],
    needsReview: input.needsReview ?? true,
  };
}

/** What a check statistic needs to be built. */
export interface CheckStatInput {
  check: string;
  family: CheckFamily;
  description: string;
  total: number;
  passed: number;
  exceptions?: string[];
}

/** Build the record of what one check looked at. */
export function makeStat(input: CheckStatInput): CheckStat {
  return {
    check: input.check,
    family: input.family,
    description: input.description,
    total: input.total,
    passed: input.passed,
    failed: Math.max(0, input.total - input.passed),
    exceptions: input.exceptions ?? [],
  };
}

/**
 * The value the export did not carry.
 *
 * A blank must never look like "off" or "zero", so a missing value is always
 * written out.
 */
export const NOT_IN_EXPORT = "not in export";

/** The value that is there simply because it does not apply. */
export const NOT_APPLICABLE = "not applicable";

/** Format a number the way a reviewer would read it. */
export function points(value: number | undefined): string {
  if (value === undefined) return NOT_IN_EXPORT;
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

/** Format a number of questions. */
export function count(value: number | undefined): string {
  if (value === undefined) return NOT_IN_EXPORT;
  return String(value);
}

/** A readable list of values. */
export function list(values: readonly string[]): string {
  if (values.length === 0) return "none";
  if (values.length === 1) return values[0];
  return `${values.slice(0, -1).join(", ")} and ${values[values.length - 1]}`;
}

/** The marker the export uses for anything the reviewer has to resolve. */
export const REVIEW_MARKER = "REVIEW REQUIRED";

/** Build the marker, with the reason. */
export function reviewMarker(reason: string): string {
  return `[${REVIEW_MARKER}: ${reason}]`;
}

/** What the reviewer changed while reading. */
export interface ReviewOverrides {
  /** The priority the reviewer set for a finding, by finding id. */
  priorities: Map<string, Priority>;
  /** The group the reviewer moved a quiz into, by quiz id. */
  quizGroups: Map<string, string>;
}

/** The priority a finding ends up with, after the reviewer's changes. */
export function effectivePriority(finding: Finding, overrides: ReviewOverrides): Priority {
  return overrides.priorities.get(finding.id) ?? finding.suggestedPriority;
}
