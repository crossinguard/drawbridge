/**
 * The platform's leftovers in course text.
 *
 * An export carries whatever the editor left behind: zero-width characters,
 * non-breaking spaces, entities that were never decoded, and empty elements.
 * None of it means anything, and comparing it produces nonsense, so it is
 * taken out before anything is compared.
 *
 * What was taken out is reported, so the stripping is visible rather than
 * silent.
 */

/** One kind of leftover, and how often it was found. */
export interface Artifact {
  /** What the leftover is called. */
  kind: string;
  /** How many were found. */
  count: number;
  /** An example of what it looked like. */
  sample: string;
}

/** The result of cleaning a piece of text. */
export interface CleanText {
  /** The text without the leftovers. */
  text: string;
  /** What was taken out. */
  artifacts: Artifact[];
}

/** The characters that carry no ink and mean nothing. */
const INVISIBLE = /[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g;

/** The characters that are not allowed to appear in text. */
const CONTROLS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** The entities the platform writes but does not always decode. */
const ENTITIES: { pattern: RegExp; replacement: string; kind: string }[] = [
  { pattern: /&nbsp;/gi, replacement: " ", kind: "a non-breaking space" },
  { pattern: /&amp;/gi, replacement: "&", kind: "an ampersand entity" },
  { pattern: /&lt;/gi, replacement: "<", kind: "a less-than entity" },
  { pattern: /&gt;/gi, replacement: ">", kind: "a greater-than entity" },
  { pattern: /&quot;/gi, replacement: '"', kind: "a quotation entity" },
  { pattern: /&#0?39;|&apos;/gi, replacement: "'", kind: "an apostrophe entity" },
];

/** The markup that is sometimes left in a copied block of text. */
const LEFTOVER_TAGS = /<\/?[a-z][^>]*>/gi;

/**
 * Take the platform's leftovers out of a piece of text.
 *
 * The leftovers are counted as they are removed, so the review can report
 * what it cleaned.
 */
export function cleanText(text: string): CleanText {
  const artifacts: Artifact[] = [];
  let result = text;

  const record = (kind: string, sample: string): void => {
    const existing = artifacts.find((artifact) => artifact.kind === kind);
    if (existing) {
      existing.count++;
      return;
    }
    artifacts.push({ kind, count: 1, sample });
  };

  result = result.replace(INVISIBLE, (match) => {
    record("an invisible character", match);
    return "";
  });

  result = result.replace(CONTROLS, (match) => {
    record("a control character", match);
    return " ";
  });

  result = result.replace(/\u00a0/g, (match) => {
    record("a non-breaking space", match);
    return " ";
  });

  for (const entity of ENTITIES) {
    result = result.replace(entity.pattern, (match) => {
      record(entity.kind, match);
      return entity.replacement;
    });
  }

  result = result.replace(LEFTOVER_TAGS, (match) => {
    record("a leftover tag", match);
    return " ";
  });

  // A line that held nothing but leftovers is now empty.
  result = result
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line, index, lines) => !(line === "" && lines[index - 1] === ""))
    .join("\n");

  result = result.replace(/[ \t]{2,}/g, " ").trim();

  return { text: result, artifacts };
}
