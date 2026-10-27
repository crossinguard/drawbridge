import type { CanvasCourseModel } from "@/lib/canvas/model";
import type { FileStore } from "@/lib/canvas/store";

export type SourceKind = "canvas-course";

export interface CanvasCourseSource {
  kind: "canvas-course";
  fileName: string;
  model: CanvasCourseModel;
  archive: FileStore;
}

export type OpenedSource = CanvasCourseSource;

export type WorkspaceStatus = "empty" | "opening" | "ready" | "error";

export interface WorkspaceState {
  status: WorkspaceStatus;
  source: OpenedSource | null;
  /** The file being opened, for progress messages. */
  pendingFileName?: string;
  /** A plain-language problem that can be shown without technical translation. */
  error?: string;
}
