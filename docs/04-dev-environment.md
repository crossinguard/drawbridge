# Development environment

You build on your personal machine and test on your work machine. That split
shapes a few decisions, and this document covers both sides.

## Personal machine (build + develop)

Requirements:

- **Node 22+** (see `.nvmrc`). Install via nvm, Volta, or the official installer.
- A terminal and an editor. Claude Code / Codex sessions run here.

Setup:

```bash
git clone <your-repo-url> drawbridge
cd drawbridge
npm install
npm run dev        # http://localhost:4321
```

Common commands:

```bash
npm run dev        # live dev server with HMR
npm run test       # run vitest once (round-trip + validation gates)
npm run test:watch # vitest in watch mode while developing
npm run check      # astro + typescript diagnostics
npm run build      # produce static site in dist/
npm run preview    # serve the built dist/ locally, as it will run in prod
```

## Work machine (test the real thing)

The work machine is the environment that actually matters — it is the locked-down
Windows box where installs may not be possible and where the tool must earn its
place. There are two ways to exercise Drawbridge there, in order of preference.

### Option A — the deployed site (primary)

This is the whole point of the browser-first decision: a static URL is the one
distribution channel no IT policy blocks.

1. Push to your Git host from the personal machine.
2. Netlify builds and deploys automatically (config in `netlify.toml`).
3. On the work machine, open the Netlify URL in Chrome or Edge.

Everything runs client-side. No install, no permission prompt, no data leaving
the browser. This is exactly how a colleague would use it too, which is the
point — test the way real users will.

**Use a Netlify deploy preview or a separate staging site** for work-in-progress
so you're never testing half-built features against your production workflow.
Every branch/PR gets its own preview URL automatically.

### Option B — a portable local build (fallback)

If you ever need to run without the network — offline, or a site is blocked —
the built site is just static files:

1. On the personal machine: `npm run build`. This produces `dist/`.
2. Copy `dist/` to the work machine (USB, OneDrive, email a zip — whatever's
   allowed).
3. Open it. Because the app makes no network calls and Astro builds with
   relative paths, it runs from a simple local server. If you can't install one,
   most locked-down machines still have Python:
   ```bash
   cd dist
   python -m http.server 8000    # then open http://localhost:8000
   ```
   Opening `index.html` directly via `file://` mostly works but some browsers
   restrict module scripts under `file://`; the tiny local server avoids that.

Option B is a safety valve, not the plan. The deployed site is the intended path.

## The work-machine reality check

A feature isn't done until it works on the work machine, in the browser you
actually have, against a real course's content. The personal machine will lie to
you — newer browser, fewer restrictions, your own files. Build there, but let the
work machine cast the deciding vote.

Concretely, verify on the work machine early:

- File download (export) actually saves where you expect, and IT doesn't quarantine
  the downloaded `.md`/`.docx`/`.yaml`.
- File upload (import) is allowed from the folders you keep content in.
- IndexedDB persists across sessions (some managed browsers clear site data on
  close — if so, snapshots-as-files become more important than snapshots-in-storage,
  and that's worth knowing before you rely on them).

## AI-assisted coding

Both Claude Code and Codex are in play. `CLAUDE.md` at the repo root governs
those sessions. The short version: the developer is in the driver's seat; the AI
explains reasoning and surfaces tradeoffs; hard rules are never violated; scope
drift gets flagged, not followed. Point the agent at `docs/` before it writes
code — the decision record and architecture doc are the build contract.
