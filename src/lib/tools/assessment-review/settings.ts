/**
 * The settings the reviewer controls.
 *
 * Everything an institution would want to decide lives here: what to do when
 * the instructions are silent, which terms have been retired, how the quizzes
 * are grouped for comparison, how a finding's severity is suggested, and how
 * much of the course the export carries.
 *
 * Nothing in this file names an institution. The defaults are neutral, and the
 * settings object travels inside the export manifest so a reviewer can see
 * exactly which rules produced the results.
 */
import type { CheckFamily, Priority } from "@/lib/tools/assessment-review/findings";

/** How much detail the bundle carries. */
export type DetailLevel = "brief" | "standard" | "full";

/** The detail levels, least detail first. */
export const DETAIL_LEVELS: readonly DetailLevel[] = ["brief", "standard", "full"];

/** What the export should leave out. */
export interface IncludeSettings {
  /** Pages that are not graded items. */
  pages: boolean;
  /** Discussions that are not graded. */
  ungradedDiscussions: boolean;
  /** Rubrics the tool believes are left over. */
  legacyRubrics: boolean;
  /** Item banks. */
  itemBanks: boolean;
}

/**
 * How the course's own naming patterns are worked out.
 *
 * The patterns are read out of the titles of the course's own items. The
 * reviewer can add more, and can turn the check off.
 */
export interface NamingSettings {
  /** Whether the items that do not follow the course's pattern are reported. */
  checkTitlePatterns: boolean;
  /** Extra title patterns to treat as the course's own. */
  extraPatterns: string[];
}

/** How quizzes that should behave the same are put together. */
export interface QuizGroupingSettings {
  /** Group quizzes whose titles follow the same pattern. */
  byTitlePattern: boolean;
  /** Group quizzes that sit in the same assignment group. */
  byAssignmentGroup: boolean;
  /** Group quizzes with the same engine and the same points. */
  byEngineAndPoints: boolean;
  /** Group quizzes that are worth the same number of points. */
  byPoints: boolean;
}

/**
 * Everything the reviewer can set.
 *
 * The settings apply to every course the tool is pointed at, and to every
 * finding the tool produces. The reviewer's own overrides — a finding's
 * priority, a quiz's comparison group — are kept apart, in `ReviewOverrides`.
 */
export interface ReviewSettings {
  /**
   * What to do when the instructions say nothing about a quiz setting.
   *
   * Shuffling the answers is the usual expectation. The time limit and the
   * number of attempts are usually left alone, and the reviewer can ask for
   * either of them to be checked.
   */
  quizDefaults: {
    /** Whether answers should be shuffled when the instructions are silent. */
    shuffleAnswers: boolean;
    /** Whether the time limit is reviewed when the instructions are silent. */
    reviewTimeLimit: boolean;
    /** Whether the number of attempts is reviewed when the instructions are silent. */
    reviewAttempts: boolean;
  };
  /** Terms the institution has retired. */
  legacyTerms: string[];
  /** Words that ask the reviewer to look harder at a rubric level. */
  vagueWords: string[];
  /** The pattern the term of the export is read with. */
  termPattern: string;
  /** How quizzes that should match are grouped. */
  quizGrouping: QuizGroupingSettings;
  /** How the course's own naming patterns are worked out. */
  naming: NamingSettings;
  /**
   * The severity suggested for each family of checks.
   *
   * A suggestion only: the reviewer can change any finding's severity.
   */
  priorityMapping: Partial<Record<CheckFamily, Priority>>;
  /** What the export should leave out. */
  include: IncludeSettings;
  /** How much detail the bundle carries. */
  detailLevel: DetailLevel;
}

