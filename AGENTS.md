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
│   ├── parse/                     # file/text parsers
│   ├── rubric/                    # rubric model, points, Canvas CSV
│   └── tools/
│       ├── registry.ts            # tool list + status metadata
│       └── outcome-mapper/
├── pages/
│   ├── index.astro                # tool directory (home)
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
    ├── drawbridge/                # site-wide components (Header, Footer)
    └── starwind/                  # Starwind UI components
```

## Tool conventions

- Each tool is a self-contained route under `src/pages/tools/[tool-name]/`.
- Tool logic belongs in `src/lib/tools/[tool-name]/` (or `src/lib/rubric/` and
  `src/lib/parse/` for shared rubric parsing).
- Client controllers belong in `src/scripts/` — `src/scripts/app.ts` for
  rubric-csv, `src/scripts/tools/[tool-name]/app.ts` for newer tools.
- Every tool page uses `DrawbridgeLayout` and displays the "100% local" privacy badge.
- Guides follow the two-part pattern: `quick-start` and `reference`.

### The tool registry

`src/lib/tools/registry.ts` is the single source of truth for the tool list.
The homepage directory, the guides index, and the status badges on tool and
guide pages all read from it — adding a tool to the registry is enough to make
it appear on the homepage.

Every entry carries a `status`:

| Status              | Meaning                                                             |
| ------------------- | ------------------------------------------------------------------- |
| `stable`            | Confirmed working. Any issues are bugs that need to be fixed.       |
| `experimental`      | Should do what we want it to do, but use with caution.              |
| `under-development` | Somewhat functional, but probably broken in some way or incomplete. |
| `planned`           | An idea for a tool. Nothing is functional yet.                      |

Planned tools have no `href` or `guideHref`, and render as non-clickable
placeholder cards.

The registry imports SVG icons as Astro components, so it must only be
imported from `.astro` files. Importing it from a client script under
`src/scripts/` would degrade the icons to plain asset metadata.

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
