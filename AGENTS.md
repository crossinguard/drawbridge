## Development

When starting the dev server, use background mode:

```bash
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Project structure

```text
src/
├── layouts/
│   └── DrawbridgeLayout.astro     # shared site shell (nav, footer, CSP, theme)
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
├── scripts/
│   └── tools/                     # client-side controllers
└── components/
    ├── drawbridge/                # site-wide components
    └── starwind/                  # UI components
```

## Tool conventions

- Each tool is a self-contained route under `src/pages/tools/[tool-name]/`.
- Tool logic belongs in `src/lib/tools/[tool-name]/`.
- Client controllers belong in `src/scripts/tools/[tool-name]/app.ts`.
- Every tool page uses `DrawbridgeLayout` and displays the "100% local" privacy badge.
- Guides follow the two-part pattern: `quick-start` and `reference`.

## Privacy

- All tools are client-side only. No server, no API, no analytics, no persistence.
- Production CSP: `default-src 'self'` prevents external requests.
- The PWA service worker caches the site for offline use after first load.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)
