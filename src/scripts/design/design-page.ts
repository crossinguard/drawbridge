import { toast } from "@starwind-ui/astro/toast";
import { bindFilePicker } from "@/scripts/lib/file-picker";

type DesignToast = "default" | "info" | "success" | "warning" | "error";

function displayColor(cssColor: string): string {
  const channels = cssColor.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/);
  if (!channels) return cssColor;

  const [, red, green, blue, alpha] = channels;
  if (Number(alpha ?? 1) === 0) return "transparent";

  return `#${[red, green, blue].map((channel) => Math.round(Number(channel)).toString(16).padStart(2, "0")).join("")}`;
}

function setupDesignPage(root: HTMLElement): () => void {
  const events = new AbortController();
  const options = { signal: events.signal };
  const swatches = Array.from(root.querySelectorAll<HTMLElement>("[data-color-swatch]"));

  const updateColorValues = () => {
    for (const swatch of swatches) {
      const output = swatch.parentElement?.querySelector<HTMLElement>("[data-color-value]");
      if (output) output.textContent = displayColor(getComputedStyle(swatch).backgroundColor);
    }
  };

  updateColorValues();

  const themeObserver = new MutationObserver(updateColorValues);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

  root.addEventListener(
    "click",
    (event) => {
      const target = event.target as HTMLElement;
      const button = target.closest<HTMLButtonElement>("[data-design-toast]");
      if (!button) return;

      const variant = button.dataset.designToast as DesignToast;
      toast({
        title: `${variant} notification`,
        description: "This notification uses the shared feedback colors and floating surface.",
        variant,
      });
    },
    options,
  );

  const sourceRoot = root.querySelector<HTMLElement>("[data-design-source-picker]");
  const unbindSourcePicker = sourceRoot
    ? bindFilePicker(sourceRoot, (file) => {
        const status = sourceRoot.querySelector<HTMLElement>("[data-source-status]");
        if (status) status.textContent = `${file.name} selected. Its contents were not read.`;
      })
    : undefined;

  return () => {
    events.abort();
    themeObserver.disconnect();
    unbindSourcePicker?.();
  };
}

/** Mount the design reference on initial load and after Astro client navigation. */
export function mountDesignPage(): void {
  let activeRoot: HTMLElement | null = null;
  let cleanup: (() => void) | undefined;

  const mount = () => {
    const root = document.querySelector<HTMLElement>("[data-design-root]");
    if (root === activeRoot) return;

    cleanup?.();
    cleanup = undefined;
    activeRoot = root;
    if (root) cleanup = setupDesignPage(root);
  };

  queueMicrotask(mount);
  document.addEventListener("astro:page-load", mount);
}
