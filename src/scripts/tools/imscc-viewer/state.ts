/**
 * The state of the Canvas course viewer.
 *
 * Everything lives in memory. Nothing is stored, and nothing is sent
 * anywhere.
 */
import type { Finding } from "@/lib/tools/imscc-viewer/audit";
import type { ProcessedContent } from "@/lib/tools/imscc-viewer/content";
import type { FileStore } from "@/lib/tools/imscc-viewer/store";
import type { ContentType, CourseExport } from "@/lib/tools/imscc-viewer/types";

/** Which list the browse step shows on the left. */
export type BrowseView = "outline" | "table";

/** Which publish states the browse step shows. */
export type StateFilter = "all" | "active" | "unpublished";

/** Which kinds of content the browse step shows. */
export type TypeFilter = "all" | ContentType;

export interface AppState {
  /** The opened cartridge. */
  store: FileStore | null;
  /** The parsed course. */
  course: CourseExport | null;
  /** Processed body content, keyed by item id. */
  content: Map<string, ProcessedContent>;
  /** The QA findings for the opened course. */
  findings: Finding[];
  /** The item shown in the detail pane. */
  selectedId: string | null;
  /** The current search text. */
  search: string;
  typeFilter: TypeFilter;
  stateFilter: StateFilter;
  view: BrowseView;
}

export const state: AppState = {
  store: null,
  course: null,
  content: new Map(),
  findings: [],
  selectedId: null,
  search: "",
  typeFilter: "all",
  stateFilter: "all",
  view: "outline",
};

/** Clear everything, so a different course can be opened. */
export function resetState(): void {
  state.store = null;
  state.course = null;
  state.content = new Map();
  state.findings = [];
  state.selectedId = null;
  state.search = "";
  state.typeFilter = "all";
  state.stateFilter = "all";
  state.view = "outline";
}
