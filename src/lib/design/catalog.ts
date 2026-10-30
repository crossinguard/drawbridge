export interface PaletteShade {
  shade: string;
  class: string;
}

export interface PaletteDefinition {
  name: string;
  token: string;
  baseClass: string;
  shades: readonly PaletteShade[];
}

export interface ColorRole {
  label: string;
  token: string;
  swatchClass: string;
  textClass?: string;
  showValue?: boolean;
}

export interface ColorRoleGroup {
  label: string;
  description: string;
  roles: readonly ColorRole[];
}

const shadeNames = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"] as const;

const poseidonClasses = [
  "bg-poseidon-50",
  "bg-poseidon-100",
  "bg-poseidon-200",
  "bg-poseidon-300",
  "bg-poseidon-400",
  "bg-poseidon-500",
  "bg-poseidon-600",
  "bg-poseidon-700",
  "bg-poseidon-800",
  "bg-poseidon-900",
  "bg-poseidon-950",
] as const;

const seagoddessClasses = [
  "bg-seagoddess-50",
  "bg-seagoddess-100",
  "bg-seagoddess-200",
  "bg-seagoddess-300",
  "bg-seagoddess-400",
  "bg-seagoddess-500",
  "bg-seagoddess-600",
  "bg-seagoddess-700",
  "bg-seagoddess-800",
  "bg-seagoddess-900",
  "bg-seagoddess-950",
] as const;

const pompelmoClasses = [
  "bg-pompelmo-50",
  "bg-pompelmo-100",
  "bg-pompelmo-200",
  "bg-pompelmo-300",
  "bg-pompelmo-400",
  "bg-pompelmo-500",
  "bg-pompelmo-600",
  "bg-pompelmo-700",
  "bg-pompelmo-800",
  "bg-pompelmo-900",
  "bg-pompelmo-950",
] as const;

const butternutClasses = [
  "bg-butternut-50",
  "bg-butternut-100",
  "bg-butternut-200",
  "bg-butternut-300",
  "bg-butternut-400",
  "bg-butternut-500",
  "bg-butternut-600",
  "bg-butternut-700",
  "bg-butternut-800",
  "bg-butternut-900",
  "bg-butternut-950",
] as const;

const gruyrecheeseClasses = [
  "bg-gruyrecheese-50",
  "bg-gruyrecheese-100",
  "bg-gruyrecheese-200",
  "bg-gruyrecheese-300",
  "bg-gruyrecheese-400",
  "bg-gruyrecheese-500",
  "bg-gruyrecheese-600",
  "bg-gruyrecheese-700",
  "bg-gruyrecheese-800",
  "bg-gruyrecheese-900",
  "bg-gruyrecheese-950",
] as const;

function definePalette(name: string, token: string, baseClass: string, classes: readonly string[]): PaletteDefinition {
  return {
    name,
    token,
    baseClass,
    shades: shadeNames.map((shade, index) => ({ shade, class: classes[index] })),
  };
}

/** Showcase metadata only. Color values remain owned by src/styles/starwind.css. */
export const palettes: readonly PaletteDefinition[] = [
  definePalette("Poseidon", "poseidon", "bg-poseidon", poseidonClasses),
  definePalette("Sea Goddess", "seagoddess", "bg-seagoddess", seagoddessClasses),
  definePalette("Pompelmo", "pompelmo", "bg-pompelmo", pompelmoClasses),
  definePalette("Butternut", "butternut", "bg-butternut", butternutClasses),
  definePalette("Gruyrecheese", "gruyrecheese", "bg-gruyrecheese", gruyrecheeseClasses),
];

export const colorRoleGroups: readonly ColorRoleGroup[] = [
  {
    label: "Surfaces and text",
    description: "Page, raised, floating, and quiet surfaces with their default content colors.",
    roles: [
      {
        label: "Background",
        token: "background / foreground",
        swatchClass: "bg-background",
        textClass: "text-foreground",
      },
      {
        label: "Card",
        token: "card / card-foreground",
        swatchClass: "bg-card",
        textClass: "text-card-foreground",
      },
      {
        label: "Popover",
        token: "popover / popover-foreground",
        swatchClass: "bg-popover",
        textClass: "text-popover-foreground",
      },
      {
        label: "Muted",
        token: "muted / muted-foreground",
        swatchClass: "bg-muted",
        textClass: "text-muted-foreground",
      },
    ],
  },
  {
    label: "Brand and selection",
    description: "Primary actions, secondary surfaces, and highlighted or selected content.",
    roles: [
      {
        label: "Primary",
        token: "primary / primary-foreground",
        swatchClass: "bg-primary",
        textClass: "text-primary-foreground",
      },
      {
        label: "Secondary",
        token: "secondary / secondary-foreground",
        swatchClass: "bg-secondary",
        textClass: "text-secondary-foreground",
      },
      {
        label: "Accent",
        token: "accent / accent-foreground",
        swatchClass: "bg-accent",
        textClass: "text-accent-foreground",
      },
    ],
  },
  {
    label: "Status",
    description: "Status roles remain independent even when their current values share a brand bucket.",
    roles: [
      {
        label: "Information",
        token: "info / info-foreground",
        swatchClass: "bg-info",
        textClass: "text-info-foreground",
      },
      {
        label: "Success",
        token: "success / success-foreground",
        swatchClass: "bg-success",
        textClass: "text-success-foreground",
      },
      {
        label: "Warning",
        token: "warning / warning-foreground",
        swatchClass: "bg-warning",
        textClass: "text-warning-foreground",
      },
      {
        label: "Error",
        token: "error / error-foreground",
        swatchClass: "bg-error",
        textClass: "text-error-foreground",
      },
    ],
  },
  {
    label: "Emphasis and boundaries",
    description: "Supporting accents and the borders and indicators used by controls.",
    roles: [
      {
        label: "Primary accent",
        token: "primary-accent",
        swatchClass: "bg-primary-accent",
      },
      {
        label: "Secondary accent",
        token: "secondary-accent",
        swatchClass: "bg-secondary-accent",
      },
      {
        label: "Border",
        token: "border",
        swatchClass: "border-2 border-border bg-card",
        showValue: false,
      },
      {
        label: "Input border",
        token: "input",
        swatchClass: "border-2 border-input bg-card",
        showValue: false,
      },
      {
        label: "Focus outline",
        token: "outline",
        swatchClass: "outline-2 outline-outline bg-card",
        showValue: false,
      },
    ],
  },
];

export const designSections = [
  { href: "#color-roles", label: "Color roles" },
  { href: "#palettes", label: "Palettes" },
  { href: "#typography", label: "Typography" },
  { href: "#brand", label: "Brand" },
  { href: "#actions", label: "Actions" },
  { href: "#forms", label: "Forms" },
  { href: "#feedback", label: "Feedback" },
  { href: "#navigation", label: "Navigation" },
  { href: "#data", label: "Data" },
  { href: "#patterns", label: "Patterns" },
] as const;
