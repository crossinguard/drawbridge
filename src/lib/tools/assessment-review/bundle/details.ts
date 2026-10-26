/**
 * The per-item detail files.
 *
 * One file per assignment or graded discussion: its instructions, the rubric
 * attached to it, and the findings about it. A quiz only gets one when it has
 * findings, or when its instructions differ from the ones its family shares.
 *
 * Text that more than one item carries is stored once, in `data_texts.csv`,
 * and referenced by its id rather than printed again.
 */
import { NOT_IN_EXPORT, type Finding } from "@/lib/tools/assessment-review/findings";
import type { Assessment, AssessmentReview } from "@/lib/tools/assessment-review/model";
import type { QuizFamily } from "@/lib/tools/assessment-review/checks/quizzes";
import { QUIZ_SETTINGS } from "@/lib/tools/assessment-review/checks/quizzes";

import type { TextStore } from "./tables";

/** The most characters a detail file may hold. */
export const DETAIL_LIMIT = 60_000;

/** One file in the bundle. */
export interface DetailFile {
  /** The file name, without the folder. */
  name: string;
  /** The text of the file. */
  content: string;
  /** The part number, when the file was split. */
  part?: number;
}

/** The detail files the export carries. */
export function buildDetailFiles(input: {
  review: AssessmentReview;
  findings: Finding[];
  families: QuizFamily[];
  texts: TextStore;
  detailLevel: "brief" | "standard" | "full";
}): DetailFile[] {
  if (input.detailLevel === "brief") return [];

  const files: DetailFile[] = [];

  for (const assessment of input.review.assessments) {
    const itemFindings = input.findings.filter((finding) => finding.affected.includes(assessment.id));

    if (assessment.kind === "quiz") {
      const family = input.families.find((entry) => entry.members.some((member) => member.id === assessment.id));
      const siblings = family ? family.members.filter((member) => member.id !== assessment.id) : [];

      // A quiz whose instructions and settings are the same as a sibling's is
      // already represented by that sibling, so it does not need its own file.
      const offFamily =
        siblings.length === 0 ||
        siblings.some((member) => member.instructions.trim() !== assessment.instructions.trim());

      if (input.detailLevel === "standard") {
        if (itemFindings.length === 0) continue;
      } else if (itemFindings.length === 0 && !offFamily) {
        continue;
      }
    } else if (input.detailLevel === "standard" && itemFindings.length === 0) {
      continue;
    }

    const content = detailFor(input.review, assessment, itemFindings, input.texts);
    const name = `detail_${safeName(assessment.title)}.md`;

    for (const part of splitDetail(content)) {
      files.push({
        name: part.part === 1 ? name : name.replace(/\.md$/, `_part${part.part}.md`),
        content: part.content,
        part: part.part,
      });
    }
  }

  return files;
}

/** The detail file for one item. */
function detailFor(review: AssessmentReview, assessment: Assessment, findings: Finding[], texts: TextStore): string {
  const lines: string[] = [];

  lines.push(`# ${assessment.title}`);
  lines.push("");

  const facts: string[] = [];
  facts.push(`Type: ${assessment.kind}`);
  if (assessment.moduleRefs.length > 0) {
    facts.push(
      `Module${assessment.moduleRefs.length === 1 ? "" : "s"}: ${assessment.moduleRefs.map((ref) => ref.moduleTitle).join("; ")}`,
    );
  }
  facts.push(`Group: ${assessment.groupTitle ?? NOT_IN_EXPORT}`);
  facts.push(`Points: ${assessment.pointsPossible ?? NOT_IN_EXPORT}`);
  facts.push(`Due: ${assessment.dueAt ?? NOT_IN_EXPORT}`);
  facts.push(`State: ${assessment.state}`);

  const usage = review.usage.byId.get(assessment.id);
  if (usage) facts.push(`Usage: ${usage.state} — ${usage.reasons.join("; ")}`);

  for (const fact of facts) lines.push(`- ${fact}`);
  lines.push("");

  if (assessment.quiz) {
    lines.push("## Quiz settings");
    lines.push("");
    for (const setting of QUIZ_SETTINGS) {
      const value = setting.read(assessment.quiz);
      lines.push(`- ${setting.label}: ${value ?? NOT_IN_EXPORT}`);
    }
    lines.push("");
  }

  lines.push("## Instructions");
  lines.push("");

  if (assessment.instructions.trim() === "") {
    lines.push("_Not in the export._");
    lines.push("");
  } else {
    const textId = texts.idFor(assessment);
    const shared = textId ? texts.entries.find((entry) => entry.id === textId) : undefined;

    if (shared && shared.itemIds.length > 1) {
      lines.push(
        `_Shared text ${shared.id}, used by ${shared.itemIds.length} items. It is written out once in \`data_texts.csv\`._`,
      );
      lines.push("");
    } else {
      lines.push(`_From ${assessment.instructionsSource ?? "the item's instructions"}._`);
      lines.push("");
      for (const block of assessment.instructions.split("\n")) {
        lines.push(block === "" ? "" : block);
      }
      lines.push("");
    }
  }

  const rubric = review.rubrics.find((entry) => entry.rubric.id === assessment.rubricId)?.rubric;
  if (rubric) {
    lines.push("## Rubric");
    lines.push("");
    lines.push(`- Name: ${rubric.title}`);
    lines.push(`- Stated total: ${rubric.pointsPossible ?? NOT_IN_EXPORT} points`);
    lines.push(`- Criteria: ${rubric.criteria.length}`);
    lines.push("");

    for (const criterion of rubric.criteria) {
      lines.push(
        `- **${criterion.description || "(unnamed criterion)"}** — ${criterion.points ?? NOT_IN_EXPORT} points${criterion.useRange ? " (levels are a range)" : ""}`,
      );
      if (criterion.longDescription) lines.push(`  - ${criterion.longDescription}`);

      for (const rating of criterion.ratings) {
        lines.push(`  - Level "${rating.description || "(unnamed level)"}": ${rating.points ?? NOT_IN_EXPORT} points`);
        if (rating.longDescription) lines.push(`    - ${rating.longDescription}`);
      }
      lines.push("");
    }
  }

  if (findings.length > 0) {
    lines.push("## Findings about this item");
    lines.push("");
    lines.push("_The findings are written out once, in `data_findings.csv`. They are listed here by id._");
    lines.push("");

    for (const finding of findings) {
      lines.push(
        `- \`${finding.id}\` — check ${finding.check}, suggested severity ${finding.suggestedPriority}, confidence ${finding.confidence}.`,
      );
    }

    lines.push("");
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

/** Split a detail file that is too long into parts. */
function splitDetail(content: string): { part: number; content: string }[] {
  if (content.length <= DETAIL_LIMIT) return [{ part: 1, content }];

  const lines = content.split("\n");
  const parts: { part: number; content: string }[] = [];

  let current: string[] = [];
  let size = 0;

  for (const line of lines) {
    if (size + line.length > DETAIL_LIMIT && current.length > 0) {
      parts.push({ part: parts.length + 1, content: current.join("\n") });
      current = [];
      size = 0;
    }
    current.push(line);
    size += line.length + 1;
  }

  if (current.length > 0) parts.push({ part: parts.length + 1, content: current.join("\n") });

  return parts;
}

/** A file name that is safe to write. */
function safeName(title: string): string {
  const cleaned = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  return cleaned === "" ? "item" : cleaned;
}
