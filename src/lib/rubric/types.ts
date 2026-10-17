export interface Rating {
  name: string;
  description: string;
  points: number;
  /** True when the user manually edited this rating's points. */
  manual: boolean;
}

export interface Criterion {
  name: string;
  description: string;
  maxPoints: number;
  ratings: Rating[];
}

export interface Rubric {
  name: string;
  criteria: Criterion[];
}

export type Rounding = "up" | "nearest" | "down" | "exact";

export type PresetId = "full-half-zero" | "even" | "custom" | "manual";

export interface RubricSettings {
  preset: PresetId;
  /** Percentages (0-100) per rating level, used when preset is "custom". */
  customPercentages: number[];
  rounding: Rounding;
}

export const DEFAULT_SETTINGS: RubricSettings = {
  preset: "full-half-zero",
  customPercentages: [],
  rounding: "up",
};

export interface ExtractedTable {
  /** Grid of cell text, spans already expanded. */
  rows: string[][];
  /** Source label (file name, "pasted content"), for table pickers. */
  source?: string;
}

export interface RubricDraft {
  rubric: Rubric;
  usedHeader: boolean;
  warnings: string[];
}
