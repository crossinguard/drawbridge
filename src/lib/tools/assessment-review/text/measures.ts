/**
 * The quantities a piece of text states.
 *
 * "6-8 pages", "5 pages or less", "at least 3 sources", "under 10 pages" and
 * "2 sentences" all say something about how much is wanted, and they do not
 * all say the same thing. Each one is read into a range, so two of them can
 * be compared without guessing.
 */

/** A quantity, read as a range. */
export interface Measure {
  /** The text the quantity was read from. */
  raw: string;
  /** What it counts, e.g. "pages". */
  unit: string;
  /** The key the unit is compared by, so "page" and "pages" are one unit. */
  key: string;
  /** The smallest value the text allows. */
  min: number;
  /** The largest value the text allows. */
  max: number;
  /** True when the text allows only one value. */
  exact: boolean;
  /** True when the lower bound is not allowed. */
  exclusiveMin: boolean;
  /** True when the upper bound is not allowed. */
  exclusiveMax: boolean;
  /** The sentence the quantity came from. */
  sentence: string;
}

/** The units the review compares between the instructions and the rubric. */
export const MEASURE_UNITS = [
  "page",
  "pages",
  "word",
  "words",
  "source",
  "sources",
  "sentence",
  "sentences",
  "question",
  "questions",
  "minute",
  "minutes",
  "hour",
  "hours",
  "day",
  "days",
  "week",
  "weeks",
  "point",
  "points",
  "file",
  "files",
  "claim",
  "claims",
  "criterion",
  "criteria",
  "paragraph",
  "paragraphs",
  "reference",
  "references",
  "citation",
  "citations",
  "example",
  "examples",
  "area",
  "areas",
  "section",
  "sections",
  "topic",
  "topics",
  "student",
  "students",
  "author",
  "authors",
  "term",
  "terms",
  "step",
  "steps",
] as const;

/** The words that put a ceiling on a quantity. */
const MAX_PHRASES: { pattern: RegExp; exclusive: boolean }[] = [
  { pattern: /\b(?:or less|or fewer|no more than|at most|up to|maximum of|max of)\b/i, exclusive: false },
  { pattern: /\b(?:under|less than|fewer than|below)\b/i, exclusive: true },
];

/** The words that put a floor on a quantity. */
const MIN_PHRASES: { pattern: RegExp; exclusive: boolean }[] = [
  { pattern: /\b(?:at least|a minimum of|minimum of|no fewer than|no less than)\b/i, exclusive: false },
  { pattern: /\b(?:more than|over|greater than|exceeds)\b/i, exclusive: true },
];

/** The words that mean there is no limit at all. */
const UNBOUNDED = /\b(?:unlimited|any number|no limit|as many as|as much as)\b/i;

/** A number, with the decimal point. */
const NUMBER = String.raw`\d+(?:\.\d+)?`;

/** How far around a number a bounding word may sit. */
const CONTEXT = 40;

/**
 * Read the quantities out of a piece of text.
 *
 * Each quantity carries the sentence it came from, so a report can show the
 * exact words on both sides of a comparison.
 */
