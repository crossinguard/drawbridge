/**
 * The reconciliation checks.
 *
 * Before the export is written, the numbers it carries are checked against
 * each other. A failure is reported in the brief's open questions rather than
 * being left out, so a reader always knows what could not be reconciled.
 */
import type { CourseItem } from "@/lib/canvas/types";

import type { Finding } from "@/lib/tools/assessment-review/findings";
import type { AssessmentReview } from "@/lib/tools/assessment-review/model";

import type { Table } from "./csv";

/** The outcome of one reconciliation check. */
export interface ReconciliationCheck {
  /** The check's id, e.g. "R1". */
  id: string;
  /** What the check compared. */
  description: string;
  /** Whether it held. */
  status: "pass" | "fail";
  /** How many objects were compared. */
  count: number;
  /** What was found. */
  detail: string;
}

/** The result of every reconciliation check. */
export interface Reconciliation {
  /** Every check, in order. */
  checks: ReconciliationCheck[];
  /** The checks that did not hold. */
  failures: ReconciliationCheck[];
}

/** Run every reconciliation check. */
export function reconcile(input: {
  review: AssessmentReview;
  tables: Table[];
  findings: Finding[];
  briefCounts: Record<string, number>;
  briefText?: string;
}): Reconciliation {
  const checks: ReconciliationCheck[] = [
    checkEveryAssessmentOnce(input.review, input.tables),
    checkModuleItemsResolve(input.review),
    checkGroupTotals(input.review),
    checkPointsAddUp(input.review),
    checkBriefCounts(input.tables, input.findings, input.briefCounts, input.briefText),
    checkUnusedLists(input.review),
    checkFindingsCount(input.findings, input.tables, input.briefCounts, input.briefText),
  ];

  return { checks, failures: checks.filter((check) => check.status === "fail") };
}

/** R1 — every graded object appears in the assessments table exactly once. */
function checkEveryAssessmentOnce(review: AssessmentReview, tables: Table[]): ReconciliationCheck {
  const assessments = tables.find((entry) => entry.name === "data_assessments.csv");
  const ids = assessments?.rows.map((row) => row[0]) ?? [];

  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  const missing = review.assessments.filter((assessment) => !ids.includes(assessment.id));

  if (duplicates.length === 0 && missing.length === 0) {
    return {
      id: "R1",
      description: "Every graded object appears in the assessments table exactly once",
      status: "pass",
      count: ids.length,
      detail: `${ids.length} graded objects, ${ids.length} rows.`,
    };
  }

  return {
    id: "R1",
    description: "Every graded object appears in the assessments table exactly once",
    status: "fail",
    count: ids.length,
    detail: [
      duplicates.length > 0 ? `${duplicates.length} object(s) appear more than once: ${duplicates.join("; ")}` : "",
      missing.length > 0
        ? `${missing.length} graded object(s) are missing: ${preview(missing.map((a) => a.title))}`
        : "",
    ]
      .filter((part) => part !== "")
      .join(" "),
  };
}

/** R2 — every module item with a content reference resolves to an object. */
function checkModuleItemsResolve(review: AssessmentReview): ReconciliationCheck {
  const items = [...review.course.items, ...review.course.orphans];
  const byItemId = new Map<string, CourseItem>();
  for (const item of items) {
    if (item.itemId) byItemId.set(item.itemId, item);
  }

  let total = 0;
  const unresolved: string[] = [];

  for (const module of review.course.modules) {
    for (const moduleItem of module.items) {
      if (!moduleItem.targetId) continue;
      total++;

      const target = byItemId.get(moduleItem.id);
      if (!target || target.unresolved) {
        unresolved.push(`${module.title} → ${moduleItem.title}`);
      }
    }
  }

  if (unresolved.length === 0) {
    return {
      id: "R2",
      description: "Every module item with a content reference resolves to an object",
      status: "pass",
      count: total,
      detail: `${total} module item(s) with a content reference, all resolved.`,
    };
  }

  return {
    id: "R2",
    description: "Every module item with a content reference resolves to an object",
    status: "fail",
    count: total,
    detail: `${unresolved.length} of ${total} could not be resolved: ${preview(unresolved)}`,
  };
}

