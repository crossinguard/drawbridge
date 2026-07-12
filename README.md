# Drawbridge

**A private, offline-first workspace for assessment content.** Build and manage
course outcomes, assessment items, and the documents around them — all in plain,
portable files that never leave your machine.

Drawbridge is a single static website. There is no account, no backend, and no
network traffic once the page has loaded. Your content lives in files you hold and
in your own browser's storage. Sharing happens only when *you* export a file and
hand it over.

---

## What's here today

**Outcome Builder** (`/outcomes`) — shipped. Author a course's outcome
architecture — course outcomes, evidence outcomes, and learning objectives, with
the mappings between them — in one portable YAML file.

- Import an existing file, start a new one, or begin from a template.
- Add, edit, delete, and **reorder** outcomes; display numbering (CO 1, EO 2.1,
  LO 3) follows the order automatically while the underlying IDs stay stable.
- Map each learning objective to its course outcome(s); scope evidence outcomes to
  the objectives that support them.
- **Review mode** shows the whole course as a relationship tree — objectives nested
  under the outcomes and evidence they belong to.
- **Loose validation** flags gaps (unmapped objectives, missing text) without ever
  blocking you; click a flag to jump to what it's about.
- **Crash recovery** — your work is mirrored to the browser's local storage and
  restored on reload, with a clear indicator whenever it differs from the last
  file you exported.

Sample full-course files for **Algebra I, Geometry, and Algebra II** (built from
the Common Core math standards) live in [`fixtures/`](fixtures/) — import any of
them from the Outcome Builder to see a complete course.

**Item Workbench** (`/items`) — planned. Import AI-drafted assessment items,
review and refine them, align them to your outcomes, and export to Word for
reviewers or QTI for Canvas. See the [roadmap](docs/02-roadmap.md).

**Conventions** (`/conventions`) — the documented file formats and copy-ready AI
prompts that let any assistant produce content Drawbridge can import cleanly.

## Why it exists

The real production pipeline is a relay of handoffs:

```
AI design spec → AI item writer (FLO / ChatGPT / Codex) → Drawbridge
   → review & refine (solo or AI-assisted) → Word to human reviewers
   → rework feedback → QTI to Canvas
```

Drawbridge is the stable hub in the middle — not an item bank, an LMS, or a QTI
generator on its own, but the private workspace where content lives between those
handoffs, in files that outlive any single tool or employer.

## Guarantees

These are architectural, not promises:

1. **Privacy by design.** Static site, no backend, no analytics, no network calls
   after load. Content *cannot* leave the browser because there is nowhere for it
   to go — enforced by a `connect-src 'none'` Content-Security-Policy.
2. **Files are canonical.** Human-readable YAML and Markdown are the record.
   Browser storage is crash protection, not the source of truth — and the UI tells
   you when the two could differ.
3. **Deterministic behavior.** Rule-based parsing and validation. No AI runs inside
   the tool; AI lives next door and hands off through files.
4. **Loose validation.** Draft states are always valid, saveable, and exportable.

## Getting started

Requires **Node 22** (see [`.nvmrc`](.nvmrc)) and **pnpm** via Corepack.

```bash
corepack enable          # once per machine, enables the pinned pnpm
pnpm install
pnpm dev                 # dev server at http://localhost:4321
```

Other commands:

```bash
pnpm build               # static output to dist/
pnpm preview             # serve the built site locally
pnpm test                # vitest (round-trip + validation suites)
pnpm check               # astro check (types + diagnostics)
```

## Using it on another machine

Node and pnpm are only needed to *build* Drawbridge, never to *use* it. Build once
and host the `dist/` folder anywhere static — then it's just a browser tab. Your
content stays private either way: hosting exposes the (empty) app, never your
files.

**Deploy:** push to a Git host and connect the repo to Netlify. Configuration —
build command, publish directory, and the security headers — is in
[`netlify.toml`](netlify.toml). No environment variables, functions, or secrets.
(A manual `dist/` drag-and-drop deploy works too, but git-connected deploys apply
the CSP headers reliably.)

## Project structure

```
src/
  pages/          one route per tool (outcomes/, items/, conventions/) + landing
  layouts/        shared page shell
  components/
    ui/           shared Svelte component kit (Button, Badge, Card, …)
    outcomes/     Outcome Builder islands (editor, list, panel, review, flags)
    starwind/     Starwind UI primitives
  stores/         nanostores per-tool state
  lib/            THE IMPORTANT PART — framework-free domain logic:
    outcomes/       parse/serialize, validate, mutate, numbering, grouping
    storage/        IndexedDB crash-recovery
  styles/         global.css (Tailwind entry + design tokens)
fixtures/         sample course files (used by tests and as real examples)
tests/            vitest suites
docs/             design record, architecture, roadmap, and format specs
```

The rule that holds the project together: **everything in `src/lib/` is pure
TypeScript** — no framework, no DOM (except the storage layer's IndexedDB), no Astro
APIs. Components read and write files only through that layer. It keeps the file
formats testable and portable to a future CLI or desktop build.

## File formats

Formats are versioned and specified in [`docs/formats/`](docs/formats/):

- `drawbridge-outcomes/1` — the outcomes format
  ([spec](docs/formats/outcomes-format.md)). Round-trip fidelity — comments and
  unknown keys survive a parse/serialize cycle — is a release gate.

## Documentation

In reading order:

- [`docs/00-decision-record.md`](docs/00-decision-record.md) — what Drawbridge is
  and why. Read first.
- [`docs/01-architecture.md`](docs/01-architecture.md) — how the code is organized
  and the invariants that hold.
- [`docs/02-roadmap.md`](docs/02-roadmap.md) — build phases and what's deferred.
- [`docs/03-handoffs.md`](docs/03-handoffs.md) — the snapshot and export model.
- [`docs/04-dev-environment.md`](docs/04-dev-environment.md) — build and test setup.
- [`docs/05-dependencies.md`](docs/05-dependencies.md) — the dependency budget.
- [`CLAUDE.md`](CLAUDE.md) — guidance for AI-assisted coding sessions.

## Tech

Astro (static output) · Svelte 5 islands · TypeScript · Tailwind CSS v4 · Starwind
UI · `yaml` (eemeli) · nanostores · Vitest · Netlify.

## License

TBD before any public release. Leaning AGPLv3 — not yet decided; do not assume.
