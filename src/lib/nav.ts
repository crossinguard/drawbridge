/** A link in the site header or footer. */
export interface NavLink {
  href: string;
  label: string;
}

/**
 * Primary site navigation.
 *
 * The header and the footer both render this list, so a new top-level page
 * only needs to be added here.
 */
export const NAV_LINKS: readonly NavLink[] = [
  { href: "/guides", label: "Guides" },
  { href: "/about", label: "About" },
  { href: "/privacy", label: "Privacy" },
];

/** True when `path` is the link's own page or a page underneath it. */
export function isActiveLink(path: string, href: string): boolean {
  return path === href || path.startsWith(`${href}/`);
}
