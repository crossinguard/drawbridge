import type { CanvasCourseModel, CourseEntity } from "../model";
import type { Rubric, RubricCriterion } from "../types";

export interface RubricActivity {
  entity: CourseEntity;
  usedForGrading: boolean;
}

export interface RubricEntry {
  rubric: Rubric;
  activities: RubricActivity[];
  /** Other rubrics with the same content, regardless of their Canvas IDs or titles. */
  exactCopyIds: string[];
  /** True when another rubric has the same normalized title but different content. */
  hasSameNameVariation: boolean;
  /** Sum of criterion points when every criterion supplies a value. */
  criteriaPoints?: number;
}

export interface RubricCopyGroup {
  signature: string;
  rubrics: Rubric[];
}

export interface RubricNameGroup {
  title: string;
  titleKey: string;
  rubrics: Rubric[];
  versions: number;
}

export interface RubricIndex {
  entries: RubricEntry[];
  entriesById: ReadonlyMap<string, RubricEntry>;
  exactCopyGroups: RubricCopyGroup[];
  sameNameGroups: RubricNameGroup[];
}

export type RubricFilterKind = "all" | "linked" | "unlinked" | "copies" | "variations";

export interface RubricFilter {
  search?: string;
  kind?: RubricFilterKind;
}

const normalizeText = (value: string) => value.trim().replace(/\s+/g, " ");
const titleKey = (rubric: Rubric) => normalizeText(rubric.title).toLocaleLowerCase() || "untitled rubric";
const byTitle = (left: Pick<Rubric, "id" | "title">, right: Pick<Rubric, "id" | "title">) =>
  left.title.localeCompare(right.title, undefined, { numeric: true, sensitivity: "base" }) ||
  left.id.localeCompare(right.id);

/** Canonical content for comparisons; generated IDs and presentation metadata are excluded. */
export function rubricContentSignature(rubric: Rubric): string {
  return JSON.stringify({
    pointsPossible: rubric.pointsPossible ?? null,
    criteria: rubric.criteria.map((criterion) => ({
      description: normalizeText(criterion.description),
      longDescription: normalizeText(criterion.longDescription),
      points: criterion.points ?? null,
      useRange: criterion.useRange,
      ratings: criterion.ratings.map((rating) => ({
        description: normalizeText(rating.description),
        longDescription: normalizeText(rating.longDescription),
        points: rating.points ?? null,
      })),
    })),
  });
}

function criterionSignature(criterion: RubricCriterion): string {
  return rubricContentSignature({
    id: "",
    title: "",
    pointsPossible: undefined,
    reusable: false,
    readOnly: false,
    criteria: [criterion],
  });
}

function activitiesForRubric(model: CanvasCourseModel, rubricId: string): RubricActivity[] {
  const activities: RubricActivity[] = [];

  for (const entity of model.entities) {
    const { assignment, quiz, discussion } = entity.item;
    const linked =
      assignment?.rubricId === rubricId || quiz?.rubricId === rubricId || discussion?.rubricId === rubricId;
    if (!linked) continue;

    activities.push({
      entity,
      usedForGrading:
        assignment?.rubricId === rubricId
          ? assignment.rubricUseForGrading
          : quiz?.rubricId === rubricId
            ? quiz.rubricUseForGrading
            : (discussion?.rubricUseForGrading ?? false),
    });
  }

  return activities.sort((left, right) => byTitle(left.entity, right.entity));
}

