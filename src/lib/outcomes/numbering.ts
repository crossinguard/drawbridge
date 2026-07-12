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
 * The display identifier for every node id: its custom `code` if set, otherwise
 * the tier prefix plus the derived number ("CO 2", "EO 2.1", "LO 3"). This is the
 * single source of truth for what an item is called on screen — prefixes are
 * configurable and per-item codes override the number.
 */
export function identifierMap(doc: OutcomeDoc): Map<string, string> {
  const nums = displayNumbers(doc);
  const p = doc.prefixes;
  const map = new Map<string, string>();
  for (const co of doc.outcomes) {
    map.set(co.id, co.code || `${p.outcome} ${nums.outcome.get(co.id)}`);
    for (const eo of co.evidence) {
      map.set(eo.id, eo.code || `${p.evidence} ${nums.evidence.get(eo.id)}`);
    }
  }
  for (const lo of doc.objectives) {
    map.set(lo.id, lo.code || `${p.objective} ${nums.objective.get(lo.id)}`);
  }
  return map;
}

/** Look up a display identifier, falling back to the raw id for a dangling
 * reference (so broken links stay visible). */
export function labelFor(map: Map<string, string>, id: string): string {
  return map.get(id) ?? id;
}
