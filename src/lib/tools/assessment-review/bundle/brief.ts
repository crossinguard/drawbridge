/**
 * The brief.
 *
 * This is the file the reviewer hands to the assistant first, so it has to be
 * short and it has to say only what the assistant needs to start. Everything
 * else lives in the tables beside it, and the brief says where.
 *
 * The brief is capped. When it would run over, the long lists are shortened
 * and the reader is told that they were.
 */
import {
  FAMILY_LABELS,
  PRIORITIES,
  type Candidate,
  type CheckStat,
  type Finding,
} from "@/lib/tools/assessment-review/findings";
import type { AssessmentReview } from "@/lib/tools/assessment-review/model";
import type { QuizFamily } from "@/lib/tools/assessment-review/checks/quizzes";

import { KNOWN_LIMITS, type Reconciliation } from "./reconcile";

/** The most characters the brief may hold. */
export const BRIEF_LIMIT = 20_000;

/** How many names a family lists before it says "and N more". */
const MEMBER_PREVIEW = 4;

/** How many names a list of exceptions or unused objects shows. */
const NAME_PREVIEW = 8;

/** How many findings the summary lists, before it says how many more there are. */
const FINDING_PREVIEW = 15;

/** What the brief needs to know. */
export interface BriefInput {
  review: AssessmentReview;
  findings: Finding[];
  candidates: Candidate[];
  stats: CheckStat[];
  families: QuizFamily[];
  reconciliation: Reconciliation;
  settings: {
    term: { value: string; how: string };
    legacyTerms: number;
    vagueWords: number;
  };
  /** The files the brief points at, with their sizes and row counts. */
  files: { name: string; purpose: string; rows: number; chars: number }[];
  /** The counts the brief states, checked against the tables afterwards. */
  counts: Record<string, number>;
}

/** Build the brief. */
export function buildBrief(input: BriefInput): string {
  const sections: string[] = [];

  sections.push(identity(input));
  sections.push(whatWasRead(input));
  sections.push(reconciliation(input));
  sections.push(gradebook(input));
  sections.push(quizzes(input));
  sections.push(findings(input));
  sections.push(openQuestions(input));
  sections.push(theOtherFiles(input));

  let brief = sections
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  brief = `${brief}\n`;

  // The brief has to stay inside its cap. The findings list gives way first.
  if (brief.length > BRIEF_LIMIT) {
    brief = shorten(input, sections, "findings");
  }
  if (brief.length > BRIEF_LIMIT) {
    brief = shorten(input, sections, "files");
  }

  return brief;
}

/** 1 — Export identity. */
function identity(input: BriefInput): string {
  const course = input.review.course;
  const lines: string[] = [];

  lines.push(`# Assessment review brief — ${course.meta.title}`);
  lines.push("");
  lines.push("## Export identity");
  lines.push("");
  lines.push("| | |");
  lines.push("| --- | --- |");
  lines.push(`| Course title | ${course.meta.title} |`);
  lines.push(`| Course code | ${course.meta.code || "not in export"} |`);
  lines.push(`| Term | ${input.settings.term.value} — ${input.settings.term.how} |`);
  lines.push(`| Export date | ${course.meta.exportedAt ?? "not in export"} |`);
  lines.push(`| Source file | ${course.meta.sourceName} |`);
  lines.push(`| Account | ${course.meta.accountName || "not in export"} |`);
  lines.push(`| Exported from | ${course.meta.domain || "not in export"} |`);

  if (input.review.dueRange) {
    lines.push(
      `| Due dates | ${input.review.dueRange.from ?? "not in export"} to ${input.review.dueRange.to ?? "not in export"} |`,
    );
  }

  lines.push("");
  return lines.join("\n");
}

