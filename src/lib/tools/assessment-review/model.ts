/**
 * The assessment model: everything a reviewer needs to know about a course's
 * graded items, in one shape.
 *
 * The model is built from a parsed Canvas course and is read by both the
 * review screen and the plain-text prep file, so the two can never disagree.
 */
import { summariseQuestions } from "@/lib/canvas/quiz";
import type { ProcessedContent } from "@/lib/canvas/content";
import type {
  CourseExport,
  CourseItem,
  ItemBank,
  PublishState,
  QuizDetails,
  Rubric,
  RubricCriterion,
} from "@/lib/canvas/types";

import { naturalCompare } from "@/lib/utils";

import { classifyUsage, type UsageMap } from "@/lib/tools/assessment-review/usage";

/** The kinds of graded item a course can hold. */
export type AssessmentKind = "assignment" | "quiz" | "graded-discussion";

/** Human-readable names for the assessment kinds. */
export const ASSESSMENT_KIND_LABELS: Record<AssessmentKind, string> = {
  assignment: "Assignment",
  quiz: "Quiz",
  "graded-discussion": "Graded discussion",
};

/** One graded item in the course. */
export interface Assessment {
  /** The course item's identifier. */
  id: string;
  kind: AssessmentKind;
  /** The title the module item shows. */
  title: string;
  /** The title the content carries itself, when it differs. */
  ownTitle?: string;
  /** The module the item sits in, when it is in one. */
  moduleId?: string;
  moduleTitle?: string;
  moduleState?: PublishState;
  /** The assignment group the item counts towards. */
  groupId?: string;
  groupTitle?: string;
  /** Points the item is worth. */
  pointsPossible?: number;
  /** The rubric attached to the item. */
  rubricId?: string;
  /** Whether the rubric drives the score, or is attached for reference only. */
  rubricUseForGrading: boolean;
  /** The written instructions, as plain text. */
  instructions: string;
  /** Where the instructions came from. */
  instructionsSource?: string;
  /** When the item is due. */
  dueAt?: string;
  /** Whether students can open the item. */
  state: PublishState;
  /** Whether any module points at the item. */
  inModule: boolean;
  /** The quiz settings, for a quiz. */
  quiz?: QuizDetails;
  /** The course item the assessment came from. */
  item: CourseItem;
}

/** A rubric, with the items that use it. */
export interface RubricReview {
  rubric: Rubric;
  /** The assessments that attach this rubric. */
  attachedTo: Assessment[];
  /** The rubrics with identical criteria and levels. */
  duplicates: RubricReview[];
}

/** An assignment group, with what is in it. */
export interface GroupReview {
  id: string;
  title: string;
  /** The group's share of the final grade, as a percentage. */
  weight: number;
  /** The assessments in the group. */
  assessments: Assessment[];
  /** The points the group's items add up to. */
  pointsTotal: number;
  /** The group's share of the course's points, as a percentage. */
  pointsShare: number;
}

/** How the course turns points into a final grade. */
export type Weighting = "percent" | "points" | "none";

/** Everything the review needs to say about the course. */
export interface AssessmentReview {
  /** The course the review is about. */
  course: CourseExport;
  /** Every graded item, in module order. */
  assessments: Assessment[];
  /** Every rubric, with what uses it. */
  rubrics: RubricReview[];
  /** Every assignment group, with what is in it. */
  groups: GroupReview[];
  /** The item banks the export carries. */
  itemBanks: ItemBank[];
  /** How the course is weighted. */
  weighting: Weighting;
  /** The first and last due date in the course. */
  dueRange?: { from?: string; to?: string };
  /** What seems to be in use, and what seems to be left over. */
  usage: UsageMap;
}

