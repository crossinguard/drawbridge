/** Pure WebVTT transcript checks. Run with: bun scripts/transcript-parser-test.ts. */
import {
  DEFAULT_TRANSCRIPT_FORMAT_OPTIONS,
  downloadTranscriptFilename,
  formatTimestamp,
  formatTranscript,
} from "../src/lib/tools/transcript-to-text/format";
import { parseWebVtt } from "../src/lib/tools/transcript-to-text/parse";
import { filterTranscriptCues, getTranscriptSpeakers } from "../src/lib/tools/transcript-to-text/selectors";
import type { TranscriptCue, TranscriptSegment } from "../src/lib/tools/transcript-to-text/types";

let failures = 0;

function check(name: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ok — ${name}`);
  } else {
    failures++;
    console.error(`  FAIL — ${name}\n    expected: ${e}\n    actual:   ${a}`);
  }
}

function ok(name: string, condition: boolean): void {
  check(name, condition, true);
}

function checkError(name: string, run: () => unknown, expected: string): void {
  let actual = "Did not throw.";
  try {
    run();
  } catch (error) {
    actual = error instanceof Error ? error.message : String(error);
  }
  check(name, actual, expected);
}

function cue(index: number, start: number, segments: TranscriptSegment[]): TranscriptCue {
  return {
    index,
    start,
    end: start + 1,
    startTime: `synthetic-start-${index}`,
    endTime: `synthetic-end-${index}`,
    segments,
  };
}

console.log("\nWebVTT headers, blocks, timings, and payload");
const syntheticVtt = `\ufeffWEBVTT - synthetic captions\r\nKind: captions\r\nLanguage: en\r\n\r\nNOTE This synthetic comment contains no captions.\r\n00:59.000 --> 01:00.000\r\nNot a cue inside the note.\r\n\r\nSTYLE\r\n::cue { color: green; }\r\n\r\nREGION\r\nid:synthetic-region\r\nwidth:40%\r\n\r\nopening-id\r\n00:00:01.250 --> 00:00:03.500 line:90% position:10%\r\n<v  Alice   Smith >Hello &amp; welcome</v>\r\n<v Bob>Second line\r\ncontinues</v>\r\n\r\n00:04.000 --> 00:05.750 align:start\r\nPlain <b>bold</b> &lt;text&gt;<00:04.500> after\r\n`;
const parsed = parseWebVtt(syntheticVtt);
check("readable cue count", parsed.cues.length, 2);
check("ignored blocks produce no warnings", parsed.warnings, []);
check(
  "zero-based cue indexes",
  parsed.cues.map((item) => item.index),
  [0, 1],
);
check("optional cue identifier", parsed.cues[0]?.identifier, "opening-id");
check("missing cue identifier remains absent", "identifier" in (parsed.cues[1] ?? {}), false);
check("hour timestamp in seconds", [parsed.cues[0]?.start, parsed.cues[0]?.end], [1.25, 3.5]);
check("minute timestamp in seconds", [parsed.cues[1]?.start, parsed.cues[1]?.end], [4, 5.75]);
check(
  "original timestamp text is retained",
  [parsed.cues[0]?.startTime, parsed.cues[0]?.endTime, parsed.cues[1]?.startTime],
  ["00:00:01.250", "00:00:03.500", "00:04.000"],
);
check("speaker annotation whitespace is normalized", parsed.cues[0]?.segments[0]?.speaker, "Alice Smith");
check("voice text and entity decoding", parsed.cues[0]?.segments[0]?.text, "Hello & welcome");
check(
  "multiple voices in one cue",
  parsed.cues[0]?.segments.map((segment) => segment.speaker),
  ["Alice Smith", "Bob"],
);
check("multiline voice payload", parsed.cues[0]?.segments[1]?.text, "Second line continues");
check("plain cue has no invented speaker", parsed.cues[1]?.segments[0]?.speaker, null);
check(
  "other tags and inline timestamps are removed",
  parsed.cues[1]?.segments.map((segment) => segment.text),
  ["Plain bold <text> after"],
);

const mixedVoices = parseWebVtt(`WEBVTT

00:00:00.000 --> 00:00:02.000
Lead <v Ada>one <i>two</i></v> between <v Ben>three</v> tail
`);
check("plain and voiced runs retain their order", mixedVoices.cues[0]?.segments, [
  { speaker: null, text: "Lead" },
  { speaker: "Ada", text: "one two" },
  { speaker: null, text: "between" },
  { speaker: "Ben", text: "three" },
  { speaker: null, text: "tail" },
]);

console.log("\nEmpty, repeated, and malformed cues");
const repeated = parseWebVtt(`WEBVTT

00:00:00.000 --> 00:00:01.000
<c></c>

00:00:01.000 --> 00:00:02.000
<v A>Same synthetic text</v>

00:00:02.000 --> 00:00:03.000
<v A>Same synthetic text</v>
`);
check("empty cues are skipped", repeated.cues.length, 2);
check(
  "readable indexes stay contiguous after skipped cues",
  repeated.cues.map((item) => item.index),
  [0, 1],
);
check(
  "repeated text is not fuzzy-deduplicated",
  repeated.cues.map((item) => item.segments[0]?.text),
  ["Same synthetic text", "Same synthetic text"],
);
check("empty cues do not create warnings", repeated.warnings, []);

const malformed = parseWebVtt(`WEBVTT

00:00:00.000 --> 00:00:01.000
Readable synthetic cue.

broken-block
this is not a timing line
Unreadable text.

bad-minutes
00:99:00.000 --> 00:99:01.000
Unreadable text.

00:00:04.000 --> 00:00:02.000
Backwards synthetic cue.
`);
check("valid cue survives malformed neighbors", malformed.cues.length, 1);
check("each malformed nonempty cue block warns", malformed.warnings.length, 3);
ok(
  "warnings use plain language",
  malformed.warnings.every((warning) => warning.startsWith("Skipped cue block ")),
);
ok(
  "reversed timing has a specific warning",
  malformed.warnings.some((warning) => warning.includes("end time is before its start time")),
);

checkError(
  "invalid header error",
  () => parseWebVtt("Not WebVTT\n\n00:00.000 --> 00:01.000\nText"),
  "This file does not have a WebVTT header.",
);
checkError(
  "lowercase signature is not a WebVTT header",
  () => parseWebVtt("webvtt\n\n00:00.000 --> 00:01.000\nText"),
  "This file does not have a WebVTT header.",
);
checkError(
  "valid header without cues error",
  () => parseWebVtt("WEBVTT\nLanguage: en\n\nNOTE No captions here."),
  "No readable transcript cues were found.",
);
checkError(
  "only malformed cues has no readable transcript error",
  () => parseWebVtt("WEBVTT\n\nbroken\nnot a time\ntext"),
  "No readable transcript cues were found.",
);
checkError(
  "only empty cues has no readable transcript error",
  () => parseWebVtt("WEBVTT\n\n00:00.000 --> 00:01.000\n<b> </b>"),
  "No readable transcript cues were found.",
);

console.log("\nUnicode, entities, and inert markup");
const unicode = parseWebVtt(`WEBVTT

00:00:00.000 --> 00:00:02.000
<v Zoë   🧑‍🏫>Café &amp; tea &lt;img src=x onerror=alert(1)&gt; &amp;amp; &#x1F642; &#9786; &unknown; &constructor; &#x110000;</v>

00:00:02.000 --> 00:00:03.000
<script>alert("synthetic")</script> <b>safe</b>
`);
check("Unicode speaker is preserved", unicode.cues[0]?.segments[0]?.speaker, "Zoë 🧑‍🏫");
check(
  "named and numeric entities become plain text",
  unicode.cues[0]?.segments[0]?.text,
  "Café & tea <img src=x onerror=alert(1)> &amp; 🙂 ☺ &unknown; &constructor; &#x110000;",
);
check("raw markup is not retained", unicode.cues[1]?.segments[0]?.text, 'alert("synthetic") safe');
ok(
  "XSS-like source produces strings, not executable markup",
  unicode.cues.every((item) =>
    item.segments.every((segment) => typeof segment.text === "string" && !segment.text.includes("<script")),
  ),
);

console.log("\nSpeaker selectors and review filters");
const reviewCues = [
  cue(0, 0, [
    { speaker: "Alice", text: "Alpha" },
    { speaker: "Alice", text: "again" },
  ]),
  cue(1, 2, [{ speaker: "Bob", text: "Beta needle" }]),
  cue(2, 4, [{ speaker: null, text: "Silent needle" }]),
  cue(3, 6, [{ speaker: "Alice", text: "Gamma" }]),
  cue(4, 8, [{ speaker: "alice", text: "Lower" }]),
];
const speakers = getTranscriptSpeakers(reviewCues);
check(
  "speaker IDs remain case-sensitive",
  speakers.map((speaker) => speaker.id),
  ["alice", "Alice", "Bob"],
);
check(
  "repeated segments count once per cue",
  speakers.find((speaker) => speaker.id === "Alice"),
  { id: "Alice", name: "Alice", cueCount: 2 },
);
check(
  "unattributed text is not a named speaker",
  speakers.some((speaker) => speaker.id === ""),
  false,
);
check(
  "speaker display names are sorted",
  getTranscriptSpeakers([
    cue(0, 0, [{ speaker: "Zoe", text: "Last" }]),
    cue(1, 1, [{ speaker: "Alice", text: "First" }]),
    cue(2, 2, [{ speaker: "Bob", text: "Middle" }]),
  ]).map((speaker) => speaker.name),
  ["Alice", "Bob", "Zoe"],
);
check(
  "case-insensitive cue text search",
  filterTranscriptCues(reviewCues, { search: "NEEDLE" }).map((item) => item.index),
  [1, 2],
);
check(
  "exact speaker filter",
  filterTranscriptCues(reviewCues, { speaker: "Alice" }).map((item) => item.index),
  [0, 3],
);
check(
  "speaker filter does not case-fold IDs",
  filterTranscriptCues(reviewCues, { speaker: "alice" }).map((item) => item.index),
  [4],
);
check(
  "null speaker filter finds unattributed segments",
  filterTranscriptCues(reviewCues, { speaker: null }).map((item) => item.index),
  [2],
);
check(
  "speaker and search filters combine",
  filterTranscriptCues(reviewCues, { speaker: "Alice", search: "gamma" }).map((item) => item.index),
  [3],
);
check(
  "failed combined filter stays empty",
  filterTranscriptCues(reviewCues, { speaker: "Alice", search: "needle" }),
  [],
);
check(
  "original speaker names are searchable",
  filterTranscriptCues(reviewCues, { search: "alice" }).map((item) => item.index),
  [0, 3, 4],
);
check(
  "corrected speaker names are searchable",
  filterTranscriptCues(reviewCues, { search: "alicia" }, { Alice: "Alicia" }).map((item) => item.index),
  [0, 3],
);
check(
  "empty filter preserves order",
  filterTranscriptCues(reviewCues, {}).map((item) => item.index),
  [0, 1, 2, 3, 4],
);

console.log("\nPlain-text formatting and downloads");
const formatCues = [
  cue(0, 1.9, [
    { speaker: "Alice", text: "Hello" },
    { speaker: "Bob", text: "there" },
  ]),
  cue(1, 3.9, [{ speaker: "Alice", text: "again" }]),
  cue(2, 5, [{ speaker: null, text: "Unattributed" }]),
  cue(3, 7, [{ speaker: null, text: "continues" }]),
  cue(4, 3661.9, [{ speaker: "Carol", text: "Hi" }]),
];
const correctedSpeakers = { Alice: "Alex", Bob: "Alex" };
check("default formatting options", DEFAULT_TRANSCRIPT_FORMAT_OPTIONS, {
  includeSpeakers: true,
  includeTimestamps: false,
  mergeSpeakers: true,
});
check(
  "corrected names merge consecutive original speakers and cues",
  formatTranscript(formatCues, DEFAULT_TRANSCRIPT_FORMAT_OPTIONS, correctedSpeakers),
  "Alex: Hello there again\n\nUnattributed continues\n\nCarol: Hi",
);
check(
  "clearing a corrected name restores the original",
  formatTranscript(formatCues, DEFAULT_TRANSCRIPT_FORMAT_OPTIONS, { Alice: "  " }),
  "Alice: Hello\n\nBob: there\n\nAlice: again\n\nUnattributed continues\n\nCarol: Hi",
);
check(
  "timestamps use the first cue start in each paragraph",
  formatTranscript(formatCues, { ...DEFAULT_TRANSCRIPT_FORMAT_OPTIONS, includeTimestamps: true }, correctedSpeakers),
  "[00:00:01] Alex: Hello there again\n\n[00:00:05] Unattributed continues\n\n[01:01:01] Carol: Hi",
);
check(
  "hiding speakers does not reorder or invent labels",
  formatTranscript(formatCues, { ...DEFAULT_TRANSCRIPT_FORMAT_OPTIONS, includeSpeakers: false }, correctedSpeakers),
  "Hello there again\n\nUnattributed continues\n\nHi",
);
check(
  "disabled merging creates one paragraph per segment",
  formatTranscript(formatCues, { ...DEFAULT_TRANSCRIPT_FORMAT_OPTIONS, mergeSpeakers: false }, correctedSpeakers),
  "Alex: Hello\n\nAlex: there\n\nAlex: again\n\nUnattributed\n\ncontinues\n\nCarol: Hi",
);
check(
  "plain output can disable speakers and merging together",
  formatTranscript(
    formatCues,
    { includeSpeakers: false, includeTimestamps: false, mergeSpeakers: false },
    correctedSpeakers,
  ),
  "Hello\n\nthere\n\nagain\n\nUnattributed\n\ncontinues\n\nHi",
);
const prototypeNamedCues = [
  cue(0, 0, [{ speaker: "constructor", text: "First" }]),
  cue(1, 1, [{ speaker: "__proto__", text: "Second" }]),
];
check(
  "speaker IDs do not inherit object prototype values",
  formatTranscript(prototypeNamedCues, DEFAULT_TRANSCRIPT_FORMAT_OPTIONS),
  "constructor: First\n\n__proto__: Second",
);
check(
  "prototype-like speaker IDs can be corrected safely",
  formatTranscript(prototypeNamedCues, DEFAULT_TRANSCRIPT_FORMAT_OPTIONS, {
    constructor: "Renamed",
    ["__proto__"]: "Also renamed",
  }),
  "Renamed: First\n\nAlso renamed: Second",
);
check(
  "prototype-like speaker IDs remain searchable",
  filterTranscriptCues(prototypeNamedCues, { search: "constructor" }).map((item) => item.index),
  [0],
);
check("empty transcript formats to empty text", formatTranscript([], DEFAULT_TRANSCRIPT_FORMAT_OPTIONS), "");
check("zero timestamp", formatTimestamp(0), "00:00:00");
check("fractional seconds floor for display", formatTimestamp(59.999), "00:00:59");
check("minutes and seconds", formatTimestamp(61.9), "00:01:01");
check("hours, minutes, and seconds", formatTimestamp(3661.9), "01:01:01");
check("hours can exceed two digits", formatTimestamp(360000), "100:00:00");
check("negative display times are clamped", formatTimestamp(-2), "00:00:00");
check("lowercase VTT extension", downloadTranscriptFilename("synthetic.vtt"), "synthetic.txt");
check("uppercase VTT extension", downloadTranscriptFilename("synthetic.VTT"), "synthetic.txt");
check("only final VTT extension is replaced", downloadTranscriptFilename("synthetic.vtt.vtt"), "synthetic.vtt.txt");
check("other extensions gain TXT", downloadTranscriptFilename("synthetic.csv"), "synthetic.csv.txt");
check("missing extension gains TXT", downloadTranscriptFilename("synthetic"), "synthetic.txt");

if (failures > 0) {
  console.error(`\n${failures} transcript check(s) failed.`);
  process.exit(1);
}
console.log("\nAll transcript checks passed.");
