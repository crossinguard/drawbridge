# Architecture

This document describes how the code is organized and the invariants that must
hold across every tool. It is the contract the code answers to. The *why* behind
these choices lives in `00-decision-record.md`; this is the *how*.

## The shape of the thing

Drawbridge is a single Astro static site. Astro renders the shell and static
pages; interactivity is provided by Svelte islands mounted only where needed.
There is no server, no SSR, no database. The build output is a folder of static
files served by Netlify.

Each tool is a route under `src/pages/`. Tools share a design system, a set of
UI components, and — critically — a family of file formats. Adding a tool means
adding a route, not migrating to a new app.

## Directory layout

```
src/
  pages/               one folder per tool (route)
    index.astro          landing page, links to tools
    outcomes/            Outcome Builder
    items/               Item Workbench
    conventions/         format docs + AI prompts (static content pages)
  layouts/             shared page shells
  styles/              global.css (Tailwind entry + design tokens)
  components/
    ui/                  shared component kit (Button, Panel, Badge, ...)
    outcomes/            Outcome-Builder-only Svelte components
    items/               Item-Workbench-only Svelte components
  lib/                 THE IMPORTANT PART — see below
    outcomes/            pure TS domain logic for the outcomes format
    items/               pure TS domain logic for the items format
    storage/             IndexedDB snapshot/recovery layer (framework-free)

docs/                  documentation (this folder)
  formats/               versioned file format specs
fixtures/              sample files used by tests and manual dev
tests/                 vitest suites
```

## The load-bearing rule: domain logic is framework-free

Everything in `src/lib/` is pure TypeScript. No Svelte imports, no DOM access,
no Astro APIs. A function in `src/lib/items/` takes data in and returns data out.

This is the single most important architectural rule, for three reasons:

1. **Testability.** Round-trip fidelity (parse → serialize → identical bytes) is
   a release gate. Pure functions make that a trivial vitest assertion with no
   rendering harness.
2. **Portability.** If Drawbridge ever gets a desktop wrapper or a CLI, the
   domain layer moves unchanged. Only the UI is rebuilt. This is what keeps the
   deferred desktop option cheap instead of a rewrite.
3. **Reasoning.** File-format bugs are the expensive kind. Isolating them from UI
   state means you debug data, not a data-plus-rendering tangle.

Components read and write files *only* through the domain layer. A Svelte
component never calls `YAML.parse` or touches remark directly. If a component
needs parsed data, it calls a `lib` function.

## Data flow within a tool

```
file on disk ──import──▶ lib/<tool> parse ──▶ domain model (plain objects)
                                                     │
                                          nanostores state (per tool)
                                                     │
                             ┌───────────────────────┼───────────────────────┐
                             ▼                        ▼                        ▼
                      preview cards            metadata panel           navigator
                     (Svelte island)          (Svelte island)         (Svelte island)
                                                     │
domain model ──serialize (lib)──▶ file on disk   (export)
            └─▶ snapshot (lib/storage) ──▶ IndexedDB   (recovery + handoff history)
```

The domain model held in nanostores is the working truth for the session. The
file is the canonical record. IndexedDB holds snapshots and a recovery copy, and
must show a visible indicator whenever it could have diverged from the last
exported file. The two must never silently disagree.

## Formats are versioned and shared

Each format has a written spec in `docs/formats/` and a version tag baked into
the file itself (`schema: drawbridge-outcomes/1`, `schema: drawbridge-items/1`).

- Round-trip fidelity is release-blocking: unknown keys and comments survive a
  parse/serialize cycle. Data loss on import/export is a bug, not a limitation.
- Structural change is handled by writing a v2 spec plus a migration, never by
  mutating the meaning of v1 fields.
- IDs are immutable after creation. Display numbering derives from order. Never
  renumber IDs; downstream references (a reviewer's "item MC-014", an outcome
  alignment) depend on stability.

The shared format family is the long-term payoff: because items reference
outcome IDs by the same scheme the Outcome Builder emits, the Item Workbench can
load an outcomes file and validate alignments against real codes. That join is
free as long as IDs stay stable.

## State management

`nanostores` provides per-tool reactive state shared across a tool's islands.
Keep stores small and tool-scoped; there is no global app store. Cross-island
communication within a tool goes through its store, never through props drilled
across island boundaries (islands can't share a component tree anyway).

## Styling

Tailwind v4 via the Vite plugin. Design tokens (color, type scale, spacing) are
defined once in `src/styles/global.css` and consumed everywhere. The component
kit in `src/components/ui/` is the only place raw Tailwind utility soup should
accumulate; feature components compose those primitives.

## What is NOT here, on purpose

No git library, no LightningFS, no CORS proxy, no File System Access API, no
service worker, no auth, no analytics SDK, no font CDN. Every one of these was
present in a prior iteration and every one is absent by design. If a task seems
to need one, that is a signal to re-read the decision record, not to add it.

## Testing strategy

- **Round-trip tests** (release gates): every fixture file parses and re-serializes
  to identical content. Run against everything in `fixtures/`.
- **Validation tests:** known-bad inputs produce the expected flags, and — this
  matters — still parse into a usable draft model. Loose validation means invalid
  never means unopenable.
- **Domain logic unit tests:** ID generation, alignment resolution, diffing.

UI is tested manually during prototyping. Component/e2e tests come later and are
not a v1 gate.