/** Build the review model from a parsed course. */
export function buildReview(course: CourseExport, content: Map<string, ProcessedContent>): AssessmentReview {
  const assessments = collectAssessments(course, content);
  const rubrics = collectRubrics(course, assessments);
  const groups = collectGroups(course, assessments);
  const references = collectReferences(course, content);

  const usage = classifyUsage({
    course,
    assessments: assessments.map((assessment) => ({
      id: assessment.id,
      item: assessment.item,
      inModule: assessment.inModule,
    })),
    rubrics: rubrics.map((review) => ({
      rubric: review.rubric,
      attachedTo: review.attachedTo.map((assessment) => assessment.id),
    })),
    references,
  });

  return {
    course,
    assessments,
    rubrics,
    groups,
    itemBanks: course.itemBanks,
    weighting: readWeighting(course),
    dueRange: readDueRange(assessments),
    usage,
  };
}

/** Which items each item links to. */
function collectReferences(course: CourseExport, content: Map<string, ProcessedContent>): Map<string, string[]> {
  const references = new Map<string, string[]>();

  for (const item of [...course.items, ...course.orphans]) {
    const processed = content.get(item.id);
    if (!processed) continue;

    for (const link of processed.links) {
      if (!link.targetId) continue;
      const list = references.get(link.targetId) ?? [];
      if (!list.includes(item.id)) list.push(item.id);
      references.set(link.targetId, list);
    }
  }

  return references;
}

/** Every graded item in the course. */
function collectAssessments(course: CourseExport, content: Map<string, ProcessedContent>): Assessment[] {
  const all = [...course.items, ...course.orphans];

  return all.filter((item) => isGraded(item)).map((item) => toAssessment(item, content));
}

/** True when the item counts towards a grade. */
function isGraded(item: CourseItem): boolean {
  if (item.kind === "assignment") return true;
  if (item.kind === "quiz") return true;
  if (item.kind === "discussion") return item.discussion?.graded === true;
  return false;
}

/** Turn a course item into an assessment. */
function toAssessment(item: CourseItem, content: Map<string, ProcessedContent>): Assessment {
  const kind: AssessmentKind =
    item.kind === "quiz" ? "quiz" : item.kind === "discussion" ? "graded-discussion" : "assignment";

  const assignment = item.assignment;
  const quiz = item.quiz;
  const discussion = item.discussion;

  const groupId =
    kind === "quiz" ? quiz?.groupId : kind === "graded-discussion" ? discussion?.groupId : assignment?.groupId;
  const groupTitle =
    kind === "quiz" ? quiz?.groupTitle : kind === "graded-discussion" ? discussion?.groupTitle : assignment?.groupTitle;

  const pointsPossible =
    kind === "quiz"
      ? quiz?.pointsPossible
      : kind === "graded-discussion"
        ? discussion?.pointsPossible
        : assignment?.pointsPossible;

  const rubricId =
    kind === "quiz" ? quiz?.rubricId : kind === "graded-discussion" ? discussion?.rubricId : assignment?.rubricId;

  const rubricUseForGrading =
    kind === "quiz"
      ? (quiz?.rubricUseForGrading ?? false)
      : kind === "graded-discussion"
        ? (discussion?.rubricUseForGrading ?? false)
        : (assignment?.rubricUseForGrading ?? false);

  const processed = content.get(item.id);

  return {
    id: item.id,
    kind,
    title: item.title,
    ownTitle: item.ownTitle,
    moduleId: item.moduleId,
    moduleTitle: item.moduleTitle,
    moduleState: item.moduleState,
    groupId,
    groupTitle,
    pointsPossible,
    rubricId,
    rubricUseForGrading,
    instructions: processed?.blocks.join("\n") ?? "",
    instructionsSource: item.bodyPath,
    dueAt: kind === "quiz" ? quiz?.dueAt : kind === "graded-discussion" ? discussion?.dueAt : assignment?.dueAt,
    state: item.state,
    inModule: Boolean(item.moduleId),
    quiz,
    item,
  };
}

/** Every rubric, with the items that use it and the copies of it. */
function collectRubrics(course: CourseExport, assessments: Assessment[]): RubricReview[] {
  const reviews: RubricReview[] = course.rubrics.map((rubric) => ({
    rubric,
    attachedTo: assessments.filter((assessment) => assessment.rubricId === rubric.id),
    duplicates: [],
  }));

  // Two rubrics are duplicates when their criteria and levels are the same.
  for (const review of reviews) {
    const signature = rubricSignature(review.rubric);
    if (!signature) continue;

    review.duplicates = reviews.filter((other) => other !== review && rubricSignature(other.rubric) === signature);
  }

  return reviews;
}

