// Domain types for drawbridge-outcomes/1.
// Framework-free. No Svelte, no DOM, no Astro. See docs/01-architecture.md.

export interface Terminology {
  outcome: string;
  evidence: string;
  objective: string;
}

export interface CourseMeta {
  title?: string;
  code?: string;
}

export interface EvidenceOutcome {
  id: string;
  text: string;
  /** Advisory LO scope. Never enforced. */
  scope?: string[];
}

export interface CourseOutcome {
  id: string;
  text: string;
  evidence: EvidenceOutcome[];
}

export interface LearningObjective {
  id: string;
  text: string;
  /** Many-to-many mapping to CO ids only. */
  maps_to: string[];
}

export interface OutcomeDoc {
  schema: "drawbridge-outcomes/1";
  terminology: Terminology;
  course: CourseMeta;
  outcomes: CourseOutcome[];
  objectives: LearningObjective[];
}

export type Severity = "error" | "warn" | "info";

export interface ValidationFlag {
  severity: Severity;
  /** The id of the offending node, or null for document-level issues. */
  targetId: string | null;
  message: string;
}

export const DEFAULT_TERMINOLOGY: Terminology = {
  outcome: "Course Outcome",
  evidence: "Evidence Outcome",
  objective: "Learning Objective",
};
