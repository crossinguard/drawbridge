/**
 * Family D: whether a rubric and its assignment's instructions agree.
 *
 * This family needs a human or an LLM to judge. The tool's job is to prepare
 * the comparison and do the countable parts: break the instructions into
 * requirements, match them to the criteria, and report the structural facts
 * that are worth a look.
 *
 * Nothing here calls a criterion unclear or a level vague. It lists the
 * candidates and leaves the judgement to the reviewer.
 */
import type { Rubric, RubricCriterion } from "@/lib/canvas/types";

import { points as formatPoints } from "@/lib/tools/assessment-review/findings";
import type { Finding, ReviewRules } from "@/lib/tools/assessment-review/findings";
import type { Assessment, AssessmentReview } from "@/lib/tools/assessment-review/model";

/** Where the rubric data comes from. */
const RUBRIC_SOURCE = "course_settings/rubrics.xml";

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
];

/** One requirement taken from the instructions. */
export interface Requirement {
  /** The requirement, as written. */
  text: string;
  /** The words used to match it to a criterion. */
  keywords: string[];
  /** The numbers it mentions. */
  numbers: number[];
  /** The numbers it mentions, with what they count. */
  measures: Measure[];
}

/** A number and what it counts. */
export interface Measure {
  /** The number. */
  value: number;
  /** What it counts, e.g. "pages". */
  unit: string;
}

/** The units the review compares between the instructions and the rubric. */
const MEASURE_UNITS = [
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
];

/** Run every check in this family. */
export function checkRubrics(review: AssessmentReview, rules: ReviewRules): Finding[] {
  return [
    ...checkRequirementsAgainstCriteria(review),
    ...checkCriteriaAgainstRequirements(review),
    ...checkMeasures(review),
    ...checkStructure(review),
    ...checkLegacyTerms(review, rules),
    ...checkVagueLanguage(review, rules),
  ];
}

/** D1 — requirements that no criterion covers. */
function checkRequirementsAgainstCriteria(review: AssessmentReview): Finding[] {
  const findings: Finding[] = [];

  for (const assessment of review.assessments) {
    const rubric = rubricOf(review, assessment);
    if (!rubric) continue;

    const requirements = extractRequirements(assessment.instructions);
    if (requirements.length === 0) continue;

    const unmatched = requirements.filter((requirement) => !matchesAny(requirement, rubric.criteria));

    if (unmatched.length === 0) continue;

    findings.push({
      id: `D1-${assessment.id}`,
      check: "D1",
      family: "rubrics",
      title: `${unmatched.length} requirement${unmatched.length === 1 ? " in the instructions for" : "s in the instructions for"} "${assessment.title}" ${unmatched.length === 1 ? "has" : "have"} no matching criterion`,
      values: [
        {
          label: "Requirements without a criterion",
          value: String(unmatched.length),
          source: assessment.instructionsSource ?? "the instructions",
        },
        { label: "Criteria", value: String(rubric.criteria.length), source: RUBRIC_SOURCE },
      ],
      itemIds: [assessment.id],
      suggestedPriority: "medium",
      priorityReason: "Something the student is asked for may not be graded.",
      notes: unmatched.map((requirement) => `• ${requirement.text}`),
      needsReview: true,
    });
  }

  return findings;
}

/** D2 — criteria that no requirement covers. */
function checkCriteriaAgainstRequirements(review: AssessmentReview): Finding[] {
  const findings: Finding[] = [];

  for (const assessment of review.assessments) {
    const rubric = rubricOf(review, assessment);
    if (!rubric) continue;

    const requirements = extractRequirements(assessment.instructions);
    if (requirements.length === 0) continue;

    const unmatched = rubric.criteria.filter((criterion) => !matchesAnyRequirement(criterion, requirements));

    if (unmatched.length === 0) continue;

    findings.push({
      id: `D2-${assessment.id}`,
      check: "D2",
      family: "rubrics",
      title: `${unmatched.length} criterion${unmatched.length === 1 ? " of" : "s of"} "${rubric.title}" ${unmatched.length === 1 ? "has" : "have"} no matching requirement in the instructions for "${assessment.title}"`,
      values: [
        { label: "Criteria without a requirement", value: String(unmatched.length), source: RUBRIC_SOURCE },
        {
          label: "Requirements",
          value: String(requirements.length),
          source: assessment.instructionsSource ?? "the instructions",
        },
      ],
      itemIds: [assessment.id],
      suggestedPriority: "medium",
      priorityReason: "Something is graded that the student was never told about.",
      notes: unmatched.map((criterion) => `• ${criterion.description || "(no name)"}`),
      needsReview: true,
    });
  }

  return findings;
}

