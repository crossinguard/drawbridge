/** One attributed or unattributed piece of transcript text. */
export interface TranscriptSegment {
  /** Normalized original speaker annotation, or null when the text has no speaker. */
  speaker: string | null;
  text: string;
}

/** One readable WebVTT cue, in its original file order. */
export interface TranscriptCue {
  /** Zero-based position among readable cues. */
  index: number;
  identifier?: string;
  /** Start and end times in seconds. */
  start: number;
  end: number;
  /** Original timestamp text from the file. */
  startTime: string;
  endTime: string;
  segments: TranscriptSegment[];
}

export interface Transcript {
  cues: TranscriptCue[];
  /** Plain-language descriptions of malformed blocks that were skipped. */
  warnings: string[];
}

export interface TranscriptSpeaker {
  /** Stable, case-sensitive ID derived from the original speaker annotation. */
  id: string;
  name: string;
  /** Number of cues containing this speaker, counted at most once per cue. */
  cueCount: number;
}

export interface TranscriptFormatOptions {
  includeSpeakers: boolean;
  includeTimestamps: boolean;
  mergeSpeakers: boolean;
}

export interface TranscriptReviewFilter {
  search?: string;
  /** Exact speaker ID, null for unattributed segments, or undefined for no speaker filter. */
  speaker?: string | null;
}

export type SpeakerNameMap = Readonly<Record<string, string>>;
