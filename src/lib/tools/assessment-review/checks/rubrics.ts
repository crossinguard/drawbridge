/**
 * Family D: whether a rubric and its assignment's instructions agree.
 *
 * This family needs a human or an LLM to judge. The tool's job is to prepare
 * the comparison and do the countable parts: break the instructions into
 * requirements, match them to the criteria, and report the structural facts
 * that are worth a look.
 *
 * Nothing here calls a criterion unclear or a level vague. A keyword match is
 * reported as a candidate, not as a finding: the tool cannot stand behind it.
 */
import type { Rubric, RubricCriterion, RubricRating } from "@/lib/canvas/types";

import {
  makeFinding,
  makeStat,
  points as formatPoints,
  type Candidate,
  type CheckResults,
  type Finding,
} from "@/lib/tools/assessment-review/findings";
import type { Assessment, AssessmentReview } from "@/lib/tools/assessment-review/model";
import { priorityFor, type ReviewSettings } from "@/lib/tools/assessment-review/settings";
import { describeMeasure, measuresIn, rangesConflict, type Measure } from "@/lib/tools/assessment-review/text/measures";
import { extractRequirements, keywordsOf, type Requirement } from "@/lib/tools/assessment-review/text/requirements";

/** Where the rubric data comes from. */
const RUBRIC_SOURCE = "course_settings/rubrics.xml";

/** Run every check in this family. */
export function checkRubrics(review: AssessmentReview, settings: ReviewSettings): CheckResults {
  const findings: Finding[] = [
    ...checkMeasures(review, settings),
    ...checkStructure(review, settings),
    ...checkLevelFacts(review, settings),
    ...checkLegacyTerms(review, settings),
    ...checkVagueLanguage(review, settings),
  ];

  const candidates: Candidate[] = [
    ...checkRequirementsAgainstCriteria(review),
    ...checkCriteriaAgainstRequirements(review),
    ...checkCleanupItems(review),
  ];

  return {
    findings,
    candidates,
    stats: [measureStat(review)],
  };
}

/** D1 — requirements that no criterion covers. */
function checkRequirementsAgainstCriteria(review: AssessmentReview): Candidate[] {
  const candidates: Candidate[] = [];

  for (const assessment of review.assessments) {
    const rubric = rubricOf(review, assessment);
    if (!rubric) continue;

    const { requirements } = extractRequirements(assessment.instructions, assessment.instructionsSource);
    if (requirements.length === 0) continue;

    const unmatched = requirements.filter((requirement) => !matchesAny(requirement, rubric.criteria));
    if (unmatched.length === 0) continue;

    candidates.push({
      id: `D1-${assessment.id}`,
      kind: "candidate mismatch (keyword match)",
      objectType: "assessment",
      objectId: assessment.id,
      objectName: assessment.title,
      statement: `${unmatched.length} requirement${unmatched.length === 1 ? "" : "s"} in the instructions for "${assessment.title}" ${unmatched.length === 1 ? "has" : "have"} no matching criterion in "${rubric.title}".`,
      detail: unmatched.map((requirement) => `• ${requirement.text}`).join("\n"),
      confidence: "low",
      source: assessment.instructionsSource ?? "the instructions",
      affected: [assessment.id],
    });
  }

  return candidates;
}

/** D2 — criteria that no requirement covers. */
function checkCriteriaAgainstRequirements(review: AssessmentReview): Candidate[] {
  const candidates: Candidate[] = [];

  for (const entry of review.rubrics) {
    if (entry.attachedTo.length === 0) continue;

    // The criteria are the same whatever the item they are attached to, so the
    // candidate is written once and the items are listed.
    const uncovered = new Map<string, { criterion: RubricCriterion; items: string[] }>();

    for (const assessment of entry.attachedTo) {
      const { requirements } = extractRequirements(assessment.instructions, assessment.instructionsSource);
      if (requirements.length === 0) continue;

      for (const criterion of entry.rubric.criteria) {
        if (matchesAnyRequirement(criterion, requirements)) continue;

        const record = uncovered.get(criterion.id) ?? { criterion, items: [] };
        record.items.push(assessment.title);
        uncovered.set(criterion.id, record);
      }
    }

    for (const [criterionId, record] of uncovered) {
      candidates.push({
        id: `D2-${entry.rubric.id}-${criterionId}`,
        kind: "candidate mismatch (keyword match)",
        objectType: "rubric",
        objectId: entry.rubric.id,
        objectName: entry.rubric.title,
        statement: `"${record.criterion.description || "(unnamed criterion)"}" in "${entry.rubric.title}" is not matched by the instructions of the item(s) it is attached to.`,
        detail: `Attached to: ${record.items.join("; ")}`,
        confidence: "low",
        source: RUBRIC_SOURCE,
        affected: entry.attachedTo.map((assessment) => assessment.id),
      });
    }
  }

  return candidates;
}

