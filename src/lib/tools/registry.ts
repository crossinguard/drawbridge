import type { SvgComponent } from "astro/types";
import PackageExport from "@tabler/icons/outline/package-export.svg";
import ListDetails from "@tabler/icons/outline/list-details.svg";
import FileText from "@tabler/icons/outline/file-text.svg";

export type ToolSourceKind = "canvas-course" | "webvtt-transcript";

/** Public metadata for one focused Drawbridge tool. */
export interface ToolEntry {
  slug: string;
  sourceKind: ToolSourceKind;
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
    sourceKind: "canvas-course",
    title: "Course Explorer",
    description: "Open a Canvas course export and explore its modules, content, and files without uploading anything.",
    metaDescription:
      "Open a Canvas course export (.imscc), see what it contains, and browse its modules and content entirely in your browser.",
    sourceLabel: "Canvas course export",
    icon: PackageExport,
    href: "/tools/course-explorer",
    guideHref: "/guides/course-explorer",
  },
  {
    slug: "rubric-explorer",
    sourceKind: "canvas-course",
    title: "Rubric Explorer",
    description: "Read the rubrics in a Canvas export, see their linked activities, and compare rubric content.",
    metaDescription:
      "Explore Canvas rubrics, criteria, ratings, linked activities, exact-content copies, same-name variations, and two-rubric comparisons in your browser.",
    sourceLabel: "Canvas course export",
    icon: ListDetails,
    href: "/tools/rubric-explorer",
    guideHref: "/guides/rubric-explorer",
  },
  {
    slug: "transcript-to-text",
    sourceKind: "webvtt-transcript",
    title: "Transcript to Text",
    description: "Review a WebVTT transcript, correct speaker names, and turn it into readable plaintext.",
    metaDescription:
      "Open a Microsoft Teams or other WebVTT transcript, search and review its cues, correct speaker names, and copy or download plaintext in your browser.",
    sourceLabel: "WebVTT transcript",
    icon: FileText,
    href: "/tools/transcript-to-text",
    guideHref: "/guides/transcript-to-text",
  },
];

export function getToolsBySourceKind(sourceKind: ToolSourceKind): readonly ToolEntry[] {
  return TOOLS.filter((tool) => tool.sourceKind === sourceKind);
}

export function getToolBySlug(slug: string): ToolEntry | undefined {
  return TOOLS.find((tool) => tool.slug === slug);
}

export function requireToolBySlug(slug: string): ToolEntry {
  const tool = getToolBySlug(slug);
  if (!tool) throw new Error(`No tool registered with slug "${slug}".`);
  return tool;
}
