# Handoffs and snapshots

Drawbridge is the stable hub of a relay. Every arrow in the pipeline is a
handoff, and the design treats handoffs as first-class. This document describes
the snapshot model and the three export shapes.

## The pipeline

```
AI design spec                                    (created outside Drawbridge)
      │
      ▼
AI item writer  ── FLO chatbot / ChatGPT web / Codex app or CLI
      │           writes markdown in the item convention
      ▼
Drawbridge  ◀── import ── the AI's markdown
      │  review & refine (preview-first editing; AI prompts run outside the tool)
      │
      ├── export ──▶ Word  ──▶ human reviewers  ──▶ feedback (comments / markup)
      │                                                   │
      ◀───────────────── rework feedback into items ──────┘
      │  (manual or AI-assisted, guided by visible IDs + snapshot diff)
      │
      └── export ──▶ QTI ──▶ Canvas
```

Drawbridge never talks to any of these systems over the network. Every boundary
is a file the user moves deliberately. That is the privacy guarantee and the
portability guarantee in one.

## Snapshots

A **snapshot** is a named, timestamped saved state of a bank. It is the version
history the workflow actually needs — states at handoff boundaries — with none of
the git machinery that sank prior iterations.

Properties:

- Stored in IndexedDB, and exportable as an ordinary file (a snapshot is just a
  bank file plus a label and timestamp).
- **Auto-recorded on every export.** Sending a Word file to reviewers
  automatically captures "sent to reviewers" so you can later diff against it.
- **Manually creatable** at any point ("draft from FLO", "post-review v2").
- Never networked, never shared automatically. Sharing a snapshot means exporting
  the file and handing it over, like everything else.

Typical snapshot timeline for one bank:

```
draft-from-flo → my-first-pass → sent-to-reviewers → post-review-v2 → qti-final
```

## Snapshot diffing (Phase 3)

Load the current bank and any snapshot; get a plain-language, per-item report:
items added, removed, and — for changed items — which fields changed and how.

This single feature does two jobs:

- **"What did the AI change?"** After an AI-assisted revision pass, diff against
  the pre-revision snapshot to review every change before accepting it.
- **"What changed since I sent the review copy?"** Diff current against
  `sent-to-reviewers` to see exactly what your rework touched, and confirm you
  addressed feedback without collateral edits.

## Three handoff audiences, three export shapes

The same item model serializes three ways depending on who receives it.

### AI handoff — markdown + prompt

For FLO, ChatGPT, or Codex to write or revise items that import cleanly.

- Markdown in the item convention.
- Accompanied by the convention prompt (from `/conventions`) and, optionally, the
  design spec.
- The file format *is* the API for AI item writers. Because the convention is
  documented and deterministic, any competent LLM can target it, and its output
  imports without guesswork.
- No LLM runs inside Drawbridge. Codex writing `.md` files that Drawbridge imports
  is the correct division of labor.

### Human handoff — reviewer-ready Word

For subject-matter reviewers who work in Word, not tools.

- One item per clearly delimited block, rendered as it reads (not as markdown
  source).
- **The stable item ID is visible on every item.** This is the load-bearing
  detail: a reviewer's note "item MC-014, option B is wrong" maps back to exactly
  one item, and snapshot diffing can confirm the fix landed there.
- Metadata a reviewer needs (outcome alignment, status) shown; internal notes
  optionally included or omitted.

### Machine handoff — QTI for Canvas (Phase 4)

- Deterministic QTI generated from the same item model, client-side.
- Scoped to supported item types; unsupported constructs flag as "needs review"
  rather than silently degrading.

## Feedback round-trip: what v1 does and doesn't

v1 does **not** parse reviewer Word comments or tracked changes. That is a
fidelity trap — comment anchoring and tracked-change semantics across Word
versions are exactly the kind of brittle parsing that stalls deterministic tools.

Instead, the round-trip relies on:

- **Visible stable IDs** so feedback references map to items unambiguously.
- **Snapshot diffing** so rework is fast and auditable.

Rework is manual, or AI-assisted outside the tool (paste an item plus its
feedback into your LLM, bring the revision back). Automated comment extraction is
a candidate later enhancement — only if the manual path proves painful in real
use.