/** D3 — the numbers in the instructions against the numbers in the rubric. */
function checkMeasures(review: AssessmentReview): Finding[] {
  const findings: Finding[] = [];

  for (const assessment of review.assessments) {
    const rubric = rubricOf(review, assessment);
    if (!rubric) continue;

    const fromInstructions = extractRequirements(assessment.instructions).flatMap(
      (requirement) => requirement.measures,
    );
    const fromRubric = rubricMeasures(rubric);

    const units = new Set([
      ...fromInstructions.map((measure) => measure.unit),
      ...fromRubric.map((measure) => measure.unit),
    ]);

    for (const unit of [...units].sort()) {
      const inInstructions = [
        ...new Set(fromInstructions.filter((measure) => measure.unit === unit).map((measure) => measure.value)),
      ].sort((a, b) => a - b);
      const inRubric = [
        ...new Set(fromRubric.filter((measure) => measure.unit === unit).map((measure) => measure.value)),
      ].sort((a, b) => a - b);

      if (inInstructions.length === 0 || inRubric.length === 0) continue;

      const same =
        inInstructions.length === inRubric.length && inInstructions.every((value, index) => value === inRubric[index]);
      if (same) continue;

      findings.push({
        id: `D3-${assessment.id}-${unit}`,
        check: "D3",
        family: "rubrics",
        title: `The instructions for "${assessment.title}" and its rubric disagree about the number of ${unit}`,
        values: [
          {
            label: "In the instructions",
            value: inInstructions.join(", "),
            source: assessment.instructionsSource ?? "the instructions",
          },
          { label: "In the rubric", value: inRubric.join(", "), source: RUBRIC_SOURCE },
        ],
        itemIds: [assessment.id],
        suggestedPriority: "medium",
        priorityReason: "The two documents give different figures for the same thing.",
        notes: [],
        needsReview: true,
      });
    }
  }

  return findings;
}

/** D4 — the structural facts worth a look. */
function checkStructure(review: AssessmentReview): Finding[] {
  const findings: Finding[] = [];

  for (const { rubric } of review.rubrics) {
    // Criteria with no description.
    const unnamed = rubric.criteria.filter((criterion) => criterion.description.trim() === "");
    if (unnamed.length > 0) {
      findings.push({
        id: `D4-${rubric.id}-no-criterion-description`,
        check: "D4",
        family: "rubrics",
        title: `${unnamed.length} criterion${unnamed.length === 1 ? " of" : "s of"} "${rubric.title}" ${unnamed.length === 1 ? "has" : "have"} no name`,
        values: [{ label: "Criteria without a name", value: String(unnamed.length), source: RUBRIC_SOURCE }],
        itemIds: [],
        suggestedPriority: "low",
        priorityReason: "A criterion with no name tells the reviewer nothing about what it covers.",
        notes: [],
        needsReview: false,
      });
    }

    // Levels with no description.
    const bareLevels = rubric.criteria.flatMap((criterion) =>
      criterion.ratings
        .filter((rating) => rating.longDescription.trim() === "")
        .map((rating) => ({
          criterion,
          rating,
        })),
    );
    if (bareLevels.length > 0) {
      findings.push({
        id: `D4-${rubric.id}-no-level-description`,
        check: "D4",
        family: "rubrics",
        title: `${bareLevels.length} rating level${bareLevels.length === 1 ? " of" : "s of"} "${rubric.title}" ${bareLevels.length === 1 ? "has" : "have"} no description`,
        values: [{ label: "Levels without a description", value: String(bareLevels.length), source: RUBRIC_SOURCE }],
        itemIds: [],
        suggestedPriority: "low",
        priorityReason: "A level with no description does not say what it means.",
        notes: bareLevels.map(
          (entry) =>
            `${entry.criterion.description || "(unnamed criterion)"} → ${entry.rating.description || "(unnamed level)"}`,
        ),
        needsReview: false,
      });
    }

    // Levels whose points do not run in order.
    for (const criterion of rubric.criteria) {
      const points = criterion.ratings
        .map((rating) => rating.points)
        .filter((value): value is number => value !== undefined);
      if (points.length < 2) continue;

      const descending = [...points].sort((a, b) => b - a);
      if (points.every((value, index) => value === descending[index])) continue;

      findings.push({
        id: `D4-${rubric.id}-${criterion.id}-order`,
        check: "D4",
        family: "rubrics",
        title: `The levels of "${criterion.description || "(unnamed criterion)"}" in "${rubric.title}" are not in descending order`,
        values: [
          { label: "Level points, as written", value: points.join(", "), source: RUBRIC_SOURCE },
          { label: "Descending order", value: descending.join(", "), source: "the order the levels are in" },
        ],
        itemIds: [],
        suggestedPriority: "low",
        priorityReason: "The levels read out of order, which usually means one was edited.",
        notes: criterion.ratings.map((rating) => `${rating.description}: ${formatPoints(rating.points)}`),
        needsReview: false,
      });
    }

    // Criteria with a single level.
    const single = rubric.criteria.filter((criterion) => criterion.ratings.length === 1);
    if (single.length > 0) {
      findings.push({
        id: `D4-${rubric.id}-single-level`,
        check: "D4",
        family: "rubrics",
        title: `${single.length} criterion${single.length === 1 ? " of" : "s of"} "${rubric.title}" ${single.length === 1 ? "has" : "have"} only one level`,
        values: [{ label: "Criteria with one level", value: String(single.length), source: RUBRIC_SOURCE }],
        itemIds: [],
        suggestedPriority: "low",
        priorityReason: "A criterion with one level gives the student no choice.",
        notes: single.map((criterion) => criterion.description || "(unnamed criterion)"),
        needsReview: false,
      });
    }

    // Criteria with different numbers of levels.
    const levelCounts = new Set(rubric.criteria.map((criterion) => criterion.ratings.length));
    if (levelCounts.size > 1) {
      findings.push({
        id: `D4-${rubric.id}-level-counts`,
        check: "D4",
        family: "rubrics",
        title: `The criteria of "${rubric.title}" do not all have the same number of levels`,
        values: [
          { label: "Level counts", value: [...levelCounts].sort((a, b) => a - b).join(", "), source: RUBRIC_SOURCE },
        ],
        itemIds: [],
        suggestedPriority: "low",
        priorityReason: "Criteria in one rubric usually share a scale.",
        notes: rubric.criteria.map(
          (criterion) => `${criterion.description || "(unnamed criterion)"}: ${criterion.ratings.length} levels`,
        ),
        needsReview: false,
      });
    }

    // The same level text used twice in one criterion.
    for (const criterion of rubric.criteria) {
      const seen = new Map<string, string[]>();

      for (const rating of criterion.ratings) {
        const key = `${rating.description}|${rating.longDescription}`.trim().toLowerCase();
        if (key === "|") continue;
        const list = seen.get(key) ?? [];
        list.push(rating.description);
        seen.set(key, list);
      }

      for (const [key, uses] of seen) {
        if (uses.length < 2) continue;

        findings.push({
          id: `D4-${rubric.id}-${criterion.id}-repeated-${key.slice(0, 16)}`,
          check: "D4",
          family: "rubrics",
          title: `The same level text is used ${uses.length} times in "${criterion.description || "(unnamed criterion)"}" of "${rubric.title}"`,
          values: [{ label: "Uses", value: uses.join("; "), source: RUBRIC_SOURCE }],
          itemIds: [],
          suggestedPriority: "low",
          priorityReason: "The same wording twice in one criterion is usually a copy-and-paste.",
          notes: [],
          needsReview: false,
        });
      }
    }
  }

  return findings;
}

