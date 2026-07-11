# Outcomes format — `drawbridge-outcomes/1`

The canonical file format for a course's outcome architecture: course outcomes
(CO), evidence outcomes (EO), and learning objectives (LO), with the mappings
between them. A single portable YAML file per course.

**Status:** Established in the Outcome Builder design cycle. This is the Phase 1
build contract. YAML chosen over JSON specifically because nontechnical users may
open these files directly.

## Domain model

- **COs and EOs form a strict parent-child tree.** Each EO has exactly one parent
  CO. Each CO has zero or more EOs.
- **LOs are a flat, independent list.** They map many-to-many to COs only.
- **Soft scope:** an LO may appear as advisory `scope` on an EO under a CO it maps
  to. This is never enforced — it is a hint, not a constraint.
- **Mappings live on the LO side** (`maps_to`). Reverse views (which LOs map to a
  CO) are always computed, never stored.

## File shape

```yaml
schema: drawbridge-outcomes/1

# Terminology is configurable. The tool reads labels from here, so a colleague at
# another institution opens their file and sees their own words.
terminology:
  outcome: Course Outcome
  evidence: Evidence Outcome
  objective: Learning Objective

course:
  title: Introductory Biology
  code: BIO101

outcomes:
  - id: co_0a1
    text: Explain the flow of energy and matter through living systems.
    evidence:
      - id: eo_0a1a
        text: Describe cellular respiration at the organelle level.
        scope: [lo_1]        # advisory only; never enforced
      - id: eo_0a1b
        text: Trace ATP through a metabolic pathway.

objectives:
  - id: lo_1
    text: Identify the organelles involved in energy production.
    maps_to: [co_0a1]
  - id: lo_2
    text: Compare aerobic and anaerobic respiration.
    maps_to: [co_0a1]
```

## IDs

- Opaque, short, immutable after creation (the reference implementation uses
  4-character base36 with a type prefix: `co_`, `eo_`, `lo_`).
- Display numbering (CO1, EO1.2, LO3) derives from order in the file. Never store
  display numbers; never renumber IDs.
- IDs are what the Item Workbench aligns against. Stability here is what makes the
  outcomes↔items join possible.

## Round-trip fidelity

Unknown keys and comments are preserved on parse → serialize. Data loss on
import/export is a release-blocking bug. The `yaml` (eemeli) package is used
specifically for comment preservation and error quality.

## Validation levels

Loose by default; draft states always valid.

- **warn:** an EO with no parent CO; an LO with an empty `maps_to`; a `scope`
  reference to an LO that doesn't map to that EO's CO; a dangling ID reference.
- **info:** an outcome with no text; a CO with no EOs.

Nothing blocks saving or exporting.

## Relationship to items

When the Item Workbench loads an outcomes file alongside a bank, item `alignment`
codes are validated against these IDs and the alignment field autocompletes from
this list. The join is one-directional and read-only: the Item Workbench reads
outcomes, never writes them.
