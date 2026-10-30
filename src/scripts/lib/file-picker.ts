import { within } from "./dom";

/** Connect a SourcePicker's choose and drag-and-drop actions to one file handler. */
export function bindFilePicker(root: HTMLElement, onFile: (file: File) => void): () => void {
  const picker = within<HTMLElement>(root, "[data-source-picker]");
  const fileInput = within<HTMLInputElement>(root, "[data-source-input]");
  const chooseButton = within<HTMLButtonElement>(root, "[data-source-choose]");
  const events = new AbortController();
  const options = { signal: events.signal };

  const accept = (file: File | undefined) => {
    if (file) onFile(file);
    fileInput.value = "";
  };

  chooseButton.addEventListener("click", () => fileInput.click(), options);
  fileInput.addEventListener("change", () => accept(fileInput.files?.[0]), options);
  picker.addEventListener(
    "dragenter",
    (event) => {
      event.preventDefault();
      picker.dataset.dragging = "true";
    },
    options,
  );
  picker.addEventListener(
    "dragover",
    (event) => {
      event.preventDefault();
      picker.dataset.dragging = "true";
    },
    options,
  );
  picker.addEventListener(
    "dragleave",
    (event) => {
      if (!picker.contains(event.relatedTarget as Node | null)) picker.dataset.dragging = "false";
    },
    options,
  );
  picker.addEventListener(
    "drop",
    (event) => {
      event.preventDefault();
      picker.dataset.dragging = "false";
      accept(event.dataTransfer?.files[0]);
    },
    options,
  );

  return () => events.abort();
}
