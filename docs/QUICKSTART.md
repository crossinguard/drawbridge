# Quickstart

```bash
npm install
npx astro telemetry disable   # one-time, honors the no-data-collection ethos
npm run test                  # 5 passing tests: outcomes round-trip + validation
npm run dev                   # http://localhost:4321
```

You should see a landing page linking three routes: Outcomes, Items, Conventions.
The domain layer for outcomes is built and tested; the tool UIs are the next
work. Start with Phase 1 in `docs/02-roadmap.md`.

## What's already real

- `src/lib/outcomes/` — parser, serializer, validator, reverse-view helpers, all
  framework-free and tested.
- `tests/outcomes.test.ts` — the round-trip release gate, passing.
- `fixtures/` — a sample outcomes YAML and a matching items markdown bank.
- The site shell, landing page, navigation, and design tokens.
- `/conventions` — the copy-ready AI item-writer prompt.

## What to build next (Phase 1)

The Outcome Builder editing UI: load a YAML file, render the CO→EO tree and the
LO list, edit through the domain layer, flag validation issues inline, export.
Point your AI coding agent at `docs/` and `CLAUDE.md` first.
