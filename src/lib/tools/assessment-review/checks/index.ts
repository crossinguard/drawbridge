/**
 * Running every check.
 *
 * The checks read only from the review model, so the same findings come out
 * whether the reviewer is looking at the screen or reading the prep file.
 */
import type { Finding, ReviewRules } from "@/lib/tools/assessment-review/findings";
import { FAMILY_LABELS, PRIORITIES } from "@/lib/tools/assessment-review/findings";
import type { AssessmentReview } from "@/lib/tools/assessment-review/model";

import { checkLegacy } from "./legacy";
import { checkNaming } from "./naming";
import { checkQuizzes, type QuizComparisonGroup } from "./quizzes";
import { checkRubrics } from "./rubrics";
import { checkScoring } from "./scoring";

export { suggestGroups, findOutliers, extractStatements } from "./quizzes";
export type { QuizComparisonGroup, QuizOutlier, InstructionStatement } from "./quizzes";

/** What the review produces. */
export interface ReviewResult {
  /** Every finding, most urgent first. */
  findings: Finding[];
  /** The groups the quizzes fall into. */
  groups: QuizComparisonGroup[];
}

/** Run every check in the review. */
export function runChecks(review: AssessmentReview, groups: QuizComparisonGroup[], rules: ReviewRules): ReviewResult {
  const findings = [
    ...checkScoring(review),
    ...checkLegacy(review),
    ...checkQuizzes(review, groups, rules),
    ...checkRubrics(review, rules),
    ...checkNaming(review),
  ];

  return { findings: sortFindings(findings), groups };
}

/** Sort the findings: by priority, then by family, then by title. */
export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const priority = PRIORITIES.indexOf(a.suggestedPriority) - PRIORITIES.indexOf(b.suggestedPriority);
    if (priority !== 0) return priority;

    const family = Object.keys(FAMILY_LABELS).indexOf(a.family) - Object.keys(FAMILY_LABELS).indexOf(b.family);
    if (family !== 0) return family;

    return a.title.localeCompare(b.title);
  });
}
