import type { Criterion, PresetId, Rounding, Rubric, RubricSettings } from "./types";

export const PRESET_LABELS: Record<PresetId, string> = {
  "full-half-zero": "Full / Half / Zero / Zero (default)",
  even: "Evenly spaced",
  custom: "Custom percentages",
  manual: "Manual (no auto compute)",
};

export const ROUNDING_LABELS: Record<Rounding, string> = {
  up: "Round up (default)",
  nearest: "Nearest",
  down: "Round down",
  exact: "Exact (no rounding)",
};

export const PRESET_DESCRIPTIONS: Record<PresetId, string> = {
  "full-half-zero": "1st rating = full points, 2nd = half rounded, remaining = 0.",
  even: "Points decrease evenly across rating levels.",
  custom: "Set a percentage of max points per rating level.",
  manual: "Points stay exactly as entered.",
};

/** Percentage of a criterion's max points for each rating level, per preset. */
export function presetPercentages(preset: PresetId, levels: number, custom: number[]): number[] {
  switch (preset) {
    case "full-half-zero": {
      const pcts = [100, 50];
      while (pcts.length < levels) pcts.push(0);
      return pcts.slice(0, levels);
    }
    case "even": {
      if (levels <= 1) return [100];
      return Array.from({ length: levels }, (_, i) => (100 * (levels - 1 - i)) / (levels - 1));
    }
    case "custom": {
      const pcts = [...custom];
      while (pcts.length < levels) pcts.push(0);
      return pcts.slice(0, levels).map((p) => clampPercentage(p));
    }
    case "manual":
      return [];
  }
}

function clampPercentage(p: number): number {
  if (!Number.isFinite(p)) return 0;
  return Math.min(100, Math.max(0, p));
}

/** Compute one rating's points from a criterion's max points and percentage. */
export function computePoints(maxPoints: number, percentage: number, rounding: Rounding): number {
  const raw = (maxPoints * percentage) / 100;
  switch (rounding) {
    case "up":
      return Math.ceil(raw);
    case "nearest":
      return Math.round(raw);
    case "down":
      return Math.floor(raw);
    case "exact":
      return Math.round(raw * 100) / 100;
  }
}

/** Recompute points for one criterion's non-manual ratings. */
export function applyPoints(criterion: Criterion, settings: RubricSettings): void {
  if (settings.preset === "manual") return;
  const pcts = presetPercentages(settings.preset, criterion.ratings.length, settings.customPercentages);
  criterion.ratings.forEach((rating, i) => {
    if (!rating.manual) {
      rating.points = computePoints(criterion.maxPoints, pcts[i] ?? 0, settings.rounding);
    }
  });
}

/** Recompute all criteria. When force is true, manual overrides are cleared first. */
export function recomputeAll(rubric: Rubric, settings: RubricSettings, force = false): void {
  if (force) {
    for (const c of rubric.criteria) for (const r of c.ratings) r.manual = false;
  }
  for (const c of rubric.criteria) applyPoints(c, settings);
}

export function totalPoints(rubric: Rubric): number {
  return rubric.criteria.reduce((sum, c) => sum + (Number.isFinite(c.maxPoints) ? c.maxPoints : 0), 0);
}
