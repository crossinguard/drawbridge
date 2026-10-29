import { buildCanvasCourseModel } from "@/lib/canvas/model";
import { parseCourseExport } from "@/lib/canvas/parse";
import { openCartridge } from "@/lib/canvas/store";
import type { WorkspaceState } from "./types";

/**
 * The one opened source for this browser session.
 *
 * This module deliberately has no storage adapter. Client-side Astro
 * navigation keeps it alive between tools; a refresh, a new tab, or closing
 * the session forgets it.
 */
let state: WorkspaceState = { status: "empty", source: null };
let operation = 0;
const listeners = new Set<(state: WorkspaceState) => void>();

function setState(next: WorkspaceState): void {
  state = next;
  for (const listener of listeners) listener(state);
}

export function getWorkspaceState(): WorkspaceState {
  return state;
}

export function subscribeToWorkspace(listener: (state: WorkspaceState) => void): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

function describeImportError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("imsmanifest.xml")) {
    return "This is not a Canvas Common Cartridge course export. Choose the .imscc file, not a QTI or files-only ZIP export.";
  }
  if (message.includes("ZIP")) {
    return "This file could not be opened as a course archive. Choose an .imscc file and try again.";
  }
  return "The course export could not be read. Try exporting the course from Canvas again, then open the new file.";
}

/** Open a Canvas course export and replace any previously opened source. */
export async function openCanvasCourse(file: File): Promise<void> {
  const currentOperation = ++operation;
  if (!file.name.toLowerCase().endsWith(".imscc")) {
    setState({
      status: "error",
      source: null,
      error: "Choose a Canvas Common Cartridge course export with an .imscc filename.",
    });
    return;
  }

  setState({ status: "opening", source: null, pendingFileName: file.name });

  try {
    const archive = await openCartridge(file);
    const parsed = await parseCourseExport(archive, { sourceName: file.name });
    if (currentOperation !== operation) return;

    setState({
      status: "ready",
      source: {
        kind: "canvas-course",
        fileName: file.name,
        model: buildCanvasCourseModel(parsed),
        archive,
      },
    });
  } catch (error) {
    if (currentOperation !== operation) return;
    setState({ status: "error", source: null, error: describeImportError(error) });
  }
}

/** Forget the opened source and cancel the visible result of any pending import. */
export function clearWorkspace(): void {
  operation++;
  setState({ status: "empty", source: null });
}
