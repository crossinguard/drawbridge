/**
 * The manifest.
 *
 * It lists every file in the bundle with its size and row count, says which
 * files belong to which review step, and carries the settings the review was
 * run with. A reader who has the manifest knows exactly what they have and
 * what to do with it.
 */
import type { Candidate, CheckStat, Finding } from "@/lib/tools/assessment-review/findings";
import type { ReviewSettings } from "@/lib/tools/assessment-review/settings";

import type { Reconciliation } from "./reconcile";

/** One file in the bundle. */
export interface ManifestFile {
  /** The file name, without the folder. */
  name: string;
  /** What kind of file it is. */
  kind: "brief" | "data" | "detail" | "manifest";
  /** What the file holds. */
  purpose: string;
  /** How many characters it holds. */
  chars: number;
  /** How many bytes it holds. */
  bytes: number;
  /** How many rows it holds, for a table. */
  rows: number;
  /** The review steps this file belongs to. */
  steps: string[];
}

/** The review steps the bundle is read in. */
export const REVIEW_STEPS: { id: string; title: string; description: string }[] = [
  {
    id: "step-1-orient",
    title: "Orient",
    description: "Read the brief and the gradebook. Establish what the course holds and how it is marked.",
  },
  {
    id: "step-2-findings",
    title: "Findings",
    description:
      "Work through the findings and the candidate mismatches. Use the detail files for the items they name.",
  },
  {
    id: "step-3-details",
    title: "Details",
    description: "Read the item and rubric detail for the items that still need a decision.",
  },
];

/** What the manifest holds. */
export interface Manifest {
  /** The bundle's name. */
  bundle: string;
  /** When the bundle was built. */
  builtAt: string;
  /** The course the bundle is about. */
  course: { title: string; code: string; sourceFile: string; exportedAt?: string };
  /** Every file in the bundle. */
  files: ManifestFile[];
  /** The review steps, and the files that belong to each. */
  steps: { id: string; title: string; description: string; files: string[] }[];
  /** The settings the review was run with. */
  settings: ReviewSettings;
  /** What the checks looked at. */
  checks: CheckStat[];
  /** The reconciliation results. */
  reconciliation: Reconciliation["checks"];
  /** The counts the bundle carries. */
  counts: Record<string, number>;
  /** How to read the files. */
  legend: {
    /** The value written when the export did not carry a value. */
    notInExport: string;
    /** The value written when a field does not apply. */
    notApplicable: string;
    /** The confidence levels. */
    confidence: string[];
    /** A note about each column of the findings table. */
    findingsColumns: Record<string, string>;
  };
}

/** Build the manifest. */
export function buildManifest(input: {
  bundle: string;
  course: Manifest["course"];
  files: ManifestFile[];
  settings: ReviewSettings;
  checks: CheckStat[];
  reconciliation: Reconciliation;
  counts: Record<string, number>;
  findings: Finding[];
  candidates: Candidate[];
}): Manifest {
  return {
    bundle: input.bundle,
    builtAt: new Date().toISOString(),
    course: input.course,
    files: input.files,
    steps: REVIEW_STEPS.map((step) => ({
      ...step,
      files: input.files.filter((file) => file.steps.includes(step.id)).map((file) => file.name),
    })),
    settings: input.settings,
    checks: input.checks,
    reconciliation: input.reconciliation.checks,
    counts: input.counts,
    legend: {
      notInExport: "not in export",
      notApplicable: "not applicable",
      confidence: ["high", "medium", "low"],
      findingsColumns: {
        id: "A stable identifier for the finding.",
        check_family: "The family of checks the finding belongs to.",
        check_id: "The check that produced it.",
        severity_suggested: "The severity the tool suggests. A hint: the reviewer decides.",
        object_type: "What kind of object the finding is about.",
        object_id: "The identifier of that object.",
        object_name: "The name of that object.",
        statement: "What differs, in neutral words.",
        value_a: "The first value compared.",
        source_a: "Where the first value came from.",
        value_b: "The second value compared.",
        source_b: "Where the second value came from.",
        confidence: "How sure the tool is. Anything matched on words alone is low.",
        notes: "Extra context: the arithmetic, the reasons, the exact sentences.",
        affected: "Every object the cause touches, by id.",
      },
    },
  };
}