/** The platform's leftovers and the text that is not a requirement. */
function checkCleanupItems(review: AssessmentReview): Candidate[] {
  const candidates: Candidate[] = [];

  for (const assessment of review.assessments) {
    if (assessment.instructions.trim() === "") continue;

    const { dropped, artifacts } = extractRequirements(
      assessment.instructions,
      assessment.instructionsSource ?? "the instructions",
    );

    if (artifacts.length > 0) {
      candidates.push({
        id: `CL-${assessment.id}`,
        kind: "cleanup item",
        objectType: "assessment",
        objectId: assessment.id,
        objectName: assessment.title,
        statement: `${artifacts.reduce((sum, artifact) => sum + artifact.count, 0)} platform leftover(s) were removed from the instructions before they were compared.`,
        detail: artifacts
          .map((artifact) => `• ${artifact.count} × ${artifact.kind} (e.g. ${JSON.stringify(artifact.sample)})`)
          .join("\n"),
        confidence: "high",
        source: assessment.instructionsSource ?? "the instructions",
        affected: [assessment.id],
      });
    }

    if (dropped.length > 0) {
      candidates.push({
        id: `CU-${assessment.id}`,
        kind: "cleanup item",
        objectType: "assessment",
        objectId: assessment.id,
        objectName: assessment.title,
        statement: `${dropped.length} piece(s) of the instructions were not treated as requirements.`,
        detail: dropped.map((entry) => `• ${entry.reason}: ${entry.text}`).join("\n"),
        confidence: "high",
        source: assessment.instructionsSource ?? "the instructions",
        affected: [assessment.id],
      });
    }
  }

  return candidates;
}

/** D3 — the numbers in the instructions against the numbers in the rubric. */
function checkMeasures(review: AssessmentReview, settings: ReviewSettings): Finding[] {
  const findings: Finding[] = [];

  for (const assessment of review.assessments) {
    const rubric = rubricOf(review, assessment);
    if (!rubric) continue;

    const { requirements } = extractRequirements(assessment.instructions, assessment.instructionsSource);
    const fromInstructions = requirements.flatMap((requirement) => requirement.measures);
    const fromRubric = rubricMeasures(rubric);

    const keys = new Set([
      ...fromInstructions.map((measure) => measure.key),
      ...fromRubric.map((measure) => measure.key),
    ]);

    for (const key of [...keys].sort()) {
      const inInstructions = fromInstructions.filter((measure) => measure.key === key);
      const inRubric = fromRubric.filter((measure) => measure.key === key);

      if (inInstructions.length === 0 || inRubric.length === 0) continue;

      const conflict = firstConflict(inInstructions, inRubric);
      if (!conflict) continue;

      findings.push(
        makeFinding({
          id: `D3-${assessment.id}-${key}`,
          check: "D3",
          family: "rubrics",
          objectType: "assessment",
          objectId: assessment.id,
          objectName: assessment.title,
          statement: `The instructions for "${assessment.title}" and its rubric "${rubric.title}" give different figures for the number of ${conflict.a.unit}.`,
          values: [
            {
              label: "In the instructions",
              value: `${describeMeasure(conflict.a)} — "${conflict.a.sentence}"`,
              source: assessment.instructionsSource ?? "the instructions",
            },
            {
              label: "In the rubric",
              value: `${describeMeasure(conflict.b)} — "${conflict.b.sentence}"`,
              source: RUBRIC_SOURCE,
            },
          ],
          suggestedPriority: priorityFor(settings, "rubrics", "medium"),
          priorityReason: "The two documents give different figures for the same thing.",
          notes: [],
        }),
      );
    }
  }

  return findings;
}

/** The first pair of quantities that cannot both be true. */
function firstConflict(a: Measure[], b: Measure[]): { a: Measure; b: Measure } | undefined {
  for (const left of a) {
    for (const right of b) {
      if (rangesConflict(left, right)) return { a: left, b: right };
    }
  }
  return undefined;
}

