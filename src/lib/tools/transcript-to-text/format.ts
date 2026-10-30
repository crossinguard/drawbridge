import type { SpeakerNameMap, TranscriptCue, TranscriptFormatOptions } from "./types";

export const DEFAULT_TRANSCRIPT_FORMAT_OPTIONS: TranscriptFormatOptions = {
  includeSpeakers: true,
  includeTimestamps: false,
  mergeSpeakers: true,
};

interface OutputParagraph {
  speaker: string | null;
  start: number;
  text: string[];
}

function correctedName(speaker: string, speakerNames: SpeakerNameMap): string {
  const corrected = Object.hasOwn(speakerNames, speaker) ? speakerNames[speaker] : undefined;
  return corrected?.trim() || speaker;
}

/** Format a non-negative transcript time as hours, minutes, and whole seconds. */
export function formatTimestamp(seconds: number): string {
  const wholeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const remainder = wholeSeconds % 60;
  return [hours, minutes, remainder].map((part) => String(part).padStart(2, "0")).join(":");
}

/** Format transcript segments as plain-text paragraphs without changing their order. */
export function formatTranscript(
  cues: readonly TranscriptCue[],
  options: TranscriptFormatOptions,
  speakerNames: SpeakerNameMap = {},
): string {
  const paragraphs: OutputParagraph[] = [];

  for (const cue of cues) {
    for (const segment of cue.segments) {
      const speaker = segment.speaker === null ? null : correctedName(segment.speaker, speakerNames);
      const previous = paragraphs.at(-1);

      if (options.mergeSpeakers && previous && previous.speaker === speaker) {
        previous.text.push(segment.text);
      } else {
        paragraphs.push({ speaker, start: cue.start, text: [segment.text] });
      }
    }
  }

  return paragraphs
    .map((paragraph) => {
      const timestamp = options.includeTimestamps ? `[${formatTimestamp(paragraph.start)}] ` : "";
      const speaker = options.includeSpeakers && paragraph.speaker !== null ? `${paragraph.speaker}: ` : "";
      return `${timestamp}${speaker}${paragraph.text.join(" ")}`;
    })
    .join("\n\n");
}

/** Choose the plain-text download name corresponding to a WebVTT filename. */
export function downloadTranscriptFilename(fileName: string): string {
  return /\.vtt$/i.test(fileName) ? fileName.replace(/\.vtt$/i, ".txt") : `${fileName}.txt`;
}
