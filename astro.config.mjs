// @ts-check
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import tailwindcss from '@tailwindcss/vite';

// Drawbridge is a fully static site. No SSR, no adapters, no server code.
// See CLAUDE.md hard rules before changing anything here.
export default defineConfig({
  output: 'static',
  integrations: [svelte()],
  // Hash-based CSP. Astro computes a SHA-256 hash for every inline script/style
  // and each client JS chunk at build time and emits them in a
  // <meta http-equiv="content-security-policy">. This is what lets the Svelte
  // island bootstrap (two inline scripts) run under a policy with no
  // 'unsafe-inline'. netlify.toml keeps a lean edge header for the network
  // lockdown (connect-src 'none' etc.); this meta governs script/style integrity.
  // script-src/style-src are managed via scriptDirective/styleDirective — Astro
  // rejects them inside `directives`.
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' data: blob:",
        "connect-src 'none'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'none'",
      ],
      // Astro appends the per-build hashes automatically; 'self' covers the
      // same-origin external module chunks and the external stylesheet.
      scriptDirective: { resources: ["'self'"] },
      styleDirective: { resources: ["'self'"] },
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
