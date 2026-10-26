/**
 * Family A: the scoring layers.
 *
 * Canvas scores a course in three layers, and the errors live where the
 * layers disagree — the points on a rubric against the points on the
 * assignment, the points on the questions against the points on the quiz, the
 * weight of a group against the points in it.
 *
 * Every check here reports the two values it compared, where each came from,
 * and whether they match.
 */
import { summariseQuestions } from "@/lib/canvas/quiz";
import type { Rubric } from "@/lib/canvas/types";

import { points as formatPoints } from "@/lib/tools/assessment-review/findings";
import type { Finding } from "@/lib/tools/assessment-review/findings";
import type { Assessment, AssessmentReview } from "@/lib/tools/assessment-review/model";

/** Where the rubric data comes from. */
const RUBRIC_SOURCE = "course_settings/rubrics.xml";

/** The points a rubric's criteria add up to. */
export function rubricTotal(rubric: Rubric): number {
  return rubric.criteria.reduce((total, criterion) => total + (criterion.points ?? 0), 0);
}

/** True when every criterion in the rubric uses a range rather than fixed points. */
export function isRangeRubric(rubric: Rubric): boolean {
  return rubric.criteria.length > 0 && rubric.criteria.every((criterion) => criterion.useRange);
}

/** Run every check in this family. */
export function checkScoring(review: AssessmentReview): Finding[] {
  return [
    ...checkRubricTotals(review),
    ...checkRubricToAssessment(review),
    ...checkQuizTotals(review),
    ...checkInstructionPoints(review),
    ...checkRatingCeilings(review),
    ...checkGroupTotals(review),
    ...checkWeights(review),
    ...checkWeightAgainstPoints(review),
    ...checkMissingGradebookData(review),
    ...checkUnworkablePoints(review),
  ];
}

/** A3b — quizzes whose points the export does not let us work out. */
function checkUnworkablePoints(review: AssessmentReview): Finding[] {
  const unworkable = review.assessments.filter(
    (assessment) => assessment.kind === "quiz" && assessment.quiz?.selectionCountUnknown,
  );

  if (unworkable.length === 0) return [];

  return [
    {
      id: "A3b-unworkable-points",
      check: "A3",
      family: "scoring",
      title: `${unworkable.length} quiz${unworkable.length === 1 ? " does" : "s do"} not say how many questions are drawn, so the points cannot be worked out`,
      values: [
        {
          label: "Quizzes",
          value: unworkable.map((assessment) => assessment.title).join("; "),
          source: "the quiz questions",
        },
      ],
      itemIds: unworkable.map((assessment) => assessment.id),
      suggestedPriority: "medium",
      priorityReason: "The export records a draw from a bank without saying how many questions it takes.",
      notes: ["The quiz's own point value is still recorded; it just cannot be checked against its questions."],
      needsReview: true,
    },
  ];
}

/** A1 — a rubric's criteria against its own stated total. */
function checkRubricTotals(review: AssessmentReview): Finding[] {
  const findings: Finding[] = [];

  for (const { rubric } of review.rubrics) {
    if (rubric.pointsPossible === undefined) continue;

    const sum = rubricTotal(rubric);
    if (Math.abs(sum - rubric.pointsPossible) < 0.001) continue;

    findings.push({
      id: `A1-${rubric.id}`,
      check: "A1",
      family: "scoring",
      title: `The criteria of "${rubric.title}" add up to ${formatPoints(sum)}, not ${formatPoints(rubric.pointsPossible)}`,
      values: [
        { label: "Sum of criteria", value: formatPoints(sum), source: RUBRIC_SOURCE },
        { label: "Rubric total", value: formatPoints(rubric.pointsPossible), source: RUBRIC_SOURCE },
      ],
      itemIds: review.assessments.filter((a) => a.rubricId === rubric.id).map((a) => a.id),
      suggestedPriority: "medium",
      priorityReason: "The rubric's own total does not match its criteria.",
      notes: [
        ...rubric.criteria.map(
          (criterion) => `${criterion.description || "(no name)"}: ${formatPoints(criterion.points)} points`,
        ),
      ],
      needsReview: true,
    });
  }

  return findings;
}

