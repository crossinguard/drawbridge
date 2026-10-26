/**
 * Family E: whether the names agree.
 *
 * A course's names are read by students, by other teachers, and by the
 * gradebook. When they drift apart the drift is usually invisible until
 * someone is looking for the wrong thing.
 *
 * Each check reports the two names as a pair. It never calls one of them
 * wrong.
 */
import { naturalCompare } from "@/lib/utils";

import type { Finding } from "@/lib/tools/assessment-review/findings";
import type { Assessment, AssessmentReview } from "@/lib/tools/assessment-review/model";
import { matchesPattern, titlePattern } from "@/lib/tools/assessment-review/usage";

/** Run every check in this family. */
export function checkNaming(review: AssessmentReview): Finding[] {
  return [
    ...checkItemAgainstContentTitle(review),
    ...checkAssessmentAgainstRubricTitle(review),
    ...checkTitlePatterns(review),
    ...checkGroupNames(review),
    ...checkWeekLabels(review),
    ...checkWhitespace(review),
  ];
}

/** E1 — the module item's title against the title the content carries. */
function checkItemAgainstContentTitle(review: AssessmentReview): Finding[] {
  const findings: Finding[] = [];

  for (const assessment of review.assessments) {
    const own = assessment.ownTitle;
    if (!own) continue;
    if (own.trim() === assessment.title.trim()) continue;

    findings.push({
      id: `E1-${assessment.id}`,
      check: "E1",
      family: "naming",
      title: `"${assessment.title}" is named "${own}" on the item itself`,
      values: [
        { label: "Module item", value: assessment.title, source: "course_settings/module_meta.xml" },
        { label: "The item itself", value: own, source: assessment.item.settingsPath ?? "the item's settings" },
      ],
      itemIds: [assessment.id],
      suggestedPriority: "low",
      priorityReason: "The two names differ, so a reviewer looking for one will not find the other.",
      notes: [],
      needsReview: false,
    });
  }

  return findings;
}

/** E2 — the assessment's title against its rubric's title. */
function checkAssessmentAgainstRubricTitle(review: AssessmentReview): Finding[] {
  const findings: Finding[] = [];

  for (const assessment of review.assessments) {
    if (!assessment.rubricId) continue;

    const rubric = review.rubrics.find((entry) => entry.rubric.id === assessment.rubricId)?.rubric;
    if (!rubric) continue;

    // Two names that do not resemble each other may still be the right
    // pairing, so this is reported as a pair rather than as a mismatch.
    if (resemble(assessment.title, rubric.title)) continue;

    findings.push({
      id: `E2-${assessment.id}`,
      check: "E2",
      family: "naming",
      title: `"${assessment.title}" uses the rubric "${rubric.title}"`,
      values: [
        { label: "Assessment", value: assessment.title, source: "the item's settings" },
        { label: "Rubric", value: rubric.title, source: "course_settings/rubrics.xml" },
      ],
      itemIds: [assessment.id],
      suggestedPriority: "low",
      priorityReason:
        "The names do not resemble each other, which sometimes means a rubric left over from an earlier version.",
      notes: [],
      needsReview: false,
    });
  }

  return findings;
}

/** E3 — titles that do not follow the course's own pattern. */
function checkTitlePatterns(review: AssessmentReview): Finding[] {
  const findings: Finding[] = [];
  const patterns = review.usage.patterns;

  if (patterns.length === 0) return [];

  const outliers = review.assessments.filter((assessment) => !matchesPattern(assessment.title, patterns));

  if (outliers.length === 0) return [];

  findings.push({
    id: "E3-outliers",
    check: "E3",
    family: "naming",
    title: `${outliers.length} of ${review.assessments.length} graded items do not follow the course's naming pattern`,
    values: [
      {
        label: "Patterns the course follows",
        value: patterns.join(", "),
        source: "the titles of the course's module items",
      },
      { label: "Items that do not", value: String(outliers.length), source: "the course's module items" },
    ],
    itemIds: outliers.map((assessment) => assessment.id),
    suggestedPriority: "low",
    priorityReason: "Naming that does not follow the course's own pattern makes the course harder to scan.",
    notes: outliers.map((assessment) => `• ${assessment.title} (${titlePattern(assessment.title)})`),
    needsReview: false,
  });

  return findings;
}

