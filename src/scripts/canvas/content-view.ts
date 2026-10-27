import type { ProcessedContent } from "@/lib/canvas/content";
import type { FileStore } from "@/lib/canvas/store";

interface ContentViewOptions {
  archive: FileStore;
  /** Return true when the tool handled navigation; false preserves an ordinary anchor. */
  onTarget: (target: string) => boolean;
}

/**
 * Render sanitised Canvas HTML, resolve cartridge images, and turn Canvas
 * placeholders into tool navigation. Object URLs are released on every render
 * and when the owning tool unmounts.
 */
export function createCanvasContentView({ archive, onTarget }: ContentViewOptions) {
  let objectUrls: string[] = [];
  let generation = 0;

  const release = () => {
    generation++;
    for (const url of objectUrls) URL.revokeObjectURL(url);
    objectUrls = [];
  };

  const resolveImages = async (container: HTMLElement, currentGeneration: number) => {
    const images = Array.from(container.querySelectorAll<HTMLImageElement>("img[data-canvas-image]"));

    for (const image of images) {
      const path = image.dataset.canvasImage;
      if (!path) continue;

      try {
        const blob = await archive.blob(path);
        if (currentGeneration !== generation || !image.isConnected) return;
        if (!blob) {
          image.replaceWith(document.createTextNode(`[Image not included: ${path}]`));
          continue;
        }

        const url = URL.createObjectURL(blob);
        objectUrls.push(url);
        image.src = url;
        image.classList.add("h-auto", "max-w-full");
      } catch {
        if (currentGeneration === generation && image.isConnected) {
          image.replaceWith(document.createTextNode(`[Image could not be read: ${path}]`));
        }
      }
    }
  };

  return {
    render(container: HTMLElement, processed?: ProcessedContent) {
      release();
      const currentGeneration = generation;
      container.innerHTML = processed?.html ?? "";

      container.querySelectorAll<HTMLAnchorElement>("a[data-canvas-target]").forEach((anchor) => {
        anchor.addEventListener("click", (event) => {
          const handled = onTarget(anchor.dataset.canvasTarget ?? "");
          if (handled) event.preventDefault();
        });
      });

      void resolveImages(container, currentGeneration);
    },
    destroy: release,
  };
}
