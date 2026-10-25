## Development

When starting the dev server, use background mode:

```bash
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

### Checks

```bash
bun run check        # astro check — types
bun run format       # prettier --write .
bun run build        # astro build
bun run test         # integration test for the .docx import path
bun run verify       # CSV serializer/parser checks
bun run test:e2e     # browser smoke test — builds nothing, run `bun run build` first
```

Prettier formats everything, including Tailwind class order. It is configured in
`.prettierrc` with `prettier-plugin-tailwindcss` pointing at
`src/styles/starwind.css` (required for Tailwind v4).

## Project structure

```text
src/
├── layouts/
│   └── DrawbridgeLayout.astro     # shared site shell (nav, footer, CSP, theme)
├── content.config.ts              # the `guides` content collection
├── lib/
│   ├── copy.ts                    # shared site copy
│   ├── nav.ts                     # primary navigation links
│   ├── utils.ts                   # `cn()` class-name helper
│   ├── parse/                     # file/text parsers
│   ├── rubric/                    # rubric model, points, Canvas CSV
│   └── tools/
│       ├── registry.ts            # tool list + status metadata
│       ├── steps.ts               # the shared ToolStep contract
│       ├── rubric-csv/
│       └── outcome-mapper/
├── content/guides/                # guide MDX (reference + quick-start)
├── pages/
│   ├── index.astro                # tool directory (home)
│   ├── about.astro
│   ├── privacy.astro
│   ├── tools/
│   │   ├── rubric-csv/
│   │   └── outcome-mapper/
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
│   └── tools/outcome-mapper/
└── components/
    ├── drawbridge/                # site-wide components (Header, Footer)
    │   └── tools/                 # tool-page components (ToolLayout, ToolStep…)
    └── starwind/                  # Starwind UI components
```

## Tool conventions

- Each tool is a self-contained route under `src/pages/tools/[tool-name]/`.
- Tool logic belongs in `src/lib/tools/[tool-name]/` (or `src/lib/rubric/` and
  `src/lib/parse/` for shared rubric parsing).
- Client controllers belong in `src/scripts/` — `src/scripts/app.ts` for
  rubric-csv, `src/scripts/tools/[tool-name]/app.ts` for newer tools.
- Every tool page is built from `ToolLayout` and displays the "100% local"
  privacy badge.
- Guides follow the two-part pattern: `quick-start` and `reference`.

### Tool pages

A tool page is assembled from shared components in
`src/components/drawbridge/tools/`. It never repeats the page shell:

```astro
<ToolLayout tool={tool} steps={steps}>
  <QuickStart slot="quick-start">
    <QuickStartContent />
  </QuickStart>

  <ToolStep step={steps[0]} title="Import rubric" hidden={false}>
    <Fragment slot="description">Supporting copy for the card heading.</Fragment>
    <!-- step content -->
    <LocalOnlyNotice slot="footer">…</LocalOnlyNotice>
  </ToolStep>

  <ToolStep step={steps[1]} title="Review & edit">
    …<Card slot="extra"><!-- an extra card in this step --></Card>
  </ToolStep>

  <ToolStep step={steps[2]} title="Export">
    <CodePreview id="csv-preview" />
    <StepNav slot="footer" />
  </ToolStep>

  <script>
    import "@/scripts/app";
  </script>
</ToolLayout>
```

| Component         | Purpose                                                    |
| ----------------- | ---------------------------------------------------------- |
| `ToolLayout`      | Page shell: header, quick-start slot, stepper, step slots. |
| `ToolHeader`      | Heading, subtitle, status line, guide link, privacy badge. |
| `StepIndicator`   | The numbered stepper.                                      |
| `ToolStep`        | One step's `<section>` and card scaffolding.               |
| `StepNav`         | Back / continue buttons for a step's card footer.          |
| `LocalOnlyNotice` | The "Nothing leaves your browser" alert.                   |
| `LocalBadge`      | The "100% local" badge.                                    |
| `CodePreview`     | The `<pre>` used for generated CSV.                        |
| `StatRow`         | A row of label + value badges.                             |

### The step contract

Each tool declares its steps in `src/lib/tools/[tool-name]/steps.ts`:

```ts
import type { ToolStep } from "@/lib/tools/steps";

export const steps: ToolStep[] = [
  { id: "import", label: "Import" },
  { id: "review", label: "Review & edit" },
  { id: "export", label: "Export CSV" },
];
```

`StepIndicator` renders one `[data-step]` element per step, each carrying the
id of the section it controls. The shared stepper in
`src/scripts/lib/stepper.ts` discovers those elements from the DOM, so adding
or renaming a step needs no changes to the runtime.

Controllers opt into the behaviour that differs per tool:

```ts
const stepper = createStepper({
  canReach: (index) => index === 0 || state.rubric.criteria.length > 0,
  canAdvance: (target) => {
    /* return false to block the transition and explain why */
  },
  onEnter: (index) => {
    /* e.g. render the export preview */
  },
});
```

`src/lib/tools/steps.ts` is imported by both pages and controllers, so it must
stay free of Astro-only imports.

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
`src/scripts/` would degrade the icons to plain asset metadata. Anything a
controller needs lives in a separate, icon-free module.

## Guides

Guides live in the `guides` content collection (`src/content.config.ts`) as MDX
under `src/content/guides/`. Each tool contributes two entries, distinguished
by their `kind` frontmatter:

| Kind          | Where it renders                                           |
| ------------- | ---------------------------------------------------------- |
| `reference`   | `/guides/<tool>` via `src/pages/guides/[tool]/index.astro` |
| `quick-start` | Inside the tool page, in the quick-start collapsible.      |

Both entries carry `title`, `description` and `toolSlug`. The guide route is
generated from the collection, so adding a guide needs no route changes.

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