/** E5 — the name of a group against the names of what is in it. */
function checkGroupNames(review: AssessmentReview): Finding[] {
  const findings: Finding[] = [];

  for (const group of review.groups) {
    if (group.id === "") continue;
    if (group.assessments.length < 2) continue;

    const words = group.assessments.flatMap((assessment) => titleWords(assessment.title));
    const shared = words.filter((word) => {
      const count = words.filter((other) => other === word).length;
      return count >= Math.max(2, Math.ceil(group.assessments.length / 2));
    });

    // The group's name should say what is in it.
    const groupWords = new Set(titleWords(group.title));
    const named = [...groupWords].some((word) => shared.includes(word));

    if (named) continue;

    findings.push({
      id: `E5-${group.id}`,
      check: "E5",
      family: "naming",
      title: `The group "${group.title}" does not share a name with the ${group.assessments.length} items in it`,
      values: [
        { label: "Group", value: group.title, source: "course_settings/assignment_groups.xml" },
        {
          label: "Items in it",
          value: group.assessments.map((assessment) => assessment.title).join("; "),
          source: "the course's assignment settings",
        },
      ],
      itemIds: group.assessments.map((assessment) => assessment.id),
      suggestedPriority: "low",
      priorityReason: "The gradebook column and the items in it do not use the same words.",
      notes: [],
      needsReview: false,
    });
  }

  return findings;
}

/** E6 — a week or number in a title against the module it sits in. */
function checkWeekLabels(review: AssessmentReview): Finding[] {
  const findings: Finding[] = [];

  for (const assessment of review.assessments) {
    if (!assessment.moduleTitle) continue;

    const itemNumber = leadingNumber(assessment.title);
    const moduleNumber = leadingNumber(assessment.moduleTitle);

    if (itemNumber === undefined || moduleNumber === undefined) continue;
    if (itemNumber === moduleNumber) continue;

    findings.push({
      id: `E6-${assessment.id}`,
      check: "E6",
      family: "naming",
      title: `"${assessment.title}" is in "${assessment.moduleTitle}", which is numbered differently`,
      values: [
        { label: "Item", value: assessment.title, source: "course_settings/module_meta.xml" },
        { label: "Module", value: assessment.moduleTitle, source: "course_settings/module_meta.xml" },
      ],
      itemIds: [assessment.id],
      suggestedPriority: "low",
      priorityReason: "The numbers do not line up, so the order on the syllabus may not be what a student sees.",
      notes: [],
      needsReview: false,
    });
  }

  return findings;
}

/** E7 — stray spaces and inconsistent punctuation in a title. */
function checkWhitespace(review: AssessmentReview): Finding[] {
  const findings: Finding[] = [];

  for (const assessment of review.assessments) {
    const problems: string[] = [];

    if (assessment.title !== assessment.title.trim()) problems.push("The title has a space at the start or the end");
    if (/\s{2,}/.test(assessment.title)) problems.push("The title has more than one space in a row");
    if (/[.,;:]$/.test(assessment.title)) problems.push("The title ends with punctuation");
    if (/[–—-]\s*$/.test(assessment.title)) problems.push("The title ends with a dash");

    if (problems.length === 0) continue;

    findings.push({
      id: `E7-${assessment.id}`,
      check: "E7",
      family: "naming",
      title: `"${assessment.title}" has ${problems.length === 1 ? "a spacing problem" : "spacing problems"}`,
      values: [{ label: "Title", value: JSON.stringify(assessment.title), source: "course_settings/module_meta.xml" }],
      itemIds: [assessment.id],
      suggestedPriority: "low",
      priorityReason: "Cosmetic, but it shows up in the gradebook and in listings.",
      notes: problems,
      needsReview: false,
    });
  }

  return findings;
}

/** The number a title starts with. */
function leadingNumber(title: string): number | undefined {
  const match = /^\s*(\d+)/.exec(title);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
}

/** The meaningful words of a title. */
function titleWords(title: string): string[] {
  return (title.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((word) => word !== "week" && word !== "assignment");
}

/** True when two names share enough words to be the same thing. */
function resemble(a: string, b: string): boolean {
  const left = new Set(titleWords(a));
  const right = new Set(titleWords(b));

  for (const word of left) {
    if (right.has(word)) return true;
  }

  // A rubric title often carries the assignment's words with the week number
  // changed, so compare the shapes too.
  return titlePattern(a) === titlePattern(b);
}

/** Sort assessments by their title, the way a reader would. */
export function byTitle(assessments: readonly Assessment[]): Assessment[] {
  return [...assessments].sort((a, b) => naturalCompare(a.title, b.title));
}
