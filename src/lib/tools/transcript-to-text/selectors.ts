import type { SpeakerNameMap, TranscriptCue, TranscriptReviewFilter, TranscriptSpeaker } from "./types";

function correctedName(speaker: string, speakerNames: SpeakerNameMap): string {
  const corrected = Object.hasOwn(speakerNames, speaker) ? speakerNames[speaker] : undefined;
  return corrected?.trim() || speaker;
}

/** List each case-sensitive speaker ID once, with a unique per-cue count. */
export function getTranscriptSpeakers(cues: readonly TranscriptCue[]): TranscriptSpeaker[] {
  const speakers = new Map<string, TranscriptSpeaker>();

  for (const cue of cues) {
    const idsInCue = new Set(
      cue.segments.map((segment) => segment.speaker).filter((speaker): speaker is string => speaker !== null),
    );
    for (const id of idsInCue) {
      const existing = speakers.get(id);
      if (existing) {
        existing.cueCount++;
      } else {
        speakers.set(id, { id, name: id, cueCount: 1 });
      }
    }
  }

  return [...speakers.values()].sort(
    (left, right) =>
      left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" }) ||
      left.id.localeCompare(right.id),
  );
}

function cueSearchText(cue: TranscriptCue, speakerNames: SpeakerNameMap): string {
  return cue.segments
    .flatMap((segment) => {
      if (segment.speaker === null) return [segment.text];
      return [segment.text, segment.speaker, correctedName(segment.speaker, speakerNames)];
    })
    .join(" ")
    .toLocaleLowerCase();
}

/** Filter in original cue order; speaker and search conditions must both match. */
export function filterTranscriptCues(
  cues: readonly TranscriptCue[],
  filter: TranscriptReviewFilter,
  speakerNames: SpeakerNameMap = {},
): TranscriptCue[] {
  const search = filter.search?.trim().toLocaleLowerCase() ?? "";

  return cues.filter((cue) => {
    if (filter.speaker !== undefined && !cue.segments.some((segment) => segment.speaker === filter.speaker)) {
      return false;
    }
    return search === "" || cueSearchText(cue, speakerNames).includes(search);
  });
}