/** D5 — terms the institution has retired. */
function checkLegacyTerms(review: AssessmentReview, rules: ReviewRules): Finding[] {
  if (rules.legacyTerms.length === 0) return [];

  const findings: Finding[] = [];

  for (const { rubric } of review.rubrics) {
    const text = rubricText(rubric).toLowerCase();
    const found = rules.legacyTerms.filter((term) => text.includes(term.toLowerCase()));

    if (found.length === 0) continue;

    findings.push({
      id: `D5-${rubric.id}`,
      check: "D5",
      family: "rubrics",
      title: `"${rubric.title}" uses ${found.length} term${found.length === 1 ? "" : "s"} from the retired list`,
      values: [
        { label: "Retired terms", value: found.join(", "), source: "the institution's term list" },
        { label: "Rubric", value: rubric.title, source: RUBRIC_SOURCE },
      ],
      itemIds: [],
      suggestedPriority: "medium",
      priorityReason: "The rubric refers to something the institution has retired.",
      notes: [],
      needsReview: true,
    });
  }

  return findings;
}

/** D6 — words that ask the reviewer to look harder. */
function checkVagueLanguage(review: AssessmentReview, rules: ReviewRules): Finding[] {
  if (rules.vagueWords.length === 0) return [];

  const findings: Finding[] = [];

  for (const { rubric } of review.rubrics) {
    const hits: string[] = [];

    for (const criterion of rubric.criteria) {
      for (const rating of criterion.ratings) {
        const text = `${rating.description} ${rating.longDescription}`.toLowerCase();
        for (const word of rules.vagueWords) {
          if (!new RegExp(`\\b${escapeRegExp(word.toLowerCase())}\\b`).test(text)) continue;
          hits.push(`${criterion.description || "(unnamed criterion)"} → ${rating.description}: "${word}"`);
        }
      }
    }

    if (hits.length === 0) continue;

    findings.push({
      id: `D6-${rubric.id}`,
      check: "D6",
      family: "rubrics",
      title: `"${rubric.title}" uses ${hits.length} word${hits.length === 1 ? "" : "s"} from the list of words to look at`,
      values: [{ label: "Words to look at", value: String(hits.length), source: "the institution's word list" }],
      itemIds: [],
      suggestedPriority: "low",
      priorityReason: "These words often hide a difference between two levels.",
      notes: hits,
      needsReview: false,
    });
  }

  return findings;
}

