<script lang="ts">
  // Svelte twin of the Starwind <Button>. It reuses the exact same
  // tailwind-variants recipe (src/components/starwind/button/variants.ts), so a
  // button rendered inside a Svelte island is pixel-identical to one on an Astro
  // page. Starwind's own components are .astro and can't be used inside an island;
  // this kit is how the shared look reaches interactive UI.
  import type { Snippet } from "svelte";
  import type { HTMLButtonAttributes } from "svelte/elements";
  import type { VariantProps } from "tailwind-variants";
  import { button } from "../starwind/button/variants";

  type Props = HTMLButtonAttributes & {
    variant?: VariantProps<typeof button>["variant"];
    size?: VariantProps<typeof button>["size"];
    href?: string;
    class?: string;
    children?: Snippet;
  };

  let {
    variant,
    size,
    href,
    class: className,
    children,
    ...rest
  }: Props = $props();

  const classes = $derived(button({ variant, size, class: className }));
</script>

{#if href}
  <a {href} class={classes} data-slot="button" {...rest}>
    {@render children?.()}
  </a>
{:else}
  <button class={classes} data-slot="button" {...rest}>
    {@render children?.()}
  </button>
{/if}