/**
 * A fingerprint of a rubric's criteria and levels.
 *
 * Two rubrics with the same fingerprint are the same rubric, whatever they are
 * called.
 */
export function rubricSignature(rubric: Rubric): string {
  if (rubric.criteria.length === 0) return "";

  return rubric.criteria
    .map((criterion) =>
      [
        criterion.description.trim(),
        criterion.points ?? "",
        criterion.useRange ? "range" : "fixed",
        criterion.ratings.map((rating) => `${rating.description.trim()}=${rating.points ?? ""}`).join(","),
      ].join("~"),
    )
    .join("|");
}

/** Every assignment group, with what is in it. */
function collectGroups(course: CourseExport, assessments: Assessment[]): GroupReview[] {
  const total = assessments.reduce((sum, assessment) => sum + (assessment.pointsPossible ?? 0), 0);

  const groups: GroupReview[] = course.assignmentGroups.map((group) => {
    const inGroup = assessments.filter((assessment) => assessment.groupId === group.id);
    const pointsTotal = inGroup.reduce((sum, assessment) => sum + (assessment.pointsPossible ?? 0), 0);

    return {
      id: group.id,
      title: group.title,
      weight: group.weight,
      assessments: inGroup,
      pointsTotal,
      pointsShare: total > 0 ? (pointsTotal / total) * 100 : 0,
    };
  });

  // Assessments with no group at all still need a place in the picture.
  const grouped = new Set(groups.flatMap((group) => group.assessments.map((assessment) => assessment.id)));
  const ungrouped = assessments.filter((assessment) => !grouped.has(assessment.id));

  if (ungrouped.length > 0) {
    const pointsTotal = ungrouped.reduce((sum, assessment) => sum + (assessment.pointsPossible ?? 0), 0);
    groups.push({
      id: "",
      title: "No assignment group",
      weight: 0,
      assessments: ungrouped,
      pointsTotal,
      pointsShare: total > 0 ? (pointsTotal / total) * 100 : 0,
    });
  }

  return groups;
}

/** How the course turns points into a final grade. */
function readWeighting(course: CourseExport): Weighting {
  const scheme = String(course.settings.group_weighting_scheme ?? "").toLowerCase();
  if (scheme === "percent") return "percent";
  if (scheme === "points") return "points";
  if (course.assignmentGroups.some((group) => group.weight > 0)) return "percent";
  return "none";
}

/** The first and last due date in the course. */
function readDueRange(assessments: Assessment[]): { from?: string; to?: string } | undefined {
  const dates = assessments
    .map((assessment) => assessment.dueAt)
    .filter((date): date is string => Boolean(date))
    .sort(naturalCompare);

  if (dates.length === 0) return undefined;
  return { from: dates[0], to: dates[dates.length - 1] };
}

/** The criteria of a rubric, in the order the rubric lists them. */
export function criteriaOf(review: RubricReview): RubricCriterion[] {
  return review.rubric.criteria;
}

/** The assessments in the course, in module order. */
export function sortedAssessments(review: AssessmentReview): Assessment[] {
  return [...review.assessments].sort((a, b) => {
    const module = naturalCompare(a.moduleTitle ?? "", b.moduleTitle ?? "");
    if (module !== 0) return module;
    return naturalCompare(a.title, b.title);
  });
}

/** The quizzes in the course. */
export function quizzesOf(review: AssessmentReview): Assessment[] {
  return review.assessments.filter((assessment) => assessment.kind === "quiz");
}

/** The points a quiz's questions add up to. */
export function quizQuestionPoints(assessment: Assessment): number | undefined {
  if (!assessment.quiz) return undefined;
  return summariseQuestions(assessment.quiz).points;
}
