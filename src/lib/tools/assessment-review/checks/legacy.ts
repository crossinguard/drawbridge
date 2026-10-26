/**
 * Family B: what is in the course now, and what is left over.
 *
 * Most of this family is not a finding but a classification. The findings it
 * does produce are the ones a reviewer has to act on: a rubric nothing uses,
 * a set of rubrics that are copies of each other, and the items the tool
 * believes are left over.
 */
import { points as formatPoints } from "@/lib/tools/assessment-review/findings";
import type { Finding } from "@/lib/tools/assessment-review/findings";
import type { AssessmentReview } from "@/lib/tools/assessment-review/model";
import { rubricSignature } from "@/lib/tools/assessment-review/model";
import { USAGE_STATE_LABELS, type UsageState } from "@/lib/tools/assessment-review/usage";

/** Run every check in this family. */
export function checkLegacy(review: AssessmentReview): Finding[] {
  return [
    ...checkUnattachedRubrics(review),
    ...checkDuplicateRubrics(review),
    ...checkSameNameRubrics(review),
    ...checkStaleRubrics(review),
    ...checkUsageStates(review),
  ];
}

/** B2b — rubrics that share a name but not their content. */
function checkSameNameRubrics(review: AssessmentReview): Finding[] {
  const byName = new Map<string, typeof review.rubrics>();

  for (const entry of review.rubrics) {
    const list = byName.get(entry.rubric.title) ?? [];
    list.push(entry);
    byName.set(entry.rubric.title, list);
  }

  const findings: Finding[] = [];

  for (const [title, members] of byName) {
    if (members.length < 2) continue;

    const signatures = new Set(members.map((member) => rubricSignature(member.rubric)));
    if (signatures.size === 1) continue;

    findings.push({
      id: `B2b-${title}`,
      check: "B2",
      family: "legacy",
      title: `${members.length} rubrics are called "${title}" but do not have the same criteria`,
      values: [
        {
          label: "Rubrics",
          value: members
            .map(
              (member) =>
                `${member.rubric.criteria.length} criteria, ${formatPoints(member.rubric.pointsPossible)} points`,
            )
            .join("; "),
          source: "course_settings/rubrics.xml",
        },
        {
          label: "Attached to",
          value:
            members.flatMap((member) => member.attachedTo.map((assessment) => assessment.title)).join("; ") ||
            "no attachment found",
          source: "the course's assignment settings",
        },
      ],
      itemIds: members.flatMap((member) => member.attachedTo.map((assessment) => assessment.id)),
      suggestedPriority: "medium",
      priorityReason: "Two rubrics with one name cannot be told apart in the gradebook or in a report.",
      notes: members.map(
        (member) =>
          `${member.rubric.criteria.length} criteria: ${member.rubric.criteria.map((c) => c.description).join(", ")}`,
      ),
      needsReview: true,
    });
  }

  return findings;
}

/** B1 — rubrics that nothing attaches to. */
function checkUnattachedRubrics(review: AssessmentReview): Finding[] {
  const unattached = review.rubrics.filter((entry) => entry.attachedTo.length === 0);

  if (unattached.length === 0) return [];

  return [
    {
      id: "B1-unattached-rubrics",
      check: "B1",
      family: "legacy",
      title: `${unattached.length} rubric${unattached.length === 1 ? " has" : "s have"} no attachment found in the export`,
      values: [
        {
          label: "Rubrics with no attachment",
          value: String(unattached.length),
          source: "course_settings/rubrics.xml",
        },
        {
          label: "Rubrics attached to something",
          value: String(review.rubrics.length - unattached.length),
          source: "the course's assignment settings",
        },
      ],
      itemIds: [],
      suggestedPriority: "low",
      priorityReason:
        "A rubric with no attachment is probably a leftover, though Canvas may show it in use where the export does not.",
      notes: unattached.map((entry) => `• ${entry.rubric.title}`),
      needsReview: false,
    },
  ];
}