/** R3 — no object is counted in group totals more than once. */
function checkGroupTotals(review: AssessmentReview): ReconciliationCheck {
  const seen = new Map<string, number>();
  const counted: string[] = [];

  for (const group of review.groups) {
    for (const assessment of group.assessments) {
      const previous = seen.get(assessment.id) ?? 0;
      seen.set(assessment.id, previous + 1);
      if (previous === 0) counted.push(assessment.id);
    }
  }

  const doubled = [...seen.entries()].filter(([, count]) => count > 1).map(([id]) => id);
  const missing = review.assessments.filter((assessment) => !seen.has(assessment.id));

  if (doubled.length === 0 && missing.length === 0) {
    return {
      id: "R3",
      description: "No object is counted in group totals more than once",
      status: "pass",
      count: counted.length,
      detail: `${counted.length} graded object(s) counted, each once.`,
    };
  }

  return {
    id: "R3",
    description: "No object is counted in group totals more than once",
    status: "fail",
    count: counted.length,
    detail: [
      doubled.length > 0 ? `${doubled.length} object(s) counted more than once: ${preview(doubled)}` : "",
      missing.length > 0
        ? `${missing.length} graded object(s) are in no group: ${preview(missing.map((a) => a.title))}`
        : "",
    ]
      .filter((part) => part !== "")
      .join(" "),
  };
}

/** R4 — the group points add up to the assessment points. */
function checkPointsAddUp(review: AssessmentReview): ReconciliationCheck {
  const groupPoints = review.groups.reduce((sum, group) => sum + group.pointsTotal, 0);
  const assessmentPoints = review.assessments.reduce((sum, assessment) => sum + (assessment.pointsPossible ?? 0), 0);

  if (Math.abs(groupPoints - assessmentPoints) < 0.001) {
    return {
      id: "R4",
      description: "The points in the groups add up to the points of the graded items",
      status: "pass",
      count: review.groups.length,
      detail: `${groupPoints} points in the groups, ${assessmentPoints} points on the items.`,
    };
  }

  return {
    id: "R4",
    description: "The points in the groups add up to the points of the graded items",
    status: "fail",
    count: review.groups.length,
    detail: `The groups hold ${groupPoints} points and the graded items hold ${assessmentPoints}.`,
  };
}

/** R5 — the counts in the brief match the rows in the tables. */
function checkBriefCounts(
  tables: Table[],
  findings: Finding[],
  briefCounts: Record<string, number>,
  briefText: string | undefined,
): ReconciliationCheck {
  const problems: string[] = [];

  for (const [name, count] of Object.entries(briefCounts)) {
    const table = tables.find((entry) => entry.name === name);
    if (!table) continue;
    if (table.rows.length !== count) {
      problems.push(`${name} has ${table.rows.length} rows but the brief says ${count}`);
    }
  }

  const findingsTable = tables.find((entry) => entry.name === "data_findings.csv");
  if (findingsTable && findingsTable.rows.length !== findings.length) {
    problems.push(`the findings table has ${findingsTable.rows.length} rows but ${findings.length} were found`);
  }

  // When the brief has been written, its own numbers are read back and checked.
  if (briefText !== undefined) {
    const stated = briefTableCounts(briefText);

    for (const [label, name] of BRIEF_COUNT_LABELS) {
      const table = tables.find((entry) => entry.name === name);
      if (!table) continue;

      const value = stated.get(label);
      if (value === undefined) {
        problems.push(`the brief does not state "${label}"`);
        continue;
      }
      if (value !== table.rows.length) {
        problems.push(`the brief says ${value} ${label.toLowerCase()}, and the table holds ${table.rows.length}`);
      }
    }

    const findingsCount = briefCounts["findings"];
    if (findingsCount !== undefined && !briefText.includes(`${findingsCount} findings`)) {
      problems.push(`the brief does not state "${findingsCount} findings"`);
    }
  }

  if (problems.length === 0) {
    return {
      id: "R5",
      description: "The counts in the brief match the rows in the tables",
      status: "pass",
      count: BRIEF_COUNT_LABELS.length,
      detail: `${BRIEF_COUNT_LABELS.length} count(s) read back from the brief and checked against the tables.`,
    };
  }

  return {
    id: "R5",
    description: "The counts in the brief match the rows in the tables",
    status: "fail",
    count: BRIEF_COUNT_LABELS.length,
    detail: problems.join("; "),
  };
}

