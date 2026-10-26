/**
 * Building the export bundle.
 *
 * The bundle is what the reviewer hands to an assistant: a short brief, a set
 * of tables it can query, the detail of the items that need looking at, and a
 * manifest that says what everything is.
 *
 * The same model builds the screen and the bundle, so the two cannot
 * disagree.
 */
import { cleanText } from "@/lib/tools/assessment-review/text/artifacts";
import { hashString, textId } from "@/lib/tools/assessment-review/text/hash";

import type { Candidate, CheckStat, Finding, Priority } from "@/lib/tools/assessment-review/findings";
import type { Assessment, AssessmentReview } from "@/lib/tools/assessment-review/model";
import type { QuizComparisonGroup, QuizFamily } from "@/lib/tools/assessment-review/checks/quizzes";
import { readTerm as readCourseTerm, type ReviewSettings } from "@/lib/tools/assessment-review/settings";

import { buildBrief } from "./brief";
import { toCsv, type Table } from "./csv";
import { buildDetailFiles, type DetailFile } from "./details";
import { buildManifest, type Manifest } from "./manifest";
import { reconcile, type Reconciliation } from "./reconcile";
import {
  assessmentsTable,
  candidatesTable,
  contentTable,
  findingsTable,
  groupsTable,
  itemBanksTable,
  moduleItemsTable,
  quizzesTable,
  rubricCriteriaTable,
  rubricsTable,
  textsTable,
  type TextStore,
} from "./tables";

/** One file in the bundle. */
export interface BundleFile {
  /** The file name, without the folder. */
  name: string;
  /** The text of the file. */
  content: string;
  /** What kind of file it is. */
  kind: "brief" | "data" | "detail" | "manifest";
  /** What the file holds. */
  purpose: string;
  /** How many rows it holds, for a table. */
  rows: number;
  /** The review steps this file belongs to. */
  steps: string[];
}

/** The bundle. */
export interface Bundle {
  /** The bundle's folder name. */
  name: string;
  /** Every file, in the order they should be read. */
  files: BundleFile[];
  /** The brief. */
  brief: string;
  /** The reconciliation results. */
  reconciliation: Reconciliation;
  /** The manifest. */
  manifest: Manifest;
}

/** What the bundle needs to know. */
export interface BundleInput {
  review: AssessmentReview;
  findings: Finding[];
  candidates: Candidate[];
  stats: CheckStat[];
  groups: QuizComparisonGroup[];
  families: QuizFamily[];
  settings: ReviewSettings;
  /** The priority the reviewer set for a finding, by finding id. */
  priorities: Map<string, Priority>;
}

/** The text of a course's instructions, stored once. */
interface StoredText {
  id: string;
  hash: string;
  kind: string;
  text: string;
  itemIds: string[];
}

