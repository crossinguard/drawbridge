import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

/** One plain-language guide for each Drawbridge tool. */
const guides = defineCollection({
  loader: glob({ base: "./src/content/guides", pattern: "**/*.mdx" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    toolSlug: z.string(),
  }),
});

export const collections = { guides };
