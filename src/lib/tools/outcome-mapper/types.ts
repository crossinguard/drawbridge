/**
 * Outcome Mapper data model.
 * All state is kept in memory; nothing is persisted or transmitted.
 */

export const OUTCOME_LEVELS = ["program", "course", "assessment"] as const;
export type OutcomeLevel = (typeof OUTCOME_LEVELS)[number];

export interface Outcome {
  id: string;
  level: OutcomeLevel;
  text: string;
}

export interface Mapping {
  childId: string;
  parentId: string;
}

export interface OutcomeMap {
  outcomes: Outcome[];
  mappings: Mapping[];
}

export interface ParsedInput {
  outcomes: Outcome[];
  mappings: Mapping[];
  warnings: string[];
}
