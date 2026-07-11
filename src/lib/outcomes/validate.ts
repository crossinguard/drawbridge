// Loose validation for drawbridge-outcomes/1.
//
// Flags issues; never blocks. Every input still produces a usable model.
// Reverse views (which LOs map to a CO) are always computed here, never stored.
//
// Framework-free. See docs/formats/outcomes-format.md for the rules.

import type { OutcomeDoc, ValidationFlag } from "./types.js";

/** Compute which LO ids map to a given CO id. Never stored on disk. */
export function losForOutcome(doc: OutcomeDoc, coId: string): string[] {
  return doc.objectives
    .filter((lo) => lo.maps_to.includes(coId))
    .map((lo) => lo.id);
}

/** Set of all valid CO ids, for reference checks. */
function outcomeIds(doc: OutcomeDoc): Set<string> {
  return new Set(doc.outcomes.map((co) => co.id));
}

/** Set of all valid LO ids, for scope checks. */
function objectiveIds(doc: OutcomeDoc): Set<string> {
  return new Set(doc.objectives.map((lo) => lo.id));
}

export function validate(doc: OutcomeDoc): ValidationFlag[] {
  const flags: ValidationFlag[] = [];
  const coIds = outcomeIds(doc);
  const loIds = objectiveIds(doc);

  for (const co of doc.outcomes) {
    if (!co.text.trim()) {
      flags.push({
        severity: "info",
        targetId: co.id,
        message: "Course outcome has no text.",
      });
    }
    if (co.evidence.length === 0) {
      flags.push({
        severity: "info",
        targetId: co.id,
        message: "Course outcome has no evidence outcomes.",
      });
    }
    for (const eo of co.evidence) {
      for (const loRef of eo.scope ?? []) {
        if (!loIds.has(loRef)) {
          flags.push({
            severity: "warn",
            targetId: eo.id,
            message: `Scope references unknown objective "${loRef}".`,
          });
        } else {
          const lo = doc.objectives.find((o) => o.id === loRef)!;
          if (!lo.maps_to.includes(co.id)) {
            flags.push({
              severity: "warn",
              targetId: eo.id,
              message: `Scope objective "${loRef}" does not map to this evidence outcome's course outcome.`,
            });
          }
        }
      }
    }
  }

  for (const lo of doc.objectives) {
    if (lo.maps_to.length === 0) {
      flags.push({
        severity: "warn",
        targetId: lo.id,
        message: "Objective maps to no course outcome.",
      });
    }
    for (const coRef of lo.maps_to) {
      if (!coIds.has(coRef)) {
        flags.push({
          severity: "warn",
          targetId: lo.id,
          message: `Objective maps to unknown course outcome "${coRef}".`,
        });
      }
    }
  }

  return flags;
}
