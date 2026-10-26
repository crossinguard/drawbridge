/**
 * Turning instructions into requirements.
 *
 * The instructions of an assignment hold everything the student is asked for,
 * and everything else too: headings, links, citations, template text, and the
 * platform's leftovers. Only the first kind can be compared with a rubric.
 *
 * A requirement is a sentence or a bullet of at least five words. Everything
 * else is dropped, and what was dropped is reported, so that nothing is
 * quietly ignored.
 */
import { cleanText, type Artifact } from "@/lib/tools/assessment-review/text/artifacts";
import { measuresIn, type Measure } from "@/lib/tools/assessment-review/text/measures";

/** One requirement taken from the instructions. */
export interface Requirement {
  /** The requirement, as written, with the list marker taken off. */
  text: string;
  /** The words used to match it to a criterion. */
  keywords: string[];
  /** The numbers it mentions. */
  numbers: number[];
  /** The quantities it mentions, with the sentence each came from. */
  measures: Measure[];
  /** Where the requirement came from. */
  source: string;
}

/** A piece of text that was not treated as a requirement. */
export interface DroppedUnit {
  /** The text, shortened. */
  text: string;
  /** Why it was dropped. */
  reason: string;
}

/** The result of reading a piece of instructions. */
export interface Requirements {
  /** The requirements that were found. */
  requirements: Requirement[];
  /** The text that was not a requirement. */
  dropped: DroppedUnit[];
  /** The platform leftovers that were taken out first. */
  artifacts: Artifact[];
}

/** The fewest words a sentence or bullet has to have to be a requirement. */
export const MIN_REQUIREMENT_WORDS = 5;

/** Words that carry no meaning when matching a requirement to a criterion. */
const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "against",
  "also",
  "and",
  "any",
  "are",
  "because",
  "been",
  "before",
  "being",
  "between",
  "both",
  "but",
  "can",
  "could",
  "does",
  "doing",
  "done",
  "down",
  "during",
  "each",
  "from",
  "further",
  "have",
  "having",
  "here",
  "how",
  "into",
  "its",
  "itself",
  "just",
  "more",
  "most",
  "must",
  "not",
  "now",
  "off",
  "once",
  "only",
  "other",
  "over",
  "own",
  "same",
  "should",
  "some",
  "such",
  "than",
  "that",
  "the",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "through",
  "under",
  "until",
  "very",
  "was",
  "were",
  "what",
  "when",
  "where",
  "which",
  "while",
  "with",
  "would",
  "your",
]);

/** The words that make a line of instructions a requirement. */
const REQUIREMENT_WORDS = [
  "must",
  "should",
  "include",
  "submit",
  "minimum",
  "maximum",
  "at least",
  "no more than",
  "use",
  "provide",
  "ensure",
  "format",
  "required",
  "requirement",
  "write",
  "prepare",
  "cite",
  "discuss",
  "analyze",
  "complete",
  "attach",
  "upload",
  "turn in",
];

/** The list markers a bullet or a numbered step can carry. */
const LIST_MARKER = /^\s*(?:[-•*–—▪◦‣]|\d+[.)]|[a-z][.)]|[ivx]+[.)])\s+/i;

/** A line that is only a link, or only a URL. */
const BARE_LINK = /^(?:https?:\/\/\S+|www\.\S+|\S+\s+link\s+here)$/i;

/** A line that tells the reader to click something. */
const CLICK_LINE = /^(?:click here|click on|see the link|for more information|for more details)\b/i;

/** A line that is a citation rather than a requirement. */
const CITATION =
  /^(?:retrieved from|https?:\/\/\S+\.\s*$)|(?:\((?:[^()]*,\s*)?(?:19|20)\d{2}[a-z]?(?:,\s*p{1,2}\.\s*[\d–-]+)?\))/i;

/** Text that is a placeholder waiting to be filled in. */
const PLACEHOLDER =
  /\{\{|\[\s*(?:insert|enter|name|topic|your|date|title|placeholder|tbd|todo)[^\]]*\]|<[^>]{1,40}>|\b(?:tbd|todo|lorem ipsum|xxx+)\b/i;

/** A heading: short, and it introduces what follows. */
const HEADING = /^[A-Z][^.:!?]{0,60}:$/;

/**
 * Break the instructions into requirements.
 *
 * The text is cleaned first, then split into sentences and bullets, then
 * filtered. What was dropped is reported.
 */
export function extractRequirements(instructions: string, source = "the instructions"): Requirements {
  const cleaned = cleanText(instructions);
  const dropped: DroppedUnit[] = [];

  const requirements: Requirement[] = [];

  for (const unit of splitIntoUnits(cleaned.text)) {
    const text = unit.text.replace(LIST_MARKER, "").trim();

    const reason = whyNotARequirement(text);
    if (reason !== undefined) {
      dropped.push({ text: shorten(text), reason });
      continue;
    }

    requirements.push({
      text,
      keywords: keywordsOf(text),
      numbers: [...new Set((text.match(/\d+(?:\.\d+)?/g) ?? []).map(Number))],
      measures: measuresIn(text, text),
      source,
    });
  }

  return { requirements, dropped, artifacts: cleaned.artifacts };
}

/** Why a piece of text is not a requirement, or undefined when it is one. */
function whyNotARequirement(text: string): string | undefined {
  if (text === "") return "the text was empty";
  if (BARE_LINK.test(text)) return "a bare link";
  if (CLICK_LINE.test(text)) return "a line that only points somewhere else";
  if (PLACEHOLDER.test(text)) return "template or placeholder text";
  if (HEADING.test(text)) return "a heading";
  if (CITATION.test(text)) return "a reference citation";

  const words = text.split(/\s+/).filter((word) => word !== "");
  if (words.length < MIN_REQUIREMENT_WORDS) {
    // A short bullet may still be a requirement when it says what to do.
    const saysWhatToDo = REQUIREMENT_WORDS.some((word) => new RegExp(`\\b${escapeRegExp(word)}\\b`, "i").test(text));
    if (!saysWhatToDo) return `only ${words.length} words`;
  }

  return undefined;
}

/**
 * Split a piece of text into the units that could be requirements.
 *
 * A block that reads as a list is split at its bullets. A block that reads as
 * a paragraph is split at its sentences.
 */
function splitIntoUnits(text: string): { text: string }[] {
  const units: { text: string }[] = [];

  for (const block of text.split(/\n+/)) {
    const line = block.trim();
    if (line === "") continue;

    if (LIST_MARKER.test(line)) {
      units.push({ text: line });
      continue;
    }

    // A block with bullets inside it is already split above; this one is prose.
    const sentences = line
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.trim())
      .filter((s) => s !== "");
    if (sentences.length > 1) {
      units.push(...sentences.map((text) => ({ text })));
      continue;
    }

    units.push({ text: line });
  }

  return units;
}

/** The words worth matching on. */
export function keywordsOf(text: string): string[] {
  return [
    ...new Set(
      (text.toLowerCase().match(/[a-z][a-z'-]{3,}/g) ?? []).filter(
        (word) => !STOP_WORDS.has(word) && !REQUIREMENT_WORDS.includes(word),
      ),
    ),
  ];
}

/** Escape a string for use in a regular expression. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Shorten a piece of text so a dropped line can be listed. */
function shorten(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > 120 ? `${trimmed.slice(0, 117)}…` : trimmed;
}
