# Drawbridge — Decision Record

**Version:** 1.1 · **Date:** July 2026 · **Purpose:** Settle what Drawbridge is, what gets built first, and on what stack — based on a full review of every prior iteration. v1.1 adds the handoff model (snapshots, AI/human/machine exports) based on the real production pipeline.

---

## 1. What the history actually says

Across four major design cycles (the MCQ authoring tool, the Prep/Bank suite, the Tauri desktop vault, and the Delphi collection with the Outcome Builder), the surface kept changing but a set of constants never moved. These constants are the real requirements, proven by the fact that every redesign rediscovered them independently:

**The constants.** Privacy by architecture — content never leaves the user's machine except through explicit export. Plaintext canonical formats — markdown with YAML frontmatter for items, YAML for structured data — chosen so files remain useful without the tool and readable by nontechnical people. Deterministic, rule-based behavior inside the tool; AI assistance happens outside it. Loose validation that flags but never blocks. Configurable vocabulary (statuses, terminology, hierarchy labels) because institutional language changes constantly. Immutable internal IDs with derived display codes. Versioned schemas over generic schema engines. The workflow itself: messy SME source material → normalize → review and refine → export toward Canvas, QTI, or manual entry. And the operating constraint that started it all: it must run on a locked-down Windows work computer where installing software isn't an option.

**The recurring failure mode.** Every iteration died the same way: infrastructure ate the product. The MCQ tool grew isomorphic-git, LightningFS, and a CORS proxy before a single item was ever edited. The desktop version grew vault specs, folder mirroring, and packaging concerns. Each time, the collaboration and versioning layer — a future need — was pulled into v1, the design ballooned, priorities shifted at work, and the cycle restarted. The lesson was even written down ("scope discipline is essential") and then violated at the architecture level anyway. The corrective isn't more discipline; it's an architecture where the tempting infrastructure is structurally unnecessary for v1.

**New signals from now.** Three things in the current framing weren't explicit before. First, the Cowork/ChatGPT-Word reference: the desired experience is a document you work *in*, not a code editor you stare at. The April spec led with a raw markdown split-pane; that's a developer's instinct, not an assessment specialist's need. Second, portability across jobs: Drawbridge should outlive any employer, which reinforces plaintext formats and zero institutional dependencies. Third, "teams of one with a collaboration roadmap": solo is the product; collaboration is a property of the files, not a feature of v1.

---

## 2. What Drawbridge is

**Drawbridge is a private, plaintext content management workspace for assessment development.** It is the working layer between raw source material and final platforms — the place where assessment content lives, gets refined, gets tracked, and gets exported. It is not an item bank, not a delivery platform, not a QTI generator, and not a converter utility. It is closest in spirit to a git-based headless CMS or Obsidian: durable files underneath, a humane editing experience on top.

One sentence for the README: *Drawbridge is a set of browser-based tools for managing assessment content — outcomes, items, and the documents around them — where everything stays in plain, portable files that never leave your machine.*

The identity resolves the oldest oscillation in the project. Drawbridge is not "an app" or "a collection of tools" — it is **one static site where each tool is a route**. `/outcomes` is the Outcome Builder. `/items` is the Item Workbench. They share a design system, a domain library, and a family of file formats. Consolidation into "the Drawbridge app" is not a future migration; it is navigation. This is the structural answer to the app-versus-tools question, and it means no tool is ever thrown away when priorities shift — the site just grows another route.

---

## 3. Product decisions

**Preview-first editing.** The primary surface for items and documents is the rendered view: items shown as they would appear to a student, with click-to-edit fields and a metadata panel alongside. Raw markdown remains available as a toggle for power use, but it is the secondary view, not the default. This is the Cowork-shaped decision: reviewing and adjusting content should feel like working in a document, and it also serves the "anybody else working with this stuff" audience, most of whom will never want to see markdown syntax. Markdown stays the storage truth; it stops being the editing interface.

**Persistence model.** File import/export is canonical. localStorage/IndexedDB is crash protection and session continuity only, with a visible indicator when browser state and the last exported file could have diverged. No git in the browser, no CORS proxy, no File System Access API dependency in v1. This is the single most important scope decision, because it deletes the exact infrastructure that killed two prior iterations. The files themselves are designed to be git-friendly and sync-friendly (plaintext, stable IDs, one-item-per-file export option), so version control and sharing remain available to anyone who wants them — outside the tool, using whatever they already have.

**The handoff model.** The real production pipeline is a relay: an AI-drafted design spec goes to an AI item writer (FLO, ChatGPT, Codex) → drafted items come into Drawbridge → review and refinement (solo or AI-assisted) → Word out to human reviewers → feedback reworked into the items → QTI out to Canvas. Drawbridge is the stable hub of that relay; every arrow is a handoff, and the design treats handoffs as first-class:

- **Snapshots.** A snapshot is a named, timestamped saved state of a bank ("draft from FLO," "sent to reviewers," "post-review v2"), stored in IndexedDB and exportable as an ordinary file. Every export automatically records one; the user can create them manually at any point. This is the version history the workflow actually needs — states at handoff boundaries — without any git machinery. Comparing the current bank against a snapshot (plain-language item diff) is the feature that makes reworking reviewer feedback tractable, and it works identically for "what did the AI change" and "what did I change since the review copy went out."
- **Three handoff audiences, three export shapes.** *AI handoff:* markdown in convention, plus the convention prompt and optionally the design spec, packaged so any LLM — chatbot, web app, or CLI agent — can write or revise items that import cleanly. The file format is the API for AI item writers; no LLM ever runs inside the tool. *Human handoff:* Word export designed for reviewers — one item per block, rendered cleanly, with the stable item ID visible on every item so feedback ("item MC-014, option B is wrong") maps back unambiguously. *Machine handoff:* QTI for Canvas, generated deterministically from the same item model.
- **Feedback round-trip.** v1 does not parse reviewer docx comments or tracked changes — that is a fidelity trap. The visible stable IDs plus snapshot diffing make manual (or AI-assisted, outside the tool) rework fast and auditable. Automated comment extraction is a possible later enhancement, only if the manual path proves painful in practice.

**The AI boundary.** Drawbridge itself is deterministic, always. But the workflow explicitly assumes AI lives next door: the work-approved LLM, ChatGPT Word, Claude, whatever comes next. Drawbridge's job is to be a good neighbor to those tools. Concretely: each tool documents its expected input convention on a dedicated page, including a copy-ready prompt the user can paste into their LLM of choice ("convert this messy document into the following format…"). This turns the hardest problem — messy SME docx extraction — into someone else's problem by design, without ever putting an LLM inside the tool. It is the cheapest, most future-proof ingestion strategy available, and it works no matter which AI tools an employer allows.

**Configurability over enforcement.** Terminology labels, status vocabularies, and hierarchy names are read from the file (as already designed in `drawbridge-outcomes/1`). Validation flags, never blocks. Draft states are always saveable and exportable. This carries forward unchanged.

---

## 4. Priority tooling

The biggest risk to Drawbridge is not choosing the wrong tool; it is never shipping one. Every prior cycle ended at the spec stage. The priority order below is chosen to break that pattern first and serve the day job second — and the gap between those two goals turns out to be about three weeks.

**Tool 1 — Outcome Builder. Build it now, exactly as specced.** The proposal, format spec, CLAUDE.md, and fixture file already exist. It is the smallest tool, it has zero parsing risk, and it exercises every pattern the collection needs: YAML round-tripping, loose validation, configurable terminology, localStorage recovery, export/import, and the Astro + Svelte + Tailwind stack. Shipping it end to end produces the shared component library and the deployment pipeline as byproducts, and — more importantly — produces the first finished thing in the project's history. Do not add features. Do not revisit the spec. Build, deploy, use it at work.

**Tool 2 — Item Workbench.** This is the merger of the two item-tool concepts that have each been designed twice: Prep (cleaning/conversion) and the MCQ authoring/review tool. The v1 scope is deliberately the *review* half, because that is where the daily value is and where the risk is lowest:

- Import: markdown following the documented Drawbridge item convention (YAML frontmatter + heading-structured body). That's it for v1. The convention-prompt page is how FLO/ChatGPT/Codex output arrives in importable form.
- Edit/review: preview-first item cards, click-to-edit, metadata panel (tags, status, notes, alignment), item navigator with filter by status/tag.
- Alignment powered by the outcomes file: load a `drawbridge-outcomes/1` YAML alongside the bank and the alignment field autocompletes against real outcome codes. First proof of the shared format family, and it makes "bank of items aligned to specific outcomes" a structured fact rather than free text.
- Snapshots: named saved states, auto-recorded on export, manually creatable.
- Item types for v1: multiple choice, multiple answer, true/false. Fill-in-the-blank and beyond are v2.
- Export: markdown (roundtrip-faithful) and reviewer-ready docx (via the `docx` library) with visible stable item IDs. Everything else waits.

**Item Workbench v1.5 — the review loop.** Snapshot diffing (current bank vs. any snapshot, plain-language per-item changes) to support reworking reviewer feedback and auditing AI-assisted edits. Mammoth-based docx ingestion of heading-structured documents following the same convention — the old Prep concept, arriving as a feature rather than a product, after the markdown path is solid.

