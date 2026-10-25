/**
 * Central registry of every Drawbridge tool.
 *
 * This module is imported by Astro components only. The icons are SVG
 * components, which Astro can only render from the server build — importing
 * this file from a client script (`src/scripts/**`) would degrade the icons to
 * plain asset metadata.
 */
import type { SvgComponent } from "astro/types";

import FileTypeCsv from "@tabler/icons/outline/file-type-csv.svg";
import GitCompare from "@tabler/icons/outline/git-compare.svg";
import PackageExport from "@tabler/icons/outline/package-export.svg";
import ClipboardCheck from "@tabler/icons/outline/clipboard-check.svg";
import FileDiff from "@tabler/icons/outline/file-diff.svg";

/**
 * How finished a tool is.
 *
 * - `stable` — confirmed working. Any issues are bugs that need to be fixed.
 * - `experimental` — should do what we want it to do, but use with caution.
 * - `under-development` — somewhat functional, but probably broken in some way
 *   or incomplete.
 * - `planned` — an idea for a tool. Nothing is functional yet.
 */
export type ToolStatus = "stable" | "experimental" | "under-development" | "planned";

export interface ToolEntry {
  /** URL segment, also used as the guide slug. */
  slug: string;
  title: string;
  /**
   * One-line summary. Used on the directory card and as the basis for the
   * tool page's subtitle and meta description, so the three never drift.
   */
  description: string;
  /**
   * Override for the `<meta name="description">` tag, when the page needs
   * different wording from the card. Falls back to `description`.
   */
  metaDescription?: string;
  /**
   * The words that make up the tool's page heading, joined by an arrow icon.
   * `["Rubric", "Canvas CSV"]` renders as "Rubric → Canvas CSV".
   */
  heading: string[];
  status: ToolStatus;
  icon: SvgComponent;
  /** Live tools only. Absent for planned tools. */
  href?: string;
  /** Reference documentation. Absent for planned tools. */
  guideHref?: string;
}

export interface ToolStatusMeta {
  /** Short label shown on the badge. */
  label: string;
  /** One-line explanation of what the status means. */
  description: string;
  /** Badge variant from the Starwind badge component. */
  badgeVariant: "default" | "primary" | "secondary" | "outline" | "ghost" | "info" | "success" | "warning" | "error";
}

/** Status display order on the tool directory, most finished first. */
export const TOOL_STATUS_ORDER: readonly ToolStatus[] = ["stable", "experimental", "under-development", "planned"];

export const TOOL_STATUS_META: Record<ToolStatus, ToolStatusMeta> = {
  stable: {
    label: "Stable",
    description: "Confirmed working. Any issues are bugs that need to be fixed.",
    badgeVariant: "success",
  },
  experimental: {
    label: "Experimental",
    description: "Should do what we want it to do, but use with caution.",
    badgeVariant: "warning",
  },
  "under-development": {
    label: "Under development",
    description: "Somewhat functional, but probably broken in some way or incomplete.",
    badgeVariant: "info",
  },
  planned: {
    label: "Planned",
    description: "An idea for a tool. Nothing is functional yet.",
    badgeVariant: "secondary",
  },
};

export const TOOLS: readonly ToolEntry[] = [
  {
    slug: "rubric-csv",
    title: "Rubric → Canvas CSV",
    description: "Convert a Word rubric table into a Canvas import CSV.",
    metaDescription:
      "Convert a Word rubric table into a Canvas import CSV — entirely in your browser, nothing is uploaded.",
    heading: ["Rubric", "Canvas CSV"],
    status: "experimental",
    icon: FileTypeCsv,
    href: "/tools/rubric-csv",
    guideHref: "/guides/rubric-csv",
  },
  {
    slug: "outcome-mapper",
    title: "Outcome Mapper",
    description: "Map program, course, and assessment outcomes and export the alignment table.",
    heading: ["Outcome", "Mapper"],
    status: "under-development",
    icon: GitCompare,
    href: "/tools/outcome-mapper",
    guideHref: "/guides/outcome-mapper",
  },
  {
    slug: "imscc-viewer",
    title: "Canvas Course Export Viewer",
    description:
      "Open a Canvas course export package (.imscc) and browse its modules, pages, quizzes, and files without uploading it anywhere.",
    heading: ["Canvas Course Export", "Viewer"],
    status: "planned",
    icon: PackageExport,
  },
  {
    slug: "assessment-plan-builder",
    title: "Assessment Plan Builder",
    description:
      "Draft a course-level assessment plan by combining outcomes, rubrics, and Canvas assignments into one alignment table.",
    heading: ["Assessment Plan", "Builder"],
    status: "planned",
    icon: ClipboardCheck,
  },
  {
    slug: "rubric-version-diff",
    title: "Rubric Version Diff",
    description:
      "Compare two versions of a rubric and highlight the criteria, rating scales, and point values that changed.",
    heading: ["Rubric Version", "Diff"],
    status: "planned",
    icon: FileDiff,
  },
];

/** Tools sharing a given status, in registry order. */
export function toolsByStatus(status: ToolStatus): ToolEntry[] {
  return TOOLS.filter((tool) => tool.status === status);
}

/** Look up a tool by its slug. */
export function getToolBySlug(slug: string): ToolEntry | undefined {
  return TOOLS.find((tool) => tool.slug === slug);
}

/**
 * Look up a tool by its slug, throwing if it is missing.
 *
 * Use this where the slug is a hard-coded constant, so a renamed slug fails
 * the build instead of silently rendering `undefined`.
 */
export function requireToolBySlug(slug: string): ToolEntry {
  const tool = getToolBySlug(slug);
  if (!tool) {
    throw new Error(`No tool registered with slug "${slug}". Add it to src/lib/tools/registry.ts.`);
  }
  return tool;
}
