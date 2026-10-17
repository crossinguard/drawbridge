# Drawbridge

Free, private tools for assessment work. No login, no fee, no tracking — everything stays on your device.

Drawbridge is a collection of small, single-purpose utilities for people who work with rubrics, outcomes, and other assessment data. Each tool runs entirely in your browser. There is no server, no analytics, and no persistence: once the site is loaded, it works offline as an installable PWA.

## Tools

- **[Rubric → Canvas CSV](/tools/rubric-csv)** — Convert a Word rubric table into a Canvas import CSV.
- **[Outcome Mapper](/tools/outcome-mapper)** — Map program, course, and assessment outcomes and export the alignment table.

## Privacy

- No server, no API, no analytics, no cookies, no localStorage.
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
│   ├── shared/                    # cross-tool helpers
│   └── tools/                     # one folder per tool
│       ├── rubric-csv/
│       └── outcome-mapper/
├── pages/
│   ├── index.astro                # tool directory
│   ├── about.astro
│   ├── privacy.astro
│   ├── tools/
│   │   ├── index.astro
│   │   ├── rubric-csv/
│   │   └── outcome-mapper/
│   └── guides/
│       ├── index.astro
│       ├── rubric-csv/
│       └── outcome-mapper/
└── components/
    ├── drawbridge/                # site-wide components
    └── starwind/                  # UI components
```