/** Build the bundle. */
export function buildBundle(input: BundleInput): Bundle {
  const name = bundleName(input.review);
  const findings = applyPriorities(input.findings, input.priorities);

  const texts = buildTextStore(input.review, findings, input.settings.detailLevel);
  const tables = buildTables(input, findings, texts);
  const detailFiles = buildDetailFiles({
    review: input.review,
    findings,
    families: input.families,
    texts,
    detailLevel: input.settings.detailLevel,
  });

  const counts = bundleCounts(tables, findings, input.candidates);
  const fileList = fileListFor(tables, detailFiles);

  // The first pass reconciles the model against the tables.
  const firstPass = reconcile({
    review: input.review,
    tables,
    findings,
    briefCounts: counts,
  });

  const brief = buildBrief({
    ...briefInput(input, findings, fileList, counts),
    reconciliation: firstPass,
  });

  // The second pass reads the brief back and checks its own numbers.
  const reconciliation = reconcile({
    review: input.review,
    tables,
    findings,
    briefCounts: counts,
    briefText: brief,
  });

  const finalBrief = buildBrief({
    ...briefInput(input, findings, fileList, counts),
    reconciliation,
  });

  const files: BundleFile[] = [
    {
      name: "00_brief.md",
      content: finalBrief,
      kind: "brief",
      purpose: "Start here. What the course holds, what the review found, and what it could not settle.",
      rows: 0,
      steps: ["step-1-orient", "step-2-findings"],
    },
  ];

  for (const table of tables) {
    files.push({
      name: table.name,
      content: toCsv(table),
      kind: "data",
      purpose: table.purpose,
      rows: table.rows.length,
      steps: stepsForTable(table.name),
    });
  }

  for (const detail of detailFiles) {
    files.push({
      name: detail.name,
      content: detail.content,
      kind: "detail",
      purpose: "One item: its instructions, its rubric, and the findings about it.",
      rows: 0,
      steps: ["step-2-findings", "step-3-details"],
    });
  }

  const manifest = buildManifest({
    bundle: name,
    course: {
      title: input.review.course.meta.title,
      code: input.review.course.meta.code,
      sourceFile: input.review.course.meta.sourceName,
      exportedAt: input.review.course.meta.exportedAt,
    },
    files: files.map((file) => ({
      name: file.name,
      kind: file.kind,
      purpose: file.purpose,
      chars: file.content.length,
      bytes: new TextEncoder().encode(file.content).length,
      rows: file.rows,
      steps: file.steps,
    })),
    settings: input.settings,
    checks: input.stats,
    reconciliation,
    counts,
    findings,
    candidates: input.candidates,
  });

  files.push({
    name: "manifest.json",
    content: `${JSON.stringify(manifest, null, 2)}\n`,
    kind: "manifest",
    purpose:
      "What is in the bundle: every file with its size and row count, the review steps, and the settings the review ran with.",
    rows: 0,
    steps: ["step-1-orient"],
  });

  return { name, files, brief: finalBrief, reconciliation, manifest };
}

/** The brief's input, shared between the two passes. */
function briefInput(
  input: BundleInput,
  findings: Finding[],
  files: { name: string; purpose: string; rows: number; chars: number }[],
  counts: Record<string, number>,
) {
  return {
    review: input.review,
    findings,
    candidates: input.candidates,
    stats: input.stats,
    families: input.families,
    settings: {
      term: readTerm(input),
      legacyTerms: input.settings.legacyTerms.length,
      vagueWords: input.settings.vagueWords.length,
    },
    files,
    counts,
  };
}

/** Build every table the bundle carries. */
function buildTables(input: BundleInput, findings: Finding[], texts: TextStore): Table[] {
  const tables: Table[] = [
    assessmentsTable(input.review, findings, texts),
    quizzesTable(input.review, findings, input.families, input.groups, texts),
    rubricsTable(input.review, findings, input.settings.include.legacyRubrics),
    rubricCriteriaTable(input.review, input.settings.include.legacyRubrics),
    groupsTable(input.review),
    moduleItemsTable(input.review),
    findingsTable(findings),
    candidatesTable(input.candidates),
  ];

  if (input.settings.include.itemBanks) tables.push(itemBanksTable(input.review));

  if (input.settings.include.pages || input.settings.include.ungradedDiscussions) {
    const content = contentTable(input.review, {
      pages: input.settings.include.pages,
      discussions: input.settings.include.ungradedDiscussions,
    });

    // An empty table is not worth shipping.
    if (content.rows.length > 0) tables.push(content);
  }

  tables.push(textsTable(texts));

  return tables;
}

/**
 * The store of instruction texts.
 *
 * Two items that carry the same text share one entry, so the text is written
 * out once. At the brief level no text is written out at all; at the standard
 * level the text of the items with findings is; at the full level every text
 * is.
 */
