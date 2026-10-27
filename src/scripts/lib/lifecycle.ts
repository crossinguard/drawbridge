type Cleanup = () => void;
type Setup = (root: HTMLElement) => void | Cleanup;

/**
 * Mount a tool on initial load and after Astro client-side navigation.
 * Returning a setup cleanup prevents duplicate listeners and releases object
 * URLs or subscriptions when another page replaces the tool.
 */
export function mountToolController(toolSlug: string, setup: Setup): void {
  let activeRoot: HTMLElement | null = null;
  let cleanup: Cleanup | undefined;

  const mount = () => {
    const root = document.querySelector<HTMLElement>(`[data-tool-root="${toolSlug}"]`);
    if (root === activeRoot) return;

    cleanup?.();
    cleanup = undefined;
    activeRoot = root;
    if (root) cleanup = setup(root) ?? undefined;
  };

  queueMicrotask(mount);
  document.addEventListener("astro:page-load", mount);
}