**Item Workbench v2 — QTI export.** Promoted from indefinite deferral to scheduled, because Canvas ingestion is a confirmed endpoint of the real pipeline, not a hypothetical. Scoped to the v1 item types only, generated client-side (JSZip + XML templates). QTI generation is deterministic and well-specified — genuinely lower-risk than docx parsing — but it ships only after the review loop is proven, and existing converters (fed clean markdown) bridge the gap until then.

**Deferred, explicitly and indefinitely:** in-browser git and any networked collaboration features, desktop packaging, test/form assembly, reviewer-comment/tracked-changes parsing, PDF/HTML export, math rendering. Each of these has previously acted as a v1 scope bomb. They only enter a spec when a shipped tool creates concrete demand.

**Future routes** (unordered, unscoped): passage/stimulus authoring, rubric builder, blueprint/coverage mapper that joins outcomes to items. The outcomes↔items join is the most interesting long-term payoff of the shared-format family, and it costs nothing now beyond keeping IDs stable — which is already policy.

---

## 5. Tech approach

The stack was settled correctly in the Outcome Builder cycle. It is now locked for the collection and is not re-litigated per tool:

| Layer | Choice |
|---|---|
| Framework | Astro (static output), one site, tools as routes |
| Interactivity | Svelte 5 islands, TypeScript everywhere |
| Styling | Tailwind CSS v4, Starwind-style components |
| Shared state | nanostores where cross-island state is needed |
| YAML | `yaml` (eemeli) — comment and unknown-key preservation |
| Markdown | unified/remark + remark-gfm; sanitized rendering for preview |
| Docx (later) | mammoth.js in, `docx` out |
| Persistence | File import/export canonical; IndexedDB/localStorage as recovery |
| Testing | Vitest; fixture-file round-trip tests are release gates |
| Deploy | Netlify, fully static, no functions |

Repository architecture rules, carried forward and consolidated:

- One repo, one Astro site. `src/lib/` holds framework-free pure TypeScript domain logic per format (`src/lib/outcomes/`, `src/lib/items/`), portable to anything later. Components never parse or serialize files directly.
- One shared component kit in `src/components/ui/`; tool-specific components live under their tool's folder.
- Formats are versioned (`drawbridge-outcomes/1`, `drawbridge-items/1`) with a written spec per format. Round-trip fidelity — unknown keys and comments preserved — is a release-blocking requirement.
- IDs are immutable after creation; display numbering derives from order.
- Hard rules from the existing CLAUDE.md stand for the whole site: no network calls after page load, no backend, no telemetry, no data collection, user content never leaves the browser except by explicit export, deterministic behavior only.

Why not React or SvelteKit: React's ecosystem advantage matters for large team products, not focused single-developer tools, and its bundle/complexity cost buys nothing here. SvelteKit made sense when the project was a single fully-interactive app; for a multi-tool static site with islands of interactivity, Astro's model is the better fit and preserves the existing Starwind investment. This question is now closed.

Why the browser and not desktop: the work computer is the environment that matters, installs aren't reliably possible there, and a static URL is the one distribution channel no IT policy blocks. Desktop packaging remains a possible future *distribution* of the same code, not a different product. The domain-logic isolation rule above is what keeps that door open for free.

---

## 6. Collaboration roadmap

Collaboration is a property of the files, staged so that v1 pays nothing for it:

**Stage 0 (v1, free):** exports are plaintext with stable IDs. Two people can already collaborate by emailing files, sharing a OneDrive folder, or committing to a repo — Drawbridge doesn't need to know.

**Stage 1:** merge-friendly exports — an optional one-item-per-file export layout so folder-level diffing and git workflows work naturally for those who use them.

**Stage 2:** in-app file comparison — import two versions of a file, see a plain-language diff of items/outcomes, choose per-change. Still no network, no accounts; this is the highest-value collaboration feature achievable inside the privacy guarantees.

**Stage 3 (speculative):** File System Access API as a progressive enhancement on Chromium (which covers the Windows work environment) for open-a-folder workflows; possibly a desktop wrapper. Only if stages 0–2 prove insufficient in real use.

---

## 7. What would reopen these decisions

State the falsifiers so future pivots are decisions rather than drift: if the Outcome Builder can't ship within a focused month, the stack or scope is wrong — reassess. If the LLM-prompt ingestion path fails in practice (SME docs too messy even for AI normalization), docx ingestion moves up. If a second real user appears with sharing needs, Stage 2 diffing moves up. Absent those triggers, the answer to any new architectural idea is: it goes in this document's deferred list, and the current tool ships first.
