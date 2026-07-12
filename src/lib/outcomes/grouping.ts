// Relationship grouping for drawbridge-outcomes/1.
//
// The stored model keeps outcomes and objectives as separate lists (LOs map to
// COs; EOs carry advisory scope referencing LOs). For a relationship-first view
// we invert that into a tree: each LO shown under the CO(s) it maps to, and —
// when an EO's scope pins it — nested under that specific evidence outcome
// instead of at the CO level. LOs mapped to nothing land in `unassigned`.
//
// Pure and derived; nothing here is stored. An LO mapped to several COs appears
// under each (its cross-mappings stay visible), so this never loses information.
//
// Framework-free. No Svelte, no DOM, no Astro.

import type {
  OutcomeDoc,
  CourseOutcome,
  EvidenceOutcome,
  LearningObjective,
} from "./types.js";

export interface EvidenceGroup {
  eo: EvidenceOutcome;
  /** LOs this EO's scope references (finest-grained placement). */
  objectives: LearningObjective[];
}

export interface OutcomeGroup {
  co: CourseOutcome;
  evidence: EvidenceGroup[];
  /** LOs mapped to this CO but not pinned to any EO under it. */
  objectives: LearningObjective[];
}

export interface GroupedOutcomes {
  outcomes: OutcomeGroup[];
  /** LOs mapped to no CO. */
  unassigned: LearningObjective[];
}

export function groupByOutcome(doc: OutcomeDoc): GroupedOutcomes {
  const byId = new Map(doc.objectives.map((lo) => [lo.id, lo]));

  const outcomes: OutcomeGroup[] = doc.outcomes.map((co) => {
    const scopedHere = new Set<string>();
    const evidence: EvidenceGroup[] = co.evidence.map((eo) => {
      const objectives: LearningObjective[] = [];
      for (const loId of eo.scope ?? []) {
        const lo = byId.get(loId);
        if (lo) {
          objectives.push(lo);
          scopedHere.add(lo.id);
        }
      }
      return { eo, objectives };
    });
    // CO-level = mapped to this CO, minus anything pinned to an EO under it.
    const objectives = doc.objectives.filter(
      (lo) => lo.maps_to.includes(co.id) && !scopedHere.has(lo.id),
    );
    return { co, evidence, objectives };
  });

  const unassigned = doc.objectives.filter((lo) => lo.maps_to.length === 0);
  return { outcomes, unassigned };
}
