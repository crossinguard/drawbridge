## Development

When starting the dev server, use background mode:

```bash
astro dev --background
```

Manage it with `astro dev stop`, `astro dev status`, and `astro dev logs`.

### Checks

```bash
bun run check           # Astro and TypeScript checks
bun run check:isolation # the app must not depend on private reference material
bun run format          # prettier --write .
bun run build           # astro build
bun run test:canvas     # parser, normalized-model, selector, and sanitising checks
bun run test:e2e        # browser smoke test — build first
```

Prettier formats everything, including Tailwind class order. `.prettierrc` points
`prettier-plugin-tailwindcss` at `src/styles/starwind.css`, the single Tailwind
entry point.

## Reference material

`reference/` holds real course exports used to build and test the parsers. It is
git-ignored. Nothing in `src/` or `public/` may depend on it, and deleting it
must not change how the app builds, runs, or tests. `bun run check:isolation`
enforces this.

Real exports are input, never output: do not bundle them, quote them in public
guides, or commit them. Committed tests use generated synthetic cartridges.

## Product direction

Drawbridge is a set of focused tools connected by one opened source. **Course
Explorer** imports a Canvas export and browses its content. **Rubric Explorer**
reads rubric details and relationships, groups matching content, and compares
two rubrics. Neither produces QA judgments, reports, or exports.

Quiz Explorer should build on the same source, model, selectors, session, and UI
patterns. Prefer small, independently useful tool releases. Do not build a
visual workflow editor or a generic plugin framework.

Only working tools appear in `src/lib/tools/registry.ts`; do not fill the home
page with planned placeholders.

## Project structure

```text
reference/                              # git-ignored private development input
docs/                                   # contributor how-to guides
src/
├── layouts/DrawbridgeLayout.astro      # site shell, CSP, fonts, ClientRouter
├── content.config.ts                   # the guides collection
├── lib/
│   ├── canvas/                         # Canvas cartridge layer
│   │   ├── model.ts                    # unique entities + module placements
│   │   ├── selectors/                  # shared summaries, filters, details
│   │   ├── parse.ts                    # manifest/settings/content parser
│   │   ├── content.ts                  # safe course-HTML rebuilding
│   │   └── types.ts                    # parsed Canvas formats
│   ├── workspace/                      # source-agnostic in-memory session
│   └── tools/registry.ts               # public metadata for working tools
├── content/guides/                     # one plain-language MDX guide per tool
├── pages/
│   ├── tools/course-explorer/
│   ├── tools/rubric-explorer/
│   └── guides/                         # index + generated guide routes
├── scripts/
│   ├── canvas/                         # shared source/content controllers
│   ├── lib/                            # DOM, lifecycle, PWA helpers
│   └── tools/                          # thin tool-specific controllers
├── styles/
│   ├── starwind.css                    # Tailwind entry + light theme tokens
│   ├── base/                           # global defaults and typography
│   └── components/                     # shared CSS component patterns
└── components/
    ├── drawbridge/
    │   └── patterns/                   # reusable source-agnostic app patterns
    ├── tools/                          # domain-specific components when needed
    └── starwind/                       # vendored generic UI primitives
```

## Tool conventions

- A tool route lives under `src/pages/tools/<slug>/` and is built from
  `components/drawbridge/patterns/ToolShell.astro`.
- Tool pages assemble components; they should not contain large unique page
  shells or a mandatory stepper.
- Pure tool logic belongs under `src/lib/tools/<slug>/`. Relationship logic
  shared by Canvas tools belongs in `src/lib/canvas/selectors/`.
- Browser controllers belong in `src/scripts/tools/<slug>/` and should connect
  state to the DOM rather than reimplement domain rules.
- Use `bindCanvasSource()` from `src/scripts/canvas/source-controller.ts` to
  connect `SourcePicker` and `WorkspaceBar` to the shared session.
- Use `mountToolController()` from `src/scripts/lib/lifecycle.ts`. Return a
  cleanup that releases subscriptions, object URLs, and other resources.
- Every tool has exactly one guide at `src/content/guides/<slug>.mdx`, linked by
  a visible **Guide** action in `ToolShell`. There are no quick-starts.

### Reuse boundaries

Be liberal about named components and conservative about universal
abstractions.

1. **Starwind primitives** are generic vendored controls. Compose them first;
   do not add Canvas business logic to them.
