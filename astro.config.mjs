import tailwindcss from "@tailwindcss/vite";
// @ts-check
import { defineConfig } from "astro/config";
import vitePWA from "@vite-pwa/astro";

// https://docs.astro.build/config
export default defineConfig({
  integrations: [
    // Static site + service worker: installable and fully offline after first load.
    vitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "favicon.ico"],
      manifest: {
        name: "Rubric CSV — Canvas rubric importer",
        short_name: "Rubric CSV",
        description:
          "Convert a Word rubric table into a Canvas import CSV. Private by design — everything stays on your device.",
        theme_color: "#ffffff",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "pwa-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
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
