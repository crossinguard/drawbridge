import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

/**
 * Guide documentation for every Drawbridge tool.
 *
 * Each tool contributes two entries:
 *
 * - `kind: "reference"` — the long-form documentation, served at
 *   `/guides/<tool-slug>`.
 * - `kind: "quick-start"` — the short version, rendered inside the tool page
 *   itself so a first-time visitor sees it without leaving the tool.
 *
 * The `toolSlug` ties an entry back to an entry in `src/lib/tools/registry.ts`.
 */
const guides = defineCollection({
  loader: glob({ base: "./src/content/guides", pattern: "**/*.mdx" }),
  schema: z.object({
    /** Human-readable title, used in the page heading and document title. */
    title: z.string(),
    /** One-line summary, used as the meta description and card blurb. */
    description: z.string(),
    /** Slug of the tool this guide documents. Must match the tool registry. */
    toolSlug: z.string(),
    /** Which half of the two-part guide pattern this entry is. */
    kind: z.enum(["reference", "quick-start"]),
  }),
});

export const collections = { guides };
