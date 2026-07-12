<script lang="ts">
  // Left pane of the Outcome Builder: the document outline. Rows are read-only
  // and selectable; selecting one opens the EditPanel. Add/delete affordances
  // sit inline. All state flows through the store.
  import { outcomeModel, selection, actions } from "../../stores/outcomes";
  import Button from "../ui/Button.svelte";

  const model = $derived($outcomeModel);
  const sel = $derived($selection);

  function isSel(kind: string, id: string) {
    return sel?.kind === kind && sel.id === id;
  }
</script>

{#if model}
  <div class="flex flex-col gap-6">
    <section>
      <div class="mb-2 flex items-center justify-between">
        <h3 class="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {model.terminology.outcome}s
        </h3>
        <Button variant="outline" size="sm" onclick={() => actions.addOutcome()}>
          + Add
        </Button>
      </div>

      {#if model.outcomes.length === 0}
        <p class="text-muted-foreground text-sm">None yet.</p>
      {/if}

      <ul class="flex flex-col gap-2">
        {#each model.outcomes as co}
          <li class="border-border rounded-lg border">
            <div
              class="flex items-start gap-2 p-2.5"
              class:bg-accent={isSel("co", co.id)}
            >
              <button
                type="button"
                class="flex-1 text-left text-sm"
                onclick={() => actions.select({ kind: "co", id: co.id })}
              >
                <code class="text-muted-foreground mr-1.5 font-mono text-xs">{co.id}</code>
                {co.text || "(untitled)"}
              </button>
              <button
                type="button"
                class="text-muted-foreground hover:text-error text-xs"
                title="Delete"
                aria-label="Delete outcome"
                onclick={() => actions.removeOutcome(co.id)}>✕</button
              >
            </div>

            <div class="border-border border-t px-2.5 py-2">
              {#each co.evidence as eo}
                <div
                  class="flex items-start gap-2 rounded py-1 pl-3 text-sm"
                  class:bg-accent={isSel("eo", eo.id)}
                >
                  <button
                    type="button"
                    class="flex-1 text-left"
                    onclick={() =>
                      actions.select({ kind: "eo", id: eo.id, coId: co.id })}
                  >
                    <code class="text-muted-foreground mr-1.5 font-mono text-xs"
                      >{eo.id}</code
                    >
                    {eo.text || "(untitled)"}
                  </button>
                  <button
                    type="button"
                    class="text-muted-foreground hover:text-error text-xs"
                    title="Delete"
                    aria-label="Delete evidence"
                    onclick={() => actions.removeEvidence(co.id, eo.id)}>✕</button
                  >
                </div>
              {/each}
              <button
                type="button"
                class="text-primary mt-1 pl-3 text-xs hover:underline"
                onclick={() => actions.addEvidence(co.id)}
              >
                + Add {model.terminology.evidence.toLowerCase()}
              </button>
            </div>
          </li>
        {/each}
      </ul>
    </section>

    <section>
      <div class="mb-2 flex items-center justify-between">
        <h3 class="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {model.terminology.objective}s
        </h3>
        <Button variant="outline" size="sm" onclick={() => actions.addObjective()}>
          + Add
        </Button>
      </div>

      {#if model.objectives.length === 0}
        <p class="text-muted-foreground text-sm">None yet.</p>
      {/if}

      <ul class="flex flex-col gap-2">
        {#each model.objectives as lo}
          <li
            class="border-border flex items-start gap-2 rounded-lg border p-2.5"
            class:bg-accent={isSel("lo", lo.id)}
          >
            <button
              type="button"
              class="flex-1 text-left text-sm"
              onclick={() => actions.select({ kind: "lo", id: lo.id })}
            >
              <code class="text-muted-foreground mr-1.5 font-mono text-xs">{lo.id}</code>
              {lo.text || "(untitled)"}
              {#if lo.maps_to.length}
                <span class="text-muted-foreground text-xs">→ {lo.maps_to.join(", ")}</span>
              {/if}
            </button>
            <button
              type="button"
              class="text-muted-foreground hover:text-error text-xs"
              title="Delete"
              aria-label="Delete objective"
              onclick={() => actions.removeObjective(lo.id)}>✕</button
            >
          </li>
        {/each}
      </ul>
    </section>
  </div>
{/if}
