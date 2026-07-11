# Dependency notes

Versions verified installed and building as of July 2026. The pins in
`package.json` use caret ranges; this file records what was actually resolved so
a future clone that behaves differently has a reference point.

| Package            | Installed | Role |
|--------------------|-----------|------|
| astro              | 7.x       | static site framework |
| @astrojs/svelte    | 9.x       | Svelte island integration |
| svelte             | 5.x       | interactive components |
| tailwindcss        | 4.x       | styling, via @tailwindcss/vite |
| yaml (eemeli)      | 2.x       | YAML parse/serialize with comment preservation |
| unified + remark-* | 11.x / 4.x| markdown parse/serialize (Item Workbench, Phase 2) |
| rehype-sanitize    | 6.x       | sanitize rendered user markdown |
| nanostores         | 1.x       | per-tool reactive state |
| vitest             | 4.x       | tests |
| typescript         | 5.x       | types |

## Notes

- **Astro CLI telemetry:** Astro's CLI collects anonymous build-time telemetry by
  default. This is a developer-machine concern (nothing is shipped to users), but
  the project ethos is no data collection anywhere. Run `npx astro telemetry disable`
  once on each dev machine, or set `ASTRO_TELEMETRY_DISABLED=1` in your shell.
- **No runtime dependencies reach the browser uninvited.** Everything is bundled
  at build time. The Netlify CSP (`connect-src 'none'`) is the backstop: if any
  dependency tried to phone home at runtime, it would fail loudly.
- `@nanostores/svelte` (the Svelte adapter) is added when the first interactive
  store lands in Phase 1; nanostores core is listed now as the state choice of
  record.
