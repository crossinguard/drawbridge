/**
 * The step contract shared by every tool's import → review → export flow.
 *
 * This module is imported by both Astro pages and client controllers, so it
 * must stay free of Astro-only imports (SVG components, `.astro` files). The
 * tool registry cannot be used here for the same reason.
 */

/** A single step in a tool's flow. */
export interface ToolStep {
  /** Stable id. Also the source of the step's section id. */
  id: string;
  /** Label shown in the stepper. */
  label: string;
}

/** DOM id of the `<section>` that holds a step's content. */
export function stepSectionId(id: string): string {
  return `step-${id}`;
}
