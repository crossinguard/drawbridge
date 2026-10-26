# Drawbridge

Free, private tools for assessment work. No login, no fee, no tracking — everything stays on your device.

Drawbridge is a collection of small, single-purpose utilities for people who work with rubrics, outcomes, and other assessment data. Each tool runs entirely in your browser. There is no server, no analytics, and no persistence: once the site is loaded, it works offline as an installable PWA.

## Tools

The homepage is the tool directory. Tools are grouped by how finished they are:

- **Rubric → Canvas CSV** — Convert a Word rubric table into a Canvas import CSV. _Experimental._
- **Outcome Mapper** — Map program, course, and assessment outcomes and export the alignment table. _Under development._
- **Canvas Course Export Viewer** — Open a Canvas course export and browse everything in it, with a QA report. _Experimental._
- **Canvas Assessment Review** — Turn a Canvas course export into a plain-text review of every graded item. _Under development._

### Statuses

| Status                | Meaning                                                             |
| --------------------- | ------------------------------------------------------------------- |
| **Stable**            | Confirmed working. Any issues are bugs that need to be fixed.       |
| **Experimental**      | Should do what we want it to do, but use with caution.              |
| **Under development** | Somewhat functional, but probably broken in some way or incomplete. |
| **Planned**           | An idea for a tool. Nothing is functional yet.                      |

## Privacy

- No server, no API, no analytics, no cookies.
- State lives only in memory and is lost when you close the tab.
- A production Content Security Policy (`default-src 'self'`) prevents external requests.
- The PWA service worker serves everything locally after the first load.

## Development

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
bun run check           # astro check — types
bun run check:isolation # the app must not depend on the reference material
bun run format          # prettier --write . (also sorts Tailwind classes)
bun run test            # integration test for the .docx import path
bun run test:canvas     # parser checks for the Canvas course export viewer
bun run verify          # CSV serializer/parser checks
bun run test:e2e        # browser smoke test (needs `bun run build` first)
```

### Reference material

`reference/` holds the real course exports the tools were built against, and
the requirements they were read against. It is git-ignored and nothing in
`src/` depends on it: deleting the folder changes nothing about how the app
builds or runs. `bun run check:isolation` enforces that.

`bun run test:canvas` uses the sample export in `reference/canvas/course/`. The
test skips itself when the sample is not there, so it never breaks a clean
checkout.

## Deployment (Netlify)

`netlify.toml` is preconfigured (`bun run build`, publish `dist/`). Connect the repo in Netlify and deploy — no environment variables needed.

## Structure

```text
reference/                            # git-ignored input material, not part of the app
├── canvas/course/                    # real .imscc course exports
├── canvas/rubric/                    # a Canvas rubric export, for comparison
└── canvas-assessment-review-reference.md
src/
├── layouts/
│   └── DrawbridgeLayout.astro     # shared site shell
├── content.config.ts              # the `guides` content collection
├── lib/
│   ├── copy.ts                    # shared site copy
│   ├── nav.ts                     # primary navigation links
│   ├── utils.ts                   # `cn()` class-name helper
│   ├── canvas/                    # the shared Canvas cartridge layer
│   ├── parse/                     # file/text parsers
│   ├── rubric/                    # rubric model, points, Canvas CSV
│   └── tools/
│       ├── registry.ts            # tool list + status metadata
│       ├── steps.ts               # the shared ToolStep contract
│       ├── rubric-csv/
│       ├── outcome-mapper/
│       └── imscc-viewer/          # Canvas course export viewer
├── content/guides/                # guide MDX (reference + quick-start)
├── pages/
│   ├── index.astro                # tool directory
│   ├── about.astro
│   ├── privacy.astro
│   ├── tools/
│   │   ├── rubric-csv/
│   │   ├── outcome-mapper/
│   │   └── imscc-viewer/
│   └── guides/
│       ├── index.astro
│       └── [tool]/index.astro     # one route for every guide
├── scripts/
│   ├── app.ts                     # rubric-csv controller
│   ├── lib/                       # shared client runtime
│   │   ├── alerts.ts              # Starwind alerts from client code
│   │   ├── dom.ts                 # byId, esc, icon, slugify
│   │   ├── io.ts                  # download, copyToClipboard
│   │   └── stepper.ts             # shared step navigation
│   └── tools/
│       ├── outcome-mapper/
│       └── imscc-viewer/
└── components/
    ├── drawbridge/                # site-wide components
    │   └── tools/                 # tool-page components
    └── starwind/                  # Starwind UI components
```

## Adding a tool

1. Add an entry to `src/lib/tools/registry.ts` with its title, description, heading, icon, and status.
2. Add `src/lib/tools/<slug>/steps.ts` describing the tool's steps.
3. Add the tool's logic under `src/lib/tools/<slug>/`.
4. Add the tool page at `src/pages/tools/<slug>/index.astro`, built from `ToolLayout` and `ToolStep`.
5. Add the tool's controller at `src/scripts/tools/<slug>/app.ts`.
6. Add guide MDX at `src/content/guides/<slug>.mdx` (reference) and `src/content/guides/<slug>-quick-start.mdx` (quick-start).

The directory, status badges, and guides index are all derived from the registry and the guides collection, so no other file needs editing.

See `AGENTS.md` for the conventions behind these files.
