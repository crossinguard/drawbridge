/**
 * The prep file: one plain-text document a reviewer can hand to an LLM
 * assistant.
 *
 * The file has to stand on its own. Whoever reads it cannot open the archive
 * and cannot ask the tool a follow-up question, so every fact it mentions is
 * written out, with the file it came from, and everything that could not be
 * read is listed rather than left out.
 *
 * The section order is fixed. An assistant can rely on finding the module map
 * in section 5 and the assessment details in section 10.
 */
import { summariseQuestions } from "@/lib/canvas/quiz";
import type { Rubric } from "@/lib/canvas/types";

import { naturalCompare } from "@/lib/utils";

import { describeQuiz, QUIZ_SETTINGS, type QuizComparisonGroup } from "./checks/quizzes";
import { usageLabel } from "./checks/legacy";
import type { Finding, Priority, ReviewRules } from "./findings";
import { FAMILY_LABELS, PRIORITIES, points as formatPoints, reviewMarker } from "./findings";
import type { Assessment, AssessmentReview, GroupReview, RubricReview } from "./model";
import { rubricSignature } from "./model";

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

/** Everything the prep file needs. */
export interface PrepFileInput {
  review: AssessmentReview;
  findings: Finding[];
  groups: QuizComparisonGroup[];
  rules: ReviewRules;
  overrides: ReviewOverrides;
  /** The file name the course was read from. */
  sourceName: string;
  /**
   * When false, only the assessments with findings are written out in full.
   *
   * The complete file is the default: it stands on its own for a reader who
   * cannot open the export. Very large courses produce very large files, so
   * a reviewer can narrow it to the items worth looking at.
   */
  includeEveryAssessment?: boolean;
}

/** Build the prep file. */
export function toPrepFile(input: PrepFileInput): string {
  const { review, findings, groups, rules, overrides } = input;
  const includeEveryAssessment = input.includeEveryAssessment ?? true;

  // The assessments worth writing out in full.
  const detailed = includeEveryAssessment
    ? review.assessments
    : review.assessments.filter((assessment) => findings.some((finding) => finding.itemIds.includes(assessment.id)));

  const lines: string[] = [];

  lines.push(...exportIdentity(review, input.sourceName));
  lines.push(
    ...aboutThisFile(review, findings, rules, includeEveryAssessment, review.assessments.length - detailed.length),
  );
  lines.push(...whatWasRead(review));
  lines.push(...gradebookStructure(review));
  lines.push(...moduleMap(review));
  lines.push(...assessmentSummary(review, findings, overrides));
  lines.push(...quizTable(review));
  lines.push(...quizConsistency(review, groups));
  lines.push(...factsByReviewStep(review, findings, groups));
  lines.push(...assessmentDetails(review, detailed, findings, overrides));
  lines.push(...rubricInventory(review));
  lines.push(...legacySummary(review));
  lines.push(...pagesAndDiscussions(review));
  lines.push(...notReadable(review));
  lines.push(...reviewRequiredSummary(findings, overrides));

  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n")}\n`;
}

// ---------------------------------------------------------------------------
// 1. Export identity
// ---------------------------------------------------------------------------

function exportIdentity(review: AssessmentReview, sourceName: string): string[] {
  const course = review.course;
  const lines: string[] = [];

  lines.push("# Canvas course assessment review");
  lines.push("");
  lines.push("## Export identity");
  lines.push("");
  lines.push(`**${course.meta.title}**`);
  lines.push("");

  const rows: [string, string][] = [];

  if (course.meta.code) rows.push(["Course code", course.meta.code]);
  rows.push(["Term of the export", termOf(review)]);
  rows.push(["Export date", course.meta.exportedAt ?? "not found in export"]);
  rows.push(["Source file", sourceName]);
  if (course.meta.accountName) rows.push(["Account", course.meta.accountName]);
  if (course.meta.domain) rows.push(["Exported from", course.meta.domain]);

  lines.push("| | |");
  lines.push("| --- | --- |");
  for (const [label, value] of rows) lines.push(`| ${label} | ${value} |`);

  if (review.dueRange) {
    lines.push("");
    lines.push(
      `Due dates in the course run from ${review.dueRange.from ?? "not in export"} to ${review.dueRange.to ?? "not in export"}.`,
    );
  }

  lines.push("");
  return lines;
}

/**
 * The term the export covers.
 *
 * Canvas does not record the term anywhere in the export, so it is read out of
 * the course title and code and labelled as inferred. When neither carries
 * one, the file says so rather than guessing.
 */
