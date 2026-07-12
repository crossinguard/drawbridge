<script lang="ts">
  // Lightweight bordered panel in the Drawbridge look. Deliberately more compact
  // than Starwind's full <Card> (which is built for marketing sections) — this is
  // the row/panel primitive the document-editing UI reaches for.
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";
  import { tv } from "tailwind-variants";

  const panel = tv({
    base: "bg-card text-card-foreground rounded-lg border border-border",
    variants: { padded: { true: "px-4 py-3", false: "" } },
    defaultVariants: { padded: true },
  });

  type Props = HTMLAttributes<HTMLDivElement> & {
    padded?: boolean;
    class?: string;
    children?: Snippet;
  };

  let { padded, class: className, children, ...rest }: Props = $props();
</script>

<div class={panel({ padded, class: className })} {...rest}>
  {@render children?.()}
</div>