/** The labels the brief states, and the table each one counts. */
const BRIEF_COUNT_LABELS: [string, string][] = [
  ["Graded items", "data_assessments.csv"],
  ["Quizzes", "data_quizzes.csv"],
  ["Rubrics", "data_rubrics.csv"],
  ["Rubric criteria", "data_rubric_criteria.csv"],
  ["Item banks", "data_item_banks.csv"],
  ["Module items", "data_modules_items.csv"],
  ["Pages and ungraded discussions", "data_content.csv"],
];

/** The counts the brief states, read back out of it. */
function briefTableCounts(brief: string): Map<string, number> {
  const counts = new Map<string, number>();

  for (const line of brief.split("\n")) {
    const match = /^\| ([^|]+?) \| (\d+) \|$/.exec(line);
    if (!match) continue;
    counts.set(match[1].trim(), Number(match[2]));
  }

  return counts;
}

/**
 * R6 — the "nothing uses this" lists are checked before they are printed.
 *
 * A bank, a rubric or a page that looks unused is only reported as unused
 * when the usage data agrees. The evidence for each entry is shown.
 */
function checkUnusedLists(review: AssessmentReview): ReconciliationCheck {
  const problems: string[] = [];
  const evidence: string[] = [];

  // Item banks.
  const bankUsers = new Map<string, string[]>();
  for (const assessment of review.assessments) {
    for (const selection of assessment.quiz?.selections ?? []) {
      if (!selection.bankId) continue;
      const list = bankUsers.get(selection.bankId) ?? [];
      list.push(assessment.title);
      bankUsers.set(selection.bankId, list);
    }
  }

  for (const bank of review.itemBanks) {
    const users = bankUsers.get(bank.id) ?? [];
    if (bank.usedBy.length === 0 && users.length > 0) {
      problems.push(
        `the bank "${bank.title || bank.id}" is not recorded as used but ${users.length} quiz(es) draw from it`,
      );
      continue;
    }
    if (bank.usedBy.length === 0) {
      evidence.push(`bank "${bank.title || bank.id}": no quiz in the export names it`);
    }
  }

  // Rubrics.
  const rubricUsers = new Map<string, string[]>();
  for (const assessment of review.assessments) {
    if (!assessment.rubricId) continue;
    const list = rubricUsers.get(assessment.rubricId) ?? [];
    list.push(assessment.title);
    rubricUsers.set(assessment.rubricId, list);
  }

  for (const entry of review.rubrics) {
    if (entry.attachedTo.length > 0) continue;
    const users = rubricUsers.get(entry.rubric.id) ?? [];
    if (users.length > 0) {
      problems.push(`the rubric "${entry.rubric.title}" has no attachment but ${users.length} item(s) point at it`);
      continue;
    }
    evidence.push(`rubric "${entry.rubric.title}": no item in the export attaches it`);
  }

  // Pages.
  const pageUsers = new Map<string, string[]>();
  for (const module of review.course.modules) {
    for (const moduleItem of module.items) {
      if (!moduleItem.targetId) continue;
      const list = pageUsers.get(moduleItem.targetId) ?? [];
      list.push(module.title);
      pageUsers.set(moduleItem.targetId, list);
    }
  }

  for (const item of [...review.course.items, ...review.course.orphans]) {
    if (item.kind !== "page") continue;
    if (item.moduleId) continue;
    const users = pageUsers.get(item.id) ?? [];
    if (users.length > 0) {
      problems.push(`the page "${item.title}" is in no module but ${users.length} module(s) point at it`);
    }
  }

  if (problems.length === 0) {
    return {
      id: "R6",
      description: "Every 'nothing uses this' list is checked against the usage data",
      status: "pass",
      count: evidence.length,
      detail:
        evidence.length > 0
          ? `${evidence.length} unused entr(ies) confirmed: ${evidence.slice(0, 6).join("; ")}${
              evidence.length > 6
                ? `; … and ${evidence.length - 6} more (see data_item_banks.csv and data_rubrics.csv)`
                : ""
            }`
          : "There are no unused banks, rubrics or pages to confirm.",
    };
  }

  return {
    id: "R6",
    description: "Every 'nothing uses this' list is checked against the usage data",
    status: "fail",
    count: evidence.length,
    detail: preview(problems),
  };
}

