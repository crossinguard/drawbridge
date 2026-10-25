import type { ToolStep } from "@/lib/tools/steps";

/** The steps shown in the Outcome Mapper stepper. */
export const steps: ToolStep[] = [
  { id: "import", label: "Import" },
  { id: "map", label: "Map" },
  { id: "export", label: "Export" },
];
