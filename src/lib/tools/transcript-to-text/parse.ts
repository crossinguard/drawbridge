import type { Transcript, TranscriptCue, TranscriptSegment } from "./types";

const HEADER_PATTERN = /^WEBVTT(?:[\t ].*)?$/;
const TIMING_LINE_PATTERN = /^(\S+)[\t ]+-->[\t ]+(\S+)(?:[\t ]+.*)?$/;
const TIMESTAMP_PATTERN = /^(?:(\d{2,}):)?([0-5]\d):([0-5]\d)\.(\d{3})$/;
const VOICE_OPEN_PATTERN = /^<v(?:\.[^\s>]+)?[\t ]+([^>]+)>$/i;
const VOICE_CLOSE_PATTERN = /^<\/v\s*>$/i;

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lrm: "\u200e",
  lt: "<",
  nbsp: "\u00a0",
  quot: '"',
  rlm: "\u200f",
};

interface CueTiming {
  start: number;
  end: number;
  startTime: string;
  endTime: string;
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/** Decode WebVTT entities without interpreting the result as markup. */
function decodeEntities(value: string): string {
  return value.replace(
    /&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/gi,
    (entity, decimal: string | undefined, hexadecimal: string | undefined, named: string | undefined) => {
      if (named !== undefined) {
        const name = named.toLowerCase();
        return Object.hasOwn(NAMED_ENTITIES, name) ? NAMED_ENTITIES[name] : entity;
      }

      const codePoint = Number.parseInt(decimal ?? hexadecimal ?? "", hexadecimal === undefined ? 10 : 16);
      if (
        !Number.isInteger(codePoint) ||
        codePoint < 0 ||
        codePoint > 0x10ffff ||
        (codePoint >= 0xd800 && codePoint <= 0xdfff)
      ) {
        return entity;
      }
      return String.fromCodePoint(codePoint);
    },
  );
}

function parseTimestamp(value: string): number | undefined {
  const match = TIMESTAMP_PATTERN.exec(value);
  if (!match) return undefined;

  const hours = match[1] === undefined ? 0 : Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  const seconds = Number.parseInt(match[3], 10);
  const milliseconds = Number.parseInt(match[4], 10);
  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
}

function parseTimingLine(line: string): CueTiming | undefined {
  const match = TIMING_LINE_PATTERN.exec(line.trim());
  if (!match) return undefined;

  const start = parseTimestamp(match[1]);
  const end = parseTimestamp(match[2]);
  if (start === undefined || end === undefined) return undefined;

  return { start, end, startTime: match[1], endTime: match[2] };
}

/** Turn a cue payload into text runs while treating all markup as inert. */
function parsePayload(lines: readonly string[]): TranscriptSegment[] {
  const source = lines.join("\n");
  const segments: TranscriptSegment[] = [];
  let currentSpeaker: string | null = null;
  let activeSegment: TranscriptSegment | undefined;
  let cursor = 0;

  const appendText = (text: string): void => {
    if (text === "") return;
    if (!activeSegment) {
      activeSegment = { speaker: currentSpeaker, text: "" };
      segments.push(activeSegment);
    }
    activeSegment.text += decodeEntities(text);
  };

  for (const match of source.matchAll(/<[^>]*>/g)) {
    const tagIndex = match.index;
    if (tagIndex === undefined) continue;
    appendText(source.slice(cursor, tagIndex));
    cursor = tagIndex + match[0].length;

    const tag = match[0];
    if (VOICE_CLOSE_PATTERN.test(tag)) {
      currentSpeaker = null;
      activeSegment = undefined;
      continue;
    }

    const voice = VOICE_OPEN_PATTERN.exec(tag);
    if (voice) {
      const speaker = normalizeWhitespace(decodeEntities(voice[1]));
      if (speaker !== "") {
        currentSpeaker = speaker;
        activeSegment = undefined;
      }
    }
  }
  appendText(source.slice(cursor));

  return segments
    .map((segment) => ({ ...segment, text: normalizeWhitespace(segment.text) }))
    .filter((segment) => segment.text !== "");
}

function isIgnoredBlock(firstLine: string): boolean {
  return /^(?:NOTE|STYLE|REGION)(?:[\t ]|$)/.test(firstLine);
}

/**
 * Parse the readable cues in a WebVTT transcript.
 *
 * Course and meeting transcripts are untrusted input. This parser never turns
 * their payload into DOM or HTML: tags are discarded and entities become plain
 * text only after tag processing has finished.
 */
export function parseWebVtt(input: string): Transcript {
  const source = input.startsWith("\ufeff") ? input.slice(1) : input;
  const lines = source.split(/\r\n|\n|\r/);
  if (!HEADER_PATTERN.test(lines[0] ?? "")) {
    throw new Error("This file does not have a WebVTT header.");
  }

  // Header metadata extends to the first blank line and is not cue content.
  let bodyStart = 1;
  while (bodyStart < lines.length && lines[bodyStart].trim() !== "") bodyStart++;
  bodyStart++;

  const cues: TranscriptCue[] = [];
  const warnings: string[] = [];
  let block: string[] = [];
  let blockNumber = 0;

  const readBlock = (blockLines: readonly string[]): void => {
    if (blockLines.length === 0) return;
    blockNumber++;
    const firstLine = blockLines[0];
    if (isIgnoredBlock(firstLine)) return;

    let timing = parseTimingLine(firstLine);
    let timingIndex = 0;
    let identifier: string | undefined;

    if (!timing && blockLines.length > 1) {
      timing = parseTimingLine(blockLines[1]);
      if (timing) {
        identifier = normalizeWhitespace(firstLine);
        timingIndex = 1;
      }
    }

    if (!timing) {
      warnings.push(`Skipped cue block ${blockNumber} because its timing line is missing or malformed.`);
      return;
    }
    if (timing.end < timing.start) {
      warnings.push(`Skipped cue block ${blockNumber} because its end time is before its start time.`);
      return;
    }

    const segments = parsePayload(blockLines.slice(timingIndex + 1));
    if (segments.length === 0) return;

    cues.push({
      index: cues.length,
      ...(identifier === undefined ? {} : { identifier }),
      start: timing.start,
      end: timing.end,
      startTime: timing.startTime,
      endTime: timing.endTime,
      segments,
    });
  };

  for (let index = bodyStart; index < lines.length; index++) {
    const line = lines[index];
    if (line.trim() === "") {
      readBlock(block);
      block = [];
    } else {
      block.push(line);
    }
  }
  readBlock(block);

  if (cues.length === 0) {
    throw new Error("No readable transcript cues were found.");
  }
  return { cues, warnings };
}
