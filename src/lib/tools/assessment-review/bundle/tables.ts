/**
 * The tables the export carries.
 *
 * One row per object. Every value has a source label, and a value the export
 * did not carry is written as "not in export" rather than left blank.
 */
import type { CourseItem } from "@/lib/canvas/types";

import {
  NOT_APPLICABLE,
  NOT_IN_EXPORT,
  points as formatPoints,
  type Candidate,
  type Finding,
} from "@/lib/tools/assessment-review/findings";
import type { Assessment, AssessmentReview } from "@/lib/tools/assessment-review/model";
import type { QuizComparisonGroup, QuizFamily } from "@/lib/tools/assessment-review/checks/quizzes";
import { describeQuiz, QUIZ_SETTINGS } from "@/lib/tools/assessment-review/checks/quizzes";

import { table, type Table } from "./csv";

/** The text of an item's instructions, keyed by the items that share it. */
export interface TextStore {
  /** The id of each stored text. */
  idFor: (assessment: Assessment) => string | undefined;
  /** The text itself. */
  textFor: (id: string) => string | undefined;
  /** Every stored text. */
  entries: { id: string; hash: string; kind: string; text: string; itemIds: string[] }[];
}

/** Build the table of graded items. */
export function assessmentsTable(review: AssessmentReview, findings: Finding[], texts: TextStore): Table {
  const rows = review.assessments.map((assessment) => {
    const rubric = review.rubrics.find((entry) => entry.rubric.id === assessment.rubricId)?.rubric;
    const usage = review.usage.byId.get(assessment.id);
    const itemFindings = findings.filter((finding) => finding.affected.includes(assessment.id));

    return [
      assessment.id,
      assessment.kind,
      assessment.title,
      assessment.ownTitle ?? NOT_IN_EXPORT,
      moduleList(assessment),
      String(assessment.moduleRefs.length),
      assessment.groupId ?? NOT_IN_EXPORT,
      assessment.groupTitle ?? NOT_IN_EXPORT,
      formatPoints(assessment.pointsPossible),
      assessment.rubricId ?? NOT_IN_EXPORT,
      rubric?.title ?? NOT_IN_EXPORT,
      assessment.rubricId ? (assessment.rubricUseForGrading ? "yes" : "no") : NOT_APPLICABLE,
      assessment.dueAt ?? NOT_IN_EXPORT,
      assessment.state,
      usage?.state ?? "unclear",
      usage?.reasons.join("; ") ?? NOT_IN_EXPORT,
      assessment.instructions.trim() === "" ? "no" : "yes",
      texts.idFor(assessment) ?? NOT_IN_EXPORT,
      assessment.instructionsSource ?? NOT_IN_EXPORT,
      String(itemFindings.length),
      list(itemFindings.map((finding) => finding.id)),
    ];
  });

  return table(
    "data_assessments.csv",
    "Every graded item in the course: one row per item, with the modules it sits in, its group, its points, and its rubric.",
    [
      "assessment_id",
      "kind",
      "title",
      "own_title",
      "modules",
      "module_count",
      "group_id",
      "group_title",
      "points_possible",
      "rubric_id",
      "rubric_title",
      "rubric_drives_score",
      "due_at",
      "state",
      "usage_state",
      "usage_reasons",
      "has_instructions",
      "instructions_text_id",
      "instructions_source",
      "finding_count",
      "finding_ids",
    ],
    rows,
  );
}

