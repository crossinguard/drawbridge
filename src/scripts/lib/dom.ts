/**
 * Small DOM helpers shared by every tool controller.
 */

/**
 * Find an element by id.
 *
 * The name is deliberately not `$` — that usually implies a CSS selector, and
 * `getElementById` wants a bare id with no `#` prefix.
 */
export function byId<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

/** Inline an SVG icon with a size class. */
export function icon(raw: string, cls = "size-4"): string {
  return raw.replace("<svg", `<svg class="${cls}" aria-hidden="true"`);
}

/** Escape text for safe interpolation into HTML. */
export function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Escape text for safe interpolation into an HTML attribute. */
export function escAttr(text: string): string {
  return esc(text).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Convert a name into a URL-safe slug, falling back when it has no usable characters. */
export function slugify(text: string, fallback = ""): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}
