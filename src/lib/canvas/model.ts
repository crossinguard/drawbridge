import type { ParsedCourse } from "./parse";
import type { ContentType, CourseExport, CourseItem, ModuleItem, PublishState } from "./types";

/** One placement of a piece of content in a module. */
export interface ContentPlacement {
  moduleId: string;
  moduleTitle: string;
  moduleState?: PublishState;
  itemId: string;
  title: string;
  state: PublishState;
  position?: number;
  indent?: number;
}

/** A unique piece of content and every place it appears in the course. */
export interface CourseEntity {
  id: string;
  kind: ContentType;
  title: string;
  ownTitle?: string;
  state: PublishState;
  /** The parser record containing the content's type-specific details. */
  item: CourseItem;
  placements: ContentPlacement[];
}

/**
 * A reusable, normalized view of a parsed Canvas course.
 *
 * The parser retains one record per module placement. Tools use this model so
 * a page or assessment placed in two modules is still one entity with two
 * placements, rather than something every tool must deduplicate itself.
 */
export interface CanvasCourseModel {
  export: CourseExport;
  content: ParsedCourse["content"];
  entities: CourseEntity[];
  entitiesById: ReadonlyMap<string, CourseEntity>;
  entitiesByModuleItemId: ReadonlyMap<string, CourseEntity>;
}

/** Build the shared model consumed by every Canvas tool. */
export function buildCanvasCourseModel(parsed: ParsedCourse): CanvasCourseModel {
  const groups = new Map<string, CourseItem[]>();

  for (const item of [...parsed.export.items, ...parsed.export.orphans]) {
    const group = groups.get(item.id) ?? [];
    group.push(item);
    groups.set(item.id, group);
  }

  const entities = [...groups.values()].map((entries): CourseEntity => {
    const primary = entries[0];
    const placements = entries
      .filter((entry) => entry.moduleId && entry.itemId)
      .map((entry) => ({
        moduleId: entry.moduleId!,
        moduleTitle: entry.moduleTitle ?? "Not included in this export",
        moduleState: entry.moduleState,
        itemId: entry.itemId!,
        title: entry.title,
        state: entry.state,
        position: entry.position,
        indent: entry.indent,
      }));

    return {
      id: primary.id,
      kind: primary.kind,
      title: primary.title,
      ownTitle: primary.ownTitle,
      state: primary.state,
      item: primary,
      placements,
    };
  });

  // Files are course content even when no module points at them. Add the ones
  // the resource walk did not produce so the inventory and file count agree.
  const knownFilePaths = new Set(entities.map((entity) => entity.item.bodyPath).filter(Boolean));
  for (const file of parsed.export.files) {
    if (knownFilePaths.has(file.path)) continue;
    entities.push({
      id: `file:${file.path}`,
      kind: "file",
      title: file.displayName,
      state: "active",
      item: {
        id: `file:${file.path}`,
        kind: "file",
        title: file.displayName,
        state: "active",
        bodyPath: file.path,
      },
      placements: [],
    });
  }

  const entitiesById = new Map(entities.map((entity) => [entity.id, entity]));
  const entitiesByModuleItemId = new Map<string, CourseEntity>();

  for (const entity of entities) {
    for (const placement of entity.placements) {
      entitiesByModuleItemId.set(placement.itemId, entity);
    }
  }

  return {
    export: parsed.export,
    content: parsed.content,
    entities,
    entitiesById,
    entitiesByModuleItemId,
  };
}

/** Find the content a module item resolves to, if the export resolved it. */
export function entityForModuleItem(model: CanvasCourseModel, item: ModuleItem): CourseEntity | undefined {
  return model.entitiesByModuleItemId.get(item.id);
}

/** Content present in the export but not placed in any module. */
export function entitiesOutsideModules(model: CanvasCourseModel): CourseEntity[] {
  return model.entities.filter((entity) => entity.placements.length === 0);
}