/** Build the table of quizzes: one row per quiz, one column per setting. */
export function quizzesTable(
  review: AssessmentReview,
  findings: Finding[],
  families: QuizFamily[],
  groups: QuizComparisonGroup[],
  texts: TextStore,
): Table {
  const quizzes = review.assessments.filter((assessment) => assessment.kind === "quiz");

  const rows = quizzes.map((assessment) => {
    const quiz = assessment.quiz;
    const described = describeQuiz(assessment);
    const family = families.find((entry) => entry.members.some((member) => member.id === assessment.id));
    const group = groups.find((entry) => entry.quizzes.some((member) => member.id === assessment.id));
    const itemFindings = findings.filter((finding) => finding.affected.includes(assessment.id));

    const cells: string[] = [
      assessment.id,
      assessment.title,
      described.engine,
      family?.id ?? NOT_IN_EXPORT,
      group?.title ?? NOT_IN_EXPORT,
      assessment.groupTitle ?? NOT_IN_EXPORT,
      formatPoints(assessment.pointsPossible),
      described.source,
      described.questions,
      String(quiz?.questionCount ?? 0),
      String(quiz?.drawnCount ?? 0),
      formatPoints(quiz?.pointsTotal),
      described.banks,
      String(quiz?.selections.filter((selection) => selection.bankId).length),
      quiz?.accessCode ? "yes" : "no",
      quiz?.settingsSource ?? NOT_IN_EXPORT,
      assessment.instructions.trim() === "" ? "no" : "yes",
      texts.idFor(assessment) ?? NOT_IN_EXPORT,
      String(itemFindings.length),
      list(itemFindings.map((finding) => finding.id)),
    ];

    for (const setting of QUIZ_SETTINGS) {
      cells.push(quiz ? (setting.read(quiz) ?? NOT_IN_EXPORT) : NOT_IN_EXPORT);
    }

    return cells;
  });

  const columns = [
    "quiz_id",
    "title",
    "engine",
    "family_id",
    "comparison_group",
    "group_title",
    "points_possible",
    "questions_from",
    "questions_total",
    "questions_inline",
    "questions_drawn",
    "question_points",
    "banks_used",
    "bank_draws",
    "access_code_set",
    "settings_source",
    "has_instructions",
    "instructions_text_id",
    "finding_count",
    "finding_ids",
    ...QUIZ_SETTINGS.map((setting) => setting.id),
  ];

  return table(
    "data_quizzes.csv",
    "Every quiz in the course: one row per quiz, with one column per setting, the family it belongs to, and where its questions come from.",
    columns,
    rows,
  );
}

/** Build the table of rubrics. */
export function rubricsTable(review: AssessmentReview, findings: Finding[], includeLegacy = true): Table {
  const rubrics = includeLegacy
    ? review.rubrics
    : review.rubrics.filter((entry) => review.usage.byId.get(entry.rubric.id)?.state !== "probably-legacy");

  const rows = rubrics.map((entry) => {
    const usage = review.usage.byId.get(entry.rubric.id);

    return [
      entry.rubric.id,
      entry.rubric.title,
      entry.familyId,
      String(entry.duplicates.length + 1),
      formatPoints(entry.rubric.pointsPossible),
      String(entry.rubric.criteria.length),
      entry.rubric.criteria.map((criterion) => criterion.ratings.length).join("; "),
      entry.rubric.reusable ? "yes" : "no",
      entry.rubric.readOnly ? "yes" : "no",
      String(entry.attachedTo.length),
      list(entry.attachedTo.map((assessment) => assessment.id)),
      list(entry.attachedTo.map((assessment) => assessment.title)),
      usage?.state ?? "unclear",
      usage?.reasons.join("; ") ?? NOT_IN_EXPORT,
      String(findings.filter((finding) => finding.affected.includes(entry.rubric.id)).length),
      "course_settings/rubrics.xml",
    ];
  });

  return table(
    "data_rubrics.csv",
    "Every rubric in the export, including the ones nothing attaches to, with the family of identical copies it belongs to.",
    [
      "rubric_id",
      "title",
      "family_id",
      "family_size",
      "points_possible",
      "criteria_count",
      "levels_per_criterion",
      "reusable",
      "read_only",
      "attached_count",
      "attached_item_ids",
      "attached_item_titles",
      "usage_state",
      "usage_reasons",
      "finding_count",
      "source",
    ],
    rows,
  );
}

