import { DEFAULT_TRANSCRIPT_FORMAT_OPTIONS, formatTranscript } from "./format";
import { parseWebVtt } from "./parse";
import type { SpeakerNameMap, Transcript, TranscriptFormatOptions } from "./types";

export interface OpenedTranscript {
  fileName: string;
  transcript: Transcript;
  speakerNames: SpeakerNameMap;
  options: TranscriptFormatOptions;
  text: string;
  edited: boolean;
}

export type TranscriptSessionState =
  | { status: "empty" }
  | { status: "opening"; pendingFileName: string }
  | { status: "error"; error: string }
  | { status: "ready"; document: OpenedTranscript };

let state: TranscriptSessionState = { status: "empty" };
let operation = 0;
const listeners = new Set<(state: TranscriptSessionState) => void>();

function setState(next: TranscriptSessionState): void {
  state = next;
  for (const listener of listeners) listener(state);
}

function generatedText(document: OpenedTranscript): string {
  return formatTranscript(document.transcript.cues, document.options, document.speakerNames);
}

function regenerate(document: OpenedTranscript): OpenedTranscript {
  return { ...document, text: generatedText(document), edited: false };
}

export function getTranscriptSessionState(): TranscriptSessionState {
  return state;
}

export function subscribeToTranscriptSession(listener: (state: TranscriptSessionState) => void): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("WebVTT header")) {
    return "This is not a WebVTT transcript. Choose a .vtt file with a WEBVTT header.";
  }
  if (message.includes("No readable transcript cues")) {
    return "No readable transcript cues were found. Check that the download finished and try another .vtt transcript.";
  }
  return "The transcript could not be read. Try downloading it again, then open the new .vtt file.";
}

/** Open one transcript in memory, replacing any previously opened transcript. */
export async function openTranscriptFile(file: File): Promise<void> {
  const currentOperation = ++operation;
  if (!file.name.toLowerCase().endsWith(".vtt")) {
    setState({ status: "error", error: "Choose a WebVTT transcript with a .vtt filename." });
    return;
  }

  setState({ status: "opening", pendingFileName: file.name });

  try {
    const transcript = parseWebVtt(await file.text());
    if (currentOperation !== operation) return;
    const speakerNames: Record<string, string> = {};
    const options = { ...DEFAULT_TRANSCRIPT_FORMAT_OPTIONS };
    const document: OpenedTranscript = {
      fileName: file.name,
      transcript,
      speakerNames,
      options,
      text: "",
      edited: false,
    };
    setState({ status: "ready", document: regenerate(document) });
  } catch (error) {
    if (currentOperation !== operation) return;
    setState({ status: "error", error: describeError(error) });
  }
}

function updateDocument(update: (document: OpenedTranscript) => OpenedTranscript): void {
  if (state.status !== "ready") return;
  setState({ status: "ready", document: update(state.document) });
}

/** Correct one original speaker label everywhere it occurs. */
export function renameTranscriptSpeaker(id: string, name: string): void {
  updateDocument((document) =>
    regenerate({
      ...document,
      speakerNames: { ...document.speakerNames, [id]: name.trim().replace(/\s+/g, " ") },
    }),
  );
}

export function updateTranscriptFormatOptions(options: Partial<TranscriptFormatOptions>): void {
  updateDocument((document) => regenerate({ ...document, options: { ...document.options, ...options } }));
}

export function setTranscriptText(text: string): void {
  updateDocument((document) => ({
    ...document,
    text,
    edited: text !== generatedText(document),
  }));
}

export function resetTranscriptText(): void {
  updateDocument(regenerate);
}

/** Forget the transcript and cancel the visible result of any pending import. */
export function clearTranscriptSession(): void {
  operation++;
  setState({ status: "empty" });
}
