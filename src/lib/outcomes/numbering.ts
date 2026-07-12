// Display numbering for drawbridge-outcomes/1.
//
// Numbers are DERIVED from order, never stored. IDs stay stable and opaque; the
// number a user sees (CO 1, EO 2.1, LO 3) is a pure function of position, so a
// reorder renumbers the display while every stored reference (maps_to, scope, an
// item bank's alignment) keeps pointing at the same immutable id.
//
// EO numbering bakes in the parent CO's number: the first evidence under the
// second course outcome is "2.1".
//
// Framework-free. No Svelte, no DOM, no Astro.

import type { OutcomeDoc } from "./types.js";

export interface DisplayNumbers {
  /** co id → "1" */
  outcome: Map<string, string>;
  /** eo id → "2.1" (parent CO number + evidence index) */
  evidence: Map<string, string>;
  /** lo id → "3" */
  objective: Map<string, string>;
}

export function displayNumbers(doc: OutcomeDoc): DisplayNumbers {
  const outcome = new Map<string, string>();
  const evidence = new Map<string, string>();
  const objective = new Map<string, string>();

  doc.outcomes.forEach((co, i) => {
    outcome.set(co.id, String(i + 1));
    co.evidence.forEach((eo, j) => evidence.set(eo.id, `${i + 1}.${j + 1}`));
  });
  doc.objectives.forEach((lo, k) => objective.set(lo.id, String(k + 1)));

  return { outcome, evidence, objective };
}

/** Look up any id's display number across all three levels. */
export function numberFor(nums: DisplayNumbers, id: string): string | undefined {
  return nums.outcome.get(id) ?? nums.evidence.get(id) ?? nums.objective.get(id);
}

/**
 * Human label for any id, prefixed by level: "CO 2", "EO 2.1", "LO 3". Falls
 * back to the raw id for a dangling reference (so broken links stay visible).
 */
export function displayLabel(nums: DisplayNumbers, id: string): string {
  const co = nums.outcome.get(id);
  if (co) return `CO ${co}`;
  const eo = nums.evidence.get(id);
  if (eo) return `EO ${eo}`;
  const lo = nums.objective.get(id);
  if (lo) return `LO ${lo}`;
  return id;
}