/** Build the table of rubric criteria. */
export function rubricCriteriaTable(review: AssessmentReview, includeLegacy = true): Table {
  const rows: string[][] = [];

  const rubrics = includeLegacy
    ? review.rubrics
    : review.rubrics.filter((entry) => review.usage.byId.get(entry.rubric.id)?.state !== "probably-legacy");

  for (const entry of rubrics) {
    for (const criterion of entry.rubric.criteria) {
      rows.push([
        entry.rubric.id,
        entry.rubric.title,
        entry.familyId,
        criterion.id,
        criterion.description || NOT_IN_EXPORT,
        formatPoints(criterion.points),
        criterion.useRange ? "yes" : "no",
        String(criterion.ratings.length),
        criterion.ratings
          .map((rating) => `${rating.description || "(unnamed level)"}=${formatPoints(rating.points)}`)
          .join(" | "),
        criterion.longDescription || NOT_IN_EXPORT,
        "course_settings/rubrics.xml",
      ]);
    }
  }

  return table(
    "data_rubric_criteria.csv",
    "Every criterion of every rubric, with the levels it defines.",
    [
      "rubric_id",
      "rubric_title",
      "family_id",
      "criterion_id",
      "description",
      "points",
      "use_range",
      "level_count",
      "levels",
      "long_description",
      "source",
    ],
    rows,
  );
}

/** Build the table of assignment groups. */
export function groupsTable(review: AssessmentReview): Table {
  const rows = review.groups.map((group) => [
    group.id || "no-group",
    group.title,
    formatPoints(group.weight),
    String(group.assessments.length),
    formatPoints(group.pointsTotal),
    group.pointsShare.toFixed(1),
    list(group.assessments.map((assessment) => assessment.id)),
    list(group.assessments.map((assessment) => assessment.title)),
    "course_settings/assignment_groups.xml",
  ]);

  return table(
    "data_gradebook_groups.csv",
    "The gradebook structure: one row per assignment group, with its weight, its items, and its share of the points.",
    [
      "group_id",
      "title",
      "weight_percent",
      "item_count",
      "points_total",
      "share_of_points",
      "item_ids",
      "item_titles",
      "source",
    ],
    rows,
  );
}

/** Build the table of module items. */
export function moduleItemsTable(review: AssessmentReview): Table {
  const rows: string[][] = [];

  for (const module of review.course.modules) {
    for (const moduleItem of module.items) {
      const target = findTarget(review.course.items, review.course.orphans, moduleItem.targetId);
      const assessment = review.assessments.find((entry) => entry.item.itemId === moduleItem.id);

      // For a link, the platform writes the item's own identifier where a
      // target would go, so there is nothing to resolve.
      const isLink = moduleItem.contentType === "external-url" || moduleItem.contentType === "external-tool";

      rows.push([
        moduleItem.id,
        module.id,
        module.title,
        module.state,
        String(moduleItem.position ?? NOT_IN_EXPORT),
        String(moduleItem.indent ?? 0),
        moduleItem.contentType,
        moduleItem.title,
        isLink ? "not applicable" : (moduleItem.targetId ?? NOT_IN_EXPORT),
        isLink ? moduleItem.contentType : (target?.kind ?? NOT_IN_EXPORT),
        isLink ? "link" : assessment ? "assessment" : target ? "content" : "unresolved",
        moduleItem.state,
        moduleItem.url ?? NOT_IN_EXPORT,
        "course_settings/module_meta.xml",
      ]);
    }
  }

  return table(
    "data_modules_items.csv",
    "Every module item in the course, with the module it sits in and the object it points at.",
    [
      "module_item_id",
      "module_id",
      "module_title",
      "module_state",
      "position",
      "indent",
      "content_type",
      "title",
      "target_id",
      "target_kind",
      "resolves_to",
      "state",
      "url",
      "source",
    ],
    rows,
  );
}

/** Build the table of findings. */
export function findingsTable(findings: Finding[]): Table {
  const rows = findings.map((finding) => {
    const first = finding.values[0];
    const second = finding.values[1];

    return [
      finding.id,
      finding.family,
      finding.check,
      finding.suggestedPriority,
      finding.objectType,
      finding.objectId || NOT_IN_EXPORT,
      finding.objectName,
      finding.statement,
      first?.value ?? NOT_APPLICABLE,
      first?.source ?? NOT_APPLICABLE,
      second?.value ?? NOT_APPLICABLE,
      second?.source ?? NOT_APPLICABLE,
      finding.confidence,
      finding.notes.length > 0 ? finding.notes.join(" | ") : "none",
      list(finding.affected),
    ];
  });

  return table(
    "data_findings.csv",
    "Every finding: one row per finding, with the two values it compared, where each came from, and how sure the tool is.",
    [
      "id",
      "check_family",
      "check_id",
      "severity_suggested",
      "object_type",
      "object_id",
      "object_name",
      "statement",
      "value_a",
      "source_a",
      "value_b",
      "source_b",
      "confidence",
      "notes",
      "affected",
    ],
    rows,
  );
}

