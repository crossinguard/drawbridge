import { KIND_LABELS, type ContentType } from "../types";
import type { CanvasCourseModel, CourseEntity } from "../model";

export interface CourseSummary {
  modules: number;
  pages: number;
  assignments: number;
  quizzes: number;
  discussions: number;
  files: number;
  rubrics: number;
}

/** A high-level count of what the export contains, with no quality judgments. */
export function getCourseSummary(model: CanvasCourseModel): CourseSummary {
  const count = (kind: ContentType) => model.entities.filter((entity) => entity.kind === kind).length;

  return {
    modules: model.export.modules.length,
    pages: count("page"),
    assignments: count("assignment"),
    quizzes: count("quiz"),
    discussions: count("discussion"),
    files: model.export.files.length,
    rubrics: model.export.rubrics.length,
  };
}

export const COURSE_SUMMARY_LABELS: Record<keyof CourseSummary, string> = {
  modules: "Modules",
  pages: "Pages",
  assignments: "Assignments",
  quizzes: "Quizzes",
  discussions: "Discussions",
  files: "Files",
  rubrics: "Rubrics",
};

export interface EntityFilter {
  search?: string;
  kind?: ContentType | "all";
}

/** Filter unique content records for the course inventory. */
export function filterCourseEntities(model: CanvasCourseModel, filter: EntityFilter): CourseEntity[] {
  const search = filter.search?.trim().toLocaleLowerCase() ?? "";

  return model.entities.filter((entity) => {
    if (filter.kind && filter.kind !== "all" && entity.kind !== filter.kind) return false;
    if (!search) return true;

    const body = model.content.get(entity.id)?.text ?? "";
    const modules = entity.placements.map((placement) => placement.moduleTitle).join(" ");
    const haystack = `${entity.title} ${entity.ownTitle ?? ""} ${KIND_LABELS[entity.kind]} ${modules} ${entity.item.url ?? ""} ${entity.item.bodyPath ?? ""} ${body}`;
    return haystack.toLocaleLowerCase().includes(search);
  });
}

/** True when a module item matches the current title/type filters. */
export function moduleItemMatches(
  model: CanvasCourseModel,
  itemId: string,
  fallbackTitle: string,
  fallbackKind: ContentType,
  filter: EntityFilter,
): boolean {
  const entity = model.entitiesByModuleItemId.get(itemId);
  const kind = entity?.kind ?? fallbackKind;
  if (filter.kind && filter.kind !== "all" && kind !== filter.kind) return false;

  const search = filter.search?.trim().toLocaleLowerCase() ?? "";
  if (!search) return true;

  const body = entity ? (model.content.get(entity.id)?.text ?? "") : "";
  const haystack = `${fallbackTitle} ${entity?.ownTitle ?? ""} ${KIND_LABELS[kind]} ${entity?.item.url ?? ""} ${entity?.item.bodyPath ?? ""} ${body}`;
  return haystack.toLocaleLowerCase().includes(search);
}