/** 2 — What was read, and what was not. */
function whatWasRead(input: BriefInput): string {
  const course = input.review.course;
  const lines: string[] = [];

  lines.push("## What was read, and what was not");
  lines.push("");
  lines.push("| | Count |");
  lines.push("| --- | ---: |");
  lines.push(`| Files in the export | ${course.filesRead.length + course.unreadable.length} |`);
  lines.push(`| Files read | ${course.filesRead.length} |`);
  lines.push(`| Files that could not be read | ${course.unreadable.length} |`);
  lines.push(`| Modules | ${course.modules.length} |`);
  const count = (label: string, fallback: number): number => input.counts[label] ?? fallback;

  lines.push(`| Graded items | ${count("Graded items", input.review.assessments.length)} |`);
  lines.push(`| Quizzes | ${count("Quizzes", input.review.assessments.filter((a) => a.kind === "quiz").length)} |`);
  lines.push(
    `| Graded discussions | ${input.review.assessments.filter((a) => a.kind === "graded-discussion").length} |`,
  );
  lines.push(`| Rubrics | ${count("Rubrics", input.review.rubrics.length)} |`);
  lines.push(
    `| Rubric criteria | ${count(
      "Rubric criteria",
      input.review.rubrics.reduce((sum, entry) => sum + entry.rubric.criteria.length, 0),
    )} |`,
  );
  lines.push(`| Item banks | ${count("Item banks", input.review.itemBanks.length)} |`);
  lines.push(`| Assignment groups | ${input.review.groups.filter((group) => group.id !== "").length} |`);
  lines.push(`| Module items | ${course.modules.reduce((sum, module) => sum + module.items.length, 0)} |`);
  lines.push(`| Pages and ungraded discussions | ${count("Pages and ungraded discussions", contentCount(input))} |`);
  lines.push("");

  if (course.unreadable.length > 0) {
    lines.push("**Files that could not be read**");
    lines.push("");
    for (const file of course.unreadable) lines.push(`- \`${file.path}\` — ${file.reason}`);
    lines.push("");
  }

  if (course.warnings.length > 0) {
    const counts = new Map<string, number>();
    for (const warning of course.warnings) {
      // The same problem in a different file is the same problem.
      const key = warning
        .replace(/`[^`]+`/g, "a file")
        .replace(/[\w-]{8,}\.\w+/g, "a file")
        .replace(/\b[a-f0-9]{16,}\b/g, "a file");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    lines.push("**Notes on how the export was read**");
    lines.push("");
    let shown = 0;
    for (const [note, count] of counts) {
      if (shown >= 8) break;
      shown++;
      lines.push(`- ${count > 1 ? `${count} files had the same problem: ` : ""}${note}`);
    }
    if (counts.size > shown) {
      lines.push(`- … and ${counts.size - shown} more kinds of note.`);
    }
    lines.push("");
  }

  lines.push("**Known limits of this export format**");
  lines.push("");
  for (const limit of KNOWN_LIMITS) lines.push(`- ${limit}`);
  lines.push("");

  return lines.join("\n");
}

/** The pages and the discussions that are not graded items. */
function contentCount(input: BriefInput): number {
  const graded = new Set(input.review.assessments.map((assessment) => assessment.id));

  return [...input.review.course.items, ...input.review.course.orphans].filter(
    (item) => (item.kind === "page" || item.kind === "discussion") && !graded.has(item.id),
  ).length;
}

/** 3 — The reconciliation results. */
function reconciliation(input: BriefInput): string {
  const lines: string[] = [];

  lines.push("## Reconciliation");
  lines.push("");
  lines.push("| Check | Result | Count | Detail |");
  lines.push("| --- | --- | ---: | --- |");

  for (const check of input.reconciliation.checks) {
    lines.push(`| ${check.description} | ${check.status} | ${check.count} | ${escapeCell(check.detail)} |`);
  }

  lines.push("");
  return lines.join("\n");
}

/** 4 — The gradebook structure. One table. */
function gradebook(input: BriefInput): string {
  const review = input.review;
  const lines: string[] = [];

  lines.push("## Gradebook structure");
  lines.push("");
  lines.push(
    review.weighting === "percent"
      ? "The course is weighted by percentage: each group's weight is its share of the final grade."
      : review.weighting === "points"
        ? "The course is weighted by points: the final grade comes from the points, not from the weights."
        : "The course has no group weights recorded, so the final grade comes from the points.",
  );
  lines.push("");
  lines.push("| Group | Weight | Items | Points | Share of the points |");
  lines.push("| --- | ---: | ---: | ---: | ---: |");

  for (const group of review.groups) {
    lines.push(
      `| ${escapeCell(group.title)} | ${group.weight}% | ${group.assessments.length} | ${group.pointsTotal} | ${group.pointsShare.toFixed(1)}% |`,
    );
  }

  const totalPoints = review.groups.reduce((sum, group) => sum + group.pointsTotal, 0);
  lines.push("");
  lines.push(`The groups hold ${totalPoints} points in total.`);
  lines.push("");

  return lines.join("\n");
}

/** 5 — One row per quiz family. */
function quizzes(input: BriefInput): string {
  const lines: string[] = [];

  lines.push("## Quiz summary");
  lines.push("");

  if (input.families.length === 0) {
    lines.push("The course has no quizzes.");
    lines.push("");
    return lines.join("\n");
  }

  lines.push(
    `${input.families.length} families cover ${input.review.assessments.filter((a) => a.kind === "quiz").length} quizzes.`,
  );
  lines.push("");
  lines.push("| Family | Group | Quizzes | Settings the family shares | Members |");
  lines.push("| --- | --- | ---: | --- | --- |");

  for (const family of input.families) {
    const settings = familySettings(family, input.families)
      .map((setting) => `${setting.short}: ${setting.value}`)
      .join(", ");

    lines.push(
      `| ${family.id} | ${escapeCell(family.groupTitle)} | ${family.members.length} | ${escapeCell(settings)} | ${escapeCell(preview(family.members.map((member) => member.title)))} |`,
    );
  }

  const withExceptions = input.families.filter((family) => family.exceptions.length > 0);
  if (withExceptions.length > 0) {
    lines.push("");
    lines.push("**Members that differ from their family**");
    lines.push("");
    for (const family of withExceptions) {
      for (const exception of family.exceptions) {
        lines.push(`- ${family.id}: ${exception.title} — ${exception.setting.toLowerCase()} is ${exception.value}`);
      }
    }
  }

  lines.push("");
  return lines.join("\n");
}

/** 6 — The findings summary. */
function findings(input: BriefInput): string {
  const lines: string[] = [];

  lines.push("## Findings summary");
  lines.push("");
  lines.push("| Family | High | Medium | Low | Total |");
  lines.push("| --- | ---: | ---: | ---: | ---: |");

  const families = Object.keys(FAMILY_LABELS);
  for (const family of families) {
    const inFamily = input.findings.filter((finding) => finding.family === family);
    const counts = PRIORITIES.map(
      (priority) => inFamily.filter((finding) => finding.suggestedPriority === priority).length,
    );
    lines.push(
      `| ${FAMILY_LABELS[family as keyof typeof FAMILY_LABELS]} | ${counts.join(" | ")} | ${inFamily.length} |`,
    );
  }

  lines.push(
    `| **Total** | ${PRIORITIES.map((priority) => input.findings.filter((finding) => finding.suggestedPriority === priority).length).join(" | ")} | **${input.findings.length}** |`,
  );
  lines.push("");

  if (input.findings.length > 0) {
    lines.push("**Top findings**");
    lines.push("");
    for (const finding of input.findings.slice(0, FINDING_PREVIEW)) {
      lines.push(`- \`${finding.id}\` — ${finding.statement}`);
    }
    if (input.findings.length > FINDING_PREVIEW) {
      lines.push(`- … and ${input.findings.length - FINDING_PREVIEW} more, listed in \`data_findings.csv\`.`);
    }
    lines.push("");
  }

  if (input.stats.length > 0) {
    lines.push("**What the checks compared**");
    lines.push("");
    lines.push("| Check | Compared | Passed | Failed |");
    lines.push("| --- | --- | ---: | ---: |");
    for (const stat of input.stats) {
      lines.push(
        `| ${stat.check} | ${escapeCell(stat.description)} | ${stat.passed} of ${stat.total} | ${stat.failed} |`,
      );
    }
    lines.push("");
  }

  const candidates = input.candidates.filter((candidate) => candidate.kind === "candidate mismatch (keyword match)");
  if (input.candidates.length > 0) {
    lines.push(
      `**${input.candidates.length} candidate(s) and cleanup item(s)** are in \`data_candidates.csv\`. ${candidates.length} of them are candidate mismatches (keyword match) — matches on words, not confirmed differences — and none of them is counted as a finding.`,
    );
    lines.push("");
  }

  return lines.join("\n");
}