/** A2 — a rubric against the assignment it is attached to. */
function checkRubricToAssessment(review: AssessmentReview): Finding[] {
  const findings: Finding[] = [];

  for (const assessment of review.assessments) {
    if (!assessment.rubricId) continue;

    const rubric = review.rubrics.find((entry) => entry.rubric.id === assessment.rubricId)?.rubric;
    if (!rubric) continue;

    // A rubric that is attached but not used for grading does not set the
    // score, so its total is not expected to match the assignment's points.
    if (!assessment.rubricUseForGrading) continue;

    // A rubric whose levels are a range is scored out of the assignment's
    // points, not out of its own stated total.
    if (isRangeRubric(rubric)) continue;

    if (assessment.pointsPossible === undefined || rubric.pointsPossible === undefined) continue;

    if (Math.abs(rubric.pointsPossible - assessment.pointsPossible) < 0.001) continue;

    findings.push({
      id: `A2-${assessment.id}`,
      check: "A2",
      family: "scoring",
      title: `"${assessment.title}" is worth ${formatPoints(assessment.pointsPossible)} points but its rubric totals ${formatPoints(rubric.pointsPossible)}`,
      values: [
        {
          label: "Assignment points",
          value: formatPoints(assessment.pointsPossible),
          source: assignmentSource(assessment),
        },
        { label: "Rubric total", value: formatPoints(rubric.pointsPossible), source: RUBRIC_SOURCE },
      ],
      itemIds: [assessment.id],
      suggestedPriority: "high",
      priorityReason: "The rubric drives the score, and it adds up to a different number.",
      notes: [`Rubric: "${rubric.title}"`],
      needsReview: true,
    });
  }

  return findings;
}

/** A3 — a quiz's questions against the quiz's points possible. */
function checkQuizTotals(review: AssessmentReview): Finding[] {
  const findings: Finding[] = [];

  for (const assessment of review.assessments) {
    if (assessment.kind !== "quiz") continue;

    const quiz = assessment.quiz;
    if (!quiz || quiz.pointsPossible === undefined) continue;

    // An ungraded quiz has nothing to compare.
    if (quiz.pointsPossible === 0) continue;

    const summary = summariseQuestions(quiz);

    // The export does not say what the questions are worth, so there is
    // nothing to compare. This is a gap, not a mismatch.
    if (summary.points === undefined) continue;

    if (Math.abs(summary.points - quiz.pointsPossible) < 0.001) continue;

    findings.push({
      id: `A3-${assessment.id}`,
      check: "A3",
      family: "scoring",
      title: `The questions of "${assessment.title}" add up to ${formatPoints(summary.points)} points, not ${formatPoints(quiz.pointsPossible)}`,
      values: [
        {
          label: "Questions",
          value: formatPoints(summary.points),
          source: quiz.questionsSource ?? "the quiz's questions",
        },
        {
          label: "Quiz points",
          value: formatPoints(quiz.pointsPossible),
          source: quiz.settingsSource ?? "the quiz settings",
        },
      ],
      itemIds: [assessment.id],
      suggestedPriority: "high",
      priorityReason: "The quiz's own points do not match what its questions are worth.",
      notes: [arithmetic(quiz), ...describeSelections(quiz)],
      needsReview: true,
    });
  }

  return findings;
}

/** The arithmetic behind a quiz's points. */
function arithmetic(quiz: NonNullable<Assessment["quiz"]>): string {
  const parts: string[] = [];

  if (quiz.questionCount > 0) {
    parts.push(`${quiz.questionCount} question${quiz.questionCount === 1 ? "" : "s"} stored in the quiz`);
  }
  if (quiz.textBlockCount > 0) {
    parts.push(`${quiz.textBlockCount} passage${quiz.textBlockCount === 1 ? "" : "s"} of text, which are not graded`);
  }
  for (const selection of quiz.selections) {
    const source = selection.bankTitle ? ` from "${selection.bankTitle}"` : "";
    parts.push(
      `${selection.count ?? "an unknown number of"} question${selection.count === 1 ? "" : "s"}${source} at ${selection.pointsPerItem ?? "an unknown number of"} point${selection.pointsPerItem === 1 ? "" : "s"} each`,
    );
  }

  return parts.length > 0
    ? `The export records: ${parts.join("; ")}.`
    : "The export does not record what the questions are worth.";
}

/** A readable line for each of a quiz's selections. */
function describeSelections(quiz: NonNullable<Assessment["quiz"]>): string[] {
  return quiz.selections.map((selection) => {
    const source = selection.bankTitle
      ? `bank "${selection.bankTitle}"`
      : selection.bankId
        ? `bank ${selection.bankId}`
        : "the quiz's own questions";
    const count_ = selection.count === undefined ? "an unknown number of" : String(selection.count);
    const worth = selection.pointsPerItem === undefined ? "an unknown number of" : String(selection.pointsPerItem);
    return `${count_} question${selection.count === 1 ? "" : "s"} from ${source} at ${worth} point${selection.pointsPerItem === 1 ? "" : "s"} each`;
  });
}

/**
 * A4 — a point value stated in the instructions against the item's points.
 *
 * The instructions are the student's contract. When they state a point value
 * and the item is worth a different one, the two have to be reconciled.
 */
