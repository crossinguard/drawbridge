/**
 * Running every check.
 *
 * The checks read only from the review model, so the same findings come out
 * whether the reviewer is looking at the screen or reading the export.
 */
import type { Candidate, CheckFamily, CheckResults, CheckStat, Finding } from "@/lib/tools/assessment-review/findings";
import { FAMILY_LABELS, PRIORITIES } from "@/lib/tools/assessment-review/findings";
import type { AssessmentReview } from "@/lib/tools/assessment-review/model";
import type { ReviewSettings } from "@/lib/tools/assessment-review/settings";

import { checkLegacy } from "./legacy";
import { checkNaming } from "./naming";
import { buildFamilies, checkQuizzes, type QuizComparisonGroup, type QuizFamily } from "./quizzes";
import { checkRubrics } from "./rubrics";
import { checkScoring } from "./scoring";

export { suggestGroups, findOutliers, extractStatements, buildFamilies } from "./quizzes";
export type { QuizComparisonGroup, QuizOutlier, InstructionStatement, QuizFamily } from "./quizzes";

/** What the review produces. */
export interface ReviewResult {
  /** Every finding, most urgent first. */
  findings: Finding[];
  /** The groups the quizzes fall into. */
  groups: QuizComparisonGroup[];
  /** The families the quizzes fall into. */
  families: QuizFamily[];
  /** What the checks could not stand behind. */
  candidates: Candidate[];
  /** What each check looked at, and how many passed. */
  stats: CheckStat[];
}

/** Run every check in the review. */
export function runChecks(
  review: AssessmentReview,
  groups: QuizComparisonGroup[],
  settings: ReviewSettings,
): ReviewResult {
  const results: CheckResults[] = [
    checkScoring(review, settings),
    checkLegacy(review, settings),
    checkQuizzes(review, groups, settings),
    checkRubrics(review, settings),
    checkNaming(review, settings),
  ];

  const findings = results.flatMap((result) => result.findings);
  const candidates = results.flatMap((result) => result.candidates);
  const stats = results.flatMap((result) => result.stats);

  return {
    findings: sortFindings(findings),
    groups,
    families: buildFamilies(groups),
    candidates: sortCandidates(candidates),
    stats: sortStats(stats),
  };
}

/** Sort the findings: by priority, then by family, then by statement. */
export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const priority = PRIORITIES.indexOf(a.suggestedPriority) - PRIORITIES.indexOf(b.suggestedPriority);
    if (priority !== 0) return priority;

    const family = Object.keys(FAMILY_LABELS).indexOf(a.family) - Object.keys(FAMILY_LABELS).indexOf(b.family);
    if (family !== 0) return family;

    return a.statement.localeCompare(b.statement);
  });
}

/** Sort the candidates: by kind, then by object. */
export function sortCandidates(candidates: Candidate[]): Candidate[] {
  return [...candidates].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
    return a.objectName.localeCompare(b.objectName);
  });
}

/** Sort the statistics: by family, then by check. */
export function sortStats(stats: CheckStat[]): CheckStat[] {
  return [...stats].sort((a, b) => {
    const family = Object.keys(FAMILY_LABELS).indexOf(a.family) - Object.keys(FAMILY_LABELS).indexOf(b.family);
    if (family !== 0) return family;
    return a.check.localeCompare(b.check);
  });
}

/** The families of checks, in the order they are shown. */
export const FAMILY_ORDER: readonly CheckFamily[] = ["scoring", "legacy", "quizzes", "rubrics", "naming"];
