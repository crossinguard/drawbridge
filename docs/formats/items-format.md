# Item format — `drawbridge-items/1`

The canonical file format for an assessment item bank. Human-readable Markdown
with a YAML frontmatter header, designed to be equally legible to a person, a
diff tool, and an AI item writer.

**Status:** Draft spec for Phase 2. Not yet implemented.
**Round-trip fidelity is release-blocking:** unknown keys and comments survive
parse → serialize unchanged.

## Design intent

- A bank is one Markdown file containing many items. This matches how source
  documents arrive and how reviewers think. (A one-item-per-file export layout is
  a later, optional convenience for git workflows — not the canonical form.)
- Structure comes from headings, not visual formatting. No bold-as-meaning, no
  asterisks-as-answer. Formatting is fragile across docx/markdown/copy-paste;
  headings survive.
- The format is the API for AI item writers. It must be simple enough to describe
  in a prompt and strict enough to parse deterministically.

## File shape

A file has an optional bank-level frontmatter block, then a sequence of items.
Each item is an `H2` heading; sections within an item are `H3`.

```markdown
---
schema: drawbridge-items/1
bank: Introductory Biology — Unit 3
outcomes_file: bio101-outcomes.yaml     # optional; enables alignment autocomplete
terminology:
  status_values: [draft, review, ready, retired]
---

## MC-014
<!-- id: itm_7f3a — do not edit; downstream references depend on it -->

### Meta
type: multiple_choice
status: draft
alignment: [CO2.EO3]
tags: [cellular-respiration, difficulty/medium]
notes: Reviewer flagged distractor C as too easy in a prior cycle.

### Stem
Which organelle is the primary site of ATP synthesis in eukaryotic cells?

### Options
- Mitochondrion
- Ribosome
- Golgi apparatus
- Lysosome

### Answer
Mitochondrion

### Rationale
ATP synthase in the inner mitochondrial membrane drives the bulk of cellular
ATP production via oxidative phosphorylation.
```

## Item envelope

Every item, regardless of type, carries these fields (in the `### Meta` block as
YAML-ish `key: value` lines, or in item frontmatter — see "Meta block" below):

| Field       | Type            | Notes |
|-------------|-----------------|-------|
| `id`        | opaque string   | stable forever, assigned by the tool, never edited by hand |
| display code| the `H2` text    | user-visible (`MC-014`); derived/editable; NOT the identity |
| `type`      | enum            | `multiple_choice`, `multiple_answer`, `true_false` (v1) |
| `status`    | string          | free-form; autocompletes from `status_values` |
| `alignment` | string[]        | outcome codes; validated against `outcomes_file` if present |
| `tags`      | string[]        | free-form; `path/notation` allowed (`difficulty/medium`) |
| `notes`     | markdown string | private working notes; may be omitted from reviewer export |
| `rationale` | markdown string | optional explanation |

### The id vs. display code distinction

This is the most important rule in the format, carried from every prior cycle:

- **`id`** is opaque and immutable (`itm_7f3a`). It is the identity. Alignments,
  snapshot diffs, and reviewer references resolve to it. It is written in an HTML
  comment under the heading so it survives markdown rendering without cluttering
  the reading view. Never renumber, never reuse.
- **The display code** (`MC-014`, the `H2` text) is for humans. It can be renamed
  freely. It is what appears on the reviewer's Word copy. Two items must not share
  a display code within a bank, but the tool enforces that by flagging, not
  blocking.

On import of an AI-written file with no `id` comment, the tool assigns one and
writes it back on first save. AI writers are told (in the convention prompt) to
omit `id` and let Drawbridge mint it.

## Type-specific bodies

### multiple_choice

`### Options` is a bullet list. `### Answer` names the correct option by its exact
text (preferred) or by letter if the tool later offers lettering. Exactly one
correct option; zero or more than one is a validation flag, not a parse failure.

### multiple_answer

Same as `multiple_choice` but `### Answer` lists one option per line, and two or
more correct is expected. Zero correct flags.

### true_false

`### Options` is omitted or is exactly `True` / `False`. `### Answer` is `True`
or `False`.

## Validation levels

Loose by default. Every level below still produces a usable draft model — invalid
never means unopenable.

- **error** (flagged red, still saveable): no stem; unparseable structure.
- **warn** (flagged amber): MC with no correct answer or multiple; alignment code
  not found in the loaded outcomes file; duplicate display code; fewer than two
  options for MC.
- **info** (quiet): empty notes; no tags; no alignment.

## Meta block format

Within `### Meta`, lines are `key: value`. Scalars are strings unless they parse
as a YAML list (`[a, b]`) or the key is known to be a list (`alignment`, `tags`).
This keeps the meta block hand-editable and prompt-describable without requiring
the writer to think in strict YAML. The domain layer normalizes it to the
envelope on import and serializes it back consistently on export.

Comments (`<!-- ... -->`) and any unrecognized `### Section` or meta key are
preserved verbatim on round-trip and surfaced as "unknown, preserved" rather than
dropped.

## Open questions for Phase 2 (resolve before coding)

1. Lettered vs. text answer references — pick one canonical form for `### Answer`,
   support both on import.
2. Feedback fields (per-option, per-item correct/incorrect) — in v1 envelope or
   deferred? Prior specs had them; daily workflow may not need them yet.
3. Multi-bank in one file vs. one bank per file — spec currently says one bank per
   file; confirm against how AI writers actually emit content.
