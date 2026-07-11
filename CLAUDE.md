# CLAUDE.md — Drawbridge

Guidance for AI-assisted coding sessions (Claude Code, Codex, or any agent).
Read `docs/00-decision-record.md` and `docs/01-architecture.md` before making
changes. Those are the build contract; this file is how to behave against it.

## What this project is

One static Astro site of browser-based assessment tools. Each tool is a route.
Everything stays in plain, portable files that never leave the user's machine.
First tool shipping: the Outcome Builder (`/outcomes`). See `docs/02-roadmap.md`.

## Commands

Node 22 (`.nvmrc`). Package manager: pnpm, pinned via Corepack (`packageManager`
field in package.json) — run `corepack enable` once on a new machine.

- `pnpm dev` — Astro dev server.
- `pnpm build` — static build to `dist/`.
- `pnpm preview` — serve the built site.
- `pnpm test` — Vitest, single run (CI-style).
- `pnpm test:watch` — Vitest watch mode.
- `pnpm check` — `astro check` (types + Astro diagnostics).

Run one test file or case (no vitest.config; defaults apply):

- `pnpm vitest run tests/outcomes.test.ts`
- `pnpm vitest run -t "flags a dangling mapping but still parses"` (name filter)

Before considering a change done: `pnpm test && pnpm check`.

## Working style

- The developer (Brett) is in the driver's seat. Act as a senior-developer
  advisor: explain reasoning, surface tradeoffs, catch errors. Do not generate
  large features unprompted.
- Prefer small, reviewable changes. One concern per commit.
- When uncertain about a design decision, present options with a recommendation;
  don't silently pick.
- If a request conflicts with the hard rules below, or expands v1 scope, stop and
  raise it rather than complying. Scope drift killed four prior iterations —
  flagging it is a core job, not a nuisance.

## Hard rules (never violate)

1. **No network calls from the app after page load.** No analytics, telemetry,
   CDN fonts, or external APIs. All assets self-hosted and bundled. The Netlify
   CSP sets `connect-src 'none'` — code that needs the network will break by
   design, and that is correct.
2. **No backend.** Static output only. Nothing may require server-side execution
   at runtime. No Netlify functions.
3. **No data collection of any kind.** No cookies, no fingerprinting, no error
   reporting services.
4. **User content never leaves the browser.** localStorage/IndexedDB and
   user-initiated file download/upload are the only persistence.
5. **Deterministic behavior.** No AI/LLM-based parsing or content processing
   inside the tools. AI hands off through files, from outside.
6. **Files are canonical.** IndexedDB is crash protection and snapshot history,
   not the record. Never let stored state and the last exported file silently
   diverge — show a visible indicator.

## Architecture rules

- All domain logic lives in `src/lib/<tool>/` as framework-free pure TypeScript.
  No Svelte imports, no DOM access, no Astro APIs. This layer must stay portable
  to future tools, a CLI, or a desktop wrapper.
- Components (`src/components/`) touch files only through the domain layer. No
  component calls `YAML.parse` or remark directly.
- Formats are versioned (`drawbridge-outcomes/1`, `drawbridge-items/1`) with a
  written spec in `docs/formats/`. Round-trip fidelity — unknown keys and
  comments preserved — is release-blocking.
- IDs are immutable after creation. Display numbering derives from order. Never
  renumber IDs; downstream references depend on them.
- nanostores for per-tool state; no global app store. Cross-island communication
  goes through the tool's store.

## Validation philosophy

Loose by default. Draft states are always saveable and exportable. Validation
flags issues (error/warn/info) but never blocks. Invalid input must still parse
into a usable draft model — invalid never means unopenable.

## Stack

- Astro (static output), Svelte 5 islands, TypeScript everywhere.
- Tailwind v4 via the Vite plugin; shared component kit in `src/components/ui/`.
- `yaml` (eemeli) for YAML; unified/remark for markdown; rehype-sanitize on any
  rendered user content.
- Vitest. Round-trip tests against `fixtures/` are release gates.
- Netlify, static, no functions.

## Current state (mid-Phase 1)

What actually exists in code today (docs describe much that isn't built yet):

- **Built & tested:** the outcomes domain layer —
  `src/lib/outcomes/{types,parse,validate}.ts` — plus `tests/outcomes.test.ts`
  and `fixtures/`.
- **Astro shell:** `src/layouts/Base.astro`, `src/styles/global.css`, and four
  static pages (`index`, `outcomes/`, `items/`, `conventions/`). The `/outcomes`
  and `/items` pages are placeholders — no editor yet.
- **Not built (empty dirs / installed-but-unused deps):** every `.svelte` island
  (there are zero `.svelte` files), nanostores stores, IndexedDB
  (`src/lib/storage/`), the items domain layer (`src/lib/items/`), and all
  remark/rehype markdown processing. Treat `docs/01-architecture.md` as the
  target, not a description of what's there.

Sequence in `docs/02-roadmap.md`: Phase 1 = Outcome Builder UI (current work).

## Repo map

- `src/lib/<tool>/` — framework-free domain logic (the only real code today is
  `outcomes/`). Also `src/components/`, `src/pages/`, `src/layouts/`,
  `src/styles/`.
- Path aliases (`tsconfig.json`): `$lib/*` → `src/lib/*`, `$components/*` →
  `src/components/*`.
- `fixtures/` — round-trip test inputs. `docs/` — decision record, architecture,
  roadmap, and `docs/formats/` specs.

Load-bearing parse pattern (`src/lib/outcomes/parse.ts`): the eemeli `yaml`
`Document` (via `readDoc`/`writeDoc`) is the serialization source of truth and
preserves comments + unknown keys; `toModel` yields a lossy typed view for the
UI that is **never** serialized. Mutations edit the Document, not the model.

## Testing

- Every fixture file must parse and re-serialize to identical content.
- Known-bad inputs produce expected flags AND still open as a draft.
- Run `pnpm test` and `pnpm check` before considering a change done.

## When in doubt

Re-read the decision record. If a task seems to need git-in-browser, a backend, a
CORS proxy, the File System Access API, or an LLM call, that is a signal you have
drifted from the design, not a reason to add the dependency.