function termOf(review: AssessmentReview): string {
  const haystack = `${review.course.meta.title} ${review.course.meta.code}`;
  const match = /\b(20\d{2})[- ]?([12])\b/.exec(haystack);

  if (!match) return "not found in export";
  return `${match[1]}-${match[2]} (inferred from the course title and code; the export does not record the term)`;
}

// ---------------------------------------------------------------------------
// 2. About this file
// ---------------------------------------------------------------------------

function aboutThisFile(
  review: AssessmentReview,
  findings: Finding[],
  rules: ReviewRules,
  includeEveryAssessment: boolean,
  leftOut: number,
): string[] {
  const lines: string[] = [];

  lines.push("## About this file");
  lines.push("");
  lines.push(
    "This file holds everything that could be read out of a Canvas course export about the assessments in it, so that a reviewer — or an LLM assistant — can judge the course without opening the archive.",
  );
  lines.push("");
  lines.push("**What is included**");
  lines.push("");
  lines.push("- The structure of the gradebook: assignment groups, their weights, and the points in them.");
  lines.push(
    "- Every graded item: its settings, its written instructions in full, the rubric attached to it, and what its numbers add up to.",
  );
  lines.push("- Every rubric in the export, including the ones nothing attaches to.");
  lines.push(
    "- Every quiz's settings, where its questions come from, and how its settings compare with other quizzes of the same kind.",
  );
  lines.push("- The checks in section 9, each with the values compared and where each value came from.");
  lines.push("");

  const applied = rulesSummary(rules);
  if (applied.length > 0) {
    lines.push("**The rules the review applied**");
    lines.push("");
    for (const rule of applied) lines.push(`- ${rule}.`);
    lines.push("");
  }
  lines.push("**What is deliberately not included**");
  lines.push("");
  lines.push(
    "- Quiz question text, answer choices, and answer keys. Judging those needs a subject matter expert, so the tool does not read them.",
  );
  lines.push("- Learner names, submissions, and grades. The export does not carry them.");
  lines.push(
    "- The live state of the course: overrides, section dates, late policies that were applied, and mastery paths. This file describes the export, not the course as it stands.",
  );
  lines.push("");
  lines.push("**How to read the markers**");
  lines.push("");
  lines.push(
    `- \`${reviewMarker("reason")}\` marks something the reviewer has to resolve. Section 15 collects every one of them.`,
  );
  lines.push("- Every value is written with the file it came from, so a claim can be checked against the export.");
  lines.push(
    "- The wording is neutral on purpose. Where two layers differ, the file says they differ; it does not say which one is right.",
  );
  lines.push("");

  const urgent = findings.filter((finding) => finding.needsReview).length;
  lines.push(
    `${urgent} finding${urgent === 1 ? "" : "s"} across the course need${urgent === 1 ? "s" : ""} a reviewer's decision. They are listed in section 15.`,
  );
  lines.push("");

  if (!includeEveryAssessment && leftOut > 0) {
    lines.push(
      `**This file is a focused one.** The details of ${leftOut} assessment${leftOut === 1 ? "" : "s"} with no findings are left out. Everything else — the summary table, the facts, the findings, and the rubric inventory — is complete.`,
    );
    lines.push("");
  }

  void review;
  return lines;
}

// ---------------------------------------------------------------------------
// 3. What was read
// ---------------------------------------------------------------------------