/** Build the table of candidates: the keyword matches and the cleanup items. */
export function candidatesTable(candidates: Candidate[]): Table {
  const rows = candidates.map((candidate) => [
    candidate.id,
    candidate.kind,
    candidate.objectType,
    candidate.objectId || NOT_IN_EXPORT,
    candidate.objectName,
    candidate.statement,
    candidate.detail,
    candidate.confidence,
    candidate.source,
    list(candidate.affected),
  ]);

  return table(
    "data_candidates.csv",
    "What the checks could not stand behind: keyword matches between instructions and rubrics, and the text that was cleaned up before comparing.",
    [
      "id",
      "kind",
      "object_type",
      "object_id",
      "object_name",
      "statement",
      "detail",
      "confidence",
      "source",
      "affected",
    ],
    rows,
  );
}

/** Build the table of item banks. */
export function itemBanksTable(review: AssessmentReview): Table {
  const rows = review.itemBanks.map((bank) => [
    bank.id,
    bank.title || NOT_IN_EXPORT,
    String(bank.itemCount),
    bank.path,
    String(bank.usedBy.length),
    list(bank.usedBy),
    "the bank file",
  ]);

  return table(
    "data_item_banks.csv",
    "Every question bank in the export, and which quizzes draw from it.",
    ["bank_id", "title", "item_count", "path", "used_by_count", "used_by", "source"],
    rows,
  );
}

/** Build the table of content that is not a graded item. */
export function contentTable(
  review: AssessmentReview,
  include: { pages: boolean; discussions: boolean } = { pages: true, discussions: true },
): Table {
  const graded = new Set(review.assessments.map((assessment) => assessment.id));

  const items = [...review.course.items, ...review.course.orphans].filter((item) => {
    if (graded.has(item.id)) return false;
    if (item.kind === "page") return include.pages;
    if (item.kind === "discussion") return include.discussions;
    return false;
  });

  const rows = items.map((item) => {
    const usage = review.usage.byId.get(item.id);
    const modules = [...review.course.modules]
      .filter((module) => module.items.some((moduleItem) => moduleItem.targetId === item.id))
      .map((module) => module.title);

    return [
      item.id,
      item.kind,
      item.title,
      modules.join("; ") || NOT_IN_EXPORT,
      item.state,
      usage?.state ?? "unclear",
      usage?.reasons.join("; ") ?? NOT_IN_EXPORT,
      item.bodyPath ?? NOT_IN_EXPORT,
    ];
  });

  return table(
    "data_content.csv",
    "The pages and the discussions that are not graded items, with what seems to be happening to them.",
    ["item_id", "kind", "title", "modules", "state", "usage_state", "usage_reasons", "source"],
    rows,
  );
}

/** Build the table of stored texts. */
export function textsTable(texts: TextStore): Table {
  const rows = texts.entries.map((entry) => [
    entry.id,
    entry.hash,
    entry.kind,
    String(entry.text.length),
    String(entry.itemIds.length),
    list(entry.itemIds),
    entry.text,
  ]);

  return table(
    "data_texts.csv",
    "The instructions text of the course, stored once. Items that share a text share its id, so the text is never printed twice.",
    ["text_id", "hash", "kind", "char_count", "item_count", "item_ids", "text"],
    rows,
  );
}

/** A list of ids or names. An empty list reads as "none", never as a blank. */
function list(values: string[]): string {
  return values.length === 0 ? "none" : values.join("; ");
}

/** The modules an item sits in, written as one list. */
function moduleList(assessment: Assessment): string {
  if (assessment.moduleRefs.length === 0) return NOT_IN_EXPORT;

  return assessment.moduleRefs
    .map((ref) => (ref.moduleTitle === assessment.moduleTitle ? ref.moduleTitle : `${ref.moduleTitle} (${ref.title})`))
    .join("; ");
}

/** The content a module item points at. */
function findTarget(items: CourseItem[], orphans: CourseItem[], targetId: string | undefined): CourseItem | undefined {
  if (!targetId) return undefined;
  return [...items, ...orphans].find((item) => item.id === targetId);
}