2. **Drawbridge patterns** such as `SourcePicker` and `WorkspaceBar` are
   source-agnostic and live in `components/drawbridge/patterns/`.
3. **Tool components** are domain-specific and live near their tool.

Do not build a universal data grid. Extract a shared pattern when its contract
is clear from real tool use. Pure parsing and selectors must not depend on the
DOM; Astro components must not own import/comparison logic.

### The registry

`src/lib/tools/registry.ts` is the source of truth for tool titles,
descriptions, source labels, routes, and guide links. It imports SVG icons as
Astro components, so only import it from `.astro` files. Client controllers use
separate icon-free modules.

## Session and navigation

`src/lib/workspace/session.ts` owns the single opened source. It deliberately
has no IndexedDB, localStorage, sessionStorage, cookie, or server adapter.

Astro's `<ClientRouter />` keeps that module alive during internal navigation:

- Course → guide → course retains the source.
- Course Explorer ↔ Rubric Explorer retains the source. Rubric/activity handoffs
  use `?rubric=<id>` and `?item=<id>` to select the requested destination.
- Refresh, a separate tab, closing the tab, or `clearWorkspace()` forgets it.

PWA updates use prompt mode and a visible reload notice. Never automatically
reload an open course session.

The normalized Canvas model groups parser records by content ID. A piece of
content placed in two modules is one `CourseEntity` with two `placements`.
Files not placed in modules are also added as unique file entities. Tools read
this model and its selectors rather than deduplicating parser output
themselves.

## Styling

Drawbridge uses Astro, Starwind UI, Tailwind CSS v4, and vanilla TypeScript. No
UI framework island is needed for these tools.

### Light and dark theme

- Starwind's theme controller follows the system by default. `ThemeToggle`
  saves only the `colorTheme` display preference in local storage, and
  `ThemeInitScript` applies it before rendering and across client navigation.
- Use class-based `.dark` theming and the matching `color-scheme`. Do not add
  component-level dark color overrides; change the semantic tokens instead.
- `src/styles/starwind.css` owns the Poseidon, Sea Goddess, Pompelmo,
  Butternut, and Gruyrecheese scales plus all light `:root` and `.dark`
  semantic mappings. Do not create a second color or pigment system.
- Keep Atkinson Hyperlegible Next/Mono and PaintFactory through Astro's Fonts
  API. Font mappings remain explicit in `@theme inline`.
- Use semantic utilities such as `bg-card`, `text-muted-foreground`, and
  `border-border`, not raw palette utilities when a token exists.

### CSS organization

The four concerns are layout, typography, theming, and effects.

- Keep small, local layouts directly in HTML.
- Reused semantic markup becomes an Astro component.
- Complex or repeatedly cluttered responsive styling may become a named CSS
  component under `src/styles/components/`.
- Shared typography lives in `src/styles/base/type.css` with readable names
  such as `page-title`, `section-title`, and `supporting-text`.
- Simple effects stay inline; component-only complex CSS can use Astro scoped
  styles. Respect reduced motion.
- Group multi-line `@apply` statements by concern. Never construct Tailwind
  class names through string interpolation; use static complete-class maps.
- Use `@utility` selectively and keep nested component selectors low
  specificity. Do not extract a class merely to hide three utilities.
- There is no `pages/` CSS directory by default.

## Guides

Guides use the build-time MDX content collection. Each has `title`,
`description`, and `toolSlug`; the dynamic route generates `/guides/<slug>/`.

Write for nontechnical users. Cover what the tool does, what they need, numbered
use steps, what the screen shows, export limitations, privacy/session behavior,
and troubleshooting. Do not expose XML paths, parser architecture, QA jargon,
or real course examples. Keep contributor architecture in this file and
README.md.

## The Canvas Common Cartridge

Course Explorer and future Canvas tools share `src/lib/canvas/`. These format
rules were learned from real exports and must remain intact when the model is
extended. Canvas course import accepts only filenames ending in `.imscc`;
renamed `.zip` archives are not accepted. Standalone QTI belongs to separate
assessment tooling, not Canvas course import. Canvas permits selective Common
Cartridge exports, so absence always means “not in this export,” never proof
that the original course lacks content. QTI-only and files-only ZIP exports are
separate formats, not supported IMSCC input.

### The join

A module item points at an identifier, not directly at content:

```text
course_settings/module_meta.xml   module item ──▶ identifier
imsmanifest.xml                   <item identifierref> ──▶ resource
imsmanifest.xml                   <resource> ──▶ content file(s)
```