/** D4 — the structural facts worth a look. */
function checkStructure(review: AssessmentReview, settings: ReviewSettings): Finding[] {
  const findings: Finding[] = [];

  for (const { rubric } of review.rubrics) {
    // Criteria with no description.
    const unnamed = rubric.criteria.filter((criterion) => criterion.description.trim() === "");
    if (unnamed.length > 0) {
      findings.push(
        makeFinding({
          id: `D4-${rubric.id}-no-criterion-description`,
          check: "D4",
          family: "rubrics",
          objectType: "rubric",
          objectId: rubric.id,
          objectName: rubric.title,
          statement: `${unnamed.length} criterion${unnamed.length === 1 ? " of" : "s of"} "${rubric.title}" ${unnamed.length === 1 ? "has" : "have"} no name.`,
          values: [{ label: "Criteria without a name", value: String(unnamed.length), source: RUBRIC_SOURCE }],
          affected: review.assessments.filter((a) => a.rubricId === rubric.id).map((a) => a.id),
          suggestedPriority: priorityFor(settings, "rubrics", "low"),
          priorityReason: "A criterion with no name tells the reviewer nothing about what it covers.",
          needsReview: false,
        }),
      );
    }

    // Levels with no description.
    const bareLevels = rubric.criteria.flatMap((criterion) =>
      criterion.ratings
        .filter((rating) => rating.longDescription.trim() === "")
        .map((rating) => ({ criterion, rating })),
    );
    if (bareLevels.length > 0) {
      findings.push(
        makeFinding({
          id: `D4-${rubric.id}-no-level-description`,
          check: "D4",
          family: "rubrics",
          objectType: "rubric",
          objectId: rubric.id,
          objectName: rubric.title,
          statement: `${bareLevels.length} rating level${bareLevels.length === 1 ? " of" : "s of"} "${rubric.title}" ${bareLevels.length === 1 ? "has" : "have"} no description.`,
          values: [{ label: "Levels without a description", value: String(bareLevels.length), source: RUBRIC_SOURCE }],
          affected: review.assessments.filter((a) => a.rubricId === rubric.id).map((a) => a.id),
          suggestedPriority: priorityFor(settings, "rubrics", "low"),
          priorityReason: "A level with no description does not say what it means.",
          notes: bareLevels.map(
            (entry) =>
              `${entry.criterion.description || "(unnamed criterion)"} → ${entry.rating.description || "(unnamed level)"}`,
          ),
          needsReview: false,
        }),
      );
    }

    // Criteria with a single level.
    const single = rubric.criteria.filter((criterion) => criterion.ratings.length === 1);
    if (single.length > 0) {
      findings.push(
        makeFinding({
          id: `D4-${rubric.id}-single-level`,
          check: "D4",
          family: "rubrics",
          objectType: "rubric",
          objectId: rubric.id,
          objectName: rubric.title,
          statement: `${single.length} criterion${single.length === 1 ? " of" : "s of"} "${rubric.title}" ${single.length === 1 ? "has" : "have"} only one level.`,
          values: [{ label: "Criteria with one level", value: String(single.length), source: RUBRIC_SOURCE }],
          affected: review.assessments.filter((a) => a.rubricId === rubric.id).map((a) => a.id),
          suggestedPriority: priorityFor(settings, "rubrics", "low"),
          priorityReason: "A criterion with one level gives the student no choice.",
          notes: single.map((criterion) => criterion.description || "(unnamed criterion)"),
          needsReview: false,
        }),
      );
    }

    // Criteria with different numbers of levels.
    const levelCounts = new Set(rubric.criteria.map((criterion) => criterion.ratings.length));
    if (levelCounts.size > 1) {
      findings.push(
        makeFinding({
          id: `D4-${rubric.id}-level-counts`,
          check: "D4",
          family: "rubrics",
          objectType: "rubric",
          objectId: rubric.id,
          objectName: rubric.title,
          statement: `The criteria of "${rubric.title}" do not all have the same number of levels.`,
          values: [
            { label: "Level counts", value: [...levelCounts].sort((a, b) => a - b).join(", "), source: RUBRIC_SOURCE },
          ],
          affected: review.assessments.filter((a) => a.rubricId === rubric.id).map((a) => a.id),
          suggestedPriority: priorityFor(settings, "rubrics", "low"),
          priorityReason: "Criteria in one rubric usually share a scale.",
          notes: rubric.criteria.map(
            (criterion) => `${criterion.description || "(unnamed criterion)"}: ${criterion.ratings.length} levels`,
          ),
          needsReview: false,
        }),
      );
    }
  }

  return findings;
}