/** The rubric attached to an assessment. */
function rubricOf(review: AssessmentReview, assessment: Assessment): Rubric | undefined {
  if (!assessment.rubricId) return undefined;
  return review.rubrics.find((entry) => entry.rubric.id === assessment.rubricId)?.rubric;
}

/** All the text of a rubric, for term matching. */
function rubricText(rubric: Rubric): string {
  return [
    rubric.title,
    ...rubric.criteria.flatMap((criterion) => [
      criterion.description,
      criterion.longDescription,
      ...criterion.ratings.flatMap((rating) => [rating.description, rating.longDescription]),
    ]),
  ].join(" ");
}

/**
 * Break the instructions into discrete requirements.
 *
 * Bullets and numbered steps are requirements. So is any sentence that says
 * what to do — "must", "include", "submit", a number, a formatting rule.
 */
export function extractRequirements(instructions: string): Requirement[] {
  const requirements: Requirement[] = [];

  for (const raw of instructionLines(instructions)) {
    const text = raw.trim();
    if (text === "") continue;

    const isListItem = /^[-•*–—]\s+/.test(text) || /^\d+[.)]\s+/.test(text) || /^[a-z][.)]\s+/i.test(text);
    const saysWhatToDo = REQUIREMENT_WORDS.some((word) => new RegExp(`\\b${escapeRegExp(word)}\\b`, "i").test(text));
    const hasNumber = /\d/.test(text);

    if (!isListItem && !saysWhatToDo && !hasNumber) continue;

    requirements.push({
      text,
      keywords: keywordsOf(text),
      numbers: [...new Set((text.match(/\d+(?:\.\d+)?/g) ?? []).map(Number))],
      measures: measuresIn(text),
    });
  }

  return requirements;
}

/** The lines of an instruction text. */
function instructionLines(instructions: string): string[] {
  return instructions
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

/** The words worth matching on. */
function keywordsOf(text: string): string[] {
  return [...new Set((text.toLowerCase().match(/[a-z][a-z'-]{3,}/g) ?? []).filter((word) => !STOP_WORDS.has(word)))];
}

/** The numbers in a piece of text, with what they count. */
export function measuresIn(text: string): Measure[] {
  const measures: Measure[] = [];
  const units = MEASURE_UNITS.join("|");

  const pattern = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${units})\\b`, "gi");
  for (const match of text.matchAll(pattern)) {
    measures.push({ value: Number(match[1]), unit: match[2].toLowerCase() });
  }

  return measures;
}

/** The numbers in a rubric, with what they count. */
function rubricMeasures(rubric: Rubric): Measure[] {
  const measures: Measure[] = [];

  for (const criterion of rubric.criteria) {
    measures.push(...measuresIn(criterion.description), ...measuresIn(criterion.longDescription));
    for (const rating of criterion.ratings) {
      measures.push(...measuresIn(rating.description), ...measuresIn(rating.longDescription));
    }
  }

  return measures;
}

/** True when a requirement matches any of a rubric's criteria. */
function matchesAny(requirement: Requirement, criteria: RubricCriterion[]): boolean {
  return criteria.some((criterion) => matches(criterion, requirement));
}

/** True when a requirement matches a criterion. */
function matches(criterion: RubricCriterion, requirement: Requirement): boolean {
  const criterionWords = new Set(keywordsOf(`${criterion.description} ${criterion.longDescription}`));
  const levelWords = criterion.ratings.flatMap((rating) =>
    keywordsOf(`${rating.description} ${rating.longDescription}`),
  );

  const shared = requirement.keywords.filter((word) => criterionWords.has(word) || levelWords.includes(word));
  if (shared.length > 0) return true;

  // A shared number is a strong hint on its own.
  const criterionNumbers = measuresIn(`${criterion.description} ${criterion.longDescription}`).map(
    (measure) => measure.value,
  );
  return requirement.numbers.some((number) => criterionNumbers.includes(number));
}

/** True when a criterion matches any of the requirements. */
function matchesAnyRequirement(criterion: RubricCriterion, requirements: Requirement[]): boolean {
  return requirements.some((requirement) => matches(criterion, requirement));
}

/** Escape a string for use in a regular expression. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