/** 7 — The questions the tool could not resolve. */
function openQuestions(input: BriefInput): string {
  const lines: string[] = [];

  lines.push("## Open questions");
  lines.push("");

  const questions: string[] = [];

  for (const failure of input.reconciliation.failures) {
    questions.push(`${failure.description}: ${failure.detail}`);
  }

  const missingSettings = input.review.assessments.filter(
    (assessment) => assessment.kind === "quiz" && !assessment.quiz?.settingsSource,
  );
  if (missingSettings.length > 0) {
    questions.push(
      `${missingSettings.length} quiz/quizzes have no settings in the export, so their attempts, time limit and shuffling have to be checked in the live course: ${names(missingSettings.map((assessment) => assessment.title))}.`,
    );
  }

  const withoutInstructions = input.review.assessments.filter((assessment) => assessment.instructions.trim() === "");
  if (withoutInstructions.length > 0) {
    questions.push(
      `${withoutInstructions.length} graded item(s) have no instructions in the export: ${names(withoutInstructions.map((assessment) => assessment.title))}.`,
    );
  }

  const unusedBanks = input.review.itemBanks.filter((bank) => bank.usedBy.length === 0);
  if (unusedBanks.length > 0) {
    questions.push(
      `${unusedBanks.length} item bank(s) are not drawn from by any quiz in the export: ${names(unusedBanks.map((bank) => bank.title))}.`,
    );
  }

  const unattached = input.review.rubrics.filter((entry) => entry.attachedTo.length === 0);
  if (unattached.length > 0) {
    questions.push(
      `${unattached.length} rubric(s) have no attachment found in the export, which is not the same as being unused: ${names(unattached.map((entry) => entry.rubric.title))}.`,
    );
  }

  if (questions.length === 0) {
    lines.push("Nothing is unresolved. The gaps listed above still stand.");
  } else {
    for (const question of questions) lines.push(`- ${question}`);
  }

  lines.push("");
  return lines.join("\n");
}