/** R7 — the findings count in the brief equals the rows in the findings table. */
function checkFindingsCount(
  findings: Finding[],
  tables: Table[],
  briefCounts: Record<string, number>,
  briefText: string | undefined,
): ReconciliationCheck {
  const findingsTable = tables.find((entry) => entry.name === "data_findings.csv");
  const rows = findingsTable?.rows.length ?? 0;

  if (rows !== findings.length) {
    return {
      id: "R7",
      description: "The number of findings in the brief equals the rows in the findings table",
      status: "fail",
      count: rows,
      detail: `The brief counts ${findings.length} findings and the table holds ${rows} rows.`,
    };
  }

  if (briefText !== undefined) {
    const stated = briefCounts["findings"];
    if (stated !== undefined && !briefText.includes(`${stated} findings`)) {
      return {
        id: "R7",
        description: "The number of findings in the brief equals the rows in the findings table",
        status: "fail",
        count: rows,
        detail: `The brief does not state "${stated} findings".`,
      };
    }
  }

  return {
    id: "R7",
    description: "The number of findings in the brief equals the rows in the findings table",
    status: "pass",
    count: rows,
    detail: `${rows} findings, ${rows} rows.`,
  };
}

/** How many names a detail lists before it says how many more there are. */
const DETAIL_NAMES = 6;

/** A short list of names, so a detail does not run long. */
function preview(values: string[]): string {
  if (values.length <= DETAIL_NAMES) return values.join("; ");
  return `${values.slice(0, DETAIL_NAMES).join("; ")}; … and ${values.length - DETAIL_NAMES} more`;
}

/** The known limits of the export format. */
export const KNOWN_LIMITS: string[] = [
  "The export does not carry learner names, submissions or grades, so nothing here says how a student scored.",
  "The export does not carry the live state of the course: overrides, section dates, applied late policies and mastery paths are not part of it. It describes the export, not the course as it stands.",
  "The contents of an item bank are not exported. The review reports what each quiz draws from a bank and what each question is worth, and nothing about what is inside a bank.",
  "Quiz question text, answer choices and answer keys are not read. Whether an item is keyed correctly needs a subject matter expert and is outside what this review does.",
  "New Quizzes usually export only a stub. Their attempts, time limit and shuffling are reported as not in export and have to be checked in the live course.",
  "A rubric's use in the live course can differ from what the export links. A rubric with no attachment found is not the same as an unused one.",
  "The term of the export is not recorded by the platform. It is read out of the course title and code with the configured pattern.",
  "The order of the modules, the fit between the objectives and the activities, and the accessibility of the resources are outside what this review does.",
];