/**
 * D7 — the facts about the levels of a criterion.
 *
 * These are countable, so they are findings rather than candidates: levels
 * whose points do not run in order, a level below another that scores higher,
 * a level that repeats another word for word, a scale with no zero, and bands
 * of levels that leave a gap or overlap.
 */
function checkLevelFacts(review: AssessmentReview, settings: ReviewSettings): Finding[] {
  const findings: Finding[] = [];

  for (const { rubric } of review.rubrics) {
    const attached = review.assessments.filter((a) => a.rubricId === rubric.id).map((a) => a.id);

    for (const criterion of rubric.criteria) {
      const levels = criterion.ratings;
      if (levels.length < 2) continue;

      const points = levels.map((rating) => rating.points).filter((value): value is number => value !== undefined);

      if (points.length >= 2) {
        // The points do not run in descending order.
        const descending = [...points].sort((a, b) => b - a);
        if (!points.every((value, index) => value === descending[index])) {
          findings.push(
            makeFinding({
              id: `D7-${rubric.id}-${criterion.id}-order`,
              check: "D7",
              family: "rubrics",
              objectType: "rubric",
              objectId: rubric.id,
              objectName: rubric.title,
              statement: `The levels of "${criterion.description || "(unnamed criterion)"}" in "${rubric.title}" do not run in descending order of points.`,
              values: [
                { label: "Level points, as written", value: points.join(", "), source: RUBRIC_SOURCE },
                { label: "Descending order", value: descending.join(", "), source: "the order the levels are in" },
              ],
              affected: attached,
              suggestedPriority: priorityFor(settings, "rubrics", "low"),
              priorityReason: "The levels read out of order, which usually means one was edited.",
              notes: levels.map((rating) => `${rating.description}: ${formatPoints(rating.points)}`),
              needsReview: false,
            }),
          );
        }

        // A level below another one scores higher.
        const inversions: string[] = [];
        for (let index = 0; index < levels.length - 1; index++) {
          const upper = levels[index].points;
          const lower = levels[index + 1].points;
          if (upper === undefined || lower === undefined) continue;
          if (lower > upper) {
            inversions.push(
              `"${levels[index].description}" is worth ${formatPoints(upper)} and "${levels[index + 1].description}" below it is worth ${formatPoints(lower)}`,
            );
          }
        }
        if (inversions.length > 0) {
          findings.push(
            makeFinding({
              id: `D7-${rubric.id}-${criterion.id}-inversion`,
              check: "D7",
              family: "rubrics",
              objectType: "rubric",
              objectId: rubric.id,
              objectName: rubric.title,
              statement: `A level below another in "${criterion.description || "(unnamed criterion)"}" of "${rubric.title}" scores higher.`,
              values: [{ label: "Inversions", value: inversions.join("; "), source: RUBRIC_SOURCE }],
              affected: attached,
              suggestedPriority: priorityFor(settings, "rubrics", "medium"),
              priorityReason: "The lower level is worth more than the one above it.",
              needsReview: false,
            }),
          );
        }

        // The scale has no zero.
        const lowest = Math.min(...points);
        if (lowest > 0) {
          findings.push(
            makeFinding({
              id: `D7-${rubric.id}-${criterion.id}-no-zero`,
              check: "D7",
              family: "rubrics",
              objectType: "rubric",
              objectId: rubric.id,
              objectName: rubric.title,
              statement: `The lowest level of "${criterion.description || "(unnamed criterion)"}" in "${rubric.title}" is worth ${formatPoints(lowest)} points, so the scale has no zero.`,
              values: [
                { label: "Lowest level", value: formatPoints(lowest), source: RUBRIC_SOURCE },
                { label: "A zero level", value: "not in export", source: RUBRIC_SOURCE },
              ],
              affected: attached,
              suggestedPriority: priorityFor(settings, "rubrics", "low"),
              priorityReason: "A student who does none of the work still scores something.",
              needsReview: false,
            }),
          );
        }
      }

      // The same level text used twice in one criterion.
      const seen = new Map<string, string[]>();
      for (const rating of levels) {
        const key = `${rating.description}|${rating.longDescription}`.trim().toLowerCase();
        if (key === "|") continue;
        const list = seen.get(key) ?? [];
        list.push(rating.description);
        seen.set(key, list);
      }

      for (const [key, uses] of seen) {
        if (uses.length < 2) continue;

        findings.push(
          makeFinding({
            id: `D7-${rubric.id}-${criterion.id}-repeated-${key.slice(0, 16)}`,
            check: "D7",
            family: "rubrics",
            objectType: "rubric",
            objectId: rubric.id,
            objectName: rubric.title,
            statement: `The same level text is used ${uses.length} times in "${criterion.description || "(unnamed criterion)"}" of "${rubric.title}".`,
            values: [{ label: "Uses", value: uses.join("; "), source: RUBRIC_SOURCE }],
            affected: attached,
            suggestedPriority: priorityFor(settings, "rubrics", "low"),
            priorityReason: "The same wording twice in one criterion is usually a copy-and-paste.",
            needsReview: false,
          }),
        );
      }

      // Bands of levels that leave a gap, or that overlap.
      const bands = levelBands(levels);
      if (bands.length >= 2) {
        for (let index = 0; index < bands.length - 1; index++) {
          const upper = bands[index];
          const lower = bands[index + 1];

          if (upper.min > lower.max + 1) {
            findings.push(
              makeFinding({
                id: `D7-${rubric.id}-${criterion.id}-gap-${index}`,
                check: "D7",
                family: "rubrics",
                objectType: "rubric",
                objectId: rubric.id,
                objectName: rubric.title,
                statement: `The levels of "${criterion.description || "(unnamed criterion)"}" in "${rubric.title}" leave a gap between ${formatPoints(lower.max + 1)} and ${formatPoints(upper.min - 1)}.`,
                values: [
                  { label: "Upper level", value: `${upper.label}: ${describeBand(upper)}`, source: RUBRIC_SOURCE },
                  { label: "Level below it", value: `${lower.label}: ${describeBand(lower)}`, source: RUBRIC_SOURCE },
                ],
                affected: attached,
                suggestedPriority: priorityFor(settings, "rubrics", "low"),
                priorityReason: "There is a score that no level covers.",
                needsReview: false,
              }),
            );
          }

          if (upper.min <= lower.max) {
            findings.push(
              makeFinding({
                id: `D7-${rubric.id}-${criterion.id}-overlap-${index}`,
                check: "D7",
                family: "rubrics",
                objectType: "rubric",
                objectId: rubric.id,
                objectName: rubric.title,
                statement: `The levels of "${criterion.description || "(unnamed criterion)"}" in "${rubric.title}" overlap.`,
                values: [
                  { label: "Upper level", value: `${upper.label}: ${describeBand(upper)}`, source: RUBRIC_SOURCE },
                  { label: "Level below it", value: `${lower.label}: ${describeBand(lower)}`, source: RUBRIC_SOURCE },
                ],
                affected: attached,
                suggestedPriority: priorityFor(settings, "rubrics", "low"),
                priorityReason: "Two levels cover the same score, so a student could be given either.",
                needsReview: false,
              }),
            );
          }
        }
      }
    }
  }

  return findings;
}

