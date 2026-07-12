<script lang="ts">
  // Svelte twin of the Starwind <Badge>, reusing its tailwind-variants recipe.
  // Used for validation severities (error/warn/info) and small status chips.
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";
  import type { VariantProps } from "tailwind-variants";
  import { badge } from "../starwind/badge/variants";

  type Props = HTMLAttributes<HTMLDivElement> & {
    variant?: VariantProps<typeof badge>["variant"];
    size?: VariantProps<typeof badge>["size"];
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

  const isLink = $derived(Boolean(href));
  const classes = $derived(badge({ variant, size, isLink, class: className }));
</script>

{#if href}
  <a {href} class={classes} data-slot="badge" {...rest}>
    {@render children?.()}
  </a>
{:else}
  <div class={classes} data-slot="badge" {...rest}>
    {@render children?.()}
  </div>
{/if}
