import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind class names, resolving conflicts in favour of the last one.
 *
 * Starwind's `tv()` helpers concatenate classes rather than merging them, so
 * a `class` passed through to a component can conflict with the component's
 * own base classes. Running it through `cn()` first means the caller's intent
 * wins instead of whichever rule happens to come later in the stylesheet.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