function checkInstructionPoints(review: AssessmentReview): Finding[] {
  const findings: Finding[] = [];

  for (const assessment of review.assessments) {
    if (assessment.pointsPossible === undefined) continue;
    if (assessment.instructions.trim() === "") continue;

    const stated = statedPointTotals(assessment.instructions);
    if (stated.length === 0) continue;

    // The instructions agree with the item when they state its points.
    if (stated.some((value) => Math.abs(value - assessment.pointsPossible!) < 0.001)) continue;

    findings.push({
      id: `A4-${assessment.id}`,
      check: "A4",
      family: "scoring",
      title: `The instructions for "${assessment.title}" state ${stated.map((value) => `${value} points`).join(" and ")}, but the item is worth ${formatPoints(assessment.pointsPossible)}`,
      values: [
        {
          label: "Points in the instructions",
          value: stated.join(", "),
          source: assessment.instructionsSource ?? "the item's instructions",
        },
        { label: "Item points", value: formatPoints(assessment.pointsPossible), source: assignmentSource(assessment) },
      ],
      itemIds: [assessment.id],
      suggestedPriority: "high",
      priorityReason: "The instructions tell the student a different number than the item is worth.",
      notes: ["The tool matches whole point values only, and only ones that read as the total for the item."],
      needsReview: true,
    });
  }

  return findings;
}

/**
 * The point totals an instruction states.
 *
 * Only whole point values are picked up, and only ones that read as the total
 * for the item. A phrase like "5 points each" is a rate, not a total, so it
 * is left out — guessing would be worse than saying nothing.
 */
export function statedPointTotals(instructions: string): number[] {
  const found: number[] = [];

  // "worth 50 points", "graded out of 50 points", "50 points total"
  const totalPatterns = [
    /(?:worth|valued at|graded|scored|marked)\s+(?:out of\s+)?(\d+)\s*points?\b/gi,
    /(\d+)\s*points?\s*(?:total|in total|for the assignment|for this assignment)\b/gi,
    /(?:total|maximum|max)\s+(?:of\s+)?(\d+)\s*points?\b/gi,
    /(?:assignment|quiz|discussion|project|paper)\s+(?:is\s+)?(?:worth|valued at)\s+(\d+)\s*points?\b/gi,
  ];

  for (const pattern of totalPatterns) {
    for (const match of instructions.matchAll(pattern)) {
      const value = Number(match[1]);
      if (Number.isFinite(value) && !found.includes(value)) found.push(value);
    }
  }

  return found.sort((a, b) => a - b);
}

/** A5 — the highest rating level against the criterion's own points. */
function checkRatingCeilings(review: AssessmentReview): Finding[] {
  const findings: Finding[] = [];

  for (const { rubric } of review.rubrics) {
    for (const criterion of rubric.criteria) {
      if (criterion.points === undefined) continue;
      if (criterion.ratings.length === 0) continue;

      const points = criterion.ratings
        .map((rating) => rating.points)
        .filter((value): value is number => value !== undefined);
      if (points.length === 0) continue;

      const highest = Math.max(...points);

      if (Math.abs(highest - criterion.points) < 0.001) continue;

      findings.push({
        id: `A5-${rubric.id}-${criterion.id}`,
        check: "A5",
        family: "scoring",
        title: `The highest level of "${criterion.description || "(unnamed criterion)"}" in "${rubric.title}" is worth ${formatPoints(highest)} points, but the criterion is worth ${formatPoints(criterion.points)}`,
        values: [
          { label: "Highest level", value: formatPoints(highest), source: RUBRIC_SOURCE },
          { label: "Criterion points", value: formatPoints(criterion.points), source: RUBRIC_SOURCE },
        ],
        itemIds: review.assessments.filter((a) => a.rubricId === rubric.id).map((a) => a.id),
        suggestedPriority: "medium",
        priorityReason: "The levels cannot add up to the criterion they belong to.",
        notes: criterion.ratings.map((rating) => `${rating.description}: ${formatPoints(rating.points)} points`),
        needsReview: true,
      });
    }
  }

  return findings;
}

/** A6 — the points in each assignment group. */
function checkGroupTotals(review: AssessmentReview): Finding[] {
  const findings: Finding[] = [];

  for (const group of review.groups) {
    if (group.id === "") continue;

    if (group.assessments.length === 0 && group.weight > 0) {
      findings.push({
        id: `A6-${group.id}`,
        check: "A6",
        family: "scoring",
        title: `The assignment group "${group.title}" is worth ${formatPoints(group.weight)}% of the grade but has nothing in it`,
        values: [
          {
            label: "Group weight",
            value: `${formatPoints(group.weight)}%`,
            source: "course_settings/assignment_groups.xml",
          },
          { label: "Items in the group", value: "0", source: "the course's assignment settings" },
        ],
        itemIds: [],
        suggestedPriority: "medium",
        priorityReason: "The group carries weight but nothing counts towards it.",
        notes: [],
        needsReview: true,
      });
    }
  }

  return findings;
}

