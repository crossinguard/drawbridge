## Development

When starting the dev server, use background mode:

```bash
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

### Checks

```bash
bun run check           # astro check — types
bun run check:isolation # the app must not depend on the reference material
bun run format          # prettier --write .
bun run build           # astro build
bun run test            # integration test for the .docx import path
bun run verify          # CSV serializer/parser checks
bun run test:canvas     # parser checks for the Canvas course export viewer
bun run test:e2e        # browser smoke test — builds nothing, run `bun run build` first
```

Prettier formats everything, including Tailwind class order. It is configured in
`.prettierrc` with `prettier-plugin-tailwindcss` pointing at
`src/styles/starwind.css` (required for Tailwind v4).

## The reference material

`reference/` holds the real course exports the tools were built against, and the
requirements they were read against. It is git-ignored, and **nothing in `src/`
or `public/` may depend on it**. Deleting the folder must change nothing about
how the app builds, runs, or tests — `bun run check:isolation` enforces that.

The exports are real courses with real student work in them. They are input for
building the tools, never an output of them: never bundle one into the site,
never quote one in a guide, never commit one.

## Project structure

```text
reference/                            # git-ignored input material, not part of the app
├── canvas/course/                    # real .imscc course exports
├── canvas/rubric/                    # a Canvas rubric export, for comparison
└── canvas-assessment-review-reference.md
src/
├── layouts/
│   └── DrawbridgeLayout.astro     # shared site shell (nav, footer, CSP, theme)
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
│       ├── imscc-viewer/          # Canvas course export viewer
│       └── assessment-review/     # Canvas assessment review
├── content/guides/                # guide MDX (reference + quick-start)
├── pages/
│   ├── index.astro                # tool directory (home)
│   ├── about.astro
│   ├── privacy.astro
│   ├── tools/
│   │   ├── rubric-csv/
│   │   ├── outcome-mapper/
│   │   ├── imscc-viewer/
│   │   └── assessment-review/
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
│       ├── imscc-viewer/
│       └── assessment-review/
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

## The assessment review

`src/lib/tools/assessment-review/` turns a course export into a plain-text
review of every graded item. It is a separate tool from the viewer, but it
reads the same cartridge layer.

### The model

`model.ts` builds one model from the parsed course, and everything else reads
from it — the checks, the screen, and the export. That is what keeps the file
and the screen from disagreeing.

| Type           | What it is                                                          |
| -------------- | ------------------------------------------------------------------- |
| `Assessment`   | One graded item: assignment, quiz, or graded discussion             |
| `RubricReview` | A rubric with the items that use it and the rubrics it duplicates   |
| `GroupReview`  | An assignment group with its items, points, and share of the points |
| `UsageMap`     | Every item in the course, and whether it looks in use or left over  |

### The checks

`checks/` holds one module per family. Every finding carries the two values it
compared, the file each value came from, a suggested priority, and whether a
reviewer has to resolve it.

| Family | Module              | What it compares                                     |
| ------ | ------------------- | ---------------------------------------------------- |
| A      | `checks/scoring.ts` | The three scoring layers: items, assignments, groups |
| B      | `checks/legacy.ts`  | What is in use and what is left over                 |
| C      | `checks/quizzes.ts` | The quizzes: classification, settings, instructions  |
| D      | `checks/rubrics.ts` | The rubrics against the instructions                 |
| E      | `checks/naming.ts`  | Whether the names agree                              |

### The rules

`findings.ts` holds the `ReviewRules` — the institution's defaults for what
to do when the instructions are silent, the list of retired terms, and the list
of words to look at. They apply to every course the tool is pointed at.

### The prep file

`prep-file.ts` writes the plain-text file. It is the tool's primary output,
and it has to stand on its own: whoever reads it cannot open the archive and
cannot ask a follow-up question.

- The fifteen sections are in a **fixed order**, so an assistant can rely on
  finding the module map in section 5 and the assessment details in section 10.
- Every value is written with the file it came from.
- The instructions are written out **in full**. They are never trimmed — a
  requirement that was cut off is a requirement nobody can check.
- The deliberate omissions (question text, answer keys, learner data, the live
  state of the course) are stated in section 14, so nothing looks complete when
  it is not.
- The `[REVIEW REQUIRED: reason]` marker is used for anything a reviewer has
  to resolve, and section 15 collects them all.

A course with a lot of rubrics produces a very large file — PN126 comes to
2.5 MB, most of it rubric text. The export step offers to narrow the file to
the assessments with findings, but the complete file is the default.

### What the review found in the real courses

Both live exports carry things worth finding, which is the point of the tool:

- ENG120 has two **Grammar Review quizzes** whose questions are worth more than
  the quiz: one draws 11 questions worth 1 point each for a quiz worth 10, and
  the other adds an essay worth 25 to a bank draw worth 11 for a quiz worth 25.
