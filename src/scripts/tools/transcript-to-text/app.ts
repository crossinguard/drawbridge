import { button as buttonClasses } from "@/components/starwind/button/variants";
import { input as inputClasses } from "@/components/starwind/input/variants";
import { downloadTranscriptFilename, formatTimestamp } from "@/lib/tools/transcript-to-text/format";
import {
  clearTranscriptSession,
  openTranscriptFile,
  renameTranscriptSpeaker,
  resetTranscriptText,
  setTranscriptText,
  subscribeToTranscriptSession,
  updateTranscriptFormatOptions,
  type OpenedTranscript,
  type TranscriptSessionState,
} from "@/lib/tools/transcript-to-text/session";
import { filterTranscriptCues, getTranscriptSpeakers } from "@/lib/tools/transcript-to-text/selectors";
import type { Transcript, TranscriptFormatOptions } from "@/lib/tools/transcript-to-text/types";
import { esc, escAttr, within } from "@/scripts/lib/dom";
import { bindFilePicker } from "@/scripts/lib/file-picker";
import { mountToolController } from "@/scripts/lib/lifecycle";

mountToolController("transcript-to-text", (root) => {
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
  const content = within<HTMLElement>(root, "[data-transcript-content]");
  const summary = within<HTMLElement>(root, "[data-transcript-summary]");
  const notes = within<HTMLDetailsElement>(root, "[data-transcript-notes]");
  const notesList = within<HTMLElement>(root, "[data-transcript-notes-list]");
  const search = within<HTMLInputElement>(root, "[data-transcript-search]");
  const speakers = within<HTMLElement>(root, "[data-transcript-speakers]");
  const noSpeakers = within<HTMLElement>(root, "[data-transcript-no-speakers]");
  const results = within<HTMLElement>(root, "[data-transcript-results]");
  const activeFilter = within<HTMLElement>(root, "[data-transcript-active-filter]");
  const filterDescription = within<HTMLElement>(root, "[data-transcript-filter-description]");
  const clearFilters = within<HTMLButtonElement>(root, "[data-transcript-clear-filters]");
  const cueList = within<HTMLElement>(root, "[data-transcript-cues]");
  const empty = within<HTMLElement>(root, "[data-transcript-empty]");
  const output = within<HTMLTextAreaElement>(root, "[data-transcript-output]");
  const editedNote = within<HTMLElement>(root, "[data-transcript-edited]");
  const copyButton = within<HTMLButtonElement>(root, "[data-transcript-copy]");
  const downloadButton = within<HTMLButtonElement>(root, "[data-transcript-download]");
  const resetButton = within<HTMLButtonElement>(root, "[data-transcript-reset]");
  const exportStatus = within<HTMLElement>(root, "[data-transcript-export-status]");
  const optionInputs = Array.from(root.querySelectorAll<HTMLInputElement>("[data-transcript-option]"));
  const events = new AbortController();
  const options = { signal: events.signal };

  let opened: OpenedTranscript | null = null;
  let renderedDocument: OpenedTranscript | null = null;
  let currentTranscript: Transcript | null = null;
  let activeSpeaker: string | null = null;
  let downloadUrl: string | null = null;
  let downloadTimer: ReturnType<typeof setTimeout> | undefined;

  const displayName = (id: string, original: string) => {
    const corrected = opened && Object.hasOwn(opened.speakerNames, id) ? opened.speakerNames[id] : undefined;
    return corrected?.trim() || original;
  };

  const releaseDownloadUrl = () => {
    if (downloadTimer !== undefined) clearTimeout(downloadTimer);
    downloadTimer = undefined;
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    downloadUrl = null;
  };

  const renderSummary = (document: OpenedTranscript) => {
    const people = getTranscriptSpeakers(document.transcript.cues);
    const finalCueEnd = document.transcript.cues.reduce((latest, cue) => Math.max(latest, cue.end), 0);
    const values = [
      ["Transcript cues", document.transcript.cues.length],
      ["People", people.length],
      ["Last cue ends", formatTimestamp(finalCueEnd)],
    ] as const;
    summary.innerHTML = values
      .map(
        ([label, value]) => `
          <div class="summary-item">
            <dt class="text-sm text-muted-foreground">${label}</dt>
            <dd class="text-2xl font-semibold">${esc(String(value))}</dd>
          </div>`,
      )
      .join("");

    notes.hidden = document.transcript.warnings.length === 0;
    notesList.innerHTML = document.transcript.warnings.map((warning) => `<li>${esc(warning)}</li>`).join("");
  };

  const renderPeople = () => {
    if (!opened) return;
    const people = getTranscriptSpeakers(opened.transcript.cues);
    noSpeakers.hidden = people.length > 0;
    speakers.innerHTML = people
      .map((person, index) => {
        const corrected = displayName(person.id, person.name);
        const selected = activeSpeaker === person.id;
        const originalNote =
          corrected !== person.name
            ? `<span class="block text-xs font-normal text-muted-foreground">Originally ${esc(person.name)}</span>`
            : "";
        return `
          <div class="grid gap-2 border-b border-border pb-3 last:border-b-0 last:pb-0">
            <button
              type="button"
              data-speaker-filter="${escAttr(person.id)}"
              aria-pressed="${selected}"
              class="${buttonClasses({ variant: selected ? "secondary" : "outline", size: "sm" })} h-auto min-h-9 justify-start whitespace-normal text-left"
            >
              <span class="min-w-0 wrap-break-word">
                ${esc(corrected)}
                ${originalNote}
                <span class="block text-xs font-normal text-muted-foreground">${person.cueCount} ${person.cueCount === 1 ? "cue" : "cues"}</span>
              </span>
            </button>
            <div class="grid gap-1">
              <label for="transcript-speaker-${index}" class="text-xs font-medium">Name for ${esc(person.name)}</label>
              <input
                id="transcript-speaker-${index}"
                data-speaker-name="${escAttr(person.id)}"
                value="${escAttr(corrected)}"
                class="${inputClasses({ size: "sm" })}"
                autocomplete="off"
              />
            </div>
          </div>`;
      })
      .join("");
  };

  const renderCues = () => {
    if (!opened) return;
    const filtered = filterTranscriptCues(
      opened.transcript.cues,
      { search: search.value, ...(activeSpeaker === null ? {} : { speaker: activeSpeaker }) },
      opened.speakerNames,
    );
    const hasFilters = Boolean(search.value.trim()) || activeSpeaker !== null;
    results.textContent = hasFilters
      ? `${filtered.length} of ${opened.transcript.cues.length} cues shown`
      : `${filtered.length} ${filtered.length === 1 ? "cue" : "cues"}`;
    activeFilter.hidden = !hasFilters;
    const descriptions = [
      activeSpeaker === null ? "" : "Filtered by person",
      search.value.trim() ? `Search: “${search.value.trim()}”` : "",
    ].filter(Boolean);
    filterDescription.textContent = `${descriptions.join(" · ")}. Plaintext still includes the full transcript.`;
    empty.hidden = filtered.length > 0;
    cueList.hidden = filtered.length === 0;

    cueList.innerHTML = filtered
      .map(
        (cue) => `
          <article data-transcript-cue="${cue.index}" class="scroll-mt-4 rounded-lg border border-border bg-card p-4">
            <p class="metadata-text">Cue ${cue.index + 1} · ${esc(cue.startTime)}–${esc(cue.endTime)}</p>
            <ul class="mt-3 grid gap-3">
              ${cue.segments
                .map((segment) => {
                  const name = segment.speaker === null ? "" : displayName(segment.speaker, segment.speaker);
                  return `
                    <li class="grid gap-1 border-l-2 border-secondary pl-3">
                      ${name ? `<p class="text-sm font-semibold text-secondary-accent wrap-break-word">${esc(name)}</p>` : ""}
                      <p class="text-sm leading-relaxed wrap-break-word whitespace-pre-wrap">${esc(segment.text)}</p>
                    </li>`;
                })
                .join("")}
            </ul>
          </article>`,
      )
      .join("");
  };

  const renderDocument = () => {
    if (!opened) return;
    if (
      !renderedDocument ||
      renderedDocument.transcript !== opened.transcript ||
      renderedDocument.speakerNames !== opened.speakerNames
    ) {
      renderPeople();
      renderCues();
    }
    if (renderedDocument?.options !== opened.options) {
      for (const input of optionInputs) {
        const key = input.dataset.transcriptOption as keyof TranscriptFormatOptions;
        input.checked = opened.options[key];
      }
    }
    if (output.value !== opened.text) output.value = opened.text;
    editedNote.hidden = !opened.edited;
    renderedDocument = opened;
  };

  const onSessionChange = (state: TranscriptSessionState) => {
    const ready = state.status === "ready";
    sourceRegion.hidden = ready;
    workspaceBar.hidden = !ready;
    content.hidden = !ready;
    chooseButton.disabled = state.status === "opening";
    picker.setAttribute("aria-busy", String(state.status === "opening"));
    sourceStatus.textContent = state.status === "opening" ? `Opening ${state.pendingFileName}…` : "";
    sourceError.hidden = state.status !== "error";
    sourceErrorMessage.textContent = state.status === "error" ? state.error : "";

    if (!ready) {
      opened = null;
      renderedDocument = null;
      currentTranscript = null;
      activeSpeaker = null;
      releaseDownloadUrl();
      return;
    }

    opened = state.document;
    if (currentTranscript !== opened.transcript) {
      currentTranscript = opened.transcript;
      activeSpeaker = null;
      search.value = "";
      exportStatus.textContent = "";
      workspaceTitle.textContent = opened.fileName;
      const peopleCount = getTranscriptSpeakers(opened.transcript.cues).length;
      workspaceMeta.textContent = `${opened.transcript.cues.length} cues · ${peopleCount} ${peopleCount === 1 ? "person" : "people"}`;
      renderSummary(opened);
    }
    renderDocument();
  };

  const confirmRegeneration = () =>
    !opened?.edited ||
    window.confirm("Changing the generated text will replace your manual plaintext edits. Continue?");

  const unbindPicker = bindFilePicker(root, (file) => void openTranscriptFile(file));
  closeButton.addEventListener("click", clearTranscriptSession, options);
  search.addEventListener("input", renderCues, options);
  clearFilters.addEventListener(
    "click",
    () => {
      activeSpeaker = null;
      search.value = "";
      renderPeople();
      renderCues();
      search.focus();
    },
    options,
  );

  root.addEventListener(
    "click",
    (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-speaker-filter]");
      if (!button?.dataset.speakerFilter) return;
      const id = button.dataset.speakerFilter;
      activeSpeaker = activeSpeaker === id ? null : id;
      renderPeople();
      renderCues();
    },
    options,
  );

  root.addEventListener(
    "change",
    (event) => {
      const input = (event.target as HTMLElement).closest<HTMLInputElement>("[data-speaker-name]");
      if (!input?.dataset.speakerName) return;
      if (!confirmRegeneration()) {
        renderPeople();
        return;
      }
      exportStatus.textContent = "";
      renameTranscriptSpeaker(input.dataset.speakerName, input.value);
    },
    options,
  );

  for (const input of optionInputs) {
    input.addEventListener(
      "change",
      () => {
        const key = input.dataset.transcriptOption as keyof TranscriptFormatOptions;
        if (!confirmRegeneration()) {
          if (opened) input.checked = opened.options[key];
          return;
        }
        exportStatus.textContent = "";
        updateTranscriptFormatOptions({ [key]: input.checked });
      },
      options,
    );
  }

  output.addEventListener(
    "input",
    () => {
      exportStatus.textContent = "";
      setTranscriptText(output.value);
    },
    options,
  );

  copyButton.addEventListener(
    "click",
    async () => {
      try {
        await navigator.clipboard.writeText(output.value);
        exportStatus.textContent = "Plaintext copied to the clipboard.";
      } catch {
        output.focus();
        output.select();
        exportStatus.textContent =
          "Clipboard access was unavailable. The text is selected so you can copy it manually.";
      }
    },
    options,
  );

  downloadButton.addEventListener(
    "click",
    () => {
      if (!opened) return;
      releaseDownloadUrl();
      const blob = new Blob([output.value], { type: "text/plain;charset=utf-8" });
      downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = downloadTranscriptFilename(opened.fileName);
      document.body.append(link);
      link.click();
      link.remove();
      exportStatus.textContent = `Download started for ${link.download}.`;
      downloadTimer = setTimeout(releaseDownloadUrl, 0);
    },
    options,
  );

  resetButton.addEventListener(
    "click",
    () => {
      if (!confirmRegeneration()) return;
      exportStatus.textContent = "";
      resetTranscriptText();
    },
    options,
  );

  const unsubscribe = subscribeToTranscriptSession(onSessionChange);
  return () => {
    events.abort();
    unbindPicker();
    unsubscribe();
    releaseDownloadUrl();
  };
});