/** Build all rubric relationships once so every view uses the same grouping rules. */
export function buildRubricIndex(model: CanvasCourseModel): RubricIndex {
  const rubrics = [...model.export.rubrics].sort(byTitle);
  const copyGroups = new Map<string, Rubric[]>();
  const nameGroups = new Map<string, Rubric[]>();

  for (const rubric of rubrics) {
    const signature = rubricContentSignature(rubric);
    copyGroups.set(signature, [...(copyGroups.get(signature) ?? []), rubric]);
    const key = titleKey(rubric);
    nameGroups.set(key, [...(nameGroups.get(key) ?? []), rubric]);
  }

  const exactCopyGroups = [...copyGroups.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([signature, group]) => ({ signature, rubrics: group }))
    .sort((left, right) => byTitle(left.rubrics[0], right.rubrics[0]));

  const sameNameGroups = [...nameGroups.entries()]
    .map(([key, group]) => ({
      title: group[0].title,
      titleKey: key,
      rubrics: group,
      versions: new Set(group.map(rubricContentSignature)).size,
    }))
    .filter((group) => group.rubrics.length > 1 && group.versions > 1)
    .sort((left, right) => left.title.localeCompare(right.title, undefined, { numeric: true, sensitivity: "base" }));

  const entries = rubrics.map((rubric): RubricEntry => {
    const signature = rubricContentSignature(rubric);
    const copies = copyGroups.get(signature) ?? [];
    const key = titleKey(rubric);
    const sameName = (nameGroups.get(key) ?? []).filter((candidate) => rubricContentSignature(candidate) !== signature);
    const hasCompletePoints =
      rubric.criteria.length > 0 && rubric.criteria.every((criterion) => criterion.points !== undefined);

    return {
      rubric,
      activities: activitiesForRubric(model, rubric.id),
      exactCopyIds: copies.filter((candidate) => candidate.id !== rubric.id).map((candidate) => candidate.id),
      hasSameNameVariation: sameName.length > 0,
      criteriaPoints: hasCompletePoints
        ? rubric.criteria.reduce((total, criterion) => total + (criterion.points ?? 0), 0)
        : undefined,
    };
  });

  return {
    entries,
    entriesById: new Map(entries.map((entry) => [entry.rubric.id, entry])),
    exactCopyGroups,
    sameNameGroups,
  };
}

function searchText(entry: RubricEntry): string {
  const { rubric, activities } = entry;
  return [
    rubric.title,
    ...activities.map((activity) => activity.entity.title),
    ...rubric.criteria.flatMap((criterion) => [
      criterion.description,
      criterion.longDescription,
      ...criterion.ratings.flatMap((rating) => [rating.description, rating.longDescription]),
    ]),
  ]
    .join(" ")
    .toLocaleLowerCase();
}

/** Filter rubric entries without changing the underlying relationship groups. */
export function filterRubricEntries(index: RubricIndex, filter: RubricFilter): RubricEntry[] {
  const search = filter.search?.trim().toLocaleLowerCase() ?? "";
  return index.entries.filter((entry) => {
    if (filter.kind === "linked" && entry.activities.length === 0) return false;
    if (filter.kind === "unlinked" && entry.activities.length > 0) return false;
    if (filter.kind === "copies" && entry.exactCopyIds.length === 0) return false;
    if (filter.kind === "variations" && !entry.hasSameNameVariation) return false;
    return !search || searchText(entry).includes(search);
  });
}

export type CriterionComparisonStatus = "same" | "different" | "left-only" | "right-only";

export interface CriterionComparison {
  index: number;
  status: CriterionComparisonStatus;
  left?: RubricCriterion;
  right?: RubricCriterion;
}

export interface RubricComparison {
  left: Rubric;
  right: Rubric;
  sameContent: boolean;
  criteria: CriterionComparison[];
  differentCriteria: number;
}

/** Compare criteria in their exported order, including additions and removals. */
export function compareRubrics(left: Rubric, right: Rubric): RubricComparison {
  const count = Math.max(left.criteria.length, right.criteria.length);
  const criteria = Array.from({ length: count }, (_, index): CriterionComparison => {
    const leftCriterion = left.criteria[index];
    const rightCriterion = right.criteria[index];
    const status = !leftCriterion
      ? "right-only"
      : !rightCriterion
        ? "left-only"
        : criterionSignature(leftCriterion) === criterionSignature(rightCriterion)
          ? "same"
          : "different";
    return { index, status, left: leftCriterion, right: rightCriterion };
  });

  return {
    left,
    right,
    sameContent: rubricContentSignature(left) === rubricContentSignature(right),
    criteria,
    differentCriteria: criteria.filter((criterion) => criterion.status !== "same").length,
  };
}
