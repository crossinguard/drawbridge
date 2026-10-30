import type { CanvasCourseSource } from "@/lib/workspace/types";
import { clearWorkspace, openCanvasCourse, subscribeToWorkspace } from "@/lib/workspace/session";
import { within } from "@/scripts/lib/dom";
import { bindFilePicker } from "@/scripts/lib/file-picker";

/**
 * Connect the shared SourcePicker and WorkspaceBar patterns to the one Canvas
 * session. Tools only need to respond to the opened source, not reimplement
 * file input, drag-and-drop, progress, errors, or close behavior.
 */
export function bindCanvasSource(root: HTMLElement, onSourceChange: (source: CanvasCourseSource | null) => void) {
  const sourceRegion = within<HTMLElement>(root, "[data-source-region]");
  const picker = within<HTMLElement>(root, "[data-source-picker]");
  const chooseButton = within<HTMLButtonElement>(root, "[data-source-choose]");
  const sourceStatus = within<HTMLElement>(root, "[data-source-status]");
  const sourceError = within<HTMLElement>(root, "[data-source-error]");
  const sourceErrorMessage = within<HTMLElement>(root, "[data-source-error-message]");
  const workspaceBar = within<HTMLElement>(root, "[data-workspace-bar]");
  const workspaceTitle = within<HTMLElement>(root, "[data-workspace-title]");
  const workspaceMeta = within<HTMLElement>(root, "[data-workspace-meta]");
  const closeButton = within<HTMLButtonElement>(root, "[data-workspace-close]");
  const events = new AbortController();
  const options = { signal: events.signal };

  const unbindPicker = bindFilePicker(root, (file) => void openCanvasCourse(file));
  closeButton.addEventListener("click", clearWorkspace, options);

  const unsubscribe = subscribeToWorkspace((state) => {
    const opened = state.status === "ready" && state.source?.kind === "canvas-course" ? state.source : null;
    const ready = opened !== null;

    sourceRegion.hidden = ready;
    workspaceBar.hidden = !ready;
    chooseButton.disabled = state.status === "opening";
    picker.setAttribute("aria-busy", String(state.status === "opening"));
    sourceStatus.textContent = state.status === "opening" ? `Opening ${state.pendingFileName ?? "course export"}…` : "";
    sourceError.hidden = state.status !== "error";
    sourceErrorMessage.textContent = state.error ?? "";

    if (opened) {
      const course = opened.model.export;
      workspaceTitle.textContent = course.meta.title;
      workspaceMeta.textContent = [course.meta.code, opened.fileName].filter(Boolean).join(" · ");
    }

    onSourceChange(opened);
  });

  return () => {
    events.abort();
    unbindPicker();
    unsubscribe();
  };
}
