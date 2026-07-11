# Roadmap

The biggest risk to Drawbridge is not the wrong tool; it is never shipping one.
Four prior design cycles ended at the spec stage. This roadmap is ordered to
break that pattern first and serve the day job second.

Ship each phase — deploy it, use it at work — before starting the next. A phase
is done when it is in your hands on the work machine, not when it compiles.

## Phase 1 — Outcome Builder (ship now)

The spec already exists (`docs/formats/outcomes-format.md`, plus the prior
PROPOSAL/SPEC/CLAUDE artifacts). It is the smallest tool, has zero parsing risk,
and exercises every pattern the collection needs: YAML round-tripping, loose
validation, configurable terminology, IndexedDB recovery, export/import, and the
full Astro + Svelte + Tailwind stack.

Shipping it produces the shared component kit and the deploy pipeline as
byproducts — and the first finished thing in the project's history.

Scope: manage COs, EOs, LOs and their mappings per the format spec. Import and
export the single YAML file. Loose validation with flags. Configurable
terminology read from the file. Nothing more.

**Definition of done:** deployed to Netlify, and you have built and exported a
real course's outcomes on the work machine.

## Phase 2 — Item Workbench v1 (the daily driver)

The merger of the two item-tool concepts that were each designed twice (Prep and
the MCQ authoring tool). v1 is the *review* half, because that is where the daily
value is and the risk is lowest.

- **Import:** Markdown in the documented item convention (YAML frontmatter +
  heading-structured body). Only this. The convention-prompt page is how
  FLO/ChatGPT/Codex output arrives importable.
- **Edit/review:** preview-first item cards, click-to-edit fields, metadata panel
  (tags, status, notes, alignment), navigator with filter by status/tag.
- **Alignment:** optionally load an outcomes YAML alongside the bank; the
  alignment field autocompletes against real outcome codes. First proof of the
  shared-format family.
- **Snapshots:** named saved states, auto-recorded on export, manually creatable.
- **Item types:** multiple choice, multiple answer, true/false.
- **Export:** Markdown (roundtrip-faithful) and reviewer-ready docx with visible
  stable item IDs.

**Definition of done:** deployed, and you have run one real bank from AI-drafted
markdown through review to a Word file you'd actually send a reviewer.

## Phase 3 — Item Workbench v1.5 (the review loop)

- **Snapshot diffing:** current bank vs. any snapshot, plain-language per-item
  changes. This is what makes reworking reviewer feedback and auditing
  AI-assisted edits tractable. Works identically for "what did the AI change" and
  "what changed since the review copy went out."
- **Docx ingestion:** mammoth-based import of heading-structured docx following
  the same convention. The old Prep concept, arriving as a feature. After the
  markdown path is solid, because docx parsing is where deterministic tools
  suffer — and the convention-prompt path covers the need until then.

## Phase 4 — Item Workbench v2 (QTI export)

Promoted from indefinite deferral to scheduled, because Canvas ingestion is a
confirmed endpoint, not a hypothetical. Scoped to the v1 item types, generated
client-side (a zip library + XML templates). QTI is deterministic and
well-specified — lower-risk than docx parsing — but ships only after the review
loop is proven. Existing converters fed clean markdown bridge the gap.

## Deferred, explicitly and indefinitely

Each of these acted as a v1 scope bomb in a prior cycle. They enter a spec only
when a *shipped* tool creates concrete demand:

- In-browser git and any networked collaboration
- Desktop packaging (the framework-free domain layer keeps this cheap later)
- Test / form assembly
- Reviewer-comment and tracked-changes parsing (visible IDs + diffing cover it)
- PDF / HTML export
- Math rendering (LaTeX/MathML) — flag as "needs review" if encountered
- Fill-in-the-blank and structured NGN item types

## Future routes (unordered, unscoped)

Passage/stimulus authoring, rubric builder, and a blueprint/coverage mapper that
joins outcomes to items. The outcomes↔items join is the most interesting
long-term payoff of the shared-format family and costs nothing now beyond keeping
IDs stable — already policy.

## What reopens the plan

State the falsifiers so future pivots are decisions, not drift:

- Outcome Builder can't ship in a focused month → stack or scope is wrong,
  reassess.
- Convention-prompt ingestion fails in practice (docs too messy even for AI to
  normalize) → docx ingestion moves up.
- A second real user appears with sharing needs → snapshot diffing / Stage 2
  collaboration moves up.

Absent a trigger, the answer to any new architectural idea is: it goes in the
deferred list, and the current phase ships first.