/** The settings the tool starts with. */
export const DEFAULT_SETTINGS: ReviewSettings = {
  quizDefaults: {
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
  termPattern: "\\b(20\\d{2})[- ]?([12])\\b",
  quizGrouping: {
    byTitlePattern: true,
    byAssignmentGroup: true,
    byEngineAndPoints: true,
    byPoints: true,
  },
  naming: {
    checkTitlePatterns: true,
    extraPatterns: [],
  },
  priorityMapping: {},
  include: {
    pages: true,
    ungradedDiscussions: true,
    legacyRubrics: true,
    itemBanks: true,
  },
  detailLevel: "standard",
};

/** A fresh copy of the default settings. */
export function defaultSettings(): ReviewSettings {
  return structuredClone(DEFAULT_SETTINGS);
}

/**
 * Read the settings out of a JSON object.
 *
 * Anything missing or malformed falls back to the default, so a settings file
 * written by an older version of the tool still opens.
 */
export function settingsFromJson(value: unknown): ReviewSettings {
  const base = defaultSettings();
  if (!isRecord(value)) return base;

  const quizDefaults = isRecord(value.quizDefaults) ? value.quizDefaults : {};
  const grouping = isRecord(value.quizGrouping) ? value.quizGrouping : {};
  const naming = isRecord(value.naming) ? value.naming : {};
  const include = isRecord(value.include) ? value.include : {};
  const mapping = isRecord(value.priorityMapping) ? value.priorityMapping : {};

  const priorityMapping: Partial<Record<CheckFamily, Priority>> = {};
  for (const [family, priority] of Object.entries(mapping)) {
    if (!isCheckFamily(family)) continue;
    if (priority !== "high" && priority !== "medium" && priority !== "low") continue;
    priorityMapping[family] = priority;
  }

  return {
    quizDefaults: {
      shuffleAnswers: booleanOr(quizDefaults.shuffleAnswers, base.quizDefaults.shuffleAnswers),
      reviewTimeLimit: booleanOr(quizDefaults.reviewTimeLimit, base.quizDefaults.reviewTimeLimit),
      reviewAttempts: booleanOr(quizDefaults.reviewAttempts, base.quizDefaults.reviewAttempts),
    },
    legacyTerms: stringList(value.legacyTerms, base.legacyTerms),
    vagueWords: stringList(value.vagueWords, base.vagueWords),
    termPattern:
      typeof value.termPattern === "string" && value.termPattern !== "" ? value.termPattern : base.termPattern,
    quizGrouping: {
      byTitlePattern: booleanOr(grouping.byTitlePattern, base.quizGrouping.byTitlePattern),
      byAssignmentGroup: booleanOr(grouping.byAssignmentGroup, base.quizGrouping.byAssignmentGroup),
      byEngineAndPoints: booleanOr(grouping.byEngineAndPoints, base.quizGrouping.byEngineAndPoints),
      byPoints: booleanOr(grouping.byPoints, base.quizGrouping.byPoints),
    },
    naming: {
      checkTitlePatterns: booleanOr(naming.checkTitlePatterns, base.naming.checkTitlePatterns),
      extraPatterns: stringList(naming.extraPatterns, base.naming.extraPatterns),
    },
    priorityMapping,
    include: {
      pages: booleanOr(include.pages, base.include.pages),
      ungradedDiscussions: booleanOr(include.ungradedDiscussions, base.include.ungradedDiscussions),
      legacyRubrics: booleanOr(include.legacyRubrics, base.include.legacyRubrics),
      itemBanks: booleanOr(include.itemBanks, base.include.itemBanks),
    },
    detailLevel:
      value.detailLevel === "brief" || value.detailLevel === "standard" || value.detailLevel === "full"
        ? value.detailLevel
        : base.detailLevel,
  };
}

/**
 * The term the export covers.
 *
 * The platform does not record the term anywhere in the export, so it is read
 * out of the course title and code with the configured pattern, and the brief
 * says how it was worked out. When the pattern does not match, the brief says
 * so rather than guessing.
 */
export function readTerm(title: string, code: string, pattern: string): { value: string; how: string } {
  const haystack = `${title} ${code}`;

  let expression: RegExp;
  try {
    expression = new RegExp(pattern);
  } catch {
    return { value: "not in export", how: "the configured term pattern is not a valid expression" };
  }

  const match = expression.exec(haystack);
  if (!match) {
    return { value: "not in export", how: "no match for the configured term pattern in the course title or code" };
  }

  const value = match[0].trim();
  const groups = match.slice(1).filter((part) => part !== undefined);

  return {
    value: groups.length > 0 ? groups.join("-") : value,
    how: `read from the course title and code with the configured term pattern; the export does not record the term`,
  };
}

/** The priority a family of checks suggests, after the settings are applied. */
export function priorityFor(settings: ReviewSettings, family: CheckFamily, fallback: Priority): Priority {
  return settings.priorityMapping[family] ?? fallback;
}

/** True when the value is a plain object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Read a boolean, falling back when it is missing. */
function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** Read a list of strings, falling back when it is missing. */
function stringList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return [...fallback];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "");
}

/** True when the string names a family of checks. */
function isCheckFamily(value: string): value is CheckFamily {
  return value === "scoring" || value === "legacy" || value === "quizzes" || value === "rubrics" || value === "naming";
}