/** 8 — The other files. */
function theOtherFiles(input: BriefInput): string {
  const lines: string[] = [];

  lines.push("## The other files");
  lines.push("");
  lines.push("| File | What it holds | Rows | Characters |");
  lines.push("| --- | --- | ---: | ---: |");

  for (const file of input.files) {
    lines.push(`| \`${file.name}\` | ${escapeCell(file.purpose)} | ${file.rows} | ${file.chars} |`);
  }

  lines.push("");
  lines.push(
    "- `manifest.json` — the index of the bundle: every file with its size and row count, the review steps, and the settings the review ran with.",
  );
  lines.push("");
  return lines.join("\n");
}

/**
 * The settings a family row shows.
 *
 * The attempts, the time limit and the shuffle are always shown, because they
 * are what the default rule and the comparison are about. The rest are shown
 * only when they differ inside the family.
 */
function familySettings(
  family: QuizFamily,
  all: QuizFamily[],
): { id: string; label: string; short: string; value: string }[] {
  const always = ["attempts", "timeLimit", "shuffleQuestions", "shuffleAnswers"];
  const siblings = all.filter((entry) => entry.groupId === family.groupId);

  return family.settings.filter((setting) => {
    if (always.includes(setting.id)) return true;

    // A setting that is the same in every family of the group says nothing.
    return siblings.some((sibling) => {
      const other = sibling.settings.find((entry) => entry.id === setting.id);
      return other !== undefined && other.value !== setting.value;
    });
  });
}

/** A short preview of a list of names. */
function preview(names: string[]): string {
  if (names.length === 0) return "none";
  if (names.length <= MEMBER_PREVIEW) return names.join("; ");

  return `${names.slice(0, MEMBER_PREVIEW).join("; ")}; … and ${names.length - MEMBER_PREVIEW} more`;
}

/**
 * A list of names, shortened when there are many of them.
 *
 * The full list is always in the tables, so the brief can point at it.
 */
function names(values: string[]): string {
  if (values.length === 0) return "none";
  if (values.length <= NAME_PREVIEW) return values.join("; ");

  return `${values.slice(0, NAME_PREVIEW).join("; ")}; … and ${values.length - NAME_PREVIEW} more (see the tables)`;
}

/** Make a value safe to put in a Markdown table cell. */
function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

/**
 * Rebuild the brief with one of its long lists shortened.
 *
 * The brief is meant to be read first, so when it runs over its cap the
 * findings list gives way, and after that the file list does.
 */
function shorten(input: BriefInput, sections: string[], what: "findings" | "files"): string {
  const kept = [...sections];

  if (what === "findings") {
    const index = kept.findIndex((section) => section.startsWith("## Findings summary"));
    if (index !== -1) kept[index] = findingsShort(input);
  } else {
    const index = kept.findIndex((section) => section.startsWith("## The other files"));
    if (index !== -1) kept[index] = theOtherFilesShort(input);
  }

  return `${kept
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()}\n`;
}

/** The findings summary with only the counts. */
function findingsShort(input: BriefInput): string {
  const lines: string[] = [];

  lines.push("## Findings summary");
  lines.push("");
  lines.push("| Family | High | Medium | Low | Total |");
  lines.push("| --- | ---: | ---: | ---: | ---: |");

  const families = Object.keys(FAMILY_LABELS);
  for (const family of families) {
    const inFamily = input.findings.filter((finding) => finding.family === family);
    const counts = PRIORITIES.map(
      (priority) => inFamily.filter((finding) => finding.suggestedPriority === priority).length,
    );
    lines.push(
      `| ${FAMILY_LABELS[family as keyof typeof FAMILY_LABELS]} | ${counts.join(" | ")} | ${inFamily.length} |`,
    );
  }

  lines.push("");
  lines.push(
    `${input.findings.length} findings in total. They are listed in full in \`data_findings.csv\`; this brief was shortened to stay inside its size limit.`,
  );
  lines.push("");

  return lines.join("\n");
}

/** The file list with only the names. */
function theOtherFilesShort(input: BriefInput): string {
  const lines: string[] = [];

  lines.push("## The other files");
  lines.push("");
  for (const file of input.files) lines.push(`- \`${file.name}\` — ${file.purpose}`);
  lines.push("");

  return lines.join("\n");
}
