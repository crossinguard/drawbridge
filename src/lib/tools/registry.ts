import type { SvgComponent } from "astro/types";
import PackageExport from "@tabler/icons/outline/package-export.svg";

/** Public metadata for one focused Drawbridge tool. */
export interface ToolEntry {
  slug: string;
  title: string;
  description: string;
  metaDescription?: string;
  sourceLabel: string;
  icon: SvgComponent;
  href: string;
  guideHref: string;
}

/**
 * Only working tools appear here. The homepage, tool shell, and guides all
 * read this same metadata so names and destinations cannot drift apart.
 */
export const TOOLS: readonly ToolEntry[] = [
  {
    slug: "course-explorer",
    title: "Course Explorer",
    description: "Open a Canvas course export and explore its modules, content, and files without uploading anything.",
    metaDescription:
      "Open a Canvas course export (.imscc), see what it contains, and browse its modules and content entirely in your browser.",
    sourceLabel: "Canvas course export",
    icon: PackageExport,
    href: "/tools/course-explorer",
    guideHref: "/guides/course-explorer",
  },
];

export function getToolBySlug(slug: string): ToolEntry | undefined {
  return TOOLS.find((tool) => tool.slug === slug);
}

export function requireToolBySlug(slug: string): ToolEntry {
  const tool = getToolBySlug(slug);
  if (!tool) throw new Error(`No tool registered with slug "${slug}".`);
  return tool;
}