/** A band of scores a level covers, read from the level's own words. */
interface LevelBand {
  label: string;
  min: number;
  max: number;
}

/** The bands the levels of a criterion describe, highest first. */
function levelBands(levels: RubricRating[]): LevelBand[] {
  const bands: LevelBand[] = [];

  for (const level of levels) {
    const text = `${level.description} ${level.longDescription}`.trim();
    const measures = measuresIn(text, text);
    const measure = measures.find((entry) => entry.exact || entry.max !== Number.POSITIVE_INFINITY);
    if (!measure) continue;

    bands.push({
      label: level.description || "(unnamed level)",
      min: measure.min,
      max: measure.max === Number.POSITIVE_INFINITY ? measure.min : measure.max,
    });
  }

  return bands.sort((a, b) => b.max - a.max);
}

/** A readable description of a band. */
function describeBand(band: LevelBand): string {
  if (band.min === band.max) return `${band.min}`;
  return `${band.min}-${band.max}`;
}

/** D5 — terms the institution has retired. */
function checkLegacyTerms(review: AssessmentReview, settings: ReviewSettings): Finding[] {
  if (settings.legacyTerms.length === 0) return [];

  const findings: Finding[] = [];

  for (const { rubric } of review.rubrics) {
    const text = rubricText(rubric).toLowerCase();
    const found = settings.legacyTerms.filter((term) => text.includes(term.toLowerCase()));

    if (found.length === 0) continue;

    findings.push(
      makeFinding({
        id: `D5-${rubric.id}`,
        check: "D5",
        family: "rubrics",
        objectType: "rubric",
        objectId: rubric.id,
        objectName: rubric.title,
        statement: `"${rubric.title}" uses ${found.length} term${found.length === 1 ? "" : "s"} from the retired list.`,
        values: [
          { label: "Retired terms", value: found.join(", "), source: "the reviewer's retired terms list" },
          { label: "Rubric", value: rubric.title, source: RUBRIC_SOURCE },
        ],
        affected: review.assessments.filter((a) => a.rubricId === rubric.id).map((a) => a.id),
        suggestedPriority: priorityFor(settings, "rubrics", "medium"),
        priorityReason: "The rubric refers to something the institution has retired.",
      }),
    );
  }

  return findings;
}

