/**
 * Shared rendering of Starwind alerts from client-side code.
 *
 * The Alert component is an Astro component, so controllers cannot use it
 * directly. Instead they build the same markup from the component's variant
 * classes, which keeps the styling in one place.
 */
import { alert as alertClasses, alertDescription, alertTitle } from "@/components/starwind/alert/variants";

import { esc, icon } from "./dom";

export interface AlertListOptions {
  /** Alert variant. Defaults to `warning`. */
  variant?: "default" | "primary" | "secondary" | "info" | "success" | "warning" | "error";
  /** Heading of the alert. */
  title: string;
  /** Optional raw SVG icon shown next to the heading. */
  icon?: string;
  /** Size class for the icon. */
  iconClass?: string;
  /** The messages to list. */
  items: string[];
}

/** Replace `container`'s contents with an alert listing `items`. */
export function renderAlertList(container: HTMLElement, options: AlertListOptions): void {
  container.innerHTML = "";
  if (options.items.length === 0) return;

  const items = options.items.map((item) => `<li>${esc(item)}</li>`).join("");
  const heading = options.icon
    ? `${icon(options.icon, options.iconClass ?? "size-5")} ${esc(options.title)}`
    : esc(options.title);

  container.innerHTML = `
    <div class="${alertClasses({ variant: options.variant ?? "warning" })}" role="alert">
      <h5 class="${alertTitle()}">${heading}</h5>
      <p class="${alertDescription()}"><ul class="grid list-disc gap-1 pl-4 text-sm">${items}</ul></p>
    </div>`;
}