Do not follow the module item's own `<identifierref>` first. For external
links Canvas may put the item identifier there. The manifest organization is
the reliable path.

### What is where

| Path                          | Holds                                         |
| ----------------------------- | --------------------------------------------- |
| `imsmanifest.xml`             | Resource list and module organization         |
| `course_settings/`            | Course settings, modules, groups, late policy |
| `course_settings/rubrics.xml` | Every rubric, including unlinked rubrics      |
| `wiki_content/*.html`         | Pages                                         |
| `g<id>/`                      | Assignment, quiz, or discussion content       |
| `g<id>.xml`                   | webLink, topicMeta, and LTI sidecars          |
| `non_cc_assessments/*.qti`    | Quiz questions and item banks                 |
| `web_resources/`              | Course-owned files                            |

### A quiz is two resources

A classic quiz has a QTI resource and a settings resource reached through a
dependency. The module points at the first; settings and the real QTI live in
the second. Their identifiers differ.

Index assessments by their shared folder. The folder is the same in
`g<folder>/assessment_meta.xml`, `g<folder>/assessment_qti.xml`, and
`non_cc_assessments/<folder>.xml.qti`.

### Banks and points

- A QTI root `<objectbank>` is a bank; an `<assessment>` is a quiz. Do not
  report banks as unplaced quizzes.
- A `<selection>` can draw from a bank or select the quiz's own items.
- Selection `points_per_item` is the point value that applies, not necessarily
  the item metadata's `points_possible`.
- No `selection_number` with a bank reference means the selection takes every
  bank item; the bank supplies the count.
- `text_only_question` is a passage, not a graded question. Count it apart and
  leave it out of points.

### Rubrics

Assignments, quizzes, and graded discussions link to rubrics with
`<rubric_identifierref>`. `<rubric_use_for_grading>` distinguishes scoring from
reference-only attachment. Rubrics are not module items. Say **no linked
activities in this export**, not a universal claim that a rubric is unused.

`selectors/rubrics.ts` owns all grouping and comparison rules. Exact-content
signatures ignore generated IDs and titles but preserve criterion/rating order,
long descriptions, and points. Same-name groups normalize title whitespace and
case, then require distinct content signatures. Two-rubric comparisons align
criteria by exported position; do not match them by generated criterion IDs.

### Sharp edges

- Some exports declare `xmlns:xsi` with two URIs separated by a space;
  `src/lib/canvas/xml.ts` repairs this.
- Some resources have no `href`; read the title from the content.
- The document element may itself be the element being sought. Use the XML
  helpers that include the root.
- `files_meta.xml` is not a complete file index.
- `ContextModuleSubHeader` is a heading, not content.
- Empty elements can mean a setting is on. Presence, not text length, is the
  signal.
- Pages outside modules still need their HTML metadata read, including
  front-page state.

### Content handling

Course content is untrusted. `src/lib/canvas/content.ts` rebuilds it against an
allowlist: no scripts, event handlers, inline styles, unsafe URLs, or frames.
External images are dropped rather than fetched.

Canvas placeholders become internal navigation or cartridge files:

| Placeholder                   | Becomes                           |
| ----------------------------- | --------------------------------- |
| `$WIKI_REFERENCE$/pages/<id>` | A jump to that page in the tool   |
| `$IMS-CC-FILEBASE$/<path>`    | A file/image inside the cartridge |
| `$CANVAS_COURSE_REFERENCE$/…` | A jump to the module outline      |
| `$CANVAS_OBJECT_REFERENCE$/…` | A jump to that content or module  |

Canvas equation images become accessible equation text when the export carries
LaTeX in its attributes. Iframes become explicit outbound links; neither remote
images nor third-party thumbnails or frames are loaded.

`src/scripts/canvas/content-view.ts` resolves cartridge images to object URLs
and releases them on rerender and unmount. Preserve that cleanup.

## Privacy and quality gates

- All imported-file processing is client-side. No analytics, account, server,
  or imported-course persistence.
- Production CSP uses `default-src 'self'`; course HTML and URLs still need
  sanitising because CSP is not a substitute.
- The PWA caches application assets for offline use, not course data.
- New tools must include one guide, synthetic logic tests, browser coverage,
  keyboard/focus checks, reduced-motion behavior, and responsive checks at
  mobile width and zoom.
- No third-party requests may occur while importing or reading course content.