- ENG120 has 40 rubrics, of which 12 are attached to anything, and **15 of them
  are identical copies** of _GE Discussion Rubric_.
- ENG120 has **two different rubrics called "ENG120 Week 2 Assignment:
  Punctuation Paragraph"** — one with 3 criteria worth 25 points and one with
  4 worth 30. Canvas' own rubric export merges them, because it groups by
  name.
- PN126 has **15 quizzes with access codes** that the instructions do not
  mention.

## The Canvas Common Cartridge

The Canvas Course Export Viewer and the Canvas Assessment Review both read an
IMS Common Cartridge. The format is not documented anywhere obvious, and it has
sharp edges. What follows was worked out from real exports and is the
reference for `src/lib/canvas/`.

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

| Path                          | Holds                                          |
| ----------------------------- | ---------------------------------------------- |
| `imsmanifest.xml`             | The resource list and the module organization  |
| `course_settings/`            | Course settings, modules, groups, late policy  |
| `course_settings/rubrics.xml` | Every rubric in the course                     |
| `wiki_content/*.html`         | One file per page                              |
| `g<id>/`                      | One folder per assignment, quiz, or discussion |
| `g<id>.xml`                   | `webLink`, `topicMeta`, and LTI sidecars       |
| `non_cc_assessments/*.qti`    | The questions for quizzes, and the item banks  |
| `web_resources/`              | The files the course owns                      |

### A quiz is two resources

This is the sharpest edge, and it is why assessments are indexed by folder
rather than by path. Canvas writes **two** manifest resources for one classic
quiz:

```text
resource  g<folder>   type imsqti…/assessment        file g<folder>/assessment_qti.xml
           └─ dependency ──▶ resource  i<hash>       file g<folder>/assessment_meta.xml
                                                    file non_cc_assessments/<folder>.xml.qti
```

The module points at the **first** resource. The settings live in the
**second** one, reached through the dependency. The two identifiers are
different, so matching on the resource id alone finds the settings file in the
wrong place — or not at all.

The parser therefore indexes assessments by the **folder** they live in. The
folder name is the same in all three paths — `g<folder>/assessment_meta.xml`,
`g<folder>/assessment_qti.xml`, and `non_cc_assessments/<folder>.xml.qti` —
and that is what makes the join possible.

### Item banks are not quizzes

A QTI file is a **question bank** when its root element is `<objectbank>`, and
a **quiz** when it holds an `<assessment>`. The two look alike and are easy to
confuse. In the ENG120 export, 64 of the 94 QTI files are banks, and they are
not in any module — reporting them as orphaned quizzes would be badly wrong.

A quiz draws from a bank with a `<selection>`:

```xml
<selection>
  <sourcebank_ref>g6368989…</sourcebank_ref>
  <selection_number>5</selection_number>
  <selection_extension><points_per_item>1.0</points_per_item></selection_extension>
</selection>
```

### The points a quiz is worth

Canvas records two different figures for the same questions, and they can
disagree. The `<item>` elements carry a `points_possible` in their metadata;
the `<selection>` says what each question is _actually_ worth. **The selection
is the figure that applies.** In the AP_Calculus export the "Formulas Quiz"
has 50 questions worth 1.0 point each in their metadata, but a selection that
makes them 2.0 points each — 100 points, matching the quiz. Summing the item
metadata would have reported a mismatch that does not exist.

A selection with no `<sourcebank_ref>` selects the quiz's **own** items. One
with no `<selection_number>` takes **every** item in the bank — and the bank
file says how many items there are, so the count can be worked out.

A `text_only_question` is a passage shown to the student, not something they
answer. It carries a placeholder point value in the export but is not graded,
so it is counted apart and left out of the points.

### Rubrics

`course_settings/rubrics.xml` holds every rubric in the course, including the
ones nothing uses. An assignment links to one with `<rubric_identifierref>`,
and `<rubric_use_for_grading>` says whether the rubric drives the score or is
attached for reference only. A rubric is not a module item and never appears
in one — it is a separate layer.

### Sharp edges

- **The namespace declaration can be broken.** Some exports write `xmlns:xsi`
  with two URIs separated by a space. No XML parser accepts that, and browsers
  refuse the whole document. `src/lib/canvas/xml.ts` repairs it.
- **Some resources have no `href`.** Their title has to come from the file
  itself, not from the manifest.
- **The document element often is the element being looked for.** A quiz's
  settings live in `<quiz>`, not in a child of it. `childElements` matches the
  document root; `allElements` matches it too.
- **The file listing is not a reliable index.** `files_meta.xml` only records
  the files Canvas considers hidden, not all of them.
- **`ContextModuleSubHeader` is not content.** It is a heading in a module,
  and it has no resource in the manifest.
- **Some settings are empty elements.** `<hide_results/>` means the setting
  is _on_; reading its text gives an empty string. Presence is the signal.

### Content handling

Course content is not trusted. `src/lib/canvas/content.ts` rebuilds
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
