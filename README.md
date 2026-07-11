# Drawbridge

Browser-based tools for managing assessment content — outcomes, items, and the
documents around them — where everything stays in plain, portable files that
never leave your machine.

Drawbridge is one static site. Each tool is a route:

- `/outcomes` — **Outcome Builder.** Manage the hierarchy of course outcomes,
  evidence outcomes, and learning objectives. Ships first.
- `/items` — **Item Workbench.** Import, review, refine, and export assessment
  item banks. The hub of the AI → review → reviewers → Canvas relay.
- `/conventions` — the documented file formats and copy-ready prompts for AI
  item writers.

## Why it exists

The real production pipeline is a relay of handoffs:

```
AI design spec → AI item writer (FLO / ChatGPT / Codex) → Drawbridge
   → review & refine (solo or AI-assisted) → Word to human reviewers
   → rework feedback → QTI to Canvas
```

Drawbridge is the stable hub in the middle. It is not an item bank, an LMS, or a
QTI generator standing alone — it is the private workspace where content lives
between those handoffs, in files that outlive any employer or tool.

## Guarantees (non-negotiable)

1. **Privacy by architecture.** Static site, no backend, no analytics, no network
   calls after page load. Content cannot leave the browser because there is
   nowhere for it to go. Enforced by a `connect-src 'none'` CSP.
2. **Files are canonical.** Human-readable YAML and Markdown are the record.
   Browser storage is crash protection, not the source of truth.
3. **Deterministic behavior.** Rule-based parsing and validation. No AI runs
   inside the tool — AI lives next door and hands off through files.
4. **Loose validation.** Draft states are always valid, saveable, exportable.

## Getting started

Requires Node 22+ (see `.nvmrc`).

```bash
npm install
npm run dev      # http://localhost:4321
npm run test     # vitest
npm run build    # static output to dist/
```

Deploy: push to a Git host, connect the repo to Netlify. Config is in
`netlify.toml`. No environment variables, no functions, no secrets.

## Where to read next

Documentation lives in `docs/`, in reading order:

- `docs/00-decision-record.md` — what Drawbridge is and why. Read first.
- `docs/01-architecture.md` — how the code is organized and the rules that hold.
- `docs/02-roadmap.md` — build phases and what is deliberately deferred.
- `docs/03-handoffs.md` — the snapshot and export model in detail.
- `docs/formats/` — the versioned file format specifications.
- `docs/04-dev-environment.md` — personal-machine build, work-machine testing.
- `CLAUDE.md` — governance for AI-assisted coding sessions.

## License

TBD before any public release. Leaning AGPLv3. Not yet decided; do not assume.
