# Drawbridge

Free, private tools for assessment work. No login, no fee, no tracking — everything stays on your device.

Drawbridge is a collection of small, single-purpose utilities for people who work with rubrics, outcomes, and other assessment data. Each tool runs entirely in your browser. There is no server, no analytics, and no persistence: once the site is loaded, it works offline as an installable PWA.

## Tools

The homepage is the tool directory. Tools are grouped by how finished they are:

- **Rubric → Canvas CSV** — Convert a Word rubric table into a Canvas import CSV. _Experimental._
- **Outcome Mapper** — Map program, course, and assessment outcomes and export the alignment table. _Under development._

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

## Deployment (Netlify)

`netlify.toml` is preconfigured (`bun run build`, publish `dist/`). Connect the repo in Netlify and deploy — no environment variables needed.

## Structure

```text
src/
├── layouts/
│   └── DrawbridgeLayout.astro     # shared site shell
├── lib/
│   ├── parse/                     # file/text parsers
│   ├── rubric/                    # rubric model, points, Canvas CSV
│   └── tools/
│       ├── registry.ts            # tool list + status metadata
│       └── outcome-mapper/
├── pages/
│   ├── index.astro                # tool directory
│   ├── about.astro
│   ├── privacy.astro
│   ├── tools/
│   │   ├── rubric-csv/
│   │   └── outcome-mapper/
│   └── guides/
│       ├── index.astro
│       ├── rubric-csv/
│       └── outcome-mapper/
├── scripts/
│   ├── app.ts                     # rubric-csv controller
│   └── tools/outcome-mapper/
└── components/
    ├── drawbridge/                # site-wide components
    └── starwind/                  # Starwind UI components
```

## Adding a tool

1. Add an entry to `src/lib/tools/registry.ts` with its title, description, icon, and status.
2. Add the tool page under `src/pages/tools/<slug>/`.
3. Add the guide page under `src/pages/guides/<slug>/`.

The directory, status badges, and guides index are all derived from the registry, so no other file needs editing.