function buildTextStore(
  review: AssessmentReview,
  findings: Finding[],
  detailLevel: ReviewSettings["detailLevel"],
): TextStore {
  const entries = new Map<string, StoredText>();

  for (const assessment of review.assessments) {
    if (assessment.instructions.trim() === "") continue;

    const cleaned = cleanText(assessment.instructions).text;
    const hash = hashString(cleaned);
    const id = textId("t", cleaned);

    const entry = entries.get(id) ?? { id, hash, kind: "instructions", text: cleaned, itemIds: [] };
    entry.itemIds.push(assessment.id);
    entries.set(id, entry);
  }

  const needed = new Set<string>();
  for (const finding of findings) {
    for (const id of finding.affected) needed.add(id);
  }

  const all = [...entries.values()];
  const includedIds = new Set(
    all
      .filter((entry) => {
        if (detailLevel === "full") return true;
        if (detailLevel === "standard") return entry.itemIds.some((id) => needed.has(id));
        return false;
      })
      .map((entry) => entry.id),
  );

  return {
    idFor: (assessment: Assessment) => {
      if (assessment.instructions.trim() === "") return undefined;
      const id = textId("t", cleanText(assessment.instructions).text);
      return entries.has(id) ? id : undefined;
    },
    textFor: (id: string) => entries.get(id)?.text,
    entries: all.map((entry) => ({
      id: entry.id,
      hash: entry.hash,
      kind: entry.kind,
      text: includedIds.has(entry.id) ? entry.text : "not included at this detail level",
      itemIds: entry.itemIds,
    })),
  };
}

/** Apply the reviewer's priority changes to the findings. */
function applyPriorities(findings: Finding[], priorities: Map<string, Priority>): Finding[] {
  return findings.map((finding) => {
    const priority = priorities.get(finding.id);
    if (!priority || priority === finding.suggestedPriority) return finding;
    return { ...finding, suggestedPriority: priority };
  });
}

/** The counts the brief states, read off the tables. */
function bundleCounts(tables: Table[], findings: Finding[], candidates: Candidate[]): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const table of tables) {
    const label = tableLabel(table.name);
    if (label) counts[label] = table.rows.length;
  }

  counts["findings"] = findings.length;
  counts["candidates"] = candidates.length;

  return counts;
}

/** The label a table's row count is stated under in the brief. */
function tableLabel(name: string): string | undefined {
  const labels: Record<string, string> = {
    "data_assessments.csv": "Graded items",
    "data_quizzes.csv": "Quizzes",
    "data_rubrics.csv": "Rubrics",
    "data_rubric_criteria.csv": "Rubric criteria",
    "data_gradebook_groups.csv": "Assignment groups",
    "data_modules_items.csv": "Module items",
    "data_item_banks.csv": "Item banks",
    "data_content.csv": "Pages and ungraded discussions",
  };

  return labels[name];
}

/** The files the brief points at. */
function fileListFor(
  tables: Table[],
  detailFiles: DetailFile[],
): { name: string; purpose: string; rows: number; chars: number }[] {
  const files = tables.map((table) => ({
    name: table.name,
    purpose: table.purpose,
    rows: table.rows.length,
    chars: toCsv(table).length,
  }));

  const detailCount = detailFiles.length;
  if (detailCount > 0) {
    files.push({
      name: `detail_*.md (${detailCount} file${detailCount === 1 ? "" : "s"})`,
      purpose: "One file per item that needs looking at: its instructions, its rubric, and the findings about it.",
      rows: detailCount,
      chars: detailFiles.reduce((sum, detail) => sum + detail.content.length, 0),
    });
  }

  return files;
}

/** The review steps a table belongs to. */
function stepsForTable(name: string): string[] {
  if (name === "data_gradebook_groups.csv") return ["step-1-orient"];
  if (name === "data_findings.csv" || name === "data_candidates.csv") return ["step-2-findings"];
  if (name === "data_quizzes.csv") return ["step-1-orient", "step-2-findings"];
  return ["step-1-orient", "step-2-findings", "step-3-details"];
}

/** The term, read with the configured pattern. */
function readTerm(input: BundleInput): { value: string; how: string } {
  const course = input.review.course;
  return readCourseTerm(course.meta.title, course.meta.code, input.settings.termPattern);
}

/** The bundle's folder name. */
export function bundleName(review: AssessmentReview): string {
  const cleaned = review.course.meta.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);

  return `${cleaned === "" ? "course" : cleaned}-assessment-review`;
}

export { buildBrief } from "./brief";
export { buildDetailFiles } from "./details";
export { buildManifest, REVIEW_STEPS } from "./manifest";
export { reconcile, KNOWN_LIMITS } from "./reconcile";
export { toCsv, table } from "./csv";
