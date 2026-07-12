<script lang="ts">
  // Validation flags with detail — severity, which item, and the message.
  // Clicking a flag selects its target so you can fix it. Collapsed to a count
  // summary by default. Flags never block; this is advisory.
  import { flags, identifiers, actions } from "../../stores/outcomes";
  import { labelFor } from "$lib/outcomes/numbering";
  import Badge from "../ui/Badge.svelte";

  // When true, clicking a flag selects its target (edit mode only).
  let { selectable = true }: { selectable?: boolean } = $props();

  const all = $derived($flags);
  const ids = $derived($identifiers);

  const counts = $derived.by(() => {
    const c = { error: 0, warn: 0, info: 0 };
    for (const f of all) c[f.severity]++;
    return c;
  });

  const variant = { error: "error", warn: "warning", info: "info" } as const;
</script>

{#if all.length}
  <details class="border-border bg-card rounded-lg border px-3 py-2 text-sm">
    <summary class="flex cursor-pointer items-center gap-2 select-none">
      <span class="font-medium">Validation</span>
      {#if counts.error}<Badge variant="error" size="sm">{counts.error} error</Badge>{/if}
      {#if counts.warn}<Badge variant="warning" size="sm">{counts.warn} warn</Badge>{/if}
      {#if counts.info}<Badge variant="info" size="sm">{counts.info} info</Badge>{/if}
      <span class="text-muted-foreground text-xs">— flags never block</span>
    </summary>
    <ul class="mt-2 flex flex-col gap-1.5">
      {#each all as flag}
        <li class="flex items-start gap-2">
          <Badge variant={variant[flag.severity]} size="sm">{flag.severity}</Badge>
          {#if flag.targetId}
            {#if selectable}
              <button
                type="button"
                class="text-primary shrink-0 font-mono text-xs hover:underline"
                onclick={() => actions.selectById(flag.targetId!)}
              >
                {labelFor(ids, flag.targetId)}
              </button>
            {:else}
              <span class="text-muted-foreground shrink-0 font-mono text-xs">
                {labelFor(ids, flag.targetId)}
              </span>
            {/if}
          {/if}
          <span>{flag.message}</span>
        </li>
      {/each}
    </ul>
  </details>
{/if}
