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
│       ├── outcome-mapper/
│       └── imscc-viewer/          # Canvas course export viewer
├── content/guides/                # guide MDX (reference + quick-start)
├── pages/
│   ├── index.astro                # tool directory (home)
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
    ├── drawbridge/                # site-wide components (Header, Footer, PageHeader)
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

## The Canvas Common Cartridge

The Canvas Course Export Viewer reads an IMS Common Cartridge. The format is
not documented anywhere obvious, and it has sharp edges. What follows was
worked out from a real export and is the reference for
`src/lib/tools/imscc-viewer/`.

### The join

A module item does not point at content directly. It points at an identifier,
and the manifest says what that identifier means:

```text
course_settings/module_meta.xml   module item ──▶ identifier
imsmanifest.xml                   <item identifierref> ──▶ resource
imsmanifest.xml                   <resource> ──▶ the file(s) holding the content
```

Do not follow the module's own `<identifierref>`. For external links Canvas
writes the item's own identifier there instead of the resource identifier, so
following it leaves every external link unresolved. The manifest's
organization is the reliable path.

### What is where

| Path                       | Holds                                           |
| -------------------------- | ----------------------------------------------- |
| `imsmanifest.xml`          | The resource list and the module organization   |
| `course_settings/`         | Course settings, modules, groups, late policy   |
| `wiki_content/*.html`      | One file per page                               |
| `g<id>/`                   | One folder per assignment, quiz, or discussion  |
| `g<id>.xml`                | `webLink`, `topicMeta`, and LTI sidecars        |
| `non_cc_assessments/*.qti` | The questions for quizzes using the bank layout |
| `web_resources/`           | The files the course owns                       |

A quiz's settings are in `g<id>/assessment_meta.xml`; its questions are in
`non_cc_assessments/<id>.xml.qti`, or beside the settings. A discussion's
settings are in a separate `topicMeta` file, named by the resource's
`<dependency>`.

### Sharp edges

- **The namespace declaration can be broken.** Some exports write `xmlns:xsi`
  with two URIs separated by a space. No XML parser accepts that, and browsers
  refuse the whole document. `src/lib/tools/imscc-viewer/xml.ts` repairs it.
- **Some resources have no `href`.** Their title has to come from the file
  itself, not from the manifest.
- **The document element often is the element being looked for.** A quiz's
  settings live in `<quiz>`, not in a child of it. `childElements` matches the
  document root; `allElements` matches it too.
- **The file listing is not a reliable index.** `files_meta.xml` only records
  the files Canvas considers hidden, not all of them.

### Content handling

Course content is not trusted. `src/lib/tools/imscc-viewer/content.ts` rebuilds
it against an allowlist of tags and attributes — no scripts, no event handlers,
no inline styles, no `javascript:` URLs — and rewrites Canvas' placeholders:

| Placeholder                   | Becomes                               |
| ----------------------------- | ------------------------------------- |
| `$WIKI_REFERENCE$/pages/<id>` | A jump to that page inside the viewer |
| `$IMS-CC-FILEBASE$/<path>`    | A file inside the cartridge           |
| `$CANVAS_COURSE_REFERENCE$/…` | A jump to the module outline          |

Images hosted outside the cartridge are dropped rather than loaded, because
loading them would send a request to a third party.

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