/** B2 — rubrics that are copies of each other. */
function checkDuplicateRubrics(review: AssessmentReview): Finding[] {
  const groups = new Map<string, typeof review.rubrics>();

  for (const entry of review.rubrics) {
    const signature = rubricSignature(entry.rubric);
    if (!signature) continue;

    const list = groups.get(signature) ?? [];
    list.push(entry);
    groups.set(signature, list);
  }

  const findings: Finding[] = [];

  for (const [signature, members] of groups) {
    if (members.length < 2) continue;

    const attached = members.filter((member) => member.attachedTo.length > 0);

    findings.push({
      id: `B2-${signature.slice(0, 24)}`,
      check: "B2",
      family: "legacy",
      title: `${members.length} rubrics have identical criteria and levels`,
      values: [
        {
          label: "Rubrics",
          value: members.map((member) => member.rubric.title).join("; "),
          source: "course_settings/rubrics.xml",
        },
        {
          label: "In use",
          value: attached.length > 0 ? attached.map((member) => member.rubric.title).join("; ") : "none of them",
          source: "the course's assignment settings",
        },
      ],
      itemIds: attached.flatMap((member) => member.attachedTo.map((assessment) => assessment.id)),
      suggestedPriority: attached.length > 1 ? "medium" : "low",
      priorityReason:
        attached.length > 1
          ? "More than one live item uses the same rubric, so a change to one would change the other."
          : "These are copies, which is worth cleaning up.",
      notes: [
        `The criteria and levels are the same in all of them.`,
        `The rubric's stated total is ${formatPoints(members[0].rubric.pointsPossible)} points.`,
      ],
      needsReview: false,
    });
  }

  return findings;
}

/** B3 — a live item with a rubric whose name does not resemble its own. */
function checkStaleRubrics(review: AssessmentReview): Finding[] {
  const findings: Finding[] = [];

  for (const assessment of review.assessments) {
    if (!assessment.rubricId) continue;

    const rubric = review.rubrics.find((entry) => entry.rubric.id === assessment.rubricId)?.rubric;
    if (!rubric) continue;

    const state = review.usage.byId.get(assessment.id)?.state;
    if (state !== "in-use") continue;

    const assessmentWords = new Set(
      (assessment.title.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter(
        (word) => word !== "week" && word !== "assignment",
      ),
    );
    const rubricWords = new Set(
      (rubric.title.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((word) => word !== "week"),
    );

    const shared = [...assessmentWords].some((word) => rubricWords.has(word));
    if (shared) continue;

    findings.push({
      id: `B3-${assessment.id}`,
      check: "B3",
      family: "legacy",
      title: `"${assessment.title}" uses the rubric "${rubric.title}", which shares no words with it`,
      values: [
        { label: "Assessment", value: assessment.title, source: "the item's settings" },
        { label: "Rubric", value: rubric.title, source: "course_settings/rubrics.xml" },
      ],
      itemIds: [assessment.id],
      suggestedPriority: "medium",
      priorityReason:
        "A live item with a rubric that does not match its name may be using a rubric left over from an earlier version.",
      notes: [],
      needsReview: true,
    });
  }

  return findings;
}

/** B4 — the items the tool believes are left over, and the ones it cannot place. */
function checkUsageStates(review: AssessmentReview): Finding[] {
  const findings: Finding[] = [];

  const legacy = [...review.usage.byId.values()].filter((entry) => entry.state === "probably-legacy");
  const unclear = [...review.usage.byId.values()].filter((entry) => entry.state === "unclear");

  if (legacy.length > 0) {
    findings.push({
      id: "B4-probably-legacy",
      check: "B4",
      family: "legacy",
      title: `${legacy.length} piece${legacy.length === 1 ? "" : "s"} of content look${legacy.length === 1 ? "s" : ""} like leftovers`,
      values: [{ label: "Probably legacy", value: String(legacy.length), source: "the signals listed with each item" }],
      itemIds: legacy.map((entry) => entry.id),
      suggestedPriority: "low",
      priorityReason: "Leftovers do not affect learners, but they confuse a review.",
      notes: legacy.map((entry) => `• ${entry.title} — ${entry.reasons.join("; ")}`),
      needsReview: false,
    });
  }

  if (unclear.length > 0) {
    findings.push({
      id: "B4-unclear",
      check: "B4",
      family: "legacy",
      title: `${unclear.length} piece${unclear.length === 1 ? "" : "s"} of content could not be placed`,
      values: [{ label: "Unclear", value: String(unclear.length), source: "the signals listed with each item" }],
      itemIds: unclear.map((entry) => entry.id),
      suggestedPriority: "low",
      priorityReason: "The signals point in different directions, so the reviewer has to decide.",
      notes: unclear.map((entry) => `• ${entry.title} — ${entry.reasons.join("; ")}`),
      needsReview: true,
    });
  }

  return findings;
}

/** The state of an item, for the tables. */
export function usageStateOf(review: AssessmentReview, id: string): UsageState {
  return review.usage.byId.get(id)?.state ?? "unclear";
}

/** The label for a usage state. */
export function usageLabel(state: UsageState): string {
  return USAGE_STATE_LABELS[state];
}
