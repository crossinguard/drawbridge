import type { ToolStep } from "@/lib/tools/steps";

/** The steps shown in the Rubric → Canvas CSV stepper. */
export const steps: ToolStep[] = [
  { id: "import", label: "Import" },
  { id: "review", label: "Review & edit" },
  { id: "export", label: "Export CSV" },
];
