import tailwindcss from "@tailwindcss/vite";
// @ts-check
import { defineConfig, fontProviders } from "astro/config";
import mdx from "@astrojs/mdx";
import vitePWA from "@vite-pwa/astro";

// https://docs.astro.build/config
export default defineConfig({
  // Self-hosted fonts via the Fonts API: hashed files under _astro/fonts
  // with optimized fallbacks. Weights: single 700 for PaintFactory (static
  // file), "200 800" variable ranges for the two Atkinson faces.
  fonts: [
    {
      provider: fontProviders.local(),
      name: "PaintFactory",
      cssVariable: "--font-paintfactory",
      options: {
        variants: [
          {
            weight: 700,
            style: "normal",
            src: ["./src/assets/fonts/PaintFactory-Bold.woff2"],
          },
        ],
      },
    },
    {
      provider: fontProviders.local(),
      name: "Atkinson Hyperlegible Next",
      cssVariable: "--font-hyperlegible-next",
      fallbacks: ["sans-serif"],
      options: {
        variants: [
          {
            weight: "200 800",
            style: "normal",
            src: ["./src/assets/fonts/AtkinsonHyperlegibleNextVF-Variable.woff2"],
          },
        ],
      },
    },
    {
      provider: fontProviders.local(),
      name: "Atkinson Hyperlegible Mono",
      cssVariable: "--font-hyperlegible-mono",
      fallbacks: ["monospace"],
      options: {
        variants: [
          {
            weight: "200 800",
            style: "normal",
            src: ["./src/assets/fonts/AtkinsonHyperlegibleMonoVF-Variable.woff2"],
          },
        ],
      },
    },
  ],
  integrations: [
    mdx(),
    // Static site + service worker: installable and fully offline after first load.
    // Updates wait for the user so an open course session is never reloaded away.
    vitePWA({
      registerType: "prompt",
      includeAssets: ["favicon.svg", "favicon.ico"],
      manifest: {
        name: "Drawbridge — Private assessment tools",
        short_name: "Drawbridge",
        description:
          "Free, private tools for exploring course content. No login, no tracking — imported files stay on your device.",
        theme_color: "#0a3d5c",
        background_color: "#f5deb3",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "favicon-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "favicon-512x512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{css,js,html,svg,png,ico,woff2,webmanifest}"],
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