/** D6 — words that ask the reviewer to look harder. */
function checkVagueLanguage(review: AssessmentReview, settings: ReviewSettings): Finding[] {
  if (settings.vagueWords.length === 0) return [];

  const findings: Finding[] = [];

  for (const { rubric } of review.rubrics) {
    const hits: string[] = [];

    for (const criterion of rubric.criteria) {
      for (const rating of criterion.ratings) {
        const text = `${rating.description} ${rating.longDescription}`.toLowerCase();
        for (const word of settings.vagueWords) {
          if (!new RegExp(`\\b${escapeRegExp(word.toLowerCase())}\\b`).test(text)) continue;
          hits.push(`${criterion.description || "(unnamed criterion)"} → ${rating.description}: "${word}"`);
        }
      }
    }

    if (hits.length === 0) continue;

    findings.push(
      makeFinding({
        id: `D6-${rubric.id}`,
        check: "D6",
        family: "rubrics",
        objectType: "rubric",
        objectId: rubric.id,
        objectName: rubric.title,
        statement: `"${rubric.title}" uses ${hits.length} word${hits.length === 1 ? "" : "s"} from the list of words to look at.`,
        values: [{ label: "Words to look at", value: String(hits.length), source: "the reviewer's word list" }],
        affected: review.assessments.filter((a) => a.rubricId === rubric.id).map((a) => a.id),
        suggestedPriority: priorityFor(settings, "rubrics", "low"),
        priorityReason: "These words often hide a difference between two levels.",
        notes: hits,
        needsReview: false,
      }),
    );
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

/** The numbers in a rubric, with what they count. */
function rubricMeasures(rubric: Rubric): Measure[] {
  const measures: Measure[] = [];

  for (const criterion of rubric.criteria) {
    for (const [text, source] of [
      [criterion.description, criterion.description],
      [criterion.longDescription, criterion.longDescription],
    ] as const) {
      if (!text) continue;
      measures.push(...measuresIn(text, source));
    }

    for (const rating of criterion.ratings) {
      for (const [text, source] of [
        [rating.description, rating.description],
        [rating.longDescription, rating.longDescription],
      ] as const) {
        if (!text) continue;
        measures.push(...measuresIn(text, source));
      }
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
    (measure) => measure.min,
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

/** D3 — how many items agree with the figures in their rubric. */
function measureStat(review: AssessmentReview) {
  let total = 0;
  let passed = 0;
  const exceptions: string[] = [];

  for (const assessment of review.assessments) {
    const rubric = rubricOf(review, assessment);
    if (!rubric) continue;

    const { requirements } = extractRequirements(assessment.instructions, assessment.instructionsSource);
    const fromInstructions = requirements.flatMap((requirement) => requirement.measures);
    const fromRubric = rubricMeasures(rubric);

    const keys = new Set([...fromInstructions.map((m) => m.key), ...fromRubric.map((m) => m.key)]);
    const conflicts = [...keys].some(
      (key) =>
        firstConflict(
          fromInstructions.filter((m) => m.key === key),
          fromRubric.filter((m) => m.key === key),
        ) !== undefined,
    );

    if (fromInstructions.length === 0 || fromRubric.length === 0) continue;

    total++;
    if (conflicts) exceptions.push(assessment.title);
    else passed++;
  }

  return makeStat({
    check: "D3",
    family: "rubrics",
    description: "The quantities in the instructions against the quantities in the rubric",
    total,
    passed,
    exceptions,
  });
}