function whatWasRead(review: AssessmentReview): string[] {
  const course = review.course;
  const lines: string[] = [];

  lines.push("## What was read");
  lines.push("");

  lines.push("| | Count |");
  lines.push("| --- | ---: |");
  lines.push(`| Files in the export | ${course.filesRead.length + course.unreadable.length} |`);
  lines.push(`| Files read | ${course.filesRead.length} |`);
  lines.push(`| Files that could not be read | ${course.unreadable.length} |`);
  lines.push(`| Modules | ${course.modules.length} |`);
  lines.push(`| Module items | ${course.items.length} |`);
  lines.push(`| Graded items | ${review.assessments.length} |`);
  lines.push(`| Quizzes | ${review.assessments.filter((a) => a.kind === "quiz").length} |`);
  lines.push(`| Rubrics | ${review.rubrics.length} |`);
  lines.push(`| Item banks | ${review.itemBanks.length} |`);
  lines.push(`| Assignment groups | ${review.groups.filter((group) => group.id !== "").length} |`);
  lines.push("");

  if (course.unreadable.length > 0) {
    lines.push("**Files that could not be read**");
    lines.push("");
    for (const file of course.unreadable) lines.push(`- \`${file.path}\` — ${file.reason}`);
    lines.push("");
  }

  if (course.warnings.length > 0) {
    lines.push("**Notes on how the export was read**");
    lines.push("");
    const counts = new Map<string, number>();
    for (const warning of course.warnings) {
      const key = warning.replace(/`[^`]+`/g, "a file");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    for (const [note, count] of counts) {
      lines.push(`- ${count > 1 ? `${count} files had the same problem: ` : ""}${note}`);
    }
    lines.push("");
  }

  return lines;
}

// ---------------------------------------------------------------------------
// 4. Gradebook structure
// ---------------------------------------------------------------------------

function gradebookStructure(review: AssessmentReview): string[] {
  const lines: string[] = [];

  lines.push("## Gradebook structure");
  lines.push("");

  lines.push(
    review.weighting === "percent"
      ? "The course is weighted by percentage: each assignment group's weight is its share of the final grade."
      : review.weighting === "points"
        ? "The course is weighted by points: the final grade comes from the points, not from the group weights."
        : "The course has no group weights recorded, so the final grade comes from the points.",
  );
  lines.push("");

  lines.push("| Group | Weight | Items | Points | Share of the points |");
  lines.push("| --- | ---: | ---: | ---: | ---: |");

  for (const group of review.groups) {
    lines.push(
      `| ${group.title} | ${group.weight}% | ${group.assessments.length} | ${formatPoints(group.pointsTotal)} | ${group.pointsShare.toFixed(1)}% |`,
    );
  }

  const totalPoints = review.groups.reduce((sum, group) => sum + group.pointsTotal, 0);
  const totalWeight = review.groups.filter((group) => group.id !== "").reduce((sum, group) => sum + group.weight, 0);

  lines.push("");
  lines.push(
    `The groups hold ${formatPoints(totalPoints)} points in total, and their weights add up to ${formatPoints(totalWeight)}%.`,
  );
  lines.push("");

  return lines;
}

// ---------------------------------------------------------------------------
// 5. Module map
// ---------------------------------------------------------------------------

function moduleMap(review: AssessmentReview): string[] {
  const lines: string[] = [];

  lines.push("## Module map");
  lines.push("");

  if (review.course.modules.length === 0) {
    lines.push("The export has no modules.");
    lines.push("");
    return lines;
  }

  for (const module of review.course.modules) {
    lines.push(`### ${module.title}`);
    lines.push("");
    lines.push(`_State: ${module.state}. ${module.items.length} item(s)._`);
    lines.push("");

    if (module.items.length === 0) {
      lines.push("- (no items)");
      lines.push("");
      continue;
    }

    for (const moduleItem of module.items) {
      const assessment = review.assessments.find((entry) => entry.item.itemId === moduleItem.id);
      const parts: string[] = [moduleItem.contentType];

      if (assessment) {
        parts.push(`${formatPoints(assessment.pointsPossible)} points`);
        if (assessment.groupTitle) parts.push(`group "${assessment.groupTitle}"`);
        if (assessment.rubricId) parts.push("has a rubric");
      }

      lines.push(`- ${moduleItem.title} — ${parts.join(", ")} (${moduleItem.state})`);
    }

    lines.push("");
  }

  const outside = review.assessments.filter((assessment) => !assessment.inModule);
  if (outside.length > 0) {
    lines.push("### Graded items in no module");
    lines.push("");
    for (const assessment of outside) {
      lines.push(`- ${assessment.title} — ${formatPoints(assessment.pointsPossible)} points`);
    }
    lines.push("");
  }

  return lines;
}

// ---------------------------------------------------------------------------
// 6. Assessment summary
// ---------------------------------------------------------------------------

function assessmentSummary(review: AssessmentReview, findings: Finding[], overrides: ReviewOverrides): string[] {
  const lines: string[] = [];

  lines.push("## Assessment summary");
  lines.push("");
  lines.push("| Assessment | Type | Module | Group | Points | Rubric | Rubric points | State | Usage |");
  lines.push("| --- | --- | --- | --- | ---: | --- | ---: | --- | --- |");

  for (const assessment of sorted(review.assessments)) {
    const rubric = rubricFor(review, assessment);
    const usage = review.usage.byId.get(assessment.id)?.state ?? "unclear";
    const itemFindings = findings.filter((finding) => finding.itemIds.includes(assessment.id));

    lines.push(
      `| ${escapeCell(assessment.title)} | ${assessment.kind} | ${assessment.moduleTitle ?? "—"} | ${assessment.groupTitle ?? "not in export"} | ${formatPoints(assessment.pointsPossible)} | ${rubric ? escapeCell(rubric.rubric.title) : "none attached"} | ${rubric ? formatPoints(rubric.rubric.pointsPossible) : "—"} | ${assessment.state} | ${usageLabel(usage)}${itemFindings.length > 0 ? ` (${itemFindings.length} finding${itemFindings.length === 1 ? "" : "s"})` : ""} |`,
    );
  }

  lines.push("");
  void overrides;
  return lines;
}

// ---------------------------------------------------------------------------
// 7. Quiz table
// ---------------------------------------------------------------------------

function quizTable(review: AssessmentReview): string[] {
  const lines: string[] = [];

  const quizzes = review.assessments.filter((assessment) => assessment.kind === "quiz");
  if (quizzes.length === 0) {
    lines.push("## Quizzes");
    lines.push("");
    lines.push("The course has no quizzes.");
    lines.push("");
    return lines;
  }

  lines.push("## Quizzes");
  lines.push("");
  lines.push("| Quiz | Engine | Questions from | Questions | Banks | Points | Readable from |");
  lines.push("| --- | --- | --- | ---: | ---: | ---: | --- |");

  for (const assessment of sorted(quizzes)) {
    const described = describeQuiz(assessment);
    lines.push(
      `| ${escapeCell(assessment.title)} | ${described.engine} | ${described.source} | ${described.questions} | ${described.banks} | ${formatPoints(assessment.pointsPossible)} | ${described.readability} |`,
    );
  }

  lines.push("");
  lines.push("### Where each quiz's questions come from");
  lines.push("");

  for (const assessment of sorted(quizzes)) {
    const quiz = assessment.quiz;
    if (!quiz) {
      lines.push(`- **${assessment.title}** — the export does not carry this quiz's settings or questions.`);
      continue;
    }

    const summary = summariseQuestions(quiz);
    const parts: string[] = [];

    if (summary.inline > 0) parts.push(`${summary.inline} question(s) stored in the quiz`);
    if (summary.drawn) parts.push(`${summary.drawn} question(s) drawn from item banks`);

    for (const selection of quiz.selections) {
      const source = selection.bankTitle
        ? `"${selection.bankTitle}"`
        : selection.bankId
          ? `bank ${selection.bankId}`
          : "the quiz's own questions";
      const count = selection.count === undefined ? "an unknown number of" : String(selection.count);
      const worth = selection.pointsPerItem === undefined ? "an unknown number of" : String(selection.pointsPerItem);
      parts.push(`${count} question(s) from ${source} at ${worth} point(s) each`);
    }

    lines.push(
      `- **${assessment.title}** — ${parts.length > 0 ? parts.join("; ") : "no questions found in the export"}`,
    );
  }

  lines.push("");
  return lines;
}

// ---------------------------------------------------------------------------
// 8. Quiz consistency
// ---------------------------------------------------------------------------

function quizConsistency(review: AssessmentReview, groups: QuizComparisonGroup[]): string[] {
  const lines: string[] = [];

  lines.push("## Quiz consistency");
  lines.push("");

  if (groups.length === 0) {
    lines.push("The course has no quizzes to compare.");
    lines.push("");
    return lines;
  }

  for (const group of groups) {
    lines.push(`### ${group.title}`);
    lines.push("");
    lines.push(`_${group.quizzes.length} quiz(es). Grouped because: ${group.reason.toLowerCase()}._`);
    lines.push("");

    lines.push(`| Quiz | ${QUIZ_SETTINGS.map((setting) => setting.label).join(" | ")} |`);
    lines.push(`| --- | ${QUIZ_SETTINGS.map(() => "---").join(" | ")} |`);

    for (const quiz of group.quizzes) {
      const cells = QUIZ_SETTINGS.map((setting) => {
        const value = quiz.quiz ? setting.read(quiz.quiz) : undefined;
        return value === undefined ? "not in export" : value;
      });
      lines.push(`| ${escapeCell(quiz.title)} | ${cells.join(" | ")} |`);
    }

    lines.push("");
  }

  void review;
  return lines;
}

// ---------------------------------------------------------------------------
// 9. Facts by review step
// ---------------------------------------------------------------------------

function factsByReviewStep(review: AssessmentReview, findings: Finding[], groups: QuizComparisonGroup[]): string[] {
  const lines: string[] = [];

  lines.push("## Facts by review step");
  lines.push("");

  // Points.
  lines.push("### Points");
  lines.push("");

  for (const assessment of sorted(review.assessments)) {
    const facts: string[] = [];

    facts.push(`worth ${formatPoints(assessment.pointsPossible)} points`);

    if (assessment.quiz) {
      const summary = summariseQuestions(assessment.quiz);
      facts.push(`its questions add up to ${formatPoints(summary.points)} points`);
    }

    const rubric = rubricFor(review, assessment);
    if (rubric) {
      facts.push(`its rubric "${rubric.rubric.title}" totals ${formatPoints(rubric.rubric.pointsPossible)} points`);
      facts.push(
        assessment.rubricUseForGrading
          ? "the rubric drives the score"
          : "the rubric is attached but does not drive the score",
      );
    }

    lines.push(`- **${assessment.title}** — ${facts.join("; ")}.`);
  }

  lines.push("");

  // Naming and gradebook.
  lines.push("### Naming and the gradebook");
  lines.push("");

  for (const group of review.groups) {
    if (group.id === "") continue;
    lines.push(
      `- **${group.title}** — ${group.weight}% of the grade, ${group.assessments.length} item(s), ${formatPoints(group.pointsTotal)} points (${group.pointsShare.toFixed(1)}% of the points).`,
    );
  }

  const itemsWithNoGroup = review.assessments.filter((assessment) => !assessment.groupId);
  if (itemsWithNoGroup.length > 0) {
    lines.push("");
    lines.push(
      `- ${itemsWithNoGroup.length} graded item(s) are in no assignment group: ${itemsWithNoGroup.map((assessment) => assessment.title).join("; ")}.`,
    );
  }

  lines.push("");

  // Quiz settings.
  lines.push("### Quiz settings");
  lines.push("");

  for (const assessment of sorted(review.assessments.filter((entry) => entry.kind === "quiz"))) {
    const quiz = assessment.quiz;
    if (!quiz) {
      lines.push(`- **${assessment.title}** — settings not in export.`);
      continue;
    }

    const facts = QUIZ_SETTINGS.map((setting) => {
      const value = setting.read(quiz);
      return `${setting.label.toLowerCase()}: ${value ?? "not in export"}`;
    });

    lines.push(`- **${assessment.title}** — ${facts.join(", ")}.`);
  }

  lines.push("");

  // Rubrics and instructions.
  lines.push("### Rubrics and instructions");
  lines.push("");

  for (const assessment of sorted(review.assessments)) {
    const rubric = rubricFor(review, assessment);
    if (!rubric) continue;

    lines.push(
      `- **${assessment.title}** — rubric "${rubric.rubric.title}" (${rubric.rubric.criteria.length} criteria, ${formatPoints(rubric.rubric.pointsPossible)} points); instructions ${assessment.instructions.trim() === "" ? "not in export" : `from ${assessment.instructionsSource ?? "the item's instructions"}`}.`,
    );
  }

  lines.push("");

  // Usage and state.
  lines.push("### Usage and state");
  lines.push("");

  for (const assessment of sorted(review.assessments)) {
    const usage = review.usage.byId.get(assessment.id);
    if (!usage) continue;

    lines.push(`- **${assessment.title}** — ${usageLabel(usage.state)}: ${usage.reasons.join("; ")}.`);
  }

  lines.push("");

  void findings;
  void groups;
  return lines;
}

// ---------------------------------------------------------------------------
// 10. Assessment details
// ---------------------------------------------------------------------------

function assessmentDetails(
  review: AssessmentReview,
  detailed: Assessment[],
  findings: Finding[],
  overrides: ReviewOverrides,
): string[] {
  const lines: string[] = [];

  lines.push("## Assessment details");
  lines.push("");

  for (const assessment of sorted(detailed)) {
    lines.push(`### ${assessment.title}`);
    lines.push("");

    const facts: string[] = [];
    facts.push(`Type: ${assessment.kind}`);
    if (assessment.moduleTitle)
      facts.push(`Module: ${assessment.moduleTitle} (${assessment.moduleState ?? "unknown state"})`);
    if (assessment.groupTitle) facts.push(`Assignment group: ${assessment.groupTitle}`);
    facts.push(`Points: ${formatPoints(assessment.pointsPossible)}`);
    if (assessment.dueAt) facts.push(`Due: ${assessment.dueAt}`);
    facts.push(`State: ${assessment.state}`);

    const usage = review.usage.byId.get(assessment.id);
    if (usage) facts.push(`Usage: ${usageLabel(usage.state)} — ${usage.reasons.join("; ")}`);

    lines.push(...facts.map((fact) => `- ${fact}`));
    lines.push("");

    // The quiz settings, where there are any.
    if (assessment.quiz) {
      lines.push("**Quiz settings**");
      lines.push("");
      for (const setting of QUIZ_SETTINGS) {
        const value = setting.read(assessment.quiz);
        lines.push(`- ${setting.label}: ${value ?? "not in export"}`);
      }
      lines.push("");
    }

    // The instructions, in full.
    lines.push("**Instructions**");
    lines.push("");

    if (assessment.instructions.trim() === "") {
      lines.push("_Not in the export._");
      lines.push("");
    } else {
      lines.push(`_From ${assessment.instructionsSource ?? "the item's instructions"}._`);
      lines.push("");
      for (const block of assessment.instructions.split("\n")) {
        lines.push(block === "" ? "" : block);
      }
      lines.push("");
    }

    // The rubric, in full.
    const rubric = rubricFor(review, assessment);
    if (rubric) {
      lines.push("**Rubric**");
      lines.push("");
      lines.push(...rubricBlock(rubric.rubric));
      lines.push("");
    }

    // The findings about this item.
    const itemFindings = findings.filter((finding) => finding.itemIds.includes(assessment.id));
    if (itemFindings.length > 0) {
      lines.push("**Findings about this item**");
      lines.push("");
      for (const finding of itemFindings) {
        lines.push(`- ${finding.title} _(${finding.check}, ${effectivePriority(finding, overrides)} priority)_`);
        for (const note of finding.notes) lines.push(`  - ${note}`);
      }
      lines.push("");
    }
  }

  return lines;
}

/** A rubric, written out in full. */
function rubricBlock(rubric: Rubric): string[] {
  const lines: string[] = [];

  lines.push(`- Name: ${rubric.title}`);
  lines.push(`- Stated total: ${formatPoints(rubric.pointsPossible)} points`);
  lines.push(`- Criteria: ${rubric.criteria.length}`);

  for (const criterion of rubric.criteria) {
    lines.push("");
    lines.push(
      `- **${criterion.description || "(unnamed criterion)"}** — ${formatPoints(criterion.points)} points${criterion.useRange ? " (levels are a range)" : ""}`,
    );
    if (criterion.longDescription) lines.push(`  - ${criterion.longDescription}`);

    for (const rating of criterion.ratings) {
      lines.push(`  - Level "${rating.description || "(unnamed level)"}": ${formatPoints(rating.points)} points`);
      if (rating.longDescription) lines.push(`    - ${rating.longDescription}`);
    }
  }

  return lines;
}

// ---------------------------------------------------------------------------
// 11. Rubric inventory
// ---------------------------------------------------------------------------

function rubricInventory(review: AssessmentReview): string[] {
  const lines: string[] = [];

  lines.push("## Rubric inventory");
  lines.push("");

  if (review.rubrics.length === 0) {
    lines.push("The export has no rubrics.");
    lines.push("");
    return lines;
  }

  lines.push("| Rubric | Points | Criteria | Attached to | Copies |");
  lines.push("| --- | ---: | ---: | --- | ---: |");

  for (const entry of sortedRubrics(review.rubrics)) {
    const attached =
      entry.attachedTo.length > 0
        ? entry.attachedTo.map((assessment) => assessment.title).join("; ")
        : "no attachment found";

    lines.push(
      `| ${escapeCell(entry.rubric.title)} | ${formatPoints(entry.rubric.pointsPossible)} | ${entry.rubric.criteria.length} | ${escapeCell(attached)} | ${entry.duplicates.length} |`,
    );
  }

  lines.push("");

  // The duplicate groups, written out once so the reviewer can see them.
  const written = new Set<string>();

  for (const entry of sortedRubrics(review.rubrics)) {
    if (entry.duplicates.length === 0) continue;

    const signature = rubricSignature(entry.rubric);
    if (written.has(signature)) continue;
    written.add(signature);

    lines.push(`### Rubrics with identical criteria and levels`);
    lines.push("");
    lines.push(
      `These ${entry.duplicates.length + 1} rubrics have the same criteria and the same levels. Their content is written out once below.`,
    );
    lines.push("");
    for (const duplicate of entry.duplicates) {
      lines.push(`- ${duplicate.rubric.title}`);
    }
    lines.push(`- ${entry.rubric.title}`);
    lines.push("");
    lines.push(...rubricBlock(entry.rubric));
    lines.push("");
  }

  return lines;
}

// ---------------------------------------------------------------------------
// 12. Legacy and unused summary
// ---------------------------------------------------------------------------

function legacySummary(review: AssessmentReview): string[] {
  const lines: string[] = [];

  lines.push("## Legacy and unused content");
  lines.push("");

  const legacy = [...review.usage.byId.values()].filter((entry) => entry.state === "probably-legacy");
  const unclear = [...review.usage.byId.values()].filter((entry) => entry.state === "unclear");

  if (legacy.length === 0 && unclear.length === 0) {
    lines.push("Nothing in the export looks like a leftover, and nothing could not be placed.");
    lines.push("");
    return lines;
  }

  if (legacy.length > 0) {
    lines.push("### Probably legacy");
    lines.push("");
    for (const entry of legacy) {
      lines.push(`- **${entry.title}** — ${entry.reasons.join("; ")}.`);
    }
    lines.push("");
  }

  if (unclear.length > 0) {
    lines.push("### Unclear");
    lines.push("");
    for (const entry of unclear) {
      lines.push(`- **${entry.title}** — ${entry.reasons.join("; ")}.`);
    }
    lines.push("");
  }

  return lines;
}

// ---------------------------------------------------------------------------
// 13. Pages and discussions
// ---------------------------------------------------------------------------

function pagesAndDiscussions(review: AssessmentReview): string[] {
  const lines: string[] = [];

  const items = [...review.course.items, ...review.course.orphans].filter(
    (item) => item.kind === "page" || item.kind === "discussion",
  );

  lines.push("## Pages and discussions");
  lines.push("");

  if (items.length === 0) {
    lines.push("The course has no pages or discussions.");
    lines.push("");
    return lines;
  }

  lines.push("| Name | Type | Module | State | Usage |");
  lines.push("| --- | --- | --- | --- | --- |");

  for (const item of items.sort((a, b) => naturalCompare(a.title, b.title))) {
    const usage = review.usage.byId.get(item.id);
    lines.push(
      `| ${escapeCell(item.title)} | ${item.kind} | ${item.moduleTitle ?? "—"} | ${item.state} | ${usage ? usageLabel(usage.state) : "unclear"} |`,
    );
  }

  lines.push("");
  return lines;
}

// ---------------------------------------------------------------------------
// 14. Not readable from this export
// ---------------------------------------------------------------------------

function notReadable(review: AssessmentReview): string[] {
  const lines: string[] = [];

  lines.push("## Not readable from this export");
  lines.push("");
  lines.push(
    "These are the gaps in what the export carries. They are listed so that nothing looks complete when it is not.",
  );
  lines.push("");

  const gaps: string[] = [];

  const quizzesWithoutSettings = review.assessments.filter(
    (assessment) => assessment.kind === "quiz" && !assessment.quiz?.settingsSource,
  );
  if (quizzesWithoutSettings.length > 0) {
    gaps.push(
      `- **${quizzesWithoutSettings.length} quiz(es) have no settings in the export.** Their attempts, time limit, and shuffling have to be checked in Canvas: ${quizzesWithoutSettings.map((assessment) => assessment.title).join("; ")}. ${reviewMarker("quiz settings not in export")}`,
    );
  }

  const withoutInstructions = review.assessments.filter((assessment) => assessment.instructions.trim() === "");
  if (withoutInstructions.length > 0) {
    gaps.push(
      `- **${withoutInstructions.length} graded item(s) have no instructions in the export.** ${withoutInstructions.map((assessment) => assessment.title).join("; ")}.`,
    );
  }

  const banks = review.itemBanks;
  if (banks.length > 0) {
    const unused = banks.filter((bank) => bank.usedBy.length === 0);
    gaps.push(
      `- **The contents of ${banks.length} item bank(s) were not read.** The review reports what each quiz draws from a bank and what each question is worth, and nothing about what is inside a bank.${unused.length > 0 ? ` ${unused.length} bank(s) are not drawn from by any quiz in the export: ${unused.map((bank) => bank.title).join("; ")}.` : ""}`,
    );
  }

  gaps.push(
    "- **Learner data is not in the export.** No names, submissions, or grades were read, so nothing here says how a student actually scored.",
  );
  gaps.push(
    "- **The live state of the course is not in the export.** Overrides, section dates, late policies that were applied, and mastery paths are not part of it. This file describes the export, not the course as it stands.",
  );
  gaps.push(
    "- **Quiz question text, answer choices, and answer keys were not read.** Whether an item is keyed correctly needs a subject matter expert and is outside what this review does.",
  );
  gaps.push(
    "- **A course map or syllabus was not supplied,** so no title, point, or weight comparison was made against one.",
  );
  gaps.push(
    "- **Instructional design was not reviewed.** The order of the modules, the fit between the learning objectives and the activities, and the accessibility of the resources are outside this review.",
  );

  for (const gap of gaps) lines.push(gap);
  lines.push("");

  return lines;
}

// ---------------------------------------------------------------------------
// 15. The review-required summary
// ---------------------------------------------------------------------------

function reviewRequiredSummary(findings: Finding[], overrides: ReviewOverrides): string[] {
  const lines: string[] = [];

  lines.push("## [REVIEW REQUIRED] summary");
  lines.push("");

  const needed = findings.filter((finding) => finding.needsReview);

  if (needed.length === 0) {
    lines.push("No finding was marked as needing a decision.");
    lines.push("");
    lines.push(
      "That is not the same as saying the course is fine. The gaps listed in section 14 still stand, and the sections above only report what the export says.",
    );
    lines.push("");
    return lines;
  }

  for (const priority of PRIORITIES) {
    const inPriority = needed.filter((finding) => effectivePriority(finding, overrides) === priority);
    if (inPriority.length === 0) continue;

    lines.push(`### ${priority[0].toUpperCase()}${priority.slice(1)} priority`);
    lines.push("");

    for (const finding of inPriority) {
      lines.push(`- ${reviewMarker(finding.priorityReason)} **${finding.title}** _(${finding.check})_`);

      for (const value of finding.values) {
        lines.push(`  - ${value.label}: ${value.value} _(from ${value.source})_`);
      }
      for (const note of finding.notes) {
        lines.push(`  - ${note}`);
      }
    }

    lines.push("");
  }

  lines.push(`**${needed.length} item(s) in total need a decision.**`);
  lines.push("");

  return lines;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** The assessments, in a readable order. */
function sorted(assessments: readonly Assessment[]): Assessment[] {
  return [...assessments].sort((a, b) => {
    const module = naturalCompare(a.moduleTitle ?? "", b.moduleTitle ?? "");
    if (module !== 0) return module;
    return naturalCompare(a.title, b.title);
  });
}

/** The rubrics, in a readable order. */
function sortedRubrics(rubrics: readonly RubricReview[]): RubricReview[] {
  return [...rubrics].sort((a, b) => naturalCompare(a.rubric.title, b.rubric.title));
}

/** The rubric attached to an assessment. */
function rubricFor(review: AssessmentReview, assessment: Assessment): RubricReview | undefined {
  if (!assessment.rubricId) return undefined;
  return review.rubrics.find((entry) => entry.rubric.id === assessment.rubricId);
}

/** Make a value safe to put in a Markdown table cell. */
function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

/** The family a finding belongs to, for the summary. */
export function familyLabel(finding: Finding): string {
  return FAMILY_LABELS[finding.family];
}

/** The rules the review was run with, for the screen. */
export function rulesSummary(rules: ReviewRules): string[] {
  const applied: string[] = [];

  if (rules.defaults.shuffleAnswers) applied.push("answers should be shuffled when the instructions are silent");
  if (rules.defaults.reviewTimeLimit) applied.push("the time limit is reviewed when the instructions are silent");
  if (rules.defaults.reviewAttempts) applied.push("attempts are reviewed when the instructions are silent");

  return applied;
}

/** The group a quiz is in, after the reviewer's changes. */
export function groupOf(groups: QuizComparisonGroup[], quizId: string, overrides: ReviewOverrides): string | undefined {
  const override = overrides.quizGroups.get(quizId);
  if (override) return override;

  for (const group of groups) {
    if (group.quizzes.some((quiz) => quiz.id === quizId)) return group.id;
  }

  return undefined;
}

/** The groups with the reviewer's changes applied. */
export function applyGroupOverrides(groups: QuizComparisonGroup[], overrides: ReviewOverrides): QuizComparisonGroup[] {
  if (overrides.quizGroups.size === 0) return groups;

  const moved = new Map<string, string>();
  for (const [quizId, groupId] of overrides.quizGroups) moved.set(quizId, groupId);

  const result = groups.map((group) => ({ ...group, quizzes: [...group.quizzes] }));

  for (const group of result) {
    group.quizzes = group.quizzes.filter((quiz) => (moved.get(quiz.id) ?? group.id) === group.id);
  }

  const byId = new Map(result.map((group) => [group.id, group]));

  for (const [quizId, groupId] of moved) {
    const target = byId.get(groupId);
    if (!target) continue;

    const source = result.find((group) => group.quizzes.some((quiz) => quiz.id === quizId));
    const quiz = source?.quizzes.find((entry) => entry.id === quizId);
    if (quiz && !target.quizzes.some((entry) => entry.id === quizId)) target.quizzes.push(quiz);
  }

  return result.filter((group) => group.quizzes.length > 0);
}

/** The group a quiz belongs to, by title. */
export function groupByTitle(groups: QuizComparisonGroup[], title: string): QuizComparisonGroup | undefined {
  return groups.find((group) => group.quizzes.some((quiz) => quiz.title === title));
}

/** The points in a group, for the screen. */
export function groupPoints(group: GroupReview): number {
  return group.pointsTotal;
}
