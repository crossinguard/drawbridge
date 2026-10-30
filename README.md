# Drawbridge

Free, private tools for exploring course content and reviewing transcripts. No login, no fee, no tracking — imported files stay on your device.

Drawbridge is a collection of small, focused tools that can share one opened source. Each tool runs entirely in the browser. The current rebuild begins with Canvas course exports and establishes the source, session, UI, and guide patterns that later tools will reuse.

## Current tools

**Course Explorer** opens a Canvas `.imscc` export and provides:

- A high-level count of the course's modules, pages, assignments, quizzes, discussions, files, and rubrics
- A searchable module outline
- A unique-content inventory with type filters
- Readable item details and sanitised course content
- Internal Canvas object navigation and accessible equation text
- Images loaded from the cartridge, never from external hosts
- Safe outbound links for embedded content without loading third-party frames
- A plain-language guide available directly from the tool

**Rubric Explorer** uses the same opened course and provides:

- Rubric criteria, ratings, long descriptions, and points
- Unique linked activities with grading/reference roles and Course Explorer handoffs
- Exact-content copy groups and same-name/different-content groups
- Search, relationship filters, and criterion-by-criterion two-rubric comparison
- A plain-language guide available directly from the tool

**Transcript to Text** independently opens Microsoft Teams and other WebVTT `.vtt` files and provides:

- Cue review with transcript search and people filters that do not limit the output
- Global speaker-name corrections and configurable speaker/timestamp formatting
- Editable plaintext with copy and `.txt` download actions
- A plain-language guide available directly from the tool

The Canvas tools do not produce QA findings, audit reports, or exports. Transcript to Text exports only the reviewed plaintext.

## Privacy and sessions

- No server, API, analytics, cookies, or accounts
- Imported files, speaker corrections, and transcript edits live only in memory
- Astro client-side navigation keeps the opened course when moving between Canvas tools and guides, and keeps transcript work when visiting its guide
- Refreshing, opening a new tab, closing the tab, or choosing the tool's clear or close action forgets the imported data and unsaved work
- A restrictive Content Security Policy prevents third-party connections
- The PWA caches the Drawbridge application for offline use, not imported files or work
- Application updates wait for user confirmation so they cannot unexpectedly reload an open course

## Development

Requires Node.js 22 and Bun.

```bash
bun install
bun dev
```

Build for production:

```bash
bun run build
```

### Checks

```bash
bun run check           # Astro and TypeScript checks
bun run check:isolation # the app must not depend on private reference material
bun run format          # Prettier, including Tailwind class ordering
bun run test:canvas     # synthetic parser/model tests plus optional private regressions
bun run test:transcript # synthetic WebVTT parser, selector, and plaintext tests
bun run test:e2e        # browser smoke test; run bun run build first
```

The Canvas tests always generate a synthetic cartridge, so a clean checkout needs no course data. When files exist under `reference/canvas/course/`, selected real-export regressions run as well.

### Theme customization

See [Customizing the Drawbridge theme](docs/customizing-the-theme.md) for the palette scales, light/dark semantic tokens, PWA colors, accessibility checks, and browser-test expectations.

### Reference material

`reference/` holds real course exports used only as development input. It is git-ignored, and nothing in `src/` or `public/` may depend on it. Real course content must never be bundled, quoted in a guide, or committed. `bun run check:isolation` enforces the application boundary.

## Project structure

```text
src/
├── layouts/
│   └── DrawbridgeLayout.astro       # shared site shell and Astro ClientRouter
├── content.config.ts                # one-guide-per-tool content collection
├── lib/
│   ├── canvas/                      # cartridge parsing, normalized model, selectors
│   │   ├── model.ts                 # unique entities and all module placements
│   │   └── selectors/               # shared summaries, relationships, comparisons
│   ├── workspace/                   # source-agnostic in-memory session
│   └── tools/registry.ts            # metadata for working tools only
├── content/guides/                  # one plain-language MDX guide per tool
├── pages/
│   ├── tools/course-explorer/
│   ├── tools/rubric-explorer/
│   └── guides/                      # guide index and dynamic guide route
├── scripts/
│   ├── canvas/                      # shared source and content controllers
│   ├── lib/                         # DOM, lifecycle, and PWA helpers
│   └── tools/                       # thin tool-specific browser controllers
├── styles/
│   ├── starwind.css                 # Tailwind entry and light/dark Starwind tokens
│   ├── base/                        # global defaults and typography
│   └── components/                  # shared CSS component patterns
└── components/
    ├── drawbridge/
    │   └── patterns/                # ToolShell, SourcePicker, WorkspaceBar…
    ├── tools/                       # domain-specific tool components, as needed
    └── starwind/                    # vendored Starwind UI primitives
```

## Adding a tool

1. Register the working tool in `src/lib/tools/registry.ts` with its source label and guide URL.
2. Add pure tool logic under `src/lib/tools/<slug>/`, or add reusable Canvas selectors under `src/lib/canvas/selectors/`.
3. Build the page from `ToolShell`; do not introduce a universal stepper.
4. Compose Starwind primitives and Drawbridge patterns before creating tool-specific UI.
5. Add a thin controller under `src/scripts/tools/<slug>/` and mount it with `mountToolController()`.
6. Add exactly one plain-language guide at `src/content/guides/<slug>.mdx`.
7. Add synthetic parser/selector fixtures and browser coverage, including mobile and session handoffs.

See `AGENTS.md` for the detailed architecture, styling, Canvas, and privacy conventions.

## Deployment

`netlify.toml` is configured to run `bun run build` and publish `dist/`. No environment variables are required.