export function measuresIn(text: string, sentence = text): Measure[] {
  const measures: Measure[] = [];
  const units = MEASURE_UNITS.join("|");

  // A range: "6-8 pages", "4 to 5 pages", "6–8 pages".
  const range = new RegExp(String.raw`(${NUMBER})\s*(?:-|–|—|to)\s*(${NUMBER})\s+(${units})\b`, "gi");
  const taken: [number, number][] = [];

  for (const match of text.matchAll(range)) {
    const low = Number(match[1]);
    const high = Number(match[2]);

    taken.push([match.index, match.index + match[0].length]);

    measures.push({
      raw: match[0].trim(),
      unit: match[3].toLowerCase(),
      key: unitKey(match[3]),
      min: Math.min(low, high),
      max: Math.max(low, high),
      exact: false,
      exclusiveMin: false,
      exclusiveMax: false,
      sentence,
    });
  }

  // A single quantity: "5 pages or less", "under 10 pages", "3 sources".
  // One word may sit between the number and the unit — "5 complete sentences".
  const single = new RegExp(String.raw`(${NUMBER})\s+(?:[a-z-]+\s+)?(${units})\b`, "gi");

  for (const match of text.matchAll(single)) {
    const start = match.index;
    const end = start + match[0].length;

    // A range already covered this number.
    if (taken.some(([from, to]) => start >= from && end <= to)) continue;

    const raw = match[0].trim();
    const value = Number(match[1]);
    const unit = match[2].toLowerCase();

    const before = text.slice(Math.max(0, start - CONTEXT), start);
    const after = text.slice(end, end + CONTEXT);

    const maxRule =
      MAX_PHRASES.find((rule) => rule.pattern.test(after)) ?? MAX_PHRASES.find((rule) => rule.pattern.test(before));
    const minRule =
      MIN_PHRASES.find((rule) => rule.pattern.test(after)) ?? MIN_PHRASES.find((rule) => rule.pattern.test(before));

    if (maxRule) {
      measures.push({
        raw,
        unit,
        key: unitKey(unit),
        min: 0,
        max: value,
        exact: false,
        exclusiveMin: false,
        exclusiveMax: maxRule.exclusive,
        sentence,
      });
      continue;
    }

    if (minRule) {
      measures.push({
        raw,
        unit,
        key: unitKey(unit),
        min: value,
        max: Number.POSITIVE_INFINITY,
        exact: false,
        exclusiveMin: minRule.exclusive,
        exclusiveMax: false,
        sentence,
      });
      continue;
    }

    if (UNBOUNDED.test(after) || UNBOUNDED.test(before)) {
      measures.push({
        raw,
        unit,
        key: unitKey(unit),
        min: value,
        max: Number.POSITIVE_INFINITY,
        exact: false,
        exclusiveMin: false,
        exclusiveMax: false,
        sentence,
      });
      continue;
    }

    measures.push({
      raw,
      unit,
      key: unitKey(unit),
      min: value,
      max: value,
      exact: true,
      exclusiveMin: false,
      exclusiveMax: false,
      sentence,
    });
  }

  return measures;
}

/**
 * True when two quantities can both be true at once.
 *
 * Two ranges that overlap are compatible, whatever they are. Only a pair that
 * cannot both hold is a conflict.
 */
export function rangesOverlap(a: Measure, b: Measure): boolean {
  if (a.key !== b.key) return true;

  const aLow = a.exclusiveMin ? a.min + 1 : a.min;
  const aHigh = a.exclusiveMax ? a.max - 1 : a.max;
  const bLow = b.exclusiveMin ? b.min + 1 : b.min;
  const bHigh = b.exclusiveMax ? b.max - 1 : b.max;

  return aLow <= bHigh && bLow <= aHigh;
}

/** True when two quantities say different things about the same thing. */
export function rangesConflict(a: Measure, b: Measure): boolean {
  if (a.key !== b.key) return false;
  if (a.exact && b.exact) return a.min !== b.min;
  return !rangesOverlap(a, b);
}

/** A readable description of a quantity. */
export function describeMeasure(measure: Measure): string {
  if (measure.exact) return `${measure.min} ${measure.unit}`;

  if (measure.max === Number.POSITIVE_INFINITY) {
    return measure.exclusiveMin
      ? `more than ${measure.min} ${measure.unit}`
      : `at least ${measure.min} ${measure.unit}`;
  }

  if (measure.min <= 0) {
    return measure.exclusiveMax ? `under ${measure.max} ${measure.unit}` : `${measure.max} ${measure.unit} or less`;
  }

  return `${measure.min}-${measure.max} ${measure.unit}`;
}

/** The key a unit is compared by, so "page" and "pages" are one unit. */
export function unitKey(unit: string): string {
  return unit.toLowerCase().replace(/s$/, "");
}