/** A7 — the group weights against 100%. */
function checkWeights(review: AssessmentReview): Finding[] {
  if (review.weighting !== "percent") return [];

  const groups = review.groups.filter((group) => group.id !== "");
  if (groups.length === 0) return [];

  const total = groups.reduce((sum, group) => sum + group.weight, 0);
  if (Math.abs(total - 100) < 0.001) return [];

  return [
    {
      id: "A7-weights",
      check: "A7",
      family: "scoring",
      title: `The assignment groups add up to ${formatPoints(total)}% of the grade, not 100%`,
      values: [
        {
          label: "Sum of group weights",
          value: `${formatPoints(total)}%`,
          source: "course_settings/assignment_groups.xml",
        },
        { label: "Expected", value: "100%", source: "the course's weighting setting" },
      ],
      itemIds: [],
      suggestedPriority: "high",
      priorityReason: "The weights do not account for the whole grade.",
      notes: groups.map((group) => `${group.title}: ${formatPoints(group.weight)}%`),
      needsReview: true,
    },
  ];
}

/** A8 — each group's share of the grade against its share of the points. */
function checkWeightAgainstPoints(review: AssessmentReview): Finding[] {
  if (review.weighting !== "percent") return [];

  const findings: Finding[] = [];

  for (const group of review.groups) {
    if (group.id === "") continue;
    if (group.weight === 0 && group.pointsShare === 0) continue;

    const difference = Math.abs(group.weight - group.pointsShare);
    if (difference < 10) continue;

    findings.push({
      id: `A8-${group.id}`,
      check: "A8",
      family: "scoring",
      title: `The group "${group.title}" is worth ${formatPoints(group.weight)}% of the grade but holds ${formatPoints(group.pointsShare)}% of the points`,
      values: [
        {
          label: "Share of the grade",
          value: `${formatPoints(group.weight)}%`,
          source: "course_settings/assignment_groups.xml",
        },
        {
          label: "Share of the points",
          value: `${formatPoints(group.pointsShare)}%`,
          source: "the course's assignment settings",
        },
      ],
      itemIds: group.assessments.map((assessment) => assessment.id),
      suggestedPriority: "medium",
      priorityReason: "The weight and the points pull in different directions.",
      notes: [
        `The group holds ${formatPoints(group.pointsTotal)} of the course's points across ${group.assessments.length} item${group.assessments.length === 1 ? "" : "s"}.`,
      ],
      needsReview: true,
    });
  }

  return findings;
}

/** A9 — items the gradebook has no complete record of. */
function checkMissingGradebookData(review: AssessmentReview): Finding[] {
  const findings: Finding[] = [];

  const withoutPoints = review.assessments.filter((assessment) => assessment.pointsPossible === undefined);
  if (withoutPoints.length > 0) {
    findings.push({
      id: "A9-no-points",
      check: "A9",
      family: "scoring",
      title: `${withoutPoints.length} graded item${withoutPoints.length === 1 ? " has" : "s have"} no point value in the export`,
      values: [
        {
          label: "Items without points",
          value: String(withoutPoints.length),
          source: "the course's assignment settings",
        },
      ],
      itemIds: withoutPoints.map((assessment) => assessment.id),
      suggestedPriority: "medium",
      priorityReason: "An item with no points does not affect the grade.",
      notes: withoutPoints.map((assessment) => assessment.title),
      needsReview: true,
    });
  }

  const withoutGroup = review.assessments.filter((assessment) => !assessment.groupId);
  if (withoutGroup.length > 0) {
    findings.push({
      id: "A9-no-group",
      check: "A9",
      family: "scoring",
      title: `${withoutGroup.length} graded item${withoutGroup.length === 1 ? " is" : "s are"} in no assignment group`,
      values: [
        {
          label: "Items without a group",
          value: String(withoutGroup.length),
          source: "the course's assignment settings",
        },
      ],
      itemIds: withoutGroup.map((assessment) => assessment.id),
      suggestedPriority: "medium",
      priorityReason: "An item in no group does not roll up into the gradebook.",
      notes: withoutGroup.map((assessment) => assessment.title),
      needsReview: true,
    });
  }

  return findings;
}

/** Where an assessment's points come from. */
function assignmentSource(assessment: Assessment): string {
  if (assessment.kind === "quiz") return assessment.quiz?.settingsSource ?? "the quiz settings";
  if (assessment.kind === "graded-discussion") return "the discussion's assignment settings";
  return assessment.item.settingsPath ?? "the assignment settings";
}
