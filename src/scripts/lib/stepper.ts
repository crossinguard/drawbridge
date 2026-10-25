/**
 * Shared step navigation for every tool's import → review → export flow.
 *
 * The stepper is driven entirely by the DOM. The `StepIndicator` component
 * renders one `[data-step]` element per step, each carrying the id of the
 * section it controls, so a tool can add or rename a step without touching
 * anything here.
 */
import check from "@tabler/icons/outline/check.svg?raw";

import { icon } from "./dom";

export interface StepperOptions {
  /**
   * Whether the step at `index` may be entered. Steps that cannot be reached
   * are disabled in the stepper.
   */
  canReach: (index: number) => boolean;
  /**
   * Extra validation for the "continue" button. Return `false` to block the
   * transition — use it to explain what is still missing.
   */
  canAdvance?: (targetIndex: number) => boolean;
  /** Called after the active step changes. */
  onEnter?: (index: number) => void;
}

export interface Stepper {
  /** Move to a step, if it can be reached. */
  goTo(index: number): void;
  /**
   * Redraw the stepper.
   *
   * Call this when something outside the stepper changes what is reachable —
   * loading a file, for instance — so the buttons reflect the new state.
   */
  refresh(): void;
  /** Index of the currently active step. */
  readonly current: number;
}

const BADGE_BASE = "flex size-6 items-center justify-center rounded-full text-xs font-medium";
const BADGE_ACTIVE = "bg-primary text-primary-foreground ring-2 ring-primary/30";
const BADGE_DONE = "bg-primary text-primary-foreground";
const BADGE_UPCOMING = "border border-input text-muted-foreground";
const LABEL_REACHED = "font-medium text-foreground";
const LABEL_UPCOMING = "text-muted-foreground";

export function createStepper(options: StepperOptions): Stepper {
  const items = Array.from(document.querySelectorAll<HTMLElement>("[data-step]"));
  let current = 0;

  function render(): void {
    items.forEach((item, index) => {
      const badge = item.querySelector<HTMLElement>("[data-step-badge]");
      const label = item.querySelector<HTMLElement>("[data-step-label]");
      const button = item.querySelector<HTMLButtonElement>("[data-step-action]");
      if (!badge || !label || !button) return;

      const done = index < current;
      const active = index === current;

      badge.className = `${BADGE_BASE} ${active ? BADGE_ACTIVE : done ? BADGE_DONE : BADGE_UPCOMING}`;
      badge.innerHTML = done ? icon(check, "size-4") : String(index + 1);

      label.className = active || done ? LABEL_REACHED : LABEL_UPCOMING;

      button.disabled = !options.canReach(index);
      if (active) item.setAttribute("aria-current", "step");
      else item.removeAttribute("aria-current");
    });

    // The sections follow the stepper.
    items.forEach((item, index) => {
      const sectionId = item.dataset.section;
      if (!sectionId) return;
      const section = document.getElementById(sectionId);
      if (section) section.hidden = index !== current;
    });

    // The "continue" button is only useful when the next step is reachable.
    document.querySelectorAll<HTMLButtonElement>('[data-step-nav="next"]').forEach((button) => {
      button.disabled = !options.canReach(current + 1);
    });
  }

  function goTo(index: number): void {
    if (index < 0 || index >= items.length) return;
    if (!options.canReach(index)) return;
    if (index === current) return;

    current = index;
    render();
    options.onEnter?.(index);

    // The step that was showing changes height, so the reader can end up
    // looking at the wrong part of the page. Bring the stepper back into view.
    items[0]?.closest("ol")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function advance(): void {
    const target = current + 1;
    if (target >= items.length) return;
    if (options.canAdvance && !options.canAdvance(target)) return;
    goTo(target);
  }

  items.forEach((item, index) => {
    item.querySelector<HTMLButtonElement>("[data-step-action]")?.addEventListener("click", () => goTo(index));
  });

  document.querySelectorAll<HTMLButtonElement>('[data-step-nav="back"]').forEach((button) => {
    button.addEventListener("click", () => goTo(current - 1));
  });

  document.querySelectorAll<HTMLButtonElement>('[data-step-nav="next"]').forEach((button) => {
    button.addEventListener("click", advance);
  });

  render();

  return {
    goTo,
    refresh: render,
    get current() {
      return current;
    },
  };
}
