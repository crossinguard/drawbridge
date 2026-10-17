# Rubric → Canvas CSV

A private, fully client-side tool that converts a Word rubric table into a [Canvas](https://www.instructure.com/canvas) rubric import CSV. Hosted as a static site (Netlify), installable as a PWA, and works completely offline — **nothing you import ever leaves your browser**.

## How it works

1. **Import** — upload a `.docx` (drag & drop works), paste a table, or import a Canvas CSV you previously exported:
   - Rich paste straight from Word is detected automatically
   - Markdown pipe tables and tab-separated text also work
   - Canvas CSV import is useful for editing a rubric you previously exported
   - Not sure what your file should look like? [Download the sample .docx](/sample-rubric.docx) — it shows the expected layout, including criteria that skip rating levels
2. **Review & edit** — fix any parsing mistakes, name the rubric, and tune points:
   - Rating names come from the table's column headers
   - Points distribution presets: Full/Half/Zero/Zero (default), evenly spaced, custom percentages, or manual
   - Any rating's points can be overridden by editing the cell (highlighted until reset)
   - Add/remove/reorder criteria and rating levels
3. **Export** — preview the generated CSV, then download or copy it
   - Import in Canvas: course → **Rubrics** → **+Rubric** → **import**

Expected table shape (one row per criterion, one column per rating level):

| Criterion Name | Points | Rating A | Rating B | … |
| ------------- | ----- | -------- | -------- | - |

Output format follows `src/assets/reference/import_rubric_template.csv`: one CSV row per criterion, ratings flattened into repeating `Rating Name, Rating Description, Rating Points` triplets, with ragged rows when criteria have different rating counts.

## Privacy

- No server, no API, no analytics, no persistence — state lives only in memory
- A production CSP (`default-src 'self'`) makes external requests impossible
- Once loaded, the service worker serves everything locally — install it as an app and use it offline

## Commands

| Command                            | Action                                    |
| :--------------------------------- | :---------------------------------------- |
| `bun install`                      | Installs dependencies                     |
| `bun dev`                          | Starts local dev server                   |
| `bun run build`                    | Builds the production site to `./dist/`   |
| `bun preview`                      | Previews the build locally                |
| `bun ./scripts/verify-serializer.ts` | Serializer/parser unit checks           |
| `bun ./scripts/integration-test.ts` | .docx import pipeline integration test |
| `bun run sample`                    | Regenerates `public/sample-rubric.docx` — the in-app sample download and the shared test fixture |

## Deployment (Netlify)

`netlify.toml` is preconfigured (`bun run build`, publish `dist/`). Connect the repo in Netlify and deploy — no environment variables needed. The Starwind Pro license key in `.env.local` is only used locally by the Starwind CLI; components are vendored source and never ship to the browser.

## Structure

```text
src/
├── lib/
│   ├── rubric/       # types, points engine, Canvas CSV serializer
│   └── parse/        # docx (mammoth), HTML, markdown/TSV, table→rubric
├── scripts/          # client-side controller
├── components/       # Starwind UI components
└── pages/index.astro # single-page app
scripts/              # sample .docx builder, verification + integration tests
public/               # static assets, incl. sample-rubric.docx (in-app sample download)
```
